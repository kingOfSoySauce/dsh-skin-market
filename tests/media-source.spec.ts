import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  ANIMATED_WEBP_SKIP_REASON,
  detectAnimatedWebp,
  fetchMediaSource,
  MAX_MEDIA_SOURCE_BYTES,
  resolveMediaSource,
  sha256Hex,
} from '../scripts/media-source.mjs'

const profile = 'preview-640-q78-full-q82'
const commit = '251119cedac66dbd31ca8ce6cb112369b60b359b'
const pinned = `https://raw.githubusercontent.com/example/skin/${commit}/docs/preview.png`
const mutable = 'https://raw.githubusercontent.com/example/skin/main/docs/preview.png'
const localAsset = `https://kingofsoysauce.github.io/dsh-skin-market/skin-screenshots/example/${commit}/preview.png`

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function responseFor(bytes, { status = 200, etag } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => name.toLowerCase() === 'etag' ? (etag ?? null) : null },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }
}

function fakeFetch(handler) {
  const calls = []
  const impl = async (url, init) => {
    const call = { url, init }
    calls.push(call)
    return handler(call)
  }
  return { impl, calls }
}

function resolveArgs(overrides) {
  return {
    sourceUrl: mutable,
    manifestValue: undefined,
    conversionProfile: profile,
    filesExist: true,
    fetchImpl: vi.fn(),
    ...overrides,
  }
}

const VP8X_ANIMATION_FLAG = 0x02
const VP8X_ALPHA_FLAG = 0x10

function fourCC(value: string): Buffer {
  return Buffer.from(value, 'latin1')
}

function riffChunk(chunkFourCC: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.write(chunkFourCC, 0, 'latin1')
  header.writeUInt32LE(payload.length, 4)
  const padding = payload.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0)
  return Buffer.concat([header, payload, padding])
}

function riffWebp(chunks: readonly Buffer[]): Buffer {
  const body = Buffer.concat([fourCC('WEBP'), ...chunks])
  const header = Buffer.alloc(8)
  header.write('RIFF', 0, 'latin1')
  header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

function vp8xChunk(flags: number): Buffer {
  const payload = Buffer.alloc(10)
  payload[0] = flags
  return riffChunk('VP8X', payload)
}

function staticVp8Webp(): Buffer {
  return riffWebp([riffChunk('VP8 ', Buffer.alloc(10, 0x2a))])
}

function staticVp8lWebp(): Buffer {
  return riffWebp([riffChunk('VP8L', Buffer.alloc(5, 0x2f))])
}

function staticVp8xWebp(): Buffer {
  return riffWebp([vp8xChunk(VP8X_ALPHA_FLAG), riffChunk('VP8L', Buffer.alloc(5, 0x2f))])
}

function animatedWebpBytes(options: { flags?: number, animationHeader?: boolean, animationFrame?: boolean } = {}): Buffer {
  const { flags = VP8X_ANIMATION_FLAG, animationHeader = true, animationFrame = true } = options
  const chunks = [vp8xChunk(flags)]
  if (animationHeader) chunks.push(riffChunk('ANIM', Buffer.alloc(6)))
  if (animationFrame) chunks.push(riffChunk('ANMF', Buffer.alloc(16, 0x01)))
  return riffWebp(chunks)
}

function pngBytes(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
}

function gifBytes(): Buffer {
  return Buffer.from('GIF89a\x00\x00\x00\x00\x00\x00', 'latin1')
}

describe('fetchMediaSource', () => {
  it('fetches bytes unconditionally and reports the content hash and ETag', async () => {
    const bytes = Buffer.from('image bytes')
    const { impl, calls } = fakeFetch(() => responseFor(bytes, { etag: '"abc"' }))
    const result = await fetchMediaSource('https://example.com/preview.png', { fetchImpl: impl })

    expect(result).toEqual({ status: 'ok', bytes, contentHash: sha256Hex(bytes), etag: '"abc"' })
    expect(calls[0]?.init.headers).toEqual({ accept: 'image/*' })
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal)
  })

  it('sends If-None-Match when an ETag is available and reports 304 as not modified', async () => {
    const { impl, calls } = fakeFetch(() => responseFor(Buffer.alloc(0), { status: 304, etag: '"abc"' }))
    const result = await fetchMediaSource('https://example.com/preview.png', { fetchImpl: impl, etag: '"abc"' })

    expect(result).toEqual({ status: 'not-modified', etag: '"abc"' })
    expect(calls[0]?.init.headers['if-none-match']).toBe('"abc"')
  })

  it('keeps the old failure semantics for HTTP errors, empty bodies and oversized bodies', async () => {
    await expect(fetchMediaSource('https://example.com/preview.png', {
      fetchImpl: fakeFetch(() => responseFor(Buffer.from('nope'), { status: 503 })).impl,
    })).rejects.toThrow('HTTP 503')
    await expect(fetchMediaSource('https://example.com/preview.png', {
      fetchImpl: fakeFetch(() => responseFor(Buffer.alloc(0))).impl,
    })).rejects.toThrow('empty response')
    await expect(fetchMediaSource('https://example.com/preview.png', {
      fetchImpl: fakeFetch(() => responseFor(Buffer.alloc(8))).impl,
      maxBytes: 4,
    })).rejects.toThrow(/source is larger than/)
    expect(MAX_MEDIA_SOURCE_BYTES).toBe(30 * 1024 * 1024)
  })

  it('propagates network failures and timeouts', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    await expect(fetchMediaSource('https://example.com/preview.png', {
      fetchImpl: async () => { throw timeout },
    })).rejects.toThrow('aborted due to timeout')
    await expect(fetchMediaSource('https://example.com/preview.png', {
      fetchImpl: async () => { throw new TypeError('fetch failed') },
    })).rejects.toThrow('fetch failed')
  })
})

describe('detectAnimatedWebp', () => {
  it('recognizes an animated WebP by the VP8X animation flag and ANIM/ANMF chunks', () => {
    expect(detectAnimatedWebp(animatedWebpBytes())).toBe(true)
    expect(detectAnimatedWebp(animatedWebpBytes({ flags: VP8X_ANIMATION_FLAG | VP8X_ALPHA_FLAG }))).toBe(true)
    // ANIM alone and ANMF alone each corroborate the flag.
    expect(detectAnimatedWebp(animatedWebpBytes({ animationFrame: false }))).toBe(true)
    expect(detectAnimatedWebp(animatedWebpBytes({ animationHeader: false }))).toBe(true)
  })

  it('reads the animation bit from the VP8X feature byte only', () => {
    expect(detectAnimatedWebp(riffWebp([vp8xChunk(VP8X_ALPHA_FLAG), riffChunk('VP8L', Buffer.alloc(5, 0x2f))]))).toBe(false)
    expect(detectAnimatedWebp(riffWebp([vp8xChunk(0x00), riffChunk('VP8L', Buffer.alloc(5, 0x2f))]))).toBe(false)
    // Animation chunks without the VP8X flag are not trusted.
    expect(detectAnimatedWebp(riffWebp([riffChunk('ANIM', Buffer.alloc(6)), riffChunk('ANMF', Buffer.alloc(16))]))).toBe(false)
    // A flagged VP8X without ANIM/ANMF fails the cross-validation.
    expect(detectAnimatedWebp(riffWebp([vp8xChunk(VP8X_ANIMATION_FLAG), riffChunk('VP8L', Buffer.alloc(5, 0x2f))]))).toBe(false)
    // Payload bytes that merely spell ANIM are not chunk headers.
    expect(detectAnimatedWebp(riffWebp([vp8xChunk(VP8X_ALPHA_FLAG), riffChunk('VP8 ', Buffer.from('..ANIM..', 'latin1'))]))).toBe(false)
  })

  it('leaves static WebP, PNG, GIF and plain bytes alone', () => {
    expect(detectAnimatedWebp(staticVp8Webp())).toBe(false)
    expect(detectAnimatedWebp(staticVp8lWebp())).toBe(false)
    expect(detectAnimatedWebp(staticVp8xWebp())).toBe(false)
    expect(detectAnimatedWebp(pngBytes())).toBe(false)
    expect(detectAnimatedWebp(gifBytes())).toBe(false)
    expect(detectAnimatedWebp(Buffer.from('image bytes'))).toBe(false)
    // Typed-array (non-Buffer) views of the same container are detected too.
    expect(detectAnimatedWebp(new Uint8Array(animatedWebpBytes()))).toBe(true)
  })

  it('returns false for empty, truncated and malformed containers without throwing', () => {
    expect(detectAnimatedWebp(undefined)).toBe(false)
    expect(detectAnimatedWebp(null)).toBe(false)
    expect(detectAnimatedWebp(42)).toBe(false)
    expect(detectAnimatedWebp('RIFFxxxxWEBP')).toBe(false)
    expect(detectAnimatedWebp(Buffer.alloc(0))).toBe(false)

    const animated = animatedWebpBytes()
    expect(detectAnimatedWebp(animated.subarray(0, 8))).toBe(false)
    expect(detectAnimatedWebp(animated.subarray(0, 12))).toBe(false)
    // RIFF size field points past the available bytes.
    expect(detectAnimatedWebp(animated.subarray(0, animated.length - 4))).toBe(false)
    // A chunk size that claims more bytes than the container holds.
    const overrun = Buffer.from(animated)
    overrun.writeUInt32LE(0x7fffffff, 16)
    expect(detectAnimatedWebp(overrun)).toBe(false)
    // RIFF header for a non-WebP container.
    const avi = Buffer.from(animatedWebpBytes())
    avi.write('AVI ', 8, 'latin1')
    expect(detectAnimatedWebp(avi)).toBe(false)
  })
})

describe('resolveMediaSource cache decisions', () => {
  it('takes the immutable fast path without any network or local IO', async () => {
    const bytes = Buffer.from('pinned cover')
    const fetchImpl = vi.fn()
    const local = { read: vi.fn() }

    const result = await resolveMediaSource(resolveArgs({
      sourceUrl: pinned,
      manifestValue: `${sha256(bytes)}:${profile}`,
      fetchImpl,
      local,
    }))

    expect(result).toEqual({ status: 'cached', manifestValue: `${sha256(bytes)}:${profile}` })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(local.read).not.toHaveBeenCalled()
  })

  it('treats a conditional 304 on a mutable source as a cache hit', async () => {
    const bytes = Buffer.from('stable cover')
    const etag = '"cover-v1"'
    const { impl, calls } = fakeFetch(() => responseFor(Buffer.alloc(0), { status: 304, etag }))

    const result = await resolveMediaSource(resolveArgs({
      manifestValue: `${sha256(bytes)}:${profile}:${etag}`,
      fetchImpl: impl,
    }))

    expect(calls).toHaveLength(1)
    expect(calls[0]?.init.headers['if-none-match']).toBe(etag)
    expect(result).toEqual({ status: 'cached', manifestValue: `${sha256(bytes)}:${profile}:${etag}` })
  })

  it('keeps a mutable source cached when the refetched bytes match the stored content hash and refreshes the ETag', async () => {
    const bytes = Buffer.from('same bytes')
    const { impl, calls } = fakeFetch(() => responseFor(bytes, { etag: '"cover-v2"' }))

    const result = await resolveMediaSource(resolveArgs({
      manifestValue: `${sha256(bytes)}:${profile}:"cover-v1"`,
      fetchImpl: impl,
    }))

    expect(calls[0]?.init.headers['if-none-match']).toBe('"cover-v1"')
    expect(result).toEqual({ status: 'cached', manifestValue: `${sha256(bytes)}:${profile}:"cover-v2"` })
  })

  it('requests a fresh transcode when mutable content changed and stores the new hash and ETag', async () => {
    const oldBytes = Buffer.from('old bytes')
    const newBytes = Buffer.from('new bytes')
    const { impl } = fakeFetch(() => responseFor(newBytes, { etag: '"cover-v2"' }))

    const result = await resolveMediaSource(resolveArgs({
      manifestValue: `${sha256(oldBytes)}:${profile}:"cover-v1"`,
      fetchImpl: impl,
    }))

    expect(result.status).toBe('transcode')
    expect(Buffer.compare(result.bytes, newBytes)).toBe(0)
    expect(result.manifestValue).toBe(`${sha256(newBytes)}:${profile}:"cover-v2"`)
  })

  it('compares mutable sources by content hash when the manifest has no ETag', async () => {
    const bytes = Buffer.from('cover')
    const { impl, calls } = fakeFetch(() => responseFor(bytes, { etag: '"fresh"' }))

    const result = await resolveMediaSource(resolveArgs({
      manifestValue: `${sha256(bytes)}:${profile}`,
      fetchImpl: impl,
    }))

    expect(calls[0]?.init.headers['if-none-match']).toBeUndefined()
    expect(result).toEqual({ status: 'cached', manifestValue: `${sha256(bytes)}:${profile}:"fresh"` })
  })

  it('refetches a mutable source with fresh bytes when its outputs are missing', async () => {
    const bytes = Buffer.from('cover')
    const { impl, calls } = fakeFetch(() => responseFor(bytes, { etag: '"cover-v1"' }))

    const result = await resolveMediaSource(resolveArgs({
      manifestValue: `${sha256(bytes)}:${profile}:"cover-v1"`,
      filesExist: false,
      fetchImpl: impl,
    }))

    expect(calls).toHaveLength(1)
    expect(calls[0]?.init.headers['if-none-match']).toBeUndefined()
    expect(result.status).toBe('transcode')
    expect(Buffer.compare(result.bytes, bytes)).toBe(0)
  })

  it('reads a local market asset to refresh missing outputs instead of using the network', async () => {
    const bytes = Buffer.from('local cover')
    const fetchImpl = vi.fn()
    const local = { read: vi.fn(async () => bytes) }

    const result = await resolveMediaSource(resolveArgs({
      sourceUrl: localAsset,
      manifestValue: `${sha256(bytes)}:${profile}`,
      filesExist: false,
      fetchImpl,
      local,
    }))

    expect(result.status).toBe('transcode')
    expect(Buffer.compare(result.bytes, bytes)).toBe(0)
    expect(local.read).toHaveBeenCalledTimes(1)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('re-transcodes and rewrites the hash when a local asset changed', async () => {
    const oldBytes = Buffer.from('old local cover')
    const newBytes = Buffer.from('new local cover')
    const { impl } = fakeFetch(() => responseFor(Buffer.from('unused')))

    const result = await resolveMediaSource(resolveArgs({
      sourceUrl: localAsset,
      manifestValue: undefined,
      filesExist: true,
      fetchImpl: impl,
      local: { read: async () => newBytes },
    }))

    expect(result.status).toBe('transcode')
    expect(Buffer.compare(result.bytes, newBytes)).toBe(0)
    expect(result.manifestValue).toBe(`${sha256(newBytes)}:${profile}`)
  })

  it('fails the source on HTTP errors, empty bodies and oversized bodies', async () => {
    await expect(resolveMediaSource(resolveArgs({
      fetchImpl: fakeFetch(() => responseFor(Buffer.from('nope'), { status: 404 })).impl,
    }))).rejects.toThrow('HTTP 404')
    await expect(resolveMediaSource(resolveArgs({
      fetchImpl: fakeFetch(() => responseFor(Buffer.alloc(0))).impl,
    }))).rejects.toThrow('empty response')
    await expect(resolveMediaSource(resolveArgs({
      fetchImpl: fakeFetch(() => responseFor(Buffer.alloc(8))).impl,
      maxBytes: 4,
    }))).rejects.toThrow(/source is larger than/)
  })

  it('propagates fetch failures instead of falling back to the manifest', async () => {
    const bytes = Buffer.from('cover')
    await expect(resolveMediaSource(resolveArgs({
      manifestValue: `${sha256(bytes)}:${profile}:"cover-v1"`,
      fetchImpl: async () => { throw new TypeError('fetch failed') },
    }))).rejects.toThrow('fetch failed')
  })
})

describe('resolveMediaSource animated WebP skips', () => {
  it('reports a skipped animated WebP remote source instead of transcoding it', async () => {
    const bytes = animatedWebpBytes()
    const { impl } = fakeFetch(() => responseFor(bytes, { etag: '"anim-v1"' }))

    const result = await resolveMediaSource(resolveArgs({ fetchImpl: impl }))

    expect(result).toEqual({ status: 'skipped', reason: ANIMATED_WEBP_SKIP_REASON })
  })

  it('skips animated bytes even when a stale manifest entry matches their hash', async () => {
    const bytes = animatedWebpBytes()
    const { impl } = fakeFetch(() => responseFor(bytes, { etag: '"anim-v1"' }))

    const result = await resolveMediaSource(resolveArgs({
      manifestValue: `${sha256(bytes)}:${profile}:"anim-v1"`,
      fetchImpl: impl,
    }))

    expect(result).toEqual({ status: 'skipped', reason: ANIMATED_WEBP_SKIP_REASON })
  })

  it('skips an animated local market asset without using the network', async () => {
    const bytes = animatedWebpBytes()
    const fetchImpl = vi.fn()

    const result = await resolveMediaSource(resolveArgs({
      sourceUrl: localAsset,
      filesExist: false,
      fetchImpl,
      local: { read: async () => bytes },
    }))

    expect(result).toEqual({ status: 'skipped', reason: ANIMATED_WEBP_SKIP_REASON })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('still transcodes a static WebP source', async () => {
    const bytes = staticVp8Webp()
    const { impl } = fakeFetch(() => responseFor(bytes, { etag: '"static-v1"' }))

    const result = await resolveMediaSource(resolveArgs({ filesExist: false, fetchImpl: impl }))

    expect(result.status).toBe('transcode')
    expect(Buffer.compare(result.bytes, bytes)).toBe(0)
    expect(result.manifestValue).toBe(`${sha256(bytes)}:${profile}:"static-v1"`)
  })

  it('honours an injected animation decision', async () => {
    const plain = Buffer.from('plain source bytes')
    const forcedSkip = await resolveMediaSource(resolveArgs({
      fetchImpl: fakeFetch(() => responseFor(plain)).impl,
      isAnimatedWebp: () => true,
    }))
    expect(forcedSkip).toEqual({ status: 'skipped', reason: ANIMATED_WEBP_SKIP_REASON })

    const animated = animatedWebpBytes()
    const forcedTranscode = await resolveMediaSource(resolveArgs({
      filesExist: false,
      fetchImpl: fakeFetch(() => responseFor(animated)).impl,
      isAnimatedWebp: () => false,
    }))
    expect(forcedTranscode.status).toBe('transcode')
  })
})
