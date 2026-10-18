import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse, stringify } from 'yaml'
import { readOperationRetry, readSelectionPlan, readSkinMutation } from '../src/http.ts'
import { SkinLifecycle } from '../src/lifecycle.ts'
import { officialDesktopRunner, type OfficialPluginManagerLike } from '../src/official-desktop.ts'
import { atomicWriteJson, atomicWriteText, packageDir, profilePatchFile, readMarketState, writeMarketState } from '../src/profile.ts'
import type { DshRuntime, LoaderEntry, Operation, SelectionOperationKind, SkinEntry } from '../src/types.ts'

const directories: string[] = []
const lifecycles: SkinLifecycle[] = []
const runtime: DshRuntime = { version: '0.2.1-alpha.3', source: 'injected', capabilities: [] }

afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map(lifecycle => lifecycle.dispose()))
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function skin(id: string): SkinEntry {
  const packageName = `dsh-configuration-${id}`
  const commit = 'a'.repeat(40)
  const version = '1.0.0'
  const repository = `https://github.com/fixture/${id}`
  const integrity = `sha512-${createHash('sha512').update(packageName).digest('base64')}`
  return {
    id, package: packageName, rowId: `skin-${id}`, repo: repository, name: { zh: id, en: id },
    author: 'fixture', description: 'Official component recovery fixture', category: 'theme', tags: [],
    modes: ['light', 'dark'], screenshots: [], license: { code: 'MIT', commercialUse: true },
    featuredRank: 0, starsSnapshot: 0,
    releaseUpdatedAt: '2026-10-16', metadataUpdatedAt: '2026-10-16', starsUpdatedAt: '2026-10-16', updatedAt: '2026-10-16',
    install: {
      version, commit, target: `github:fixture/${id}#${commit}`,
      npm: { name: packageName, version, integrity, repository, gitHead: commit },
      desktop: { mode: 'managed', registry: 'npm', packageName, packageVersion: version, integrity },
    },
    compatibility: { dsh: '*', platform: ['web'] },
    review: { compatibility: 'verified', preview: 'verified', installation: 'verified' },
  }
}

async function until(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 250; index++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  throw new Error('configuration recovery operation did not settle')
}

async function finished(operation: Operation): Promise<Operation> {
  await until(() => ['done', 'failed', 'cancelled'].includes(operation.phase))
  return operation
}

/** The fake official Host writes the profile row; the home row wins over it. */
function fixture(catalog: SkinEntry[], initial: { active?: string; home?: string; overlays?: string[]; bundled?: boolean } = {}) {
  const home = mkdtempSync(join(realpathSync(tmpdir()), 'dsh-configuration-recovery-'))
  directories.push(home)
  const directory = join(home, 'profiles', 'desktop')
  mkdirSync(directory, { recursive: true })
  const homePatch = join(home, 'cordis.patch.yml')
  const originalHome = initial.home ?? `# Keep shared settings and comments.\n- id: ${catalog[0]!.rowId}\n  disabled: true # target switch\n  config:\n    color: blue\n- id: unrelated-shared-row\n  disabled: true\n  config: { keep: exact }\n`
  writeFileSync(homePatch, originalHome)
  const originalProfile = `# Host-owned profile settings.\n${catalog.map(item => `- id: ${item.rowId}\n  disabled: ${initial.active !== item.id}\n`).join('')}- id: unrelated-profile-row\n  config: { keep: profile }\n`
  atomicWriteText(profilePatchFile(directory), originalProfile)
  atomicWriteJson(join(directory, 'package.json'), {
    private: true, dependencies: Object.fromEntries(catalog.map(item => [item.package, item.install.version])),
    dsh: { profile: { bundles: initial.bundled && initial.active !== undefined ? [catalog.find(item => item.id === initial.active)!.package] : [] } },
  })
  atomicWriteText(join(directory, 'pnpm-lock.yaml'), stringify({
    lockfileVersion: '9.0',
    importers: { '.': { dependencies: Object.fromEntries(catalog.map(item => [item.package, { specifier: item.install.version, version: item.install.version }])) } },
    packages: Object.fromEntries(catalog.map(item => [`${item.package}@${item.install.version}`, { resolution: { integrity: item.install.npm!.integrity } }])),
  }))
  for (const item of catalog) {
    const installed = packageDir(directory, item.package)
    mkdirSync(join(installed, 'lib'), { recursive: true })
    mkdirSync(join(installed, 'client'), { recursive: true })
    atomicWriteJson(join(installed, 'package.json'), {
      name: item.package, version: item.install.version, repository: item.repo, gitHead: item.install.commit,
      main: 'lib/index.js', exports: { '.': './lib/index.js', './client': './client/client.js' },
      dsh: { client: { platform: 'web' }, ...(initial.bundled ? { bundle: { patch: 'cordis.patch.yml' } } : {}) },
    })
    atomicWriteText(join(installed, 'lib/index.js'), 'export const fixture = true\n')
    atomicWriteText(join(installed, 'client/client.js'), 'export const fixture = true\n')
    if (initial.bundled) atomicWriteText(join(installed, 'cordis.patch.yml'), `- insert:\n    - id: ${item.rowId}\n      name: ${item.package}\n`)
  }
  writeMarketState(directory, {
    version: 1, activeSkinId: initial.active ?? null,
    disabledSkinIds: catalog.filter(item => item.id !== initial.active).map(item => item.id),
  })

  const disabledAt = (file: string, rowId: string): boolean | undefined => {
    const rows = parse(readFileSync(file, 'utf8')) as Array<Record<string, unknown>>
    const row = rows.filter(row => row.id === rowId).at(-1)
    return typeof row?.disabled === 'boolean' ? row.disabled : undefined
  }
  const selected = (item: SkinEntry): boolean => !initial.bundled || (JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { dsh: { profile: { bundles: string[] } } }).dsh.profile.bundles.includes(item.package)
  const effectiveEnabled = (item: SkinEntry) => selected(item) && !(disabledAt(homePatch, item.rowId) ?? disabledAt(profilePatchFile(directory), item.rowId) ?? true)
  const entries = new Map<string, LoaderEntry>(catalog.map(item => [item.package, {
    options: { id: item.rowId, name: item.package, disabled: !effectiveEnabled(item) },
    fiber: effectiveEnabled(item) ? {} : undefined,
    update: vi.fn(async () => { throw new Error('market must not mutate a Desktop loader directly') }),
  }]))
  const syncEntries = () => {
    for (const item of catalog) {
      const entry = entries.get(item.package)!
      entry.options.disabled = !effectiveEnabled(item)
      entry.fiber = effectiveEnabled(item) ? {} : undefined
    }
  }
  const entryId = (item: SkinEntry) => `loader:${item.package}`
  const inventory = () => {
    syncEntries()
    return catalog.filter(selected).map(item => ({
      entryId: entryId(item), patchId: item.rowId, moduleName: item.package,
      enabled: effectiveEnabled(item), fiberPhase: effectiveEnabled(item) ? 'active' : null,
    }))
  }
  const manager = {
    installBundle: vi.fn(async (): Promise<unknown> => { throw new Error('recovery must not reinstall the skin') }),
    removeBundle: vi.fn(async (): Promise<unknown> => { throw new Error('recovery must not remove the skin') }),
    setBundleEnabled: vi.fn(async (name: string, enabled: boolean): Promise<unknown> => {
      if (!initial.bundled) throw new Error('fixture has individually addressable components')
      const value = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { dsh: { profile: { bundles: string[] } } }
      value.dsh.profile.bundles = enabled ? [...new Set([...value.dsh.profile.bundles, name])] : value.dsh.profile.bundles.filter(item => item !== name)
      atomicWriteJson(join(directory, 'package.json'), value)
      syncEntries()
      return { application: 'applied', changed: true, stage: 'enable', target: name, enabled }
    }),
    setPluginEnabled: vi.fn(async (id: string, enabled: boolean): Promise<unknown> => {
      const item = catalog.find(item => entryId(item) === id)
      if (item === undefined) throw new Error('unknown official component')
      const file = profilePatchFile(directory)
      const rows = parse(readFileSync(file, 'utf8')) as Array<Record<string, unknown>>
      const row = rows.find(row => row.id === item.rowId)!
      row.disabled = !enabled
      atomicWriteText(file, stringify(rows))
      syncEntries()
      return {
        application: effectiveEnabled(item) === enabled ? 'applied' : 'overridden',
        changed: true, stage: 'enable', target: id, enabled,
        ...(effectiveEnabled(item) === enabled ? {} : { error: { code: 'configuration-override' } }),
      }
    }),
    listPlugins: vi.fn(async (): Promise<unknown> => inventory()),
    listBundles: vi.fn(async (): Promise<unknown> => initial.bundled ? catalog.map(item => ({
      name: item.package, enabled: selected(item), installed: true,
      rows: [{ rowId: item.rowId, moduleName: item.package, ...(selected(item) ? { entryId: entryId(item) } : {}) }],
    })) : []),
    cancelInstall: vi.fn(async (): Promise<unknown> => ({ status: 'not-running' })),
    waitForInstall: vi.fn(async (): Promise<unknown> => null),
  } satisfies OfficialPluginManagerLike
  const runner = officialDesktopRunner(() => manager, runtime)
  const lifecycle = new SkinLifecycle({ loader: { entries: () => { syncEntries(); return entries.values() } } }, {
    profile: 'desktop', profileDir: directory, runner, hostKind: 'desktop', runtime, lifecycleWaitMs: 5,
    configurationOverride: { home, patchPath: profilePatchFile(directory), overlays: initial.overlays ?? [] },
  }, catalog)
  lifecycles.push(lifecycle)
  const backups = () => readdirSync(home).filter(file => file.endsWith('.backup')).map(file => join(home, file))
  return { home, directory, homePatch, originalHome, manager, lifecycle, entries, entryId, inventory, effectiveEnabled, backups }
}

function repair(host: ReturnType<typeof fixture>, failed: Operation, context = failed.failure?.configurationOverride?.context) {
  return host.lifecycle.retry(failed.id, 'repair-configuration', false, undefined, undefined, context)
}

function selectWithContext(host: ReturnType<typeof fixture>, kind: SelectionOperationKind, skinId: string, context: string) {
  return host.lifecycle.begin(kind, skinId, undefined, false, undefined, undefined, undefined, undefined, context)
}

describe('read-only selection preflight and one approved transition', () => {
  it('plans the HOME and profile disable together without first failing or writing either file', async () => {
    const item = skin('preflight')
    const host = fixture([item])
    const profileBefore = readFileSync(profilePatchFile(host.directory), 'utf8')
    const marketBefore = readMarketState(host.directory)
    const plan = await host.lifecycle.selectionPlan('activate', item.id)
    expect(plan).toMatchObject({ status: 'repairable', changes: [{ skinId: item.id, rowId: item.rowId, desiredEnabled: true }] })
    expect(plan.context).toMatch(/^[a-f0-9]{64}$/)
    expect(readFileSync(host.homePatch, 'utf8')).toBe(host.originalHome)
    expect(readFileSync(profilePatchFile(host.directory), 'utf8')).toBe(profileBefore)
    expect(readMarketState(host.directory)).toEqual(marketBefore)
    expect(host.lifecycle.operations.size).toBe(0)
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
    expect(host.backups()).toEqual([])
    expect((await host.lifecycle.selectionPlan('activate', item.id)).context).toBe(plan.context)

    const operation = await finished(selectWithContext(host, 'activate', item.id, plan.context!))
    expect(operation.phase).toBe('done')
    expect(host.lifecycle.operations.size).toBe(1)
    expect(host.effectiveEnabled(item)).toBe(true)
    expect(readMarketState(host.directory).activeSkinId).toBe(item.id)
    expect(host.backups()).toHaveLength(1)
    expect(readFileSync(host.backups()[0]!, 'utf8')).toBe(host.originalHome)
  })

  it('repairs old force-enable and new disable in one shared write and one ordinary switch', async () => {
    const old = skin('preflight-old')
    const next = skin('preflight-next')
    const originalHome = `# One shared composition.\n- id: ${old.rowId}\n  disabled: false\n- id: ${next.rowId}\n  disabled: true\n- id: unrelated\n  disabled: true\n`
    const host = fixture([old, next], { active: old.id, home: originalHome })
    const plan = await host.lifecycle.selectionPlan('activate', next.id)
    expect(plan.status).toBe('repairable')
    expect(plan.changes).toHaveLength(2)
    expect(plan.changes.map(change => ({ skinId: change.skinId, enabled: change.desiredEnabled }))).toEqual(expect.arrayContaining([
      { skinId: old.id, enabled: false }, { skinId: next.id, enabled: true },
    ]))
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
    const operation = await finished(selectWithContext(host, 'activate', next.id, plan.context!))
    expect(operation.phase).toBe('done')
    expect(host.effectiveEnabled(old)).toBe(false)
    expect(host.effectiveEnabled(next)).toBe(true)
    expect(host.backups()).toHaveLength(1)
    expect(readFileSync(host.backups()[0]!, 'utf8')).toBe(originalHome)
    expect(readFileSync(host.homePatch, 'utf8')).toBe('# One shared composition.\n- id: unrelated\n  disabled: true\n')
    expect(host.manager.setPluginEnabled.mock.calls.map(([id, enabled]) => [id, enabled])).toEqual([
      [host.entryId(old), false], [host.entryId(next), true],
    ])
  })

  it('keeps a current pinned skin enabled when unpinning it, with no irrelevant shared repair', async () => {
    const item = skin('preflight-unpin-primary')
    const host = fixture([item], { active: item.id, home: `- id: ${item.rowId}\n  disabled: false\n` })
    writeMarketState(host.directory, { version: 1, activeSkinId: item.id, pinnedSkinIds: [item.id], disabledSkinIds: [] })
    expect(await host.lifecycle.selectionPlan('unpin', item.id)).toMatchObject({ status: 'none', changes: [] })
    expect((await finished(host.lifecycle.begin('unpin', item.id))).phase).toBe('done')
    expect(host.effectiveEnabled(item)).toBe(true)
    expect(host.backups()).toEqual([])
  })

  it('withdraws an old bundle without clearing its harmless HOME force-enable', async () => {
    const old = skin('preflight-bundle-old')
    const next = skin('preflight-bundle-next')
    const originalHome = `- id: ${old.rowId}\n  disabled: false\n- id: ${next.rowId}\n  disabled: true\n`
    const host = fixture([old, next], { active: old.id, home: originalHome, bundled: true })
    const plan = await host.lifecycle.selectionPlan('activate', next.id)
    expect(plan.changes.map(change => change.skinId)).toEqual([next.id])
    expect((await finished(selectWithContext(host, 'activate', next.id, plan.context!))).phase).toBe('done')
    expect(host.effectiveEnabled(old)).toBe(false)
    expect(host.effectiveEnabled(next)).toBe(true)
    expect(readFileSync(host.homePatch, 'utf8')).toBe(`- id: ${old.rowId}\n  disabled: false\n`)
    expect(host.backups()).toHaveLength(1)
  })

  it.each(['home', 'profile', 'selection', 'artifact', 'catalog'] as const)('rejects a preflight whose %s changed before confirmation', async changed => {
    const item = skin(`preflight-stale-${changed}`)
    const host = fixture([item])
    const plan = await host.lifecycle.selectionPlan('activate', item.id)
    expect(plan.status).toBe('repairable')
    if (changed === 'home') writeFileSync(host.homePatch, `${host.originalHome}# External change.\n`)
    if (changed === 'profile') writeFileSync(profilePatchFile(host.directory), `${readFileSync(profilePatchFile(host.directory), 'utf8')}# External profile change.\n`)
    if (changed === 'selection') writeMarketState(host.directory, { version: 1, activeSkinId: item.id, disabledSkinIds: [] })
    if (changed === 'artifact') writeFileSync(join(packageDir(host.directory, item.package), 'client', 'client.js'), 'export const afterPlan = true\n')
    if (changed === 'catalog') item.install.commit = 'c'.repeat(40)
    const homeBefore = readFileSync(host.homePatch, 'utf8')
    expect((await finished(selectWithContext(host, 'activate', item.id, plan.context!))).phase).toBe('failed')
    expect(readFileSync(host.homePatch, 'utf8')).toBe(homeBefore)
    expect(host.backups()).toEqual([])
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
  })

  it('binds an unchanged neighbour to the plan even when it needs no shared edit', async () => {
    const old = skin('preflight-bound-old')
    const next = skin('preflight-bound-next')
    const host = fixture([old, next], { active: old.id, home: `- id: ${next.rowId}\n  disabled: true\n` })
    const plan = await host.lifecycle.selectionPlan('activate', next.id)
    expect(plan.changes.map(change => change.skinId)).toEqual([next.id])
    writeFileSync(join(packageDir(host.directory, old.package), 'client', 'client.js'), 'export const changedNeighbour = true\n')
    expect((await finished(selectWithContext(host, 'activate', next.id, plan.context!))).phase).toBe('failed')
    expect(host.backups()).toEqual([])
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
  })

  it('keeps ordinary operations available when preflight cannot repair complex rules', async () => {
    const item = skin('preflight-blocked')
    const host = fixture([item], { overlays: ['startup-override'] })
    expect(await host.lifecycle.selectionPlan('activate', item.id)).toMatchObject({ status: 'blocked' })
    expect((await finished(host.lifecycle.begin('activate', item.id))).failure?.kind).toBe('configuration-override')
    expect(host.backups()).toEqual([])
  })

  it('does not edit anything for an ordinary transition with no shared blocker', async () => {
    const item = skin('preflight-clear')
    const host = fixture([item], { home: '[]\n' })
    expect(await host.lifecycle.selectionPlan('activate', item.id)).toMatchObject({ status: 'none', changes: [] })
    expect((await finished(host.lifecycle.begin('activate', item.id))).phase).toBe('done')
    expect(host.backups()).toEqual([])
  })

  it('does not reuse an activation approval for a different selection operation', async () => {
    const item = skin('preflight-kind')
    const host = fixture([item])
    const plan = await host.lifecycle.selectionPlan('activate', item.id)
    expect((await finished(selectWithContext(host, 'pin', item.id, plan.context!))).phase).toBe('failed')
    expect(readFileSync(host.homePatch, 'utf8')).toBe(host.originalHome)
    expect(host.backups()).toEqual([])
  })

  it('rolls back the one approved batch when the resumed transition confirms failure', async () => {
    const item = skin('preflight-failure')
    const host = fixture([item])
    const plan = await host.lifecycle.selectionPlan('activate', item.id)
    host.manager.listPlugins.mockImplementation(async () => {
      if (readFileSync(host.homePatch, 'utf8') !== host.originalHome) throw new Error('confirmed native inventory failure')
      return host.inventory()
    })
    expect((await finished(selectWithContext(host, 'activate', item.id, plan.context!))).phase).toBe('failed')
    expect(readFileSync(host.homePatch, 'utf8')).toBe(host.originalHome)
    expect(host.backups()).toHaveLength(1)
  })

  it('retains the approved batch and stops when the first native transition result is unknown', async () => {
    const item = skin('preflight-unknown')
    const host = fixture([item])
    const plan = await host.lifecycle.selectionPlan('activate', item.id)
    host.manager.setPluginEnabled.mockResolvedValueOnce({ ok: false, error: { message: 'carrier lost after dispatch' } })
    const operation = selectWithContext(host, 'activate', item.id, plan.context!)
    await until(() => operation.phase === 'waiting')
    expect(host.lifecycle.waitingReason).toBeDefined()
    expect(readFileSync(host.homePatch, 'utf8')).not.toBe(host.originalHome)
    expect(host.backups()).toHaveLength(1)
    expect(() => host.lifecycle.begin('activate', item.id)).toThrow()
    expect(host.manager.setPluginEnabled).toHaveBeenCalledTimes(1)
  })
})

describe('official configuration recovery integration', () => {
  it('repairs a bundled skin after rollback has withdrawn its live component', async () => {
    const item = skin('bundle')
    const host = fixture([item], { bundled: true })
    const failed = await finished(host.lifecycle.begin('activate', item.id))
    expect(failed.failure).toMatchObject({ kind: 'configuration-override', targetSkinId: item.id, action: 'repair-configuration' })
    expect(host.inventory()).toEqual([])
    expect(readFileSync(host.homePatch, 'utf8')).toBe(host.originalHome)
    expect((await finished(repair(host, failed))).phase).toBe('done')
    expect(host.inventory()).toMatchObject([{ patchId: item.rowId, enabled: true }])
    expect(readMarketState(host.directory).activeSkinId).toBe(item.id)
    expect(host.manager.setBundleEnabled).toHaveBeenCalledWith(item.package, true)
    expect(host.backups()).toHaveLength(1)
    expect(host.manager.installBundle).not.toHaveBeenCalled()
  })

  it('diagnoses the exact shared override without changing it, then enables the original component with a private backup', async () => {
    const item = skin('enable')
    const host = fixture([item])
    const failed = await finished(host.lifecycle.begin('activate', item.id))
    expect(failed).toMatchObject({
      phase: 'failed', application: 'overridden',
      failure: { kind: 'configuration-override', desiredEnabled: true, targetSkinId: item.id, action: 'repair-configuration', configurationOverride: { status: 'repairable', rowId: item.rowId, source: 'home', sharedAcrossProfiles: true } },
    })
    expect(readFileSync(host.homePatch, 'utf8')).toBe(host.originalHome)
    expect(host.backups()).toEqual([])
    expect(readMarketState(host.directory).activeSkinId).toBeNull()

    const recovered = await finished(repair(host, failed))
    expect(recovered.phase).toBe('done')
    expect(recovered.kind).toBe('activate')
    expect(readMarketState(host.directory).activeSkinId).toBe(item.id)
    expect(host.effectiveEnabled(item)).toBe(true)
    expect(readFileSync(host.homePatch, 'utf8')).toContain('color: blue')
    expect(readFileSync(host.homePatch, 'utf8')).toContain('- id: unrelated-shared-row\n  disabled: true\n  config: { keep: exact }')
    expect(host.backups()).toHaveLength(1)
    expect(readFileSync(host.backups()[0]!, 'utf8')).toBe(host.originalHome)
    expect(host.manager.installBundle).not.toHaveBeenCalled()
    expect(host.manager.removeBundle).not.toHaveBeenCalled()
    for (const entry of host.entries.values()) expect(entry.update).not.toHaveBeenCalled()
    expect(() => repair(host, failed)).toThrow()
  })

  it('resumes deactivation by removing only the shared force-enable', async () => {
    const item = skin('disable')
    const originalHome = `# Shared force enable.\n- id: ${item.rowId}\n  disabled: false\n- id: unrelated-shared-row\n  disabled: true\n`
    const host = fixture([item], { active: item.id, home: originalHome })
    const failed = await finished(host.lifecycle.begin('deactivate', item.id))
    expect(failed.failure).toMatchObject({ desiredEnabled: false, targetSkinId: item.id, action: 'repair-configuration' })
    expect(readMarketState(host.directory).activeSkinId).toBe(item.id)
    expect((await finished(repair(host, failed))).phase).toBe('done')
    expect(host.effectiveEnabled(item)).toBe(false)
    expect(readMarketState(host.directory).activeSkinId).toBeNull()
    expect(readFileSync(host.homePatch, 'utf8')).toBe('# Shared force enable.\n- id: unrelated-shared-row\n  disabled: true\n')
  })

  it('repairs the actual old skin that prevented a switch, preserving the new skin target', async () => {
    const old = skin('old')
    const next = skin('next')
    const host = fixture([old, next], { active: old.id, home: `- id: ${old.rowId}\n  disabled: false\n- id: unrelated-shared-row\n  disabled: true\n` })
    const failed = await finished(host.lifecycle.begin('activate', next.id))
    expect(failed.skinId).toBe(next.id)
    expect(failed.failure).toMatchObject({ targetSkinId: old.id, desiredEnabled: false, configurationOverride: { rowId: old.rowId, desiredEnabled: false }, action: 'repair-configuration' })
    expect(host.effectiveEnabled(old)).toBe(true)
    expect((await finished(repair(host, failed))).phase).toBe('done')
    expect(host.effectiveEnabled(old)).toBe(false)
    expect(host.effectiveEnabled(next)).toBe(true)
    expect(readMarketState(host.directory).activeSkinId).toBe(next.id)
  })

  it('requires the displayed configuration context and rejects stale bytes before any new mutation', async () => {
    const item = skin('stale')
    const host = fixture([item])
    const failed = await finished(host.lifecycle.begin('activate', item.id))
    expect(() => host.lifecycle.retry(failed.id, 'repair-configuration')).toThrow()
    expect(() => repair(host, failed, 'f'.repeat(64))).toThrow()
    const callsBefore = host.manager.setPluginEnabled.mock.calls.length
    const changed = `${host.originalHome}# Edited elsewhere after diagnosis.\n`
    writeFileSync(host.homePatch, changed)
    expect((await finished(repair(host, failed))).phase).toBe('failed')
    expect(readFileSync(host.homePatch, 'utf8')).toBe(changed)
    expect(host.manager.setPluginEnabled).toHaveBeenCalledTimes(callsBefore)
    expect(host.backups()).toEqual([])
  })

  it('does not transfer an old repair approval to a changed curated installation target', async () => {
    const item = skin('changed-target')
    const host = fixture([item])
    const failed = await finished(host.lifecycle.begin('activate', item.id))
    const callsBefore = host.manager.setPluginEnabled.mock.calls.length
    item.install.commit = 'b'.repeat(40)
    item.install.target = `github:fixture/${item.id}#${item.install.commit}`
    let retried: Operation | undefined
    try { retried = repair(host, failed) } catch {}
    if (retried !== undefined) expect((await finished(retried)).phase).toBe('failed')
    expect(readFileSync(host.homePatch, 'utf8')).toBe(host.originalHome)
    expect(host.backups()).toEqual([])
    expect(host.manager.setPluginEnabled).toHaveBeenCalledTimes(callsBefore)
  })

  it.each(['replaced', 'missing'] as const)('rejects %s installed client bytes before editing a shared switch', async change => {
    const item = skin(`artifact-${change}`)
    const host = fixture([item])
    const failed = await finished(host.lifecycle.begin('activate', item.id))
    const callsBefore = host.manager.setPluginEnabled.mock.calls.length
    const clientFile = join(packageDir(host.directory, item.package), 'client', 'client.js')
    if (change === 'replaced') writeFileSync(clientFile, 'export const changedAfterDiagnosis = true\n')
    else rmSync(clientFile)
    let retried: Operation | undefined
    try { retried = repair(host, failed) } catch {}
    if (retried !== undefined) expect((await finished(retried)).phase).toBe('failed')
    expect(readFileSync(host.homePatch, 'utf8')).toBe(host.originalHome)
    expect(host.backups()).toEqual([])
    expect(host.manager.setPluginEnabled).toHaveBeenCalledTimes(callsBefore)
    expect(readMarketState(host.directory).activeSkinId).toBeNull()
  })

  it('rechecks installed bytes after asynchronous official inventory preflight', async () => {
    const item = skin('inventory-artifact-race')
    const host = fixture([item])
    const failed = await finished(host.lifecycle.begin('activate', item.id))
    host.manager.listPlugins.mockImplementationOnce(async () => {
      writeFileSync(join(packageDir(host.directory, item.package), 'client', 'client.js'), 'export const changedDuringInventory = true\n')
      return host.inventory()
    })
    const retried = await finished(repair(host, failed))
    expect(retried.phase).toBe('failed')
    expect(readFileSync(host.homePatch, 'utf8')).toBe(host.originalHome)
    expect(host.backups()).toEqual([])
  })

  it('does not edit HOME if the host stops during asynchronous official inventory preflight', async () => {
    const item = skin('inventory-dispose-race')
    const host = fixture([item])
    const failed = await finished(host.lifecycle.begin('activate', item.id))
    let stopping: Promise<void> | undefined
    host.manager.listPlugins.mockImplementationOnce(async () => {
      stopping = host.lifecycle.dispose()
      return host.inventory()
    })
    repair(host, failed)
    await until(() => stopping !== undefined)
    await stopping
    expect(readFileSync(host.homePatch, 'utf8')).toBe(host.originalHome)
    expect(host.backups()).toEqual([])
  })

  it('attributes an overridden rollback to the old skin and never offers a new-skin repair', async () => {
    const old = skin('rollback-old')
    const next = skin('rollback-next')
    const originalHome = `- id: ${next.rowId}\n  disabled: true\n`
    const host = fixture([old, next], { active: old.id, home: originalHome })
    const nativeEnable = host.manager.setPluginEnabled.getMockImplementation()!
    host.manager.setPluginEnabled.mockImplementation(async (id, enabled) => {
      const result = await nativeEnable(id, enabled)
      if (id === host.entryId(next) && enabled) {
        // An external owner changes the old selection before rollback restores it.
        writeFileSync(host.homePatch, `${originalHome}- id: ${old.rowId}\n  disabled: true\n`)
      }
      return result
    })
    const failed = await finished(host.lifecycle.begin('activate', next.id))
    expect(failed.skinId).toBe(next.id)
    expect(failed.failure).toMatchObject({
      kind: 'configuration-override', targetSkinId: old.id, desiredEnabled: true,
      configurationOverride: { rowId: old.rowId },
    })
    expect(failed.message).toContain('原有启停选择恢复未完成')
    expect(failed.failure?.action).toBeUndefined()
    expect(() => repair(host, failed)).toThrow()
    expect(host.backups()).toEqual([])
    expect(readFileSync(host.homePatch, 'utf8')).toBe(`${originalHome}- id: ${old.rowId}\n  disabled: true\n`)
  })

  it('does not offer automatic repair for a host with additional launch overlays', async () => {
    const item = skin('overlay')
    const host = fixture([item], { overlays: ['trusted-launch-overlay'] })
    const failed = await finished(host.lifecycle.begin('activate', item.id))
    expect(failed.failure).toMatchObject({ kind: 'configuration-override', configurationOverride: { status: 'blocked' } })
    expect(failed.failure?.action).toBeUndefined()
    expect(readFileSync(host.homePatch, 'utf8')).toBe(host.originalHome)
    expect(host.backups()).toEqual([])
  })

  it('restores the shared override after a confirmed failed resumed transition', async () => {
    const item = skin('known-failure')
    const host = fixture([item])
    const failed = await finished(host.lifecycle.begin('activate', item.id))
    host.manager.listPlugins.mockImplementation(async () => {
      if (!readFileSync(host.homePatch, 'utf8').includes('disabled: true # target switch')) throw new Error('confirmed inventory failure after repair')
      return host.inventory()
    })
    const retried = await finished(repair(host, failed))
    expect(retried.phase).toBe('failed')
    expect(readFileSync(host.homePatch, 'utf8')).toBe(host.originalHome)
    expect(host.backups()).toHaveLength(1)
    expect(readMarketState(host.directory).activeSkinId).toBeNull()
  })

  it('never overwrites a concurrent external edit while rolling back a failed transition', async () => {
    const item = skin('rollback-race')
    const host = fixture([item])
    const failed = await finished(host.lifecycle.begin('activate', item.id))
    const changed = '# A concurrent owner replaced this file.\n[]\n'
    host.manager.listPlugins.mockImplementation(async () => {
      if (!readFileSync(host.homePatch, 'utf8').includes('disabled: true # target switch')) {
        writeFileSync(host.homePatch, changed)
        throw new Error('confirmed failure during concurrent write')
      }
      return host.inventory()
    })
    const retried = await finished(repair(host, failed))
    expect(retried.phase).toBe('failed')
    expect(readFileSync(host.homePatch, 'utf8')).toBe(changed)
    expect(host.backups()).toHaveLength(1)
    expect(retried.message).toContain('共享配置恢复未完成')
    expect(retried.failure?.action).toBeUndefined()
  })

  it('keeps the edit and blocks more writes when the resumed official result is unknown', async () => {
    const item = skin('unknown')
    const host = fixture([item])
    const failed = await finished(host.lifecycle.begin('activate', item.id))
    // The profile watcher may not yet have made the just-edited file live.
    host.manager.listPlugins.mockImplementation(async () => host.inventory().map(row => ({ ...row, enabled: false, fiberPhase: null })))
    host.manager.setPluginEnabled.mockResolvedValueOnce({ ok: false, error: { message: 'Client carrier disconnected after dispatch' } })
    const retried = repair(host, failed)
    await until(() => retried.phase === 'waiting')
    expect(host.lifecycle.waitingReason).toBeDefined()
    expect(readFileSync(host.homePatch, 'utf8')).not.toBe(host.originalHome)
    expect(host.backups()).toHaveLength(1)
    const calls = host.manager.setPluginEnabled.mock.calls.length
    expect(() => host.lifecycle.begin('activate', item.id)).toThrow()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(host.manager.setPluginEnabled).toHaveBeenCalledTimes(calls)
    expect(retried.phase).toBe('waiting')
    expect(readFileSync(host.backups()[0]!, 'utf8')).toBe(host.originalHome)
  })
})

function jsonRequest(body: Record<string, unknown>): IncomingMessage {
  const request = Readable.from([JSON.stringify(body)]) as IncomingMessage
  request.headers = { 'content-type': 'application/json' }
  return request
}

describe('configuration repair request boundary', () => {
  const configurationContext = 'a'.repeat(64)

  it('accepts an opaque displayed context instead of a client-selected file or component', async () => {
    await expect(readOperationRetry(jsonRequest({ action: 'repair-configuration', configurationContext }))).resolves.toEqual({
      action: 'repair-configuration', acknowledgeCompatibility: false, configurationContext,
    })
  })

  it.each([undefined, null, false, 1, '', 'x'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64)])('rejects invalid or missing configuration context (%j)', async invalid => {
    await expect(readOperationRetry(jsonRequest({ action: 'repair-configuration', configurationContext: invalid }))).rejects.toThrow()
  })

  it.each(['file', 'path', 'home', 'patchPath', 'rowId', 'targetSkinId', 'desiredEnabled'])('rejects client-selected repair metadata: %s', async key => {
    await expect(readOperationRetry(jsonRequest({ action: 'repair-configuration', configurationContext, [key]: '/tmp/client-chosen' }))).rejects.toThrow()
  })

  it('accepts only an operation kind and catalog identity for read-only selection planning', async () => {
    await expect(readSelectionPlan(jsonRequest({ kind: 'activate', skinId: 'fixture' }))).resolves.toEqual({ kind: 'activate', skinId: 'fixture' })
    await expect(readSelectionPlan(jsonRequest({ kind: 'install', skinId: 'fixture' }))).rejects.toThrow()
    await expect(readSelectionPlan(jsonRequest({ kind: 'activate', skinId: 'fixture', home: '/tmp/client-home' }))).rejects.toThrow()
    await expect(readSelectionPlan(jsonRequest({ kind: 'activate', skinId: '' }))).rejects.toThrow()
  })

  it('carries only a bounded displayed context into the first selection request', async () => {
    await expect(readSkinMutation(jsonRequest({ skinId: 'fixture', configurationContext }))).resolves.toEqual({ skinId: 'fixture', acknowledgeCompatibility: false, configurationContext })
    await expect(readSkinMutation(jsonRequest({ skinId: 'fixture', configurationContext: 'invalid' }))).rejects.toThrow()
    await expect(readSkinMutation(jsonRequest({ skinId: 'fixture', configurationContext, file: '/tmp/client-home' }))).rejects.toThrow()
  })
})
