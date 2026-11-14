import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { loadCatalog } from '../src/catalog.ts'
import { SkinLifecycle } from '../src/lifecycle.ts'
import {
  assertLoaderMetadata,
  atomicWriteJson,
  atomicWriteText,
  installedPrimaryLoaderRowId,
  profilePatchFile,
  readDependencies,
  reconcileCatalogLoaderIds,
} from '../src/profile.ts'
import { resetManagedSkins } from '../src/reset.ts'
import type { SkinEntry } from '../src/types.ts'
import { cleanupTempDirs, tempDir } from './fixtures/temp.ts'

afterEach(cleanupTempDirs)

function fixture() {
  const dir = tempDir('skin-loader-reconcile-')
  atomicWriteJson(join(dir, 'package.json'), { dependencies: {} })
  return dir
}

function catalogSkin(): SkinEntry {
  const skins = loadCatalog().skins
  const packages = new Map<string, number>()
  const rows = new Map<string, number>()
  for (const skin of skins) {
    packages.set(skin.package, (packages.get(skin.package) ?? 0) + 1)
    rows.set(skin.rowId, (rows.get(skin.rowId) ?? 0) + 1)
  }
  const skin = skins.find(skin => packages.get(skin.package) === 1 && rows.get(skin.rowId) === 1)
  if (skin === undefined) throw new Error('catalog has no skin with a unique package and row id')
  return structuredClone(skin)
}

function materialize(dir: string, skin: SkinEntry, rowIds: readonly string[], spec = skin.install.target): void {
  atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: spec } })
  const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
  mkdirSync(packageDir, { recursive: true })
  atomicWriteJson(join(packageDir, 'package.json'), {
    name: skin.package,
    version: skin.install.version,
    exports: { './client': './client.js' },
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
  })
  atomicWriteText(join(packageDir, 'client.js'), 'export const fixture = true\n')
  atomicWriteText(join(packageDir, 'cordis.patch.yml'),
    '- insert:\n' + rowIds.map(id => `    - id: ${id}\n      name: ${JSON.stringify(skin.package)}\n`).join(''))
}

describe('installed loader identity is authoritative', () => {
  it('replaces a stale catalog rowId hint with the installed primary loader id', () => {
    const dir = fixture()
    const base = catalogSkin()
    const skin = { ...base, id: 'stale-hint.skin', rowId: 'catalog-hint' }
    materialize(dir, skin, ['installed-primary'])

    expect(installedPrimaryLoaderRowId(dir, skin)).toBe('installed-primary')
    const reconciled = reconcileCatalogLoaderIds(dir, [skin])
    expect(reconciled[0]!.rowId).toBe('installed-primary')
    expect(reconciled[0]!.package).toBe(skin.package)
    expect(skin.rowId).toBe('catalog-hint')
    expect(() => assertLoaderMetadata(dir, skin)).toThrow('实际主 loader id=installed-primary')
    expect(() => assertLoaderMetadata(dir, reconciled[0]!)).not.toThrow()
  })

  it('leaves entries untouched when the hint already matches or the package is not installed', () => {
    const dir = fixture()
    const base = catalogSkin()
    const matching = { ...base, id: 'matching.skin', rowId: 'installed-primary' }
    materialize(dir, matching, ['installed-primary'])
    expect(reconcileCatalogLoaderIds(dir, [matching])[0]).toBe(matching)

    const notInstalled = { ...base, id: 'not-installed.skin', package: '@example/not-installed', rowId: 'catalog-hint' }
    const reconciled = reconcileCatalogLoaderIds(dir, [matching, notInstalled])
    expect(reconciled[1]).toBe(notInstalled)
  })

  it('does not rename an entry from an ambiguous bundle', () => {
    const dir = fixture()
    const base = catalogSkin()
    const skin = { ...base, id: 'ambiguous.skin', rowId: 'catalog-hint' }
    materialize(dir, skin, ['first-primary', 'second-primary'])
    expect(installedPrimaryLoaderRowId(dir, skin)).toBeNull()
    expect(reconcileCatalogLoaderIds(dir, [skin])[0]).toBe(skin)
  })

  it('keeps the reconciled id when the lifecycle loads the catalog', () => {
    const dir = fixture()
    const base = catalogSkin()
    const skin = { ...base, id: 'lifecycle.skin', rowId: 'catalog-hint' }
    materialize(dir, skin, ['installed-primary'])
    const lifecycle = new SkinLifecycle(
      { loader: { entries: () => [] } },
      { profile: 'test', profileDir: dir, runner: async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) },
      [skin],
    )
    expect(lifecycle.catalog.find(entry => entry.id === skin.id)?.rowId).toBe('installed-primary')
  })

  it('uses the installed row id when reset reconciles the catalog', () => {
    const dir = fixture()
    const base = catalogSkin()
    const skin = { ...base, id: 'reset.skin', rowId: 'catalog-hint' }
    materialize(dir, skin, ['installed-primary'])
    expect(readDependencies(dir)[skin.package]).toBe(skin.install.target)
    // The bundle path removes the profile registration when disabling; the
    // point here is that reset reaches that decision using the installed id
    // without throwing the stale-hint metadata error.
    expect(() => resetManagedSkins(dir, [skin])).not.toThrow()
  })
})
