// View preferences persist the explicit sort order and discovery categories.
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => (await import('../fixtures/client-market.tsx')).createPrimitivesMock())

import { SkinMarketSection } from '../../src/client/SkinMarketSection.tsx'
import {
  DEFAULT_MARKET_VIEW,
  readMarketViewPreferences,
  VIEW_CATEGORIES,
  VIEW_PREFERENCES_KEY,
  writeMarketViewPreferences,
  type MarketViewPreferences,
} from '../../src/client/view-preferences.ts'
import { openSkinCard, registerMarketTestDom, skin, zh } from '../fixtures/client-market.tsx'
import { stubMarketFetch } from '../fixtures/market-host.ts'

registerMarketTestDom()

interface MemoryStorage extends Pick<Storage, 'getItem' | 'setItem'> {
  raw(): string | null
}

function memoryStorage(initial: string | null = null): MemoryStorage {
  let value = initial
  return {
    getItem: (key: string): string | null => (key === VIEW_PREFERENCES_KEY ? value : null),
    setItem: (key: string, next: string): void => { if (key === VIEW_PREFERENCES_KEY) value = next },
    raw: () => value,
  }
}

const blockedStorage = {
  getItem: (): string | null => { throw new Error('storage disabled') },
  setItem: (): void => { throw new Error('storage disabled') },
}

function storedPreferences(): unknown {
  return JSON.parse(window.localStorage.getItem(VIEW_PREFERENCES_KEY) ?? 'null')
}

describe('market view preferences module', () => {
  it('exposes the documented key, categories and defaults', () => {
    expect(VIEW_PREFERENCES_KEY).toBe('dsh-skin-market:view-preferences:v1')
    expect(VIEW_CATEGORIES).toEqual(['skin', 'pet', 'player', 'splash'])
    expect(DEFAULT_MARKET_VIEW).toEqual({ sortBy: 'heat', categories: ['skin', 'splash'] })
  })

  it('falls back to the defaults without a stored value', () => {
    expect(readMarketViewPreferences(memoryStorage())).toEqual(DEFAULT_MARKET_VIEW)
    expect(readMarketViewPreferences(null)).toEqual(DEFAULT_MARKET_VIEW)
  })

  it('falls back to the defaults for unparsable or non-object JSON', () => {
    for (const raw of ['{not json', '[]', 'null', '"stars"', '42']) {
      expect(readMarketViewPreferences(memoryStorage(raw))).toEqual(DEFAULT_MARKET_VIEW)
    }
  })

  it('validates each field independently', () => {
    expect(readMarketViewPreferences(memoryStorage(JSON.stringify({ sortBy: 'popular', categories: ['pet'] }))))
      .toEqual({ sortBy: 'heat', categories: ['pet'] })
    expect(readMarketViewPreferences(memoryStorage(JSON.stringify({ sortBy: 'stars', categories: ['pet', 'theme'] }))))
      .toEqual({ sortBy: 'stars', categories: ['skin', 'splash'] })
    expect(readMarketViewPreferences(memoryStorage(JSON.stringify({ sortBy: 'latest', categories: [] }))))
      .toEqual({ sortBy: 'latest', categories: ['skin', 'splash'] })
    expect(readMarketViewPreferences(memoryStorage(JSON.stringify({ sortBy: 'latest', categories: 'pet' }))))
      .toEqual({ sortBy: 'latest', categories: ['skin', 'splash'] })
  })

  it('deduplicates categories and rewrites them in canonical order', () => {
    expect(readMarketViewPreferences(memoryStorage(JSON.stringify({ sortBy: 'heat', categories: ['splash', 'skin', 'splash', 'pet'] }))))
      .toEqual({ sortBy: 'heat', categories: ['skin', 'pet', 'splash'] })
  })

  it('round-trips a written value through a fake storage', () => {
    const storage = memoryStorage()
    writeMarketViewPreferences({ sortBy: 'latest', categories: ['player', 'skin'] }, storage)
    expect(JSON.parse(storage.raw() ?? 'null')).toEqual({ sortBy: 'latest', categories: ['skin', 'player'] })
    expect(readMarketViewPreferences(storage)).toEqual({ sortBy: 'latest', categories: ['skin', 'player'] })
  })

  it('normalizes an invalid sort and writes all-default values', () => {
    const storage = memoryStorage()
    writeMarketViewPreferences({ sortBy: 'popular', categories: ['pet'] } as unknown as MarketViewPreferences, storage)
    expect(JSON.parse(storage.raw() ?? 'null')).toEqual({ sortBy: 'heat', categories: ['pet'] })
    const defaults = memoryStorage()
    writeMarketViewPreferences(DEFAULT_MARKET_VIEW, defaults)
    expect(readMarketViewPreferences(defaults)).toEqual(DEFAULT_MARKET_VIEW)
  })

  it('skips writing an empty category selection', () => {
    const storage = memoryStorage()
    writeMarketViewPreferences({ sortBy: 'stars', categories: [] }, storage)
    expect(storage.raw()).toBeNull()
    expect(() => writeMarketViewPreferences({ sortBy: 'stars', categories: [] }, null)).not.toThrow()
  })

  it('never throws when storage getItem or setItem fails', () => {
    expect(() => readMarketViewPreferences(blockedStorage)).not.toThrow()
    expect(readMarketViewPreferences(blockedStorage)).toEqual(DEFAULT_MARKET_VIEW)
    expect(() => writeMarketViewPreferences({ sortBy: 'stars', categories: ['pet'] }, blockedStorage)).not.toThrow()
  })

  it('reads and writes window.localStorage by default', () => {
    expect(readMarketViewPreferences()).toEqual(DEFAULT_MARKET_VIEW)
    writeMarketViewPreferences({ sortBy: 'latest', categories: ['player', 'pet'] })
    expect(storedPreferences()).toEqual({ sortBy: 'latest', categories: ['pet', 'player'] })
    expect(readMarketViewPreferences()).toEqual({ sortBy: 'latest', categories: ['pet', 'player'] })
  })
})

const starSkin = { ...skin, id: 'test.star', name: { zh: '高星皮肤', en: 'Star Skin' }, category: 'splash', githubStars: 900, releaseUpdatedAt: '2026-01-05T00:00:00Z' }
const freshSkin = { ...skin, id: 'test.fresh', name: { zh: '最新皮肤', en: 'Fresh Skin' }, category: 'skin', githubStars: 5, releaseUpdatedAt: '2026-12-20T00:00:00Z' }
const petSkin = { ...skin, id: 'test.pet', name: { zh: '桌面宠物', en: 'Desk Pet' }, category: 'pet', githubStars: 50, releaseUpdatedAt: '2026-06-01T00:00:00Z' }
const marketSkins = [skin, starSkin, freshSkin, petSkin]

function stubCatalog(): void {
  stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: marketSkins } : { skins: [] }))
}

function sortGroup(): HTMLElement {
  return screen.getByRole('group', { name: zh['common.sortBy'] })
}

describe('client market view preferences persistence', () => {
  it('restores the explicit sort order after a remount', async () => {
    stubCatalog()
    const first = render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('heading', { name: zh['common.discoverMore'] })
    fireEvent.click(within(sortGroup()).getByRole('button', { name: 'Stars' }))
    expect(storedPreferences()).toEqual({ sortBy: 'stars', categories: ['skin', 'splash'] })
    first.unmount()

    render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('heading', { name: zh['common.discoverMore'] })
    expect(within(sortGroup()).getByRole('button', { name: 'Stars' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(sortGroup()).getByRole('button', { name: zh['common.sortHeat'] }).getAttribute('aria-pressed')).toBe('false')
  })

  it('restores the chosen discovery categories after a remount', async () => {
    stubCatalog()
    const first = render(<SkinMarketSection t={key => key} />)
    const filters = await screen.findByRole('group', { name: zh['common.category'] })
    fireEvent.click(within(filters).getByRole('button', { name: zh['common.pet'] }))
    expect(within(filters).getByRole('button', { name: zh['common.pet'] }).getAttribute('aria-pressed')).toBe('true')
    // Toggling appends in click order; the stored value is normalized for stability.
    expect(storedPreferences()).toEqual({ sortBy: 'heat', categories: ['skin', 'pet', 'splash'] })
    first.unmount()

    render(<SkinMarketSection t={key => key} />)
    const restored = await screen.findByRole('group', { name: zh['common.category'] })
    expect(within(restored).getByRole('button', { name: zh['common.skin'] }).getAttribute('aria-pressed')).toBe('true')
    expect(within(restored).getByRole('button', { name: zh['common.pet'] }).getAttribute('aria-pressed')).toBe('true')
    expect(within(restored).getByRole('button', { name: zh['common.splash'] }).getAttribute('aria-pressed')).toBe('true')
    expect(within(restored).getByRole('button', { name: zh['common.player'] }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: /桌面宠物 界面预览/ })).toBeTruthy()
  })

  it('keeps the chosen sort when the catalog range returns to all', async () => {
    stubCatalog()
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    const dialog = await screen.findByRole('dialog', { name: zh['common.skinDetails'] })
    fireEvent.click(within(within(dialog).getByRole('group', { name: zh['common.sortBy'] })).getByRole('button', { name: 'Stars' }))
    const range = within(dialog).getByRole('group', { name: zh['common.listRange'] })
    fireEvent.click(within(range).getByRole('button', { name: zh['common.installed'] }))
    fireEvent.click(within(range).getByRole('button', { name: zh['common.all'] }))
    expect(within(within(dialog).getByRole('group', { name: zh['common.sortBy'] })).getByRole('button', { name: 'Stars' }).getAttribute('aria-pressed')).toBe('true')
    expect(storedPreferences()).toEqual({ sortBy: 'stars', categories: ['skin', 'splash'] })

    fireEvent.click(within(dialog).getByRole('button', { name: zh['common.close'] }))
    expect(within(sortGroup()).getByRole('button', { name: 'Stars' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('renders defaults without rewriting when storage holds invalid preferences', async () => {
    const invalid = JSON.stringify({ sortBy: 'popular', categories: ['unknown'] })
    window.localStorage.setItem(VIEW_PREFERENCES_KEY, invalid)
    stubCatalog()
    render(<SkinMarketSection t={key => key} />)

    const filters = await screen.findByRole('group', { name: zh['common.category'] })
    expect(within(sortGroup()).getByRole('button', { name: zh['common.sortHeat'] }).getAttribute('aria-pressed')).toBe('true')
    expect(within(filters).getByRole('button', { name: zh['common.skin'] }).getAttribute('aria-pressed')).toBe('true')
    expect(within(filters).getByRole('button', { name: zh['common.splash'] }).getAttribute('aria-pressed')).toBe('true')
    expect(within(filters).getByRole('button', { name: zh['common.pet'] }).getAttribute('aria-pressed')).toBe('false')
    // Mounting only reads: the invalid value waits for the next explicit choice.
    expect(window.localStorage.getItem(VIEW_PREFERENCES_KEY)).toBe(invalid)
  })

  it('never writes on mount and does not persist transient view state', async () => {
    stubCatalog()
    const first = render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('button', { name: /高星皮肤 界面预览/ })
    expect(window.localStorage.getItem(VIEW_PREFERENCES_KEY)).toBeNull()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '高星' } })
    expect(screen.getByRole('button', { name: /高星皮肤 界面预览/ })).toBeTruthy()
    expect(window.localStorage.getItem(VIEW_PREFERENCES_KEY)).toBeNull()
    first.unmount()

    render(<SkinMarketSection t={key => key} />)
    expect((await screen.findByRole('textbox') as HTMLInputElement).value).toBe('')
  })
})
