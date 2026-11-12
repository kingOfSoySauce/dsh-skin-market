import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse, stringify } from 'yaml'
import { primaryLoaderIdFromPatch } from './loader-rows.mjs'
import { permitsCommercialUse } from './license.mjs'
import { clientEntryPath, inspectSkinHealth } from './skin-health.mjs'

export const THIN_SUBMISSION_KEYS = ['url', 'subpath', 'description', 'name', 'author', 'screenshots']
const THIN_KEYS = new Set(THIN_SUBMISSION_KEYS)
const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|gif)(?:$|\?)/i

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function extraThinSubmissionKeys(value) {
  if (!isRecord(value)) return []
  return Object.keys(value).filter(key => !THIN_KEYS.has(key))
}

export function isThinSubmission(value) {
  if (!isRecord(value)) return false
  if (typeof value.url !== 'string' || value.url.trim() === '') return false
  return extraThinSubmissionKeys(value).length === 0
}

export function thinSubmissionHint(value) {
  const extras = extraThinSubmissionKeys(value)
  if (typeof value?.url !== 'string' || value.install !== undefined || extras.length === 0) return ''
  return `not a thin submission because of extra keys: ${extras.join(', ')}. Keep only ${THIN_SUBMISSION_KEYS.join(', ')} — CI hydrates package, rowId, install, license, screenshots and health. If registry:check reports missing id/install, delete the extra keys; do not complete the full schema.`
}

export function parseGitHubTarget(url, explicitSubpath = null) {
  let parsed
  try { parsed = new URL(url) } catch { return null }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') return null
  const parts = parsed.pathname.replace(/\.git$/, '').split('/').filter(Boolean)
  if (parts.length < 2) return null
  let subpath = explicitSubpath
  if (!subpath && parts[2] === 'tree' && parts.length >= 5) subpath = parts.slice(4).join('/')
  return {
    owner: parts[0],
    repo: parts[1],
    fullName: `${parts[0]}/${parts[1]}`,
    subpath: subpath || null,
    repository: `https://github.com/${parts[0]}/${parts[1]}`,
  }
}

export function submissionFilename(target) {
  const sub = target.subpath ? `--${target.subpath.replaceAll('/', '--')}` : ''
  return `${target.owner}__${target.repo}${sub}.yml`.replace(/[^A-Za-z0-9_.-]/g, '_')
}

function safeId(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')
}

async function defaultFetchText(url, { timeout = 20000, json = false } = {}) {
  const headers = {
    'user-agent': 'dsh-skin-market-hydrate/0.1.0',
    accept: json ? 'application/vnd.github+json' : '*/*',
  }
  if (json) headers['x-github-api-version'] = '2022-11-28'
  const token = process.env.GITHUB_TOKEN?.trim()
  if (token && json) headers.authorization = `Bearer ${token}`
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return json ? response.json() : response.text()
}

function prefix(target, path) {
  return target.subpath ? `${target.subpath.replace(/^\/+|\/+$/g, '')}/${path}` : path
}

function readmeImages(text, target, sha) {
  if (typeof text !== 'string') return []
  const values = []
  for (const raw of readmeImageValues(text)) {
    if (typeof raw !== 'string' || raw.startsWith('data:') || raw.startsWith('#')) continue
    try {
      const absolute = new URL(raw, `https://raw.githubusercontent.com/${target.fullName}/${sha}/${prefix(target, '')}`)
      if (IMAGE_EXTENSION.test(absolute.pathname)) values.push(absolute.href)
    } catch { /* skip */ }
  }
  return [...new Set(values)].slice(0, 6)
}

/** Extract inline, reference and HTML image sources from a pinned README. */
export function readmeImageValues(text) {
  if (typeof text !== 'string') return []
  const values = []
  const definitions = new Map()
  for (const match of text.matchAll(/^[ \t]{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/gm)) definitions.set(match[1].trim().toLowerCase(), match[2] ?? match[3])
  for (const match of text.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/gi)) values.push(match[1] ?? match[2])
  for (const match of text.matchAll(/!\[([^\]]*)\]\[([^\]]*)\]/g)) {
    const label = (match[2] || match[1]).trim().toLowerCase()
    if (definitions.has(label)) values.push(definitions.get(label))
  }
  for (const match of text.matchAll(/!\[([^\]]+)\](?![\[(])/g)) {
    const label = match[1].trim().toLowerCase()
    if (definitions.has(label)) values.push(definitions.get(label))
  }
  for (const match of text.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const src = /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(match[0])
    if (src) values.push(src[1] ?? src[2] ?? src[3])
    const srcset = /\bsrcset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(match[0])
    if (srcset) {
      for (const candidate of (srcset[1] ?? srcset[2] ?? srcset[3]).split(',')) {
        const value = candidate.trim().split(/\s+/)[0]
        if (value) values.push(value)
      }
    }
  }
  return [...new Set(values.filter(value => typeof value === 'string' && value !== ''))]
}

const DSH_VERSION = String.raw`0\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+)?`
const DSH_COMPARATOR = String.raw`(?:>=|<=|>|<|\^|~|=)?\s*${DSH_VERSION}`
const DSH_RANGE = new RegExp(String.raw`${DSH_COMPARATOR}(?:\s+${DSH_COMPARATOR})*(?:\s*\|\|\s*${DSH_COMPARATOR}(?:\s+${DSH_COMPARATOR})*)*`, 'g')
const DSH_KEYWORD = /DSH\b|DeepSeek[-\s]Harness|Harness\b|官方 Desktop|\bDesktop\b|\bWeb\b|兼容|支持/g
const NEWER_THAN_STATED = /^\s*(?:及以上|以上|或更高|及更新|或更新|and newer|or newer|and above|or later)/i

/**
 * Read the Web / official Desktop DSH version declaration from a README.
 * A repo may state both tracks, so every nearby declaration is kept as a
 * separate `||` clause instead of silently dropping the Desktop one.
 */
export function statedDshCompatibility(readme) {
  if (typeof readme !== 'string' || readme.trim() === '') return null
  const ranges = []
  for (const keyword of readme.matchAll(DSH_KEYWORD)) {
    const start = (keyword.index ?? 0) + keyword[0].length
    const lineEnd = readme.indexOf('\n', start)
    const window = readme.slice(start, lineEnd < 0 ? undefined : lineEnd).slice(0, 160)
    DSH_RANGE.lastIndex = 0
    const match = DSH_RANGE.exec(window)
    if (match === null) continue
    const raw = match[0].replace(/\s+/g, ' ').trim()
    // A bare stable package version is usually not a host compatibility claim.
    if (!/[<>=^~]/.test(raw) && !/-[0-9A-Za-z]/.test(raw)) continue
    const tail = window.slice((match.index ?? 0) + match[0].length)
    ranges.push(/[<>=^~]/.test(raw) || !NEWER_THAN_STATED.test(tail) ? raw : `>=${raw}`)
  }
  const unique = [...new Set(ranges)]
  return unique.length === 0 ? null : unique.slice(0, 4).join(' || ')
}

function compatibility(pkg, readme) {
  const stated = statedDshCompatibility(readme)
  if (stated) return stated
  const groups = [pkg.peerDependencies ?? {}, pkg.dependencies ?? {}, pkg.devDependencies ?? {}]
  const candidates = groups.flatMap(group => Object.entries(group).filter(([name]) => name.startsWith('@deepseek-ai/dsh-')))
  const dependency = candidates.map(([, version]) => String(version)).find(version => /\d/.test(version) && !version.startsWith('workspace:'))
  return dependency ?? null
}

function parsePackage(text) {
  if (typeof text !== 'string') return null
  try { return JSON.parse(text) } catch { return null }
}

export async function hydrateSkinSubmission(draft, options = {}) {
  const fetchText = options.fetchText ?? defaultFetchText
  const now = options.now ?? new Date().toISOString()
  const target = parseGitHubTarget(draft.url, draft.subpath ?? null)
  if (target === null) throw new Error('url must be a GitHub repository or tree path')

  const repoMeta = await fetchText(`https://api.github.com/repos/${target.fullName}`, { json: true }).catch(() => null)
  const sha = typeof options.sha === 'string' ? options.sha : await (async () => {
    const ref = repoMeta?.default_branch
      ? await fetchText(`https://api.github.com/repos/${target.fullName}/commits/${repoMeta.default_branch}`, { json: true }).catch(() => null)
      : null
    const fromApi = typeof ref?.sha === 'string' ? ref.sha : null
    if (fromApi && /^[0-9a-f]{40}$/.test(fromApi)) return fromApi
    throw new Error(`cannot resolve HEAD for ${target.fullName}`)
  })()

  const raw = path => fetchText(`https://raw.githubusercontent.com/${target.fullName}/${sha}/${prefix(target, path)}`)
  const [packageText, patchText, readme, licenseText, screenshotsJson] = await Promise.all([
    raw('package.json'),
    raw('cordis.patch.yml'),
    raw('README.md'),
    raw('LICENSE'),
    raw('screenshots.json'),
  ])
  const pkg = parsePackage(packageText)
  if (!pkg?.name) throw new Error('package.json name missing')
  if (!pkg?.version) throw new Error('package.json version missing')
  if (!pkg?.dsh?.client) throw new Error('dsh.client missing')

  const primaryLoader = primaryLoaderIdFromPatch(typeof patchText === 'string' ? patchText : '', pkg.name)
  const rowId = primaryLoader.id
  if (!rowId) throw new Error(primaryLoader.reason ?? 'loader row id missing')

  let declaredScreenshots = Array.isArray(draft.screenshots) ? draft.screenshots : []
  if (declaredScreenshots.length === 0 && typeof screenshotsJson === 'string') {
    try {
      const parsed = JSON.parse(screenshotsJson)
      const list = Array.isArray(parsed) ? parsed : parsed?.screenshots
      if (Array.isArray(list)) {
        declaredScreenshots = list
          .filter(item => typeof item === 'string')
          .map(item => new URL(item, `https://raw.githubusercontent.com/${target.fullName}/${sha}/${prefix(target, '')}`).href)
      }
    } catch { /* ignore */ }
  }
  const screenshots = [...new Set([...declaredScreenshots, ...readmeImages(readme, target, sha)])]
    .filter(url => /^https:\/\//.test(url) && IMAGE_EXTENSION.test(url))
    .slice(0, 8)

  const licenseCode = typeof pkg.license === 'string' ? pkg.license : licenseText?.startsWith('MIT License') ? 'MIT' : null
  if (!licenseCode) throw new Error('license missing')

  const dshVersion = compatibility(pkg, readme)
  const displayName = target.subpath ? target.subpath.split('/').pop() : target.repo
  const description = typeof draft.description === 'string' && draft.description.trim()
    ? draft.description.trim()
    : (typeof pkg.description === 'string' && pkg.description.trim() ? pkg.description.trim() : null)
  if (!description) throw new Error('description missing; add description to the YAML or package.json')

  const clientPath = clientEntryPath(pkg)
  const clientSource = clientPath
    ? await raw(clientPath.replace(/^\.\//, ''))
    : null
  const health = inspectSkinHealth({
    pkg,
    rowId,
    readmeScreenshotCount: screenshots.length,
    compatibility: dshVersion,
    clientEntryPresent: clientSource !== null,
    readmeHasInstallCommand: /\bdsh\s+plugin\b[^\n]*\badd\b/i.test(readme ?? ''),
    hasDshPluginTopic: Array.isArray(repoMeta?.topics) && repoMeta.topics.includes('dsh-plugin'),
  })

  const name = isRecord(draft.name) && typeof draft.name.zh === 'string' && typeof draft.name.en === 'string'
    ? { zh: draft.name.zh, en: draft.name.en }
    : { zh: displayName, en: displayName }

  return {
    id: `${safeId(target.owner)}.${safeId(displayName)}`,
    name,
    author: typeof draft.author === 'string' && draft.author.trim() ? draft.author.trim() : target.owner,
    description,
    repo: target.repository,
    ...(target.subpath ? { subpath: target.subpath } : {}),
    package: pkg.name,
    rowId,
    category: 'skin',
    tags: ['appearance'],
    modes: ['light', 'dark'],
    install: {
      target: `github:${target.fullName}#${sha}${target.subpath ? `&path:/${target.subpath.replace(/^\/+/, '')}` : ''}`,
      version: pkg.version,
      commit: sha,
    },
    compatibility: {
      dsh: dshVersion ?? 'unverified',
      platform: ['web'],
    },
    screenshots,
    review: {
      compatibility: dshVersion ? 'verified' : 'unverified',
      preview: screenshots.length > 0 ? 'verified' : 'repository-card',
      installation: health.checks.installation === 'pass' ? 'verified' : 'manual-only',
    },
    health,
    license: {
      code: licenseCode,
      commercialUse: permitsCommercialUse(licenseCode),
    },
    featuredRank: 1000,
    starsSnapshot: Number.isInteger(repoMeta?.stargazers_count) ? repoMeta.stargazers_count : 0,
    releaseUpdatedAt: now,
    metadataUpdatedAt: now,
    starsUpdatedAt: now,
    updatedAt: now,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv.find(argument => argument.startsWith('--file='))?.slice('--file='.length)
  if (!file) {
    console.error('Usage: node scripts/hydrate-submission.mjs --file=registry/skins/<entry>.yml')
    process.exit(1)
  }
  const path = resolve(file)
  const draft = parse(await readFile(path, 'utf8'))
  if (!isThinSubmission(draft)) throw new Error(`${file} is not a thin submission (url-only YAML)`)
  const skin = await hydrateSkinSubmission(draft)
  await writeFile(path, stringify(skin, { lineWidth: 0 }))
  console.log(`hydrated ${file} → ${skin.id} @ ${skin.install.commit}`)
}
