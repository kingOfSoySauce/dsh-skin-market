import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stringify } from 'yaml'
import { SkinLifecycle } from '../src/lifecycle.ts'
import { officialDesktopRunner, type OfficialPluginManagerLike } from '../src/official-desktop.ts'
import { atomicWriteJson, atomicWriteText, marketStateFile, packageDir, profilePatchFile, readMarketState, readProfileBundles, writeMarketState } from '../src/profile.ts'
import type { LoaderEntry, SkinEntry } from '../src/types.ts'
import { operationWaiter } from './fixtures/operations.ts'
import { catalogFixtureSkin } from './fixtures/catalog.ts'

const directories: string[] = []
const lifecycles: SkinLifecycle[] = []
afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map(lifecycle => lifecycle.dispose()))
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

interface NativeRow {
  entryId: string
  patchId?: string
  moduleName: string
  enabled: boolean
  fiberPhase: string | null
  readOnlyReason?: string
}

function fixture(ids = ['external', 'other']) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-native-state-'))
  directories.push(directory)
  const base = catalogFixtureSkin()
  const catalog: SkinEntry[] = ids.map(id => ({
    ...structuredClone(base), id, rowId: id, package: `native-${id}`, repo: `https://github.com/fixture/${id}`, subpath: undefined,
    compatibility: { dsh: '*', platform: ['web'] },
    install: { target: `github:fixture/${id}#${'a'.repeat(40)}`, commit: 'a'.repeat(40), version: '1.0.0',
      desktop: { mode: 'managed', registry: 'npm', packageName: `native-${id}`, packageVersion: '1.0.0' } },
  }))
  const selected = new Set<string>()
  const componentEnabled = new Map<string, boolean>()
  const rows = new Map<string, NativeRow>()
  const entries = new Map<string, LoaderEntry>()
  const saveManifest = () => atomicWriteJson(join(directory, 'package.json'), {
    dependencies: Object.fromEntries(catalog.map(skin => [skin.package, skin.install.version])),
    dsh: { profile: { bundles: [...selected] } },
  })
  for (const skin of catalog) {
    const target = packageDir(directory, skin.package)
    mkdirSync(target, { recursive: true })
    atomicWriteJson(join(target, 'package.json'), { name: skin.package, version: skin.install.version,
      exports: { './client': './client.js' }, dsh: { client: { platform: 'web' }, bundle: { patch: './cordis.patch.yml' } } })
    atomicWriteText(join(target, 'client.js'), 'export const client = true\n')
    atomicWriteText(join(target, 'cordis.patch.yml'), stringify([{ insert: [{ id: skin.rowId, name: skin.package }] }]))
    entries.set(skin.package, { options: { id: skin.rowId, name: skin.package, disabled: true }, update: vi.fn(async () => undefined) })
  }
  saveManifest()
  atomicWriteText(join(directory, 'pnpm-lock.yaml'), stringify({
    lockfileVersion: '9.0', importers: { '.': { dependencies: Object.fromEntries(catalog.map(skin => [skin.package, { specifier: skin.install.version, version: skin.install.version }])) } },
    packages: Object.fromEntries(catalog.map(skin => [`${skin.package}@${skin.install.version}`, { resolution: {} }])),
  }))
  atomicWriteText(profilePatchFile(directory), '# Unrelated native configuration stays unchanged.\n- id: unrelated\n  disabled: true\n')
  writeMarketState(directory, { version: 1, activeSkinId: null, pinnedSkinIds: [], disabledSkinIds: [...ids] })
  const select = (skin: SkinEntry, enabled: boolean, phase: string | null = 'active') => {
    if (enabled) selected.add(skin.package)
    else selected.delete(skin.package)
    const live = enabled && componentEnabled.get(skin.package) !== false
    rows.set(skin.package, { entryId: `entry:${skin.id}`, patchId: skin.rowId, moduleName: skin.package, enabled: live, fiberPhase: live ? phase : null })
    const entry = entries.get(skin.package)!
    entry.options.disabled = !live
    entry.fiber = live ? {} : undefined
    saveManifest()
  }
  const manager = {
    installBundle: vi.fn(async () => ({ application: 'applied' })),
    removeBundle: vi.fn(async () => ({ application: 'applied' })),
    cancelInstall: vi.fn(async () => ({ status: 'not-running' })),
    setBundleEnabled: vi.fn(async (name: string, enabled: boolean): Promise<unknown> => {
      select(catalog.find(skin => skin.package === name)!, enabled)
      return { application: 'applied', changed: true, target: name, enabled }
    }),
    setPluginEnabled: vi.fn(async (id: string, enabled: boolean): Promise<unknown> => {
      const row = [...rows.values()].find(row => row.entryId === id)!
      componentEnabled.set(row.moduleName, enabled)
      row.enabled = enabled
      row.fiberPhase = enabled ? 'active' : null
      return { application: 'applied', changed: true, target: id, enabled }
    }),
    listPlugins: vi.fn(async (): Promise<unknown> => [...rows.values()]),
    listBundles: vi.fn(async (): Promise<unknown> => catalog.map(skin => ({
      name: skin.package, enabled: selected.has(skin.package), installed: true,
      rows: [{ rowId: skin.rowId, moduleName: skin.package, ...(rows.has(skin.package) ? { entryId: rows.get(skin.package)!.entryId } : {}) }],
    }))),
  } satisfies OfficialPluginManagerLike
  const on = vi.fn(() => vi.fn())
  const host = { loader: { entries: () => entries.values() }, on }
  const runtime = { version: '0.2.1-alpha.3', source: 'injected' as const, capabilities: [] }
  const lifecycle = new SkinLifecycle(host, { profile: 'desktop', profileDir: directory, hostKind: 'desktop',
    runner: officialDesktopRunner(() => manager, runtime), runtime, lifecycleWaitMs: 30 }, catalog)
  lifecycles.push(lifecycle)
  const files = () => [join(directory, 'package.json'), join(directory, 'pnpm-lock.yaml'), profilePatchFile(directory), marketStateFile(directory)].map(file => readFileSync(file, 'utf8'))
  const writes = () => [manager.installBundle, manager.removeBundle, manager.setBundleEnabled, manager.setPluginEnabled].map(method => method.mock.calls.length)
  return { directory, catalog, selected, componentEnabled, rows, entries, manager, lifecycle, on, select, files, writes, host, runtime }
}

const finished = operationWaiter()

describe('native plugin changes observed by the skin market', () => {
  it('reports every natively enabled skin without adopting or disabling it on a state read', async () => {
    const f = fixture()
    f.catalog.forEach(skin => f.select(skin, true))
    const before = f.files()
    const states = await f.lifecycle.runtimeStates()
    expect(states.map(state => ({ id: state.skinId, activation: state.activation, primary: state.primary, pinned: state.pinned })))
      .toEqual(f.catalog.map(skin => ({ id: skin.id, activation: 'active', primary: false, pinned: false })))
    expect(f.manager.listPlugins).toHaveBeenCalledOnce()
    expect(f.writes()).toEqual([0, 0, 0, 0])
    expect(f.files()).toEqual(before)
    expect(readMarketState(f.directory).disabledSkinIds).toEqual(['external', 'other'])
    expect(states.every(state => state.clientModule === true)).toBe(true)
  })

  it('does not claim a known browser client module for a package without its web platform declaration', async () => {
    const f = fixture(['external'])
    const manifestPath = join(packageDir(f.directory, f.catalog[0]!.package), 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    delete manifest.dsh.client.platform
    atomicWriteJson(manifestPath, manifest)
    expect((await f.lifecycle.runtimeStates())[0]?.clientModule).toBeUndefined()
  })

  it.each(['no row', 'disabled row'] as const)('keeps an unselected installed skin inactive with %s', async kind => {
    const f = fixture(['external'])
    if (kind === 'disabled row') f.select(f.catalog[0]!, false)
    expect((await f.lifecycle.runtimeStates())[0]).toMatchObject({ installation: 'installed', activation: 'inactive', error: undefined })
    expect(f.manager.listBundles).toHaveBeenCalledOnce()
    expect(f.writes()).toEqual([0, 0, 0, 0])
  })

  it.each(['missing', 'disabled'] as const)('diagnoses a selected native bundle whose component is %s', async kind => {
    const f = fixture(['external'])
    f.select(f.catalog[0]!, true)
    if (kind === 'missing') f.rows.clear()
    else f.rows.get(f.catalog[0]!.package)!.enabled = false
    expect((await f.lifecycle.runtimeStates())[0]).toMatchObject({ activation: 'unavailable', error: expect.stringContaining(kind === 'missing' ? '唯一' : '组件已关闭') })
    expect(f.writes()).toEqual([0, 0, 0, 0])
  })

  it.each([
    { phase: 'loading', activation: 'switching' }, { phase: 'pending', activation: 'switching' },
    { phase: 'failed', activation: 'unavailable' }, { phase: null, activation: 'unavailable' },
  ])('observes external enabled component phase $phase instead of a saved inactive preference', async ({ phase, activation }) => {
    const f = fixture(['external'])
    f.select(f.catalog[0]!, true, phase)
    expect((await f.lifecycle.runtimeStates())[0]).toMatchObject({ activation })
    expect(f.writes()).toEqual([0, 0, 0, 0])
  })

  it('matches an external read-only component through its bundle row without granting writes', async () => {
    const f = fixture(['external'])
    f.select(f.catalog[0]!, true)
    const row = f.rows.get(f.catalog[0]!.package)!
    delete row.patchId
    row.readOnlyReason = 'unaddressable'
    expect((await f.lifecycle.runtimeStates())[0]).toMatchObject({ activation: 'active' })
    expect(f.writes()).toEqual([0, 0, 0, 0])
  })

  it('bounds an inventory read even without a market-owned primary or restart receipt', async () => {
    const f = fixture(['external'])
    const before = f.files()
    f.manager.listPlugins.mockImplementationOnce(() => new Promise(() => undefined))
    expect((await f.lifecycle.runtimeStates())[0]).toMatchObject({ activation: 'unavailable', error: expect.stringContaining('超时') })
    expect(f.files()).toEqual(before)
    expect(f.writes()).toEqual([0, 0, 0, 0])
  })

  it('does not replace a genuine restart receipt with an inventory failure', async () => {
    const f = fixture(['external'])
    f.select(f.catalog[0]!, true)
    writeMarketState(f.directory, { version: 1, activeSkinId: null, disabledSkinIds: ['external'], pinnedSkinIds: [],
      pendingRestart: { pid: process.pid, skinIds: ['external'], id: 'native-restart' } })
    const before = f.files()
    f.manager.listPlugins.mockRejectedValueOnce(new Error('inventory failed'))
    expect((await f.lifecycle.runtimeStates())[0]).toMatchObject({ activation: 'restart-required', error: undefined })
    expect(f.files()).toEqual(before)
    expect(f.writes()).toEqual([0, 0, 0, 0])
  })

  it('preserves native choices during startup and catalog refresh despite a stale market primary', async () => {
    const f = fixture()
    const [old, external] = f.catalog as [SkinEntry, SkinEntry]
    f.select(old, false)
    f.select(external, true)
    writeMarketState(f.directory, { version: 1, activeSkinId: old.id, disabledSkinIds: [external.id], pinnedSkinIds: [] })
    const before = f.files()
    f.lifecycle.start()
    await f.lifecycle.replay()
    await f.lifecycle.replaceCatalog(f.catalog)
    expect(f.on).not.toHaveBeenCalled()
    expect(f.files()).toEqual(before)
    expect(f.writes()).toEqual([0, 0, 0, 0])
    expect(readProfileBundles(f.directory)).toEqual([external.package])
    expect((await f.lifecycle.runtimeStates()).find(state => state.skinId === external.id)).toMatchObject({ activation: 'active' })
  })

  it('retains the loader listener for Web and third-party Desktop hosts', async () => {
    const f = fixture(['external'])
    for (const hostKind of ['dsh', 'desktop'] as const) {
      const on = vi.fn(() => vi.fn())
      const lifecycle = new SkinLifecycle({ ...f.host, on }, { profile: 'fixture', profileDir: f.directory, hostKind,
        runner: async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }), runtime: f.runtime }, f.catalog)
      lifecycles.push(lifecycle)
      lifecycle.start()
      expect(on).toHaveBeenCalledWith('internal/plugin', expect.any(Function))
      await lifecycle.dispose()
    }
  })

  it('still restores the saved selection after an explicit market switch fails', async () => {
    const f = fixture()
    const [old, target] = f.catalog as [SkinEntry, SkinEntry]
    f.select(old, true)
    f.select(target, false)
    writeMarketState(f.directory, { version: 1, activeSkinId: old.id, disabledSkinIds: [target.id], pinnedSkinIds: [] })
    const normalEnable = f.manager.setBundleEnabled.getMockImplementation()!
    f.manager.setBundleEnabled.mockImplementation(async (name, enabled) => name === target.package && enabled
      ? { application: 'failed', changed: false, error: { code: 'operation-error', diagnostic: 'fixture activation failed' } }
      : await normalEnable(name, enabled))
    expect(await finished(f.lifecycle.begin('activate', target.id))).toMatchObject({ phase: 'failed' })
    expect(readProfileBundles(f.directory)).toEqual([old.package])
    expect(readMarketState(f.directory)).toMatchObject({ activeSkinId: old.id, disabledSkinIds: [target.id] })
    expect(f.manager.setBundleEnabled).toHaveBeenCalledWith(old.package, false)
    expect(f.manager.setBundleEnabled).toHaveBeenCalledWith(old.package, true)
  })

  it('restores the actual native B selection, not stale market A, after selecting C fails even after saving', async () => {
    const f = fixture(['old-market', 'native-current', 'target'])
    const [old, current, target] = f.catalog as [SkinEntry, SkinEntry, SkinEntry]
    f.select(old, false); f.select(current, true); f.select(target, false)
    writeMarketState(f.directory, { version: 1, activeSkinId: old.id, disabledSkinIds: [current.id, target.id], pinnedSkinIds: [] })
    const normalEnable = f.manager.setBundleEnabled.getMockImplementation()!
    f.manager.setBundleEnabled.mockImplementation(async (name, enabled) => {
      if (name === target.package && enabled) {
        f.select(target, true)
        return { application: 'failed', changed: false, error: { code: 'operation-error', diagnostic: 'failed after saving' } }
      }
      return await normalEnable(name, enabled)
    })
    expect(await finished(f.lifecycle.begin('activate', target.id))).toMatchObject({ phase: 'failed' })
    expect(readProfileBundles(f.directory)).toEqual([current.package])
    expect(f.manager.setBundleEnabled.mock.calls).toEqual([
      [current.package, false], [target.package, true], [target.package, false], [current.package, true],
    ])
    expect(readMarketState(f.directory).activeSkinId).toBe(old.id)
    expect((await f.lifecycle.runtimeStates()).find(state => state.skinId === current.id)).toMatchObject({ activation: 'active', primary: false })
  })

  it('stops rollback writes if a previously selected native package was replaced during the failed action', async () => {
    const f = fixture(['native-current', 'target'])
    const [current, target] = f.catalog as [SkinEntry, SkinEntry]
    f.select(current, true); f.select(target, false)
    const normalEnable = f.manager.setBundleEnabled.getMockImplementation()!
    f.manager.setBundleEnabled.mockImplementation(async (name, enabled) => {
      if (name === target.package && enabled) {
        f.select(target, true)
        atomicWriteText(join(packageDir(f.directory, current.package), 'client.js'), 'export const replaced = true\n')
        return { application: 'failed', changed: false, error: { code: 'operation-error', diagnostic: 'failed after replacement' } }
      }
      return await normalEnable(name, enabled)
    })
    expect(await finished(f.lifecycle.begin('activate', target.id))).toMatchObject({ phase: 'failed' })
    expect(f.manager.setBundleEnabled.mock.calls).toEqual([[current.package, false], [target.package, true]])
    expect(readProfileBundles(f.directory)).toEqual([target.package])
  })

  it.each([true, false])('keeps native bundle selection and component enabled=$enabled when updating outside the saved market selection', async enabled => {
    const f = fixture(['external'])
    const target = f.catalog[0]!
    f.select(target, true)
    f.componentEnabled.set(target.package, enabled)
    f.select(target, true)
    f.manager.installBundle.mockImplementationOnce(async () => {
      // The official market install asks enabled:false; restore the prior
      // native selection after the package transaction, independently of state.json.
      f.select(target, false)
      return { application: 'applied' }
    })
    expect(await finished(f.lifecycle.begin('update', target.id))).toMatchObject({ phase: 'done' })
    expect(readProfileBundles(f.directory)).toEqual([target.package])
    expect(f.rows.get(target.package)!.enabled).toBe(enabled)
    expect(readMarketState(f.directory)).toMatchObject({ activeSkinId: null, disabledSkinIds: [target.id] })
  })
})
