import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { compareVersions, createMarketUpdater, MARKET_NPM_METADATA_URL, MARKET_NPM_PACKAGE } from '../src/self-update.ts'

describe('market self update', () => {
  it('compares stable and prerelease semantic versions', () => {
    expect(compareVersions('0.1.16', '0.1.15')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0-rc.6')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-rc.7', '1.0.0-rc.6')).toBeGreaterThan(0)
    expect(compareVersions('0.1.15', '0.1.15')).toBe(0)
  })

  it('only installs when npm has a newer immutable package and hides the update afterwards', async () => {
    const dshHome = mkdtempSync(join(tmpdir(), 'dsh-market-self-update-'))
    const profileDir = join(dshHome, 'profiles', 'web')
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
    const previousDshHome = process.env.DSH_HOME
    process.env.DSH_HOME = dshHome

    try {
      const commit = 'a'.repeat(40)
      const fetchLatest = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '0.1.16' },
          versions: {
            '0.1.16': {
              version: '0.1.16',
              gitHead: commit,
              dist: { tarball: 'https://registry.npmjs.org/dsh-skin-market/-/dsh-skin-market-0.1.16.tgz' },
            },
          },
        }),
      })) as unknown as typeof fetch
      const runner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }))
      const updater = createMarketUpdater('web', runner, { currentVersion: '0.1.15', fetch: fetchLatest, cacheMs: 0 })

      expect(updater.restartRequired).toBe(false)
      await expect(updater.status()).resolves.toEqual({ currentVersion: '0.1.15', latestVersion: '0.1.16', updateAvailable: true })
      await expect(updater.update()).resolves.toEqual({ currentVersion: '0.1.16', latestVersion: '0.1.16', updateAvailable: false })
      expect(updater.restartRequired).toBe(true)
      expect(fetchLatest).toHaveBeenCalledWith(MARKET_NPM_METADATA_URL, expect.objectContaining({ headers: expect.objectContaining({ accept: 'application/json' }) }))
      expect(runner).toHaveBeenCalledTimes(1)
      expect(runner).toHaveBeenCalledWith('web', ['add', '-w', `${MARKET_NPM_PACKAGE}@0.1.16`, '--reporter=ndjson'], expect.objectContaining({
        signal: expect.any(AbortSignal),
        env: { pnpm_config_fetch_timeout: '600000' },
      }))
      await expect(updater.status()).resolves.toEqual({ currentVersion: '0.1.16', latestVersion: '0.1.16', updateAvailable: false })
    } finally {
      if (previousDshHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousDshHome
    }
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
    const runner = vi.fn(async (_profile: string, args: readonly string[]) => {
      attempts.push(args)
      return attempts.length === 1
        ? { exitCode: 1, stdout: '', stderr: 'dsh-skin-market@0.1.17 was published within the minimumReleaseAge cutoff', timedOut: false }
        : { exitCode: 0, stdout: '', stderr: '', timedOut: false }
    })
    const updater = createMarketUpdater('web', runner, { currentVersion: '0.1.16', fetch: fetchLatest, cacheMs: 0 })

    await expect(updater.update()).resolves.toMatchObject({ currentVersion: '0.1.17', updateAvailable: false })

    expect(attempts[0]).not.toContain('--config.minimumReleaseAge=0')
    expect(attempts[1]).toContain('--config.minimumReleaseAge=0')
  })
})
