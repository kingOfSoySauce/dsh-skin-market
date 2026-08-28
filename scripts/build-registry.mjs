import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv/dist/2020.js'
import { parse, stringify } from 'yaml'
import { displayScreenshots } from './registry-screenshots.mjs'
import { mediaForSources } from './media.mjs'
import { isThinSubmission, hydrateSkinSubmission } from './hydrate-submission.mjs'
import { resolveScreenshotList, resolveScreenshotRef } from './screenshot-refs.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checkOnly = process.argv.includes('--check')
const schema = JSON.parse(await readFile(join(root, 'registry/skin.schema.json'), 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false })
const validate = ajv.compile(schema)
const sourceDir = join(root, 'registry/skins')
const files = (await readdir(sourceDir)).filter(file => file.endsWith('.yml')).sort()
const skins = []

const versionTerm = /^(>=|<=|>|<|=|\^|~)?\s*\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
function isVersionRange(value) {
  if (value === 'unverified') return true
  return value.split('||').every(alternative => alternative.trim().split(/\s+/).filter(Boolean).every(term => versionTerm.test(term)))
}

for (const file of files) {
  let skin = parse(await readFile(join(sourceDir, file), 'utf8'))
  if (isThinSubmission(skin)) {
    skin = await hydrateSkinSubmission(skin)
    if (!checkOnly) await writeFile(join(sourceDir, file), stringify(skin, { lineWidth: 0 }))
  }
  if (!validate(skin)) {
    const details = (validate.errors ?? []).map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')
    throw new Error(`${file}: ${details}`)
  }
  if (!isVersionRange(skin.compatibility.dsh)) throw new Error(`${file}: compatibility.dsh is not a supported semver range`)
  for (const adapter of skin.compatibility.adapters ?? []) {
    if (!isVersionRange(adapter.when)) throw new Error(`${file}: compatibility adapter ${adapter.id} has an invalid when range`)
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
    if (npm.gitHead !== undefined && npm.gitHead.toLowerCase() !== skin.install.commit.toLowerCase()) throw new Error(`${file}: install.npm.gitHead must equal install.commit`)
  }
  if (skin.subpath !== undefined && skin.install.allowBuild !== undefined && !skin.install.allowBuild.endsWith(`#path:${skin.subpath}`)) {
    throw new Error(`${file}: install.allowBuild must end with #path:${skin.subpath}`)
  }
  if (skin.marketScreenshots) skin.marketScreenshots = resolveScreenshotList(skin.marketScreenshots)
  if (skin.listScreenshot) skin.listScreenshot = resolveScreenshotRef(skin.listScreenshot)
  const marketScreenshots = skin.marketScreenshots ?? []
  const screenshots = [...new Set(resolveScreenshotList(skin.screenshots))]
  const display = displayScreenshots(marketScreenshots, screenshots, skin.subpath)
  if (display.length === 0) console.warn(`${file}: no displayable screenshot; keeping the entry without media`)
  const configuredListScreenshot = skin.listScreenshot
  const listScreenshot = configuredListScreenshot !== undefined
    ? (display.includes(configuredListScreenshot) ? configuredListScreenshot : display[0] ?? configuredListScreenshot)
    : marketScreenshots.length > 0 ? display[0] : undefined
  const media = mediaForSources(display, listScreenshot ?? display[0])
  skins.push({ ...skin, ...(listScreenshot ? { listScreenshot } : {}), screenshots, ...(media ? { media } : {}) })
}

const ids = new Set()
const packages = new Set()
const rows = new Set()
for (const skin of skins) {
  for (const [label, value, set] of [['id', skin.id, ids], ['package', skin.package, packages], ['rowId', skin.rowId, rows]]) {
    if (set.has(value)) throw new Error(`duplicate ${label}: ${value}`)
    set.add(value)
  }
}

const catalogPath = join(root, 'data/catalog.json')
const sortedSkins = skins.sort((a, b) => a.featuredRank - b.featuredRank)
let generatedAt = new Date().toISOString()
try {
  const previous = JSON.parse(await readFile(catalogPath, 'utf8'))
  if (JSON.stringify(previous.skins) === JSON.stringify(sortedSkins) && typeof previous.generatedAt === 'string') {
    generatedAt = previous.generatedAt
  }
} catch { /* first build */ }

const catalog = {
  schemaVersion: 1,
  generatedAt,
  skins: sortedSkins,
}
if (!checkOnly) await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)
console.log(`validated ${skins.length} skins${checkOnly ? ' (catalog not written)' : ''}`)
