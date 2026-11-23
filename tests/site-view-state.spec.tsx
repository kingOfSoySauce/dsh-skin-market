// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../site/main.tsx'
import type { CatalogSkin } from '../src/client/types.ts'

type Skin = CatalogSkin & { featuredRank: number; starsSnapshot: number; updatedAt: string }

const commit = 'd'.repeat(40)

function makeSkin(index: number, category?: string): Skin {
  return {
    id: `test.skin-${index}`,
    name: { zh: `测试皮肤 ${index}`, en: `Test Skin ${index}` },
    author: 'example',
    description: `测试皮肤 ${index}`,
    repo: `https://github.com/example/skin-${index}`,
    package: `@example/skin-${index}`,
    rowId: `skin-${index}`,
    ...(category === undefined ? {} : { category }),
    tags: [],
    modes: ['dark'],
    install: { target: `github:example/skins#${commit}`, version: '1.0.0', commit },
    compatibility: { dsh: '*', platform: ['web'] },
    screenshots: [],
    review: { compatibility: 'verified', preview: 'verified', installation: 'manual-only' },
    featuredRank: index,
    starsSnapshot: 1000 - index,
    updatedAt: `2026-10-${String((index % 28) + 1).padStart(2, '0')}`,
  } as Skin
}

const skins: Skin[] = Array.from({ length: 23 }, (_, index) => makeSkin(index))

function resetUrl(path = '/'): void {
  window.history.replaceState(null, '', path)
}

function searchParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

function sortGroup() {
  return within(screen.getByRole('group', { name: '排序方式' }))
}

function categoryGroup() {
  return within(screen.getByRole('group', { name: '分类' }))
}

function searchInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: '搜索皮肤、作者或标签' }) as HTMLInputElement
}

beforeEach(() => {
  resetUrl()
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    media: '',
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  resetUrl()
})

describe('site view state in the URL', () => {
  it('mirrors the sort choice into the URL and removes it again for the default', () => {
    render(<App skins={skins} />)

    fireEvent.click(sortGroup().getByRole('button', { name: 'Stars' }))
    expect(searchParam('sort')).toBe('stars')
    expect(window.location.search).toBe('?sort=stars')

    fireEvent.click(sortGroup().getByRole('button', { name: '最新' }))
    expect(searchParam('sort')).toBe('latest')

    fireEvent.click(sortGroup().getByRole('button', { name: '热度' }))
    expect(searchParam('sort')).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('mirrors category toggles and drops cat once the default set is back', () => {
    render(<App skins={skins} />)

    fireEvent.click(categoryGroup().getByRole('button', { name: '桌宠' }))
    expect(searchParam('cat')).toBe('skin,pet,splash')

    fireEvent.click(categoryGroup().getByRole('button', { name: '桌宠' }))
    expect(searchParam('cat')).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('mirrors the search query and clears it when the box is emptied', async () => {
    render(<App skins={skins} />)

    fireEvent.change(searchInput(), { target: { value: '测试皮肤 1' } })
    // Query writes are debounced so typing does not spend a history operation per key.
    await waitFor(() => expect(searchParam('q')).toBe('测试皮肤 1'))

    fireEvent.change(searchInput(), { target: { value: '' } })
    await waitFor(() => expect(searchParam('q')).toBeNull())
    expect(window.location.search).toBe('')
  })

  it('restores sort, categories and query from the URL after a remount', async () => {
    render(<App skins={skins} />)
    fireEvent.click(sortGroup().getByRole('button', { name: '最新' }))
    fireEvent.click(categoryGroup().getByRole('button', { name: '桌宠' }))
    fireEvent.change(searchInput(), { target: { value: '测试' } })
    await waitFor(() => expect(searchParam('q')).toBe('测试'))
    const shared = new URLSearchParams(window.location.search)
    expect(shared.get('sort')).toBe('latest')
    expect(shared.get('cat')).toBe('skin,pet,splash')
    expect(shared.get('q')).toBe('测试')

    cleanup()
    render(<App skins={skins} />)

    expect(sortGroup().getByRole('button', { name: '最新' }).getAttribute('aria-pressed')).toBe('true')
    expect(sortGroup().getByRole('button', { name: '热度' }).getAttribute('aria-pressed')).toBe('false')
    expect(categoryGroup().getByRole('button', { name: '皮肤' }).getAttribute('aria-pressed')).toBe('true')
    expect(categoryGroup().getByRole('button', { name: '桌宠' }).getAttribute('aria-pressed')).toBe('true')
    expect(categoryGroup().getByRole('button', { name: '启动动画' }).getAttribute('aria-pressed')).toBe('true')
    expect(searchInput().value).toBe('测试')
  })

  it('starts from a shared URL with query, sort and categories', () => {
    resetUrl(`/?q=${encodeURIComponent('测试皮肤 1')}&sort=latest&cat=pet`)
    render(<App skins={skins} />)

    expect(searchInput().value).toBe('测试皮肤 1')
    expect(sortGroup().getByRole('button', { name: '最新' }).getAttribute('aria-pressed')).toBe('true')
    expect(categoryGroup().getByRole('button', { name: '桌宠' }).getAttribute('aria-pressed')).toBe('true')
    expect(categoryGroup().getByRole('button', { name: '皮肤' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('restores an explicitly empty category set from cat=none', () => {
    resetUrl('/?cat=none')
    render(<App skins={skins} />)

    expect(categoryGroup().getByRole('button', { name: '皮肤' }).getAttribute('aria-pressed')).toBe('false')
    expect(categoryGroup().getByRole('button', { name: '启动动画' }).getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('.no-results')).toBeTruthy()

    // Changing another part of the view must keep the empty-set marker.
    fireEvent.click(sortGroup().getByRole('button', { name: '最新' }))
    expect(searchParam('sort')).toBe('latest')
    expect(searchParam('cat')).toBe('none')
  })

  it('keeps unknown parameters such as dsh-media while changing the view', async () => {
    resetUrl('/?dsh-media=1')
    render(<App skins={skins} />)

    fireEvent.click(sortGroup().getByRole('button', { name: 'Stars' }))
    expect(searchParam('dsh-media')).toBe('1')
    expect(searchParam('sort')).toBe('stars')

    fireEvent.click(categoryGroup().getByRole('button', { name: '桌宠' }))
    fireEvent.change(searchInput(), { target: { value: '测试' } })
    await waitFor(() => expect(searchParam('q')).toBe('测试'))
    expect(searchParam('dsh-media')).toBe('1')
    expect(searchParam('cat')).toBe('skin,pet,splash')
  })

  it('keeps the URL hash when replacing the search', () => {
    resetUrl('/#feed')
    render(<App skins={skins} />)

    fireEvent.click(sortGroup().getByRole('button', { name: 'Stars' }))
    expect(window.location.hash).toBe('#feed')
    expect(searchParam('sort')).toBe('stars')
  })

  it('does not add browser history entries', async () => {
    render(<App skins={skins} />)
    const historyLength = window.history.length

    fireEvent.click(sortGroup().getByRole('button', { name: 'Stars' }))
    fireEvent.click(categoryGroup().getByRole('button', { name: '桌宠' }))
    fireEvent.change(searchInput(), { target: { value: '测试' } })
    await waitFor(() => expect(searchParam('q')).toBe('测试'))

    expect(window.history.length).toBe(historyLength)
  })

  it('never writes the view state to localStorage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const storedLength = window.localStorage.length

    render(<App skins={skins} />)
    fireEvent.click(sortGroup().getByRole('button', { name: '最新' }))
    fireEvent.click(categoryGroup().getByRole('button', { name: '桌宠' }))
    fireEvent.change(searchInput(), { target: { value: '测试' } })

    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBe(storedLength)
  })

  it('keeps rendering when the browser refuses a history update', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new DOMException('throttled', 'SecurityError')
    })
    render(<App skins={skins} />)

    fireEvent.click(sortGroup().getByRole('button', { name: 'Stars' }))
    expect(sortGroup().getByRole('button', { name: 'Stars' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.change(searchInput(), { target: { value: '测试' } })
    await waitFor(() => expect(replaceState).toHaveBeenCalled())
    expect(screen.getByRole('textbox', { name: '搜索皮肤、作者或标签' })).toBeTruthy()
    replaceState.mockRestore()
  })

  it('does not rewrite an already canonical URL on mount', () => {
    resetUrl('/?sort=stars&dsh-media=1')
    const replaceState = vi.spyOn(window.history, 'replaceState')

    render(<App skins={skins} />)
    expect(replaceState).not.toHaveBeenCalled()
    expect(sortGroup().getByRole('button', { name: 'Stars' }).getAttribute('aria-pressed')).toBe('true')
    expect(searchParam('dsh-media')).toBe('1')
  })

  it('normalizes malformed URL values back to the defaults on mount', () => {
    resetUrl('/?sort=bogus&cat=bogus')
    render(<App skins={skins} />)

    expect(sortGroup().getByRole('button', { name: '热度' }).getAttribute('aria-pressed')).toBe('true')
    expect(categoryGroup().getByRole('button', { name: '皮肤' }).getAttribute('aria-pressed')).toBe('true')
    expect(categoryGroup().getByRole('button', { name: '启动动画' }).getAttribute('aria-pressed')).toBe('true')
    expect(window.location.search).toBe('')
  })
})
