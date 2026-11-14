import { describe, expect, it } from 'vitest'
import { buildCatalogWire } from '../scripts/catalog-wire.mjs'
import { CatalogStore, loadCatalog } from '../src/catalog.ts'
import { applyInstallPolicies, installPolicyEnabled, resolveSkinInstallPolicy } from '../src/install-policy.ts'
import type { CatalogFile, InstallPolicy, SkinEntry } from '../src/types.ts'
import { afterEach } from 'vitest'
import { cleanupTempDirs, tempDir } from './fixtures/temp.ts'

afterEach(cleanupTempDirs)

const bundled = loadCatalog()
// Prefer a Web/manual npm entry without companions so the default test can
// assert a no-op Desktop field and a full resolution.
const npmSkin = bundled.skins.find(skin => skin.install.npm !== undefined
    && (skin.install.companions?.length ?? 0) === 0
    && skin.install.desktop?.mode !== 'managed')
  ?? bundled.skins.find(skin => skin.install.npm !== undefined && (skin.install.companions?.length ?? 0) === 0)!
const npmId = npmSkin.id
const observedAt = '2026-11-14T00:00:00.000Z'
const nextCommit = 'b'.repeat(40)

function policy(overrides: Partial<InstallPolicy> & { resolved?: Partial<InstallPolicy['resolved']> } = {}): InstallPolicy {
  const { resolved: resolvedOverrides, ...rest } = overrides
  return {
    schema: 'install-policy-v1',
    mode: 'npm',
    package: npmSkin.package,
    ...rest,
    resolved: {
      version: '9.9.9',
      commit: nextCommit,
      integrity: 'sha512-ZGVm',
      gitHead: nextCommit,
      observedAt,
      ...resolvedOverrides,
    },
  } as InstallPolicy
}

function catalogWith(policyValue: InstallPolicy): CatalogFile {
  return {
    schemaVersion: 1,
    generatedAt: observedAt,
    skins: [npmSkin],
    installPolicies: { [npmSkin.id]: policyValue },
  }
}

function skipReason(result: ReturnType<typeof resolveSkinInstallPolicy>): string | undefined {
  return 'reason' in result ? result.reason : undefined
}

function repoSlug(skin: SkinEntry): string {
  return skin.repo.replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '')
}

describe('install policy resolver', () => {
  it('folds a newer npm observation into an exact artifact without mutating the reviewed entry', () => {
    const before = structuredClone(npmSkin)
    const result = resolveSkinInstallPolicy(npmSkin, policy())
    expect('skin' in result).toBe(true)
    if (!('skin' in result)) return
    const updated = result.skin
    expect(updated.install.version).toBe('9.9.9')
    expect(updated.install.commit).toBe(nextCommit)
    expect(updated.install.target).toBe(`github:${repoSlug(npmSkin)}#${nextCommit}${npmSkin.subpath ? `&path:/${npmSkin.subpath}` : ''}`)
    expect(updated.install.npm).toMatchObject({
      name: npmSkin.package,
      version: '9.9.9',
      integrity: 'sha512-ZGVm',
      gitHead: nextCommit,
    })
    expect(updated.install.desktop).toEqual(npmSkin.install.desktop)
    expect(npmSkin).toEqual(before)
  })

  it('moves Desktop managed metadata with the observation', () => {
    const managed: SkinEntry = {
      ...npmSkin,
      install: {
        ...npmSkin.install,
        desktop: {
          mode: 'managed',
          registry: 'npm',
          packageName: npmSkin.package,
          packageVersion: npmSkin.install.version,
          integrity: npmSkin.install.npm!.integrity,
        },
      },
    }
    const result = resolveSkinInstallPolicy(managed, policy())
    expect('skin' in result).toBe(true)
    if (!('skin' in result)) return
    expect(result.skin.install.desktop).toEqual({
      mode: 'managed',
      registry: 'npm',
      packageName: npmSkin.package,
      packageVersion: '9.9.9',
      integrity: 'sha512-ZGVm',
    })
  })

  it('skips an entry when a companion would remain pinned to the old review target', () => {
    const withCompanion: SkinEntry = {
      ...npmSkin,
      install: {
        ...npmSkin.install,
        companions: [{ package: 'companion', target: `github:owner/companion#${'a'.repeat(40)}`, version: '1.0.0', commit: 'a'.repeat(40), rowId: 'companion' }],
      },
    }
    expect(skipReason(resolveSkinInstallPolicy(withCompanion, policy()))).toBe('companions')
  })

  it.each([
    ['package-mismatch', () => policy({ package: 'other-package' })],
    ['range-mismatch', () => policy({ range: '^1.0.0' })],
    ['invalid-commit', () => policy({ resolved: { commit: 'abc' } })],
    ['invalid-version', () => policy({ resolved: { version: 'latest' } })],
    ['missing-integrity', () => policy({ resolved: { integrity: undefined } })],
    ['github-policy-with-npm-source', () => policy({ mode: 'github' })],
  ] as const)('skips %s', (reason, makePolicy) => {
    expect(skipReason(resolveSkinInstallPolicy(npmSkin, makePolicy()))).toBe(reason)
  })

  it('falls back to reviewed fields when the policy is disabled or absent', () => {
    const catalog = catalogWith(policy())
    expect(applyInstallPolicies(catalog, { enabled: false })).toBe(catalog)
    expect(applyInstallPolicies({ schemaVersion: 1, generatedAt: observedAt, skins: [npmSkin] })).toEqual({
      schemaVersion: 1,
      generatedAt: observedAt,
      skins: [npmSkin],
    })
  })

  it('applies valid observations and leaves skipped entries byte-identical', () => {
    const other: SkinEntry = {
      ...npmSkin,
      id: 'owner.other',
      install: { ...npmSkin.install, companions: [{ package: 'companion', target: `github:owner/companion#${'a'.repeat(40)}`, version: '1.0.0', commit: 'a'.repeat(40), rowId: 'companion' }] },
    }
    const catalog: CatalogFile = {
      schemaVersion: 1,
      generatedAt: observedAt,
      skins: [npmSkin, other],
      installPolicies: {
        [npmSkin.id]: policy(),
        [other.id]: policy({ package: other.package }),
      },
    }
    const resolved = applyInstallPolicies(catalog)
    expect(resolved.skins[0]!.install.version).toBe('9.9.9')
    expect(resolved.skins[1]).toBe(other)
    expect(catalog.skins[0]!.install.version).not.toBe('9.9.9')
  })

  it('reads the opt-in flag from the environment', () => {
    expect(installPolicyEnabled({ DSH_SKIN_MARKET_INSTALL_POLICY: '1' })).toBe(true)
    expect(installPolicyEnabled({ DSH_SKIN_MARKET_INSTALL_POLICY: '0' })).toBe(false)
    expect(installPolicyEnabled({})).toBe(false)
  })
})

describe('CatalogStore release observation opt-in', () => {
  it('resolves observed artifacts only when the option is enabled', async () => {
    const wire = buildCatalogWire(bundled.skins, {
      generatedAt: new Date(Date.parse(bundled.generatedAt) + 60_000).toISOString(),
      installPolicies: {
        [npmSkin.id]: {
          schema: 'install-policy-v1',
          mode: 'npm',
          package: npmSkin.package,
          resolved: { version: '9.9.9', commit: nextCommit, integrity: 'sha512-ZGVm', gitHead: nextCommit, observedAt },
        },
      },
    })
    const fetcher = async () => ({ ok: true, status: 200, json: async () => wire })

    const offDir = tempDir('skin-policy-off-')
    const off = new CatalogStore(offDir, { fetcher, installPolicy: false })
    await off.refresh(true)
    expect(off.snapshot().error).toBeUndefined()
    expect(off.snapshot().catalog.skins.find(skin => skin.id === npmSkin.id)!.install.version).toBe(npmSkin.install.version)

    const onDir = tempDir('skin-policy-on-')
    const on = new CatalogStore(onDir, { fetcher, installPolicy: true })
    await on.refresh(true)
    expect(on.snapshot().error).toBeUndefined()
    expect(on.snapshot().catalog.skins.find(skin => skin.id === npmSkin.id)!.install.version).toBe('9.9.9')
  })

  it('keeps the wire cache readable by a client with the flag disabled', async () => {
    const wire = buildCatalogWire(bundled.skins, {
      generatedAt: new Date(Date.parse(bundled.generatedAt) + 60_000).toISOString(),
      installPolicies: {
        [npmSkin.id]: {
          schema: 'install-policy-v1',
          mode: 'npm',
          package: npmSkin.package,
          resolved: { version: '9.9.9', commit: nextCommit, integrity: 'sha512-ZGVm', gitHead: nextCommit, observedAt },
        },
      },
    })
    const fetcher = async () => ({ ok: true, status: 200, json: async () => wire })
    const dir = tempDir('skin-policy-cache-')
    const on = new CatalogStore(dir, { fetcher, installPolicy: true })
    await on.refresh(true)

    const off = new CatalogStore(dir, { installPolicy: false })
    expect(off.snapshot().source).toBe('cache')
    expect(off.snapshot().catalog.skins.find(skin => skin.id === npmSkin.id)!.install.version).toBe(npmSkin.install.version)
  })
})
