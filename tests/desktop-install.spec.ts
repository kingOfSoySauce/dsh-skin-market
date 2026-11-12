import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { desktopGithubInstallPlan, desktopInstallationWarning, desktopInstallPlan } from '../src/desktop-install.ts'
import { atomicWriteJson, atomicWriteText, compareInstalledArtifact, packageDir, reviewedInstalledSpecMatches, snapshotInstalledArtifact, validateDesktopArtifact } from '../src/profile.ts'
import type { SkinEntry } from '../src/types.ts'
import { catalogFixtureSkin } from './fixtures/catalog.ts'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

function skin(subpath?: string): SkinEntry {
  const base = catalogFixtureSkin()
  const commit = 'a'.repeat(40)
  return { ...base, id: 'fixture.github', package: '@fixture/skin', rowId: 'github-fixture', repo: 'https://github.com/Fixture/Skin', subpath,
    review: { compatibility: 'verified', preview: 'verified', installation: 'verified' },
    install: { target: `github:Fixture/Skin#${commit}${subpath === undefined ? '' : `&path:/${subpath}`}`, commit, version: '1.0.0', desktop: { mode: 'manual-only', reason: 'npm-package-not-found' } },
  }
}

describe('official Desktop install planning', () => {
  it.each([undefined, 'packages/skin'])('allows reviewed canonical GitHub %s through the official manager only', path => {
    const item = skin(path)
    expect(desktopInstallPlan(item, true)).toEqual({ kind: 'github', target: item.install.target })
    expect(desktopInstallPlan(item, false).kind).toBe('manual')
  })

  it('retains managed npm as the default while keeping a separate pinned GitHub update target', () => {
    const item = skin('packages/skin')
    item.install.desktop = { mode: 'managed', registry: 'npm', packageName: item.package, packageVersion: item.install.version }
    expect(desktopInstallPlan(item, true)).toEqual({ kind: 'npm', target: '@fixture/skin@1.0.0' })
    expect(desktopGithubInstallPlan(item)).toEqual({ kind: 'github', target: item.install.target })
  })

  it('allows an unreviewed npm fallback with a warning and keeps curator prose manual', () => {
    const item = skin()
    item.review!.installation = 'manual-only'
    expect(desktopInstallPlan(item, true).kind).toBe('manual')
    expect(desktopInstallPlan(item, true, true)).toEqual({ kind: 'github', target: item.install.target })
    expect(desktopInstallationWarning(item, true)).toBe('GitHub 安装来源尚未通过市场核验')
    item.install.desktop = { mode: 'manual-only', reason: '当前仅完成固定版本的公开展示/DSH Web 隔离验收；Desktop 安装路径尚未单独核验。' }
    expect(desktopInstallPlan(item, true, true).kind).toBe('manual')
    expect(desktopInstallationWarning(item, true)).toBeUndefined()
  })

  it('allows publication-hook fallbacks but keeps install-hook and structural blockers manual', () => {
    const item = skin()
    item.review!.installation = 'manual-only'
    item.install.desktop = { mode: 'manual-only', reason: 'npm-lifecycle-scripts:prepack,prepublish' }
    expect(desktopInstallPlan(item, true, true).kind).toBe('manual')
    item.install.desktop = { mode: 'manual-only', reason: 'npm-lifecycle-scripts:prepack,prepublishOnly' }
    expect(desktopInstallPlan(item, true, true).kind).toBe('github')
    item.install.companions = [{ package: 'companion', target: item.install.target, version: '1.0.0', commit: item.install.commit, rowId: 'companion' }]
    expect(desktopInstallPlan(item, true, true).kind).toBe('manual')
  })

  it.each(['unreviewed', 'companion', 'allowBuild', 'mutable', 'wrong repo', 'wrong path', 'traversal'] as const)('keeps %s sources manual', reason => {
    const item = skin('packages/skin')
    if (reason === 'unreviewed') item.review!.installation = 'manual-only'
    if (reason === 'companion') item.install.companions = [{ package: 'companion', target: item.install.target, version: '1.0.0', commit: item.install.commit, rowId: 'companion' }]
    if (reason === 'allowBuild') item.install.allowBuild = 'fixture@archive'
    if (reason === 'mutable') item.install.target = 'github:Fixture/Skin#main'
    if (reason === 'wrong repo') item.install.target = item.install.target.replace('Fixture/Skin', 'Someone/Else')
    if (reason === 'wrong path') item.install.target = item.install.target.replace('packages/skin', 'packages/other')
    if (reason === 'traversal') { item.subpath = '../skin'; item.install.target = `github:Fixture/Skin#${item.install.commit}&path:/../skin` }
    expect(desktopInstallPlan(item, true).kind).toBe('manual')
  })
})

function artifactFixture(subpath?: string) {
  const item = skin(subpath)
  const directory = mkdtempSync(join(tmpdir(), 'dsh-desktop-github-artifact-'))
  directories.push(directory)
  const target = packageDir(directory, item.package)
  mkdirSync(target, { recursive: true })
  const manifest = { name: item.package, version: item.install.version, exports: { './client': './client.js' }, dsh: { client: { platform: 'web' } } }
  atomicWriteJson(join(target, 'package.json'), manifest)
  atomicWriteText(join(target, 'client.js'), 'export const client = true\n')
  atomicWriteJson(join(directory, 'package.json'), { dependencies: { [item.package]: item.install.target } })
  const archive = `https://codeload.github.com/Fixture/Skin/tar.gz/${item.install.commit}`
  const resolved = `${archive}${subpath === undefined ? '' : `#path:/${subpath}`}`
  const lock = {
    lockfileVersion: '9.0', importers: { '.': { dependencies: { [item.package]: { specifier: item.install.target, version: resolved } } } },
    packages: { [`${item.package}@${resolved}`]: { version: item.install.version, resolution: { gitHosted: true, tarball: archive, ...(subpath === undefined ? {} : { path: `/${subpath}` }) } } },
  }
  const save = () => atomicWriteText(join(directory, 'pnpm-lock.yaml'), stringify(lock))
  save()
  return { item, directory, target, manifest, archive, resolved, lock, save }
}

describe('Desktop immutable GitHub artifacts', () => {
  it.each([undefined, 'packages/skin'])('verifies the importer, archive and package for %s', path => {
    const { directory, item } = artifactFixture(path)
    expect(validateDesktopArtifact(directory, item)).toEqual({ ok: true, version: '1.0.0', integrityVerified: false })
    expect(reviewedInstalledSpecMatches(directory, item, item.install.target, { hostKind: 'desktop' })).toBe(true)
  })

  it.each(['manifest source', 'importer source', 'importer commit', 'importer path', 'resolution repo', 'resolution commit', 'resolution path', 'lock package version', 'manifest version', 'entry'] as const)('rejects a changed %s even when the expected commit remains elsewhere', changed => {
    const f = artifactFixture('packages/skin')
    const importer = f.lock.importers['.'].dependencies[f.item.package]!
    const entry = f.lock.packages[`${f.item.package}@${f.resolved}`]!
    if (changed === 'manifest source') atomicWriteJson(join(f.directory, 'package.json'), { dependencies: { [f.item.package]: `github:Other/Skin#${f.item.install.commit}&path:/packages/skin` } })
    if (changed === 'importer source') importer.specifier = importer.specifier.replace('Fixture/Skin', 'Other/Skin')
    if (changed === 'importer commit') importer.version = importer.version.replace(f.item.install.commit, 'b'.repeat(40))
    if (changed === 'importer path') importer.version = importer.version.replace('packages/skin', 'packages/other')
    if (changed === 'resolution repo') entry.resolution.tarball = entry.resolution.tarball.replace('Fixture/Skin', 'Other/Skin')
    if (changed === 'resolution commit') entry.resolution.tarball = entry.resolution.tarball.replace(f.item.install.commit, 'b'.repeat(40))
    if (changed === 'resolution path') entry.resolution.path = '/packages/other'
    if (changed === 'lock package version') entry.version = '2.0.0'
    if (changed === 'manifest version') atomicWriteJson(join(f.target, 'package.json'), { ...f.manifest, version: '2.0.0' })
    if (changed === 'entry') rmSync(join(f.target, 'client.js'))
    f.save()
    expect(validateDesktopArtifact(f.directory, f.item, { allowArtifactRisk: true }).ok).toBe(false)
    expect(reviewedInstalledSpecMatches(f.directory, f.item, f.item.install.target, { hostKind: 'desktop', allowArtifactRisk: true })).toBe(false)
  })

  it.each(['path', 'integrity'])('binds recovery snapshots to Git archive %s metadata', field => {
    const f = artifactFixture('packages/skin')
    const baseline = snapshotInstalledArtifact(f.directory, f.item.package)
    expect(compareInstalledArtifact(f.directory, baseline).ok).toBe(true)
    const resolution = f.lock.packages[`${f.item.package}@${f.resolved}`]!.resolution as { path?: string; integrity?: string }
    if (field === 'path') resolution.path = '/packages/other'
    else resolution.integrity = 'sha512-changed'
    f.save()
    expect(compareInstalledArtifact(f.directory, baseline)).toMatchObject({ ok: false, reason: expect.stringContaining('lockfile resolution') })
  })
})
