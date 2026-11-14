import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stringify } from 'yaml'
import { SkinLifecycle } from '../src/lifecycle.ts'
import { officialDesktopRunner, type OfficialPluginManagerLike } from '../src/official-desktop.ts'
import { atomicWriteJson, atomicWriteText, packageDir, readDependencies } from '../src/profile.ts'
import type { DshRuntime, SkinEntry } from '../src/types.ts'
import { operationWaiter } from './fixtures/operations.ts'

const directories: string[] = []
const lifecycles: SkinLifecycle[] = []
afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map(lifecycle => lifecycle.dispose()))
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

const finished = operationWaiter({ attempts: 500, intervalMs: 2, message: 'npm-managed update condition did not settle', terminal: ['done', 'failed', 'cancelled', 'waiting'] })

const PACKAGE = 'dsh-npm-test'
const ROW_ID = 'npm-test'
const COMMIT = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const INTEGRITY_1_0_0 = `sha512-${createHash('sha512').update(`${PACKAGE}@1.0.0`).digest('base64')}`
const INTEGRITY_0_9_0 = `sha512-${createHash('sha512').update(`${PACKAGE}@0.9.0`).digest('base64')}`
const RUNTIME: DshRuntime = { version: '0.2.2-rc.2', source: 'injected', capabilities: [] }

/** A catalog row whose reviewed Desktop artifact is the exact npm registry release. */
function npmSkin(): SkinEntry {
  return {
    id: 'npm-test',
    name: { zh: 'NPM 测试皮肤', en: 'npm test skin' },
    author: 'Fixture',
    description: 'Desktop npm registry update fixture',
    repo: 'https://github.com/Fixture/Skin',
    package: PACKAGE,
    rowId: ROW_ID,
    category: 'skin',
    tags: [],
    modes: ['light'],
    compatibility: { dsh: '*', platform: ['web'] },
    screenshots: [],
    license: { code: 'MIT', commercialUse: true },
    featuredRank: 0,
    starsSnapshot: 0,
    releaseUpdatedAt: '',
    metadataUpdatedAt: '',
    starsUpdatedAt: '',
    updatedAt: '',
    install: {
      // v1 catalog invariant: the reviewed immutable target is the pinned GitHub commit.
      target: `github:Fixture/Skin#${COMMIT}`,
      version: '1.0.0',
      commit: COMMIT,
      npm: { name: PACKAGE, version: '1.0.0', integrity: INTEGRITY_1_0_0, repository: 'https://github.com/Fixture/Skin', gitHead: COMMIT },
      desktop: { mode: 'managed', registry: 'npm', packageName: PACKAGE, packageVersion: '1.0.0', integrity: INTEGRITY_1_0_0 },
    },
  }
}

function fixture() {
  const item = npmSkin()
  const directory = mkdtempSync(join(tmpdir(), 'dsh-desktop-npm-lifecycle-'))
  directories.push(directory)
  atomicWriteJson(join(directory, 'package.json'), { dependencies: { [item.package]: '0.9.0' }, dsh: { profile: { bundles: [] } } })
  const manifest = () => JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; dsh: { profile: { bundles: string[] } } }
  const integrityFor = (version: string) => version === item.install.version ? INTEGRITY_1_0_0 : INTEGRITY_0_9_0
  /** Write the registry artifact the Host leaves behind; 0.9.0 carries its own reviewed SRI. */
  const materialize = (version: string) => {
    const value = manifest()
    value.dependencies[item.package] = version
    atomicWriteJson(join(directory, 'package.json'), value)
    const target = packageDir(directory, item.package)
    mkdirSync(target, { recursive: true })
    atomicWriteJson(join(target, 'package.json'), {
      name: item.package,
      version,
      repository: item.repo,
      exports: { './client': './client.js' },
      dsh: { client: { platform: 'web' }, bundle: { patch: './cordis.patch.yml' } },
    })
    atomicWriteText(join(target, 'client.js'), `export const version = '${version}'
`)
    atomicWriteText(join(target, 'cordis.patch.yml'), stringify([{ insert: [{ id: item.rowId, name: item.package }] }]))
    atomicWriteText(join(directory, 'pnpm-lock.yaml'), stringify({
      lockfileVersion: '9.0',
      importers: { '.': { dependencies: { [item.package]: { specifier: version, version } } } },
      packages: { [`${item.package}@${version}`]: { resolution: { integrity: integrityFor(version) } } },
    }))
  }
  const manager = {
    // The market install path must never run for a reviewed registry update.
    installBundle: vi.fn(async (_spec: string, _options?: Record<string, unknown>): Promise<unknown> => {
      throw new Error('installBundle must not run for a reviewed npm registry update')
    }),
    updateBundle: vi.fn(async (name: string, version: string): Promise<unknown> => {
      materialize(version)
      return {
        from: '0.9.0', to: version, step: 'install',
        result: { application: 'applied', changed: true, stage: 'install', target: name, version },
      }
    }),
    cancelInstall: vi.fn(async (_id: string): Promise<unknown> => ({ status: 'not-running' })),
    waitForInstall: vi.fn(async (_id: string): Promise<unknown> => null),
    removeBundle: vi.fn(async (_name: string): Promise<unknown> => ({ application: 'applied' })),
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
  const runner = officialDesktopRunner(() => manager, RUNTIME)
  const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'desktop', profileDir: directory, hostKind: 'desktop', runner, runtime: RUNTIME, lifecycleWaitMs: 5 }, [item])
  lifecycles.push(lifecycle)
  return { item, directory, manager, lifecycle, materialize }
}

describe('official Desktop registry update for an npm-installed skin', () => {
  it('updates through pluginManager.updateBundle without touching the market install path', async () => {
    const f = fixture()
    f.materialize('0.9.0')
    const operation = await finished(f.lifecycle.begin('update', f.item.id))

    expect(operation.phase).toBe('done')
    expect(f.manager.updateBundle).toHaveBeenCalledExactlyOnceWith(f.item.package, '1.0.0', expect.objectContaining({ requestId: operation.id }))
    // A registry target is named by version only; a Git spec would ask the Host to switch sources.
    expect(f.manager.updateBundle.mock.calls[0]?.[2]).not.toHaveProperty('spec')
    expect(f.manager.installBundle).not.toHaveBeenCalled()
    expect(readDependencies(f.directory)[f.item.package]).toBe('1.0.0')
    expect(f.lifecycle.states()[0]).toMatchObject({ installation: 'installed', installedVersion: '1.0.0' })
  })

  it('falls back to the market install path only when the official check refuses the target', async () => {
    const f = fixture()
    f.materialize('0.9.0')
    f.manager.updateBundle.mockResolvedValueOnce({
      from: '0.9.0', to: '1.0.0', step: 'check',
      result: {
        application: 'failed', changed: false, stage: 'install', target: f.item.package,
        error: { code: 'invalid-spec', diagnostic: 'fixture refused' },
      },
    })
    f.manager.installBundle.mockImplementationOnce(async (_spec: string): Promise<unknown> => {
      f.materialize('1.0.0')
      return { application: 'applied', changed: true, version: '1.0.0' }
    })

    const operation = await finished(f.lifecycle.begin('update', f.item.id))

    expect(operation.phase).toBe('done')
    expect(f.manager.updateBundle).toHaveBeenCalledTimes(1)
    expect(f.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(f.manager.installBundle.mock.calls[0]?.[0]).toBe(`${f.item.package}@1.0.0`)
    expect(readDependencies(f.directory)[f.item.package]).toBe('1.0.0')
    expect(f.lifecycle.states()[0]).toMatchObject({ installation: 'installed', installedVersion: '1.0.0' })
  })
})
