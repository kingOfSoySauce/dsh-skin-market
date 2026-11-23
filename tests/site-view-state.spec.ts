import { describe, expect, it } from 'vitest'
import { DEFAULT_SITE_VIEW, readSiteView, SITE_VIEW_CATEGORIES, writeSiteView, type SiteViewState } from '../site/view-state.ts'

const defaultView: SiteViewState = { query: '', sort: 'heat', categories: ['skin', 'splash'] }

describe('site view state', () => {
  it('exports the canonical category order and the default view', () => {
    expect(SITE_VIEW_CATEGORIES).toEqual(['skin', 'pet', 'player', 'splash'])
    expect(DEFAULT_SITE_VIEW).toEqual(defaultView)
  })

  it('falls back to the default view for missing or empty state', () => {
    for (const search of ['', '?', '?dsh-media=1', '?sort=heat&cat=skin,splash&q=']) {
      expect(readSiteView(search)).toEqual(defaultView)
    }
  })

  it('parses valid values and canonicalizes the category order', () => {
    expect(readSiteView('?q=whale&sort=stars&cat=splash,pet')).toEqual({ query: 'whale', sort: 'stars', categories: ['pet', 'splash'] })
    expect(readSiteView('q=whale&sort=latest&cat=splash,pet')).toEqual({ query: 'whale', sort: 'latest', categories: ['pet', 'splash'] })
    expect(readSiteView('?sort=latest&cat=player,skin,bogus,player').categories).toEqual(['skin', 'player'])
  })

  it('ignores an invalid sort and reads back the default one', () => {
    for (const value of ['bogus', '', 'STARS', 'newest', 'heat ']) {
      expect(readSiteView(`?sort=${value}`).sort).toBe('heat')
    }
  })

  it('filters invalid categories, drops duplicates and defaults when none remain', () => {
    expect(readSiteView('?cat=pet,bogus,pet').categories).toEqual(['pet'])
    expect(readSiteView('?cat=bogus').categories).toEqual(defaultView.categories)
    expect(readSiteView('?cat=').categories).toEqual(defaultView.categories)
    expect(readSiteView('?cat=,,').categories).toEqual(defaultView.categories)
  })

  it('round-trips an explicitly empty category set through cat=none', () => {
    expect(readSiteView('?cat=none').categories).toEqual([])
    const search = writeSiteView('', { query: '', sort: 'heat', categories: [] })
    expect(search).toBe('?cat=none')
    expect(readSiteView(search).categories).toEqual([])
  })

  it('encodes and decodes query text', () => {
    const query = '深海 鲸 & 100%'
    const search = writeSiteView('', { query, sort: 'heat', categories: defaultView.categories })
    expect(search).not.toContain(query)
    expect(readSiteView(search).query).toBe(query)
    expect(readSiteView('?q=a+b').query).toBe('a b')
    expect(readSiteView('?q=%E6%B7%B1%E6%B5%B7').query).toBe('深海')
  })

  it('keeps every default out of the URL', () => {
    expect(writeSiteView('', defaultView)).toBe('')
    expect(writeSiteView('?', defaultView)).toBe('')
    expect(writeSiteView('?dsh-media=1', defaultView)).toBe('?dsh-media=1')
    expect(writeSiteView('?q=whale&sort=stars&cat=pet', defaultView)).toBe('')
    // Categories compare as a set, so order alone must not keep the parameter.
    expect(writeSiteView('?cat=splash,skin', defaultView)).toBe('')
  })

  it('preserves unknown parameters while adding and removing its own', () => {
    const withMedia = writeSiteView('?dsh-media=1&utm=share', { query: 'whale', sort: 'stars', categories: ['pet'] })
    const params = new URLSearchParams(withMedia)
    expect(params.get('dsh-media')).toBe('1')
    expect(params.get('utm')).toBe('share')
    expect(params.get('q')).toBe('whale')
    expect(params.get('sort')).toBe('stars')
    expect(params.get('cat')).toBe('pet')
    expect(writeSiteView(withMedia, defaultView)).toBe('?dsh-media=1&utm=share')
  })

  it('round-trips every field, including an empty category set', () => {
    const states: SiteViewState[] = [
      { query: '', sort: 'heat', categories: ['skin', 'splash'] },
      { query: '皮肤', sort: 'stars', categories: ['pet'] },
      { query: 'a b+c', sort: 'latest', categories: [] },
      { query: '', sort: 'latest', categories: ['skin', 'pet', 'player', 'splash'] },
    ]
    for (const state of states) {
      expect(readSiteView(writeSiteView('?dsh-media=1', state))).toEqual(state)
    }
  })

  it('returns an empty search string when nothing remains', () => {
    expect(writeSiteView('', defaultView)).toBe('')
    expect(writeSiteView('?dsh-media=1', defaultView)).toBe('?dsh-media=1')
    expect(writeSiteView('?q=x&sort=stars&cat=none', defaultView)).toBe('')
  })
})
