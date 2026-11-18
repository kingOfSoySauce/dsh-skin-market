import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
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
