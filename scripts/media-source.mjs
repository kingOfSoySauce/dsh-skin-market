import { createHash } from 'node:crypto'
import {
  isContentImmutableScreenshotUrl,
  parseMediaManifestValue,
  serializeMediaManifestValue,
} from './media.mjs'

export const MAX_MEDIA_SOURCE_BYTES = 30 * 1024 * 1024
export const MEDIA_SOURCE_TIMEOUT_MS = 30_000

/** Reason carried by a skipped resolution: cwebp cannot decode animated WebP. */
export const ANIMATED_WEBP_SKIP_REASON = 'animated-webp'

const RIFF_HEADER_BYTES = 12
const VP8X_CHUNK = 'VP8X'
const ANIMATION_HEADER_CHUNK = 'ANIM'
const ANIMATION_FRAME_CHUNK = 'ANMF'

// VP8X feature flags: the animation bit ("A") is bit 1 of the first VP8X
// payload byte (0x02). The other bits (alpha 0x10, ICC 0x20, EXIF 0x08,
// XMP 0x04) never imply animation, so they must not mark a file as skipped.
const VP8X_ANIMATION_FLAG = 0x02

function byteView(value) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return undefined
}

function matchesFourCC(bytes, offset, fourCC) {
  return bytes[offset] === fourCC.charCodeAt(0)
    && bytes[offset + 1] === fourCC.charCodeAt(1)
    && bytes[offset + 2] === fourCC.charCodeAt(2)
    && bytes[offset + 3] === fourCC.charCodeAt(3)
}

function readUint32LE(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

/**
 * Pure, crash-free animated-WebP sniffing for bytes that are about to be
 * handed to cwebp. Only a RIFF/WEBP container is inspected:
 *
 * - the VP8X chunk must set the animation flag (0x02) in its feature byte, and
 * - the animation must be corroborated by a top-level `ANIM` header or `ANMF`
 *   frame chunk, so a stray payload byte cannot mark a static image animated.
 *
 * Every other input (PNG/JPEG/GIF, static VP8/VP8L WebP, empty or truncated
 * buffers, RIFF containers with a bogus size) returns false and never throws.
 * The RIFF and chunk sizes bound the scan, so truncated data stops cleanly.
 */
export function detectAnimatedWebp(value) {
  const bytes = byteView(value)
  if (bytes === undefined || bytes.length < RIFF_HEADER_BYTES) return false
  if (!matchesFourCC(bytes, 0, 'RIFF') || !matchesFourCC(bytes, 8, 'WEBP')) return false
  const declaredBytes = 8 + readUint32LE(bytes, 4)
  if (declaredBytes > bytes.length) return false

  let offset = RIFF_HEADER_BYTES
  let animationFlag = false
  let animationHeader = false
  let animationFrame = false
  while (offset + 8 <= declaredBytes) {
    const chunkSize = readUint32LE(bytes, offset + 4)
    const payloadStart = offset + 8
    const payloadEnd = payloadStart + chunkSize
    // A chunk that claims more bytes than the RIFF container holds is
    // truncated: stop instead of reading past the buffer.
    if (payloadEnd > declaredBytes) return false
    if (matchesFourCC(bytes, offset, VP8X_CHUNK)) {
      if (chunkSize < 1) return false
      animationFlag = (bytes[payloadStart] & VP8X_ANIMATION_FLAG) !== 0
    } else if (matchesFourCC(bytes, offset, ANIMATION_HEADER_CHUNK)) {
      animationHeader = true
    } else if (matchesFourCC(bytes, offset, ANIMATION_FRAME_CHUNK)) {
      animationFrame = true
    }
    offset = payloadEnd + (chunkSize & 1)
  }
  return animationFlag && (animationHeader || animationFrame)
}

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
 * An animated WebP is reported as `{ status: 'skipped', reason }` before
 * any cwebp attempt: the encoder cannot decode it, the caller drops the
 * manifest entry and the client falls back to the original image.
 *
 * Returns `{ status: 'cached', manifestValue }`,
 * `{ status: 'transcode', bytes, manifestValue }` or
 * `{ status: 'skipped', reason }`.
 *
 * `isAnimatedWebp` is injectable so tests can force the decision without
 * crafting containers while `detectAnimatedWebp` stays the production policy.
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
  isAnimatedWebp = detectAnimatedWebp,
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
    if (isAnimatedWebp(bytes)) return { status: 'skipped', reason: ANIMATED_WEBP_SKIP_REASON }
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

  if (isAnimatedWebp(response.bytes)) return { status: 'skipped', reason: ANIMATED_WEBP_SKIP_REASON }

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
