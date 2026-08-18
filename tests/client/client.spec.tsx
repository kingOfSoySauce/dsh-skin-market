// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const icon = () => React.createElement('span', { 'aria-hidden': true })
  return {
    Button: ({ icon: leading, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => React.createElement('button', props, leading, children),
    Input: ({ icon: leading, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }) => React.createElement('label', null, leading, React.createElement('input', props)),
    Pill: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement('button', props, children),
    Modal: ({ open, title, description, footer, children }: { open: boolean; title: string; description?: string; footer?: React.ReactNode; children?: React.ReactNode }) => open ? React.createElement('div', { role: 'dialog', 'aria-label': title }, description, children, footer) : null,
    IconChevronLeftOutline14: icon, IconChevronDownOutline14: icon, IconCopyOutline16: icon, IconDownloadOutline16: icon, IconLinkOutline16: icon, IconLoadingOutline16: icon,
    IconRefreshOutline16: icon, IconSearchOutline16: icon, IconTrashOutline16: icon,
  }
})

import { CATALOG_BATCH_SIZE, captureListScroll, restartReloadUrl, restoreListScroll, restoreMarketStyleOrder, SkinMarketSection } from '../../src/client/SkinMarketSection.tsx'
import { createClientSkinRuntime, missingPrimitives, switchClientSkin } from '../../src/client/index.ts'
import { createSkinInstallCommand, createSkinInstallPrompt } from '../../src/client/submission.ts'
import type { CatalogSkin } from '../../src/client/types.ts'

const skin = {
  id: 'test.skin', name: { zh: '测试皮肤', en: 'Test Skin' }, author: 'author', description: 'description', repo: 'https://github.com/a/b', package: 'skin', rowId: 'skin',
  tags: ['dark'], modes: ['dark'], install: { target: 'https://github.com/a/b.git#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', version: '1.0.0', commit: 'a'.repeat(40) }, compatibility: { dsh: '0.1.0-rc.6', platform: ['web'] },
  screenshots: ['https://example.com/preview.png'], license: { code: 'MIT', commercialUse: true }, githubStars: 42, starsStale: false, starsUpdatedAt: '2026-08-16T00:00:00Z', recommendations: [], releaseUpdatedAt: '2026-08-16T00:00:00Z', metadataUpdatedAt: '2026-08-16T00:00:00Z', updatedAt: '2026-08-16T00:00:00Z',
} satisfies CatalogSkin

afterEach(() => { cleanup(); window.localStorage.clear(); vi.unstubAllGlobals() })

async function openSkinCard(name: RegExp = /测试皮肤 界面预览/) {
  const card = await screen.findByRole('button', { name })
  fireEvent.click(card)
  return card
}

describe('client market', () => {
  it('restores the visible list anchor after background reordering', () => {
    const list = document.createElement('div')
    const card = document.createElement('button')
    card.dataset.skinId = 'anchored-skin'
    list.appendChild(card)
    list.scrollTop = 200
    Object.defineProperty(list, 'getBoundingClientRect', { value: () => ({ top: 100 }) })
    Object.defineProperty(card, 'getBoundingClientRect', { configurable: true, value: () => ({ top: 90, bottom: 120 }) })
    const anchor = captureListScroll(list)

    Object.defineProperty(card, 'getBoundingClientRect', { configurable: true, value: () => ({ top: 140, bottom: 170 }) })
    restoreListScroll(list, anchor)

    expect(list.scrollTop).toBe(250)
  })

  it('keeps the selected detail and open modal during a catalog refresh', async () => {
    const second = { ...skin, id: 'test.second', name: { zh: '第二皮肤', en: 'Second Skin' }, package: 'second-skin', rowId: 'second-skin' }
    let catalogRequests = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/catalog')) {
        catalogRequests += 1
        return { ok: true, json: async () => ({ skins: catalogRequests === 1 ? [skin, second] : [skin] }) }
      }
      return { ok: true, json: async () => ({ skins: [], installedClientPlugins: [], runningAgentCount: 0 }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByRole('button', { name: /第二皮肤 界面预览/ }))
    fireEvent.click(screen.getByRole('button', { name: '提交皮肤' }))
    expect(screen.getByRole('dialog', { name: '提交你的皮肤' })).toBeTruthy()
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(catalogRequests).toBe(2))
    expect(screen.getByRole('heading', { name: '第二皮肤' })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: '提交你的皮肤' })).toBeTruthy()
  })

  it('hides catalog metadata and the manual refresh control', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin], generatedAt: '2026-08-15T12:00:00Z', catalogSource: 'bundled' }) }
      return { ok: true, json: async () => ({ skins: [], installedClientPlugins: [], runningAgentCount: 0 }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)

    expect(await screen.findByRole('button', { name: /测试皮肤 界面预览/ })).toBeTruthy()
    expect(screen.queryByText(/内置目录|在线目录/)).toBeNull()
    expect(screen.queryByRole('button', { name: '刷新在线目录' })).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/catalog/refresh'))).toBe(false)
  })

  it('shows a compact self-update action only when GitHub has a newer market version', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [] }) }
      if (url.endsWith('/market-update') && init?.method === 'POST') return { ok: true, json: async () => ({ currentVersion: '0.1.16', latestVersion: '0.1.16', updateAvailable: false }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.15', latestVersion: '0.1.16', updateAvailable: true }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)

    const update = await screen.findByRole('button', { name: '更新皮肤市场到 0.1.16' })
    expect(update.textContent).toBe('更新')
    fireEvent.click(update)

    expect(await screen.findByRole('dialog', { name: '皮肤市场已更新' })).toBeTruthy()
    expect(screen.getByText(/新版本 0.1.16 已安装。重启 DSH Web 后生效/)).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', { name: '更新皮肤市场到 0.1.16' })).toBeNull())
  })

  it('turns an empty successful response into a useful Host update error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected end of JSON input') } })))
    render(<SkinMarketSection t={key => key} />)

    expect(await screen.findByText('皮肤市场服务未返回有效数据，请确认 Host 插件已经更新')).toBeTruthy()
    expect(screen.queryByText(/Unexpected end of JSON input/)).toBeNull()
  })

  it('cache-busts the full document exactly once after a DSH restart', () => {
    const result = new URL(restartReloadUrl('http://127.0.0.1:8081/?view=market', 'new-instance'))
    expect(result.searchParams.get('view')).toBe('market')
    expect(result.searchParams.get('dsh-skin-reload')).toBe('new-instance')
  })

  it('restores market style priority after a skin is hot-loaded', () => {
    const market = document.createElement('style')
    market.textContent = '.generated-filter-marker{}'
    const skinStyle = document.createElement('style')
    skinStyle.dataset.plugin = 'skin-package'
    document.head.append(market, skinStyle)

    restoreMarketStyleOrder(document, 'generated-filter-marker')

    expect(document.head.lastElementChild).toBe(market)
    market.remove()
    skinStyle.remove()
  })

  it('hot-disables and re-enables an existing client skin entry', async () => {
    const update = vi.fn(async () => undefined)
    const runtime = createClientSkinRuntime({ entries: () => [{ options: { name: 'skin-package' }, update }] })

    await expect(runtime.setActive('skin-package', false)).resolves.toBe(true)
    expect(update).toHaveBeenLastCalledWith({ disabled: true }, false, true)
    await expect(runtime.setActive('skin-package', true)).resolves.toBe(true)
    expect(update).toHaveBeenLastCalledWith({ disabled: null }, false, true)
    await expect(runtime.setActive('missing-package', false)).resolves.toBe(false)
  })

  it('fully disables every client skin before enabling the selected one', async () => {
    const calls: string[] = []
    const runtime = { setActive: vi.fn(async (name: string, active: boolean) => { calls.push(`${name}:${active}`); return true }) }

    await expect(switchClientSkin(runtime, ['old-skin', 'new-skin'], 'new-skin')).resolves.toBe(true)
    expect(calls).toEqual(['old-skin:false', 'new-skin:false', 'new-skin:true'])
  })

  it('guards missing native primitives', () => {
    expect(missingPrimitives({ Button: true })).toEqual(['Input', 'Modal', 'Pill'])
  })

  it('shows the feed loading hint, then puts the active skin first in Installed', async () => {
    const activeSkin = { ...skin, id: 'test.active', name: { zh: '当前皮肤', en: 'Active Skin' } }
    let resolveCatalog!: (value: unknown) => void
    let resolveState!: (value: unknown) => void
    vi.stubGlobal('fetch', vi.fn((url: string) => new Promise(resolve => {
      if (url.endsWith('/catalog')) resolveCatalog = resolve
      else resolveState = resolve
    })))

    render(<SkinMarketSection t={key => key} />)
    expect(screen.getByText('正在加载皮肤…')).toBeTruthy()
    expect(screen.queryByText('没有匹配的皮肤')).toBeNull()

    await waitFor(() => expect(typeof resolveCatalog).toBe('function'))
    resolveCatalog({ ok: true, json: async () => ({ skins: [skin, activeSkin] }) })
    resolveState({ ok: true, json: async () => ({ skins: [
      { skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false },
      { skinId: activeSkin.id, installation: 'installed', activation: 'active', installedVersion: '1.0.0', updateAvailable: true },
    ] }) })

    const activeCard = await screen.findByRole('button', { name: /当前皮肤 已安装卡片/ })
    expect(activeCard.getAttribute('aria-current')).toBe('true')
    expect(activeCard.textContent).toContain('使用中')
    expect(activeCard.textContent).not.toContain('可更新')
    expect(screen.queryByText('正在加载皮肤…')).toBeNull()
  })

  it('opens details in a labelled modal surface with an explicit close action', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)

    await openSkinCard()
    expect(screen.getByRole('dialog', { name: '皮肤详情' })).toBeTruthy()
    const close = screen.getByRole('button', { name: '关闭皮肤详情' })
    expect(close.textContent).toContain('关闭详情')
    fireEvent.click(close)
    expect(screen.queryByRole('dialog', { name: '皮肤详情' })).toBeNull()
  })

  it('orders Installed by active then install time and opens the installed browser from the overflow card', async () => {
    const installedSkins = Array.from({ length: 6 }, (_, index) => ({
      ...skin,
      id: `test.installed-${index}`,
      name: { zh: `已装皮肤 ${index}`, en: `Installed Skin ${index}` },
      package: `installed-skin-${index}`,
      rowId: `installed-skin-${index}`,
      githubStars: index,
    }))
    const runtime = installedSkins.map((item, index) => ({
      skinId: item.id,
      installation: 'installed',
      activation: index === 5 ? 'active' : 'inactive',
      installedVersion: '1.0.0',
      updateAvailable: false,
      installedAt: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    }))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: installedSkins } : { skins: runtime },
    })))
    render(<SkinMarketSection t={key => key} />)

    const installedSection = (await screen.findByRole('heading', { name: '已安装' })).closest('section')!
    const cards = [...installedSection.querySelectorAll<HTMLButtonElement>('button[aria-label$="已安装卡片"]')]
    expect(cards.map(card => card.getAttribute('aria-label'))).toEqual([
      '已装皮肤 5 已安装卡片',
      '已装皮肤 4 已安装卡片',
      '已装皮肤 3 已安装卡片',
      '已装皮肤 2 已安装卡片',
    ])

    fireEvent.click(screen.getByRole('button', { name: '查看全部已安装' }))
    expect(await screen.findByRole('button', { name: '已安装', pressed: true })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '已装皮肤 5' })).toBeTruthy()
  })

  it('opens an installed card directly in its selected detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [{
        skinId: skin.id,
        installation: 'installed',
        activation: 'inactive',
        installedVersion: '1.0.0',
        updateAvailable: false,
        installedAt: '2026-08-16T00:00:00Z',
      }] },
    })))
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByRole('button', { name: /测试皮肤 已安装卡片/ }))
    expect(await screen.findByRole('heading', { name: '测试皮肤' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '已安装', pressed: true })).toBeTruthy()
  })

  it('uses a low-priority card action to install without activating', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [] }) }
      if (url.endsWith('/install') && init?.method === 'POST') return await new Promise(() => undefined)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)

    const install = await screen.findByRole('button', { name: '安装' })
    expect(install.getAttribute('variant')).toBe('ghost')
    expect(screen.queryByText('可安装')).toBeNull()
    fireEvent.click(install)

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/install') && init?.method === 'POST')).toBe(true))
    expect(screen.getByRole('group', { name: '测试皮肤 操作' }).textContent).toContain('安装中')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(false)
  })

  it('opens a prompt-only install dialog for manual cards', async () => {
    const manual = { ...skin, review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'manual-only' as const } }
    const writeText = vi.fn(async () => undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [manual] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    expect(dialog.textContent).toContain('暂不支持市场直接安装')
    expect(screen.queryByRole('button', { name: '复制命令' })).toBeNull()
    const copyPrompt = screen.getAllByRole('button', { name: '复制提示词' }).at(-1)!
    fireEvent.click(copyPrompt)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(createSkinInstallPrompt(manual)))
  })

  it('keeps installed skins in discovery and exposes Use and Update on both cards', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [{
        skinId: skin.id,
        installation: 'installed',
        activation: 'inactive',
        installedVersion: '1.0.0',
        updateAvailable: true,
        installedAt: '2026-08-16T00:00:00Z',
      }] },
    })))
    render(<SkinMarketSection t={key => key} />)

    expect(await screen.findByRole('button', { name: '测试皮肤 已安装卡片' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '测试皮肤 界面预览' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '使用' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '更新' })).toHaveLength(2)
  })

  it('exposes Stop on active installed cards', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [{
        skinId: skin.id,
        installation: 'installed',
        activation: 'active',
        installedVersion: '1.0.0',
        updateAvailable: false,
      }] },
    })))
    render(<SkinMarketSection t={key => key} />)

    expect(await screen.findAllByRole('button', { name: '停用' })).toHaveLength(2)
  })

  it('shows the cached catalog before background revalidation finishes', async () => {
    const catalogCache = { read: vi.fn(async () => [skin]), write: vi.fn(async () => undefined) }
    vi.stubGlobal('fetch', vi.fn(async () => await new Promise(() => undefined)))

    render(<SkinMarketSection t={key => key} catalogCache={catalogCache} />)

    expect(await screen.findByRole('button', { name: /测试皮肤 界面预览/ })).toBeTruthy()
    expect(screen.queryByText('正在加载皮肤列表…')).toBeNull()
    expect(screen.getByText('正在加载皮肤详情…')).toBeTruthy()
  })

  it('writes a successfully refreshed catalog to the browser cache', async () => {
    const catalogCache = { read: vi.fn(async () => null), write: vi.fn(async () => undefined) }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] } })))

    render(<SkinMarketSection t={key => key} catalogCache={catalogCache} />)

    await screen.findByRole('button', { name: /测试皮肤 界面预览/ })
    await waitFor(() => expect(catalogCache.write).toHaveBeenCalledWith([skin]))
  })

  it('renders the catalog in 20-item batches as the list scrolls', async () => {
    const skins = Array.from({ length: CATALOG_BATCH_SIZE * 2 + 5 }, (_, index) => ({
      ...skin,
      id: `test.skin-${index}`,
      package: `skin-${index}`,
      name: { zh: `测试皮肤 ${index}`, en: `Test Skin ${index}` },
      githubStars: CATALOG_BATCH_SIZE * 2 + 5 - index,
    }))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)

    await screen.findByRole('button', { name: /测试皮肤 0 界面预览/ })
    expect(screen.getAllByRole('button', { name: /测试皮肤 \d+ 界面预览/ })).toHaveLength(CATALOG_BATCH_SIZE)
    const feed = screen.getByRole('main')
    Object.defineProperties(feed, { scrollHeight: { configurable: true, value: 2000 }, clientHeight: { configurable: true, value: 500 } })
    feed.scrollTop = 1300
    fireEvent.scroll(feed)
    await waitFor(() => expect(screen.getAllByRole('button', { name: /测试皮肤 \d+ 界面预览/ })).toHaveLength(CATALOG_BATCH_SIZE * 2))
    feed.scrollTop = 1500
    fireEvent.scroll(feed)
    await waitFor(() => expect(screen.getAllByRole('button', { name: /测试皮肤 \d+ 界面预览/ })).toHaveLength(skins.length))
  })

  it('keeps list and detail visible while refreshing after an operation', async () => {
    let catalogCalls = 0
    let stateCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) {
        catalogCalls += 1
        if (catalogCalls > 1) return await new Promise(() => undefined)
        return { ok: true, json: async () => ({ skins: [skin] }) }
      }
      if (url.endsWith('/state')) {
        stateCalls += 1
        if (stateCalls > 1) return await new Promise(() => undefined)
        return { ok: true, json: async () => ({ skins: [{ skinId: skin.id, installation: 'installed', activation: 'active', installedVersion: '1.0.0', updateAvailable: false }] }) }
      }
      if (url.endsWith('/deactivate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'deactivate-1' }) }
      if (url.endsWith('/operations/deactivate-1')) return { ok: true, json: async () => ({ id: 'deactivate-1', phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    }))

    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '停用' }))
    await waitFor(() => expect(catalogCalls).toBe(2))

    expect(screen.getByRole('heading', { name: '测试皮肤' })).toBeTruthy()
    expect(screen.queryByText('正在加载皮肤列表…')).toBeNull()
    expect(screen.queryByText('正在加载皮肤详情…')).toBeNull()
  })

  it('uses DSH action priority and icons for inactive and active skins', async () => {
    let active = false
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      return { ok: true, json: async () => ({ skins: [{ skinId: skin.id, installation: 'installed', activation: active ? 'active' : 'inactive', installedVersion: '1.0.0', updateAvailable: true }] }) }
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    const use = await screen.findByRole('button', { name: '使用' })
    const inactiveUpdate = screen.getByRole('button', { name: '更新' })
    expect(use.getAttribute('variant')).toBe('primary')
    expect(inactiveUpdate.getAttribute('variant')).toBe('outline')
    expect(use.querySelector('[aria-hidden="true"]')).toBeNull()
    expect(inactiveUpdate.querySelector('[aria-hidden="true"]')).toBeTruthy()
    active = true
    cleanup()
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    const stop = await screen.findByRole('button', { name: '停用' })
    const activeUpdate = screen.getByRole('button', { name: '更新' })
    const uninstall = screen.getByRole('button', { name: '卸载' })
    expect(stop.getAttribute('variant')).toBe('outline')
    expect(activeUpdate.getAttribute('variant')).toBe('primary')
    expect(uninstall.getAttribute('variant')).toBe('outline')
    expect(stop.querySelector('[aria-hidden="true"]')).toBeNull()
    expect(activeUpdate.querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(uninstall.querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(uninstall.textContent).toBe('')
  })

  it('shows a non-blocking first-use warning for other appearance plugins', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }] }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return await new Promise(() => undefined)
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    expect(await screen.findByText('首次启用提示：请先在设置 → 插件中停用其他皮肤、主题和外观插件，避免全局样式冲突。点击“使用”即表示已确认。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    expect(screen.queryByText(/首次启用提示/)).toBeNull()
    expect(screen.queryByRole('dialog', { name: '启用皮肤前请先关闭其他皮肤' })).toBeNull()
  })

  it('uses the DSH outline capsule for the mobile back action', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    const back = (await screen.findAllByRole('button', { name: '返回发现' }))
      .find((button) => button.className.includes('mobileBack'))!
    expect(back.getAttribute('variant')).toBe('outline')
    expect(back.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('replaces Use with a restart confirmation when activation needs restart', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { runningAgentCount: 0, skins: [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }] } })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    const restart = await screen.findByRole('button', { name: '重启以应用' })
    expect(screen.queryByRole('button', { name: '使用' })).toBeNull()
    fireEvent.click(restart)
    expect(screen.getByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeTruthy()
    expect(await screen.findByText('Agent 状态检查已通过。但重启仍会关闭所有会话连接；即使回复已经停止显示，也请确认重要内容已保存，且没有即将开始的新任务。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '确认无任务，立即重启' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '稍后' })).toBeTruthy()
  })

  it('disables restart when the Host reports a running Agent', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { runningAgentCount: 2, skins: [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }] } })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '重启以应用' }))
    expect(await screen.findByText('检测到 2 个 Agent 正在运行，现在不能重启。请等待任务完全结束后再试，否则可能中断任务并导致会话历史无法加载。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '有任务运行中' }).hasAttribute('disabled')).toBe(true)
  })

  it('allows an explicit one-time restart when the old Host cannot report Agent state', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }] } })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '重启以应用' }))
    const override = await screen.findByRole('button', { name: '我已确认无任务，仍然重启' })
    expect(override.hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('当前 Host 尚未加载安全检查。请确认没有 Agent 正在运行、重要内容已保存；你可以继续完成这一次升级重启。新版本加载后会自动检测 Agent 状态。')).toBeTruthy()
  })

  it('asks for restart immediately after Use when the client entry is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }] }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'activate-1' }) }
      if (url.endsWith('/operations/activate-1')) return { ok: true, json: async () => ({ id: 'activate-1', phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    const clientRuntime = { setActive: vi.fn(async () => false) }
    render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '使用' }))
    expect(await screen.findByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeTruthy()
    expect(clientRuntime.setActive).toHaveBeenCalledWith(skin.package, true)
  })

  it('filters the catalog from the native search input', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('button', { name: /测试皮肤 界面预览/ })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'missing' } })
    expect(screen.getByText('没有匹配的皮肤')).toBeTruthy()
  })

  it('keeps Stars and latest sorting on the discovery feed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('heading', { name: '发现更多' })
    fireEvent.click(screen.getByRole('button', { name: 'Stars' }))
    expect(screen.getByRole('button', { name: '最新' })).toBeTruthy()
  })

  it('shows Stars in list rows and marks the selected skin', async () => {
    const secondSkin = { ...skin, id: 'test.second', name: { zh: '第二皮肤', en: 'Second Skin' }, githubStars: 7 }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin, secondSkin] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)

    await openSkinCard()
    const first = screen.getByRole('button', { name: /测试皮肤 界面预览/ })
    const second = screen.getByRole('button', { name: /第二皮肤 界面预览/ })
    expect(first.getAttribute('aria-current')).toBe('true')
    expect(second.getAttribute('aria-current')).toBeNull()
    expect(first.textContent).toContain('42')
    expect(second.textContent).toContain('7')

    fireEvent.click(second)
    expect(first.getAttribute('aria-current')).toBeNull()
    expect(second.getAttribute('aria-current')).toBe('true')
  })

  it('shows an installing status on the matching list row immediately', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [] }) }
      if (init?.method === 'POST') return await new Promise(() => undefined)
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    const automatic = await screen.findByRole('button', { name: '安装并使用' })
    const installOnly = screen.getByRole('button', { name: '仅安装' })
    const otherMethods = screen.getByRole('button', { name: '其他安装方式' })
    expect(automatic.getAttribute('variant')).toBe('primary')
    expect(installOnly.getAttribute('variant')).toBe('outline')
    expect(otherMethods.getAttribute('variant')).toBe('outline')
    fireEvent.click(automatic)
    expect(await screen.findByRole('button', { name: /测试皮肤 界面预览.*安装中/ })).toBeTruthy()
  })

  it('activates a verified skin after installation completes', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [] }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'install-1' }) }
      if (url.endsWith('/operations/install-1')) return { ok: true, json: async () => ({ id: 'install-1', phase: 'done' }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return await new Promise(() => undefined)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '安装并使用' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toBe(true))
  })

  it('allows market installation while warning that compatibility is unverified', async () => {
    const unverified = { ...skin, review: { compatibility: 'unverified' as const, preview: 'repository-card' as const, installation: 'verified' as const }, compatibility: { dsh: 'unverified', platform: ['web'] } }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [unverified] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [] }) }
      if (init?.method === 'POST') return await new Promise(() => undefined)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    const otherMethods = await screen.findByRole('button', { name: '其他安装方式' })
    const automatic = screen.getByRole('button', { name: '安装并使用' })
    expect(automatic.getAttribute('variant')).toBe('primary')
    expect(otherMethods.getAttribute('variant')).toBe('outline')
    expect(screen.queryByRole('button', { name: '待验证，手动安装' })).toBeNull()
    fireEvent.click(automatic)
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(true))
    expect(screen.getByText('市场已具备自动安装所需信息，但维护者尚未声明 DSH 兼容范围。仍可安装；建议先确认当前 DSH Web 版本，并留意安装后的界面表现。')).toBeTruthy()
    expect(screen.getByText('该仓库暂无可识别的皮肤截图，市场使用本地占位卡，不会加载 GitHub 仓库图片。')).toBeTruthy()
    expect(screen.getAllByRole('img', { name: '测试皮肤 暂无界面截图' }).length).toBeGreaterThanOrEqual(2)
    expect(document.querySelector(`img[src="${unverified.screenshots[0]}"]`)).toBeNull()
  })

  it('shows prompt and command as two alternative copy capsules', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] } })))
    const writeText = vi.fn(async () => undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '其他安装方式' }))
    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    expect(dialog.textContent).toContain('任选一种，不用都执行。')
    expect([...dialog.querySelectorAll('code')].map(node => node.textContent)).toEqual([createSkinInstallPrompt(skin), createSkinInstallCommand(skin)])
    fireEvent.click(screen.getByRole('button', { name: '复制命令' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(createSkinInstallCommand(skin)))
  })

  it('replaces a failed verified screenshot instead of retaining stale image pixels', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    const preview = await screen.findByAltText('测试皮肤 大图预览')
    fireEvent.error(preview)

    expect(screen.getByRole('img', { name: '测试皮肤 暂无界面截图' })).toBeTruthy()
  })

  it('labels supplemental market captures and exposes the maintainer removal path', async () => {
    const supplemented = { ...skin, marketScreenshots: ['https://example.com/market-home.png'] }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [supplemented] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)

    await screen.findByRole('button', { name: /测试皮肤 界面预览/ })
    expect(screen.getByText('前 1 张截图由市场在隔离 DSH 中实机补录；仓库截图按原顺序排在后面。维护者可向目录仓库提交 PR 删除或替换补录图。')).toBeTruthy()
  })

  it('uses the upstream cover in list cards while opening market captures first in detail', async () => {
    const market = 'https://example.com/market-home.png'
    const upstreamCover = 'https://example.com/upstream-cover.png'
    const supplemented = {
      ...skin,
      listScreenshot: upstreamCover,
      marketScreenshots: [market],
      screenshots: [market, upstreamCover],
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [supplemented] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)

    await screen.findByRole('button', { name: /测试皮肤 界面预览/ })
    expect(document.querySelector(`img[src="${upstreamCover}"]`)).toBeTruthy()
    expect(screen.getByAltText('测试皮肤 大图预览').getAttribute('src')).toBe(market)
  })

  it('sends verified client-only skins to their manual installation guide', async () => {
    const manual = { ...skin, review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'manual-only' as const } }
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [manual] } : { skins: [] } }))
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByTitle('前往 GitHub 查看维护者提供的手动安装方式'))
    expect(open).toHaveBeenCalledWith(manual.repo, '_blank', 'noopener,noreferrer')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(false)
    expect(screen.getByText('该仓库距离市场的一键安装规范还差少量信息；可参考右侧仓库健康建议完善，当前请按维护者说明安装。')).toBeTruthy()
  })

  it('shows constructive repository health checks and suggestions', async () => {
    const healthSkin = { ...skin, health: {
      status: 'improvements' as const,
      checks: { readmeScreenshots: 'pass' as const, compatibility: 'improve' as const, installation: 'pass' as const },
      suggestions: ['建议声明支持的 DSH Web 版本范围。'],
    } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [healthSkin] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    expect(await screen.findByRole('heading', { name: '仓库健康' })).toBeTruthy()
    expect(screen.getByText('README 截图').nextSibling?.textContent).toBe('符合要求')
    expect(screen.getByText('兼容版本').nextSibling?.textContent).toBe('建议完善')
    expect(screen.getByText('建议声明支持的 DSH Web 版本范围。')).toBeTruthy()
  })

  it('generates and copies an agent PR prompt without submitting to GitHub', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] } })))

    render(<SkinMarketSection t={key => key} />)
    await waitFor(() => expect(screen.getByRole('button', { name: '提交皮肤' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '提交皮肤' }))

    const prompt = screen.getByRole('textbox', { name: 'Agent 投稿提示词' }) as HTMLTextAreaElement
    expect(screen.queryByRole('textbox', { name: '皮肤 GitHub 仓库' })).toBeNull()
    expect(prompt.value).toContain('否则先向我索要公开 GitHub 仓库地址')
    expect(prompt.value).toContain('目标目录仓库：https://github.com/kingOfSoySauce/dsh-skin-market')
    fireEvent.click(screen.getByRole('button', { name: '复制提示词' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(prompt.value))
    expect(screen.getByRole('button', { name: '已复制' })).toBeTruthy()
  })
})
