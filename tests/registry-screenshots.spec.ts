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

describe('GIF-first market display', () => {
  it('promotes a GIF ahead of static screenshots when there is no editorial cover', () => {
    expect(displayScreenshots([], [
      'https://raw.example/home.png',
      'https://raw.example/demo.gif',
      'https://raw.example/chat.png',
    ])).toEqual([
      'https://raw.example/demo.gif',
      'https://raw.example/home.png',
      'https://raw.example/chat.png',
    ])
  })

  it('keeps an editorial cover first and promotes the remaining GIFs behind it', () => {
    expect(displayScreenshots(
      ['https://pages.example/market-cover.png'],
      ['https://raw.example/home.png', 'https://raw.example/demo.gif'],
      undefined,
      'https://pages.example/market-cover.png',
    )).toEqual([
      'https://pages.example/market-cover.png',
      'https://raw.example/demo.gif',
      'https://raw.example/home.png',
    ])
  })

  it('treats a listScreenshot that repeats the first author screenshot as a mechanical cover', () => {
    expect(displayScreenshots(
      [],
      ['https://raw.example/home.png', 'https://raw.example/demo.gif'],
      undefined,
      'https://raw.example/home.png',
    )).toEqual(['https://raw.example/demo.gif', 'https://raw.example/home.png'])
  })

  it('keeps an explicit GIF cover first and groups later GIFs ahead of statics', () => {
    expect(displayScreenshots(
      ['https://pages.example/home.gif'],
      ['https://raw.example/one.png', 'https://raw.example/two.gif', 'https://raw.example/three.png'],
      undefined,
      'https://pages.example/home.gif',
    )).toEqual([
      'https://pages.example/home.gif',
      'https://raw.example/two.gif',
      'https://raw.example/one.png',
      'https://raw.example/three.png',
    ])
  })

  it('promotes a GIF that would otherwise fall outside the eight-image limit', () => {
    const display = displayScreenshots([], [
      ...Array.from({ length: 8 }, (_, index) => `https://raw.example/static-${index}.png`),
      'https://raw.example/demo.gif',
    ])
    expect(display).toHaveLength(8)
    expect(display[0]).toBe('https://raw.example/demo.gif')
  })

  it('partitions GIFs without changing the order inside each group and still deduplicates', () => {
    expect(displayScreenshots([], [
      'https://raw.example/a.png',
      'https://raw.example/b.gif',
      'https://raw.example/c.png',
      'https://raw.example/d.gif',
      'https://raw.example/b.gif',
    ])).toEqual([
      'https://raw.example/b.gif',
      'https://raw.example/d.gif',
      'https://raw.example/a.png',
      'https://raw.example/c.png',
    ])
  })

  it('keeps repository-card filtering ahead of the GIF rule', () => {
    const repositoryCard = 'https://opengraph.githubassets.com/commit/owner/repo'
    expect(displayScreenshots(
      ['https://pages.example/market.png'],
      ['https://raw.example/demo.gif', repositoryCard],
      undefined,
      undefined,
      'repository-card',
    )).toEqual(['https://pages.example/market.png'])
  })
})
