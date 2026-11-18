import { createHash } from 'node:crypto'
import { resolveScreenshotRef, screenshotAssetKey } from './screenshot-refs.mjs'

export const MEDIA_VERSION = 'v1'
export const MEDIA_BASE_URL = 'https://kingofsoysauce.github.io/dsh-skin-market/skin-media'

const RASTER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const COMMIT_REF_PATTERN = /^[0-9a-f]{40}$/i
const MEDIA_MANIFEST_VALUE_PATTERN = /^([0-9a-f]{64}):([^:]+)(?::(.+))?$/i

export function canonicalScreenshotUrl(value) {
  return resolveScreenshotRef(value)
}

/**
 * True when the URL itself names immutable content: a commit-pinned
 * raw.githubusercontent.com blob or a local market screenshot asset (its
 * `skin-screenshots/<owner>/<40-hex commit>/...` path is content-addressed).
 * Branches, tags, HEAD and arbitrary hosts can point at different bytes later,
 * so the media build has to re-check them on every run.
 */
export function isContentImmutableScreenshotUrl(value) {
  if (typeof value !== 'string') return false
  const candidate = value.trim()
  if (candidate === '') return false
  if (screenshotAssetKey(candidate) !== null) return true
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    if (url.hostname.toLowerCase() !== 'raw.githubusercontent.com') return false
    const segments = url.pathname.split('/').filter(segment => segment !== '')
    // /<owner>/<repo>/<ref>/<path...>; only a 40-hex commit is pinned.
    return segments.length >= 3 && COMMIT_REF_PATTERN.test(segments[2])
  } catch {
    return false
  }
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

/**
 * Manifest values are `<64-hex content hash>:<conversion profile>` and, once
 * a source answered with an entity tag, `<hash>:<profile>:<etag>`. Manifests
 * written before conditional requests only contain the two-part form.
 *
 * Returns `{ contentHash, profile, etag }` (etag absent for two-part values)
 * or null when the value is not a media manifest entry.
 */
export function parseMediaManifestValue(value) {
  if (typeof value !== 'string') return null
  const match = MEDIA_MANIFEST_VALUE_PATTERN.exec(value)
  if (match === null) return null
  return {
    contentHash: match[1].toLowerCase(),
    profile: match[2],
    ...(match[3] === undefined ? {} : { etag: match[3] }),
  }
}

/**
 * Inverse of {@link parseMediaManifestValue}. Keeps the historical two-part
 * form when the source has no entity tag so old manifests only gain the third
 * segment when there is an actual ETag to store.
 */
export function serializeMediaManifestValue({ contentHash, profile, etag } = {}) {
  if (typeof contentHash !== 'string' || !/^[0-9a-f]{64}$/i.test(contentHash)) {
    throw new TypeError('media manifest values require a 64-character content hash')
  }
  if (typeof profile !== 'string' || profile === '' || profile.includes(':')) {
    throw new TypeError('media manifest values require a non-empty profile without colons')
  }
  const prefix = `${contentHash.toLowerCase()}:${profile}`
  return typeof etag === 'string' && etag !== '' ? `${prefix}:${etag}` : prefix
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
