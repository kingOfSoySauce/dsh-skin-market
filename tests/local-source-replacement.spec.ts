import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { loadCatalog } from '../src/catalog.ts'
import type { CommandResult, PluginRunner } from '../src/commands.ts'
import { SkinLifecycle } from '../src/lifecycle.ts'
import { atomicWriteJson, atomicWriteText, compatibilityPatchFile, ensurePatchedDependency, npmSourceMigration, packageDir, packageManifest, readDependencies, readMarketState, snapshotInstalledArtifact, validateNpmArtifact, writeMarketState } from '../src/profile.ts'
import type { Operation, PersistedMarketState, SkinEntry } from '../src/types.ts'
import { operationWaiter } from './fixtures/operations.ts'

const directories: string[] = []
const ok = (): CommandResult => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false })
const localVersion = '1.1.0-compat.2'
const localClient = 'export const build = "local compatibility build"\n'

function materialize(directory: string, skin: SkinEntry, spec: string, version = skin.install.version, client = 'export const build = "reviewed npm build"\n', integrity = skin.install.npm!.integrity): void {
  const target = packageDir(directory, skin.package)
  const npm = spec === skin.install.version
  const current = JSON.parse(readOptional(join(directory, 'package.json')) ?? '{}') as Record<string, unknown>
  atomicWriteJson(join(directory, 'package.json'), { ...current, dependencies: { ...readDependencies(directory), [skin.package]: spec } })
  atomicWriteJson(join(target, 'package.json'), {
    name: skin.package, version, repository: skin.repo, gitHead: npm ? skin.install.commit : 'b'.repeat(40),
    exports: { './client': './client.js' },
    dsh: { client: { platform: 'web' }, bundle: { patch: './cordis.patch.yml' } },
  })
  atomicWriteText(join(target, 'client.js'), client)
  atomicWriteText(join(target, 'cordis.patch.yml'), stringify([{ insert: [{ id: skin.rowId, name: skin.package }] }]))
  atomicWriteText(join(directory, 'pnpm-lock.yaml'), stringify({
    lockfileVersion: '9.0',
    importers: { '.': { dependencies: { [skin.package]: { specifier: spec, version: npm ? version : spec } } } },
    packages: { [`${skin.package}@${npm ? version : spec}`]: { resolution: { integrity, ...(npm ? {} : { tarball: spec }) } } },
  }))
}

function readOptional(file: string): string | null {
  try { return readFileSync(file, 'utf8') } catch { return null }
}

function fixture(source: 'file' | 'link' = 'file', selection: 'primary' | 'pinned' | 'inactive' = 'primary') {
  const directory = mkdtempSync(join(tmpdir(), 'skin-local-replacement-'))
  directories.push(directory)
  const commit = 'a'.repeat(40)
  const skin: SkinEntry = {
    ...loadCatalog().skins[0]!, id: 'replacement.skin', package: '@example/replacement-skin', rowId: 'replacement-skin',
    repo: 'https://github.com/example/replacement-skin', subpath: undefined,
    review: { installation: 'verified', preview: 'verified', compatibility: 'verified' },
    install: {
      target: `github:example/replacement-skin#${commit}`, version: '1.0.0', commit,
      npm: { name: '@example/replacement-skin', version: '1.0.0', repository: 'https://github.com/example/replacement-skin', gitHead: commit, integrity: 'sha512-cmV2aWV3ZWQ=' },
    },
  }
  const currentSource = source === 'file' ? `file:${join(directory, 'local-skin.tgz')}` : `link:${join(directory, 'local-skin')}`
  materialize(directory, skin, currentSource, localVersion, localClient, 'sha512-bG9jYWw=')
  atomicWriteJson(join(directory, 'package.json'), {
    dependencies: { [skin.package]: currentSource },
    dsh: { profile: { bundles: selection === 'inactive' ? [] : [skin.package] } },
  })
  atomicWriteText(join(directory, 'pnpm-workspace.yaml'), 'onlyBuiltDependencies: []\n')
  atomicWriteText(join(directory, 'cordis.patch.yml'), stringify([{ insert: [{ id: 'independent', name: 'independent-plugin', disabled: true }] }]))
  const state: PersistedMarketState = {
    version: 1, activeSkinId: selection === 'primary' ? skin.id : null,
    pinnedSkinIds: selection === 'pinned' ? [skin.id] : [], disabledSkinIds: selection === 'inactive' ? [skin.id] : [],
    activity: { [skin.id]: { installedAt: '2026-01-01T00:00:00Z', usedAt: '2026-02-01T00:00:00Z' } },
  }
  writeMarketState(directory, state)
  return { directory, skin, currentSource, state }
}

function lifecycleFor(directory: string, skin: SkinEntry, runner: PluginRunner) {
  return new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: directory, runner, recoveryTimeoutMs: 321 }, [skin])
}

function localMigration(directory: string, skin: SkinEntry) {
  const migration = npmSourceMigration(directory, skin)
  if (migration?.kind !== 'local') throw new Error('expected a confirmed local source replacement')
  return migration
}

function migrate(lifecycle: SkinLifecycle, skin: SkinEntry, context?: string): Operation {
  return lifecycle.begin('migrate', skin.id, undefined, false, undefined, undefined, undefined, undefined, undefined, context)
}

const finished = operationWaiter({ attempts: 500, intervalMs: 1, message: 'operation did not finish' })

function profileSnapshot(directory: string, skin: SkinEntry): Record<string, string | null> {
  return Object.fromEntries([
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'cordis.patch.yml', '.dsh-skin-market/state.json',
    join('node_modules', ...skin.package.split('/'), 'package.json'),
    join('node_modules', ...skin.package.split('/'), 'client.js'),
    join('node_modules', ...skin.package.split('/'), 'cordis.patch.yml'),
  ].map(file => [file, readOptional(join(directory, file))]))
}

describe('confirmed replacement of a local skin source', () => {
  afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

  it.each(['file', 'link'] as const)('offers a bound %s replacement with both versions and a downgrade warning', source => {
    const { directory, skin, currentSource } = fixture(source)
    expect(snapshotInstalledArtifact(directory, skin.package).ok).toBe(true)
    const migration = npmSourceMigration(directory, skin)
    expect(migration).toMatchObject({ kind: 'local', target: `${skin.package}@1.0.0`, currentSource, currentVersion: localVersion, targetVersion: '1.0.0', downgrade: true, context: expect.any(String) })
    expect(lifecycleFor(directory, skin, async () => ok()).states()[0]!.sourceMigration).toEqual(migration)
    skin.install.companions = [{ package: 'companion', rowId: 'companion', version: '1.0.0', commit: skin.install.commit, target: skin.install.target }]
    expect(npmSourceMigration(directory, skin)).toBeUndefined()
  })

  it.each(['missing', 'stale'] as const)('rejects a %s confirmation before any command', confirmation => {
    const { directory, skin } = fixture()
    const context = localMigration(directory, skin).context
    if (confirmation === 'stale') atomicWriteText(join(packageDir(directory, skin.package), 'client.js'), 'export const changed = true\n')
    const before = profileSnapshot(directory, skin)
    let calls = 0
    const lifecycle = lifecycleFor(directory, skin, async () => { calls++; return ok() })
    expect(() => migrate(lifecycle, skin, confirmation === 'missing' ? undefined : context)).toThrow()
    expect(calls).toBe(0)
    expect(profileSnapshot(directory, skin)).toEqual(before)
  })

  it.each(['primary', 'pinned', 'inactive'] as const)('installs the exact reviewed npm artifact and preserves the %s selection', async selection => {
    const { directory, skin, state } = fixture('file', selection)
    const calls: string[][] = []
    const runner: PluginRunner = async (_profile, args) => {
      calls.push([...args])
      expect(args[0]).toBe('add')
      expect(args).toContain(`${skin.package}@1.0.0`)
      expect(args).toContain('--save-exact')
      materialize(args.includes('--dir') ? args[args.indexOf('--dir') + 1]! : directory, skin, '1.0.0')
      return ok()
    }
    const lifecycle = lifecycleFor(directory, skin, runner)
    const operation = await finished(migrate(lifecycle, skin, localMigration(directory, skin).context))
    expect(operation.phase, operation.message).toBe('done')
    expect(calls).toHaveLength(2)
    expect(readDependencies(directory)[skin.package]).toBe('1.0.0')
    expect(validateNpmArtifact(directory, { ...skin.install.npm!, gitHead: skin.install.commit })).toMatchObject({ ok: true, integrityVerified: true })
    expect(readMarketState(directory)).toMatchObject(state)
    expect(readMarketState(directory).activity?.[skin.id]?.updatedAt).toBe(operation.startedAt)
    expect(npmSourceMigration(directory, skin)).toBeUndefined()
  })

  it('keeps the confirmed replacement valid while removing its own old compatibility metadata', async () => {
    const { directory, skin } = fixture()
    const patchFile = compatibilityPatchFile(directory, skin.package, localVersion)
    const patch = 'old compatibility patch\n'
    atomicWriteText(patchFile, patch)
    const patchPath = patchFile.slice(directory.length + 1)
    ensurePatchedDependency(directory, skin.package, localVersion, patchPath)
    const lock = parse(readFileSync(join(directory, 'pnpm-lock.yaml'), 'utf8')) as Record<string, unknown>
    lock.patchedDependencies = { [`${skin.package}@${localVersion}`]: { hash: createHash('sha256').update(patch).digest('hex'), path: patchPath } }
    atomicWriteText(join(directory, 'pnpm-lock.yaml'), stringify(lock))
    const runner: PluginRunner = async (_profile, args) => {
      expect(args[0]).toBe('add')
      materialize(args.includes('--dir') ? args[args.indexOf('--dir') + 1]! : directory, skin, '1.0.0')
      return ok()
    }
    const lifecycle = lifecycleFor(directory, skin, runner)
    const operation = await finished(migrate(lifecycle, skin, localMigration(directory, skin).context))
    expect(operation.phase, operation.message).toBe('done')
    expect(readDependencies(directory)[skin.package]).toBe('1.0.0')
    expect(readFileSync(join(directory, 'pnpm-workspace.yaml'), 'utf8')).not.toContain(localVersion)
  })

  it.each([false, true])('preserves an external source edit during metadata preparation, sync failed=%s', async syncFailed => {
    const { directory, skin } = fixture()
    const patchFile = compatibilityPatchFile(directory, skin.package, localVersion)
    const patch = 'compatibility metadata requiring lock synchronization\n'
    atomicWriteText(patchFile, patch)
    const patchPath = patchFile.slice(directory.length + 1)
    ensurePatchedDependency(directory, skin.package, localVersion, patchPath)
    // The workspace has a patch while the lockfile does not, forcing the
    // metadata preparation step to run a real profile install command.
    const context = localMigration(directory, skin).context
    const externalSource = 'link:../new-unconfirmed-local-source'
    let preparations = 0
    let liveAdds = 0
    let recoveries = 0
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        materialize(args[args.indexOf('--dir') + 1]!, skin, '1.0.0')
        return ok()
      }
      if (args[0] === 'add') {
        liveAdds++
        materialize(directory, skin, '1.0.0')
        return ok()
      }
      expect(args[0]).toBe('install')
      if (!args.includes('--no-frozen-lockfile')) {
        recoveries++
        return ok()
      }
      preparations++
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as Record<string, unknown>
      atomicWriteJson(join(directory, 'package.json'), { ...manifest, dependencies: { ...readDependencies(directory), [skin.package]: externalSource } })
      const lock = parse(readFileSync(join(directory, 'pnpm-lock.yaml'), 'utf8')) as Record<string, unknown>
      lock.patchedDependencies = { [`${skin.package}@${localVersion}`]: { hash: createHash('sha256').update(patch).digest('hex'), path: patchPath } }
      atomicWriteText(join(directory, 'pnpm-lock.yaml'), stringify(lock))
      return syncFailed ? { ...ok(), exitCode: 1, stderr: 'ERR_PNPM_INVALID_PACKAGE_NAME' } : ok()
    }
    const lifecycle = lifecycleFor(directory, skin, runner)
    const operation = await finished(migrate(lifecycle, skin, context))
    expect(operation.phase).toBe('failed')
    expect(preparations).toBe(1)
    expect(liveAdds).toBe(0)
    expect(recoveries).toBe(0)
    expect(readDependencies(directory)[skin.package]).toBe(externalSource)
    expect(readFileSync(join(packageDir(directory, skin.package), 'client.js'), 'utf8')).toBe(localClient)
  })

  it.each(['bytes', 'source', 'catalog'] as const)('rejects a changed %s during download without writing the live profile', async changed => {
    const { directory, skin } = fixture()
    const context = localMigration(directory, skin).context
    let downloaded!: () => void
    let release!: () => void
    const downloading = new Promise<void>(resolve => { downloaded = resolve })
    const held = new Promise<void>(resolve => { release = resolve })
    const calls: string[][] = []
    const runner: PluginRunner = async (_profile, args) => {
      calls.push([...args])
      expect(args).toContain('--dir')
      materialize(args[args.indexOf('--dir') + 1]!, skin, '1.0.0')
      downloaded()
      await held
      return ok()
    }
    const lifecycle = lifecycleFor(directory, skin, runner)
    const operation = migrate(lifecycle, skin, context)
    await downloading
    if (changed === 'bytes') atomicWriteText(join(packageDir(directory, skin.package), 'client.js'), 'export const changed = true\n')
    if (changed === 'source') atomicWriteJson(join(directory, 'package.json'), { dependencies: { [skin.package]: 'link:../another-local-build' } })
    if (changed === 'catalog') {
      skin.install.version = '1.0.1'
      skin.install.npm!.version = '1.0.1'
    }
    const before = profileSnapshot(directory, skin)
    release()
    expect((await finished(operation)).phase).toBe('failed')
    expect(calls).toHaveLength(1)
    expect(profileSnapshot(directory, skin)).toEqual(before)
  })

  it('rejects a replacement catalog with changed compatibility while downloading', async () => {
    const { directory, skin, currentSource } = fixture()
    const context = localMigration(directory, skin).context
    let downloaded!: () => void
    let release!: () => void
    const downloading = new Promise<void>(resolve => { downloaded = resolve })
    const held = new Promise<void>(resolve => { release = resolve })
    const calls: string[][] = []
    const runner: PluginRunner = async (_profile, args) => {
      calls.push([...args])
      expect(args).toContain('--dir')
      materialize(args[args.indexOf('--dir') + 1]!, skin, '1.0.0')
      downloaded()
      await held
      return ok()
    }
    const lifecycle = lifecycleFor(directory, skin, runner)
    const operation = migrate(lifecycle, skin, context)
    await downloading
    const replacement = structuredClone(skin)
    replacement.compatibility.dsh = '>=9.0.0'
    await lifecycle.replaceCatalog([replacement])
    const before = profileSnapshot(directory, skin)
    release()
    expect((await finished(operation)).phase).toBe('failed')
    expect(calls).toHaveLength(1)
    expect(readDependencies(directory)[skin.package]).toBe(currentSource)
    expect(profileSnapshot(directory, skin)).toEqual(before)
  })

  it('restores the local source if catalog compatibility changes during live installation', async () => {
    const { directory, skin, currentSource } = fixture()
    const before = profileSnapshot(directory, skin)
    let lifecycle!: SkinLifecycle
    let catalogReplacement: Promise<void> | undefined
    let recoveries = 0
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        materialize(args[args.indexOf('--dir') + 1]!, skin, '1.0.0')
        return ok()
      }
      if (args[0] === 'add') {
        materialize(directory, skin, '1.0.0')
        const replacement = structuredClone(skin)
        replacement.compatibility.dsh = '>=9.0.0'
        // Catalog metadata updates immediately; its replay waits for this
        // installation to release the profile lock.
        catalogReplacement = lifecycle.replaceCatalog([replacement])
        return ok()
      }
      expect(args[0]).toBe('install')
      recoveries++
      materialize(directory, skin, currentSource, localVersion, localClient, 'sha512-bG9jYWw=')
      return ok()
    }
    lifecycle = lifecycleFor(directory, skin, runner)
    const operation = await finished(migrate(lifecycle, skin, localMigration(directory, skin).context))
    await catalogReplacement
    expect(operation.phase).toBe('failed')
    expect(recoveries).toBe(1)
    expect(readDependencies(directory)[skin.package]).toBe(currentSource)
    expect(profileSnapshot(directory, skin)).toEqual(before)
  })

  it('rechecks the confirmed bytes after waiting for another skin to release the profile', async () => {
    const { directory, skin, currentSource } = fixture()
    const other: SkinEntry = { ...structuredClone(skin), id: 'queue.blocker', package: '@example/queue-blocker', rowId: 'queue-blocker' }
    const initialLock = readFileSync(join(directory, 'pnpm-lock.yaml'), 'utf8')
    materialize(directory, other, 'link:../queue-blocker', localVersion, localClient)
    atomicWriteText(join(directory, 'pnpm-lock.yaml'), initialLock)
    let release!: () => void
    let blockerStarted!: () => void
    let downloaded!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const blocking = new Promise<void>(resolve => { blockerStarted = resolve })
    const downloading = new Promise<void>(resolve => { downloaded = resolve })
    const calls: string[][] = []
    const runner: PluginRunner = async (_profile, args) => {
      calls.push([...args])
      if (args[0] === 'remove') {
        blockerStarted()
        await held
        const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
        delete manifest.dependencies[other.package]
        atomicWriteJson(join(directory, 'package.json'), manifest)
        rmSync(packageDir(directory, other.package), { recursive: true, force: true })
        return ok()
      }
      expect(args).toContain('--dir')
      materialize(args[args.indexOf('--dir') + 1]!, skin, '1.0.0')
      downloaded()
      return ok()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: directory, runner }, [skin, other])
    const blocker = lifecycle.begin('uninstall', other.id)
    await blocking
    const operation = migrate(lifecycle, skin, localMigration(directory, skin).context)
    await downloading
    await new Promise<void>(resolve => setImmediate(resolve))
    const client = 'export const changedWhileQueued = true\n'
    atomicWriteText(join(packageDir(directory, skin.package), 'client.js'), client)
    const lock = readFileSync(join(directory, 'pnpm-lock.yaml'), 'utf8')
    release()
    expect((await finished(blocker)).phase).toBe('done')
    expect((await finished(operation)).phase).toBe('failed')
    expect(calls).toHaveLength(2)
    expect(calls.filter(args => args[0] === 'add').every(args => args.includes('--dir'))).toBe(true)
    expect(readDependencies(directory)[skin.package]).toBe(currentSource)
    expect(readFileSync(join(packageDir(directory, skin.package), 'client.js'), 'utf8')).toBe(client)
    expect(readFileSync(join(directory, 'pnpm-lock.yaml'), 'utf8')).toBe(lock)
    expect(readMarketState(directory)).toMatchObject({ activeSkinId: skin.id, pinnedSkinIds: [] })
  })

  it.each(['integrity', 'repository', 'gitHead', 'importer', 'row', 'client'] as const)('rejects a downloaded npm %s mismatch before replacing the local source', async mismatch => {
    const { directory, skin } = fixture()
    const before = profileSnapshot(directory, skin)
    let calls = 0
    const runner: PluginRunner = async (_profile, args) => {
      calls++
      expect(args).toContain('--dir')
      const temporary = args[args.indexOf('--dir') + 1]!
      materialize(temporary, skin, '1.0.0', skin.install.version, undefined, mismatch === 'integrity' ? 'sha512-d3Jvbmc=' : skin.install.npm!.integrity)
      const target = packageDir(temporary, skin.package)
      if (mismatch === 'gitHead') atomicWriteJson(join(target, 'package.json'), { ...packageManifest(temporary, skin.package), gitHead: 'c'.repeat(40) })
      if (mismatch === 'repository') atomicWriteJson(join(target, 'package.json'), { ...packageManifest(temporary, skin.package), repository: 'https://github.com/someone/custom-fork' })
      if (mismatch === 'importer') atomicWriteText(join(temporary, 'pnpm-lock.yaml'), stringify({
        lockfileVersion: '9.0', importers: { '.': { dependencies: { [skin.package]: { specifier: '0.9.0', version: '1.0.0' } } } },
        packages: { [`${skin.package}@1.0.0`]: { resolution: { integrity: skin.install.npm!.integrity } } },
      }))
      if (mismatch === 'row') atomicWriteText(join(target, 'cordis.patch.yml'), stringify([{ insert: [{ id: 'wrong-row', name: skin.package }] }]))
      if (mismatch === 'client') rmSync(join(target, 'client.js'))
      return ok()
    }
    const lifecycle = lifecycleFor(directory, skin, runner)
    expect((await finished(migrate(lifecycle, skin, localMigration(directory, skin).context))).phase).toBe('failed')
    expect(calls).toBe(1)
    expect(profileSnapshot(directory, skin)).toEqual(before)
  })

  it.each([
    { source: 'file', failure: 'command' },
    { source: 'link', failure: 'command' },
    { source: 'file', failure: 'integrity' },
    { source: 'file', failure: 'repository' },
  ] as const)('restores the original $source source, executable bytes and selection after a live $failure failure', async ({ source, failure }) => {
    const { directory, skin, currentSource } = fixture(source)
    const before = profileSnapshot(directory, skin)
    const baseline = snapshotInstalledArtifact(directory, skin.package)
    let recoveries = 0
    const runner: PluginRunner = async (_profile, args, options) => {
      if (args[0] === 'store') return ok()
      if (args.includes('--dir')) {
        materialize(args[args.indexOf('--dir') + 1]!, skin, '1.0.0')
        return ok()
      }
      if (args[0] === 'add') {
        materialize(directory, skin, '1.0.0', skin.install.version, undefined, failure === 'integrity' ? 'sha512-d3Jvbmc=' : skin.install.npm!.integrity)
        if (failure === 'repository') atomicWriteJson(join(packageDir(directory, skin.package), 'package.json'), { ...packageManifest(directory, skin.package), repository: 'https://github.com/someone/custom-fork' })
        if (failure === 'command') {
          atomicWriteText(join(directory, 'cordis.patch.yml'), 'changed by failed replacement\n')
          return { ...ok(), exitCode: 1, stderr: 'ERR_PNPM_INVALID_PACKAGE_NAME' }
        }
        return ok()
      }
      expect(args[0]).toBe('install')
      expect(options?.timeoutMs).toBe(321)
      expect(readDependencies(directory)[skin.package]).toBe(currentSource)
      recoveries++
      materialize(directory, skin, currentSource, localVersion, localClient, 'sha512-bG9jYWw=')
      return ok()
    }
    const lifecycle = lifecycleFor(directory, skin, runner)
    expect((await finished(migrate(lifecycle, skin, localMigration(directory, skin).context))).phase).toBe('failed')
    expect(recoveries).toBe(1)
    expect(profileSnapshot(directory, skin)).toEqual(before)
    expect(snapshotInstalledArtifact(directory, skin.package)).toEqual(baseline)
  })

  it.each([false, true])('retains the original confirmation on network retry and rejects changed context: %s', async changed => {
    const { directory, skin } = fixture()
    let failing = true
    let calls = 0
    const runner: PluginRunner = async (_profile, args) => {
      calls++
      if (failing) return { ...ok(), exitCode: 1, stderr: 'ECONNRESET network request failed' }
      materialize(args.includes('--dir') ? args[args.indexOf('--dir') + 1]! : directory, skin, '1.0.0')
      return ok()
    }
    const lifecycle = lifecycleFor(directory, skin, runner)
    const failed = await finished(migrate(lifecycle, skin, localMigration(directory, skin).context))
    expect(failed).toMatchObject({ phase: 'failed', failure: { action: 'retry' } })
    failing = false
    const beforeRetry = calls
    if (changed) {
      atomicWriteText(join(packageDir(directory, skin.package), 'client.js'), 'export const changed = true\n')
      const before = profileSnapshot(directory, skin)
      expect(() => lifecycle.retry(failed.id, 'retry')).toThrow()
      expect(calls).toBe(beforeRetry)
      expect(profileSnapshot(directory, skin)).toEqual(before)
    } else {
      expect((await finished(lifecycle.retry(failed.id, 'retry'))).phase).toBe('done')
      expect(readDependencies(directory)[skin.package]).toBe('1.0.0')
    }
  })
})
