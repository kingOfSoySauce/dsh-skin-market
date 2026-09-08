import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CatalogStore, loadCatalog, validateCatalog } from '../src/catalog.ts'
import { decodeCatalogWire, encodeCatalogWire } from '../src/catalog-wire.ts'
import type { NpmInstallSource } from '../src/types.ts'
import { buildCatalogWire } from '../scripts/catalog-wire.mjs'

function fixture() {
  const bundled = loadCatalog()
  const skin = structuredClone(bundled.skins[0]!)
  const npm: NpmInstallSource = {
    name: skin.package, version: skin.install.version, integrity: 'sha512-abc', repository: skin.repo, gitHead: skin.install.commit,
  }
  delete skin.install.npm
  const catalog = { schemaVersion: 1, generatedAt: new Date(Date.parse(bundled.generatedAt) + 60_000).toISOString(), skins: [skin] }
  const wire = { ...catalog, npmSources: { [skin.id]: npm } }
  return { catalog, wire, skin, npm }
}

function cache(dir: string) { return JSON.parse(readFileSync(join(dir, '.dsh-skin-market/catalog.json'), 'utf8')) }

describe('catalog wire reader', () => {
  it('decodes legacy catalogs and npm metadata without changing the input or GitHub target', () => {
    const { catalog, wire, skin, npm } = fixture()
    const original = structuredClone(wire)
    const runtime = validateCatalog(wire)
    expect(decodeCatalogWire(catalog)).toEqual(catalog)
    expect(runtime.skins[0]!.install.npm).toEqual(npm)
    expect(runtime.skins[0]!.install.target).toBe(skin.install.target)
    expect(runtime).not.toHaveProperty('npmSources')
    expect(wire).toEqual(original)
    expect(runtime.skins[0]!.install).not.toBe(wire.skins[0]!.install)
    expect(runtime.skins[0]!.install.npm).not.toBe(npm)
  })

  it('round-trips runtime data in the same wire format as the registry builder', () => {
    const { wire } = fixture()
    const runtime = validateCatalog(wire)
    const original = structuredClone(runtime)
    const encoded = encodeCatalogWire(runtime)
    expect(encoded.skins.every(entry => !Object.hasOwn(entry.install, 'npm'))).toBe(true)
    expect(encoded).toEqual(buildCatalogWire(runtime.skins, { generatedAt: runtime.generatedAt }))
    expect(validateCatalog(encoded)).toEqual(runtime)
    expect(runtime).toEqual(original)
  })

  it('normalizes transitional inline catalogs and accepts identical redundant sources', () => {
    const { catalog, wire, skin, npm } = fixture()
    const inline = { ...catalog, skins: [{ ...skin, install: { ...skin.install, npm } }] }
    expect(encodeCatalogWire(inline)).toEqual(wire)
    expect(decodeCatalogWire({ ...inline, npmSources: wire.npmSources })).toEqual(inline)
  })

  it('rejects conflicting inline and top-level metadata', () => {
    const { wire, skin, npm } = fixture()
    const inline = { ...skin, install: { ...skin.install, npm: { ...npm, integrity: 'sha512-def' } } }
    expect(() => validateCatalog({ ...wire, skins: [inline] })).toThrow('conflicting npm sources')
  })

  it.each([null, [], 'npm', 1, false, undefined, new Date()])('rejects an invalid npmSources record (%s)', npmSources => {
    expect(() => validateCatalog({ ...fixture().catalog, npmSources })).toThrow('npmSources must be an object')
  })

  it('rejects npm metadata for unknown skins, including prototype property names', () => {
    const { catalog, npm } = fixture()
    for (const id of ['missing.skin', '__proto__', 'constructor']) {
      expect(() => validateCatalog({ ...catalog, npmSources: { [id]: npm } })).toThrow(`unknown skin: ${id}`)
    }
  })

  it.each([
    ['name', 'different-package'], ['name', undefined], ['version', 'other-version'],
    ['repository', 'https://github.com/another/repo'], ['repository', 'https://example.com/owner/repo'],
    ['gitHead', '0'.repeat(40)], ['gitHead', '0123456'], ['gitHead', undefined],
    ['integrity', 'unverified'], ['integrity', undefined],
  ])('validates mapped npm %s (%s) before exposing it to installers', (field, invalid) => {
    const { wire, skin, npm } = fixture()
    const candidate = { ...wire, npmSources: { [skin.id]: { ...npm, [field]: invalid } } }
    expect(() => validateCatalog(candidate)).toThrow(/invalid npm/)
    expect(() => decodeCatalogWire(candidate)).toThrow(/invalid npm/)
  })

  it.each([null, [], 'package', { unrecognized: true }])('rejects malformed source entries (%s)', source => {
    const { wire, skin } = fixture()
    expect(() => validateCatalog({ ...wire, npmSources: { [skin.id]: source } })).toThrow(/invalid npm/)
  })

  it('continues full entry validation after decoding valid npm metadata', () => {
    const { wire } = fixture()
    expect(() => validateCatalog({ ...wire, skins: [{ ...wire.skins[0], unrelated: true }] })).toThrow('invalid skin entry')
  })

  it('stores wire data and restores runtime npm metadata from the shared cache offline', async () => {
    const { wire, npm } = fixture()
    const dir = mkdtempSync(join(tmpdir(), 'skin-catalog-wire-'))
    const store = new CatalogStore(dir, { fetcher: async () => ({ ok: true, status: 200, json: async () => wire }) })
    const accepted = await store.refresh(true)
    expect(accepted.source).toBe('remote')
    expect(accepted.catalog.skins[0]!.install.npm).toEqual(npm)
    expect(cache(dir)).toEqual(wire)
    expect(cache(dir).skins[0].install).not.toHaveProperty('npm')
    const offline = new CatalogStore(dir, { fetcher: async () => { throw new Error('offline') } })
    expect((await offline.refresh(true)).catalog.skins[0]!.install.npm).toEqual(npm)
    expect(offline.snapshot().source).toBe('cache')
  })

  it('writes transitional inline remote metadata back to the cache as wire data', async () => {
    const { wire } = fixture()
    const dir = mkdtempSync(join(tmpdir(), 'skin-catalog-inline-'))
    const runtime = validateCatalog(wire)
    const store = new CatalogStore(dir, { fetcher: async () => ({ ok: true, status: 200, json: async () => runtime }) })
    expect((await store.refresh(true)).source).toBe('remote')
    expect(cache(dir)).toEqual(wire)
  })

  it('requires a new timestamp for changed npm metadata and keeps the accepted cache', async () => {
    const { wire, skin, npm } = fixture()
    let remote = wire
    const dir = mkdtempSync(join(tmpdir(), 'skin-catalog-npm-timestamp-'))
    const store = new CatalogStore(dir, { fetcher: async () => ({ ok: true, status: 200, json: async () => remote }) })
    expect((await store.refresh(true)).source).toBe('remote')
    remote = { ...wire, npmSources: { [skin.id]: { ...npm, integrity: 'sha512-def' } } }
    const rejected = await store.refresh(true)
    expect(rejected.error).toContain('changed without a new generatedAt timestamp')
    expect(rejected.catalog.skins[0]!.install.npm).toEqual(npm)
    expect(cache(dir)).toEqual(wire)
  })

  it('keeps the accepted catalog when remote npm metadata is invalid', async () => {
    const { wire, skin, npm } = fixture()
    let remote: unknown = wire
    const dir = mkdtempSync(join(tmpdir(), 'skin-catalog-npm-fallback-'))
    const store = new CatalogStore(dir, { fetcher: async () => ({ ok: true, status: 200, json: async () => remote }) })
    await store.refresh(true)
    remote = { ...wire, npmSources: { [skin.id]: { ...npm, gitHead: 'invalid' } } }
    const rejected = await store.refresh(true)
    expect(rejected.error).toContain('invalid npm gitHead')
    expect(rejected.catalog.skins[0]!.install.npm).toEqual(npm)
    expect(cache(dir)).toEqual(wire)
  })

  it.each(['add', 'remove'])('rejects a metadata-only %s without a new timestamp', async change => {
    const { catalog, wire } = fixture()
    let remote = change === 'add' ? catalog : wire
    const store = new CatalogStore(mkdtempSync(join(tmpdir(), 'skin-catalog-npm-presence-')), {
      fetcher: async () => ({ ok: true, status: 200, json: async () => remote }),
    })
    const accepted = await store.refresh(true)
    remote = change === 'add' ? wire : catalog
    const rejected = await store.refresh(true)
    expect(rejected.error).toContain('changed without a new generatedAt timestamp')
    expect(rejected.catalog).toEqual(accepted.catalog)
  })

  it('ignores npm object key ordering when comparing an unchanged timestamp', async () => {
    const { wire, skin, npm } = fixture()
    let remote = wire
    const store = new CatalogStore(mkdtempSync(join(tmpdir(), 'skin-catalog-npm-order-')), {
      fetcher: async () => ({ ok: true, status: 200, json: async () => remote }),
    })
    await store.refresh(true)
    remote = { ...wire, npmSources: { [skin.id]: { gitHead: npm.gitHead, repository: npm.repository, integrity: npm.integrity, version: npm.version, name: npm.name } } }
    expect((await store.refresh(true)).error).toBeUndefined()
  })

  it('falls back to bundled data when saved cache npm metadata is invalid', () => {
    const { wire, skin, npm } = fixture()
    const dir = mkdtempSync(join(tmpdir(), 'skin-catalog-npm-bad-cache-'))
    mkdirSync(join(dir, '.dsh-skin-market'))
    writeFileSync(join(dir, '.dsh-skin-market/catalog.json'), JSON.stringify({ ...wire, npmSources: { [skin.id]: { ...npm, integrity: 'unverified' } } }))
    const store = new CatalogStore(dir)
    expect(store.snapshot().source).toBe('bundled')
    expect(store.snapshot().catalog).toEqual(loadCatalog())
    expect(store.snapshot().error).toContain('cached catalog rejected: invalid npm integrity')
  })
})
