import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadCatalog } from '../src/catalog.ts'
import type { CommandResult, PluginRunner } from '../src/commands.ts'
import { companionAsSkin, updateInstallTarget } from '../src/install-resolution.ts'
import { SkinLifecycle } from '../src/lifecycle.ts'
import { atomicWriteJson, atomicWriteText, npmSourceMigration, packageManifest, readDependencies, readMarketState, writeMarketState } from '../src/profile.ts'
import type { Operation, PersistedMarketState, SkinEntry } from '../src/types.ts'

const temporaryDirectories: string[] = []
const ok = (): CommandResult => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false })

function fixture(): { dir: string; skin: SkinEntry } {
  const dir = mkdtempSync(join(tmpdir(), 'skin-npm-migration-'))
  temporaryDirectories.push(dir)
  const commit = 'a'.repeat(40)
  const skin: SkinEntry = {
    ...loadCatalog().skins[0]!, id: 'migration.skin', package: '@example/migration-skin', rowId: 'migration-skin',
    repo: 'https://github.com/example/migration-skin', subpath: undefined,
    review: { installation: 'verified', preview: 'verified', compatibility: 'verified' },
    install: { target: `github:example/migration-skin#${commit}`, version: '1.0.0', commit,
      npm: { name: '@example/migration-skin', version: '1.0.0', repository: 'https://github.com/example/migration-skin', gitHead: commit, integrity: 'sha512-reviewed' } },
  }
  materialize(dir, skin, skin.install.target)
  return { dir, skin }
}

function materialize(dir: string, skin: SkinEntry, spec: string, version = skin.install.version): void {
  atomicWriteJson(join(dir, 'package.json'), { dependencies: { ...readDependencies(dir), [skin.package]: spec } })
  atomicWriteJson(join(dir, 'node_modules', ...skin.package.split('/'), 'package.json'), {
    name: skin.package, version, repository: skin.repo, dsh: { client: { platform: 'web' } },
  })
  if (spec === skin.install.npm?.version) {
    atomicWriteText(join(dir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\npackages:\n  '${skin.package}@${version}':\n    resolution:\n      integrity: ${skin.install.npm.integrity}\n`)
  }
}

async function finished(operation: Operation): Promise<Operation> {
  for (let index = 0; index < 200; index++) {
    if (['done', 'failed', 'cancelled'].includes(operation.phase)) return operation
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  throw new Error('operation did not finish')
}

function lifecycleFor(dir: string, skin: SkinEntry, runner: PluginRunner = async () => ok()) {
  return new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner, recoveryTimeoutMs: 321 }, [skin])
}

describe('explicit npm migration', () => {
  afterEach(() => { for (const dir of temporaryDirectories.splice(0)) rmSync(dir, { recursive: true, force: true }) })

  it('offers migration only on Web for the currently installed reviewed GitHub release', () => {
    const { dir, skin } = fixture()
    const expected = { target: `${skin.package}@1.0.0`, currentSource: skin.install.target }
    expect(npmSourceMigration(dir, skin)).toEqual(expected)
    expect(lifecycleFor(dir, skin).states()[0]!.sourceMigration).toEqual(expected)
    skin.install.desktop = { mode: 'managed', registry: 'npm', packageName: skin.package, packageVersion: '1.0.0' }
    const desktop = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, hostKind: 'desktop', runner: async () => ok() }, [skin])
    expect(desktop.states()[0]!.sourceMigration).toBeUndefined()
    expect(() => desktop.begin('migrate', skin.id)).toThrow('Desktop 暂不支持')
  })

  it.each(['old-commit', 'wrong-repo', 'wrong-subpath', 'local', 'link', 'npm', 'missing', 'old-version', 'manual-only', 'npm-name', 'npm-version', 'npm-repository', 'npm-gitHead', 'npm-integrity'])('rejects %s without starting a command', invalid => {
    const { dir, skin } = fixture()
    const specs: Record<string, string> = {
      'old-commit': skin.install.target.replace('a'.repeat(40), 'b'.repeat(40)),
      'wrong-repo': skin.install.target.replace('example/', 'other/'),
      'wrong-subpath': `${skin.install.target}&path:/other`,
      local: `file:/tmp/${skin.install.commit}`, link: `link:/tmp/${skin.install.commit}`, npm: '1.0.0',
    }
    if (specs[invalid] !== undefined) materialize(dir, skin, specs[invalid])
    if (invalid === 'missing') atomicWriteJson(join(dir, 'package.json'), { dependencies: {} })
    if (invalid === 'old-version') materialize(dir, skin, skin.install.target, '0.9.0')
    if (invalid === 'manual-only') skin.review!.installation = 'manual-only'
    if (invalid === 'npm-name') skin.install.npm!.name = 'another-package'
    if (invalid === 'npm-version') skin.install.npm!.version = '1.1.0'
    if (invalid === 'npm-repository') skin.install.npm!.repository = 'https://github.com/other/skin'
    if (invalid === 'npm-gitHead') skin.install.npm!.gitHead = 'b'.repeat(40)
    if (invalid === 'npm-integrity') skin.install.npm!.integrity = ''
    let calls = 0
    const lifecycle = lifecycleFor(dir, skin, async () => { calls++; return ok() })
    expect(lifecycle.states()[0]!.sourceMigration).toBeUndefined()
    expect(() => lifecycle.begin('migrate', skin.id)).toThrow()
    expect(calls).toBe(0)
    expect(lifecycle.currentOperation()).toBeNull()
  })

  it('accepts equivalent GitHub subpath selectors but requires the exact reviewed package path', () => {
    const { dir, skin } = fixture()
    skin.subpath = 'packages/skin'
    skin.install.target += '&path:/packages/skin'
    materialize(dir, skin, skin.install.target.replace('&path:/', '&path:'))
    expect(npmSourceMigration(dir, skin)?.target).toBe(`${skin.package}@1.0.0`)
    skin.subpath = 'packages/other'
    expect(npmSourceMigration(dir, skin)).toBeUndefined()
  })

  it.each(['sha1', 'sha256', 'sha384', 'sha512'])('accepts the catalog-supported %s integrity algorithm', algorithm => {
    const { dir, skin } = fixture()
    skin.install.npm!.integrity = `${algorithm}-cmV2aWV3ZWQ=`
    expect(npmSourceMigration(dir, skin)?.target).toBe(`${skin.package}@1.0.0`)
  })

  it.each(['github', 'npm'])('keeps ordinary %s updates on their original source and uses the new reviewed release', async source => {
    const { dir, skin } = fixture()
    const original = source === 'github' ? skin.install.target.replace('a'.repeat(40), 'b'.repeat(40)) : '0.9.0'
    materialize(dir, skin, original, '0.9.0')
    const calls: string[][] = []
    const runner: PluginRunner = async (_profile, args) => {
      calls.push([...args])
      expect(args[0]).toBe('add')
      const directory = args.includes('--dir') ? args[args.indexOf('--dir') + 1]! : dir
      const spec = args[1] === `${skin.package}@1.0.0` ? '1.0.0' : args[1]!
      materialize(directory, skin, spec)
      return ok()
    }
    const lifecycle = lifecycleFor(dir, skin, runner)
    expect((await finished(lifecycle.begin('update', skin.id))).phase).toBe('done')
    const expectedTarget = source === 'github' ? skin.install.target : `${skin.package}@1.0.0`
    expect(calls).toHaveLength(2)
    expect(calls.every(args => args[1] === expectedTarget)).toBe(true)
    expect(readDependencies(dir)[skin.package]).toBe(source === 'github' ? skin.install.target : '1.0.0')
  })

  it('does not silently replace an npm or local installation with GitHub when npm metadata is missing', () => {
    const { skin } = fixture()
    delete skin.install.npm
    expect(() => updateInstallTarget(skin, '0.9.0')).toThrow('无法继续从 npm 更新')
    expect(() => updateInstallTarget(skin, 'link:../skin')).toThrow('本地或自定义')
    expect(() => updateInstallTarget(skin, 'npm:another-package@1.0.0')).toThrow('本地或自定义')
  })

  it.each(['primary', 'pinned', 'inactive'])('migrates the same version while preserving the %s state and ownership records', async active => {
    const { dir, skin } = fixture()
    const companion = { package: 'companion', rowId: 'companion', version: '2.0.0', commit: 'c'.repeat(40), target: `github:example/companion#${'c'.repeat(40)}` }
    skin.install.companions = [companion]
    const existingCompanionSpec = companion.target.replace('c'.repeat(40), 'b'.repeat(40))
    materialize(dir, companionAsSkin(skin, companion), existingCompanionSpec, '1.0.0')
    const state: PersistedMarketState = { version: 1, activeSkinId: active === 'primary' ? skin.id : 'another.skin',
      pinnedSkinIds: active === 'pinned' ? [skin.id] : [], disabledSkinIds: active === 'inactive' ? [skin.id] : [],
      managedCompanions: { companion: { ownerSkinIds: [skin.id, 'another.skin'], installedByMarket: true } },
      managedLoaders: { helper: { id: 'helper', name: 'helper', ownerSkinIds: [skin.id] } },
      activity: { [skin.id]: { installedAt: '2026-01-01T00:00:00Z', usedAt: '2026-02-01T00:00:00Z' } },
    }
    writeMarketState(dir, state)
    const runner: PluginRunner = async (_profile, args) => {
      expect(args[0]).toBe('add')
      expect(args[1]).toBe(`${skin.package}@1.0.0`)
      expect(args).toContain('--save-exact')
      const directory = args.includes('--dir') ? args[args.indexOf('--dir') + 1]! : dir
      materialize(directory, skin, '1.0.0')
      return ok()
    }
    const lifecycle = lifecycleFor(dir, skin, runner)
    const operation = await finished(lifecycle.begin('migrate', skin.id))
    expect(operation.phase).toBe('done')
    expect(operation.message).toContain(active === 'inactive' ? '保留停用状态' : '重启 DSH')
    expect(readDependencies(dir)[skin.package]).toBe('1.0.0')
    expect(readDependencies(dir).companion).toBe(existingCompanionSpec)
    expect(readMarketState(dir)).toMatchObject(state)
    expect(readMarketState(dir).activity?.[skin.id]?.updatedAt).toBe(operation.startedAt)
    expect(lifecycle.states()[0]!.sourceMigration).toBeUndefined()
  })

  it.each(['name', 'version', 'repository', 'gitHead', 'integrity'])('rejects a downloaded npm %s mismatch before touching the live profile', async field => {
    const { dir, skin } = fixture()
    const before = readFileSync(join(dir, 'package.json'), 'utf8')
    let calls = 0
    const runner: PluginRunner = async (_profile, args) => {
      calls++
      expect(args).toContain('--dir')
      const temporary = args[args.indexOf('--dir') + 1]!
      materialize(temporary, skin, '1.0.0')
      if (field === 'integrity') atomicWriteText(join(temporary, 'pnpm-lock.yaml'), 'packages: {}\n')
      else atomicWriteJson(join(temporary, 'node_modules', ...skin.package.split('/'), 'package.json'), { ...packageManifest(temporary, skin.package), [field]: 'unexpected' })
      return ok()
    }
    const operation = await finished(lifecycleFor(dir, skin, runner).begin('migrate', skin.id))
    expect(operation.phase).toBe('failed')
    expect(operation.message).toContain('mismatch')
    expect(calls).toBe(1)
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(before)
  })

  it('restores the GitHub spec, lockfile, patch and market state with one bounded recovery after a failed live migration', async () => {
    const { dir, skin } = fixture()
    writeMarketState(dir, { version: 1, activeSkinId: skin.id, pinnedSkinIds: ['another.skin'], disabledSkinIds: [], managedCompanions: { companion: { ownerSkinIds: [skin.id], installedByMarket: true } } })
    atomicWriteText(join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\npackages: {}\n')
    atomicWriteText(join(dir, 'cordis.patch.yml'), '- id: independent\n  disabled: true\n')
    const files = ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', '.dsh-skin-market/state.json']
    const before = Object.fromEntries(files.map(file => [file, readFileSync(join(dir, file), 'utf8')]))
    let recoveries = 0
    const runner: PluginRunner = async (_profile, args, options) => {
      if (args.includes('--dir')) {
        materialize(args[args.indexOf('--dir') + 1]!, skin, '1.0.0')
        return ok()
      }
      if (args[0] === 'add') {
        materialize(dir, skin, '1.0.0')
        atomicWriteText(join(dir, 'cordis.patch.yml'), 'changed by failed install\n')
        return { ...ok(), exitCode: 1, stderr: 'ERR_PNPM_INVALID_PACKAGE_NAME' }
      }
      expect(args[0]).toBe('install')
      expect(options?.timeoutMs).toBe(321)
      expect(readDependencies(dir)[skin.package]).toBe(skin.install.target)
      expect(readFileSync(join(dir, '.dsh-skin-market/state.json'), 'utf8')).toBe(before['.dsh-skin-market/state.json'])
      recoveries++
      materialize(dir, skin, skin.install.target)
      atomicWriteText(join(dir, 'pnpm-lock.yaml'), 'changed by recovery\n')
      return ok()
    }
    const lifecycle = lifecycleFor(dir, skin, runner)
    expect((await finished(lifecycle.begin('migrate', skin.id))).phase).toBe('failed')
    expect(recoveries).toBe(1)
    for (const file of files) expect(readFileSync(join(dir, file), 'utf8')).toBe(before[file])
    expect(lifecycle.states()[0]!.sourceMigration).toBeDefined()
  })

  it('cancels migration during prefetch without adding or recovering live dependencies', async () => {
    const { dir, skin } = fixture()
    let started = false
    let calls = 0
    const runner: PluginRunner = async (_profile, args, options) => {
      calls++
      expect(args).toContain('--dir')
      started = true
      return await new Promise(resolve => options!.signal!.addEventListener('abort', () => resolve({ ...ok(), exitCode: null, aborted: true }), { once: true }))
    }
    const lifecycle = lifecycleFor(dir, skin, runner)
    const operation = lifecycle.begin('migrate', skin.id)
    for (let index = 0; index < 100 && !started; index++) await new Promise(resolve => setTimeout(resolve, 1))
    expect(started).toBe(true)
    expect(operation.cancelable).toBe(true)
    lifecycle.cancel(operation.id)
    expect((await finished(operation)).phase).toBe('cancelled')
    expect(calls).toBe(1)
    expect(readDependencies(dir)[skin.package]).toBe(skin.install.target)
  })
})
