import { createHash } from 'node:crypto'
import { resolveScreenshotRef } from './screenshot-refs.mjs'

export const MEDIA_VERSION = 'v1'
export const MEDIA_BASE_URL = 'https://kingofsoysauce.github.io/dsh-skin-market/skin-media'

const RASTER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

export function canonicalScreenshotUrl(value) {
  return resolveScreenshotRef(value)
}

export function isRasterImageUrl(value) {
  if (typeof value !== 'string') return false
  const resolved = canonicalScreenshotUrl(value)
  if (!/^https?:\/\//i.test(resolved)) return false
  try {
    return RASTER_EXTENSIONS.has(new URL(resolved).pathname.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '')
  } catch {
    return false
  }
}

export function mediaKey(sourceUrl) {
  return createHash('sha256').update(canonicalScreenshotUrl(sourceUrl)).digest('hex').slice(0, 32)
}

export function mediaDescriptor(sourceUrl, baseUrl = MEDIA_BASE_URL) {
  if (!isRasterImageUrl(sourceUrl)) return undefined
  const base = baseUrl.replace(/\/$/, '')
  const key = mediaKey(sourceUrl)
  return {
    preview: `${base}/${MEDIA_VERSION}/${key}.preview.webp`,
    full: `${base}/${MEDIA_VERSION}/${key}.full.webp`,
  }
}

export function mediaForSources(screenshots, listScreenshot, baseUrl = MEDIA_BASE_URL) {
  const screenshotMedia = screenshots.map(source => mediaDescriptor(source, baseUrl) ?? null)
  const list = listScreenshot === undefined ? undefined : mediaDescriptor(listScreenshot, baseUrl)
  if (list === undefined && screenshotMedia.every(item => item === null)) return undefined
  return {
    ...(list === undefined ? {} : { list }),
    screenshots: screenshotMedia,
  }
}

export function retainMediaManifestEntries(manifest, sources) {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) return {}
  const allowed = new Set(sources)
  return Object.fromEntries(Object.entries(manifest).filter(([source]) => allowed.has(source)))
}

export function removeMediaManifestEntry(manifest, source) {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) return {}
  if (!(source in manifest)) return manifest
  const next = { ...manifest }
  delete next[source]
  return next
}
