import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { atomicWriteJson, atomicWriteText, npmSourceMigration, packageDir, profilePatchFile, snapshotInstalledArtifact } from '../src/profile.ts'
import type { SkinEntry } from '../src/types.ts'
import { catalogFixtureSkin } from './fixtures/catalog.ts'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function fixture(currentSource = 'file:/tmp/local-skin-1.1.0-compat.2.tgz', currentVersion = '1.1.0-compat.2') {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-local-source-migration-'))
  directories.push(directory)
  const commit = 'a'.repeat(40)
  const skin: SkinEntry = {
    ...catalogFixtureSkin(), id: 'local-source.skin', package: '@example/local-source-skin', rowId: 'local-source-skin',
    repo: 'https://github.com/example/local-source-skin', subpath: undefined,
    review: { installation: 'verified', compatibility: 'verified', preview: 'verified' },
    install: {
      target: `github:example/local-source-skin#${commit}`, version: '1.0.0', commit,
      npm: { name: '@example/local-source-skin', version: '1.0.0', repository: 'https://github.com/example/local-source-skin', gitHead: commit, integrity: 'sha512-cmV2aWV3ZWQ=' },
    },
  }
  const installedDirectory = packageDir(directory, skin.package)
  const manifest = {
    name: skin.package, version: currentVersion, repository: { type: 'git', url: 'git+https://github.com/Example/local-source-skin.git' },
    exports: { './client': './client.js' }, dsh: { client: { platform: 'web' }, bundle: { patch: './cordis.patch.yml' } },
  }
  const saveSource = (source: string) => atomicWriteJson(join(directory, 'package.json'), { dependencies: { [skin.package]: source }, dsh: { profile: { bundles: [skin.package] } } })
  const saveManifest = (value: unknown = manifest) => atomicWriteJson(join(installedDirectory, 'package.json'), value)
  saveSource(currentSource)
  saveManifest()
  atomicWriteText(join(installedDirectory, 'client.js'), 'export const version = "local custom source"\n')
  atomicWriteText(join(installedDirectory, 'cordis.patch.yml'), stringify([{ insert: [{ id: skin.rowId, name: skin.package }] }]))
  atomicWriteText(join(directory, 'pnpm-lock.yaml'), stringify({
    lockfileVersion: '9.0',
    importers: { '.': { dependencies: { [skin.package]: { specifier: currentSource, version: currentSource } } } },
    packages: { [`${skin.package}@${currentVersion}`]: { resolution: { integrity: 'sha512-local', tarball: currentSource } } },
  }))
  const migration = () => npmSourceMigration(directory, skin)
  return { directory, installedDirectory, skin, manifest, saveManifest, saveSource, migration }
}

describe('explicit local source replacement with reviewed npm', () => {
  it.each([
    'file:/tmp/local-skin.tgz', 'file:../local-skin.tgz', 'link:/tmp/local-skin', 'link:../local-skin',
    '/tmp/local-skin', './local-skin', '../local-skin', '~/local-skin', 'C:\\local-skin',
  ])('offers a verified same-repository replacement for %s', source => {
    const host = fixture(source)

    expect(host.migration()).toEqual({
      target: `${host.skin.package}@1.0.0`, currentSource: source, kind: 'local', currentVersion: '1.1.0-compat.2',
      targetVersion: '1.0.0', context: expect.stringMatching(/^[a-f0-9]{64}$/), downgrade: true,
    })
  })

  it.each(['https://example.test/local-skin.tgz', 'git+https://github.com/example/local-source-skin.git', 'workspace:*', 'portal:/tmp/local-skin', 'example/local-skin', 'latest', 'file:', 'link:', 'file:https://example.test/local-skin.tgz'])('does not treat %s as a local source', source => {
    expect(fixture(source).migration()).toBeUndefined()
  })

  it.each(['wrong name', 'wrong repository', 'missing repository', 'missing client export', 'missing executable', 'loader conflict', 'unverified review', 'invalid npm source', 'companions'] as const)('does not offer replacement with %s', fault => {
    const host = fixture()
    if (fault === 'wrong name') host.saveManifest({ ...host.manifest, name: 'another-package' })
    if (fault === 'wrong repository') host.saveManifest({ ...host.manifest, repository: 'https://github.com/another/local-source-skin' })
    if (fault === 'missing repository') host.saveManifest({ ...host.manifest, repository: undefined })
    if (fault === 'missing client export') host.saveManifest({ ...host.manifest, exports: undefined })
    if (fault === 'missing executable') rmSync(join(host.installedDirectory, 'client.js'))
    if (fault === 'loader conflict') atomicWriteText(profilePatchFile(host.directory), stringify([{ insert: [{ id: host.skin.rowId, name: 'another-package' }] }]))
    if (fault === 'unverified review') delete host.skin.review
    if (fault === 'invalid npm source') host.skin.install.npm!.integrity = ''
    if (fault === 'companions') host.skin.install.companions = [{ package: 'companion', rowId: 'companion', version: '1.0.0', commit: 'b'.repeat(40), target: `github:example/companion#${'b'.repeat(40)}` }]

    expect(host.migration()).toBeUndefined()
  })

  it('rejects an unsafe bundle declaration before considering source replacement', () => {
    const host = fixture()
    host.saveManifest({ ...host.manifest, dsh: { ...host.manifest.dsh, bundle: { patch: './.env' } } })

    expect(snapshotInstalledArtifact(host.directory, host.skin.package).ok).toBe(false)
    expect(host.migration()).toBeUndefined()
  })

  it.each(['source', 'client bytes', 'bundle bytes', 'lockfile', 'catalog version', 'client declaration', 'compatibility'] as const)('invalidates the displayed context after %s changes', changed => {
    const host = fixture()
    const before = host.migration()
    expect(before?.kind).toBe('local')
    if (changed === 'source') host.saveSource('link:/tmp/another-local-location')
    if (changed === 'client bytes') atomicWriteText(join(host.installedDirectory, 'client.js'), 'export const version = "modified source"\n')
    if (changed === 'bundle bytes') atomicWriteText(join(host.installedDirectory, 'cordis.patch.yml'), stringify([{ insert: [{ id: host.skin.rowId, name: host.skin.package, config: { intensity: 0.4 } }] }]))
    if (changed === 'lockfile') atomicWriteText(join(host.directory, 'pnpm-lock.yaml'), `${readFileSync(join(host.directory, 'pnpm-lock.yaml'), 'utf8')}# changed after confirmation\n`)
    if (changed === 'catalog version') {
      host.skin.install.version = '1.0.1'
      host.skin.install.npm!.version = '1.0.1'
    }
    if (changed === 'client declaration') host.saveManifest({ ...host.manifest, dsh: { ...host.manifest.dsh, client: { platform: 'web', inject: ['another-service'] } } })
    if (changed === 'compatibility') host.skin.compatibility = { ...host.skin.compatibility, dsh: '^9.0.0' }
    const after = host.migration()

    expect(after?.kind).toBe('local')
    if (before?.kind !== 'local' || after?.kind !== 'local') throw new Error('expected eligible local migrations')
    expect(after.context).not.toBe(before.context)
  })

  it.each([
    ['0.9.0', false], ['1.0.0', false], ['1.0.0-compat.2', false], ['1.0.1', true], ['1.1.0-compat.2', true],
  ] as const)('reports current version %s as downgrade=%s', (currentVersion, downgrade) => {
    expect(fixture(undefined, currentVersion).migration()).toMatchObject({ kind: 'local', downgrade })
  })

  it.each(['not-a-version', '1.0', '01.0.0', '1.0.0-01', '1.0.0-compat..2', '1.0.0+invalid..build'])('does not compare an invalid installed version %s', currentVersion => {
    expect(fixture(undefined, currentVersion).migration()).toBeUndefined()
  })

  it('does not compare an invalid catalog version', () => {
    const host = fixture()
    host.skin.install.version = 'not-a-version'
    host.skin.install.npm!.version = 'not-a-version'

    expect(host.migration()).toBeUndefined()
  })

  it('preserves the existing GitHub same-release response shape', () => {
    const host = fixture(undefined, '1.0.0')
    host.saveSource(host.skin.install.target)

    expect(host.migration()).toEqual({ target: `${host.skin.package}@1.0.0`, currentSource: host.skin.install.target })
  })

  it('does not mutate local files when inspecting replacement eligibility', () => {
    const host = fixture()
    const files = [join(host.directory, 'package.json'), join(host.directory, 'pnpm-lock.yaml'), join(host.installedDirectory, 'package.json'), join(host.installedDirectory, 'client.js'), join(host.installedDirectory, 'cordis.patch.yml')]
    const before = files.map(file => readFileSync(file, 'utf8'))

    expect(snapshotInstalledArtifact(host.directory, host.skin.package).ok).toBe(true)
    expect(host.migration()?.kind).toBe('local')
    expect(files.map(file => readFileSync(file, 'utf8'))).toEqual(before)
  })
})
