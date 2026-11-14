import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadContract, loadSchema, assertContractCoversSchema, renderBlock, readBlock, schemaErrorHint } from '../scripts/submission-contract.mjs'

describe('submission contract', () => {
  it('classifies every skin schema property exactly once', async () => {
    const contract = await loadContract()
    const schema = await loadSchema()
    const stats = assertContractCoversSchema(contract, schema)
    expect(stats.classified).toBe(stats.properties)
  })

  it('keeps category, tags and modes author-writable and defaulted', async () => {
    const contract = await loadContract()
    for (const field of ['category', 'tags', 'modes']) {
      expect(contract.authorFields).toContain(field)
      expect(contract.autoFields).not.toContain(field)
      expect(contract.schemaFields[field]).toBe('author')
      expect(contract.defaults[field]).toBeDefined()
    }
    expect(contract.authorFields.filter(field => contract.autoFields.includes(field))).toEqual([])
    const zh = renderBlock(contract, 'zh')
    expect(zh).toContain('缺省时由 CI 推导')
  })

  it('keeps the Chinese README block in sync', async () => {
    const contract = await loadContract()
    const source = await readFile(join(process.cwd(), 'README.md'), 'utf8')
    expect(readBlock(source, contract.markers)).toBe(renderBlock(contract, 'zh'))
  })

  it('keeps the English README block in sync', async () => {
    const contract = await loadContract()
    const source = await readFile(join(process.cwd(), 'README.en.md'), 'utf8')
    expect(readBlock(source, contract.markers)).toBe(renderBlock(contract, 'en'))
  })

  it('explains a missing bilingual name', async () => {
    const contract = await loadContract()
    const hint = schemaErrorHint(contract, [{ keyword: 'required', params: { missingProperty: 'name' }, instancePath: '' }])
    expect(hint).toContain('zh')
    expect(hint).toContain('en')
  })

  it('lists the thin fields when extra keys are present', async () => {
    const contract = await loadContract()
    const hint = schemaErrorHint(contract, [{ keyword: 'additionalProperties', params: { additionalProperty: 'install' }, instancePath: '' }])
    expect(hint).toContain('`url`')
    expect(hint).toContain('`screenshots`')
  })

  it('documents editable and machine-owned fields for existing entries', async () => {
    const contract = await loadContract()
    for (const field of ['name', 'description', 'screenshots', 'marketScreenshots', 'compatibility.dsh', 'data/catalog-copy.json']) {
      expect(contract.existingEntryUpdate.updateFields).toContain(field)
    }
    for (const field of ['id', 'repo', 'subpath', 'install', 'license', 'review', 'featuredRank', 'updatedAt']) {
      expect(contract.existingEntryUpdate.updateForbiddenFields).toContain(field)
    }
    expect(contract.existingEntryUpdate.updateForbiddenPaths).toContain('data/catalog.json')
    const zh = renderBlock(contract, 'zh')
    expect(zh).toContain('已收录条目更新（作者可改）')
    expect(zh).toContain('字段说明：')
    expect(zh).toContain('- `compatibility.dsh`：')
    const en = renderBlock(contract, 'en')
    expect(en).toContain('Existing entry update (author-editable)')
    expect(en).toContain('Field notes:')
    expect(en).toContain('- `compatibility.dsh`:')
  })
})
