import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadCatalog } from '../src/catalog.ts'
import { SkinLifecycle, type LifecycleHost } from '../src/lifecycle.ts'
import { atomicWriteJson, atomicWriteText, profilePatchFile, readMarketState, writeMarketState } from '../src/profile.ts'
import type { CommandResult } from '../src/commands.ts'
import type { LoaderEntry, Operation, SkinEntry } from '../src/types.ts'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
const success = (): CommandResult => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false })

async function finished(operation: Operation): Promise<Operation> {
  await vi.waitFor(() => expect(['done', 'failed', 'cancelled']).toContain(operation.phase))
  return operation
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-loader-identity-'))
  directories.push(directory)
  const base = loadCatalog().skins.find(skin => skin.review?.installation !== 'manual-only' && skin.install.npm === undefined)!
  const skins = ['previous', 'target'].map(name => ({ ...base, id: `identity.${name}`, package: `@example/${name}`, rowId: `identity-${name}` }))
  const collision = loadCatalog().skins.find(skin => skin.id === 'magic-mercury.dsh-chat-customizer')!
  expect(collision).toMatchObject({ package: 'dsh-chat-customizer', rowId: 'ui-sidebar' })
  atomicWriteJson(join(directory, 'package.json'), { dependencies: Object.fromEntries(skins.map(skin => [skin.package, skin.install.target])) })
  atomicWriteText(profilePatchFile(directory), '[]\n')
  const install = (skin: SkinEntry) => {
    const packageDirectory = join(directory, 'node_modules', ...skin.package.split('/'))
    mkdirSync(packageDirectory, { recursive: true })
    atomicWriteJson(join(packageDirectory, 'package.json'), { name: skin.package, version: skin.install.version,
      exports: { './client': './client.js' }, dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } } })
    atomicWriteText(join(packageDirectory, 'client.js'), 'export const fixture = true\n')
    atomicWriteText(join(packageDirectory, 'cordis.patch.yml'), `- insert:\n    - id: ${skin.rowId}\n      name: ${JSON.stringify(skin.package)}\n`)
  }
  for (const skin of skins) install(skin)
  const entry = (id: string, name: string, active: boolean): LoaderEntry & { update: ReturnType<typeof vi.fn> } => {
    const row = { options: { id, name, disabled: active ? null : true }, fiber: active ? { state: 2 } : undefined,
      update: vi.fn(async (value: { disabled: boolean | null }) => { row.options.disabled = value.disabled; row.fiber = value.disabled ? undefined : { state: 2 } }) }
    return row
  }
  const previous = entry(skins[0].rowId, skins[0].package, true)
  const target = entry(skins[1].rowId, skins[1].package, false)
  const sidebar = entry('ui-sidebar', '@deepseek-ai/dsh-client-ui-sidebar', true)
  const entries: LoaderEntry[] = [previous, target, sidebar]
  writeMarketState(directory, { version: 1, activeSkinId: skins[0].id, pinnedSkinIds: [], disabledSkinIds: [skins[1].id] })
  let notify: Parameters<NonNullable<LifecycleHost['on']>>[1] | undefined
  const host: LifecycleHost = { loader: { entries: () => entries }, on: (_event, listener) => { notify = listener; return () => { notify = undefined } } }
  const lifecycle = new SkinLifecycle(host, { profile: 'test', profileDir: directory, runner: async () => success() }, [...skins, collision])
  return { directory, skins, collision, previous, target, sidebar, entries, host, lifecycle, install, notify: () => notify?.({ entry: sidebar }) }
}

describe('live loader identity isolation', () => {
  it('switches installed skins without disabling the native sidebar for an uninstalled catalog row', async () => {
    const host = fixture()
    expect(existsSync(join(host.directory, 'node_modules', host.collision.package))).toBe(false)
    expect(await finished(host.lifecycle.begin('activate', host.skins[1].id))).toMatchObject({ phase: 'done' })
    expect(host.previous.update).toHaveBeenCalledWith({ disabled: true }, false, true)
    expect(host.target.update).toHaveBeenCalledWith({ disabled: null }, false, true)
    expect(host.sidebar.update).not.toHaveBeenCalled()
    expect(host.sidebar.options.disabled).toBeNull()
    expect(readMarketState(host.directory).activeSkinId).toBe(host.skins[1].id)
    expect(host.lifecycle.states().find(state => state.skinId === host.skins[1].id)?.selectionHostStatus).toBe('applied')
  })

  it('ignores native plugin events whose id only collides with an uninstalled market entry', async () => {
    const host = fixture()
    host.lifecycle.start()
    await host.lifecycle.replay()
    host.notify()
    await Promise.resolve()
    expect(host.sidebar.update).not.toHaveBeenCalled()
    await host.lifecycle.dispose()
  })

  it('does not let a stale managed receipt seize a native row with a different package', async () => {
    const host = fixture()
    writeMarketState(host.directory, { version: 1, activeSkinId: host.skins[0].id, pinnedSkinIds: [], disabledSkinIds: [host.skins[1].id],
      managedLoaders: { 'ui-sidebar': { id: 'ui-sidebar', name: '@example/old-helper', packageName: host.skins[1].package, ownerSkinIds: [host.skins[1].id] } } })
    await host.lifecycle.replay()
    expect(host.sidebar.update).not.toHaveBeenCalled()
    expect(host.sidebar.options.disabled).toBeNull()
  })

  it('does not adopt or modify a same-name package from a different GitHub source', async () => {
    const host = fixture()
    const skin = host.skins[0]
    const foreignSpec = `github:other/source#${'0'.repeat(40)}`
    host.install(skin)
    atomicWriteText(join(host.directory, 'node_modules', ...skin.package.split('/'), 'cordis.patch.yml'), `- insert:\n    - id: foreign-row\n      name: ${JSON.stringify(skin.package)}\n`)
    atomicWriteJson(join(host.directory, 'package.json'), {
      dependencies: { [skin.package]: foreignSpec, [host.skins[1].package]: host.skins[1].install.target },
    })
    writeMarketState(host.directory, { version: 1, activeSkinId: skin.id, pinnedSkinIds: [], disabledSkinIds: [host.skins[1].id] })
    const foreignUpdate = vi.fn(async (_value: { disabled: boolean | null }) => undefined)
    const foreignEntry: LoaderEntry = { options: { id: 'foreign-row', name: skin.package, disabled: null }, fiber: { state: 2 }, update: foreignUpdate }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [foreignEntry, host.target, host.sidebar] } }, { profile: 'test', profileDir: host.directory, runner: async () => success() }, host.skins)

    const operation = await finished(lifecycle.begin('deactivate', skin.id))

    expect(operation).toMatchObject({ phase: 'done', message: expect.stringContaining('未修改该插件') })
    expect(foreignUpdate).not.toHaveBeenCalled()
    expect(readMarketState(host.directory).activeSkinId).toBeNull()
    expect(lifecycle.states().find(state => state.skinId === skin.id)).toMatchObject({
      installation: 'broken', activation: 'inactive', primary: false, pinned: false,
    })

    await lifecycle.replay()
    expect(foreignUpdate).not.toHaveBeenCalled()
  })

  it('does not adopt or modify a same-name npm package without reviewed provenance', async () => {
    const host = fixture()
    const skin = host.skins[0]
    host.install(skin)
    atomicWriteJson(join(host.directory, 'node_modules', ...skin.package.split('/'), 'package.json'), {
      name: skin.package,
      version: '0.4.0',
      repository: 'https://github.com/other/source',
      exports: { './client': './client.js' },
      dsh: { client: { platform: 'web' } },
    })
    atomicWriteJson(join(host.directory, 'package.json'), {
      dependencies: { [skin.package]: '0.4.0', [host.skins[1].package]: host.skins[1].install.target },
    })
    writeMarketState(host.directory, { version: 1, activeSkinId: skin.id, pinnedSkinIds: [], disabledSkinIds: [host.skins[1].id] })
    const foreignUpdate = vi.fn(async (_value: { disabled: boolean | null }) => undefined)
    const foreignEntry: LoaderEntry = { options: { id: 'foreign-row', name: skin.package, disabled: null }, fiber: { state: 2 }, update: foreignUpdate }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [foreignEntry, host.target, host.sidebar] } }, { profile: 'test', profileDir: host.directory, runner: async () => success() }, host.skins)

    const operation = await finished(lifecycle.begin('deactivate', skin.id))

    expect(operation).toMatchObject({ phase: 'done', message: expect.stringContaining('未修改该插件') })
    expect(foreignUpdate).not.toHaveBeenCalled()
    expect(lifecycle.states().find(state => state.skinId === skin.id)).toMatchObject({
      installation: 'broken', activation: 'inactive', primary: false, pinned: false,
    })
  })

  it('rejects a truly installed conflicting target before modifying profile or native state', async () => {
    const host = fixture()
    host.install(host.collision)
    atomicWriteJson(join(host.directory, 'package.json'), { dependencies: Object.fromEntries([...host.skins, host.collision].map(skin => [skin.package, skin.install.target])) })
    const manifest = readFileSync(join(host.directory, 'package.json'), 'utf8')
    const patch = readFileSync(profilePatchFile(host.directory), 'utf8')
    expect(await finished(host.lifecycle.begin('activate', host.collision.id))).toMatchObject({ phase: 'failed', failure: { kind: 'conflict' } })
    expect(host.sidebar.update).not.toHaveBeenCalled()
    expect(readFileSync(join(host.directory, 'package.json'), 'utf8')).toBe(manifest)
    expect(readFileSync(profilePatchFile(host.directory), 'utf8')).toBe(patch)
  })

  it('keeps native rows intact while a failed skin activation rolls back', async () => {
    const host = fixture()
    host.target.update.mockRejectedValueOnce(new Error('target failed to activate'))
    expect(await finished(host.lifecycle.begin('activate', host.skins[1].id))).toMatchObject({ phase: 'failed' })
    expect(readMarketState(host.directory).activeSkinId).toBe(host.skins[0].id)
    expect(host.previous.options.disabled).not.toBe(true)
    expect(host.sidebar.update).not.toHaveBeenCalled()
  })
})
