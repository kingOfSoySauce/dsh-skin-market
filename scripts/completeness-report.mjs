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
    // Full item list so `--json` snapshots can be diffed without rescanning the catalog.
    items,
    catalogGeneratedAt: typeof catalog?.generatedAt === 'string' ? catalog.generatedAt : null,
  }
}

/** Read classified items from a report, a catalog, or a pre-`items` snapshot. */
function reportItems(report) {
  if (Array.isArray(report)) return { items: report, complete: true }
  if (Array.isArray(report?.items)) return { items: report.items, complete: true }
  if (Array.isArray(report?.skins)) return { items: classifyCatalog(report).items, complete: true }
  if (!report || typeof report !== 'object') return { items: [], complete: false }
  // Older snapshots only carried issue lists; recover the entries they still identify.
  const byId = new Map()
  const remember = (entry, state) => {
    if (!entry || typeof entry.id !== 'string') return
    byId.set(entry.id, { ...byId.get(entry.id), ...entry, ...state })
  }
  if (Array.isArray(report.missingPreview)) for (const entry of report.missingPreview) remember(entry, { preview: 'missing' })
  if (Array.isArray(report.cardPreview)) for (const entry of report.cardPreview) remember(entry, { preview: 'card' })
  if (Array.isArray(report.missingCopy)) for (const entry of report.missingCopy) remember(entry, { copy: 'missing' })
  if (Array.isArray(report.partialCopy)) for (const entry of report.partialCopy) remember(entry, { copy: 'partial' })
  const items = [...byId.values()]
  // If the old report's total matches the recovered entries, every entry was in an issue list.
  return { items, complete: Number.isInteger(report.counts?.total) && report.counts.total === items.length }
}

function itemMap(items) {
  const map = new Map()
  for (const item of items) if (item && typeof item.id === 'string') map.set(item.id, item)
  return map
}

function statusOf(item) {
  return {
    preview: typeof item?.preview === 'string' ? item.preview : null,
    copy: typeof item?.copy === 'string' ? item.copy : null,
  }
}

/** Compare two full reports and return only added, removed, and state-changed entries. */
export function diffReports(previous, current) {
  const previousReport = reportItems(previous)
  const currentReport = reportItems(current)
  const previousById = itemMap(previousReport.items)
  const currentById = itemMap(currentReport.items)
  const canCompareSets = previousReport.complete && currentReport.complete
  const added = canCompareSets ? [...currentById.keys()].filter(id => !previousById.has(id)) : []
  const removed = canCompareSets ? [...previousById.keys()].filter(id => !currentById.has(id)) : []
  const changed = []
  for (const [id, afterItem] of currentById) {
    const beforeItem = previousById.get(id)
    if (!beforeItem) continue
    const before = statusOf(beforeItem)
    const after = statusOf(afterItem)
    const previewChanged = before.preview !== null && after.preview !== null && before.preview !== after.preview
    const copyChanged = before.copy !== null && after.copy !== null && before.copy !== after.copy
    if (!previewChanged && !copyChanged) continue
    changed.push({ id, repo: afterItem.repo ?? beforeItem.repo, before, after })
  }
  const total = currentReport.complete
    ? currentReport.items.length
    : Number.isInteger(current?.counts?.total)
      ? current.counts.total
      : currentById.size
  return {
    added,
    removed,
    changed,
    counts: { total, added: added.length, removed: removed.length, changed: changed.length },
  }
}

function bullet(item, field) {
  return `- \`${item.id}\` — ${item.repo ?? ''} — ${item[field]}`
}

export function renderMarkdown(report, { limit = 30 } = {}) {
  const { counts } = report
  const lines = [
    '# 内容完整性报告',
    '',
    `- catalog generatedAt: ${report.catalogGeneratedAt ?? 'unknown'}`,
    `- 条目：${counts.total}`,
    `- 预览：capture ${counts.preview.capture} / upstream ${counts.preview.upstream} / card ${counts.preview.card} / missing ${counts.preview.missing}`,
    `- 文案：approved ${counts.copy.approved} / partial ${counts.copy.partial} / missing ${counts.copy.missing}`,
    '',
    `## 缺预览（${report.missingPreview.length}）`,
    ...report.missingPreview.slice(0, limit).map(item => bullet(item, 'preview')),
    ...(report.missingPreview.length > limit ? [`- … 其余 ${report.missingPreview.length - limit} 条见 JSON`] : []),
    '',
    `## 仅仓库卡（${report.cardPreview.length}）`,
    ...report.cardPreview.slice(0, limit).map(item => bullet(item, 'preview')),
    ...(report.cardPreview.length > limit ? [`- … 其余 ${report.cardPreview.length - limit} 条见 JSON`] : []),
    '',
    `## 缺文案（${report.missingCopy.length}）`,
    ...report.missingCopy.slice(0, limit).map(item => bullet(item, 'copy')),
    ...(report.missingCopy.length > limit ? [`- … 其余 ${report.missingCopy.length - limit} 条见 JSON`] : []),
    '',
    `## 文案不完整（${report.partialCopy.length}）`,
    ...report.partialCopy.slice(0, limit).map(item => bullet(item, 'copy')),
  ]
  return lines.join('\n')
}

export function renderDiffMarkdown(diff, { limit = 30 } = {}) {
  const { counts } = diff
  const lines = [
    '# 内容完整性增量报告',
    '',
    `- catalog generatedAt: ${diff.catalogGeneratedAt ?? 'unknown'}`,
    `- 当前条目：${counts.total}`,
    `- 新增：${counts.added} / 移除：${counts.removed} / 变化：${counts.changed}`,
  ]
  if (counts.added + counts.removed + counts.changed === 0) lines.push('', '无变化。')
  lines.push(
    '',
    `## 新增（${diff.added.length}）`,
    ...diff.added.slice(0, limit).map(id => `- \`${id}\``),
    ...(diff.added.length > limit ? [`- … 其余 ${diff.added.length - limit} 条见 JSON`] : []),
    '',
    `## 移除（${diff.removed.length}）`,
    ...diff.removed.slice(0, limit).map(id => `- \`${id}\``),
    ...(diff.removed.length > limit ? [`- … 其余 ${diff.removed.length - limit} 条见 JSON`] : []),
    '',
    `## 变化（${diff.changed.length}）`,
    ...diff.changed.slice(0, limit).map(item => {
      const changes = []
      if (item.before.preview !== item.after.preview) changes.push(`预览 ${item.before.preview} → ${item.after.preview}`)
      if (item.before.copy !== item.after.copy) changes.push(`文案 ${item.before.copy} → ${item.after.copy}`)
      return `- \`${item.id}\` — ${item.repo ?? ''} — ${changes.join('；')}`
    }),
    ...(diff.changed.length > limit ? [`- … 其余 ${diff.changed.length - limit} 条见 JSON`] : []),
  )
  return lines.join('\n')
}

async function main(args) {
  const json = args.includes('--json')
  const limitIndex = args.indexOf('--limit')
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 30
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 30
  const sinceIndex = args.indexOf('--since')
  const inlineSince = args.find(arg => arg.startsWith('--since='))
  let since = inlineSince ? inlineSince.slice('--since='.length) : null
  if (since === null && sinceIndex >= 0) {
    since = args[sinceIndex + 1]
    if (!since || since.startsWith('--')) throw new Error('--since 需要一个快照文件路径，例如 --since snapshot.json')
  }
  if (since === '') throw new Error('--since 需要一个快照文件路径，例如 --since snapshot.json')

  const catalog = JSON.parse(await readFile(join(root, 'data', 'catalog.json'), 'utf8'))
  const report = classifyCatalog(catalog)
  if (since !== null) {
    const previous = JSON.parse(await readFile(resolve(since), 'utf8'))
    if (!Array.isArray(previous) && !Array.isArray(previous?.items) && !Array.isArray(previous?.skins)) {
      console.error('warning: 上一份快照没有 items，新增/移除可能不完整；请用当前版本重新生成基线快照。')
    }
    const diff = { ...diffReports(previous, report), catalogGeneratedAt: report.catalogGeneratedAt }
    if (json) console.log(JSON.stringify(diff, null, 2))
    else console.log(renderDiffMarkdown(diff, { limit: safeLimit }))
    return
  }
  if (json) console.log(JSON.stringify(report, null, 2))
  else console.log(renderMarkdown(report, { limit: safeLimit }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message)
    process.exit(1)
  })
}
