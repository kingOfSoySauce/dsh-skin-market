import { readFileSync } from 'node:fs'
import Ajv from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { buildCatalogWire } from '../scripts/catalog-wire.mjs'
import { decodeCatalogWire } from '../src/catalog-wire.ts'
import { loadCatalog } from '../src/catalog.ts'
import type { CatalogFile } from '../src/types.ts'

/**
 * Frozen copy of the v1 per-entry schema. Published clients validate every
 * skin with this closed schema, so the catalog must keep projecting exactly
 * this shape even after the envelope gains new sidecars.
 */
const v1Schema = JSON.parse(readFileSync(new URL('./fixtures/catalog-v1.skin.schema.json', import.meta.url), 'utf8'))
const validateV1Skin = new Ajv({ allErrors: true, strict: false, validateFormats: false }).compile(v1Schema)

const bundled = loadCatalog()
const npmSkin = bundled.skins.find(skin => skin.install.npm !== undefined
  && skin.subpath === undefined
  && (skin.install.companions?.length ?? 0) === 0)!
const observedAt = '2026-11-14T00:00:00.000Z'
const nextCommit = 'b'.repeat(40)

function policy() {
  return {
    schema: 'install-policy-v1',
    mode: 'npm',
    package: npmSkin.package,
    resolved: { version: '9.9.9', commit: nextCommit, integrity: 'sha512-ZGVm', gitHead: nextCommit, observedAt },
  }
}

function withPolicy(): CatalogFile {
  return buildCatalogWire([npmSkin], {
    installPolicies: { [npmSkin.id]: policy() },
    generatedAt: observedAt,
  })
}

function withoutPolicy(): CatalogFile {
  return buildCatalogWire([npmSkin], { generatedAt: observedAt })
}

/** Mirrors dsh-skin-market@0.1.17: unknown top-level keys are simply ignored. */
function validateLike017(value: unknown): void {
  if (typeof value !== 'object' || value === null) throw new Error('catalog must be an object')
  const candidate = value as { schemaVersion?: unknown; generatedAt?: unknown; skins?: unknown }
  if (candidate.schemaVersion !== 1) throw new Error('unsupported catalog schema version')
  if (typeof candidate.generatedAt !== 'string' || !Number.isFinite(Date.parse(candidate.generatedAt))) throw new Error('generatedAt')
  if (!Array.isArray(candidate.skins) || candidate.skins.length > 5000) throw new Error('skins')
  const ids = new Set(), packages = new Set(), rows = new Set()
  for (const skin of candidate.skins as Array<Record<string, any>>) {
    if (!validateV1Skin(skin)) throw new Error(JSON.stringify(validateV1Skin.errors))
    const repo = skin.repo.replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '')
    const expected = `github:${repo}#${skin.install.commit}${skin.subpath ? `&path:${skin.subpath}` : ''}`
    if (skin.install.target !== expected) throw new Error('target')
    for (const [key, set] of [['id', ids], ['package', packages], ['rowId', rows]] as const) {
      if (set.has(skin[key])) throw new Error('duplicate ' + key)
      set.add(skin[key])
    }
  }
}

/** Mirrors dsh-skin-market@0.1.49: only npmSources is lifted out of the envelope. */
function decodeLike049(value: unknown): { skins: Array<Record<string, any>> } {
  const candidate = value as Record<string, any>
  if (candidate.schemaVersion !== 1) throw new Error('unsupported catalog schema version')
  if (!Array.isArray(candidate.skins)) throw new Error('skins')
  const { npmSources, ...catalog } = candidate
  const sources = npmSources as Record<string, any> | undefined
  const skins = candidate.skins.map((skin: Record<string, any>) => {
    if (!validateV1Skin(skin)) throw new Error(JSON.stringify(validateV1Skin.errors))
    const mapped = sources !== undefined && Object.hasOwn(sources, skin.id) ? sources[skin.id] : undefined
    return { ...skin, ...(mapped === undefined ? {} : { install: { ...skin.install, npm: mapped } }) }
  })
  return { ...catalog, skins }
}

describe('catalog v1 compatibility contract', () => {
  it('keeps every skin entry byte-identical when a release observation is added', () => {
    const legacy = withoutPolicy()
    const observed = withPolicy()
    expect(observed.skins).toEqual(legacy.skins)
    expect(JSON.stringify(observed.skins)).toBe(JSON.stringify(legacy.skins))
    expect(observed.generatedAt).toBe(observedAt)
    expect(observed.installPolicies).toEqual({ [npmSkin.id]: policy() })
  })

  it('still passes the frozen v1 entry schema and target rules', () => {
    expect(() => validateLike017(withPolicy())).not.toThrow()
    expect(() => validateLike017(withoutPolicy())).not.toThrow()
  })

  it('is accepted by the 0.1.49 decoder without changing skin install fields', () => {
    const wire = withPolicy()
    const decoded = decodeLike049(wire)
    expect(decoded.skins).toEqual(withoutPolicy().skins.map(skin => ({
      ...skin,
      install: { ...skin.install, npm: npmSkin.install.npm },
    })))
  })

  it('keeps the new fields outside every skin entry', () => {
    const wire = withPolicy()
    expect(Object.keys(wire)).toEqual(expect.arrayContaining(['schemaVersion', 'generatedAt', 'skins', 'installPolicies']))
    for (const skin of wire.skins) {
      expect(skin).not.toHaveProperty('installPolicies')
      expect(skin.install).not.toHaveProperty('installPolicy')
      expect(validateV1Skin(skin)).toBe(true)
    }
  })

  it('lets a new client read a legacy catalog with no observations', () => {
    const legacy = withoutPolicy()
    const decoded = decodeCatalogWire(legacy)
    expect(decoded.schemaVersion).toBe(1)
    expect(decoded.skins).toEqual(withoutPolicy().skins.map(skin => ({
      ...skin,
      install: { ...skin.install, npm: npmSkin.install.npm },
    })))
    expect(decoded).not.toHaveProperty('installPolicies')
  })

  it('lets a new client read the observed catalog without changing reviewed install fields', () => {
    const wire = withPolicy()
    const decoded = decodeCatalogWire(wire)
    expect(decoded.installPolicies).toEqual({ [npmSkin.id]: policy() })
    expect(decoded.skins).toEqual(withoutPolicy().skins.map(skin => ({
      ...skin,
      install: { ...skin.install, npm: npmSkin.install.npm },
    })))
  })
})
