import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { maxParallelDownloads, SkinLifecycle } from '../src/lifecycle.ts'
import { compatibilityContext } from '../src/compatibility.ts'
import { atomicWriteJson, atomicWriteText, compatibilityPatchFile, ensurePatchedDependency, patchedDependenciesNeedSync, pnpmWorkspaceFile, profilePatchFile, readDependencies, readMarketState, writeMarketState } from '../src/profile.ts'
import type { CommandOptions, CommandResult, PluginInstallRequest, PluginRunner } from '../src/commands.ts'
import type { LoaderEntry, Operation, SkinEntry } from '../src/types.ts'

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'skin-lifecycle-'))
  atomicWriteJson(join(dir, 'package.json'), { dependencies: {} })
  return dir
}

async function finished(operation: Operation): Promise<Operation> {
  for (let index = 0; index < 200; index++) {
    if (operation.phase === 'done' || operation.phase === 'failed' || operation.phase === 'cancelled') return operation
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('operation did not finish')
}

function success(): CommandResult { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } }

function identityCounts(catalog: SkinLifecycle['catalog']) {
  const packages = new Map<string, number>()
  const rows = new Map<string, number>()
  for (const item of catalog) {
    packages.set(item.package, (packages.get(item.package) ?? 0) + 1)
    rows.set(item.rowId, (rows.get(item.rowId) ?? 0) + 1)
  }
  return { packages, rows }
}

function isIsolatedInstallable(item: SkinLifecycle['catalog'][number], counts: ReturnType<typeof identityCounts>) {
  // Forks can share a package name or loader id. A fixture that installs one of
  // them is attributed to every match, so these runners only use an identity
  // that belongs to a single catalog skin.
  return item.review?.installation !== 'manual-only'
    && item.install.npm === undefined
    && counts.packages.get(item.package) === 1
    && counts.rows.get(item.rowId) === 1
}

function firstInstallable(lifecycle: SkinLifecycle) {
  // These generic lifecycle runners materialize GitHub targets. Tests of npm
  // installation attach explicit npm metadata and verify that separate path.
  const skin = lifecycle.catalog.find(item => isIsolatedInstallable(item, identityCounts(lifecycle.catalog)))
  if (skin === undefined) throw new Error('fixture catalog has no GitHub-only installable skin with a unique package and row id')
  return skin
}

function anotherInstallable(lifecycle: SkinLifecycle, excludedId: string) {
  const counts = identityCounts(lifecycle.catalog)
  const skin = lifecycle.catalog.find(item => item.id !== excludedId && isIsolatedInstallable(item, counts))
  if (skin === undefined) throw new Error('fixture catalog has only one GitHub-only installable skin with a unique package and row id')
  return skin
}

function writeBundlePackage(dir: string, skin: { package: string; rowId: string; install: { version: string } }): void {
  const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
  mkdirSync(packageDir, { recursive: true })
  atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, exports: { './client': './client.js' }, dsh: { bundle: { patch: './cordis.patch.yml' }, client: {} } })
  atomicWriteText(join(packageDir, 'client.js'), 'export const fixture = true\n')
  atomicWriteText(join(packageDir, 'cordis.patch.yml'), `- insert:\n    - id: ${skin.rowId}\n      name: ${JSON.stringify(skin.package)}\n`)
}

function writeBundleRows(dir: string, skin: { package: string; install: { version: string } }, rows: Array<{ id: string; name: string }>): void {
  const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
  mkdirSync(packageDir, { recursive: true })
  atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, exports: { './client': './client.js' }, dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } } })
  atomicWriteText(join(packageDir, 'client.js'), 'export const fixture = true\n')
  atomicWriteText(join(packageDir, 'cordis.patch.yml'), `- insert:\n${rows.map(row => `    - id: ${row.id}\n      name: ${JSON.stringify(row.name)}`).join('\n')}\n`)
}


function materializeReviewedSkin(targetDir: string, skin: { package: string; rowId: string; install: { version: string; target: string } }, bundle = true): void {
  const manifestPath = join(targetDir, 'package.json')
  const existing = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8')) as { dependencies?: Record<string, string> }
    : {}
  atomicWriteJson(manifestPath, { ...existing, dependencies: { ...existing.dependencies, [skin.package]: skin.install.target } })
  if (bundle) writeBundlePackage(targetDir, skin)
  else {
    const packageDir = join(targetDir, 'node_modules', ...skin.package.split('/'))
    mkdirSync(packageDir, { recursive: true })
    atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, exports: { './client': './client.js' }, dsh: { client: { platform: 'web' } } })
    atomicWriteText(join(packageDir, 'client.js'), 'export const fixture = true\n')
  }
}

function syncPatchLockfile(dir: string): void {
  const workspace = parse(readFileSync(pnpmWorkspaceFile(dir), 'utf8')) as { patchedDependencies?: Record<string, unknown> }
  const patchedDependencies = Object.fromEntries(Object.entries(workspace.patchedDependencies ?? {}).flatMap(([key, value]) => {
    if (typeof value !== 'string') return []
    const patchFile = join(dir, value)
    const hash = createHash('sha256').update(readFileSync(patchFile, 'utf8').replace(/\r\n/g, '\n')).digest('hex')
    return [[key, hash]]
  }))
  atomicWriteText(join(dir, 'pnpm-lock.yaml'), stringify({
    lockfileVersion: '9.0',
    ...(Object.keys(patchedDependencies).length === 0 ? {} : { patchedDependencies }),
  }, { lineWidth: 0 }))
}

function webSelectionFixture() {
  const dir = fixture()
  const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
  const base = firstInstallable(probe)
  const skins: SkinEntry[] = ['one', 'two', 'pinned'].map(name => ({ ...base,
    id: `selection.${name}`, package: `@example/selection-${name}`, rowId: `selection-${name}`,
  }))
  atomicWriteJson(join(dir, 'package.json'), { dependencies: Object.fromEntries(skins.map(skin => [skin.package, skin.install.target])) })
  const updates: string[] = []
  const entries = new Map<string, LoaderEntry>()
  const addEntry = (skin: { rowId: string; package: string }, enabled: boolean) => {
    const entry: LoaderEntry = {
      options: { id: skin.rowId, name: skin.package, disabled: enabled ? null : true },
      fiber: enabled ? { state: 2 } : undefined,
      update: async value => {
        updates.push(`${skin.rowId}:${String(value.disabled)}`)
        entry.options.disabled = value.disabled
        entry.fiber = value.disabled ? undefined : { state: 2 }
      },
    }
    entries.set(skin.rowId, entry)
    return entry
  }
  for (const [index, skin] of skins.entries()) {
    writeBundleRows(dir, skin, [{ id: skin.rowId, name: skin.package }])
    addEntry(skin, index === 0)
  }
  writeMarketState(dir, { version: 1, activeSkinId: skins[0].id, disabledSkinIds: skins.slice(1).map(skin => skin.id), pinnedSkinIds: [] })
  const lifecycle = new SkinLifecycle({ loader: { entries: () => entries.values() } }, { profile: 'test', profileDir: dir, runner: async () => success() }, skins)
  return { dir, skins, entries, updates, addEntry, lifecycle }
}

describe('parallel download budget', () => {
  it('allows two overlapping prefetches on desktop-class hosts', () => {
    expect(maxParallelDownloads('darwin', {}, 8 * 1024 ** 3)).toBe(2)
    expect(maxParallelDownloads('win32', {}, 8 * 1024 ** 3)).toBe(2)
    expect(maxParallelDownloads('linux', {}, 8 * 1024 ** 3)).toBe(2)
  })

  it('serializes downloads on Android and low-memory hosts', () => {
    expect(maxParallelDownloads('android', {}, 8 * 1024 ** 3)).toBe(1)
    expect(maxParallelDownloads('linux', { ANDROID_ROOT: '/system' }, 8 * 1024 ** 3)).toBe(1)
    expect(maxParallelDownloads('linux', { ANDROID_DATA: '/data' }, 8 * 1024 ** 3)).toBe(1)
    expect(maxParallelDownloads('linux', {}, 2 * 1024 ** 3)).toBe(1)
  })
})

describe('skin lifecycle', () => {
  it('cancels a prefetch without mutating the live profile', async () => {
    const dir = fixture()
    let commandArgs: readonly string[] = []
    const runner: PluginRunner = async (_profile, args, options) => {
      commandArgs = args
      return await new Promise(resolve => {
        options?.signal?.addEventListener('abort', () => resolve({ ...success(), exitCode: null, aborted: true }), { once: true })
      })
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner })
    const skin = firstInstallable(lifecycle)
    const operation = lifecycle.begin('install', skin.id)
    for (let index = 0; index < 100 && operation.phase !== 'downloading'; index++) await new Promise(resolve => setTimeout(resolve, 5))

    expect(operation).toMatchObject({ phase: 'downloading', cancelable: true })
    expect(commandArgs).toContain('--reporter=ndjson')
    const tempDirectory = commandArgs[commandArgs.indexOf('--dir') + 1]
    expect(tempDirectory).toBeTruthy()
    expect(readFileSync(join(tempDirectory!, '.npmrc'), 'utf8')).toContain('auto-install-peers=false')
    lifecycle.cancel(operation.id)

    expect(await finished(operation)).toMatchObject({ phase: 'cancelled', cancelable: false, message: '操作已取消' })
    expect(readDependencies(dir)).toEqual({})
  })

  it('prefetches a second skin while another download is still running, then writes the profile serially', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skinA = firstInstallable(probe)
    const skinB = anotherInstallable(probe, skinA.id)
    const prefetchStarted: string[] = []
    const releasePrefetch = new Map<string, () => void>()
    const liveAddOrder: string[] = []
    let releaseFirstLiveAdd: (() => void) | undefined
    let firstLiveAddStarted!: () => void
    const firstLiveAdd = new Promise<void>(resolve => { firstLiveAddStarted = resolve })
    const materialize = (targetDir: string, skin: typeof skinA) => {
      const manifestPath = join(targetDir, 'package.json')
      const existing = existsSync(manifestPath)
        ? JSON.parse(readFileSync(manifestPath, 'utf8')) as { dependencies?: Record<string, string> }
        : targetDir === dir ? {} : { private: true }
      atomicWriteJson(manifestPath, { ...existing, dependencies: { ...existing.dependencies, [skin.package]: skin.install.target } })
      writeBundlePackage(targetDir, skin)
    }
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'add' && args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        const skin = args.includes(skinA.install.target) ? skinA : skinB
        prefetchStarted.push(skin.id)
        materialize(temporary, skin)
        await new Promise<void>(resolve => releasePrefetch.set(skin.id, resolve))
        return success()
      }
      if (args[0] === 'add') {
        const skin = args.includes(skinA.install.target) ? skinA : skinB
        liveAddOrder.push(skin.id)
        materialize(dir, skin)
        if (liveAddOrder.length === 1) {
          firstLiveAddStarted()
          await new Promise<void>(resolve => { releaseFirstLiveAdd = resolve })
        }
        return success()
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skinA, skinB])
    const opA = lifecycle.begin('install', skinA.id)
    const opB = lifecycle.begin('install', skinB.id)
    expect(lifecycle.currentOperations().map(operation => operation.skinId).sort()).toEqual([skinA.id, skinB.id].sort())
    expect(() => lifecycle.begin('install', skinA.id)).toThrow('already running')

    for (let index = 0; index < 100 && prefetchStarted.length < 2; index++) await new Promise(resolve => setTimeout(resolve, 5))
    expect(prefetchStarted.sort()).toEqual([skinA.id, skinB.id].sort())
    expect(opA.phase).toBe('downloading')
    expect(opB.phase).toBe('downloading')

    releasePrefetch.get(skinA.id)!()
    releasePrefetch.get(skinB.id)!()
    await firstLiveAdd
    expect(liveAddOrder).toHaveLength(1)
    expect(lifecycle.currentOperations()).toHaveLength(2)
    releaseFirstLiveAdd!()

    expect(await finished(opA)).toMatchObject({ phase: 'done' })
    expect(await finished(opB)).toMatchObject({ phase: 'done' })
    expect(liveAddOrder).toHaveLength(2)
    expect(new Set(liveAddOrder)).toEqual(new Set([skinA.id, skinB.id]))
  })

  it('lets activation proceed while another skin is still downloading', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const installed = firstInstallable(probe)
    const downloading = anotherInstallable(probe, installed.id)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [installed.package]: installed.install.target } })
    writeBundlePackage(dir, installed)
    writeMarketState(dir, { version: 1, activeSkinId: null, disabledSkinIds: [installed.id], pinnedSkinIds: [] })
    let releasePrefetch!: () => void
    const prefetchHeld = new Promise<void>(resolve => { releasePrefetch = resolve })
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        atomicWriteJson(join(temporary, 'package.json'), { private: true, dependencies: { [downloading.package]: downloading.install.target } })
        writeBundlePackage(temporary, downloading)
        await prefetchHeld
        return success()
      }
      if (args[0] === 'add') {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: {
          [installed.package]: installed.install.target,
          [downloading.package]: downloading.install.target,
        } })
        writeBundlePackage(dir, downloading)
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [installed, downloading])
    const download = lifecycle.begin('install', downloading.id)
    for (let index = 0; index < 100 && download.phase !== 'downloading'; index++) await new Promise(resolve => setTimeout(resolve, 5))
    expect(download.phase).toBe('downloading')

    const activate = lifecycle.begin('activate', installed.id)
    expect(await finished(activate)).toMatchObject({ phase: 'done' })
    expect(download.phase).toBe('downloading')
    expect(readMarketState(dir).activeSkinId).toBe(installed.id)

    releasePrefetch()
    expect(await finished(download)).toMatchObject({ phase: 'done' })
  })

  it('can replace its installable catalog without restarting the market plugin', async () => {
    const dir = fixture()
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const added = { ...lifecycle.catalog[0], id: 'remote.new-skin', package: 'remote-new-skin', rowId: 'remote-new-skin' }

    await lifecycle.replaceCatalog([...lifecycle.catalog, added])

    expect(lifecycle.skin(added.id)).toEqual(added)
    expect(lifecycle.states().some(state => state.skinId === added.id)).toBe(true)
  })

  it('keeps every loader inserted by a bundle in lockstep with its owning skin', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = { ...base, id: 'bundle-owner.skin', package: '@example/bundle-owner', rowId: 'bundle-owner' }
    const rows = [
      { id: 'shared-sidebar', name: 'shared-sidebar' },
      { id: 'editor-settings', name: 'editor-settings' },
      { id: skin.rowId, name: skin.package },
    ]
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundleRows(dir, skin, rows)
    writeMarketState(dir, {
      version: 1,
      activeSkinId: null,
      disabledSkinIds: [skin.id],
      pinnedSkinIds: [],
      managedLoaders: Object.fromEntries(rows.slice(0, -1).map(row => [row.id, { ...row, packageName: skin.package, ownerSkinIds: [skin.id] }])),
    })
    const updates: string[] = []
    const entries: LoaderEntry[] = rows.map(row => {
      const entry: LoaderEntry = {
        options: { id: row.id, name: row.name },
        fiber: {},
        update: async value => {
          entry.options.disabled = value.disabled
          updates.push(`${row.id}:${String(value.disabled)}`)
        },
      }
      return entry
    })
    const lifecycle = new SkinLifecycle({ loader: { entries: () => entries } }, { profile: 'test', profileDir: dir, runner: async () => success() }, [skin])

    await lifecycle.replay()

    let operations = parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<{ id?: string; disabled?: boolean }>
    expect(operations).toEqual([])
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).not.toContain(skin.package)
    expect(updates).toEqual(expect.arrayContaining(rows.map(row => `${row.id}:true`)))

    updates.length = 0
    writeMarketState(dir, { ...readMarketState(dir), activeSkinId: skin.id, disabledSkinIds: [] })
    await lifecycle.replay()

    operations = parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<{ id?: string; disabled?: boolean }>
    expect(operations).toEqual([])
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).toContain(skin.package)
    expect(updates).toEqual(expect.arrayContaining(rows.map(row => `${row.id}:null`)))
  })

  it('does not adopt bundle child loaders from a legacy install without a receipt', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = { ...base, id: 'legacy-bundle.skin', package: '@example/legacy-bundle', rowId: 'legacy-bundle' }
    const child = { id: 'user-editor', name: 'user-editor' }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundleRows(dir, skin, [child, { id: skin.rowId, name: skin.package }])
    writeMarketState(dir, { version: 1, activeSkinId: null, disabledSkinIds: [skin.id], pinnedSkinIds: [] })
    const updates: string[] = []
    const childEntry: LoaderEntry = {
      options: child,
      fiber: {},
      update: async value => { updates.push(String(value.disabled)) },
    }
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'remove') atomicWriteJson(join(dir, 'package.json'), { dependencies: {} })
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [childEntry] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    await lifecycle.replay()

    const operations = existsSync(profilePatchFile(dir)) ? parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<{ id?: string }> : []
    expect(operations.some(operation => operation.id === child.id)).toBe(false)
    expect(updates).toEqual([])
    expect(readMarketState(dir).managedLoaders).toBeUndefined()

    expect((await finished(lifecycle.begin('uninstall', skin.id))).phase).toBe('done')
    expect(updates).toEqual(['true'])
    expect(readMarketState(dir).managedLoaders).toBeUndefined()
  })

  it('preserves a user-authored override even for a loader recorded by the market', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = { ...base, id: 'override-owner.skin', package: '@example/override-owner', rowId: 'override-owner' }
    const child = { id: 'editor-settings', name: 'editor-settings' }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundleRows(dir, skin, [child, { id: skin.rowId, name: skin.package }])
    atomicWriteText(profilePatchFile(dir), `- id: ${child.id}\n  disabled: false\n  config:\n    theme: user-choice\n`)
    writeMarketState(dir, {
      version: 1,
      activeSkinId: null,
      disabledSkinIds: [skin.id],
      pinnedSkinIds: [],
      managedLoaders: { [child.id]: { ...child, packageName: skin.package, ownerSkinIds: [skin.id] } },
    })
    const updates: string[] = []
    const childEntry: LoaderEntry = {
      options: child,
      fiber: {},
      update: async value => { updates.push(String(value.disabled)) },
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [childEntry] } }, { profile: 'test', profileDir: dir, runner: async () => success() }, [skin])

    await lifecycle.replay()

    expect(readFileSync(profilePatchFile(dir), 'utf8')).toContain('theme: user-choice')
    expect(readFileSync(profilePatchFile(dir), 'utf8')).toContain('disabled: false')
    expect(updates).toEqual([])
  })

  it('records only non-primary loaders introduced by a fresh market install', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = { ...base, id: 'receipt-owner.skin', package: '@example/receipt-owner', rowId: 'receipt-owner' }
    const child = { id: 'receipt-editor', name: 'receipt-editor' }
    const rows = [child, { id: skin.rowId, name: skin.package }]
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'add' && args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        atomicWriteJson(join(temporary, 'package.json'), { private: true, dependencies: { [skin.package]: skin.install.target } })
        writeBundleRows(temporary, skin, rows)
        return success()
      }
      if (args[0] === 'add') {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
        writeBundleRows(dir, skin, rows)
      }
      if (args[0] === 'remove') atomicWriteJson(join(dir, 'package.json'), { dependencies: {} })
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation.phase).toBe('done')
    expect(readMarketState(dir).managedLoaders).toEqual({
      [child.id]: { ...child, packageName: skin.package, ownerSkinIds: [skin.id] },
    })
    const operations = parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<{ id?: string; disabled?: boolean }>
    expect(operations).toEqual([])
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).not.toContain(skin.package)

    expect((await finished(lifecycle.begin('uninstall', skin.id))).phase).toBe('done')
    expect(readMarketState(dir).managedLoaders).toBeUndefined()
    expect((parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<{ id?: string }>).some(row => row.id === child.id)).toBe(false)
  })

  it('does not gate web installs on the catalog installation review', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog[0]
    const compatibleManual = { ...base, id: 'manual.skin', review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'manual-only' as const } }
    const unverifiedInstallable = { ...base, id: 'installable.skin', review: { compatibility: 'unverified' as const, preview: 'verified' as const, installation: 'verified' as const } }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() }, [compatibleManual, unverifiedInstallable])

    const manual = lifecycle.begin('install', compatibleManual.id)
    expect(manual.kind).toBe('install')
    await finished(manual)
    const installed = lifecycle.begin('install', unverifiedInstallable.id)
    expect(installed.kind).toBe('install')
    await finished(installed)
  })

  it('uses Desktop installPlugin for managed npm skins and blocks manual-only skins', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog[0]
    const managed = {
      ...base,
      id: 'desktop.managed',
      install: {
        ...base.install,
        desktop: { mode: 'managed' as const, registry: 'npm' as const, packageName: base.package, packageVersion: base.install.version },
      },
    }
    const manual = {
      ...base,
      id: 'desktop.manual',
      install: { ...base.install, desktop: { mode: 'manual-only' as const, reason: 'npm-package-not-found' } },
    }
    const calls: { run: readonly string[][]; install: PluginInstallRequest[] } = { run: [], install: [] }
    const runner: PluginRunner = Object.assign(
      async (_profile: string, args: readonly string[]) => { calls.run.push(args); return success() },
      {
        installPlugin: async (_profile: string, request: PluginInstallRequest) => {
          calls.install.push(request)
          atomicWriteJson(join(dir, 'package.json'), { dependencies: { [managed.package]: `${managed.package}@${managed.install.version}` } })
          writeBundlePackage(dir, managed)
          return success()
        },
      },
    )
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner, hostKind: 'desktop' }, [managed, manual])

    expect(() => lifecycle.begin('install', manual.id)).toThrow('Desktop 当前不支持该皮肤的一键安装')
    const operation = await finished(lifecycle.begin('install', managed.id))

    expect(operation).toMatchObject({ phase: 'done', message: 'installed; choose Use to activate' })
    expect(calls.run).toEqual([])
    expect(calls.install).toHaveLength(1)
    expect(calls.install[0]).toMatchObject({ packageName: managed.package, packageVersion: managed.install.version })
    expect(readDependencies(dir)[managed.package]).toContain(managed.install.version)
  })

  it('repairs a dependency recorded without a materialized package manifest', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    let repairCalls = 0
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'install') {
        repairCalls += 1
        writeBundlePackage(dir, skin)
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation).toMatchObject({ phase: 'done', message: 'skin was already installed; market state reconciled' })
    expect(repairCalls).toBe(1)
    expect(lifecycle.states().find(item => item.skinId === skin.id)?.installation).toBe('installed')
  })

  it('repairs a stale compatibility lockfile before installing another skin', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundlePackage(dir, skin)
    const patchFile = compatibilityPatchFile(dir, '@example/stale-skin', '1.0.0')
    atomicWriteText(patchFile, 'stale patch\n')
    ensurePatchedDependency(dir, '@example/stale-skin', '1.0.0', '.dsh-skin-market/patches/' + basename(patchFile))
    const calls: Array<readonly string[]> = []
    const runner: PluginRunner = async (_profile, args) => {
      calls.push(args)
      if (args[0] === 'install') syncPatchLockfile(dir)
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation.phase).toBe('done')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('--no-frozen-lockfile')
    expect(patchedDependenciesNeedSync(dir)).toBe(false)
  })

  it('recovers a Desktop managed install by retrying the existing installPlugin request', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog[0]
    const managed = {
      ...base,
      id: 'desktop.recovery',
      install: {
        ...base.install,
        desktop: { mode: 'managed' as const, registry: 'npm' as const, packageName: base.package, packageVersion: base.install.version },
      },
    }
    const calls: PluginInstallRequest[] = []
    const runner: PluginRunner = Object.assign(
      async () => success(),
      {
        installPlugin: async (_profile: string, request: PluginInstallRequest) => {
          calls.push(request)
          return calls.length === 1
            ? { ...success(), exitCode: 1, stderr: 'published within the minimumReleaseAge cutoff' }
            : success()
        },
      },
    )
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner, hostKind: 'desktop' }, [managed])

    const operation = await finished(lifecycle.begin('install', managed.id))

    expect(operation.phase).toBe('failed')
    expect(calls).toHaveLength(2)
    expect(calls[0]?.pnpmOptions).not.toContain('--config.minimumReleaseAge=0')
    expect(calls[1]?.pnpmOptions).toContain('--config.minimumReleaseAge=0')
    expect(calls[0]?.receiptId).toBe(calls[1]?.receiptId)
  })

  it('aborts and awaits a Desktop install when the lifecycle is disposed', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog[0]
    const managed = {
      ...base,
      id: 'desktop.dispose',
      install: {
        ...base.install,
        desktop: { mode: 'managed' as const, registry: 'npm' as const, packageName: base.package, packageVersion: base.install.version },
      },
    }
    let started = false
    let aborted = false
    const runner: PluginRunner = Object.assign(
      async () => success(),
      {
        installPlugin: async (_profile: string, _request: PluginInstallRequest, options?: CommandOptions) => {
          started = true
          return await new Promise<CommandResult>(resolve => {
            options?.signal?.addEventListener('abort', () => {
              aborted = true
              resolve({ ...success(), exitCode: null, aborted: true })
            }, { once: true })
          })
        },
      },
    )
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner, hostKind: 'desktop' }, [managed])
    const operation = lifecycle.begin('install', managed.id)
    for (let index = 0; index < 200 && !started; index += 1) await new Promise(resolve => setTimeout(resolve, 5))

    await lifecycle.dispose()

    expect(started).toBe(true)
    expect(aborted).toBe(true)
    expect(operation.phase).toBe('cancelled')
    expect(lifecycle.currentOperations()).toHaveLength(0)
  })

  it('auto-retries a new-package lockfile failure before mutating the live profile', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog.find(item => item.id === 'wyh66666666.dsh-transparent-ui-plugin')!
    const attempts: Array<readonly string[]> = []
    const runner: PluginRunner = async (_profile, args) => {
      attempts.push(args)
      if (args.includes('--dir')) {
        if (!args.includes('--config.minimumReleaseAge=0')) return { ...success(), exitCode: 1, stderr: 'published within the minimumReleaseAge cutoff' }
        materializeReviewedSkin(args[args.indexOf('--dir') + 1]!, base, false)
        return success()
      }
      if (args[0] === 'add') {
        materializeReviewedSkin(dir, base, false)
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [base])

    const operation = await finished(lifecycle.begin('install', base.id))

    expect(operation.phase).toBe('done')
    expect(attempts[0]).not.toContain('--config.minimumReleaseAge=0')
    expect(attempts[1]).toContain('--config.minimumReleaseAge=0')
    expect(attempts.find(args => args[0] === 'add' && !args.includes('--dir'))).not.toContain('--config.minimumReleaseAge=0')
  })

  it('pre-approves the exact pnpm build key for a monorepo package', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog.find(item => item.id === 'wyh66666666.dsh-transparent-ui-plugin')!
    const allowBuild = '@linxin666/dsh-web-ui-all@https://codeload.github.com/springbrand-lab/dsh-skin-universe/tar.gz/29fa777bdd8c9f7d93700c56c11a96a32634d967'
    const skin = {
      ...base,
      id: 'monorepo-build.skin',
      subpath: 'packages/dsh-web-ui-all',
      install: {
        ...base.install,
        target: 'github:springbrand-lab/dsh-skin-universe#29fa777bdd8c9f7d93700c56c11a96a32634d967&path:/packages/dsh-web-ui-all',
        commit: '29fa777bdd8c9f7d93700c56c11a96a32634d967',
        allowBuild,
      },
    }
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        expect(readFileSync(join(temporary, 'pnpm-workspace.yaml'), 'utf8')).toContain(`${allowBuild}#path:/packages/dsh-web-ui-all`)
        materializeReviewedSkin(temporary, skin, false)
      }
      if (args[0] === 'add' && !args.includes('--dir')) {
        materializeReviewedSkin(dir, skin, false)
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    expect((await finished(lifecycle.begin('install', skin.id))).phase).toBe('done')
    expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toContain(`${allowBuild}#path:/packages/dsh-web-ui-all`)
  })

  it('applies a generic compatibility adapter during live install', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog[0]
    const commit = '0123456789abcdef0123456789abcdef01234567'
    const skin = {
      ...base,
      id: 'generic-compatible.skin',
      package: '@example/generic-skin',
      rowId: 'generic-skin',
      repo: 'https://github.com/example/generic-skin',
      install: { ...base.install, target: 'github:example/generic-skin#' + commit, version: '1.0.0', commit },
      compatibility: {
        dsh: '^0.1.0-rc.5',
        platform: ['web'],
        adapters: [{ id: 'generic-keyed-slot', kind: 'keyed-slot-id-to-key' as const, when: '>=0.1.0-rc.6 <0.2.0-0', slot: 'settings.plugin.item', key: 'locale' }],
      },
    }
    let compatibilityInstallCalls = 0
    let compatibilityInstallArgs: readonly string[] = []
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        materializeReviewedSkin(args[args.indexOf('--dir') + 1]!, skin, false)
        return success()
      }
      if (args[0] === 'add') {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
        const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
        mkdirSync(join(packageDir, 'lib'), { recursive: true })
        atomicWriteJson(join(packageDir, 'package.json'), {
          name: skin.package,
          version: skin.install.version,
          exports: { './client': { default: './lib/client.js' } },
          dsh: { client: { platform: 'web' } },
        })
        atomicWriteText(join(packageDir, 'lib/client.js'), [
          'const NS = "settings.generic"',
          'ctx.slots.register({',
          '  name: "settings.plugin.item",',
          '  id: "generic",',
          '  locale: NS,',
          '}, Card)',
        ].join('\n'))
      }
      if (args[0] === 'install') {
        compatibilityInstallCalls += 1
        compatibilityInstallArgs = args
        syncPatchLockfile(dir)
      }
      return success()
    }
    const lifecycle = new SkinLifecycle(
      { loader: { entries: () => [] } },
      {
        profile: 'test',
        profileDir: dir,
        runner,
        runtime: { version: '0.1.1-rc.1', capabilities: ['slot:keyed:settings.plugin.item'], source: 'injected' },
      },
      [skin],
    )

    expect((await finished(lifecycle.begin('install', skin.id))).phase).toBe('done')
    expect(compatibilityInstallCalls).toBe(1)
    expect(compatibilityInstallArgs).toContain('--no-frozen-lockfile')
    expect(patchedDependenciesNeedSync(dir)).toBe(false)
    expect(readFileSync(pnpmWorkspaceFile(dir), 'utf8')).toContain(skin.package + '@' + skin.install.version)
    expect(readFileSync(compatibilityPatchFile(dir, skin.package, skin.install.version), 'utf8')).toContain('+  key: "settings.generic",')
  })

  it('reports removal as non-cancelable installation work while the legacy runner is pending', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    materializeReviewedSkin(dir, skin)
    let started!: () => void
    const removeStarted = new Promise<void>(resolve => { started = resolve })
    let release!: () => void
    const removeResult = new Promise<void>(resolve => { release = resolve })
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'remove') {
        started()
        await removeResult
        atomicWriteJson(join(dir, 'package.json'), { dependencies: {} })
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])
    const operation = lifecycle.begin('uninstall', skin.id)
    await removeStarted

    expect(operation).toMatchObject({ phase: 'installing', cancelable: false, step: '移除插件依赖' })
    expect(() => lifecycle.cancel(operation.id)).toThrow('当前阶段无法安全取消')
    release()

    expect(await finished(operation)).toMatchObject({ phase: 'done', cancelable: false })
    expect(readDependencies(dir)).toEqual({})
  })

  it('syncs and removes compatibility patch metadata as one uninstall transaction', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundlePackage(dir, skin)
    const patchFile = compatibilityPatchFile(dir, skin.package, skin.install.version)
    atomicWriteText(patchFile, 'compatibility patch\n')
    ensurePatchedDependency(dir, skin.package, skin.install.version, '.dsh-skin-market/patches/' + basename(patchFile))
    syncPatchLockfile(dir)
    const installArgs: Array<readonly string[]> = []
    const runner: PluginRunner = async (_profile, args) => {
      installArgs.push(args)
      if (args[0] === 'remove') {
        if (readFileSync(pnpmWorkspaceFile(dir), 'utf8').includes(skin.package + '@' + skin.install.version)) {
          return { ...success(), exitCode: 1, stderr: 'ERR_PNPM_UNUSED_PATCH' }
        }
        atomicWriteJson(join(dir, 'package.json'), { dependencies: {} })
      }
      if (args[0] === 'install') syncPatchLockfile(dir)
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('uninstall', skin.id))

    expect(operation.phase).toBe('done')
    expect(readDependencies(dir)).toEqual({})
    expect(readFileSync(pnpmWorkspaceFile(dir), 'utf8')).not.toContain(skin.package + '@' + skin.install.version)
    expect(readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')).not.toContain('patchedDependencies')
    expect(() => readFileSync(patchFile, 'utf8')).toThrow()
    expect(patchedDependenciesNeedSync(dir)).toBe(false)
    expect(installArgs.filter(args => args[0] === 'install')).toHaveLength(0)
  })

  it('detaches old compatibility patches before updating a package', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog[0]
    const skin = {
      ...base,
      id: 'update-patch.skin',
      package: '@example/update-skin',
      rowId: 'update-skin',
      install: { ...base.install, target: 'github:example/update-skin#newcommit', version: '2.0.0', commit: 'newcommit' },
    }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: 'github:example/update-skin#oldcommit' } })
    const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
    mkdirSync(packageDir, { recursive: true })
    atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: '1.0.0', dsh: { client: { platform: 'web' } } })
    const oldPatch = compatibilityPatchFile(dir, skin.package, '1.0.0')
    atomicWriteText(oldPatch, 'old compatibility patch\n')
    ensurePatchedDependency(dir, skin.package, '1.0.0', '.dsh-skin-market/patches/' + basename(oldPatch))
    syncPatchLockfile(dir)
    const installArgs: Array<readonly string[]> = []
    const runner: PluginRunner = async (_profile, args) => {
      installArgs.push(args)
      if (args[0] === 'install') syncPatchLockfile(dir)
      if (args.includes('--dir')) {
        materializeReviewedSkin(args[args.indexOf('--dir') + 1]!, { ...skin, install: { ...skin.install, target: skin.install.target } }, false)
        return success()
      }
      if (args[0] === 'add' && !args.includes('--dir')) {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
        atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { client: { platform: 'web' } } })
      }
      return success()
    }
    const runtimeEntry: LoaderEntry = {
      options: { id: skin.rowId, name: skin.package },
      fiber: {},
      update: async value => { runtimeEntry.options.disabled = value.disabled },
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [runtimeEntry] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('update', skin.id))

    expect(operation.phase).toBe('done')
    expect(readDependencies(dir)[skin.package]).toBe(skin.install.target)
    expect(() => readFileSync(oldPatch, 'utf8')).toThrow()
    expect(readFileSync(pnpmWorkspaceFile(dir), 'utf8')).not.toContain('@example/update-skin@1.0.0')
    expect(readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')).not.toContain('@example/update-skin@1.0.0')
    expect(patchedDependenciesNeedSync(dir)).toBe(false)
    expect(installArgs.some(args => args[0] === 'install')).toBe(false)
  })

  it('installs the curated npm source before the GitHub fallback and saves it exactly', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const integrity = 'sha512-abc'
    const skin = {
      ...base,
      id: 'npm-priority.skin',
      install: { ...base.install, npm: { name: base.package, version: base.install.version, integrity, repository: base.repo, gitHead: base.install.commit } },
    }
    const calls: string[][] = []
    const runner: PluginRunner = async (_profile, args) => {
      calls.push([...args])
      if (args[0] === 'add') {
        const targetDir = args.includes('--dir') ? args[args.indexOf('--dir') + 1]! : dir
        atomicWriteJson(join(targetDir, 'package.json'), { dependencies: { [skin.package]: skin.install.version } })
        const packageDir = join(targetDir, 'node_modules', ...skin.package.split('/'))
        mkdirSync(packageDir, { recursive: true })
        atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, repository: { type: 'git', url: `git+${skin.repo}.git` }, dsh: { client: { platform: 'web' } } })
        atomicWriteText(join(targetDir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\npackages:\n  '${skin.package}@${skin.install.version}':\n    resolution:\n      integrity: ${integrity}\n`)
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    expect((await finished(lifecycle.begin('install', skin.id))).phase).toBe('done')
    expect(calls.find(args => args[0] === 'add' && args.includes('--dir'))).toContain(`${skin.package}@${skin.install.version}`)
    expect(calls.find(args => args[0] === 'add' && !args.includes('--dir'))).toEqual(['add', `${skin.package}@${skin.install.version}`, '--prefer-offline', '--save-exact', '--reporter=ndjson'])
  })

  it('uses the host registry fallback for npm skin prefetch and live installation', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const integrity = 'sha512-abc'
    const skin = {
      ...base,
      id: 'npm-registry-fallback.skin',
      install: { ...base.install, npm: { name: base.package, version: base.install.version, integrity, repository: base.repo, gitHead: base.install.commit } },
    }
    const calls: string[][] = []
    const primary = 'https://primary.example/npm'
    const fallback = 'https://fallback.example/npm'
    let failedPrimaryPrefetch = false
    const materialize = (targetDir: string): void => {
      atomicWriteJson(join(targetDir, 'package.json'), { dependencies: { [skin.package]: skin.install.version } })
      const packageDir = join(targetDir, 'node_modules', ...skin.package.split('/'))
      mkdirSync(packageDir, { recursive: true })
      atomicWriteJson(join(packageDir, 'package.json'), {
        name: skin.package,
        version: skin.install.version,
        repository: { type: 'git', url: `git+${skin.repo}.git` },
        exports: { './client': './client.js' },
        dsh: { client: { platform: 'web' } },
      })
      atomicWriteText(join(packageDir, 'client.js'), 'export const fixture = true\n')
      atomicWriteText(join(targetDir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\npackages:\n  '${skin.package}@${skin.install.version}':\n    resolution:\n      integrity: ${integrity}\n`)
    }
    const runner: PluginRunner = Object.assign(
      async (_profile: string, args: readonly string[]) => {
        calls.push([...args])
        if (args[0] === 'add' && args.includes('--dir')) {
          const targetDir = args[args.indexOf('--dir') + 1]!
          if (args.includes(`--registry=${primary}`) && !failedPrimaryPrefetch) {
            failedPrimaryPrefetch = true
            return { ...success(), exitCode: 1, stderr: 'TypeError: fetch failed' }
          }
          materialize(targetDir)
        } else if (args[0] === 'add') {
          materialize(dir)
        }
        return success()
      },
      { registryPlan: async () => [primary, fallback] },
    )
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    expect((await finished(lifecycle.begin('install', skin.id))).phase).toBe('done')
    expect(calls.filter(args => args[0] === 'add').map(args => args.find(arg => arg.startsWith('--registry=')))).toEqual([
      `--registry=${primary}`,
      `--registry=${fallback}`,
      `--registry=${primary}`,
    ])
  })

  it('requires explicit approval for an unknown exact build key and retries with that key', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog.find(item => item.id === 'wyh66666666.dsh-transparent-ui-plugin')!
    const buildKey = '@example/skin@https://codeload.github.com/example/skin/tar.gz/0123456789abcdef0123456789abcdef01234567'
    const skin = { ...base, id: 'build-approval.skin', install: { ...base.install, target: 'github:example/skin#0123456789abcdef0123456789abcdef01234567', commit: '0123456789abcdef0123456789abcdef01234567', allowBuild: undefined } }
    let rejected = false
    const prefetchApprovals: string[] = []
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        const workspaceFile = join(temporary, 'pnpm-workspace.yaml')
        if (!existsSync(workspaceFile) || !readFileSync(workspaceFile, 'utf8').includes(buildKey)) {
          rejected = true
          return { ...success(), exitCode: 1, stderr: `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED\n${buildKey} needs to execute build scripts but is not in allowBuilds` }
        }
        prefetchApprovals.push(readFileSync(workspaceFile, 'utf8'))
        materializeReviewedSkin(temporary, skin, false)
        return success()
      }
      if (args[0] === 'add' && !rejected) {
        rejected = true
        return { ...success(), exitCode: 1, stderr: `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED\n${buildKey} needs to execute build scripts but is not in allowBuilds` }
      }
      if (args[0] === 'add') {
        materializeReviewedSkin(dir, skin, false)
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const failedOperation = await finished(lifecycle.begin('install', skin.id))
    expect(failedOperation).toMatchObject({ phase: 'failed', failure: { kind: 'build-approval', action: 'approve-build', packageName: '@example/skin' } })

    const retried = await finished(lifecycle.retry(failedOperation.id, 'approve-build'))

    expect(retried.phase).toBe('done')
    expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toContain(buildKey)
    expect(prefetchApprovals).toHaveLength(1)
  })

  it('seeds a reviewed exact build key into the temporary prefetch workspace', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const buildKey = '@example/reviewed-skin@https://codeload.github.com/example/reviewed-skin/tar.gz/0123456789abcdef0123456789abcdef01234567'
    const skin = {
      ...base,
      id: 'reviewed-build.skin',
      package: '@example/reviewed-skin',
      rowId: 'reviewed-skin',
      subpath: undefined,
      install: {
        ...base.install,
        target: 'github:example/reviewed-skin#0123456789abcdef0123456789abcdef01234567',
        version: '1.0.0',
        commit: '0123456789abcdef0123456789abcdef01234567',
        allowBuild: buildKey,
      },
    }
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        expect(readFileSync(join(temporary, 'pnpm-workspace.yaml'), 'utf8')).toContain(buildKey)
        materializeReviewedSkin(temporary, skin, false)
        return success()
      }
      if (args[0] === 'add') {
        materializeReviewedSkin(dir, skin, false)
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation.phase).toBe('done')
    expect(readFileSync(pnpmWorkspaceFile(dir), 'utf8')).toContain(buildKey)
  })

  it('approves transitive pnpm ignored builds and retries the install', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog.find(item => item.review?.installation !== 'manual-only')!
    const skin = { ...base, id: 'ignored-build.skin', install: { ...base.install, allowBuild: undefined } }
    let rejected = false
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        materializeReviewedSkin(args[args.indexOf('--dir') + 1]!, skin, false)
        return success()
      }
      if (args[0] === 'add' && !rejected) {
        rejected = true
        return { ...success(), exitCode: 1, stderr: 'ERR_PNPM_IGNORED_BUILDS\nIgnored build scripts: node-pty@1.1.0' }
      }
      if (args[0] === 'add') {
        materializeReviewedSkin(dir, skin, false)
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const failedOperation = await finished(lifecycle.begin('install', skin.id))
    expect(failedOperation).toMatchObject({ phase: 'failed', failure: { kind: 'build-approval', action: 'approve-build', packageName: 'node-pty' } })

    const retried = await finished(lifecycle.retry(failedOperation.id, 'approve-build'))

    expect(retried.phase).toBe('done')
    expect(parse(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8'))).toMatchObject({ allowBuilds: { 'node-pty': true } })
  })

  it('reconciles an already installed package instead of failing the install action', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundlePackage(dir, skin)
    let calls = 0
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => { calls += 1; return success() } })

    const operation = await finished(lifecycle.begin('install', skin.id))
    expect(operation).toMatchObject({ phase: 'done', message: 'skin was already installed; market state reconciled' })
    expect(calls).toBe(0)
    expect(lifecycle.states().find(state => state.skinId === skin.id)?.installation).toBe('installed')
  })

  it('adopts a manually bundled skin as active and can deactivate it without uninstalling', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    atomicWriteJson(join(dir, 'package.json'), {
      dependencies: { [skin.package]: skin.install.target },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', skin.package, 'dsh-skin-market'] } },
    })
    writeBundlePackage(dir, skin)
    const entry: LoaderEntry = {
      options: { id: skin.rowId, name: skin.package },
      fiber: {},
      update: async value => {
        entry.options.disabled = value.disabled
        entry.fiber = value.disabled ? undefined : {}
      },
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [entry] } }, { profile: 'test', profileDir: dir, runner: async () => success() })

    await lifecycle.replay()

    expect(readMarketState(dir).activeSkinId).toBe(skin.id)
    expect(lifecycle.states().find(state => state.skinId === skin.id)).toMatchObject({ installation: 'installed', activation: 'active' })
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh: { profile: { bundles: string[] } } }
    expect(manifest.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base', skin.package, 'dsh-skin-market'])

    expect((await finished(lifecycle.begin('deactivate', skin.id))).phase).toBe('done')
    expect(lifecycle.states().find(state => state.skinId === skin.id)).toMatchObject({ installation: 'installed', activation: 'inactive' })
    expect(readDependencies(dir)[skin.package]).toBeDefined()
  })

  it('installs inactive, activates exclusively, deactivates without removal, and uninstalls', async () => {
    const dir = fixture()
    let lifecycle!: SkinLifecycle
    const entries = new Map<string, LoaderEntry>()
    const updates: string[] = []
    const runner: PluginRunner = async (_profile, args) => {
      const skin = lifecycle.catalog.find(item => args.includes(item.install.target) || args.includes(item.package))
      if (args[0] === 'add' && skin !== undefined) {
        const targetDir = args.includes('--dir') ? args[args.indexOf('--dir') + 1]! : dir
        materializeReviewedSkin(targetDir, skin)
        if (!args.includes('--dir')) {
          entries.set(skin.rowId, { options: { id: skin.rowId, name: skin.package, disabled: true }, update: async function (value) { updates.push(`${skin.rowId}:${String(value.disabled)}`); this.options.disabled = value.disabled; this.fiber = value.disabled ? undefined : {} } })
        }
      }
      if (args[0] === 'remove' && skin !== undefined) {
        const next = { ...readDependencies(dir) }
        delete next[skin.package]
        atomicWriteJson(join(dir, 'package.json'), { dependencies: next })
        entries.delete(skin.rowId)
      }
      return success()
    }
    lifecycle = new SkinLifecycle({ loader: { entries: () => entries.values() } }, { profile: 'test', profileDir: dir, runner })
    const skin = firstInstallable(lifecycle)

    const install = await finished(lifecycle.begin('install', skin.id))
    expect(install.phase).toBe('done')
    expect(lifecycle.states().find(state => state.skinId === skin.id)).toMatchObject({ installation: 'installed', activation: 'inactive' })
    expect(readMarketState(dir).activity?.[skin.id]?.installedAt).toBe(install.startedAt)
    const activation = await finished(lifecycle.begin('activate', skin.id))
    expect(activation.phase).toBe('done')
    expect(readMarketState(dir).activeSkinId).toBe(skin.id)
    expect(readMarketState(dir).activity?.[skin.id]?.usedAt).toBe(activation.startedAt)
    expect(lifecycle.states().find(state => state.skinId === skin.id)?.activation).toBe('active')

    const second = anotherInstallable(lifecycle, skin.id)
    expect((await finished(lifecycle.begin('install', second.id))).phase).toBe('done')
    updates.length = 0
    expect((await finished(lifecycle.begin('activate', second.id))).phase).toBe('done')
    expect(updates).toEqual([
      `${skin.rowId}:true`,
      `${second.rowId}:null`,
    ])
    expect((await finished(lifecycle.begin('activate', skin.id))).phase).toBe('done')
    expect((await finished(lifecycle.begin('deactivate', skin.id))).phase).toBe('done')
    expect(readDependencies(dir)[skin.package]).toBeDefined()
    expect(readMarketState(dir).activeSkinId).toBeNull()
    await lifecycle.replay()
    expect(readMarketState(dir).activeSkinId).toBeNull()
    expect((await finished(lifecycle.begin('uninstall', skin.id))).phase).toBe('done')
    expect(readDependencies(dir)[skin.package]).toBeUndefined()
  })

  it('clears a previous Web restart receipt during startup replay even when the pid is reused', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    materializeReviewedSkin(dir, skin)
    writeMarketState(dir, { version: 1, activeSkinId: skin.id, disabledSkinIds: [], pinnedSkinIds: [], pendingRestart: { pid: process.pid, skinIds: [skin.id], id: 'stale-restart' } })
    const entry: LoaderEntry = { options: { id: skin.rowId, name: skin.package }, fiber: { state: 2 }, update: async () => undefined }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [entry] } }, { profile: 'test', profileDir: dir, runner: async () => success() }, [skin])

    lifecycle.start()
    await lifecycle.runtimeStates()

    expect(readMarketState(dir).pendingRestart).toBeUndefined()
    await lifecycle.dispose()
  })

  it('clears only the confirmed Web skin from a shared restart receipt', async () => {
    const dir = fixture()
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(lifecycle)
    const other = { ...skin, id: 'other.skin', package: 'other-skin', rowId: 'other-skin' }
    writeMarketState(dir, { version: 1, activeSkinId: skin.id, disabledSkinIds: [], pinnedSkinIds: [], pendingRestart: {
      pid: process.pid, skinIds: [skin.id, other.id], id: 'shared-restart', selectionChanges: [skin.id],
      selectionArtifacts: { [skin.id]: 'artifact' }, inferredInstalls: { [skin.id]: 'install' },
    } })

    await lifecycle.clearWebRestartReceipt(skin.id)

    expect(readMarketState(dir).pendingRestart).toEqual({ pid: process.pid, skinIds: [other.id], id: 'shared-restart' })
    await lifecycle.dispose()
  })

  it('keeps pinned skins enabled across switches and replay, then disables a secondary skin when unpinned', async () => {
    const dir = fixture()
    let lifecycle!: SkinLifecycle
    const entries = new Map<string, LoaderEntry>()
    const updates: string[] = []
    const runner: PluginRunner = async (_profile, args) => {
      const skin = lifecycle.catalog.find(item => args.includes(item.install.target) || args.includes(item.package))
      if (args[0] === 'add' && skin !== undefined) {
        const targetDir = args.includes('--dir') ? args[args.indexOf('--dir') + 1]! : dir
        materializeReviewedSkin(targetDir, skin)
        if (!args.includes('--dir')) {
          entries.set(skin.rowId, {
            options: { id: skin.rowId, name: skin.package, disabled: true },
            update: async function (value) {
              updates.push(`${skin.rowId}:${String(value.disabled)}`)
              this.options.disabled = value.disabled
              this.fiber = value.disabled ? undefined : {}
            },
          })
        }
      }
      return success()
    }
    lifecycle = new SkinLifecycle({ loader: { entries: () => entries.values() } }, { profile: 'test', profileDir: dir, runner })
    const first = firstInstallable(lifecycle)
    const second = anotherInstallable(lifecycle, first.id)

    await finished(lifecycle.begin('install', first.id))
    await finished(lifecycle.begin('activate', first.id))
    await finished(lifecycle.begin('pin', first.id))
    await finished(lifecycle.begin('install', second.id))
    updates.length = 0
    await finished(lifecycle.begin('activate', second.id))

    expect(updates).toEqual([`${second.rowId}:null`])
    expect(readMarketState(dir)).toMatchObject({ activeSkinId: second.id, pinnedSkinIds: [first.id] })
    expect(lifecycle.states().find(state => state.skinId === first.id)).toMatchObject({ activation: 'active', primary: false, pinned: true })
    expect(lifecycle.states().find(state => state.skinId === second.id)).toMatchObject({ activation: 'active', primary: true, pinned: false })

    updates.length = 0
    await lifecycle.replay()
    expect(updates).toEqual([])
    await finished(lifecycle.begin('unpin', first.id))
    expect(updates).toEqual([`${first.rowId}:true`])
    expect(readMarketState(dir).pinnedSkinIds).toEqual([])
    expect(lifecycle.states().find(state => state.skinId === first.id)?.activation).toBe('inactive')
    expect(lifecycle.states().find(state => state.skinId === second.id)?.activation).toBe('active')
  })

  it('keeps the current skin enabled when its pin is removed', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundlePackage(dir, skin)
    const entry: LoaderEntry = {
      options: { id: skin.rowId, name: skin.package },
      fiber: {},
      update: async value => { entry.options.disabled = value.disabled },
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [entry] } }, { profile: 'test', profileDir: dir, runner: async () => success() })

    await finished(lifecycle.begin('activate', skin.id))
    await finished(lifecycle.begin('pin', skin.id))
    await finished(lifecycle.begin('unpin', skin.id))

    expect(readMarketState(dir)).toMatchObject({ activeSkinId: skin.id, pinnedSkinIds: [] })
    expect(lifecycle.states().find(state => state.skinId === skin.id)).toMatchObject({ activation: 'active', primary: true, pinned: false })
    expect(entry.options.disabled).not.toBe(true)
  })

  it('hot-toggles both sides of a Web selection while retaining a browser-local verification receipt', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const first = firstInstallable(probe)
    const second = anotherInstallable(probe, first.id)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [first.package]: first.install.target, [second.package]: second.install.target } })
    for (const skin of [first, second]) {
      writeBundlePackage(dir, skin)
      atomicWriteJson(join(dir, 'node_modules', ...skin.package.split('/'), 'package.json'), {
        name: skin.package,
        version: skin.install.version,
        exports: { './client': './client.js' },
        dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
      })
    }
    const updates: string[] = []
    const entries = [first, second].map(skin => {
      const entry: LoaderEntry = {
        options: { id: skin.rowId, name: skin.package, disabled: true },
        update: async value => {
          updates.push(`${skin.rowId}:${String(value.disabled)}`)
          entry.options.disabled = value.disabled
          entry.fiber = value.disabled ? undefined : { state: 2 }
        },
      }
      return entry
    })
    const lifecycle = new SkinLifecycle({ loader: { entries: () => entries } }, { profile: 'test', profileDir: dir, runner: async () => success() })

    expect((await finished(lifecycle.begin('activate', first.id))).phase).toBe('done')
    expect(updates).toEqual([`${first.rowId}:null`])
    expect(lifecycle.states().find(state => state.skinId === first.id)).toMatchObject({ activation: 'restart-required', restartSource: 'selection', selectionHostApplied: true })

    expect((await finished(lifecycle.begin('activate', second.id))).phase).toBe('done')
    expect(updates).toEqual([`${first.rowId}:null`, `${first.rowId}:true`, `${second.rowId}:null`])
    expect(readMarketState(dir).activeSkinId).toBe(second.id)
    expect(readMarketState(dir).pendingRestart?.selectionChanges).toEqual([first.id, second.id])
    for (const skin of [first, second]) expect(lifecycle.states().find(state => state.skinId === skin.id))
      .toMatchObject({ activation: 'restart-required', restartSource: 'selection', selectionHostApplied: true })
  })

  it('marks a deactivated Web skin as stop-only even when an install receipt is already pending', async () => {
    const { dir, skins: [one], lifecycle } = webSelectionFixture()
    writeMarketState(dir, { ...readMarketState(dir), pendingRestart: {
      pid: process.pid, skinIds: [one.id], id: 'hard-before-disable',
      inferredInstalls: { [one.id]: 'a'.repeat(64) },
    } })
    expect(await finished(lifecycle.begin('deactivate', one.id))).toMatchObject({ phase: 'done' })
    const pending = readMarketState(dir).pendingRestart
    expect(pending?.skinIds).toContain(one.id)
    expect(pending?.stoppedSkinIds).toContain(one.id)
    expect(pending?.inferredInstalls?.[one.id]).toHaveLength(64)
    expect(lifecycle.states().find(state => state.skinId === one.id)).toMatchObject({
      activation: 'restart-required', restartOnlyToStop: true,
    })
    expect(await finished(lifecycle.begin('activate', one.id))).toMatchObject({ phase: 'done' })
    expect(readMarketState(dir).pendingRestart?.stoppedSkinIds ?? []).not.toContain(one.id)
  })

  it('resolves a managed host-only row with a built-in module name through its owner package', async () => {
    const { dir, skins: [one], lifecycle } = webSelectionFixture()
    writeMarketState(dir, { ...readMarketState(dir), managedLoaders: {
      'preset-fairy': { id: 'preset-fairy', name: '@deepseek-ai/dsh-agent-preset', packageName: one.package, ownerSkinIds: [one.id] },
    } })
    const state = lifecycle.states().find(state => state.skinId === one.id)!
    expect(state.selectionClientTargets).toContainEqual({ package: one.package, active: true })
  })

  it('keeps pinned Web skins live and does not invent a receipt when removing the current primary pin', async () => {
    const { dir, skins: [one, two, pinned], entries, lifecycle, updates } = webSelectionFixture()
    await finished(lifecycle.begin('pin', pinned.id))
    updates.length = 0
    await finished(lifecycle.begin('activate', two.id))
    expect(updates).toEqual([`${one.rowId}:true`, `${two.rowId}:null`])
    expect(entries.get(pinned.rowId)?.options.disabled).not.toBe(true)
    expect(lifecycle.states().find(state => state.skinId === two.id)).toMatchObject({ restartSource: 'selection', selectionHostApplied: true })
    // A pin changes metadata only when the same skin remains primary.
    writeMarketState(dir, { ...readMarketState(dir), pendingRestart: undefined, pinnedSkinIds: [two.id, pinned.id] })
    updates.length = 0
    await finished(lifecycle.begin('unpin', two.id))
    expect(readMarketState(dir).pendingRestart).toBeUndefined()
    expect(updates).toEqual([])
    expect(entries.get(two.rowId)?.fiber).toEqual({ state: 2 })
  })

  it('keeps selected secondary skins enabled without making them pins', async () => {
    const { dir, skins: [one, two, pinned], entries, lifecycle, updates } = webSelectionFixture()
    updates.length = 0

    const approvals = Object.fromEntries([one, pinned].map(skin => [skin.id, { compatibilityContext: compatibilityContext(skin, null) }]))
    const preserved = [one.id, pinned.id]
    const plan = await lifecycle.selectionPlan('activate', two.id, preserved)
    const operation = lifecycle.begin('activate', two.id, undefined, false, undefined, undefined, undefined, undefined, undefined, undefined, preserved, approvals, plan.selectionContext)
    expect(await finished(operation)).toMatchObject({ phase: 'done', preservedSkinIds: [one.id, pinned.id] })
    expect(readMarketState(dir)).toMatchObject({ activeSkinId: two.id, pinnedSkinIds: [], disabledSkinIds: [] })
    expect(entries.get(one.rowId)?.options.disabled).not.toBe(true)
    expect(entries.get(two.rowId)?.options.disabled).not.toBe(true)
    expect(entries.get(pinned.rowId)?.options.disabled).not.toBe(true)
    expect(lifecycle.states().find(state => state.skinId === one.id)).toMatchObject({ activation: 'active', primary: false, pinned: false })
    expect(lifecycle.states().find(state => state.skinId === pinned.id)).toMatchObject({ primary: false, pinned: false })
    expect(lifecycle.states().find(state => state.skinId === pinned.id)?.activation).not.toBe('inactive')
    expect(updates).toEqual([`${two.rowId}:null`, `${pinned.rowId}:null`])
    await finished(lifecycle.begin('activate', one.id))
    expect(readMarketState(dir).disabledSkinIds).toEqual(expect.arrayContaining([two.id, pinned.id]))
  })

  it('closes a pinned skin by cancelling its persistent pin', async () => {
    const { dir, skins: [one, two, pinned], entries, lifecycle } = webSelectionFixture()
    writeMarketState(dir, { ...readMarketState(dir), pinnedSkinIds: [pinned.id] })
    const preserved: string[] = []
    const plan = await lifecycle.selectionPlan('activate', two.id, preserved)
    const operation = lifecycle.begin('activate', two.id, undefined, false, undefined, undefined, undefined, undefined, undefined, undefined, preserved, {}, plan.selectionContext)
    expect(await finished(operation)).toMatchObject({ phase: 'done', preservedSkinIds: [] })
    expect(readMarketState(dir)).toMatchObject({ pinnedSkinIds: [] })
    expect(readMarketState(dir).disabledSkinIds).toEqual(expect.arrayContaining([pinned.id]))
    expect(entries.get(pinned.rowId)?.options.disabled).toBe(true)
    await finished(lifecycle.begin('activate', one.id))
    expect(readMarketState(dir).disabledSkinIds).toContain(pinned.id)
    expect(entries.get(pinned.rowId)?.options.disabled).toBe(true)
  })

  it('rejects an explicit activation selection when a preserved skin approval is missing', async () => {
    const { dir, skins: [one, two, pinned], lifecycle } = webSelectionFixture()
    const approvals = { [one.id]: { compatibilityContext: compatibilityContext(one, null) } }
    const operation = lifecycle.begin('activate', two.id, undefined, false, undefined, undefined, undefined, undefined, undefined, undefined, [one.id, pinned.id], approvals, 'a'.repeat(64))
    expect(await finished(operation)).toMatchObject({ phase: 'failed', message: '保留选择已变化，请重新确认' })
    expect(readMarketState(dir).activeSkinId).toBe(one.id)
  })

  it('rejects an activation when the selection context changes after confirmation', async () => {
    const { dir, skins: [one, two, pinned], lifecycle } = webSelectionFixture()
    const preserved = [one.id, pinned.id]
    const approvals = Object.fromEntries([one, pinned].map(skin => [skin.id, { compatibilityContext: compatibilityContext(skin, null) }]))
    const plan = await lifecycle.selectionPlan('activate', two.id, preserved)
    writeMarketState(dir, { ...readMarketState(dir), pinnedSkinIds: [pinned.id] })
    const operation = lifecycle.begin('activate', two.id, undefined, false, undefined, undefined, undefined, undefined, undefined, undefined, preserved, approvals, plan.selectionContext)
    expect(await finished(operation)).toMatchObject({ phase: 'failed', message: '保留选择已变化，请重新确认' })
    expect(readMarketState(dir).activeSkinId).toBe(one.id)
  })

  it('reports the complete browser selection on ordinary runtime rows and treats unknown managed package identities conservatively', () => {
    const { dir, skins: [one, two, pinned], lifecycle } = webSelectionFixture()
    expect(lifecycle.states().find(state => state.skinId === one.id)).toMatchObject({ activation: 'active', selectionHostApplied: true,
      selectionClientTargets: [{ package: one.package, active: true }, { package: two.package, active: false }, { package: pinned.package, active: false }] })
    writeMarketState(dir, { ...readMarketState(dir), managedLoaders: { unknown: { id: 'unknown', ownerSkinIds: [one.id] } } })
    expect(lifecycle.states().find(state => state.skinId === one.id)?.selectionClientTargets).toBeUndefined()
  })

  it('returns an explicit empty browser selection for a known Host-only skin graph', () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    materializeReviewedSkin(dir, skin)
    writeMarketState(dir, { version: 1, activeSkinId: skin.id, disabledSkinIds: [] })
    const entry: LoaderEntry = { options: { id: skin.rowId, name: skin.package }, fiber: { state: 2 }, update: async () => undefined }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [entry] } }, { profile: 'test', profileDir: dir, runner: async () => success() }, [skin])
    expect(lifecycle.states()[0]).toMatchObject({ selectionHostApplied: true, selectionClientTargets: [] })
  })

  it.each([
    ['deactivate', 'companion'], ['unpin', 'companion'], ['deactivate', 'managed'], ['unpin', 'managed'],
  ] as const)('keeps a restartable soft receipt when %s disables a Host-only skin with a Web %s', async (kind, source) => {
    const { dir, skins: [one, two], entries, lifecycle, addEntry } = webSelectionFixture()
    writeBundlePackage(dir, one)
    const browser = { package: '@example/selection-browser-child', rowId: 'selection-browser-child',
      target: one.install.target, version: one.install.version, commit: one.install.commit }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { ...readDependencies(dir), [browser.package]: browser.target } })
    writeBundleRows(dir, { ...browser, install: { version: browser.version } }, [{ id: browser.rowId, name: browser.package }])
    const browserEntry = addEntry(browser, true)
    if (source === 'companion') one.install = { ...one.install, companions: [browser] }
    writeMarketState(dir, { ...readMarketState(dir),
      ...(source === 'companion'
        ? { managedCompanions: { [browser.package]: { ownerSkinIds: [one.id], installedByMarket: false } } }
        : { managedLoaders: { [browser.rowId]: { id: browser.rowId, name: browser.package, packageName: browser.package, ownerSkinIds: [one.id] } } }),
      ...(kind === 'unpin' ? { activeSkinId: two.id, pinnedSkinIds: [one.id], disabledSkinIds: [] } : {}),
    })
    if (kind === 'unpin') {
      entries.get(two.rowId)!.options.disabled = null
      entries.get(two.rowId)!.fiber = { state: 2 }
      entries.get('selection-pinned')!.options.disabled = null
      entries.get('selection-pinned')!.fiber = { state: 2 }
    }
    expect(await finished(lifecycle.begin(kind, one.id))).toMatchObject({ phase: 'done' })
    expect(browserEntry.options.disabled).toBe(true)
    expect(readMarketState(dir).pendingRestart?.selectionChanges).toContain(one.id)
    const state = lifecycle.states().find(state => state.skinId === one.id)!
    // The raw state remains an eligible /restart target for this browser-only
    // change even though its owning Host skin is now inactive.
    expect(state).toMatchObject({ activation: 'restart-required', restartSource: 'selection', primary: false, pinned: false,
      selectionHostStatus: 'applied', selectionHostApplied: true })
    expect(state.clientModule).toBeUndefined()
    expect(state.selectionClientTargets).toContainEqual({ package: browser.package, active: false })
  })

  it('includes a Host-only destination in the soft receipt when switching away from a Web skin', async () => {
    const { dir, skins: [one, two], lifecycle } = webSelectionFixture()
    writeBundlePackage(dir, two)
    expect((await finished(lifecycle.begin('activate', two.id))).phase).toBe('done')
    expect(readMarketState(dir).pendingRestart?.selectionChanges).toEqual([one.id, two.id])
    const state = lifecycle.states().find(state => state.skinId === two.id)!
    expect(state).toMatchObject({ activation: 'restart-required', restartSource: 'selection', selectionHostStatus: 'applied' })
    expect(state.clientModule).toBeUndefined()
    expect(state.selectionClientTargets).toContainEqual({ package: one.package, active: false })
  })

  it('uses a new notice generation only for a new pure selection change', async () => {
    const { dir, skins: [one, two], lifecycle } = webSelectionFixture()
    await finished(lifecycle.begin('activate', two.id))
    const first = readMarketState(dir).pendingRestart?.id
    expect(lifecycle.states().find(state => state.skinId === two.id)?.restartSource).toBe('selection')
    expect(readMarketState(dir).pendingRestart?.id).toBe(first)
    await finished(lifecycle.begin('pin', two.id))
    expect(readMarketState(dir).pendingRestart?.id).toBe(first)
    await finished(lifecycle.begin('activate', one.id))
    expect(readMarketState(dir).pendingRestart?.id).not.toBe(first)
  })

  it.each(['legacy', 'update', 'first-install'] as const)('never downgrades or clears a %s hard receipt during ordinary Web selections', async reason => {
    const { dir, skins: [one, two], lifecycle } = webSelectionFixture()
    const pendingRestart = { pid: process.pid, skinIds: [two.id], id: `hard-${reason}`,
      ...(reason === 'first-install' ? { inferredInstalls: { [two.id]: 'a'.repeat(64) } } : {}) }
    writeMarketState(dir, { ...readMarketState(dir), pendingRestart })
    const activation = await finished(lifecycle.begin('activate', two.id))
    expect(activation).toMatchObject({ phase: 'done', restartRequired: true })
    expect(readMarketState(dir).pendingRestart).toMatchObject({ ...pendingRestart, skinIds: expect.arrayContaining(pendingRestart.skinIds) })
    expect(readMarketState(dir).pendingRestart?.selectionChanges).toEqual([one.id])
    expect(lifecycle.states().find(state => state.skinId === two.id)?.restartSource).toBeUndefined()
    await finished(lifecycle.begin('deactivate', two.id))
    expect(readMarketState(dir).pendingRestart?.skinIds).toContain(two.id)
    expect(readMarketState(dir).pendingRestart?.selectionChanges).not.toContain(two.id)
    if (reason === 'first-install') expect(readMarketState(dir).pendingRestart?.inferredInstalls).toEqual(pendingRestart.inferredInstalls)
  })

  it('promotes an existing Web selection receipt to a hard requirement after replacing package bytes', async () => {
    const { dir, skins, entries, lifecycle } = webSelectionFixture()
    const two = skins[1]
    await finished(lifecycle.begin('activate', two.id))
    expect(readMarketState(dir).pendingRestart?.selectionChanges).toContain(two.id)
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'add') {
        const targetDir = args.includes('--dir') ? args[args.indexOf('--dir') + 1]! : dir
        materializeReviewedSkin(targetDir, two)
        writeBundleRows(targetDir, two, [{ id: two.rowId, name: two.package }])
      }
      return success()
    }
    const replacing = new SkinLifecycle({ loader: { entries: () => entries.values() } }, { profile: 'test', profileDir: dir, runner }, skins)
    expect(await finished(replacing.begin('update', two.id))).toMatchObject({ phase: 'done', restartRequired: true })
    expect(readMarketState(dir).pendingRestart?.skinIds).toContain(two.id)
    expect(readMarketState(dir).pendingRestart?.selectionChanges).not.toContain(two.id)
    expect(replacing.states().find(state => state.skinId === two.id)?.restartSource).toBeUndefined()
    await finished(replacing.begin('activate', two.id))
    expect(replacing.states().find(state => state.skinId === two.id)).toMatchObject({ activation: 'restart-required' })
    expect(replacing.states().find(state => state.skinId === two.id)?.restartSource).toBeUndefined()
  })

  it.each(['main', 'companion', 'managed'] as const)('protects a soft receipt after an external same-version %s artifact replacement', async source => {
    const { dir, skins: [one, two], lifecycle, addEntry } = webSelectionFixture()
    let replacedPackage = two.package
    if (source !== 'main') {
      const browser = { package: '@example/external-browser-child', rowId: 'external-browser-child',
        target: two.install.target, version: two.install.version, commit: two.install.commit }
      atomicWriteJson(join(dir, 'package.json'), { dependencies: { ...readDependencies(dir), [browser.package]: browser.target } })
      writeBundleRows(dir, { ...browser, install: { version: browser.version } }, [{ id: browser.rowId, name: browser.package }])
      addEntry(browser, false)
      if (source === 'companion') two.install = { ...two.install, companions: [browser] }
      writeMarketState(dir, { ...readMarketState(dir), ...(source === 'companion'
        ? { managedCompanions: { [browser.package]: { ownerSkinIds: [two.id], installedByMarket: false } } }
        : { managedLoaders: { [browser.rowId]: { id: browser.rowId, name: browser.package, packageName: browser.package, ownerSkinIds: [two.id] } } }),
      })
      replacedPackage = browser.package
    }
    await finished(lifecycle.begin('activate', two.id))
    const original = readMarketState(dir).pendingRestart?.selectionArtifacts?.[two.id]
    expect(original).toMatch(/^[a-f0-9]{64}$/)
    expect(lifecycle.states().find(state => state.skinId === two.id)?.restartSource).toBe('selection')
    // Version and live fibers remain unchanged; only the installed bytes differ.
    atomicWriteText(join(dir, 'node_modules', ...replacedPackage.split('/'), 'client.js'), 'export const externalReplacement = true\n')
    expect(lifecycle.states().find(state => state.skinId === two.id)).toMatchObject({ activation: 'restart-required' })
    expect(lifecycle.states().find(state => state.skinId === two.id)?.restartSource).toBeUndefined()
    expect(readMarketState(dir).pendingRestart?.selectionArtifacts?.[two.id]).toBe(original)
    await finished(lifecycle.begin('deactivate', two.id))
    expect(readMarketState(dir).pendingRestart?.skinIds).toContain(two.id)
    expect(readMarketState(dir).pendingRestart?.selectionChanges).not.toContain(two.id)
    expect(readMarketState(dir).pendingRestart?.selectionArtifacts?.[two.id]).toBeUndefined()
    await finished(lifecycle.begin('activate', one.id))
    expect(lifecycle.states().find(state => state.skinId === two.id)?.restartSource).toBeUndefined()
  })

  it('does not promote a valid soft receipt when an independent installed skin changes bytes', async () => {
    const { dir, skins: [one, two], lifecycle } = webSelectionFixture()
    await finished(lifecycle.begin('activate', two.id))
    const original = readMarketState(dir).pendingRestart?.selectionArtifacts?.[two.id]
    atomicWriteText(join(dir, 'node_modules', ...one.package.split('/'), 'client.js'), 'export const unrelatedReplacement = true\n')
    expect(lifecycle.states().find(state => state.skinId === one.id)?.restartSource).toBeUndefined()
    expect(lifecycle.states().find(state => state.skinId === two.id)?.restartSource).toBe('selection')
    await finished(lifecycle.begin('pin', two.id))
    expect(readMarketState(dir).pendingRestart?.selectionChanges).toContain(two.id)
    expect(readMarketState(dir).pendingRestart?.selectionArtifacts?.[two.id]).toBe(original)
    expect(lifecycle.states().find(state => state.skinId === two.id)?.restartSource).toBe('selection')
  })

  it.each(['missing', 'loading', 'pending', 'unloading', 'failed', 'unknown', 'old-still-active'] as const)('does not confirm the complete Host selection when a row is %s', async phase => {
    const { skins: [one, two], entries, lifecycle } = webSelectionFixture()
    if (phase === 'missing') entries.delete(two.rowId)
    else if (phase === 'old-still-active') {
      entries.get(one.rowId)!.update = async value => { entries.get(one.rowId)!.options.disabled = value.disabled }
    } else {
      const entry = entries.get(two.rowId)!
      entry.update = async value => {
        entry.options.disabled = value.disabled
        entry.fiber = phase === 'unknown' ? {} : { state: phase === 'loading' ? 1 : phase === 'pending' ? 0 : phase === 'unloading' ? 5 : 3 }
      }
    }
    expect((await finished(lifecycle.begin('activate', two.id))).phase).toBe('done')
    const status = phase === 'missing' ? 'restart-required' : phase === 'failed' || phase === 'unknown' ? 'unavailable' : 'switching'
    expect(lifecycle.states().find(state => state.skinId === two.id)).toMatchObject({ restartSource: 'selection', selectionHostApplied: false, selectionHostStatus: status })
    if (phase !== 'old-still-active') {
      const entry = entries.get(two.rowId)
      if (entry !== undefined) {
        entry.fiber = { state: 2 }
        expect(lifecycle.states().find(state => state.skinId === two.id)?.selectionHostApplied).toBe(true)
      }
    }
  })

  it('waits for disabled Host effects to drain and prioritizes loading and errors across the complete selection', async () => {
    const { skins: [one, two, pinned], entries, lifecycle } = webSelectionFixture()
    await finished(lifecycle.begin('activate', two.id))
    const old = entries.get(one.rowId)!
    const current = entries.get(two.rowId)!
    const other = entries.get(pinned.rowId)!
    old.fiber = { state: 5 }
    expect(lifecycle.states().find(state => state.skinId === two.id)?.selectionHostStatus).toBe('switching')
    old.fiber = { state: 0 }
    expect(lifecycle.states().find(state => state.skinId === two.id)?.selectionHostStatus).toBe('switching')
    old.fiber = { state: 4 }
    expect(lifecycle.states().find(state => state.skinId === two.id)).toMatchObject({ selectionHostStatus: 'applied', selectionHostApplied: true })
    // A saved disable that the Host did not apply needs a real restart hint.
    old.options.disabled = null
    old.fiber = { state: 2 }
    expect(lifecycle.states().find(state => state.skinId === two.id)?.selectionHostStatus).toBe('restart-required')
    current.fiber = { state: 1 }
    expect(lifecycle.states().find(state => state.skinId === two.id)?.selectionHostStatus).toBe('switching')
    other.fiber = { state: 3 }
    expect(lifecycle.states().find(state => state.skinId === two.id)?.selectionHostStatus).toBe('unavailable')
    other.fiber = undefined
    current.fiber = { state: 2 }
    old.options.disabled = true
    old.fiber = undefined
    entries.set('duplicate', { ...current, options: { ...current.options } })
    expect(lifecycle.states().find(state => state.skinId === two.id)?.selectionHostStatus).toBe('unavailable')
  })

  it('verifies shared companions and managed rows without disabling a companion still owned by a pinned Web skin', async () => {
    const { dir, skins: [one, two, pinned], lifecycle, addEntry, entries } = webSelectionFixture()
    const companion = { package: '@example/shared-companion', rowId: 'shared-companion', target: one.install.target,
      version: one.install.version, commit: one.install.commit }
    one.install = { ...one.install, companions: [companion] }
    pinned.install = { ...pinned.install, companions: [companion] }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { ...readDependencies(dir), [companion.package]: companion.target } })
    writeBundleRows(dir, { ...companion, install: { version: companion.version } }, [{ id: companion.rowId, name: companion.package }])
    const companionEntry = addEntry(companion, true)
    const child = { package: '@example/managed-settings', rowId: 'managed-settings' }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { ...readDependencies(dir), [child.package]: one.install.target } })
    writeBundleRows(dir, { ...child, install: { version: one.install.version } }, [{ id: child.rowId, name: child.package }])
    const childEntry = addEntry(child, true)
    writeMarketState(dir, { ...readMarketState(dir),
      managedCompanions: { [companion.package]: { ownerSkinIds: [one.id, pinned.id], installedByMarket: false } },
      managedLoaders: { [child.rowId]: { id: child.rowId, name: child.package, packageName: child.package, ownerSkinIds: [one.id] } },
    })
    await finished(lifecycle.begin('pin', pinned.id))
    await finished(lifecycle.begin('activate', two.id))
    expect(companionEntry.options.disabled).not.toBe(true)
    expect(childEntry.options.disabled).toBe(true)
    expect(lifecycle.states().find(state => state.skinId === two.id)?.selectionHostApplied).toBe(true)
    expect(lifecycle.states().find(state => state.skinId === two.id)?.selectionClientTargets).toEqual([
      { package: one.package, active: false }, { package: two.package, active: true }, { package: pinned.package, active: true },
      { package: companion.package, active: true }, { package: child.package, active: false },
    ])
    companionEntry.fiber = { state: 1 }
    expect(lifecycle.states().find(state => state.skinId === two.id)?.selectionHostApplied).toBe(false)
    companionEntry.fiber = { state: 2 }
    await finished(lifecycle.begin('unpin', pinned.id))
    expect(companionEntry.options.disabled).toBe(true)
    expect(lifecycle.states().find(state => state.skinId === two.id)?.selectionHostApplied).toBe(true)
    entries.delete(two.rowId)
    expect(lifecycle.states().find(state => state.skinId === two.id)?.selectionHostApplied).toBe(false)
  })

  it('enables an installed inactive skin as pinned without replacing the current primary skin', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const primary = firstInstallable(probe)
    const pinned = anotherInstallable(probe, primary.id)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [primary.package]: primary.install.target, [pinned.package]: pinned.install.target } })
    writeBundlePackage(dir, primary)
    writeBundlePackage(dir, pinned)
    const entries = [primary, pinned].map(skin => {
      const entry: LoaderEntry = {
        options: { id: skin.rowId, name: skin.package, disabled: true },
        update: async value => {
          entry.options.disabled = value.disabled
          entry.fiber = value.disabled ? undefined : {}
        },
      }
      return entry
    })
    const lifecycle = new SkinLifecycle({ loader: { entries: () => entries } }, { profile: 'test', profileDir: dir, runner: async () => success() })

    await finished(lifecycle.begin('activate', primary.id))
    await finished(lifecycle.begin('pin', pinned.id))

    expect(readMarketState(dir)).toMatchObject({ activeSkinId: primary.id, pinnedSkinIds: [pinned.id] })
    expect(lifecycle.states().find(state => state.skinId === primary.id)).toMatchObject({ activation: 'active', primary: true, pinned: false })
    expect(lifecycle.states().find(state => state.skinId === pinned.id)).toMatchObject({ activation: 'active', primary: false, pinned: true })
  })

  it('installs and registers a client-only skin without an upstream bundle patch', async () => {
    const dir = fixture()
    let lifecycle!: SkinLifecycle
    const runner: PluginRunner = async (_profile, args) => {
      const skin = lifecycle.catalog.find(item => args.includes(item.install.target) || args.includes(item.package))
      if (skin === undefined) return success()
      if (args[0] === 'add') {
        const targetDir = args.includes('--dir') ? args[args.indexOf('--dir') + 1]! : dir
        materializeReviewedSkin(targetDir, skin, false)
      }
      if (args[0] === 'remove') {
        const next = { ...readDependencies(dir) }
        delete next[skin.package]
        atomicWriteJson(join(dir, 'package.json'), { dependencies: next })
      }
      return success()
    }
    lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner })
    const skin = lifecycle.catalog.find(item => item.id === 'wyh66666666.dsh-transparent-ui-plugin')!

    expect((await finished(lifecycle.begin('install', skin.id))).phase).toBe('done')
    expect(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')).toContain(`id: ${skin.rowId}`)
    expect(lifecycle.states().find(item => item.skinId === skin.id)?.installation).toBe('installed')
    expect((await finished(lifecycle.begin('activate', skin.id))).phase).toBe('done')
    expect(lifecycle.states().find(item => item.skinId === skin.id)?.activation).toBe('restart-required')
    expect((await finished(lifecycle.begin('uninstall', skin.id))).phase).toBe('done')
    expect(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')).not.toContain(`id: ${skin.rowId}`)
  })

  it('does not silently accept a same-name package from a different source', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = probe.catalog.find(item => item.id === 'wyh66666666.dsh-transparent-ui-plugin')!
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: 'github:someone/else#0000000000000000000000000000000000000000' } })
    const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
    mkdirSync(packageDir, { recursive: true })
    atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { client: { platform: 'web' } } })

    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() }, [skin])
    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation.phase).toBe('failed')
    expect(operation.message).toContain('does not match the reviewed source/version')
  })

  it('blocks a duplicate loader before touching the live profile', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    atomicWriteText(profilePatchFile(dir), `- insert:\n    - id: ${skin.rowId}\n      name: another-plugin\n`)
    let liveAdd = 0
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        materializeReviewedSkin(args[args.indexOf('--dir') + 1]!, skin)
        return success()
      }
      if (args[0] === 'add') liveAdd += 1
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation).toMatchObject({ phase: 'failed', failure: { kind: 'conflict' } })
    expect(liveAdd).toBe(0)
    expect(readDependencies(dir)).toEqual({})
  })

  it('allows a live row that shares the implementation plugin name but not its id', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = { ...base, id: 'shared-name.skin', package: '@example/shared-name', rowId: 'shared-name' }
    const official = '@deepseek-ai/dsh-agent-preset'
    const rows = [{ id: 'preset-shared-name', name: official }, { id: skin.rowId, name: skin.package }]
    const liveEntry: LoaderEntry = { options: { id: 'agent-preset', name: official }, fiber: {}, update: async () => undefined }
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'add' && args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        atomicWriteJson(join(temporary, 'package.json'), { private: true, dependencies: { [skin.package]: skin.install.target } })
        writeBundleRows(temporary, skin, rows)
        return success()
      }
      if (args[0] === 'add') {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
        writeBundleRows(dir, skin, rows)
      }
      if (args[0] === 'remove') atomicWriteJson(join(dir, 'package.json'), { dependencies: {} })
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [liveEntry] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation.phase).toBe('done')
    expect(readDependencies(dir)[skin.package]).toBe(skin.install.target)
  })

  it('rejects a catalog row id mismatch from the prefetched immutable bundle', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = { ...base, id: 'metadata-mismatch.skin', rowId: 'better-sidebar' }
    let liveAdd = 0
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        atomicWriteJson(join(temporary, 'package.json'), { private: true, dependencies: { [skin.package]: skin.install.target } })
        writeBundlePackage(temporary, { package: skin.package, rowId: 'actual-primary', install: { version: skin.install.version } })
        return success()
      }
      if (args[0] === 'add') liveAdd += 1
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation.phase).toBe('failed')
    expect(operation.message).toContain('市场目录元数据与包实际声明不一致')
    expect(operation.message).toContain('实际主 loader id=actual-primary')
    expect(liveAdd).toBe(0)
  })

  it('restores the original dependency graph once after a post-install loader conflict', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = { ...base, id: 'post-install-conflict.skin', rowId: 'incoming-loader' }
    let liveAdd = 0
    let recoveryCalls = 0
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        atomicWriteJson(join(temporary, 'package.json'), { private: true, dependencies: { [skin.package]: skin.install.target } })
        writeBundlePackage(temporary, { package: skin.package, rowId: skin.rowId, install: { version: skin.install.version } })
        return success()
      }
      if (args[0] === 'add') {
        liveAdd += 1
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
        writeBundlePackage(dir, skin)
        atomicWriteText(profilePatchFile(dir), `- insert:\n    - id: ${skin.rowId}\n      name: another-installed-plugin\n`)
        return success()
      }
      if (args[0] === 'install') {
        recoveryCalls += 1
        expect(readDependencies(dir)).toEqual({})
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation).toMatchObject({ phase: 'failed', failure: { kind: 'conflict' } })
    expect(operation.message).toContain('another-installed-plugin')
    expect(liveAdd).toBe(1)
    expect(recoveryCalls).toBe(1)
    expect(readDependencies(dir)).toEqual({})
    expect(existsSync(profilePatchFile(dir))).toBe(false)
  })

  it('pre-approves an exact build artifact and restores profile metadata after a failed install', async () => {
    const dir = fixture()
    const originalLockfile = 'lockfileVersion: "9.0"\n\nimporters:\n  .: {}\n'
    atomicWriteText(join(dir, 'pnpm-lock.yaml'), originalLockfile)
    let calls = 0
    const runner: PluginRunner = async (_profile, args) => {
      calls += 1
      if (calls === 1) {
        expect(args).not.toContain('--config.fetchTimeout=600000')
        expect(args).toContain('--dir')
        expect(existsSync(join(dir, 'pnpm-workspace.yaml'))).toBe(false)
        return success()
      }
      if (calls === 2) {
        expect(args).toContain('--prefer-offline')
        expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toContain('dskin@https://codeload.github.com/dancingmemory/dskin/tar.gz/f24cf34bd21d23845a8b9bdaf3dbf46d01a952ed')
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { ghost: 'broken' } })
        atomicWriteText(join(dir, 'pnpm-lock.yaml'), 'lockfile changed by failed add\n')
        return { ...success(), exitCode: 1, stderr: 'network failed' }
      }
      atomicWriteText(join(dir, 'pnpm-lock.yaml'), 'lockfile changed by repair install\n')
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner })
    const skin = lifecycle.catalog.find(item => item.id === 'dancingmemory.dskin')!
    const operation = await finished(lifecycle.begin('install', skin.id))
    expect(operation.phase).toBe('failed')
    expect(readDependencies(dir)).toEqual({})
    expect(existsSync(join(dir, 'pnpm-workspace.yaml'))).toBe(false)
    expect(readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')).toBe(originalLockfile)
  })

  it('installs a shared companion with the skin and removes it only after the last owner is uninstalled', async () => {
    const dir = fixture()
    const commit = 'a'.repeat(40)
    const companion = {
      package: '@dsh-external/dsh-client-ui-skin-deep-whale-manager',
      target: `github:example/repo#${commit}&path:/skin-manager`,
      version: '0.1.0',
      commit,
      rowId: 'ui-skin-deep-whale-manager',
    }
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const one = {
      ...base,
      id: 'companion.one',
      package: 'skin-one',
      rowId: 'skin-one',
      review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'verified' as const },
      install: { target: `github:example/repo#${commit}&path:/one`, version: '1.0.0', commit, companions: [companion] },
    }
    const two = {
      ...one,
      id: 'companion.two',
      package: 'skin-two',
      rowId: 'skin-two',
      install: { ...one.install, target: `github:example/repo#${commit}&path:/two` },
    }
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'add' && args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        const spec = args[1]!
        const added = spec === one.install.target ? one : spec === two.install.target ? two : null
        if (added !== null) materializeReviewedSkin(temporary, { package: added.package, rowId: added.rowId, install: { version: added.install.version, target: added.install.target } })
        return success()
      }
      if (args[0] === 'add') {
        const spec = args[1]!
        const dependencies = { ...readDependencies(dir) }
        const added = spec === companion.target
          ? { package: companion.package, rowId: companion.rowId, install: { version: companion.version } }
          : spec === one.install.target ? one : spec === two.install.target ? two : null
        if (added === null) return { ...success(), exitCode: 1, stderr: `unexpected spec ${spec}` }
        dependencies[added.package] = spec
        atomicWriteJson(join(dir, 'package.json'), { dependencies })
        writeBundlePackage(dir, added)
        return success()
      }
      if (args[0] === 'remove') {
        const dependencies = { ...readDependencies(dir) }
        delete dependencies[args[1]!]
        atomicWriteJson(join(dir, 'package.json'), { dependencies })
        return success()
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [one, two])

    expect((await finished(lifecycle.begin('install', one.id))).phase).toBe('done')
    expect(readDependencies(dir)).toMatchObject({ [companion.package]: companion.target, [one.package]: one.install.target })
    expect(readMarketState(dir).managedCompanions).toEqual({ [companion.package]: { ownerSkinIds: [one.id], installedByMarket: true } })

    expect((await finished(lifecycle.begin('install', two.id))).phase).toBe('done')
    expect(readDependencies(dir)[companion.package]).toBe(companion.target)
    expect(readMarketState(dir).managedCompanions).toEqual({ [companion.package]: { ownerSkinIds: [one.id, two.id], installedByMarket: true } })

    expect((await finished(lifecycle.begin('uninstall', one.id))).phase).toBe('done')
    expect(readDependencies(dir)[companion.package]).toBe(companion.target)
    expect(readDependencies(dir)[one.package]).toBeUndefined()
    expect(readMarketState(dir).managedCompanions).toEqual({ [companion.package]: { ownerSkinIds: [two.id], installedByMarket: true } })

    expect((await finished(lifecycle.begin('uninstall', two.id))).phase).toBe('done')
    expect(readDependencies(dir)).toEqual({})
    expect(readMarketState(dir).managedCompanions).toBeUndefined()
  })

  it('installs a missing companion when the parent skin is already installed', async () => {
    const dir = fixture()
    const commit = 'a'.repeat(40)
    const companion = {
      package: '@dsh-external/dsh-client-ui-skin-deep-whale-manager',
      target: `github:example/repo#${commit}&path:/skin-manager`,
      version: '0.1.0',
      commit,
      rowId: 'ui-skin-deep-whale-manager',
    }
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = {
      ...base,
      id: 'companion.existing',
      package: 'skin-one',
      rowId: 'skin-one',
      review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'verified' as const },
      install: { target: `github:example/repo#${commit}&path:/one`, version: '1.0.0', commit, companions: [companion] },
    }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundlePackage(dir, skin)
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'add' && args[1] === companion.target) {
        const dependencies = { ...readDependencies(dir), [companion.package]: companion.target }
        atomicWriteJson(join(dir, 'package.json'), { dependencies })
        writeBundlePackage(dir, { package: companion.package, rowId: companion.rowId, install: { version: companion.version } })
        return success()
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    expect((await finished(lifecycle.begin('install', skin.id))).phase).toBe('done')
    expect(readDependencies(dir)).toMatchObject({ [skin.package]: skin.install.target, [companion.package]: companion.target })
  })

  it('links but does not remove a companion that was already installed by the user', async () => {
    const dir = fixture()
    const commit = 'a'.repeat(40)
    const companion = {
      package: '@dsh-external/dsh-client-ui-skin-deep-whale-manager',
      target: `github:example/repo#${commit}&path:/skin-manager`,
      version: '0.1.0',
      commit,
      rowId: 'ui-skin-deep-whale-manager',
    }
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = {
      ...base,
      id: 'companion.external-owner',
      package: 'skin-one',
      rowId: 'skin-one',
      review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'verified' as const },
      install: { target: `github:example/repo#${commit}&path:/one`, version: '1.0.0', commit, companions: [companion] },
    }
    atomicWriteJson(join(dir, 'package.json'), {
      dependencies: { [companion.package]: companion.target },
      dsh: { profile: { bundles: [companion.package] } },
    })
    writeBundlePackage(dir, { package: companion.package, rowId: companion.rowId, install: { version: companion.version } })
    const calls: string[][] = []
    const runner: PluginRunner = async (_profile, args) => {
      calls.push([...args])
      if (args[0] === 'add' && args.includes('--dir')) {
        materializeReviewedSkin(args[args.indexOf('--dir') + 1]!, skin)
        return success()
      }
      if (args[0] === 'add' && args[1] === skin.install.target) {
        atomicWriteJson(join(dir, 'package.json'), {
          dependencies: { ...readDependencies(dir), [skin.package]: skin.install.target },
          dsh: { profile: { bundles: [companion.package] } },
        })
        writeBundlePackage(dir, skin)
      }
      if (args[0] === 'remove' && args[1] === skin.package) {
        const dependencies = { ...readDependencies(dir) }
        delete dependencies[skin.package]
        atomicWriteJson(join(dir, 'package.json'), { dependencies, dsh: { profile: { bundles: [companion.package] } } })
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    expect((await finished(lifecycle.begin('install', skin.id))).phase).toBe('done')
    expect(calls.some(args => args[0] === 'add' && args[1] === companion.target)).toBe(false)
    expect(readMarketState(dir).managedCompanions).toBeUndefined()
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).toContain(companion.package)

    expect((await finished(lifecycle.begin('uninstall', skin.id))).phase).toBe('done')
    expect(readDependencies(dir)).toEqual({ [companion.package]: companion.target })
    expect(readMarketState(dir).managedCompanions).toBeUndefined()
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).toContain(companion.package)
  })

  it('does not acquire enable/disable rights over a pre-ownership companion', async () => {
    const dir = fixture()
    const commit = 'a'.repeat(40)
    const companion = {
      package: 'legacy-companion',
      target: `github:example/companion#${commit}`,
      version: '1.0.0',
      commit,
      rowId: 'legacy-companion',
    }
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = {
      ...base,
      id: 'legacy.owner',
      package: 'legacy-owner',
      rowId: 'legacy-owner',
      install: { target: `github:example/owner#${commit}`, version: '1.0.0', commit, companions: [companion] },
    }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target, [companion.package]: companion.target } })
    writeBundlePackage(dir, skin)
    writeBundlePackage(dir, { package: companion.package, rowId: companion.rowId, install: { version: companion.version } })
    const live = { disabled: false }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [{ options: { id: companion.rowId, name: companion.package }, update: async ({ disabled }) => { live.disabled = disabled === true } }] } }, { profile: 'test', profileDir: dir, runner: async () => success() }, [skin])

    await lifecycle.replay()
    expect(readMarketState(dir).managedCompanions).toBeUndefined()
    expect(live.disabled).toBe(false)
  })

  it('activates a receipt-linked companion without granting delete rights', async () => {
    const dir = fixture()
    const commit = 'a'.repeat(40)
    const companion = {
      package: '@dsh-external/dsh-client-ui-skin-deep-whale-manager',
      target: `github:example/whale#${commit}&path:/skin-manager`,
      version: '0.1.0',
      commit,
      rowId: 'ui-skin-deep-whale-manager',
    }
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = {
      ...base,
      id: 'small-tailqwq.orca-link',
      package: '@dsh-external/dsh-client-ui-skin-orca-link',
      rowId: 'ui-skin-orca-link',
      install: { target: `github:example/whale#${commit}&path:/orca-link`, version: '0.1.0', commit, companions: [companion] },
    }
    atomicWriteJson(join(dir, 'package.json'), {
      dependencies: { [skin.package]: skin.install.target, [companion.package]: companion.target },
      dsh: { profile: { bundles: [skin.package, companion.package] } },
    })
    writeBundlePackage(dir, skin)
    writeBundlePackage(dir, { package: companion.package, rowId: companion.rowId, install: { version: companion.version } })
    atomicWriteText(profilePatchFile(dir), `- id: ${companion.rowId}\n  disabled: true\n`)
    writeMarketState(dir, {
      version: 1,
      activeSkinId: skin.id,
      disabledSkinIds: [],
      managedCompanions: { [companion.package]: { ownerSkinIds: [skin.id], installedByMarket: false } },
    })
    const live = { disabled: true }
    const entry: LoaderEntry = {
      options: { id: companion.rowId, name: companion.package, disabled: true },
      fiber: {},
      update: async ({ disabled }) => { live.disabled = disabled === true },
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [entry] } }, { profile: 'test', profileDir: dir, runner: async () => success() }, [skin])

    await lifecycle.replay()

    expect(readMarketState(dir).managedCompanions).toEqual({
      [companion.package]: { ownerSkinIds: [skin.id], installedByMarket: false },
    })
    expect(readFileSync(profilePatchFile(dir), 'utf8')).not.toContain(companion.rowId)
    expect(live.disabled).toBe(false)
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles).toContain(companion.package)
  })

  it('disables a companion in settings until an owning skin is in use', async () => {
    const dir = fixture()
    const commit = 'a'.repeat(40)
    const companion = {
      package: '@dsh-external/dsh-client-ui-skin-deep-whale-manager',
      target: `github:example/repo#${commit}&path:/skin-manager`,
      version: '0.1.0',
      commit,
      rowId: 'ui-skin-deep-whale-manager',
    }
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const owner = {
      ...base,
      id: 'companion.owner',
      package: 'skin-one',
      rowId: 'skin-one',
      review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'verified' as const },
      install: { target: `github:example/repo#${commit}&path:/one`, version: '1.0.0', commit, companions: [companion] },
    }
    const other = {
      ...base,
      id: 'companion.other',
      package: 'skin-two',
      rowId: 'skin-two',
      review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'verified' as const },
      install: { target: `github:example/repo#${commit}&path:/two`, version: '1.0.0', commit },
    }
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'add' && args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        const spec = args[1]!
        const added = spec === owner.install.target ? owner : spec === other.install.target ? other : null
        if (added !== null) materializeReviewedSkin(temporary, { package: added.package, rowId: added.rowId, install: { version: added.install.version, target: added.install.target } })
        return success()
      }
      if (args[0] === 'add') {
        const spec = args[1]!
        const added = spec === companion.target
          ? { package: companion.package, rowId: companion.rowId, install: { version: companion.version } }
          : spec === owner.install.target ? owner : spec === other.install.target ? other : null
        if (added === null) return { ...success(), exitCode: 1, stderr: `unexpected spec ${spec}` }
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { ...readDependencies(dir), [added.package]: spec } })
        writeBundlePackage(dir, added)
        return success()
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [owner, other])

    expect((await finished(lifecycle.begin('install', owner.id))).phase).toBe('done')
    expect((await finished(lifecycle.begin('install', other.id))).phase).toBe('done')
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).not.toContain(companion.package)

    expect((await finished(lifecycle.begin('activate', owner.id))).phase).toBe('done')
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).toContain(companion.package)

    expect((await finished(lifecycle.begin('activate', other.id))).phase).toBe('done')
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).not.toContain(companion.package)
  })
})
