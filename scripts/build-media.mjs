import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdir, readFile, writeFile, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { displayScreenshots } from './registry-screenshots.mjs'
import { mediaDescriptor, mediaKey, MEDIA_VERSION, isRasterImageUrl, retainMediaManifestEntries, canonicalScreenshotUrl } from './media.mjs'
import { localScreenshotPath } from './screenshot-refs.mjs'

const execFile = promisify(execFileCallback)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = resolve(process.env.SKIN_MEDIA_OUTPUT_DIR ?? join(root, 'site/public/skin-media'))
const outputDir = join(outputRoot, MEDIA_VERSION)
const sourceDir = join(root, 'registry/skins')
const screenshotPublicRoot = join(root, 'site/public')
const maxBytes = 30 * 1024 * 1024
const concurrency = 4
const conversionProfile = 'preview-640-q78-full-q82'
const requestedLimit = Number.parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.slice('--limit='.length) ?? '', 10)
const requestedSource = process.argv.find(arg => arg.startsWith('--source='))?.slice('--source='.length)

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function sourceUrls() {
  const files = (await readdir(sourceDir)).filter(file => file.endsWith('.yml')).sort()
  const urls = new Set()
  for (const file of files) {
    const skin = parse(await readFile(join(sourceDir, file), 'utf8'))
    const marketScreenshots = (skin.marketScreenshots ?? []).map(canonicalScreenshotUrl)
    const screenshots = [...new Set((skin.screenshots ?? []).map(canonicalScreenshotUrl))]
    const display = displayScreenshots(marketScreenshots, screenshots, skin.subpath)
    const configuredListScreenshot = skin.listScreenshot
    const listScreenshot = configuredListScreenshot !== undefined && display.includes(configuredListScreenshot)
      ? configuredListScreenshot
      : display[0] ?? configuredListScreenshot
    for (const source of [listScreenshot, ...display]) if (isRasterImageUrl(source)) urls.add(source)
  }
  const selected = requestedSource === undefined ? [...urls] : [...urls].filter(source => source === requestedSource)
  return selected.slice(0, Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined)
}

async function convert(source, manifest) {
  const sourceUrl = canonicalScreenshotUrl(source)
  const descriptor = mediaDescriptor(sourceUrl)
  if (descriptor === undefined) return { status: 'skipped' }
  const key = mediaKey(sourceUrl)
  const previewPath = join(outputDir, `${key}.preview.webp`)
  const fullPath = join(outputDir, `${key}.full.webp`)
  const cachedManifest = manifest[sourceUrl]
  if (
    typeof cachedManifest === 'string'
    && cachedManifest.endsWith(`:${conversionProfile}`)
    && await exists(previewPath)
    && await exists(fullPath)
  ) {
    return { status: 'cached' }
  }

  const localPath = localScreenshotPath(source, screenshotPublicRoot)
  let bytes
  if (localPath && await exists(localPath)) {
    bytes = await readFile(localPath)
  } else {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000), headers: { accept: 'image/*' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    bytes = Buffer.from(await response.arrayBuffer())
  }
  if (bytes.length === 0) throw new Error('empty response')
  if (bytes.length > maxBytes) throw new Error(`source is larger than ${maxBytes / 1024 / 1024} MB`)

  const contentHash = sha256(bytes)
  const manifestValue = `${contentHash}:${conversionProfile}`
  if (cachedManifest === manifestValue && await exists(previewPath) && await exists(fullPath)) return { status: 'cached' }

  const tempDir = await mkdtemp(join(tmpdir(), 'dsh-skin-media-'))
  const inputPath = join(tempDir, basename(new URL(sourceUrl).pathname) || `${key}.source`)
  const tempPreviewPath = join(tempDir, `${key}.preview.webp`)
  const tempFullPath = join(tempDir, `${key}.full.webp`)
  try {
    await writeFile(inputPath, bytes)
    await execFile('cwebp', ['-quiet', '-mt', '-m', '4', '-q', '78', '-resize', '640', '0', inputPath, '-o', tempPreviewPath])
    await execFile('cwebp', ['-quiet', '-mt', '-m', '4', '-q', '82', inputPath, '-o', tempFullPath])
    await mkdir(outputDir, { recursive: true })
    const preview = await readFile(tempPreviewPath)
    const full = await readFile(tempFullPath)
    await writeFile(previewPath, preview)
    await writeFile(fullPath, full)
    manifest[sourceUrl] = manifestValue
    return { status: 'converted' }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

await mkdir(outputDir, { recursive: true })
const manifestPath = join(outputDir, 'manifest.json')
let manifest = {}
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')) } catch { /* first run */ }
const urls = await sourceUrls()
manifest = retainMediaManifestEntries(manifest, urls)
let cursor = 0
let converted = 0
let cached = 0
let failed = 0
const failedSources = []
await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
  while (cursor < urls.length) {
    const source = urls[cursor++]
    try {
      const result = await convert(source, manifest)
      if (result.status === 'converted') converted += 1
      if (result.status === 'cached') cached += 1
    } catch (error) {
      failed += 1
      delete manifest[source]
      failedSources.push(source)
      console.warn(`media: skipped ${source}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}))
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`media: ${converted} converted, ${cached} cached, ${failed} failed, ${urls.length} raster sources`)
if (failedSources.length > 0) {
  console.warn(`media: ${failedSources.length} source(s) unavailable; frontends will use original-image fallback`)
  for (const source of failedSources.sort()) console.warn(`media: unavailable ${source}`)
}
