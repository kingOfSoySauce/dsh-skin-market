import { describe, expect, it } from 'vitest'
import { assertCatalogCopy, validateCatalogCopy, validateCatalogCopyEntry } from '../scripts/catalog-copy.mjs'

const registryIds = new Set(['example.skin', 'other.skin'])
const validEntry = {
  name: { zh: '示例皮肤', en: 'Example Skin' },
  descriptionPolicy: 'show',
  description: { zh: '中文描述', en: 'English description' },
  source: { kind: 'curated', hash: 'abc123', approvedAt: '2026-11-01' },
  override: true,
  nameSource: 'repository-evidence',
}

function validate(entry: Record<string, unknown>, id = 'example.skin') {
  return validateCatalogCopy({ skins: { [id]: entry } }, registryIds)
}

function validCopy(entry: Record<string, unknown> = structuredClone(validEntry)) {
  return { skins: { 'example.skin': entry } }
}

describe('catalog display-copy validation', () => {
  it('accepts a structurally valid file', () => {
    expect(validateCatalogCopy(validCopy(), registryIds)).toEqual([])
    expect(() => assertCatalogCopy(validCopy(), registryIds)).not.toThrow()
  })

  it('accepts curate as an authoring state that still needs bilingual copy', () => {
    const entry = { ...structuredClone(validEntry), descriptionPolicy: 'curate' }
    expect(validateCatalogCopy(validCopy(entry), registryIds)).toEqual([])
    delete entry.description
    expect(validate(entry).join('\n')).toMatch(/descriptionPolicy=curate 时必须提供双语 description/)
  })

  it('allows omit only when no description remains', () => {
    const entry: Record<string, unknown> = { name: { zh: '名称', en: 'Name' }, descriptionPolicy: 'omit' }
    expect(validate(entry)).toEqual([])
    entry.description = { zh: '多余描述', en: 'leftover description' }
    expect(validate(entry).join('\n')).toMatch(/descriptionPolicy=omit 时不能保留 description/)
  })

  it('rejects unknown keys on the entry and inside source', () => {
    const entry = structuredClone(validEntry) as Record<string, unknown>
    entry.extra = true
    expect(validate(entry).join('\n')).toMatch(/未知键 extra/)
    const withSourceKey = structuredClone(validEntry) as Record<string, unknown>
    ;(withSourceKey.source as Record<string, unknown>).secret = 'x'
    expect(validate(withSourceKey).join('\n')).toMatch(/source 未知键 secret/)
  })

  it('requires both name sides and both description sides', () => {
    const badName = { ...structuredClone(validEntry), name: { zh: '只有中文' } }
    expect(validate(badName).join('\n')).toMatch(/name\.en 必须是非空字符串/)
    const emptyName = { ...structuredClone(validEntry), name: { zh: '  ', en: '' } }
    expect(validate(emptyName).join('\n')).toMatch(/name\.zh 必须是非空字符串/)
    const badDescription = structuredClone(validEntry) as Record<string, unknown>
    badDescription.description = { zh: '只有中文', en: '' }
    expect(validate(badDescription).join('\n')).toMatch(/description\.en 必须是非空字符串/)
  })

  it('rejects ids that no longer exist in the registry', () => {
    const entry = { name: { zh: '名称', en: 'Name' }, descriptionPolicy: 'omit' }
    expect(validate(entry, 'missing.skin').join('\n')).toMatch(/在 registry\/skins 中找不到这个 id/)
  })

  it('rejects malformed top-level shapes', () => {
    expect(validateCatalogCopy([], registryIds).join('\n')).toMatch(/顶层必须是对象/)
    expect(validateCatalogCopy({}, registryIds).join('\n')).toMatch(/必须包含 skins 对象/)
    expect(validateCatalogCopy({ skins: [] }, registryIds).join('\n')).toMatch(/必须包含 skins 对象/)
  })

  it('requires descriptionPolicy and validates its value', () => {
    const missing = structuredClone(validEntry) as Record<string, unknown>
    delete missing.descriptionPolicy
    expect(validate(missing).join('\n')).toMatch(/缺少 descriptionPolicy/)
    const invalid = structuredClone(validEntry) as Record<string, unknown>
    invalid.descriptionPolicy = 'sometimes'
    expect(validate(invalid).join('\n')).toMatch(/descriptionPolicy 必须是/)
  })

  it('validates override and nameSource types', () => {
    const badOverride = structuredClone(validEntry) as Record<string, unknown>
    badOverride.override = 'yes'
    expect(validate(badOverride).join('\n')).toMatch(/override 必须是布尔值/)
    const badNameSource = structuredClone(validEntry) as Record<string, unknown>
    badNameSource.nameSource = 42
    expect(validate(badNameSource).join('\n')).toMatch(/nameSource 必须是非空字符串/)
  })

  it('allows adding display copy without source/override/nameSource metadata', () => {
    const entry = { name: { zh: '名称', en: 'Name' }, descriptionPolicy: 'omit' }
    expect(validateCatalogCopy(validCopy(entry), registryIds)).toEqual([])
  })

  it('can keep pre-existing orphan ids non-blocking when asked', () => {
    const copy = { skins: { 'legacy.orphan': { name: { zh: '旧', en: 'Old' }, descriptionPolicy: 'omit' } } }
    expect(validateCatalogCopy(copy, registryIds).join('\n')).toMatch(/找不到这个 id/)
    expect(validateCatalogCopy(copy, registryIds, { allowUnknownIds: true })).toEqual([])
  })

  it('aggregates every problem in assertCatalogCopy', () => {
    const copy = { skins: { 'example.skin': { name: { zh: '', en: '' }, descriptionPolicy: 'omit' }, 'missing.skin': {} } }
    expect(() => assertCatalogCopy(copy, registryIds)).toThrow(/校验失败/)
    expect(() => assertCatalogCopy(copy, registryIds)).toThrow(/找不到这个 id/)
  })

  it('validates a single entry for the update guard', () => {
    expect(validateCatalogCopyEntry('example.skin', structuredClone(validEntry), registryIds)).toEqual([])
    const bad = structuredClone(validEntry) as Record<string, unknown>
    bad.unexpected = 'x'
    expect(validateCatalogCopyEntry('example.skin', bad, registryIds).join('\n')).toMatch(/未知键 unexpected/)
  })
})