// Client market tests: restart receipts, use/pin/stop/uninstall and Web selection state
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => (await import('../fixtures/client-market.tsx')).createPrimitivesMock())

import { SkinMarketSection } from '../../src/client/SkinMarketSection.tsx'
import { stubMarketFetch } from '../fixtures/market-host.ts'
import { dshRuntime, managedDesktopSkin, officialManagement, openSkinCard, skin, registerMarketTestDom, zh } from '../fixtures/client-market.tsx'

registerMarketTestDom()

describe('client market restart and selection', () => {
  it('uses DSH action priority and icons for inactive and active skins', async () => {
    let active = false
    stubMarketFetch(async (url: string) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      return { skins: [{ skinId: skin.id, installation: 'installed', activation: active ? 'active' : 'inactive', installedVersion: '1.0.0', updateAvailable: true }] }
    })
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
  it('shows the first-use notice once in the existing use confirmation and cancels without changing state', async () => {
    window.localStorage.removeItem('dsh-skin-market:activation-warning-accepted')
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }] }
      if (url.endsWith('/activate') && init?.method === 'POST') return await new Promise(() => undefined)
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    const dialog = await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })
    expect(dialog.textContent).toContain(zh['common.firstUseRisk'])
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(window.localStorage.getItem('dsh-skin-market:activation-warning-accepted')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })).getByRole('button', { name: '确认使用' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(true))
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
    expect(window.localStorage.getItem('dsh-skin-market:activation-warning-accepted')).toBe('true')
  })
  it('uses the DSH outline capsule for the mobile back action', async () => {
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    const back = (await screen.findAllByRole('button', { name: zh['common.backToDiscover'] }))
      .find((button) => button.className.includes('mobileBack'))!
    expect(back.getAttribute('variant')).toBe('outline')
    expect(back.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })
  it('replaces Use with a restart confirmation when activation needs restart', async () => {
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [skin] } : { runningAgentCount: 0, skins: [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }] }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    const restart = await screen.findByRole('button', { name: zh['common.restartToApply'] })
    expect(screen.queryByRole('button', { name: '使用' })).toBeNull()
    fireEvent.click(restart)
    expect(screen.getByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeTruthy()
    expect(await screen.findByText(zh['common.saveBeforeRestart'])).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['common.confirmRestart'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy()
  })
  it('clears a Web selection restart receipt when the client module is already active', async () => {
    const fetchMock = stubMarketFetch(async (url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => url.endsWith('/catalog')
        ? { skins: [skin] }
        : {
          hostKind: 'dsh', runtime: dshRuntime, restartNoticeId: 'active-web-receipt', skins: [{
            skinId: skin.id, installation: 'installed', activation: 'restart-required', restartSource: 'selection', primary: true,
            clientModule: true, selectionHostApplied: true, selectionHostStatus: 'applied', selectionClientTargets: [{ package: skin.package, active: true }], installedVersion: '1.0.0', updateAvailable: false,
          }],
        },
    }))
    const clientRuntime = {
      setActive: vi.fn(async () => true),
      probeActive: vi.fn(() => 'active' as const),
      probeSyncing: vi.fn(() => false),
    }
    render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)

    expect(await screen.findAllByText('使用中')).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: zh['common.restartToApply'] })).toBeNull()
    expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/restart/clear') && init?.method === 'POST')).toBe(true)
  })
  it('shows the official Desktop restart instruction without posting to the market restart route', async () => {
    const fetchMock = stubMarketFetch(async (url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => url.endsWith('/catalog')
        ? { skins: [skin] }
        : {
          hostKind: 'desktop',
          restartAvailable: false,
          runningAgentCount: 0,
          skins: [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }],
        },
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    expect(await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeTruthy()
    expect(screen.queryByRole('button', { name: zh['common.restartToApply'] })).toBeNull()
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/restart') && init?.method === 'POST')).toBe(false)
  })
  it('shows an unavailable component honestly and lets Use retry its activation without suggesting restart', async () => {
    let activated = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [managedDesktopSkin] }
      if (url.endsWith('/state')) return {
        instanceId: 'component-session', hostKind: 'desktop', restartAvailable: false, runtime: dshRuntime, management: officialManagement,
        skins: [{ skinId: skin.id, installation: 'installed', activation: activated ? 'active' : 'unavailable', primary: true, installedVersion: '1.0.0', updateAvailable: false,
          ...(!activated && { error: '皮肤组件已关闭，尚未生效。' }) }],
      }
      if (url.endsWith('/activate') && init?.method === 'POST') { activated = true; return { operationId: 'enable-component' } }
      if (url.endsWith('/operations/enable-component')) return { id: 'enable-component', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: false }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    expect(screen.getAllByText('未生效').length).toBeGreaterThan(0)
    expect(screen.getByText('皮肤组件已关闭，尚未生效。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '停用' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /重启/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh['common.useAgain'] }))
    await waitFor(() => expect(screen.queryByText('皮肤组件已关闭，尚未生效。')).toBeNull())
    expect(screen.getAllByText('使用中').length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
  })
  it.each(['active', 'unavailable', 'removed'] as const)('restores a real pending skin once, then clears every restart reminder after it becomes %s', async outcome => {
    let restarted = false
    let routeRevision = 0
    const fetchMock = stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      instanceId: restarted ? 'after-restart' : `before-restart-${routeRevision}`, restartNoticeId: 'stable-pending-group', hostKind: 'desktop', restartAvailable: false, management: officialManagement,
      skins: restarted && outcome === 'removed' ? [] : [{ skinId: skin.id, installation: 'installed', activation: restarted ? outcome : 'restart-required', primary: true, lastOperatedAt: `2026-10-15T01:00:0${routeRevision}Z`, installedVersion: '1.0.0', updateAvailable: false,
        ...(restarted && outcome === 'unavailable' && { error: '皮肤组件已关闭，尚未生效。' }) }],
    } : {}))
    const view = render(<SkinMarketSection t={key => key} />)
    fireEvent.click(within(await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] })).getByRole('button', { name: '知道了' }))
    routeRevision += 1
    const beforeFocus = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(beforeFocus))
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    expect(screen.getByText('测试皮肤 设置已保存，请手动重启 Desktop App 后生效')).toBeTruthy()
    view.unmount()
    render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('button', { name: /测试皮肤 已安装卡片/ })
    expect(screen.getByText('测试皮肤 设置已保存，请手动重启 Desktop App 后生效')).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: zh['common.viewRestartHelp'] }))
    expect(screen.getByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeTruthy()
    restarted = true
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull())
    expect(screen.queryByText(/设置已保存，请手动重启/)).toBeNull()
    expect(screen.queryByRole('button', { name: zh['common.viewRestartHelp'] })).toBeNull()
    await openSkinCard()
    expect(screen.queryByText('待重启')).toBeNull()
    expect(screen.queryByRole('button', { name: zh['common.restartToApply'] })).toBeNull()
    if (outcome === 'unavailable') expect(screen.getByText('皮肤组件已关闭，尚未生效。')).toBeTruthy()
  })
  it.each(['skin', 'market-update'] as const)('keeps one acknowledged %s restart item in the banner without repeating the dialog', async target => {
    let receipt = 'first-change'
    let pending = true
    const fetchMock = stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      instanceId: 'same-desktop-process', restartNoticeId: receipt, marketUpdateNoticeId: receipt, hostKind: 'desktop', restartAvailable: false, management: officialManagement,
      marketUpdateRestartRequired: pending && target === 'market-update',
      skins: [{ skinId: skin.id, installation: 'installed', activation: pending && target === 'skin' ? 'restart-required' : 'active', primary: true, installedVersion: '1.0.0', updateAvailable: false }],
    } : {}))
    const intervalSpy = vi.spyOn(window, 'setInterval')
    const view = render(<SkinMarketSection t={key => key} />)
    const pollRefresh = intervalSpy.mock.calls.find(([, delay]) => delay === 5 * 60 * 1000)?.[0]
    intervalSpy.mockRestore()
    expect(typeof pollRefresh).toBe('function')
    const dismissDialog = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: target === 'skin' ? '关闭' : '知道了' }))
    dismissDialog(await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] }))
    const bannerTitle = target === 'skin' ? '测试皮肤 设置已保存，请手动重启 Desktop App 后生效' : '皮肤市场已更新，重启后生效，请手动重启 Desktop App 后生效'
    expect(screen.getByText(bannerTitle)).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    await act(async () => { (pollRefresh as () => void)() })
    expect(screen.getByText(bannerTitle)).toBeTruthy()
    const refreshState = async () => {
      const previous = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
      fireEvent(window, new Event('focus'))
      await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(previous))
    }
    await refreshState()
    expect(screen.getByText(bannerTitle)).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    view.unmount()
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    expect(screen.getAllByText(bannerTitle).length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    if (target === 'skin') expect(screen.getAllByText('待重启').length).toBeGreaterThan(0)
    // A revised receipt for the same pending target is still the same item.
    receipt = 'second-change'
    await refreshState()
    expect(screen.getAllByText(bannerTitle).length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    // Closing the banner itself keeps this item quiet until the Host clears it.
    fireEvent.click(screen.getAllByRole('button', { name: zh['common.closePrompt'] })[0]!)
    expect(screen.queryAllByText(bannerTitle)).toHaveLength(0)
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    pending = false
    await refreshState()
    expect(screen.queryAllByText(bannerTitle)).toHaveLength(0)
    pending = true
    await refreshState()
    const nextDialog = screen.getByRole('dialog', { name: zh['common.restartManualTitle'] })
    expect(nextDialog).toBeTruthy()
    dismissDialog(nextDialog)
    expect(screen.getAllByText(bannerTitle).length).toBeGreaterThan(0)
  })
  it('clears every restart reminder when the same Desktop process confirms the skin became active', async () => {
    let active = false
    const fetchMock = stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      instanceId: 'same-desktop-process', restartNoticeId: 'hot-applied-selection', hostKind: 'desktop', restartAvailable: false, management: officialManagement,
      skins: [{ skinId: skin.id, installation: 'installed', activation: active ? 'active' : 'restart-required', primary: true, installedVersion: '1.0.0', updateAvailable: false }],
    } : {}))
    render(<SkinMarketSection t={key => key} />)
    expect(await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeTruthy()

    active = true
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull())
    expect(screen.queryByText(/设置已保存，请手动重启/)).toBeNull()
    expect(screen.queryByRole('button', { name: zh['common.viewRestartHelp'] })).toBeNull()
    await openSkinCard()
    expect(screen.getAllByText('使用中').length).toBeGreaterThan(0)
    expect(screen.queryByText('待重启')).toBeNull()
    expect(screen.queryByRole('button', { name: zh['common.restartToApply'] })).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/restart'))).toBe(false)
  })
  it('uses confirmed active Desktop state to clear an activation operation restart hint', async () => {
    let active = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [managedDesktopSkin] }
      if (url.endsWith('/state')) return { instanceId: 'hot-activation', hostKind: 'desktop', restartAvailable: false, management: officialManagement,
        skins: [{ skinId: skin.id, installation: 'installed', activation: active ? 'active' : 'inactive', primary: active, installedVersion: '1.0.0', updateAvailable: false }] }
      if (url.endsWith('/activate') && init?.method === 'POST') { active = true; return { operationId: 'hinted-restart' } }
      if (url.endsWith('/operations/hinted-restart')) return { id: 'hinted-restart', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: true }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    await waitFor(() => expect(screen.getAllByText('使用中').length).toBeGreaterThan(0))
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    expect(screen.queryByRole('button', { name: zh['common.viewRestartHelp'] })).toBeNull()
    expect(screen.queryByText('待重启')).toBeNull()
  })
  it('opens the restart dialog when an applied operation still leaves an explicit pending restart in refreshed state', async () => {
    let used = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [managedDesktopSkin] }
      if (url.endsWith('/state')) return { instanceId: 'applied-with-pending', hostKind: 'desktop', restartAvailable: false, management: officialManagement,
        skins: [{ skinId: skin.id, installation: 'installed', activation: used ? 'restart-required' : 'inactive', primary: used, installedVersion: '1.0.0', updateAvailable: false }] }
      if (url.endsWith('/activate') && init?.method === 'POST') { used = true; return { operationId: 'applied-but-pending' } }
      if (url.endsWith('/operations/applied-but-pending')) return { id: 'applied-but-pending', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: false }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    expect(await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeTruthy()
    expect(screen.getAllByText('待重启').length).toBeGreaterThan(0)
  })
  it('does not present a restart dialog for an unresolved operation even if an earlier pending fact is restored', async () => {
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      instanceId: 'unknown-result', hostKind: 'desktop', restartAvailable: false,
      skins: [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }],
      operations: [{ id: 'unknown-use', kind: 'activate', skinId: skin.id, phase: 'waiting', startedAt: '2026-10-15T00:00:00Z', message: '宿主未返回可确认的操作结果' }],
    } : {}))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    expect(screen.queryByText('宿主未返回可确认的操作结果')).toBeNull()
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    expect(screen.queryByRole('button', { name: zh['common.viewRestartHelp'] })).toBeNull()
  })
  it('clears the self-update reminder and its open dialog when the restarted Host clears its pending flag', async () => {
    let pending = true
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      instanceId: pending ? 'old-market' : 'new-market', hostKind: 'desktop', restartAvailable: false, skins: [], marketUpdateRestartRequired: pending,
    } : {}))
    render(<SkinMarketSection t={key => key} />)
    expect(await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeTruthy()
    pending = false
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull())
    expect(screen.queryByText(/皮肤市场已更新/)).toBeNull()
    expect(screen.queryByRole('button', { name: zh['common.viewRestartHelp'] })).toBeNull()
  })
  it('waits for ongoing installations before manual restart and describes the chosen restart target', async () => {
    let installing = true
    const fetchMock = stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      hostKind: 'desktop', restartAvailable: false, marketUpdateRestartRequired: true,
      skins: [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }],
      operations: installing ? [{ id: 'other-install', skinId: 'other.skin', kind: 'install', phase: 'downloading', startedAt: new Date().toISOString() }] : [],
    } : {}))
    render(<SkinMarketSection t={key => key} />)
    const marketDialog = await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] })
    expect(marketDialog.textContent).toContain('还有 1 款皮肤正在安装或更新')
    expect(marketDialog.textContent).toContain(zh['common.waitBeforeRestart'])
    expect(marketDialog.textContent).not.toContain('完全退出 Desktop App')
    fireEvent.click(within(marketDialog).getByRole('button', { name: '知道了' }))
    installing = false
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
    await openSkinCard()
    const details = screen.getByRole('main', { name: zh['common.detailContent'] })
    expect(within(details).getByText('待重启')).toBeTruthy()
  })
  it('keeps the official Desktop self-update flow host-managed after the package is written', async () => {
    let updated = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => url.endsWith('/catalog')
        ? { skins: [skin] }
        : url.endsWith('/state')
          ? { hostKind: 'desktop', restartAvailable: false, runningAgentCount: 0, skins: [], marketUpdateRestartRequired: updated }
          : url.endsWith('/market-update') && init?.method === 'POST'
            ? (updated = true, { currentVersion: '0.1.57', latestVersion: '0.1.57', updateAvailable: false })
            : url.endsWith('/market-update')
              ? { currentVersion: '0.1.56', latestVersion: '0.1.57', updateAvailable: true }
              : {},
    }))
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByRole('button', { name: '更新皮肤市场到 0.1.57' }))
    expect(screen.queryByText('皮肤市场已更新，请手动重启 Desktop App 后生效')).toBeNull()
    const restartDialog = await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] })
    expect(restartDialog.textContent).toContain(zh['common.marketUpdatedRestart'])
    expect(restartDialog.textContent).toContain('完全退出 Desktop App 后重新打开')
    expect(within(restartDialog).getAllByRole('button')).toHaveLength(2)
    expect(screen.queryByText('请手动重启 Desktop App 后生效')).toBeNull()
    expect(screen.queryByRole('dialog', { name: zh['common.restartTargetMarket'] })).toBeNull()
    expect(fetchMock.mock.calls.some(([url, request]) => url.endsWith('/restart') && request?.method === 'POST')).toBe(false)
  })
  it.each([
    ['activate', '使用', true], ['activate', '使用', false],
    ['deactivate', '停用', true], ['deactivate', '停用', false],
    ['update', '更新', true], ['update', '更新', false],
    ['uninstall', '卸载', true], ['uninstall', '卸载', false],
  ] as const)('opens the manual Desktop restart dialog for %s only when its result requires restart (%s, %s)', async (kind, actionLabel, restartRequired) => {
    let completed = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [managedDesktopSkin] }
      if (url.endsWith('/state')) return {
        hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.1-alpha.3' },
        management: { ...officialManagement, installRequiresRestart: false },
        skins: [{ skinId: skin.id, installation: completed && kind === 'uninstall' ? 'missing' : 'installed', activation: completed && restartRequired ? 'restart-required' : kind === 'activate' ? completed ? 'active' : 'inactive' : completed && (kind === 'deactivate' || kind === 'uninstall') ? 'inactive' : 'active', installedVersion: '1.0.0', updateAvailable: kind === 'update' && !completed }],
      }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.58', latestVersion: '0.1.58', updateAvailable: false }
      if (url.endsWith(`/${kind}`) && init?.method === 'POST') {
        completed = true
        return { operationId: 'desktop-result' }
      }
      if (url.endsWith('/operations/desktop-result')) return { id: 'desktop-result', kind, skinId: skin.id, phase: 'done', restartRequired }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: actionLabel }))
    if (kind === 'uninstall') fireEvent.click(within(await screen.findByRole('dialog', { name: zh['common.uninstallSkin'] })).getByRole('button', { name: zh['common.confirmUninstall'] }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(1))
    if (restartRequired) {
      const dialog = await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] })
      expect(dialog.textContent).toContain('完全退出 Desktop App 后重新打开')
      if (kind === 'uninstall') {
        expect(within(screen.getByRole('main', { name: zh['common.detailContent'] })).queryByText('测试皮肤 已卸载，请手动重启 Desktop App 后生效')).toBeNull()
        expect(dialog.textContent).toContain('“测试皮肤”已卸载，重启后生效。')
      }
      expect(within(dialog).queryByRole('button', { name: /立即重启|确认无任务/ })).toBeNull()
      fireEvent.click(within(dialog).getByRole('button', { name: '知道了' }))
      const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
      fireEvent(window, new Event('focus'))
      await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
      expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
      fireEvent.click(screen.getAllByRole('button', { name: zh['common.viewRestartHelp'] })[0]!)
      expect(screen.getByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeTruthy()
      if (kind === 'uninstall') {
        expect(screen.getByRole('dialog', { name: zh['common.restartManualTitle'] }).textContent).toContain('“测试皮肤”已卸载，重启后生效。')
        expect(within(screen.getByRole('main', { name: zh['common.detailContent'] })).queryByText('测试皮肤 已卸载，请手动重启 Desktop App 后生效')).toBeNull()
      }
    } else {
      await act(async () => {})
      expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
      expect(screen.queryByRole('button', { name: zh['common.viewRestartHelp'] })).toBeNull()
      if (kind === 'uninstall') expect(within(screen.getByRole('main', { name: zh['common.detailContent'] })).getByText('测试皮肤 已卸载')).toBeTruthy()
    }
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/restart') && init?.method === 'POST')).toBe(false)
  })
  it.each([
    ['same-skin', 'missing'], ['same-skin', 'omitted'],
    ['other-skin', 'missing'], ['other-skin', 'omitted'],
  ] as const)('reports hot uninstall of %s with a %s runtime row without leaking earlier install notices', async (targetKind, removedRow) => {
    const blue = { ...managedDesktopSkin, name: { zh: '蓝色幻想', en: 'Blue Fantasy' } }
    const minecraft = { ...managedDesktopSkin, id: 'minecraft.skin', package: 'minecraft-skin', rowId: 'minecraft-skin', name: { zh: 'Minecraft', en: 'Minecraft' } }
    const target = targetKind === 'same-skin' ? blue : minecraft
    let blueInstalled = false
    let removedId: string | undefined
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [blue, minecraft] }
      if (url.endsWith('/state')) return {
        hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.1-alpha.3' },
        management: { ...officialManagement, installRequiresRestart: false },
        skins: [
          { skinId: minecraft.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false },
          ...(blueInstalled ? [{ skinId: blue.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }] : []),
        ].flatMap(item => item.skinId !== removedId ? [item] : removedRow === 'omitted' ? [] : [{ ...item, installation: 'missing', activation: 'inactive' }]),
      }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.60', latestVersion: '0.1.60', updateAvailable: false }
      if (url.endsWith('/install') && init?.method === 'POST') {
        blueInstalled = true
        return { operationId: 'blue-before-remove-install' }
      }
      if (url.endsWith('/operations/blue-before-remove-install')) return { id: 'blue-before-remove-install', kind: 'install', skinId: blue.id, phase: 'done', restartRequired: true }
      if (url.endsWith('/activate') && init?.method === 'POST') return { operationId: 'blue-before-remove-activate' }
      if (url.endsWith('/operations/blue-before-remove-activate')) return { id: 'blue-before-remove-activate', kind: 'activate', skinId: blue.id, phase: 'failed', message: '启用保存失败，已恢复原皮肤' }
      if (url.endsWith('/uninstall') && init?.method === 'POST') {
        removedId = JSON.parse(init.body as string).skinId
        return { operationId: 'hot-remove-result' }
      }
      if (url.endsWith('/operations/hot-remove-result')) return { id: 'hot-remove-result', kind: 'uninstall', skinId: target.id, phase: 'done', restartRequired: false }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    const failure = await screen.findByRole('dialog', { name: '启用未完成' })
    expect(screen.queryByText('蓝色幻想 已安装，但未启用')).toBeNull()
    fireEvent.click(within(failure).getByRole('button', { name: '知道了' }))
    await openSkinCard(new RegExp(`${target.name.zh} 界面预览`))
    let details = screen.getByRole('main', { name: zh['common.detailContent'] })
    fireEvent.click(within(details).getByRole('button', { name: '卸载' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: zh['common.uninstallSkin'] })).getByRole('button', { name: zh['common.confirmUninstall'] }))

    expect(await within(details).findByText(`${target.name.zh} 已卸载`)).toBeTruthy()
    expect(removedId).toBe(target.id)
    expect(within(details).queryByText('蓝色幻想 已安装，但未启用')).toBeNull()
    expect(within(details).queryByRole('button', { name: zh['common.viewRestartHelp'] })).toBeNull()
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
    expect(within(details).getByText(`${target.name.zh} 已卸载`)).toBeTruthy()
    expect(within(details).queryByText('蓝色幻想 已安装，但未启用')).toBeNull()

    fireEvent.click(within(screen.getByRole('dialog', { name: zh['common.skinDetails'] })).getByRole('button', { name: '关闭' }))
    if (targetKind === 'other-skin') {
      expect(screen.getByText('蓝色幻想 已安装，但未启用')).toBeTruthy()
      await openSkinCard(/蓝色幻想 界面预览/)
      details = screen.getByRole('main', { name: zh['common.detailContent'] })
      expect(within(details).getByText('蓝色幻想 已安装，但未启用')).toBeTruthy()
      expect(within(details).queryByText('Minecraft 已卸载')).toBeNull()
      fireEvent.click(within(details).getByRole('button', { name: zh['common.viewRestartHelp'] }))
      expect(screen.getByRole('dialog', { name: zh['common.restartManualTitle'] }).textContent).toContain('“蓝色幻想”已安装，但尚未启用。')
    } else {
      expect(screen.queryByText('蓝色幻想 已安装，但未启用')).toBeNull()
      expect(screen.queryByRole('button', { name: zh['common.viewRestartHelp'] })).toBeNull()
    }
  })
  it.each(['failed', 'cancelled'] as const)('does not report uninstall success when the removal result is %s', async phase => {
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [managedDesktopSkin] }
      if (url.endsWith('/state')) return {
        hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.1-alpha.3' }, management: officialManagement,
        skins: [{ skinId: skin.id, installation: 'installed', activation: 'active', installedVersion: '1.0.0', updateAvailable: false }],
      }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.60', latestVersion: '0.1.60', updateAvailable: false }
      if (url.endsWith('/uninstall') && init?.method === 'POST') return { operationId: 'unsuccessful-remove' }
      if (url.endsWith('/operations/unsuccessful-remove')) return { id: 'unsuccessful-remove', kind: 'uninstall', skinId: skin.id, phase, message: phase === 'failed' ? '卸载保存失败' : '已取消卸载' }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    const details = screen.getByRole('main', { name: zh['common.detailContent'] })
    fireEvent.click(within(details).getByRole('button', { name: '卸载' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: zh['common.uninstallSkin'] })).getByRole('button', { name: zh['common.confirmUninstall'] }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(1))
    await act(async () => {})
    expect(within(details).getByRole('button', { name: '卸载' }).hasAttribute('disabled')).toBe(false)
    expect(screen.queryByText(/测试皮肤 已卸载/)).toBeNull()
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    expect(within(details).queryByRole('button', { name: zh['common.viewRestartHelp'] })).toBeNull()
  })
  it('restores an uninstalled skin pending restart with its removal title and explanation', async () => {
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      instanceId: 'restored-remove', hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.1-alpha.3' }, management: officialManagement,
      skins: [{ skinId: skin.id, installation: 'missing', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }],
    } : {}))
    const view = render(<SkinMarketSection t={key => key} />)
    expect(screen.queryByText('测试皮肤 已卸载，请手动重启 Desktop App 后生效')).toBeNull()
    const initialDialog = await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] })
    expect(initialDialog.textContent).toContain('“测试皮肤”已卸载，重启后生效。')
    fireEvent.click(within(initialDialog).getByRole('button', { name: '知道了' }))

    view.unmount()
    render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('button', { name: /测试皮肤 界面预览/ })
    expect(screen.getByText('测试皮肤 已卸载，请手动重启 Desktop App 后生效')).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    await openSkinCard()
    const details = screen.getByRole('main', { name: zh['common.detailContent'] })
    expect(within(details).getByText('测试皮肤 已卸载，请手动重启 Desktop App 后生效')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['common.viewRestartHelp'] }))
    expect(screen.getByRole('dialog', { name: zh['common.restartManualTitle'] }).textContent).toContain('“测试皮肤”已卸载，重启后生效。')
  })
  it.each(['completed-task', 'restored'] as const)('keeps the acknowledged manual market-update notice in the banner for a %s across refresh and remount', async mode => {
    let updated = mode === 'restored'
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [managedDesktopSkin] }
      if (url.endsWith('/state')) return { hostKind: 'desktop', restartAvailable: false, skins: [], marketUpdateRestartRequired: updated }
      if (url.endsWith('/market-update') && init?.method === 'POST') return { operationId: 'desktop-market-update' }
      if (url.endsWith('/market-update/operations/desktop-market-update')) {
        updated = true
        return { id: 'desktop-market-update', phase: 'done', startedAt: new Date().toISOString() }
      }
      if (url.endsWith('/market-update')) return { currentVersion: updated ? '0.1.58' : '0.1.57', latestVersion: '0.1.58', updateAvailable: !updated }
      throw new Error(`Unexpected request: ${url}`)
    })
    const view = render(<SkinMarketSection t={key => key} />)
    if (mode === 'completed-task') fireEvent.click(await screen.findByRole('button', { name: '更新皮肤市场到 0.1.58' }))
    const dialog = await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] })
    expect(dialog.textContent).toContain(zh['common.marketUpdatedRestart'])
    fireEvent.click(within(dialog).getByRole('button', { name: '知道了' }))
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    expect(screen.getByText('皮肤市场已更新，重启后生效，请手动重启 Desktop App 后生效')).toBeTruthy()
    view.unmount()
    render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('button', { name: /测试皮肤 界面预览/ })
    expect(screen.getByText('皮肤市场已更新，重启后生效，请手动重启 Desktop App 后生效')).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/restart') && init?.method === 'POST')).toBe(false)
  })
  it('asks for restart after updating the active skin', async () => {
    let updated = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.26', latestVersion: '0.1.26', updateAvailable: false }
      if (url.endsWith('/update') && init?.method === 'POST') { updated = true; return { operationId: 'update-1' } }
      if (url.endsWith('/operations/update-1')) return { id: 'update-1', phase: 'done' }
      if (url.endsWith('/state')) return { runningAgentCount: 0, skins: [{ skinId: skin.id, installation: 'installed', activation: updated ? 'restart-required' : 'active', installedVersion: '1.0.0', updateAvailable: !updated }], runtime: dshRuntime }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '更新' }))

    expect(await screen.findByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeTruthy()
    expect(await screen.findByText(zh['common.saveBeforeRestart'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
    expect(screen.getAllByText('测试皮肤 已更新，待重启生效').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: zh['common.restartToApply'] })[0]!)
    expect(screen.getByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/update') && init?.method === 'POST')).toBe(true)
  })
  it('disables restart when the Host reports a running Agent', async () => {
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [skin] } : { runningAgentCount: 2, skins: [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }] }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: zh['common.restartToApply'] }))
    expect(await screen.findByText('2 个 Agent 正在运行，任务结束后才能重启。')).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['common.taskRunning'] }).hasAttribute('disabled')).toBe(true)
  })
  it('blocks restart while another skin is still installing', async () => {
    const other = { ...skin, id: 'test.other', name: { zh: '另一款皮肤', en: 'Other Skin' }, package: 'other-skin', rowId: 'other-skin', repo: 'https://github.com/a/c' }
    stubMarketFetch(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog')
        ? { skins: [skin, other] }
        : {
          runningAgentCount: 0,
          skins: [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }],
          operations: [{ id: 'install-other', kind: 'install', skinId: other.id, phase: 'downloading', startedAt: new Date().toISOString() }],
        },
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: zh['common.restartToApply'] }))
    expect(await screen.findByText(/还有 1 款皮肤正在安装或更新（另一款皮肤）/)).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['common.installingSkin'] }).hasAttribute('disabled')).toBe(true)
  })
  it('allows an explicit one-time restart when the old Host cannot report Agent state', async () => {
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [skin] } : { skins: [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }] }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: zh['common.restartToApply'] }))
    const override = await screen.findByRole('button', { name: zh['common.confirmNoTaskRestart'] })
    expect(override.hasAttribute('disabled')).toBe(false)
    expect(screen.getByText(zh['common.noRunningTask'])).toBeTruthy()
  })
})
