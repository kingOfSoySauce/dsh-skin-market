const GIF_SCREENSHOT_PATTERN = /\.gif(?:$|[?#])/i

export function isGifScreenshot(url) {
  return typeof url === 'string' && GIF_SCREENSHOT_PATTERN.test(url)
}

/**
 * Stable GIF-first partition: every GIF keeps its relative order ahead of the
 * static images, and the static images keep their own relative order after
 * them. Used by the market build and the sites/clients that render it so an
 * animated skin never shows a static cover just because the README listed the
 * PNG first.
 */
export function gifFirstScreenshots(sources = []) {
  const gifs = []
  const statics = []
  for (const source of sources) (isGifScreenshot(source) ? gifs : statics).push(source)
  return [...gifs, ...statics]
}

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
 * A listScreenshot that merely repeats the first author screenshot is the
 * mechanical cover the publish pipeline records (listScreenshot = screenshots[0]),
 * not an editorial choice. GIF-first may override it, otherwise every published
 * entry would keep the static first image as its market cover forever.
 *
 * Any other listScreenshot is an editorial cover and stays first; a cover that
 * is the first market capture is always editorial because that capture was
 * reviewed as the market proof.
 */
function isMechanicalCover(preferred, marketScreenshots, upstreamScreenshots) {
  return preferred !== undefined
    && preferred === upstreamScreenshots[0]
    && preferred !== marketScreenshots[0]
}

/**
 * Deterministic display order: deduplicate, keep an editorial cover first,
 * promote every remaining GIF ahead of the static screenshots, then apply the
 * eight-image display limit. Both the build and the site use this ordering so
 * the catalog media descriptors line up with what the page renders.
 */
function orderDisplayScreenshots(display, preferred, mechanical) {
  const unique = [...new Set(display)]
  const rest = preferred === undefined ? unique : unique.filter(source => source !== preferred)
  const ordered = preferred === undefined
    ? gifFirstScreenshots(unique)
    : mechanical
      ? gifFirstScreenshots([preferred, ...rest])
      : [preferred, ...gifFirstScreenshots(rest)]
  return ordered.slice(0, MAX_DISPLAY_SCREENSHOTS)
}

/**
 * Build the renderable screenshot list without changing the source-of-truth
 * `screenshots` field. An explicit listScreenshot is an editorial cover choice;
 * repository-card URLs are never promoted as a cover. When no editorial cover
 * contradicts it, GIFs are promoted ahead of static screenshots.
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
  const mechanical = isMechanicalCover(preferred, marketScreenshots, upstreamScreenshots)
  const orderPreferred = display => orderDisplayScreenshots(display, preferred, mechanical)
  if (contaminated) {
    const scopedDisplay = [...new Set([...marketScreenshots, ...usableUpstream])]
    if (preferred !== undefined && !scopedDisplay.includes(preferred)) scopedDisplay.unshift(preferred)
    if (scopedDisplay.length > 0) return orderPreferred(scopedDisplay)
  }
  if (usableUpstream.length > 0) return orderPreferred(usableUpstream)
  if (marketScreenshots.length > 0) return orderPreferred(marketScreenshots)
  return orderPreferred(upstream)
}

export function isRepositoryPreviewUrl(url) {
  return url.includes('opengraph.githubassets.com/')
    || url.includes('repository-images.githubusercontent.com/')
    || url.includes('dshfind.com/api/card')
}
