import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { loadCatalog } from '../src/catalog.ts'
import { acknowledgeSkinArtifactRisk, assertNoKnownLoaderConflicts, assertNoLoaderConflicts, atomicWriteJson, atomicWriteText, desktopLegacyReplacementEnabled, inspectSkinArtifactRisk, InstallConflictError, installedLoaderIdentities, packageDir, profilePatchFile, validateDesktopArtifact, validateInstalledSkin, verifiedDesktopLegacyPackages } from '../src/profile.ts'

const directories: string[] = []
const legacyPackage = 'dsh-client-liang-intensity-skin'

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const skin = structuredClone(loadCatalog().skins.find(item => item.id === 'king-of-soy-sauce.liang-intensity')!)
  // This suite verifies Desktop artifact and predecessor rules, not the
  // registry's current npm/prerelease capability decision.
  delete skin.install.npm
  skin.install.desktop = {
    mode: 'managed',
    registry: 'npm',
    packageName: skin.package,
    packageVersion: skin.install.version,
    integrity: 'sha512-ZHVtbXktZml4dHVyZS1hcnRpZmFjdA==',
  }
  const directory = mkdtempSync(join(tmpdir(), 'dsh-desktop-profile-aliases-'))
  directories.push(directory)
  const dependencies: Record<string, string> = { [skin.package]: skin.install.version, [legacyPackage]: 'link:/fixture/dsh-liang-skin' }
  const saveProfile = () => atomicWriteJson(join(directory, 'package.json'), { dependencies })
  const legacyManifest = {
    name: legacyPackage, version: '0.1.8', repository: { type: 'git', url: 'git+https://github.com/kingOfSoySauce/dsh-liang-skin.git' },
    dsh: { client: { platform: 'web' }, bundle: { patch: './cordis.patch.yml' } },
  }
  const saveLegacy = (manifest: unknown = legacyManifest, rows = [{ id: skin.rowId, name: legacyPackage }]) => {
    atomicWriteJson(join(packageDir(directory, legacyPackage), 'package.json'), manifest)
    atomicWriteText(join(packageDir(directory, legacyPackage), 'cordis.patch.yml'), stringify([{ insert: rows }]))
  }
  saveProfile()
  saveLegacy()
  atomicWriteJson(join(packageDir(directory, skin.package), 'package.json'), {
    name: skin.package, version: skin.install.version, repository: skin.repo,
    exports: { './client': './client.js' },
    dsh: { client: { platform: 'web' }, bundle: { patch: './cordis.patch.yml' } },
  })
  atomicWriteText(join(packageDir(directory, skin.package), 'client.js'), 'export const source = "reviewed current package"\n')
  atomicWriteText(join(packageDir(directory, skin.package), 'cordis.patch.yml'), stringify([{ insert: [{ id: skin.rowId, name: skin.package }] }]))
  atomicWriteText(join(directory, 'pnpm-lock.yaml'), stringify({
    lockfileVersion: '9.0',
    importers: { '.': { dependencies: { [skin.package]: { specifier: skin.install.version, version: skin.install.version } } } },
    packages: { [`${skin.package}@${skin.install.version}`]: { resolution: { integrity: 'sha512-unreviewed' } } },
  }))
  const assertDesktop = () => assertNoLoaderConflicts(directory, skin, undefined, { hostKind: 'desktop' })
  return { skin, directory, dependencies, legacyManifest, saveProfile, saveLegacy, assertDesktop }
}

describe('reviewed Desktop predecessor bundles', () => {
  it('allows the reviewed predecessor root to coexist with its current package on Desktop', () => {
    const host = fixture()

    expect(verifiedDesktopLegacyPackages(host.directory, host.skin)).toEqual([legacyPackage])
    expect(host.assertDesktop).not.toThrow()
    expect(() => assertNoKnownLoaderConflicts(host.directory, host.skin, [{ id: host.skin.rowId, name: host.skin.package, packageName: host.skin.package }], { hostKind: 'desktop' })).not.toThrow()
    expect(installedLoaderIdentities(host.directory, host.skin.package)).toContainEqual({ id: host.skin.rowId, name: legacyPackage, packageName: legacyPackage })
  })

  it('keeps the original conflict policy for Web and unspecified hosts', () => {
    const host = fixture()

    expect(() => assertNoLoaderConflicts(host.directory, host.skin)).toThrow(InstallConflictError)
    expect(() => assertNoLoaderConflicts(host.directory, host.skin, undefined, { hostKind: 'dsh' })).toThrow(InstallConflictError)
  })

  it.each(['id', 'package', 'repo', 'rowId'] as const)('binds the predecessor mapping to the reviewed skin %s', field => {
    const host = fixture()
    const changed = { ...host.skin, [field]: field === 'repo' ? 'https://github.com/unrelated/repository' : 'unreviewed-identity' }

    expect(verifiedDesktopLegacyPackages(host.directory, changed)).toEqual([])
  })

  it('does not infer ownership from a matching row and repository on an unknown package', () => {
    const host = fixture()
    const unknown = 'another-liang-skin'
    delete host.dependencies[legacyPackage]
    host.dependencies[unknown] = '1.0.0'
    host.saveProfile()
    atomicWriteJson(join(packageDir(host.directory, unknown), 'package.json'), { ...host.legacyManifest, name: unknown })
    atomicWriteText(join(packageDir(host.directory, unknown), 'cordis.patch.yml'), stringify([{ insert: [{ id: host.skin.rowId, name: unknown }] }]))

    expect(verifiedDesktopLegacyPackages(host.directory, host.skin)).toEqual([])
    expect(host.assertDesktop).toThrow(unknown)
  })

  it.each(['name', 'repository', 'missing repository', 'additional row', 'different row owner'] as const)('rejects an unverified predecessor %s', fault => {
    const host = fixture()
    if (fault === 'name') host.saveLegacy({ ...host.legacyManifest, name: 'another-package' })
    if (fault === 'repository') host.saveLegacy({ ...host.legacyManifest, repository: 'https://github.com/another/repository' })
    if (fault === 'missing repository') host.saveLegacy({ ...host.legacyManifest, repository: undefined })
    if (fault === 'additional row') host.saveLegacy(host.legacyManifest, [{ id: host.skin.rowId, name: legacyPackage }, { id: 'another-row', name: 'another-module' }])
    if (fault === 'different row owner') host.saveLegacy(host.legacyManifest, [{ id: host.skin.rowId, name: 'another-module' }])

    expect(verifiedDesktopLegacyPackages(host.directory, host.skin)).toEqual([])
    expect(host.assertDesktop).toThrow(InstallConflictError)
  })

  it('accepts configuration and the saved enabled flag belonging to the predecessor itself', () => {
    const host = fixture()
    atomicWriteText(join(packageDir(host.directory, legacyPackage), 'cordis.patch.yml'), stringify([{ insert: [{
      id: host.skin.rowId, name: legacyPackage, disabled: false, config: { intensity: 0.5, insert: 'plugin configuration only' },
    }] }]))

    expect(verifiedDesktopLegacyPackages(host.directory, host.skin)).toEqual([legacyPackage])
    expect(host.assertDesktop).not.toThrow()
  })

  it.each(['override operation', 'remove operation', 'insert target', 'insert remove', 'nested insert', 'unknown row option'] as const)('rejects a predecessor bundle with an additional %s', fault => {
    const host = fixture()
    const row = { id: host.skin.rowId, name: legacyPackage }
    const operations: unknown[] = [{ insert: [row] }]
    if (fault === 'override operation') operations.push({ id: 'another-plugin', disabled: true })
    if (fault === 'remove operation') operations.push({ id: 'another-plugin', remove: true })
    if (fault === 'insert target') operations[0] = { id: 'another-plugin', insert: [row] }
    if (fault === 'insert remove') operations[0] = { insert: [row], remove: ['another-plugin'] }
    if (fault === 'nested insert') operations[0] = { insert: [{ ...row, insert: [] }] }
    if (fault === 'unknown row option') operations[0] = { insert: [{ ...row, remove: true }] }
    atomicWriteText(join(packageDir(host.directory, legacyPackage), 'cordis.patch.yml'), stringify(operations))

    expect(verifiedDesktopLegacyPackages(host.directory, host.skin)).toEqual([])
    expect(host.assertDesktop).toThrow(InstallConflictError)
  })

  it('only recognizes direct profile dependencies as predecessors', () => {
    const host = fixture()
    delete host.dependencies[legacyPackage]
    host.saveProfile()

    expect(verifiedDesktopLegacyPackages(host.directory, host.skin)).toEqual([])
  })

  it('does not suppress a user-owned profile insert using the predecessor package', () => {
    const host = fixture()
    atomicWriteText(profilePatchFile(host.directory), stringify([{ insert: [{ id: host.skin.rowId, name: legacyPackage }] }]))

    expect(verifiedDesktopLegacyPackages(host.directory, host.skin)).toEqual([legacyPackage])
    expect(host.assertDesktop).toThrow(InstallConflictError)
  })

  it('retains predecessor rows introduced through another dependency', () => {
    const host = fixture()
    host.dependencies['another-plugin'] = '1.0.0'
    host.saveProfile()
    atomicWriteJson(join(packageDir(host.directory, 'another-plugin'), 'package.json'), { name: 'another-plugin', dependencies: { [legacyPackage]: '0.1.8' } })

    expect(verifiedDesktopLegacyPackages(host.directory, host.skin)).toEqual([legacyPackage])
    expect(host.assertDesktop).toThrow(InstallConflictError)
    expect(installedLoaderIdentities(host.directory, host.skin.package, [legacyPackage])).toContainEqual({ id: host.skin.rowId, name: legacyPackage, packageName: legacyPackage })
  })

  it('keeps exact artifact risk confirmation available while a reviewed predecessor is retained', () => {
    const host = fixture()
    const risk = inspectSkinArtifactRisk(host.directory, host.skin, 'desktop')

    expect(risk).toMatchObject({ packageName: host.skin.package, version: host.skin.install.version })
    expect(validateInstalledSkin(host.directory, host.skin, { hostKind: 'desktop' }).ok).toBe(false)
    expect(validateInstalledSkin(host.directory, host.skin, { hostKind: 'desktop', allowArtifactRisk: true }).ok).toBe(true)
    expect(acknowledgeSkinArtifactRisk(host.directory, host.skin, risk!.context, 'desktop')).toBe(true)
    expect(validateInstalledSkin(host.directory, host.skin, { hostKind: 'desktop' }).ok).toBe(true)
    expect(validateDesktopArtifact(host.directory, host.skin)).toMatchObject({ ok: true, integrityVerified: false })

    atomicWriteText(profilePatchFile(host.directory), stringify([{ insert: [{ id: host.skin.rowId, name: 'unknown-component' }] }]))
    expect(inspectSkinArtifactRisk(host.directory, host.skin, 'desktop')).toBeUndefined()
  })
})

describe('Desktop replacement component saved defaults', () => {
  it.each([undefined, false])('accepts a sole target component with disabled=%s', disabled => {
    const host = fixture()
    atomicWriteText(join(packageDir(host.directory, host.skin.package), 'cordis.patch.yml'), stringify([{ insert: [{
      id: host.skin.rowId, name: host.skin.package, ...(disabled === undefined ? {} : { disabled }), config: { intensity: 0.7 },
    }] }]))

    expect(desktopLegacyReplacementEnabled(host.directory, host.skin)).toBe(true)
  })

  it('requires a verified retained predecessor', () => {
    const host = fixture()
    host.saveLegacy({ ...host.legacyManifest, repository: 'https://github.com/another/repository' })

    expect(desktopLegacyReplacementEnabled(host.directory, host.skin)).toBe(false)
  })

  it.each(['disabled', 'non-boolean disabled', 'group row', 'group option', 'extra operation', 'wrong row identity'] as const)('rejects a target with %s', fault => {
    const host = fixture()
    const row = { id: host.skin.rowId, name: host.skin.package }
    const operations: unknown[] = [{ insert: [row] }]
    if (fault === 'disabled') operations[0] = { insert: [{ ...row, disabled: true }] }
    if (fault === 'non-boolean disabled') operations[0] = { insert: [{ ...row, disabled: 'false' }] }
    if (fault === 'group row') operations[0] = { insert: [{ id: 'another-group', disabled: true, insert: [row] }] }
    if (fault === 'group option') operations[0] = { insert: [{ ...row, group: 'another-group' }] }
    if (fault === 'extra operation') operations.push({ id: host.skin.rowId, disabled: true })
    if (fault === 'wrong row identity') operations[0] = { insert: [{ ...row, id: 'another-row' }] }
    atomicWriteText(join(packageDir(host.directory, host.skin.package), 'cordis.patch.yml'), stringify(operations))

    expect(desktopLegacyReplacementEnabled(host.directory, host.skin)).toBe(false)
  })

  it.each([true, false])('rejects a profile override of the target, including disabled=%s', disabled => {
    const host = fixture()
    atomicWriteText(profilePatchFile(host.directory), stringify([{ id: host.skin.rowId, disabled }]))

    expect(desktopLegacyReplacementEnabled(host.directory, host.skin)).toBe(false)
  })

  it('ignores an unrelated profile override', () => {
    const host = fixture()
    atomicWriteText(profilePatchFile(host.directory), stringify([{ id: 'another-row', disabled: true }]))

    expect(desktopLegacyReplacementEnabled(host.directory, host.skin)).toBe(true)
  })

  it.each(['insert', 'group config', 'nested group config'] as const)('rejects a structural target collision in %s', shape => {
    const host = fixture()
    const row = { id: host.skin.rowId, disabled: true }
    const operations = shape === 'insert' ? [{ insert: [{ id: 'another-group', insert: [row] }] }]
      : shape === 'group config' ? [{ id: 'another-group', group: true, config: [row] }]
        : [{ id: 'outer-group', group: true, config: [{ id: 'inner-group', group: true, config: [row] }] }]
    atomicWriteText(profilePatchFile(host.directory), stringify(operations))

    expect(desktopLegacyReplacementEnabled(host.directory, host.skin)).toBe(false)
  })

  it('ignores a group child that names the target package without a loader id', () => {
    const host = fixture()
    const operations = [{ id: 'outer-group', group: true, config: [{ name: host.skin.package, disabled: true }] }]
    atomicWriteText(profilePatchFile(host.directory), stringify(operations))

    expect(desktopLegacyReplacementEnabled(host.directory, host.skin)).toBe(true)
  })

  it.each([undefined, false])('does not interpret ordinary plugin config as loader rows when group=%s', group => {
    const host = fixture()
    atomicWriteText(profilePatchFile(host.directory), stringify([{ id: 'another-plugin', ...(group === undefined ? {} : { group }), config: [{ id: host.skin.rowId, name: host.skin.package, disabled: true }] }]))

    expect(desktopLegacyReplacementEnabled(host.directory, host.skin)).toBe(true)
  })
})
