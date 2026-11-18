import { createHash } from 'node:crypto'
import {
  isContentImmutableScreenshotUrl,
  parseMediaManifestValue,
  serializeMediaManifestValue,
} from './media.mjs'

export const MAX_MEDIA_SOURCE_BYTES = 30 * 1024 * 1024
export const MEDIA_SOURCE_TIMEOUT_MS = 30_000

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex')
}

function assertMediaSourceBytes(bytes, maxBytes) {
  if (bytes.length === 0) throw new Error('empty response')
  if (bytes.length > maxBytes) throw new Error(`source is larger than ${maxBytes / 1024 / 1024} MB`)
}

function responseEtag(response) {
  const etag = response.headers?.get?.('etag')
  return typeof etag === 'string' && etag !== '' ? etag : undefined
}

/**
 * Fetch one raster source as a conditional GET. The transport is injected so
 * the build can use the platform fetch while tests stay offline.
 *
 * Returns `{ status: 'not-modified', etag? }` for a 304 (never an error) or
 * `{ status: 'ok', bytes, contentHash, etag? }` for a 2xx body. Non-2xx
 * statuses, empty bodies and oversized bodies throw; network failures and
 * timeouts propagate from the injected fetch.
 */
export async function fetchMediaSource(sourceUrl, {
  fetchImpl = globalThis.fetch,
  etag,
  timeoutMs = MEDIA_SOURCE_TIMEOUT_MS,
  maxBytes = MAX_MEDIA_SOURCE_BYTES,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchMediaSource requires a fetch implementation')
  const headers = { accept: 'image/*' }
  if (typeof etag === 'string' && etag !== '') headers['if-none-match'] = etag
  const response = await fetchImpl(sourceUrl, { signal: AbortSignal.timeout(timeoutMs), headers })
  const nextEtag = responseEtag(response)
  if (response.status === 304) return { status: 'not-modified', etag: nextEtag }
  if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  assertMediaSourceBytes(bytes, maxBytes)
  return { status: 'ok', bytes, contentHash: sha256Hex(bytes), etag: nextEtag }
}

function manifestEntry(manifestValue, conversionProfile) {
  const parsed = parseMediaManifestValue(manifestValue)
  if (parsed === null || parsed.profile !== conversionProfile) return null
  return parsed
}

function serializeEntry(contentHash, etag, conversionProfile) {
  return serializeMediaManifestValue({
    contentHash,
    profile: conversionProfile,
    ...(etag === undefined ? {} : { etag }),
  })
}

/**
 * Decide whether one media source still matches its manifest entry, or which
 * bytes have to be (re)transcoded. All IO is injected (`local.read` and
 * `fetchImpl`); the caller writes WebP files and the manifest.
 *
 * - Immutable URL + matching manifest + existing outputs: cache hit, no IO.
 * - Local asset: read the file and compare its content hash.
 * - Remote source: conditional GET when a stored ETag and outputs exist; a 304
 *   is a cache hit, a 200 is compared by content hash. When outputs are
 *   missing the request is unconditional so fresh bytes are always available.
 *
 * Returns `{ status: 'cached', manifestValue }` or
 * `{ status: 'transcode', bytes, manifestValue }`.
 */
export async function resolveMediaSource({
  sourceUrl,
  manifestValue,
  conversionProfile,
  filesExist,
  local,
  fetchImpl = globalThis.fetch,
  timeoutMs = MEDIA_SOURCE_TIMEOUT_MS,
  maxBytes = MAX_MEDIA_SOURCE_BYTES,
}) {
  const parsed = manifestEntry(manifestValue, conversionProfile)

  if (filesExist && parsed !== null && isContentImmutableScreenshotUrl(sourceUrl)) {
    return {
      status: 'cached',
      manifestValue: serializeEntry(parsed.contentHash, parsed.etag, conversionProfile),
    }
  }

  if (local !== undefined) {
    const bytes = Buffer.from(await local.read())
    assertMediaSourceBytes(bytes, maxBytes)
    const contentHash = sha256Hex(bytes)
    if (parsed !== null && parsed.contentHash === contentHash) {
      const value = serializeEntry(contentHash, parsed.etag, conversionProfile)
      return filesExist
        ? { status: 'cached', manifestValue: value }
        : { status: 'transcode', bytes, manifestValue: value }
    }
    return {
      status: 'transcode',
      bytes,
      manifestValue: serializeEntry(contentHash, undefined, conversionProfile),
    }
  }

  const conditionalEtag = filesExist && parsed !== null ? parsed.etag : undefined
  const response = await fetchMediaSource(sourceUrl, { fetchImpl, etag: conditionalEtag, timeoutMs, maxBytes })

  if (response.status === 'not-modified') {
    if (conditionalEtag === undefined) throw new Error('HTTP 304 without a stored entity tag')
    return {
      status: 'cached',
      manifestValue: serializeEntry(parsed.contentHash, response.etag ?? parsed.etag, conversionProfile),
    }
  }

  if (filesExist && parsed !== null && parsed.contentHash === response.contentHash) {
    return {
      status: 'cached',
      manifestValue: serializeEntry(response.contentHash, response.etag, conversionProfile),
    }
  }
  return {
    status: 'transcode',
    bytes: response.bytes,
    manifestValue: serializeEntry(response.contentHash, response.etag, conversionProfile),
  }
}
