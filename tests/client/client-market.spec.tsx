// Client market tests: catalog ordering, refresh, self-update and installed-list rendering
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import React from 'react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => (await import('../fixtures/client-market.tsx')).createPrimitivesMock())

import { captureListScroll, compareInstalledSkinOrder, compareSkinOrder, resolvePrimitiveIcon, restartDocumentProbeUrl, restartReloadUrl, restoreListScroll, restoreMarketStyleOrder, SkinMarketSection, waitForRestartDocument } from '../../src/client/SkinMarketSection.tsx'
import { MARKET_INSTALL_TROUBLESHOOT_URL } from '../../src/client/failure-help.ts'
import { apply as applyClient, createClientSkinRuntime, missingPrimitives, switchClientSkin } from '../../src/client/index.ts'
import { createStaticTranslator } from '../../src/client/i18n.ts'
import { requestSent, stubMarketFetch } from '../fixtures/market-host.ts'
import { dshRuntime, managedDesktopSkin, openSkinCard, skin, registerMarketTestDom, zh } from '../fixtures/client-market.tsx'

registerMarketTestDom()

describe('client market catalog and updates', () => {
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
  it('puts every currently active installed skin above inactive skins', () => {
    const current = { ...skin, id: 'current-active' }
    const pinned = { ...skin, id: 'pinned-active' }
    const secondary = { ...skin, id: 'secondary-active' }
    const inactive = { ...skin, id: 'inactive' }
    const states = [
      { skinId: current.id, installation: 'installed' as const, activation: 'active' as const, primary: true, pinned: false, installedVersion: '1', updateAvailable: false },
      { skinId: pinned.id, installation: 'installed' as const, activation: 'active' as const, primary: false, pinned: true, installedVersion: '1', updateAvailable: false },
      { skinId: secondary.id, installation: 'installed' as const, activation: 'active' as const, primary: false, pinned: false, installedVersion: '1', updateAvailable: false },
      { skinId: inactive.id, installation: 'installed' as const, activation: 'inactive' as const, primary: false, pinned: false, installedVersion: '1', updateAvailable: false },
    ]
    expect([inactive, secondary, pinned, current].sort((a, b) => compareInstalledSkinOrder(a, b, states)).map(item => item.id))
      .toEqual(['current-active', 'pinned-active', 'secondary-active', 'inactive'])
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
    const fetchMock = stubMarketFetch(async (url: string) => {
      if (url.endsWith('/catalog')) {
        catalogRequests += 1
        return { skins: catalogRequests === 1 ? [skin, second] : [skin] }
      }
      return { skins: [], installedClientPlugins: [], runningAgentCount: 0 }
    })
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByRole('button', { name: /第二皮肤 界面预览/ }))
    expect(screen.getByRole('dialog', { name: zh['common.skinDetails'] })).toBeTruthy()
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(catalogRequests).toBe(2))
    expect(screen.getByRole('heading', { name: '第二皮肤' })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: zh['common.skinDetails'] })).toBeTruthy()
  })
  it('hides catalog metadata and the manual refresh control', async () => {
    const fetchMock = stubMarketFetch(async (url: string) => {
      if (url.endsWith('/catalog')) return { skins: [skin], generatedAt: '2026-08-15T12:00:00Z', catalogSource: 'bundled' }
      return { skins: [], installedClientPlugins: [], runningAgentCount: 0 }
    })
    render(<SkinMarketSection t={key => key} />)

    expect(await screen.findByRole('button', { name: /测试皮肤 界面预览/ })).toBeTruthy()
    expect(screen.queryByText(/内置目录|在线目录/)).toBeNull()
    expect(screen.queryByRole('button', { name: '刷新在线目录' })).toBeNull()
    expect(requestSent(fetchMock, '/catalog/refresh')).toBe(false)
  })
  it('shows a compact self-update action only when GitHub has a newer market version', async () => {
    let restartRequired = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runningAgentCount: 0, marketUpdateRestartRequired: restartRequired }
      if (url.endsWith('/market-update') && init?.method === 'POST') {
        restartRequired = true
        return { currentVersion: '0.1.16', latestVersion: '0.1.16', updateAvailable: false }
      }
      if (url.endsWith('/market-update') && restartRequired) return { currentVersion: '0.1.16', latestVersion: '0.1.16', updateAvailable: false }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.15', latestVersion: '0.1.16', updateAvailable: true }
      throw new Error(`Unexpected request: ${url}`)
    })
    const view = render(<SkinMarketSection t={key => key} />)

    const update = await screen.findByRole('button', { name: '更新皮肤市场到 0.1.16' })
    expect(update.textContent).toBe('更新')
    fireEvent.click(update)

    expect(await screen.findByRole('dialog', { name: zh['common.restartTargetMarket'] })).toBeTruthy()
    expect(screen.getByText(/皮肤市场已更新，重启后生效/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByText('皮肤市场已更新，待重启生效')).toBeNull()
    await waitFor(() => expect(screen.queryByRole('button', { name: '更新皮肤市场到 0.1.16' })).toBeNull())

    // Closing this receipt also survives a remount in the same session.
    view.unmount()
    render(<SkinMarketSection t={key => key} />)
    expect(await screen.findByRole('button', { name: /测试皮肤 界面预览/ })).toBeTruthy()
    expect(screen.queryByText('皮肤市场已更新，待重启生效')).toBeNull()
    expect(screen.queryByRole('dialog', { name: zh['common.restartTargetMarket'] })).toBeNull()
  })
  it('keeps a Desktop release-age hold silent without offering a dead update action', async () => {
    let marketUpdateChecks = 0
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime }
      if (url.endsWith('/market-update') && init?.method === 'POST') return { currentVersion: '0.1.61', latestVersion: '0.1.61', updateAvailable: false }
      if (url.endsWith('/market-update')) {
        marketUpdateChecks += 1
        return { currentVersion: '0.1.60', latestVersion: '0.1.61', updateAvailable: true,
          updateBlockedReason: '旧版服务推断的新包保护', packageOperationsWarning: '旧版服务推断的安装风险', updateAvailableAt: new Date(Date.now() + 60_000).toISOString() }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    const install = await screen.findByRole('button', { name: zh['common.installAndUse'] })
    await waitFor(() => expect(marketUpdateChecks).toBeGreaterThan(0))
    expect(install.hasAttribute('disabled')).toBe(false)
    expect(screen.queryByRole('button', { name: '更新皮肤市场到 0.1.61' })).toBeNull()
    expect(screen.queryByText('旧版服务推断的新包保护')).toBeNull()
  })
  it('reveals the update action when a release-age hold expires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    try {
      let held = true
      const availableAt = new Date(Date.now() + 60_000).toISOString()
      stubMarketFetch(async (url: string) => {
        if (url.endsWith('/catalog')) return { skins: [skin] }
        if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime }
        if (url.endsWith('/market-update')) return held
          ? { currentVersion: '0.1.60', latestVersion: '0.1.61', updateAvailable: false, updateBlockedReason: '供应链安全观察期', updateAvailableAt: availableAt }
          : { currentVersion: '0.1.60', latestVersion: '0.1.61', updateAvailable: true }
        throw new Error(`Unexpected request: ${url}`)
      })
      render(<SkinMarketSection t={key => key} />)
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(screen.getByRole('button', { name: zh['common.installAndUse'] })).toBeTruthy()
      expect(screen.queryByRole('button', { name: '更新皮肤市场到 0.1.61' })).toBeNull()
      held = false
      await act(async () => { await vi.advanceTimersByTimeAsync(61_000) })
      expect(screen.getByRole('button', { name: '更新皮肤市场到 0.1.61' })).toBeTruthy()
    } finally { vi.useRealTimers() }
  })
  it('keeps the real Desktop restart reminder while a market update is available', async () => {
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      hostKind: 'desktop', restartAvailable: false, skins: [], marketUpdateRestartRequired: true,
    } : url.endsWith('/market-update') ? {
      currentVersion: '0.1.60', latestVersion: '0.1.61', updateAvailable: true,
    } : {}))
    render(<SkinMarketSection t={key => key} />)
    expect(await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: '更新皮肤市场到 0.1.61' }).hasAttribute('disabled')).toBe(false)
  })
  it('requires an explicit exact-version approval before continuing a market update', async () => {
    let approved = false
    const failure = { kind: 'release-age', message: '新包保护', action: 'approve-release-age', releaseAgeTarget: { packageName: 'dsh-skin-market', version: '0.1.61' } }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime }
      if (url.endsWith('/market-update') && init?.method === 'POST') return { operationId: 'market-age-source' }
      if (url.endsWith('/market-update/operations/market-age-source/retry') && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ action: 'approve-release-age' })
        approved = true
        return { operationId: 'market-age-approved' }
      }
      if (url.endsWith('/market-update/operations/market-age-source')) return { id: 'market-age-source', phase: 'failed', startedAt: new Date().toISOString(), failure }
      if (url.endsWith('/market-update/operations/market-age-approved')) return { id: 'market-age-approved', phase: 'done', startedAt: new Date().toISOString(), status: { currentVersion: '0.1.61', latestVersion: '0.1.61', updateAvailable: false } }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.60', latestVersion: '0.1.61', updateAvailable: true }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '更新皮肤市场到 0.1.61' }))
    const dialog = await screen.findByRole('dialog', { name: zh['failure.marketUpdateApprovalTitle'] })
    expect(dialog.textContent).toContain('dsh-skin-market@0.1.61')
    expect(dialog.textContent).toContain(zh['failure.releaseAgeNextUpdate'])
    expect(dialog.querySelector('details, code, ul, ol')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    expect(approved).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: '允许并继续' }))
    await waitFor(() => expect(approved).toBe(true))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: zh['failure.marketUpdateApprovalTitle'] })).toBeNull())
    expect(screen.queryByRole('button', { name: '更新皮肤市场到 0.1.61' })).toBeNull()
  })
  it('uses the shared operation banner in the home header while the market updates', async () => {
    let operationRequests = 0
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runningAgentCount: 0, marketUpdateOperation: null }
      if (url.endsWith('/market-update') && init?.method === 'POST') return { ok: true, status: 202, json: async () => ({ operationId: 'market-update-1' }) }
      if (url.endsWith('/market-update/operations/market-update-1')) {
        operationRequests += 1
        return { id: 'market-update-1', phase: 'downloading', cancelable: true, startedAt: new Date().toISOString(), message: '正在下载皮肤市场更新包' }
      }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.15', latestVersion: '0.1.16', updateAvailable: true, operation: null }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByRole('button', { name: '更新皮肤市场到 0.1.16' }))
    const updatingButton = await screen.findByRole('button', { name: zh['market.updateInProgress'] })
    expect(updatingButton.hasAttribute('disabled')).toBe(true)
    expect(updatingButton.getAttribute('data-updating')).toBeNull()
    expect((await screen.findAllByText(zh['common.marketOperationDownloading'])).length).toBe(1)
    expect(document.querySelector('[class*="homeHeader"] [role="status"] strong')?.textContent).toBe(zh['common.marketOperationDownloading'])
    const banner = screen.getByRole('status')
    const message = within(banner).queryByText('正在下载皮肤市场更新包')
    expect(message === null || message.closest('[hidden]') !== null).toBe(true)
    expect(operationRequests).toBeGreaterThan(0)
  })
  it('renders typed operation messages and progress steps through the English translator', async () => {
    const operation = {
      id: 'english-operation', kind: 'install' as const, skinId: skin.id, phase: 'downloading' as const,
      startedAt: new Date().toISOString(), message: zh['common.operationWaitingOther'], messageKey: 'common.operationWaitingOther' as const,
      step: '下载并检查安装包', stepKey: 'common.stepDownloadInspect' as const,
    }
    stubMarketFetch(async (url: string) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], operation, runtime: dshRuntime }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={createStaticTranslator('en')} />)

    await waitFor(() => expect(screen.getByRole('status').querySelector('strong')?.textContent).toBe('Downloading “Test Skin”'))
    const banner = screen.getByRole('status')
    const detailsButton = within(banner).getByRole('button', { name: 'Details' })
    fireEvent.click(detailsButton)
    expect(within(banner).getByText('Waiting for another skin operation to finish')).toBeTruthy()
    expect(within(banner).getByText('Download and inspect the install package file')).toBeTruthy()
    expect(banner.textContent).not.toContain(zh['common.operationWaitingOther'])
    expect(banner.textContent).not.toContain('下载并检查安装包')
  })
  it.each(['done', 'failed', 'cancelled'] as const)('refreshes host state and unlocks skin actions after a waiting market update becomes %s', async phase => {
    let terminal = false
    let operationRequests = 0
    let stateRequests = 0
    let resolveTerminal!: (value: unknown) => void
    const terminalResult = new Promise<unknown>(resolve => { resolveTerminal = resolve })
    const operation = { id: 'market-waiting', phase, startedAt: '2026-10-14T00:00:00Z' }
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) {
        stateRequests += 1
        return { skins: [], runtime: dshRuntime, runningAgentCount: 0, marketUpdateOperation: terminal ? operation : null }
      }
      if (url.endsWith('/market-update') && init?.method === 'POST') return { operationId: operation.id }
      if (url.endsWith('/market-update/operations/market-waiting')) {
        operationRequests += 1
        return operationRequests === 1
          ? { ...operation, phase: 'waiting', message: '等待宿主确认市场更新' }
          : terminalResult
      }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.57', latestVersion: '0.1.58', updateAvailable: true, operation: null }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    const update = await screen.findByRole('button', { name: '更新皮肤市场到 0.1.58' })
    const install = await screen.findByRole('button', { name: zh['common.installAndUse'] })
    expect(install.hasAttribute('disabled')).toBe(false)
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      await act(async () => { fireEvent.click(update) })
      expect(operationRequests).toBe(1)
      expect(install.hasAttribute('disabled')).toBe(true)
      const beforeTerminal = stateRequests
      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
      expect(operationRequests).toBe(2)
      await act(async () => {
        terminal = true
        resolveTerminal(operation)
        await terminalResult
      })
      expect(stateRequests).toBeGreaterThan(beforeTerminal)
      expect(install.hasAttribute('disabled')).toBe(false)
    } finally { vi.useRealTimers() }
  })
  it('explains a market self-update store mismatch in a dialog with the troubleshooting README', async () => {
    const clipboard = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, writable: true, value: { writeText: clipboard } })
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runningAgentCount: 0, marketUpdateOperation: null }
      if (url.endsWith('/market-update') && init?.method === 'POST') return { ok: true, status: 202, json: async () => ({ operationId: 'market-update-store' }) }
      if (url.endsWith('/logs?operationId=market-update-store')) return { ok: true, text: async () => '# dsh-skin-market diagnostic log\nkind=unexpected-store' }
      if (url.endsWith('/market-update/operations/market-update-store')) {
        return { id: 'market-update-store', phase: 'failed', startedAt: new Date().toISOString(), message: '当前 profile 的 node_modules 由另一代 pnpm store 链接', failure: { kind: 'unexpected-store', message: '当前 profile 的 node_modules 由另一代 pnpm store 链接' } }
      }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.15', latestVersion: '0.1.16', updateAvailable: true, operation: null }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByRole('button', { name: '更新皮肤市场到 0.1.16' }))
    const dialog = await screen.findByRole('dialog', { name: '皮肤市场更新失败' })
    expect(dialog.textContent).toContain(zh['failure.storeProblem'])
    expect(dialog.textContent).not.toContain('pnpm store')
    expect(within(dialog).getByRole('link', { name: '查看安装排查' }).getAttribute('href')).toBe(MARKET_INSTALL_TROUBLESHOOT_URL)
    expect(within(dialog).queryByRole('link', { name: '查看手动更新' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: '复制日志' })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '复制日志' }))
    await waitFor(() => expect(clipboard).toHaveBeenCalledWith(expect.stringContaining('kind=unexpected-store')))
  })
  it('keeps a generic market self-update failure on the diagnostic path', async () => {
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runningAgentCount: 0 }
      if (url.endsWith('/market-update') && init?.method === 'POST') return { ok: true, status: 202, json: async () => ({ operationId: 'market-update-generic' }) }
      if (url.endsWith('/market-update/operations/market-update-generic')) {
        return { id: 'market-update-generic', phase: 'failed', startedAt: new Date().toISOString(), message: 'plugin command exited 1', failure: { kind: 'command', message: 'plugin command exited 1' } }
      }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.15', latestVersion: '0.1.16', updateAvailable: true }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '更新皮肤市场到 0.1.16' }))
    const dialog = await screen.findByRole('dialog', { name: '皮肤市场更新失败' })
    expect(dialog.textContent).toContain(zh['failure.marketUpdateRetry'])
    expect(within(dialog).queryByRole('link', { name: '查看安装排查' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
  })
  it('turns an empty successful response into a useful Host update error', async () => {
    stubMarketFetch(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected end of JSON input') } }))
    render(<SkinMarketSection t={key => key} />)

    expect(await screen.findByText(zh['market.updateServiceDataInvalid'])).toBeTruthy()
    expect(screen.queryByText(/Unexpected end of JSON input/)).toBeNull()
  })
  it('cache-busts the full document exactly once after a DSH restart', () => {
    const result = new URL(restartReloadUrl('http://127.0.0.1:8081/?view=market', 'new-instance'))
    expect(result.searchParams.get('view')).toBe('market')
    expect(result.searchParams.get('dsh-skin-reload')).toBe('new-instance')
    expect(restartDocumentProbeUrl(result.toString())).toBe('http://127.0.0.1:8081/?view=market')
  })
  it('does not navigate until the replacement Host can serve the document', async () => {
    let instanceId = 'old'
    let documentOk = false
    const calls: string[] = []
    const href = 'http://127.0.0.1:3080/?view=market'
    await expect(waitForRestartDocument({
      acceptedInstanceId: 'old',
      href,
      now: () => 0,
      deadlineMs: 10_000,
      pollMs: 1,
      sleep: async () => {
        if (calls.filter(item => item === 'state').length >= 1) instanceId = 'new'
        if (calls.filter(item => item === 'document').length >= 1) documentOk = true
      },
      fetchState: async () => {
        calls.push('state')
        return { instanceId }
      },
      fetchDocument: async url => {
        calls.push('document')
        expect(url).toBe(href)
        return { ok: documentOk }
      },
    })).resolves.toBe(restartReloadUrl(href, 'new'))
    expect(calls).toEqual(['state', 'state', 'document', 'state', 'document'])
  })
  it('keeps waiting when the new instance answers state before the SPA fallback is registered', async () => {
    let now = 0
    await expect(waitForRestartDocument({
      acceptedInstanceId: 'old',
      href: 'http://127.0.0.1:3080/',
      now: () => now,
      deadlineMs: 1_000,
      pollMs: 500,
      sleep: async ms => { now += ms },
      fetchState: async () => ({ instanceId: 'new' }),
      fetchDocument: async () => ({ ok: false }),
    })).rejects.toThrow('重启超时')
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
  it('keeps the market dialog sizing rule owned and restores it if a host prunes it', async () => {
    stubMarketFetch(async (url: string) => {
      if (url.endsWith('/catalog')) return { skins: [] }
      if (url.endsWith('/state')) return { hostKind: 'dsh', runtime: dshRuntime, skins: [] }
      return {}
    })
    const view = render(<SkinMarketSection t={key => key} />)
    const style = document.head.querySelector<HTMLStyleElement>('style[data-dsh-skin-market-wide]')
    expect(style).toBeTruthy()
    // An untagged rule gets claimed by a skin on older hosts; the owner makes
    // the rule part of the market so a skin's prune cannot take it away.
    expect(style!.dataset.plugin).toBe('dsh-skin-market')
    const orderSkin = document.createElement('style')
    orderSkin.dataset.plugin = 'late-skin'
    document.head.append(orderSkin)
    restoreMarketStyleOrder(document)
    expect(document.head.lastElementChild).toBe(style)
    orderSkin.remove()

    style!.remove()
    await waitFor(() => expect(style!.isConnected).toBe(true))
    view.unmount()
    expect(document.head.querySelector('style[data-dsh-skin-market-wide]')).toBeNull()
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
    expect(missingPrimitives({ Button: true })).toEqual(['Input', 'Modal', 'Pill', 'Switch'])
  })
  it('keeps the legacy market settings entry and mounts the same market UI when the new bundle configuration slot becomes available', () => {
    const pending = new Map<string, () => unknown>()
    const registrations: Array<{ meta: Record<string, unknown>; view: () => unknown }> = []
    const t = (key: string) => key
    applyClient({
      effect: callback => { callback() },
      locale: { register: vi.fn(), bind: () => t },
      loader: { entries: () => [] },
      slots: {
        inject: (slot, callback) => {
          if (slot === 'settings.section') callback()
          else pending.set(slot, callback)
        },
        register: (meta, view) => { registrations.push({ meta, view }) },
      },
    })
    expect(registrations).toHaveLength(1)
    expect(registrations[0]!.meta).toMatchObject({ name: 'settings.section', id: 'skin-market' })
    expect(pending.has('plugins.bundle.config')).toBe(true)

    pending.get('plugins.bundle.config')!()
    expect(registrations).toHaveLength(2)
    expect(registrations[1]!.meta).toMatchObject({ name: 'plugins.bundle.config', key: 'dsh-skin-market' })
    const legacy = registrations[0]!.view() as React.ReactElement
    const modern = registrations[1]!.view() as React.ReactElement
    expect(legacy.type).toBe(SkinMarketSection)
    expect(modern.type).toBe(SkinMarketSection)
    expect(modern.props.t).toBe(legacy.props.t)
    expect(modern.props.clientRuntime).toBe(legacy.props.clientRuntime)
    expect(legacy.props.layout).toBe('fill')
    expect(modern.props.layout).toBe('embedded')
  })
  it('resolves alpha.2 icon exports and keeps the rc.6 fallback', () => {
    const current = () => React.createElement('span', { 'data-icon': 'current' })
    const legacy = () => React.createElement('span', { 'data-icon': 'legacy' })

    expect(resolvePrimitiveIcon({ modern: current, legacy }, 'modern', 'legacy')).toBe(current)
    expect(resolvePrimitiveIcon({ legacy }, 'modern', 'legacy')).toBe(legacy)
    expect(typeof resolvePrimitiveIcon({}, 'modern', 'legacy')).toBe('function')
  })
  it('shows the feed loading hint, then puts the active skin first in Installed', async () => {
    const activeSkin = { ...skin, id: 'test.active', name: { zh: '当前皮肤', en: 'Active Skin' } }
    let resolveCatalog!: (value: unknown) => void
    let resolveState!: (value: unknown) => void
    stubMarketFetch((url: string) => new Promise(resolve => {
      if (url.endsWith('/catalog')) resolveCatalog = resolve
      else resolveState = resolve
    }))

    render(<SkinMarketSection t={key => key} />)
    expect(screen.getByText(zh['common.loadingSkins'])).toBeTruthy()
    expect(screen.queryByText(zh['common.noMatchingSkins'])).toBeNull()

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
    expect(screen.queryByText(zh['common.loadingSkins'])).toBeNull()
  })
  it('opens details in a labelled modal surface with an explicit close action', async () => {
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] }))
    render(<SkinMarketSection t={key => key} />)

    await openSkinCard()
    expect(screen.getByRole('dialog', { name: zh['common.skinDetails'] })).toBeTruthy()
    expect(screen.getByRole('heading', { name: zh['common.skinDetails'] })).toBeTruthy()
    const close = screen.getByRole('button', { name: '关闭' })
    expect(close.textContent).toBe('')
    fireEvent.click(close)
    expect(screen.queryByRole('dialog', { name: zh['common.skinDetails'] })).toBeNull()
  })
  it('does not mutate the host settings navigation DOM', async () => {
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] }))
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
    stubMarketFetch(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: installedSkins } : { skins: runtime },
    }))
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

    fireEvent.click(screen.getByRole('button', { name: zh['common.viewAllInstalled'] }))
    expect(await screen.findByRole('button', { name: '已安装', pressed: true })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '已装皮肤 5' })).toBeTruthy()
    const sidebarCards = screen.getByRole('complementary', { name: zh['market.catalog'] }).querySelectorAll<HTMLButtonElement>('button[data-skin-id]')
    expect([...sidebarCards].map(card => card.dataset.skinId)).toEqual(installedSkins.map(item => item.id).reverse())
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(within(screen.getByRole('complementary', { name: zh['market.catalog'] })).getByRole('group', { name: zh['common.sortBy'] })).toBeTruthy()
  })
  it('does not render client plugins outside the market catalog in the installed list', async () => {
    const externalPackage = '@captain1275/dsh-client-ui-skin-blue-fantasy'
    stubMarketFetch(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [skin] } : {
        skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }],
        installedClientPlugins: [{ package: externalPackage, version: '0.3.1', spec: 'github:CAPTAIN1275/dsh-ui-web', rowIds: [], registered: false }],
      },
    }))

    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: /测试皮肤 已安装卡片/ }))

    expect(screen.getByRole('button', { name: '已安装', pressed: true })).toBeTruthy()
    expect(within(screen.getByRole('complementary', { name: zh['market.catalog'] })).getByRole('button', { name: /测试皮肤/ })).toBeTruthy()
    expect(screen.queryByText(externalPackage)).toBeNull()
    expect(screen.queryByText(zh['common.marketExternalPlugin'])).toBeNull()
    expect(screen.queryByText(zh['common.loaderMissing'])).toBeNull()
  })
  it('shows installed skeletons while runtime state loads and hides the section when empty', async () => {
    let resolveState!: (value: { skins: never[] }) => void
    const state = new Promise<{ skins: never[] }>(resolve => { resolveState = resolve })
    stubMarketFetch(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [skin] } : state,
    }))

    render(<SkinMarketSection t={key => key} />)

    expect(await screen.findByRole('status', { name: zh['common.loadingInstalledSkins'] })).toBeTruthy()
    resolveState({ skins: [] })
    await waitFor(() => expect(screen.queryByRole('heading', { name: '已安装' })).toBeNull())
  })
  it('keeps installed skeletons when runtime state arrives before catalog skins', async () => {
    let resolveCatalog!: (value: unknown) => void
    let resolveState!: (value: unknown) => void
    stubMarketFetch((url: string) => new Promise(resolve => {
      if (url.endsWith('/catalog')) resolveCatalog = resolve
      else if (url.endsWith('/state')) resolveState = resolve
      else resolve(({}))
    }))

    render(<SkinMarketSection t={key => key} />)
    expect(await screen.findByRole('status', { name: zh['common.loadingInstalledSkins'] })).toBeTruthy()

    await waitFor(() => expect(typeof resolveState).toBe('function'))
    resolveState({ ok: true, json: async () => ({ skins: [{
      skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false,
    }] }) })

    expect(await screen.findByRole('status', { name: zh['common.loadingInstalledSkins'] })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /测试皮肤 已安装卡片/ })).toBeNull()

    resolveCatalog({ ok: true, json: async () => ({ skins: [skin] }) })
    expect(await screen.findByRole('button', { name: /测试皮肤 已安装卡片/ })).toBeTruthy()
    expect(screen.queryByRole('status', { name: zh['common.loadingInstalledSkins'] })).toBeNull()
  })
  it('paints installed cards from the cached catalog without waiting for catalog revalidation', async () => {
    const catalogCache = { read: vi.fn(async () => [skin]), write: vi.fn(async () => undefined) }
    let resolveState!: (value: unknown) => void
    stubMarketFetch((url: string) => {
      if (url.endsWith('/catalog')) return new Promise(() => undefined)
      if (url.endsWith('/state')) return new Promise(resolve => { resolveState = resolve })
      return Promise.resolve(({}))
    })

    render(<SkinMarketSection t={key => key} catalogCache={catalogCache} />)
    expect(await screen.findByRole('button', { name: /测试皮肤 界面预览/ })).toBeTruthy()
    expect(screen.getByRole('status', { name: zh['common.loadingInstalledSkins'] })).toBeTruthy()

    await waitFor(() => expect(typeof resolveState).toBe('function'))
    resolveState({ ok: true, json: async () => ({ skins: [{
      skinId: skin.id, installation: 'installed', activation: 'active', primary: true, installedVersion: '1.0.0', updateAvailable: false,
    }] }) })

    expect(await screen.findByRole('button', { name: /测试皮肤 已安装卡片/ })).toBeTruthy()
    expect(screen.queryByRole('status', { name: zh['common.loadingInstalledSkins'] })).toBeNull()
  })
  it('opens an installed card directly in its selected detail', async () => {
    stubMarketFetch(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [{
        skinId: skin.id,
        installation: 'installed',
        activation: 'inactive',
        installedVersion: '1.0.0',
        updateAvailable: false,
        installedAt: '2026-08-16T00:00:00Z',
      }] },
    }))
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByRole('button', { name: /测试皮肤 已安装卡片/ }))
    expect(await screen.findByRole('heading', { name: '测试皮肤' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '已安装', pressed: true })).toBeTruthy()
  })
})
