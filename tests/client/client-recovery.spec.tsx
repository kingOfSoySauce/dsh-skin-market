// Client market tests: repair handoffs, retries, waiting states, artifact diagnostics and source migration
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => (await import('../fixtures/client-market.tsx')).createPrimitivesMock())

import { interceptNotice, isInterceptFailure, SkinMarketSection } from '../../src/client/SkinMarketSection.tsx'
import { compatibilityContext } from '../../src/compatibility.ts'
import type { CatalogSkin, Operation } from '../../src/client/types.ts'
import { methodSent, requestCount, requestSent, stubMarketFetch } from '../fixtures/market-host.ts'
import { artifactRiskOperation, dshRuntime, incompatibleDesktopSkin, managedDesktopSkin, officialManagement, openSkinCard, registerMarketTestDom, skin, visibleWarningDialogs, zh } from '../fixtures/client-market.tsx'

registerMarketTestDom()

describe('client market recovery', () => {
  it.each(['desktop', 'dsh'] as const)('copies a read-only repair handoff with the %s host, original action and sanitized operation log', async hostKind => {
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, writable: true, value: { writeText } })
    const operation: Operation = { id: 'repair-handoff', skinId: skin.id, kind: 'uninstall', phase: 'failed', startedAt: new Date().toISOString(), failure: { kind: 'unexpected-store', message: 'store mismatch' } }
    const diagnosticLog = '# dsh-skin-market diagnostic log\nversion: 0.1.62\n[error] sanitized-store-mismatch\n'
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { hostKind, runtime: { ...dshRuntime, version: '0.2.1-alpha.3' }, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }] }
      if (url.endsWith('/market-update')) return { updateAvailable: false }
      if (url.endsWith('/uninstall') && init?.method === 'POST') return { operationId: operation.id }
      if (url.endsWith(`/operations/${operation.id}`)) return operation
      if (url.endsWith('/logs?operationId=repair-handoff')) return { ok: true, text: async () => diagnosticLog }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard(/测试皮肤 已安装卡片/)
    fireEvent.click(screen.getByRole('button', { name: '卸载' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: zh['common.uninstallSkin'] })).getByRole('button', { name: zh['common.confirmUninstall'] }))
    const dialog = await screen.findByRole('dialog', { name: '卸载未完成' })
    expect(within(dialog).queryByRole('link', { name: '查看安装排查' })).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/logs?'))).toBe(false)
    const copyPrompt = within(dialog).getByRole('button', { name: '复制排查提示词' })
    expect(copyPrompt.querySelector('[data-icon="copy"]')).toBeTruthy()
    fireEvent.click(copyPrompt)
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(copyPrompt.querySelector('[data-icon="check"]')).toBeTruthy())
    expect(copyPrompt.textContent).toBe('复制排查提示词')
    expect(within(dialog).getByRole('button', { name: '复制排查提示词' })).toBe(copyPrompt)
    const text = writeText.mock.calls[0]![0]
    expect(text).toContain(hostKind === 'desktop' ? '官方 Desktop' : 'DSH Web')
    expect(text).toContain('0.2.1-alpha.3')
    expect(text).toContain('原操作：卸载（uninstall）')
    for (const identity of [skin.id, skin.package, skin.rowId, skin.repo]) expect(text).toContain(identity)
    expect(text).toContain('不要改写自己的活动组合配置')
    expect(text.endsWith(diagnosticLog)).toBe(true)
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/logs?'))).toHaveLength(1)
  })
  it('gives a plain uninstall failure the official-page result instead of the diagnostic dialog', async () => {
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }], runtime: dshRuntime }
      if (url.endsWith('/market-update')) return { updateAvailable: false }
      if (url.endsWith('/uninstall') && init?.method === 'POST') return { operationId: 'plain-uninstall' }
      if (url.endsWith('/operations/plain-uninstall')) return { id: 'plain-uninstall', kind: 'uninstall', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: 'remove refused' }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard(/测试皮肤 已安装卡片/)
    fireEvent.click(screen.getByRole('button', { name: zh['common.uninstall'] }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: zh['common.uninstallSkin'] })).getByRole('button', { name: zh['common.confirmUninstall'] }))
    const dialog = await screen.findByRole('dialog', { name: zh['common.uninstall'] })
    expect(dialog.textContent).toContain(zh['failure.recoveryUninstall'].replace('{name}', skin.name.zh))
    expect(screen.queryByRole('dialog', { name: '卸载未完成' })).toBeNull()
  })
  it.each(['clipboard', 'logs'] as const)('retains selectable repair text with a visible warning when %s export fails', async failure => {
    const writeText = vi.fn(async () => { throw new Error('clipboard blocked') })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, writable: true, value: { writeText } })
    const operation: Operation = { id: 'repair-copy-failed', skinId: skin.id, kind: 'deactivate', phase: 'failed', application: 'overridden', startedAt: new Date().toISOString(), failure: {
      kind: 'configuration-override', message: 'covered', desiredEnabled: false,
      configurationOverride: { status: 'blocked', rowId: skin.rowId, desiredEnabled: false, sharedAcrossProfiles: true, reason: '需要原管理工具处理。' },
    } }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { hostKind: 'desktop', runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'active', installedVersion: '1.0.0', updateAvailable: false }] }
      if (url.endsWith('/market-update')) return { updateAvailable: false }
      if (url.endsWith('/deactivate') && init?.method === 'POST') return { operationId: operation.id }
      if (url.endsWith(`/operations/${operation.id}`)) return operation
      if (url.endsWith('/logs?operationId=repair-copy-failed')) return failure === 'logs'
        ? { ok: false, status: 500 }
        : { ok: true, text: async () => '# dsh-skin-market diagnostic log\nredacted' }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`)
    })
    render(<SkinMarketSection t={key => key} />)
    const card = await screen.findByRole('button', { name: /测试皮肤 已安装卡片/ })
    fireEvent.click(within(card.closest('article')!).getByRole('button', { name: '停用' }))
    const dialog = await screen.findByRole('dialog', { name: '停用未完成' })
    expect(dialog.textContent).toContain('强制启用')
    fireEvent.click(within(dialog).getByRole('button', { name: '复制排查提示词' }))
    const text = await within(dialog).findByRole('textbox', { name: '排查提示词' }) as HTMLTextAreaElement
    expect(text.readOnly).toBe(true)
    expect(text.value).toContain('原操作：停用（deactivate）')
    expect(text.value).toContain(zh['failure.goalDesiredDisable'])
    expect(within(dialog).getByRole('alert').textContent).toContain(failure === 'logs' ? '日志未能导出' : '手动复制')
    if (failure === 'logs') {
      expect(writeText).not.toHaveBeenCalled()
      expect(text.value).not.toContain('以下是已脱敏诊断日志')
    } else expect(text.value).toContain('# dsh-skin-market diagnostic log\nredacted')
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  })
  it('previews the affected old skin and sends only its bound repair context after explicit native approval', async () => {
    const oldSkin = { ...managedDesktopSkin, id: 'old.skin', package: 'old-skin', rowId: 'old-row', name: { zh: '原皮肤', en: 'Old Skin' } }
    const context = 'b'.repeat(64)
    const file = '/Users/example/.dsh/cordis.patch.yml'
    const operation: Operation = { id: 'repair-native', skinId: skin.id, kind: 'activate', phase: 'failed', application: 'overridden', startedAt: new Date().toISOString(), failure: {
      kind: 'configuration-override', message: 'old skin forced enabled', action: 'repair-configuration', desiredEnabled: false, targetSkinId: oldSkin.id,
      configurationOverride: { status: 'repairable', context, source: 'home', file, rowId: oldSkin.rowId, previousDisabled: false, desiredEnabled: false, sharedAcrossProfiles: true, reason: '静态覆盖可移除。' },
    } }
    let repaired = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [managedDesktopSkin, oldSkin] }
      if (url.endsWith('/state')) return { hostKind: 'desktop', runtime: dshRuntime, management: officialManagement, skins: [
        { skinId: skin.id, installation: 'installed', activation: repaired ? 'active' : 'inactive', installedVersion: '1.0.0', updateAvailable: false },
        { skinId: oldSkin.id, installation: 'installed', activation: repaired ? 'inactive' : 'active', primary: true, installedVersion: '1.0.0', updateAvailable: false },
      ] }
      if (url.endsWith('/market-update')) return { updateAvailable: false }
      if (url.endsWith('/activate') && init?.method === 'POST') return { operationId: operation.id }
      if (url.endsWith(`/operations/${operation.id}`)) return operation
      if (url.endsWith('/operations/repair-native/retry') && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ action: 'repair-configuration', configurationContext: context,
          acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(managedDesktopSkin, dshRuntime) })
        repaired = true
        return { operationId: 'repair-native-running' }
      }
      if (url.endsWith('/operations/repair-native-running')) return { ...operation, id: 'repair-native-running', phase: 'done', application: 'applied', failure: undefined }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`)
    })
    render(<SkinMarketSection t={key => key} />)
    const card = await screen.findByRole('button', { name: /测试皮肤 已安装卡片/ })
    fireEvent.click(within(card.closest('article')!).getByRole('button', { name: '使用' }))
    const dialog = await screen.findByRole('dialog', { name: '启用未完成' })
    expect(dialog.textContent).toContain('「原皮肤」被其他设置强制启用。')
    expect(dialog.textContent).not.toContain('「测试皮肤」被其他设置禁用')
    for (const text of [file, oldSkin.rowId, 'disabled: false', '此 DSH 目录中的其他 profile', '备份']) expect(dialog.textContent).toContain(text)
    expect(within(dialog).queryByRole('button', { name: '复制排查提示词' })).toBeNull()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    fireEvent.click(within(dialog).getByRole('button', { name: '解除覆盖并继续' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/operations/repair-native/retry'))).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '启用未完成' })).toBeNull())
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2)
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/configuration-override'))).toBe(false)
  })
  it.each(['skin', 'market'] as const)('keeps a rejected %s retry in its dialog and hides the acknowledged failure across refresh and remount', async source => {
    const id = `${source}-retry-visible`
    const operation = { id, phase: 'failed', startedAt: new Date().toISOString(), message: 'ECONNRESET /Users/private/raw-error', failure: { kind: 'network', message: 'ECONNRESET /Users/private/raw-error', action: 'retry' } }
    let retries = 0
    let finishRetry!: (response: unknown) => void
    const pending = new Promise(resolve => { finishRetry = resolve })
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime,
        ...(source === 'skin' ? { operations: [] } : { marketUpdateOperation: operation }),
      }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.61', latestVersion: '0.1.61', updateAvailable: false }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: id }
      if (url.endsWith(`/operations/${id}`)) return { ...operation, kind: 'install', skinId: skin.id }
      if (url.endsWith(`/operations/${id}/retry`) && init?.method === 'POST') {
        retries += 1
        expect(JSON.parse(String(init.body))).toEqual({ action: 'retry' })
        return await pending
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const view = render(<SkinMarketSection t={key => key} />)
    if (source === 'skin') fireEvent.click(await screen.findByRole('button', { name: zh['common.installAndUse'] }))
    const title = source === 'skin' ? '安装 测试皮肤' : '皮肤市场更新失败'
    const dialog = await screen.findByRole('dialog', { name: title })
    if (source === 'skin') expect(dialog.textContent).toContain(zh['failure.manualInstallFallback'])
    expect(dialog.textContent).not.toContain('复制命令')
    expect(within(dialog).queryByRole('button', { name: '打开安装面板' })).toBeNull()
    expect(dialog.textContent).not.toContain('ECONNRESET')
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    fireEvent.click(within(dialog).getAllByRole('button', { name: '关闭' })[0]!)
    expect(screen.queryByRole('status')).toBeNull()
    const stateRequests = requestCount(fetchMock, '/state')
    fireEvent.focus(window)
    await waitFor(() => expect(requestCount(fetchMock, '/state')).toBeGreaterThan(stateRequests))
    expect(screen.queryByRole('dialog', { name: title })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    view.unmount()
    render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('button', { name: /测试皮肤 界面预览/ })
    expect(screen.queryByRole('dialog', { name: title })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('folds three recovery steps for an unreachable installed source and leaves them closed', async () => {
    const commit = 'd'.repeat(40)
    const operation = {
      id: 'dead-source', kind: 'install' as const, skinId: skin.id, phase: 'failed' as const, startedAt: new Date().toISOString(),
      failure: { kind: 'existing-source-unreachable' as const, message: 'blocked', packageName: 'dead-skin', unreachableSource: { repository: 'owner/dead', commit } },
    }
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime, installEnvironment: { platform: 'darwin', profile: 'web', profileDir: '/Users/leon/.dsh/profiles/web', cliAvailable: true } }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.75', latestVersion: '0.1.75', updateAvailable: false }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: operation.id }
      if (url.endsWith(`/operations/${operation.id}`)) return operation
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: zh['common.installAndUse'] }))
    const dialog = await screen.findByRole('dialog', { name: '安装未完成' })
    const steps = within(dialog).getAllByRole('button', { expanded: false })
    expect(steps.map(step => step.textContent)).toEqual(['方法 1：手动去掉 dead-skin', zh['failure.existingSourceStep2Title'], zh['failure.existingSourceStep3Title']])
    expect(dialog.textContent).toContain('owner/dead')
    expect(dialog.textContent).not.toContain('不要在市场里卸载 dead-skin')
    expect(dialog.textContent).not.toContain('--i-have-stopped-dsh')
    fireEvent.click(steps[0]!)
    fireEvent.click(steps[1]!)
    fireEvent.click(steps[2]!)
    expect(dialog.textContent).toContain('不要在市场里卸载 dead-skin')
    expect(dialog.textContent).toContain('--i-have-stopped-dsh')
    expect(dialog.textContent).toContain('不要中断')
    expect(within(dialog).queryByRole('button', { name: '复制排查提示词' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: '复制提示词' })).toBeTruthy()
  })
  it.each(['plain', 'build'] as const)('hides an acknowledged %s failure and prompts again for a new operation', async type => {
    let generation = 0
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime }
      if (url.endsWith('/market-update')) return { updateAvailable: false }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: `${type}-${++generation}` }
      if (url.endsWith(`/operations/${type}-${generation}`)) return {
        id: `${type}-${generation}`, kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(),
        ...(type === 'build' && { failure: { kind: 'build-approval', message: 'blocked native build', action: 'approve-build', packageName: 'node-pty' } }),
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    const install = await screen.findByRole('button', { name: zh['common.installAndUse'] })
    fireEvent.click(install)
    // A plain Host failure opens the manual install panel; only a result that
    // carries a reason keeps its decision dialog.
    const title = type === 'build' ? zh['common.approveBuild'] : '安装 测试皮肤'
    const dismiss = type === 'build' ? '取消' : '关闭'
    const firstDialog = await screen.findByRole('dialog', { name: title })
    fireEvent.click(within(firstDialog).getAllByRole('button', { name: dismiss })[0]!)
    expect(screen.queryByRole('dialog', { name: title })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh['common.installAndUse'] }))
    const next = await screen.findByRole('dialog', { name: title })
    expect(generation).toBe(2)
    fireEvent.click(within(next).getAllByRole('button', { name: dismiss })[0]!)
    expect(screen.queryByRole('status')).toBeNull()
    expect(requestSent(fetchMock, '/retry')).toBe(false)
  })
  it.each(['post', 'poll'] as const)('prompts again after a second independent skin installation %s exception', async stage => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
    let attempts = 0
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime }
      if (url.endsWith('/market-update')) return { updateAvailable: false }
      if (url.endsWith('/install') && init?.method === 'POST') {
        attempts += 1
        if (stage === 'post') throw new Error('connection failed')
        return { operationId: `poll-exception-${attempts}` }
      }
      if (url.includes('/operations/poll-exception-')) throw new Error('poll failed')
      throw new Error(`Unexpected request: ${url}`)
    })
    try {
      render(<SkinMarketSection t={key => key} />)
      await openSkinCard()
      const install = screen.getByRole('button', { name: '仅安装' })
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        fireEvent.click(screen.getByRole('button', { name: '仅安装' }))
        fireEvent.click(within(await screen.findByRole('dialog', { name: '安装未完成' })).getByRole('button', { name: '知道了' }))
        expect(attempts).toBe(attempt)
        expect(screen.queryByRole('status')).toBeNull()
      }
    } finally { clock.mockRestore() }
  })
  it('prompts again when a second market-update request fails before returning an operation', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
    let attempts = 0
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime }
      if (url.endsWith('/market-update') && init?.method === 'POST') { attempts += 1; throw new Error('request failed') }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.61', latestVersion: '0.1.62', updateAvailable: true }
      throw new Error(`Unexpected request: ${url}`)
    })
    try {
      render(<SkinMarketSection t={key => key} />)
      const update = await screen.findByRole('button', { name: '更新皮肤市场到 0.1.62' })
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        fireEvent.click(update)
        fireEvent.click(within(await screen.findByRole('dialog', { name: '皮肤市场更新失败' })).getByRole('button', { name: '知道了' }))
        expect(attempts).toBe(attempt)
        expect(screen.queryByRole('status')).toBeNull()
      }
    } finally { clock.mockRestore() }
  })
  it.each(['skin', 'market'] as const)('prompts once for a %s waiting result and closes the current prompt when it completes', async source => {
    let generation = 1
    let phase = 'waiting'
    const operation = () => ({ id: `${source}-waiting-${generation}`, phase, startedAt: new Date().toISOString(), message: 'native raw result', ...(source === 'skin' && { kind: 'install', skinId: skin.id }) })
    const fetchMock = stubMarketFetch(async (url: string) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime,
        ...(phase === 'waiting' && { profileBusy: '宿主结果尚未确认' }),
        ...(source === 'skin' ? { operations: [operation()] } : { marketUpdateOperation: operation() }),
      }
      if (url.endsWith('/market-update')) return { currentVersion: '0.1.61', latestVersion: '0.1.61', updateAvailable: false }
      return operation()
    })
    render(<SkinMarketSection t={key => key} />)
    let dialog = await screen.findByRole('dialog', { name: zh['common.confirmResult'] })
    expect(dialog.textContent).toContain(zh['common.resultNotConfirmed'])
    expect(dialog.textContent).not.toContain('native raw result')
    expect(dialog.className).toContain('warningModal')
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '知道了' }))
    const stateRequests = requestCount(fetchMock, '/state')
    fireEvent.focus(window)
    await waitFor(() => expect(requestCount(fetchMock, '/state')).toBeGreaterThan(stateRequests))
    expect(screen.queryByRole('dialog', { name: zh['common.confirmResult'] })).toBeNull()
    expect(document.querySelector('[role="status"] strong')).toBeNull()
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
    const blockedInstall = screen.queryByRole('button', { name: /^安装(?:并使用)?$/ })
    expect(blockedInstall === null || blockedInstall.hasAttribute('disabled')).toBe(true)
    generation += 1
    fireEvent.focus(window)
    dialog = await screen.findByRole('dialog', { name: zh['common.confirmResult'] })
    phase = 'done'
    fireEvent.focus(window)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: zh['common.confirmResult'] })).toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: /^安装(?:并使用)?$/ }).hasAttribute('disabled')).toBe(false))
  })
  it.each(['skin', 'market'] as const)('prompts for a restored %s waiting operation when it later fails, even after acknowledging the wait', async source => {
    let phase = 'waiting'
    const operation = () => ({ id: `${source}-restored-wait`, phase, startedAt: new Date().toISOString(), message: 'Host result',
      ...(source === 'skin' && { kind: 'install', skinId: skin.id }),
      ...(phase === 'failed' && { failure: { kind: 'network', message: 'ECONNRESET', action: 'retry' } }),
    })
    const fetchMock = stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [skin] }
      : url.endsWith('/state') ? { skins: [], runtime: dshRuntime, ...(phase === 'waiting' && { profileBusy: '等待宿主确认' }), ...(source === 'skin' ? { operations: [operation()] } : { marketUpdateOperation: operation() }) }
        : url.endsWith('/market-update') ? { updateAvailable: false } : operation()))
    render(<SkinMarketSection t={key => key} />)
    const waiting = await screen.findByRole('dialog', { name: zh['common.confirmResult'] })
    fireEvent.click(within(waiting).getByRole('button', { name: '知道了' }))
    expect(document.querySelector('[role="status"] strong')).toBeNull()
    phase = 'failed'
    fireEvent.focus(window)
    const failure = await screen.findByRole('dialog', { name: source === 'skin' ? '安装 测试皮肤' : '皮肤市场更新失败' })
    if (source === 'skin') expect(failure.textContent).toContain(zh['failure.manualInstallFallback'])
    else expect(failure.textContent).toContain(zh['failure.marketUpdateRetry'])
    expect(failure.textContent).not.toContain('复制命令')
    expect(within(failure).queryByRole('button', { name: '打开安装面板' })).toBeNull()
    expect(within(failure).queryByRole('button', { name: '重试' })).toBeNull()
    fireEvent.click(within(failure).getAllByRole('button', { name: '关闭' })[0]!)
    expect(document.querySelector('[role="status"] strong')).toBeNull()
    expect(screen.getByRole('button', { name: zh['common.installAndUse'] }).hasAttribute('disabled')).toBe(false)
  })
  it.each(['restart', 'waiting'] as const)('keeps a use confirmation in front of a new passive %s prompt without dropping that prompt', async pendingKind => {
    const incompatible = incompatibleDesktopSkin
    let pending = false
    const fetchMock = stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [incompatible] }
      : url.endsWith('/market-update') ? { currentVersion: '0.1.61', latestVersion: '0.1.61', updateAvailable: false }
        : { hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.1-alpha.3' }, management: officialManagement,
          skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }],
          ...(pending && pendingKind === 'restart' && { marketUpdateRestartRequired: true }),
          ...(pending && pendingKind === 'waiting' && { operations: [{ id: 'passive-waiting', kind: 'install', skinId: 'other.skin', phase: 'waiting', startedAt: new Date().toISOString() }] }),
        }))
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click((await screen.findAllByRole('button', { name: '使用' }))[0]!)
    const use = await screen.findByRole('dialog', { name: zh['common.switchConfirmation'] })
    pending = true
    const stateRequests = requestCount(fetchMock, '/state')
    fireEvent.focus(window)
    await waitFor(() => expect(requestCount(fetchMock, '/state')).toBeGreaterThan(stateRequests))
    expect(visibleWarningDialogs()).toEqual([use])
    const pendingTitle = pendingKind === 'restart' ? zh['common.restartManualTitle'] : zh['common.confirmResult']
    expect(screen.queryByRole('dialog', { name: pendingTitle })).toBeNull()
    fireEvent.click(within(use).getByRole('button', { name: '取消' }))
    const deferred = await screen.findByRole('dialog', { name: pendingTitle })
    expect(visibleWarningDialogs()).toEqual([deferred])
    fireEvent.click(within(deferred).getByRole('button', { name: '知道了' }))
    const afterDismiss = requestCount(fetchMock, '/state')
    fireEvent.focus(window)
    await waitFor(() => expect(requestCount(fetchMock, '/state')).toBeGreaterThan(afterDismiss))
    await act(async () => {})
    expect(screen.queryByRole('dialog', { name: pendingTitle })).toBeNull()
  })
  it('does not lock an unrelated failure while another retry is still polling', async () => {
    const other = { ...skin, id: 'other.skin', package: 'other-skin', rowId: 'other-skin', name: { zh: '另一皮肤', en: 'Other skin' } }
    let retried = false, completed = false
    const first = { id: 'first-retry-source', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), failure: { kind: 'network', message: 'ECONNRESET', action: 'retry' } }
    let finishPoll!: (response: unknown) => void
    const polling = new Promise(resolve => { finishPoll = resolve })
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin, other] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime, operations: retried ? [{ ...first, id: 'first-retry-running', phase: completed ? 'done' : 'installing', failure: undefined }] : [] }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: JSON.parse(String(init.body)).skinId === other.id ? 'unrelated-failure' : first.id }
      if (url.endsWith('/operations/first-retry-source')) return first
      if (url.endsWith('/operations/unrelated-failure')) return { id: 'unrelated-failure', kind: 'install', skinId: other.id, phase: 'failed', startedAt: new Date().toISOString(), message: 'raw other failure' }
      if (url.endsWith('/operations/first-retry-source/retry') && init?.method === 'POST') { retried = true; return { operationId: 'first-retry-running' } }
      if (url.endsWith('/operations/first-retry-running')) return await polling
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    const firstCard = (await screen.findByRole('button', { name: '测试皮肤 界面预览' })).closest('article')!
    fireEvent.click(within(firstCard).getByRole('button', { name: zh['common.installAndUse'] }))
    const firstDialog = await screen.findByRole('dialog', { name: '安装 测试皮肤' })
    fireEvent.click(within(firstDialog).getAllByRole('button', { name: '关闭' })[0]!)
    const otherCard = screen.getByRole('button', { name: '另一皮肤 界面预览' }).closest('article')!
    fireEvent.click(within(otherCard).getByRole('button', { name: /^安装(?:并使用)?$/ }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: '安装 另一皮肤' }).textContent).toContain('另一皮肤'))
    const secondDialog = screen.getByRole('dialog', { name: '安装 另一皮肤' })
    const closeSecond = within(secondDialog).getAllByRole('button', { name: '关闭' })[0]!
    expect(closeSecond.hasAttribute('disabled')).toBe(false)
    fireEvent.click(closeSecond)
    expect(screen.queryByRole('dialog', { name: '安装 另一皮肤' })).toBeNull()
    await act(async () => {
      completed = true
      finishPoll({ ok: true, json: async () => ({ ...first, id: 'first-retry-running', phase: 'done', failure: undefined }) })
      await polling
    })
  })
  it('explains a missing bundle patch as a packaging intercept, not a local profile error', () => {
    const operation = {
      id: 'op', kind: 'install' as const, skinId: skin.id, phase: 'failed' as const, startedAt: '2026-09-08T00:00:00Z',
      message: '@deepseek-ai/dsh-client-ui-liquid-glass bundle patch is missing: ./cordis.patch.yml',
    }
    expect(isInterceptFailure(operation)).toBe(true)
    expect(isInterceptFailure({ ...operation, failure: { kind: 'network', message: '网络错误', action: 'retry' } })).toBe(false)
    const notice = interceptNotice(operation, '液态玻璃', skin)
    expect(notice.title).toBe('安装已阻止')
    expect(notice.what).toBe('「液态玻璃」的安装包文件缺少必要文件。')
    expect(notice.why).toContain('请复制日志反馈作者')
    expect(notice.links).toEqual([{ href: `https://github.com/a/b/tree/${'a'.repeat(40)}`, label: '打开皮肤仓库' }])
  })
  it('explains an approvable artifact risk separately from missing or invalid package failures', () => {
    const operation = artifactRiskOperation()
    operation.failure!.artifactRisk!.warnings.push('锁文件缺少 SRI：/Users/example/private-profile/pnpm-lock.yaml', '读取 C:\\Users\\example\\profile\\pnpm-lock.yaml 未完成')
    const notice = interceptNotice(operation, '测试皮肤', skin)
    expect(isInterceptFailure(operation)).toBe(true)
    expect(notice.title).toBe('安装需要确认安装包风险')
    expect(notice.what).toBe('「测试皮肤」的安装包文件未通过市场核验，使用后可能导致页面异常。')
    expect(notice.why).toBe('')
    expect(notice.links).toEqual([])
    expect(notice).not.toHaveProperty('warnings')
    expect(JSON.stringify(notice)).not.toContain('private-profile')
    const blocked = interceptNotice({ ...operation, failure: { kind: 'integrity', message: 'npm 未物化预期包版本或声明的可加载入口' } }, '测试皮肤', skin)
    expect(blocked.title).toBe('安装未完成')
    expect(blocked.what).toBe('「测试皮肤」：安装包文件无法通过校验。')
    expect(blocked.why).toContain('核对安装源与缓存，不要跳过校验')
  })
  it('asks before migrating the chosen skin and preserves the active-skin restart flow', async () => {
    let migrated = false
    const sourceMigration = { target: 'skin@1.0.0', currentSource: skin.install.target }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { hostKind: 'dsh', runningAgentCount: 0, runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: migrated ? 'restart-required' : 'active', pinned: true, installedVersion: '1.0.0', updateAvailable: false, ...(!migrated && { sourceMigration }) }] }
      if (url.endsWith('/migrate') && init?.method === 'POST') {
        migrated = true
        return { operationId: 'migrate-1' }
      }
      if (url.endsWith('/operations/migrate-1')) return { id: 'migrate-1', kind: 'migrate', skinId: skin.id, phase: 'done' }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click((await screen.findAllByRole('button', { name: '切换到 npm 来源' }))[0]!)
    const firstDialog = screen.getByRole('dialog', { name: '切换到 npm 来源' })
    expect(firstDialog.textContent).toContain('“测试皮肤”将切换到同版本 npm 来源，保留当前启用和常驻状态。')
    expect(firstDialog.textContent).not.toContain(sourceMigration.currentSource)
    expect(firstDialog.querySelector('code, ul, ol, details')).toBeNull()
    expect(firstDialog.className).toContain('warningModal')
    expect(migrated).toBe(false)
    fireEvent.click(within(firstDialog).getByRole('button', { name: '取消' }))
    expect(migrated).toBe(false)

    fireEvent.click(screen.getAllByRole('button', { name: '切换到 npm 来源' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: '确认切换到 npm 来源' }))
    expect(await screen.findByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeTruthy()
    expect(screen.queryByText('测试皮肤 已切换到 npm 来源，待重启生效')).toBeNull()
    expect(screen.queryByRole('button', { name: '切换到 npm 来源' })).toBeNull()
    expect(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/migrate') && init?.method === 'POST')?.[1]?.body).toBe(JSON.stringify({ skinId: skin.id }))
    expect(requestSent(fetchMock, '/update', 'POST')).toBe(false)
    expect(requestSent(fetchMock, '/restart', 'POST')).toBe(false)
  })
  it.each(['missing', 'no-source', 'manual', 'desktop'])('hides source migration for %s skins', async mode => {
    const entry = mode === 'manual' ? { ...skin, review: { compatibility: 'verified', preview: 'verified', installation: 'manual-only' } } : skin
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [entry] } : {
      hostKind: mode === 'desktop' ? 'desktop' : 'dsh',
      skins: [{ skinId: skin.id, installation: mode === 'missing' ? 'missing' : 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false, ...(mode !== 'no-source' && { sourceMigration: { target: 'skin@1.0.0', currentSource: skin.install.target } }) }],
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    expect(screen.queryByRole('button', { name: '切换到 npm 来源' })).toBeNull()
  })
  it.each(['card replacement', 'card update', 'detail update'])('confirms local replacement from the %s entry and sends the approved source context', async entry => {
    let migrated = false
    const sourceMigration = { kind: 'local', target: 'skin@1.0.0', currentSource: 'file:/Users/example/private-skins/local.tgz', currentVersion: '1.1.0-compat.2', targetVersion: '1.0.0', context: 'a'.repeat(64), downgrade: true }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { hostKind: 'dsh', runningAgentCount: 0, runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: migrated ? 'restart-required' : 'active', pinned: true, installedVersion: migrated ? '1.0.0' : sourceMigration.currentVersion, updateAvailable: !migrated, ...(!migrated && { sourceMigration }) }] }
      if (url.endsWith('/migrate') && init?.method === 'POST') {
        migrated = true
        return { operationId: 'local-replacement' }
      }
      if (url.endsWith('/operations/local-replacement')) return { id: 'local-replacement', kind: 'migrate', skinId: skin.id, phase: 'done' }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    if (entry === 'detail update') await openSkinCard(/测试皮肤 已安装卡片/)
    fireEvent.click((await screen.findAllByRole('button', { name: entry === 'card replacement' ? zh['common.replaceWithMarket'] : '更新' }))[0]!)
    const dialog = await screen.findByRole('dialog', { name: zh['common.replaceWithMarket'] })
    expect(dialog.textContent).toContain('当前版本 1.1.0-compat.2 → 市场版本 1.0.0')
    expect(dialog.textContent).toContain('本次将降级到市场版本')
    expect(dialog.textContent).toContain('保留当前启用和常驻状态')
    expect(dialog.textContent).toContain('原始本地文件保留')
    expect(dialog.textContent).toContain('取消不会更换安装来源')
    expect(dialog.textContent).not.toContain(sourceMigration.currentSource)
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(methodSent(fetchMock, 'POST')).toBe(false)

    fireEvent.click(screen.getAllByRole('button', { name: zh['common.replaceWithMarket'] })[0]!)
    fireEvent.click(screen.getByRole('button', { name: '确认替换' }))
    expect(await screen.findByRole('dialog', { name: zh['common.restartTargetSkin'] })).toBeTruthy()
    expect(screen.queryByText('测试皮肤 已替换为市场版本，待重启生效')).toBeNull()
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/migrate') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: skin.id, sourceContext: sourceMigration.context })
    expect(requestSent(fetchMock, '/update', 'POST')).toBe(false)
    expect(screen.queryByRole('button', { name: zh['common.replaceWithMarket'] })).toBeNull()
  })
  it('explains that an incompatible market replacement first disables the selected local skin', async () => {
    const entry = { ...skin, compatibility: { ...skin.compatibility, dsh: '^9.0.0' } }
    const sourceMigration = { kind: 'local', target: 'skin@1.0.0', currentSource: 'file:/tmp/local.tgz', currentVersion: '1.1.0', targetVersion: '1.0.0', context: 'a'.repeat(64), downgrade: true }
    const fetchMock = stubMarketFetch(async (url: string, _init?: RequestInit) => (url.endsWith('/catalog') ? { skins: [entry] } : {
      hostKind: 'dsh', runtime: dshRuntime, management: officialManagement,
      skins: [{ skinId: skin.id, installation: 'installed', activation: 'active', primary: true, pinned: true, installedVersion: sourceMigration.currentVersion, updateAvailable: true, sourceMigration }],
    }))
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click((await screen.findAllByRole('button', { name: zh['common.replaceWithMarket'] }))[0]!)
    const dialog = await screen.findByRole('dialog', { name: zh['common.replaceWithMarket'] })
    expect(dialog.textContent).toContain('目标版本需要兼容性确认，替换后先停用；确认使用或常驻后再启用')
    expect(dialog.textContent).not.toContain('保留当前启用和常驻状态')
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true)
  })
  it.each(['context', 'version'] as const)('requires another confirmation when local replacement %s changes', async changed => {
    let sourceMigration = { kind: 'local' as const, target: 'skin@1.0.0', currentSource: 'link:/Users/example/private-skins/local', currentVersion: '0.9.0', targetVersion: '1.0.0', context: 'a'.repeat(64), downgrade: false }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { hostKind: 'dsh', runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: sourceMigration.currentVersion, updateAvailable: true, sourceMigration }] }
      if (url.endsWith('/migrate') && init?.method === 'POST') return { operationId: 'replacement-refreshed' }
      if (url.endsWith('/operations/replacement-refreshed')) return { id: 'replacement-refreshed', kind: 'migrate', skinId: skin.id, phase: 'done' }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click((await screen.findAllByRole('button', { name: zh['common.replaceWithMarket'] }))[0]!)
    expect(screen.getByRole('dialog', { name: zh['common.replaceWithMarket'] }).textContent).toContain('当前版本 0.9.0 → 市场版本 1.0.0')
    expect(screen.getByRole('dialog', { name: zh['common.replaceWithMarket'] }).textContent).not.toContain('本次将降级')
    sourceMigration = changed === 'context'
      ? { ...sourceMigration, context: 'b'.repeat(64) }
      : { ...sourceMigration, currentVersion: '1.1.0', downgrade: true }
    const stateRequests = requestCount(fetchMock, '/state')
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(requestCount(fetchMock, '/state')).toBeGreaterThan(stateRequests))
    fireEvent.click(screen.getByRole('button', { name: '确认替换' }))
    const updated = screen.getByRole('dialog', { name: zh['common.replaceWithMarket'] })
    expect(updated.textContent).toContain('安装来源或版本已变化，请重新确认')
    if (changed === 'version') {
      expect(updated.textContent).toContain('当前版本 1.1.0 → 市场版本 1.0.0')
      expect(updated.textContent).toContain('降级')
    }
    expect(methodSent(fetchMock, 'POST')).toBe(false)
    fireEvent.click(within(updated).getByRole('button', { name: '确认替换' }))
    await waitFor(() => expect(requestSent(fetchMock, '/migrate', 'POST')).toBe(true))
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/migrate') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: skin.id, sourceContext: sourceMigration.context })
  })
  const reviewedSkin = {
    ...skin,
    install: { ...skin.install, target: `github:a/b#${'a'.repeat(40)}` },
    review: { compatibility: 'verified', preview: 'verified', installation: 'verified' },
  } satisfies CatalogSkin
  it.each(['install', 'update'] as const)('prefills the official install panel when a Desktop %s fails without a Host reason', async kind => {
    const operation = {
      id: `plain-${kind}-desktop`, kind, skinId: skin.id, phase: 'failed' as const, startedAt: new Date().toISOString(),
      message: '当前皮肤使用本地、自定义或无法继续核验的安装来源，无法自动换源；请按原安装方式更新',
    }
    const open = vi.fn(async (_spec: string) => ({ ok: true as const, kind: 'prefilled' as const }))
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [reviewedSkin] }
      if (url.endsWith('/state')) return {
        hostKind: 'desktop', runtime: dshRuntime, management: officialManagement,
        skins: kind === 'update'
          ? [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '0.9.0', updateAvailable: true }]
          : [],
      }
      if (url.endsWith('/market-update')) return { updateAvailable: false }
      if (url.endsWith(`/${kind}`) && init?.method === 'POST') return { operationId: operation.id }
      if (url.endsWith(`/operations/${operation.id}`)) return operation
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} desktopPluginPanel={{ available: () => true, open }} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: kind === 'install' ? '安装' : '更新' }))
    await waitFor(() => expect(open).toHaveBeenCalled())
    expect(open).toHaveBeenCalledWith(`github:a/b#${'a'.repeat(40)}`, expect.objectContaining({ skinId: skin.id, packageName: skin.package, operationId: operation.id }), { navigateOnResume: false })
    expect(screen.queryByRole('dialog', { name: kind === 'install' ? '安装未完成' : '更新未完成' })).toBeNull()
    expect(document.body.textContent).not.toContain('未能完成本次操作')
  })
  it('opens the manual update panel when a Web update fails without a Host reason', async () => {
    const operation = {
      id: 'plain-update-web', kind: 'update' as const, skinId: skin.id, phase: 'failed' as const, startedAt: new Date().toISOString(),
      message: 'installed package did not change to the reviewed source/version',
    }
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '0.9.0', updateAvailable: true }], runtime: dshRuntime }
      if (url.endsWith('/market-update')) return { updateAvailable: false }
      if (url.endsWith('/update') && init?.method === 'POST') return { operationId: operation.id }
      if (url.endsWith(`/operations/${operation.id}`)) return operation
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '更新' }))
    const dialog = await screen.findByRole('dialog', { name: '更新 测试皮肤' })
    expect(dialog.textContent).toContain(zh['failure.manualInstallFallback'])
    expect(dialog.textContent).not.toContain(operation.message)
    expect(screen.queryByRole('dialog', { name: '更新未完成' })).toBeNull()
    expect(document.body.textContent).not.toContain('未能完成本次操作')
    // The diagnostic dialog is the last step: it only opens when the user says
    // the manual panel still cannot finish the operation.
    fireEvent.click(within(dialog).getByRole('button', { name: zh['common.stillCannotFinish'] }))
    const diagnostic = await screen.findByRole('dialog', { name: '更新未完成' })
    expect(diagnostic.textContent).toContain('未能完成本次操作')
    expect(within(diagnostic).getByRole('button', { name: '复制日志' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: '更新 测试皮肤' })).toBeNull()
    fireEvent.click(within(diagnostic).getByRole('button', { name: '知道了' }))
    expect(screen.queryByRole('dialog', { name: '更新未完成' })).toBeNull()
  })
})
