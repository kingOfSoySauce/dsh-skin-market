import { parseStarCurves, type StarCurve } from '../star-curves.ts'

/**
 * Star curves live beside the catalog as a separate file. The client only
 * needs them while a detail panel is open, so they are fetched lazily and kept
 * for the rest of the session. A failure leaves the panel without a chart.
 */
export const REMOTE_STAR_CURVES_URL = 'https://raw.githubusercontent.com/kingOfSoySauce/dsh-skin-market/main/data/star-curves.json'

let cache: Promise<Record<string, StarCurve>> | undefined

export function loadStarCurves(fetcher: typeof fetch = fetch): Promise<Record<string, StarCurve>> {
  if (cache !== undefined) return cache
  cache = (async () => {
    try {
      const response = await fetcher(REMOTE_STAR_CURVES_URL, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      })
      if (!response.ok) return {}
      return parseStarCurves(await response.json())
    } catch {
      return {}
    }
  })()
  // A failed or empty load must not poison later attempts in a long session.
  void cache.then(curves => { if (Object.keys(curves).length === 0) cache = undefined })
  return cache
}
