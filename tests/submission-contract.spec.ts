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
})
