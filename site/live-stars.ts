/**
 * Live star counts for the detail panel.
 *
 * The catalog only carries the reading the registry pipeline recorded, which is
 * usually a day old. The public repository endpoint is small, anonymous, and
 * CORS-enabled, so the page can ask GitHub once per opened skin instead of
 * waiting for the next catalog build. The catalog number stays the fallback for
 * offline visitors, blocked networks, and rate limits.
 *
 * Unauthenticated GitHub calls are limited to 60 per hour per visitor IP. Only
 * the opened detail requests anything, answers are reused for five minutes, and
 * a rate-limited response silences further calls until the reset instant, so
 * normal browsing never gets near the limit.
 */

export const STAR_DAY_MS = 86_400_000

const REPO_ENDPOINT = 'https://api.github.com/repos/'
const CACHE_MS = 5 * 60_000
const FAILURE_CACHE_MS = 60_000
const TIMEOUT_MS = 5_000

export interface LiveStarReading {
  stars: number
  /** When GitHub answered, in epoch milliseconds. */
  observedAt: number
}

export interface LiveStarLoader {
  load(repo: string): Promise<LiveStarReading | undefined>
}

/** `https://github.com/owner/name` → `owner/name`, and nothing else. */
export function githubRepoSlug(repo: string): string | undefined {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/i.exec(repo.trim())
  return match === null ? undefined : `${match[1]}/${match[2]}`
}

/**
 * Put the live reading on the curve's last day. The same UTC day replaces the
 * snapshot value (a newer reading of the same day); a later day extends the
 * series, repeating the last known total for days without a reading. A reading
 * that would land before the curve's end is ignored: it cannot describe a newer
 * state than the points after it.
 */
export function withLiveReading(values: number[], from: number, reading: LiveStarReading | undefined): number[] {
  if (reading === undefined || values.length === 0) return values
  const index = Math.floor(reading.observedAt / STAR_DAY_MS) - from
  if (index < values.length - 1) return values
  const next = values.slice()
  if (index === next.length - 1) {
    if (next[index] === reading.stars) return values
    next[index] = reading.stars
    return next
  }
  const last = next[next.length - 1]!
  while (next.length < index) next.push(last)
  next.push(reading.stars)
  return next
}

/**
 * Cache one loader per page. `fetcher` and `now` are injectable so the fetch
 * and rate-limit behaviour can be tested without a network or a real clock.
 */
export function createLiveStarLoader({
  fetcher = fetch,
  now = () => Date.now(),
  cacheMs = CACHE_MS,
  timeoutMs = TIMEOUT_MS,
}: {
  fetcher?: typeof fetch
  now?: () => number
  cacheMs?: number
  timeoutMs?: number
} = {}): LiveStarLoader {
  const cache = new Map<string, { reading?: LiveStarReading; at: number }>()
  const pending = new Map<string, Promise<LiveStarReading | undefined>>()
  let blockedUntil = 0

  async function request(slug: string): Promise<LiveStarReading | undefined> {
    const startedAt = now()
    if (startedAt < blockedUntil) return undefined
    const cached = cache.get(slug)
    if (cached !== undefined && startedAt - cached.at < cacheMs) return cached.reading

    try {
      const response = await fetcher(`${REPO_ENDPOINT}${slug}`, {
        headers: { accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (response.status === 403 || response.status === 429) {
        const remaining = response.headers.get('x-ratelimit-remaining')
        const reset = Number(response.headers.get('x-ratelimit-reset'))
        blockedUntil = remaining === '0' && Number.isFinite(reset) && reset > 0
          ? reset * 1_000
          : now() + FAILURE_CACHE_MS
        cache.set(slug, { at: now() })
        return undefined
      }
      if (!response.ok) {
        cache.set(slug, { at: now() })
        return undefined
      }
      const body = await response.json() as { stargazers_count?: unknown }
      const stars = body?.stargazers_count
      if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 0) {
        cache.set(slug, { at: now() })
        return undefined
      }
      // The server clock describes the reading better than the visitor's clock.
      const serverTime = Date.parse(response.headers.get('date') ?? '')
      const reading = { stars, observedAt: Number.isFinite(serverTime) ? serverTime : now() }
      cache.set(slug, { reading, at: reading.observedAt })
      return reading
    } catch {
      // Offline, CORS-blocked, or timed out: the catalog value remains.
      return undefined
    }
  }

  return {
    load(repo: string) {
      const slug = githubRepoSlug(repo)
      if (slug === undefined) return Promise.resolve(undefined)
      const inflight = pending.get(slug)
      if (inflight !== undefined) return inflight
      const task = request(slug).finally(() => { pending.delete(slug) })
      pending.set(slug, task)
      return task
    },
  }
}

export const liveStars = createLiveStarLoader()
