import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse, stringify } from 'yaml'
import { primaryLoaderIdFromPatch } from './loader-rows.mjs'
import { permitsCommercialUse } from './license.mjs'
import { clientEntryPath, inspectSkinHealth } from './skin-health.mjs'

const THIN_KEYS = new Set(['url', 'subpath', 'description', 'name', 'author', 'screenshots'])
const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|gif)(?:$|\?)/i

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isThinSubmission(value) {
  if (!isRecord(value)) return false
  if (typeof value.url !== 'string' || value.url.trim() === '') return false
  return Object.keys(value).every(key => THIN_KEYS.has(key))
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
  for (const match of text.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/gi)) {
    const raw = match[1] ?? match[2]
    if (typeof raw !== 'string') continue
    try {
      const absolute = new URL(raw, `https://raw.githubusercontent.com/${target.fullName}/${sha}/${prefix(target, '')}`)
      if (IMAGE_EXTENSION.test(absolute.pathname)) values.push(absolute.href)
    } catch { /* skip */ }
  }
  return [...new Set(values)].slice(0, 6)
}

function compatibility(pkg, readme) {
  const stated = /(?:DSH|DeepSeek Harness|Harness|兼容|支持)[^\n]{0,120}?((?:>=|\^|~)?\s*0\.1\.0-rc\.\d+)/i.exec(readme ?? '')?.[1]
  if (stated) return stated.replace(/\s+/g, '')
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
    category: 'theme',
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
