import { describe, expect, it } from 'vitest'
import { canonicalScreenshotUrl, mediaKey } from '../scripts/media.mjs'
import { localScreenshotPath, resolveScreenshotRef, screenshotAssetKey } from '../scripts/screenshot-refs.mjs'

describe('screenshot asset keys', () => {
  const key = 'skin-screenshots/Magic-Mercury__dsh-chat-customizer/ee8da1661e4077d771945fb5e9e0b7b8c5fa7eb7/home.png'
  const pages = `https://kingofsoysauce.github.io/dsh-skin-market/${key}`

  it('round-trips GitHub Pages URLs to local keys', () => {
    expect(screenshotAssetKey(key)).toBe(key)
    expect(screenshotAssetKey(pages)).toBe(key)
    expect(screenshotAssetKey('https://raw.githubusercontent.com/owner/repo/sha/docs/a.png')).toBeNull()
  })

  it('resolves keys to the public Pages origin without changing media hashes', () => {
    expect(resolveScreenshotRef(key)).toBe(pages)
    expect(canonicalScreenshotUrl(key)).toBe(pages)
    expect(mediaKey(key)).toBe(mediaKey(pages))
  })

  it('maps keys onto site/public for local WebP conversion', () => {
    expect(localScreenshotPath(pages, '/tmp/public')).toBe(`/tmp/public/${key}`)
  })
})
