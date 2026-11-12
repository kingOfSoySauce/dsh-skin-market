import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { compareVersions, createMarketUpdater, MARKET_NPM_METADATA_URL, MARKET_NPM_PACKAGE } from '../src/self-update.ts'
import type { CommandOptions, CommandResult, PluginRunner } from '../src/commands.ts'
import { compareInstalledArtifact, snapshotInstalledArtifact } from '../src/profile.ts'
import { officialDesktopRunner } from '../src/official-desktop.ts'
import { exportLogs } from '../src/log.ts'

const REVIEWED_INTEGRITY = 'sha512-market-reviewed'

function managedRunner(runner: PluginRunner, cancel = true): void {
  runner.management = { capabilities: () => ({ cancel: { available: cancel } }) } as NonNullable<PluginRunner['management']>
}

function materialize(profileDir: string, version: string): void {
  const directory = join(profileDir, 'node_modules', MARKET_NPM_PACKAGE)
  mkdirSync(directory, { recursive: true })
  const file = join(profileDir, 'package.json')
  const manifest = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { dependencies: { unrelated: '2.0.0' } }
  manifest.dependencies = { ...manifest.dependencies, [MARKET_NPM_PACKAGE]: version }
  writeFileSync(file, JSON.stringify(manifest))
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: MARKET_NPM_PACKAGE, version, main: './host.js', exports: { '.': './host.js', './client': './client.js' }, dsh: { client: { platform: 'web' } } }))
  writeFileSync(join(directory, 'host.js'), `export const version = '${version}'`)
  writeFileSync(join(directory, 'client.js'), `export const clientVersion = '${version}'`)
  const dependencyYaml = Object.entries(manifest.dependencies as Record<string, string>)
    .map(([name, spec]) => `      ${name}:\n        specifier: '${spec}'\n        version: '${spec}'`)
    .join('\n')
  writeFileSync(join(profileDir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n${dependencyYaml}\npackages:\n  '${MARKET_NPM_PACKAGE}@${version}':\n    resolution:\n      integrity: ${REVIEWED_INTEGRITY}\n`)
}

const temporaryDirectories: string[] = []

function installedProfile(version: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'market-artifact-'))
  temporaryDirectories.push(directory)
  materialize(directory, version)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})


function latest(version: string, includeIntegrity = true, time: unknown = { [version]: '2000-01-01T00:00:00.000Z' }): typeof fetch {
  return vi.fn(async () => ({ ok: true, json: async () => ({ 'dist-tags': { latest: version }, time, versions: { [version]: { version, gitHead: 'c'.repeat(40), dist: { tarball: `https://registry.npmjs.org/dsh-skin-market/-/dsh-skin-market-${version}.tgz`, ...(includeIntegrity ? { integrity: REVIEWED_INTEGRITY } : {}) } } } }) })) as unknown as typeof fetch
}

function packument(latestVersion: string, releases: ReadonlyArray<{ version: string; published?: string; integrity?: string }>): typeof fetch {
  const versions: Record<string, unknown> = {}
  const time: Record<string, string> = {}
  for (const release of releases) {
    versions[release.version] = {
      version: release.version,
      gitHead: 'd'.repeat(40),
      dist: {
        tarball: `https://registry.npmjs.org/dsh-skin-market/-/dsh-skin-market-${release.version}.tgz`,
        ...(release.integrity === undefined ? {} : { integrity: release.integrity }),
      },
    }
    if (release.published !== undefined) time[release.version] = release.published
  }
  return vi.fn(async () => ({ ok: true, json: async () => ({ 'dist-tags': { latest: latestVersion }, time, versions }) })) as unknown as typeof fetch
}

function releaseAgeFailure(packageName = 'dsh-skin-market', version = '0.1.60'): CommandResult {
  const output = `[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] 1 lockfile entries failed verification:\n ${packageName}@${version} was published at 2026-10-15T07:47:31.608Z, within the minimumReleaseAge cutoff (2026-10-14T08:04:41.370Z)`
  return { exitCode: 1, stdout: '', stderr: output, timedOut: false, management: {
    application: 'failed', error: { code: 'operation-error', diagnostic: output },
    packageResult: { exitCode: 1, kind: 'network', output },
  } }
}

describe('market self update', () => {
  it('holds a too-young Desktop release instead of exposing a guaranteed-to-fail update', async () => {
    const profileDir = installedProfile('0.1.59')
    writeFileSync(join(profileDir, 'pnpm-workspace.yaml'), 'minimumReleaseAge: 1440\n')
    const runner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false })) as unknown as PluginRunner
    managedRunner(runner)
    runner.hostKind = 'desktop'
    const published = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const updater = createMarketUpdater('desktop', runner, {
      currentVersion: '0.1.59', profileDir, fetch: latest('0.1.60', true, { '0.1.60': published }),
    })
    const status = await updater.status()
    expect(status.updateAvailable).toBe(false)
    expect(status.updateBlockedReason).toContain('供应链安全观察期')
    expect(status.updateAvailableAt).toBeDefined()
    expect(runner).not.toHaveBeenCalled()
  })

  it('updates to the newest release that already passed the Desktop release-age window', async () => {
    const profileDir = installedProfile('0.1.59')
    writeFileSync(join(profileDir, 'pnpm-workspace.yaml'), 'minimumReleaseAge: 1440\n')
    const runner = vi.fn(async (_profile: string, args: readonly string[]) => {
      if (args.includes(`${MARKET_NPM_PACKAGE}@0.1.60`)) materialize(profileDir, '0.1.60')
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false }
    }) as unknown as PluginRunner
    runner.hostKind = 'desktop'
    const now = Date.now()
    const updater = createMarketUpdater('desktop', runner, {
      currentVersion: '0.1.59',
      profileDir,
      cacheMs: 0,
      fetch: packument('0.1.61', [
        { version: '0.1.60', published: new Date(now - 25 * 60 * 60 * 1000).toISOString(), integrity: REVIEWED_INTEGRITY },
        { version: '0.1.61', published: new Date(now - 60 * 60 * 1000).toISOString(), integrity: REVIEWED_INTEGRITY },
      ]),
    })

    const before = await updater.status()
    expect(before).toMatchObject({ currentVersion: '0.1.59', latestVersion: '0.1.60', updateAvailable: true })
    expect(before.updateBlockedReason).toBeUndefined()
    expect(before.updateAvailableAt).toBeUndefined()

    await updater.update()
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([`${MARKET_NPM_PACKAGE}@0.1.60`]))
    expect(runner.mock.calls[0]?.[1]).not.toContain(`${MARKET_NPM_PACKAGE}@0.1.61`)

    const after = await updater.status()
    expect(after).toMatchObject({ currentVersion: '0.1.60', latestVersion: '0.1.61', updateAvailable: false })
    expect(after.updateBlockedReason).toContain('供应链安全观察期')
  })

  it('does not fall back to a release or prerelease whose age cannot be verified', async () => {
    const profileDir = installedProfile('0.1.59')
    writeFileSync(join(profileDir, 'pnpm-workspace.yaml'), 'minimumReleaseAge: 1440\n')
    const runner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false })) as unknown as PluginRunner
    runner.hostKind = 'desktop'
    const now = Date.now()
    const updater = createMarketUpdater('desktop', runner, {
      currentVersion: '0.1.59', profileDir,
      fetch: packument('0.1.61', [
        { version: '0.1.60-rc.1', published: new Date(now - 25 * 60 * 60 * 1000).toISOString(), integrity: REVIEWED_INTEGRITY },
        { version: '0.1.60', integrity: REVIEWED_INTEGRITY },
        { version: '0.1.61', published: new Date(now - 60 * 60 * 1000).toISOString(), integrity: REVIEWED_INTEGRITY },
      ]),
    })
    const status = await updater.status()
    expect(status.updateAvailable).toBe(false)
    expect(status.latestVersion).toBe('0.1.61')
    expect(status.updateBlockedReason).toContain('供应链安全观察期')
    expect(runner).not.toHaveBeenCalled()
  })

  it('overlays an already installed market with the host pnpm and never removes it', async () => {
    const profileDir = installedProfile('0.1.59')
    const verbs: string[] = []
    const runner = vi.fn(async (_profile: string, args: readonly string[]) => {
      verbs.push(args[0] ?? '')
      if (verbs.length === 1) return { ...releaseAgeFailure(), management: { application: 'failed' as const, error: { code: 'already-installed' } } }
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false }
    }) as unknown as PluginRunner
    managedRunner(runner)
    runner.hostKind = 'desktop'
    const hostPnpm = vi.fn(async () => {
      materialize(profileDir, '0.1.60')
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false }
    })
    runner.hostPnpm = hostPnpm
    const updater = createMarketUpdater('desktop', runner, {
      currentVersion: '0.1.59', profileDir, cacheMs: 0, fetch: latest('0.1.60'),
    })
    await expect(updater.update()).resolves.toMatchObject({ currentVersion: '0.1.60', latestVersion: '0.1.60', updateAvailable: false })
    expect(verbs).toEqual(['add'])
    expect(hostPnpm).toHaveBeenCalledTimes(1)
    expect(hostPnpm.mock.calls[0]?.[0]).toEqual(expect.arrayContaining(['add', `${MARKET_NPM_PACKAGE}@0.1.60`]))
    expect(updater.restartRequired).toBe(true)
    expect(snapshotInstalledArtifact(profileDir, MARKET_NPM_PACKAGE)).toMatchObject({ ok: true, version: '0.1.60' })
  })

  it('fails without uninstalling the market when this host publishes no pnpm', async () => {
    const profileDir = installedProfile('0.1.59')
    const verbs: string[] = []
    const runner = vi.fn(async (_profile: string, args: readonly string[]) => {
      verbs.push(args[0] ?? '')
      return { ...releaseAgeFailure(), management: { application: 'failed' as const, error: { code: 'already-installed' } } }
    }) as unknown as PluginRunner
    managedRunner(runner)
    runner.hostKind = 'desktop'
    const updater = createMarketUpdater('desktop', runner, {
      currentVersion: '0.1.59', profileDir, cacheMs: 0, fetch: latest('0.1.60'),
    })
    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(operation.phase).toBe('failed'))
    expect(verbs).toEqual(['add'])
    expect(operation.message).toContain('市场没有被卸载')
    expect(operation.message).toContain(`pnpm add ${MARKET_NPM_PACKAGE}@0.1.60`)
    expect(snapshotInstalledArtifact(profileDir, MARKET_NPM_PACKAGE)).toMatchObject({ ok: true, version: '0.1.59' })
  })

  it.each([{}, { '0.1.60': new Date().toISOString() }, { '0.1.60': 'not-a-time' }])('does not infer a Desktop block or warning from publication metadata %j', async time => {
    const profileDir = installedProfile('0.1.59')
    const runner = vi.fn(async () => {
      materialize(profileDir, '0.1.60')
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false, management: { application: 'restart-required' as const } }
    }) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: latest('0.1.60', true, time) })
    await expect(updater.status()).resolves.toEqual({ currentVersion: '0.1.59', loadedVersion: '0.1.59', latestVersion: '0.1.60', updateAvailable: true })
    await expect(updater.update()).resolves.toMatchObject({ currentVersion: '0.1.60', updateAvailable: false })
    expect(runner).toHaveBeenCalledTimes(1)
    expect(updater.restartRequired).toBe(true)
    expect((await updater.status()).packageOperationsWarning).toBeUndefined()
  })

  it('uses the host-provided registry order when the primary metadata request fails', async () => {
    const profileDir = installedProfile('0.1.59')
    const primary = 'https://registry.primary.example'
    const fallback = 'https://registry.fallback.example'
    const fetchLatest = vi.fn(async (url: string) => {
      if (url.startsWith(primary)) throw new TypeError('fetch failed')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          'dist-tags': { latest: '0.1.60' },
          versions: { '0.1.60': {
            version: '0.1.60', gitHead: 'e'.repeat(40),
            dist: { tarball: `${fallback}/${MARKET_NPM_PACKAGE}/-/${MARKET_NPM_PACKAGE}-0.1.60.tgz`, integrity: REVIEWED_INTEGRITY },
          } },
        }),
      }
    }) as unknown as typeof fetch
    const runner = vi.fn(async () => {
      materialize(profileDir, '0.1.60')
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false, management: { application: 'restart-required' as const } }
    }) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, {
      currentVersion: '0.1.59', profileDir, fetch: fetchLatest,
      registryPlan: async () => [primary, fallback],
    })

    await expect(updater.update()).resolves.toMatchObject({ currentVersion: '0.1.60', updateAvailable: false })
    expect(fetchLatest.mock.calls.map(([url]) => url)).toEqual([
      `${primary}/${MARKET_NPM_PACKAGE}`, `${fallback}/${MARKET_NPM_PACKAGE}`,
    ])
    expect(runner).toHaveBeenCalledOnce()
  })

  it('keeps the last verified exact release for an update-time metadata failure', async () => {
    const profileDir = installedProfile('0.1.59')
    let calls = 0
    const fetchLatest = vi.fn(async () => {
      calls += 1
      if (calls > 1) throw new TypeError('fetch failed')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          'dist-tags': { latest: '0.1.60' },
          versions: { '0.1.60': {
            version: '0.1.60', gitHead: 'f'.repeat(40),
            dist: { tarball: `https://registry.npmjs.org/${MARKET_NPM_PACKAGE}/-/${MARKET_NPM_PACKAGE}-0.1.60.tgz`, integrity: REVIEWED_INTEGRITY },
          } },
        }),
      }
    }) as unknown as typeof fetch
    const runner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false })) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: fetchLatest })

    await expect(updater.status()).resolves.toMatchObject({ latestVersion: '0.1.60', updateAvailable: true })
    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(operation.phase).toBe('failed'))
    expect(operation.failure).toMatchObject({ kind: 'network', fallbackSpec: 'dsh-skin-market@0.1.60' })
    expect(runner).not.toHaveBeenCalled()
  })

  it.each([true, false])('freezes the verified source across concurrent metadata checks changed=%s', async changed => {
    const profileDir = installedProfile('0.1.59')
    const manifest = readFileSync(join(profileDir, 'package.json'), 'utf8')
    const lock = readFileSync(join(profileDir, 'pnpm-lock.yaml'), 'utf8')
    const replacementVersion = changed ? '0.1.61' : '0.1.60'
    const runner = vi.fn(async () => {
      materialize(profileDir, replacementVersion)
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false, management: { application: 'restart-required' as const } }
    }) as unknown as PluginRunner
    managedRunner(runner)
    runner.ensurePnpm = vi.fn()
    const responses: Array<(response: Response) => void> = []
    const fetchLatest = vi.fn(() => new Promise<Response>(resolve => { responses.push(resolve) })) as unknown as typeof fetch
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: fetchLatest })
    const operation = updater.startUpdate()
    const concurrentStatus = updater.status(true)
    expect(responses).toHaveLength(2)
    const originalResponse = await latest('0.1.60')('https://fixture.test')
    const replacementResponse = await latest(replacementVersion)('https://fixture.test')
    responses[0](originalResponse)
    responses[1](replacementResponse)
    await concurrentStatus
    await vi.waitFor(() => expect(operation.phase).toBe(changed ? 'failed' : 'done'))
    if (changed) {
      expect(operation.message).toBe('版本检查结果已变化，请重新检查后再更新。')
      expect(runner).not.toHaveBeenCalled()
      expect(readFileSync(join(profileDir, 'package.json'), 'utf8')).toBe(manifest)
      expect(readFileSync(join(profileDir, 'pnpm-lock.yaml'), 'utf8')).toBe(lock)
    } else {
      expect(runner).toHaveBeenCalledExactlyOnceWith('desktop', ['add', 'dsh-skin-market@0.1.60', '--reporter=ndjson'], expect.any(Object))
      expect(updater.restartRequired).toBe(true)
    }
  })

  it('merges already allowed duplicate versions before requesting an official update', async () => {
    const profileDir = installedProfile('0.1.59')
    const workspace = join(profileDir, 'pnpm-workspace.yaml')
    writeFileSync(workspace, 'minimumReleaseAge: 2880\nminimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n  - unrelated@2.0.0\n  - dsh-skin-market@0.1.60\n')
    const runner = vi.fn(async () => {
      const config = parse(readFileSync(workspace, 'utf8'))
      expect(config.minimumReleaseAge).toBe(2880)
      expect(config.minimumReleaseAgeExclude).toHaveLength(2)
      expect(config.minimumReleaseAgeExclude.join(' ')).toContain('0.1.59')
      expect(config.minimumReleaseAgeExclude.join(' ')).toContain('0.1.60')
      expect(config.minimumReleaseAgeExclude).toContain('unrelated@2.0.0')
      materialize(profileDir, '0.1.60')
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false, management: { application: 'restart-required' as const } }
    }) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: latest('0.1.60') })
    await expect(updater.update()).resolves.toMatchObject({ currentVersion: '0.1.60' })
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('repairs a duplicate rule appended during a confirmed failure and retries the same update once', async () => {
    const profileDir = installedProfile('0.1.59')
    const workspace = join(profileDir, 'pnpm-workspace.yaml')
    writeFileSync(workspace, 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n')
    const runner = vi.fn(async () => {
      if (runner.mock.calls.length === 1) {
        writeFileSync(workspace, readFileSync(workspace, 'utf8') + '  - dsh-skin-market@0.1.60\n')
        return releaseAgeFailure()
      }
      expect(parse(readFileSync(workspace, 'utf8')).minimumReleaseAgeExclude).toHaveLength(1)
      materialize(profileDir, '0.1.60')
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false, management: { application: 'restart-required' as const } }
    }) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: latest('0.1.60') })
    await expect(updater.update()).resolves.toMatchObject({ currentVersion: '0.1.60' })
    expect(runner).toHaveBeenCalledTimes(2)
    expect((runner as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual((runner as ReturnType<typeof vi.fn>).mock.calls[1][1])
  })

  it.each([true, false])('repairs a confirmed age refusal after materialization and partial metadata rollback, second request succeeds=%s', async succeeds => {
    const profileDir = installedProfile('0.1.59')
    const workspace = join(profileDir, 'pnpm-workspace.yaml')
    const manifestFile = join(profileDir, 'package.json')
    const lockFile = join(profileDir, 'pnpm-lock.yaml')
    const oldManifest = readFileSync(manifestFile, 'utf8')
    const oldLock = readFileSync(lockFile, 'utf8')
    writeFileSync(workspace, 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n')
    const runner = vi.fn(async () => {
      if (runner.mock.calls.length === 1) {
        // pnpm writes the new package before the whole-lockfile policy check;
        // Desktop restores metadata but leaves the newly materialized package.
        materialize(profileDir, '0.1.60')
        writeFileSync(manifestFile, oldManifest)
        writeFileSync(lockFile, oldLock)
        writeFileSync(workspace, readFileSync(workspace, 'utf8') + '  - dsh-skin-market@0.1.60\n')
        return releaseAgeFailure()
      }
      expect(parse(readFileSync(workspace, 'utf8')).minimumReleaseAgeExclude).toHaveLength(1)
      if (!succeeds) return releaseAgeFailure()
      materialize(profileDir, '0.1.60')
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false, management: { application: 'restart-required' as const } }
    }) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: latest('0.1.60') })
    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(operation.phase).toBe(succeeds ? 'done' : 'failed'))
    expect(runner).toHaveBeenCalledTimes(2)
    const calls = (runner as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][1]).toEqual(['add', 'dsh-skin-market@0.1.60', '--reporter=ndjson'])
    expect(calls[1][1]).toEqual(calls[0][1])
    if (succeeds) {
      expect(operation.integrityVerified).toBe(true)
      expect(operation.status?.currentVersion).toBe('0.1.60')
    } else {
      expect(operation.failure?.kind).toBe('release-age')
      expect(operation.failure?.action).toBe('approve-release-age')
      expect(operation.message).toContain('安装文件已部分写入')
    }
  })

  it('does not use an unrelated repaired rule to repeat an age failure with altered artifacts', async () => {
    const profileDir = installedProfile('0.1.59')
    const workspace = join(profileDir, 'pnpm-workspace.yaml')
    writeFileSync(workspace, 'minimumReleaseAgeExclude:\n  - unrelated@1.0.0\n')
    const runner = vi.fn(async () => {
      rmSync(join(profileDir, 'node_modules', MARKET_NPM_PACKAGE, 'client.js'))
      writeFileSync(workspace, readFileSync(workspace, 'utf8') + '  - unrelated@2.0.0\n')
      return releaseAgeFailure()
    }) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: latest('0.1.60') })
    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(operation.phase).toBe('failed'))
    expect(runner).toHaveBeenCalledTimes(1)
    expect(operation.failure?.action).toBe('approve-release-age')
    expect(parse(readFileSync(workspace, 'utf8')).minimumReleaseAgeExclude).toHaveLength(1)
  })

  it.each(['unknown', 'cancelled', 'aborted', 'timeout'] as const)('does not repair or retry a duplicate appended with an %s result', async outcome => {
    const profileDir = installedProfile('0.1.59')
    const workspace = join(profileDir, 'pnpm-workspace.yaml')
    writeFileSync(workspace, 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n')
    const runner = vi.fn(async () => {
      writeFileSync(workspace, readFileSync(workspace, 'utf8') + '  - dsh-skin-market@0.1.60\n')
      const failure = releaseAgeFailure()
      return { ...failure, ...(outcome === 'aborted' ? { aborted: true } : {}), timedOut: outcome === 'timeout',
        management: outcome === 'unknown' ? { application: 'unknown' as const, indeterminate: true }
          : outcome === 'cancelled' ? { application: 'cancelled' as const } : failure.management }
    }) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: latest('0.1.60') })
    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(operation.phase).toBe(outcome === 'unknown' ? 'waiting' : outcome === 'cancelled' ? 'cancelled' : 'failed'))
    expect(runner).toHaveBeenCalledTimes(1)
    expect(parse(readFileSync(workspace, 'utf8')).minimumReleaseAgeExclude).toHaveLength(2)
    expect(operation.failure?.action).toBeUndefined()
    expect(() => updater.retry(operation.id, 'approve-release-age')).toThrow('不可重试')
  })

  it('approves only the reported exact dependency after an explicit action, preserving global policy', async () => {
    const profileDir = installedProfile('0.1.59')
    const workspace = join(profileDir, 'pnpm-workspace.yaml')
    writeFileSync(workspace, 'minimumReleaseAge: 2880\nminimumReleaseAgeExclude:\n  - unrelated@2.0.0\n')
    const runner = vi.fn(async () => {
      if (runner.mock.calls.length === 1) return releaseAgeFailure('@scope/blocked', '2.3.4')
      const config = parse(readFileSync(workspace, 'utf8'))
      expect(config.minimumReleaseAge).toBe(2880)
      expect(config.minimumReleaseAgeExclude).toEqual(['unrelated@2.0.0', '@scope/blocked@2.3.4'])
      materialize(profileDir, '0.1.60')
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false, management: { application: 'restart-required' as const } }
    }) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: latest('0.1.60') })
    const failed = updater.startUpdate()
    await vi.waitFor(() => expect(failed.phase).toBe('failed'))
    expect(failed.failure).toMatchObject({ action: 'approve-release-age', releaseAgeTarget: { packageName: '@scope/blocked', version: '2.3.4' } })
    expect(parse(readFileSync(workspace, 'utf8')).minimumReleaseAgeExclude).toEqual(['unrelated@2.0.0'])
    expect(() => updater.retry(failed.id)).toThrow('不可重试')
    const approved = updater.retry(failed.id, 'approve-release-age')
    await vi.waitFor(() => expect(approved.phase).toBe('done'))
    expect(runner).toHaveBeenCalledTimes(2)
  })

  it.each(['version', 'integrity', 'failed-target', 'mutated-target'] as const)('rejects a stale approval when %s changes before configuration writes', async changed => {
    const profileDir = installedProfile('0.1.59')
    const runner = vi.fn(async () => releaseAgeFailure()) as unknown as PluginRunner
    managedRunner(runner)
    const fetchLatest = vi.fn().mockImplementation(latest('0.1.60')) as unknown as typeof fetch
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: fetchLatest })
    const failed = updater.startUpdate()
    await vi.waitFor(() => expect(failed.phase).toBe('failed'))
    if (changed === 'version') vi.mocked(fetchLatest).mockImplementation(latest('0.1.61'))
    if (changed === 'integrity') {
      const response = await latest('0.1.60')('https://fixture.test')
      const value = await response.json()
      value.versions['0.1.60'].dist.integrity = 'sha512-replaced'
      vi.mocked(fetchLatest).mockResolvedValue({ ok: true, json: async () => value } as Response)
    }
    if (changed === 'failed-target') failed.failure!.releaseAgeTarget = { packageName: 'other', version: '9.0.0' }
    if (changed === 'mutated-target') failed.failure!.releaseAgeTarget!.version = '9.0.0'
    const approved = updater.retry(failed.id, 'approve-release-age')
    await vi.waitFor(() => expect(approved.phase).toBe('failed'))
    expect(approved.message).toContain('已变化')
    expect(runner).toHaveBeenCalledTimes(1)
    expect(existsSync(join(profileDir, 'pnpm-workspace.yaml'))).toBe(false)
  })

  it('rechecks approval after preparing pnpm and before writing the exemption or sending another request', async () => {
    const profileDir = installedProfile('0.1.59')
    const workspace = join(profileDir, 'pnpm-workspace.yaml')
    writeFileSync(workspace, 'minimumReleaseAge: 1440\n')
    const original = readFileSync(workspace, 'utf8')
    const runner = vi.fn(async () => releaseAgeFailure()) as unknown as PluginRunner
    managedRunner(runner)
    let resume!: () => void
    runner.ensurePnpm = vi.fn().mockResolvedValueOnce(undefined).mockImplementation(() => new Promise<void>(resolve => { resume = resolve }))
    const fetchLatest = vi.fn().mockImplementation(latest('0.1.60')) as unknown as typeof fetch
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: fetchLatest })
    const failed = updater.startUpdate()
    await vi.waitFor(() => expect(failed.phase).toBe('failed'))
    const approved = updater.retry(failed.id, 'approve-release-age')
    await vi.waitFor(() => expect(runner.ensurePnpm).toHaveBeenCalledTimes(2))
    vi.mocked(fetchLatest).mockImplementation(latest('0.1.61'))
    await updater.status(true)
    resume()
    await vi.waitFor(() => expect(approved.phase).toBe('failed'))
    expect(approved.message).toContain('已变化')
    expect(runner).toHaveBeenCalledTimes(1)
    expect(readFileSync(workspace, 'utf8')).toBe(original)
  })

  it('keeps exact approval available after a known age failure partially materializes a new release without adding an exemption', async () => {
    const profileDir = installedProfile('0.1.59')
    const workspace = join(profileDir, 'pnpm-workspace.yaml')
    const manifestFile = join(profileDir, 'package.json')
    const lockFile = join(profileDir, 'pnpm-lock.yaml')
    const oldManifest = readFileSync(manifestFile, 'utf8')
    const oldLock = readFileSync(lockFile, 'utf8')
    writeFileSync(workspace, 'minimumReleaseAge: 1440\nminimumReleaseAgeExclude:\n  - unrelated@2.0.0\n')
    const runner = vi.fn(async () => {
      if (runner.mock.calls.length === 1) {
        materialize(profileDir, '0.1.60')
        writeFileSync(manifestFile, oldManifest)
        writeFileSync(lockFile, oldLock)
        return releaseAgeFailure()
      }
      const config = parse(readFileSync(workspace, 'utf8'))
      expect(config.minimumReleaseAge).toBe(1440)
      expect(config.minimumReleaseAgeExclude).toEqual(['unrelated@2.0.0', 'dsh-skin-market@0.1.60'])
      materialize(profileDir, '0.1.60')
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false, management: { application: 'restart-required' as const } }
    }) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: latest('0.1.60') })
    const failed = updater.startUpdate()
    await vi.waitFor(() => expect(failed.phase).toBe('failed'))
    expect(runner).toHaveBeenCalledTimes(1)
    expect(failed.failure).toMatchObject({ kind: 'release-age', action: 'approve-release-age', releaseAgeTarget: { packageName: 'dsh-skin-market', version: '0.1.60' } })
    expect(failed.message).toContain('安装文件已部分写入')
    expect(parse(readFileSync(workspace, 'utf8')).minimumReleaseAgeExclude).toEqual(['unrelated@2.0.0'])
    const approved = updater.retry(failed.id, 'approve-release-age')
    await vi.waitFor(() => expect(approved.phase).toBe('done'))
    expect(approved.integrityVerified).toBe(true)
    const calls = (runner as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][1]).toEqual(['add', 'dsh-skin-market@0.1.60', '--reporter=ndjson'])
    expect(calls[1][1]).toEqual(calls[0][1])
    expect(updater.restartRequired).toBe(true)
  })

  it('does not approve or retry a non-age failure whose rollback cannot be verified', async () => {
    const profileDir = installedProfile('0.1.59')
    const workspace = join(profileDir, 'pnpm-workspace.yaml')
    writeFileSync(workspace, 'minimumReleaseAgeExclude:\n  - dsh-skin-market@0.1.59\n')
    const runner = vi.fn(async () => {
      rmSync(join(profileDir, 'node_modules', MARKET_NPM_PACKAGE, 'client.js'))
      return { exitCode: 1, stdout: '', stderr: 'ECONNRESET', timedOut: false, management: { application: 'failed' as const, packageResult: { exitCode: 1, kind: 'network' as const, output: 'ECONNRESET' } } }
    }) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: latest('0.1.60') })
    const failed = updater.startUpdate()
    await vi.waitFor(() => expect(failed.phase).toBe('failed'))
    expect(failed.failure?.kind).toBe('network')
    expect(failed.failure?.action).toBeUndefined()
    expect(failed.message).toContain('不能确认取消或失败已恢复')
    expect(parse(readFileSync(workspace, 'utf8')).minimumReleaseAgeExclude).toHaveLength(1)
    expect(() => updater.retry(failed.id, 'approve-release-age')).toThrow('不可重试')
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('preserves a real official whole-lockfile release-age refusal and its copied diagnostic without bypassing it', async () => {
    const profileDir = installedProfile('0.1.59')
    const output = 'WARN GET https://registry.npmmirror.com/fixture error (ECONNRESET). Will retry in 10 seconds.\n'
      + '[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] 1 lockfile entries failed verification: dsh-skin-market@0.1.60 was published at 2026-10-15T07:47:31.608Z, within the minimumReleaseAge cutoff (2026-10-14T08:04:41.370Z)'
    const installBundle = vi.fn(async () => ({
      changed: false, application: 'failed', stage: 'install', target: 'dsh-skin-market@0.1.60',
      error: { code: 'operation-error', diagnostic: output },
      packageResult: { exitCode: 1, kind: 'network', output, logPath: '/tmp/fixture-pnpm.log' },
      pendingBuilds: ['unrelated-addon'],
    }))
    const runner = officialDesktopRunner(() => ({ installBundle, removeBundle: vi.fn() }), { version: '0.2.0-rc.2', source: 'injected', capabilities: [] })
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: latest('0.1.60') })
    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(operation.phase).toBe('failed'))
    expect(operation).toMatchObject({ application: 'failed', failure: { kind: 'release-age', packageName: 'dsh-skin-market' } })
    expect(operation.message).toContain('dsh-skin-market@0.1.60')
    expect(operation.message).toContain('新包保护期')
    expect(operation.failure).toMatchObject({ action: 'approve-release-age', releaseAgeTarget: { packageName: 'dsh-skin-market', version: '0.1.60' } })
    expect(operation.failure?.buildKeys).toBeUndefined()
    expect(() => updater.retry(operation.id)).toThrow('不可重试')
    expect(installBundle).toHaveBeenCalledExactlyOnceWith('dsh-skin-market@0.1.60', { enabled: false, requestId: expect.any(String) })
    const logs = exportLogs({}, operation.id)
    expect(logs).toContain('kind=release-age')
    expect(logs).toContain('application=failed')
    expect(logs).toContain('packageKind=network')
    expect(logs).toContain('ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION')
    expect(logs).toContain('within the minimumReleaseAge cutoff')
    expect(updater.restartRequired).toBe(false)
  })

  it.each([
    ['network', 'network'], ['timeout', 'fetch-timeout'], ['not-found', 'fetch-404'],
    ['no-matching-version', 'no-matching-version'], ['disk-full', 'disk-full'],
    ['permission', 'permission'], ['integrity', 'integrity'], ['build-blocked', 'build-approval'],
  ])('keeps official self-update package kind %s as %s', async (nativeKind, expectedKind) => {
    const profileDir = installedProfile('0.1.59')
    const installBundle = vi.fn(async () => ({
      changed: false, application: 'failed', stage: 'install', error: { code: 'operation-error', diagnostic: 'The package operation did not complete' },
      packageResult: { exitCode: 1, kind: nativeKind, output: 'The package operation did not complete' }, pendingBuilds: ['unrelated-addon'],
    }))
    const runner = officialDesktopRunner(() => ({ installBundle, removeBundle: vi.fn() }), { version: '0.2.0-rc.2', source: 'injected', capabilities: [] })
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: latest('0.1.60') })
    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(operation.phase).toBe('failed'))
    expect(operation).toMatchObject({ application: 'failed', failure: { kind: expectedKind } })
    expect(installBundle).toHaveBeenCalledTimes(1)
    expect(exportLogs({}, operation.id)).toContain(`packageKind=${nativeKind}`)
    expect(operation.failure?.action).toBe(nativeKind === 'network' || nativeKind === 'timeout' ? 'retry' : undefined)
  })

  it('retains the official cause and blocks retry when changed native artifacts cannot be verified restored', async () => {
    const profileDir = installedProfile('0.1.59')
    const installBundle = vi.fn(async () => {
      rmSync(join(profileDir, 'node_modules', MARKET_NPM_PACKAGE, 'client.js'))
      return {
        changed: false, application: 'failed', stage: 'install', error: { code: 'operation-error', diagnostic: 'ECONNRESET' },
        packageResult: { exitCode: 1, kind: 'network', output: 'ECONNRESET' },
      }
    })
    const runner = officialDesktopRunner(() => ({ installBundle, removeBundle: vi.fn() }), { version: '0.2.0-rc.2', source: 'injected', capabilities: [] })
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.59', profileDir, fetch: latest('0.1.60') })
    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(operation.phase).toBe('failed'))
    expect(operation).toMatchObject({ application: 'failed', failure: { kind: 'network' } })
    expect(operation.failure?.message).toContain('无法连接安装源')
    expect(operation.failure?.message).toContain('不能确认取消或失败已恢复')
    expect(operation.failure?.action).toBeUndefined()
    expect(() => updater.retry(operation.id)).toThrow('不可重试')
    expect(exportLogs({}, operation.id)).toContain('market-update-recovery')
    expect(installBundle).toHaveBeenCalledTimes(1)
    expect(existsSync(join(profileDir, 'node_modules', MARKET_NPM_PACKAGE, 'client.js'))).toBe(false)
  })

  it('compares stable and prerelease semantic versions', () => {
    expect(compareVersions('0.1.16', '0.1.15')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0-rc.6')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-rc.7', '1.0.0-rc.6')).toBeGreaterThan(0)
    expect(compareVersions('0.1.15', '0.1.15')).toBe(0)
  })

  it('only installs when npm has a newer immutable package and hides the update afterwards', async () => {
    const dshHome = mkdtempSync(join(tmpdir(), 'dsh-market-self-update-'))
    temporaryDirectories.push(dshHome)
    const profileDir = join(dshHome, 'profiles', 'web')
    mkdirSync(profileDir, { recursive: true })
    materialize(profileDir, '0.1.15')
    writeFileSync(join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
    const previousDshHome = process.env.DSH_HOME
    process.env.DSH_HOME = dshHome

    try {
      const commit = 'a'.repeat(40)
      const fetchLatest = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '0.1.16' },
          time: { '0.1.16': '2000-01-01T00:00:00.000Z' },
          versions: {
            '0.1.16': {
              version: '0.1.16',
              gitHead: commit,
              dist: { tarball: 'https://registry.npmjs.org/dsh-skin-market/-/dsh-skin-market-0.1.16.tgz' },
            },
          },
        }),
      })) as unknown as typeof fetch
      const runner = vi.fn(async () => { materialize(profileDir, '0.1.16'); return { exitCode: 0, stdout: '', stderr: '', timedOut: false } })
      const updater = createMarketUpdater('web', runner, { currentVersion: '0.1.15', fetch: fetchLatest, cacheMs: 0 })

      expect(updater.restartRequired).toBe(false)
      await expect(updater.status()).resolves.toEqual({ currentVersion: '0.1.15', loadedVersion: '0.1.15', latestVersion: '0.1.16', updateAvailable: true })
      await expect(updater.update()).resolves.toEqual({ currentVersion: '0.1.16', loadedVersion: '0.1.15', latestVersion: '0.1.16', updateAvailable: false })
      expect(updater.restartRequired).toBe(true)
      expect(fetchLatest).toHaveBeenCalledWith(MARKET_NPM_METADATA_URL, expect.objectContaining({ headers: expect.objectContaining({ accept: 'application/json' }) }))
      expect(runner).toHaveBeenCalledTimes(1)
      expect(runner).toHaveBeenCalledWith('web', ['add', '-w', `${MARKET_NPM_PACKAGE}@0.1.16`, '--reporter=ndjson'], expect.objectContaining({
        signal: expect.any(AbortSignal),
        env: { pnpm_config_fetch_timeout: '600000' },
      }))
      await expect(updater.status()).resolves.toEqual({ currentVersion: '0.1.16', loadedVersion: '0.1.15', latestVersion: '0.1.16', updateAvailable: false })
    } finally {
      if (previousDshHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousDshHome
    }
  })

  it('recovers a verified pending market version after the updater is remounted in the same Host', async () => {
    const profileDir = installedProfile('0.1.15')
    const runner = vi.fn(async () => {
      materialize(profileDir, '0.1.16')
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false, management: { application: 'restart-required' as const } }
    }) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.15', profileDir, fetch: latest('0.1.16') })
    await updater.update()
    expect(updater.restartRequired).toBe(true)

    const remounted = createMarketUpdater('desktop', runner, { currentVersion: '0.1.15', profileDir, fetch: latest('0.1.16') })
    expect(remounted.restartRequired).toBe(true)
    expect(remounted.restartNoticeId).toBe(updater.restartNoticeId)
    await expect(remounted.status()).resolves.toMatchObject({ currentVersion: '0.1.16', loadedVersion: '0.1.15', updateAvailable: false })
    expect(runner).toHaveBeenCalledTimes(1)

    // A new Host loading the installed release has no old update pending.
    const restarted = createMarketUpdater('desktop', runner, { currentVersion: '0.1.16', profileDir, fetch: latest('0.1.16') })
    expect(restarted.restartRequired).toBe(false)
    expect(restarted.restartNoticeId).toBeUndefined()
    await expect(restarted.status()).resolves.toMatchObject({ currentVersion: '0.1.16', loadedVersion: '0.1.16', updateAvailable: false })
  })

  it('detects an official plugin-page update without relying on a self-update operation or cached npm status', async () => {
    const profileDir = installedProfile('0.1.15')
    const runner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }))
    const fetchLatest = latest('0.1.16')
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.15', profileDir, fetch: fetchLatest })
    await expect(updater.status()).resolves.toMatchObject({ currentVersion: '0.1.15', loadedVersion: '0.1.15', updateAvailable: true })

    materialize(profileDir, '0.1.16')
    expect(updater.currentOperation()).toBeNull()
    expect(updater.restartRequired).toBe(true)
    await expect(updater.status()).resolves.toMatchObject({ currentVersion: '0.1.16', loadedVersion: '0.1.15', updateAvailable: false })
    expect(fetchLatest).toHaveBeenCalledTimes(1)
    expect(runner).not.toHaveBeenCalled()

    // Restoring the already-loaded release also resolves the version mismatch.
    materialize(profileDir, '0.1.15')
    expect(updater.restartRequired).toBe(false)
  })

  it('does not turn an unreadable or inconsistent external market artifact into a restart instruction', async () => {
    const profileDir = installedProfile('0.1.16')
    rmSync(join(profileDir, 'node_modules', MARKET_NPM_PACKAGE, 'client.js'))
    const runner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }))
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.15', profileDir, fetch: latest('0.1.16') })
    expect(updater.restartRequired).toBe(false)
    await expect(updater.status()).resolves.toMatchObject({ currentVersion: '0.1.15', loadedVersion: '0.1.15', updateAvailable: true })

    materialize(profileDir, '0.1.16')
    const lockFile = join(profileDir, 'pnpm-lock.yaml')
    writeFileSync(lockFile, readFileSync(lockFile, 'utf8').replace("specifier: '0.1.16'", "specifier: '^0.1.16'"))
    expect(updater.restartRequired).toBe(false)
  })

  it('does not reinstall the same version', async () => {
    const runner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }))
    const updater = createMarketUpdater('web', runner, {
      currentVersion: '0.1.15',
      fetch: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '0.1.15' },
          versions: {
            '0.1.15': {
              version: '0.1.15',
              gitHead: 'b'.repeat(40),
              dist: { tarball: 'https://registry.npmjs.org/dsh-skin-market/-/dsh-skin-market-0.1.15.tgz' },
            },
          },
        }),
      })) as unknown as typeof fetch,
      cacheMs: 0,
    })

    await expect(updater.update()).resolves.toMatchObject({ updateAvailable: false })
    expect(runner).not.toHaveBeenCalled()
  })

  it('aborts and waits for an in-flight self-update when the route is disposed', async () => {
    let resolveRunner!: (result: CommandResult) => void
    const runner = vi.fn(() => new Promise<CommandResult>(resolve => { resolveRunner = resolve })) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, {
      currentVersion: '0.1.15',
      profileDir: installedProfile('0.1.15'),
      fetch: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '0.1.16' },
          time: { '0.1.16': '2000-01-01T00:00:00.000Z' },
          versions: {
            '0.1.16': {
              version: '0.1.16',
              gitHead: 'd'.repeat(40),
              dist: { tarball: 'https://registry.npmjs.org/dsh-skin-market/-/dsh-skin-market-0.1.16.tgz' },
            },
          },
        }),
      })) as unknown as typeof fetch,
      cacheMs: 0,
    })

    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(runner).toHaveBeenCalled())
    const disposing = updater.dispose!()
    expect(operation.phase).toBe('cancelling')
    resolveRunner({ exitCode: null, stdout: '', stderr: '', timedOut: false, aborted: true, management: { application: 'cancelled' } } as CommandResult)
    await disposing
    expect(operation.phase).toBe('cancelled')
  })

  it('retries a self-update once when the new package is inside the release-age cutoff', async () => {
    const commit = 'c'.repeat(40)
    const fetchLatest = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        'dist-tags': { latest: '0.1.17' },
        versions: {
          '0.1.17': {
            version: '0.1.17',
            gitHead: commit,
            dist: { tarball: 'https://registry.npmjs.org/dsh-skin-market/-/dsh-skin-market-0.1.17.tgz' },
          },
        },
      }),
    })) as unknown as typeof fetch
    const attempts: Array<readonly string[]> = []
    const profileDir = installedProfile('0.1.16')
    const runner = vi.fn(async (_profile: string, args: readonly string[], _options?: CommandOptions) => {
      attempts.push(args)
      if (attempts.length > 1) materialize(profileDir, '0.1.17')
      return attempts.length === 1
        ? { exitCode: 1, stdout: '', stderr: 'dsh-skin-market@0.1.17 was published within the minimumReleaseAge cutoff', timedOut: false }
        : { exitCode: 0, stdout: '', stderr: '', timedOut: false }
    })
    const updater = createMarketUpdater('web', runner, { currentVersion: '0.1.16', profileDir, fetch: fetchLatest, cacheMs: 0 })

    await expect(updater.update()).resolves.toMatchObject({ currentVersion: '0.1.17', updateAvailable: false })

    expect(attempts[0]).not.toContain('--config.minimumReleaseAge=0')
    expect(attempts[1]).toContain('--config.minimumReleaseAge=0')
  })

  it('does not announce success when exit zero did not materialize the requested version', async () => {
    const profileDir = installedProfile('0.1.15')
    const runner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }))
    const updater = createMarketUpdater('web', runner, { currentVersion: '0.1.15', profileDir, fetch: latest('0.1.16') })
    await expect(updater.update()).rejects.toThrow('未物化')
    expect(updater.restartRequired).toBe(false)
    expect((await updater.status()).currentVersion).toBe('0.1.15')
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('restores a mid-swap cancelled Web update once and verifies the frozen artifact', async () => {
    const profileDir = installedProfile('0.1.15')
    const baseline = snapshotInstalledArtifact(profileDir, MARKET_NPM_PACKAGE)
    const manifest = readFileSync(join(profileDir, 'package.json'), 'utf8')
    const lock = readFileSync(join(profileDir, 'pnpm-lock.yaml'), 'utf8')
    let finish!: (value: CommandResult) => void
    const runner = vi.fn(async (_profile: string, args: readonly string[], _options?: CommandOptions) => {
      if (args[0] === 'install') { materialize(profileDir, '0.1.15'); return { exitCode: 0, stdout: '', stderr: '', timedOut: false } }
      materialize(profileDir, '0.1.16')
      rmSync(join(profileDir, 'node_modules', MARKET_NPM_PACKAGE, 'client.js'))
      return new Promise<CommandResult>(resolve => { finish = resolve })
    })
    const updater = createMarketUpdater('web', runner, { currentVersion: '0.1.15', profileDir, fetch: latest('0.1.16') })
    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1))
    updater.cancel(operation.id)
    finish({ exitCode: null, stdout: '', stderr: '', timedOut: false, aborted: true })
    await vi.waitFor(() => expect(operation.phase).toBe('cancelled'))
    expect(runner).toHaveBeenCalledTimes(2)
    expect(runner.mock.calls[1][1][0]).toBe('install')
    expect(runner.mock.calls[1][2]).toMatchObject({ timeoutMs: 60_000 })
    expect(readFileSync(join(profileDir, 'package.json'), 'utf8')).toBe(manifest)
    expect(readFileSync(join(profileDir, 'pnpm-lock.yaml'), 'utf8')).toBe(lock)
    expect(compareInstalledArtifact(profileDir, baseline).ok).toBe(true)
    expect(updater.restartRequired).toBe(false)
  })

  it('does not run a frozen recovery install when the pre-update lockfile already drifted', async () => {
    const profileDir = installedProfile('0.1.15')
    const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    manifest.dependencies[MARKET_NPM_PACKAGE] = 'file:/tmp/old/dsh-skin-market-0.1.15.tgz'
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify(manifest))
    const calls: string[] = []
    const runner = vi.fn(async (_profile: string, args: readonly string[]) => {
      calls.push(args[0] ?? '')
      if (args[0] === 'add') rmSync(join(profileDir, 'node_modules', MARKET_NPM_PACKAGE, 'client.js'))
      return { exitCode: 1, stdout: '', stderr: 'ERR_PNPM_FETCH_404', timedOut: false }
    })
    const updater = createMarketUpdater('web', runner, { currentVersion: '0.1.15', profileDir, fetch: latest('0.1.16') })
    await expect(updater.update()).rejects.toThrow('已不一致')
    expect(calls).toEqual(['add'])
    expect(JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')).dependencies[MARKET_NPM_PACKAGE]).toBe('file:/tmp/old/dsh-skin-market-0.1.15.tgz')
  })

  it('reports failed recovery when its command exits zero but a declared entry is still missing', async () => {
    const profileDir = installedProfile('0.1.15')
    const runner = vi.fn(async (_profile: string, args: readonly string[]) => {
      if (args[0] === 'add') rmSync(join(profileDir, 'node_modules', MARKET_NPM_PACKAGE, 'client.js'))
      return { exitCode: args[0] === 'add' ? 1 : 0, stdout: '', stderr: 'failed', timedOut: false }
    })
    const updater = createMarketUpdater('web', runner, { currentVersion: '0.1.15', profileDir, fetch: latest('0.1.16') })
    await expect(updater.update()).rejects.toThrow('构件未能验证恢复')
    expect(runner).toHaveBeenCalledTimes(2)
    expect(updater.restartRequired).toBe(false)
  })

  it.each(['applied', 'overridden', 'failed', 'cancelled', 'unknown'] as const)('preserves an authoritative managed %s result after cancellation', async application => {
    const profileDir = installedProfile('0.1.15')
    let finish!: (value: CommandResult) => void
    const runner = vi.fn(() => new Promise<CommandResult>(resolve => { finish = resolve })) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.15', profileDir, fetch: latest('0.1.16') })
    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(runner).toHaveBeenCalled())
    updater.cancel(operation.id)
    const kept = application === 'applied' || application === 'overridden'
    if (kept) materialize(profileDir, '0.1.16')
    finish({ exitCode: kept ? 0 : 1, stdout: '', stderr: '', timedOut: false, aborted: true, management: application === 'unknown' ? { indeterminate: true, application: 'unknown' } : { application } })
    await vi.waitFor(() => expect(operation.phase).toBe(kept ? 'done' : application === 'cancelled' ? 'cancelled' : application === 'unknown' ? 'waiting' : 'failed'))
    expect(runner).toHaveBeenCalledTimes(1)
    if (application === 'unknown') expect(updater.startUpdate()).toBe(operation)
    if (application === 'overridden') expect(operation.message).toContain('覆盖')
    expect(updater.restartRequired).toBe(kept)
  })

  it('does not expose cancellation when the native manager lacks that capability', async () => {
    const profileDir = installedProfile('0.1.15')
    let finish!: (value: CommandResult) => void
    let signal!: AbortSignal
    const runner = vi.fn((_profile: string, _args: readonly string[], options?: CommandOptions) => {
      signal = options!.signal!
      return new Promise<CommandResult>(resolve => { finish = resolve })
    }) as unknown as PluginRunner
    managedRunner(runner, false)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.15', profileDir, fetch: latest('0.1.16') })
    const operation = updater.startUpdate()
    expect(operation.cancelable).toBe(false)
    await vi.waitFor(() => expect(runner).toHaveBeenCalled())
    updater.cancel(operation.id)
    expect(operation.phase).toBe('downloading')
    expect(operation.cancelable).toBe(false)
    expect(signal.aborted).toBe(false)
    materialize(profileDir, '0.1.16')
    finish({ exitCode: 0, stdout: '', stderr: '', timedOut: false, management: { application: 'applied' } })
    await vi.waitFor(() => expect(operation.phase).toBe('done'))
    expect(operation.integrityVerified).toBe(true)
  })

  it.each([
    ['missing client', '未物化'], ['missing lock', 'root importer'], ['wrong importer', 'root importer'],
    ['local source', '来源'], ['wrong SRI', 'SRI'], ['wrong gitHead', 'gitHead'], ['wrong tarball', '下载地址'],
  ])('rejects native update success with %s', async (fault, reason) => {
    const profileDir = installedProfile('0.1.15')
    const runner = vi.fn(async () => {
      materialize(profileDir, '0.1.16')
      const lockFile = join(profileDir, 'pnpm-lock.yaml')
      if (fault === 'missing client') rmSync(join(profileDir, 'node_modules', MARKET_NPM_PACKAGE, 'client.js'))
      if (fault === 'missing lock') rmSync(lockFile)
      if (fault === 'wrong importer') writeFileSync(lockFile, readFileSync(lockFile, 'utf8').replace("specifier: '0.1.16'", "specifier: '^0.1.16'"))
      if (fault === 'local source') {
        const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
        manifest.dependencies[MARKET_NPM_PACKAGE] = 'file:/unreviewed-market'
        writeFileSync(join(profileDir, 'package.json'), JSON.stringify(manifest))
      }
      if (fault === 'wrong SRI') writeFileSync(lockFile, readFileSync(lockFile, 'utf8').replace(REVIEWED_INTEGRITY, 'sha512-other'))
      if (fault === 'wrong gitHead') {
        const file = join(profileDir, 'node_modules', MARKET_NPM_PACKAGE, 'package.json')
        const manifest = JSON.parse(readFileSync(file, 'utf8'))
        manifest.gitHead = 'd'.repeat(40)
        writeFileSync(file, JSON.stringify(manifest))
      }
      if (fault === 'wrong tarball') writeFileSync(lockFile, `${readFileSync(lockFile, 'utf8')}      tarball: https://example.test/unreviewed.tgz\n`)
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false, management: { application: 'applied' as const } }
    }) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.15', profileDir, fetch: latest('0.1.16') })
    await expect(updater.update()).rejects.toThrow(reason)
    expect(runner).toHaveBeenCalledTimes(1)
    expect(updater.restartRequired).toBe(false)
    expect((await updater.status()).currentVersion).toBe('0.1.15')
  })

  it.each(['failed', 'cancelled'] as const)('reports changed native artifacts after %s without restoring or reinstalling', async application => {
    const profileDir = installedProfile('0.1.15')
    const runner = vi.fn(async () => {
      rmSync(join(profileDir, 'node_modules', MARKET_NPM_PACKAGE, 'client.js'))
      return { exitCode: 1, stdout: '', stderr: 'native operation ended', timedOut: false, management: { application } }
    }) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.15', profileDir, fetch: latest('0.1.16') })
    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(operation.phase).toBe('failed'))
    expect(operation.application).toBe(application)
    expect(operation.message).toContain('不能确认取消或失败已恢复')
    expect(runner).toHaveBeenCalledTimes(1)
    expect(existsSync(join(profileDir, 'node_modules', MARKET_NPM_PACKAGE, 'client.js'))).toBe(false)
  })

  it('does not claim native cancellation restored an altered lockfile resolution', async () => {
    const profileDir = installedProfile('0.1.15')
    const lockFile = join(profileDir, 'pnpm-lock.yaml')
    const runner = vi.fn(async () => {
      writeFileSync(lockFile, readFileSync(lockFile, 'utf8').replace(REVIEWED_INTEGRITY, 'sha512-unknown'))
      return { exitCode: 1, stdout: '', stderr: '', timedOut: false, management: { application: 'cancelled' as const } }
    }) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.15', profileDir, fetch: latest('0.1.16') })
    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(operation.phase).toBe('failed'))
    expect(operation.application).toBe('cancelled')
    expect(operation.message).toContain('锁文件解析')
    expect(readFileSync(lockFile, 'utf8')).toContain('sha512-unknown')
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it.each([true, false])('verifies a matching native caret source with metadata SRI=%s', async withIntegrity => {
    const profileDir = installedProfile('0.1.15')
    const runner = vi.fn(async () => {
      materialize(profileDir, '0.1.16')
      const manifestFile = join(profileDir, 'package.json')
      const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
      manifest.dependencies[MARKET_NPM_PACKAGE] = '^0.1.16'
      writeFileSync(manifestFile, JSON.stringify(manifest))
      const lockFile = join(profileDir, 'pnpm-lock.yaml')
      writeFileSync(lockFile, readFileSync(lockFile, 'utf8').replace("specifier: '0.1.16'", "specifier: '^0.1.16'"))
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false, management: { application: 'restart-required' as const } }
    }) as unknown as PluginRunner
    managedRunner(runner)
    const updater = createMarketUpdater('desktop', runner, { currentVersion: '0.1.15', profileDir, fetch: latest('0.1.16', withIntegrity) })
    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(operation.phase).toBe('done'))
    expect(operation.integrityVerified).toBe(withIntegrity)
    expect(operation.restartRequired).toBe(true)
  })
})
