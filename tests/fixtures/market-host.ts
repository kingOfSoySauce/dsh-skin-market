import { vi } from 'vitest'

type FetchLike = (url: string, init?: RequestInit) => unknown

/** Values shaped like a fetch Response are returned untouched. */
function isResponseLike(value: unknown): value is { ok: boolean } {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { ok?: unknown; json?: unknown; text?: unknown }
  return typeof candidate.ok === 'boolean' && (typeof candidate.json === 'function' || typeof candidate.text === 'function')
}

/**
 * Install a fetch stub whose handler returns plain JSON payloads.
 *
 * Tests used to spell out `vi.stubGlobal('fetch', vi.fn(async … => ({ ok: true,
 * json: async () => payload })))` in every case. The handler now returns the
 * payload itself; response-like values (failures, non-2xx statuses, pending
 * promises) still pass through so error paths stay testable. Returns the mock
 * for request assertions.
 */
export function stubMarketFetch(handler: FetchLike) {
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    const value = await handler(url, init)
    return isResponseLike(value) ? value : { ok: true, json: async () => value }
  })
  vi.stubGlobal('fetch', mock)
  return mock
}
