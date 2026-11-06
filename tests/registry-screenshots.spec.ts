import { describe, expect, it } from 'vitest'
import { displayScreenshots, mergeScreenshots } from '../scripts/registry-screenshots.mjs'

describe('registry screenshot merge', () => {
  it('prepends market captures and preserves upstream order', () => {
    expect(mergeScreenshots(
      ['https://market.example/home.png', 'https://market.example/conversation.png'],
      ['https://upstream.example/one.png', 'https://upstream.example/two.png'],
    )).toEqual([
      'https://market.example/home.png',
      'https://market.example/conversation.png',
      'https://upstream.example/one.png',
      'https://upstream.example/two.png',
    ])
  })

  it('deduplicates and drops repository cards only when market captures exist', () => {
    const repositoryCard = 'https://opengraph.githubassets.com/commit/owner/repo'
    expect(mergeScreenshots(['https://market.example/home.png'], [repositoryCard, 'https://market.example/home.png'])).toEqual([
      'https://market.example/home.png',
    ])
    expect(mergeScreenshots([], [repositoryCard])).toEqual([repositoryCard])
  })

  it('uses upstream screenshots instead of market captures when source is usable', () => {
    expect(displayScreenshots(
      ['https://pages.example/market.png'],
      ['https://raw.example/original.png'],
    )).toEqual(['https://raw.example/original.png'])
  })

  it('puts an explicit dynamic cover before other usable screenshots', () => {
    expect(displayScreenshots(
      ['https://pages.example/market.png'],
      ['https://raw.example/original.png', 'https://pages.example/market.gif'],
      undefined,
      'https://pages.example/market.gif',
    )).toEqual([
      'https://pages.example/market.gif',
      'https://raw.example/original.png',
    ])
  })

  it('uses the same eight-image limit as the client', () => {
    expect(displayScreenshots([], Array.from({ length: 9 }, (_, index) => `https://raw.example/${index}.png`))).toHaveLength(8)
  })

  it('does not promote an upstream cover when the entry is marked repository-card', () => {
    expect(displayScreenshots(
      ['https://pages.example/market.gif'],
      ['https://raw.example/original.png'],
      undefined,
      'https://raw.example/original.png',
      'repository-card',
    )).toEqual(['https://pages.example/market.gif'])
  })

  it('uses market captures and the current package when a monorepo list mixes packages', () => {
    expect(displayScreenshots(
      ['https://pages.example/market.png'],
      [
        'https://raw.example/repo/packages/skins/black-whale/preview/dark.jpg',
        'https://raw.example/repo/packages/skins/ocean/preview/dark.jpg',
      ],
      'packages/skins/ocean',
    )).toEqual([
      'https://pages.example/market.png',
      'https://raw.example/repo/packages/skins/ocean/preview/dark.jpg',
    ])
  })

  it('keeps only package-scoped upstream screenshots when no market capture exists', () => {
    expect(displayScreenshots(
      [],
      [
        'https://raw.example/repo/packages/skins/black-whale/preview/dark.jpg',
        'https://raw.example/repo/packages/skins/ocean/preview/dark.jpg',
      ],
      'packages/skins/ocean',
    )).toEqual(['https://raw.example/repo/packages/skins/ocean/preview/dark.jpg'])
  })
})
