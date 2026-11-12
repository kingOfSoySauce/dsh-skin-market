// Client market tests: artifact, release-age, compatibility and build approvals
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => (await import('../fixtures/client-market.tsx')).createPrimitivesMock())

import { SkinMarketSection } from '../../src/client/SkinMarketSection.tsx'
import { compatibilityContext } from '../../src/compatibility.ts'
import type { Operation } from '../../src/client/types.ts'
import { requestCount, requestSent, stubMarketFetch } from '../fixtures/market-host.ts'
import { artifactRiskOperation, dshRuntime, incompatibleSkin, openSkinCard, registerMarketTestDom, skin, zh } from '../fixtures/client-market.tsx'

registerMarketTestDom()

describe('client market approvals', () => {
  it('allows only the displayed exact version then asks for use risks only after release-age approval completes installation', async () => {
    const incompatible = incompatibleSkin
    let retryRequests = 0
    let activateRequests = 0
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [incompatible] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'install-age-source' }
      if (url.endsWith('/operations/install-age-source')) return { id: 'install-age-source', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), failure: {
        kind: 'release-age', message: '新包保护拦住市场版本', action: 'approve-release-age', releaseAgeTarget: { packageName: 'dsh-skin-market', version: '0.1.61' },
      } }
      if (url.endsWith('/operations/install-age-source/retry') && init?.method === 'POST') {
        retryRequests += 1
        expect(JSON.parse(String(init.body))).toEqual({ action: 'approve-release-age' })
        return { operationId: 'install-age-approved' }
      }
      if (url.endsWith('/operations/install-age-approved')) return { id: 'install-age-approved', kind: 'install', skinId: skin.id, phase: 'done' }
      if (url.endsWith('/activate') && init?.method === 'POST') {
        activateRequests += 1
        return { operationId: 'activate-age-approved' }
      }
      if (url.endsWith('/operations/activate-age-approved')) return { id: 'activate-age-approved', kind: 'activate', skinId: skin.id, phase: 'done' }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: zh['common.installAndUse'] }))
    const dialog = await screen.findByRole('dialog', { name: '安装需要允许新版本' })
    expect(dialog.textContent).toContain('dsh-skin-market@0.1.61')
    expect(dialog.textContent).not.toContain('skin@1.0.0')
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    expect(retryRequests).toBe(0)
    const approval = within(dialog).getByRole('button', { name: '允许并继续' })
    fireEvent.click(approval)
    fireEvent.click(approval)
    await waitFor(() => expect(retryRequests).toBe(1))
    fireEvent.click(within(await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })).getByRole('button', { name: '仍然使用' }))
    await waitFor(() => expect(activateRequests).toBe(1))
    expect(screen.queryByRole('dialog', { name: '安装需要允许新版本' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
  })
  it.each(['install-and-use', 'activate', 'pin'] as const)('combines artifact, compatibility, and first-use risks once when %s reaches use', async mode => {
    window.localStorage.removeItem('dsh-skin-market:activation-warning-accepted')
    const incompatible = incompatibleSkin
    const risk = artifactRiskOperation().failure!.artifactRisk!
    let installed = mode !== 'install-and-use'
    let used = false
    const kind = mode === 'pin' ? 'pin' : 'activate'
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [incompatible] }
      if (url.endsWith('/state')) return { runtime: dshRuntime, skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false, ...(!used && { artifactRisk: risk }) }] : [] }
      if (url.endsWith('/install') && init?.method === 'POST') {
        installed = true
        expect(JSON.parse(String(init.body))).toEqual({ skinId: skin.id })
        return { operationId: 'merged-install' }
      }
      if (url.endsWith('/operations/merged-install')) return { id: 'merged-install', kind: 'install', skinId: skin.id, phase: 'done' }
      if (url.endsWith(`/${kind}`) && init?.method === 'POST') {
        used = true
        expect(JSON.parse(String(init.body))).toEqual({ skinId: skin.id, acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(incompatible, dshRuntime), artifactContext: risk.context })
        return { operationId: 'merged-use' }
      }
      if (url.endsWith('/operations/merged-use')) return { id: 'merged-use', kind, skinId: skin.id, phase: 'done' }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: mode === 'install-and-use' ? zh['common.installAndUse'] : mode === 'pin' ? '设为常驻' : '使用' }))
    let dialog = await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })
    expect(dialog.textContent).toContain(zh['common.installPackageUnverified'])
    expect(dialog.textContent).not.toContain('SRI')
    expect(dialog.querySelector('ul, ol, code, a, details')).toBeNull()
    expect(dialog.textContent).toContain(zh['common.compatibilityRiskLabel'])
    if (mode === 'pin') {
      expect(dialog.textContent).toContain(zh['common.pinRisk'])
      expect(dialog.textContent).not.toContain('使用后将停用其他普通皮肤')
    } else expect(dialog.textContent).toContain(zh['common.firstUseRisk'])
    expect(dialog.textContent).not.toContain(risk.context)
    expect(requestSent(fetchMock, `/${kind}`)).toBe(false)
    expect(screen.queryByRole('dialog', { name: '设为常驻此皮肤' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '安装需要确认安装包风险' })).toBeNull()
    if (mode !== 'install-and-use') {
      fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
      expect(requestSent(fetchMock, `/${kind}`)).toBe(false)
      expect(window.localStorage.getItem('dsh-skin-market:activation-warning-accepted')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: mode === 'pin' ? '设为常驻' : '使用' }))
      dialog = await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })
    }
    const accept = within(dialog).getByRole('button', { name: mode === 'pin' ? '仍然设为常驻' : '仍然使用' })
    fireEvent.click(accept)
    fireEvent.click(accept)
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith(`/${kind}`))).toHaveLength(1))
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
  })
  it('refreshes a changed artifact in the pending use dialog before sending its new context', async () => {
    let risk = artifactRiskOperation().failure!.artifactRisk!
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false, artifactRisk: risk }] }
      if (url.endsWith('/activate') && init?.method === 'POST') return { operationId: 'changed-risk-use' }
      if (url.endsWith('/operations/changed-risk-use')) return { id: 'changed-risk-use', kind: 'activate', skinId: skin.id, phase: 'done' }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    const dialog = await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })
    risk = { ...risk, context: 'changed-artifact-context', warnings: ['新构件缺少可核对的 SRI'] }
    const requests = requestCount(fetchMock, '/state')
    fireEvent.focus(window)
    await waitFor(() => expect(requestCount(fetchMock, '/state')).toBeGreaterThan(requests))
    fireEvent.click(within(dialog).getByRole('button', { name: '仍然使用' }))
    expect(dialog.textContent).toContain(zh['common.confirmationChanged'])
    expect(dialog.textContent).toContain(zh['common.installPackageUnverified'])
    expect(dialog.textContent).not.toContain('SRI')
    expect(requestSent(fetchMock, '/activate')).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: '仍然使用' }))
    await waitFor(() => expect(requestSent(fetchMock, '/activate')).toBe(true))
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url]) => url.endsWith('/activate'))?.[1]?.body)).artifactContext).toBe('changed-artifact-context')
  })
  it('does not ask about an accepted unchanged artifact again after refreshed state removes its risk', async () => {
    const risk = artifactRiskOperation().failure!.artifactRisk!
    let accepted = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false, ...(!accepted && { artifactRisk: risk }) }] }
      if (url.endsWith('/activate') && init?.method === 'POST') { accepted = true; return { operationId: 'accepted-use' } }
      if (url.endsWith('/operations/accepted-use')) return { id: 'accepted-use', kind: 'activate', skinId: skin.id, phase: 'done' }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })).getByRole('button', { name: '仍然使用' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '使用' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/activate'))).toHaveLength(2))
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
    expect(JSON.parse(String(fetchMock.mock.calls.filter(([url]) => url.endsWith('/activate'))[1]?.[1]?.body))).toEqual({ skinId: skin.id })
  })
  it.each(['取消', '关闭'])('keeps artifact risk approval explicit and makes %s leave the install unchanged', async closeLabel => {
    const operation = artifactRiskOperation()
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => (url.endsWith('/catalog') ? { skins: [skin] } : url.endsWith('/state') ? { skins: [], runtime: dshRuntime } : url.endsWith('/install') && init?.method === 'POST' ? { operationId: operation.id } : url.endsWith(`/operations/${operation.id}`) ? operation : {}))
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: zh['common.installAndUse'] }))
    const dialog = await screen.findByRole('dialog', { name: '安装需要确认安装包风险' })
    expect(dialog.textContent).toContain('测试皮肤（版本 1.0.0）')
    expect(dialog.textContent).toContain(zh['common.installPackageUnverified'])
    expect(dialog.textContent).not.toContain('SRI')
    expect(dialog.querySelector('ul, ol, code, a, details')).toBeNull()
    expect(dialog.textContent).not.toContain('actual-artifact-context')
    expect(within(dialog).getByRole('button', { name: '仍然继续' })).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    expect(requestSent(fetchMock, '/retry')).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: closeLabel }))
    expect(screen.queryByRole('dialog', { name: '安装需要确认安装包风险' })).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/retry') || url.endsWith('/activate'))).toBe(false)
  })
  it('approves only on an explicit artifact risk click, prevents duplicate requests, and preserves compatibility and install-and-use', async () => {
    const incompatible = incompatibleSkin
    const operation = artifactRiskOperation()
    let retryRequests = 0
    let activateRequests = 0
    let finishRetry!: () => void
    const retryGate = new Promise<void>(resolve => { finishRetry = resolve })
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [incompatible] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: operation.id }
      if (url.endsWith(`/operations/${operation.id}`)) return operation
      if (url.endsWith(`/operations/${operation.id}/retry`) && init?.method === 'POST') {
        retryRequests += 1
        expect(JSON.parse(String(init.body))).toEqual({ action: 'approve-artifact', acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(incompatible, dshRuntime) })
        await retryGate
        return { operationId: 'artifact-approved' }
      }
      if (url.endsWith('/operations/artifact-approved')) return { id: 'artifact-approved', kind: 'install', skinId: skin.id, phase: 'done' }
      if (url.endsWith('/activate') && init?.method === 'POST') {
        activateRequests += 1
        expect(JSON.parse(String(init.body))).toEqual({ skinId: skin.id, acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(incompatible, dshRuntime) })
        return { operationId: 'artifact-approved-activate' }
      }
      if (url.endsWith('/operations/artifact-approved-activate')) return { id: 'artifact-approved-activate', kind: 'activate', skinId: skin.id, phase: 'done' }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: zh['common.installAndUse'] }))
    const dialog = await screen.findByRole('dialog', { name: '安装需要确认安装包风险' })
    expect(retryRequests).toBe(0)
    const approval = within(dialog).getByRole('button', { name: '仍然继续' })
    fireEvent.click(approval)
    fireEvent.click(approval)
    await waitFor(() => expect(retryRequests).toBe(1))
    expect(within(dialog).getByRole('button', { name: '处理中…' }).hasAttribute('disabled')).toBe(true)
    expect(within(dialog).getByRole('button', { name: '取消' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭' }))
    expect(screen.getByRole('dialog', { name: '安装需要确认安装包风险' })).toBeTruthy()
    await act(async () => { finishRetry() })
    await waitFor(() => expect(activateRequests).toBe(1))
    expect(screen.queryByRole('dialog', { name: '安装需要确认安装包风险' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
  })
  it('keeps a rejected artifact approval in the same dialog with the changed-context error', async () => {
    const operation = artifactRiskOperation()
    let retries = 0
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: operation.id }
      if (url.endsWith(`/operations/${operation.id}`)) return operation
      if (url.endsWith(`/operations/${operation.id}/retry`) && init?.method === 'POST') {
        retries += 1
        return { ok: false, status: 409, json: async () => ({ error: '实际构件已变化，请重新操作后确认风险' }) }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: zh['common.installAndUse'] }))
    const dialog = await screen.findByRole('dialog', { name: '安装需要确认安装包风险' })
    fireEvent.click(within(dialog).getByRole('button', { name: '仍然继续' }))
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toBe(zh['common.installNotAuthorized']))
    expect(dialog.textContent).not.toContain('实际构件已变化')
    expect(retries).toBe(1)
    expect(screen.getByRole('dialog', { name: '安装需要确认安装包风险' })).toBe(dialog)
    expect(within(dialog).getByRole('button', { name: '仍然继续' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog', { name: '安装需要确认安装包风险' })).toBeNull()
  })
  it('lets users decline a release-age exception without silently retrying', async () => {
    const failedOperation = { id: 'declined-age', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), failure: {
      kind: 'release-age', message: '新包保护', action: 'approve-release-age', releaseAgeTarget: { packageName: '@example/dependency', version: '2.3.4' },
    } }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => (url.endsWith('/catalog') ? { skins: [skin] } : url.endsWith('/state') ? { skins: [], runtime: dshRuntime } : url.endsWith('/install') && init?.method === 'POST' ? { operationId: failedOperation.id } : url.endsWith('/operations/declined-age') ? failedOperation : {}))
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: zh['common.installAndUse'] }))
    const dialog = await screen.findByRole('dialog', { name: '安装需要允许新版本' })
    expect(dialog.textContent).toContain('@example/dependency@2.3.4')
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog', { name: '安装需要允许新版本' })).toBeNull()
    expect(requestSent(fetchMock, '/retry')).toBe(false)
  })
  it.each(['install', 'update', 'activate', 'pin'] as const)('acknowledges a Host compatibility rejection during %s without offering or issuing a retry', async kind => {
    const target = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    const hostRuntime = { ...dshRuntime, version: '0.2.0-rc.2' }
    const id = `host-compatibility-rejected-${kind}`
    const operation: Operation = { id, kind, skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), failure: {
      kind: 'compatibility', code: 'incompatible-version', message: 'Host rejected incompatible plugin peers',
    } }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [target] }
      if (url.endsWith('/state')) return { skins: kind === 'install' ? [] : [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: kind === 'update' ? '0.9.0' : '1.0.0', updateAvailable: kind === 'update' }], runtime: hostRuntime }
      if (url.endsWith('/market-update')) return { updateAvailable: false }
      if (url.endsWith(`/${kind}`) && init?.method === 'POST') return { operationId: id }
      if (url.endsWith(`/operations/${id}`)) return operation
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    const actionLabel = { install: '仅安装', update: '更新', activate: '使用', pin: '设为常驻' }[kind]
    fireEvent.click(screen.getByRole('button', { name: actionLabel }))
    if (kind === 'activate' || kind === 'pin') {
      const confirmation = await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })
      expect(confirmation.textContent).toContain(zh['common.compatibilityRiskLabel'])
      expect(requestSent(fetchMock, `/${kind}`)).toBe(false)
      fireEvent.click(within(confirmation).getByRole('button', { name: kind === 'pin' ? '仍然设为常驻' : '仍然使用' }))
    }
    const title = { install: '安装未完成', update: '更新未完成', activate: '启用未完成', pin: '设为常驻未完成' }[kind]
    const dialog = await screen.findByRole('dialog', { name: title })
    expect(dialog.textContent).toContain('未通过当前 DSH 的兼容检查')
    expect(within(dialog).getByRole('button', { name: '知道了' })).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: /重试|允许|仍然/ })).toBeNull()
    const actionRequest = JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith(`/${kind}`) && init?.method === 'POST')?.[1]?.body))
    expect(actionRequest).toEqual({ skinId: skin.id, ...((kind === 'activate' || kind === 'pin') && { acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(target, hostRuntime) }) })
    fireEvent.click(within(dialog).getByRole('button', { name: '知道了' }))
    expect(screen.queryByRole('dialog', { name: title })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    const stateRequests = requestCount(fetchMock, '/state')
    fireEvent.focus(window)
    await waitFor(() => expect(requestCount(fetchMock, '/state')).toBeGreaterThan(stateRequests))
    expect(screen.queryByRole('dialog', { name: title })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    expect(requestSent(fetchMock, '/retry')).toBe(false)
  })
  it('does not offer approval when the host cannot identify the exact blocked version', async () => {
    const operation = { id: 'unknown-age', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), failure: {
      kind: 'release-age', message: '新包保护拦截，未能确定具体版本，请复制日志反馈。', action: 'approve-release-age',
    } }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => (url.endsWith('/catalog') ? { skins: [skin] } : url.endsWith('/state') ? { skins: [], runtime: dshRuntime } : url.endsWith('/install') && init?.method === 'POST' ? { operationId: operation.id } : url.endsWith('/operations/unknown-age') ? operation : {}))
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: zh['common.installAndUse'] }))
    const dialog = await screen.findByRole('dialog', { name: '安装未完成' })
    expect(dialog.textContent).toContain('所需版本仍处于新包保护期。请等待保护期结束后重试。')
    expect(within(dialog).queryByRole('button', { name: '允许并继续' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    expect(requestSent(fetchMock, '/retry')).toBe(false)
  })
  it.each([
    { kind: 'update', action: 'approve-release-age', failureKind: 'release-age' },
    { kind: 'install', action: 'approve-build', failureKind: 'build-approval' },
  ] as const)('does not ask optional use confirmation during a $kind $action retry', async ({ kind, action, failureKind }) => {
    const incompatible = incompatibleSkin
    let retries = 0
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [incompatible] }
      if (url.endsWith('/state')) return { skins: kind === 'update' ? [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '0.9.0', updateAvailable: true }] : [], runtime: dshRuntime }
      if (url.endsWith(`/${kind}`) && init?.method === 'POST') return { operationId: 'compat-retry-source' }
      if (url.endsWith('/operations/compat-retry-source')) return { id: 'compat-retry-source', kind, skinId: skin.id, phase: 'failed', failure: { kind: failureKind, message: '需要允许', action, releaseAgeTarget: { packageName: 'dsh-skin-market', version: '0.1.61' } } }
      if (url.endsWith('/operations/compat-retry-source/retry')) {
        retries += 1
        expect(JSON.parse(String(init?.body))).toEqual({ action })
        return { operationId: 'compat-retry-target' }
      }
      if (url.endsWith('/operations/compat-retry-target')) return { id: 'compat-retry-target', kind, skinId: skin.id, phase: 'done' }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: kind === 'update' ? '更新' : '仅安装' }))
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: action === 'approve-build' ? zh['common.allowAndRetry'] : '允许并继续' }))
    await waitFor(() => expect(retries).toBe(1))
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
  })
  it.each(['packageName', 'buildKeys'] as const)('puts exact %s build approval in one concise confirmation body', async targetMode => {
    let operationRequests = 0
    let retryRequests = 0
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], operation: null, runtime: dshRuntime }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'install-build-approval' }
      if (url.endsWith('/operations/install-build-approval/retry') && init?.method === 'POST') {
        retryRequests += 1
        expect(JSON.parse(String(init.body))).toEqual({ action: 'approve-build' })
        return { operationId: 'install-build-approval-retry' }
      }
      if (url.endsWith('/operations/install-build-approval')) {
        operationRequests += 1
        return operationRequests === 1
          ? { id: 'install-build-approval', kind: 'install', skinId: skin.id, phase: 'downloading', startedAt: new Date().toISOString() }
          : { id: 'install-build-approval', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: '依赖 node-pty 等 2 个依赖包含被 pnpm 阻止的构建脚本；请批准后重试', failure: { kind: 'build-approval', message: '依赖 node-pty 等 2 个依赖包含被 pnpm 阻止的构建脚本；请批准后重试', packageName: 'node-pty', ...(targetMode === 'buildKeys' && { buildKeys: ['node-pty', '@fixture/native-helper'] }), action: 'approve-build' } }
      }
      if (url.endsWith('/operations/install-build-approval-retry')) return { id: 'install-build-approval-retry', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: '仍然失败', failure: { kind: 'build-approval', message: '仍然失败', packageName: 'node-pty', action: 'approve-build' } }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '仅安装' }))

    const dialog = await screen.findByRole('dialog', { name: zh['common.approveBuild'] })
    expect(dialog.textContent).toContain(`允许 ${targetMode === 'packageName' ? 'node-pty' : 'node-pty、@fixture/native-helper'} 运行本次安装脚本，然后继续安装。`)
    expect(dialog.querySelector('code, ul, ol, details')).toBeNull()
    expect(dialog.className).toContain('warningModal')
    expect(screen.queryByRole('button', { name: '批准构建并重试' })).toBeNull()
    expect(screen.getByRole('button', { name: zh['common.allowAndRetry'] })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh['common.allowAndRetry'] }))
    await waitFor(() => expect(retryRequests).toBe(1))
  })
  it('keeps the install-and-use intent after approving a build retry', async () => {
    let sourceRequests = 0
    let retryRequests = 0
    let activateRequests = 0
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], operation: null, runtime: dshRuntime }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'install-intent-source' }
      if (url.endsWith('/activate') && init?.method === 'POST') {
        activateRequests += 1
        return { operationId: 'activate-after-approval' }
      }
      if (url.endsWith('/operations/install-intent-source/retry') && init?.method === 'POST') {
        retryRequests += 1
        return { operationId: 'install-intent-retry' }
      }
      if (url.endsWith('/operations/install-intent-source')) {
        sourceRequests += 1
        return sourceRequests === 1
          ? { id: 'install-intent-source', kind: 'install', skinId: skin.id, phase: 'downloading', startedAt: new Date().toISOString() }
          : { id: 'install-intent-source', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: '需要批准', failure: { kind: 'build-approval', message: '需要批准', packageName: 'node-pty', action: 'approve-build' } }
      }
      if (url.endsWith('/operations/install-intent-retry')) return { id: 'install-intent-retry', kind: 'install', skinId: skin.id, phase: 'done' }
      if (url.endsWith('/operations/activate-after-approval')) return { id: 'activate-after-approval', kind: 'activate', skinId: skin.id, phase: 'done' }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: zh['common.installAndUse'] }))
    fireEvent.click(await screen.findByRole('button', { name: zh['common.allowAndRetry'] }))

    await waitFor(() => expect(retryRequests).toBe(1))
    await waitFor(() => expect(activateRequests).toBe(1))
  })
})
