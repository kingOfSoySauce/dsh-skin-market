// Nightly documentation sync uses dsh-skin-market-ops/scripts/update-docs.mjs.
// This copy is only the public test helper. Do not treat it as the ingestion writer.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const RECENT_START = '<!-- DSH_SKIN_MARKET_AUTO_RECENT:START -->'
const RECENT_END = '<!-- DSH_SKIN_MARKET_AUTO_RECENT:END -->'
const MARKET_ASSET_BASE = 'https://kingofsoysauce.github.io/dsh-skin-market/'
const METADATA_LINE = /^\s*-\s*(?:收录版本|版本|固定 commit|许可|子目录|类型|社区 PR)[:：]/
const INTERNAL_EVIDENCE = /(?:固定版本|固定 commit|隔离 DSH|隔离环境|实机|三视图|运行 GIF|静态仓库素材|当前宿主|当前目录预览|许可边界|package 未声明 license|素材许可|模型素材许可)/

function replaceMarkedBlock(source, start, end, block) {
  const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`)
  return pattern.test(source) ? source.replace(pattern, () => block) : null
}

function repoLabel(repo) {
  return String(repo ?? '').replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '')
}

function formatDate(value) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? String(value ?? '').slice(0, 10) : parsed.toISOString().slice(0, 10)
}

function safeText(value) {
  return String(value ?? '')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, entity => ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[entity.toLowerCase()]))
    .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
    .replace(/<[^>]*(?:>|$)/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function cleanDescription(value) {
  const description = safeText(value)
  if (!description) return ''
  return description
    .split(/(?<=[。！？!?；;])/u)
    .filter(sentence => !INTERNAL_EVIDENCE.test(sentence))
    .join('')
    .replace(/；\s*(?:固定版本|固定 commit|隔离 DSH|隔离环境|实机|三视图|运行 GIF|静态仓库素材|当前宿主|当前目录预览|许可边界|package 未声明 license|素材许可|模型素材许可)[^。；]*[。]?/g, '')
    .replace(/\s*；\s*$/u, '')
    .trim()
}

function assetUrl(value) {
  if (!value) return null
  const text = String(value)
  if (/^https?:\/\//i.test(text)) return text
  if (text.startsWith('skin-screenshots/')) return `${MARKET_ASSET_BASE}${text}`
  return null
}

function selectEntryImage(entry) {
  const candidates = [...(entry?.screenshots ?? []), ...(entry?.marketScreenshots ?? [])]
    .filter(value => assetUrl(value) && !/opengraph\.githubassets\.com|repository-card/i.test(value))
  const gif = candidates.find(value => /\.gif(?:$|[?#])/i.test(value))
  return assetUrl(gif ?? candidates[0] ?? null)
}

function escapeAttribute(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function entryName(entry) {
  return safeText(entry?.name?.zh ?? entry?.name?.en) || repoLabel(entry?.repo)
}

function entryBlock(entry, existingImage = null) {
  const name = entryName(entry)
  const author = safeText(entry.author) || repoLabel(entry.repo).split('/')[0]
  const description = cleanDescription(entry.description) || name
  const image = selectEntryImage(entry) ?? existingImage
  return [
    `<!-- dsh-auto-entry:${entry.id} -->`,
    `### ${formatDate(entry.updatedAt)} · ${name}`,
    '',
    author ? `作者：${author}` : '',
    '',
    description,
    '',
    `GitHub：[${repoLabel(entry.repo)}](${entry.repo})`,
    image ? `\n<img src="${escapeAttribute(image)}" width="60%" alt="${escapeAttribute(name)}">` : '',
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function autoEntries(source) {
  return source.match(/<!-- dsh-auto-entry:[^\n]+ -->[\s\S]*?(?=<!-- dsh-auto-entry:|$)/g) ?? []
}

function normalizeExistingAutoEntry(block) {
  const id = /<!-- dsh-auto-entry:([^\n]+) -->/.exec(block)?.[1]
  const heading = block.match(/^###\s+([^\n]+)/m)?.[1] ?? '自动同步条目'
  const repo = block.match(/\]\((https?:\/\/github\.com\/[^)]+)\)/i)?.[1]
  if (!id || !repo) return block.trim()
  const image = block.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1] ?? null
  const description = cleanDescription(block.split(/\n\n/).find(part => part && !part.startsWith('<!--') && !part.startsWith('###') && !part.startsWith('[') && !part.startsWith('GitHub') && !METADATA_LINE.test(part)))
  const [, date = ''] = heading.match(/^(\d{4}-\d{2}-\d{2})/) ?? []
  return entryBlock({ id, updatedAt: date, name: { zh: heading.replace(/^\d{4}-\d{2}-\d{2}\s*·\s*/, '') }, author: repoLabel(repo).split('/')[0], description, repo }, image)
}

function updateReadme(source, changes) {
  if (changes.length === 0) return source
  const featured = changes[0]
  const name = entryName(featured)
  const description = cleanDescription(featured.description) || name
  const line = `- **${formatDate(featured.updatedAt)}**：[${repoLabel(featured.repo)}](${featured.repo})（${name}）——${description}。详见[收录日志](./docs/recently-added.md)。`
  const heading = /^(#{1,6})[ \t]+近期收录[ \t]*\r?$/m.exec(source)
  if (!heading) return source
  const start = heading.index + heading[0].length
  const tail = source.slice(start)
  const nextHeading = /\n#{1,6}[ \t]+/.exec(tail)
  const end = nextHeading ? start + nextHeading.index : source.length
  const section = source.slice(start, end)
  const datedBullet = /^[ \t]*[-*][ \t]+(?:\*\*)?\[?\d{4}-\d{2}-\d{2}[^\n\r]*/m
  const updated = datedBullet.test(section) ? section.replace(datedBullet, () => line) : `\n\n${line}${section}`
  return source.slice(0, start) + updated + source.slice(end)
}

function updateRecentlyAdded(source, changes, removedIds = new Set()) {
  const start = source.indexOf(RECENT_START)
  const end = source.indexOf(RECENT_END)
  if ((start >= 0) !== (end >= 0) || (start >= 0 && end < start)) throw new Error('Malformed AUTO_RECENT markers; refusing to edit manual history')
  if (changes.length === 0 && (removedIds.size === 0 || start < 0)) return source
  const fresh = changes
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .filter(entry => !removedIds.has(entry.id))
    .map(entry => entryBlock(entry))
  const existingBlock = start < 0 ? '' : source.slice(start + RECENT_START.length, end)
  const entries = []
  const seen = new Set()
  for (const raw of [...fresh, ...autoEntries(existingBlock)]) {
    const id = /<!-- dsh-auto-entry:([^\n]+) -->/.exec(raw)?.[1]
    if (!id || seen.has(id) || removedIds.has(id)) continue
    seen.add(id)
    entries.push(raw.startsWith('<!-- dsh-auto-entry:') && fresh.some(entry => entry.includes(`dsh-auto-entry:${id}`)) ? raw.trim() : normalizeExistingAutoEntry(raw))
  }
  const block = `${RECENT_START}\n## 自动同步更新\n\n${entries.join('\n\n')}\n${RECENT_END}`
  const replaced = replaceMarkedBlock(source, RECENT_START, RECENT_END, block)
  if (replaced !== null) return replaced
  const firstSection = source.search(/^##\s+/m)
  return firstSection >= 0
    ? `${source.slice(0, firstSection)}${block}\n\n${source.slice(firstSection)}`
    : `${source.trimEnd()}\n\n${block}\n`
}

export async function updateProjectDocs({ root, catalogCount: _catalogCount, syncAt: _syncAt, changes = [], removedIds = [] }) {
  const readmePath = join(root, 'README.md')
  const recentPath = join(root, 'docs/recently-added.md')
  const readme = await readFile(readmePath, 'utf8')
  const recent = await readFile(recentPath, 'utf8')
  const nextReadme = updateReadme(readme, changes)
  const nextRecent = updateRecentlyAdded(recent, changes, new Set(removedIds))
  if (nextReadme !== readme) await writeFile(readmePath, nextReadme)
  if (nextRecent !== recent) await writeFile(recentPath, nextRecent)
}
