import { describe, expect, it, vi } from 'vitest'
import { createLiveStarLoader, githubRepoSlug, withLiveReading } from '../site/live-stars.ts'

const DAY = 86_400_000

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response
}

describe('live star reading', () => {
  it('only accepts plain GitHub repository URLs', () => {
    expect(githubRepoSlug('https://github.com/webkubor/dsh-bloom-theme')).toBe('webkubor/dsh-bloom-theme')
    expect(githubRepoSlug('https://github.com/webkubor/dsh-bloom-theme/')).toBe('webkubor/dsh-bloom-theme')
    expect(githubRepoSlug('https://github.com/webkubor/dsh-bloom-theme/tree/main')).toBeUndefined()
    expect(githubRepoSlug('https://gitlab.com/webkubor/dsh-bloom-theme')).toBeUndefined()
    expect(githubRepoSlug('')).toBeUndefined()
  })

  it('reads stargazers_count and reuses the answer', async () => {
    const fetcher = vi.fn(async () => response(200, { stargazers_count: 139 }, { date: 'Sun, 08 Nov 2026 16:40:12 GMT' }))
    const loader = createLiveStarLoader({ fetcher, now: () => DAY * 20_765 })
    const reading = await loader.load('https://github.com/webkubor/dsh-bloom-theme')
    expect(reading).toEqual({ stars: 139, observedAt: Date.parse('Sun, 08 Nov 2026 16:40:12 GMT') })
    await loader.load('https://github.com/webkubor/dsh-bloom-theme')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent requests for the same repository', async () => {
    const fetcher = vi.fn(async () => response(200, { stargazers_count: 12 }))
    const loader = createLiveStarLoader({ fetcher, now: () => DAY })
    const [first, second] = await Promise.all([
      loader.load('https://github.com/a/b'),
      loader.load('https://github.com/a/b'),
    ])
    expect(first).toEqual(second)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps the catalog value when the request fails', async () => {
    const missing = createLiveStarLoader({ fetcher: async () => response(404, { message: 'Not Found' }), now: () => DAY })
    expect(await missing.load('https://github.com/a/b')).toBeUndefined()

    const offline = createLiveStarLoader({ fetcher: async () => { throw new TypeError('Failed to fetch') }, now: () => DAY })
    expect(await offline.load('https://github.com/a/b')).toBeUndefined()

    const nonsense = createLiveStarLoader({ fetcher: async () => response(200, { stargazers_count: 'many' }), now: () => DAY })
    expect(await nonsense.load('https://github.com/a/b')).toBeUndefined()
  })

  it('stops asking until the rate limit resets', async () => {
    let clock = 1_000_000
    const fetcher = vi.fn(async () => response(403, { message: 'rate limit' }, {
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': '2000',
    }))
    const loader = createLiveStarLoader({ fetcher, now: () => clock })
    expect(await loader.load('https://github.com/a/b')).toBeUndefined()
    clock = 1_500_000
    expect(await loader.load('https://github.com/a/c')).toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(1)
    clock = 2_100_000
    fetcher.mockResolvedValueOnce(response(200, { stargazers_count: 5 }))
    expect(await loader.load('https://github.com/a/c')).toEqual({ stars: 5, observedAt: 2_100_000 })
  })
})

describe('live reading on the curve', () => {
  const curve = [10, 40, 72]
  const from = 20_763

  it('replaces the last point when the reading belongs to the same day', () => {
    const reading = { stars: 80, observedAt: (from + 2) * DAY + 3_600_000 }
    expect(withLiveReading(curve, from, reading)).toEqual([10, 40, 80])
  })

  it('extends the curve and repeats the last total over missing days', () => {
    const reading = { stars: 100, observedAt: (from + 4) * DAY }
    expect(withLiveReading(curve, from, reading)).toEqual([10, 40, 72, 72, 100])
  })

  it('leaves the curve alone without a reading or for an older day', () => {
    expect(withLiveReading(curve, from, undefined)).toBe(curve)
    expect(withLiveReading(curve, from, { stars: 3, observedAt: (from - 2) * DAY })).toBe(curve)
    expect(withLiveReading(curve, from, { stars: 1, observedAt: (from + 1) * DAY })).toBe(curve)
  })

  it('does not allocate when the same-day reading matches', () => {
    expect(withLiveReading(curve, from, { stars: 72, observedAt: (from + 2) * DAY })).toBe(curve)
  })
})
