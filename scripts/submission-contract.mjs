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
  const duplicated = contract.authorFields.filter(field => contract.autoFields.includes(field))
  if (duplicated.length) throw new Error(`fields cannot be both author-filled and auto-filled: ${duplicated.join(', ')}`)
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
  const lines = zh
    ? [
        '| 类别 | 字段 / 项 | 规则 |',
        '| --- | --- | --- |',
        `| 作者写（薄条目） | ${author} | 只写这些；\`name\` 写了就必须同时有 \`zh\` 和 \`en\`。 |`,
        `| CI 自动补 | ${auto} | 不要手写；写了会被 schema 拒绝。 |`,
        `| 软必填（不阻断，进补全队列） | ${soft} | 缺了仍可合并，但会进补全队列并在每日报告出现。 |`,
        `| 推荐（只提示） | ${recommended} | 不阻断合并。 |`,
      ]
    : [
        '| Group | Fields / items | Rule |',
        '| --- | --- | --- |',
        `| Author (thin entry) | ${author} | Write only these. If you write \`name\`, include both \`zh\` and \`en\`. |`,
        `| Filled by CI | ${auto} | Do not write these; the schema rejects them. |`,
        `| Soft-required (non-blocking, enters the completion queue) | ${soft} | An entry may merge without them, but it enters the completion queue and the daily report. |`,
        `| Recommended (advisory only) | ${recommended} | Never blocks a merge. |`,
      ]
  return lines.join('\n')
}


/** Turn Ajv errors into one actionable sentence for thin submissions. */
export function schemaErrorHint(contract, errors = []) {
  const missing = errors.filter(error => error.keyword === 'required').map(error => error.params?.missingProperty).filter(Boolean)
  if (missing.includes('name')) return 'name 必须同时有 zh 和 en；薄条目里写了 name 就两个都写。'
  const extra = errors.find(error => error.keyword === 'additionalProperties')
  if (extra) return `薄条目只允许这些字段：${contract.authorFields.map(field => '`' + field + '`').join('、')}；其余由 CI 补。`
  if (errors.some(error => String(error.instancePath ?? '').startsWith('/name'))) return 'name.zh 与 name.en 都必须是非空字符串。'
  if (missing.length) return `缺少字段：${[...new Set(missing)].join('、')}；薄条目补不齐时先检查 package.json 与 cordis.patch.yml。`
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
