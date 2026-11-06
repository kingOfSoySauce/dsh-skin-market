import { describe, expect, it } from 'vitest'
import { comparePublicCatalogOrder, shouldRenderPublicPreview, type PublicCatalogEntry } from '../site/catalog-order.ts'
import { getCatalogListScreenshot, getCatalogScreenshotUrls, usesMarketScreenshots } from '../src/catalog-order.ts'

const previewed = {
  review: { preview: 'verified' as const },
  screenshots: ['preview.png'],
  starsSnapshot: 1,
  updatedAt: '2026-08-17T00:00:00Z',
} satisfies PublicCatalogEntry

describe('public catalog order', () => {
  it('renders market-supplemented previews even when the upstream preview is a repository card', () => {
    const supplemented = {
      ...previewed,
      review: { preview: 'repository-card' as const },
      marketScreenshots: ['market-preview.png'],
    }

    expect(shouldRenderPublicPreview(supplemented, supplemented.marketScreenshots[0])).toBe(true)
    expect(shouldRenderPublicPreview({ ...supplemented, marketScreenshots: [] }, 'repository-card.png')).toBe(false)
    expect(shouldRenderPublicPreview(supplemented, supplemented.marketScreenshots[0], true)).toBe(false)
  })

  it('orders by momentum and falls back to lifetime stars on a tie', () => {
    const flatButPopular = { ...previewed, starsSnapshot: 1600, heat: { score: 0 } }
    const smallMover = { ...previewed, starsSnapshot: 6, heat: { score: 4.8 } }
    const quietSmall = { ...previewed, starsSnapshot: 10, heat: { score: 0 } }

    expect([flatButPopular, smallMover].sort((a, b) => comparePublicCatalogOrder(a, b, 'heat'))).toEqual([smallMover, flatButPopular])
    expect([quietSmall, flatButPopular].sort((a, b) => comparePublicCatalogOrder(a, b, 'heat'))).toEqual([flatButPopular, quietSmall])
  })

  it('treats catalogs without momentum as a zero score rather than failing', () => {
    const legacy = { ...previewed, starsSnapshot: 50 }
    const newer = { ...previewed, starsSnapshot: 5, heat: { score: 1 } }
    expect([legacy, newer].sort((a, b) => comparePublicCatalogOrder(a, b, 'heat'))).toEqual([newer, legacy])
  })

  it('keeps entries without a usable preview last before applying the selected sort', () => {
    const placeholder = {
      ...previewed,
      review: { preview: 'repository-card' as const },
      starsSnapshot: 999,
    }

    expect([placeholder, previewed].sort((a, b) => comparePublicCatalogOrder(a, b, 'stars'))).toEqual([
      previewed,
      placeholder,
    ])
  })

  it('treats market-supplemented screenshots as real previews', () => {
    const supplemented = {
      ...previewed,
      review: { preview: 'repository-card' as const },
      marketScreenshots: ['market-preview.png'],
    }
    const placeholder = {
      ...previewed,
      review: { preview: 'repository-card' as const },
      starsSnapshot: 999,
    }

    expect([placeholder, supplemented].sort((a, b) => comparePublicCatalogOrder(a, b, 'stars'))).toEqual([
      supplemented,
      placeholder,
    ])
  })

  it('uses upstream screenshots instead of market captures when the source is usable', () => {
    const entry = {
      ...previewed,
      marketScreenshots: ['https://pages.example/market.png'],
    }
    expect(getCatalogScreenshotUrls(entry)).toEqual(['preview.png'])
    expect(usesMarketScreenshots(entry)).toBe(false)
  })

  it('honors an explicit GIF cover when it is a dynamic version of an upstream screenshot', () => {
    const gif = 'https://pages.example/market-home.gif'
    const entry = {
      ...previewed,
      listScreenshot: gif,
      screenshots: ['preview.png', gif],
    }

    expect(getCatalogScreenshotUrls(entry)).toEqual([gif, 'preview.png'])
    expect(getCatalogListScreenshot(entry)).toBe(gif)
  })

  it('honors an explicit market cover even when the source has usable screenshots', () => {
    const market = 'https://pages.example/market-home.png'
    const entry = {
      ...previewed,
      listScreenshot: market,
      marketScreenshots: [market],
    }

    expect(getCatalogScreenshotUrls(entry)).toEqual([market, 'preview.png'])
    expect(getCatalogListScreenshot(entry)).toBe(market)
  })

  it('drops an invalid explicit cover instead of returning it as a fallback', () => {
    const entry = {
      ...previewed,
      listScreenshot: 'https://pages.example/missing.gif',
      screenshots: ['preview.png'],
    }

    expect(getCatalogScreenshotUrls(entry)).toEqual(['preview.png'])
    expect(getCatalogListScreenshot(entry)).toBe('preview.png')
  })

  it('keeps the client gallery at the registry limit', () => {
    const entry = {
      ...previewed,
      screenshots: Array.from({ length: 9 }, (_, index) => `preview-${index}.png`),
    }

    expect(getCatalogScreenshotUrls(entry)).toHaveLength(8)
  })

  it('uses market captures only when upstream screenshots are unavailable', () => {
    const entry = {
      ...previewed,
      review: { preview: 'repository-card' as const },
      marketScreenshots: ['https://pages.example/market.png'],
      screenshots: ['https://opengraph.githubassets.com/commit/owner/repo'],
    }
    expect(getCatalogScreenshotUrls(entry)).toEqual(['https://pages.example/market.png'])
    expect(usesMarketScreenshots(entry)).toBe(true)
  })

  it('isolates monorepo package previews and restores local captures when upstream mixes packages', () => {
    const entry = {
      ...previewed,
      subpath: 'packages/skins/ocean',
      marketScreenshots: ['https://pages.example/market.png'],
      screenshots: [
        'https://raw.example/repo/packages/skins/black-whale/preview/dark.jpg',
        'https://raw.example/repo/packages/skins/ocean/preview/dark.jpg',
      ],
    }

    expect(getCatalogScreenshotUrls(entry)).toEqual([
      'https://pages.example/market.png',
      'https://raw.example/repo/packages/skins/ocean/preview/dark.jpg',
    ])
    expect(getCatalogListScreenshot(entry)).toBe('https://pages.example/market.png')
    expect(usesMarketScreenshots(entry)).toBe(true)
  })
})
