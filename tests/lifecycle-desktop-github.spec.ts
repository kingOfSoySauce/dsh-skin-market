import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stringify } from 'yaml'
import { loadCatalog } from '../src/catalog.ts'
import { SkinLifecycle } from '../src/lifecycle.ts'
import { officialDesktopRunner, type OfficialPluginManagerLike } from '../src/official-desktop.ts'
import { atomicWriteJson, atomicWriteText, packageDir, readDependencies, readMarketState, readProfileBundles } from '../src/profile.ts'
import type { Operation, SkinEntry } from '../src/types.ts'

const directories: string[] = []
const lifecycles: SkinLifecycle[] = []
afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map(lifecycle => lifecycle.dispose()))
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

async function until(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 500; index++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  throw new Error('GitHub lifecycle condition did not settle')
}
async function finished(operation: Operation): Promise<Operation> {
  await until(() => ['done', 'failed', 'cancelled', 'waiting'].includes(operation.phase))
  return operation
}

function fixture(subpath?: string, options: { manual?: boolean; desktopReason?: string } = {}) {
  const base = structuredClone(loadCatalog().skins[0]!)
  const commit = 'a'.repeat(40)
  const item: SkinEntry = { ...base, id: 'github-test', package: 'dsh-github-test', rowId: 'github-test', repo: 'https://github.com/Fixture/Skin', subpath,
    compatibility: { dsh: '*', platform: ['web'] },
    review: { compatibility: 'verified', preview: 'verified', installation: options.manual === true ? 'manual-only' : 'verified' },
    install: { target: `github:Fixture/Skin#${commit}${subpath === undefined ? '' : `&path:/${subpath}`}`, commit, version: '1.0.0', desktop: { mode: 'manual-only', reason: options.desktopReason ?? 'npm-package-not-found' } },
  }
  const directory = mkdtempSync(join(tmpdir(), 'dsh-desktop-github-lifecycle-'))
  directories.push(directory)
  atomicWriteJson(join(directory, 'package.json'), { dependencies: {}, dsh: { profile: { bundles: [] } } })
  const manifest = () => JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; dsh: { profile: { bundles: string[] } } }
  const materialize = (spec = item.install.target, version = item.install.version) => {
    const value = manifest()
    value.dependencies[item.package] = spec
    atomicWriteJson(join(directory, 'package.json'), value)
    const target = packageDir(directory, item.package)
    mkdirSync(target, { recursive: true })
    atomicWriteJson(join(target, 'package.json'), { name: item.package, version, exports: { './client': './client.js' }, dsh: { client: { platform: 'web' }, bundle: { patch: './cordis.patch.yml' } } })
    atomicWriteText(join(target, 'client.js'), `export const version = '${version}'\n`)
    atomicWriteText(join(target, 'cordis.patch.yml'), stringify([{ insert: [{ id: item.rowId, name: item.package }] }]))
    const pin = /#([0-9a-f]{40})/.exec(spec)?.[1] ?? item.install.commit
    const archive = `https://codeload.github.com/Fixture/Skin/tar.gz/${pin}`
    const resolved = `${archive}${subpath === undefined ? '' : `#path:/${subpath}`}`
    atomicWriteText(join(directory, 'pnpm-lock.yaml'), stringify({
      lockfileVersion: '9.0', importers: { '.': { dependencies: { [item.package]: { specifier: spec, version: resolved } } } },
      packages: { [`${item.package}@${resolved}`]: { version, resolution: { gitHosted: true, tarball: archive, ...(subpath === undefined ? {} : { path: `/${subpath}` }) } } },
    }))
  }
  const manager = {
    installBundle: vi.fn(async (spec: string, _options?: Record<string, unknown>): Promise<unknown> => {
      materialize(spec)
      return { application: 'applied', changed: true, version: item.install.version }
    }),
    cancelInstall: vi.fn(async (_id: string): Promise<unknown> => ({ status: 'not-running' })),
    waitForInstall: vi.fn(async (_id: string): Promise<unknown> => null),
    removeBundle: vi.fn(async (): Promise<unknown> => ({ application: 'applied' })),
    setBundleEnabled: vi.fn(async (name: string, enabled: boolean): Promise<unknown> => {
      const value = manifest()
      value.dsh.profile.bundles = enabled ? [name] : []
      atomicWriteJson(join(directory, 'package.json'), value)
      return { application: 'applied', changed: true, target: name, enabled }
    }),
    setPluginEnabled: vi.fn(async (): Promise<unknown> => ({ application: 'applied' })),
    listBundles: vi.fn(async (): Promise<unknown> => [{ name: item.package, installed: true, enabled: false, rows: [{ rowId: item.rowId, moduleName: item.package }] }]),
    listPlugins: vi.fn(async (): Promise<unknown> => []),
  } satisfies OfficialPluginManagerLike
  const runtime = { version: '0.2.1-alpha.3', source: 'injected' as const, capabilities: [] }
  const runner = officialDesktopRunner(() => manager, runtime)
  const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'desktop', profileDir: directory, hostKind: 'desktop', runner, runtime, lifecycleWaitMs: 5 }, [item])
  lifecycles.push(lifecycle)
  return { item, directory, manager, lifecycle, materialize }
}

describe('official Desktop pinned GitHub installation', () => {
  it.each([undefined, 'packages/skin'])('installs %s as one source argument and leaves it inactive', async subpath => {
    const f = fixture(subpath)
    const operation = await finished(f.lifecycle.begin('install', f.item.id))
    expect(operation).toMatchObject({ phase: 'done', application: 'applied' })
    expect(f.manager.installBundle).toHaveBeenCalledExactlyOnceWith(f.item.install.target, { enabled: false, saveExact: true, requestId: expect.any(String) })
    expect(readDependencies(f.directory)[f.item.package]).toBe(f.item.install.target)
    expect(readProfileBundles(f.directory)).toEqual([])
    expect(readMarketState(f.directory)).toMatchObject({ activeSkinId: null, disabledSkinIds: [f.item.id] })
    expect(f.lifecycle.states()[0]).toMatchObject({ installation: 'installed', installedVersion: '1.0.0', updateAvailable: false })
    expect(f.manager.setBundleEnabled).not.toHaveBeenCalledWith(f.item.package, true)
  })

  it('installs an unreviewed npm-fallback GitHub source through the official manager', async () => {
    const f = fixture(undefined, { manual: true })
    expect(await finished(f.lifecycle.begin('install', f.item.id))).toMatchObject({ phase: 'done' })
    expect(f.manager.installBundle).toHaveBeenCalledExactlyOnceWith(f.item.install.target, { enabled: false, saveExact: true, requestId: expect.any(String) })
  })

  it('retries a GitHub build approval with the exact tarball key the Host reported', async () => {
    const f = fixture(undefined, { manual: true })
    const key = `${f.item.package}@https://codeload.github.com/Fixture/Skin/tar.gz/${f.item.install.commit}`
    f.manager.installBundle.mockResolvedValueOnce({
      application: 'failed', changed: false, stage: 'install', target: f.item.install.target,
      pendingBuilds: [key], error: { code: 'build-approval-required', message: 'git-hosted package needs build approval' },
    })
    const failed = await finished(f.lifecycle.begin('install', f.item.id))
    expect(failed).toMatchObject({ phase: 'failed', failure: { kind: 'build-approval', action: 'approve-build', buildKeys: [key] } })
    expect(f.manager.installBundle).toHaveBeenCalledTimes(1)

    const retried = await finished(f.lifecycle.retry(failed.id, 'approve-build'))
    expect(retried).toMatchObject({ phase: 'done', application: 'applied' })
    expect(f.manager.installBundle).toHaveBeenCalledTimes(2)
    expect(f.manager.installBundle.mock.calls[1]?.[0]).toBe(f.item.install.target)
    expect(f.manager.installBundle.mock.calls[1]?.[1]).toMatchObject({ approvedBuilds: [key] })
  })

  it('keeps an explicitly manual Desktop source blocked', () => {
    const f = fixture(undefined, { manual: true, desktopReason: '当前仅完成固定版本的公开展示/DSH Web 隔离验收；Desktop 安装路径尚未单独核验。' })
    expect(() => f.lifecycle.begin('install', f.item.id)).toThrow('Desktop 当前不支持该皮肤的一键安装')
    expect(f.manager.installBundle).not.toHaveBeenCalled()
  })

  it('recognizes an existing verified GitHub artifact without reinstalling', async () => {
    const f = fixture('packages/skin')
    f.materialize()
    expect(await finished(f.lifecycle.begin('install', f.item.id))).toMatchObject({ phase: 'done' })
    expect(f.manager.installBundle).not.toHaveBeenCalled()
  })

  it('updates an existing GitHub source without silently choosing a newly available npm package', async () => {
    const f = fixture('packages/skin')
    f.materialize(f.item.install.target.replace(f.item.install.commit, 'b'.repeat(40)), '0.9.0')
    f.item.install.desktop = { mode: 'managed', registry: 'npm', packageName: f.item.package, packageVersion: f.item.install.version }
    const operation = await finished(f.lifecycle.begin('update', f.item.id))
    expect(operation.phase).toBe('done')
    expect(f.manager.installBundle.mock.calls[0]?.[0]).toBe(f.item.install.target)
    expect(readDependencies(f.directory)[f.item.package]).toBe(f.item.install.target)
  })

  it.each(['file:/tmp/custom-skin', 'link:/tmp/custom-skin', '1.0.0'])('does not replace an existing %s source with GitHub', async spec => {
    const f = fixture()
    f.materialize(spec)
    const operation = await finished(f.lifecycle.begin('update', f.item.id))
    expect(operation).toMatchObject({ phase: 'failed', message: expect.stringContaining('无法自动换源') })
    expect(f.manager.installBundle).not.toHaveBeenCalled()
    expect(readDependencies(f.directory)[f.item.package]).toBe(spec)
  })

  it.each(['another repository', 'another subdirectory'])('preserves a GitHub installation from %s', async changed => {
    const f = fixture('packages/skin')
    const spec = changed === 'another repository' ? f.item.install.target.replace('Fixture/Skin', 'Other/Skin') : f.item.install.target.replace('packages/skin', 'packages/other')
    f.materialize(spec)
    expect(await finished(f.lifecycle.begin('update', f.item.id))).toMatchObject({ phase: 'failed', message: expect.stringContaining('无法自动换源') })
    expect(f.manager.installBundle).not.toHaveBeenCalled()
    expect(readDependencies(f.directory)[f.item.package]).toBe(spec)
  })

  it('does not repair a missing custom local artifact by replacing its source with GitHub', async () => {
    const f = fixture()
    const source = 'link:/tmp/custom-skin'
    atomicWriteJson(join(f.directory, 'package.json'), { dependencies: { [f.item.package]: source }, dsh: { profile: { bundles: [] } } })
    expect(await finished(f.lifecycle.begin('install', f.item.id))).toMatchObject({ phase: 'failed', message: expect.stringContaining('无法自动换源') })
    expect(f.manager.installBundle).not.toHaveBeenCalled()
    expect(readDependencies(f.directory)[f.item.package]).toBe(source)
  })

  it('keeps native restart results after verifying the GitHub transaction', async () => {
    const f = fixture()
    f.manager.installBundle.mockImplementationOnce(async spec => { f.materialize(spec); return { application: 'restart-required', changed: true, version: f.item.install.version } })
    expect(await finished(f.lifecycle.begin('install', f.item.id))).toMatchObject({ phase: 'done', restartRequired: true })
    expect(readMarketState(f.directory).pendingRestart).toMatchObject({ skinIds: [f.item.id] })
  })

  it('preserves a prior GitHub artifact when the native manager refuses an update', async () => {
    const f = fixture()
    const previous = f.item.install.target.replace(f.item.install.commit, 'b'.repeat(40))
    f.materialize(previous, '0.9.0')
    const manifestBefore = readFileSync(join(f.directory, 'package.json'), 'utf8')
    const lockBefore = readFileSync(join(f.directory, 'pnpm-lock.yaml'), 'utf8')
    f.manager.installBundle.mockResolvedValueOnce({ application: 'failed', changed: false, stage: 'install', error: { code: 'operation-error', diagnostic: 'fixture refused' } })
    expect(await finished(f.lifecycle.begin('update', f.item.id))).toMatchObject({ phase: 'failed', application: 'failed' })
    expect(f.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(readFileSync(join(f.directory, 'package.json'), 'utf8')).toBe(manifestBefore)
    expect(readFileSync(join(f.directory, 'pnpm-lock.yaml'), 'utf8')).toBe(lockBefore)
  })

  it('cancels an existing GitHub transaction by request id without repeating installation', async () => {
    const f = fixture()
    let finish!: (value: unknown) => void
    f.manager.installBundle.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    f.manager.cancelInstall.mockImplementationOnce(async () => { finish({ application: 'cancelled' }); return { status: 'cancelled' } })
    const operation = f.lifecycle.begin('install', f.item.id)
    await until(() => f.manager.installBundle.mock.calls.length > 0)
    const requestId = f.manager.installBundle.mock.calls[0]?.[1]?.requestId
    f.lifecycle.cancel(operation.id)
    expect(await finished(operation)).toMatchObject({ phase: 'cancelled', application: 'cancelled' })
    expect(f.manager.cancelInstall).toHaveBeenCalledWith(requestId)
    expect(f.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(readDependencies(f.directory)[f.item.package]).toBeUndefined()
  })
})
