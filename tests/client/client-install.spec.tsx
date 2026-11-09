// Client market tests: install, install-and-use, manual Desktop handoff and native panel flows
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import React from 'react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => (await import('../fixtures/client-market.tsx')).createPrimitivesMock())

import { SkinMarketSection } from '../../src/client/SkinMarketSection.tsx'
import { createSkinInstallCommands, createSkinInstallInputs, createSkinInstallPrompt } from '../../src/client/submission.ts'
import { compatibilityContext } from '../../src/compatibility.ts'
import type { CatalogSkin } from '../../src/client/types.ts'
import { stubMarketFetch } from '../fixtures/market-host.ts'
import { dshRuntime, managedDesktopSkin, officialManagement, openSkinCard, skin, useMarketTestDom, zh } from '../fixtures/client-market.tsx'

useMarketTestDom()

describe('client market install and use', () => {
  it('installs and activates from the discovery card action', async () => {
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'card-install' }
      if (url.endsWith('/operations/card-install')) return { id: 'card-install', kind: 'install', skinId: skin.id, phase: 'done' }
      if (url.endsWith('/activate') && init?.method === 'POST') return await new Promise(() => undefined)
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)

    const install = await screen.findByRole('button', { name: zh['common.installAndUse'] })
    expect(install.getAttribute('variant')).toBe('outline')
    expect(screen.queryByText('可安装')).toBeNull()
    fireEvent.click(install)

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/install') && init?.method === 'POST')).toBe(true))
    await waitFor(() => expect(screen.getByRole('group', { name: '测试皮肤 操作' }).textContent).toContain('启用中'))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toBe(true))
  })
  it.each(['desktop', 'dsh'] as const)('keeps install-and-use for a %s host whose completed install does not require restart', async hostKind => {
    let installed = false
    let active = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [managedDesktopSkin] }
      if (url.endsWith('/state')) return {
        hostKind, restartAvailable: hostKind === 'dsh', runtime: { ...dshRuntime, version: '0.2.1-alpha.1' },
        ...(hostKind === 'desktop' ? { management: { ...officialManagement, installRequiresRestart: false } } : {}),
        skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: active ? 'active' : 'inactive', installedVersion: '1.0.0', updateAvailable: false }] : [],
      }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.58', latestVersion: '0.1.58', updateAvailable: false }
      if (url.endsWith('/install') && init?.method === 'POST') {
        installed = true
        return { operationId: 'current-install' }
      }
      if (url.endsWith('/operations/current-install')) return { id: 'current-install', kind: 'install', skinId: skin.id, phase: 'done', restartRequired: false }
      if (url.endsWith('/activate') && init?.method === 'POST') {
        active = true
        return { operationId: 'current-activate' }
      }
      if (url.endsWith('/operations/current-activate')) return { id: 'current-activate', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: false }
      throw new Error(`Unexpected request: ${url}`)
    })
    const clientRuntime = { setActive: vi.fn(async () => true) }
    render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)
    fireEvent.click(await screen.findByRole('button', { name: hostKind === 'desktop' ? '安装' : zh['common.installAndUse'] }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toBe(true))
    expect(await screen.findAllByRole('button', { name: '停用' })).not.toHaveLength(0)
    if (hostKind === 'desktop') expect(clientRuntime.setActive).not.toHaveBeenCalled()
    else expect(clientRuntime.setActive).toHaveBeenCalledWith(skin.package, true)
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/restart') && init?.method === 'POST')).toBe(false)
  })
  it('does not show a restart prompt when a Web install receipt is followed by an active hot activation', async () => {
    let installed = false
    let active = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return {
        hostKind: 'dsh', restartNoticeId: 'hot-receipt', runtime: dshRuntime,
        skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: active ? 'restart-required' : 'inactive', primary: active, clientModule: active, installedVersion: '1.0.0', updateAvailable: false }] : [],
      }
      if (url.endsWith('/install') && init?.method === 'POST') {
        installed = true
        return { operationId: 'hot-install' }
      }
      if (url.endsWith('/operations/hot-install')) return { id: 'hot-install', kind: 'install', skinId: skin.id, phase: 'done', restartRequired: true }
      if (url.endsWith('/activate') && init?.method === 'POST') {
        active = true
        return { operationId: 'hot-activate' }
      }
      if (url.endsWith('/operations/hot-activate')) return { id: 'hot-activate', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: true }
      if (url.endsWith('/restart/clear') && init?.method === 'POST') return { cleared: true, skinId: skin.id }
      throw new Error(`Unexpected request: ${url}`)
    })
    const clientRuntime = {
      setActive: vi.fn(async () => true),
      probeActive: vi.fn(() => 'active' as const),
      probeSyncing: vi.fn(() => false),
    }
    render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)

    fireEvent.click(await screen.findByRole('button', { name: zh['common.installAndUse'] }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/operations/hot-activate'))).toBe(true))
    expect(screen.queryByRole('button', { name: zh['common.restartToApply'] })).toBeNull()
    expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
    expect(fetchMock.mock.calls.some(([url, request]) => url.endsWith('/restart') && request?.method === 'POST')).toBe(false)
    expect(fetchMock.mock.calls.some(([url, request]) => url.endsWith('/restart/clear') && request?.method === 'POST')).toBe(true)
  })
  it.each([
    ['discovery', false, false, '0.2.1-alpha.3', false], ['detail', false, false, '0.2.1-alpha.3', false],
    ['discovery', true, false, '0.2.1-alpha.3', false], ['detail', true, false, '0.2.1-alpha.3', false],
    ['discovery', false, true, '0.2.1-alpha.3', false], ['detail', false, true, '0.2.1-alpha.3', false],
    ['discovery', true, true, '0.2.0-rc.2', true], ['detail', true, true, '0.2.0-rc.2', true],
    ['discovery', true, true, '0.2.0-rc.2', undefined], ['detail', true, true, '0.2.0-rc.2', undefined],
  ] as const)('finishes official Desktop install-and-use from %s before presenting one restart dialog (install=%s, switch=%s, version=%s, hint=%s)', async (entry, installRestart, switchRestart, version, installHint) => {
    const oldSkin = { ...managedDesktopSkin, id: 'old.skin', package: 'old-skin', name: { zh: '原皮肤', en: 'Old Skin' } }
    let installed = false
    let switched = false
    let finishActivation!: (value: unknown) => void
    const activationResult = new Promise<unknown>(resolve => { finishActivation = resolve })
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [managedDesktopSkin, oldSkin] }
      if (url.endsWith('/state')) return {
        hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version },
        management: { ...officialManagement, ...(installHint !== undefined && { installRequiresRestart: installHint }) },
        skins: [
          { skinId: oldSkin.id, installation: 'installed', activation: switched ? 'inactive' : 'active', primary: !switched, installedVersion: '1.0.0', updateAvailable: false },
          ...(installed ? [{ skinId: skin.id, installation: 'installed', activation: switched ? installRestart || switchRestart ? 'restart-required' : 'active' : installRestart ? 'restart-required' : 'inactive', primary: switched, installedVersion: '1.0.0', updateAvailable: false }] : []),
        ],
      }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.58', latestVersion: '0.1.58', updateAvailable: false }
      if (url.endsWith('/install') && init?.method === 'POST') {
        installed = true
        return { operationId: 'alpha3-install' }
      }
      if (url.endsWith('/operations/alpha3-install')) return { id: 'alpha3-install', kind: 'install', skinId: skin.id, phase: 'done', restartRequired: installRestart }
      if (url.endsWith('/activate') && init?.method === 'POST') return { operationId: 'alpha3-switch' }
      if (url.endsWith('/operations/alpha3-switch')) return activationResult
      if (url.endsWith('/uninstall') && init?.method === 'POST') {
        installed = false
        return { operationId: 'alpha3-remove' }
      }
      if (url.endsWith('/operations/alpha3-remove')) return { id: 'alpha3-remove', kind: 'uninstall', skinId: skin.id, phase: 'done', restartRequired: false }
      throw new Error(`Unexpected request: ${url}`)
    })
    const clientRuntime = { setActive: vi.fn(async () => true) }
    render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)
    if (entry === 'detail') await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/operations/alpha3-switch'))).toBe(true))
    expect(screen.queryByText(/请手动重启 Desktop App/)).toBeNull()
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    switched = true
    await act(async () => {
      finishActivation({ id: 'alpha3-switch', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: installRestart || switchRestart })
      await activationResult
    })
    if (installRestart || switchRestart) {
      expect(screen.queryByText('测试皮肤 已切换，请手动重启 Desktop App 后生效')).toBeNull()
      expect(screen.queryByText('请手动重启 Desktop App 后生效')).toBeNull()
      const restartDialog = await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] })
      expect(restartDialog.textContent).toContain('已启用“测试皮肤”')
      fireEvent.click(within(restartDialog).getByRole('button', { name: '知道了' }))
      expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
      expect(screen.getAllByText('测试皮肤 已切换，请手动重启 Desktop App 后生效').length).toBeGreaterThan(0)
      if (entry === 'discovery') await openSkinCard()
      fireEvent.click(screen.getAllByRole('button', { name: zh['common.viewRestartHelp'] })[0]!)
      expect(screen.getByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeTruthy()
      fireEvent.click(within(screen.getByRole('dialog', { name: zh['common.restartManualTitle'] })).getByRole('button', { name: '关闭' }))
      expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
      expect(screen.getAllByText('测试皮肤 已切换，请手动重启 Desktop App 后生效').length).toBeGreaterThan(0)
    } else {
      expect(await screen.findAllByRole('button', { name: '停用' })).not.toHaveLength(0)
      expect(screen.queryByText(/请手动重启 Desktop App/)).toBeNull()
    }
    expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/install') && init?.method === 'POST')).toHaveLength(1)
    expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toHaveLength(1)
    expect(screen.queryByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeNull()
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/restart') && init?.method === 'POST')).toBe(false)
    expect(clientRuntime.setActive).not.toHaveBeenCalled()
    if (entry === 'detail' && (installRestart || switchRestart)) {
      fireEvent.click(screen.getByRole('button', { name: '卸载' }))
      fireEvent.click(within(await screen.findByRole('dialog', { name: zh['common.uninstallSkin'] })).getByRole('button', { name: zh['common.confirmUninstall'] }))
      await waitFor(() => expect(screen.queryByText('测试皮肤 已切换，请手动重启 Desktop App 后生效')).toBeNull())
    }
  })
  it.each(['catalog', 'activate-post', 'activate-poll', 'activate-refresh'] as const)('keeps a %s exception primary during install-and-use and restores the installation reminder without auto-opening it', async failurePoint => {
    let installed = false
    let activated = false
    let rejectCompletionCatalog: (() => void) | undefined
    let completionCatalogRejected = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) {
        if (installed && failurePoint === 'catalog') throw new Error('catalog temporarily unavailable')
        if (activated && failurePoint === 'activate-refresh') {
          if (completionCatalogRejected) throw new Error('catalog temporarily unavailable')
          return await new Promise((_resolve, reject) => {
            rejectCompletionCatalog = () => { completionCatalogRejected = true; reject(new Error('catalog temporarily unavailable')) }
          })
        }
        return { skins: [managedDesktopSkin] }
      }
      if (url.endsWith('/state')) return {
        hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.1-alpha.3' },
        management: { ...officialManagement, installRequiresRestart: false },
        skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }] : [],
      }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.58', latestVersion: '0.1.58', updateAvailable: false }
      if (url.endsWith('/install') && init?.method === 'POST') {
        installed = true
        return { operationId: 'interrupted-install' }
      }
      if (url.endsWith('/operations/interrupted-install')) return { id: 'interrupted-install', kind: 'install', skinId: skin.id, phase: 'done', restartRequired: true }
      if (url.endsWith('/activate') && init?.method === 'POST') {
        if (failurePoint === 'activate-post') throw new Error('activate transport unavailable')
        activated = true
        return { operationId: 'interrupted-activate' }
      }
      if (url.endsWith('/operations/interrupted-activate')) {
        if (failurePoint === 'activate-poll') throw new Error('activate result unavailable')
        return { id: 'interrupted-activate', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: true }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '安装' }))
    if (failurePoint === 'activate-refresh') {
      await waitFor(() => expect(rejectCompletionCatalog).toBeTypeOf('function'))
      expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
      await act(async () => rejectCompletionCatalog!())
    }
    const failure = await screen.findByRole('dialog', { name: failurePoint === 'catalog' ? '安装未完成' : '启用未完成' })
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    expect(screen.queryByText(failurePoint === 'catalog' ? '测试皮肤 已安装，但未启用' : '测试皮肤 已安装，自动切换结果待确认')).toBeNull()
    fireEvent.click(within(failure).getByRole('button', { name: '知道了' }))
    fireEvent.click(screen.getAllByRole('button', { name: zh['common.viewRestartHelp'] })[0]!)
    const dialog = await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] })
    expect(dialog.textContent).toContain(failurePoint === 'catalog' ? '已安装，但尚未启用。' : '已安装，请在插件页确认是否启用。')
    if (failurePoint !== 'catalog') expect(dialog.textContent).not.toContain('尚未启用')
    expect(dialog.textContent).not.toContain('已保存')
    expect(dialog.textContent).not.toContain('重启后可使用')
    expect(screen.queryByText('测试皮肤 已切换，请手动重启 Desktop App 后生效')).toBeNull()
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toBe(failurePoint !== 'catalog')
  })
  it.each(['discovery', 'detail'])('does not activate an installed skin when its %s view unmounts during the completion response', async entry => {
    let resolveOperation!: (value: unknown) => void
    const operationResult = new Promise<unknown>(resolve => { resolveOperation = resolve })
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.58', latestVersion: '0.1.58', updateAvailable: false }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'unmounted-install' }
      if (url.endsWith('/operations/unmounted-install')) return operationResult
      if (url.endsWith('/activate') && init?.method === 'POST') return { operationId: 'unexpected-activate' }
      throw new Error(`Unexpected request: ${url}`)
    })
    const view = render(<SkinMarketSection t={key => key} />)
    if (entry === 'detail') await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: zh['common.installAndUse'] }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/operations/unmounted-install'))).toBe(true))
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    view.unmount()
    await act(async () => {
      resolveOperation({ id: 'unmounted-install', kind: 'install', skinId: skin.id, phase: 'done' })
      await operationResult
    })
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toBe(false)
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state'))).toHaveLength(stateRequests)
  })
  it('does not change the client loader when the view unmounts during a deactivate completion response', async () => {
    let resolveOperation!: (value: unknown) => void
    const operationResult = new Promise<unknown>(resolve => { resolveOperation = resolve })
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [{ skinId: skin.id, installation: 'installed', activation: 'active', installedVersion: '1.0.0', updateAvailable: false }], runtime: dshRuntime }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.58', latestVersion: '0.1.58', updateAvailable: false }
      if (url.endsWith('/deactivate') && init?.method === 'POST') return { operationId: 'unmounted-deactivate' }
      if (url.endsWith('/operations/unmounted-deactivate')) return operationResult
      throw new Error(`Unexpected request: ${url}`)
    })
    const clientRuntime = { setActive: vi.fn(async () => true) }
    const view = render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)
    fireEvent.click((await screen.findAllByRole('button', { name: '停用' }))[0]!)
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/operations/unmounted-deactivate'))).toBe(true))
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    view.unmount()
    await act(async () => {
      resolveOperation({ id: 'unmounted-deactivate', kind: 'deactivate', skinId: skin.id, phase: 'done' })
      await operationResult
    })
    expect(clientRuntime.setActive).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state'))).toHaveLength(stateRequests)
  })
  it('lets a second discovery card start while another install is still downloading', async () => {
    const other = { ...skin, id: 'test.other', name: { zh: '另一款皮肤', en: 'Other Skin' }, package: 'other-skin', rowId: 'other-skin', repo: 'https://github.com/a/c' }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin, other] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime, operations: [] }
      if (url.endsWith('/install') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { skinId: string }
        return { operationId: `install-${body.skinId}` }
      }
      if (url.includes('/operations/install-')) {
        const id = url.split('/').at(-1)!
        const skinId = id.slice('install-'.length)
        return {
          id, kind: 'install', skinId, phase: skinId === other.id ? 'done' : 'downloading', startedAt: new Date().toISOString(),
        }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)

    const first = await screen.findByRole('group', { name: '测试皮肤 操作' })
    const second = await screen.findByRole('group', { name: '另一款皮肤 操作' })
    fireEvent.click(within(first).getByRole('button', { name: zh['common.installAndUse'] }))
    await waitFor(() => expect(first.textContent).toContain('安装中'))
    const queued = within(second).getByRole('button', { name: '安装' })
    expect(queued.hasAttribute('disabled')).toBe(false)
    expect(within(second).queryByRole('button', { name: zh['common.installAndUse'] })).toBeNull()
    fireEvent.click(queued)
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/install') && (init as RequestInit | undefined)?.method === 'POST')).toHaveLength(2))
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/activate') && (init as RequestInit | undefined)?.method === 'POST')).toBe(false)
  })
  it.each(['discovery', 'detail'] as const)('keeps the official Desktop %s install as one automatic action and waits for another installation', async entry => {
    const other = { ...managedDesktopSkin, id: 'other.skin', name: { zh: '正在安装的皮肤', en: 'Installing Skin' } }
    const fetchMock = stubMarketFetch(async (url: string) => {
      if (url.endsWith('/catalog')) return { skins: [managedDesktopSkin, other] }
      if (url.endsWith('/state')) return {
        hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.0-rc.2' }, management: { ...officialManagement, installRequiresRestart: true }, skins: [],
        operations: [{ id: 'other-install', skinId: other.id, kind: 'install', phase: 'downloading', startedAt: new Date().toISOString() }],
      }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    if (entry === 'detail') await openSkinCard()
    const region = entry === 'detail' ? screen.getByRole('main', { name: zh['common.detailContent'] }) : await screen.findByRole('group', { name: '测试皮肤 操作' })
    const install = within(region).getByRole('button', { name: '安装' })
    expect(install.hasAttribute('disabled')).toBe(true)
    expect(install.getAttribute('title')).toBe(zh['common.noOtherInstall'])
    expect(within(region).queryByRole('button', { name: '仅安装' })).toBeNull()
    expect(within(region).queryByRole('button', { name: zh['common.installAndUse'] })).toBeNull()
    fireEvent.click(install)
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(false)
  })
  it.each(['discovery', 'detail'] as const)('blocks the official Desktop %s install when the host cannot enable its target', async entry => {
    const reason = '当前宿主无法保存插件启用状态'
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : {
      hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.0-rc.2' }, skins: [],
      management: { ...officialManagement, capabilities: { ...officialManagement.capabilities, enable: { available: false, reason } } },
    }))
    render(<SkinMarketSection t={key => key} />)
    if (entry === 'detail') await openSkinCard()
    const region = entry === 'detail' ? screen.getByRole('main', { name: zh['common.detailContent'] }) : await screen.findByRole('group', { name: '测试皮肤 操作' })
    const install = within(region).getByRole('button', { name: '安装' })
    expect(install.hasAttribute('disabled')).toBe(true)
    expect(install.getAttribute('title')).toBe(reason)
    expect(screen.queryByText(reason)).toBeNull()
    expect(within(region).queryByRole('button', { name: '仅安装' })).toBeNull()
  })
  it.each(['active', 'inactive'] as const)('keeps unavailable host action reasons on the %s skin controls without persistent status text', async activation => {
    const reason = '官方管理接口尚未核验当前 DSH 版本'
    const busy = '正在等待宿主确认当前操作'
    let profileBusy: string | undefined
    const fetchMock = stubMarketFetch(async (url: string, _init?: RequestInit) => (url.endsWith('/catalog') ? { skins: [managedDesktopSkin] }
      : url.endsWith('/market-update') ? { updateAvailable: true, currentVersion: '1.0.0', latestVersion: '9.0.0' }
      : {
        hostKind: 'desktop', runtime: { ...dshRuntime, version: '0.2.1-rc.1' }, profileBusy,
        management: { ...officialManagement, capabilities: {
          install: { available: false, reason }, update: { available: false, reason },
          enable: { available: false, reason }, disable: { available: false, reason }, remove: { available: false, reason },
        } },
        skins: [{ skinId: skin.id, installation: 'installed', activation, installedVersion: '0.9.0', updateAvailable: true }],
      }))
    render(<SkinMarketSection t={key => key} />)
    const card = await screen.findByRole('button', { name: /测试皮肤 已安装卡片/ })
    const actions = within(card.closest('article')!).getByRole('group', { name: '测试皮肤 操作' })
    for (const name of [activation === 'active' ? '停用' : '使用', '更新']) {
      const button = within(actions).getByRole('button', { name })
      expect(button.hasAttribute('disabled')).toBe(true)
      expect(button.getAttribute('title')).toBe(reason)
      fireEvent.click(button)
    }
    const marketUpdate = screen.getByRole('button', { name: '更新皮肤市场到 9.0.0' })
    expect(marketUpdate.hasAttribute('disabled')).toBe(true)
    expect(marketUpdate.getAttribute('title')).toBe(reason)
    expect(screen.queryByText(reason)).toBeNull()

    await openSkinCard(/测试皮肤 已安装卡片/)
    const detail = screen.getByRole('main', { name: zh['common.detailContent'] })
    for (const name of [activation === 'active' ? '停用' : '使用', '设为常驻', '更新', '卸载']) {
      const button = within(detail).getByRole('button', { name })
      expect(button.hasAttribute('disabled')).toBe(true)
      expect(button.getAttribute('title')).toBe(reason)
      fireEvent.click(button)
    }
    expect(screen.queryByText(reason)).toBeNull()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)

    profileBusy = busy
    fireEvent.focus(window)
    await waitFor(() => expect(within(detail).getByRole('button', { name: activation === 'active' ? '停用' : '使用' }).getAttribute('title')).toBe(busy))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText(busy)).toBeNull()
    expect(screen.queryByText(reason)).toBeNull()
  })
  it.each(['overridden', 'failed'] as const)('keeps the %s activation failure primary after installation and leaves only an honest manual restart banner', async application => {
    let installed = false
    const oldSkin = { ...managedDesktopSkin, id: 'old.skin', package: 'old-skin', name: { zh: '原皮肤', en: 'Old Skin' } }
    const message = application === 'overridden' ? '启停设置已保存，但被其他配置覆盖，尚未生效' : '启用保存失败，已恢复原皮肤'
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [managedDesktopSkin, oldSkin] }
      if (url.endsWith('/state')) return { hostKind: 'desktop', restartAvailable: false, restartNoticeId: 'installation-and-rollback', runtime: { ...dshRuntime, version: '0.2.0-rc.2' }, management: { ...officialManagement, installRequiresRestart: true }, skins: [
        { skinId: oldSkin.id, installation: 'installed', activation: installed ? 'restart-required' : 'active', primary: true, installedVersion: '1.0.0', updateAvailable: false },
        ...(installed ? [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', primary: false, installedVersion: '1.0.0', updateAvailable: false }] : []),
      ] }
      if (url.endsWith('/install') && init?.method === 'POST') { installed = true; return { operationId: 'installed-before-failure' } }
      if (url.endsWith('/operations/installed-before-failure')) return { id: 'installed-before-failure', skinId: skin.id, kind: 'install', phase: 'done', restartRequired: true }
      if (url.endsWith('/activate') && init?.method === 'POST') return { operationId: 'switch-failed' }
      if (url.endsWith('/operations/switch-failed')) return { id: 'switch-failed', skinId: skin.id, kind: 'activate', phase: 'failed', application, message }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    const failure = await screen.findByRole('dialog', { name: '启用未完成' })
    if (application === 'overridden') {
      expect(failure.textContent).toContain('核对覆盖来源')
      expect(failure.textContent).not.toContain('重启无法')
    } else {
      expect(failure.textContent).toContain('未能完成本次操作。请复制日志反馈给市场维护者。')
      expect(failure.textContent).not.toContain(message)
    }
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    expect(screen.queryByText('测试皮肤 已安装，但未启用')).toBeNull()
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
    expect(screen.getByRole('dialog', { name: '启用未完成' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeNull()
    fireEvent.click(within(failure).getByRole('button', { name: '知道了' }))
    fireEvent.click(screen.getByRole('button', { name: zh['common.viewRestartHelp'] }))
    const dialog = await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] })
    expect(dialog.textContent).toContain('已安装，但尚未启用')
    expect(dialog.textContent).not.toContain('自动切换尚未完成')
    expect(dialog.textContent).not.toContain('重启后可使用')
    expect(dialog.textContent).not.toContain('已启用“测试皮肤”')
    expect(dialog.textContent).not.toContain('“原皮肤”的设置')
    expect(screen.queryByText('测试皮肤 已切换，请手动重启 Desktop App 后生效')).toBeNull()
  })
  it('installs without optional warnings and asks once only before the install-and-use activation', async () => {
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [incompatible] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'op-incompatible' }
      if (url.endsWith('/operations/op-incompatible')) return { id: 'op-incompatible', kind: 'install', skinId: skin.id, phase: 'done' }
      if (url.endsWith('/activate') && init?.method === 'POST') return { operationId: 'op-activate' }
      if (url.endsWith('/operations/op-activate')) return { id: 'op-activate', kind: 'activate', skinId: skin.id, phase: 'done' }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '仅安装' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/install'))).toHaveLength(1))
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url]) => url.endsWith('/install'))?.[1]?.body))).toEqual({ skinId: skin.id })
    fireEvent.click(screen.getByRole('button', { name: zh['common.installAndUse'] }))
    const dialog = await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })
    expect(dialog.textContent).toContain(zh['common.compatibilityRiskLabel'])
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/install'))).toHaveLength(2)
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: zh['common.installAndUse'] }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })).getByRole('button', { name: '仍然使用' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/activate'))).toHaveLength(1))
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url]) => url.endsWith('/activate'))?.[1]?.body))).toEqual({ skinId: skin.id, acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(incompatible, dshRuntime) })
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
  })
  it.each(['discovery', 'detail'])('updates an incompatible skin in the %s view without optional risk confirmation', async entry => {
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [incompatible] }
      if (url.endsWith('/state')) return { runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '0.9.0', updateAvailable: true }] }
      if (url.endsWith('/update') && init?.method === 'POST') return { operationId: 'incompatible-update' }
      if (url.endsWith('/operations/incompatible-update')) return { id: 'incompatible-update', kind: 'update', skinId: skin.id, phase: 'done' }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    if (entry === 'detail') {
      fireEvent.click(await screen.findByRole('button', { name: '测试皮肤 已安装卡片' }))
    }
    fireEvent.click((await screen.findAllByRole('button', { name: '更新' }))[0]!)
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/update') && init?.method === 'POST')).toHaveLength(1))
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/update') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: skin.id })
  })
  it('migrates after source confirmation without an optional compatibility warning', async () => {
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    const sourceMigration = { target: 'skin@1.0.0', currentSource: skin.install.target }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [incompatible] }
      if (url.endsWith('/state')) return { runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false, sourceMigration }] }
      if (url.endsWith('/migrate') && init?.method === 'POST') return { operationId: 'incompatible-migrate' }
      if (url.endsWith('/operations/incompatible-migrate')) return { id: 'incompatible-migrate', kind: 'migrate', skinId: skin.id, phase: 'done' }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click((await screen.findAllByRole('button', { name: '切换到 npm 来源' }))[0]!)
    fireEvent.click(screen.getByRole('button', { name: '确认切换到 npm 来源' }))
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/migrate') && init?.method === 'POST')).toBe(true))
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/migrate') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: skin.id })
  })
  it('installs on official Desktop before asking once for automatic activation', async () => {
    const incompatible = { ...managedDesktopSkin, compatibility: { dsh: '0.1.0-rc.6', platform: ['web', 'desktop'] } }
    let installed = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [incompatible] }
      if (url.endsWith('/state')) return { hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.0-rc.2' }, management: { ...officialManagement, installRequiresRestart: true }, skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }] : [] }
      if (url.endsWith('/install') && init?.method === 'POST') { installed = true; return { operationId: 'incompatible-desktop' } }
      if (url.endsWith('/operations/incompatible-desktop')) return { id: 'incompatible-desktop', kind: 'install', skinId: skin.id, phase: 'done', restartRequired: true }
      if (url.endsWith('/activate') && init?.method === 'POST') return { operationId: 'incompatible-desktop-activate' }
      if (url.endsWith('/operations/incompatible-desktop-activate')) return { id: 'incompatible-desktop-activate', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: true }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    const dialog = await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })
    expect(dialog.textContent).toContain(zh['common.compatibilityRiskLabel'])
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/install') && init?.method === 'POST')).toBe(true)
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: '仍然使用' }))
    expect(await screen.findByRole('dialog', { name: zh['common.restartManualTitle'] })).toBeTruthy()
    expect(screen.queryByText('测试皮肤 已切换，请手动重启 Desktop App 后生效')).toBeNull()
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/install') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: skin.id })
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: skin.id, acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(incompatible, { ...dshRuntime, version: '0.2.0-rc.2' }) })
  })
  it.each(['unmount', 'profile-busy'])('does not start an incompatible activation if %s interrupts its confirmation', async interruption => {
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    let profileBusy = false
    const fetchMock = stubMarketFetch(async (url: string, _init?: RequestInit) => (url.endsWith('/catalog') ? { skins: [incompatible] } : url.endsWith('/state') ? { skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }], runtime: dshRuntime, ...(profileBusy && { profileBusy: '当前 profile 正在等待宿主确认' }) } : {}))
    const view = render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    const dialog = await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })
    if (interruption === 'unmount') {
      view.unmount()
      await act(async () => undefined)
    } else {
      profileBusy = true
      fireEvent.focus(window)
      await waitFor(() => expect(screen.getByRole('button', { name: '使用' }).hasAttribute('disabled')).toBe(true))
      fireEvent.click(within(dialog).getByRole('button', { name: '仍然使用' }))
      expect(await screen.findByRole('alert')).toHaveProperty('textContent', '当前 profile 正在等待宿主确认')
    }
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
  it.each(['catalog', 'compatible'])('refreshes a pending warning after a %s change and requires another confirmation', async changed => {
    const original = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    const updated = { ...original, install: { ...skin.install, version: '2.0.0', commit: 'b'.repeat(40), target: `https://github.com/a/b.git#${'b'.repeat(40)}` }, compatibility: { ...original.compatibility, dsh: changed === 'compatible' ? '>=0.1.0-rc.6' : '<0.0.9' } }
    let currentSkin = original
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [currentSkin] }
      if (url.endsWith('/state')) return { skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }], runtime: dshRuntime }
      if (url.endsWith('/activate') && init?.method === 'POST') return { operationId: 'refreshed-install' }
      if (url.endsWith('/operations/refreshed-install')) return { id: 'refreshed-install', kind: 'activate', skinId: skin.id, phase: 'done' }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    const warning = await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })
    expect(warning.textContent).toContain('版本 1.0.0')
    const originalContext = compatibilityContext(original, dshRuntime)

    currentSkin = updated
    fireEvent.focus(window)
    await waitFor(() => expect(screen.getByRole('dialog', { name: zh['common.skinDetails'] }).textContent).toContain('版本 2.0.0'))
    fireEvent.click(within(warning).getByRole('button', { name: /(?:仍然|确认)使用/ }))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    expect(warning.textContent).toContain('皮肤或运行环境已变化，请重新确认')
    expect(warning.textContent).toContain('版本 2.0.0')
    fireEvent.click(within(warning).getByRole('button', { name: /(?:仍然|确认)使用/ }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toHaveLength(1))
    const request = JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')?.[1]?.body))
    expect(request).toEqual({ skinId: skin.id, acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(currentSkin, dshRuntime) })
    expect(request.compatibilityContext).not.toBe(originalContext)
  })
  it('uses the refreshed package for its only confirmation after installation', async () => {
    const original = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    const updated = { ...original, install: { ...skin.install, version: '2.0.0', commit: 'b'.repeat(40), target: `https://github.com/a/b.git#${'b'.repeat(40)}` }, compatibility: { ...original.compatibility, dsh: '<0.0.9' } }
    let installed = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [installed ? updated : original] }
      if (url.endsWith('/state')) return { runtime: dshRuntime, skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: true }] : [] }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'changed-before-use-install' }
      if (url.endsWith('/operations/changed-before-use-install')) {
        installed = true
        return { id: 'changed-before-use-install', kind: 'install', skinId: skin.id, phase: 'done' }
      }
      if (url.endsWith('/activate') && init?.method === 'POST') return { operationId: 'changed-before-use-activate' }
      if (url.endsWith('/operations/changed-before-use-activate')) return { id: 'changed-before-use-activate', kind: 'activate', skinId: skin.id, phase: 'done' }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: zh['common.installAndUse'] }))
    const useConfirmation = await screen.findByRole('button', { name: '仍然使用' })
    expect(screen.getByRole('dialog', { name: zh['common.switchConfirmation'] }).textContent).toContain('版本 2.0.0')
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toBe(false)
    fireEvent.click(useConfirmation)
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toBe(true))
    const installRequest = JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/install') && init?.method === 'POST')?.[1]?.body))
    const activateRequest = JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')?.[1]?.body))
    expect(installRequest.compatibilityContext).toBeUndefined()
    expect(activateRequest.compatibilityContext).toBe(compatibilityContext(updated, dshRuntime))
    expect(activateRequest.compatibilityContext).not.toBe(installRequest.compatibilityContext)
  })
  it('still installs when runtime version is unknown', async () => {
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [] }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'op-unknown' }
      if (url.endsWith('/operations/op-unknown')) return { id: 'op-unknown', kind: 'install', skinId: skin.id, phase: 'done' }
      if (url.endsWith('/activate') && init?.method === 'POST') return { operationId: 'op-activate' }
      if (url.endsWith('/operations/op-activate')) return { id: 'op-activate', kind: 'activate', skinId: skin.id, phase: 'done' }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: zh['common.installAndUse'] }))
    expect(screen.queryByRole('button', { name: zh['common.confirmRestart'] })).toBeNull()
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(true))
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '安装已阻止' })).toBeNull()
  })
  it('offers a prompt and a single executable command for manual Web installation', async () => {
    const manual = { ...skin, review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'manual-only' as const } }
    const writeText = vi.fn(async () => undefined)
    const open = vi.fn()
    Object.assign(navigator, { clipboard: { writeText } })
    vi.stubGlobal('open', open)
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [manual] } : { skins: [] }))
    render(<SkinMarketSection t={key => key} />)

    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: zh['common.otherInstallMethods'] }))
    const dialog = await screen.findByRole('dialog', { name: '安装 测试皮肤' })
    expect(dialog.textContent).toContain('提示词')
    expect(dialog.textContent).toContain('命令')
    expect(dialog.textContent).not.toContain('也可自行打开「插件 → 添加插件」，输入：')
    expect(dialog.textContent).not.toContain('该皮肤需要 Agent 协助安装')
    expect(screen.getByRole('button', { name: '复制命令' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '复制提示词' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull()
    expect((screen.getByRole('textbox', { name: zh['common.packageName'] }) as HTMLInputElement).value).toBe(manual.install.target)
    expect(screen.queryByRole('button', { name: '打开安装页面' })).toBeNull()
    expect(open).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '复制命令' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(createSkinInstallCommands(manual)[0]!.value))
    const copyPrompt = screen.getAllByRole('button', { name: '复制提示词' }).at(-1)!
    fireEvent.click(copyPrompt)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(createSkinInstallPrompt(manual, 'dsh')))
  })
  it('explains the Desktop manual-only reason before offering the plugin keyword', async () => {
    const manual = {
      ...skin,
      install: { ...skin.install, desktop: { mode: 'manual-only' as const, reason: 'npm-package-not-found' } },
      review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'manual-only' as const },
    }
    const fetchMock = stubMarketFetch(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog')
        ? { skins: [manual] }
        : { hostKind: 'desktop', skins: [] },
    }))
    const writeText = vi.fn(async () => undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    await waitFor(() => expect(dialog.textContent).toContain('无法自动安装：未找到可供 Desktop 安装的 npm 包'))
    expect(dialog.textContent).toContain(zh['common.packageName'])
    expect(dialog.textContent).toContain(zh['common.openAddPlugin'])
    expect(dialog.textContent).toContain('宿主提供插件管理工具时可由 Agent 确认目标后安装')
    expect(screen.getByRole('textbox', { name: zh['common.packageName'] })).toHaveProperty('value', createSkinInstallInputs(manual)[0]!.value)
    expect(screen.queryByRole('button', { name: '复制命令' })).toBeNull()
    expect([...dialog.querySelectorAll('code')].map(node => node.textContent)).toEqual([createSkinInstallPrompt(manual, 'desktop')])
    expect(dialog.textContent).not.toContain('dsh plugin --profile web')
    fireEvent.click(within(dialog).getByRole('button', { name: '复制提示词' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(createSkinInstallPrompt(manual, 'desktop')))
    expect(dialog.textContent).not.toContain('手动安装路径')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(false)
  })
  it('warns before installing an unreviewed Desktop GitHub fallback', async () => {
    const manual: CatalogSkin = {
      ...skin,
      repo: 'https://github.com/a/b',
      install: { target: `github:a/b#${'a'.repeat(40)}`, commit: 'a'.repeat(40), version: '1.0.0', desktop: { mode: 'manual-only', reason: 'npm-package-not-found' } },
      review: { compatibility: 'verified', preview: 'verified', installation: 'manual-only' },
      health: {
        status: 'improvements' as const,
        checks: { readmeScreenshots: 'pass' as const, compatibility: 'pass' as const, installation: 'improve' as const },
        suggestions: [],
        scan: {
          commit: 'a'.repeat(40), packageVersion: '1.0.0', scannerVersion: 'static-v2', mode: 'static' as const,
          result: 'unknown' as const, checkedAt: '2026-11-08T00:00:00.000Z',
          findings: [{ code: 'client-source-unavailable', message: '无法读取固定版本的 client 入口，静态扫描结果未知。' }],
        },
      },
    }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [manual] }
      if (url.endsWith('/state')) return { hostKind: 'desktop', management: officialManagement, runtime: dshRuntime, skins: [] }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'desktop-warned-install' }
      if (url.endsWith('/operations/desktop-warned-install')) return { id: 'desktop-warned-install', kind: 'install', skinId: manual.id, phase: 'done' }
      if (url.endsWith('/activate') && init?.method === 'POST') return { operationId: 'desktop-warned-activate' }
      if (url.endsWith('/operations/desktop-warned-activate')) return { id: 'desktop-warned-activate', kind: 'activate', skinId: manual.id, phase: 'done' }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)

    await openSkinCard()
    fireEvent.click(within(screen.getByRole('main', { name: zh['common.detailContent'] })).getByRole('button', { name: '安装' }))
    const dialog = await screen.findByRole('dialog', { name: zh['common.installationUnverifiedTitle'] })
    expect(screen.getByRole('dialog', { name: zh['common.skinDetails'] })).toBeTruthy()
    expect(dialog.textContent).toContain('固定版本的仓库没有提交可读取的客户端入口')
    expect(dialog.textContent).toContain(manual.install.target)
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(false)

    fireEvent.click(within(dialog).getByRole('button', { name: zh['common.stillInstall'] }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/install') && init?.method === 'POST')).toBe(true))
  })
  it('installs a reviewed GitHub Desktop skin without requiring an npm publication', async () => {
    const github: CatalogSkin = {
      ...managedDesktopSkin,
      review: { compatibility: 'verified', preview: 'verified', installation: 'verified' },
      install: { target: `github:a/b#${'a'.repeat(40)}&path:/packages/skin`, commit: 'a'.repeat(40), version: '1.0.0', desktop: { mode: 'manual-only', reason: 'npm-package-not-found' } },
      subpath: 'packages/skin',
    }
    let installed = false
    let active = false
    const open = vi.fn()
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [github] }
      if (url.endsWith('/state')) return {
        hostKind: 'desktop', runtime: { ...dshRuntime, version: '0.2.1-alpha.3' }, management: officialManagement,
        skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: active ? 'active' : 'inactive', installedVersion: '1.0.0', updateAvailable: false }] : [],
      }
      if (url.endsWith('/market-update')) return { updateAvailable: false }
      if (url.endsWith('/install') && init?.method === 'POST') { installed = true; return { operationId: 'github-install' } }
      if (url.endsWith('/activate') && init?.method === 'POST') { active = true; return { operationId: 'github-activate' } }
      if (url.endsWith('/operations/github-install')) return { id: 'github-install', kind: 'install', skinId: skin.id, phase: 'done' }
      if (url.endsWith('/operations/github-activate')) return { id: 'github-activate', kind: 'activate', skinId: skin.id, phase: 'done' }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} desktopPluginPanel={{ available: () => true, open }} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toBe(true))
    expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/install') && init?.method === 'POST')).toHaveLength(1)
    expect(open).not.toHaveBeenCalled()
    expect(await screen.findAllByRole('button', { name: '停用' })).not.toHaveLength(0)
  })
  it('keeps the detail open with progress until the manual Desktop panel is ready', async () => {
    const manual: CatalogSkin = {
      ...skin,
      install: { ...skin.install, target: `github:a/b#${'a'.repeat(40)}`, commit: 'a'.repeat(40), desktop: { mode: 'manual-only', reason: 'npm-package-not-found' }, allowBuild: 'github:a/b#path:packages/skin' },
      review: { compatibility: 'verified', preview: 'verified', installation: 'verified' },
    }
    let resolveOpen: ((value: { ok: true; kind: 'prefilled' }) => void) | undefined
    const open = vi.fn(() => new Promise<{ ok: true; kind: 'prefilled' }>(resolve => { resolveOpen = resolve }))
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog')
      ? { skins: [manual] }
      : { hostKind: 'desktop', runtime: dshRuntime, management: officialManagement, skins: [] }))
    render(<SkinMarketSection t={key => key} desktopPluginPanel={{ available: () => true, open }} />)

    await openSkinCard()
    fireEvent.click(within(screen.getByRole('main', { name: zh['common.detailContent'] })).getByRole('button', { name: '安装' }))
    expect(screen.getByRole('button', { name: zh['common.openingInstallPanel'] })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: zh['common.skinDetails'] })).toBeTruthy()
    resolveOpen?.({ ok: true, kind: 'prefilled' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: zh['common.skinDetails'] })).toBeNull())
  })
  it('prefers the pinned npm release when handing a manual Desktop skin to the panel', async () => {
    const manual: CatalogSkin = {
      ...skin,
      install: {
        ...skin.install,
        target: `github:a/b#${'a'.repeat(40)}`,
        desktop: { mode: 'manual-only', reason: '当前仅完成固定版本的公开展示/DSH Web 隔离验收；Desktop 安装路径尚未单独核验。' },
        npm: {
          name: 'skin', version: '1.0.0',
          integrity: 'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
          repository: 'https://github.com/a/b', gitHead: 'a'.repeat(40),
        },
      },
      review: { compatibility: 'verified', preview: 'verified', installation: 'manual-only' },
    }
    const open = vi.fn(async (_spec: string) => ({ ok: true as const, kind: 'prefilled' as const }))
    const fetchMock = stubMarketFetch(async (url: string) => (url.endsWith('/catalog')
      ? { skins: [manual] }
      : { hostKind: 'desktop', runtime: dshRuntime, management: officialManagement, skins: [] }))
    render(<SkinMarketSection t={key => key} desktopPluginPanel={{ available: () => true, open }} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith('skin@1.0.0', { skinId: manual.id, packageName: manual.package }))
  })
  it.each(['prefilled', 'resumed', 'unavailable'] as const)('hands a manual Desktop target to the official panel (%s)', async outcome => {
    const target = `github:a/b#${'a'.repeat(40)}&path:/packages/skin`
    const manual: CatalogSkin = {
      ...skin, subpath: 'packages/skin',
      install: { ...skin.install, target, allowBuild: 'github:a/b#path:packages/skin', desktop: { mode: 'manual-only', reason: 'npm-package-not-found' } },
      review: { compatibility: 'verified', preview: 'verified', installation: 'verified' },
    }
    const open = vi.fn(async (_spec: string) => outcome === 'unavailable'
      ? { ok: false as const, reason: '插件列表加载失败，请复制目标。' }
      : { ok: true as const, kind: outcome })
    const fetchMock = stubMarketFetch(async (url: string) => (url.endsWith('/catalog')
      ? { skins: [manual] }
      : { hostKind: 'desktop', runtime: dshRuntime, management: officialManagement, skins: [] }))
    render(<SkinMarketSection t={key => key} desktopPluginPanel={{ available: () => true, open }} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith(target, { skinId: manual.id, packageName: manual.package }))
    if (outcome === 'unavailable') {
      expect((await screen.findByRole('alert')).textContent).toContain('插件列表加载失败')
    }
    expect(screen.queryByRole('dialog', { name: '安装 测试皮肤' })).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(false)
  })
  it('refreshes native installation changes without activating an install-only target', async () => {
    let installed = false
    let notify!: () => void
    const takeActivationIntent = vi.fn(() => null)
    const fetchMock = stubMarketFetch(async (url: string) => (url.endsWith('/catalog')
      ? { skins: [managedDesktopSkin] }
      : { hostKind: 'desktop', runtime: dshRuntime, management: officialManagement,
        skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }] : [] }))
    render(<SkinMarketSection t={key => key} desktopPluginPanel={{ available: () => true, open: vi.fn(), takeActivationIntent,
      observe: listener => { notify = listener; return () => undefined } }} />)
    await screen.findByRole('button', { name: '安装' })
    installed = true
    act(() => notify())
    expect(await screen.findAllByRole('button', { name: '使用' })).not.toHaveLength(0)
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(false)
  })
  it.each([true, false])('continues a native enable intent after remount through the existing confirmation (accept=%s)', async accept => {
    window.localStorage.removeItem('dsh-skin-market:activation-warning-accepted')
    let active = false
    const intent = { skinId: skin.id, packageName: skin.package, spec: managedDesktopSkin.install.target, requestId: 'native-request' }
    const takeActivationIntent = vi.fn().mockReturnValueOnce(intent).mockReturnValue(null)
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [managedDesktopSkin] }
      if (url.endsWith('/state')) return { hostKind: 'desktop', runtime: dshRuntime, management: officialManagement,
        skins: [{ skinId: skin.id, installation: 'installed', activation: active ? 'active' : 'inactive', installedVersion: '1.0.0', updateAvailable: false }] }
      if (url.endsWith('/market-update')) return { updateAvailable: false }
      if (url.endsWith('/activate') && init?.method === 'POST') { active = true; return { operationId: 'native-activate' } }
      if (url.endsWith('/operations/native-activate')) return { id: 'native-activate', kind: 'activate', skinId: skin.id, phase: 'done' }
      throw new Error(`Unexpected request: ${url}`)
    })
    let notify!: () => void
    render(<SkinMarketSection t={key => key} desktopPluginPanel={{ available: () => true, open: vi.fn(), takeActivationIntent,
      observe: listener => { notify = listener; return () => undefined } }} />)
    const dialog = await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: accept ? '确认使用' : '取消' }))
    if (accept) expect(await screen.findAllByRole('button', { name: '停用' })).not.toHaveLength(0)
    act(() => notify())
    await waitFor(() => expect(takeActivationIntent.mock.calls.length).toBeGreaterThan(1))
    expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toHaveLength(accept ? 1 : 0)
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
  })
  it('returns an unhandled native enable intent when leaving its confirmation', async () => {
    window.localStorage.removeItem('dsh-skin-market:activation-warning-accepted')
    const intent = { skinId: skin.id, packageName: skin.package, spec: managedDesktopSkin.install.target, requestId: 'native-unmount' }
    let pending: typeof intent | null = intent
    const restoreActivationIntent = vi.fn((value: typeof intent) => { pending = value })
    const panel = { available: () => true, open: vi.fn(), observe: () => () => undefined,
      takeActivationIntent: () => { const value = pending; pending = null; return value }, restoreActivationIntent }
    const fetchMock = stubMarketFetch(async (url: string) => (url.endsWith('/catalog')
      ? { skins: [managedDesktopSkin] }
      : { hostKind: 'desktop', runtime: dshRuntime, management: officialManagement,
        skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }] }))
    const first = render(<SkinMarketSection t={key => key} desktopPluginPanel={panel} />)
    await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })
    first.unmount()
    expect(restoreActivationIntent).toHaveBeenCalledOnce()
    render(<SkinMarketSection t={key => key} desktopPluginPanel={panel} />)
    fireEvent.click(within(await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })).getByRole('button', { name: '取消' }))
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(false)
    expect(restoreActivationIntent).toHaveBeenCalledOnce()
  })
  it('does not consume a new native enable intent with an older pending state response', async () => {
    const intent = { skinId: skin.id, packageName: skin.package, spec: managedDesktopSkin.install.target, requestId: 'native-race' }
    let pending: typeof intent | null = null
    let notify!: () => void
    let installed = false
    let hold = false
    let release!: (value: unknown) => void
    const state = () => ({ hostKind: 'desktop', runtime: dshRuntime, management: officialManagement,
      skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }] : [] })
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [managedDesktopSkin] }
      if (url.endsWith('/state')) {
        const snapshot = state()
        if (hold) { hold = false; return await new Promise(resolve => { release = resolve }) }
        return snapshot
      }
      if (url.endsWith('/activate') && init?.method === 'POST') return { operationId: 'native-race-activate' }
      if (url.endsWith('/operations/native-race-activate')) return { id: 'native-race-activate', kind: 'activate', skinId: skin.id, phase: 'done' }
      return { updateAvailable: false }
    })
    const takeActivationIntent = vi.fn(() => { const value = pending; pending = null; return value })
    render(<SkinMarketSection t={key => key} desktopPluginPanel={{ available: () => true, open: vi.fn(), takeActivationIntent,
      observe: listener => { notify = listener; return () => undefined } }} />)
    await screen.findByRole('button', { name: '安装' })
    await waitFor(() => expect(takeActivationIntent).toHaveBeenCalled())
    hold = true
    act(() => notify())
    await waitFor(() => expect(release).toBeTypeOf('function'))
    installed = true
    pending = intent
    act(() => notify())
    await act(async () => release({ ok: true, json: async () => ({ ...state(), skins: [] }) }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toHaveLength(1))
    expect(screen.queryByText('原生安装目标已变化，请重新选择皮肤使用。')).toBeNull()
  })
  it.each([
    ['active', '使用中'], ['missing', '待重启'], ['failed', '未生效'],
  ] as const)('checks the browser client module before displaying a natively active skin (%s)', async (phase, label) => {
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog')
      ? { skins: [managedDesktopSkin] }
      : { hostKind: 'desktop', restartAvailable: false, runtime: dshRuntime, management: officialManagement,
        skins: [{ skinId: skin.id, installation: 'installed', activation: 'active', clientModule: true, installedVersion: '1.0.0', updateAvailable: false }] }))
    const probeActive = vi.fn(() => phase)
    render(<SkinMarketSection t={key => key} clientRuntime={{ setActive: vi.fn(), probeActive }} />)
    expect(await screen.findAllByText(label, { exact: true })).not.toHaveLength(0)
    expect(probeActive).toHaveBeenCalledWith(skin.package)
    if (phase !== 'active') expect(screen.queryByText('使用中', { exact: true })).toBeNull()
  })
  it('preserves the original manual Desktop panel without a second installation shortcut', async () => {
    const main = `github:a/b#${'a'.repeat(40)}&path:/packages/skin`
    const companion = `github:a/b#${'a'.repeat(40)}&path:/packages/manager`
    const manual: CatalogSkin = {
      ...skin, subpath: 'packages/skin',
      install: { ...skin.install, target: main, companions: [{ package: 'manager', rowId: 'manager', target: companion, commit: 'a'.repeat(40), version: '1.0.0' }] },
      review: { compatibility: 'verified', preview: 'verified', installation: 'verified' },
    }
    const open = vi.fn(async (_spec: string) => ({ ok: true as const, kind: 'prefilled' as const }))
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog')
      ? { skins: [manual] }
      : { hostKind: 'desktop', runtime: dshRuntime, management: officialManagement, skins: [] }))
    render(<SkinMarketSection t={key => key} desktopPluginPanel={{ available: () => true, open }} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: zh['common.otherInstallMethods'] }))
    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    expect(within(dialog).getByRole('textbox', { name: zh['common.packageName'] })).toHaveProperty('value', main)
    expect(dialog.querySelector('code')?.textContent).toContain(companion)
    expect(within(dialog).getByRole('button', { name: '复制插件包名' })).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: '安装' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '打开添加插件' })).toBeNull()
    expect(open).not.toHaveBeenCalled()
  })
})
