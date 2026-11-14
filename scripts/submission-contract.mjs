import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const contractPath = join(root, 'registry', 'submission-contract.json')
const schemaPath = join(root, 'registry', 'skin.schema.json')
const readmes = { zh: join(root, 'README.md'), en: join(root, 'README.en.md') }

export async function loadContract() {
  return JSON.parse(await readFile(contractPath, 'utf8'))
}

export async function loadSchema() {
  return JSON.parse(await readFile(schemaPath, 'utf8'))
}

/** Every schema property must be classified exactly once. */
export function assertContractCoversSchema(contract, schema) {
  const properties = Object.keys(schema?.properties ?? {})
  if (properties.length === 0) throw new Error('skin schema has no properties')
  const classified = Object.keys(contract.schemaFields ?? {})
  const missing = properties.filter(key => !classified.includes(key))
  const unknown = classified.filter(key => !properties.includes(key))
  if (missing.length) throw new Error(`submission contract is missing schema fields: ${missing.join(', ')}`)
  if (unknown.length) throw new Error(`submission contract classifies unknown fields: ${unknown.join(', ')}`)
  for (const [field, tier] of Object.entries(contract.qualityTiers ?? {})) {
    if (!properties.includes(field)) throw new Error(`quality tier references unknown field: ${field}`)
    if (!['soft', 'hard'].includes(tier)) throw new Error(`quality tier for ${field} must be soft or hard`)
  }
  const allowed = new Set([...contract.authorFields, ...contract.autoFields])
  for (const field of allowed) {
    if (field !== 'url' && !properties.includes(field)) throw new Error(`readme field is not in the schema: ${field}`)
  }
  for (const field of contract.authorFields) {
    if (field === 'url') continue
    if (contract.schemaFields[field] === 'auto') throw new Error(`author field ${field} is classified as auto in schemaFields`)
  }
  for (const field of contract.autoFields) {
    if (contract.schemaFields[field] === 'author') throw new Error(`auto field ${field} is classified as author in schemaFields`)
  }
  for (const [field, copy] of Object.entries(contract.defaults ?? {})) {
    if (!contract.authorFields.includes(field) || field === 'url') throw new Error(`defaults reference a field that authors cannot write: ${field}`)
    if (typeof copy?.zh !== 'string' || typeof copy?.en !== 'string') throw new Error(`defaults for ${field} must provide zh and en text`)
  }
  const duplicated = contract.authorFields.filter(field => contract.autoFields.includes(field))
  if (duplicated.length) throw new Error(`fields cannot be both author-filled and auto-filled: ${duplicated.join(', ')}`)

  // Structured rules for community updates of an already-listed entry. These
  // drive both the README block and scripts/entry-update-guard.mjs, so the
  // documented contract and the CI guard cannot disagree about what is editable.
  const update = contract.existingEntryUpdate
  if (update === undefined || update === null || typeof update !== 'object' || Array.isArray(update)) {
    throw new Error('submission contract is missing existingEntryUpdate rules')
  }
  for (const locale of ['zh', 'en']) {
    if (typeof update.title?.[locale] !== 'string' || update.title[locale].trim() === '') throw new Error(`existingEntryUpdate.title must provide ${locale} text`)
    if (typeof update.updateRule?.[locale] !== 'string' || update.updateRule[locale].trim() === '') throw new Error(`existingEntryUpdate.updateRule must provide ${locale} text`)
  }
  if (!Array.isArray(update.updateFields) || update.updateFields.length === 0) throw new Error('existingEntryUpdate.updateFields must be a non-empty array')
  if (new Set(update.updateFields).size !== update.updateFields.length) throw new Error('existingEntryUpdate.updateFields contains duplicates')
  if (!Array.isArray(update.updateForbiddenFields) || update.updateForbiddenFields.length === 0) throw new Error('existingEntryUpdate.updateForbiddenFields must list machine-owned fields')
  for (const field of update.updateForbiddenFields) {
    if (!properties.includes(field)) throw new Error(`forbidden update field is not in the schema: ${field}`)
    // Some forbidden fields (for example `subpath`) are author-fillable in a
    // thin entry but still immutable once the entry is hydrated.
    if (update.updateFields.includes(field)) throw new Error(`field cannot be both editable and forbidden: ${field}`)
  }
  for (const field of update.updateFields) {
    if (field === 'data/catalog-copy.json') continue
    const [base, ...nested] = field.split('.')
    if (!properties.includes(base)) throw new Error(`update field is not in the schema: ${field}`)
    if (nested.length > 0 && field !== 'compatibility.dsh') throw new Error(`the only nested update field is compatibility.dsh: ${field}`)
  }
  if (update.updateNotes === undefined || update.updateNotes === null || typeof update.updateNotes !== 'object' || Array.isArray(update.updateNotes)) {
    throw new Error('existingEntryUpdate.updateNotes must be an object keyed by field')
  }
  const unknownNotes = Object.keys(update.updateNotes).filter(field => !update.updateFields.includes(field))
  if (unknownNotes.length) throw new Error(`existingEntryUpdate.updateNotes describes unknown fields: ${unknownNotes.join(', ')}`)
  for (const field of update.updateFields) {
    const note = update.updateNotes[field]
    if (typeof note?.zh !== 'string' || note.zh.trim() === '' || typeof note?.en !== 'string' || note.en.trim() === '') {
      throw new Error(`existingEntryUpdate.updateNotes must describe ${field} in zh and en`)
    }
  }
  if (!Array.isArray(update.updateForbiddenPaths) || !update.updateForbiddenPaths.includes('data/catalog.json')) {
    throw new Error('existingEntryUpdate.updateForbiddenPaths must include data/catalog.json')
  }
  return { properties: properties.length, classified: classified.length }
}

function tick(value) {
  return '`' + value + '`'
}

export function renderBlock(contract, locale) {
  const zh = locale === 'zh'
  const author = contract.authorFields.map(tick).join(zh ? '、' : ', ')
  const auto = contract.autoFields.map(tick).join(zh ? '、' : ', ')
  const soft = contract.softItems.map(item => item[locale]).join(zh ? '、' : ', ')
  const recommended = contract.recommendedItems.map(item => item[locale]).join(zh ? '、' : ', ')
  const defaults = Object.entries(contract.defaults ?? {})
    .map(([field, copy]) => `${tick(field)}=${copy[locale]}`)
    .join(zh ? '、' : ', ')
  const authorRule = [
    zh ? '只写这些；`name` 写了就必须同时有 `zh` 和 `en`。' : 'Write only these. If you write `name`, include both `zh` and `en`.',
    defaults === ''
      ? ''
      : zh
        ? `除 \`url\` 外都可省略，缺省时由 CI 推导：${defaults}。`
        : `Every field except \`url\` may be omitted; CI derives the default: ${defaults}.`,
  ].filter(Boolean).join(zh ? '' : ' ')
  const update = contract.existingEntryUpdate
  const updateFields = (update?.updateFields ?? []).map(tick).join(zh ? '、' : ', ')
  // The table stays scannable: one summary rule in the row, then one bullet per
  // editable field below the table so the per-field rules remain readable.
  const updateRow = update === undefined || update === null
    ? []
    : [`| ${update.title[locale]} | ${updateFields} | ${update.updateRule[locale]} |`]
  const updateFieldNotes = update === undefined || update === null
    ? []
    : [
        '',
        zh ? '字段说明：' : 'Field notes:',
        ...update.updateFields.map(field => `- ${tick(field)}${zh ? '：' : ': '}${update.updateNotes?.[field]?.[locale] ?? ''}`),
      ]
  const lines = zh
    ? [
        '| 类别 | 字段 / 项 | 规则 |',
        '| --- | --- | --- |',
        `| 作者写（薄条目） | ${author} | ${authorRule} |`,
        `| CI 自动补 | ${auto} | 不要手写；写了会被 schema 拒绝。 |`,
        `| 软必填（不阻断，进补全队列） | ${soft} | 缺了仍可合并，但会记录在每日完整性报告；补全队列接入后自动进队。 |`,
        `| 推荐（只提示） | ${recommended} | 不阻断合并。 |`,
        ...updateRow,
        ...updateFieldNotes,
      ]
    : [
        '| Group | Fields / items | Rule |',
        '| --- | --- | --- |',
        `| Author (thin entry) | ${author} | ${authorRule} |`,
        `| Filled by CI | ${auto} | Do not write these; the schema rejects them. |`,
        `| Soft-required (non-blocking, enters the completion queue) | ${soft} | An entry may merge without them; it is recorded in the daily completeness report and enters the completion queue once enabled. |`,
        `| Recommended (advisory only) | ${recommended} | Never blocks a merge. |`,
        ...updateRow,
        ...updateFieldNotes,
      ]
  return lines.join('\n')
}


/** Turn Ajv errors into one actionable sentence for thin submissions. */
export function schemaErrorHint(contract, errors = []) {
  const missing = errors.filter(error => error.keyword === 'required').map(error => error.params?.missingProperty).filter(Boolean)
  if (missing.includes('name')) return 'name 必须同时有 zh 和 en。'
  const extra = errors.find(error => error.keyword === 'additionalProperties')
  if (extra) return `薄条目只允许这些字段：${contract.authorFields.map(field => '`' + field + '`').join('、')}；其余由 CI 补。`
  if (errors.some(error => String(error.instancePath ?? '').startsWith('/name'))) return 'name.zh 与 name.en 都必须是非空字符串。'
  if (missing.length) return `缺少字段：${[...new Set(missing)].join('、')}；若来自薄条目，先检查 package.json 与 cordis.patch.yml。`
  return ''
}

export function readBlock(source, markers) {
  const start = source.indexOf(markers.start)
  const end = source.indexOf(markers.end)
  if (start < 0 || end < 0 || end < start) return null
  return source.slice(start + markers.start.length, end).trim()
}

export function replaceBlock(source, markers, block) {
  const start = source.indexOf(markers.start)
  const end = source.indexOf(markers.end)
  if (start < 0 || end < 0 || end < start) return null
  return `${source.slice(0, start + markers.start.length)}\n${block}\n${source.slice(end)}`
}

export async function checkReadmes(contract, { write = false } = {}) {
  const results = []
  for (const [locale, path] of Object.entries(readmes)) {
    const source = await readFile(path, 'utf8')
    const block = renderBlock(contract, locale)
    const existing = readBlock(source, contract.markers)
    if (existing === null) throw new Error(`${path}: missing submission-contract markers`)
    if (existing === block) {
      results.push({ locale, path, status: 'ok' })
      continue
    }
    if (write) {
      await writeFile(path, replaceBlock(source, contract.markers, block))
      results.push({ locale, path, status: 'written' })
      continue
    }
    throw new Error(`${path}: submission contract block is stale; run node scripts/submission-contract.mjs --write`)
  }
  return results
}

async function main(args) {
  const write = args.includes('--write')
  const contract = await loadContract()
  const schema = await loadSchema()
  const stats = assertContractCoversSchema(contract, schema)
  const results = await checkReadmes(contract, { write })
  for (const result of results) console.log(`${result.status}\t${result.path}`)
  console.log(`contract covers ${stats.classified}/${stats.properties} schema fields`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message)
    process.exit(1)
  })
}
