import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { displayScreenshots } from './registry-screenshots.mjs'
import { isRasterImageUrl, mediaDescriptor } from './media.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outputDir = resolve(process.env.SKIN_MEDIA_OUTPUT_DIR ?? join(root, 'site/public/skin-media', 'v1'))

function sourceUrlsForSkin(skin) {
  const display = displayScreenshots(skin.marketScreenshots ?? [], skin.screenshots ?? [], skin.subpath, skin.listScreenshot, skin.review?.preview)
  const list = skin.listScreenshot !== undefined && display.includes(skin.listScreenshot)
    ? skin.listScreenshot
    : display[0]
  return [...new Set([list, ...display].filter(isRasterImageUrl))]
}

function descriptorFiles(descriptor) {
  if (descriptor === undefined) return []
  return [new URL(descriptor.preview).pathname.split('/').pop(), new URL(descriptor.full).pathname.split('/').pop()].filter(Boolean)
}

export function inspectMedia(catalog, manifest, mediaDir) {
  const safeManifest = typeof manifest === 'object' && manifest !== null && !Array.isArray(manifest) ? manifest : {}
  const expectedFiles = new Set()
  const catalogSources = new Set()
  const missingCatalogDescriptors = []

  for (const skin of catalog.skins ?? []) {
    const sources = sourceUrlsForSkin(skin)
    const catalogDescriptors = new Set([
      ...(skin.media?.list === undefined ? [] : descriptorFiles(skin.media.list)),
      ...(skin.media?.screenshots ?? []).flatMap(item => descriptorFiles(item ?? undefined)),
    ])
    for (const source of sources) {
      catalogSources.add(source)
      const descriptor = mediaDescriptor(source)
      for (const file of descriptorFiles(descriptor)) {
        expectedFiles.add(file)
        if (!catalogDescriptors.has(file)) missingCatalogDescriptors.push({ id: skin.id, source, file })
      }
    }
  }

  const missingFiles = [...expectedFiles].filter(file => !existsSync(join(mediaDir, file)))
  const staleFiles = existsSync(mediaDir)
    ? readdirSync(mediaDir).filter(file => file.endsWith('.webp') && !expectedFiles.has(file))
    : []
  const missingManifestSources = [...catalogSources].filter(source => !(source in safeManifest))
  const staleManifestSources = Object.keys(safeManifest).filter(source => !catalogSources.has(source))

  return {
    expectedFiles: [...expectedFiles],
    missingFiles,
    staleFiles,
    missingManifestSources,
    staleManifestSources,
    missingCatalogDescriptors,
    ok: missingFiles.length === 0
      && staleFiles.length === 0
      && missingManifestSources.length === 0
      && staleManifestSources.length === 0
      && missingCatalogDescriptors.length === 0,
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

async function main() {
  const catalog = readJson(join(root, 'data/catalog.json'))
  const manifestPath = join(outputDir, 'manifest.json')
  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : {}
  const report = inspectMedia(catalog, manifest, outputDir)

  console.log(`media: ${report.expectedFiles.length} WebP files expected; ${report.missingFiles.length} file(s) missing`)
  if (report.missingFiles.length > 0) for (const file of report.missingFiles) console.warn(`media: missing file ${file}`)
  if (report.staleFiles.length > 0) {
    console.warn(`${report.staleFiles.length} stale WebP file(s) not referenced by catalog`)
    for (const file of report.staleFiles) console.warn(`media: stale file ${file}`)
  }
  if (report.missingManifestSources.length > 0) {
    console.warn(`media: ${report.missingManifestSources.length} catalog source(s) absent from manifest`)
    for (const source of report.missingManifestSources) console.warn(`media: missing manifest source ${source}`)
  }
  if (report.staleManifestSources.length > 0) {
    console.warn(`media: ${report.staleManifestSources.length} stale manifest source(s)`)
    for (const source of report.staleManifestSources) console.warn(`media: stale manifest source ${source}`)
  }
  if (report.missingCatalogDescriptors.length > 0) {
    console.warn(`media: ${report.missingCatalogDescriptors.length} catalog descriptor(s) do not match their source`)
    for (const item of report.missingCatalogDescriptors) console.warn(`media: descriptor mismatch ${item.id} ${item.source} -> ${item.file}`)
  }

  if (process.argv.includes('--strict') && !report.ok) process.exitCode = 1
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
