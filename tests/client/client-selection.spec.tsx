// Client market tests: Web selection runtime convergence and incompatible use
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => (await import('../fixtures/client-market.tsx')).createPrimitivesMock())

import { WEB_CLIENT_SETTLE_MS, SkinMarketSection } from '../../src/client/SkinMarketSection.tsx'
import { compatibilityContext } from '../../src/compatibility.ts'
import type { CatalogSkin, RuntimeSkin } from '../../src/client/types.ts'
import { methodSent, requestCount, requestSent, stubMarketFetch } from '../fixtures/market-host.ts'
import { dshRuntime, incompatibleSkin, openSkinCard, registerMarketTestDom, skin, zh } from '../fixtures/client-market.tsx'

registerMarketTestDom()

describe('client market selection convergence', () => {
  describe('Web selection runtime convergence', () => {
    function webSkin(overrides: Partial<RuntimeSkin> = {}): RuntimeSkin {
      return { skinId: skin.id, installation: 'installed', activation: 'restart-required', primary: true, pinned: false,
        installedVersion: '1.0.0', updateAvailable: false, clientModule: true, restartSource: 'selection', selectionHostApplied: true,
        selectionHostStatus: 'applied', selectionClientTargets: [{ package: skin.package, active: true }], ...overrides }
    }

    function serveWebState(state: () => RuntimeSkin[], catalog: CatalogSkin[] = [skin]) {
      const fetchMock = stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: catalog }
        : url.endsWith('/state') ? { instanceId: 'same-web-instance', restartNoticeId: 'same-receipt', hostKind: 'dsh', runtime: dshRuntime, runningAgentCount: 0, skins: state() }
          : { updateAvailable: false }))
      return fetchMock
    }

    it('verifies the target, old skin, preserved plugin and managed browser companion together', async () => {
      const targets = [{ package: skin.package, active: true }, { package: 'previous', active: false },
        { package: 'pinned', active: true }, { package: 'managed-browser-companion', active: true }]
      serveWebState(() => [webSkin({ selectionClientTargets: targets })])
      let pinnedPhase = 'active' as 'active' | 'failed'
      let notify!: () => void
      const probeActive = vi.fn((name: string) => name === 'previous' ? 'missing' as const : name === 'pinned' ? pinnedPhase : 'active' as const)
      render(<SkinMarketSection t={key => key} clientRuntime={{ setActive: vi.fn(), probeActive, probeSyncing: () => false,
        observe: listener => { notify = listener; return () => undefined } }} />)
      expect((await screen.findAllByText('使用中', { exact: true })).length).toBeGreaterThan(0)
      expect(probeActive.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(targets.map(item => item.package)))
      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
      pinnedPhase = 'failed'
      act(() => notify())
      expect(screen.queryByText('使用中', { exact: true })).toBeNull()
      expect(screen.getAllByText('未生效', { exact: true }).length).toBeGreaterThan(0)
      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
    })

    it('shows an enabled secondary plugin as active without treating it as pinned', async () => {
      serveWebState(() => [webSkin({ primary: false, pinned: false })])
      render(<SkinMarketSection t={key => key} clientRuntime={{ setActive: vi.fn(), probeActive: () => 'active', probeSyncing: () => false }} />)
      expect((await screen.findAllByText('使用中', { exact: true })).length).toBeGreaterThan(0)
      expect(screen.queryByRole('button', { name: '使用' })).toBeNull()
      expect(screen.getByRole('button', { name: '常驻' })).toBeTruthy()
    })

    it('waits for graph settlement and clears a real delayed-client reminder in the same tab', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
      try {
        let phase = 'missing' as 'missing' | 'active'
        let syncing = false
        let notify!: () => void
        const fetchMock = serveWebState(() => [webSkin()])
        const unsubscribe = vi.fn()
        const view = render(<SkinMarketSection t={key => key} catalogCache={{ read: async () => null, write: async () => undefined }} clientRuntime={{ setActive: vi.fn(), probeActive: () => phase, probeSyncing: () => syncing,
          observe: listener => { notify = listener; return unsubscribe } }} />)
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })
        expect(screen.getAllByText(zh['common.loadingState'], { exact: true }).length).toBeGreaterThan(0)
        expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
        await act(async () => { await vi.advanceTimersByTimeAsync(WEB_CLIENT_SETTLE_MS) })
        expect(screen.getByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeTruthy()
        phase = 'active'
        syncing = true
        act(() => notify())
        expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
        expect(screen.queryByText('使用中', { exact: true })).toBeNull()
        syncing = false
        act(() => notify())
        expect(screen.getAllByText('使用中', { exact: true }).length).toBeGreaterThan(0)
        expect(screen.queryByText('待重启', { exact: true })).toBeNull()
        const reads = fetchMock.mock.calls.length
        act(() => { notify(); notify(); notify() })
        expect(fetchMock.mock.calls.length).toBe(reads)
        expect(fetchMock.mock.calls.every(([url]) => !url.endsWith('/restart'))).toBe(true)
        view.unmount()
        expect(unsubscribe).toHaveBeenCalledOnce()
      } finally { vi.useRealTimers() }
    })

    it('does not flash a restart dialog while an active Web client is settling', async () => {
      let phase = 'loading' as 'loading' | 'active'
      let notify!: () => void
      serveWebState(() => [webSkin({ restartSource: undefined })])
      render(<SkinMarketSection t={key => key} clientRuntime={{ setActive: vi.fn(), probeActive: () => phase, probeSyncing: () => false,
        observe: listener => { notify = listener; return () => undefined } }} />)

      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
      phase = 'active'
      act(() => notify())
      await waitFor(() => expect(screen.getAllByText('使用中', { exact: true }).length).toBeGreaterThan(0))
      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
    })

    it('keeps a dismissed Web restart notice quiet when the settle window runs again', async () => {
      // Drive the settlement deadline instead of racing real timers against
      // Testing Library's timeout on a busy CI worker.
      vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
      let view: ReturnType<typeof render> | undefined
      try {
        window.sessionStorage.clear()
        const fetchMock = serveWebState(() => [webSkin({ restartSource: undefined })])
        view = render(<SkinMarketSection t={key => key} catalogCache={{ read: async () => null, write: async () => undefined }} clientRuntime={{ setActive: vi.fn(), probeActive: () => 'loading', probeSyncing: () => false }} />)
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })
        expect(requestCount(fetchMock, '/state')).toBe(1)
        expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
        await act(async () => { await vi.advanceTimersByTimeAsync(WEB_CLIENT_SETTLE_MS - 1) })
        expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
        await act(async () => { await vi.advanceTimersByTimeAsync(1) })
        const first = screen.getByRole('dialog', { name: zh['common.restartTargetSkin'] })
        fireEvent.click(within(first).getByRole('button', { name: '取消' }))
        expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
        expect(screen.getByText('测试皮肤 设置已保存，待重启生效')).toBeTruthy()
        // A fresh focus starts another settlement window. The acknowledged key
        // must survive it so the dialog cannot reopen for the same pending skin.
        const beforeFocus = requestCount(fetchMock, '/state')
        fireEvent(window, new Event('focus'))
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })
        expect(requestCount(fetchMock, '/state')).toBeGreaterThan(beforeFocus)
        expect(screen.queryByText('测试皮肤 设置已保存，待重启生效')).toBeNull()
        expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
        await act(async () => { await vi.advanceTimersByTimeAsync(WEB_CLIENT_SETTLE_MS - 1) })
        expect(screen.queryByText('测试皮肤 设置已保存，待重启生效')).toBeNull()
        expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
        await act(async () => { await vi.advanceTimersByTimeAsync(1) })
        expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
        expect(screen.getByText('测试皮肤 设置已保存，待重启生效')).toBeTruthy()
        expect(methodSent(fetchMock, 'POST')).toBe(false)
      } finally {
        view?.unmount()
        vi.useRealTimers()
      }
    })

    it.each(['soft receipt', 'already applied receipt'] as const)('rechecks a loading Host with a state-only read before reporting success (%s)', async receipt => {
      let hostReady = false
      const fetchMock = serveWebState(() => [webSkin({ selectionHostApplied: hostReady, selectionHostStatus: hostReady ? 'applied' : 'switching',
        ...(receipt === 'already applied receipt' ? { activation: 'active' as const, restartSource: undefined } : {}) })])
      render(<SkinMarketSection t={key => key} clientRuntime={{ setActive: vi.fn(), probeActive: () => 'active', probeSyncing: () => false }} />)
      expect((await screen.findAllByText(zh['common.loadingState'], { exact: true })).length).toBeGreaterThan(0)
      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
      hostReady = true
      await waitFor(() => expect(screen.getAllByText('使用中', { exact: true }).length).toBeGreaterThan(0), { timeout: 3000 })
      expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/catalog'))).toHaveLength(1)
      expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state'))).toHaveLength(2)
      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
    })

    it('uses the actual probe after an activation request whose loader boolean is false', async () => {
      let activated = false
      const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => ({ ok: true, json: async () => {
        if (url.endsWith('/catalog')) return { skins: [skin] }
        if (url.endsWith('/state')) return { instanceId: 'accepted-is-not-applied', hostKind: 'dsh', runtime: dshRuntime,
          skins: [webSkin({ activation: activated ? 'restart-required' : 'inactive', primary: activated,
            restartSource: activated ? 'selection' : undefined, selectionClientTargets: [{ package: skin.package, active: activated }] })] }
        if (url.endsWith('/activate') && init?.method === 'POST') { activated = true; return { operationId: 'activate-client-probe' } }
        if (url.endsWith('/operations/activate-client-probe')) return { id: 'activate-client-probe', skinId: skin.id, kind: 'activate', phase: 'done' }
        return { updateAvailable: false }
      } }))
      const setActive = vi.fn(async () => false)
      render(<SkinMarketSection t={key => key} clientRuntime={{ setActive, probeActive: () => activated ? 'active' : 'disabled', probeSyncing: () => false }} />)
      await openSkinCard()
      fireEvent.click(screen.getByRole('button', { name: '使用' }))
      await waitFor(() => expect(screen.getAllByText('使用中', { exact: true }).length).toBeGreaterThan(0))
      expect(setActive).toHaveBeenCalledWith(skin.package, true)
      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
    })

    it.each(['deactivate', 'unpin'] as const)('waits for a host-only skin browser companion to stop after %s', async kind => {
      let stopped = false
      let companionPhase = 'active' as 'active' | 'missing'
      let notify!: () => void
      const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => ({ ok: true, json: async () => {
        if (url.endsWith('/catalog')) return { skins: [skin] }
        if (url.endsWith('/state')) return { instanceId: 'stopping-companion', hostKind: 'dsh', runtime: dshRuntime,
          skins: [webSkin({ clientModule: undefined, activation: stopped ? 'restart-required' : 'active', primary: !stopped && kind === 'deactivate', pinned: !stopped && kind === 'unpin',
            restartSource: stopped ? 'selection' : undefined, selectionClientTargets: [{ package: 'extra-browser-companion', active: !stopped }] })] }
        if (url.endsWith(`/${kind}`) && init?.method === 'POST') { stopped = true; return { operationId: 'stop-browser-companion' } }
        if (url.endsWith('/operations/stop-browser-companion')) return { id: 'stop-browser-companion', skinId: skin.id, kind, phase: 'done' }
        return { updateAvailable: false }
      } }))
      render(<SkinMarketSection t={key => key} clientRuntime={{ setActive: vi.fn(async () => true), probeActive: () => companionPhase, probeSyncing: () => false,
        observe: listener => { notify = listener; return () => undefined } }} />)
      await openSkinCard()
      fireEvent.click(screen.getByRole('button', { name: kind === 'deactivate' ? '停用' : zh['common.unpin'] }))
      await screen.findAllByText(zh['common.loadingState'], { exact: true })
      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
      companionPhase = 'missing'
      act(() => notify())
      expect(screen.getByRole('button', { name: '使用' })).toBeTruthy()
      expect(screen.queryByText('待重启', { exact: true })).toBeNull()
      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
    })

    it('clears a stop receipt when the host and browser both confirm the stop', async () => {
      window.sessionStorage.clear()
      const fetchMock = serveWebState(() => [webSkin({
        activation: 'restart-required', primary: false, pinned: false,
        restartSource: undefined, restartOnlyToStop: true,
        selectionClientTargets: [{ package: skin.package, active: false }],
      })])
      render(<SkinMarketSection t={key => key} clientRuntime={{
        setActive: vi.fn(),
        probeActive: () => 'missing',
        probeSyncing: () => false,
      }} />)
      expect((await screen.findAllByRole('button', { name: '使用' })).length).toBeGreaterThan(0)
      expect(screen.queryByText('待重启', { exact: true })).toBeNull()
      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkinStop'] })).toBeNull()
      await waitFor(() => expect(requestSent(fetchMock, '/restart/clear')).toBe(true))
    })

    it('keeps a stop receipt when the host has not applied the disable', async () => {
      window.sessionStorage.clear()
      const fetchMock = serveWebState(() => [webSkin({
        activation: 'restart-required', primary: false, pinned: false,
        restartSource: undefined, restartOnlyToStop: true,
        selectionHostApplied: false, selectionHostStatus: 'switching',
        selectionClientTargets: [{ package: skin.package, active: false }],
      })])
      render(<SkinMarketSection t={key => key} clientRuntime={{
        setActive: vi.fn(),
        probeActive: () => 'missing',
        probeSyncing: () => false,
      }} />)
      const dialog = await screen.findByRole('dialog', { name: zh['common.restartTargetSkinStop'] }, { timeout: 3000 })
      expect(dialog.textContent).toContain(zh['common.saveBeforeRestart'])
      expect(screen.getAllByText('待重启', { exact: true }).length).toBeGreaterThan(0)
      expect(requestSent(fetchMock, '/restart/clear')).toBe(false)
    })

    it('does not mark an active skin unavailable when another skin has an incomplete stop receipt', async () => {
      window.sessionStorage.clear()
      const second = { ...skin, id: 'test.second', package: 'test-second', rowId: 'test-second',
        name: { zh: '第二皮肤', en: 'Second Skin' } }
      serveWebState(() => [
        webSkin({ activation: 'active', primary: true, restartSource: undefined, selectionClientTargets: undefined }),
        webSkin({ skinId: second.id, activation: 'restart-required', primary: false,
          restartSource: 'selection', restartOnlyToStop: true, selectionHostApplied: false,
          selectionHostStatus: 'switching', selectionClientTargets: undefined }),
      ], [skin, second])
      render(<SkinMarketSection t={key => key} clientRuntime={{
        setActive: vi.fn(),
        probeActive: packageName => packageName === skin.package ? 'active' : 'missing',
        probeSyncing: () => false,
      }} />)
      expect((await screen.findAllByText('使用中', { exact: true })).length).toBeGreaterThan(0)
      expect(screen.queryByText('未生效', { exact: true })).toBeNull()
      expect(await screen.findByRole('dialog', { name: zh['common.restartTargetSkinStop'] }, { timeout: 3000 })).toBeTruthy()
    })

    it('keeps a stop receipt while the old Web module is still running and uses stop-specific copy', async () => {
      window.sessionStorage.clear()
      serveWebState(() => [webSkin({
        activation: 'restart-required', primary: false, pinned: false,
        restartSource: undefined, restartOnlyToStop: true,
        selectionClientTargets: [{ package: skin.package, active: false }],
      })])
      render(<SkinMarketSection t={key => key} clientRuntime={{
        setActive: vi.fn(),
        probeActive: () => 'active',
        probeSyncing: () => false,
      }} />)
      const dialog = await screen.findByRole('dialog', { name: zh['common.restartTargetSkinStop'] }, { timeout: 3000 })
      expect(dialog.textContent).toContain(zh['common.saveBeforeRestart'])
      expect(screen.getAllByText('待重启', { exact: true }).length).toBeGreaterThan(0)
      expect(screen.queryByRole('button', { name: zh['common.restartToApply'] })).toBeNull()
      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
    })

    it('labels an already seen stop receipt with a stop action instead of applying the skin', async () => {
      window.sessionStorage.clear()
      const seenKey = JSON.stringify(['skin', skin.id])
      window.sessionStorage.setItem('dsh-skin-market:restart-prompts', JSON.stringify([seenKey]))
      serveWebState(() => [webSkin({
        activation: 'restart-required', primary: false, pinned: false,
        restartSource: undefined, restartOnlyToStop: true,
        selectionClientTargets: [{ package: skin.package, active: false }],
      })])
      render(<SkinMarketSection t={key => key} clientRuntime={{
        setActive: vi.fn(),
        probeActive: () => 'active',
        probeSyncing: () => false,
      }} />)
      expect(await screen.findByRole('button', { name: zh['common.restartStopAction'] })).toBeTruthy()
      expect(screen.queryByRole('button', { name: zh['common.restartToApply'] })).toBeNull()
      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkinStop'] })).toBeNull()
    })

    it.each(['unconfirmed Host', 'incomplete browser list', 'missing probe'] as const)('does not confirm a soft selection with %s', async missing => {
      serveWebState(() => [webSkin({ selectionHostApplied: missing === 'unconfirmed Host' ? false : true,
        selectionHostStatus: missing === 'unconfirmed Host' ? 'unavailable' : 'applied',
        selectionClientTargets: missing === 'incomplete browser list' ? undefined : [{ package: skin.package, active: true }] })])
      render(<SkinMarketSection t={key => key} clientRuntime={{ setActive: vi.fn(),
        ...(missing === 'missing probe' ? {} : { probeActive: () => 'active' as const }), probeSyncing: () => false }} />)
      if (missing === 'incomplete browser list') {
        // The active skin's own package is confirmed by the browser probe;
        // an incomplete global target list must not override that evidence.
        expect((await screen.findAllByText('使用中', { exact: true })).length).toBeGreaterThan(0)
        expect(screen.queryByText('未生效', { exact: true })).toBeNull()
      } else {
        expect((await screen.findAllByText('未生效', { exact: true })).length).toBeGreaterThan(0)
        expect(screen.queryByText('使用中', { exact: true })).toBeNull()
      }
      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
    })

    it('clears a protected Web restart receipt when the requested client module is already active', async () => {
      serveWebState(() => [webSkin({ restartSource: undefined })])
      render(<SkinMarketSection t={key => key} clientRuntime={{ setActive: vi.fn(), probeActive: () => 'active', probeSyncing: () => false }} />)
      expect((await screen.findAllByText('使用中', { exact: true })).length).toBeGreaterThan(0)
      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
    })

    it('keeps the same pending skin in the banner after its soft selection reminder was dismissed', async () => {
      let protectedReceipt = false
      const fetchMock = serveWebState(() => [webSkin({ restartSource: protectedReceipt ? undefined : 'selection' })])
      render(<SkinMarketSection t={key => key} />)
      fireEvent.click(within(await screen.findByRole('dialog', { name: zh['common.restartTargetSkin'] })).getByRole('button', { name: '取消' }))
      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
      expect(screen.getByText('测试皮肤 设置已保存，待重启生效')).toBeTruthy()
      protectedReceipt = true
      const beforeFocus = requestCount(fetchMock, '/state')
      fireEvent(window, new Event('focus'))
      await waitFor(() => expect(requestCount(fetchMock, '/state')).toBeGreaterThan(beforeFocus))
      expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
      expect(screen.getByText('测试皮肤 设置已保存，待重启生效')).toBeTruthy()
    })
  })
  it.each(['activate', 'pin'] as const)('preserves a real Web-client failure after %s without fabricating a Host activation state', async kind => {
    let activated = false
    let instanceId = 'web-before-restart'
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { instanceId, runningAgentCount: 0, skins: [{ skinId: skin.id, installation: 'installed', activation: activated || kind === 'pin' ? 'active' : 'inactive', primary: activated || kind === 'pin', pinned: activated && kind === 'pin', installedVersion: '1.0.0', updateAvailable: false }], runtime: dshRuntime }
      if (url.endsWith(`/${kind}`) && init?.method === 'POST') { activated = true; return { operationId: 'client-failure' } }
      if (url.endsWith('/operations/client-failure')) return { id: 'client-failure', kind, skinId: skin.id, phase: 'done', restartRequired: false }
      return {}
    })
    const clientRuntime = { setActive: vi.fn(async () => false) }
    render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: kind === 'pin' ? '设为常驻' : '使用' }))
    if (kind === 'pin') fireEvent.click(await screen.findByRole('button', { name: '确认设为常驻' }))
    const dialog = await screen.findByRole('dialog', { name: zh['common.restartTargetSkin'] })
    expect(dialog.textContent).not.toMatch(/仍可继续使用/)
    expect(dialog.textContent).not.toContain('当前 Host 尚未加载安全检查')
    expect(clientRuntime.setActive).toHaveBeenCalledWith(skin.package, true)
    expect(screen.queryByText('待重启')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    const stateRequests = requestCount(fetchMock, '/state')
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(requestCount(fetchMock, '/state')).toBeGreaterThan(stateRequests))
    expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
    expect(screen.getAllByText(/待重启生效/).length).toBeGreaterThan(0)
    instanceId = 'web-after-restart'
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(screen.queryAllByText(/待重启生效/)).toHaveLength(0))
  })
  it('asks before using an incompatible installed skin and preserves the restart flow after consent', async () => {
    const incompatible = incompatibleSkin
    let activated = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [incompatible] }
      if (url.endsWith('/state')) return { runningAgentCount: 0, skins: [{ skinId: incompatible.id, installation: 'installed', activation: activated ? 'restart-required' : 'inactive', installedVersion: '1.0.0', updateAvailable: false }], runtime: { version: '0.1.1-rc.1', capabilities: ['slot:keyed:settings.plugin.item'], source: 'injected' } }
      if (url.endsWith('/activate') && init?.method === 'POST') { activated = true; return { operationId: 'activate-1' } }
      if (url.endsWith('/operations/activate-1')) return { id: 'activate-1', phase: 'done' }
      throw new Error(`Unexpected request: ${url}`)
    })
    const clientRuntime = { setActive: vi.fn(async () => false) }
    render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)
    await openSkinCard()

    expect(screen.queryByText(/仍可继续使用/)).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: '使用' }))
    const compatibilityDialog = await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })
    expect(compatibilityDialog.textContent).toMatch(/不在作者声明的兼容范围/)
    expect(compatibilityDialog.querySelector('ul, ol, code, a, details')).toBeNull()
    expect(methodSent(fetchMock, 'POST')).toBe(false)
    fireEvent.click(within(compatibilityDialog).getByRole('button', { name: '仍然使用' }))
    const dialog = await screen.findByRole('dialog', { name: zh['common.restartTargetSkin'] })
    expect(dialog.textContent).toContain(zh['common.saveBeforeRestart'])
    expect(screen.getByRole('button', { name: zh['common.confirmRestart'] })).toBeTruthy()
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: incompatible.id, acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(incompatible, { ...dshRuntime, version: '0.1.1-rc.1' }) })
  })
  it('asks separately for an incompatible skin before enabling it as a pinned plugin', async () => {
    const incompatible = incompatibleSkin
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [incompatible] }
      if (url.endsWith('/state')) return { runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }] }
      if (url.endsWith('/pin') && init?.method === 'POST') return { operationId: 'incompatible-pin' }
      if (url.endsWith('/operations/incompatible-pin')) return { id: 'incompatible-pin', kind: 'pin', skinId: skin.id, phase: 'done' }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '测试皮肤 已安装卡片' }))
    fireEvent.click(screen.getByRole('button', { name: '设为常驻' }))
    const dialog = await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })
    expect(methodSent(fetchMock, 'POST')).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: '仍然设为常驻' }))
    await waitFor(() => expect(requestSent(fetchMock, '/pin', 'POST')).toBe(true))
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/pin') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: skin.id, acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(incompatible, dshRuntime) })
  })
})
