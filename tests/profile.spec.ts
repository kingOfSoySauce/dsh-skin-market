import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { buildApprovalKeyForTarget, effectiveBuildApprovalKey } from '../src/build-approval.ts'
import { assertLoaderMetadata, assertNoLoaderConflicts, atomicWriteJson, atomicWriteText, compatibilityPatchFile, ensureBuildAllowed, ensurePatchedDependency, ensureSkinRegistration, InstallConflictError, installedClientPlugins, installedSpecMatches, patchedDependenciesNeedSync, pnpmWorkspaceFile, profilePatchFile, readMarketState, removeCompatibilityPatches, removeProfileBundles, removeSkinRegistration, runtimeState, validateInstalledSkin, writeMarketState } from '../src/profile.ts'
import { loadCatalog } from '../src/catalog.ts'

function fixture() { return mkdtempSync(join(tmpdir(), 'skin-profile-')) }

describe('profile state', () => {
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
