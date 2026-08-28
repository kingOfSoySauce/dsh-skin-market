import { join } from 'node:path'

export const MARKET_PAGES_ORIGIN = 'https://kingofsoysauce.github.io/dsh-skin-market'

const ASSET_PATTERN = /^skin-screenshots\/[A-Za-z0-9_.-]+\/[0-9a-f]{40}\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp|gif)$/i
const PAGES_PATH = /^\/(?:dsh-skin-market\/)?(skin-screenshots\/[A-Za-z0-9_.-]+\/[0-9a-f]{40}\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp|gif))$/i

export function screenshotAssetKey(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (ASSET_PATTERN.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    if (url.hostname !== 'kingofsoysauce.github.io') return null
    const match = PAGES_PATH.exec(url.pathname)
    return match ? match[1] : null
  } catch {
    return null
  }
}

export function resolveScreenshotRef(value, origin = MARKET_PAGES_ORIGIN) {
  if (typeof value !== 'string' || value === '') return value
  const key = screenshotAssetKey(value)
  if (key === null) return value
  return `${origin.replace(/\/$/, '')}/${key}`
}

export function localScreenshotPath(value, publicRoot) {
  const key = screenshotAssetKey(value)
  if (key === null) return null
  return join(publicRoot, key)
}

export function resolveScreenshotList(values, origin = MARKET_PAGES_ORIGIN) {
  if (!Array.isArray(values)) return []
  return values.map(value => resolveScreenshotRef(value, origin))
}
