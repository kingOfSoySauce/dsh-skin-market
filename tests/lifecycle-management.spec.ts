import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse, stringify } from 'yaml'
import { SkinLifecycle } from '../src/lifecycle.ts'
import { compatibilityContext } from '../src/compatibility.ts'
import { exportLogs, sanitizeLogText } from '../src/log.ts'
import { officialDesktopRunner, type OfficialPluginManagerLike } from '../src/official-desktop.ts'
import { atomicWriteJson, atomicWriteText, inspectSkinArtifactRisk, isSkinArtifactRiskAcknowledged, packageDir, profilePatchFile, readDependencies, readMarketState, readProfileBundles, writeMarketState } from '../src/profile.ts'
import type { DshRuntime, LoaderEntry, SkinEntry } from '../src/types.ts'
import { conditionWaiter, operationWaiter } from './fixtures/operations.ts'

const directories: string[] = []
const lifecycles: SkinLifecycle[] = []
const runtime: DshRuntime = { version: '0.2.1-alpha.1', source: 'injected', capabilities: [] }
afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map(lifecycle => lifecycle.dispose()))
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function skin(id: string, version = '1.0.0'): SkinEntry {
  const packageName = `dsh-test-${id}`
  const commit = 'a'.repeat(40)
  const repository = `https://github.com/fixture/${id}`
  const integrity = `sha512-${createHash('sha512').update(`${packageName}@${version}`).digest('base64')}`
  return {
    id, package: packageName, rowId: id, repo: repository, name: { zh: id, en: id },
    author: 'fixture', description: 'Materialized native bundle fixture', category: 'skin', tags: [],
    modes: ['light', 'dark'], screenshots: [], license: { code: 'MIT', commercialUse: true },
    featuredRank: 0, starsSnapshot: 0,
    releaseUpdatedAt: '2026-10-14', metadataUpdatedAt: '2026-10-14', starsUpdatedAt: '2026-10-14', updatedAt: '2026-10-14',
    install: {
      version, commit, target: `github:fixture/${id}#${commit}`,
      npm: { name: packageName, version, integrity, repository, gitHead: commit },
      desktop: { mode: 'managed', registry: 'npm', packageName, packageVersion: version, integrity },
    },
    compatibility: { dsh: '*', platform: ['web'] },
    review: { compatibility: 'verified', preview: 'verified', installation: 'verified' },
  }
}

/** Preserve the original homepage failure: npm/lock SRI is current, Desktop SRI is stale. */
function homepageSkin(): SkinEntry {
  const item = skin('homepage', '1.0.10')
  item.id = 'johnnyting.dsh-official-homepage-theme'
  item.package = item.rowId = 'dsh-official-homepage-theme'
  item.repo = 'https://github.com/JohnnyTing/dsh-official-homepage-theme'
  item.install.commit = '838a882162cdcfb2e72a601905c1f9a08cebbb72'
  item.install.target = `github:JohnnyTing/dsh-official-homepage-theme#${item.install.commit}`
  item.install.npm = {
    name: item.package, version: item.install.version, repository: item.repo, gitHead: item.install.commit,
    integrity: 'sha512-CWs1PXSUDXyVFvJXWJmyD844TcQuzcFBnF+2l16dQl4nWZlRviSevRWl0HEd31u2g7bfiANYhrJ2yqijsEhtbw==',
  }
  item.install.desktop = {
    mode: 'managed', registry: 'npm', packageName: item.package, packageVersion: item.install.version,
    integrity: 'sha512-NNSnPIeK5HHG1ogholwmUEcqtQz/FdJ3CG1UWsRRNlRQbdghf29v1q7/RPb5jaZw8rUz6SLCngqX0zPR05Iolw==',
  }
  return item
}

function deferred<T = unknown>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}

const until = conditionWaiter({ intervalMs: 2, message: 'lifecycle condition did not settle' })
const finished = operationWaiter({ intervalMs: 2, message: 'lifecycle condition did not settle' })

/** The fake Host owns package files and selection, just as the real manager does. */
function fixture(catalog: SkinEntry[], options: { lifecycleWaitMs?: number; hostVersion?: string; saveRange?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-native-lifecycle-'))
  directories.push(directory)
  const originalPatch = `# Preserve user formatting and overrides exactly.\n- id: ${catalog[0]!.rowId}\n  disabled: true\n- id: unrelated-user-row\n  disabled: true\n`
  atomicWriteText(profilePatchFile(directory), originalPatch)
  atomicWriteJson(join(directory, 'package.json'), { private: true, dependencies: {}, dsh: { profile: { bundles: [] } } })
  const entries = new Map<string, LoaderEntry>()
  const componentEnabled = new Map<string, boolean>()
  const manifest = () => JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
    private: boolean; dependencies: Record<string, string>; dsh: { profile: { bundles: string[] } }
  }
  const lockVersions = new Map<string, { version: string; spec: string; integrity: string }>()
  const writeLock = () => atomicWriteText(join(directory, 'pnpm-lock.yaml'), stringify({
    lockfileVersion: '9.0',
    importers: { '.': { dependencies: Object.fromEntries([...lockVersions].map(([name, source]) => [name, { specifier: source.spec, version: source.version }])) } },
    packages: Object.fromEntries([...lockVersions].map(([name, source]) => [`${name}@${source.version}`, { resolution: { integrity: source.integrity } }])),
  }))
  const select = (name: string, enabled: boolean) => {
    const value = manifest()
    value.dsh.profile.bundles = enabled ? [...new Set([...value.dsh.profile.bundles, name])] : value.dsh.profile.bundles.filter(bundle => bundle !== name)
    atomicWriteJson(join(directory, 'package.json'), value)
    const entry = entries.get(name)
    if (entry !== undefined) {
      entry.options.disabled = enabled && componentEnabled.get(name) !== false ? null : true
      entry.fiber = entry.options.disabled === true ? undefined : {}
    }
  }
  const materialize = (item: SkinEntry) => {
    const value = manifest()
    const spec = options.saveRange ? `^${item.install.version}` : item.install.version
    value.dependencies[item.package] = spec
    atomicWriteJson(join(directory, 'package.json'), value)
    const directoryForPackage = packageDir(directory, item.package)
    mkdirSync(join(directoryForPackage, 'lib'), { recursive: true })
    mkdirSync(join(directoryForPackage, 'client'), { recursive: true })
    atomicWriteJson(join(directoryForPackage, 'package.json'), {
      name: item.package, version: item.install.version, repository: item.repo, gitHead: item.install.commit,
      main: 'lib/index.js', exports: { '.': './lib/index.js', './client': './client/client.js' },
      dsh: { client: { platform: 'web' }, bundle: { patch: 'cordis.patch.yml' } },
    })
    atomicWriteText(join(directoryForPackage, 'lib/index.js'), `export const version = '${item.install.version}'\n`)
    atomicWriteText(join(directoryForPackage, 'client/client.js'), `export const version = '${item.install.version}'\n`)
    atomicWriteText(join(directoryForPackage, 'cordis.patch.yml'), `- insert:\n    - id: ${item.rowId}\n      name: ${JSON.stringify(item.package)}\n`)
    lockVersions.set(item.package, { version: item.install.version, spec, integrity: item.install.npm!.integrity })
    writeLock()
    const enabled = readProfileBundles(directory).includes(item.package)
    if (!componentEnabled.has(item.package)) componentEnabled.set(item.package, true)
    const componentLive = enabled && componentEnabled.get(item.package) !== false
    entries.set(item.package, { options: { id: item.rowId, name: item.package, disabled: !componentLive }, fiber: componentLive ? {} : undefined, update: vi.fn(async () => undefined) })
  }
  const applyInstall = (spec: string) => {
    const item = catalog.find(candidate => spec === `${candidate.package}@${candidate.install.version}`)
    if (item === undefined) throw new Error(`unreviewed fake Host install: ${spec}`)
    const existing = readDependencies(directory)[item.package] !== undefined
    materialize(item)
    return { application: existing ? 'restart-required' : 'applied', changed: true, stage: 'apply', target: item.package, bundle: item.package, version: item.install.version }
  }
  const applyEnable = (name: string, enabled: boolean) => {
    select(name, enabled)
    return { application: 'applied', changed: true, stage: 'enable', target: name, enabled }
  }
  const entryId = (name: string) => `loader:${name}`
  const applyComponentEnable = (id: string, enabled: boolean) => {
    const item = catalog.find(item => entryId(item.package) === id)
    if (item === undefined) throw new Error('unknown fixture entryId')
    componentEnabled.set(item.package, enabled)
    select(item.package, readProfileBundles(directory).includes(item.package))
    return { application: 'applied', changed: true, stage: 'enable', target: id, enabled }
  }
  const applyRemove = (name: string) => {
    select(name, false)
    const value = manifest()
    delete value.dependencies[name]
    atomicWriteJson(join(directory, 'package.json'), value)
    lockVersions.delete(name)
    writeLock()
    entries.delete(name)
    rmSync(packageDir(directory, name), { recursive: true, force: true })
    return { application: 'applied', changed: true, stage: 'remove', target: name }
  }
  const manager = {
    installBundle: vi.fn(async (spec: string, _options?: Record<string, unknown>): Promise<unknown> => applyInstall(spec)),
    removeBundle: vi.fn(async (name: string): Promise<unknown> => applyRemove(name)),
    setBundleEnabled: vi.fn(async (name: string, enabled: boolean): Promise<unknown> => applyEnable(name, enabled)),
    setPluginEnabled: vi.fn(async (id: string, enabled: boolean): Promise<unknown> => applyComponentEnable(id, enabled)),
    cancelInstall: vi.fn(async (_requestId: string): Promise<unknown> => ({ status: 'not-running' })),
    waitForInstall: vi.fn(async (_requestId: string): Promise<unknown> => null),
    listPlugins: vi.fn(async (): Promise<unknown> => catalog.filter(item => entries.has(item.package) && readProfileBundles(directory).includes(item.package)).map(item => ({
      entryId: entryId(item.package), patchId: item.rowId, moduleName: item.package, enabled: componentEnabled.get(item.package) !== false, fiberPhase: entries.get(item.package)?.fiber === undefined ? null : 'active',
    }))),
    listBundles: vi.fn(async (): Promise<unknown> => catalog.filter(item => entries.has(item.package)).map(item => ({
      name: item.package, enabled: readProfileBundles(directory).includes(item.package), installed: true,
      rows: [{ rowId: item.rowId, moduleName: item.package, ...(readProfileBundles(directory).includes(item.package) ? { entryId: entryId(item.package) } : {}) }],
    }))),
  } satisfies OfficialPluginManagerLike
  const injectedRuntime = { ...runtime, version: options.hostVersion ?? runtime.version }
  const runner = officialDesktopRunner(() => manager, injectedRuntime)
  const lifecycle = new SkinLifecycle({ loader: { entries: () => entries.values() } }, {
    profile: 'desktop', profileDir: directory, runner, hostKind: 'desktop', runtime: injectedRuntime,
    lifecycleWaitMs: options.lifecycleWaitMs ?? 10,
  }, catalog)
  lifecycles.push(lifecycle)
  return { directory, originalPatch, entries, componentEnabled, entryId, applyComponentEnable, manager, lifecycle, runner, materialize, select, applyInstall, applyEnable, applyRemove, runtime: injectedRuntime }
}

describe('official plugin manager lifecycle', () => {
  it.each(['0.2.0-rc.2', '0.2.1-rc.2'])('keeps the pinned Aqua peer refusal blocked on %s even when the Host offers exemptions', async hostVersion => {
    const item = skin('aqua-host-refusal', '1.3.0')
    item.package = '@deepseek-ai/dsh-client-ui-aqua'
    item.rowId = 'ui-aqua'
    item.repo = 'https://github.com/WYH66666666/DSH-Transparent-UI-Plugin'
    item.install.commit = 'd94431a95bd147c11ef3fe95fa1915d1e96b028b'
    item.install.target = `github:WYH66666666/DSH-Transparent-UI-Plugin#${item.install.commit}`
    item.install.npm = undefined
    item.install.desktop = { mode: 'manual-only', reason: 'npm-package-not-found' }
    item.compatibility.dsh = '^0.1.0-rc.5'
    const host = fixture([item], { hostVersion })
    const setVersionExemption = vi.fn()
    Object.assign(host.manager, { setVersionExemption })
    const incompatible = [{ name: item.package, version: '1.3.0', runtimeVersion: hostVersion, peers: { '@deepseek-ai/dsh-client-runtime': '^0.1.0-rc.5' } }]
    host.manager.installBundle.mockResolvedValueOnce({ application: 'failed', changed: false,
      error: { code: 'incompatible-version', incompatible }, packageResult: { exitCode: 1, incompatible } })
    const failed = await finished(host.lifecycle.begin('install', item.id))
    expect(failed).toMatchObject({ phase: 'failed', failure: { kind: 'compatibility', code: 'incompatible-version' } })
    expect(failed.failure?.action).toBeUndefined()
    expect(() => host.lifecycle.retry(failed.id, 'approve-compatibility' as never)).toThrow('不支持此恢复动作')
    expect(() => host.lifecycle.retry(failed.id, 'retry')).toThrow('不支持此恢复动作')
    expect(setVersionExemption).not.toHaveBeenCalled()
    expect(host.manager.installBundle).toHaveBeenCalledExactlyOnceWith(item.install.target, expect.objectContaining({ enabled: false }))
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(readDependencies(host.directory)).toEqual({})
  })

  const ageRefusal = (name = 'dsh-skin-market', version = '0.1.60') => {
    const output = `[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] 1 lockfile entries failed verification: ${name}@${version} was published at 2026-10-15T07:47:31.608Z, within the minimumReleaseAge cutoff (2026-10-14T08:04:41.370Z)`
    return { changed: false, application: 'failed', stage: 'install', error: { code: 'operation-error', diagnostic: output }, packageResult: { exitCode: 1, kind: 'unknown', output } }
  }

  it('merges already permitted exact versions before the first native installation', async () => {
    const item = skin('age-before-install')
    const host = fixture([item], { hostVersion: '0.2.0-rc.2' })
    const workspace = join(host.directory, 'pnpm-workspace.yaml')
    atomicWriteText(workspace, 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n  - dsh-skin-market@0.1.60\notherSetting: preserve\n')
    host.manager.installBundle.mockImplementationOnce(async spec => {
      expect(parse(readFileSync(workspace, 'utf8'))).toEqual({ minimumReleaseAgeExclude: ['dsh-skin-market@0.1.59 || 0.1.60'], otherSetting: 'preserve' })
      return host.applyInstall(spec)
    })
    const operation = await finished(host.lifecycle.begin('install', item.id))
    expect(operation.phase).toBe('done')
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it('repairs a rule appended during a confirmed failed request and retries exactly once with a fresh request id', async () => {
    const item = skin('age-appended-during-install')
    const host = fixture([item], { hostVersion: '0.2.0-rc.2' })
    const workspace = join(host.directory, 'pnpm-workspace.yaml')
    atomicWriteText(workspace, 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n')
    host.manager.installBundle.mockImplementationOnce(async () => {
      atomicWriteText(workspace, 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n  - dsh-skin-market@0.1.60\n')
      return ageRefusal()
    })
    const operation = await finished(host.lifecycle.begin('install', item.id))
    expect(operation.phase).toBe('done')
    expect(host.manager.installBundle).toHaveBeenCalledTimes(2)
    expect(host.manager.installBundle.mock.calls[0]![1]?.requestId).not.toEqual(host.manager.installBundle.mock.calls[1]![1]?.requestId)
    expect(parse(readFileSync(workspace, 'utf8')).minimumReleaseAgeExclude).toEqual(['dsh-skin-market@0.1.59 || 0.1.60'])
  })

  it('allows only the version named by the failed request when the user explicitly continues', async () => {
    const item = skin('age-exact-approval')
    const host = fixture([item], { hostVersion: '0.2.0-rc.2' })
    const workspace = join(host.directory, 'pnpm-workspace.yaml')
    atomicWriteText(workspace, 'minimumReleaseAge: 1440\nminimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\notherSetting: preserve\n')
    host.manager.installBundle.mockResolvedValueOnce(ageRefusal())
    const failed = await finished(host.lifecycle.begin('install', item.id))
    expect(failed.failure).toMatchObject({ kind: 'release-age', action: 'approve-release-age', releaseAgeTarget: { packageName: 'dsh-skin-market', version: '0.1.60' } })
    expect(() => host.lifecycle.retry(failed.id, 'retry')).toThrow('不支持')
    expect(readFileSync(workspace, 'utf8')).not.toContain('0.1.60')
    const continued = await finished(host.lifecycle.retry(failed.id, 'approve-release-age'))
    expect(continued.phase).toBe('done')
    expect(parse(readFileSync(workspace, 'utf8'))).toEqual({ minimumReleaseAge: 1440, minimumReleaseAgeExclude: ['dsh-skin-market@0.1.59 || 0.1.60'], otherSetting: 'preserve' })
  })

  it('rejects an approval when the skin target changed after the failure', async () => {
    const item = skin('age-stale-approval')
    const host = fixture([item], { hostVersion: '0.2.0-rc.2' })
    const workspace = join(host.directory, 'pnpm-workspace.yaml')
    atomicWriteText(workspace, 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n')
    host.manager.installBundle.mockResolvedValueOnce(ageRefusal())
    const failed = await finished(host.lifecycle.begin('install', item.id))
    await host.lifecycle.replaceCatalog([skin(item.id, '1.0.1')])
    expect(() => host.lifecycle.retry(failed.id, 'approve-release-age')).toThrow('已变化')
    expect(readFileSync(workspace, 'utf8')).not.toContain('0.1.60')
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it('also merges existing rules during startup after an update from another entry point', async () => {
    const host = fixture([skin('age-external-update')])
    const workspace = join(host.directory, 'pnpm-workspace.yaml')
    atomicWriteText(workspace, 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n  - dsh-skin-market@0.1.60\n')
    await host.lifecycle.replay()
    expect(parse(readFileSync(workspace, 'utf8')).minimumReleaseAgeExclude).toEqual(['dsh-skin-market@0.1.59 || 0.1.60'])
    expect(host.manager.installBundle).not.toHaveBeenCalled()
  })

  it.each(['aborted', 'timedOut'] as const)('does not offer approval after a failed age request was %s', async flag => {
    const item = skin(`age-no-approval-${flag}`)
    const host = fixture([item], { hostVersion: '0.2.0-rc.2' })
    atomicWriteText(join(host.directory, 'pnpm-workspace.yaml'), 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n')
    host.manager.installBundle.mockResolvedValueOnce(ageRefusal())
    const nativeInstall = host.runner.installPlugin!
    host.runner.installPlugin = async (...args) => ({ ...await nativeInstall(...args), [flag]: true })
    const operation = await finished(host.lifecycle.begin('install', item.id))
    expect(operation.failure?.kind).toBe('release-age')
    expect(operation.failure?.action).toBeUndefined()
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it('completes a partially materialized exact install when the named new age exception was shadowed', async () => {
    const item = skin('age-partial-artifact')
    const host = fixture([item], { hostVersion: '0.2.0-rc.2' })
    const workspace = join(host.directory, 'pnpm-workspace.yaml')
    atomicWriteText(workspace, 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n')
    host.manager.installBundle.mockImplementationOnce(async spec => {
      host.applyInstall(spec)
      atomicWriteText(workspace, 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n  - dsh-skin-market@0.1.60\n')
      return ageRefusal()
    })
    const operation = await finished(host.lifecycle.begin('install', item.id))
    expect(operation.phase).toBe('done')
    expect(host.manager.installBundle).toHaveBeenCalledTimes(2)
    expect(parse(readFileSync(workspace, 'utf8')).minimumReleaseAgeExclude).toEqual(['dsh-skin-market@0.1.59 || 0.1.60'])
  })

  it('does not repeat a partial failed install when its terminal failure is unrelated to the repaired rules', async () => {
    const item = skin('age-unrelated-partial-artifact')
    const host = fixture([item], { hostVersion: '0.2.0-rc.2' })
    const workspace = join(host.directory, 'pnpm-workspace.yaml')
    atomicWriteText(workspace, 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n')
    host.manager.installBundle.mockImplementationOnce(async spec => {
      host.applyInstall(spec)
      atomicWriteText(workspace, 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n  - dsh-skin-market@0.1.60\n')
      return { application: 'failed', error: { message: '磁盘空间不足' }, packageResult: { exitCode: 1, kind: 'disk-full', output: 'ENOSPC' } }
    })
    const operation = await finished(host.lifecycle.begin('install', item.id))
    expect(operation.phase).toBe('failed')
    expect(operation.message).toContain('构件与原有版本不一致')
    expect(operation.failure?.action).toBeUndefined()
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it('revalidates the failed approval after entering the profile queue and before writing', async () => {
    const item = skin('age-approval-queue-race')
    const host = fixture([item], { hostVersion: '0.2.0-rc.2' })
    const workspace = join(host.directory, 'pnpm-workspace.yaml')
    atomicWriteText(workspace, 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n')
    host.manager.installBundle.mockResolvedValueOnce(ageRefusal())
    const failed = await finished(host.lifecycle.begin('install', item.id))
    const continued = host.lifecycle.retry(failed.id, 'approve-release-age')
    failed.failure!.releaseAgeTarget!.version = '0.1.61'
    await finished(continued)
    expect(continued.phase).toBe('failed')
    expect(continued.message).toContain('已变化')
    expect(readFileSync(workspace, 'utf8')).not.toContain('0.1.60')
    expect(readFileSync(workspace, 'utf8')).not.toContain('0.1.61')
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it('offers exact approval after the native age check leaves new files behind a rolled-back manifest', async () => {
    const item = skin('age-partial-needs-approval')
    const host = fixture([item], { hostVersion: '0.2.0-rc.2' })
    const workspace = join(host.directory, 'pnpm-workspace.yaml')
    atomicWriteText(workspace, 'minimumReleaseAge: 1440\nminimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n')
    const beforeManifest = readFileSync(join(host.directory, 'package.json'), 'utf8')
    host.manager.installBundle.mockImplementationOnce(async spec => {
      host.applyInstall(spec)
      atomicWriteText(join(host.directory, 'package.json'), beforeManifest)
      rmSync(join(host.directory, 'pnpm-lock.yaml'), { force: true })
      return ageRefusal()
    })
    const failed = await finished(host.lifecycle.begin('install', item.id))
    expect(failed.failure).toMatchObject({ action: 'approve-release-age', releaseAgeTarget: { packageName: 'dsh-skin-market', version: '0.1.60' } })
    expect(readFileSync(workspace, 'utf8')).not.toContain('0.1.60')
    const retried = await finished(host.lifecycle.retry(failed.id, 'approve-release-age'))
    expect(retried.phase).toBe('done')
    expect(host.manager.installBundle).toHaveBeenCalledTimes(2)
    expect(parse(readFileSync(workspace, 'utf8'))).toEqual({ minimumReleaseAge: 1440, minimumReleaseAgeExclude: ['dsh-skin-market@0.1.59 || 0.1.60'] })
  })

  it('saves the exact approval even if the failed install already left a fully verified target on disk', async () => {
    const item = skin('age-verified-target-needs-approval')
    const host = fixture([item], { hostVersion: '0.2.0-rc.2' })
    const workspace = join(host.directory, 'pnpm-workspace.yaml')
    atomicWriteText(workspace, 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n')
    host.manager.installBundle.mockImplementationOnce(async spec => { host.applyInstall(spec); return ageRefusal() })
    const failed = await finished(host.lifecycle.begin('install', item.id))
    expect(failed.failure?.action).toBe('approve-release-age')
    const retried = await finished(host.lifecycle.retry(failed.id, 'approve-release-age'))
    expect(retried.phase).toBe('done')
    expect(parse(readFileSync(workspace, 'utf8')).minimumReleaseAgeExclude).toEqual(['dsh-skin-market@0.1.59 || 0.1.60'])
  })

  it.each([
    ['pnpm-missing', 'pnpm-missing', 'spawn pnpm ENOENT'],
    ['timeout', 'fetch-timeout', 'download did not finish'],
    ['not-found', 'fetch-404', 'No package found'],
    ['no-matching-version', 'no-matching-version', 'No matching version found'],
    ['network', 'network', 'ECONNRESET'],
    ['disk-full', 'disk-full', 'ENOSPC'],
    ['permission', 'permission', 'EACCES'],
    ['build-blocked', 'build-approval', 'Ignored build scripts: native-addon@1.0.0'],
    ['integrity', 'integrity', 'Package integrity mismatch'],
    ['unknown', 'lockfile-outdated', 'ERR_PNPM_OUTDATED_LOCKFILE Cannot install with frozen-lockfile'],
    ['unknown', 'lockfile-broken', 'ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY Missing record'],
    ['unknown', 'unexpected-store', 'ERR_PNPM_UNEXPECTED_STORE Unexpected store location'],
    ['network', 'lockfile-broken', 'WARN ECONNRESET will retry\nERR_PNPM_LOCKFILE_MISSING_DEPENDENCY Missing record'],
    ['unknown', 'command', 'An unrecognized package failure'],
  ])('preserves the official %s failure as %s without repeating the installation', async (nativeKind, expectedKind, diagnostic) => {
    const item = skin(`failure-${nativeKind}-${expectedKind}`)
    const host = fixture([item], { hostVersion: '0.2.0-rc.2' })
    const output = `Progress: resolved 24, reused 18, downloaded 6\n${diagnostic}\nOperation stopped`
    host.manager.installBundle.mockResolvedValueOnce({
      changed: false, application: 'failed', stage: 'install', target: `${item.package}@1.0.0`,
      error: { code: 'operation-error', diagnostic: output },
      packageResult: { exitCode: 1, output, kind: nativeKind, truncated: false, logPath: '/tmp/fixture.log' },
      // The official manager can report unrelated pending scripts after any failure.
      pendingBuilds: ['native-addon'], registries: [null],
    })
    const operation = await finished(host.lifecycle.begin('install', item.id))
    expect(operation).toMatchObject({ phase: 'failed', application: 'failed', failure: { kind: expectedKind } })
    expect(operation.message).not.toContain('Progress: resolved')
    expect(operation.message).not.toContain('已自动重试')
    expect(exportLogs({}, operation.id)).toContain(sanitizeLogText(diagnostic))
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(readDependencies(host.directory)).toEqual({})
    if (expectedKind === 'build-approval') expect(operation.failure).toMatchObject({ buildKeys: ['native-addon'], action: 'approve-build' })
    else expect(operation.failure?.buildKeys).toBeUndefined()
    if (expectedKind === 'network' || expectedKind === 'fetch-timeout') expect(operation.failure?.action).toBe('retry')
    else if (expectedKind !== 'build-approval') expect(operation.failure?.action).toBeUndefined()
  })

  it('uses the supplied short error message and retains the full official diagnostic only in logs', async () => {
    const item = skin('official-short-message')
    const host = fixture([item])
    host.manager.installBundle.mockResolvedValueOnce({
      changed: false, application: 'failed', stage: 'install',
      error: { code: 'operation-error', message: '连接安装源失败', diagnostic: 'Progress: resolved 24\nECONNRESET registry.example.test' },
      packageResult: { exitCode: 1, kind: 'network', output: 'GET registry.example.test failed' },
    })
    const operation = await finished(host.lifecycle.begin('install', item.id))
    expect(operation).toMatchObject({ message: '连接安装源失败', failure: { kind: 'network', message: '连接安装源失败' } })
    expect(exportLogs({}, operation.id)).toContain('ECONNRESET registry.example.test')
  })

  it('sanitizes a supplied short error message before exposing it to the client', async () => {
    const item = skin('official-message-redaction')
    const host = fixture([item])
    host.manager.installBundle.mockResolvedValueOnce({
      application: 'failed', stage: 'install',
      error: { code: 'operation-error', message: '连接失败：https://fixture:fixture-password@registry.example.test/package?token=fixture-token', diagnostic: 'ECONNRESET' },
      packageResult: { exitCode: 1, kind: 'network', output: 'ECONNRESET' },
    })
    const operation = await finished(host.lifecycle.begin('install', item.id))
    expect(operation.failure?.message).toContain('连接失败')
    expect(operation.failure?.message).not.toContain('fixture-password')
    expect(operation.failure?.message).not.toContain('fixture-token')
    expect(operation.message).toBe(operation.failure?.message)
  })

  it('uses the terminal unclassified Error context instead of a recovered earlier network warning', async () => {
    const item = skin('official-unknown-terminal-error')
    const host = fixture([item])
    const output = '[WARN] GET registry.example.test error (ECONNRESET). Will retry in 10 seconds.\n'
      + 'Progress: resolved 24\nError: Unsupported manifest extension .skin\n    at install (/tmp/fixture.js:1:1)'
    host.manager.installBundle.mockResolvedValueOnce({
      application: 'failed', stage: 'install', error: { code: 'operation-error', diagnostic: output },
      packageResult: { exitCode: 1, kind: 'unknown', output }, pendingBuilds: ['unrelated-addon'],
    })
    const operation = await finished(host.lifecycle.begin('install', item.id))
    expect(operation).toMatchObject({ application: 'failed', failure: { kind: 'command', message: 'Error: Unsupported manifest extension .skin' } })
    expect(operation.failure?.action).toBeUndefined()
    expect(operation.failure?.buildKeys).toBeUndefined()
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it('explains that a higher-priority disable override must be removed instead of asking for another restart', async () => {
    const item = skin('official-disable-override')
    const host = fixture([item])
    host.materialize(item)
    host.componentEnabled.set(item.package, false)
    host.manager.setPluginEnabled.mockResolvedValueOnce({ application: 'overridden', enabled: true })
    const operation = await finished(host.lifecycle.begin('activate', item.id))
    expect(operation).toMatchObject({ phase: 'failed', application: 'overridden', failure: { kind: 'configuration-override', desiredEnabled: true, targetSkinId: item.id } })
    expect(operation.message).toContain('目标皮肤被其他设置禁用')
    expect(operation.message).toContain('请解除禁用后重新使用')
    expect(operation.message).not.toContain('重启')
  })

  it.each(['within minimumReleaseAge cutoff', 'within the minimumReleaseAge cutoff'])('reports the terminal whole-lockfile policy refusal with the actual wording: %s', async cutoffPhrase => {
    const item = skin('whole-lockfile-policy')
    const host = fixture([item], { hostVersion: '0.2.0-rc.2' })
    const output = 'WARN GET https://registry.npmmirror.com/fixture error (ECONNRESET). Will retry in 10 seconds.\n'
      + 'Progress: resolved 24, reused 18, downloaded 6\n'
      + `[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] 1 lockfile entries failed verification: dsh-skin-market@0.1.60 was published at 2026-10-15T07:47:31.608Z, ${cutoffPhrase} (2026-10-14T08:04:41.370Z)`
    host.manager.installBundle.mockResolvedValueOnce({
      changed: false, application: 'failed', stage: 'install', target: `${item.package}@1.0.0`,
      error: { code: 'operation-error', diagnostic: output }, packageResult: { exitCode: 1, kind: 'network', output },
      pendingBuilds: ['native-addon'],
    })
    const operation = await finished(host.lifecycle.begin('install', item.id))
    expect(operation).toMatchObject({ phase: 'failed', application: 'failed', failure: { kind: 'release-age', packageName: 'dsh-skin-market' } })
    expect(operation.message).toContain('dsh-skin-market@0.1.60')
    expect(operation.message).toContain('新包保护期')
    expect(operation.message).not.toContain('网络')
    expect(operation.failure?.action).toBe('approve-release-age')
    expect(operation.failure?.buildKeys).toBeUndefined()
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it('keeps an unclassified terminal error useful, sanitized and bounded instead of replacing it with a generic message', async () => {
    const item = skin('unclassified-summary')
    const host = fixture([item])
    const detail = `Unsupported manifest extension at https://fixture:fixture-password@registry.example.test/package?token=fixture-token ${'detail '.repeat(60)}`
    host.manager.installBundle.mockResolvedValueOnce({
      changed: false, application: 'failed', stage: 'install',
      error: { code: 'operation-error', diagnostic: `Progress: resolved 24\nError: ${detail}\n    at install (/tmp/fixture.js:1:1)` },
      packageResult: { exitCode: 1, kind: 'unknown', output: '' },
    })
    const operation = await finished(host.lifecycle.begin('install', item.id))
    expect(operation.failure?.kind).toBe('command')
    expect(operation.message).toContain('Unsupported manifest extension')
    expect(operation.message).not.toContain('fixture-password')
    expect(operation.message).not.toContain('fixture-token')
    expect(operation.message!.length).toBeLessThanOrEqual(240)
    expect(operation.message).not.toContain('Progress:')
    expect(operation.message).not.toContain('at install')
    expect(operation.failure?.action).toBeUndefined()
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it('recognizes a manager-terminated script without treating a trapped exit code of zero as success', async () => {
    const item = skin('official-script-timeout')
    const host = fixture([item])
    host.manager.installBundle.mockResolvedValueOnce({
      changed: false, application: 'failed', stage: 'install', error: { code: 'operation-error' },
      packageResult: { exitCode: 0, timedOut: true, kind: 'timeout', output: 'node_modules/native-addon postinstall: downloading\nprinted nothing for 600000ms and was terminated' },
    })
    const operation = await finished(host.lifecycle.begin('install', item.id))
    expect(operation).toMatchObject({ phase: 'failed', application: 'failed', failure: { kind: 'script-timeout', packageName: 'native-addon' } })
    expect(operation.failure?.action).toBeUndefined()
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it('repairs the selected bundle main component without enabling other components or touching pinned selections', async () => {
    const target = skin('component-target'), current = skin('component-old'), pinned = skin('component-pinned')
    const host = fixture([target, current, pinned], { hostVersion: '0.2.0-rc.2' })
    for (const item of [target, current, pinned]) host.materialize(item)
    host.select(current.package, true); host.select(pinned.package, true)
    host.componentEnabled.set(target.package, false)
    const inventory = host.manager.listPlugins.getMockImplementation()!
    host.manager.listPlugins.mockImplementation(async () => [...await inventory() as object[], {
      entryId: 'unrelated-feature-entry', patchId: 'extra-feature', moduleName: target.package, enabled: false,
    }])
    const bundles = host.manager.listBundles.getMockImplementation()!
    host.manager.listBundles.mockImplementation(async () => (await bundles() as Array<Record<string, unknown>>).map(bundle => bundle.name !== target.package ? bundle : {
      ...bundle, rows: [...bundle.rows as object[], { rowId: 'extra-feature', moduleName: target.package, entryId: 'unrelated-feature-entry' }],
    }))
    writeMarketState(host.directory, { version: 1, activeSkinId: current.id, disabledSkinIds: [target.id], pinnedSkinIds: [pinned.id] })

    const operation = await finished(host.lifecycle.begin('activate', target.id))
    expect(operation).toMatchObject({ phase: 'done', application: 'applied' })
    expect(operation.restartRequired).not.toBe(true)
    expect(host.manager.setPluginEnabled).toHaveBeenCalledExactlyOnceWith(host.entryId(target.package), true)
    expect(host.componentEnabled.get(target.package)).toBe(true)
    expect(readProfileBundles(host.directory).sort()).toEqual([target.package, pinned.package].sort())
    expect(host.lifecycle.states().find(state => state.skinId === target.id)).toMatchObject({ activation: 'active', primary: true })
    host.manager.setBundleEnabled.mockClear(); host.manager.setPluginEnabled.mockClear()
    await host.lifecycle.replay()
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
  })

  it('preserves a natively disabled component during automatic replay despite the saved market selection', async () => {
    const target = skin('component-restart')
    const host = fixture([target], { hostVersion: '0.2.0-rc.2' })
    host.materialize(target)
    host.componentEnabled.set(target.package, false); host.select(target.package, true)
    // A residual fiber must never make an explicitly disabled component live.
    host.entries.get(target.package)!.fiber = {}
    writeMarketState(host.directory, { version: 1, activeSkinId: target.id, disabledSkinIds: [] })
    expect(host.lifecycle.states().find(state => state.skinId === target.id)).toMatchObject({ activation: 'unavailable', error: expect.stringContaining('组件已关闭') })
    await host.lifecycle.replay()
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
    expect(readMarketState(host.directory).pendingRestart).toBeUndefined()
    expect((await host.lifecycle.runtimeStates()).find(state => state.skinId === target.id)).toMatchObject({ activation: 'unavailable', error: expect.stringContaining('组件已关闭') })
  })

  it.each(['duplicate-plugin', 'duplicate-bundle-row', 'mismatched-entry', 'read-only'] as const)('fails closed for %s instead of guessing a component identity', async ambiguity => {
    const target = skin('component-ambiguous'), current = skin('component-current')
    const host = fixture([target, current])
    host.materialize(target); host.materialize(current); host.select(current.package, true)
    host.componentEnabled.set(target.package, false)
    writeMarketState(host.directory, { version: 1, activeSkinId: current.id, disabledSkinIds: [target.id] })
    if (ambiguity === 'duplicate-plugin' || ambiguity === 'read-only') {
      const inventory = host.manager.listPlugins.getMockImplementation()!
      host.manager.listPlugins.mockImplementation(async () => (await inventory() as Array<Record<string, unknown>>).flatMap(row => row.moduleName !== target.package ? [row] : ambiguity === 'duplicate-plugin' ? [row, { ...row, entryId: 'another-entry' }] : [{ ...row, readOnlyReason: 'unaddressable' }]))
    } else {
      const bundles = host.manager.listBundles.getMockImplementation()!
      host.manager.listBundles.mockImplementation(async () => (await bundles() as Array<Record<string, unknown>>).map(bundle => bundle.name !== target.package ? bundle : {
        ...bundle, rows: ambiguity === 'duplicate-bundle-row' ? [...bundle.rows as object[], ...(bundle.rows as object[])] : (bundle.rows as object[]).map(row => ({ ...row, entryId: 'wrong-entry' })),
      }))
    }
    expect(await finished(host.lifecycle.begin('activate', target.id))).toMatchObject({ phase: 'failed' })
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
    expect(readMarketState(host.directory).activeSkinId).toBe(current.id)
    expect(readProfileBundles(host.directory)).toEqual([current.package])
  })

  it.each(['failed', 'overridden'] as const)('restores the original component toggle as well as selection when enabling is %s', async application => {
    const target = skin('component-failure'), current = skin('component-original')
    const host = fixture([target, current])
    host.materialize(target); host.materialize(current); host.select(current.package, true)
    host.componentEnabled.set(target.package, false)
    writeMarketState(host.directory, { version: 1, activeSkinId: current.id, disabledSkinIds: [target.id] })
    host.manager.setPluginEnabled.mockImplementationOnce(async (entryId, enabled) => ({ ...host.applyComponentEnable(entryId, enabled), application, error: { code: 'reload-failed', message: 'component toggle rejected' } }))
    expect(await finished(host.lifecycle.begin('activate', target.id))).toMatchObject({ phase: 'failed', application })
    expect(host.componentEnabled.get(target.package)).toBe(false)
    expect(host.manager.setPluginEnabled.mock.calls).toEqual([[host.entryId(target.package), true], [host.entryId(target.package), false]])
    expect(readMarketState(host.directory).activeSkinId).toBe(current.id)
    expect(readProfileBundles(host.directory)).toEqual([current.package])
  })

  it('waits on an unknown component result and performs no guessed rollback writes', async () => {
    const target = skin('component-unknown')
    const host = fixture([target])
    host.materialize(target); host.componentEnabled.set(target.package, false)
    host.manager.setPluginEnabled.mockResolvedValueOnce(null)
    const operation = host.lifecycle.begin('activate', target.id)
    await until(() => operation.phase === 'waiting')
    expect(host.manager.setPluginEnabled).toHaveBeenCalledExactlyOnceWith(host.entryId(target.package), true)
    expect(host.lifecycle.waitingReason).toContain('重新打开宿主')
    expect(() => host.lifecycle.begin('pin', target.id)).toThrow('重新打开宿主')
    expect(readMarketState(host.directory).activeSkinId).toBeNull()
  })

  it('leaves an already-correct active selection alone on repeated use', async () => {
    const target = skin('component-already-on')
    const host = fixture([target])
    host.materialize(target); host.select(target.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: target.id, disabledSkinIds: [] })
    const operation = await finished(host.lifecycle.begin('activate', target.id))
    expect(operation.phase).toBe('done')
    expect(operation.restartRequired).not.toBe(true)
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
    expect(readMarketState(host.directory).pendingRestart).toBeUndefined()
  })

  it('records a component restart requirement only after an explicit use action, not startup replay', async () => {
    const target = skin('component-startup-restart')
    const host = fixture([target])
    host.materialize(target); host.componentEnabled.set(target.package, false); host.select(target.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: target.id, disabledSkinIds: [] })
    host.manager.setPluginEnabled.mockImplementationOnce(async (entryId, enabled) => ({ ...host.applyComponentEnable(entryId, enabled), application: 'restart-required' }))
    await host.lifecycle.replay()
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
    expect(readMarketState(host.directory).pendingRestart).toBeUndefined()
    expect(await finished(host.lifecycle.begin('activate', target.id))).toMatchObject({ phase: 'done', restartRequired: true })
    expect(readMarketState(host.directory).pendingRestart).toMatchObject({ pid: process.pid, skinIds: [target.id] })
    expect(host.lifecycle.states().find(state => state.skinId === target.id)).toMatchObject({ activation: 'restart-required', error: undefined })
  })

  it('retains a genuine native removal restart requirement even after the package is missing', async () => {
    const target = skin('component-remove-restart')
    const host = fixture([target])
    host.materialize(target)
    host.manager.removeBundle.mockImplementationOnce(async name => ({ ...host.applyRemove(name), application: 'restart-required' }))
    expect(await finished(host.lifecycle.begin('uninstall', target.id))).toMatchObject({ phase: 'done', restartRequired: true })
    expect(readMarketState(host.directory).pendingRestart).toMatchObject({ pid: process.pid, skinIds: [target.id] })
    expect(host.lifecycle.states().find(state => state.skinId === target.id)).toMatchObject({ installation: 'missing', activation: 'restart-required' })
    writeMarketState(host.directory, { ...readMarketState(host.directory), pendingRestart: { pid: process.pid - 1, skinIds: [target.id] } })
    await host.lifecycle.replay()
    expect(readMarketState(host.directory).pendingRestart).toBeUndefined()
    expect(host.lifecycle.states().find(state => state.skinId === target.id)).toMatchObject({ installation: 'missing', activation: 'inactive' })
  })

  it.each(['saved-import', 'unsaved-import', 'initialization'] as const)('only retains a confirmed saved old-host component selection for %s', async outcome => {
    const target = skin('component-old-import'), current = skin('component-old-current')
    const host = fixture([target, current], { hostVersion: '0.2.0-rc.2' })
    host.materialize(current); host.select(current.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: current.id, disabledSkinIds: [target.id] })
    await finished(host.lifecycle.begin('install', target.id))
    host.componentEnabled.set(target.package, false)
    host.manager.setPluginEnabled.mockImplementationOnce(async (entryId, enabled) => {
      if (outcome !== 'unsaved-import') host.applyComponentEnable(entryId, enabled)
      return { application: 'failed', changed: true, stage: 'enable', target: entryId, enabled, error: {
        code: 'operation-error', diagnostic: `dsh: warning: 1 entry did not activate\n${target.rowId} (${target.package}): ${outcome === 'initialization' ? 'Error: plugin initialization failed' : 'failed to import'}`,
      } }
    })
    const operation = await finished(host.lifecycle.begin('activate', target.id))
    if (outcome === 'saved-import') {
      expect(operation).toMatchObject({ phase: 'done', application: 'restart-required', restartRequired: true })
      expect(readMarketState(host.directory).activeSkinId).toBe(target.id)
      expect(readProfileBundles(host.directory)).toEqual([target.package])
      expect(host.componentEnabled.get(target.package)).toBe(true)
    } else {
      expect(operation).toMatchObject({ phase: 'failed', application: 'failed' })
      expect(readMarketState(host.directory).activeSkinId).toBe(current.id)
      expect(readProfileBundles(host.directory)).toEqual([current.package])
      expect(host.componentEnabled.get(target.package)).toBe(false)
    }
  })

  it.each([
    { enabled: true, phase: 'active', activation: 'active', diagnostic: undefined },
    { enabled: false, phase: 'active', activation: 'unavailable', diagnostic: '组件已关闭' },
    { enabled: true, phase: 'failed', activation: 'unavailable', diagnostic: '加载失败' },
    { enabled: true, phase: null, activation: 'unavailable', diagnostic: '尚未运行' },
    { enabled: true, phase: 'loading', activation: 'switching', diagnostic: '正在加载' },
    { enabled: true, phase: 'pending', activation: 'switching', diagnostic: '等待所需服务' },
  ])('uses official enabled=$enabled/fiberPhase=$phase instead of the mere existence of a fiber', async ({ enabled, phase, activation, diagnostic }) => {
    const target = skin('official-runtime')
    const host = fixture([target])
    host.materialize(target); host.select(target.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: target.id, disabledSkinIds: [] })
    host.manager.listPlugins.mockResolvedValueOnce([{ entryId: host.entryId(target.package), patchId: target.rowId, moduleName: target.package, enabled, fiberPhase: phase }])
    const state = (await host.lifecycle.runtimeStates()).find(state => state.skinId === target.id)!
    expect(state.activation).toBe(activation)
    if (diagnostic === undefined) expect(state.error).toBeUndefined()
    else expect(state.error).toContain(diagnostic)
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
  })

  it.each(['0.2.1-rc.1', '0.2.1-rc.2'])('reads component states on DSH %s without reporting a missing plugin inventory', async hostVersion => {
    const active = skin('rc1-active'), inactive = skin('rc1-inactive')
    const host = fixture([active, inactive], { hostVersion })
    host.materialize(active); host.materialize(inactive); host.select(active.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: active.id, pinnedSkinIds: [], disabledSkinIds: [inactive.id] })
    const before = [join(host.directory, 'package.json'), join(host.directory, 'pnpm-lock.yaml'), profilePatchFile(host.directory)].map(path => readFileSync(path, 'utf8'))
    const selection = readMarketState(host.directory)
    const states = await host.lifecycle.runtimeStates()
    expect(states.find(state => state.skinId === active.id)).toMatchObject({ activation: 'active', error: undefined })
    expect(states.find(state => state.skinId === inactive.id)?.activation).toBe('inactive')
    expect(states.find(state => state.skinId === inactive.id)?.error).toBeUndefined()
    expect(host.manager.listPlugins).toHaveBeenCalledOnce()
    host.manager.listPlugins.mockResolvedValueOnce([{ entryId: host.entryId(active.package), patchId: active.rowId, moduleName: active.package, enabled: true, fiberPhase: 'failed' }])
    expect((await host.lifecycle.runtimeStates()).find(state => state.skinId === active.id)).toMatchObject({ activation: 'unavailable', error: expect.stringContaining('加载失败') })
    expect([join(host.directory, 'package.json'), join(host.directory, 'pnpm-lock.yaml'), profilePatchFile(host.directory)].map(path => readFileSync(path, 'utf8'))).toEqual(before)
    expect(readMarketState(host.directory)).toEqual(selection)
    for (const method of [host.manager.installBundle, host.manager.removeBundle, host.manager.setBundleEnabled, host.manager.setPluginEnabled]) expect(method).not.toHaveBeenCalled()
  })

  it('reads an unaddressable component for diagnosis without treating it as writable', async () => {
    const target = skin('official-runtime-readonly')
    const host = fixture([target])
    host.materialize(target); host.select(target.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: target.id, disabledSkinIds: [] })
    host.manager.listPlugins.mockResolvedValueOnce([{ entryId: host.entryId(target.package), moduleName: target.package, readOnlyReason: 'unaddressable', enabled: true, fiberPhase: 'failed' }])
    expect((await host.lifecycle.runtimeStates())[0]).toMatchObject({ activation: 'unavailable', error: expect.stringContaining('加载失败') })
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
  })

  it('diagnoses a failed official inventory read without guessing active or overwriting a genuine restart', async () => {
    const current = skin('official-runtime-error'), pinned = skin('official-runtime-pending')
    const host = fixture([current, pinned])
    host.materialize(current); host.materialize(pinned); host.select(current.package, true); host.select(pinned.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: current.id, pinnedSkinIds: [pinned.id], disabledSkinIds: [], pendingRestart: { pid: process.pid, skinIds: [pinned.id] } })
    const before = readMarketState(host.directory)
    host.manager.listPlugins.mockRejectedValueOnce(new Error('inventory unavailable'))
    const states = await host.lifecycle.runtimeStates()
    expect(states.find(state => state.skinId === current.id)).toMatchObject({ activation: 'unavailable', error: expect.stringContaining('inventory unavailable') })
    expect(states.find(state => state.skinId === pinned.id)).toMatchObject({ activation: 'restart-required', error: undefined })
    expect(readMarketState(host.directory)).toEqual(before)
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
  })

  it.each(['applied', 'restart-required', 'failed-import', 'failed-initialization', 'unknown'] as const)('saves a disabled component after an old-host bundle import failure only when component result is confirmed: %s', async outcome => {
    const target = skin('bundle-import-component'), current = skin('bundle-import-original')
    const host = fixture([target, current], { hostVersion: '0.2.0-rc.2' })
    host.materialize(current); host.select(current.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: current.id, disabledSkinIds: [target.id] })
    await finished(host.lifecycle.begin('install', target.id))
    host.componentEnabled.set(target.package, false)
    const diagnostic = `dsh: warning: 1 entry did not activate\n${target.rowId} (${target.package}): failed to import`
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => ({ ...host.applyEnable(name, enabled), ...(name === target.package && enabled ? { application: 'failed', error: { code: 'operation-error', diagnostic } } : {}) }))
    host.manager.setPluginEnabled.mockImplementationOnce(async (entryId, enabled) => {
      if (outcome === 'unknown') return null
      host.applyComponentEnable(entryId, enabled)
      return { application: outcome.startsWith('failed-') ? 'failed' : outcome, changed: true, stage: 'enable', target: entryId, enabled,
        ...(outcome.startsWith('failed-') ? { error: { code: 'operation-error', diagnostic: outcome === 'failed-import' ? diagnostic : diagnostic.replace('failed to import', 'Error: initialization failed') } } : {}),
      }
    })
    const operation = host.lifecycle.begin('activate', target.id)
    if (outcome === 'unknown') {
      await until(() => operation.phase === 'waiting')
      expect(host.manager.setPluginEnabled).toHaveBeenCalledTimes(1)
      expect(host.lifecycle.waitingReason).toContain('重新打开宿主')
      expect(readMarketState(host.directory).activeSkinId).toBe(current.id)
    } else if (outcome === 'failed-initialization') {
      expect(await finished(operation)).toMatchObject({ phase: 'failed' })
      expect(readMarketState(host.directory).activeSkinId).toBe(current.id)
      expect(readProfileBundles(host.directory)).toEqual([current.package])
      expect(host.componentEnabled.get(target.package)).toBe(false)
    } else {
      expect(await finished(operation)).toMatchObject({ phase: 'done', application: 'restart-required', restartRequired: true })
      expect(readMarketState(host.directory).activeSkinId).toBe(target.id)
      expect(readProfileBundles(host.directory)).toEqual([target.package])
      expect(host.componentEnabled.get(target.package)).toBe(true)
      expect(host.manager.setPluginEnabled).toHaveBeenCalledExactlyOnceWith(host.entryId(target.package), true)
    }
  })

  it('keeps one restart notice identity through replay and repeated use, then creates a new identity for a later restart', async () => {
    const target = skin('stable-restart-notice')
    const host = fixture([target])
    host.materialize(target); host.componentEnabled.set(target.package, false); host.select(target.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: target.id, disabledSkinIds: [] })
    host.manager.setPluginEnabled.mockImplementation(async (entryId, enabled) => ({ ...host.applyComponentEnable(entryId, enabled), application: 'restart-required' }))
    await finished(host.lifecycle.begin('activate', target.id))
    const firstId = host.lifecycle.restartNoticeId
    expect(firstId).toEqual(expect.any(String))
    await host.lifecycle.replay()
    await finished(host.lifecycle.begin('activate', target.id))
    expect(host.lifecycle.restartNoticeId).toBe(firstId)
    const beforeRestart = readMarketState(host.directory)
    writeMarketState(host.directory, { ...beforeRestart, pendingRestart: { ...beforeRestart.pendingRestart!, pid: process.pid - 1 } })
    await host.lifecycle.replay()
    expect(host.lifecycle.restartNoticeId).toBeUndefined()
    host.componentEnabled.set(target.package, false); host.select(target.package, true)
    await host.lifecycle.replay()
    expect(host.lifecycle.restartNoticeId).toBeUndefined()
    await finished(host.lifecycle.begin('activate', target.id))
    expect(host.lifecycle.restartNoticeId).toEqual(expect.any(String))
    expect(host.lifecycle.restartNoticeId).not.toBe(firstId)
  })

  it('clears inactive skin restart receipts after a full host restart without reissuing saved toggles', async () => {
    const first = skin('inactive-restart-first'), second = skin('inactive-restart-second')
    const host = fixture([first, second], { hostVersion: '0.2.0-rc.2' })
    host.materialize(first); host.materialize(second)
    writeMarketState(host.directory, {
      version: 1, activeSkinId: null, pinnedSkinIds: [], disabledSkinIds: [first.id, second.id],
      pendingRestart: { pid: process.pid, skinIds: [first.id, second.id], id: 'saved-disable-notice' },
    })
    // Reopening the market keeps a pending Host transaction in the same process.
    await host.lifecycle.replay()
    expect(host.lifecycle.restartNoticeId).toBe('saved-disable-notice')
    const previous = readMarketState(host.directory)
    writeMarketState(host.directory, { ...previous, pendingRestart: { ...previous.pendingRestart!, pid: process.pid - 1 } })
    await host.lifecycle.replay()
    await host.lifecycle.replay()
    expect(readMarketState(host.directory).pendingRestart).toBeUndefined()
    expect(host.lifecycle.restartNoticeId).toBeUndefined()
    expect((await host.lifecycle.runtimeStates()).map(item => item.activation)).toEqual(['inactive', 'inactive'])
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
  })

  it.each(['disabled', 'failed', 'inventory-error'] as const)('keeps a failed restart verification receipt for %s without issuing another startup restart', async outcome => {
    const target = skin('restart-verification')
    const host = fixture([target], { hostVersion: '0.2.0-rc.2' })
    host.materialize(target)
    if (outcome === 'disabled') host.componentEnabled.set(target.package, false)
    host.select(target.package, true)
    const previous = { pid: process.pid - 1, skinIds: [target.id], id: 'previous-restart-generation' }
    writeMarketState(host.directory, { version: 1, activeSkinId: target.id, disabledSkinIds: [], pendingRestart: previous })
    if (outcome === 'failed') host.manager.listPlugins.mockImplementation(async () => [{ entryId: host.entryId(target.package), patchId: target.rowId, moduleName: target.package, enabled: true, fiberPhase: 'failed' }])
    if (outcome === 'inventory-error') host.manager.listPlugins.mockRejectedValue(new Error('inventory unavailable'))
    await host.lifecycle.replay()
    await host.lifecycle.replay()
    const reloaded = new SkinLifecycle({ loader: { entries: () => host.entries.values() } }, { profile: 'desktop', profileDir: host.directory, runner: host.runner, hostKind: 'desktop', runtime: host.runtime }, [target])
    lifecycles.push(reloaded)
    await reloaded.replay()
    expect(readMarketState(host.directory).pendingRestart).toEqual(previous)
    expect(reloaded.restartNoticeId).toBeUndefined()
    expect((await reloaded.runtimeStates())[0]).toMatchObject({ activation: 'unavailable', error: expect.stringContaining('重启后皮肤仍未生效') })
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
  })

  it('clears a failed-restart receipt when the official component becomes healthy and lets explicit Use create a new generation', async () => {
    const target = skin('restart-verification-retry')
    const host = fixture([target], { hostVersion: '0.2.0-rc.2' })
    host.materialize(target); host.componentEnabled.set(target.package, false); host.select(target.package, true)
    const previous = { pid: process.pid - 1, skinIds: [target.id], id: 'old-generation' }
    writeMarketState(host.directory, { version: 1, activeSkinId: target.id, disabledSkinIds: [], pendingRestart: previous })
    await host.lifecycle.replay()
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
    host.manager.setPluginEnabled.mockImplementationOnce(async (entryId, enabled) => ({ ...host.applyComponentEnable(entryId, enabled), application: 'restart-required' }))
    expect(await finished(host.lifecycle.begin('activate', target.id))).toMatchObject({ phase: 'done', restartRequired: true })
    expect(host.lifecycle.restartNoticeId).toEqual(expect.any(String))
    expect(host.lifecycle.restartNoticeId).not.toBe(previous.id)
    const next = readMarketState(host.directory)
    writeMarketState(host.directory, { ...next, pendingRestart: { ...next.pendingRestart!, pid: process.pid - 1 } })
    host.manager.setPluginEnabled.mockClear()
    await host.lifecycle.replay()
    expect(host.lifecycle.restartNoticeId).toBeUndefined()
    expect(readMarketState(host.directory).pendingRestart).toBeUndefined()
    expect((await host.lifecycle.runtimeStates())[0]).toMatchObject({ activation: 'active', error: undefined })
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
  })

  it('does not reselect a missing bundle after its previous restart failed verification', async () => {
    const target = skin('restart-missing-bundle')
    const host = fixture([target], { hostVersion: '0.2.0-rc.2' })
    host.materialize(target)
    const previous = { pid: process.pid - 1, skinIds: [target.id], id: 'old-bundle-attempt' }
    writeMarketState(host.directory, { version: 1, activeSkinId: target.id, disabledSkinIds: [], pendingRestart: previous })
    await host.lifecycle.replay()
    await host.lifecycle.replay()
    expect(readProfileBundles(host.directory)).toEqual([])
    expect(readMarketState(host.directory).pendingRestart).toEqual(previous)
    expect(host.lifecycle.restartNoticeId).toBeUndefined()
    expect((await host.lifecycle.runtimeStates())[0]).toMatchObject({ activation: 'unavailable' })
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(host.manager.setPluginEnabled).not.toHaveBeenCalled()
  })

  it('serializes a delayed startup verification with explicit Use so an old snapshot cannot overwrite the new selection', async () => {
    const old = skin('restart-racing-old'), target = skin('restart-racing-target')
    const host = fixture([old, target])
    host.materialize(old); host.materialize(target); host.select(old.package, true)
    host.componentEnabled.set(old.package, false); host.select(old.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: old.id, disabledSkinIds: [target.id], pendingRestart: { pid: process.pid - 1, skinIds: [old.id], id: 'old-startup-snapshot' } })
    const inventory = host.manager.listPlugins.getMockImplementation()!
    const gate = deferred<unknown>()
    host.manager.listPlugins.mockImplementationOnce(() => gate.promise)
    const replay = host.lifecycle.replay()
    await until(() => host.manager.listPlugins.mock.calls.length === 1)
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => ({ ...host.applyEnable(name, enabled), ...(name === target.package && enabled ? { application: 'restart-required' } : {}) }))
    const operation = host.lifecycle.begin('activate', target.id)
    expect(operation.phase).toBe('queued')
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    gate.resolve(await inventory())
    await replay
    expect(await finished(operation)).toMatchObject({ phase: 'done', restartRequired: true })
    const state = readMarketState(host.directory)
    expect(state.activeSkinId).toBe(target.id)
    expect(state.disabledSkinIds).toEqual([old.id])
    expect(state.pendingRestart).toMatchObject({ pid: process.pid, skinIds: [target.id] })
    expect(state.pendingRestart?.id).not.toBe('old-startup-snapshot')
    expect(readProfileBundles(host.directory)).toEqual([target.package])
    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[old.package, false], [target.package, true]])
  })

  it.each(['activate', 'pin'] as const)('installs the original homepage SRI mismatch silently and confirms only before %s', async kind => {
    const item = homepageSkin()
    const host = fixture([item], { hostVersion: '0.2.1-alpha.3' })
    const installed = await finished(host.lifecycle.begin('install', item.id))
    expect(installed.phase).toBe('done')
    expect(installed.failure).toBeUndefined()
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(readProfileBundles(host.directory)).toEqual([])
    expect(readMarketState(host.directory).artifactAcknowledgements).toBeUndefined()
    expect(host.lifecycle.states()[0]).toMatchObject({ installation: 'installed', activation: 'inactive', artifactRisk: { packageName: item.package, version: '1.0.10' } })
    const risk = host.lifecycle.states()[0]!.artifactRisk!
    expect(risk.warnings.join(' ')).toContain('SRI')
    // Declining the dialog sends no request and leaves this usable package disabled.
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(isSkinArtifactRiskAcknowledged(host.directory, item, 'desktop')).toBe(false)
    const used = await finished(host.lifecycle.begin(kind, item.id, undefined, false, undefined, undefined, risk.context))
    expect(used).toMatchObject({ phase: 'done' })
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(host.manager.installBundle.mock.calls[0]![1]).not.toHaveProperty('force')
    expect(host.lifecycle.states()[0]).toMatchObject({ installation: 'installed', activation: 'active' })
    expect(host.lifecycle.states()[0]!.artifactRisk).toBeUndefined()
    expect(isSkinArtifactRiskAcknowledged(host.directory, item, 'desktop')).toBe(true)
    expect(await finished(host.lifecycle.begin(kind === 'activate' ? 'pin' : 'activate', item.id))).toMatchObject({ phase: 'done' })
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(await finished(host.lifecycle.begin('uninstall', item.id))).toMatchObject({ phase: 'done' })
    expect(readMarketState(host.directory).artifactAcknowledgements).toBeUndefined()
  })

  it('accepts an already materialized homepage artifact without reinstalling or enabling it', async () => {
    const item = homepageSkin()
    const host = fixture([item], { hostVersion: '0.2.1-alpha.3' })
    host.materialize(item)
    expect(await finished(host.lifecycle.begin('install', item.id))).toMatchObject({ phase: 'done' })
    expect(host.manager.installBundle).not.toHaveBeenCalled()
    expect(readProfileBundles(host.directory)).toEqual([])
    expect(host.lifecycle.states()[0]).toMatchObject({ installation: 'installed', artifactRisk: { packageName: item.package } })
  })

  it('keeps a Desktop-only stale SRI out of the Web use confirmation', async () => {
    const item = homepageSkin()
    const host = fixture([item])
    host.materialize(item)
    const lifecycle = new SkinLifecycle({ loader: { entries: () => host.entries.values() } }, {
      profile: 'web', profileDir: host.directory, hostKind: 'dsh', runner: async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }),
    }, [item])
    lifecycles.push(lifecycle)
    expect(lifecycle.states()[0]).toMatchObject({ installation: 'installed' })
    expect(lifecycle.states()[0]!.artifactRisk).toBeUndefined()
    expect(await finished(lifecycle.begin('activate', item.id))).toMatchObject({ phase: 'done' })
    expect(readMarketState(host.directory).artifactAcknowledgements).toBeUndefined()
  })

  it('preserves old-host first-install restart inference through artifact confirmation and clears it after verified use', async () => {
    const item = homepageSkin()
    const host = fixture([item], { hostVersion: '0.2.0-rc.2' })
    expect(await finished(host.lifecycle.begin('install', item.id))).toMatchObject({ phase: 'done', restartRequired: true })
    expect(readMarketState(host.directory).pendingRestart?.inferredInstalls?.[item.id]).toEqual(expect.any(String))
    const risk = inspectSkinArtifactRisk(host.directory, item, 'desktop')!
    expect(await finished(host.lifecycle.begin('activate', item.id, undefined, false, undefined, undefined, risk.context))).toMatchObject({ phase: 'done', restartRequired: false })
    expect(host.lifecycle.states()[0]).toMatchObject({ installation: 'installed', activation: 'active' })
    expect(readMarketState(host.directory).pendingRestart).toBeUndefined()
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it('offers the existing retry interception for an unacknowledged artifact only when using it', async () => {
    const item = homepageSkin()
    const host = fixture([item], { hostVersion: '0.2.1-alpha.3' })
    await finished(host.lifecycle.begin('install', item.id))
    const failed = await finished(host.lifecycle.begin('activate', item.id))
    expect(failed).toMatchObject({ phase: 'failed', failure: { kind: 'integrity', action: 'approve-artifact', artifactRisk: { packageName: item.package } } })
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(() => host.lifecycle.retry(failed.id, 'retry')).toThrow('不支持')
    expect(() => host.lifecycle.retry(failed.id, 'approve-artifact', false, undefined, 'b'.repeat(64))).toThrow('已变化')
    expect(await finished(host.lifecycle.retry(failed.id, 'approve-artifact'))).toMatchObject({ phase: 'done' })
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(readProfileBundles(host.directory)).toEqual([item.package])
  })

  it('accepts compatibility and artifact consent together on the first use request', async () => {
    const item = homepageSkin()
    item.compatibility.dsh = '0.1.0-rc.6'
    const host = fixture([item], { hostVersion: '0.2.1-alpha.3' })
    expect((await finished(host.lifecycle.begin('install', item.id))).phase).toBe('done')
    const risk = inspectSkinArtifactRisk(host.directory, item, 'desktop')!
    expect(() => host.lifecycle.begin('activate', item.id)).toThrow('兼容性提示')
    const using = host.lifecycle.begin('activate', item.id, undefined, true, compatibilityContext(item, host.runtime), undefined, risk.context)
    expect(await finished(using)).toMatchObject({ phase: 'done' })
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(readProfileBundles(host.directory)).toEqual([item.package])
    expect(isSkinArtifactRiskAcknowledged(host.directory, item, 'desktop')).toBe(true)
  })

  it('accepts a newly shown artifact context on an ordinary activation retry', async () => {
    const item = skin('retry-new-artifact-risk')
    const host = fixture([item], { hostVersion: '0.2.1-alpha.3' })
    host.materialize(item)
    host.manager.setBundleEnabled.mockResolvedValueOnce({ application: 'failed', changed: false, error: { code: 'network', message: 'ECONNRESET' }, packageResult: { exitCode: 1, kind: 'network', output: 'ECONNRESET' } })
    const failed = await finished(host.lifecycle.begin('activate', item.id))
    expect(failed.failure?.action).toBe('retry')
    if (item.install.desktop?.mode === 'managed') item.install.desktop.integrity = 'sha512-NNSnPIeK5HHG1ogholwmUEcqtQz/FdJ3CG1UWsRRNlRQbdghf29v1q7/RPb5jaZw8rUz6SLCngqX0zPR05Iolw=='
    const risk = inspectSkinArtifactRisk(host.directory, item, 'desktop')!
    const retried = await finished(host.lifecycle.retry(failed.id, 'retry', false, undefined, risk.context))
    expect(retried.phase).toBe('done')
    expect(readProfileBundles(host.directory)).toEqual([item.package])
    expect(isSkinArtifactRiskAcknowledged(host.directory, item, 'desktop')).toBe(true)
    expect(host.manager.installBundle).not.toHaveBeenCalled()
  })

  it.each(['catalog', 'entry'] as const)('rejects a previously shown artifact approval when its %s changes while queued', async change => {
    const item = homepageSkin(), blocker = skin('artifact-context-blocker')
    const host = fixture([item, blocker], { hostVersion: '0.2.1-alpha.3' })
    host.materialize(item)
    const risk = inspectSkinArtifactRisk(host.directory, item, 'desktop')!
    const pending = deferred()
    host.manager.installBundle.mockImplementationOnce(() => pending.promise)
    const blocking = host.lifecycle.begin('install', blocker.id)
    await until(() => host.manager.installBundle.mock.calls.length === 1)
    const using = host.lifecycle.begin('activate', item.id, undefined, false, undefined, undefined, risk.context)
    let replacing: Promise<void> | undefined
    if (change === 'catalog') {
      const changed = { ...item, install: { ...item.install, target: item.install.target.replace(item.install.commit, 'b'.repeat(40)), commit: 'b'.repeat(40), npm: { ...item.install.npm!, gitHead: 'b'.repeat(40) } } }
      replacing = host.lifecycle.replaceCatalog([changed, blocker])
    } else atomicWriteText(join(packageDir(host.directory, item.package), 'client/client.js'), 'export const changed = true\n')
    pending.resolve(host.applyInstall(`${blocker.package}@${blocker.install.version}`))
    await finished(blocking)
    await replacing
    expect(await finished(using)).toMatchObject({ phase: 'failed' })
    expect(using.message).toContain('已变化')
    expect(using.failure?.action).not.toBe('approve-artifact')
    expect(readMarketState(host.directory).artifactAcknowledgements).toBeUndefined()
    expect(readProfileBundles(host.directory)).toEqual([])
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it('binds fallback artifact retry to the old failure and refuses a changed entry without granting a receipt', async () => {
    const item = homepageSkin()
    const host = fixture([item], { hostVersion: '0.2.1-alpha.3' })
    host.materialize(item)
    const failed = await finished(host.lifecycle.begin('pin', item.id))
    expect(failed.failure?.action).toBe('approve-artifact')
    atomicWriteText(join(packageDir(host.directory, item.package), 'client/client.js'), 'export const changed = true\n')
    const retry = await finished(host.lifecycle.retry(failed.id, 'approve-artifact'))
    expect(retry.phase).toBe('failed')
    expect(retry.message).toContain('已变化')
    expect(readMarketState(host.directory).artifactAcknowledgements).toBeUndefined()
    expect(readProfileBundles(host.directory)).toEqual([])
    expect(host.manager.installBundle).not.toHaveBeenCalled()
  })

  it('keeps hard artifact errors and native failures outside artifact confirmation', async () => {
    const item = homepageSkin()
    const host = fixture([item], { hostVersion: '0.2.1-alpha.3' })
    let context: string | undefined
    host.manager.installBundle.mockImplementationOnce(async spec => {
      const result = host.applyInstall(spec)
      context = inspectSkinArtifactRisk(host.directory, item, 'desktop')!.context
      rmSync(join(packageDir(host.directory, item.package), 'client/client.js'))
      return result
    })
    const failed = await finished(host.lifecycle.begin('install', item.id))
    expect(failed.phase).toBe('failed')
    expect(failed.failure?.action).not.toBe('approve-artifact')
    const use = await finished(host.lifecycle.begin('activate', item.id, undefined, false, undefined, undefined, context))
    expect(use.phase).toBe('failed')
    expect(use.failure?.action).not.toBe('approve-artifact')
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(readMarketState(host.directory).artifactAcknowledgements).toBeUndefined()
  })

  it.each(['entry', 'importer', 'name'] as const)('refuses a hard %s error on use without converting it into an approvable risk', async change => {
    const item = homepageSkin()
    const host = fixture([item], { hostVersion: '0.2.1-alpha.3' })
    expect((await finished(host.lifecycle.begin('install', item.id))).phase).toBe('done')
    if (change === 'entry') rmSync(join(packageDir(host.directory, item.package), 'client/client.js'))
    else if (change === 'name') {
      const file = join(packageDir(host.directory, item.package), 'package.json')
      const manifest = JSON.parse(readFileSync(file, 'utf8'))
      atomicWriteJson(file, { ...manifest, name: 'wrong-package-name' })
    } else {
      const file = join(host.directory, 'pnpm-lock.yaml')
      const lock = parse(readFileSync(file, 'utf8'))
      lock.importers['.'].dependencies[item.package].version = '1.0.9'
      atomicWriteText(file, stringify(lock))
    }
    expect(inspectSkinArtifactRisk(host.directory, item, 'desktop')).toBeUndefined()
    for (const kind of ['activate', 'pin'] as const) {
      const failed = await finished(host.lifecycle.begin(kind, item.id))
      expect(failed.phase).toBe('failed')
      expect(failed.failure?.action).not.toBe('approve-artifact')
      expect(() => host.lifecycle.retry(failed.id, 'approve-artifact')).toThrow('不支持')
    }
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(readProfileBundles(host.directory)).toEqual([])
    expect(readMarketState(host.directory).artifactAcknowledgements).toBeUndefined()
  })

  it('finishes a risky update without a dialog and disables the new artifact until use is confirmed', async () => {
    const item = homepageSkin(), pinned = skin('artifact-unrelated-pinned')
    const host = fixture([item, pinned], { hostVersion: '0.2.1-alpha.3' })
    const old = structuredClone(item)
    old.install.version = '1.0.9'
    old.install.npm!.version = '1.0.9'
    if (old.install.desktop?.mode === 'managed') old.install.desktop.packageVersion = '1.0.9'
    host.materialize(old); host.materialize(pinned)
    host.select(item.package, true); host.select(pinned.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: item.id, pinnedSkinIds: [item.id, pinned.id], disabledSkinIds: [] })
    const update = await finished(host.lifecycle.begin('update', item.id))
    expect(update).toMatchObject({ phase: 'done', restartRequired: true })
    expect(update.failure).toBeUndefined()
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: null, pinnedSkinIds: [pinned.id], disabledSkinIds: [item.id] })
    expect(readProfileBundles(host.directory)).toEqual([pinned.package])
    expect(host.lifecycle.states().find(state => state.skinId === item.id)).toMatchObject({ installation: 'installed', artifactRisk: { packageName: item.package } })
    const risk = inspectSkinArtifactRisk(host.directory, item, 'desktop')!
    expect(await finished(host.lifecycle.begin('activate', item.id, undefined, false, undefined, undefined, risk.context))).toMatchObject({ phase: 'done' })
    expect(readProfileBundles(host.directory).sort()).toEqual([item.package, pinned.package].sort())
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: item.id, pinnedSkinIds: [pinned.id] })
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it('gives a copyable install spec when Desktop still refuses the replacement', async () => {
    const item = skin('replace-failed', '1.1.0')
    const host = fixture([item])
    host.materialize(skin(item.id, '1.0.0'))
    host.manager.installBundle.mockResolvedValue({ application: 'failed', error: { code: 'already-installed', message: 'already installed' } })
    host.manager.removeBundle.mockResolvedValue({ application: 'failed', error: { code: 'bundle-in-use', message: 'in use' } })
    const failed = await finished(host.lifecycle.begin('update', item.id))
    expect(failed.phase).toBe('failed')
    expect(failed.failure?.manualSpec).toBe(`${item.package}@1.1.0`)
    expect(failed.failure?.manualFollowUp).toBe('uninstall-then-add')
    expect(failed.message).toContain(`请在官方插件页先卸载当前包，再添加 ${item.package}@1.1.0。`)
    expect(host.manager.removeBundle).toHaveBeenCalledWith(item.package)
  })

  it.each(['install', 'update'] as const)('installs an out-of-range %s without a warning and asks only before use on DSH 0.2.0-rc.2', async kind => {
    const item = skin(`range-${kind}`)
    item.compatibility.dsh = '0.1.0-rc.6'
    const host = fixture([item], { hostVersion: '0.2.0-rc.2' })
    if (kind === 'update') host.materialize(skin(item.id, '0.9.0'))
    const operation = await finished(host.lifecycle.begin(kind, item.id))
    expect(operation.phase).toBe('done')
    expect(readDependencies(host.directory)[item.package]).toBe('1.0.0')
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    const options = host.manager.installBundle.mock.calls[0]![1]!
    expect(options).not.toHaveProperty('force')
    expect(options).not.toHaveProperty('acceptRisk')
    expect(readFileSync(profilePatchFile(host.directory), 'utf8')).toBe(host.originalPatch)
    expect(() => host.lifecycle.begin('activate', item.id)).toThrow('请在兼容性提示中确认后继续')
  })

  it('keeps an updated out-of-range version disabled until the combined use confirmation', async () => {
    const item = skin('updated-range-confirmation', '1.1.0'), pinned = skin('range-unrelated-pinned')
    item.compatibility.dsh = '0.1.0-rc.6'
    const host = fixture([item, pinned], { hostVersion: '0.2.1-alpha.3' })
    host.materialize(skin(item.id, '1.0.0')); host.materialize(pinned)
    host.select(item.package, true); host.select(pinned.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: item.id, pinnedSkinIds: [item.id, pinned.id], disabledSkinIds: [] })
    expect(await finished(host.lifecycle.begin('update', item.id))).toMatchObject({ phase: 'done' })
    expect(inspectSkinArtifactRisk(host.directory, item, 'desktop')).toBeUndefined()
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: null, pinnedSkinIds: [pinned.id], disabledSkinIds: [item.id] })
    expect(readProfileBundles(host.directory)).toEqual([pinned.package])
    expect(() => host.lifecycle.begin('activate', item.id)).toThrow('兼容性提示')
    const using = await finished(host.lifecycle.begin('activate', item.id, undefined, true, compatibilityContext(item, host.runtime)))
    expect(using.phase).toBe('done')
    expect(readProfileBundles(host.directory).sort()).toEqual([item.package, pinned.package].sort())
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: item.id, pinnedSkinIds: [pinned.id] })
    expect(readMarketState(host.directory).artifactAcknowledgements).toBeUndefined()
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it.each(['activate', 'pin'] as const)('allows an out-of-range %s only for the acknowledged request', async kind => {
    const item = skin(`range-${kind}`)
    item.compatibility.dsh = '0.1.0-rc.6'
    const host = fixture([item])
    host.materialize(item)
    expect(() => host.lifecycle.begin(kind, item.id)).toThrow('请在兼容性提示中确认后继续')
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect((await finished(host.lifecycle.begin(kind, item.id, undefined, true, compatibilityContext(item, host.runtime)))).phase).toBe('done')
    expect(readProfileBundles(host.directory)).toContain(item.package)
    expect(() => host.lifecycle.begin(kind, item.id)).toThrow('请在兼容性提示中确认后继续')
  })

  it.each(['0.2.0-rc.2', '0.2.1-rc.2'])('keeps a host compatibility refusal on %s after the author-range warning was accepted', async hostVersion => {
    const item = skin('host-refusal')
    item.compatibility.dsh = '0.1.0-rc.6'
    const host = fixture([item], { hostVersion })
    host.manager.installBundle.mockResolvedValue({ application: 'failed', changed: false, error: { code: 'incompatible-version', message: 'host peer version mismatch' } })
    const operation = await finished(host.lifecycle.begin('install', item.id, undefined, true, compatibilityContext(item, host.runtime)))
    expect(operation).toMatchObject({ phase: 'failed', failure: { kind: 'compatibility' } })
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(readDependencies(host.directory)).toEqual({})
  })

  it('defers compatibility acknowledgement until use when retrying a failed install', async () => {
    const item = skin('range-retry')
    item.compatibility.dsh = '0.1.0-rc.6'
    const host = fixture([item])
    host.manager.installBundle.mockResolvedValueOnce({ application: 'failed', pendingBuilds: ['fixture-build'], error: { code: 'build-approval-required', message: 'approval required' } })
    const first = await finished(host.lifecycle.begin('install', item.id))
    expect(first).toMatchObject({ phase: 'failed', failure: { action: 'approve-build' } })
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    const retry = await finished(host.lifecycle.retry(first.id, 'approve-build'))
    expect(retry.phase, retry.message).toBe('done')
    expect(host.manager.installBundle).toHaveBeenCalledTimes(2)
    expect(() => host.lifecycle.begin('activate', item.id)).toThrow('请在兼容性提示中确认后继续')
  })

  it('does not misclassify unrelated errors as compatibility failures after acknowledgement', async () => {
    const item = skin('range-other-error')
    item.compatibility.dsh = '0.1.0-rc.6'
    const host = fixture([item])
    host.manager.installBundle.mockResolvedValueOnce({ application: 'failed', error: { code: 'artifact-error', message: 'invalid artifact' } })
    const operation = await finished(host.lifecycle.begin('install', item.id, undefined, true, compatibilityContext(item, host.runtime)))
    expect(operation.phase).toBe('failed')
    expect(operation.message).toContain('invalid artifact')
    expect(operation.failure?.kind).not.toBe('compatibility')
  })

  it.each(['package', 'range', 'runtime'] as const)('rejects a compatibility acknowledgement when the shown %s changes', async change => {
    const item = skin(`stale-${change}`)
    item.compatibility.dsh = '0.1.0-rc.6'
    const host = fixture([item])
    const context = compatibilityContext(item, host.runtime)
    if (change === 'package') await host.lifecycle.replaceCatalog([{ ...item, install: skin(item.id, '1.1.0').install }])
    else if (change === 'range') await host.lifecycle.replaceCatalog([{ ...item, compatibility: { ...item.compatibility, dsh: '*' } }])
    else host.runtime.version = '0.2.1-alpha.2'
    const before = readFileSync(join(host.directory, 'package.json'), 'utf8')
    expect(() => host.lifecycle.begin('activate', item.id, undefined, true, context)).toThrow('已变化，请重新确认')
    expect(host.manager.installBundle).not.toHaveBeenCalled()
    expect(readFileSync(join(host.directory, 'package.json'), 'utf8')).toBe(before)
  })

  it('requires the shown compatibility context along with acknowledgement', () => {
    const item = skin('missing-context')
    item.compatibility.dsh = '0.1.0-rc.6'
    const host = fixture([item])
    expect(() => host.lifecycle.begin('activate', item.id, undefined, true)).toThrow('已变化，请重新确认')
    expect(host.manager.installBundle).not.toHaveBeenCalled()
  })

  it('rechecks acknowledged activation after waiting for another profile operation', async () => {
    const blocker = skin('context-blocker')
    const item = skin('queued-context')
    item.compatibility.dsh = '0.1.0-rc.6'
    const host = fixture([blocker, item])
    host.materialize(item)
    const pending = deferred()
    host.manager.installBundle.mockImplementationOnce(async () => pending.promise)
    const install = host.lifecycle.begin('install', blocker.id)
    await until(() => host.manager.installBundle.mock.calls.length === 1)
    const activation = host.lifecycle.begin('activate', item.id, undefined, true, compatibilityContext(item, host.runtime))
    const replacement = host.lifecycle.replaceCatalog([blocker, { ...item, compatibility: { ...item.compatibility, dsh: '*' } }])
    pending.resolve(host.applyInstall(`${blocker.package}@${blocker.install.version}`))
    expect((await finished(install)).phase).toBe('done')
    expect(await finished(activation)).toMatchObject({ phase: 'failed', message: expect.stringContaining('已变化，请重新确认') })
    await replacement
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalledWith(item.package, true)
    expect(readProfileBundles(host.directory)).not.toContain(item.package)
  })

  it('delegates install, enable and removal without rewriting user cordis patches or directly updating loaders', async () => {
    const item = skin('native-a')
    const host = fixture([item], { saveRange: true })
    expect(await finished(host.lifecycle.begin('install', item.id))).toMatchObject({ phase: 'done', application: 'applied' })
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(host.manager.installBundle).toHaveBeenCalledWith(`${item.package}@1.0.0`, expect.objectContaining({ enabled: false, requestId: expect.any(String) }))
    expect(host.manager.installBundle.mock.calls[0]![1]).not.toHaveProperty('saveExact')
    expect(readDependencies(host.directory)[item.package]).toBe('^1.0.0')
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: null, disabledSkinIds: [item.id] })
    const nativeLoader = host.entries.get(item.package)!
    expect(await finished(host.lifecycle.begin('activate', item.id))).toMatchObject({ phase: 'done', application: 'applied' })
    expect(readProfileBundles(host.directory)).toEqual([item.package])
    expect(nativeLoader.update).not.toHaveBeenCalled()
    expect(await finished(host.lifecycle.begin('uninstall', item.id))).toMatchObject({ phase: 'done', application: 'applied' })
    expect(host.manager.removeBundle).toHaveBeenCalledExactlyOnceWith(item.package)
    expect(readDependencies(host.directory)).toEqual({})
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: null, pinnedSkinIds: [] })
    expect(readFileSync(profilePatchFile(host.directory), 'utf8')).toBe(host.originalPatch)
    expect(nativeLoader.update).not.toHaveBeenCalled()
  })

  it('keeps primary selection independent from pinned skins and enables their union', async () => {
    const a = skin('native-a'), b = skin('native-b')
    const host = fixture([a, b])
    host.materialize(a); host.materialize(b)
    await finished(host.lifecycle.begin('activate', a.id))
    await finished(host.lifecycle.begin('pin', a.id))
    await finished(host.lifecycle.begin('activate', b.id))
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: b.id, pinnedSkinIds: [a.id] })
    expect(readProfileBundles(host.directory).sort()).toEqual([a.package, b.package].sort())
    expect(host.lifecycle.states().find(state => state.skinId === a.id)).toMatchObject({ primary: false, pinned: true, activation: 'active' })
    await finished(host.lifecycle.begin('unpin', a.id))
    expect(readProfileBundles(host.directory)).toEqual([b.package])
    await finished(host.lifecycle.begin('pin', b.id))
    await finished(host.lifecycle.begin('unpin', b.id))
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: b.id, pinnedSkinIds: [] })
    expect(readProfileBundles(host.directory)).toEqual([b.package])
  })

  it('installs then switches an alpha.3 skin by disabling the old primary before enabling the target, while keeping pinned skins', async () => {
    const next = skin('alpha3-next'), current = skin('alpha3-current'), pinned = skin('alpha3-pinned')
    // Put the target before the current skin to ensure catalog order cannot
    // accidentally make both ordinary skins active during the switch.
    const host = fixture([next, current, pinned], { hostVersion: '0.2.1-alpha.3' })
    host.materialize(current); host.materialize(pinned)
    host.select(current.package, true); host.select(pinned.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: current.id, disabledSkinIds: [next.id], pinnedSkinIds: [pinned.id] })
    expect(host.runner.management?.installRequiresRestart).toBe(false)
    expect(await finished(host.lifecycle.begin('install', next.id))).toMatchObject({ phase: 'done', application: 'applied' })
    host.manager.setBundleEnabled.mockClear()

    const activation = await finished(host.lifecycle.begin('activate', next.id))
    expect(activation).toMatchObject({ phase: 'done', application: 'applied' })
    expect(activation.restartRequired).not.toBe(true)
    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[current.package, false], [next.package, true]])
    expect(readProfileBundles(host.directory).sort()).toEqual([next.package, pinned.package].sort())
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: next.id, pinnedSkinIds: [pinned.id], disabledSkinIds: [current.id] })
    expect(readMarketState(host.directory).pendingRestart).toBeUndefined()
    expect(host.lifecycle.states().find(state => state.skinId === pinned.id)).toMatchObject({ activation: 'active', pinned: true, primary: false })
    expect(host.lifecycle.states().find(state => state.skinId === next.id)).toMatchObject({ activation: 'active', primary: true })
  })

  it('allows an alpha.3 activation after install requires restart and carries that requirement through applied toggles', async () => {
    const next = skin('alpha3-next'), current = skin('alpha3-current')
    const host = fixture([next, current], { hostVersion: '0.2.1-alpha.3' })
    host.materialize(current)
    host.select(current.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: current.id, disabledSkinIds: [next.id] })
    host.manager.installBundle.mockImplementationOnce(async spec => ({ ...host.applyInstall(spec), application: 'restart-required', restartReason: 'no-hmr' }))

    expect(await finished(host.lifecycle.begin('install', next.id))).toMatchObject({ phase: 'done', application: 'restart-required', restartRequired: true })
    const activation = await finished(host.lifecycle.begin('activate', next.id))
    expect(activation).toMatchObject({ phase: 'done', application: 'applied', restartRequired: true })
    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[current.package, false], [next.package, true]])
    expect(readProfileBundles(host.directory)).toEqual([next.package])
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: next.id, disabledSkinIds: [current.id], pendingRestart: { pid: process.pid, skinIds: [next.id] } })
    expect(host.lifecycle.states().find(state => state.skinId === next.id)).toMatchObject({ activation: 'restart-required', primary: true })
  })

  it.each(['activate', 'pin'] as const)('keeps another skin restart requirement on its original skin after an applied %s', async kind => {
    const next = skin('alpha3-next'), current = skin('alpha3-current')
    const host = fixture([next, current], { hostVersion: '0.2.1-alpha.3' })
    host.materialize(next); host.materialize(current)
    host.select(current.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: current.id, disabledSkinIds: [next.id], pendingRestart: { pid: process.pid, skinIds: [current.id] } })

    const operation = await finished(host.lifecycle.begin(kind, next.id))
    expect(operation).toMatchObject({ phase: 'done', application: 'applied' })
    expect(operation.restartRequired).not.toBe(true)
    expect(readProfileBundles(host.directory).sort()).toEqual((kind === 'activate' ? [next.package] : [current.package, next.package]).sort())
    expect(readMarketState(host.directory).pendingRestart).toMatchObject({ pid: process.pid, skinIds: [current.id] })
    expect((await host.lifecycle.runtimeStates()).find(state => state.skinId === next.id)).toMatchObject({ activation: 'active' })
    expect(host.lifecycle.states().find(state => state.skinId === current.id)).toMatchObject({ activation: 'restart-required' })
  })

  it.each(['disable', 'enable'] as const)('finishes the alpha.3 selection and preserves a native %s restart requirement through later applied results', async step => {
    const next = skin('alpha3-next'), current = skin('alpha3-current'), pinned = skin('alpha3-pinned')
    const host = fixture([next, current, pinned], { hostVersion: '0.2.1-alpha.3' })
    host.materialize(next); host.materialize(current); host.materialize(pinned)
    host.select(current.package, true); host.select(pinned.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: current.id, disabledSkinIds: [next.id], pinnedSkinIds: [pinned.id] })
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => ({
      ...host.applyEnable(name, enabled),
      application: step === 'disable' && name === current.package && !enabled || step === 'enable' && name === next.package && enabled ? 'restart-required' : 'applied',
    }))

    expect(await finished(host.lifecycle.begin('activate', next.id))).toMatchObject({ phase: 'done', application: 'restart-required', restartRequired: true })
    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[current.package, false], [next.package, true]])
    expect(readProfileBundles(host.directory).sort()).toEqual([next.package, pinned.package].sort())
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: next.id, disabledSkinIds: [current.id], pinnedSkinIds: [pinned.id], pendingRestart: { pid: process.pid, skinIds: [next.id] } })
    expect(host.lifecycle.states().find(state => state.skinId === next.id)).toMatchObject({ activation: 'restart-required', primary: true })
  })

  it.each(['failed', 'overridden'] as const)('restores the original alpha.3 selection when the target enable is %s after the old skin was disabled', async application => {
    const next = skin('alpha3-next'), current = skin('alpha3-current'), pinned = skin('alpha3-pinned')
    const host = fixture([next, current, pinned], { hostVersion: '0.2.1-alpha.3' })
    host.materialize(next); host.materialize(current); host.materialize(pinned)
    host.select(current.package, true); host.select(pinned.package, true)
    const previous = { version: 1 as const, activeSkinId: current.id, disabledSkinIds: [next.id], pinnedSkinIds: [pinned.id] }
    writeMarketState(host.directory, previous)
    host.manager.setBundleEnabled.mockImplementationOnce(async (name, enabled) => ({ ...host.applyEnable(name, enabled), application: 'restart-required' }))
    host.manager.setBundleEnabled.mockImplementationOnce(async (name, enabled) => ({
      ...host.applyEnable(name, enabled), application,
      ...(application === 'failed' ? { error: { code: 'reload-failed', message: 'target enable failed' } } : {}),
    }))

    expect(await finished(host.lifecycle.begin('activate', next.id))).toMatchObject({ phase: 'failed', application })
    expect(host.manager.setBundleEnabled.mock.calls.slice(0, 2)).toEqual([[current.package, false], [next.package, true]])
    expect(readProfileBundles(host.directory).sort()).toEqual([current.package, pinned.package].sort())
    expect(readMarketState(host.directory)).toMatchObject(previous)
    expect(readMarketState(host.directory).pendingRestart).toMatchObject({ pid: process.pid, skinIds: [current.id, pinned.id, next.id] })
    expect(host.lifecycle.states().find(state => state.skinId === current.id)).toMatchObject({ activation: 'restart-required', primary: true })
    expect(host.lifecycle.states().find(state => state.skinId === next.id)).toMatchObject({ activation: 'restart-required', primary: false })
  })

  it('keeps a failed alpha.3 switch failed when rollback restores the saved selection but itself requires restart', async () => {
    const next = skin('alpha3-next'), current = skin('alpha3-current'), pinned = skin('alpha3-pinned')
    const host = fixture([next, current, pinned], { hostVersion: '0.2.1-alpha.3' })
    host.materialize(next); host.materialize(current); host.materialize(pinned)
    host.select(current.package, true); host.select(pinned.package, true)
    const previous = { version: 1 as const, activeSkinId: current.id, disabledSkinIds: [next.id], pinnedSkinIds: [pinned.id] }
    writeMarketState(host.directory, previous)
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => ({
      ...host.applyEnable(name, enabled),
      ...(name === next.package && enabled
        ? { application: 'failed', error: { code: 'reload-failed', message: 'target enable failed' } }
        : name === current.package && enabled ? { application: 'restart-required', restartReason: 'no-hmr' } : {}),
    }))

    const operation = await finished(host.lifecycle.begin('activate', next.id))
    expect(operation).toMatchObject({ phase: 'failed', application: 'failed', restartRequired: true, message: expect.stringContaining('target enable failed') })
    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[current.package, false], [next.package, true], [next.package, false], [current.package, true]])
    expect(readProfileBundles(host.directory).sort()).toEqual([current.package, pinned.package].sort())
    expect(readMarketState(host.directory)).toMatchObject(previous)
    expect(readMarketState(host.directory).pendingRestart).toMatchObject({ pid: process.pid, skinIds: [current.id, pinned.id, next.id] })
    expect(host.lifecycle.states().find(state => state.skinId === current.id)).toMatchObject({ activation: 'restart-required', primary: true })
    expect(host.lifecycle.states().find(state => state.skinId === pinned.id)).toMatchObject({ activation: 'restart-required', pinned: true })
    expect(host.lifecycle.states().find(state => state.skinId === next.id)).toMatchObject({ activation: 'restart-required', primary: false })
  })

  it.each(['failed', 'overridden'] as const)('disables the rejected target before restoring an earlier catalog skin after alpha.3 enable is %s', async application => {
    const current = skin('alpha3-current'), next = skin('alpha3-next')
    const host = fixture([current, next], { hostVersion: '0.2.1-alpha.3' })
    host.materialize(current); host.materialize(next)
    host.select(current.package, true)
    const previous = { version: 1 as const, activeSkinId: current.id, disabledSkinIds: [next.id] }
    writeMarketState(host.directory, previous)
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => {
      if (name === current.package && enabled && readProfileBundles(host.directory).includes(next.package)) {
        throw new Error('restoring the old skin while the rejected target is still enabled would overlap skins')
      }
      const result = host.applyEnable(name, enabled)
      return name === next.package && enabled
        ? { ...result, application, ...(application === 'failed' ? { error: { code: 'reload-failed', message: 'target enable failed' } } : {}) }
        : result
    })

    expect(await finished(host.lifecycle.begin('activate', next.id))).toMatchObject({ phase: 'failed', application })
    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[current.package, false], [next.package, true], [next.package, false], [current.package, true]])
    expect(readProfileBundles(host.directory)).toEqual([current.package])
    expect(readMarketState(host.directory)).toMatchObject(previous)
    expect(host.lifecycle.waitingReason).toBeUndefined()
  })

  it('preserves a native update restart requirement through later successful toggles until removal', async () => {
    const next = skin('native-a', '1.1.0')
    const host = fixture([next])
    host.materialize(skin(next.id, '1.0.0'))
    host.select(next.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: next.id, disabledSkinIds: [], pinnedSkinIds: [next.id] })
    const update = await finished(host.lifecycle.begin('update', next.id))
    expect(update).toMatchObject({ phase: 'done', application: 'restart-required', restartRequired: true })
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: next.id, pinnedSkinIds: [next.id], pendingRestart: { pid: process.pid, skinIds: [next.id] } })
    await finished(host.lifecycle.begin('deactivate', next.id))
    await finished(host.lifecycle.begin('activate', next.id))
    await finished(host.lifecycle.begin('pin', next.id))
    await finished(host.lifecycle.begin('unpin', next.id))
    expect(readMarketState(host.directory).pendingRestart).toMatchObject({ pid: process.pid, skinIds: [next.id] })
    expect(host.lifecycle.states().find(state => state.skinId === next.id)).toMatchObject({ activation: 'restart-required', installedVersion: '1.1.0', primary: true })
    await finished(host.lifecycle.begin('uninstall', next.id))
    expect(readMarketState(host.directory).pendingRestart).toBeUndefined()
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it('saves an old Host install-and-use selection before restart and replays it without another user action', async () => {
    const item = skin('native-a'), current = skin('native-current'), pinned = skin('native-pinned')
    const host = fixture([item, current, pinned], { hostVersion: '0.2.0-rc.2' })
    host.materialize(current); host.materialize(pinned)
    host.select(current.package, true); host.select(pinned.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: current.id, disabledSkinIds: [item.id], pinnedSkinIds: [pinned.id] })
    const operation = await finished(host.lifecycle.begin('install', item.id))
    expect(operation).toMatchObject({ phase: 'done', application: 'applied', restartRequired: true })
    expect(operation.message).toContain('手动重启 Desktop App')
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: current.id, pendingRestart: { pid: process.pid, skinIds: [item.id] } })
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => {
      const result = host.applyEnable(name, enabled)
      if (name === item.package && enabled) host.entries.get(name)!.fiber = undefined
      return result
    })
    expect(await finished(host.lifecycle.begin('activate', item.id))).toMatchObject({ phase: 'done', application: 'applied', restartRequired: true })
    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[current.package, false], [item.package, true]])
    // This is already the official on-disk startup selection, before quitting.
    expect(readProfileBundles(host.directory).sort()).toEqual([item.package, pinned.package].sort())
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: item.id, disabledSkinIds: [current.id], pinnedSkinIds: [pinned.id] })
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)

    await host.lifecycle.dispose()
    const persisted = readMarketState(host.directory)
    persisted.pendingRestart!.pid = process.pid + 1
    writeMarketState(host.directory, persisted)
    host.materialize(item)
    const freshRuntime: DshRuntime = { ...runtime, version: '0.2.0-rc.2' }
    const fresh = new SkinLifecycle({ loader: { entries: () => host.entries.values() } }, {
      profile: 'desktop', profileDir: host.directory, hostKind: 'desktop', runtime: freshRuntime,
      runner: officialDesktopRunner(() => host.manager, freshRuntime), lifecycleWaitMs: 10,
    }, [item, current, pinned])
    lifecycles.push(fresh)
    host.manager.setBundleEnabled.mockClear()
    await fresh.replay()
    expect(readMarketState(host.directory).pendingRestart).toBeUndefined()
    expect(readMarketState(host.directory).activeSkinId).toBe(item.id)
    expect(readProfileBundles(host.directory).sort()).toEqual([item.package, pinned.package].sort())
    expect(fresh.states().find(state => state.skinId === item.id)).toMatchObject({ activation: 'active', primary: true })
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['0.1.6-alpha.2', 'activate'], ['0.1.6-alpha.2', 'pin'],
    ['0.2.0-rc.2', 'activate'], ['0.2.0-rc.2', 'pin'],
  ] as const)('clears only the inferred first-install restart when %s confirms a live %s', async (hostVersion, kind) => {
    const target = skin('first-install-live')
    const host = fixture([target], { hostVersion })
    await finished(host.lifecycle.begin('install', target.id))
    expect(readMarketState(host.directory).pendingRestart).toMatchObject({ skinIds: [target.id], inferredInstalls: { [target.id]: expect.stringMatching(/^[a-f0-9]{64}$/) } })
    const operation = await finished(host.lifecycle.begin(kind, target.id))
    expect(operation).toMatchObject({ phase: 'done', application: 'applied', restartRequired: false })
    expect(operation.message).not.toMatch(/restart|重启/)
    expect(readMarketState(host.directory).pendingRestart).toBeUndefined()
    expect(host.lifecycle.restartNoticeId).toBeUndefined()
    expect((await host.lifecycle.runtimeStates())[0]).toMatchObject({ activation: 'active' })
  })

  it.each(['disabled', 'loading', 'pending', 'failed', 'ambiguous', 'inventory-error'] as const)(
    'retains an inferred restart while inventory is %s, then clears it after the same process confirms activation', async outcome => {
      const target = skin('first-install-delayed')
      const host = fixture([target], { hostVersion: '0.2.0-rc.2' })
      await finished(host.lifecycle.begin('install', target.id))
      host.manager.setBundleEnabled.mockImplementationOnce(async (name, enabled) => {
        const result = host.applyEnable(name, enabled)
        host.entries.get(name)!.fiber = undefined
        return result
      })
      expect(await finished(host.lifecycle.begin('activate', target.id))).toMatchObject({ phase: 'done', restartRequired: true })
      const pending = readMarketState(host.directory).pendingRestart
      const normalInventory = host.manager.listPlugins.getMockImplementation()!
      host.manager.listPlugins.mockImplementation(async () => {
        if (outcome === 'inventory-error') throw new Error('inventory unavailable')
        const row = { entryId: host.entryId(target.package), patchId: target.rowId, moduleName: target.package, enabled: outcome !== 'disabled', fiberPhase: outcome === 'disabled' ? 'active' : outcome }
        return outcome === 'ambiguous' ? [row, { ...row, entryId: 'another-entry' }] : [row]
      })
      // A market plugin reload in the same app process retains provenance.
      const reloaded = new SkinLifecycle({ loader: { entries: () => host.entries.values() } }, {
        profile: 'desktop', profileDir: host.directory, runner: host.runner, hostKind: 'desktop', runtime: host.runtime,
      }, [target])
      lifecycles.push(reloaded)
      expect((await reloaded.runtimeStates())[0]).toMatchObject({ activation: 'restart-required' })
      expect(readMarketState(host.directory).pendingRestart).toEqual(pending)
      host.manager.listPlugins.mockImplementation(normalInventory)
      host.entries.get(target.package)!.fiber = {}
      expect((await reloaded.runtimeStates())[0]).toMatchObject({ activation: 'active' })
      expect(readMarketState(host.directory).pendingRestart).toBeUndefined()
      expect(reloaded.restartNoticeId).toBeUndefined()
    },
  )

  it('upgrades an inferred restart to a native requirement even when its target fiber is active', async () => {
    const target = skin('first-install-native-restart')
    const host = fixture([target], { hostVersion: '0.2.0-rc.2' })
    await finished(host.lifecycle.begin('install', target.id))
    host.manager.setBundleEnabled.mockImplementationOnce(async (name, enabled) => ({ ...host.applyEnable(name, enabled), application: 'restart-required' }))
    expect(await finished(host.lifecycle.begin('activate', target.id))).toMatchObject({ phase: 'done', application: 'restart-required', restartRequired: true })
    expect(readMarketState(host.directory).pendingRestart?.inferredInstalls).toBeUndefined()
    expect((await host.lifecycle.runtimeStates())[0]).toMatchObject({ activation: 'restart-required' })
  })

  it.each(['plugins', 'bundles'] as const)('releases the selection queue after a stalled %s read and discards its late restart verification', async inventory => {
    const target = skin('first-install-stalled')
    const host = fixture([target], { hostVersion: '0.2.0-rc.2' })
    await finished(host.lifecycle.begin('install', target.id))
    host.manager.setBundleEnabled.mockImplementationOnce(async (name, enabled) => {
      const result = host.applyEnable(name, enabled)
      host.entries.get(name)!.fiber = undefined
      return result
    })
    await finished(host.lifecycle.begin('activate', target.id))
    const late = deferred<unknown>()
    const reader = inventory === 'plugins' ? host.manager.listPlugins : host.manager.listBundles
    const readsBefore = reader.mock.calls.length
    if (inventory === 'plugins') host.manager.listPlugins.mockReturnValueOnce(late.promise)
    else {
      host.manager.listPlugins.mockResolvedValueOnce([])
      host.manager.listBundles.mockReturnValueOnce(late.promise)
    }
    const refresh = host.lifecycle.runtimeStates()
    await until(() => reader.mock.calls.length > readsBefore)
    host.manager.removeBundle.mockImplementationOnce(async name => ({ ...host.applyRemove(name), application: 'restart-required' }))
    const removal = host.lifecycle.begin('uninstall', target.id)
    expect((await refresh)[0]).toMatchObject({ activation: 'restart-required' })
    expect(await finished(removal)).toMatchObject({ phase: 'done', restartRequired: true })
    const pending = readMarketState(host.directory).pendingRestart
    expect(pending).toMatchObject({ skinIds: [target.id] })
    expect(pending?.inferredInstalls).toBeUndefined()
    late.resolve(inventory === 'plugins'
      ? [{ entryId: host.entryId(target.package), patchId: target.rowId, moduleName: target.package, enabled: true, fiberPhase: 'active' }]
      : [{ name: target.package, rows: [{ rowId: target.rowId, moduleName: target.package, entryId: host.entryId(target.package) }] }])
    await new Promise(resolve => setImmediate(resolve))
    expect(readMarketState(host.directory).pendingRestart).toEqual(pending)
  })

  it.each(['version', 'code', 'source'] as const)('does not verify a first installation against an external replacement of its %s', async change => {
    const target = skin('first-install-replaced')
    const host = fixture([target], { hostVersion: '0.2.0-rc.2' })
    await finished(host.lifecycle.begin('install', target.id))
    const pending = readMarketState(host.directory).pendingRestart
    // Another official-plugin-page operation can select a replacement while
    // the old fiber still reports active under the same component identity.
    if (change === 'version') host.materialize(skin(target.id, '2.0.0'))
    if (change === 'code') atomicWriteText(join(packageDir(host.directory, target.package), 'lib/index.js'), 'export const replaced = true\n')
    if (change === 'source') {
      const manifest = JSON.parse(readFileSync(join(host.directory, 'package.json'), 'utf8'))
      manifest.dependencies[target.package] = `file:../${target.package}`
      atomicWriteJson(join(host.directory, 'package.json'), manifest)
    }
    host.select(target.package, true)
    writeMarketState(host.directory, { ...readMarketState(host.directory), activeSkinId: target.id, disabledSkinIds: [] })
    expect((await host.lifecycle.runtimeStates())[0]).toMatchObject({ activation: 'restart-required' })
    expect(readMarketState(host.directory).pendingRestart).toEqual(pending)
  })

  it('keeps an old Host repair restart requirement while saving a pin before restart', async () => {
    const item = skin('native-a')
    const host = fixture([item], { hostVersion: '0.2.0-rc.2' })
    host.materialize(item)
    rmSync(packageDir(host.directory, item.package), { recursive: true, force: true })
    host.manager.installBundle.mockImplementationOnce(async spec => ({ ...host.applyInstall(spec), application: 'applied' }))
    const operation = await finished(host.lifecycle.begin('install', item.id))
    expect(operation).toMatchObject({ phase: 'done', application: 'applied', restartRequired: true })
    expect(operation.message).toContain('构件已修复')
    expect(readMarketState(host.directory).pendingRestart).toMatchObject({ pid: process.pid, skinIds: [item.id] })
    expect(await finished(host.lifecycle.begin('pin', item.id))).toMatchObject({ phase: 'done', application: 'applied', restartRequired: true })
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(host.manager.setBundleEnabled).toHaveBeenCalledExactlyOnceWith(item.package, true)
    expect(readProfileBundles(host.directory)).toEqual([item.package])
    expect(readMarketState(host.directory).pinnedSkinIds).toEqual([item.id])
    expect(readFileSync(profilePatchFile(host.directory), 'utf8')).toBe(host.originalPatch)
  })

  it('retains a fully saved old Host selection when only the newly installed target cannot import yet', async () => {
    const item = skin('native-new'), current = skin('native-current'), pinned = skin('native-pinned')
    const host = fixture([item, current, pinned], { hostVersion: '0.2.0-rc.2' })
    host.materialize(current); host.materialize(pinned)
    host.select(current.package, true); host.select(pinned.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: current.id, disabledSkinIds: [item.id], pinnedSkinIds: [pinned.id] })
    await finished(host.lifecycle.begin('install', item.id))
    const diagnostic = `dsh: warning: 1 entry did not activate\n${item.rowId} (${item.package}): failed to import`
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => {
      const result = host.applyEnable(name, enabled)
      if (name !== item.package || !enabled) return result
      host.entries.get(name)!.fiber = undefined
      return { ...result, application: 'failed', error: { code: 'operation-error', diagnostic } }
    })
    const operation = await finished(host.lifecycle.begin('activate', item.id))
    expect(operation).toMatchObject({ phase: 'done', application: 'restart-required', restartRequired: true })
    expect(operation.message).toContain('启停选择已保存，目标当前未加载；请手动重启 Desktop App')
    expect(operation.message).toContain(diagnostic)
    expect(readProfileBundles(host.directory).sort()).toEqual([item.package, pinned.package].sort())
    expect(readMarketState(host.directory)).toMatchObject({ activeSkinId: item.id, pinnedSkinIds: [pinned.id], disabledSkinIds: [current.id] })
    expect(host.lifecycle.states().find(state => state.skinId === item.id)).toMatchObject({ activation: 'restart-required', primary: true })
    // Refresh/replay in the current process must not repeat the failed import.
    host.manager.setBundleEnabled.mockClear()
    await host.lifecycle.replay()
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()

    await host.lifecycle.dispose()
    const state = readMarketState(host.directory)
    state.pendingRestart!.pid = process.pid + 1
    writeMarketState(host.directory, state)
    // A fresh Host starts the already selected target from its on-disk bundle.
    host.materialize(item)
    const fresh = new SkinLifecycle({ loader: { entries: () => host.entries.values() } }, {
      profile: 'desktop', profileDir: host.directory, hostKind: 'desktop', runtime: host.runtime,
      runner: host.runner, lifecycleWaitMs: 10,
    }, [item, current, pinned])
    lifecycles.push(fresh)
    await fresh.replay()
    expect(readMarketState(host.directory).pendingRestart).toBeUndefined()
    expect(readMarketState(host.directory).activeSkinId).toBe(item.id)
    expect(fresh.states().find(state => state.skinId === item.id)).toMatchObject({ activation: 'active', primary: true })
    expect(readProfileBundles(host.directory).sort()).toEqual([item.package, pinned.package].sort())
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
  })

  it.each([
    'initialization failure', 'missing service', 'another row', 'multiple rows',
    'selection not saved', 'old skin still selected', 'unreviewed source', 'missing entry file',
  ])('keeps the previous selection rather than accepting %s as a saved restart transition', async reason => {
    const item = skin('native-new'), current = skin('native-current')
    const host = fixture([item, current], { hostVersion: '0.2.0-rc.2' })
    host.materialize(current); host.select(current.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: current.id, disabledSkinIds: [item.id] })
    await finished(host.lifecycle.begin('install', item.id))
    let diagnostic = `dsh: warning: 1 entry did not activate\n${item.rowId} (${item.package}): failed to import`
    if (reason === 'initialization failure') diagnostic = diagnostic.replace('failed to import', 'Error: plugin initialization failed')
    if (reason === 'missing service') diagnostic = diagnostic.replace('failed to import', 'pending (waiting for service: requiredService)')
    if (reason === 'another row') diagnostic = diagnostic.replace(item.rowId, 'unrelated-row')
    if (reason === 'multiple rows') diagnostic = diagnostic.replace('1 entry', '2 entries') + '\nunrelated-row (unrelated-package): failed to import'
    if (reason === 'unreviewed source') {
      const manifest = JSON.parse(readFileSync(join(host.directory, 'package.json'), 'utf8'))
      manifest.dependencies[item.package] = 'github:unreviewed/other#' + 'b'.repeat(40)
      atomicWriteJson(join(host.directory, 'package.json'), manifest)
    }
    if (reason === 'missing entry file') rmSync(join(packageDir(host.directory, item.package), 'lib/index.js'))
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => {
      if (reason === 'old skin still selected' && name === current.package && !enabled) return { application: 'applied', changed: false }
      if (reason !== 'selection not saved' || name !== item.package || !enabled) host.applyEnable(name, enabled)
      return name === item.package && enabled
        ? { application: 'failed', changed: true, stage: 'enable', target: name, enabled, error: { code: 'operation-error', diagnostic } }
        : { application: 'applied', changed: true, stage: 'enable', target: name, enabled }
    })
    const operation = await finished(host.lifecycle.begin('activate', item.id))
    expect(operation.phase).toBe('failed')
    if (reason === 'unreviewed source' || reason === 'missing entry file') {
      expect(operation.application).toBeUndefined()
      expect(operation.failure?.action).not.toBe('approve-artifact')
      expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    } else expect(operation.application).toBe('failed')
    expect(readMarketState(host.directory).activeSkinId).toBe(current.id)
    expect(readProfileBundles(host.directory)).toEqual([current.package])
  })

  it.each(['applied', 'failed'] as const)('holds further writes while a delayed native enable is pending, then accepts its late %s result once', async application => {
    const a = skin('native-a'), b = skin('native-b')
    const host = fixture([a, b])
    host.materialize(a); host.materialize(b)
    const result = deferred()
    host.manager.setBundleEnabled.mockImplementation(async (name, enabled) => name === a.package && enabled ? result.promise : host.applyEnable(name, enabled))
    const operation = host.lifecycle.begin('activate', a.id)
    await until(() => operation.phase === 'waiting')
    expect(host.lifecycle.waitingReason).toContain('插件仍在完成启停')
    expect(() => host.lifecycle.begin('pin', b.id)).toThrow('暂时不能继续修改')
    if (application === 'applied') result.resolve(host.applyEnable(a.package, true))
    else result.resolve({ application: 'failed', stage: 'reload', target: a.package, error: { code: 'reload-failed', message: 'native enable rejected' } })
    expect(await finished(operation)).toMatchObject({ phase: application === 'applied' ? 'done' : 'failed', application })
    expect(host.lifecycle.waitingReason).toBeUndefined()
    expect(host.manager.setBundleEnabled.mock.calls.filter(([name, enabled]) => name === a.package && enabled)).toHaveLength(1)
    expect(await finished(host.lifecycle.begin('pin', b.id))).toMatchObject({ phase: 'done' })
    expect(host.manager.installBundle).not.toHaveBeenCalled()
  })

  it('joins a delayed native removal and releases the profile after its confirmed result', async () => {
    const a = skin('native-a'), b = skin('native-b')
    const host = fixture([a, b])
    host.materialize(a); host.materialize(b)
    const result = deferred()
    const started = deferred<void>()
    host.manager.removeBundle.mockImplementationOnce(() => {
      started.resolve(undefined)
      return result.promise
    })
    const operation = host.lifecycle.begin('uninstall', a.id)
    await started.promise
    expect(operation).toMatchObject({ phase: 'installing', cancelable: false })
    expect(() => host.lifecycle.cancel(operation.id)).toThrow('当前阶段无法安全取消')
    await until(() => operation.phase === 'waiting')
    expect(() => host.lifecycle.begin('activate', b.id)).toThrow('暂时不能继续修改')
    result.resolve(host.applyRemove(a.package))
    expect(await finished(operation)).toMatchObject({ phase: 'done', application: 'applied' })
    expect(host.lifecycle.waitingReason).toBeUndefined()
    expect(host.manager.removeBundle).toHaveBeenCalledTimes(1)
    expect(await finished(host.lifecycle.begin('activate', b.id))).toMatchObject({ phase: 'done' })
    expect(readFileSync(profilePatchFile(host.directory), 'utf8')).toBe(host.originalPatch)
  })

  it('retains native failure authority when rollback reconciliation reports applied', async () => {
    const item = skin('native-a')
    const host = fixture([item])
    host.materialize(item)
    host.select(item.package, true)
    writeMarketState(host.directory, { version: 1, activeSkinId: item.id, disabledSkinIds: [] })
    host.manager.setBundleEnabled.mockImplementationOnce(async () => {
      host.select(item.package, false)
      return { application: 'failed', stage: 'reload', target: item.package, error: { code: 'reload-failed', message: 'native transaction failed' } }
    })
    const operation = await finished(host.lifecycle.begin('deactivate', item.id))
    expect(operation).toMatchObject({ phase: 'failed', application: 'failed' })
    expect(operation.message).toContain('native transaction failed')
    expect(readMarketState(host.directory).activeSkinId).toBe(item.id)
    expect(readProfileBundles(host.directory)).toEqual([item.package])
    expect(host.manager.setBundleEnabled.mock.calls).toEqual([[item.package, false], [item.package, true]])
  })

  it('keeps an unrecovered install result in waiting and never repeats it or offers a retry', async () => {
    const item = skin('native-a')
    const host = fixture([item])
    host.manager.installBundle.mockRejectedValueOnce(new Error('transport disconnected'))
    const operation = host.lifecycle.begin('install', item.id)
    await until(() => operation.phase === 'waiting' && host.manager.waitForInstall.mock.calls.length === 1)
    expect(operation).toMatchObject({ phase: 'waiting', cancelable: false })
    expect(operation.failure?.action).toBeUndefined()
    expect(host.lifecycle.waitingReason).toContain('重新打开宿主')
    expect(() => host.lifecycle.begin('install', item.id)).toThrow('重新打开宿主')
    expect(() => host.lifecycle.retry(operation.id, 'retry')).toThrow('not retryable')
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(host.manager.waitForInstall.mock.calls[0]![0]).toBe(host.manager.installBundle.mock.calls[0]![1]!.requestId)
    expect(readFileSync(profilePatchFile(host.directory), 'utf8')).toBe(host.originalPatch)
  })

  it('holds an already queued native install when the preceding manager result becomes unknown', async () => {
    const a = skin('native-a'), b = skin('native-b')
    const host = fixture([a, b])
    const pending = deferred()
    host.manager.installBundle.mockImplementationOnce(() => pending.promise)
    const first = host.lifecycle.begin('install', a.id)
    await until(() => host.manager.installBundle.mock.calls.length === 1)
    const queued = host.lifecycle.begin('install', b.id)
    expect(queued.phase).toBe('queued')
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    pending.reject(new Error('first install result lost'))
    await until(() => first.phase === 'waiting' && queued.phase === 'waiting')
    expect(first).toMatchObject({ phase: 'waiting', cancelable: false })
    expect(queued).toMatchObject({ phase: 'waiting', cancelable: false })
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(host.manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(host.manager.waitForInstall).toHaveBeenCalledTimes(1)
    expect(readDependencies(host.directory)).toEqual({})
    expect(readFileSync(profilePatchFile(host.directory), 'utf8')).toBe(host.originalPatch)
  })

  it.each([
    { range: '>=00.1.6-alpha.2', kind: 'activate' as const },
    { range: '>=0.1.6-alpha.01', kind: 'activate' as const },
    { range: '>=00.1.6-alpha.2', kind: 'install' as const },
    { range: '>=0.1.6-alpha.01', kind: 'install' as const },
  ])('rejects the malformed old-host peer $range during $kind before native enable', async ({ range, kind }) => {
    const item = skin('native-a')
    const host = fixture([item], { hostVersion: '0.1.6-alpha.2' })
    const declarePeer = () => {
      const manifestPath = join(packageDir(host.directory, item.package), 'package.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
      atomicWriteJson(manifestPath, { ...manifest, peerDependencies: { '@deepseek-ai/dsh': range } })
    }
    if (kind === 'activate') {
      host.materialize(item)
      declarePeer()
    } else {
      host.manager.installBundle.mockImplementationOnce(async spec => {
        const applied = host.applyInstall(spec)
        declarePeer()
        return applied
      })
    }
    const operation = await finished(host.lifecycle.begin(kind, item.id))
    expect(operation).toMatchObject({ phase: 'failed', cancelable: false })
    expect(operation.message).toContain('@deepseek-ai/dsh')
    expect(host.manager.setBundleEnabled.mock.calls.filter(([, enabled]) => enabled)).toEqual([])
    expect(host.manager.installBundle).toHaveBeenCalledTimes(kind === 'install' ? 1 : 0)
    expect(readMarketState(host.directory).activeSkinId).toBeNull()
    expect(readProfileBundles(host.directory)).toEqual([])
    expect(readFileSync(profilePatchFile(host.directory), 'utf8')).toBe(host.originalPatch)
  })

  it('uses a recovered install result without starting another native install', async () => {
    const item = skin('native-a')
    const host = fixture([item])
    host.manager.installBundle.mockRejectedValueOnce(new Error('transport disconnected'))
    host.manager.waitForInstall.mockImplementationOnce(async () => host.applyInstall(`${item.package}@1.0.0`))
    expect(await finished(host.lifecycle.begin('install', item.id))).toMatchObject({ phase: 'done', application: 'applied' })
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(host.manager.waitForInstall).toHaveBeenCalledTimes(1)
    expect(host.lifecycle.waitingReason).toBeUndefined()
  })

  it.each(['applied', 'failed', 'cancelled'] as const)('respects the final native %s result after cancellation was requested', async application => {
    const item = skin('native-a')
    const host = fixture([item])
    const result = deferred()
    host.manager.installBundle.mockImplementationOnce(() => result.promise)
    const operation = host.lifecycle.begin('install', item.id)
    await until(() => host.manager.installBundle.mock.calls.length === 1)
    expect(operation.cancelable).toBe(true)
    host.lifecycle.cancel(operation.id)
    expect(host.manager.cancelInstall).toHaveBeenCalledTimes(1)
    if (application === 'applied') result.resolve(host.applyInstall(`${item.package}@1.0.0`))
    else result.resolve({ application, stage: 'install', target: item.package, ...(application === 'failed' ? { error: { code: 'install-failed', message: 'native install failed after cancellation request' } } : {}) })
    expect(await finished(operation)).toMatchObject({ phase: application === 'applied' ? 'done' : application, application, cancelable: false })
    expect(host.manager.installBundle).toHaveBeenCalledTimes(1)
    expect(host.lifecycle.waitingReason).toBeUndefined()
  })

  it('retries build approval only with exact pending names returned by the native manager', async () => {
    const item = skin('native-a')
    const host = fixture([item])
    host.manager.installBundle.mockResolvedValueOnce({ application: 'failed', stage: 'install', target: item.package, pendingBuilds: ['@fixture/native-helper', 'native-helper'], error: { code: 'build-approval-required', message: 'exact packages require approval' } })
    const failed = await finished(host.lifecycle.begin('install', item.id))
    expect(failed).toMatchObject({ phase: 'failed', application: 'failed', failure: { kind: 'build-approval', action: 'approve-build' } })
    expect(await finished(host.lifecycle.retry(failed.id, 'approve-build'))).toMatchObject({ phase: 'done', application: 'applied' })
    expect(host.manager.installBundle.mock.calls[1]![1]).toMatchObject({ approvedBuilds: ['@fixture/native-helper', 'native-helper'] })
    expect(host.manager.installBundle.mock.calls[0]![1]).not.toHaveProperty('approvedBuilds')
  })

  it('leaves installation usable and noncancelable when the Host omits only cancellation', async () => {
    const item = skin('native-a')
    const host = fixture([item])
    Reflect.deleteProperty(host.manager, 'cancelInstall')
    const result = deferred()
    host.manager.installBundle.mockImplementationOnce(() => result.promise)
    const operation = host.lifecycle.begin('install', item.id)
    await until(() => host.manager.installBundle.mock.calls.length === 1)
    expect(operation.cancelable).toBe(false)
    expect(() => host.lifecycle.cancel(operation.id)).toThrow('无法安全取消')
    result.resolve(host.applyInstall(`${item.package}@1.0.0`))
    expect(await finished(operation)).toMatchObject({ phase: 'done', application: 'applied' })
  })
})

describe('loader lifecycle settlement', () => {
  it.each(['applied', 'rejected'] as const)('keeps a timed-out loader promise joined until its late %s settlement and then releases writes', async outcome => {
    const item = skin('loader-a')
    const host = fixture([item])
    host.materialize(item)
    // A local loader plugin has no browser asset that would force a restart.
    const manifestPath = join(packageDir(host.directory, item.package), 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dsh: { client?: unknown } }
    delete manifest.dsh.client
    atomicWriteJson(manifestPath, manifest)
    const entry = host.entries.get(item.package)!
    const pending = deferred<void>()
    const update = vi.fn(async (options: { disabled: boolean | null }) => {
      entry.options.disabled = options.disabled
      entry.fiber = options.disabled === true ? undefined : {}
    })
    update.mockImplementationOnce(async options => {
      await pending.promise
      entry.options.disabled = options.disabled
      entry.fiber = options.disabled === true ? undefined : {}
    })
    entry.update = update
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [entry] } }, {
      profile: 'web', profileDir: host.directory, hostKind: 'dsh', runtime,
      lifecycleWaitMs: 10, runner: async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }),
    }, [item])
    lifecycles.push(lifecycle)
    const operation = lifecycle.begin('activate', item.id)
    await until(() => operation.phase === 'waiting')
    expect(() => lifecycle.begin('pin', item.id)).toThrow('暂时不能继续修改')
    expect(update).toHaveBeenCalledTimes(1)
    if (outcome === 'applied') pending.resolve()
    else pending.reject(new Error('loader startup rejected'))
    expect(await finished(operation)).toMatchObject({ phase: outcome === 'applied' ? 'done' : 'failed' })
    expect(lifecycle.waitingReason).toBeUndefined()
    if (outcome === 'rejected') {
      expect(readMarketState(host.directory).activeSkinId).toBeNull()
      expect(readProfileBundles(host.directory)).toEqual([])
    }
    expect(update).toHaveBeenCalledTimes(1)
    expect(await finished(lifecycle.begin('activate', item.id))).toMatchObject({ phase: 'done' })
    expect(update).toHaveBeenCalledTimes(outcome === 'applied' ? 1 : 2)
  })
})
