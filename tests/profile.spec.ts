import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { buildApprovalKeyForTarget, effectiveBuildApprovalKey } from '../src/build-approval.ts'
import { acknowledgeSkinArtifactRisk, assertLoaderMetadata, assertNoLoaderConflicts, atomicWriteJson, atomicWriteText, compareInstalledArtifact, compatibilityPatchFile, ensureBuildAllowed, ensurePatchedDependency, ensureSkinRegistration, inspectSkinArtifactRisk, InstallConflictError, installedClientPlugins, installedSpecMatches, isSkinArtifactRiskAcknowledged, patchedDependenciesNeedSync, pnpmWorkspaceFile, profilePatchFile, readMarketState, removeCompatibilityPatches, removeProfileBundles, removeSkinRegistration, reviewedInstalledSpecMatches, runtimeState, snapshotInstalledArtifact, validateDesktopArtifact, validateInstalledSkin, validateNpmArtifact, writeMarketState } from '../src/profile.ts'
import { loadCatalog } from '../src/catalog.ts'

function fixture() { return mkdtempSync(join(tmpdir(), 'skin-profile-')) }

function artifactRiskFixture() {
  const dir = fixture()
  // Use a real catalog skin for identity/shape, but pin a stable Desktop↔npm SRI
  // conflict. Nightly ingestion may align live review hashes; these cases must not
  // collapse when the published catalog no longer carries divergent records.
  const base = loadCatalog().skins.find(skin => skin.id === 'johnnyting.dsh-official-homepage-theme')
  if (base === undefined) throw new Error('missing johnnyting.dsh-official-homepage-theme fixture skin')
  const skin = structuredClone(base)
  const npmIntegrity = `sha512-${Buffer.alloc(64, 1).toString('base64')}`
  const desktopIntegrity = `sha512-${Buffer.alloc(64, 2).toString('base64')}`
  skin.install.npm = {
    name: skin.package,
    version: skin.install.version,
    integrity: npmIntegrity,
    repository: skin.repo.replace(/\/$/, ''),
    gitHead: skin.install.commit.toLowerCase(),
  }
  skin.install.desktop = {
    mode: 'managed',
    registry: 'npm',
    packageName: skin.package,
    packageVersion: skin.install.version,
    integrity: desktopIntegrity,
  }
  const directory = join(dir, 'node_modules', skin.package)
  const manifest = { name: skin.package, version: skin.install.version, repository: skin.repo,
    exports: { './client': './client.js' }, dsh: { client: { platform: 'web' } } }
  atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.version } })
  atomicWriteJson(join(directory, 'package.json'), manifest)
  atomicWriteText(join(directory, 'client.js'), 'export const source = "installed artifact"')
  const lock = (integrity: string | null = skin.install.npm!.integrity, tarball?: string) => atomicWriteText(join(dir, 'pnpm-lock.yaml'),
    `importers:\n  .:\n    dependencies:\n      '${skin.package}':\n        specifier: '${skin.install.version}'\n        version: '${skin.install.version}'\npackages:\n  '${skin.package}@${skin.install.version}':\n    resolution:${integrity === null && tarball === undefined ? ' {}' : ''}\n${integrity === null ? '' : `      integrity: ${integrity}\n`}${tarball === undefined ? '' : `      tarball: ${tarball}\n`}`)
  lock()
  return { dir, skin, directory, manifest, lock }
}

describe('exact installed artifact acknowledgement', () => {
  it('does not warn Web users about an unrelated Desktop SRI record', () => {
    const { dir, skin } = artifactRiskFixture()
    expect(inspectSkinArtifactRisk(dir, skin, 'desktop')).toBeDefined()
    expect(inspectSkinArtifactRisk(dir, skin, 'dsh')).toBeUndefined()
    expect(validateInstalledSkin(dir, skin).ok).toBe(true)
    expect(runtimeState(dir, skin, null, false, true)).toMatchObject({ installation: 'installed', updateAvailable: false })
    expect(runtimeState(dir, skin, null, false, true).artifactRisk).toBeUndefined()
  })

  it('keeps artifact acknowledgement bound to the displayed host', () => {
    const { dir, skin, lock } = artifactRiskFixture()
    lock('sha512-unreviewed')
    const desktop = inspectSkinArtifactRisk(dir, skin, 'desktop')!
    const web = inspectSkinArtifactRisk(dir, skin, 'dsh')!
    expect(desktop.context).not.toBe(web.context)
    expect(acknowledgeSkinArtifactRisk(dir, skin, desktop.context, 'desktop')).toBe(true)
    expect(isSkinArtifactRiskAcknowledged(dir, skin, 'desktop')).toBe(true)
    expect(isSkinArtifactRiskAcknowledged(dir, skin, 'dsh')).toBe(false)
    expect(acknowledgeSkinArtifactRisk(dir, skin, desktop.context, 'dsh')).toBe(false)
  })

  it('does not invalidate Web consent when only the unrelated Desktop review record changes', () => {
    const { dir, skin, lock } = artifactRiskFixture()
    lock('sha512-unreviewed')
    const risk = inspectSkinArtifactRisk(dir, skin, 'dsh')!
    expect(acknowledgeSkinArtifactRisk(dir, skin, risk.context, 'dsh')).toBe(true)
    if (skin.install.desktop?.mode !== 'managed') throw new Error('expected a managed skin')
    skin.install.desktop.integrity = 'sha512-changed-desktop-only'
    expect(inspectSkinArtifactRisk(dir, skin, 'dsh')?.context).toBe(risk.context)
    expect(isSkinArtifactRiskAcknowledged(dir, skin, 'dsh')).toBe(true)
  })

  it('preserves consent across scan, listing and review refreshes of the same artifact', () => {
    const { dir, skin } = artifactRiskFixture()
    const risk = inspectSkinArtifactRisk(dir, skin, 'desktop')!
    expect(acknowledgeSkinArtifactRisk(dir, skin, risk.context, 'desktop')).toBe(true)
    skin.starsSnapshot += 1
    skin.description = 'Updated listing description'
    skin.screenshots = ['https://example.test/refreshed-preview.png']
    skin.metadataUpdatedAt = '2030-01-01T00:00:00.000Z'
    skin.review = { compatibility: 'verified', preview: 'verified', installation: 'verified' }
    if (skin.health?.scan !== undefined) {
      skin.health.scan.checkedAt = '2030-01-01T00:00:00.000Z'
      skin.health.scan.scannerVersion = 'review-refresh'
    }
    expect(inspectSkinArtifactRisk(dir, skin, 'desktop')?.context).toBe(risk.context)
    expect(isSkinArtifactRiskAcknowledged(dir, skin, 'desktop')).toBe(true)
  })

  it('keeps the original catalog conflict blocked until the user confirms its exact installed bytes', () => {
    const { dir, skin } = artifactRiskFixture()
    if (skin.install.desktop?.mode !== 'managed') throw new Error('expected a managed skin')
    expect(skin.install.desktop.integrity).not.toBe(skin.install.npm!.integrity)
    const risk = inspectSkinArtifactRisk(dir, skin, 'desktop')!
    expect(risk).toMatchObject({ packageName: skin.package, version: skin.install.version })
    expect(risk.warnings.join(' ')).toContain('SRI')
    expect(risk.warnings.join(' ')).toContain('冲突')
    expect(validateDesktopArtifact(dir, skin)).toMatchObject({ ok: false, integrityVerified: false })
    expect(validateInstalledSkin(dir, skin, { hostKind: 'desktop' }).ok).toBe(false)
    expect(reviewedInstalledSpecMatches(dir, skin, skin.install.version, { hostKind: 'desktop' })).toBe(false)
    expect(validateInstalledSkin(dir, skin, { allowArtifactRisk: true, hostKind: 'desktop' }).ok).toBe(true)
    expect(validateDesktopArtifact(dir, skin, { allowArtifactRisk: true })).toMatchObject({ ok: true, integrityVerified: false })
    expect(reviewedInstalledSpecMatches(dir, skin, skin.install.version, { allowArtifactRisk: true, hostKind: 'desktop' })).toBe(true)
    expect(runtimeState(dir, skin, null, false, true, [], undefined, 'desktop')).toMatchObject({ installation: 'installed', artifactRisk: risk, updateAvailable: false })
    expect(readMarketState(dir).artifactAcknowledgements).toBeUndefined()
    expect(acknowledgeSkinArtifactRisk(dir, skin, 'cancelled-or-stale', 'desktop')).toBe(false)
    expect(readMarketState(dir).artifactAcknowledgements).toBeUndefined()

    expect(acknowledgeSkinArtifactRisk(dir, skin, risk.context, 'desktop')).toBe(true)
    expect(isSkinArtifactRiskAcknowledged(dir, skin, 'desktop')).toBe(true)
    expect(inspectSkinArtifactRisk(dir, skin, 'desktop')).toEqual(risk)
    expect(readMarketState(dir).artifactAcknowledgements).toEqual({ [skin.id]: risk.context })
    expect(validateDesktopArtifact(dir, skin)).toEqual({ ok: true, version: skin.install.version, integrityVerified: false })
    expect(validateInstalledSkin(dir, skin, { hostKind: 'desktop' })).toMatchObject({ ok: true, version: skin.install.version })
    expect(reviewedInstalledSpecMatches(dir, skin, skin.install.version, { hostKind: 'desktop' })).toBe(true)
    expect(runtimeState(dir, skin, skin.id, true, true, [], undefined, 'desktop')).toMatchObject({ installation: 'installed', updateAvailable: false })
    expect(runtimeState(dir, skin, skin.id, true, true, [], undefined, 'desktop').artifactRisk).toBeUndefined()
    expect(validateNpmArtifact(dir, { name: skin.package, version: skin.install.version, integrity: skin.install.desktop.integrity })).toMatchObject({ ok: false, integrityVerified: false })
  })

  it('also binds a Desktop-only artifact without inventing npm repository evidence', () => {
    const { dir, skin } = artifactRiskFixture()
    delete skin.install.npm
    const risk = inspectSkinArtifactRisk(dir, skin, 'desktop')!
    expect(acknowledgeSkinArtifactRisk(dir, skin, risk.context, 'desktop')).toBe(true)
    expect(validateDesktopArtifact(dir, skin)).toEqual({ ok: true, version: skin.install.version, integrityVerified: false })
    expect(runtimeState(dir, skin, null, false, true, [], undefined, 'desktop')).toMatchObject({ installation: 'installed', updateAvailable: false })
  })

  it('permits missing installed SRI only after confirming a complete artifact and matching root importer', () => {
    const { dir, skin, lock } = artifactRiskFixture()
    lock(null)
    const risk = inspectSkinArtifactRisk(dir, skin, 'desktop')!
    expect(risk.warnings.join(' ')).toContain('缺少')
    expect(validateInstalledSkin(dir, skin, { hostKind: 'desktop' }).ok).toBe(false)
    expect(acknowledgeSkinArtifactRisk(dir, skin, risk.context, 'desktop')).toBe(true)
    expect(validateDesktopArtifact(dir, skin)).toEqual({ ok: true, version: skin.install.version, integrityVerified: false })
    expect(validateInstalledSkin(dir, skin, { hostKind: 'desktop' }).ok).toBe(true)
  })

  it('includes repository and gitHead uncertainty in the same explicit artifact confirmation', () => {
    const { dir, skin, directory, manifest } = artifactRiskFixture()
    if (skin.install.desktop?.mode !== 'managed') throw new Error('expected a managed skin')
    skin.install.desktop.integrity = skin.install.npm!.integrity
    atomicWriteJson(join(directory, 'package.json'), { ...manifest, repository: 'https://github.com/other/package', gitHead: 'f'.repeat(40) })
    const risk = inspectSkinArtifactRisk(dir, skin, 'desktop')!
    expect(risk.warnings.join(' ')).toContain('repository')
    expect(risk.warnings.join(' ')).toContain('gitHead')
    expect(validateInstalledSkin(dir, skin, { hostKind: 'desktop' }).ok).toBe(false)
    expect(acknowledgeSkinArtifactRisk(dir, skin, risk.context, 'desktop')).toBe(true)
    expect(validateInstalledSkin(dir, skin, { hostKind: 'desktop' }).ok).toBe(true)
    expect(validateDesktopArtifact(dir, skin).integrityVerified).toBe(false)
  })

  it.each(['client bytes', 'manifest repository', 'manifest gitHead', 'lock resolution', 'reviewed npm SRI', 'reviewed Desktop SRI', 'reviewed source', 'compatibility'] as const)('expires consent after %s changes', changed => {
    const { dir, skin, directory, manifest, lock } = artifactRiskFixture()
    const risk = inspectSkinArtifactRisk(dir, skin, 'desktop')!
    expect(acknowledgeSkinArtifactRisk(dir, skin, risk.context, 'desktop')).toBe(true)
    if (changed === 'client bytes') atomicWriteText(join(directory, 'client.js'), 'export const source = "different same-version artifact"')
    if (changed === 'manifest repository') atomicWriteJson(join(directory, 'package.json'), { ...manifest, repository: 'https://github.com/changed/repository' })
    if (changed === 'manifest gitHead') atomicWriteJson(join(directory, 'package.json'), { ...manifest, gitHead: 'f'.repeat(40) })
    if (changed === 'lock resolution') lock(skin.install.npm!.integrity, 'https://registry.example.test/changed.tgz')
    if (changed === 'reviewed npm SRI') skin.install.npm!.integrity = 'sha512-changed'
    if (changed === 'reviewed Desktop SRI' && skin.install.desktop?.mode === 'managed') skin.install.desktop.integrity = 'sha512-changed'
    if (changed === 'reviewed source') skin.install.target = skin.install.target.replace(skin.install.commit, 'f'.repeat(40))
    if (changed === 'compatibility') skin.compatibility.dsh = '^99.0.0'
    expect(inspectSkinArtifactRisk(dir, skin, 'desktop')?.context).not.toBe(risk.context)
    expect(isSkinArtifactRiskAcknowledged(dir, skin, 'desktop')).toBe(false)
    expect(acknowledgeSkinArtifactRisk(dir, skin, risk.context, 'desktop')).toBe(false)
    expect(validateDesktopArtifact(dir, skin)).toMatchObject({ ok: false, integrityVerified: false })
    expect(validateInstalledSkin(dir, skin, { hostKind: 'desktop' }).ok).toBe(false)
    expect(runtimeState(dir, skin, null, false, true, [], undefined, 'desktop')).toMatchObject({ installation: 'installed', updateAvailable: false })
    expect(runtimeState(dir, skin, null, false, true, [], undefined, 'desktop').artifactRisk).toBeDefined()
  })

  it.each(['wrong package', 'wrong version', 'wrong importer', 'missing importer', 'missing client', 'unsafe client', 'symlink client', 'wrong platform', 'wrong primary loader', 'loader conflict'] as const)('never offers artifact approval for %s', fault => {
    const { dir, skin, directory, manifest } = artifactRiskFixture()
    const risk = inspectSkinArtifactRisk(dir, skin, 'desktop')!
    expect(acknowledgeSkinArtifactRisk(dir, skin, risk.context, 'desktop')).toBe(true)
    if (fault === 'wrong package') atomicWriteJson(join(directory, 'package.json'), { ...manifest, name: 'another-package' })
    if (fault === 'wrong version') atomicWriteJson(join(directory, 'package.json'), { ...manifest, version: '0.0.0' })
    if (fault === 'wrong importer') atomicWriteText(join(dir, 'pnpm-lock.yaml'), `importers:\n  .:\n    dependencies:\n      '${skin.package}':\n        specifier: '${skin.install.version}'\n        version: '0.0.0'\n`)
    if (fault === 'missing importer') atomicWriteText(join(dir, 'pnpm-lock.yaml'), 'packages: {}\n')
    if (fault === 'missing client') rmSync(join(directory, 'client.js'))
    if (fault === 'unsafe client') atomicWriteJson(join(directory, 'package.json'), { ...manifest, exports: { './client': './.env' } })
    if (fault === 'symlink client') {
      rmSync(join(directory, 'client.js'))
      atomicWriteText(join(dir, 'outside.js'), 'export const source = "outside"')
      symlinkSync(join(dir, 'outside.js'), join(directory, 'client.js'))
    }
    if (fault === 'wrong platform') atomicWriteJson(join(directory, 'package.json'), { ...manifest, dsh: { client: { platform: 'desktop' } } })
    if (fault === 'wrong primary loader') {
      atomicWriteJson(join(directory, 'package.json'), { ...manifest, dsh: { ...manifest.dsh, bundle: { patch: './bundle.yml' } } })
      atomicWriteText(join(directory, 'bundle.yml'), `- insert:\n    - id: wrong-row\n      name: ${skin.package}\n`)
    }
    if (fault === 'loader conflict') atomicWriteText(profilePatchFile(dir), `- insert:\n    - id: ${skin.rowId}\n      name: another-package\n`)
    expect(inspectSkinArtifactRisk(dir, skin, 'desktop')).toBeUndefined()
    expect(isSkinArtifactRiskAcknowledged(dir, skin, 'desktop')).toBe(false)
    expect(acknowledgeSkinArtifactRisk(dir, skin, risk.context, 'desktop')).toBe(false)
    expect(validateDesktopArtifact(dir, skin).ok).toBe(false)
    expect(validateInstalledSkin(dir, skin, { hostKind: 'desktop' }).ok).toBe(false)
    expect(validateDesktopArtifact(dir, skin, { allowArtifactRisk: true }).ok).toBe(false)
    expect(validateInstalledSkin(dir, skin, { allowArtifactRisk: true, hostKind: 'desktop' }).ok).toBe(false)
    expect(runtimeState(dir, skin, null, false, true, [], undefined, 'desktop').installation).toBe('broken')
  })

  it('discards malformed persisted artifact acknowledgement data', () => {
    const dir = fixture()
    atomicWriteJson(join(dir, '.dsh-skin-market', 'state.json'), { version: 1, activeSkinId: null, disabledSkinIds: [],
      artifactAcknowledgements: { valid: 'a'.repeat(64), old: 'permanent-version-exemption', malformed: true } })
    expect(readMarketState(dir).artifactAcknowledgements).toEqual({ valid: 'a'.repeat(64) })
  })
})

describe('profile state', () => {
  it.each(['client', 'bundle'] as const)('rejects a %s realpath resolving to a secret-shaped file before reading it', kind => {
    const dir = fixture()
    const skin = loadCatalog().skins[0]
    const directory = join(dir, 'node_modules', skin.package)
    const entry = join(directory, kind === 'client' ? 'client.js' : 'bundle.yml')
    atomicWriteJson(join(directory, 'package.json'), {
      name: skin.package, version: skin.install.version,
      ...(kind === 'client'
        ? { exports: { './client': './client.js' }, dsh: { client: { platform: 'web' } } }
        : { dsh: { bundle: { patch: './bundle.yml' } } }),
    })
    atomicWriteText(entry, kind === 'client' ? 'export const enabled = true' : '[]\n')
    const actualRealpath = fs.realpathSync
    const physicalDirectory = actualRealpath(directory)
    // Simulate symlink resolution only. No secret-shaped file is created or read.
    const secretTarget = join(physicalDirectory, '.env.fixture-not-created')
    vi.spyOn(fs, 'realpathSync').mockImplementation(((file: Parameters<typeof fs.realpathSync>[0]) =>
      String(file) === entry ? secretTarget : actualRealpath(file)) as typeof fs.realpathSync)
    const reads = vi.spyOn(fs, 'readFileSync')
    syncBuiltinESMExports()
    try {
      if (kind === 'client') expect(snapshotInstalledArtifact(dir, skin.package).ok).toBe(false)
      else expect(() => assertLoaderMetadata(dir, skin)).toThrow('unsafe')
      expect(reads.mock.calls.some(([file]) => String(file) === entry || String(file) === secretTarget)).toBe(false)
    } finally {
      vi.restoreAllMocks()
      syncBuiltinESMExports()
    }
  })

  it('preserves pending restart facts and discards malformed values', () => {
    const dir = fixture()
    writeMarketState(dir, { version: 1, activeSkinId: null, disabledSkinIds: [], pendingRestart: { pid: 1234, skinIds: ['one', 'one', 'two'] } })
    expect(readMarketState(dir).pendingRestart).toEqual({ pid: 1234, skinIds: ['one', 'two'] })
    atomicWriteJson(join(dir, '.dsh-skin-market', 'state.json'), { version: 1, activeSkinId: null, disabledSkinIds: [], pendingRestart: { pid: '1234', skinIds: ['one'] } })
    expect(readMarketState(dir).pendingRestart).toBeUndefined()
  })

  it('preserves first-install restart provenance and treats malformed provenance conservatively', () => {
    const dir = fixture()
    const pendingRestart = { pid: 1234, id: 'first-install', skinIds: ['one', 'two'], inferredInstalls: { one: 'a'.repeat(64) } }
    writeMarketState(dir, { version: 1, activeSkinId: null, disabledSkinIds: [], pendingRestart })
    expect(readMarketState(dir).pendingRestart).toEqual(pendingRestart)
    for (const inferredInstalls of [{ unknown: 'a'.repeat(64) }, { one: 1 }, { one: 'invalid-hash' }, ['one']]) {
      atomicWriteJson(join(dir, '.dsh-skin-market', 'state.json'), { version: 1, activeSkinId: null, disabledSkinIds: [], pendingRestart: { ...pendingRestart, inferredInstalls } })
      expect(readMarketState(dir).pendingRestart).toEqual({ pid: 1234, id: 'first-install', skinIds: ['one', 'two'] })
    }
  })

  it('uses every declared bundle patch in order for validation and skin registration', () => {
    const dir = fixture()
    const skin = loadCatalog().skins[0]
    const directory = join(dir, 'node_modules', skin.package)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    atomicWriteJson(join(directory, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { client: { platform: 'web' }, bundle: { patch: ['./first.yml', './second.yml'] } } })
    atomicWriteText(join(directory, 'first.yml'), `- insert:\n    - id: ${skin.rowId}\n      name: ${skin.package}\n`)
    atomicWriteText(join(directory, 'second.yml'), `- id: ${skin.rowId}\n  config:\n    test: true\n`)
    expect(validateInstalledSkin(dir, skin).ok).toBe(true)
    expect(() => assertLoaderMetadata(dir, skin)).not.toThrow()
    ensureSkinRegistration(dir, skin, false)
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(manifest.dsh.profile.bundles).toEqual([skin.package])
    const rows = parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<{ insert?: unknown[] }>
    expect(rows.flatMap(row => row.insert ?? [])).toHaveLength(0)
  })
  it('checks declared executable files and frozen bytes, rather than a surviving manifest alone', () => {
    const dir = fixture()
    const name = '@example/recovery-skin'
    const packageDirectory = join(dir, 'node_modules', name)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [name]: '1.0.0' } })
    atomicWriteJson(join(packageDirectory, 'package.json'), {
      name, version: '1.0.0', exports: { '.': { types: './index.d.ts', default: './host.js' }, './client': './client.js' },
      dsh: { client: { platform: 'web' }, bundle: { patch: ['./first.yml', './second.yml'] } },
    })
    for (const path of ['host.js', 'client.js']) atomicWriteText(join(packageDirectory, path), `export const source = '${path}'`)
    for (const path of ['first.yml', 'second.yml']) atomicWriteText(join(packageDirectory, path), '[]\n')
    const baseline = snapshotInstalledArtifact(dir, name)
    expect(baseline).toMatchObject({ ok: true, name, version: '1.0.0', spec: '1.0.0' })
    expect(baseline.files.map(file => file.kind)).toEqual(['host', 'client', 'bundle', 'bundle'])
    expect(compareInstalledArtifact(dir, baseline).ok).toBe(true)
    atomicWriteText(join(packageDirectory, 'client.js'), 'export const source = "different same-version build"')
    expect(compareInstalledArtifact(dir, baseline)).toMatchObject({ ok: false, reason: expect.stringContaining('entries differ') })
    rmSync(join(packageDirectory, 'client.js'))
    expect(snapshotInstalledArtifact(dir, name).ok).toBe(false)
  })

  it('refuses entry paths and symlinks outside the package without reading their targets', () => {
    const dir = fixture()
    const name = 'recovery-package'
    const directory = join(dir, 'node_modules', name)
    atomicWriteJson(join(directory, 'package.json'), { name, version: '1.0.0', main: '../../outside.js' })
    expect(snapshotInstalledArtifact(dir, name).ok).toBe(false)
    atomicWriteJson(join(directory, 'package.json'), { name, version: '1.0.0', main: './linked.js' })
    atomicWriteText(join(dir, 'outside.js'), 'export const unrelated = true')
    symlinkSync(join(dir, 'outside.js'), join(directory, 'linked.js'))
    expect(snapshotInstalledArtifact(dir, name).ok).toBe(false)
  })

  it('does not skip reviewed integrity for an npm caret source resolved by the lock importer', () => {
    const dir = fixture()
    const base = loadCatalog().skins[0]
    const skin = { ...base, install: { ...base.install, npm: { name: base.package, version: base.install.version, integrity: 'sha512-reviewed', repository: base.repo, gitHead: base.install.commit } } }
    const spec = `^${skin.install.version}`
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: spec } })
    atomicWriteJson(join(dir, 'node_modules', skin.package, 'package.json'), { name: skin.package, version: skin.install.version, repository: skin.repo, dsh: { client: { platform: 'web' } } })
    const lock = (specifier: string, version: string, integrity: string) => atomicWriteText(join(dir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      '${skin.package}':\n        specifier: '${specifier}'\n        version: '${version}'\npackages:\n  '${skin.package}@${skin.install.version}':\n    resolution:\n      integrity: ${integrity}\n`)
    lock(spec, skin.install.version, 'sha512-reviewed')
    expect(validateInstalledSkin(dir, skin).ok).toBe(true)
    expect(reviewedInstalledSpecMatches(dir, skin, spec)).toBe(true)
    expect(runtimeState(dir, skin, skin.id, true, true).updateAvailable).toBe(false)
    lock(spec, skin.install.version, 'sha512-unreviewed')
    expect(validateInstalledSkin(dir, skin)).toMatchObject({ ok: false, reason: expect.stringContaining('integrity mismatch') })
    expect(reviewedInstalledSpecMatches(dir, skin, spec)).toBe(false)
    lock('^0.0.0', skin.install.version, 'sha512-reviewed')
    expect(validateInstalledSkin(dir, skin)).toMatchObject({ ok: false, reason: expect.stringContaining('importer mismatch') })
    lock(spec, '0.0.0', 'sha512-reviewed')
    expect(validateInstalledSkin(dir, skin)).toMatchObject({ ok: false, reason: expect.stringContaining('importer mismatch') })
  })

  it('validates managed Desktop integrity without requiring synthetic npm repository evidence', () => {
    const dir = fixture()
    const base = loadCatalog().skins[0]
    const skin = { ...base, install: { ...base.install, npm: undefined, desktop: { mode: 'managed' as const, registry: 'npm' as const, packageName: base.package, packageVersion: base.install.version, integrity: 'sha512-reviewed' } } }
    const directory = join(dir, 'node_modules', skin.package)
    const spec = `^${skin.install.version}`
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: spec } })
    atomicWriteJson(join(directory, 'package.json'), { name: skin.package, version: skin.install.version, exports: { './client': './client.js' }, dsh: { client: { platform: 'web' } } })
    atomicWriteText(join(directory, 'client.js'), 'export const enabled = true')
    const lock = (integrity: string) => atomicWriteText(join(dir, 'pnpm-lock.yaml'), `importers:\n  .:\n    dependencies:\n      '${skin.package}':\n        specifier: '${spec}'\n        version: '${skin.install.version}'\npackages:\n  '${skin.package}@${skin.install.version}':\n    resolution:\n      integrity: ${integrity}\n`)
    lock('sha512-reviewed')
    expect(validateDesktopArtifact(dir, skin)).toEqual({ ok: true, version: skin.install.version, integrityVerified: true })
    expect(reviewedInstalledSpecMatches(dir, skin, spec)).toBe(true)
    lock('sha512-unreviewed')
    expect(validateDesktopArtifact(dir, skin)).toMatchObject({ ok: false, integrityVerified: false })
    const legacy = { ...skin, install: { ...skin.install, desktop: { ...skin.install.desktop, integrity: undefined } } }
    expect(validateDesktopArtifact(dir, legacy)).toEqual({ ok: true, version: skin.install.version, integrityVerified: false })
  })

  it('requires the matching root importer for an exact Desktop source, including legacy metadata without SRI', () => {
    const dir = fixture()
    const base = loadCatalog().skins[0]
    const skin = { ...base, install: { ...base.install, npm: undefined, desktop: { mode: 'managed' as const, registry: 'npm' as const, packageName: base.package, packageVersion: base.install.version } } }
    const directory = join(dir, 'node_modules', skin.package)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.version } })
    atomicWriteJson(join(directory, 'package.json'), { name: skin.package, version: skin.install.version, exports: { './client': './client.js' }, dsh: { client: {} } })
    atomicWriteText(join(directory, 'client.js'), 'export const enabled = true')
    expect(validateDesktopArtifact(dir, skin)).toMatchObject({ ok: false, reason: expect.stringContaining('root importer'), integrityVerified: false })
    const lock = (specifier: string, version: string) => atomicWriteText(join(dir, 'pnpm-lock.yaml'), `importers:\n  .:\n    dependencies:\n      '${skin.package}':\n        specifier: '${specifier}'\n        version: '${version}'\n`)
    lock(skin.install.version, `${skin.install.version}(cordis@3.18.1)`)
    expect(validateDesktopArtifact(dir, skin)).toEqual({ ok: true, version: skin.install.version, integrityVerified: false })
    lock(`^${skin.install.version}`, skin.install.version)
    expect(validateDesktopArtifact(dir, skin)).toMatchObject({ ok: false, reason: expect.stringContaining('root importer') })
    lock(skin.install.version, '0.0.0')
    expect(validateDesktopArtifact(dir, skin).ok).toBe(false)
  })

  it('validates generic npm artifact provenance without accepting a package merely present in the lockfile', () => {
    const dir = fixture()
    const name = 'test-market'
    const source = { name, version: '1.2.3', integrity: 'sha512-reviewed', gitHead: 'c'.repeat(40), tarball: 'https://registry.npmjs.org/test-market/-/test-market-1.2.3.tgz' }
    const directory = join(dir, 'node_modules', name)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [name]: '1.2.3' } })
    atomicWriteJson(join(directory, 'package.json'), { name, version: source.version, main: './host.js', gitHead: source.gitHead })
    atomicWriteText(join(directory, 'host.js'), 'export const enabled = true')
    const lock = (specifier: string, version: string, integrity = source.integrity) => atomicWriteText(join(dir, 'pnpm-lock.yaml'), `importers:\n  .:\n    dependencies:\n      '${name}':\n        specifier: '${specifier}'\n        version: '${version}'\npackages:\n  '${name}@${source.version}':\n    resolution:\n      integrity: ${integrity}\n      tarball: ${source.tarball}\n`)
    lock('1.2.3', '1.2.3')
    expect(validateNpmArtifact(dir, source)).toEqual({ ok: true, version: '1.2.3', integrityVerified: true })
    lock('1.2.3', '1.2.4')
    expect(validateNpmArtifact(dir, source)).toMatchObject({ ok: false, reason: expect.stringContaining('root importer') })
    lock('1.2.3', '1.2.3', 'sha512-other')
    expect(validateNpmArtifact(dir, source)).toMatchObject({ ok: false, reason: expect.stringContaining('SRI') })
    lock('1.2.3', '1.2.3')
    rmSync(join(directory, 'host.js'))
    expect(validateNpmArtifact(dir, source)).toMatchObject({ ok: false, reason: expect.stringContaining('可加载入口') })
  })
  it('atomically persists active and disabled skin state', () => {
    const dir = fixture()
    writeMarketState(dir, { version: 1, activeSkinId: 'a', disabledSkinIds: ['b'] })
    expect(readMarketState(dir)).toEqual({ version: 1, activeSkinId: 'a', disabledSkinIds: ['b'] })
  })

  it('does not infer companion delete rights from legacy ownership state', () => {
    const dir = fixture()
    atomicWriteJson(join(dir, '.dsh-skin-market', 'state.json'), {
      version: 1,
      activeSkinId: null,
      disabledSkinIds: [],
      managedCompanions: { companion: { ownerSkinIds: ['owner'] } },
    })

    expect(readMarketState(dir).managedCompanions).toEqual({
      companion: { ownerSkinIds: ['owner'], installedByMarket: false },
    })
  })

  it('removes market-managed skin bundles while preserving dependencies and core bundles', () => {
    const dir = fixture()
    atomicWriteJson(join(dir, 'package.json'), {
      dependencies: { skin: 'github:owner/skin#commit' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'skin', 'dsh-skin-market'] } },
    })

    removeProfileBundles(dir, ['skin'])

    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; dsh: { profile: { bundles: string[] } } }
    expect(manifest.dependencies.skin).toBe('github:owner/skin#commit')
    expect(manifest.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base', 'dsh-skin-market'])
  })

  it('detects installed, active, and update states independently', () => {
    const dir = fixture()
    const skin = loadCatalog().skins[0]
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
    mkdirSync(packageDir, { recursive: true })
    atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { bundle: { patch: './cordis.patch.yml' }, client: {} } })
    atomicWriteText(join(packageDir, 'cordis.patch.yml'), '- insert: []\n')
    expect(validateInstalledSkin(dir, skin).ok).toBe(true)
    expect(runtimeState(dir, skin, skin.id, true, true)).toMatchObject({ installation: 'installed', activation: 'active', updateAvailable: false })
    expect(runtimeState(dir, skin, null, false, true)).toMatchObject({ installation: 'installed', activation: 'inactive' })
  })

  it.each([
    { primary: true, pinned: false, loaderFound: false },
    { primary: true, pinned: false, loaderFound: true },
    { primary: false, pinned: true, loaderFound: false },
    { primary: false, pinned: true, loaderFound: true },
    { primary: true, pinned: true, loaderFound: false },
    { primary: true, pinned: true, loaderFound: true },
  ])('does not infer a pending restart from an unstarted selected component: %j', ({ primary, pinned, loaderFound }) => {
    const dir = fixture()
    const skin = loadCatalog().skins[0]
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    atomicWriteJson(join(dir, 'node_modules', skin.package, 'package.json'), {
      name: skin.package, version: skin.install.version, dsh: { client: { platform: 'web' } },
    })

    expect(runtimeState(dir, skin, primary ? skin.id : null, false, loaderFound, pinned ? [skin.id] : [])).toMatchObject({
      installation: 'installed', activation: 'unavailable', primary, pinned,
      error: expect.stringContaining(loaderFound ? '组件尚未运行' : '未找到组件'),
    })
  })

  it('keeps unselected, missing, and broken installations separate from unavailable components', () => {
    const dir = fixture()
    const skin = loadCatalog().skins[0]
    expect(runtimeState(dir, skin, skin.id, false, false, [skin.id])).toMatchObject({
      installation: 'missing', activation: 'inactive', primary: false, pinned: false,
    })

    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    expect(runtimeState(dir, skin, skin.id, false, false, [skin.id])).toMatchObject({
      installation: 'broken', activation: 'inactive', primary: true, pinned: true, error: expect.any(String),
    })

    atomicWriteJson(join(dir, 'node_modules', skin.package, 'package.json'), {
      name: skin.package, version: skin.install.version, dsh: { client: { platform: 'web' } },
    })
    const inactive = runtimeState(dir, skin, null, false, false)
    expect(inactive).toMatchObject({ installation: 'installed', activation: 'inactive', primary: false, pinned: false })
    expect(inactive.error).toBeUndefined()
    expect(runtimeState(dir, skin, null, true, true).activation).toBe('inactive')
  })

  it('marks an installed skin as updatable when a companion is missing', () => {
    const dir = fixture()
    const commit = 'a'.repeat(40)
    const base = loadCatalog().skins[0]
    const companion = {
      package: '@example/companion',
      target: `github:example/repo#${commit}&path:/manager`,
      version: '0.1.0',
      commit,
      rowId: 'ui-companion',
    }
    const skin = {
      ...base,
      install: { target: `github:example/repo#${commit}&path:/skin`, version: '1.0.0', commit, companions: [companion] },
    }
    const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
    mkdirSync(packageDir, { recursive: true })
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { client: { platform: 'web' } } })

    expect(runtimeState(dir, skin, null, false, true)).toMatchObject({ installation: 'installed', updateAvailable: true })
  })

  it.each(['version', 'package', 'alias'])('validates the reviewed npm repository and lockfile integrity for a %s spec', form => {
    const dir = fixture()
    const base = loadCatalog().skins[0]
    const integrity = 'sha512-abc'
    const skin = {
      ...base,
      install: { ...base.install, npm: { name: base.package, version: base.install.version, integrity, repository: base.repo, gitHead: base.install.commit } },
    }
    const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
    mkdirSync(packageDir, { recursive: true })
    const spec = form === 'version' ? skin.install.version : `${form === 'alias' ? 'npm:' : ''}${skin.package}@${skin.install.version}`
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: spec } })
    atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, repository: { type: 'git', url: `git+${skin.repo}.git` }, dsh: { client: { platform: 'web' } } })
    atomicWriteText(join(dir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\npackages:\n  '${skin.package}@${skin.install.version}':\n    resolution:\n      integrity: ${integrity}\n`)

    expect(validateInstalledSkin(dir, skin)).toMatchObject({ ok: true, version: skin.install.version })
    atomicWriteText(join(dir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\npackages:\n  '${skin.package}@${skin.install.version}':\n    resolution:\n      integrity: sha512-other\n`)
    expect(validateInstalledSkin(dir, skin)).toMatchObject({ ok: false, reason: expect.stringContaining('integrity mismatch') })
  })

  it('keeps an existing pinned GitHub installation healthy when the catalog adds npm', () => {
    const dir = fixture()
    const base = loadCatalog().skins[0]
    const skin = {
      ...base,
      install: { ...base.install, npm: { name: base.package, version: base.install.version, integrity: 'sha512-reviewed', repository: base.repo, gitHead: base.install.commit } },
    }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    atomicWriteJson(join(dir, 'node_modules', ...skin.package.split('/'), 'package.json'), {
      name: skin.package, version: skin.install.version, dsh: { client: { platform: 'web' } },
    })

    expect(validateInstalledSkin(dir, skin)).toMatchObject({ ok: true, version: skin.install.version })
    expect(installedSpecMatches(skin, skin.install.target)).toBe(true)
    expect(runtimeState(dir, skin, skin.id, true, true)).toMatchObject({ installation: 'installed', activation: 'active', updateAvailable: false })
  })

  it.each(['github', 'npm'])('keeps an older %s installation updateable when a newer npm artifact is reviewed', source => {
    const dir = fixture()
    const base = loadCatalog().skins[0]
    const oldVersion = '0.0.0'
    const skin = {
      ...base,
      install: { ...base.install, npm: { name: base.package, version: base.install.version, integrity: 'sha512-reviewed', repository: base.repo, gitHead: base.install.commit } },
    }
    const spec = source === 'github' ? skin.install.target.replace(skin.install.commit, '0'.repeat(40)) : oldVersion
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: spec } })
    atomicWriteJson(join(dir, 'node_modules', ...skin.package.split('/'), 'package.json'), {
      name: skin.package, version: oldVersion, dsh: { client: { platform: 'web' } },
    })

    expect(runtimeState(dir, skin, skin.id, true, true)).toMatchObject({
      installation: 'installed', activation: 'active', installedVersion: oldVersion, updateAvailable: true,
    })
  })

  it.each(['version', 'repository'])('rejects an npm artifact with a mismatched %s despite matching integrity', field => {
    const dir = fixture()
    const base = loadCatalog().skins[0]
    const integrity = 'sha512-reviewed'
    const skin = {
      ...base,
      install: { ...base.install, npm: { name: base.package, version: base.install.version, integrity, repository: base.repo, gitHead: base.install.commit } },
    }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.version } })
    atomicWriteJson(join(dir, 'node_modules', ...skin.package.split('/'), 'package.json'), {
      name: skin.package,
      version: field === 'version' ? '0.0.0' : skin.install.version,
      repository: field === 'repository' ? 'https://github.com/another/skin' : skin.repo,
      dsh: { client: { platform: 'web' } },
    })
    atomicWriteText(join(dir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\npackages:\n  '${skin.package}@${skin.install.version}':\n    resolution:\n      integrity: ${integrity}\n`)

    expect(validateInstalledSkin(dir, skin)).toMatchObject({ ok: false, reason: expect.stringContaining(`${field} mismatch`) })
  })

  it.each([
    ['https://github.com/OWNER/THEME/', true],
    ['git+https://github.com/owner/theme.git', true],
    ['github:owner/theme', true],
    ['git://github.com/owner/theme.git', true],
    ['http://github.com/owner/theme', true],
    ['git@github.com:owner/theme.git', true],
    ['ssh://git@github.com/owner/theme.git', true],
    ['https://github.com.evil.test/Owner/Theme', false],
    ['https://example.test/github.com/Owner/Theme', false],
    ['https://github.com/Another/Theme', false],
  ])('uses the same GitHub identity rules as npm archive review for %s', (repository, accepted) => {
    const dir = fixture()
    const base = loadCatalog().skins[0]
    const integrity = 'sha512-reviewed'
    const skin = {
      ...base,
      repo: 'https://github.com/Owner/Theme',
      install: { ...base.install, npm: { name: base.package, version: base.install.version, integrity, repository: 'https://github.com/Owner/Theme', gitHead: base.install.commit } },
    }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.version } })
    atomicWriteJson(join(dir, 'node_modules', ...skin.package.split('/'), 'package.json'), {
      name: skin.package, version: skin.install.version, repository: { type: 'git', url: repository }, dsh: { client: { platform: 'web' } },
    })
    atomicWriteText(join(dir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\npackages:\n  '${skin.package}@${skin.install.version}':\n    resolution:\n      integrity: ${integrity}\n`)

    expect(validateInstalledSkin(dir, skin).ok).toBe(accepted)
  })

  it('detects a duplicate loader row before market registration', () => {
    const dir = fixture()
    const skin = loadCatalog().skins[0]
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { another: 'github:example/another#commit' } })
    atomicWriteText(profilePatchFile(dir), `- insert:\n    - id: ${skin.rowId}\n      name: another\n`)

    expect(() => assertNoLoaderConflicts(dir, skin)).toThrow(InstallConflictError)
    expect(() => assertNoLoaderConflicts(dir, skin)).toThrow(skin.rowId)
  })

  it('rejects a catalog row id that does not match the bundle-owned primary loader', () => {
    const dir = fixture()
    const base = loadCatalog().skins[0]
    const skin = { ...base, rowId: 'better-sidebar' }
    const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
    mkdirSync(packageDir, { recursive: true })
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    atomicWriteJson(join(packageDir, 'package.json'), {
      name: skin.package,
      version: skin.install.version,
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
    })
    atomicWriteText(join(packageDir, 'cordis.patch.yml'), `- insert:\n    - id: better-sidebar\n      name: dsh-better-sidebar\n    - id: actual-primary\n      name: ${JSON.stringify(skin.package)}\n`)

    expect(() => assertLoaderMetadata(dir, skin)).toThrow('市场目录元数据与包实际声明不一致')
    expect(() => assertNoLoaderConflicts(dir, skin)).toThrow('实际主 loader id=actual-primary')
  })

  it('reports the owner of a duplicate loader from an installed bundle', () => {
    const dir = fixture()
    const base = loadCatalog().skins[0]
    const skin = { ...base, package: '@example/incoming-loader', rowId: 'incoming-loader' }
    const other = '@example/existing-loader'
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [other]: 'file:/existing-loader' } })
    const otherDir = join(dir, 'node_modules', ...other.split('/'))
    mkdirSync(otherDir, { recursive: true })
    atomicWriteJson(join(otherDir, 'package.json'), {
      name: other,
      version: '1.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
    })
    atomicWriteText(join(otherDir, 'cordis.patch.yml'), `- insert:\n    - id: shared-loader\n      name: ${JSON.stringify(other)}\n`)
    const incomingDir = join(dir, 'node_modules', ...skin.package.split('/'))
    mkdirSync(incomingDir, { recursive: true })
    atomicWriteJson(join(incomingDir, 'package.json'), {
      name: skin.package,
      version: skin.install.version,
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
    })
    atomicWriteText(join(incomingDir, 'cordis.patch.yml'), `- insert:\n    - id: shared-loader\n      name: shared-loader-owner\n    - id: incoming-loader\n      name: ${JSON.stringify(skin.package)}\n`)

    expect(() => assertNoLoaderConflicts(dir, skin)).toThrow('shared-loader')
    expect(() => assertNoLoaderConflicts(dir, skin)).toThrow(other)
  })

  it('removes an inactive bundle from the stack and restores it without duplicating its row', () => {
    const dir = fixture()
    const skin = loadCatalog().skins[0]
    const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
    mkdirSync(packageDir, { recursive: true })
    atomicWriteJson(join(dir, 'package.json'), {
      dependencies: { [skin.package]: skin.install.target },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-skin-market'] } },
    })
    atomicWriteJson(join(packageDir, 'package.json'), {
      name: skin.package,
      version: skin.install.version,
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
    })
    atomicWriteText(join(packageDir, 'cordis.patch.yml'), `- insert:\n    - id: ${skin.rowId}\n      name: ${skin.package}\n      marker: bundle-owned\n`)
    atomicWriteText(profilePatchFile(dir), `- insert:\n    - id: ${skin.rowId}\n      name: ${JSON.stringify(skin.package)}\n`)

    ensureSkinRegistration(dir, skin, true)

    const bundlePatch = parse(readFileSync(join(packageDir, 'cordis.patch.yml'), 'utf8')) as Array<Record<string, unknown>>
    const profilePatch = parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<Record<string, unknown>>
    const inserted = bundlePatch.flatMap(operation => Array.isArray(operation.insert) ? operation.insert as Array<Record<string, unknown>> : [])
    const overrides = profilePatch.filter(operation => operation.id === skin.rowId)
    expect(inserted).toHaveLength(1)
    expect(overrides).toEqual([])
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dsh.profile.bundles).not.toContain(skin.package)

    ensureSkinRegistration(dir, skin, false)
    const enabledPatch = parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<Record<string, unknown>>
    expect(enabledPatch.filter(operation => operation.id === skin.rowId)).toEqual([])
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dsh.profile.bundles).toContain(skin.package)
    removeSkinRegistration(dir, skin)
    const removedPatch = parse(readFileSync(profilePatchFile(dir), 'utf8')) as unknown[]
    expect(removedPatch).toEqual([])
  })

  it('registers and validates a client-only skin idempotently', () => {
    const dir = fixture()
    const skin = loadCatalog().skins.find(item => item.id === 'wyh66666666.dsh-transparent-ui-plugin')!
    const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
    mkdirSync(packageDir, { recursive: true })
    atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { client: { platform: 'web' } } })
    atomicWriteText(profilePatchFile(dir), '- insert:\n    - id: keep-me\n      name: existing-plugin\n')

    expect(validateInstalledSkin(dir, skin)).toMatchObject({ ok: true, version: skin.install.version })
    ensureSkinRegistration(dir, skin)
    ensureSkinRegistration(dir, skin)

    const installed = parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<{ insert?: Array<{ id: string; name: string; disabled?: boolean }> }>
    const rows = installed.flatMap(operation => operation.insert ?? [])
    expect(rows.filter(row => row.id === skin.rowId)).toEqual([{ id: skin.rowId, name: skin.package, disabled: true }])
    expect(rows.some(row => row.id === 'keep-me')).toBe(true)

    removeSkinRegistration(dir, skin)
    const removed = parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<{ insert?: Array<{ id: string }> }>
    expect(removed.flatMap(operation => operation.insert ?? []).map(row => row.id)).toEqual(['keep-me'])
  })

  it('merges an exact immutable build approval without allowing other packages', () => {
    const dir = fixture()
    atomicWriteText(pnpmWorkspaceFile(dir), 'packages:\n  - .\nallowBuilds:\n  esbuild: false\n')
    const key = 'dskin@https://codeload.github.com/dancingmemory/dskin/tar.gz/f24cf34bd21d23845a8b9bdaf3dbf46d01a952ed'
    ensureBuildAllowed(dir, key)
    const workspace = parse(readFileSync(pnpmWorkspaceFile(dir), 'utf8')) as { allowBuilds: Record<string, boolean> }
    expect(workspace.allowBuilds).toEqual({ esbuild: false, [key]: true })
  })

  it('removes all compatibility patches for a package without touching other packages', () => {
    const dir = fixture()
    const skinPatch = compatibilityPatchFile(dir, '@example/skin', '1.0.0')
    const otherPatch = compatibilityPatchFile(dir, '@example/other', '1.0.0')
    atomicWriteText(skinPatch, 'skin patch')
    atomicWriteText(otherPatch, 'other patch')
    ensurePatchedDependency(dir, '@example/skin', '1.0.0', '.dsh-skin-market/patches/_example_skin_1.0.0.patch')
    ensurePatchedDependency(dir, '@example/other', '1.0.0', '.dsh-skin-market/patches/_example_other_1.0.0.patch')
    atomicWriteText(join(dir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\npatchedDependencies:\n  '@example/skin@1.0.0': skin-hash\n  '@example/other@1.0.0': other-hash\n`)

    removeCompatibilityPatches(dir, '@example/skin')

    expect(readFileSync(pnpmWorkspaceFile(dir), 'utf8')).not.toContain('@example/skin@1.0.0')
    expect(readFileSync(pnpmWorkspaceFile(dir), 'utf8')).toContain('@example/other@1.0.0')
    expect(readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')).not.toContain('@example/skin@1.0.0')
    expect(readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')).toContain('@example/other@1.0.0')
    expect(() => readFileSync(skinPatch, 'utf8')).toThrow()
    expect(readFileSync(otherPatch, 'utf8')).toBe('other patch')
  })

  it('detects patched dependency drift and accepts pnpm lockfile hashes', () => {
    const dir = fixture()
    const patchFile = compatibilityPatchFile(dir, '@example/skin', '1.0.0')
    atomicWriteText(patchFile, 'skin patch\n')
    ensurePatchedDependency(dir, '@example/skin', '1.0.0', '.dsh-skin-market/patches/_example_skin_1.0.0.patch')

    expect(patchedDependenciesNeedSync(dir)).toBe(true)

    const hash = createHash('sha256').update('skin patch\n').digest('hex')
    atomicWriteText(join(dir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\npatchedDependencies:\n  '@example/skin@1.0.0': ${hash}\n`)

    expect(patchedDependenciesNeedSync(dir)).toBe(false)
  })

  it('derives pnpm build approval keys with a monorepo package subpath', () => {
    expect(effectiveBuildApprovalKey({
      subpath: 'packages/dsh-web-ui-all',
      install: { allowBuild: '@scope/package@https://codeload.github.com/example/repo/tar.gz/0123456789abcdef0123456789abcdef01234567' },
    })).toBe('@scope/package@https://codeload.github.com/example/repo/tar.gz/0123456789abcdef0123456789abcdef01234567#path:packages/dsh-web-ui-all')
    expect(effectiveBuildApprovalKey({
      subpath: 'packages/dsh-web-ui-all',
      install: { allowBuild: '@scope/package@https://codeload.github.com/example/repo/tar.gz/0123456789abcdef0123456789abcdef01234567#path:old' },
    })).toBe('@scope/package@https://codeload.github.com/example/repo/tar.gz/0123456789abcdef0123456789abcdef01234567#path:packages/dsh-web-ui-all')
    expect(buildApprovalKeyForTarget({
      install: { allowBuild: '@scope/package@https://codeload.github.com/example/repo/tar.gz/0123456789abcdef0123456789abcdef01234567#path:old' },
    }, 'github:example/repo#0123456789abcdef0123456789abcdef01234567&path:/packages/dsh-web-ui-all')).toBe('@scope/package@https://codeload.github.com/example/repo/tar.gz/0123456789abcdef0123456789abcdef01234567#path:/packages/dsh-web-ui-all')
  })

  it('rejects a materialized package that does not match the reviewed package', () => {
    const dir = fixture()
    const skin = loadCatalog().skins.find(item => item.id === 'wyh66666666.dsh-transparent-ui-plugin')!
    const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
    mkdirSync(packageDir, { recursive: true })
    atomicWriteJson(join(packageDir, 'package.json'), {
      name: 'different-package',
      version: skin.install.version,
      dsh: { client: { platform: 'web' } },
    })

    expect(validateInstalledSkin(dir, skin)).toEqual({
      ok: false,
      reason: `installed package name mismatch; expected ${skin.package}, found different-package`,
    })
  })

  it('explains &path: truncation when the reviewed subdirectory package is missing', () => {
    const dir = fixture()
    const commit = 'c'.repeat(40)
    const skin = {
      ...loadCatalog().skins[0],
      package: '@scope/subdir-skin',
      install: {
        target: `github:example/monorepo#${commit}&path:/packages/skin`,
        version: '1.0.0',
        commit,
      },
    }
    const wrongDir = join(dir, 'node_modules', 'monorepo-root')
    mkdirSync(wrongDir, { recursive: true })
    atomicWriteJson(join(wrongDir, 'package.json'), { name: 'monorepo-root', version: '9.9.9', dsh: { client: { platform: 'web' } } })

    const result = validateInstalledSkin(dir, skin)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('manifest missing')
    expect(result.reason).toContain('&path:')
    expect(result.reason).toContain('截断')
    expect(result.reason).not.toContain('请用市场一键安装')
  })

  it('reports a broken bundle patch before registration mutates the profile', () => {
    const dir = fixture()
    const skin = loadCatalog().skins[0]
    const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
    mkdirSync(packageDir, { recursive: true })
    atomicWriteJson(join(packageDir, 'package.json'), {
      name: skin.package,
      version: skin.install.version,
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
    })

    expect(validateInstalledSkin(dir, skin)).toEqual({
      ok: false,
      reason: `${skin.package} bundle patch is missing: ./cordis.patch.yml`,
    })
  })

  it('requires the installed dependency spec to contain the reviewed immutable target', () => {
    const skin = loadCatalog().skins.find(item => item.id === 'wyh66666666.dsh-transparent-ui-plugin')!
    expect(installedSpecMatches(skin, skin.install.target)).toBe(true)
    expect(installedSpecMatches(skin, 'github:someone/else#0000000000000000000000000000000000000000')).toBe(false)
    expect(installedSpecMatches(skin, undefined)).toBe(false)
  })

  it.each(['npm', 'desktop'])('matches exact %s package specs without accepting version substrings or another source', source => {
    const base = loadCatalog().skins[0]
    const version = '1.2.3'
    const skin = {
      ...base,
      install: {
        ...base.install,
        npm: source === 'npm' ? { name: base.package, version, integrity: 'sha512-reviewed', repository: base.repo, gitHead: base.install.commit } : undefined,
        desktop: source === 'desktop' ? { mode: 'managed' as const, registry: 'npm' as const, packageName: base.package, packageVersion: version } : undefined,
      },
    }

    for (const spec of [version, `${skin.package}@${version}`, `npm:${skin.package}@${version}`, skin.install.target]) {
      expect(installedSpecMatches(skin, spec), spec).toBe(true)
    }
    for (const spec of [
      '11.2.3', '1.2.30', '1.2.3-beta.1', '^1.2.3', '~1.2.3',
      `npm:another-package@${version}`, `another-package@${version}`,
      `file:/tmp/skin-${version}`, `https://example.com/skin-${version}.tgz`, `github:another/skin#v${version}`,
    ]) {
      expect(installedSpecMatches(skin, spec), spec).toBe(false)
    }
  })

  it('discovers installed client plugins that are not in the market catalog', () => {
    const dir = fixture()
    const packageName = 'my-private-theme'
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [packageName]: 'file:/plugins/my-private-theme' } })
    const packageDir = join(dir, 'node_modules', packageName)
    mkdirSync(packageDir, { recursive: true })
    atomicWriteJson(join(packageDir, 'package.json'), { name: packageName, version: '2.0.0', dsh: { client: { platform: 'web' } } })
    atomicWriteText(profilePatchFile(dir), `- insert:\n    - id: private-theme\n      name: ${packageName}\n`)
    expect(installedClientPlugins(dir, loadCatalog().skins)).toEqual([{
      package: packageName, version: '2.0.0', spec: 'file:/plugins/my-private-theme', rowIds: ['private-theme'], registered: true,
    }])
  })
})
