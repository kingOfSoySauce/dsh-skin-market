// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const icon = () => React.createElement('span', { 'aria-hidden': true })
  return {
    Button: ({ icon: leading, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => React.createElement('button', props, leading, children),
    Input: ({ icon: leading, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }) => React.createElement('label', null, leading, React.createElement('input', props)),
    Pill: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement('button', props, children),
    Modal: ({
      open,
      title,
      closeLabel = '关闭',
      onClose,
      description,
      footer,
      children,
    }: {
      open: boolean
      title: string
      closeLabel?: string
      onClose?: () => void
      description?: string
      footer?: React.ReactNode
      children?: React.ReactNode
    }) => open ? React.createElement(
      'div',
      { role: 'dialog', 'aria-label': title },
      React.createElement('h2', null, title),
      React.createElement('button', { type: 'button', 'aria-label': closeLabel, onClick: onClose }),
      description,
      children,
      footer,
    ) : null,
    IconChevronLeftOutline14: icon, IconChevronDownOutline14: icon, IconCopyOutline16: icon, IconDownloadOutline16: icon, IconLinkOutline16: icon, IconLoadingOutline16: icon,
    IconRefreshOutline16: icon, IconSearchOutline16: icon, IconTrashOutline16: icon,
  }
})

import { CATALOG_BATCH_SIZE, captureListScroll, compareInstalledSkinOrder, compareSkinOrder, restartReloadUrl, restoreListScroll, restoreMarketStyleOrder, SkinMarketSection } from '../../src/client/SkinMarketSection.tsx'
import { createClientSkinRuntime, missingPrimitives, switchClientSkin } from '../../src/client/index.ts'
import { createSkinInstallCommand, createSkinInstallPrompt } from '../../src/client/submission.ts'
import { setGeneratedMediaSources } from '../../src/media-preview.ts'
import type { CatalogSkin } from '../../src/client/types.ts'

const skin = {
  id: 'test.skin', name: { zh: '测试皮肤', en: 'Test Skin' }, author: 'author', description: 'description', repo: 'https://github.com/a/b', package: 'skin', rowId: 'skin',
  tags: ['dark'], modes: ['dark'], install: { target: 'https://github.com/a/b.git#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', version: '1.0.0', commit: 'a'.repeat(40) }, compatibility: { dsh: '0.1.0-rc.6', platform: ['web'] },
  screenshots: ['https://example.com/preview.png'], license: { code: 'MIT', commercialUse: true }, githubStars: 42, starsStale: false, starsUpdatedAt: '2026-08-16T00:00:00Z', recommendations: [], releaseUpdatedAt: '2026-08-16T00:00:00Z', metadataUpdatedAt: '2026-08-16T00:00:00Z', updatedAt: '2026-08-16T00:00:00Z',
} satisfies CatalogSkin
const dshRuntime = { version: '0.1.0-rc.6', capabilities: [], source: 'injected' as const }

afterEach(() => { cleanup(); setGeneratedMediaSources(undefined); window.localStorage.clear(); vi.unstubAllGlobals() })

async function openSkinCard(name: RegExp = /测试皮肤 界面预览/) {
  const card = await screen.findByRole('button', { name })
  fireEvent.click(card)
  return card
}

describe('client market', () => {
  it('asks before migrating the chosen skin and preserves the active-skin restart flow', async () => {
    let migrated = false
    const sourceMigration = { target: 'skin@1.0.0', currentSource: skin.install.target }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ hostKind: 'dsh', runningAgentCount: 0, runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'active', pinned: true, installedVersion: '1.0.0', updateAvailable: false, ...(!migrated && { sourceMigration }) }] }) }
      if (url.endsWith('/migrate') && init?.method === 'POST') {
        migrated = true
        return { ok: true, json: async () => ({ operationId: 'migrate-1' }) }
      }
      if (url.endsWith('/operations/migrate-1')) return { ok: true, json: async () => ({ id: 'migrate-1', kind: 'migrate', skinId: skin.id, phase: 'done' }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click((await screen.findAllByRole('button', { name: '换用 npm' }))[0]!)
    const firstDialog = screen.getByRole('dialog', { name: '换用 npm 安装源' })
    expect(firstDialog.textContent).toContain(sourceMigration.currentSource)
    expect(firstDialog.textContent).toContain(sourceMigration.target)
    expect(migrated).toBe(false)
    fireEvent.click(within(firstDialog).getByRole('button', { name: '取消' }))
    expect(migrated).toBe(false)

    fireEvent.click(screen.getAllByRole('button', { name: '换用 npm' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: '确认换用 npm' }))
    expect(await screen.findByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeTruthy()
    expect(screen.getAllByText('测试皮肤 已换用 npm，待重启生效').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '换用 npm' })).toBeNull()
    expect(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/migrate') && init?.method === 'POST')?.[1]?.body).toBe(JSON.stringify({ skinId: skin.id }))
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/update') && init?.method === 'POST')).toBe(false)
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/restart') && init?.method === 'POST')).toBe(false)
  })

  it.each(['missing', 'no-source', 'manual', 'desktop'])('hides source migration for %s skins', async mode => {
    const entry = mode === 'manual' ? { ...skin, review: { compatibility: 'verified', preview: 'verified', installation: 'manual-only' } } : skin
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [entry] } : {
      hostKind: mode === 'desktop' ? 'desktop' : 'dsh',
      skins: [{ skinId: skin.id, installation: mode === 'missing' ? 'missing' : 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false, ...(mode !== 'no-source' && { sourceMigration: { target: 'skin@1.0.0', currentSource: skin.install.target } }) }],
    } })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    expect(screen.queryByRole('button', { name: '换用 npm' })).toBeNull()
  })

  it('puts skins without a usable preview after previewed skins before comparing stars', () => {
    const noPreview = {
      ...skin,
      id: 'test.no-preview',
      githubStars: 999,
      review: { compatibility: 'verified' as const, preview: 'repository-card' as const, installation: 'verified' as const },
    }
    const supplemented = {
      ...skin,
      id: 'test.supplemented',
      githubStars: 1,
      review: { compatibility: 'verified' as const, preview: 'repository-card' as const, installation: 'verified' as const },
      marketScreenshots: ['https://example.com/market-preview.png'],
    }

    expect([noPreview, supplemented].sort((a, b) => compareSkinOrder(a, b, 'stars')).map(item => item.id)).toEqual([
      supplemented.id,
      noPreview.id,
    ])
  })

  it('orders installed skins by current use, pinned state, then latest operation', () => {
    const current = { ...skin, id: 'current', name: { zh: '当前', en: 'Current' } }
    const pinned = { ...skin, id: 'pinned', name: { zh: '常驻', en: 'Pinned' } }
    const recent = { ...skin, id: 'recent', name: { zh: '最近', en: 'Recent' } }
    const older = { ...skin, id: 'older', name: { zh: '较早', en: 'Older' } }
    const states = [
      { skinId: current.id, installation: 'installed' as const, activation: 'active' as const, primary: true, pinned: false, installedVersion: '1', updateAvailable: false, lastOperatedAt: '2026-08-01T00:00:00Z' },
      { skinId: pinned.id, installation: 'installed' as const, activation: 'active' as const, primary: false, pinned: true, installedVersion: '1', updateAvailable: false, lastOperatedAt: '2026-08-04T00:00:00Z' },
      { skinId: recent.id, installation: 'installed' as const, activation: 'inactive' as const, primary: false, pinned: false, installedVersion: '1', updateAvailable: false, lastOperatedAt: '2026-08-03T00:00:00Z' },
      { skinId: older.id, installation: 'installed' as const, activation: 'inactive' as const, primary: false, pinned: false, installedVersion: '1', updateAvailable: false, lastOperatedAt: '2026-08-02T00:00:00Z' },
    ]
    expect([older, recent, pinned, current].sort((a, b) => compareInstalledSkinOrder(a, b, states)).map(item => item.id)).toEqual(['current', 'pinned', 'recent', 'older'])
  })

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

    fireEvent.click(screen.getByRole('button', { name: '提交皮肤' }))
    expect(screen.getByRole('dialog', { name: '提交你的皮肤' })).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /第二皮肤 界面预览/ }))
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
    let restartRequired = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runningAgentCount: 0, marketUpdateRestartRequired: restartRequired }) }
      if (url.endsWith('/market-update') && init?.method === 'POST') {
        restartRequired = true
        return { ok: true, json: async () => ({ currentVersion: '0.1.16', latestVersion: '0.1.16', updateAvailable: false }) }
      }
      if (url.endsWith('/market-update') && restartRequired) return { ok: true, json: async () => ({ currentVersion: '0.1.16', latestVersion: '0.1.16', updateAvailable: false }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.15', latestVersion: '0.1.16', updateAvailable: true }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<SkinMarketSection t={key => key} />)

    const update = await screen.findByRole('button', { name: '更新皮肤市场到 0.1.16' })
    expect(update.textContent).toBe('更新')
    fireEvent.click(update)

    expect(await screen.findByRole('dialog', { name: '需要重启 DSH 应用皮肤市场更新' })).toBeTruthy()
    expect(screen.getByText(/皮肤市场新版本 0.1.16 将在重启后生效/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '稍后' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '稍后' }))
    expect(screen.getAllByText('皮肤市场已更新，待重启生效').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '重启' }))
    expect(screen.getByRole('dialog', { name: '需要重启 DSH 应用皮肤市场更新' })).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: '关闭提示' })[0])
    expect(screen.queryByText('皮肤市场已更新，待重启生效')).toBeNull()
    await waitFor(() => expect(screen.queryByRole('button', { name: '更新皮肤市场到 0.1.16' })).toBeNull())

    // A self-update can remount the browser client before the user confirms
    // the restart. The Host-side pending flag must restore the prompt.
    view.unmount()
    render(<SkinMarketSection t={key => key} />)
    expect(await screen.findByRole('dialog', { name: '需要重启 DSH 应用皮肤市场更新' })).toBeTruthy()
  })

  it('uses the shared operation banner in the home header while the market updates', async () => {
    let operationRequests = 0
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runningAgentCount: 0, marketUpdateOperation: null }) }
      if (url.endsWith('/market-update') && init?.method === 'POST') return { ok: true, status: 202, json: async () => ({ operationId: 'market-update-1' }) }
      if (url.endsWith('/market-update/operations/market-update-1')) {
        operationRequests += 1
        return { ok: true, json: async () => ({ id: 'market-update-1', phase: 'downloading', cancelable: true, startedAt: new Date().toISOString(), message: '正在下载皮肤市场更新包' }) }
      }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.15', latestVersion: '0.1.16', updateAvailable: true, operation: null }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByRole('button', { name: '更新皮肤市场到 0.1.16' }))
    expect((await screen.findAllByText('正在下载皮肤市场')).length).toBe(1)
    expect(document.querySelector('[class*="homeHeader"] [role="status"] strong')?.textContent).toBe('正在下载皮肤市场')
    expect(document.querySelector('[class*="homeHeader"] [role="status"]')?.textContent).not.toContain('正在下载皮肤市场更新包')
    expect(operationRequests).toBeGreaterThan(0)
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

  it('disables non-preserved client skins before enabling the selected one', async () => {
    const calls: string[] = []
    const runtime = { setActive: vi.fn(async (name: string, active: boolean) => { calls.push(`${name}:${active}`); return true }) }

    await expect(switchClientSkin(runtime, ['old-skin', 'pinned-skin', 'new-skin'], 'new-skin', ['pinned-skin'])).resolves.toBe(true)
    expect(calls).toEqual(['old-skin:false', 'new-skin:true'])
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
    expect(activeCard.closest('article')?.textContent).toContain('使用中')
    expect(activeCard.closest('article')?.textContent).not.toContain('可更新')
    expect(screen.queryByText('正在加载皮肤…')).toBeNull()
  })

  it('opens details in a labelled modal surface with an explicit close action', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)

    await openSkinCard()
    expect(screen.getByRole('dialog', { name: '皮肤详情' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '皮肤详情' })).toBeTruthy()
    const close = screen.getByRole('button', { name: '关闭' })
    expect(close.textContent).toBe('')
    fireEvent.click(close)
    expect(screen.queryByRole('dialog', { name: '皮肤详情' })).toBeNull()
  })

  it('does not mutate the host settings navigation DOM', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] } })))
    render(
      <div role="dialog" aria-label="设置" data-test-settings-dialog>
        <nav>
          <button type="button" aria-current="true"><svg aria-hidden="true" /></button>
        </nav>
        <SkinMarketSection t={key => key} />
      </div>,
    )

    await screen.findByRole('button', { name: /测试皮肤 界面预览/ })

    const navButton = document.querySelector('[data-test-settings-dialog] nav button')
    expect(navButton?.querySelector('span')).toBeNull()
    expect(navButton?.querySelector('[data-dsh-skin-market-default-icon="hidden"]')).toBeNull()
  })

  it('uses the same installed ordering on home and in the sidebar', async () => {
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
      activation: index === 5 || index === 4 ? 'active' : 'inactive',
      primary: index === 5,
      pinned: index === 4,
      installedVersion: '1.0.0',
      updateAvailable: false,
      installedAt: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
      lastOperatedAt: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    }))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: installedSkins } : { skins: runtime },
    })))
    render(<SkinMarketSection t={key => key} />)

    await waitFor(() => {
      const installedSection = screen.getByRole('heading', { name: '已安装' }).closest('section')!
      const cards = [...installedSection.querySelectorAll<HTMLButtonElement>('button[aria-label$="已安装卡片"]')]
      expect(cards.map(card => card.getAttribute('aria-label'))).toEqual([
        '已装皮肤 5 已安装卡片',
        '已装皮肤 4 已安装卡片',
        '已装皮肤 3 已安装卡片',
        '已装皮肤 2 已安装卡片',
      ])
    })

    fireEvent.click(screen.getByRole('button', { name: '查看全部已安装' }))
    expect(await screen.findByRole('button', { name: '已安装', pressed: true })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '已装皮肤 5' })).toBeTruthy()
    const sidebarCards = screen.getByRole('complementary', { name: 'catalog' }).querySelectorAll<HTMLButtonElement>('button[data-skin-id]')
    expect([...sidebarCards].map(card => card.dataset.skinId)).toEqual(installedSkins.map(item => item.id).reverse())
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(screen.getByRole('button', { name: 'Stars' })).toBeTruthy()
  })

  it('shows installed skeletons while runtime state loads and hides the section when empty', async () => {
    let resolveState!: (value: { skins: never[] }) => void
    const state = new Promise<{ skins: never[] }>(resolve => { resolveState = resolve })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [skin] } : state,
    })))

    render(<SkinMarketSection t={key => key} />)

    expect(await screen.findByRole('status', { name: '正在加载已安装皮肤' })).toBeTruthy()
    resolveState({ skins: [] })
    await waitFor(() => expect(screen.queryByRole('heading', { name: '已安装' })).toBeNull())
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

  it('installs and activates from the discovery card action', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'card-install' }) }
      if (url.endsWith('/operations/card-install')) return { ok: true, json: async () => ({ id: 'card-install', kind: 'install', skinId: skin.id, phase: 'done' }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return await new Promise(() => undefined)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)

    const install = await screen.findByRole('button', { name: '安装并使用' })
    expect(install.getAttribute('variant')).toBe('outline')
    expect(screen.queryByText('可安装')).toBeNull()
    fireEvent.click(install)

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/install') && init?.method === 'POST')).toBe(true))
    await waitFor(() => expect(screen.getByRole('group', { name: '测试皮肤 操作' }).textContent).toContain('使用中'))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toBe(true))
  })

  it('warns about a known incompatible DSH version after Use, not on the detail page', async () => {
    const incompatible = { ...skin, id: 'test.incompatible', name: { zh: '不兼容皮肤', en: 'Incompatible Skin' }, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [incompatible] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: { version: '0.1.1-rc.1', capabilities: ['slot:keyed:settings.plugin.item'], source: 'injected' } }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'op-incompatible' }) }
      if (url.endsWith('/operations/op-incompatible')) return { ok: true, json: async () => ({ id: 'op-incompatible', kind: 'install', skinId: incompatible.id, phase: 'done' }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'op-activate' }) }
      if (url.endsWith('/operations/op-activate')) return { ok: true, json: async () => ({ id: 'op-activate', kind: 'activate', skinId: incompatible.id, phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)

    await openSkinCard(/不兼容皮肤 界面预览/)
    expect(screen.getByRole('button', { name: '安装并使用' })).toBeTruthy()
    expect(screen.queryByText(/仍可安装|仍可继续使用/)).toBeNull()
    expect(screen.queryByRole('dialog', { name: '兼容性提示' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '安装并使用' }))
    const dialog = await screen.findByRole('dialog', { name: '兼容性提示' })
    expect(dialog.textContent).toMatch(/不在皮肤声明的兼容范围/)
    expect(dialog.textContent).toMatch(/仍可继续使用/)
    expect(within(dialog).getByRole('link', { name: '页面异常时重置皮肤' }).getAttribute('href')).toContain('#页面异常时重置皮肤')
    expect(screen.queryByRole('button', { name: '确认无任务，立即重启' })).toBeNull()
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(true))
  })

  it('still installs when runtime version is unknown', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [] }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'op-unknown' }) }
      if (url.endsWith('/operations/op-unknown')) return { ok: true, json: async () => ({ id: 'op-unknown', kind: 'install', skinId: skin.id, phase: 'done' }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'op-activate' }) }
      if (url.endsWith('/operations/op-activate')) return { ok: true, json: async () => ({ id: 'op-activate', kind: 'activate', skinId: skin.id, phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    expect(screen.queryByRole('dialog', { name: '兼容性提示' })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: '安装并使用' }))
    const dialog = await screen.findByRole('dialog', { name: '兼容性提示' })
    expect(dialog.textContent).toMatch(/无法读取当前 DSH 版本/)
    expect(dialog.textContent).toMatch(/仍可继续使用/)
    expect(screen.queryByRole('button', { name: '确认无任务，立即重启' })).toBeNull()
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(true))
    expect(screen.queryByRole('dialog', { name: '已拦截安装' })).toBeNull()
  })

  it('opens a prompt-only install dialog for manual cards', async () => {
    const manual = { ...skin, review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'manual-only' as const } }
    const writeText = vi.fn(async () => undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [manual] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByRole('button', { name: '需手动安装' }))
    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    expect(dialog.textContent).toContain('按仓库说明完成安装')
    expect(dialog.textContent).not.toContain('该皮肤需要 Agent 协助安装')
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
    await openSkinCard()
    const use = screen.getByRole('button', { name: '使用' })
    const pin = screen.getByRole('button', { name: '常驻使用' })
    expect(use.getAttribute('variant')).toBe('primary')
    expect(pin.getAttribute('variant')).toBe('outline')
    expect(use.compareDocumentPosition(pin) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

  it('explains the conflict risk before pinning an active skin', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
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
    })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    const pin = await screen.findByRole('button', { name: '常驻使用' })
    expect(pin.getAttribute('title')).toContain('宠物、音效')
    fireEvent.click(pin)
    const dialog = screen.getByRole('dialog', { name: '常驻使用此皮肤' })
    expect(dialog.textContent).toContain('冲突风险由用户自行承担')
    const help = within(dialog).getByRole('link', { name: '页面异常时重置皮肤' })
    expect(help.getAttribute('href')).toBe('https://github.com/kingOfSoySauce/dsh-skin-market#页面异常时重置皮肤')
    expect(screen.getByRole('button', { name: '确认常驻' })).toBeTruthy()
  })

  it('shows an active cancel action for a pinned skin', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
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
    })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    const stop = await screen.findByRole('button', { name: '停用' })
    const unpin = screen.getByRole('button', { name: '取消常驻' })
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
    vi.stubGlobal('fetch', vi.fn(async () => await new Promise(() => undefined)))

    render(<SkinMarketSection t={key => key} catalogCache={catalogCache} />)

    expect(await screen.findByRole('button', { name: /测试皮肤 界面预览/ })).toBeTruthy()
    await openSkinCard()
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
    const feed = document.querySelector<HTMLElement>('[class*="homeContent"]')
    if (feed === null) throw new Error('home content scroll area not found')
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

  it('asks for restart after updating the active skin', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.26', latestVersion: '0.1.26', updateAvailable: false }) }
      if (url.endsWith('/update') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'update-1' }) }
      if (url.endsWith('/operations/update-1')) return { ok: true, json: async () => ({ id: 'update-1', phase: 'done' }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ runningAgentCount: 0, skins: [{ skinId: skin.id, installation: 'installed', activation: 'active', installedVersion: '1.0.0', updateAvailable: true }], runtime: dshRuntime }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '更新' }))

    expect(await screen.findByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeTruthy()
    expect(await screen.findByText('Agent 状态检查已通过。但重启仍会关闭所有会话连接；即使回复已经停止显示，也请确认重要内容已保存，且没有即将开始的新任务。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '稍后' }))
    expect(screen.getAllByText('测试皮肤 已更新，待重启生效').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '重启' }))
    expect(screen.getByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/update') && init?.method === 'POST')).toBe(true)
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
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }], runtime: dshRuntime }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'activate-1' }) }
      if (url.endsWith('/operations/activate-1')) return { ok: true, json: async () => ({ id: 'activate-1', phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    const clientRuntime = { setActive: vi.fn(async () => false) }
    render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '使用' }))
    const dialog = await screen.findByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })
    expect(dialog.textContent).not.toMatch(/仍可继续使用/)
    expect(clientRuntime.setActive).toHaveBeenCalledWith(skin.package, true)
  })

  it('puts the compatibility warning into the restart panel after Use', async () => {
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [incompatible] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ runningAgentCount: 0, skins: [{ skinId: incompatible.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }], runtime: { version: '0.1.1-rc.1', capabilities: ['slot:keyed:settings.plugin.item'], source: 'injected' } }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'activate-1' }) }
      if (url.endsWith('/operations/activate-1')) return { ok: true, json: async () => ({ id: 'activate-1', phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    const clientRuntime = { setActive: vi.fn(async () => false) }
    render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)
    await openSkinCard()

    expect(screen.queryByText(/仍可继续使用/)).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: '使用' }))
    const dialog = await screen.findByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })
    expect(dialog.textContent).toMatch(/不在皮肤声明的兼容范围/)
    expect(dialog.textContent).toMatch(/仍可继续使用/)
    expect(dialog.textContent).toMatch(/Agent 状态检查已通过/)
    expect(within(dialog).getByRole('link', { name: '页面异常时重置皮肤' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '确认无任务，立即重启' })).toBeTruthy()
  })

  it('filters the catalog from the native search input', async () => {
    const descriptionMatch = { ...skin, id: 'description.match', name: { zh: '描述皮肤', en: 'Description Skin' }, description: '终末地风格的深色主题' }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin, descriptionMatch] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('button', { name: /测试皮肤 界面预览/ })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '终末地' } })
    expect(screen.getByRole('button', { name: /描述皮肤 界面预览/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /测试皮肤 界面预览/ })).toBeNull()
  })

  it('keeps Stars and latest sorting on the discovery feed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('heading', { name: '发现更多' })
    expect(screen.getByRole('button', { name: 'Stars' })).toBeTruthy()
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
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime }) }
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

  it('names the skin and elapsed stage in the operation banner, then shows failures promptly', async () => {
    let operationRequests = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], operation: null, runtime: dshRuntime }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'install-progress' }) }
      if (url.endsWith('/operations/install-progress')) {
        operationRequests += 1
        return { ok: true, json: async () => operationRequests === 1
          ? { id: 'install-progress', kind: 'install', skinId: skin.id, phase: 'downloading', startedAt: new Date().toISOString() }
          : { id: 'install-progress', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: 'GitHub 插件下载超时' } }
      }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '仅安装' }))

    expect((await screen.findByRole('status')).textContent).toContain('正在下载“测试皮肤”')
    expect(screen.getByRole('status').textContent).toContain('已用时')
    await waitFor(() => expect(screen.getAllByRole('status').some(item => item.textContent?.includes('GitHub 插件下载超时'))).toBe(true), { timeout: 2_000 })
    expect(screen.queryByRole('alert')).toBeNull()
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(screen.getAllByRole('status').some(item => item.textContent?.includes('GitHub 插件下载超时'))).toBe(true))
  })

  it('shows the command and pnpm stage, expires stale speed on its tick, and lets a running install copy diagnostics', async () => {
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const clipboard = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } })
    const operation = {
      id: 'install-live-log', kind: 'install', skinId: skin.id, phase: 'downloading', startedAt: new Date(now - 60_000).toISOString(),
      step: '下载 npm 皮肤包', stepStartedAt: new Date(now - 1000).toISOString(), attempt: 2, pnpmStage: 'downloading',
      lastOutputAt: new Date(now).toISOString(), downloadedBytes: 2048, totalBytes: 4096, bytesPerSecond: 1024,
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], operation, runtime: dshRuntime }) }
      if (url.endsWith('/logs?operationId=install-live-log')) return { ok: true, text: async () => '# dsh-skin-market diagnostic log\nredacted' }
      throw new Error(`Unexpected request: ${url}`)
    }))
    try {
      render(<SkinMarketSection t={key => key} />)
      await waitFor(() => expect(screen.getByRole('status').textContent).toContain('下载 npm 皮肤包'))
      const banner = screen.getByRole('status')
      expect(banner.textContent).toContain('下载 npm 皮肤包')
      expect(banner.textContent).toContain('第 2 次尝试')
      expect(banner.textContent).toContain('下载依赖')
      expect(banner.textContent).toContain('2.0 KB / 4.0 KB')
      expect(banner.textContent).toContain('1.0 KB/s')

      clock.mockReturnValue(now + 5000)
      await waitFor(() => expect(banner.textContent).not.toContain('KB/s'), { timeout: 2000 })
      expect(banner.textContent).not.toContain('未有输出')
      clock.mockReturnValue(now + 30_000)
      await waitFor(() => expect(banner.textContent).toContain('30 秒未有输出'), { timeout: 2000 })
      fireEvent.click(within(banner).getByRole('button', { name: '复制日志' }))
      await waitFor(() => expect(clipboard).toHaveBeenCalledWith(expect.stringContaining('diagnostic log')))
      expect(banner.textContent).not.toContain('redacted')
    } finally { clock.mockRestore() }
  })

  it('uses the current command start for silence detection when the operation has already been running', async () => {
    const now = Date.now()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime, operation: {
        id: 'new-step', kind: 'install', skinId: skin.id, phase: 'installing', startedAt: new Date(now - 300_000).toISOString(),
        step: '写入插件', stepStartedAt: new Date(now).toISOString(), attempt: 1, pnpmStage: 'linking', lastOutputAt: new Date(now - 60_000).toISOString(),
      } }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('写入插件'))
    const banner = screen.getByRole('status')
    expect(banner.textContent).toContain('写入插件')
    expect(banner.textContent).toContain('链接依赖')
    expect(banner.textContent).not.toContain('未有输出')
  })

  it('keeps a long failure on one line and copies the operation diagnostic log', async () => {
    let operationRequests = 0
    const longMessage = '依赖 @deepseek-ai/dsh-compact 无法从 npm registry 找到；这是一个很长的 pnpm 诊断信息，需要在横幅中单行省略而不能挤开右侧操作按钮。'
    const clipboard = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } })
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], operation: null, runtime: dshRuntime }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'install-copy' }) }
      if (url.endsWith('/logs?operationId=install-copy')) return { ok: true, text: async () => '# dsh-skin-market diagnostic log\nredacted' }
      if (url.endsWith('/operations/install-copy')) {
        operationRequests += 1
        return { ok: true, json: async () => operationRequests === 1
          ? { id: 'install-copy', kind: 'install', skinId: skin.id, phase: 'downloading', startedAt: new Date().toISOString() }
          : { id: 'install-copy', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: longMessage } }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '仅安装' }))

    const banner = await screen.findByRole('status')
    await waitFor(() => expect(banner.textContent).toContain('@deepseek-ai/dsh-compact'))
    const message = within(banner).getByTitle(longMessage)
    expect(message.textContent).toContain('dsh-compact')
    const copyButton = within(banner).getByRole('button', { name: '复制日志' })
    expect(copyButton).toBeTruthy()
    fireEvent.click(copyButton)
    await waitFor(() => expect(clipboard).toHaveBeenCalledWith(expect.stringContaining('diagnostic log')))
    expect(within(banner).getByRole('button', { name: '日志已复制' })).toBeTruthy()
  })

  it('offers a retry action for a classified install failure', async () => {
    let operationRequests = 0
    let retryRequests = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'install-retry-source' }) }
      if (url.endsWith('/operations/install-retry-source/retry') && init?.method === 'POST') {
        retryRequests += 1
        expect(JSON.parse(String(init.body))).toEqual({ action: 'retry' })
        return { ok: true, json: async () => ({ operationId: 'install-retry-target' }) }
      }
      if (url.endsWith('/operations/install-retry-source')) {
        operationRequests += 1
        return { ok: true, json: async () => operationRequests === 1
          ? { id: 'install-retry-source', kind: 'install', skinId: skin.id, phase: 'downloading', startedAt: new Date().toISOString() }
          : { id: 'install-retry-source', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: '插件下载遇到临时网络错误', failure: { kind: 'network', message: '插件下载遇到临时网络错误', action: 'retry' } } }
      }
      if (url.endsWith('/operations/install-retry-target')) return { ok: true, json: async () => ({ id: 'install-retry-target', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: '仍然失败', failure: { kind: 'network', message: '仍然失败', action: 'retry' } }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '仅安装' }))
    expect((await screen.findAllByRole('button', { name: '重试' })).length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: '重试' })[0]!)

    await waitFor(() => expect(retryRequests).toBe(1))
  })

  it('puts build approval in a confirmation modal instead of the failure banner', async () => {
    let operationRequests = 0
    let retryRequests = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], operation: null, runtime: dshRuntime }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'install-build-approval' }) }
      if (url.endsWith('/operations/install-build-approval/retry') && init?.method === 'POST') {
        retryRequests += 1
        expect(JSON.parse(String(init.body))).toEqual({ action: 'approve-build' })
        return { ok: true, json: async () => ({ operationId: 'install-build-approval-retry' }) }
      }
      if (url.endsWith('/operations/install-build-approval')) {
        operationRequests += 1
        return { ok: true, json: async () => operationRequests === 1
          ? { id: 'install-build-approval', kind: 'install', skinId: skin.id, phase: 'downloading', startedAt: new Date().toISOString() }
          : { id: 'install-build-approval', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: '依赖 node-pty 等 2 个依赖包含被 pnpm 阻止的构建脚本；请批准后重试', failure: { kind: 'build-approval', message: '依赖 node-pty 等 2 个依赖包含被 pnpm 阻止的构建脚本；请批准后重试', packageName: 'node-pty', action: 'approve-build' } } }
      }
      if (url.endsWith('/operations/install-build-approval-retry')) return { ok: true, json: async () => ({ id: 'install-build-approval-retry', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: '仍然失败', failure: { kind: 'build-approval', message: '仍然失败', packageName: 'node-pty', action: 'approve-build' } }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '仅安装' }))

    const dialog = await screen.findByRole('dialog', { name: '需要批准构建脚本' })
    expect(within(dialog).getByText('涉及依赖：')).toBeTruthy()
    expect(within(dialog).getByText('node-pty')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '批准构建并重试' })).toBeNull()
    expect(screen.getByRole('button', { name: '批准并重试' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '稍后' }))
    expect(screen.queryByRole('dialog', { name: '需要批准构建脚本' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '查看批准说明' }))
    expect(await screen.findByRole('dialog', { name: '需要批准构建脚本' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '批准并重试' }))
    await waitFor(() => expect(retryRequests).toBe(1))
  })

  it('keeps the install-and-use intent after approving a build retry', async () => {
    let sourceRequests = 0
    let retryRequests = 0
    let activateRequests = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], operation: null, runtime: dshRuntime }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'install-intent-source' }) }
      if (url.endsWith('/activate') && init?.method === 'POST') {
        activateRequests += 1
        return { ok: true, json: async () => ({ operationId: 'activate-after-approval' }) }
      }
      if (url.endsWith('/operations/install-intent-source/retry') && init?.method === 'POST') {
        retryRequests += 1
        return { ok: true, json: async () => ({ operationId: 'install-intent-retry' }) }
      }
      if (url.endsWith('/operations/install-intent-source')) {
        sourceRequests += 1
        return { ok: true, json: async () => sourceRequests === 1
          ? { id: 'install-intent-source', kind: 'install', skinId: skin.id, phase: 'downloading', startedAt: new Date().toISOString() }
          : { id: 'install-intent-source', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: '需要批准', failure: { kind: 'build-approval', message: '需要批准', packageName: 'node-pty', action: 'approve-build' } } }
      }
      if (url.endsWith('/operations/install-intent-retry')) return { ok: true, json: async () => ({ id: 'install-intent-retry', kind: 'install', skinId: skin.id, phase: 'done' }) }
      if (url.endsWith('/operations/activate-after-approval')) return { ok: true, json: async () => ({ id: 'activate-after-approval', kind: 'activate', skinId: skin.id, phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '安装并使用' }))
    fireEvent.click(await screen.findByRole('button', { name: '批准并重试' }))

    await waitFor(() => expect(retryRequests).toBe(1))
    await waitFor(() => expect(activateRequests).toBe(1))
  })

  it('shows available byte progress in one banner and cancels the download', async () => {
    let cancelled = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], operation: null, runtime: dshRuntime }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'install-cancel' }) }
      if (url.endsWith('/operations/install-cancel/cancel') && init?.method === 'POST') {
        cancelled = true
        return { ok: true, json: async () => ({ id: 'install-cancel', phase: 'cancelling' }) }
      }
      if (url.endsWith('/operations/install-cancel')) return { ok: true, json: async () => cancelled
        ? { id: 'install-cancel', kind: 'install', skinId: skin.id, phase: 'cancelled', startedAt: new Date().toISOString() }
        : { id: 'install-cancel', kind: 'install', skinId: skin.id, phase: 'downloading', startedAt: new Date().toISOString(), cancelable: true, downloadedBytes: 1024 ** 2, totalBytes: 2 * 1024 ** 2, bytesPerSecond: 512 * 1024 } }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '仅安装' }))

    const banner = await screen.findByRole('status')
    expect(banner.textContent).toContain('1.0 MB / 2.0 MB')
    expect(banner.textContent).toContain('512.0 KB/s')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(cancelled).toBe(true))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull(), { timeout: 2_000 })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('activates a verified skin after installation completes', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime }) }
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

  it('warns that compatibility is unverified but still installs', async () => {
    const unverified = { ...skin, review: { compatibility: 'unverified' as const, preview: 'repository-card' as const, installation: 'verified' as const }, compatibility: { dsh: 'unverified', platform: ['web'] } }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [unverified] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'op-unverified' }) }
      if (url.endsWith('/operations/op-unverified')) return { ok: true, json: async () => ({ id: 'op-unverified', kind: 'install', skinId: unverified.id, phase: 'done' }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'op-activate' }) }
      if (url.endsWith('/operations/op-activate')) return { ok: true, json: async () => ({ id: 'op-activate', kind: 'activate', skinId: unverified.id, phase: 'done' }) }
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
    expect(screen.queryByText(/维护者尚未声明 DSH 兼容范围，仍可一键安装/)).toBeNull()
    expect(screen.queryByRole('dialog', { name: '兼容性提示' })).toBeNull()
    fireEvent.click(automatic)
    const dialog = await screen.findByRole('dialog', { name: '兼容性提示' })
    expect(dialog.textContent).toMatch(/皮肤未声明 DSH 兼容范围/)
    expect(dialog.textContent).toMatch(/仍可继续使用/)
    expect(within(dialog).getByRole('link', { name: '页面异常时重置皮肤' }).getAttribute('href')).toContain('#页面异常时重置皮肤')
    expect(screen.queryByRole('button', { name: '确认无任务，立即重启' })).toBeNull()
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(true))
    expect(screen.queryByRole('dialog', { name: '已拦截安装' })).toBeNull()
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

  it('labels market-only captures when the repository has no usable screenshot', async () => {
    const supplemented = {
      ...skin,
      screenshots: [],
      review: { compatibility: 'verified' as const, preview: 'repository-card' as const, installation: 'verified' as const },
      marketScreenshots: ['https://example.com/market-home.png'],
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [supplemented] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)

    await openSkinCard()
    expect(screen.getByText('当前展示的是市场在隔离 DSH 中实机补录的截图；仓库尚无可识别的界面截图。')).toBeTruthy()
  })

  it('uses the upstream screenshot when it is usable, without rendering market captures', async () => {
    const market = 'https://example.com/market-home.png'
    const upstreamCover = 'https://example.com/upstream-cover.png'
    const supplemented = {
      ...skin,
      listScreenshot: upstreamCover,
      marketScreenshots: [market],
      screenshots: [upstreamCover],
      review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'verified' as const },
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [supplemented] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)

    await openSkinCard()
    expect(document.querySelector(`img[src="${upstreamCover}"]`)).toBeTruthy()
    expect(screen.getByAltText('测试皮肤 大图预览').getAttribute('src')).toBe(upstreamCover)
    expect(screen.queryByText('当前展示的是市场在隔离 DSH 中实机补录的截图；仓库尚无可识别的界面截图。')).toBeNull()
  })

  it('uses catalog WebP media by default and keeps the original-image fallback available', async () => {
    const preview = 'https://cdn.example.com/preview.webp'
    const full = 'https://cdn.example.com/full.webp'
    const layered = {
      ...skin,
      media: { list: { preview, full }, screenshots: [{ preview, full }] },
    }
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [layered] } : { skins: [] } }))
    vi.stubGlobal('fetch', fetchMock)

    window.history.replaceState({}, '', '/')
    render(<SkinMarketSection t={key => key} />)
    const cardPreview = await screen.findByRole('img', { name: '测试皮肤 界面预览' })
    await waitFor(() => expect(cardPreview.getAttribute('src')).toBe(preview))
    fireEvent.click(await screen.findByRole('button', { name: /测试皮肤 界面预览/ }))
    const fullImage = await waitFor(() => document.querySelector(`img[src="${full}"]`))
    expect(fullImage).toBeTruthy()
    expect(fullImage?.parentElement?.querySelector(`img[src="${preview}"]`)).toBeNull()

    cleanup()
    window.history.replaceState({}, '', '/?dsh-media=0')
    render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('button', { name: /测试皮肤 界面预览/ })
    expect(document.querySelector(`img[src="${preview}"]`)).toBeNull()
    window.history.replaceState({}, '', '/')
  })

  it('uses the original card screenshot immediately when its source is absent from the manifest', async () => {
    const source = 'https://example.com/aurora-missing.png'
    const layered = {
      ...skin,
      screenshots: [source],
      media: { list: { preview: 'https://cdn.example.com/aurora.webp', full: 'https://cdn.example.com/aurora-full.webp' }, screenshots: [{ preview: 'https://cdn.example.com/aurora.webp', full: 'https://cdn.example.com/aurora-full.webp' }] },
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [layered] }) }
      if (url.endsWith('/manifest.json')) return { ok: true, json: async () => ({}) }
      return { ok: true, json: async () => ({ skins: [], installedClientPlugins: [], runningAgentCount: 0 }) }
    }))
    render(<SkinMarketSection t={key => key} />)

    const image = await screen.findByRole('img', { name: '测试皮肤 界面预览' })
    await waitFor(() => expect(image.getAttribute('src')).toBe(source))
  })

  it('moves a failed card to the next catalog screenshot after WebP and original fallback fail', async () => {
    const first = 'https://example.com/aurora-first.png'
    const second = 'https://example.com/aurora-second.png'
    const firstPreview = 'https://cdn.example.com/aurora-first.webp'
    const secondPreview = 'https://cdn.example.com/aurora-second.webp'
    const layered = {
      ...skin,
      screenshots: [first, second],
      media: {
        list: { preview: firstPreview, full: 'https://cdn.example.com/aurora-first-full.webp' },
        screenshots: [
          { preview: firstPreview, full: 'https://cdn.example.com/aurora-first-full.webp' },
          { preview: secondPreview, full: 'https://cdn.example.com/aurora-second-full.webp' },
        ],
      },
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [layered] }) }
      if (url.endsWith('/manifest.json')) return { ok: true, json: async () => ({ [first]: 'first', [second]: 'second' }) }
      return { ok: true, json: async () => ({ skins: [], installedClientPlugins: [], runningAgentCount: 0 }) }
    }))
    render(<SkinMarketSection t={key => key} />)

    const image = await screen.findByRole('img', { name: '测试皮肤 界面预览' })
    await waitFor(() => expect(image.getAttribute('src')).toBe(firstPreview))
    fireEvent.error(image)
    expect(image.getAttribute('src')).toBe(first)
    fireEvent.error(image)
    expect(image.getAttribute('src')).toBe(secondPreview)
  })

  it('sends verified client-only skins to their manual installation guide', async () => {
    const manual = { ...skin, review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'manual-only' as const } }
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [manual] } : { skins: [] } }))
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)

    await openSkinCard()
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
