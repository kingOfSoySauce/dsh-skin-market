// @vitest-environment jsdom
import React, { useEffect } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../site/main.tsx'
import { localizedSkinName, siteMessages } from '../site/messages.ts'
import { resolveBrowserLanguage, SitePreferencesProvider, useSitePreferences } from '../site/preferences.tsx'
import { marketPrompt, skinPrompt } from '../site/prompts.ts'
import type { CatalogSkin } from '../src/client/types.ts'

const commit = 'b'.repeat(40)
const skin = {
  id: 'example.skin', name: { zh: '测试皮肤', en: 'Test Skin' }, author: 'example', description: '社区原文描述',
  repo: 'https://github.com/example/skins', package: '@example/skin', rowId: 'skin', tags: ['community'], modes: ['dark'],
  install: { target: `github:example/skins#${commit}`, version: '1.0.0', commit },
  compatibility: { dsh: '*', platform: ['web'] }, screenshots: [],
  review: { compatibility: 'verified', preview: 'verified', installation: 'manual-only' },
  featuredRank: 0, starsSnapshot: 10, updatedAt: '2026-10-16',
} as CatalogSkin & { featuredRank: number; starsSnapshot: number; updatedAt: string }

let systemDark = false
const mediaListeners = new Set<(event: MediaQueryListEvent) => void>()

function installMatchMedia() {
  systemDark = false
  mediaListeners.clear()
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: systemDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.delete(listener),
    addListener: (listener: (event: MediaQueryListEvent) => void) => mediaListeners.add(listener),
    removeListener: (listener: (event: MediaQueryListEvent) => void) => mediaListeners.delete(listener),
    dispatchEvent: () => true,
  })))
}

function setSystemDark(value: boolean) {
  systemDark = value
  for (const listener of mediaListeners) listener({ matches: value, media: '(prefers-color-scheme: dark)' } as MediaQueryListEvent)
}

function Probe() {
  const { language, theme, resolvedTheme, setLanguage, setTheme } = useSitePreferences()
  return <div>
    <output data-testid="preferences">{language}/{theme}/{resolvedTheme}</output>
    <button onClick={() => setLanguage('en')}>set-en</button>
    <button onClick={() => setLanguage('zh')}>set-zh</button>
    <button onClick={() => setTheme('dark')}>set-dark</button>
    <button onClick={() => setTheme('light')}>set-light</button>
    <button onClick={() => setTheme('auto')}>set-auto</button>
  </div>
}

beforeEach(() => {
  window.localStorage.clear()
  installMatchMedia()
  Object.defineProperty(navigator, 'languages', { configurable: true, value: ['en-US'] })
  Object.defineProperty(navigator, 'language', { configurable: true, value: 'en-US' })
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-theme-preference')
  vi.unstubAllGlobals()
})

describe('standalone site preferences', () => {
  it('keeps the supported locale dictionaries key-symmetric', () => {
    expect(Object.keys(siteMessages.zh).sort()).toEqual(Object.keys(siteMessages.en).sort())
    expect(localizedSkinName({ name: { zh: '原始名称', en: '' } }, 'en')).toBe('原始名称')
  })

  it('resolves supported browser languages and falls back to the project language', () => {
    expect(resolveBrowserLanguage(['fr-FR', 'en-GB'])).toBe('en')
    expect(resolveBrowserLanguage(['ja-JP', 'de-DE'])).toBe('zh')
    expect(resolveBrowserLanguage(['zh-Hant', 'en-US'])).toBe('zh')
  })

  it('follows the browser language when there is no override and persists manual language and theme choices', async () => {
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['fr-FR', 'en-US'] })
    render(<SitePreferencesProvider><Probe /></SitePreferencesProvider>)
    expect(screen.getByTestId('preferences').textContent).toContain('en/auto/light')

    fireEvent.click(screen.getByRole('button', { name: 'set-dark' }))
    fireEvent.click(screen.getByRole('button', { name: 'set-en' }))
    await waitFor(() => expect(window.localStorage.getItem('dsh-skin-market:theme')).toBe('dark'))
    expect(window.localStorage.getItem('dsh-skin-market:language')).toBe('en')

    cleanup()
    render(<SitePreferencesProvider><Probe /></SitePreferencesProvider>)
    expect(screen.getByTestId('preferences').textContent).toContain('en/dark/dark')
  })

  it('updates the resolved theme when the system changes in auto mode but not after a manual override', async () => {
    render(<SitePreferencesProvider><Probe /></SitePreferencesProvider>)
    expect(screen.getByTestId('preferences').textContent).toContain('en/auto/light')
    setSystemDark(true)
    await waitFor(() => expect(screen.getByTestId('preferences').textContent).toContain('en/auto/dark'))

    fireEvent.click(screen.getByRole('button', { name: 'set-dark' }))
    setSystemDark(false)
    await waitFor(() => expect(screen.getByTestId('preferences').textContent).toContain('en/dark/dark'))

    fireEvent.click(screen.getByRole('button', { name: 'set-auto' }))
    expect(window.localStorage.getItem('dsh-skin-market:theme')).toBeNull()
  })

  it('updates document metadata and the root theme attributes with the active preferences', async () => {
    render(<SitePreferencesProvider initialLanguage="en" initialTheme="dark"><Probe /></SitePreferencesProvider>)
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en')
      expect(document.title).toBe('DSH Skin Market')
      expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain('Browse community skins')
      expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0d0e10')
      expect(document.documentElement.dataset.theme).toBe('dark')
    })
    fireEvent.click(screen.getByRole('button', { name: 'set-zh' }))
    fireEvent.click(screen.getByRole('button', { name: 'set-light' }))
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('zh-CN')
      expect(document.title).toBe('DSH 皮肤市场')
      expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain('无需安装即可浏览')
      expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f7f8fa')
      expect(document.documentElement.dataset.theme).toBe('light')
    })
  })
})

describe('English standalone site rendering', () => {
  it('repositions the compact search when the language changes header action widths', async () => {
    let actionsLeft = 900
    const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
      bottom: top + height,
      height,
      left,
      right: left + width,
      toJSON: () => ({}),
      top,
      width,
      x: left,
      y: top,
    })
    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.classList.contains('feed-search-slot')) return rect(0, 0, 1000, 42)
      if (this.classList.contains('topbar-main')) return rect(0, 0, 1000, 68)
      if (this.classList.contains('topbar')) return rect(0, 0, 1000, 68)
      if (this.classList.contains('brand')) return rect(0, 0, 180, 40)
      if (this.classList.contains('top-actions')) return rect(actionsLeft, 0, 300, 60)
      return rect(0, 0, 0, 0)
    })

    render(<SitePreferencesProvider initialLanguage="zh"><App skins={[skin]} /></SitePreferencesProvider>)
    try {
      const search = screen.getByRole('textbox', { name: '搜索皮肤、作者或标签' })
      fireEvent.scroll(window)
      await waitFor(() => expect(search.parentElement?.getAttribute('style')).toContain('position: fixed'))
      const before = search.parentElement?.getAttribute('style')

      actionsLeft = 780
      fireEvent.click(screen.getByRole('button', { name: '语言' }))
      const englishSearch = await screen.findByRole('textbox', { name: 'Search skins, authors, or tags' })
      await waitFor(() => expect(englishSearch.parentElement?.getAttribute('style')).not.toBe(before))
      expect(englishSearch.parentElement?.getAttribute('style')).toContain('left: 236px')
    } finally {
      getBoundingClientRect.mockRestore()
    }
  })

  it('exposes compact, labelled language and theme controls', () => {
    render(<SitePreferencesProvider initialLanguage="en"><App skins={[skin]} /></SitePreferencesProvider>)

    const preferences = screen.getByRole('group', { name: 'Display preferences' })
    const language = within(preferences).getByRole('button', { name: 'Language' })
    const theme = within(preferences).getByRole('button', { name: 'Theme' })
    expect(language.querySelector('svg')).toBeTruthy()
    expect(theme.querySelector('svg')).toBeTruthy()
    expect(language.getAttribute('title')).toBeNull()
    expect(theme.getAttribute('title')).toBeNull()
    const themePopover = screen.getByRole('dialog', { name: 'Theme' })
    expect(within(themePopover).getByRole('button', { name: 'System' })).toBeTruthy()
    expect(within(themePopover).getByRole('button', { name: 'Light' })).toBeTruthy()
    expect(within(themePopover).getByRole('button', { name: 'Dark' })).toBeTruthy()
    expect(themePopover.querySelectorAll('svg')).toHaveLength(2)
    expect(within(themePopover).getByText('Follow system settings')).toBeTruthy()
    expect(screen.queryByText('Always use light')).toBeNull()
    fireEvent.click(theme)
    expect(window.localStorage.getItem('dsh-skin-market:theme')).toBe('dark')
    expect(within(themePopover).getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(theme)
    expect(window.localStorage.getItem('dsh-skin-market:theme')).toBe('light')
    expect(within(themePopover).getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(themePopover).getByRole('button', { name: 'System' }))
    expect(window.localStorage.getItem('dsh-skin-market:theme')).toBeNull()
    const languagePopover = screen.getByRole('dialog', { name: 'Language' })
    expect(within(languagePopover).getByRole('button', { name: '中文' })).toBeTruthy()
    expect(within(languagePopover).getByRole('button', { name: 'English' })).toBeTruthy()
    expect(languagePopover.querySelectorAll('svg')).toHaveLength(0)
    fireEvent.click(language)
    expect(window.localStorage.getItem('dsh-skin-market:language')).toBe('zh')
    const github = screen.getByRole('link', { name: 'GitHub' })
    expect(github.textContent).toBe('')
    expect(github.querySelector('svg')).toBeTruthy()
    expect(github.getAttribute('title')).toBeNull()
    expect(github.className).toContain('icon-action-button')
    expect(document.querySelector('.github-popover')?.textContent).toBe('GitHub')
    expect(document.querySelector('.feed-header')).toBeNull()
  })

  it('localizes first-party chrome while preserving community catalog content and exact install targets', () => {
    render(<SitePreferencesProvider initialLanguage="en"><App skins={[skin]} /></SitePreferencesProvider>)

    expect(screen.getByText('Skin Market')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Search skins, authors, or tags' })).toBeTruthy()
    const categories = screen.getByRole('group', { name: 'Categories' })
    expect(within(categories).getByRole('button', { name: 'Skins' })).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Sort by' })).getByRole('button', { name: 'Momentum' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Test Skin interface preview' })).toBeTruthy()
    expect(screen.getByText('社区原文描述')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(screen.getByRole('heading', { name: 'Install Test Skin' })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Install Test Skin' }).textContent).toContain(`github:example/skins#${commit}`)
  })

  it('builds English prompts without changing commands, repository URLs, or safety boundaries', () => {
    const market = marketPrompt('en')
    expect(market).toContain('dsh plugin --profile web add "dsh-skin-market"')
    expect(market).toContain('https://github.com/kingOfSoySauce/dsh-skin-market')
    expect(market).toContain('Do not read .env, credentials')
    expect(market).toContain('Do not run dsh plugin --profile desktop')

    const prompt = skinPrompt(skin, 'en')
    expect(prompt).toContain(`github:example/skins#${commit}`)
    expect(prompt).toContain('Do not read .env, credentials')
    expect(prompt).toContain('Do not install, disable, or uninstall other skins for me.')
  })
})
