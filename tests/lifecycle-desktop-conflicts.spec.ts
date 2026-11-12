import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stringify } from 'yaml'
import { loadCatalog } from '../src/catalog.ts'
import { SkinLifecycle } from '../src/lifecycle.ts'
import { officialDesktopRunner, type OfficialPluginManagerLike } from '../src/official-desktop.ts'
import { atomicWriteJson, atomicWriteText, packageDir, packageManifest, profilePatchFile, readDependencies, readMarketState, readProfileBundles, writeMarketState } from '../src/profile.ts'
import type { LoaderEntry } from '../src/types.ts'
import { operationWaiter } from './fixtures/operations.ts'

const directories: string[] = []
const lifecycles: SkinLifecycle[] = []
const legacyPackage = 'dsh-client-liang-intensity-skin'

afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map(lifecycle => lifecycle.dispose()))
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

const finished = operationWaiter({ intervalMs: 5, message: 'operation did not settle' })

interface FixtureOptions {
  keepRuntimeAfterDisable?: boolean
  deferTargetRuntime?: boolean
  overlays?: string[]
  omitConfiguration?: boolean
}

function fixture(options: FixtureOptions = {}) {
  const skin = structuredClone(loadCatalog().skins.find(item => item.id === 'king-of-soy-sauce.liang-intensity')!)
  // The registry is refreshed independently of these lifecycle fixtures. Keep
  // Desktop behavior tests on a stable managed artifact contract instead of
  // inheriting a current market decision such as manual-only for a prerelease.
  delete skin.install.npm
  skin.install.desktop = {
    mode: 'managed',
    registry: 'npm',
    packageName: skin.package,
    packageVersion: skin.install.version,
    integrity: 'sha512-ZHVtbXktZml4dHVyZS1hcnRpZmFjdA==',
  }
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-desktop-loader-conflicts-')))
  directories.push(directory)
  const home = join(directory, 'home')
  mkdirSync(home)
  const manifestFile = join(directory, 'package.json')
  const localLinkDirectory = join(directory, 'local-liang-skin')
  const localLinkSpec = `link:${localLinkDirectory}`
  atomicWriteJson(manifestFile, { dependencies: {}, dsh: { profile: { bundles: [] } } })
  const manifest = () => JSON.parse(readFileSync(manifestFile, 'utf8')) as { dependencies: Record<string, string>; dsh: { profile: { bundles: string[] } } }
  const lockEntries = new Map<string, { spec: string; version: string }>()
  const packageRows = new Map<string, Array<{ id: string; name: string }>>()
  const runtimeEntries = new Map<string, LoaderEntry[]>()
  const entryId = (name: string, id: string) => `loader:${name}:${id}`
  const select = (name: string, enabled: boolean) => {
    const value = manifest()
    value.dsh.profile.bundles = enabled ? [...new Set([...value.dsh.profile.bundles, name])] : value.dsh.profile.bundles.filter(item => item !== name)
    atomicWriteJson(manifestFile, value)
    if (enabled && !(options.deferTargetRuntime && name === skin.package)) runtimeEntries.set(name, (packageRows.get(name) ?? []).map(row => ({ options: { id: row.id, name: row.name }, fiber: {}, update: vi.fn(async () => undefined) })))
    else if (!options.keepRuntimeAfterDisable) runtimeEntries.delete(name)
  }
  const materialize = (name: string, version: string, rows = [{ id: skin.rowId, name }], spec = version) => {
    const value = manifest()
    value.dependencies[name] = spec
    atomicWriteJson(manifestFile, value)
    packageRows.set(name, rows)
    const target = packageDir(directory, name)
    mkdirSync(target, { recursive: true })
    atomicWriteJson(join(target, 'package.json'), {
      name, version, repository: skin.repo, gitHead: skin.install.commit, exports: { './client': './client.js' },
      dsh: { client: { platform: 'web' }, bundle: { patch: './cordis.patch.yml' } },
    })
    atomicWriteText(join(target, 'client.js'), `export const version = '${version}'\n`)
    atomicWriteText(join(target, 'cordis.patch.yml'), stringify([{ insert: rows }]))
    if (spec.startsWith('link:') && !lstatSync(target).isSymbolicLink()) {
      renameSync(target, spec.slice('link:'.length))
      symlinkSync(spec.slice('link:'.length), target, process.platform === 'win32' ? 'junction' : 'dir')
    }
    lockEntries.set(name, { spec, version })
    atomicWriteText(join(directory, 'pnpm-lock.yaml'), stringify({
      lockfileVersion: '9.0',
      importers: { '.': { dependencies: Object.fromEntries([...lockEntries].map(([name, source]) => [name, { specifier: source.spec, version: source.version }])) } },
      packages: Object.fromEntries([...lockEntries].map(([name, source]) => [`${name}@${source.version}`, {
        resolution: { integrity: skin.install.desktop?.mode === 'managed' ? skin.install.desktop.integrity : undefined },
      }])),
    }))
  }
  const entries: LoaderEntry[] = []
  const manager = {
    installBundle: vi.fn(async (): Promise<unknown> => {
      materialize(skin.package, skin.install.version)
      return { application: 'restart-required', changed: true, version: skin.install.version }
    }),
    removeBundle: vi.fn(async (): Promise<unknown> => ({ application: 'applied' })),
    setBundleEnabled: vi.fn(async (name: string, enabled: boolean): Promise<unknown> => {
      select(name, enabled)
      return { application: 'applied', changed: true, stage: 'enable', target: name, enabled }
    }),
    setPluginEnabled: vi.fn(async (id: string, enabled: boolean): Promise<unknown> => {
      const entry = [...runtimeEntries.values()].flat().find(entry => entryId(String(entry.options.name), String(entry.options.id)) === id)
      if (entry === undefined) throw new Error('unknown fixture entry')
      entry.options.disabled = !enabled
      entry.fiber = enabled ? {} : undefined
      return { application: 'applied', changed: true, stage: 'enable', target: id, enabled }
    }),
    listBundles: vi.fn(async (): Promise<unknown> => [...packageRows].map(([name, rows]) => ({
      name, installed: true, enabled: readProfileBundles(directory).includes(name),
      rows: rows.map(row => ({ rowId: row.id, moduleName: row.name, ...(readProfileBundles(directory).includes(name) ? { entryId: entryId(name, row.id) } : {}) })),
    }))),
    listPlugins: vi.fn(async (): Promise<unknown> => [...runtimeEntries].flatMap(([name, entries]) => entries.map(entry => ({
      entryId: entryId(name, String(entry.options.id)), patchId: entry.options.id, moduleName: entry.options.name,
      enabled: entry.options.disabled !== true, fiberPhase: entry.fiber === undefined ? null : 'active',
    })))),
  } satisfies OfficialPluginManagerLike
  const runtime = { version: '0.2.0-rc.2', source: 'injected' as const, capabilities: [] }
  const runner = officialDesktopRunner(() => manager, runtime)
  const lifecycle = new SkinLifecycle({ loader: { entries: () => [...entries, ...[...runtimeEntries.values()].flat()] } }, {
    profile: 'desktop', profileDir: directory, hostKind: 'desktop', runner, runtime, lifecycleWaitMs: 10,
    configurationOverride: options.omitConfiguration ? undefined : { home, patchPath: profilePatchFile(directory), overlays: options.overlays ?? [] },
  }, [skin])
  lifecycles.push(lifecycle)
  return { skin, directory, home, manifestFile, localLinkDirectory, localLinkSpec, materialize, select, manager, lifecycle, entries }
}

describe('Desktop loader conflict preflight', () => {
  it.each(['install', 'update'] as const)('allows %s with the reviewed legacy local link and preserves the old selection', async kind => {
    const host = fixture()
    host.materialize(legacyPackage, '0.1.8', undefined, host.localLinkSpec)
    host.select(legacyPackage, true)
    if (kind === 'update') host.materialize(host.skin.package, '0.1.9')
    const operation = await finished(host.lifecycle.begin(kind, host.skin.id))

    expect(operation).toMatchObject({ phase: 'done' })
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(host.manager.removeBundle).not.toHaveBeenCalled()
    expect(readDependencies(host.directory)[legacyPackage]).toBe(host.localLinkSpec)
    expect(lstatSync(packageDir(host.directory, legacyPackage)).isSymbolicLink()).toBe(true)
    expect(realpathSync(packageDir(host.directory, legacyPackage))).toBe(realpathSync(host.localLinkDirectory))
    expect(readProfileBundles(host.directory)).toEqual([legacyPackage])
    expect(packageManifest(host.directory, legacyPackage)?.version).toBe('0.1.8')
    expect(packageManifest(host.directory, host.skin.package)?.version).toBe(host.skin.install.version)
  })

  it('also blocks a loaded conflicting component before the official transaction', async () => {
    const host = fixture()
    host.materialize(host.skin.package, '0.1.9')
    host.entries.push({ options: { id: host.skin.rowId, name: legacyPackage }, update: vi.fn(async () => undefined) })

    const operation = await finished(host.lifecycle.begin('update', host.skin.id))

    expect(operation).toMatchObject({ phase: 'failed', failure: { kind: 'conflict' } })
    expect(host.manager.installBundle).not.toHaveBeenCalled()
    expect(packageManifest(host.directory, host.skin.package)?.version).toBe('0.1.9')
  })

  it('can repair old target metadata through an update when the known target loader has no conflicts', async () => {
    const host = fixture()
    host.materialize(host.skin.package, '0.1.9', [{ id: 'outdated-main-row', name: host.skin.package }])

    const operation = await finished(host.lifecycle.begin('update', host.skin.id))

    expect(operation.phase).toBe('done')
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(packageManifest(host.directory, host.skin.package)?.version).toBe(host.skin.install.version)
  })

  it('still checks all actual incoming bundle rows after the official transaction', async () => {
    const host = fixture()
    host.materialize(host.skin.package, '0.1.9')
    host.materialize('unrelated-installed-package', '1.0.0', [{ id: 'shared-secondary-loader', name: 'unrelated-installed-package' }])
    host.manager.installBundle.mockImplementationOnce(async () => {
      host.materialize(host.skin.package, host.skin.install.version, [
        { id: host.skin.rowId, name: host.skin.package },
        { id: 'shared-secondary-loader', name: 'incoming-secondary-component' },
      ])
      return { application: 'restart-required', changed: true, version: host.skin.install.version }
    })

    const operation = await finished(host.lifecycle.begin('update', host.skin.id))

    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(operation.message).toContain('发现插件安装冲突')
    expect(operation).toMatchObject({ phase: 'failed', failure: { kind: 'conflict', conflicts: [{
      existing: 'unrelated-installed-package', identifiers: ['shared-secondary-loader'],
    }] } })
    expect(operation.failure?.message).toContain('官方管理操作后构件与原有版本不一致')
    expect(readDependencies(host.directory)[host.skin.package]).toBe(host.skin.install.version)
  })

  it.each(['unknown package', 'wrong repository', 'wrong package name', 'multiple rows'] as const)('rejects an unverified predecessor: %s', async reason => {
    const host = fixture()
    const existing = reason === 'unknown package' ? 'unrelated-installed-package' : legacyPackage
    host.materialize(existing, '0.1.8', reason === 'multiple rows' ? [
      { id: host.skin.rowId, name: existing }, { id: 'unrelated-row', name: 'unrelated-component' },
    ] : undefined)
    host.materialize(host.skin.package, host.skin.install.version)
    if (reason === 'wrong repository' || reason === 'wrong package name') {
      const metadata = packageManifest(host.directory, existing)!
      atomicWriteJson(join(packageDir(host.directory, existing), 'package.json'), {
        ...metadata, ...(reason === 'wrong repository' ? { repository: 'https://github.com/unrelated/skin' } : { name: 'some-other-package' }),
      })
    }

    const operation = await finished(host.lifecycle.begin('activate', host.skin.id))

    expect(operation).toMatchObject({ phase: 'failed', failure: { kind: 'conflict' } })
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(host.manager.removeBundle).not.toHaveBeenCalled()
  })

  it('does not let a reviewed predecessor hide a separately inserted profile component', async () => {
    const host = fixture()
    host.materialize(legacyPackage, '0.1.8')
    host.materialize(host.skin.package, host.skin.install.version)
    atomicWriteText(profilePatchFile(host.directory), stringify([{ insert: [{ id: host.skin.rowId, name: legacyPackage }] }]))

    const operation = await finished(host.lifecycle.begin('activate', host.skin.id))

    expect(operation).toMatchObject({ phase: 'failed', failure: { kind: 'conflict' } })
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
  })
})

describe('Desktop reviewed predecessor takeover', () => {
  function installedPair(options: FixtureOptions & { legacyEnabled?: boolean } = {}) {
    const host = fixture(options)
    host.materialize(legacyPackage, '0.1.8', undefined, host.localLinkSpec)
    host.materialize(host.skin.package, host.skin.install.version)
    if (options.legacyEnabled !== false) host.select(legacyPackage, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: null, disabledSkinIds: [host.skin.id], pinnedSkinIds: [] })
    return host
  }

  /** rc.2 still exposes the old running module under the reused loader ID. */
  function staleRc2Host(profileDisabled = false, reportedOverride = false, options: Pick<FixtureOptions, 'overlays' | 'omitConfiguration'> = {}) {
    const host = installedPair({ ...options, keepRuntimeAfterDisable: true, deferTargetRuntime: true })
    const oldEntryId = `loader:${legacyPackage}:${host.skin.rowId}`
    const inventory = host.manager.listBundles.getMockImplementation()!
    if (profileDisabled) atomicWriteText(profilePatchFile(host.directory), stringify([{ id: host.skin.rowId, disabled: true }]))
    host.manager.listBundles.mockImplementation(async () => {
      const bundles = await inventory() as Array<{ name: string; rows: Array<Record<string, unknown>>; overrides?: unknown[] }>
      const target = bundles.find(bundle => bundle.name === host.skin.package)!
      target.rows[0].entryId = oldEntryId
      if (reportedOverride) target.overrides = [{ id: host.skin.rowId, disabled: true }]
      return bundles
    })
    host.manager.listPlugins.mockResolvedValue([{
      entryId: oldEntryId, moduleName: legacyPackage, enabled: !profileDisabled,
      fiberPhase: profileDisabled ? null : 'active', readOnlyReason: 'unaddressable',
    }])
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => {
      host.select(name, enabled)
      return { application: 'restart-required', changed: true, target: name, enabled, restartReason: 'no-hmr' }
    })
    return { ...host, oldEntryId }
  }

  it.each(['activate', 'pin'] as const)('withdraws the enabled predecessor before %s and preserves its local link', async kind => {
    const host = installedPair()

    const operation = await finished(host.lifecycle.begin(kind, host.skin.id))

    expect(operation).toMatchObject({ phase: 'done' })
    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[legacyPackage, false], [host.skin.package, true]])
    expect(readProfileBundles(host.directory)).toEqual([host.skin.package])
    expect(readDependencies(host.directory)[legacyPackage]).toBe(host.localLinkSpec)
    expect(lstatSync(packageDir(host.directory, legacyPackage)).isSymbolicLink()).toBe(true)
    expect(realpathSync(packageDir(host.directory, legacyPackage))).toBe(realpathSync(host.localLinkDirectory))
    expect(packageManifest(host.directory, legacyPackage)?.version).toBe('0.1.8')
    expect(host.manager.installBundle).not.toHaveBeenCalled()
    expect(host.manager.removeBundle).not.toHaveBeenCalled()
    expect(readMarketState(host.directory)).toMatchObject(kind === 'activate'
      ? { activeSkinId: host.skin.id, pinnedSkinIds: [] }
      : { activeSkinId: null, pinnedSkinIds: [host.skin.id] })
  })

  it('activates when the reviewed predecessor is already disabled without toggling it again', async () => {
    const host = installedPair({ legacyEnabled: false })

    expect(await finished(host.lifecycle.begin('activate', host.skin.id))).toMatchObject({ phase: 'done' })

    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[host.skin.package, true]])
    expect(readDependencies(host.directory)[legacyPackage]).toBe(host.localLinkSpec)
    expect(host.manager.removeBundle).not.toHaveBeenCalled()
  })

  it.each([
    'missing bundle', 'duplicate bundle', 'wrong row', 'multiple rows',
    'foreign override', 'selection mismatch', 'read-only row',
  ] as const)('refuses takeover when the official predecessor inventory has %s', async reason => {
    const host = installedPair()
    const inventory = host.manager.listBundles.getMockImplementation()!
    host.manager.listBundles.mockImplementation(async () => {
      const bundles = await inventory() as Array<{ name: string; enabled: boolean; rows: Array<Record<string, unknown>>; overrides?: unknown[] }>
      const old = bundles.find(bundle => bundle.name === legacyPackage)!
      if (reason === 'missing bundle') return bundles.filter(bundle => bundle !== old)
      if (reason === 'duplicate bundle') return [...bundles, { ...old }]
      if (reason === 'wrong row') old.rows = [{ rowId: 'another-loader', moduleName: legacyPackage }]
      if (reason === 'multiple rows') old.rows = [...old.rows, { rowId: 'another-loader', moduleName: 'another-plugin' }]
      if (reason === 'foreign override') old.overrides = [{ id: host.skin.rowId, disabled: false }]
      if (reason === 'selection mismatch') old.enabled = false
      if (reason === 'read-only row') old.rows[0].readOnlyReason = 'unaddressable'
      return bundles
    })

    expect(await finished(host.lifecycle.begin('activate', host.skin.id))).toMatchObject({ phase: 'failed' })

    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(host.manager.installBundle).not.toHaveBeenCalled()
    expect(host.manager.removeBundle).not.toHaveBeenCalled()
    expect(readProfileBundles(host.directory)).toEqual([legacyPackage])
  })

  it('refuses a preexisting simultaneous old and new selection without changing either bundle', async () => {
    const host = installedPair()
    host.select(host.skin.package, true)

    expect(await finished(host.lifecycle.begin('activate', host.skin.id))).toMatchObject({ phase: 'failed' })

    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(readProfileBundles(host.directory)).toEqual([legacyPackage, host.skin.package])
  })

  it('stops before enabling the target when withdrawing the predecessor fails', async () => {
    const host = installedPair()
    host.manager.setBundleEnabled.mockResolvedValueOnce({ application: 'failed', changed: false, error: { code: 'reload-failed', message: 'cannot disable predecessor' } })

    expect(await finished(host.lifecycle.begin('activate', host.skin.id))).toMatchObject({ phase: 'failed', application: 'failed' })

    expect(host.manager.setBundleEnabled).toHaveBeenNthCalledWith(1, legacyPackage, false)
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalledWith(host.skin.package, true)
    expect(readProfileBundles(host.directory)).toEqual([legacyPackage])
    expect(readMarketState(host.directory).activeSkinId).toBeNull()
  })

  it('restores the predecessor when its failed disable nevertheless saved a changed selection', async () => {
    const host = installedPair()
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => {
      host.select(name, enabled)
      return name === legacyPackage && !enabled
        ? { application: 'failed', changed: true, error: { code: 'reload-failed', message: 'disable saved but reload failed' } }
        : { application: 'applied', changed: true }
    })

    expect(await finished(host.lifecycle.begin('activate', host.skin.id))).toMatchObject({ phase: 'failed', application: 'failed' })

    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[legacyPackage, false], [legacyPackage, true]])
    expect(readProfileBundles(host.directory)).toEqual([legacyPackage])
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: null, disabledSkinIds: [host.skin.id] })
    expect(host.manager.removeBundle).not.toHaveBeenCalled()
  })

  it('requires the predecessor to be withdrawn from saved selection before enabling the target', async () => {
    const host = installedPair()
    host.manager.setBundleEnabled.mockResolvedValueOnce({ application: 'applied', changed: false })

    expect(await finished(host.lifecycle.begin('activate', host.skin.id))).toMatchObject({ phase: 'failed' })

    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[legacyPackage, false]])
    expect(readProfileBundles(host.directory)).toEqual([legacyPackage])
  })

  it('disables the rejected new target before restoring the previous legacy selection', async () => {
    const host = installedPair()
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => {
      if (name === legacyPackage && enabled && readProfileBundles(host.directory).includes(host.skin.package)) {
        throw new Error('restoring predecessor would overlap the rejected new skin')
      }
      host.select(name, enabled)
      return name === host.skin.package && enabled
        ? { application: 'failed', changed: true, error: { code: 'reload-failed', message: 'target failed to load' } }
        : { application: 'applied', changed: true }
    })

    expect(await finished(host.lifecycle.begin('activate', host.skin.id))).toMatchObject({ phase: 'failed', application: 'failed' })

    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[legacyPackage, false], [host.skin.package, true], [host.skin.package, false], [legacyPackage, true]])
    expect(readProfileBundles(host.directory)).toEqual([legacyPackage])
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: null, disabledSkinIds: [host.skin.id], pinnedSkinIds: [] })
    expect(host.manager.removeBundle).not.toHaveBeenCalled()
  })

  it.each(['failed', 'unknown'] as const)('does not restore the predecessor while withdrawing the rejected target is %s', async outcome => {
    const host = installedPair()
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => {
      if (name === host.skin.package && !enabled) {
        if (outcome === 'unknown') throw new Error('Host response lost while disabling rejected target')
        return { application: 'failed', changed: false, error: { code: 'reload-failed', message: 'cannot withdraw rejected target' } }
      }
      host.select(name, enabled)
      return name === host.skin.package && enabled
        ? { application: 'failed', changed: true, error: { code: 'reload-failed', message: 'target enabled but failed to load' } }
        : { application: 'applied', changed: true }
    })

    const operation = host.lifecycle.begin('activate', host.skin.id)
    if (outcome === 'unknown') {
      for (let index = 0; index < 200 && host.lifecycle.waitingReason === undefined; index++) await new Promise(resolve => setTimeout(resolve, 5))
      expect(operation.phase).toBe('waiting')
      expect(host.lifecycle.waitingReason).toContain('未返回可确认')
      expect(host.manager.setBundleEnabled.mock.calls).toEqual([[legacyPackage, false], [host.skin.package, true], [host.skin.package, false]])
    } else expect(await finished(operation)).toMatchObject({ phase: 'failed' })

    expect(host.manager.setBundleEnabled).toHaveBeenCalledWith(host.skin.package, false)
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalledWith(legacyPackage, true)
    expect(readProfileBundles(host.directory)).toEqual([host.skin.package])
    expect(readMarketState(host.directory).activeSkinId).toBeNull()
    expect(host.manager.removeBundle).not.toHaveBeenCalled()
  })

  it.each(['disable predecessor', 'enable target'] as const)('makes no further writes after an unknown result while trying to %s', async step => {
    const host = installedPair()
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => {
      host.select(name, enabled)
      if (step === 'disable predecessor' && name === legacyPackage || step === 'enable target' && name === host.skin.package) {
        throw new Error('Host response lost')
      }
      return { application: 'applied', changed: true }
    })

    const operation = host.lifecycle.begin('activate', host.skin.id)
    for (let index = 0; index < 200 && host.lifecycle.waitingReason === undefined; index++) await new Promise(resolve => setTimeout(resolve, 5))

    expect(operation.phase).toBe('waiting')
    expect(host.lifecycle.waitingReason).toContain('未返回可确认')
    expect(host.manager.setBundleEnabled.mock.calls).toEqual(step === 'disable predecessor'
      ? [[legacyPackage, false]] : [[legacyPackage, false], [host.skin.package, true]])
    expect(() => host.lifecycle.begin('pin', host.skin.id)).toThrow('未返回可确认')
    expect(host.manager.removeBundle).not.toHaveBeenCalled()
  })

  it('accepts saved restart transitions even while the withdrawn predecessor remains in the running loader', async () => {
    const host = installedPair({ keepRuntimeAfterDisable: true })
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => {
      host.select(name, enabled)
      return { application: 'restart-required', changed: true, target: name, enabled, restartReason: 'no-hmr' }
    })

    const operation = await finished(host.lifecycle.begin('activate', host.skin.id))

    expect(operation).toMatchObject({ phase: 'done', application: 'restart-required', restartRequired: true })
    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[legacyPackage, false], [host.skin.package, true]])
    expect(readProfileBundles(host.directory)).toEqual([host.skin.package])
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: host.skin.id, pendingRestart: { pid: process.pid, skinIds: [host.skin.id] } })
    expect(host.manager.removeBundle).not.toHaveBeenCalled()
  })

  it('saves an rc.2 takeover when the new bundle row still points to the unaddressable old running module', async () => {
    const host = staleRc2Host()

    const operation = await finished(host.lifecycle.begin('activate', host.skin.id))

    expect(operation).toMatchObject({ phase: 'done', application: 'restart-required', restartRequired: true })
    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[legacyPackage, false], [host.skin.package, true]])
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
    expect(readProfileBundles(host.directory)).toEqual([host.skin.package])
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: host.skin.id, pendingRestart: { pid: process.pid, skinIds: [host.skin.id] } })
    expect(await host.manager.listPlugins()).toEqual([{
      entryId: host.oldEntryId, moduleName: legacyPackage, enabled: true, fiberPhase: 'active', readOnlyReason: 'unaddressable',
    }])
    host.manager.setBundleEnabled.mockClear()

    await host.lifecycle.replay()

    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
    expect(readProfileBundles(host.directory)).toEqual([host.skin.package])
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: host.skin.id, pendingRestart: { pid: process.pid, skinIds: [host.skin.id] } })
  })

  it.each([false, true])('does not accept a stale rc.2 entry as pending success when the profile disables the target (override reported: %s)', async reportedOverride => {
    const host = staleRc2Host(true, reportedOverride)

    const operation = await finished(host.lifecycle.begin('activate', host.skin.id))

    expect(operation.phase).toBe('failed')
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
    expect(readProfileBundles(host.directory)).toEqual([legacyPackage])
    expect(readMarketState(host.directory).activeSkinId).toBeNull()
  })

  it('does not accept stale rc.2 runtime data as pending success when the shared home disables the target', async () => {
    const host = staleRc2Host()
    const sharedPatch = join(host.home, 'cordis.patch.yml')
    const contents = stringify([{ id: host.skin.rowId, disabled: true }])
    atomicWriteText(sharedPatch, contents)

    const operation = await finished(host.lifecycle.begin('activate', host.skin.id))

    expect(operation.phase).toBe('failed')
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
    expect(readProfileBundles(host.directory)).toEqual([legacyPackage])
    expect(readMarketState(host.directory).activeSkinId).toBeNull()
    expect(readFileSync(sharedPatch, 'utf8')).toBe(contents)
  })

  it.each(['startup overlay', 'missing trusted configuration'] as const)('rejects pending rc.2 fallback with %s', async reason => {
    const host = staleRc2Host(false, false, reason === 'startup overlay' ? { overlays: ['fixture-overlay'] } : { omitConfiguration: true })

    const operation = await finished(host.lifecycle.begin('activate', host.skin.id))

    expect(operation.phase).toBe('failed')
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
    expect(readProfileBundles(host.directory)).toEqual([legacyPackage])
    expect(readMarketState(host.directory).activeSkinId).toBeNull()
  })

  it('preserves native choices during replay, takes over on explicit activation, then leaves the completed selection alone', async () => {
    const host = installedPair()
    writeMarketState(host.directory, { version: 1, activeSkinId: host.skin.id, disabledSkinIds: [], pinnedSkinIds: [] })

    await host.lifecycle.replay()

    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
    expect(readProfileBundles(host.directory)).toEqual([legacyPackage])
    expect(readMarketState(host.directory).activeSkinId).toBe(host.skin.id)

    expect(await finished(host.lifecycle.begin('activate', host.skin.id))).toMatchObject({ phase: 'done' })

    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[legacyPackage, false], [host.skin.package, true]])
    expect(readProfileBundles(host.directory)).toEqual([host.skin.package])
    expect(readMarketState(host.directory).activeSkinId).toBe(host.skin.id)
    expect(host.manager.removeBundle).not.toHaveBeenCalled()
    host.manager.setBundleEnabled.mockClear()

    await host.lifecycle.replay()

    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(readProfileBundles(host.directory)).toEqual([host.skin.package])
    expect(readDependencies(host.directory)[legacyPackage]).toBe(host.localLinkSpec)
  })

  it('keeps a verified saved rc.2 selection when the newly installed target can only import after restart', async () => {
    const host = installedPair()
    writeMarketState(host.directory, {
      version: 1, activeSkinId: null, disabledSkinIds: [host.skin.id], pinnedSkinIds: [],
      pendingRestart: { pid: process.pid, skinIds: [host.skin.id] },
    })
    const diagnostic = `dsh: warning: 1 entry did not activate\n${host.skin.rowId} (${host.skin.package}): failed to import`
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => {
      host.select(name, enabled)
      return name === host.skin.package && enabled
        ? { application: 'failed', changed: true, stage: 'enable', target: name, enabled, error: { code: 'operation-error', diagnostic } }
        : { application: 'applied', changed: true }
    })

    const operation = await finished(host.lifecycle.begin('activate', host.skin.id))

    expect(operation).toMatchObject({ phase: 'done', application: 'restart-required', restartRequired: true })
    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[legacyPackage, false], [host.skin.package, true]])
    expect(readProfileBundles(host.directory)).toEqual([host.skin.package])
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: host.skin.id, pendingRestart: { pid: process.pid, skinIds: [host.skin.id] } })
    expect(host.manager.removeBundle).not.toHaveBeenCalled()
  })
})
