import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv/dist/2020.js'
import { parse, stringify } from 'yaml'
import { displayScreenshots } from './registry-screenshots.mjs'
import { mediaForSources } from './media.mjs'
import { isThinSubmission, hydrateSkinSubmission, thinSubmissionHint } from './hydrate-submission.mjs'
import { resolveScreenshotList, resolveScreenshotRef } from './screenshot-refs.mjs'
import { buildCatalogWire } from './catalog-wire.mjs'
import { loadContract, schemaErrorHint } from './submission-contract.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checkOnly = process.argv.includes('--check')
const schema = JSON.parse(await readFile(join(root, 'registry/skin.schema.json'), 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false })
const validate = ajv.compile(schema)
const submissionContract = await loadContract()
const sourceDir = join(root, 'registry/skins')
const files = (await readdir(sourceDir)).filter(file => file.endsWith('.yml')).sort()
const skins = []

const versionTerm = /^(>=|<=|>|<|=|\^|~)?\s*\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
function isVersionRange(value) {
  if (value === 'unverified') return true
  return value.split('||').every(alternative => alternative.trim().split(/\s+/).filter(Boolean).every(term => versionTerm.test(term)))
}

function isCanonicalIntegrity(value) {
  const match = /^(sha(?:1|256|384|512))-([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (match === null) return false
  const digest = Buffer.from(match[2], 'base64')
  const bytes = { sha1: 20, sha256: 32, sha384: 48, sha512: 64 }
  return digest.length === bytes[match[1]] && digest.toString('base64') === match[2]
}

for (const file of files) {
  let skin = parse(await readFile(join(sourceDir, file), 'utf8'))
  if (isThinSubmission(skin)) {
    skin = await hydrateSkinSubmission(skin)
    if (!checkOnly) await writeFile(join(sourceDir, file), stringify(skin, { lineWidth: 0 }))
  }
  if (!validate(skin)) {
    const details = (validate.errors ?? []).map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')
    const hint = thinSubmissionHint(skin)
    const contractHint = schemaErrorHint(submissionContract, validate.errors ?? [])
    const parts = [details, hint, contractHint].filter(Boolean)
    throw new Error(`${file}: ${parts.join('; ')}`)
  }
  if (!isVersionRange(skin.compatibility.dsh)) throw new Error(`${file}: compatibility.dsh is not a supported semver range`)
  // Surface stale review data to maintainers without removing the entry or
  // rewriting it. The plugin confirms usable artifacts when users select them.
  for (const [field, integrity] of [['install.desktop.integrity', skin.install.desktop?.integrity], ['install.npm.integrity', skin.install.npm?.integrity]]) {
    if (integrity !== undefined && !isCanonicalIntegrity(integrity)) console.warn(`${file}: ${field} has an invalid SRI digest; recheck the recorded artifact`)
  }
  for (const adapter of skin.compatibility.adapters ?? []) {
    if (!isVersionRange(adapter.when)) throw new Error(`${file}: compatibility adapter ${adapter.id} has an invalid when range`)
  }
  if (skin.install.desktop?.mode === 'managed') {
    if (skin.install.desktop.packageName !== skin.package) throw new Error(`${file}: install.desktop.packageName must equal ${skin.package}`)
    if (skin.install.desktop.packageVersion !== skin.install.version) throw new Error(`${file}: install.desktop.packageVersion must equal install.version ${skin.install.version}`)
  }
  const repo = skin.repo.replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '')
  const expected = `github:${repo}#${skin.install.commit}${skin.subpath ? `&path:/${String(skin.subpath).replace(/^\/+/, '')}` : ''}`
  if (skin.install.target !== expected) throw new Error(`${file}: install.target must equal ${expected}`)
  for (const companion of skin.install.companions ?? []) {
    const match = /^github:([^#]+)#([0-9a-f]{40})(?:&path:\/([A-Za-z0-9._/-]+))?$/i.exec(companion.target)
    if (match === null) throw new Error(`${file}: companion ${companion.package} has an invalid target`)
    if (match[2] !== companion.commit) throw new Error(`${file}: companion ${companion.package} commit must match companion.commit`)
  }
  if ((skin.install.companions?.length ?? 0) > 0 && skin.install.desktop?.mode === 'managed') {
    throw new Error(`${file}: Desktop managed install cannot install companions`)
  }
  const npm = skin.install.npm
  if (npm !== undefined) {
    const npmRepo = npm.repository.replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '')
    if (npm.name !== skin.package) throw new Error(`${file}: install.npm.name must equal ${skin.package}`)
    if (npm.version !== skin.install.version) throw new Error(`${file}: install.npm.version must equal install.version`)
    if (npmRepo !== repo) throw new Error(`${file}: install.npm.repository must equal repo`)
    if (typeof npm.gitHead !== 'string' || !/^[0-9a-f]{40}$/i.test(npm.gitHead) || npm.gitHead.toLowerCase() !== skin.install.commit.toLowerCase()) throw new Error(`${file}: install.npm.gitHead must be a full commit matching install.commit`)
    const desktop = skin.install.desktop
    if (desktop?.mode === 'managed' && desktop.packageName === npm.name && desktop.packageVersion === npm.version
      && desktop.integrity !== undefined && desktop.integrity !== npm.integrity) {
      console.warn(`${file}: Desktop and npm record conflicting SRI for the same package release; recheck the review data`)
    }
  }
  if (skin.subpath !== undefined && skin.install.allowBuild !== undefined && !skin.install.allowBuild.endsWith(`#path:${skin.subpath}`)) {
    throw new Error(`${file}: install.allowBuild must end with #path:${skin.subpath}`)
  }
  if (skin.marketScreenshots) skin.marketScreenshots = resolveScreenshotList(skin.marketScreenshots)
  if (skin.listScreenshot) skin.listScreenshot = resolveScreenshotRef(skin.listScreenshot)
  const marketScreenshots = skin.marketScreenshots ?? []
  const screenshots = [...new Set(resolveScreenshotList(skin.screenshots))]
  const display = displayScreenshots(marketScreenshots, screenshots, skin.subpath, skin.listScreenshot, skin.review?.preview)
  if (display.length === 0) console.warn(`${file}: no displayable screenshot; keeping the entry without media`)
  const configuredListScreenshot = skin.listScreenshot
  const listScreenshot = configuredListScreenshot !== undefined
    ? (display.includes(configuredListScreenshot) ? configuredListScreenshot : display[0])
    : marketScreenshots.length > 0 ? display[0] : undefined
  const media = mediaForSources(display, listScreenshot ?? display[0])
  skins.push({ ...skin, ...(listScreenshot ? { listScreenshot } : {}), screenshots, ...(media ? { media } : {}) })
}

const ids = new Set()
const packages = new Set()
const rows = new Set()
for (const skin of skins) {
  if (ids.has(skin.id)) throw new Error(`duplicate id: ${skin.id}`)
  ids.add(skin.id)
  // Forks can publish the same package name or loader id. Install matching
  // still requires the pinned commit, so both entries can stay in the catalog.
  const packageKey = `${skin.package}\n${skin.repo}`
  if (packages.has(packageKey)) throw new Error(`duplicate package: ${skin.package} in ${skin.repo}`)
  packages.add(packageKey)
  const rowKey = `${skin.rowId}\n${skin.package}\n${skin.repo}`
  if (rows.has(rowKey)) throw new Error(`duplicate rowId: ${skin.rowId} for ${skin.package}`)
  rows.add(rowKey)
}

const catalogPath = join(root, 'data/catalog.json')
let previous
try {
  previous = JSON.parse(await readFile(catalogPath, 'utf8'))
} catch { /* first build */ }

// The heat step records a fresh star reading into the catalog after the
// registry was hydrated. A rebuild must not roll that back to an older
// snapshot, or the card and the detail chart disagree for a day.
if (previous?.skins !== undefined) {
  const fresher = new Map()
  for (const entry of Array.isArray(previous.skins) ? previous.skins : []) {
    if (typeof entry?.id !== 'string') continue
    const at = Date.parse(entry.starsUpdatedAt)
    if (!Number.isFinite(at) || !Number.isInteger(entry.starsSnapshot)) continue
    fresher.set(entry.id, { starsSnapshot: entry.starsSnapshot, starsUpdatedAt: entry.starsUpdatedAt, at })
  }
  for (const skin of skins) {
    const candidate = fresher.get(skin.id)
    if (candidate === undefined) continue
    const own = Date.parse(skin.starsUpdatedAt)
    if (Number.isFinite(own) && candidate.at <= own) continue
    skin.starsSnapshot = candidate.starsSnapshot
    skin.starsUpdatedAt = candidate.starsUpdatedAt
  }
}

async function optionalJson(relativePath) {
  try {
    return JSON.parse(await readFile(join(root, relativePath), 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

const displayCopy = await optionalJson('data/catalog-copy.json')
// Heat is computed in the private ops repo. This build only keeps scores that
// already passed the old client wire shape, so a public registry run cannot
// put the old lifetime average back on top.
const known = new Set(skins.map(skin => skin.id))
const heat = previous?.heat && typeof previous.heat === 'object'
  ? Object.fromEntries(Object.entries(previous.heat).filter(([id]) => known.has(id)))
  : undefined

const catalog = buildCatalogWire(skins, { previous, heat, displayCopy })
if (!checkOnly) await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)
console.log(`validated ${skins.length} skins${checkOnly ? ' (catalog not written)' : ''}`)
