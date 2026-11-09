// Client market tests: installed cards, discovery scrolling and embedded layout
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import React from 'react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => (await import('../fixtures/client-market.tsx')).createPrimitivesMock())

import { HOME_CATALOG_BATCH_SIZE, SkinMarketSection } from '../../src/client/SkinMarketSection.tsx'
import type { Operation } from '../../src/client/types.ts'
import { stubMarketFetch } from '../fixtures/market-host.ts'
import { dshRuntime, openSkinCard, skin, useMarketTestDom, zh } from '../fixtures/client-market.tsx'

useMarketTestDom()

describe('client market discovery', () => {
  it('keeps installed skins in discovery and exposes Use and Update on both cards', async () => {
    stubMarketFetch(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [{
        skinId: skin.id,
        installation: 'installed',
        activation: 'inactive',
        installedVersion: '1.0.0',
        updateAvailable: true,
        installedAt: '2026-08-16T00:00:00Z',
      }] },
    }))
    render(<SkinMarketSection t={key => key} />)

    expect(await screen.findByRole('button', { name: '测试皮肤 已安装卡片' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '测试皮肤 界面预览' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '使用' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: '常驻' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '更新' })).toHaveLength(2)
    const installedArticle = screen.getByRole('button', { name: '测试皮肤 已安装卡片' }).closest('article')!
    expect(within(installedArticle).queryByText('已安装')).toBeNull()
    expect(within(installedArticle).getByText('可更新')).toBeTruthy()
    const discoveryArticle = screen.getByRole('button', { name: '测试皮肤 界面预览' }).closest('article')!
    expect(within(discoveryArticle).getByText('已安装')).toBeTruthy()
    await openSkinCard()
    const use = screen.getByRole('button', { name: '使用' })
    const pin = screen.getByRole('button', { name: '设为常驻' })
    expect(use.getAttribute('variant')).toBe('primary')
    expect(pin.getAttribute('variant')).toBe('outline')
    expect(use.compareDocumentPosition(pin) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('activates a newly installed Web skin before honoring an install restart requirement', async () => {
    let installed = false
    let activated = false
    const installOperation: Operation = { id: 'install-new-skin', kind: 'install', skinId: skin.id, phase: 'done', restartRequired: true, startedAt: new Date().toISOString() }
    const activateOperation: Operation = { id: 'activate-new-skin', kind: 'activate', skinId: skin.id, phase: 'done', startedAt: new Date().toISOString() }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { hostKind: 'dsh', runtime: dshRuntime, skins: [{
        skinId: skin.id, installation: installed ? 'installed' : 'missing', activation: activated ? 'active' : 'inactive',
        installedVersion: installed ? skin.install.version : undefined, updateAvailable: false,
      }] }
      if (url.endsWith('/install') && init?.method === 'POST') { installed = true; return { operationId: installOperation.id } }
      if (url.endsWith('/activate') && init?.method === 'POST') { activated = true; return { operationId: activateOperation.id } }
      if (url.endsWith(`/operations/${installOperation.id}`)) return installOperation
      if (url.endsWith(`/operations/${activateOperation.id}`)) return activateOperation
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(screen.getByRole('button', { name: zh['common.installAndUse'] }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toHaveLength(1))
    expect(activated).toBe(true)
  })
  it('exposes Stop on active installed cards', async () => {
    stubMarketFetch(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [{
        skinId: skin.id,
        installation: 'installed',
        activation: 'active',
        installedVersion: '1.0.0',
        updateAvailable: false,
      }] },
    }))
    render(<SkinMarketSection t={key => key} />)

    expect(await screen.findAllByRole('button', { name: '停用' })).toHaveLength(2)
  })
  it('explains the conflict risk before pinning an active skin', async () => {
    stubMarketFetch(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [{
        skinId: skin.id,
        installation: 'installed',
        activation: 'active',
        primary: true,
        pinned: false,
        installedVersion: '1.0.0',
        updateAvailable: false,
      }] },
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    const pin = await screen.findByRole('button', { name: '设为常驻' })
    expect(pin.getAttribute('title')).toContain('宠物、音效')
    fireEvent.click(pin)
    const dialog = screen.getByRole('dialog', { name: zh['common.switchConfirmation'] })
    expect(dialog.textContent).toContain(zh['common.pinRisk'])
    expect(dialog.querySelector('ul, ol, code, a, details')).toBeNull()
    expect(screen.getByRole('button', { name: '确认设为常驻' })).toBeTruthy()
  })
  it('shows an active cancel action for a pinned skin', async () => {
    stubMarketFetch(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [{
        skinId: skin.id,
        installation: 'installed',
        activation: 'active',
        primary: false,
        pinned: true,
        installedVersion: '1.0.0',
        updateAvailable: true,
      }] },
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    const stop = await screen.findByRole('button', { name: '停用' })
    const unpin = screen.getByRole('button', { name: zh['common.unpin'] })
    const update = screen.getByRole('button', { name: '更新' })
    expect(screen.getAllByText('常驻').length).toBeGreaterThanOrEqual(3)
    expect(unpin.getAttribute('aria-pressed')).toBe('true')
    expect(stop.getAttribute('variant')).toBe('outline')
    expect(unpin.getAttribute('variant')).toBe('outline')
    expect(update.getAttribute('variant')).toBe('outline')
    expect(stop.compareDocumentPosition(unpin) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(unpin.compareDocumentPosition(update) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('shows the cached catalog before background revalidation finishes', async () => {
    const catalogCache = { read: vi.fn(async () => [skin]), write: vi.fn(async () => undefined) }
    stubMarketFetch(async () => await new Promise(() => undefined))

    render(<SkinMarketSection t={key => key} catalogCache={catalogCache} />)

    expect(await screen.findByRole('button', { name: /测试皮肤 界面预览/ })).toBeTruthy()
    expect(screen.getByRole('status', { name: zh['common.loadingInstalledSkins'] })).toBeTruthy()
    await openSkinCard()
    expect(screen.queryByText('正在加载皮肤列表…')).toBeNull()
    expect(screen.getByText('正在加载皮肤详情…')).toBeTruthy()
  })
  it('writes a successfully refreshed catalog to the browser cache', async () => {
    const catalogCache = { read: vi.fn(async () => null), write: vi.fn(async () => undefined) }
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] }))

    render(<SkinMarketSection t={key => key} catalogCache={catalogCache} />)

    await screen.findByRole('button', { name: /测试皮肤 界面预览/ })
    await waitFor(() => expect(catalogCache.write).toHaveBeenCalledWith([skin]))
  })
  it('renders complete discovery rows in 24-item batches as the settings feed scrolls', async () => {
    const skins = Array.from({ length: HOME_CATALOG_BATCH_SIZE * 2 + 5 }, (_, index) => ({
      ...skin,
      id: `test.skin-${index}`,
      package: `skin-${index}`,
      name: { zh: `测试皮肤 ${index}`, en: `Test Skin ${index}` },
      githubStars: HOME_CATALOG_BATCH_SIZE * 2 + 5 - index,
    }))
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins } : { skins: [] }))
    const view = render(<SkinMarketSection t={key => key} />)

    await screen.findByRole('button', { name: /测试皮肤 0 界面预览/ })
    expect(view.container.querySelector('[data-dsh-skin-market]')?.getAttribute('data-layout')).toBe('fill')
    expect(screen.getAllByRole('button', { name: /测试皮肤 \d+ 界面预览/ })).toHaveLength(HOME_CATALOG_BATCH_SIZE)
    const feed = document.querySelector<HTMLElement>('[class*="homeContent"]')
    if (feed === null) throw new Error('home content scroll area not found')
    Object.defineProperties(feed, { scrollHeight: { configurable: true, value: 2000 }, clientHeight: { configurable: true, value: 500 } })
    feed.scrollTop = 1300
    fireEvent.scroll(feed)
    await waitFor(() => expect(screen.getAllByRole('button', { name: /测试皮肤 \d+ 界面预览/ })).toHaveLength(HOME_CATALOG_BATCH_SIZE * 2))
    feed.scrollTop = 1500
    fireEvent.scroll(feed)
    await waitFor(() => expect(screen.getAllByRole('button', { name: /测试皮肤 \d+ 界面预览/ })).toHaveLength(skins.length))
  })
  it.each(['element', 'window'] as const)('preloads embedded catalog batches against the %s scroll root and ignores stale observations', async hostKind => {
    const skins = Array.from({ length: HOME_CATALOG_BATCH_SIZE * 2 + 5 }, (_, index) => ({
      ...skin, id: `test.skin-${index}`, package: `skin-${index}`,
      name: { zh: `测试皮肤 ${index}`, en: `Test Skin ${index}` }, githubStars: 50 - index,
    }))
    const observers: TestObserver[] = []
    class TestObserver {
      target?: Element
      observe = vi.fn((target: Element) => { this.target = target })
      disconnect = vi.fn()
      constructor(private callback: IntersectionObserverCallback, readonly options: IntersectionObserverInit) { observers.push(this) }
      emit(isIntersecting: boolean) {
        this.callback([{ isIntersecting, target: this.target } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
      }
    }
    vi.stubGlobal('IntersectionObserver', TestObserver)
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins } : { skins: [] }))
    const view = render(<div style={{ overflowY: hostKind === 'element' ? 'auto' : 'visible' }}><SkinMarketSection t={key => key} layout="embedded" /></div>)
    await screen.findByRole('button', { name: /测试皮肤 0 界面预览/ })
    const count = () => screen.getAllByRole('button', { name: /测试皮肤 \d+ 界面预览/ }).length
    const loadObserver = () => observers.filter(observer => String(observer.target?.className).includes('homeLoadMore')).at(-1)!
    expect(count()).toBe(HOME_CATALOG_BATCH_SIZE)
    const first = loadObserver()
    expect(first.options.root).toBe(hostKind === 'element' ? view.container.firstElementChild : null)
    expect(first.options.rootMargin).toBe('560px 0px')
    act(() => first.emit(false))
    expect(count()).toBe(HOME_CATALOG_BATCH_SIZE)
    act(() => { first.emit(true); first.emit(true) })
    await waitFor(() => expect(count()).toBe(HOME_CATALOG_BATCH_SIZE * 2))
    expect(first.disconnect).toHaveBeenCalledOnce()
    act(() => first.emit(true))
    expect(count()).toBe(HOME_CATALOG_BATCH_SIZE * 2)
    const second = loadObserver()
    fireEvent.click(screen.getByRole('button', { name: /测试皮肤 0 界面预览/ }))
    expect(second.disconnect).toHaveBeenCalledOnce()
    expect(view.container.querySelector('main')?.hidden).toBe(false)
    act(() => second.emit(true))
    const home = view.container.querySelector('main')!
    expect(home.querySelectorAll('[class*="discoveryGrid"] article')).toHaveLength(HOME_CATALOG_BATCH_SIZE * 2)
    fireEvent.click(within(screen.getByRole('dialog', { name: zh['common.skinDetails'] })).getByRole('button', { name: '关闭' }))
    const resumed = loadObserver()
    expect(resumed).not.toBe(second)
    act(() => resumed.emit(true))
    await waitFor(() => expect(count()).toBe(skins.length))
    expect(resumed.disconnect).toHaveBeenCalledOnce()
    view.unmount()
  })
  it.each(['element', 'window'] as const)('compacts the embedded header from the %s host scroll position and restores it on return', async hostKind => {
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] }))
    const view = render(<div style={{ overflowY: hostKind === 'element' ? 'auto' : 'visible' }}><SkinMarketSection t={key => key} layout="embedded" /></div>)
    await screen.findByRole('button', { name: /测试皮肤 界面预览/ })
    const host = view.container.firstElementChild as HTMLElement
    const home = host.querySelector('main')!
    const header = home.querySelector('header')!
    const feed = home.querySelector('div[class*="homeContent"]')!
    const viewportTop = hostKind === 'element' ? 82 : 0
    let scrollTop = 0
    vi.spyOn(host, 'getBoundingClientRect').mockImplementation(() => ({ top: 80 } as DOMRect))
    Object.defineProperty(host, 'clientTop', { configurable: true, value: 2 })
    vi.spyOn(home, 'getBoundingClientRect').mockImplementation(() => ({ top: viewportTop + 330 - scrollTop } as DOMRect))
    const scroll = (value: number) => {
      scrollTop = value
      fireEvent.scroll(hostKind === 'element' ? host : window)
    }
    scroll(402)
    expect(header.dataset.compact).toBeUndefined()
    scroll(403)
    expect(header.dataset.compact).toBe('true')
    scroll(380)
    expect(header.dataset.compact).toBe('true')
    scrollTop = 0
    fireEvent.scroll(feed)
    expect(header.dataset.compact).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /测试皮肤 界面预览/ }))
    scroll(0)
    expect(header.dataset.compact).toBe('true')
    fireEvent.click(within(screen.getByRole('dialog', { name: zh['common.skinDetails'] })).getByRole('button', { name: '关闭' }))
    expect(header.dataset.compact).toBeUndefined()
    scroll(403)
    expect(header.dataset.compact).toBe('true')
    scroll(346)
    expect(header.dataset.compact).toBeUndefined()
  })
  it('places a live operation below the docked discovery toolbar', async () => {
    const startedAt = new Date().toISOString()
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog')
      ? { skins: [skin] }
      : { skins: [], operations: [{ id: 'installing', skinId: skin.id, kind: 'install', phase: 'downloading', startedAt }] }))
    render(<SkinMarketSection t={key => key} />)
    await screen.findByText('正在下载“测试皮肤”')

    const header = document.querySelector('header')!
    const title = document.querySelector('[class*="discoverTitle"]') as HTMLElement
    const feed = document.querySelector('[class*="homeContent"]')!
    vi.spyOn(title, 'getBoundingClientRect').mockReturnValue({ top: 0, height: 28 } as DOMRect)
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 100 } as DOMRect)
    vi.spyOn(feed, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect)
    fireEvent.scroll(feed)

    const docked = await within(header).findByRole('heading', { name: zh['common.discoverMore'] })
    const banner = within(header).getByRole('status')
    expect(docked.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('shows all embedded results when viewport observation is unavailable', async () => {
    const skins = Array.from({ length: HOME_CATALOG_BATCH_SIZE + 5 }, (_, index) => ({
      ...skin, id: `test.skin-${index}`, package: `skin-${index}`,
      name: { zh: `测试皮肤 ${index}`, en: `Test Skin ${index}` },
    }))
    vi.stubGlobal('IntersectionObserver', undefined)
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins } : { skins: [] }))
    render(<SkinMarketSection t={key => key} layout="embedded" />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: /测试皮肤 \d+ 界面预览/ })).toHaveLength(skins.length))
  })
  it('keeps list and detail visible while refreshing after an operation', async () => {
    let catalogCalls = 0
    let stateCalls = 0
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) {
        catalogCalls += 1
        if (catalogCalls > 1) return await new Promise(() => undefined)
        return { skins: [skin] }
      }
      if (url.endsWith('/state')) {
        stateCalls += 1
        if (stateCalls > 1) return await new Promise(() => undefined)
        return { skins: [{ skinId: skin.id, installation: 'installed', activation: 'active', installedVersion: '1.0.0', updateAvailable: false }] }
      }
      if (url.endsWith('/deactivate') && init?.method === 'POST') return { operationId: 'deactivate-1' }
      if (url.endsWith('/operations/deactivate-1')) return { id: 'deactivate-1', phase: 'done' }
      throw new Error(`Unexpected request: ${url}`)
    })

    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '停用' }))
    await waitFor(() => expect(catalogCalls).toBe(2))

    expect(screen.getByRole('heading', { name: '测试皮肤' })).toBeTruthy()
    expect(screen.queryByText('正在加载皮肤列表…')).toBeNull()
    expect(screen.queryByText('正在加载皮肤详情…')).toBeNull()
  })
})
