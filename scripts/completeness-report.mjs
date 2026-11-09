import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_PREVIEW = /opengraph\.githubassets\.com|repository-images\.githubusercontent\.com|dshfind\.com\/api\/card/i
const MARKET_ASSET = /(?:^skin-screenshots\/)|(?:kingofsoysauce\.github\.io\/dsh-skin-market\/skin-screenshots\/)/i

function list(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

/** classify how the market preview is backed: capture, upstream, repository card, or missing. */
export function previewState(skin) {
  const screenshots = list(skin.screenshots)
  const market = list(skin.marketScreenshots)
  if (market.length > 0 || screenshots.some(url => MARKET_ASSET.test(url))) return 'capture'
  const real = screenshots.filter(url => !REPOSITORY_PREVIEW.test(url))
  if (real.length > 0 && skin.review?.preview !== 'repository-card') return 'upstream'
  if (screenshots.length === 0) return 'missing'
  return 'card'
}

/** classify display copy: approved, partial, or missing. */
export function copyState(copyEntry) {
  if (!copyEntry || typeof copyEntry !== 'object') return 'missing'
  if (copyEntry.descriptionPolicy === 'omit') return 'approved'
  const name = copyEntry.name ?? {}
  const description = copyEntry.description ?? {}
  const hasName = typeof name.zh === 'string' && name.zh.trim() !== '' && typeof name.en === 'string' && name.en.trim() !== ''
  const hasDescription = typeof description.zh === 'string' && description.zh.trim() !== '' && typeof description.en === 'string' && description.en.trim() !== ''
  if (hasName && hasDescription) return 'approved'
  if (hasName || hasDescription) return 'partial'
  return 'missing'
}

export function classifyCatalog(catalog) {
  const skins = Array.isArray(catalog?.skins) ? catalog.skins : []
  const copy = catalog?.displayCopy?.skins && typeof catalog.displayCopy.skins === 'object' ? catalog.displayCopy.skins : {}
  const items = skins.map(skin => ({
    id: skin.id,
    repo: skin.repo,
    preview: previewState(skin),
    copy: copyState(copy[skin.id]),
  }))
  const counts = { total: items.length, preview: { capture: 0, upstream: 0, card: 0, missing: 0 }, copy: { approved: 0, partial: 0, missing: 0 } }
  for (const item of items) {
    counts.preview[item.preview] += 1
    counts.copy[item.copy] += 1
  }
  return {
    counts,
    missingPreview: items.filter(item => item.preview === 'missing'),
    cardPreview: items.filter(item => item.preview === 'card'),
    missingCopy: items.filter(item => item.copy === 'missing'),
    partialCopy: items.filter(item => item.copy === 'partial'),
  }
}

function bullet(item, limit) {
  return `- \`${item.id}\` — ${item.repo ?? ''} — ${item.preview ?? item.copy}`
}

export function renderMarkdown(report, { limit = 30 } = {}) {
  const { counts } = report
  const lines = [
    '# 内容完整性报告',
    '',
    `- 条目：${counts.total}`,
    `- 预览：capture ${counts.preview.capture} / upstream ${counts.preview.upstream} / card ${counts.preview.card} / missing ${counts.preview.missing}`,
    `- 文案：approved ${counts.copy.approved} / partial ${counts.copy.partial} / missing ${counts.copy.missing}`,
    '',
    `## 缺预览（${report.missingPreview.length}）`,
    ...report.missingPreview.slice(0, limit).map(item => bullet(item, limit)),
    ...(report.missingPreview.length > limit ? [`- … 其余 ${report.missingPreview.length - limit} 条见 JSON`] : []),
    '',
    `## 仅仓库卡（${report.cardPreview.length}）`,
    ...report.cardPreview.slice(0, limit).map(item => bullet(item, limit)),
    ...(report.cardPreview.length > limit ? [`- … 其余 ${report.cardPreview.length - limit} 条见 JSON`] : []),
    '',
    `## 缺文案（${report.missingCopy.length}）`,
    ...report.missingCopy.slice(0, limit).map(item => bullet(item, limit)),
    ...(report.missingCopy.length > limit ? [`- … 其余 ${report.missingCopy.length - limit} 条见 JSON`] : []),
    '',
    `## 文案不完整（${report.partialCopy.length}）`,
    ...report.partialCopy.slice(0, limit).map(item => bullet(item, limit)),
  ]
  return lines.join('\n')
}

async function main(args) {
  const json = args.includes('--json')
  const limitIndex = args.indexOf('--limit')
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 30
  const catalog = JSON.parse(await readFile(join(root, 'data', 'catalog.json'), 'utf8'))
  const report = classifyCatalog(catalog)
  if (json) console.log(JSON.stringify(report, null, 2))
  else console.log(renderMarkdown(report, { limit: Number.isInteger(limit) && limit > 0 ? limit : 30 }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message)
    process.exit(1)
  })
}
