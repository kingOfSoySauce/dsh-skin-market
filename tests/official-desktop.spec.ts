import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { officialDesktopRunner, normalizeOfficialRegistryPlan, type OfficialPluginManagerLike } from '../src/official-desktop.ts'
import { createMarketUpdater, MARKET_NPM_PACKAGE } from '../src/self-update.ts'
import type { DshRuntime } from '../src/types.ts'
import { runPnpmWithRecovery } from '../src/pnpm-recovery.ts'

const runtime = (version: string | null): DshRuntime => ({ version, source: 'injected', capabilities: [] })
const temporaryDirectories: string[] = []
afterEach(() => { for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

function materializeMarket(directory: string, version: string): void {
  const packageDir = join(directory, 'node_modules', MARKET_NPM_PACKAGE)
  mkdirSync(join(packageDir, 'lib'), { recursive: true })
  mkdirSync(join(packageDir, 'client'), { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ dependencies: { [MARKET_NPM_PACKAGE]: version }, dsh: { profile: { bundles: [MARKET_NPM_PACKAGE] } } }))
  writeFileSync(join(directory, 'pnpm-lock.yaml'), JSON.stringify({
    lockfileVersion: '9.0', importers: { '.': { dependencies: { [MARKET_NPM_PACKAGE]: { specifier: version, version } } } },
    packages: { [`${MARKET_NPM_PACKAGE}@${version}`]: { resolution: {} } },
  }))
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
    name: MARKET_NPM_PACKAGE, version, main: 'lib/index.js', exports: { './client': './client/client.js' },
    dsh: { client: { platform: 'web' }, bundle: { patch: 'cordis.patch.yml' } },
  }))
  writeFileSync(join(packageDir, 'lib/index.js'), `export const version = '${version}'`)
  writeFileSync(join(packageDir, 'client/client.js'), `export const version = '${version}'`)
  writeFileSync(join(packageDir, 'cordis.patch.yml'), '[]\n')
}

function fullManager(): OfficialPluginManagerLike {
  return {
    installBundle: vi.fn(async () => ({ changed: true, application: 'applied', stage: 'enable', target: 'skin' })),
    removeBundle: vi.fn(async () => ({ changed: true, application: 'applied', stage: 'remove', target: 'skin' })),
    setBundleEnabled: vi.fn(async (target: string, enabled: boolean) => ({ changed: true, application: 'applied', stage: 'enable', target, enabled })),
    setPluginEnabled: vi.fn(async (target: string, enabled: boolean) => ({ changed: true, application: 'applied', stage: 'enable', target, enabled })),
    cancelInstall: vi.fn(async () => ({ status: 'not-running' })),
    waitForInstall: vi.fn(async () => null),
    inspect: vi.fn(async () => ({ status: 'accepted', kind: 'registry' })),
    listBundles: vi.fn(async () => []),
    listPlugins: vi.fn(async () => []),
  }
}

describe('official Desktop runner', () => {
  it('exposes the host-published pnpm only when the launcher supplies one for a profile', () => {
    const manager = fullManager()
    expect(officialDesktopRunner(() => manager, runtime('0.2.1')).hostPnpm).toBeUndefined()
    expect(officialDesktopRunner(() => manager, runtime('0.2.1'), undefined, { profileDir: '/profiles/desktop' }).hostPnpm).toBeUndefined()
    const runner = officialDesktopRunner(() => manager, runtime('0.2.1'), undefined, {
      profileDir: '/profiles/desktop',
      packageManager: () => ({ command: '/opt/dsh/node', args: ['/opt/dsh/pnpm.cjs'], env: { ELECTRON_RUN_AS_NODE: '1' } }),
    })
    expect(typeof runner.hostPnpm).toBe('function')
  })

  it('exposes the host registry plan without duplicating mirror addresses', async () => {
    const registries = vi.fn(async () => ({
      registry: 'https://registry.npmjs.org/',
      fallbackRegistries: ['https://registry.npmmirror.com/', 'https://registry.npmmirror.com'],
      resolved: 'https://registry.npmjs.org/',
    }))
    const runner = officialDesktopRunner(() => ({
      installBundle: vi.fn(), removeBundle: vi.fn(), registries,
    }), runtime('0.2.1-rc.3'))

    await expect(runner.management?.registries?.()).resolves.toEqual([
      'https://registry.npmjs.org', 'https://registry.npmmirror.com',
    ])
    expect(registries).toHaveBeenCalledOnce()
  })

  it('keeps a resolved private registry isolated from public fallbacks', () => {
    expect(normalizeOfficialRegistryPlan({
      registry: 'https://registry.npmjs.org',
      fallbackRegistries: ['https://registry.npmmirror.com'],
      resolved: 'https://private.example/npm',
    })).toEqual(['https://private.example/npm'])
    expect(normalizeOfficialRegistryPlan({
      registry: null,
      fallbackRegistries: ['https://registry.npmjs.org'],
      resolved: 'https://private.example/npm',
    })).toEqual(['https://private.example/npm'])
  })

  it('installs through the profile plugin manager without enabling the bundle first', async () => {
    const installBundle = vi.fn(async () => ({ changed: 'applied' }))
    const manager: OfficialPluginManagerLike = {
      installBundle,
      removeBundle: vi.fn(async () => ({ changed: 'applied' })),
      cancelInstall: vi.fn(async () => ({ cancelled: true })),
    }
    const runner = officialDesktopRunner(() => manager)

    const result = await runner.installPlugin!(
      'desktop',
      { packageName: 'dsh-theme-endfield', packageVersion: '1.0.1', receiptId: 'receipt-1' },
    )

    expect(result.exitCode).toBe(0)
    expect(installBundle).toHaveBeenCalledWith('dsh-theme-endfield@1.0.1', { enabled: false, requestId: 'receipt-1' })
  })

  it('passes a selected host registry to an official managed install', async () => {
    const installBundle = vi.fn(async () => ({ changed: true, application: 'applied' }))
    const manager: OfficialPluginManagerLike = {
      installBundle,
      removeBundle: vi.fn(),
    }
    const runner = officialDesktopRunner(() => manager, runtime('0.2.1-rc.3'))

    await expect(runner.installPlugin!('desktop', {
      packageName: 'dsh-theme-endfield', packageVersion: '1.0.1', receiptId: 'receipt-registry', registry: 'https://registry.example/npm',
    })).resolves.toMatchObject({ exitCode: 0 })
    expect(installBundle).toHaveBeenCalledWith('dsh-theme-endfield@1.0.1', {
      enabled: false, requestId: 'receipt-registry', registry: 'https://registry.example/npm', saveExact: true,
    })
  })

  it('routes remove through the same manager and surfaces manager failures', async () => {
    const removeBundle = vi.fn(async () => ({ changed: 'failed', error: { message: 'profile is locked' } }))
    const manager: OfficialPluginManagerLike = { installBundle: vi.fn(), removeBundle }
    const runner = officialDesktopRunner(() => manager)

    const result = await runner('desktop', ['remove', 'dsh-theme-endfield'])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('profile is locked')
    expect(removeBundle).toHaveBeenCalledWith('dsh-theme-endfield')
  })

  it('cancels a manager-owned install when the market operation is aborted', async () => {
    let resolveInstall!: (value: unknown) => void
    const cancelInstall = vi.fn(async () => ({ status: 'cancelled' }))
    const installBundle = vi.fn(() => new Promise<unknown>(resolve => { resolveInstall = resolve }))
    const manager: OfficialPluginManagerLike = { installBundle, removeBundle: vi.fn(), cancelInstall }
    const runner = officialDesktopRunner(() => manager)
    const controller = new AbortController()
    const operation = runner.installPlugin!(
      'desktop',
      { packageName: 'dsh-theme-endfield', packageVersion: '1.0.1', receiptId: 'receipt-2' },
      { signal: controller.signal },
    )

    controller.abort()
    expect(cancelInstall).toHaveBeenCalledWith('receipt-2')
    resolveInstall({ application: 'cancelled' })
    await expect(operation).resolves.toMatchObject({ exitCode: 1, aborted: true, management: { application: 'cancelled' } })
  })

  it('fails closed when the official manager is unavailable', async () => {
    const runner = officialDesktopRunner(() => undefined)
    const result = await runner('desktop', ['remove', 'dsh-theme-endfield'])
    expect(result.exitCode).toBeNull()
    expect(result.stderr).toContain('pluginManager')
  })

  it('keeps installation available when only cancellation is missing', async () => {
    const installBundle = vi.fn(async () => ({ application: 'applied' }))
    const runner = officialDesktopRunner(() => ({ installBundle, removeBundle: vi.fn() }))

    const result = await runner.installPlugin!(
      'desktop',
      { packageName: 'dsh-theme-endfield', packageVersion: '1.0.1', receiptId: 'receipt-no-cancel' },
    )

    expect(result.exitCode).toBe(0)
    expect(runner.management?.capabilities()).toMatchObject({
      install: { available: true }, update: { available: true }, cancel: { available: false },
    })
    expect(installBundle).toHaveBeenCalledWith('dsh-theme-endfield@1.0.1', { enabled: false, requestId: 'receipt-no-cancel' })
  })

  it('routes the market self-update through the official manager without changing existing bundle selection', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-official-self-update-'))
    temporaryDirectories.push(directory)
    materializeMarket(directory, '0.1.57')
    const selected = [MARKET_NPM_PACKAGE, 'unrelated-bundle']
    const manifestFile = join(directory, 'package.json')
    const initialManifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
    initialManifest.dsh.profile.bundles = selected
    writeFileSync(manifestFile, JSON.stringify(initialManifest))
    const installBundle = vi.fn(async () => {
      // Official enabled:false skips selecting; it does not deselect an
      // already selected package. Model that persistent choice independently.
      const before = JSON.parse(readFileSync(manifestFile, 'utf8'))
      materializeMarket(directory, '0.1.58')
      const after = JSON.parse(readFileSync(manifestFile, 'utf8'))
      after.dsh = before.dsh
      writeFileSync(manifestFile, JSON.stringify(after))
      return { application: 'restart-required' }
    })
    const manager: OfficialPluginManagerLike = {
      installBundle,
      removeBundle: vi.fn(),
      cancelInstall: vi.fn(async () => undefined),
    }
    const updater = createMarketUpdater('desktop', officialDesktopRunner(() => manager), {
      currentVersion: '0.1.57',
      profileDir: directory,
      cacheMs: 0,
      fetch: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '0.1.58' },
          time: { '0.1.58': '2000-01-01T00:00:00.000Z' },
          versions: {
            '0.1.58': {
              version: '0.1.58',
              gitHead: 'c'.repeat(40),
              dist: { tarball: `https://registry.npmjs.org/${MARKET_NPM_PACKAGE}/-/${MARKET_NPM_PACKAGE}-0.1.58.tgz` },
            },
          },
        }),
      })) as unknown as typeof fetch,
    })

    await expect(updater.update()).resolves.toEqual({ currentVersion: '0.1.58', loadedVersion: '0.1.57', latestVersion: '0.1.58', updateAvailable: false })
    expect(updater.restartRequired).toBe(true)
    expect(installBundle).toHaveBeenCalledWith('dsh-skin-market@0.1.58', { enabled: false, requestId: expect.any(String) })
    expect(JSON.parse(readFileSync(manifestFile, 'utf8')).dsh.profile.bundles).toEqual(selected)
  })

  it('overlays an already installed market with the host pnpm instead of removing it', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-official-self-update-overlay-'))
    temporaryDirectories.push(directory)
    materializeMarket(directory, '0.1.63')
    const selected = [MARKET_NPM_PACKAGE, 'unrelated-bundle']
    const manifestFile = join(directory, 'package.json')
    const initialManifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
    initialManifest.dsh.profile.bundles = selected
    writeFileSync(manifestFile, JSON.stringify(initialManifest))
    const installBundle = vi.fn(async () => ({ application: 'failed', error: { code: 'already-installed', message: 'dsh-skin-market is already installed' } }))
    const removeBundle = vi.fn(async () => ({ application: 'applied' }))
    const runner = officialDesktopRunner(() => ({ installBundle, removeBundle, cancelInstall: vi.fn(async () => undefined) }))
    const hostPnpm = vi.fn(async (_args: readonly string[]) => {
      const before = JSON.parse(readFileSync(manifestFile, 'utf8'))
      materializeMarket(directory, '0.1.64')
      const after = JSON.parse(readFileSync(manifestFile, 'utf8'))
      after.dsh = before.dsh
      writeFileSync(manifestFile, JSON.stringify(after))
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false }
    })
    runner.hostPnpm = hostPnpm
    const updater = createMarketUpdater('desktop', runner, {
      currentVersion: '0.1.63',
      profileDir: directory,
      cacheMs: 0,
      fetch: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '0.1.64' },
          time: { '0.1.64': '2000-01-01T00:00:00.000Z' },
          versions: {
            '0.1.64': {
              version: '0.1.64',
              gitHead: 'd'.repeat(40),
              dist: { tarball: `https://registry.npmjs.org/${MARKET_NPM_PACKAGE}/-/${MARKET_NPM_PACKAGE}-0.1.64.tgz` },
            },
          },
        }),
      })) as unknown as typeof fetch,
    })

    await expect(updater.update()).resolves.toMatchObject({ currentVersion: '0.1.64', latestVersion: '0.1.64', updateAvailable: false })
    expect(removeBundle).not.toHaveBeenCalled()
    expect(installBundle).toHaveBeenCalledTimes(1)
    expect(hostPnpm).toHaveBeenCalledTimes(1)
    expect(hostPnpm.mock.calls[0]?.[0]).toEqual(expect.arrayContaining(['add', `${MARKET_NPM_PACKAGE}@0.1.64`]))
    expect(updater.restartRequired).toBe(true)
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
    expect(manifest.dependencies[MARKET_NPM_PACKAGE]).toBe('0.1.64')
    expect(manifest.dsh.profile.bundles).toEqual(selected)
  })

  it('fails without removing the market when this Desktop publishes no host pnpm', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-official-self-update-no-pnpm-'))
    temporaryDirectories.push(directory)
    materializeMarket(directory, '0.1.63')
    const manifestFile = join(directory, 'package.json')
    const removeBundle = vi.fn(async () => ({ application: 'applied' }))
    const updater = createMarketUpdater('desktop', officialDesktopRunner(() => ({
      installBundle: vi.fn(async () => ({ application: 'failed', error: { code: 'already-installed', message: 'dsh-skin-market is already installed' } })),
      removeBundle,
      cancelInstall: vi.fn(async () => undefined),
    })), {
      currentVersion: '0.1.63',
      profileDir: directory,
      cacheMs: 0,
      fetch: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '0.1.64' },
          time: { '0.1.64': '2000-01-01T00:00:00.000Z' },
          versions: {
            '0.1.64': {
              version: '0.1.64',
              gitHead: 'd'.repeat(40),
              dist: { tarball: `https://registry.npmjs.org/${MARKET_NPM_PACKAGE}/-/${MARKET_NPM_PACKAGE}-0.1.64.tgz` },
            },
          },
        }),
      })) as unknown as typeof fetch,
    })

    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(operation.phase).toBe('failed'))
    expect(removeBundle).not.toHaveBeenCalled()
    expect(operation.message).toContain('市场没有被卸载')
    expect(operation.message).toContain(`pnpm add ${MARKET_NPM_PACKAGE}@0.1.64`)
    expect(JSON.parse(readFileSync(manifestFile, 'utf8')).dependencies[MARKET_NPM_PACKAGE]).toBe('0.1.63')
  })

  it('keeps the installed market when the host pnpm overlay itself fails', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-official-self-update-overlay-fail-'))
    temporaryDirectories.push(directory)
    materializeMarket(directory, '0.1.63')
    const manifestFile = join(directory, 'package.json')
    const removeBundle = vi.fn(async () => ({ application: 'applied' }))
    const runner = officialDesktopRunner(() => ({
      installBundle: vi.fn(async () => ({ application: 'failed', error: { code: 'already-installed', message: 'dsh-skin-market is already installed' } })),
      removeBundle,
      cancelInstall: vi.fn(async () => undefined),
    }))
    runner.hostPnpm = vi.fn(async () => ({
      exitCode: 1, stdout: '', timedOut: false,
      stderr: '[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] 1 lockfile entries failed verification: dsh-skin-market@0.1.64 was published recently',
    }))
    const updater = createMarketUpdater('desktop', runner, {
      currentVersion: '0.1.63',
      profileDir: directory,
      cacheMs: 0,
      fetch: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '0.1.64' },
          time: { '0.1.64': '2000-01-01T00:00:00.000Z' },
          versions: {
            '0.1.64': {
              version: '0.1.64',
              gitHead: 'd'.repeat(40),
              dist: { tarball: `https://registry.npmjs.org/${MARKET_NPM_PACKAGE}/-/${MARKET_NPM_PACKAGE}-0.1.64.tgz` },
            },
          },
        }),
      })) as unknown as typeof fetch,
    })

    const operation = updater.startUpdate()
    await vi.waitFor(() => expect(operation.phase).toBe('failed'))
    expect(operation.failure?.kind).toBe('release-age')
    expect(removeBundle).not.toHaveBeenCalled()
    expect(JSON.parse(readFileSync(manifestFile, 'utf8')).dependencies[MARKET_NPM_PACKAGE]).toBe('0.1.63')
  })

  it.each(['applied', 'restart-required', 'overridden'] as const)('accepts application=%s even with a package warning', async application => {
    const manager: OfficialPluginManagerLike = {
      installBundle: vi.fn(async () => ({ application, packageResult: { exitCode: 1, output: 'package warning' } })),
      removeBundle: vi.fn(),
      cancelInstall: vi.fn(async () => undefined),
    }
    const result = await officialDesktopRunner(() => manager).installPlugin!(
      'desktop',
      { packageName: 'dsh-theme-endfield', packageVersion: '1.0.1', receiptId: `receipt-${application}` },
    )
    expect(result.exitCode).toBe(0)
  })

  it.each(['failed', 'cancelled', 'rejected', 'unknown'] as const)('rejects application=%s', async application => {
    const manager: OfficialPluginManagerLike = {
      installBundle: vi.fn(async () => ({ application, error: { message: `${application} reason` } })),
      removeBundle: vi.fn(),
      cancelInstall: vi.fn(async () => undefined),
    }
    const result = await officialDesktopRunner(() => manager).installPlugin!(
      'desktop',
      { packageName: 'dsh-theme-endfield', packageVersion: '1.0.1', receiptId: `receipt-${application}` },
    )
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain(`${application} reason`)
  })

  it('surfaces package output after an error message', async () => {
    const manager: OfficialPluginManagerLike = {
      installBundle: vi.fn(async () => ({ packageResult: { output: 'pnpm output' } })),
      removeBundle: vi.fn(),
      cancelInstall: vi.fn(async () => undefined),
    }
    const result = await officialDesktopRunner(() => manager).installPlugin!(
      'desktop',
      { packageName: 'dsh-theme-endfield', packageVersion: '1.0.1', receiptId: 'receipt-output' },
    )
    expect(result.stdout).toContain('pnpm output')
  })

  it('cancels an in-flight install on AbortSignal and waits for the manager promise', async () => {
    let resolveInstall!: (value: unknown) => void
    const installBundle = vi.fn(() => new Promise(resolve => { resolveInstall = resolve }))
    const cancelInstall = vi.fn(async () => { resolveInstall({ application: 'cancelled' }) })
    const runner = officialDesktopRunner(() => ({ installBundle, removeBundle: vi.fn(), cancelInstall }))
    const controller = new AbortController()
    const resultPromise = runner.installPlugin!(
      'desktop',
      { packageName: 'dsh-theme-endfield', packageVersion: '1.0.1', receiptId: 'receipt-abort' },
      { signal: controller.signal },
    )

    controller.abort()
    const result = await resultPromise

    expect(cancelInstall).toHaveBeenCalledWith('receipt-abort')
    expect(result.exitCode).toBe(1)
    expect(result.aborted).toBe(true)
  })

  it('cancels an in-flight install on timeout and joins the manager promise', async () => {
    let resolveInstall!: (value: unknown) => void
    const installBundle = vi.fn(() => new Promise(resolve => { resolveInstall = resolve }))
    const cancelInstall = vi.fn(async () => { resolveInstall({ application: 'cancelled' }) })
    const runner = officialDesktopRunner(() => ({ installBundle, removeBundle: vi.fn(), cancelInstall }))

    const result = await runner.installPlugin!(
      'desktop',
      { packageName: 'dsh-theme-endfield', packageVersion: '1.0.1', receiptId: 'receipt-timeout' },
      { timeoutMs: 1 },
    )

    expect(cancelInstall).toHaveBeenCalledWith('receipt-timeout')
    expect(result.exitCode).toBe(1)
    expect(result.timedOut).toBe(true)
  })
})

describe('official management release contracts', () => {
  it.each([
    ['0.1.6-alpha.2', false, false, true],
    ['0.1.7-alpha.1', true, false, true],
    ['0.1.7-alpha.2', true, false, true],
    ['0.1.7-rc.1', true, false, true],
    ['0.1.7-rc.2', true, false, true],
    ['0.2.0-rc.1', true, false, true],
    ['0.2.0-rc.2', true, false, true],
    ['0.2.1-alpha.1', true, false, false],
    ['0.2.1-alpha.2', true, true, false],
    ['0.2.1-alpha.3', true, true, false],
    ['0.2.1-rc.1', true, true, false],
    ['0.2.1-rc.2', true, true, false],
    ['0.2.1-rc.2+build.9', true, true, false],
    ['0.2.2', true, true, false],
    ['0.3.0', true, true, false],
    ['1.0.0', true, true, false],
  ] as const)('gates %s options and post-install resolution by the audited snapshot', async (version, recovered, exact, requiresRestart) => {
    const manager = fullManager()
    const runner = officialDesktopRunner(() => manager, runtime(version))
    expect(runner.management!.capabilities()).toMatchObject({
      install: { available: true }, update: { available: true }, enable: { available: true },
      disable: { available: true }, remove: { available: true }, cancel: { available: true },
      buildApprovals: { available: true }, wait: { available: recovered },
      registry: { available: recovered }, saveExact: { available: exact },
    })
    expect(runner.management!.installRequiresRestart).toBe(requiresRestart)
    const result = await runner.installPlugin!('desktop', { packageName: 'skin', packageVersion: '1.0.0', receiptId: 'request' })
    expect(result.management?.application).toBe('applied')
    expect(manager.installBundle).toHaveBeenCalledWith('skin@1.0.0', { enabled: false, requestId: 'request', ...(exact ? { saveExact: true } : {}) })
  })

  it.each(['0.1.6-alpha.1', '0.1.5-rc.3', '0.2.0-rc.3', '0.1.7-alpha.3', '0.2.1-alpha.4', null])('does not mutate an unaudited runtime %s', async version => {
    const manager = fullManager()
    const runner = officialDesktopRunner(() => manager, runtime(version))
    const caps = runner.management!.capabilities()
    expect(runner.management!.installRequiresRestart).toBe(false)
    expect(caps.install.available).toBe(false)
    expect(caps.install.reason).toBeTruthy()
    await runner.installPlugin!('desktop', { packageName: 'skin', packageVersion: '1.0.0', receiptId: 'request' })
    await runner.management!.setBundleEnabled('skin', true)
    await runner('desktop', ['remove', 'skin'])
    await expect(runner.management!.listPlugins()).rejects.toThrow(caps.install.reason)
    await expect(runner.management!.listBundles()).rejects.toThrow(caps.install.reason)
    expect(manager.installBundle).not.toHaveBeenCalled()
    expect(manager.setBundleEnabled).not.toHaveBeenCalled()
    expect(manager.removeBundle).not.toHaveBeenCalled()
    expect(manager.listPlugins).not.toHaveBeenCalled()
    expect(manager.listBundles).not.toHaveBeenCalled()
  })

  it('does not impose an audited Host restart policy on one-argument structural callers', () => {
    const runner = officialDesktopRunner(() => fullManager())
    expect(runner.management!.installRequiresRestart).toBe(false)
  })

  it.each(['no-hmr', 'package-moved', 'host-module', 'unmanaged-plugin', 'module-comparison'] as const)(
    'preserves alpha.3 restart reason %s and allows later selection changes', async restartReason => {
      const manager = fullManager()
      manager.installBundle = vi.fn(async () => ({ ok: true, value: {
        changed: true, application: 'restart-required', restartReason,
        stage: 'enable', target: 'skin', bundle: 'skin', version: '1.0.0', enabled: false,
      } }))
      manager.setBundleEnabled = vi.fn(async (target: string, enabled: boolean) => ({ ok: true, value: {
        changed: true, application: 'restart-required', restartReason, stage: 'enable', target, enabled,
      } }))
      const runner = officialDesktopRunner(() => manager, runtime('0.2.1-alpha.3'))

      const installed = await runner.installPlugin!('desktop', { packageName: 'skin', packageVersion: '1.0.0', receiptId: 'alpha-3-install' })
      expect(installed).toMatchObject({ exitCode: 0, management: {
        application: 'restart-required', restartReason, enabled: false, requestId: 'alpha-3-install',
      } })
      expect(manager.installBundle).toHaveBeenCalledExactlyOnceWith('skin@1.0.0', {
        enabled: false, requestId: 'alpha-3-install', saveExact: true,
      })
      expect(runner.management!.installRequiresRestart).toBe(false)

      expect(await runner.management!.setBundleEnabled('previous-skin', false)).toMatchObject({
        exitCode: 0, management: { application: 'restart-required', restartReason, target: 'previous-skin', enabled: false },
      })
      expect(await runner.management!.setBundleEnabled('skin', true)).toMatchObject({
        exitCode: 0, management: { application: 'restart-required', restartReason, target: 'skin', enabled: true },
      })
      expect(manager.setBundleEnabled).toHaveBeenNthCalledWith(1, 'previous-skin', false)
      expect(manager.setBundleEnabled).toHaveBeenNthCalledWith(2, 'skin', true)
      expect(manager.installBundle).toHaveBeenCalledTimes(1)
    },
  )

  it('fails closed per actual missing method and reads a new manager generation', async () => {
    let manager = fullManager()
    manager.setBundleEnabled = undefined
    manager.setPluginEnabled = undefined
    const runner = officialDesktopRunner(() => manager, runtime('0.2.0-rc.2'))
    expect(runner.management!.capabilities().enable.available).toBe(false)
    manager = fullManager()
    expect(runner.management!.capabilities().enable.available).toBe(true)
    const result = await runner.management!.setBundleEnabled('skin', false)
    expect(manager.setBundleEnabled).toHaveBeenCalledWith('skin', false)
    expect(result.management).toMatchObject({ application: 'applied', stage: 'enable', target: 'skin', enabled: false })
  })

  it('keeps individual plugin activation available when only the bundle method is missing', async () => {
    const manager = fullManager()
    manager.setBundleEnabled = undefined
    const management = officialDesktopRunner(() => manager, runtime('0.2.0-rc.2')).management!
    expect(management.capabilities()).toMatchObject({ enable: { available: true }, disable: { available: true } })
    expect(await management.setPluginEnabled('entry', true)).toMatchObject({ exitCode: 0, management: { application: 'applied', target: 'entry' } })
    const unavailable = await management.setBundleEnabled('skin', true)
    expect(unavailable).toMatchObject({ exitCode: null, aborted: false, timedOut: false })
    expect(unavailable.stderr).toContain('组合包启停接口')
    expect(unavailable.management?.indeterminate).not.toBe(true)
    expect(manager.setPluginEnabled).toHaveBeenCalledExactlyOnceWith('entry', true)
  })

  it('keeps bundle activation available when only the individual plugin method is missing', async () => {
    const manager = fullManager()
    manager.setPluginEnabled = undefined
    const management = officialDesktopRunner(() => manager, runtime('0.2.0-rc.2')).management!
    expect(management.capabilities()).toMatchObject({ enable: { available: true }, disable: { available: true } })
    expect(await management.setBundleEnabled('skin', false)).toMatchObject({ exitCode: 0, management: { application: 'applied', target: 'skin' } })
    const unavailable = await management.setPluginEnabled('entry', false)
    expect(unavailable).toMatchObject({ exitCode: null, aborted: false, timedOut: false })
    expect(unavailable.stderr).toContain('插件行启停接口')
    expect(unavailable.management?.indeterminate).not.toBe(true)
    expect(manager.setBundleEnabled).toHaveBeenCalledExactlyOnceWith('skin', false)
  })

  it('preserves management failures and exact pending builds without approving them automatically', async () => {
    const resultValue = {
      changed: false, application: 'failed', stage: 'install', target: 'skin@1.0.0',
      error: { code: 'operation-error', diagnostic: 'scripts await approval' }, pendingBuilds: ['native-addon', '@scope/helper'],
      packageResult: { exitCode: 1, kind: 'build-blocked', output: 'full pnpm output', logPath: '/tmp/output.log' },
      registries: [null], failedAt: 'registry',
    }
    const manager = fullManager()
    manager.installBundle = vi.fn(async () => resultValue)
    const runner = officialDesktopRunner(() => manager, runtime('0.1.6-alpha.2'))
    const result = await runner.installPlugin!('desktop', { packageName: 'skin', packageVersion: '1.0.0', receiptId: 'request' })
    expect(result.exitCode).toBe(1)
    expect(result.management).toEqual({ ...resultValue, requestId: 'request' })
    expect(manager.installBundle).toHaveBeenCalledWith('skin@1.0.0', { enabled: false, requestId: 'request' })
  })

  it('keeps the official error message concise while preserving structured package diagnostics', async () => {
    const value = {
      changed: false, application: 'failed', stage: 'install', target: 'skin@1.0.0',
      error: { code: 'operation-error', message: '无法连接安装源', diagnostic: 'Progress: resolved 24\nECONNRESET' },
      packageResult: { exitCode: 1, kind: 'network', output: 'GET registry.example.test failed' },
    }
    const manager = fullManager()
    manager.installBundle = vi.fn(async () => value)
    const result = await officialDesktopRunner(() => manager, runtime('0.2.0-rc.2')).installPlugin!('desktop', { packageName: 'skin', packageVersion: '1.0.0', receiptId: 'request' })
    expect(result.stderr).toBe('无法连接安装源')
    expect(result.management).toEqual({ ...value, requestId: 'request' })
    expect(manager.installBundle).toHaveBeenCalledTimes(1)
  })

  it('redacts credentials from the official short failure message as well as from copied diagnostics', async () => {
    const manager = fullManager()
    manager.installBundle = vi.fn(async () => ({
      application: 'failed', error: { code: 'operation-error', message: '连接失败：https://fixture:fixture-password@registry.example.test/package?token=fixture-token' },
      packageResult: { exitCode: 1, kind: 'network', output: 'ECONNRESET' },
    }))
    const result = await officialDesktopRunner(() => manager, runtime('0.2.0-rc.2')).installPlugin!('desktop', { packageName: 'skin', packageVersion: '1.0.0', receiptId: 'request' })
    expect(result.stderr).toContain('连接失败')
    expect(result.stderr).not.toContain('fixture-password')
    expect(result.stderr).not.toContain('fixture-token')
  })

  it('passes explicitly approved exact package names and a supported registry', async () => {
    const manager = fullManager()
    const runner = officialDesktopRunner(() => manager, runtime('0.2.0-rc.2'))
    await runner.installPlugin!('desktop', {
      packageName: 'skin', packageVersion: '1.0.0', receiptId: 'request',
      approvedBuilds: ['@scope/helper', '@scope/helper'], registry: 'https://registry.npmjs.org/',
    })
    expect(manager.installBundle).toHaveBeenCalledWith('skin@1.0.0', {
      enabled: false, requestId: 'request', approvedBuilds: ['@scope/helper'], registry: 'https://registry.npmjs.org/',
    })
  })

  it.each(['*', 'native-addon@1.0.0', '', ' native-addon'])('refuses non-exact build approval %j', async name => {
    const manager = fullManager()
    const runner = officialDesktopRunner(() => manager, runtime('0.2.0-rc.2'))
    const result = await runner.installPlugin!('desktop', { packageName: 'skin', packageVersion: '1.0.0', receiptId: 'request', approvedBuilds: [name] })
    expect(result.exitCode).toBeNull()
    expect(manager.installBundle).not.toHaveBeenCalled()
  })

  it('passes the exact git or tarball build key the Host reported for a GitHub skin', async () => {
    const manager = fullManager()
    const runner = officialDesktopRunner(() => manager, runtime('0.2.1-rc.3'))
    const keys = [
      'dsh-claude-desktop-theme@https://codeload.github.com/zkforge/dsh-claude-desktop-theme/tar.gz/0bda59ab167074e5753fd7415bf55e8dbb2a6886',
      '@scope/helper@git+https://github.com/owner/repo.git#0123456789abcdef0123456789abcdef01234567',
      'mono-skin@https://codeload.github.com/owner/repo/tar.gz/0123456789abcdef0123456789abcdef01234567#path:packages/my skin',
    ]
    const spec = 'github:zkforge/dsh-claude-desktop-theme#0bda59ab167074e5753fd7415bf55e8dbb2a6886'
    await runner.installPlugin!('desktop', {
      packageName: 'dsh-claude-desktop-theme', packageVersion: '0.10.3', spec, receiptId: 'request', approvedBuilds: keys,
    })
    expect(manager.installBundle).toHaveBeenCalledWith(spec, {
      enabled: false, requestId: 'request', approvedBuilds: keys, saveExact: true,
    })
  })

  it('refuses unsupported registry options instead of silently ignoring them', async () => {
    const manager = fullManager()
    const runner = officialDesktopRunner(() => manager, runtime('0.1.6-alpha.2'))
    const result = await runner.installPlugin!('desktop', { packageName: 'skin', packageVersion: '1.0.0', receiptId: 'request', registry: null })
    expect(result.exitCode).toBeNull()
    expect(manager.installBundle).not.toHaveBeenCalled()
  })

  it.each(['0.1.6-alpha.2', '0.1.7-alpha.1'])('uses the correct inspect signature for %s', async version => {
    const manager = fullManager()
    const runner = officialDesktopRunner(() => manager, runtime(version))
    const signal = new AbortController().signal
    await runner.management!.inspect('skin', { signal })
    expect(manager.inspect).toHaveBeenCalledWith(...(version === '0.1.6-alpha.2' ? ['skin', signal] : ['skin', undefined, signal]))
  })

  it('preserves a Client Remote envelope without nesting the business result', async () => {
    const manager = fullManager()
    manager.setPluginEnabled = vi.fn(async () => ({ ok: true, value: { application: 'overridden', target: 'entry', enabled: true } }))
    const result = await officialDesktopRunner(() => manager, runtime('0.2.0-rc.2')).management!.setPluginEnabled('entry', true)
    expect(result.management).toMatchObject({ application: 'overridden', target: 'entry', enabled: true })
  })

  it('does not treat a failed Remote inventory read as an empty successful list', async () => {
    const manager = fullManager()
    manager.listPlugins = vi.fn(async () => ({ ok: false, error: { code: 'gateway/withdrawn', message: 'inventory unavailable' } }))
    await expect(officialDesktopRunner(() => manager, runtime('0.2.0-rc.2')).management!.listPlugins()).rejects.toThrow('inventory unavailable')
  })
})

describe('official installation settlement', () => {
  it('recovers a resolved Client carrier failure through the original request without reinstalling', async () => {
    const manager = fullManager()
    manager.installBundle = vi.fn(async () => ({ ok: false, error: { code: 'gateway/internal', message: 'carrier disconnected' } }))
    manager.waitForInstall = vi.fn(async () => ({ ok: true, value: { application: 'applied', stage: 'apply', target: 'skin' } }))
    const result = await officialDesktopRunner(() => manager, runtime('0.2.0-rc.2')).installPlugin!(
      'desktop', { packageName: 'skin', packageVersion: '1.0.0', receiptId: 'carrier-request' },
    )
    expect(result).toMatchObject({ exitCode: 0, management: { application: 'applied' } })
    expect(manager.installBundle).toHaveBeenCalledTimes(1)
    expect(manager.waitForInstall).toHaveBeenCalledExactlyOnceWith('carrier-request')
  })

  it('keeps a second Client carrier failure unconfirmed when request recovery also fails', async () => {
    const manager = fullManager()
    const failure = { ok: false, error: { code: 'gateway/internal', message: 'carrier disconnected' } }
    manager.installBundle = vi.fn(async () => failure)
    manager.waitForInstall = vi.fn(async () => failure)
    const result = await officialDesktopRunner(() => manager, runtime('0.2.0-rc.2')).installPlugin!(
      'desktop', { packageName: 'skin', packageVersion: '1.0.0', receiptId: 'carrier-request' },
    )
    expect(result).toMatchObject({ exitCode: 1, aborted: false, management: { application: 'unknown', indeterminate: true } })
    expect(manager.installBundle).toHaveBeenCalledTimes(1)
    expect(manager.waitForInstall).toHaveBeenCalledTimes(1)
  })

  it('does not report a resolved Client enable carrier failure as a confirmed rejection or cancellation', async () => {
    const manager = fullManager()
    const controller = new AbortController()
    manager.setBundleEnabled = vi.fn(async () => {
      controller.abort()
      return { ok: false, error: { code: 'gateway/internal', message: 'enable response lost' } }
    })
    const result = await officialDesktopRunner(() => manager, runtime('0.2.0-rc.2')).management!.setBundleEnabled('skin', true, { signal: controller.signal })
    expect(result).toMatchObject({ exitCode: 1, aborted: false, management: { application: 'unknown', indeterminate: true } })
    expect(manager.setBundleEnabled).toHaveBeenCalledTimes(1)
  })

  it('keeps an unconfirmed native removal indeterminate even after an abort request', async () => {
    const manager = fullManager()
    const controller = new AbortController()
    manager.removeBundle = vi.fn(async () => {
      controller.abort()
      throw new Error('response lost during removal')
    })
    const result = await officialDesktopRunner(() => manager, runtime('0.2.0-rc.2'))('desktop', ['remove', 'skin'], { signal: controller.signal })
    expect(result).toMatchObject({ exitCode: 1, aborted: false, timedOut: false, management: { application: 'unknown', indeterminate: true } })
    expect(manager.removeBundle).toHaveBeenCalledTimes(1)
  })

  it('does not claim success from a malformed result on a known Host contract', async () => {
    const manager = fullManager()
    manager.setBundleEnabled = vi.fn(async () => null)
    const result = await officialDesktopRunner(() => manager, runtime('0.2.0-rc.2')).management!.setBundleEnabled('skin', true)
    expect(result).toMatchObject({ exitCode: 1, management: { application: 'unknown', indeterminate: true } })
  })

  it('does not turn a completed applying phase into a timeout failure', async () => {
    vi.useFakeTimers()
    try {
      let settle!: (value: unknown) => void
      const manager = fullManager()
      manager.installBundle = vi.fn(() => new Promise(resolve => { settle = resolve }))
      manager.cancelInstall = vi.fn(async () => ({ status: 'too-late' }))
      const operation = officialDesktopRunner(() => manager, runtime('0.2.0-rc.2')).installPlugin!('desktop', {
        packageName: 'skin', packageVersion: '1.0.0', receiptId: 'request',
      }, { timeoutMs: 10 })
      await vi.advanceTimersByTimeAsync(10)
      settle({ application: 'restart-required' })
      expect(await operation).toMatchObject({ exitCode: 0, aborted: false, timedOut: false, management: { application: 'restart-required', cancellationStatus: 'too-late' } })
    } finally { vi.useRealTimers() }
  })

  it.each(['applied', 'restart-required', 'failed'] as const)('keeps application=%s authoritative after a late abort', async application => {
    let settle!: (value: unknown) => void
    const manager = fullManager()
    manager.installBundle = vi.fn(() => new Promise(resolve => { settle = resolve }))
    manager.cancelInstall = vi.fn(async () => ({ status: 'too-late' }))
    const controller = new AbortController()
    const operation = officialDesktopRunner(() => manager, runtime('0.2.0-rc.2')).installPlugin!('desktop', {
      packageName: 'skin', packageVersion: '1.0.0', receiptId: 'request',
    }, { signal: controller.signal })
    controller.abort()
    settle({ application })
    expect(await operation).toMatchObject({
      exitCode: application === 'failed' ? 1 : 0, aborted: false, timedOut: false,
      management: { application, cancelRequested: true, cancellationStatus: 'too-late' },
    })
  })

  it('recovers an active lost result once without repeating installation', async () => {
    const manager = fullManager()
    manager.installBundle = vi.fn(async () => { throw new Error('response lost') })
    manager.waitForInstall = vi.fn(async () => ({ application: 'restart-required', target: 'skin', version: '1.0.0' }))
    const result = await officialDesktopRunner(() => manager, runtime('0.2.0-rc.2')).installPlugin!('desktop', { packageName: 'skin', packageVersion: '1.0.0', receiptId: 'request' })
    expect(manager.installBundle).toHaveBeenCalledTimes(1)
    expect(manager.waitForInstall).toHaveBeenCalledWith('request')
    expect(result.management).toMatchObject({ application: 'restart-required', version: '1.0.0', requestId: 'request' })
  })

  it.each(['0.1.6-alpha.2', '0.2.0-rc.2'])('keeps a lost result unknown and non-retryable for %s', async version => {
    const manager = fullManager()
    manager.installBundle = vi.fn(async () => { throw new Error('network ETIMEDOUT response lost') })
    const runner = officialDesktopRunner(() => manager, runtime(version))
    let result
    await expect(runPnpmWithRecovery([], { attempt: async () => {
      result = await runner.installPlugin!('desktop', { packageName: 'skin', packageVersion: '1.0.0', receiptId: 'request' })
      return result
    } })).rejects.toThrow()
    expect(manager.installBundle).toHaveBeenCalledTimes(1)
    expect(manager.waitForInstall).toHaveBeenCalledTimes(version === '0.1.6-alpha.2' ? 0 : 1)
    expect(result).toMatchObject({ aborted: false, timedOut: false, management: { application: 'unknown', indeterminate: true } })
  })

  it('streams only the matching request and withdraws Host listeners after settlement', async () => {
    const handlers = new Map<string, (value: unknown) => void>()
    const dispose = vi.fn()
    const events = { on(event: string, callback: (value: unknown) => void) {
      handlers.set(event, callback)
      return () => { handlers.delete(event); dispose() }
    } }
    const onStdout = vi.fn()
    const onStderr = vi.fn()
    const onManagementState = vi.fn()
    const manager = fullManager()
    manager.installBundle = vi.fn(async () => {
      handlers.get('plugin-manager/install-log')!({ requestId: 'other', stream: 'stdout', text: 'ignore' })
      handlers.get('plugin-manager/install-log')!({ requestId: 'request', stream: 'stdout', text: 'progress' })
      handlers.get('plugin-manager/install-log')!({ requestId: 'request', stream: 'stderr', text: 'diagnostic' })
      handlers.get('plugin-manager/install-state')!({ requestId: 'request', phase: 'applying' })
      return { application: 'applied' }
    })
    const runner = officialDesktopRunner(() => manager, runtime('0.1.6-alpha.2'), events)
    await runner.installPlugin!('desktop', { packageName: 'skin', packageVersion: '1.0.0', receiptId: 'request' }, { onStdout, onStderr, onManagementState })
    expect(onStdout).toHaveBeenCalledExactlyOnceWith('progress')
    expect(onStderr).toHaveBeenCalledExactlyOnceWith('diagnostic')
    expect(onManagementState).toHaveBeenCalledExactlyOnceWith({ requestId: 'request', phase: 'applying' })
    expect(handlers.size).toBe(0)
    expect(dispose).toHaveBeenCalledTimes(2)
  })
})
