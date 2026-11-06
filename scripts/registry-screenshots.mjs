export function mergeScreenshots(marketScreenshots = [], upstreamScreenshots = []) {
  const upstream = marketScreenshots.length > 0
    ? upstreamScreenshots.filter(url => !isRepositoryPreviewUrl(url))
    : upstreamScreenshots
  return [...new Set([...marketScreenshots, ...upstream])].slice(0, 8)
}

export const MAX_DISPLAY_SCREENSHOTS = 8

function matchingScreenshots(upstreamScreenshots, subpath) {
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

/**
 * Restrict a monorepo's shared screenshot list to the current package when
 * the URL path provides enough evidence to do so. Unknown URL shapes are
 * preserved instead of being guessed away.
 */
export function scopedScreenshots(upstreamScreenshots = [], subpath) {
  const unique = [...new Set(upstreamScreenshots)]
  const scoped = matchingScreenshots(unique, subpath)
  return scoped.length > 0 ? scoped : unique
}

export function hasCrossPackageScreenshots(upstreamScreenshots = [], subpath) {
  const unique = [...new Set(upstreamScreenshots)]
  if (subpath === undefined || unique.length === 0) return false
  const scoped = matchingScreenshots(unique, subpath)
  return scoped.length > 0 && scoped.length < unique.length
}

/**
 * Build the renderable screenshot list without changing the source-of-truth
 * `screenshots` field. An explicit listScreenshot is an editorial cover choice;
 * repository-card URLs are never promoted as a cover.
 */
export function displayScreenshots(marketScreenshots = [], upstreamScreenshots = [], subpath, listScreenshot, reviewPreview = 'verified') {
  const upstream = scopedScreenshots(upstreamScreenshots, subpath)
  const contaminated = hasCrossPackageScreenshots(upstreamScreenshots, subpath)
  const usableUpstream = reviewPreview === 'repository-card' ? [] : upstream.filter(url => !isRepositoryPreviewUrl(url))
  const preferred = listScreenshot !== undefined
    && !isRepositoryPreviewUrl(listScreenshot)
    && (marketScreenshots.includes(listScreenshot) || (reviewPreview !== 'repository-card' && upstream.includes(listScreenshot)))
    ? listScreenshot
    : undefined
  const orderPreferred = display => {
    const unique = [...new Set(display)]
    if (preferred === undefined) return unique
    return [preferred, ...unique.filter(source => source !== preferred)]
  }
  if (contaminated) {
    const scopedDisplay = [...new Set([...marketScreenshots, ...usableUpstream])]
    if (preferred !== undefined && !scopedDisplay.includes(preferred)) scopedDisplay.unshift(preferred)
    if (scopedDisplay.length > 0) return orderPreferred(scopedDisplay).slice(0, MAX_DISPLAY_SCREENSHOTS)
  }
  if (usableUpstream.length > 0) return orderPreferred(usableUpstream).slice(0, MAX_DISPLAY_SCREENSHOTS)
  if (marketScreenshots.length > 0) return orderPreferred(marketScreenshots).slice(0, MAX_DISPLAY_SCREENSHOTS)
  return orderPreferred(upstream).slice(0, MAX_DISPLAY_SCREENSHOTS)
}

export function isRepositoryPreviewUrl(url) {
  return url.includes('opengraph.githubassets.com/')
    || url.includes('repository-images.githubusercontent.com/')
    || url.includes('dshfind.com/api/card')
}
