export interface PreviewableCatalogEntry {
  review?: { preview: 'verified' | 'repository-card' }
  subpath?: string
  marketScreenshots?: string[]
  listScreenshot?: string
  screenshots: string[]
}

export const MAX_CATALOG_SCREENSHOTS = 8

function isRepositoryPreviewUrl(url: string): boolean {
  return url.includes('opengraph.githubassets.com/')
    || url.includes('repository-images.githubusercontent.com/')
    || url.includes('dshfind.com/api/card')
}

function matchingScreenshots(upstreamScreenshots: string[], subpath: string | undefined): string[] {
  if (subpath === undefined || subpath.trim() === '') return []
  const normalizedSubpath = subpath.replace(/^\/+|\/+$/g, '')
  return upstreamScreenshots.filter(url => {
    try {
      const pathname = decodeURIComponent(new URL(url).pathname).replace(/^\/+|\/+$/g, '')
      return pathname === normalizedSubpath
        || pathname.includes(`/${normalizedSubpath}/`)
        || pathname.endsWith(`/${normalizedSubpath}`)
    } catch {
      return false
    }
  })
}

function scopedScreenshots(upstreamScreenshots: string[], subpath: string | undefined): string[] {
  const unique = [...new Set(upstreamScreenshots)]
  const scoped = matchingScreenshots(unique, subpath)
  return scoped.length > 0 ? scoped : unique
}

function hasCrossPackageScreenshots(upstreamScreenshots: string[], subpath: string | undefined): boolean {
  const unique = [...new Set(upstreamScreenshots)]
  if (subpath === undefined || unique.length === 0) return false
  const scoped = matchingScreenshots(unique, subpath)
  return scoped.length > 0 && scoped.length < unique.length
}

function preferScreenshot(screenshots: string[], preferred: string | undefined): string[] {
  const unique = [...new Set(screenshots)]
  if (preferred === undefined) return unique
  return [preferred, ...unique.filter(source => source !== preferred)]
}

function explicitScreenshot(entry: PreviewableCatalogEntry, market: string[], upstream: string[]): string | undefined {
  const preferred = entry.listScreenshot
  if (preferred === undefined || isRepositoryPreviewUrl(preferred)) return undefined
  if (market.includes(preferred)) return preferred
  return entry.review?.preview === 'repository-card' || !upstream.includes(preferred) ? undefined : preferred
}

export function usesMarketScreenshots(entry: PreviewableCatalogEntry): boolean {
  const market = entry.marketScreenshots ?? []
  const upstream = entry.screenshots
  const scopedUpstream = scopedScreenshots(upstream, entry.subpath)
  const hasUsableUpstream = entry.review?.preview !== 'repository-card'
    && scopedUpstream.some(url => !isRepositoryPreviewUrl(url))
  return market.length > 0 && (hasCrossPackageScreenshots(upstream, entry.subpath) || !hasUsableUpstream)
}

/**
 * Returns the URLs that should actually be rendered. An explicit listScreenshot
 * is an editorial cover choice and may intentionally promote a market capture
 * or dynamic GIF ahead of the source-of-truth repository screenshots.
 */
export function getCatalogScreenshotUrls(entry: PreviewableCatalogEntry): string[] {
  const market = entry.marketScreenshots ?? []
  const upstream = entry.screenshots
  const contaminated = hasCrossPackageScreenshots(upstream, entry.subpath)
  const scopedUpstream = scopedScreenshots(upstream, entry.subpath)
  const usableUpstream = entry.review?.preview === 'repository-card'
    ? []
    : scopedUpstream.filter(url => !isRepositoryPreviewUrl(url))
  const preferred = explicitScreenshot(entry, market, scopedUpstream)
  if (contaminated) {
    const scopedDisplay = [...new Set([...market, ...usableUpstream])]
    if (preferred !== undefined && !scopedDisplay.includes(preferred)) scopedDisplay.unshift(preferred)
    if (scopedDisplay.length > 0) return preferScreenshot(scopedDisplay, preferred).slice(0, MAX_CATALOG_SCREENSHOTS)
  }
  if (usableUpstream.length > 0) return preferScreenshot(usableUpstream, preferred).slice(0, MAX_CATALOG_SCREENSHOTS)
  if (market.length > 0) return preferScreenshot(market, preferred).slice(0, MAX_CATALOG_SCREENSHOTS)
  return preferScreenshot([...new Set([...market, ...scopedUpstream])], preferred).slice(0, MAX_CATALOG_SCREENSHOTS)
}

export function getCatalogListScreenshot(entry: PreviewableCatalogEntry): string | undefined {
  return getCatalogScreenshotUrls(entry)[0]
}

/** Keep entries with real UI imagery ahead of repository-only placeholders. */
export function hasCatalogPreview(entry: PreviewableCatalogEntry): boolean {
  const hasMarketScreenshots = (entry.marketScreenshots?.length ?? 0) > 0
  const scopedUpstream = scopedScreenshots(entry.screenshots, entry.subpath)
  const hasUsableUpstream = entry.review?.preview !== 'repository-card'
    && scopedUpstream.some(url => !isRepositoryPreviewUrl(url))
  return hasUsableUpstream || hasMarketScreenshots
}

export type CatalogSort = 'heat' | 'stars' | 'latest'

export function compareCatalogOrder<T extends PreviewableCatalogEntry>(
  a: T,
  b: T,
  sortBy: CatalogSort,
  starsFor: (entry: T) => number,
  updatedAtFor: (entry: T) => string,
  heatFor: (entry: T) => number = () => 0,
): number {
  const aHasPreview = hasCatalogPreview(a)
  const bHasPreview = hasCatalogPreview(b)
  if (aHasPreview !== bHasPreview) return aHasPreview ? -1 : 1
  if (sortBy === 'heat') return heatFor(b) - heatFor(a) || starsFor(b) - starsFor(a)
  return sortBy === 'latest'
    ? Date.parse(updatedAtFor(b)) - Date.parse(updatedAtFor(a))
    : starsFor(b) - starsFor(a)
}
