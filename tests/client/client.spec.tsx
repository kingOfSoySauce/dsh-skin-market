// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const icon = () => React.createElement('span', { 'aria-hidden': true })
  const copyIcon = () => React.createElement('span', { 'aria-hidden': true, 'data-icon': 'copy' })
  const checkIcon = () => React.createElement('span', { 'aria-hidden': true, 'data-icon': 'check' })
  return {
    Button: ({ icon: leading, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => React.createElement('button', props, leading, children),
    Input: ({ icon: leading, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }) => React.createElement('label', null, leading, React.createElement('input', props)),
    Pill: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement('button', props, children),
    Switch: ({ checked, onChange, label, ...props }: { checked: boolean; onChange: (next: boolean) => void; label: string; className?: string }) => React.createElement('button', { ...props, type: 'button', role: 'switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) }),
    Modal: ({
      open,
      title,
      closeLabel = '关闭',
      onClose,
      description,
      footer,
      className,
      children,
    }: {
      open: boolean
      title: string
      closeLabel?: string
      onClose?: () => void
      description?: string
      footer?: React.ReactNode
      className?: string
      children?: React.ReactNode
    }) => open ? React.createElement(
      'div',
      { role: 'dialog', 'aria-label': title, className },
      React.createElement('h2', null, title),
      React.createElement('button', { type: 'button', 'aria-label': closeLabel, onClick: onClose }),
      description,
      children,
      footer,
    ) : null,
    DisclosureRow: ({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children?: React.ReactNode }) => React.createElement('div', null, React.createElement('button', { type: 'button', 'aria-expanded': open, onClick: onToggle }, title), open ? children : null),
    CodeBlock: ({ code, copyLabel }: { code: string; copyLabel?: string }) => React.createElement('pre', null, code, React.createElement('button', { type: 'button' }, copyLabel)),
    IconChevronLeftOutline14: icon, IconChevronDownOutline14: icon, IconCloseOutline16: icon, IconCopyOutline16: copyIcon, IconCheckOutline16: checkIcon, IconDownloadOutline16: icon, IconLinkOutline16: icon, IconLoadingOutline16: icon,
    IconRefreshOutline16: icon, IconSearchOutline16: icon, IconTrashOutline16: icon,
    IconChevronLeftOutlineRegular: icon, IconChevronDownOutlineRegular: icon, IconCloseOutlineRegular: icon, IconCopyOutlineRegular: copyIcon, IconCheckOutlineRegular: checkIcon, IconDownloadOutlineRegular: icon, IconLoadingOutlineRegular: icon,
    IconRefreshOutlineRegular: icon, IconSearchOutlineRegular: icon, IconTrashOutlineRegular: icon,
    writeClipboard: async (text: string) => {
      if (navigator.clipboard?.writeText === undefined) return false
      await navigator.clipboard.writeText(text)
      return true
    },
  }
})

import { HOME_CATALOG_BATCH_SIZE, WEB_CLIENT_SETTLE_MS, captureListScroll, compareInstalledSkinOrder, compareSkinOrder, interceptNotice, isAnimatedPreviewSource, isInterceptFailure, resolvePrimitiveIcon, restartDocumentProbeUrl, restartReloadUrl, restoreListScroll, restoreMarketStyleOrder, SkinMarketSection, waitForRestartDocument } from '../../src/client/SkinMarketSection.tsx'
import { MARKET_INSTALL_TROUBLESHOOT_URL } from '../../src/client/failure-help.ts'
import { apply as applyClient, createClientSkinRuntime, missingPrimitives, switchClientSkin } from '../../src/client/index.ts'
import { createSkinInstallCommandGroups, createSkinInstallCommands, createSkinInstallInputs, createSkinInstallPrompt } from '../../src/client/submission.ts'
import { setGeneratedMediaSources } from '../../src/media-preview.ts'
import { createStaticTranslator } from '../../src/client/i18n.ts'
import { compatibilityContext } from '../../src/compatibility.ts'
import type { CatalogSkin, Operation, RuntimeSkin } from '../../src/client/types.ts'

const skin = {
  id: 'test.skin', name: { zh: '测试皮肤', en: 'Test Skin' }, author: 'author', description: 'description', repo: 'https://github.com/a/b', package: 'skin', rowId: 'skin',
  tags: ['dark'], modes: ['dark'], install: { target: 'https://github.com/a/b.git#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', version: '1.0.0', commit: 'a'.repeat(40) }, compatibility: { dsh: '0.1.0-rc.6', platform: ['web'] },
  screenshots: ['https://example.com/preview.png'], license: { code: 'MIT', commercialUse: true }, githubStars: 42, starsStale: false, starsUpdatedAt: '2026-08-16T00:00:00Z', recommendations: [], releaseUpdatedAt: '2026-08-16T00:00:00Z', metadataUpdatedAt: '2026-08-16T00:00:00Z', updatedAt: '2026-08-16T00:00:00Z',
} satisfies CatalogSkin
const dshRuntime = { version: '0.1.0-rc.6', capabilities: [], source: 'injected' as const }
const managedDesktopSkin = {
  ...skin,
  compatibility: { dsh: '>=0.1.0-rc.6', platform: ['web', 'desktop'] },
  install: { ...skin.install, desktop: { mode: 'managed', registry: 'npm', packageName: skin.package, packageVersion: skin.install.version } },
} satisfies CatalogSkin
const officialManagement = {
  official: true,
  capabilities: { install: { available: true }, update: { available: true }, enable: { available: true }, disable: { available: true }, remove: { available: true } },
}

function artifactRiskOperation(id = 'install-artifact-risk'): Operation {
  return {
    id, kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(),
    failure: {
      kind: 'integrity', message: 'npm 包完整性与已核验的 SRI 不一致', action: 'approve-artifact',
      artifactRisk: { context: 'actual-artifact-context', packageName: skin.package, version: skin.install.version, warnings: ['npm 包完整性与已核验的 SRI 不一致'] },
    },
  }
}

beforeEach(() => { window.localStorage.setItem('dsh-skin-market:activation-warning-accepted', 'true') })

afterEach(() => { cleanup(); setGeneratedMediaSources(undefined); window.localStorage.clear(); window.sessionStorage.clear(); vi.unstubAllGlobals() })

async function openSkinCard(name: RegExp = /测试皮肤 界面预览/) {
  const card = await screen.findByRole('button', { name })
  fireEvent.click(card)
  return card
}

function visibleWarningDialogs(): HTMLElement[] {
  return screen.queryAllByRole('dialog').filter(dialog => dialog.className.includes('warningModal'))
}

describe('animated cover handling', () => {
  it('detects GIF covers and leaves static screenshots animated-free', () => {
    expect(isAnimatedPreviewSource('https://example.com/skin/home.gif')).toBe(true)
    expect(isAnimatedPreviewSource('https://example.com/skin/home.GIF?raw=1')).toBe(true)
    expect(isAnimatedPreviewSource('data:image/gif;base64,R0lGODlhAQABAAAAACw=')).toBe(true)
    expect(isAnimatedPreviewSource('https://example.com/skin/home.png')).toBe(false)
    expect(isAnimatedPreviewSource(undefined)).toBe(false)
  })
})

describe('client market', () => {
  it.each(['desktop', 'dsh'] as const)('copies a read-only repair handoff with the %s host, original action and sanitized operation log', async hostKind => {
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, writable: true, value: { writeText } })
    const operation: Operation = { id: 'repair-handoff', skinId: skin.id, kind: 'uninstall', phase: 'failed', startedAt: new Date().toISOString(), failure: { kind: 'unexpected-store', message: 'store mismatch' } }
    const diagnosticLog = '# dsh-skin-market diagnostic log\nversion: 0.1.62\n[error] sanitized-store-mismatch\n'
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ hostKind, runtime: { ...dshRuntime, version: '0.2.1-alpha.3' }, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }] }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ updateAvailable: false }) }
      if (url.endsWith('/uninstall') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: operation.id }) }
      if (url.endsWith(`/operations/${operation.id}`)) return { ok: true, json: async () => operation }
      if (url.endsWith('/logs?operationId=repair-handoff')) return { ok: true, text: async () => diagnosticLog }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard(/测试皮肤 已安装卡片/)
    fireEvent.click(screen.getByRole('button', { name: '卸载' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: '卸载皮肤' })).getByRole('button', { name: '确认卸载' }))
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

  it.each(['clipboard', 'logs'] as const)('retains selectable repair text with a visible warning when %s export fails', async failure => {
    const writeText = vi.fn(async () => { throw new Error('clipboard blocked') })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, writable: true, value: { writeText } })
    const operation: Operation = { id: 'repair-copy-failed', skinId: skin.id, kind: 'deactivate', phase: 'failed', application: 'overridden', startedAt: new Date().toISOString(), failure: {
      kind: 'configuration-override', message: 'covered', desiredEnabled: false,
      configurationOverride: { status: 'blocked', rowId: skin.rowId, desiredEnabled: false, sharedAcrossProfiles: true, reason: '需要原管理工具处理。' },
    } }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ hostKind: 'desktop', runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'active', installedVersion: '1.0.0', updateAvailable: false }] }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ updateAvailable: false }) }
      if (url.endsWith('/deactivate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: operation.id }) }
      if (url.endsWith(`/operations/${operation.id}`)) return { ok: true, json: async () => operation }
      if (url.endsWith('/logs?operationId=repair-copy-failed')) return failure === 'logs'
        ? { ok: false, status: 500 }
        : { ok: true, text: async () => '# dsh-skin-market diagnostic log\nredacted' }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    const card = await screen.findByRole('button', { name: /测试皮肤 已安装卡片/ })
    fireEvent.click(within(card.closest('article')!).getByRole('button', { name: '停用' }))
    const dialog = await screen.findByRole('dialog', { name: '停用未完成' })
    expect(dialog.textContent).toContain('强制启用')
    fireEvent.click(within(dialog).getByRole('button', { name: '复制排查提示词' }))
    const text = await within(dialog).findByRole('textbox', { name: '排查提示词' }) as HTMLTextAreaElement
    expect(text.readOnly).toBe(true)
    expect(text.value).toContain('原操作：停用（deactivate）')
    expect(text.value).toContain('目标组件应停用（disabled: true）')
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [managedDesktopSkin, oldSkin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ hostKind: 'desktop', runtime: dshRuntime, management: officialManagement, skins: [
        { skinId: skin.id, installation: 'installed', activation: repaired ? 'active' : 'inactive', installedVersion: '1.0.0', updateAvailable: false },
        { skinId: oldSkin.id, installation: 'installed', activation: repaired ? 'inactive' : 'active', primary: true, installedVersion: '1.0.0', updateAvailable: false },
      ] }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ updateAvailable: false }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: operation.id }) }
      if (url.endsWith(`/operations/${operation.id}`)) return { ok: true, json: async () => operation }
      if (url.endsWith('/operations/repair-native/retry') && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ action: 'repair-configuration', configurationContext: context,
          acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(managedDesktopSkin, dshRuntime) })
        repaired = true
        return { ok: true, json: async () => ({ operationId: 'repair-native-running' }) }
      }
      if (url.endsWith('/operations/repair-native-running')) return { ok: true, json: async () => ({ ...operation, id: 'repair-native-running', phase: 'done', application: 'applied', failure: undefined }) }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`)
    })
    vi.stubGlobal('fetch', fetchMock)
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime,
        ...(source === 'skin' ? { operations: [] } : { marketUpdateOperation: operation }),
      }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.61', latestVersion: '0.1.61', updateAvailable: false }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: id }) }
      if (url.endsWith(`/operations/${id}`)) return { ok: true, json: async () => ({ ...operation, kind: 'install', skinId: skin.id }) }
      if (url.endsWith(`/operations/${id}/retry`) && init?.method === 'POST') {
        retries += 1
        expect(JSON.parse(String(init.body))).toEqual({ action: 'retry' })
        return await pending
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<SkinMarketSection t={key => key} />)
    if (source === 'skin') fireEvent.click(await screen.findByRole('button', { name: '安装并使用' }))
    const title = source === 'skin' ? '安装 测试皮肤' : '皮肤市场更新失败'
    const dialog = await screen.findByRole('dialog', { name: title })
    expect(dialog.textContent).toContain('复制命令，在运行 DSH 的电脑上执行。')
    expect(dialog.textContent).not.toContain('ECONNRESET')
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    fireEvent.click(within(dialog).getAllByRole('button', { name: '关闭' })[0]!)
    expect(screen.queryByRole('status')).toBeNull()
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent.focus(window)
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
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
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime, installEnvironment: { platform: 'darwin', profile: 'web', profileDir: '/Users/leon/.dsh/profiles/web', cliAvailable: true } }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.75', latestVersion: '0.1.75', updateAvailable: false }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: operation.id }) }
      if (url.endsWith(`/operations/${operation.id}`)) return { ok: true, json: async () => operation }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装并使用' }))
    const dialog = await screen.findByRole('dialog', { name: '安装未完成' })
    const steps = within(dialog).getAllByRole('button', { expanded: false })
    expect(steps.map(step => step.textContent)).toEqual(['方法 1：手动去掉 dead-skin', '方法 2：退出 DSH 后执行修复命令', '方法 3：交给 DSH 以外的 Agent'])
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ updateAvailable: false }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: `${type}-${++generation}` }) }
      if (url.endsWith(`/operations/${type}-${generation}`)) return { ok: true, json: async () => ({
        id: `${type}-${generation}`, kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(),
        ...(type === 'build' && { failure: { kind: 'build-approval', message: 'blocked native build', action: 'approve-build', packageName: 'node-pty' } }),
      }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    const install = await screen.findByRole('button', { name: '安装并使用' })
    fireEvent.click(install)
    const title = type === 'build' ? '需要批准构建脚本' : '安装未完成'
    fireEvent.click(within(await screen.findByRole('dialog', { name: title })).getByRole('button', { name: type === 'build' ? '取消' : '知道了' }))
    expect(screen.queryByRole('dialog', { name: title })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '安装并使用' }))
    const next = await screen.findByRole('dialog', { name: title })
    expect(generation).toBe(2)
    fireEvent.click(within(next).getByRole('button', { name: '关闭' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/retry'))).toBe(false)
  })

  it.each(['post', 'poll'] as const)('prompts again after a second independent skin installation %s exception', async stage => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
    let attempts = 0
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ updateAvailable: false }) }
      if (url.endsWith('/install') && init?.method === 'POST') {
        attempts += 1
        if (stage === 'post') throw new Error('connection failed')
        return { ok: true, json: async () => ({ operationId: `poll-exception-${attempts}` }) }
      }
      if (url.includes('/operations/poll-exception-')) throw new Error('poll failed')
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime }) }
      if (url.endsWith('/market-update') && init?.method === 'POST') { attempts += 1; throw new Error('request failed') }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.61', latestVersion: '0.1.62', updateAvailable: true }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
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
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime,
        ...(phase === 'waiting' && { profileBusy: '宿主结果尚未确认' }),
        ...(source === 'skin' ? { operations: [operation()] } : { marketUpdateOperation: operation() }),
      }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.61', latestVersion: '0.1.61', updateAvailable: false }) }
      return { ok: true, json: async () => operation() }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    let dialog = await screen.findByRole('dialog', { name: '操作结果待确认' })
    expect(dialog.textContent).toContain('操作结果尚未确认，暂不能修改插件。请等待，或在插件页核对状态。')
    expect(dialog.textContent).not.toContain('native raw result')
    expect(dialog.className).toContain('warningModal')
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '知道了' }))
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent.focus(window)
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
    expect(screen.queryByRole('dialog', { name: '操作结果待确认' })).toBeNull()
    expect(document.querySelector('[role="status"] strong')).toBeNull()
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
    const blockedInstall = screen.queryByRole('button', { name: /^安装(?:并使用)?$/ })
    expect(blockedInstall === null || blockedInstall.hasAttribute('disabled')).toBe(true)
    generation += 1
    fireEvent.focus(window)
    dialog = await screen.findByRole('dialog', { name: '操作结果待确认' })
    phase = 'done'
    fireEvent.focus(window)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '操作结果待确认' })).toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: /^安装(?:并使用)?$/ }).hasAttribute('disabled')).toBe(false))
  })

  it.each(['skin', 'market'] as const)('prompts for a restored %s waiting operation when it later fails, even after acknowledging the wait', async source => {
    let phase = 'waiting'
    const operation = () => ({ id: `${source}-restored-wait`, phase, startedAt: new Date().toISOString(), message: 'Host result',
      ...(source === 'skin' && { kind: 'install', skinId: skin.id }),
      ...(phase === 'failed' && { failure: { kind: 'network', message: 'ECONNRESET', action: 'retry' } }),
    })
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] }
      : url.endsWith('/state') ? { skins: [], runtime: dshRuntime, ...(phase === 'waiting' && { profileBusy: '等待宿主确认' }), ...(source === 'skin' ? { operations: [operation()] } : { marketUpdateOperation: operation() }) }
        : url.endsWith('/market-update') ? { updateAvailable: false } : operation() }))
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    const waiting = await screen.findByRole('dialog', { name: '操作结果待确认' })
    fireEvent.click(within(waiting).getByRole('button', { name: '知道了' }))
    expect(document.querySelector('[role="status"] strong')).toBeNull()
    phase = 'failed'
    fireEvent.focus(window)
    const failure = await screen.findByRole('dialog', { name: source === 'skin' ? '安装 测试皮肤' : '皮肤市场更新失败' })
    expect(failure.textContent).toContain('复制命令，在运行 DSH 的电脑上执行。')
    expect(within(failure).queryByRole('button', { name: '重试' })).toBeNull()
    fireEvent.click(within(failure).getAllByRole('button', { name: '关闭' })[0]!)
    expect(document.querySelector('[role="status"] strong')).toBeNull()
    expect(screen.getByRole('button', { name: '安装并使用' }).hasAttribute('disabled')).toBe(false)
  })

  it.each(['restart', 'waiting'] as const)('keeps a use confirmation in front of a new passive %s prompt without dropping that prompt', async pendingKind => {
    const incompatible = { ...managedDesktopSkin, compatibility: { dsh: '0.1.0-rc.6', platform: ['web', 'desktop'] } }
    let pending = false
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [incompatible] }
      : url.endsWith('/market-update') ? { currentVersion: '0.1.61', latestVersion: '0.1.61', updateAvailable: false }
        : { hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.1-alpha.3' }, management: officialManagement,
          skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }],
          ...(pending && pendingKind === 'restart' && { marketUpdateRestartRequired: true }),
          ...(pending && pendingKind === 'waiting' && { operations: [{ id: 'passive-waiting', kind: 'install', skinId: 'other.skin', phase: 'waiting', startedAt: new Date().toISOString() }] }),
        } }))
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click((await screen.findAllByRole('button', { name: '使用' }))[0]!)
    const use = await screen.findByRole('dialog', { name: '使用前确认' })
    pending = true
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent.focus(window)
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
    expect(visibleWarningDialogs()).toEqual([use])
    const pendingTitle = pendingKind === 'restart' ? '请手动重启 Desktop App' : '操作结果待确认'
    expect(screen.queryByRole('dialog', { name: pendingTitle })).toBeNull()
    fireEvent.click(within(use).getByRole('button', { name: '取消' }))
    const deferred = await screen.findByRole('dialog', { name: pendingTitle })
    expect(visibleWarningDialogs()).toEqual([deferred])
    fireEvent.click(within(deferred).getByRole('button', { name: '知道了' }))
    const afterDismiss = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent.focus(window)
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(afterDismiss))
    await act(async () => {})
    expect(screen.queryByRole('dialog', { name: pendingTitle })).toBeNull()
  })

  it('does not lock an unrelated failure while another retry is still polling', async () => {
    const other = { ...skin, id: 'other.skin', package: 'other-skin', rowId: 'other-skin', name: { zh: '另一皮肤', en: 'Other skin' } }
    let retried = false, completed = false
    const first = { id: 'first-retry-source', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), failure: { kind: 'network', message: 'ECONNRESET', action: 'retry' } }
    let finishPoll!: (response: unknown) => void
    const polling = new Promise(resolve => { finishPoll = resolve })
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin, other] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime, operations: retried ? [{ ...first, id: 'first-retry-running', phase: completed ? 'done' : 'installing', failure: undefined }] : [] }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: JSON.parse(String(init.body)).skinId === other.id ? 'unrelated-failure' : first.id }) }
      if (url.endsWith('/operations/first-retry-source')) return { ok: true, json: async () => first }
      if (url.endsWith('/operations/unrelated-failure')) return { ok: true, json: async () => ({ id: 'unrelated-failure', kind: 'install', skinId: other.id, phase: 'failed', startedAt: new Date().toISOString(), message: 'raw other failure' }) }
      if (url.endsWith('/operations/first-retry-source/retry') && init?.method === 'POST') { retried = true; return { ok: true, json: async () => ({ operationId: 'first-retry-running' }) } }
      if (url.endsWith('/operations/first-retry-running')) return await polling
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    const firstCard = (await screen.findByRole('button', { name: '测试皮肤 界面预览' })).closest('article')!
    fireEvent.click(within(firstCard).getByRole('button', { name: '安装并使用' }))
    const firstDialog = await screen.findByRole('dialog', { name: '安装 测试皮肤' })
    fireEvent.click(within(firstDialog).getAllByRole('button', { name: '关闭' })[0]!)
    const otherCard = screen.getByRole('button', { name: '另一皮肤 界面预览' }).closest('article')!
    fireEvent.click(within(otherCard).getByRole('button', { name: /^安装(?:并使用)?$/ }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: '安装未完成' }).textContent).toContain('另一皮肤'))
    const secondDialog = screen.getByRole('dialog', { name: '安装未完成' })
    expect(within(secondDialog).getByRole('button', { name: '知道了' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(within(secondDialog).getByRole('button', { name: '知道了' }))
    expect(screen.queryByRole('dialog', { name: '安装未完成' })).toBeNull()
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
    expect(notice.why).toContain('请先核对安装目标与安装包文件')
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ hostKind: 'dsh', runningAgentCount: 0, runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: migrated ? 'restart-required' : 'active', pinned: true, installedVersion: '1.0.0', updateAvailable: false, ...(!migrated && { sourceMigration }) }] }) }
      if (url.endsWith('/migrate') && init?.method === 'POST') {
        migrated = true
        return { ok: true, json: async () => ({ operationId: 'migrate-1' }) }
      }
      if (url.endsWith('/operations/migrate-1')) return { ok: true, json: async () => ({ id: 'migrate-1', kind: 'migrate', skinId: skin.id, phase: 'done' }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
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
    expect(await screen.findByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeTruthy()
    expect(screen.queryByText('测试皮肤 已切换到 npm 来源，待重启生效')).toBeNull()
    expect(screen.queryByRole('button', { name: '切换到 npm 来源' })).toBeNull()
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
    expect(screen.queryByRole('button', { name: '切换到 npm 来源' })).toBeNull()
  })

  it.each(['card replacement', 'card update', 'detail update'])('confirms local replacement from the %s entry and sends the approved source context', async entry => {
    let migrated = false
    const sourceMigration = { kind: 'local', target: 'skin@1.0.0', currentSource: 'file:/Users/example/private-skins/local.tgz', currentVersion: '1.1.0-compat.2', targetVersion: '1.0.0', context: 'a'.repeat(64), downgrade: true }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ hostKind: 'dsh', runningAgentCount: 0, runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: migrated ? 'restart-required' : 'active', pinned: true, installedVersion: migrated ? '1.0.0' : sourceMigration.currentVersion, updateAvailable: !migrated, ...(!migrated && { sourceMigration }) }] }) }
      if (url.endsWith('/migrate') && init?.method === 'POST') {
        migrated = true
        return { ok: true, json: async () => ({ operationId: 'local-replacement' }) }
      }
      if (url.endsWith('/operations/local-replacement')) return { ok: true, json: async () => ({ id: 'local-replacement', kind: 'migrate', skinId: skin.id, phase: 'done' }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    if (entry === 'detail update') await openSkinCard(/测试皮肤 已安装卡片/)
    fireEvent.click((await screen.findAllByRole('button', { name: entry === 'card replacement' ? '替换为市场版本' : '更新' }))[0]!)
    const dialog = await screen.findByRole('dialog', { name: '替换为市场版本' })
    expect(dialog.textContent).toContain('当前版本 1.1.0-compat.2 → 市场版本 1.0.0')
    expect(dialog.textContent).toContain('本次将降级到市场版本')
    expect(dialog.textContent).toContain('保留当前启用和常驻状态')
    expect(dialog.textContent).toContain('原始本地文件保留')
    expect(dialog.textContent).toContain('取消不会更换安装来源')
    expect(dialog.textContent).not.toContain(sourceMigration.currentSource)
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)

    fireEvent.click(screen.getAllByRole('button', { name: '替换为市场版本' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: '确认替换' }))
    expect(await screen.findByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeTruthy()
    expect(screen.queryByText('测试皮肤 已替换为市场版本，待重启生效')).toBeNull()
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/migrate') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: skin.id, sourceContext: sourceMigration.context })
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/update') && init?.method === 'POST')).toBe(false)
    expect(screen.queryByRole('button', { name: '替换为市场版本' })).toBeNull()
  })

  it('explains that an incompatible market replacement first disables the selected local skin', async () => {
    const entry = { ...skin, compatibility: { ...skin.compatibility, dsh: '^9.0.0' } }
    const sourceMigration = { kind: 'local', target: 'skin@1.0.0', currentSource: 'file:/tmp/local.tgz', currentVersion: '1.1.0', targetVersion: '1.0.0', context: 'a'.repeat(64), downgrade: true }
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [entry] } : {
      hostKind: 'dsh', runtime: dshRuntime, management: officialManagement,
      skins: [{ skinId: skin.id, installation: 'installed', activation: 'active', primary: true, pinned: true, installedVersion: sourceMigration.currentVersion, updateAvailable: true, sourceMigration }],
    } }))
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click((await screen.findAllByRole('button', { name: '替换为市场版本' }))[0]!)
    const dialog = await screen.findByRole('dialog', { name: '替换为市场版本' })
    expect(dialog.textContent).toContain('目标版本需要兼容性确认，替换后先停用；确认使用或常驻后再启用')
    expect(dialog.textContent).not.toContain('保留当前启用和常驻状态')
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true)
  })

  it.each(['context', 'version'] as const)('requires another confirmation when local replacement %s changes', async changed => {
    let sourceMigration = { kind: 'local' as const, target: 'skin@1.0.0', currentSource: 'link:/Users/example/private-skins/local', currentVersion: '0.9.0', targetVersion: '1.0.0', context: 'a'.repeat(64), downgrade: false }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ hostKind: 'dsh', runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: sourceMigration.currentVersion, updateAvailable: true, sourceMigration }] }) }
      if (url.endsWith('/migrate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'replacement-refreshed' }) }
      if (url.endsWith('/operations/replacement-refreshed')) return { ok: true, json: async () => ({ id: 'replacement-refreshed', kind: 'migrate', skinId: skin.id, phase: 'done' }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click((await screen.findAllByRole('button', { name: '替换为市场版本' }))[0]!)
    expect(screen.getByRole('dialog', { name: '替换为市场版本' }).textContent).toContain('当前版本 0.9.0 → 市场版本 1.0.0')
    expect(screen.getByRole('dialog', { name: '替换为市场版本' }).textContent).not.toContain('本次将降级')
    sourceMigration = changed === 'context'
      ? { ...sourceMigration, context: 'b'.repeat(64) }
      : { ...sourceMigration, currentVersion: '1.1.0', downgrade: true }
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
    fireEvent.click(screen.getByRole('button', { name: '确认替换' }))
    const updated = screen.getByRole('dialog', { name: '替换为市场版本' })
    expect(updated.textContent).toContain('安装来源或版本已变化，请重新确认')
    if (changed === 'version') {
      expect(updated.textContent).toContain('当前版本 1.1.0 → 市场版本 1.0.0')
      expect(updated.textContent).toContain('降级')
    }
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    fireEvent.click(within(updated).getByRole('button', { name: '确认替换' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/migrate') && init?.method === 'POST')).toBe(true))
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/migrate') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: skin.id, sourceContext: sourceMigration.context })
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
    expect(screen.getByRole('dialog', { name: '皮肤详情' })).toBeTruthy()
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(catalogRequests).toBe(2))
    expect(screen.getByRole('heading', { name: '第二皮肤' })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: '皮肤详情' })).toBeTruthy()
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
    expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用皮肤市场更新' })).toBeNull()
  })

  it('explains a Desktop release-age hold without offering a guaranteed-to-fail button', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime }) }
      if (url.endsWith('/market-update') && init?.method === 'POST') return { ok: true, json: async () => ({ currentVersion: '0.1.61', latestVersion: '0.1.61', updateAvailable: false }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.60', latestVersion: '0.1.61', updateAvailable: true,
        updateBlockedReason: '旧版服务推断的新包保护', packageOperationsWarning: '旧版服务推断的安装风险', updateAvailableAt: new Date(Date.now() + 60_000).toISOString() }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    expect(screen.queryByRole('button', { name: '更新皮肤市场到 0.1.61' })).toBeNull()
    expect(await screen.findByText('旧版服务推断的新包保护')).toBeTruthy()
    expect((await screen.findByRole('button', { name: '安装并使用' })).hasAttribute('disabled')).toBe(false)
  })

  it('keeps the real Desktop restart reminder while a market update is available', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      hostKind: 'desktop', restartAvailable: false, skins: [], marketUpdateRestartRequired: true,
    } : url.endsWith('/market-update') ? {
      currentVersion: '0.1.60', latestVersion: '0.1.61', updateAvailable: true,
    } : {} })))
    render(<SkinMarketSection t={key => key} />)
    expect(await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '更新皮肤市场到 0.1.61' }).hasAttribute('disabled')).toBe(false)
  })

  it('requires an explicit exact-version approval before continuing a market update', async () => {
    let approved = false
    const failure = { kind: 'release-age', message: '新包保护', action: 'approve-release-age', releaseAgeTarget: { packageName: 'dsh-skin-market', version: '0.1.61' } }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime }) }
      if (url.endsWith('/market-update') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'market-age-source' }) }
      if (url.endsWith('/market-update/operations/market-age-source/retry') && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ action: 'approve-release-age' })
        approved = true
        return { ok: true, json: async () => ({ operationId: 'market-age-approved' }) }
      }
      if (url.endsWith('/market-update/operations/market-age-source')) return { ok: true, json: async () => ({ id: 'market-age-source', phase: 'failed', startedAt: new Date().toISOString(), failure }) }
      if (url.endsWith('/market-update/operations/market-age-approved')) return { ok: true, json: async () => ({ id: 'market-age-approved', phase: 'done', startedAt: new Date().toISOString(), status: { currentVersion: '0.1.61', latestVersion: '0.1.61', updateAvailable: false } }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.60', latestVersion: '0.1.61', updateAvailable: true }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '更新皮肤市场到 0.1.61' }))
    const dialog = await screen.findByRole('dialog', { name: '更新需要允许新版本' })
    expect(dialog.textContent).toContain('dsh-skin-market@0.1.61')
    expect(dialog.textContent).toContain('确认后只允许此版本，并继续本次更新。')
    expect(dialog.querySelector('details, code, ul, ol')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    expect(approved).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: '允许并继续' }))
    await waitFor(() => expect(approved).toBe(true))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '更新需要允许新版本' })).toBeNull())
    expect(screen.queryByRole('button', { name: '更新皮肤市场到 0.1.61' })).toBeNull()
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
    const updatingButton = await screen.findByRole('button', { name: '皮肤市场更新进行中' })
    expect(updatingButton.hasAttribute('disabled')).toBe(true)
    expect(updatingButton.getAttribute('data-updating')).toBeNull()
    expect((await screen.findAllByText('正在下载皮肤市场')).length).toBe(1)
    expect(document.querySelector('[class*="homeHeader"] [role="status"] strong')?.textContent).toBe('正在下载皮肤市场')
    const banner = screen.getByRole('status')
    const message = within(banner).queryByText('正在下载皮肤市场更新包')
    expect(message === null || message.closest('[hidden]') !== null).toBe(true)
    expect(operationRequests).toBeGreaterThan(0)
  })

  it('renders typed operation messages and progress steps through the English translator', async () => {
    const operation = {
      id: 'english-operation', kind: 'install' as const, skinId: skin.id, phase: 'downloading' as const,
      startedAt: new Date().toISOString(), message: '正在等待其他皮肤操作完成', messageKey: 'common.operationWaitingOther' as const,
      step: '下载并检查安装包', stepKey: 'common.stepDownloadInspect' as const,
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], operation, runtime: dshRuntime }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={createStaticTranslator('en')} />)

    await waitFor(() => expect(screen.getByRole('status').querySelector('strong')?.textContent).toBe('Downloading “Test Skin”'))
    const banner = screen.getByRole('status')
    const detailsButton = within(banner).getByRole('button', { name: 'Details' })
    fireEvent.click(detailsButton)
    expect(within(banner).getByText('Waiting for another skin operation to finish')).toBeTruthy()
    expect(within(banner).getByText('Download and inspect the install package file')).toBeTruthy()
    expect(banner.textContent).not.toContain('正在等待其他皮肤操作完成')
    expect(banner.textContent).not.toContain('下载并检查安装包')
  })

  it.each(['done', 'failed', 'cancelled'] as const)('refreshes host state and unlocks skin actions after a waiting market update becomes %s', async phase => {
    let terminal = false
    let operationRequests = 0
    let stateRequests = 0
    let resolveTerminal!: (value: unknown) => void
    const terminalResult = new Promise<unknown>(resolve => { resolveTerminal = resolve })
    const operation = { id: 'market-waiting', phase, startedAt: '2026-10-14T00:00:00Z' }
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) {
        stateRequests += 1
        return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime, runningAgentCount: 0, marketUpdateOperation: terminal ? operation : null }) }
      }
      if (url.endsWith('/market-update') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: operation.id }) }
      if (url.endsWith('/market-update/operations/market-waiting')) {
        operationRequests += 1
        return { ok: true, json: async () => operationRequests === 1
          ? { ...operation, phase: 'waiting', message: '等待宿主确认市场更新' }
          : terminalResult }
      }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.57', latestVersion: '0.1.58', updateAvailable: true, operation: null }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    const update = await screen.findByRole('button', { name: '更新皮肤市场到 0.1.58' })
    const install = await screen.findByRole('button', { name: '安装并使用' })
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
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runningAgentCount: 0, marketUpdateOperation: null }) }
      if (url.endsWith('/market-update') && init?.method === 'POST') return { ok: true, status: 202, json: async () => ({ operationId: 'market-update-store' }) }
      if (url.endsWith('/logs?operationId=market-update-store')) return { ok: true, text: async () => '# dsh-skin-market diagnostic log\nkind=unexpected-store' }
      if (url.endsWith('/market-update/operations/market-update-store')) {
        return { ok: true, json: async () => ({ id: 'market-update-store', phase: 'failed', startedAt: new Date().toISOString(), message: '当前 profile 的 node_modules 由另一代 pnpm store 链接', failure: { kind: 'unexpected-store', message: '当前 profile 的 node_modules 由另一代 pnpm store 链接' } }) }
      }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.15', latestVersion: '0.1.16', updateAvailable: true, operation: null }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByRole('button', { name: '更新皮肤市场到 0.1.16' }))
    const dialog = await screen.findByRole('dialog', { name: '皮肤市场更新失败' })
    expect(dialog.textContent).toContain('安装目录与当前包管理器的存储位置不一致。')
    expect(dialog.textContent).not.toContain('pnpm store')
    expect(within(dialog).getByRole('link', { name: '查看安装排查' }).getAttribute('href')).toBe(MARKET_INSTALL_TROUBLESHOOT_URL)
    expect(within(dialog).queryByRole('link', { name: '查看手动更新' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: '复制日志' })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '复制日志' }))
    await waitFor(() => expect(clipboard).toHaveBeenCalledWith(expect.stringContaining('kind=unexpected-store')))
  })

  it('keeps a generic market self-update failure on the diagnostic path', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runningAgentCount: 0 }) }
      if (url.endsWith('/market-update') && init?.method === 'POST') return { ok: true, status: 202, json: async () => ({ operationId: 'market-update-generic' }) }
      if (url.endsWith('/market-update/operations/market-update-generic')) {
        return { ok: true, json: async () => ({ id: 'market-update-generic', phase: 'failed', startedAt: new Date().toISOString(), message: 'plugin command exited 1', failure: { kind: 'command', message: 'plugin command exited 1' } }) }
      }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.15', latestVersion: '0.1.16', updateAvailable: true }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '更新皮肤市场到 0.1.16' }))
    const dialog = await screen.findByRole('dialog', { name: '皮肤市场更新失败' })
    expect(dialog.textContent).toContain('复制命令，在运行 DSH 的电脑上执行。')
    expect(within(dialog).queryByRole('link', { name: '查看安装排查' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
  })

  it('turns an empty successful response into a useful Host update error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected end of JSON input') } })))
    render(<SkinMarketSection t={key => key} />)

    expect(await screen.findByText('皮肤市场服务未返回有效数据，请确认 DSH 插件已经更新')).toBeTruthy()
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
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ hostKind: 'dsh', runtime: dshRuntime, skins: [] }) }
      return { ok: true, json: async () => ({}) }
    }))
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
    const sidebarCards = screen.getByRole('complementary', { name: '皮肤列表' }).querySelectorAll<HTMLButtonElement>('button[data-skin-id]')
    expect([...sidebarCards].map(card => card.dataset.skinId)).toEqual(installedSkins.map(item => item.id).reverse())
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(within(screen.getByRole('complementary', { name: '皮肤列表' })).getByRole('group', { name: '排序方式' })).toBeTruthy()
  })

  it('does not render client plugins outside the market catalog in the installed list', async () => {
    const externalPackage = '@captain1275/dsh-client-ui-skin-blue-fantasy'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [skin] } : {
        skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }],
        installedClientPlugins: [{ package: externalPackage, version: '0.3.1', spec: 'github:CAPTAIN1275/dsh-ui-web', rowIds: [], registered: false }],
      },
    })))

    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: /测试皮肤 已安装卡片/ }))

    expect(screen.getByRole('button', { name: '已安装', pressed: true })).toBeTruthy()
    expect(within(screen.getByRole('complementary', { name: '皮肤列表' })).getByRole('button', { name: /测试皮肤/ })).toBeTruthy()
    expect(screen.queryByText(externalPackage)).toBeNull()
    expect(screen.queryByText('市场外客户端插件')).toBeNull()
    expect(screen.queryByText('尚未发现 loader 注册项')).toBeNull()
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

  it('keeps installed skeletons when runtime state arrives before catalog skins', async () => {
    let resolveCatalog!: (value: unknown) => void
    let resolveState!: (value: unknown) => void
    vi.stubGlobal('fetch', vi.fn((url: string) => new Promise(resolve => {
      if (url.endsWith('/catalog')) resolveCatalog = resolve
      else if (url.endsWith('/state')) resolveState = resolve
      else resolve({ ok: true, json: async () => ({}) })
    })))

    render(<SkinMarketSection t={key => key} />)
    expect(await screen.findByRole('status', { name: '正在加载已安装皮肤' })).toBeTruthy()

    await waitFor(() => expect(typeof resolveState).toBe('function'))
    resolveState({ ok: true, json: async () => ({ skins: [{
      skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false,
    }] }) })

    expect(await screen.findByRole('status', { name: '正在加载已安装皮肤' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /测试皮肤 已安装卡片/ })).toBeNull()

    resolveCatalog({ ok: true, json: async () => ({ skins: [skin] }) })
    expect(await screen.findByRole('button', { name: /测试皮肤 已安装卡片/ })).toBeTruthy()
    expect(screen.queryByRole('status', { name: '正在加载已安装皮肤' })).toBeNull()
  })

  it('paints installed cards from the cached catalog without waiting for catalog revalidation', async () => {
    const catalogCache = { read: vi.fn(async () => [skin]), write: vi.fn(async () => undefined) }
    let resolveState!: (value: unknown) => void
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.endsWith('/catalog')) return new Promise(() => undefined)
      if (url.endsWith('/state')) return new Promise(resolve => { resolveState = resolve })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))

    render(<SkinMarketSection t={key => key} catalogCache={catalogCache} />)
    expect(await screen.findByRole('button', { name: /测试皮肤 界面预览/ })).toBeTruthy()
    expect(screen.getByRole('status', { name: '正在加载已安装皮肤' })).toBeTruthy()

    await waitFor(() => expect(typeof resolveState).toBe('function'))
    resolveState({ ok: true, json: async () => ({ skins: [{
      skinId: skin.id, installation: 'installed', activation: 'active', primary: true, installedVersion: '1.0.0', updateAvailable: false,
    }] }) })

    expect(await screen.findByRole('button', { name: /测试皮肤 已安装卡片/ })).toBeTruthy()
    expect(screen.queryByRole('status', { name: '正在加载已安装皮肤' })).toBeNull()
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
    await waitFor(() => expect(screen.getByRole('group', { name: '测试皮肤 操作' }).textContent).toContain('启用中'))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toBe(true))
  })

  it.each(['desktop', 'dsh'] as const)('keeps install-and-use for a %s host whose completed install does not require restart', async hostKind => {
    let installed = false
    let active = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [managedDesktopSkin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({
        hostKind, restartAvailable: hostKind === 'dsh', runtime: { ...dshRuntime, version: '0.2.1-alpha.1' },
        ...(hostKind === 'desktop' ? { management: { ...officialManagement, installRequiresRestart: false } } : {}),
        skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: active ? 'active' : 'inactive', installedVersion: '1.0.0', updateAvailable: false }] : [],
      }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.58', latestVersion: '0.1.58', updateAvailable: false }) }
      if (url.endsWith('/install') && init?.method === 'POST') {
        installed = true
        return { ok: true, json: async () => ({ operationId: 'current-install' }) }
      }
      if (url.endsWith('/operations/current-install')) return { ok: true, json: async () => ({ id: 'current-install', kind: 'install', skinId: skin.id, phase: 'done', restartRequired: false }) }
      if (url.endsWith('/activate') && init?.method === 'POST') {
        active = true
        return { ok: true, json: async () => ({ operationId: 'current-activate' }) }
      }
      if (url.endsWith('/operations/current-activate')) return { ok: true, json: async () => ({ id: 'current-activate', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: false }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const clientRuntime = { setActive: vi.fn(async () => true) }
    render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)
    fireEvent.click(await screen.findByRole('button', { name: hostKind === 'desktop' ? '安装' : '安装并使用' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toBe(true))
    expect(await screen.findAllByRole('button', { name: '停用' })).not.toHaveLength(0)
    if (hostKind === 'desktop') expect(clientRuntime.setActive).not.toHaveBeenCalled()
    else expect(clientRuntime.setActive).toHaveBeenCalledWith(skin.package, true)
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/restart') && init?.method === 'POST')).toBe(false)
  })

  it('does not show a restart prompt when a Web install receipt is followed by an active hot activation', async () => {
    let installed = false
    let active = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({
        hostKind: 'dsh', restartNoticeId: 'hot-receipt', runtime: dshRuntime,
        skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: active ? 'restart-required' : 'inactive', primary: active, clientModule: active, installedVersion: '1.0.0', updateAvailable: false }] : [],
      }) }
      if (url.endsWith('/install') && init?.method === 'POST') {
        installed = true
        return { ok: true, json: async () => ({ operationId: 'hot-install' }) }
      }
      if (url.endsWith('/operations/hot-install')) return { ok: true, json: async () => ({ id: 'hot-install', kind: 'install', skinId: skin.id, phase: 'done', restartRequired: true }) }
      if (url.endsWith('/activate') && init?.method === 'POST') {
        active = true
        return { ok: true, json: async () => ({ operationId: 'hot-activate' }) }
      }
      if (url.endsWith('/operations/hot-activate')) return { ok: true, json: async () => ({ id: 'hot-activate', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: true }) }
      if (url.endsWith('/restart/clear') && init?.method === 'POST') return { ok: true, json: async () => ({ cleared: true, skinId: skin.id }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const clientRuntime = {
      setActive: vi.fn(async () => true),
      probeActive: vi.fn(() => 'active' as const),
      probeSyncing: vi.fn(() => false),
    }
    render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)

    fireEvent.click(await screen.findByRole('button', { name: '安装并使用' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/operations/hot-activate'))).toBe(true))
    expect(screen.queryByRole('button', { name: '重启以应用' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [managedDesktopSkin, oldSkin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({
        hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version },
        management: { ...officialManagement, ...(installHint !== undefined && { installRequiresRestart: installHint }) },
        skins: [
          { skinId: oldSkin.id, installation: 'installed', activation: switched ? 'inactive' : 'active', primary: !switched, installedVersion: '1.0.0', updateAvailable: false },
          ...(installed ? [{ skinId: skin.id, installation: 'installed', activation: switched ? installRestart || switchRestart ? 'restart-required' : 'active' : installRestart ? 'restart-required' : 'inactive', primary: switched, installedVersion: '1.0.0', updateAvailable: false }] : []),
        ],
      }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.58', latestVersion: '0.1.58', updateAvailable: false }) }
      if (url.endsWith('/install') && init?.method === 'POST') {
        installed = true
        return { ok: true, json: async () => ({ operationId: 'alpha3-install' }) }
      }
      if (url.endsWith('/operations/alpha3-install')) return { ok: true, json: async () => ({ id: 'alpha3-install', kind: 'install', skinId: skin.id, phase: 'done', restartRequired: installRestart }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'alpha3-switch' }) }
      if (url.endsWith('/operations/alpha3-switch')) return { ok: true, json: async () => activationResult }
      if (url.endsWith('/uninstall') && init?.method === 'POST') {
        installed = false
        return { ok: true, json: async () => ({ operationId: 'alpha3-remove' }) }
      }
      if (url.endsWith('/operations/alpha3-remove')) return { ok: true, json: async () => ({ id: 'alpha3-remove', kind: 'uninstall', skinId: skin.id, phase: 'done', restartRequired: false }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const clientRuntime = { setActive: vi.fn(async () => true) }
    render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)
    if (entry === 'detail') await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/operations/alpha3-switch'))).toBe(true))
    expect(screen.queryByText(/请手动重启 Desktop App/)).toBeNull()
    expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
    switched = true
    await act(async () => {
      finishActivation({ id: 'alpha3-switch', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: installRestart || switchRestart })
      await activationResult
    })
    if (installRestart || switchRestart) {
      expect(screen.queryByText('测试皮肤 已切换，请手动重启 Desktop App 后生效')).toBeNull()
      expect(screen.queryByText('请手动重启 Desktop App 后生效')).toBeNull()
      const restartDialog = await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })
      expect(restartDialog.textContent).toContain('已启用“测试皮肤”')
      fireEvent.click(within(restartDialog).getByRole('button', { name: '知道了' }))
      expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
      expect(screen.queryByText('测试皮肤 已切换，请手动重启 Desktop App 后生效')).toBeNull()
      if (entry === 'discovery') await openSkinCard()
      fireEvent.click(screen.getAllByRole('button', { name: '查看重启提示' })[0]!)
      expect(screen.getByRole('dialog', { name: '请手动重启 Desktop App' })).toBeTruthy()
      fireEvent.click(within(screen.getByRole('dialog', { name: '请手动重启 Desktop App' })).getByRole('button', { name: '关闭' }))
    } else {
      expect(await screen.findAllByRole('button', { name: '停用' })).not.toHaveLength(0)
      expect(screen.queryByText(/请手动重启 Desktop App/)).toBeNull()
    }
    expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/install') && init?.method === 'POST')).toHaveLength(1)
    expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toHaveLength(1)
    expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/restart') && init?.method === 'POST')).toBe(false)
    expect(clientRuntime.setActive).not.toHaveBeenCalled()
    if (entry === 'detail' && (installRestart || switchRestart)) {
      fireEvent.click(screen.getByRole('button', { name: '卸载' }))
      fireEvent.click(within(await screen.findByRole('dialog', { name: '卸载皮肤' })).getByRole('button', { name: '确认卸载' }))
      await waitFor(() => expect(screen.queryByText('测试皮肤 已切换，请手动重启 Desktop App 后生效')).toBeNull())
    }
  })

  it.each(['catalog', 'activate-post', 'activate-poll', 'activate-refresh'] as const)('keeps a %s exception primary during install-and-use and restores the installation reminder without auto-opening it', async failurePoint => {
    let installed = false
    let activated = false
    let rejectCompletionCatalog: (() => void) | undefined
    let completionCatalogRejected = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) {
        if (installed && failurePoint === 'catalog') throw new Error('catalog temporarily unavailable')
        if (activated && failurePoint === 'activate-refresh') {
          if (completionCatalogRejected) throw new Error('catalog temporarily unavailable')
          return await new Promise((_resolve, reject) => {
            rejectCompletionCatalog = () => { completionCatalogRejected = true; reject(new Error('catalog temporarily unavailable')) }
          })
        }
        return { ok: true, json: async () => ({ skins: [managedDesktopSkin] }) }
      }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({
        hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.1-alpha.3' },
        management: { ...officialManagement, installRequiresRestart: false },
        skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }] : [],
      }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.58', latestVersion: '0.1.58', updateAvailable: false }) }
      if (url.endsWith('/install') && init?.method === 'POST') {
        installed = true
        return { ok: true, json: async () => ({ operationId: 'interrupted-install' }) }
      }
      if (url.endsWith('/operations/interrupted-install')) return { ok: true, json: async () => ({ id: 'interrupted-install', kind: 'install', skinId: skin.id, phase: 'done', restartRequired: true }) }
      if (url.endsWith('/activate') && init?.method === 'POST') {
        if (failurePoint === 'activate-post') throw new Error('activate transport unavailable')
        activated = true
        return { ok: true, json: async () => ({ operationId: 'interrupted-activate' }) }
      }
      if (url.endsWith('/operations/interrupted-activate')) {
        if (failurePoint === 'activate-poll') throw new Error('activate result unavailable')
        return { ok: true, json: async () => ({ id: 'interrupted-activate', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: true }) }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '安装' }))
    if (failurePoint === 'activate-refresh') {
      await waitFor(() => expect(rejectCompletionCatalog).toBeTypeOf('function'))
      expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
      await act(async () => rejectCompletionCatalog!())
    }
    const failure = await screen.findByRole('dialog', { name: failurePoint === 'catalog' ? '安装未完成' : '启用未完成' })
    expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
    expect(screen.queryByText(failurePoint === 'catalog' ? '测试皮肤 已安装，但未启用' : '测试皮肤 已安装，自动切换结果待确认')).toBeNull()
    fireEvent.click(within(failure).getByRole('button', { name: '知道了' }))
    fireEvent.click(screen.getAllByRole('button', { name: '查看重启提示' })[0]!)
    const dialog = await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.58', latestVersion: '0.1.58', updateAvailable: false }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'unmounted-install' }) }
      if (url.endsWith('/operations/unmounted-install')) return { ok: true, json: async () => operationResult }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'unexpected-activate' }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<SkinMarketSection t={key => key} />)
    if (entry === 'detail') await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '安装并使用' }))
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [{ skinId: skin.id, installation: 'installed', activation: 'active', installedVersion: '1.0.0', updateAvailable: false }], runtime: dshRuntime }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.58', latestVersion: '0.1.58', updateAvailable: false }) }
      if (url.endsWith('/deactivate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'unmounted-deactivate' }) }
      if (url.endsWith('/operations/unmounted-deactivate')) return { ok: true, json: async () => operationResult }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin, other] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime, operations: [] }) }
      if (url.endsWith('/install') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { skinId: string }
        return { ok: true, json: async () => ({ operationId: `install-${body.skinId}` }) }
      }
      if (url.includes('/operations/install-')) {
        const id = url.split('/').at(-1)!
        const skinId = id.slice('install-'.length)
        return { ok: true, json: async () => ({
          id, kind: 'install', skinId, phase: skinId === other.id ? 'done' : 'downloading', startedAt: new Date().toISOString(),
        }) }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)

    const first = await screen.findByRole('group', { name: '测试皮肤 操作' })
    const second = await screen.findByRole('group', { name: '另一款皮肤 操作' })
    fireEvent.click(within(first).getByRole('button', { name: '安装并使用' }))
    await waitFor(() => expect(first.textContent).toContain('安装中'))
    const queued = within(second).getByRole('button', { name: '安装' })
    expect(queued.hasAttribute('disabled')).toBe(false)
    expect(within(second).queryByRole('button', { name: '安装并使用' })).toBeNull()
    fireEvent.click(queued)
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/install') && (init as RequestInit | undefined)?.method === 'POST')).toHaveLength(2))
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/activate') && (init as RequestInit | undefined)?.method === 'POST')).toBe(false)
  })

  it.each(['discovery', 'detail'] as const)('keeps the official Desktop %s install as one automatic action and waits for another installation', async entry => {
    const other = { ...managedDesktopSkin, id: 'other.skin', name: { zh: '正在安装的皮肤', en: 'Installing Skin' } }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [managedDesktopSkin, other] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({
        hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.0-rc.2' }, management: { ...officialManagement, installRequiresRestart: true }, skins: [],
        operations: [{ id: 'other-install', skinId: other.id, kind: 'install', phase: 'downloading', startedAt: new Date().toISOString() }],
      }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    if (entry === 'detail') await openSkinCard()
    const region = entry === 'detail' ? screen.getByRole('main', { name: '皮肤详情内容' }) : await screen.findByRole('group', { name: '测试皮肤 操作' })
    const install = within(region).getByRole('button', { name: '安装' })
    expect(install.hasAttribute('disabled')).toBe(true)
    expect(install.getAttribute('title')).toBe('请等待当前安装完成，再安装其他皮肤')
    expect(within(region).queryByRole('button', { name: '仅安装' })).toBeNull()
    expect(within(region).queryByRole('button', { name: '安装并使用' })).toBeNull()
    fireEvent.click(install)
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(false)
  })

  it.each(['discovery', 'detail'] as const)('blocks the official Desktop %s install when the host cannot enable its target', async entry => {
    const reason = '当前宿主无法保存插件启用状态'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : {
      hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.0-rc.2' }, skins: [],
      management: { ...officialManagement, capabilities: { ...officialManagement.capabilities, enable: { available: false, reason } } },
    } })))
    render(<SkinMarketSection t={key => key} />)
    if (entry === 'detail') await openSkinCard()
    const region = entry === 'detail' ? screen.getByRole('main', { name: '皮肤详情内容' }) : await screen.findByRole('group', { name: '测试皮肤 操作' })
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
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [managedDesktopSkin] }
      : url.endsWith('/market-update') ? { updateAvailable: true, currentVersion: '1.0.0', latestVersion: '9.0.0' }
      : {
        hostKind: 'desktop', runtime: { ...dshRuntime, version: '0.2.1-rc.1' }, profileBusy,
        management: { ...officialManagement, capabilities: {
          install: { available: false, reason }, update: { available: false, reason },
          enable: { available: false, reason }, disable: { available: false, reason }, remove: { available: false, reason },
        } },
        skins: [{ skinId: skin.id, installation: 'installed', activation, installedVersion: '0.9.0', updateAvailable: true }],
      } }))
    vi.stubGlobal('fetch', fetchMock)
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
    const detail = screen.getByRole('main', { name: '皮肤详情内容' })
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [managedDesktopSkin, oldSkin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ hostKind: 'desktop', restartAvailable: false, restartNoticeId: 'installation-and-rollback', runtime: { ...dshRuntime, version: '0.2.0-rc.2' }, management: { ...officialManagement, installRequiresRestart: true }, skins: [
        { skinId: oldSkin.id, installation: 'installed', activation: installed ? 'restart-required' : 'active', primary: true, installedVersion: '1.0.0', updateAvailable: false },
        ...(installed ? [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', primary: false, installedVersion: '1.0.0', updateAvailable: false }] : []),
      ] }) }
      if (url.endsWith('/install') && init?.method === 'POST') { installed = true; return { ok: true, json: async () => ({ operationId: 'installed-before-failure' }) } }
      if (url.endsWith('/operations/installed-before-failure')) return { ok: true, json: async () => ({ id: 'installed-before-failure', skinId: skin.id, kind: 'install', phase: 'done', restartRequired: true }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'switch-failed' }) }
      if (url.endsWith('/operations/switch-failed')) return { ok: true, json: async () => ({ id: 'switch-failed', skinId: skin.id, kind: 'activate', phase: 'failed', application, message }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    const failure = await screen.findByRole('dialog', { name: '启用未完成' })
    if (application === 'overridden') {
      expect(failure.textContent).toContain('检查覆盖来源')
      expect(failure.textContent).not.toContain('重启无法')
    } else {
      expect(failure.textContent).toContain('未能完成本次操作。请复制日志反馈。')
      expect(failure.textContent).not.toContain(message)
    }
    expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
    expect(screen.queryByText('测试皮肤 已安装，但未启用')).toBeNull()
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
    expect(screen.getByRole('dialog', { name: '启用未完成' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
    fireEvent.click(within(failure).getByRole('button', { name: '知道了' }))
    fireEvent.click(screen.getByRole('button', { name: '查看重启提示' }))
    const dialog = await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })
    expect(dialog.textContent).toContain('已安装，但尚未启用')
    expect(dialog.textContent).not.toContain('自动切换尚未完成')
    expect(dialog.textContent).not.toContain('重启后可使用')
    expect(dialog.textContent).not.toContain('已启用“测试皮肤”')
    expect(dialog.textContent).not.toContain('“原皮肤”的设置')
    expect(screen.queryByText('测试皮肤 已切换，请手动重启 Desktop App 后生效')).toBeNull()
  })

  it('installs without optional warnings and asks once only before the install-and-use activation', async () => {
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [incompatible] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'op-incompatible' }) }
      if (url.endsWith('/operations/op-incompatible')) return { ok: true, json: async () => ({ id: 'op-incompatible', kind: 'install', skinId: skin.id, phase: 'done' }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'op-activate' }) }
      if (url.endsWith('/operations/op-activate')) return { ok: true, json: async () => ({ id: 'op-activate', kind: 'activate', skinId: skin.id, phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '仅安装' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/install'))).toHaveLength(1))
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url]) => url.endsWith('/install'))?.[1]?.body))).toEqual({ skinId: skin.id })
    fireEvent.click(screen.getByRole('button', { name: '安装并使用' }))
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    expect(dialog.textContent).toContain('不在作者声明的兼容范围')
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/install'))).toHaveLength(2)
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '安装并使用' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: '使用前确认' })).getByRole('button', { name: '仍然使用' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/activate'))).toHaveLength(1))
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url]) => url.endsWith('/activate'))?.[1]?.body))).toEqual({ skinId: skin.id, acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(incompatible, dshRuntime) })
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
  })

  it.each(['discovery', 'detail'])('updates an incompatible skin in the %s view without optional risk confirmation', async entry => {
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [incompatible] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '0.9.0', updateAvailable: true }] }) }
      if (url.endsWith('/update') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'incompatible-update' }) }
      if (url.endsWith('/operations/incompatible-update')) return { ok: true, json: async () => ({ id: 'incompatible-update', kind: 'update', skinId: skin.id, phase: 'done' }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    if (entry === 'detail') {
      fireEvent.click(await screen.findByRole('button', { name: '测试皮肤 已安装卡片' }))
    }
    fireEvent.click((await screen.findAllByRole('button', { name: '更新' }))[0]!)
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/update') && init?.method === 'POST')).toHaveLength(1))
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/update') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: skin.id })
  })

  it('migrates after source confirmation without an optional compatibility warning', async () => {
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    const sourceMigration = { target: 'skin@1.0.0', currentSource: skin.install.target }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [incompatible] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false, sourceMigration }] }) }
      if (url.endsWith('/migrate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'incompatible-migrate' }) }
      if (url.endsWith('/operations/incompatible-migrate')) return { ok: true, json: async () => ({ id: 'incompatible-migrate', kind: 'migrate', skinId: skin.id, phase: 'done' }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click((await screen.findAllByRole('button', { name: '切换到 npm 来源' }))[0]!)
    fireEvent.click(screen.getByRole('button', { name: '确认切换到 npm 来源' }))
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/migrate') && init?.method === 'POST')).toBe(true))
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/migrate') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: skin.id })
  })

  it('installs on official Desktop before asking once for automatic activation', async () => {
    const incompatible = { ...managedDesktopSkin, compatibility: { dsh: '0.1.0-rc.6', platform: ['web', 'desktop'] } }
    let installed = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [incompatible] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.0-rc.2' }, management: { ...officialManagement, installRequiresRestart: true }, skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }] : [] }) }
      if (url.endsWith('/install') && init?.method === 'POST') { installed = true; return { ok: true, json: async () => ({ operationId: 'incompatible-desktop' }) } }
      if (url.endsWith('/operations/incompatible-desktop')) return { ok: true, json: async () => ({ id: 'incompatible-desktop', kind: 'install', skinId: skin.id, phase: 'done', restartRequired: true }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'incompatible-desktop-activate' }) }
      if (url.endsWith('/operations/incompatible-desktop-activate')) return { ok: true, json: async () => ({ id: 'incompatible-desktop-activate', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: true }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    expect(dialog.textContent).toContain('不在作者声明的兼容范围')
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/install') && init?.method === 'POST')).toBe(true)
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: '仍然使用' }))
    expect(await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })).toBeTruthy()
    expect(screen.queryByText('测试皮肤 已切换，请手动重启 Desktop App 后生效')).toBeNull()
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/install') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: skin.id })
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: skin.id, acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(incompatible, { ...dshRuntime, version: '0.2.0-rc.2' }) })
  })

  it.each(['unmount', 'profile-busy'])('does not start an incompatible activation if %s interrupts its confirmation', async interruption => {
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    let profileBusy = false
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [incompatible] } : url.endsWith('/state') ? { skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }], runtime: dshRuntime, ...(profileBusy && { profileBusy: '当前 profile 正在等待宿主确认' }) } : {} }))
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [currentSkin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }], runtime: dshRuntime }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'refreshed-install' }) }
      if (url.endsWith('/operations/refreshed-install')) return { ok: true, json: async () => ({ id: 'refreshed-install', kind: 'activate', skinId: skin.id, phase: 'done' }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    const warning = await screen.findByRole('dialog', { name: '使用前确认' })
    expect(warning.textContent).toContain('版本 1.0.0')
    const originalContext = compatibilityContext(original, dshRuntime)

    currentSkin = updated
    fireEvent.focus(window)
    await waitFor(() => expect(screen.getByRole('dialog', { name: '皮肤详情' }).textContent).toContain('版本 2.0.0'))
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [installed ? updated : original] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ runtime: dshRuntime, skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: true }] : [] }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'changed-before-use-install' }) }
      if (url.endsWith('/operations/changed-before-use-install')) {
        installed = true
        return { ok: true, json: async () => ({ id: 'changed-before-use-install', kind: 'install', skinId: skin.id, phase: 'done' }) }
      }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'changed-before-use-activate' }) }
      if (url.endsWith('/operations/changed-before-use-activate')) return { ok: true, json: async () => ({ id: 'changed-before-use-activate', kind: 'activate', skinId: skin.id, phase: 'done' }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '安装并使用' }))
    const useConfirmation = await screen.findByRole('button', { name: '仍然使用' })
    expect(screen.getByRole('dialog', { name: '使用前确认' }).textContent).toContain('版本 2.0.0')
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

    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: '安装并使用' }))
    expect(screen.queryByRole('button', { name: '确认重启' })).toBeNull()
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(true))
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '安装已阻止' })).toBeNull()
  })

  it('offers a prompt and a single executable command for manual Web installation', async () => {
    const manual = { ...skin, review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'manual-only' as const } }
    const writeText = vi.fn(async () => undefined)
    const open = vi.fn()
    Object.assign(navigator, { clipboard: { writeText } })
    vi.stubGlobal('open', open)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [manual] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    expect(dialog.textContent).toContain('提示词')
    expect(dialog.textContent).toContain('命令')
    expect(dialog.textContent).not.toContain('也可自行打开「插件 → 添加插件」，输入：')
    expect(dialog.textContent).not.toContain('该皮肤需要 Agent 协助安装')
    expect(screen.getByRole('button', { name: '复制命令' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '复制提示词' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull()
    expect((screen.getByRole('textbox', { name: '插件包名' }) as HTMLInputElement).value).toBe(manual.install.target)
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
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog')
        ? { skins: [manual] }
        : { hostKind: 'desktop', skins: [] },
    }))
    const writeText = vi.fn(async () => undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    await waitFor(() => expect(dialog.textContent).toContain('无法自动安装：未找到可供 Desktop 安装的 npm 包'))
    expect(dialog.textContent).toContain('插件包名')
    expect(dialog.textContent).toContain('打开「插件 → 添加插件」，输入：')
    expect(dialog.textContent).toContain('桌面端由你在插件页操作')
    expect(screen.getByRole('textbox', { name: '插件包名' })).toHaveProperty('value', createSkinInstallInputs(manual)[0]!.value)
    expect(screen.queryByRole('button', { name: '复制命令' })).toBeNull()
    expect([...dialog.querySelectorAll('code')].map(node => node.textContent)).toEqual([createSkinInstallPrompt(manual, 'desktop')])
    expect(dialog.textContent).not.toContain('dsh plugin --profile web')
    fireEvent.click(within(dialog).getByRole('button', { name: '复制提示词' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(createSkinInstallPrompt(manual, 'desktop')))
    expect(dialog.textContent).not.toContain('手动安装路径')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(false)
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [github] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({
        hostKind: 'desktop', runtime: { ...dshRuntime, version: '0.2.1-alpha.3' }, management: officialManagement,
        skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: active ? 'active' : 'inactive', installedVersion: '1.0.0', updateAvailable: false }] : [],
      }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ updateAvailable: false }) }
      if (url.endsWith('/install') && init?.method === 'POST') { installed = true; return { ok: true, json: async () => ({ operationId: 'github-install' }) } }
      if (url.endsWith('/activate') && init?.method === 'POST') { active = true; return { ok: true, json: async () => ({ operationId: 'github-activate' }) } }
      if (url.endsWith('/operations/github-install')) return { ok: true, json: async () => ({ id: 'github-install', kind: 'install', skinId: skin.id, phase: 'done' }) }
      if (url.endsWith('/operations/github-activate')) return { ok: true, json: async () => ({ id: 'github-activate', kind: 'activate', skinId: skin.id, phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} desktopPluginPanel={{ available: () => true, open }} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toBe(true))
    expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/install') && init?.method === 'POST')).toHaveLength(1)
    expect(open).not.toHaveBeenCalled()
    expect(await screen.findAllByRole('button', { name: '停用' })).not.toHaveLength(0)
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
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog')
      ? { skins: [manual] }
      : { hostKind: 'desktop', runtime: dshRuntime, management: officialManagement, skins: [] } }))
    vi.stubGlobal('fetch', fetchMock)
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
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog')
      ? { skins: [managedDesktopSkin] }
      : { hostKind: 'desktop', runtime: dshRuntime, management: officialManagement,
        skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }] : [] } }))
    vi.stubGlobal('fetch', fetchMock)
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [managedDesktopSkin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ hostKind: 'desktop', runtime: dshRuntime, management: officialManagement,
        skins: [{ skinId: skin.id, installation: 'installed', activation: active ? 'active' : 'inactive', installedVersion: '1.0.0', updateAvailable: false }] }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ updateAvailable: false }) }
      if (url.endsWith('/activate') && init?.method === 'POST') { active = true; return { ok: true, json: async () => ({ operationId: 'native-activate' }) } }
      if (url.endsWith('/operations/native-activate')) return { ok: true, json: async () => ({ id: 'native-activate', kind: 'activate', skinId: skin.id, phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    let notify!: () => void
    render(<SkinMarketSection t={key => key} desktopPluginPanel={{ available: () => true, open: vi.fn(), takeActivationIntent,
      observe: listener => { notify = listener; return () => undefined } }} />)
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: accept ? '确认使用' : '取消' }))
    if (accept) expect(await screen.findAllByRole('button', { name: '停用' })).not.toHaveLength(0)
    act(() => notify())
    await waitFor(() => expect(takeActivationIntent.mock.calls.length).toBeGreaterThan(1))
    expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toHaveLength(accept ? 1 : 0)
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
  })

  it('returns an unhandled native enable intent when leaving its confirmation', async () => {
    window.localStorage.removeItem('dsh-skin-market:activation-warning-accepted')
    const intent = { skinId: skin.id, packageName: skin.package, spec: managedDesktopSkin.install.target, requestId: 'native-unmount' }
    let pending: typeof intent | null = intent
    const restoreActivationIntent = vi.fn((value: typeof intent) => { pending = value })
    const panel = { available: () => true, open: vi.fn(), observe: () => () => undefined,
      takeActivationIntent: () => { const value = pending; pending = null; return value }, restoreActivationIntent }
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog')
      ? { skins: [managedDesktopSkin] }
      : { hostKind: 'desktop', runtime: dshRuntime, management: officialManagement,
        skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }] } }))
    vi.stubGlobal('fetch', fetchMock)
    const first = render(<SkinMarketSection t={key => key} desktopPluginPanel={panel} />)
    await screen.findByRole('dialog', { name: '使用前确认' })
    first.unmount()
    expect(restoreActivationIntent).toHaveBeenCalledOnce()
    render(<SkinMarketSection t={key => key} desktopPluginPanel={panel} />)
    fireEvent.click(within(await screen.findByRole('dialog', { name: '使用前确认' })).getByRole('button', { name: '取消' }))
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [managedDesktopSkin] }) }
      if (url.endsWith('/state')) {
        const snapshot = state()
        if (hold) { hold = false; return await new Promise(resolve => { release = resolve }) }
        return { ok: true, json: async () => snapshot }
      }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'native-race-activate' }) }
      if (url.endsWith('/operations/native-race-activate')) return { ok: true, json: async () => ({ id: 'native-race-activate', kind: 'activate', skinId: skin.id, phase: 'done' }) }
      return { ok: true, json: async () => ({ updateAvailable: false }) }
    })
    vi.stubGlobal('fetch', fetchMock)
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
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog')
      ? { skins: [managedDesktopSkin] }
      : { hostKind: 'desktop', restartAvailable: false, runtime: dshRuntime, management: officialManagement,
        skins: [{ skinId: skin.id, installation: 'installed', activation: 'active', clientModule: true, installedVersion: '1.0.0', updateAvailable: false }] } })))
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
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog')
      ? { skins: [manual] }
      : { hostKind: 'desktop', runtime: dshRuntime, management: officialManagement, skins: [] } })))
    render(<SkinMarketSection t={key => key} desktopPluginPanel={{ available: () => true, open }} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '其他安装方式' }))
    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    expect(within(dialog).getByRole('textbox', { name: '插件包名' })).toHaveProperty('value', main)
    expect(dialog.querySelector('code')?.textContent).toContain(companion)
    expect(within(dialog).getByRole('button', { name: '复制插件包名' })).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: '安装' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '打开添加插件' })).toBeNull()
    expect(open).not.toHaveBeenCalled()
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ hostKind: 'dsh', runtime: dshRuntime, skins: [{
        skinId: skin.id, installation: installed ? 'installed' : 'missing', activation: activated ? 'active' : 'inactive',
        installedVersion: installed ? skin.install.version : undefined, updateAvailable: false,
      }] }) }
      if (url.endsWith('/install') && init?.method === 'POST') { installed = true; return { ok: true, json: async () => ({ operationId: installOperation.id }) } }
      if (url.endsWith('/activate') && init?.method === 'POST') { activated = true; return { ok: true, json: async () => ({ operationId: activateOperation.id }) } }
      if (url.endsWith(`/operations/${installOperation.id}`)) return { ok: true, json: async () => installOperation }
      if (url.endsWith(`/operations/${activateOperation.id}`)) return { ok: true, json: async () => activateOperation }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(screen.getByRole('button', { name: '安装并使用' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toHaveLength(1))
    expect(activated).toBe(true)
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

    const pin = await screen.findByRole('button', { name: '设为常驻' })
    expect(pin.getAttribute('title')).toContain('宠物、音效')
    fireEvent.click(pin)
    const dialog = screen.getByRole('dialog', { name: '使用前确认' })
    expect(dialog.textContent).toContain('设为常驻后，其他皮肤仍可同时使用。')
    expect(dialog.querySelector('ul, ol, code, a, details')).toBeNull()
    expect(screen.getByRole('button', { name: '确认设为常驻' })).toBeTruthy()
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
    expect(screen.getByRole('status', { name: '正在加载已安装皮肤' })).toBeTruthy()
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

  it('renders complete discovery rows in 24-item batches as the settings feed scrolls', async () => {
    const skins = Array.from({ length: HOME_CATALOG_BATCH_SIZE * 2 + 5 }, (_, index) => ({
      ...skin,
      id: `test.skin-${index}`,
      package: `skin-${index}`,
      name: { zh: `测试皮肤 ${index}`, en: `Test Skin ${index}` },
      githubStars: HOME_CATALOG_BATCH_SIZE * 2 + 5 - index,
    }))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins } : { skins: [] } })))
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
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins } : { skins: [] } })))
    const view = render(<div style={{ overflowY: hostKind === 'element' ? 'auto' : 'visible' }}><SkinMarketSection t={key => key} layout="embedded" /></div>)
    await screen.findByRole('button', { name: /测试皮肤 0 界面预览/ })
    const count = () => screen.getAllByRole('button', { name: /测试皮肤 \d+ 界面预览/ }).length
    const loadObserver = () => observers.filter(observer => String(observer.target?.className).includes('homeLoadMore')).at(-1)!
    expect(count()).toBe(HOME_CATALOG_BATCH_SIZE)
    const first = loadObserver()
    expect(first.options.root).toBe(hostKind === 'element' ? view.container.firstElementChild : null)
    expect(first.options.rootMargin).toBe('560px 0px')
    expect(count() % 3).toBe(0)
    expect(count() % 2).toBe(0)
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
    fireEvent.click(within(screen.getByRole('dialog', { name: '皮肤详情' })).getByRole('button', { name: '关闭' }))
    const resumed = loadObserver()
    expect(resumed).not.toBe(second)
    act(() => resumed.emit(true))
    await waitFor(() => expect(count()).toBe(skins.length))
    expect(resumed.disconnect).toHaveBeenCalledOnce()
    view.unmount()
  })

  it.each(['element', 'window'] as const)('compacts the embedded header from the %s host scroll position and restores it on return', async hostKind => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] } })))
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
    fireEvent.click(within(screen.getByRole('dialog', { name: '皮肤详情' })).getByRole('button', { name: '关闭' }))
    expect(header.dataset.compact).toBeUndefined()
    scroll(403)
    expect(header.dataset.compact).toBe('true')
    scroll(346)
    expect(header.dataset.compact).toBeUndefined()
  })

  it('places a live operation below the docked discovery toolbar', async () => {
    const startedAt = new Date().toISOString()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog')
      ? { skins: [skin] }
      : { skins: [], operations: [{ id: 'installing', skinId: skin.id, kind: 'install', phase: 'downloading', startedAt }] } })))
    render(<SkinMarketSection t={key => key} />)
    await screen.findByText('正在下载“测试皮肤”')

    const header = document.querySelector('header')!
    const title = document.querySelector('[class*="discoverTitle"]') as HTMLElement
    const feed = document.querySelector('[class*="homeContent"]')!
    vi.spyOn(title, 'getBoundingClientRect').mockReturnValue({ top: 0, height: 28 } as DOMRect)
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 100 } as DOMRect)
    vi.spyOn(feed, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect)
    fireEvent.scroll(feed)

    const docked = await within(header).findByRole('heading', { name: '发现更多' })
    const banner = within(header).getByRole('status')
    expect(docked.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows all embedded results when viewport observation is unavailable', async () => {
    const skins = Array.from({ length: HOME_CATALOG_BATCH_SIZE + 5 }, (_, index) => ({
      ...skin, id: `test.skin-${index}`, package: `skin-${index}`,
      name: { zh: `测试皮肤 ${index}`, en: `Test Skin ${index}` },
    }))
    vi.stubGlobal('IntersectionObserver', undefined)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} layout="embedded" />)
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

  it('shows the first-use notice once in the existing use confirmation and cancels without changing state', async () => {
    window.localStorage.removeItem('dsh-skin-market:activation-warning-accepted')
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }] }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return await new Promise(() => undefined)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    expect(dialog.textContent).toContain('使用后会停用其他未设为常驻的皮肤。')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(window.localStorage.getItem('dsh-skin-market:activation-warning-accepted')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: '使用前确认' })).getByRole('button', { name: '确认使用' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(true))
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
    expect(window.localStorage.getItem('dsh-skin-market:activation-warning-accepted')).toBe('true')
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
    expect(await screen.findByText('重启会断开当前会话连接，请先保存工作。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '确认重启' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy()
  })

  it('clears a Web selection restart receipt when the client module is already active', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => ({
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
    vi.stubGlobal('fetch', fetchMock)
    const clientRuntime = {
      setActive: vi.fn(async () => true),
      probeActive: vi.fn(() => 'active' as const),
      probeSyncing: vi.fn(() => false),
    }
    render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)

    expect(await screen.findAllByText('使用中')).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: '重启以应用' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/restart/clear') && init?.method === 'POST')).toBe(true)
  })

  it('shows the official Desktop restart instruction without posting to the market restart route', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => ({
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
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    expect(await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重启以应用' })).toBeNull()
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/restart') && init?.method === 'POST')).toBe(false)
  })

  it('shows an unavailable component honestly and lets Use retry its activation without suggesting restart', async () => {
    let activated = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [managedDesktopSkin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({
        instanceId: 'component-session', hostKind: 'desktop', restartAvailable: false, runtime: dshRuntime, management: officialManagement,
        skins: [{ skinId: skin.id, installation: 'installed', activation: activated ? 'active' : 'unavailable', primary: true, installedVersion: '1.0.0', updateAvailable: false,
          ...(!activated && { error: '皮肤组件已关闭，尚未生效。' }) }],
      }) }
      if (url.endsWith('/activate') && init?.method === 'POST') { activated = true; return { ok: true, json: async () => ({ operationId: 'enable-component' }) } }
      if (url.endsWith('/operations/enable-component')) return { ok: true, json: async () => ({ id: 'enable-component', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: false }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    expect(screen.getAllByText('未生效').length).toBeGreaterThan(0)
    expect(screen.getByText('皮肤组件已关闭，尚未生效。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '停用' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /重启/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重新使用' }))
    await waitFor(() => expect(screen.queryByText('皮肤组件已关闭，尚未生效。')).toBeNull())
    expect(screen.getAllByText('使用中').length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
  })

  it.each(['active', 'unavailable', 'removed'] as const)('restores a real pending skin once, then clears every restart reminder after it becomes %s', async outcome => {
    let restarted = false
    let routeRevision = 0
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      instanceId: restarted ? 'after-restart' : `before-restart-${routeRevision}`, restartNoticeId: 'stable-pending-group', hostKind: 'desktop', restartAvailable: false, management: officialManagement,
      skins: restarted && outcome === 'removed' ? [] : [{ skinId: skin.id, installation: 'installed', activation: restarted ? outcome : 'restart-required', primary: true, lastOperatedAt: `2026-10-15T01:00:0${routeRevision}Z`, installedVersion: '1.0.0', updateAvailable: false,
        ...(restarted && outcome === 'unavailable' && { error: '皮肤组件已关闭，尚未生效。' }) }],
    } : {} }))
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<SkinMarketSection t={key => key} />)
    fireEvent.click(within(await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })).getByRole('button', { name: '知道了' }))
    routeRevision += 1
    const beforeFocus = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(beforeFocus))
    expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
    view.unmount()
    render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('button', { name: /测试皮肤 已安装卡片/ })
    expect(screen.queryByText('测试皮肤 设置已保存，请手动重启 Desktop App 后生效')).toBeNull()
    expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '查看重启提示' }))
    expect(screen.getByRole('dialog', { name: '请手动重启 Desktop App' })).toBeTruthy()
    restarted = true
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull())
    expect(screen.queryByText(/设置已保存，请手动重启/)).toBeNull()
    expect(screen.queryByRole('button', { name: '查看重启提示' })).toBeNull()
    await openSkinCard()
    expect(screen.queryByText('待重启')).toBeNull()
    expect(screen.queryByRole('button', { name: '重启以应用' })).toBeNull()
    if (outcome === 'unavailable') expect(screen.getByText('皮肤组件已关闭，尚未生效。')).toBeTruthy()
  })

  it.each(['skin', 'market-update'] as const)('keeps an acknowledged %s restart notice closed across polling and remount, then shows a new receipt', async target => {
    let receipt = 'first-change'
    let pending = true
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      instanceId: 'same-desktop-process', restartNoticeId: receipt, marketUpdateNoticeId: receipt, hostKind: 'desktop', restartAvailable: false, management: officialManagement,
      marketUpdateRestartRequired: pending && target === 'market-update',
      skins: [{ skinId: skin.id, installation: 'installed', activation: pending && target === 'skin' ? 'restart-required' : 'active', primary: true, installedVersion: '1.0.0', updateAvailable: false }],
    } : {} }))
    vi.stubGlobal('fetch', fetchMock)
    const intervalSpy = vi.spyOn(window, 'setInterval')
    const view = render(<SkinMarketSection t={key => key} />)
    const pollRefresh = intervalSpy.mock.calls.find(([, delay]) => delay === 5 * 60 * 1000)?.[0]
    intervalSpy.mockRestore()
    expect(typeof pollRefresh).toBe('function')
    fireEvent.click(within(await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })).getByRole('button', { name: '知道了' }))
    const bannerTitle = target === 'skin' ? '测试皮肤 设置已保存，请手动重启 Desktop App 后生效' : '皮肤市场已更新，请手动重启 Desktop App 后生效'
    expect(screen.queryByText(bannerTitle)).toBeNull()
    await act(async () => { (pollRefresh as () => void)() })
    expect(screen.queryByText(bannerTitle)).toBeNull()
    const refreshState = async () => {
      const previous = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
      fireEvent(window, new Event('focus'))
      await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(previous))
    }
    await refreshState()
    expect(screen.queryByText(bannerTitle)).toBeNull()
    expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
    view.unmount()
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    expect(screen.queryByText(bannerTitle)).toBeNull()
    if (target === 'skin') {
      expect(screen.getAllByText('待重启').length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: '查看重启提示' })).toBeTruthy()
    }
    receipt = 'second-change'
    await refreshState()
    expect(screen.queryByText(bannerTitle)).toBeNull()
    expect(screen.getByRole('dialog', { name: '请手动重启 Desktop App' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog', { name: '请手动重启 Desktop App' })).getByRole('button', { name: '知道了' }))
    expect(screen.queryByText(bannerTitle)).toBeNull()
    pending = false
    await refreshState()
    expect(screen.queryByText(bannerTitle)).toBeNull()
    pending = true
    await refreshState()
    expect(screen.queryByText(bannerTitle)).toBeNull()
    expect(screen.getByRole('dialog', { name: '请手动重启 Desktop App' })).toBeTruthy()
  })

  it('clears every restart reminder when the same Desktop process confirms the skin became active', async () => {
    let active = false
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      instanceId: 'same-desktop-process', restartNoticeId: 'hot-applied-selection', hostKind: 'desktop', restartAvailable: false, management: officialManagement,
      skins: [{ skinId: skin.id, installation: 'installed', activation: active ? 'active' : 'restart-required', primary: true, installedVersion: '1.0.0', updateAvailable: false }],
    } : {} }))
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    expect(await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })).toBeTruthy()

    active = true
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull())
    expect(screen.queryByText(/设置已保存，请手动重启/)).toBeNull()
    expect(screen.queryByRole('button', { name: '查看重启提示' })).toBeNull()
    await openSkinCard()
    expect(screen.getAllByText('使用中').length).toBeGreaterThan(0)
    expect(screen.queryByText('待重启')).toBeNull()
    expect(screen.queryByRole('button', { name: '重启以应用' })).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/restart'))).toBe(false)
  })

  it('uses confirmed active Desktop state to clear an activation operation restart hint', async () => {
    let active = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [managedDesktopSkin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ instanceId: 'hot-activation', hostKind: 'desktop', restartAvailable: false, management: officialManagement,
        skins: [{ skinId: skin.id, installation: 'installed', activation: active ? 'active' : 'inactive', primary: active, installedVersion: '1.0.0', updateAvailable: false }] }) }
      if (url.endsWith('/activate') && init?.method === 'POST') { active = true; return { ok: true, json: async () => ({ operationId: 'hinted-restart' }) } }
      if (url.endsWith('/operations/hinted-restart')) return { ok: true, json: async () => ({ id: 'hinted-restart', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: true }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    await waitFor(() => expect(screen.getAllByText('使用中').length).toBeGreaterThan(0))
    expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
    expect(screen.queryByRole('button', { name: '查看重启提示' })).toBeNull()
    expect(screen.queryByText('待重启')).toBeNull()
  })

  it('opens the restart dialog when an applied operation still leaves an explicit pending restart in refreshed state', async () => {
    let used = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [managedDesktopSkin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ instanceId: 'applied-with-pending', hostKind: 'desktop', restartAvailable: false, management: officialManagement,
        skins: [{ skinId: skin.id, installation: 'installed', activation: used ? 'restart-required' : 'inactive', primary: used, installedVersion: '1.0.0', updateAvailable: false }] }) }
      if (url.endsWith('/activate') && init?.method === 'POST') { used = true; return { ok: true, json: async () => ({ operationId: 'applied-but-pending' }) } }
      if (url.endsWith('/operations/applied-but-pending')) return { ok: true, json: async () => ({ id: 'applied-but-pending', kind: 'activate', skinId: skin.id, phase: 'done', restartRequired: false }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    expect(await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })).toBeTruthy()
    expect(screen.getAllByText('待重启').length).toBeGreaterThan(0)
  })

  it('does not present a restart dialog for an unresolved operation even if an earlier pending fact is restored', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      instanceId: 'unknown-result', hostKind: 'desktop', restartAvailable: false,
      skins: [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }],
      operations: [{ id: 'unknown-use', kind: 'activate', skinId: skin.id, phase: 'waiting', startedAt: '2026-10-15T00:00:00Z', message: '宿主未返回可确认的操作结果' }],
    } : {} })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    expect(screen.queryByText('宿主未返回可确认的操作结果')).toBeNull()
    expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
    expect(screen.queryByRole('button', { name: '查看重启提示' })).toBeNull()
  })

  it('clears the self-update reminder and its open dialog when the restarted Host clears its pending flag', async () => {
    let pending = true
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      instanceId: pending ? 'old-market' : 'new-market', hostKind: 'desktop', restartAvailable: false, skins: [], marketUpdateRestartRequired: pending,
    } : {} })))
    render(<SkinMarketSection t={key => key} />)
    expect(await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })).toBeTruthy()
    pending = false
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull())
    expect(screen.queryByText(/皮肤市场已更新/)).toBeNull()
    expect(screen.queryByRole('button', { name: '查看重启提示' })).toBeNull()
  })

  it('waits for ongoing installations before manual restart and describes the chosen restart target', async () => {
    let installing = true
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      hostKind: 'desktop', restartAvailable: false, marketUpdateRestartRequired: true,
      skins: [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }],
      operations: installing ? [{ id: 'other-install', skinId: 'other.skin', kind: 'install', phase: 'downloading', startedAt: new Date().toISOString() }] : [],
    } : {} }))
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    const marketDialog = await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })
    expect(marketDialog.textContent).toContain('还有 1 款皮肤正在安装或更新')
    expect(marketDialog.textContent).toContain('请等待操作完成后再重启。')
    expect(marketDialog.textContent).not.toContain('完全退出 Desktop App')
    fireEvent.click(within(marketDialog).getByRole('button', { name: '知道了' }))
    installing = false
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
    await openSkinCard()
    const details = screen.getByRole('main', { name: '皮肤详情内容' })
    expect(within(details).getByText('待重启')).toBeTruthy()
  })

  it('keeps the official Desktop self-update flow host-managed after the package is written', async () => {
    let updated = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({
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
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)

    fireEvent.click(await screen.findByRole('button', { name: '更新皮肤市场到 0.1.57' }))
    expect(screen.queryByText('皮肤市场已更新，请手动重启 Desktop App 后生效')).toBeNull()
    const restartDialog = await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })
    expect(restartDialog.textContent).toContain('皮肤市场已更新，重启后生效。')
    expect(restartDialog.textContent).toContain('完全退出 Desktop App 后重新打开')
    expect(within(restartDialog).getAllByRole('button')).toHaveLength(2)
    expect(screen.queryByText('请手动重启 Desktop App 后生效')).toBeNull()
    expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用皮肤市场更新' })).toBeNull()
    expect(fetchMock.mock.calls.some(([url, request]) => url.endsWith('/restart') && request?.method === 'POST')).toBe(false)
  })

  it.each([
    ['activate', '使用', true], ['activate', '使用', false],
    ['deactivate', '停用', true], ['deactivate', '停用', false],
    ['update', '更新', true], ['update', '更新', false],
    ['uninstall', '卸载', true], ['uninstall', '卸载', false],
  ] as const)('opens the manual Desktop restart dialog for %s only when its result requires restart (%s, %s)', async (kind, actionLabel, restartRequired) => {
    let completed = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [managedDesktopSkin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({
        hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.1-alpha.3' },
        management: { ...officialManagement, installRequiresRestart: false },
        skins: [{ skinId: skin.id, installation: completed && kind === 'uninstall' ? 'missing' : 'installed', activation: completed && restartRequired ? 'restart-required' : kind === 'activate' ? completed ? 'active' : 'inactive' : completed && (kind === 'deactivate' || kind === 'uninstall') ? 'inactive' : 'active', installedVersion: '1.0.0', updateAvailable: kind === 'update' && !completed }],
      }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.58', latestVersion: '0.1.58', updateAvailable: false }) }
      if (url.endsWith(`/${kind}`) && init?.method === 'POST') {
        completed = true
        return { ok: true, json: async () => ({ operationId: 'desktop-result' }) }
      }
      if (url.endsWith('/operations/desktop-result')) return { ok: true, json: async () => ({ id: 'desktop-result', kind, skinId: skin.id, phase: 'done', restartRequired }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: actionLabel }))
    if (kind === 'uninstall') fireEvent.click(within(await screen.findByRole('dialog', { name: '卸载皮肤' })).getByRole('button', { name: '确认卸载' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(1))
    if (restartRequired) {
      const dialog = await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })
      expect(dialog.textContent).toContain('完全退出 Desktop App 后重新打开')
      if (kind === 'uninstall') {
        expect(within(screen.getByRole('main', { name: '皮肤详情内容' })).queryByText('测试皮肤 已卸载，请手动重启 Desktop App 后生效')).toBeNull()
        expect(dialog.textContent).toContain('“测试皮肤”已卸载，重启后生效。')
      }
      expect(within(dialog).queryByRole('button', { name: /立即重启|确认无任务/ })).toBeNull()
      fireEvent.click(within(dialog).getByRole('button', { name: '知道了' }))
      const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
      fireEvent(window, new Event('focus'))
      await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
      expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
      fireEvent.click(screen.getAllByRole('button', { name: '查看重启提示' })[0]!)
      expect(screen.getByRole('dialog', { name: '请手动重启 Desktop App' })).toBeTruthy()
      if (kind === 'uninstall') {
        expect(screen.getByRole('dialog', { name: '请手动重启 Desktop App' }).textContent).toContain('“测试皮肤”已卸载，重启后生效。')
        expect(within(screen.getByRole('main', { name: '皮肤详情内容' })).queryByText('测试皮肤 已卸载，请手动重启 Desktop App 后生效')).toBeNull()
      }
    } else {
      await act(async () => {})
      expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
      expect(screen.queryByRole('button', { name: '查看重启提示' })).toBeNull()
      if (kind === 'uninstall') expect(within(screen.getByRole('main', { name: '皮肤详情内容' })).getByText('测试皮肤 已卸载')).toBeTruthy()
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [blue, minecraft] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({
        hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.1-alpha.3' },
        management: { ...officialManagement, installRequiresRestart: false },
        skins: [
          { skinId: minecraft.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false },
          ...(blueInstalled ? [{ skinId: blue.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }] : []),
        ].flatMap(item => item.skinId !== removedId ? [item] : removedRow === 'omitted' ? [] : [{ ...item, installation: 'missing', activation: 'inactive' }]),
      }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.60', latestVersion: '0.1.60', updateAvailable: false }) }
      if (url.endsWith('/install') && init?.method === 'POST') {
        blueInstalled = true
        return { ok: true, json: async () => ({ operationId: 'blue-before-remove-install' }) }
      }
      if (url.endsWith('/operations/blue-before-remove-install')) return { ok: true, json: async () => ({ id: 'blue-before-remove-install', kind: 'install', skinId: blue.id, phase: 'done', restartRequired: true }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'blue-before-remove-activate' }) }
      if (url.endsWith('/operations/blue-before-remove-activate')) return { ok: true, json: async () => ({ id: 'blue-before-remove-activate', kind: 'activate', skinId: blue.id, phase: 'failed', message: '启用保存失败，已恢复原皮肤' }) }
      if (url.endsWith('/uninstall') && init?.method === 'POST') {
        removedId = JSON.parse(init.body as string).skinId
        return { ok: true, json: async () => ({ operationId: 'hot-remove-result' }) }
      }
      if (url.endsWith('/operations/hot-remove-result')) return { ok: true, json: async () => ({ id: 'hot-remove-result', kind: 'uninstall', skinId: target.id, phase: 'done', restartRequired: false }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装' }))
    const failure = await screen.findByRole('dialog', { name: '启用未完成' })
    expect(screen.queryByText('蓝色幻想 已安装，但未启用')).toBeNull()
    fireEvent.click(within(failure).getByRole('button', { name: '知道了' }))
    await openSkinCard(new RegExp(`${target.name.zh} 界面预览`))
    let details = screen.getByRole('main', { name: '皮肤详情内容' })
    fireEvent.click(within(details).getByRole('button', { name: '卸载' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: '卸载皮肤' })).getByRole('button', { name: '确认卸载' }))

    expect(await within(details).findByText(`${target.name.zh} 已卸载`)).toBeTruthy()
    expect(removedId).toBe(target.id)
    expect(within(details).queryByText('蓝色幻想 已安装，但未启用')).toBeNull()
    expect(within(details).queryByRole('button', { name: '查看重启提示' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
    expect(within(details).getByText(`${target.name.zh} 已卸载`)).toBeTruthy()
    expect(within(details).queryByText('蓝色幻想 已安装，但未启用')).toBeNull()

    fireEvent.click(within(screen.getByRole('dialog', { name: '皮肤详情' })).getByRole('button', { name: '关闭' }))
    if (targetKind === 'other-skin') {
      expect(screen.getByText('蓝色幻想 已安装，但未启用')).toBeTruthy()
      await openSkinCard(/蓝色幻想 界面预览/)
      details = screen.getByRole('main', { name: '皮肤详情内容' })
      expect(within(details).getByText('蓝色幻想 已安装，但未启用')).toBeTruthy()
      expect(within(details).queryByText('Minecraft 已卸载')).toBeNull()
      fireEvent.click(within(details).getByRole('button', { name: '查看重启提示' }))
      expect(screen.getByRole('dialog', { name: '请手动重启 Desktop App' }).textContent).toContain('“蓝色幻想”已安装，但尚未启用。')
    } else {
      expect(screen.queryByText('蓝色幻想 已安装，但未启用')).toBeNull()
      expect(screen.queryByRole('button', { name: '查看重启提示' })).toBeNull()
    }
  })

  it.each(['failed', 'cancelled'] as const)('does not report uninstall success when the removal result is %s', async phase => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [managedDesktopSkin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({
        hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.1-alpha.3' }, management: officialManagement,
        skins: [{ skinId: skin.id, installation: 'installed', activation: 'active', installedVersion: '1.0.0', updateAvailable: false }],
      }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.60', latestVersion: '0.1.60', updateAvailable: false }) }
      if (url.endsWith('/uninstall') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'unsuccessful-remove' }) }
      if (url.endsWith('/operations/unsuccessful-remove')) return { ok: true, json: async () => ({ id: 'unsuccessful-remove', kind: 'uninstall', skinId: skin.id, phase, message: phase === 'failed' ? '卸载保存失败' : '已取消卸载' }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    const details = screen.getByRole('main', { name: '皮肤详情内容' })
    fireEvent.click(within(details).getByRole('button', { name: '卸载' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: '卸载皮肤' })).getByRole('button', { name: '确认卸载' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(1))
    await act(async () => {})
    expect(within(details).getByRole('button', { name: '卸载' }).hasAttribute('disabled')).toBe(false)
    expect(screen.queryByText(/测试皮肤 已卸载/)).toBeNull()
    expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
    expect(within(details).queryByRole('button', { name: '查看重启提示' })).toBeNull()
  })

  it('restores an uninstalled skin pending restart with its removal title and explanation', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [managedDesktopSkin] } : url.endsWith('/state') ? {
      instanceId: 'restored-remove', hostKind: 'desktop', restartAvailable: false, runtime: { ...dshRuntime, version: '0.2.1-alpha.3' }, management: officialManagement,
      skins: [{ skinId: skin.id, installation: 'missing', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }],
    } : {} })))
    const view = render(<SkinMarketSection t={key => key} />)
    expect(screen.queryByText('测试皮肤 已卸载，请手动重启 Desktop App 后生效')).toBeNull()
    const initialDialog = await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })
    expect(initialDialog.textContent).toContain('“测试皮肤”已卸载，重启后生效。')
    fireEvent.click(within(initialDialog).getByRole('button', { name: '知道了' }))

    view.unmount()
    render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('button', { name: /测试皮肤 界面预览/ })
    expect(screen.queryByText('测试皮肤 已卸载，请手动重启 Desktop App 后生效')).toBeNull()
    expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
    await openSkinCard()
    const details = screen.getByRole('main', { name: '皮肤详情内容' })
    expect(within(details).queryByText('测试皮肤 已卸载，请手动重启 Desktop App 后生效')).toBeNull()
    fireEvent.click(within(details).getByRole('button', { name: '查看重启提示' }))
    expect(screen.getByRole('dialog', { name: '请手动重启 Desktop App' }).textContent).toContain('“测试皮肤”已卸载，重启后生效。')
  })

  it.each(['completed-task', 'restored'] as const)('hides the acknowledged manual market-update notice for a %s across refresh and remount', async mode => {
    let updated = mode === 'restored'
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [managedDesktopSkin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ hostKind: 'desktop', restartAvailable: false, skins: [], marketUpdateRestartRequired: updated }) }
      if (url.endsWith('/market-update') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'desktop-market-update' }) }
      if (url.endsWith('/market-update/operations/desktop-market-update')) {
        updated = true
        return { ok: true, json: async () => ({ id: 'desktop-market-update', phase: 'done', startedAt: new Date().toISOString() }) }
      }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: updated ? '0.1.58' : '0.1.57', latestVersion: '0.1.58', updateAvailable: !updated }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<SkinMarketSection t={key => key} />)
    if (mode === 'completed-task') fireEvent.click(await screen.findByRole('button', { name: '更新皮肤市场到 0.1.58' }))
    const dialog = await screen.findByRole('dialog', { name: '请手动重启 Desktop App' })
    expect(dialog.textContent).toContain('皮肤市场已更新，重启后生效。')
    fireEvent.click(within(dialog).getByRole('button', { name: '知道了' }))
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
    expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
    expect(screen.queryByText('皮肤市场已更新，请手动重启 Desktop App 后生效')).toBeNull()
    view.unmount()
    render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('button', { name: /测试皮肤 界面预览/ })
    expect(screen.queryByText('皮肤市场已更新，请手动重启 Desktop App 后生效')).toBeNull()
    expect(screen.queryByRole('dialog', { name: '请手动重启 Desktop App' })).toBeNull()
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/restart') && init?.method === 'POST')).toBe(false)
  })

  it('asks for restart after updating the active skin', async () => {
    let updated = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ currentVersion: '0.1.26', latestVersion: '0.1.26', updateAvailable: false }) }
      if (url.endsWith('/update') && init?.method === 'POST') { updated = true; return { ok: true, json: async () => ({ operationId: 'update-1' }) } }
      if (url.endsWith('/operations/update-1')) return { ok: true, json: async () => ({ id: 'update-1', phase: 'done' }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ runningAgentCount: 0, skins: [{ skinId: skin.id, installation: 'installed', activation: updated ? 'restart-required' : 'active', installedVersion: '1.0.0', updateAvailable: !updated }], runtime: dshRuntime }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '更新' }))

    expect(await screen.findByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeTruthy()
    expect(await screen.findByText('重启会断开当前会话连接，请先保存工作。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByText('测试皮肤 已更新，待重启生效')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重启以应用' }))
    expect(screen.getByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/update') && init?.method === 'POST')).toBe(true)
  })

  it('disables restart when the Host reports a running Agent', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { runningAgentCount: 2, skins: [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }] } })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '重启以应用' }))
    expect(await screen.findByText('2 个 Agent 正在运行，任务结束后才能重启。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '有任务运行中' }).hasAttribute('disabled')).toBe(true)
  })

  it('blocks restart while another skin is still installing', async () => {
    const other = { ...skin, id: 'test.other', name: { zh: '另一款皮肤', en: 'Other Skin' }, package: 'other-skin', rowId: 'other-skin', repo: 'https://github.com/a/c' }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog')
        ? { skins: [skin, other] }
        : {
          runningAgentCount: 0,
          skins: [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }],
          operations: [{ id: 'install-other', kind: 'install', skinId: other.id, phase: 'downloading', startedAt: new Date().toISOString() }],
        },
    })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '重启以应用' }))
    expect(await screen.findByText(/还有 1 款皮肤正在安装或更新（另一款皮肤）/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '有皮肤正在安装' }).hasAttribute('disabled')).toBe(true)
  })

  it('allows an explicit one-time restart when the old Host cannot report Agent state', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [{ skinId: skin.id, installation: 'installed', activation: 'restart-required', installedVersion: '1.0.0', updateAvailable: false }] } })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '重启以应用' }))
    const override = await screen.findByRole('button', { name: '确认无任务，重启' })
    expect(override.hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('无法确认是否有 Agent 运行。请保存工作，并确认所有任务已结束后再重启。')).toBeTruthy()
  })

  describe('Web selection runtime convergence', () => {
    function webSkin(overrides: Partial<RuntimeSkin> = {}): RuntimeSkin {
      return { skinId: skin.id, installation: 'installed', activation: 'restart-required', primary: true, pinned: false,
        installedVersion: '1.0.0', updateAvailable: false, clientModule: true, restartSource: 'selection', selectionHostApplied: true,
        selectionHostStatus: 'applied', selectionClientTargets: [{ package: skin.package, active: true }], ...overrides }
    }

    function serveWebState(state: () => RuntimeSkin[], catalog: CatalogSkin[] = [skin]) {
      const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: catalog }
        : url.endsWith('/state') ? { instanceId: 'same-web-instance', restartNoticeId: 'same-receipt', hostKind: 'dsh', runtime: dshRuntime, runningAgentCount: 0, skins: state() }
          : { updateAvailable: false } }))
      vi.stubGlobal('fetch', fetchMock)
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
      expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
      pinnedPhase = 'failed'
      act(() => notify())
      expect(screen.queryByText('使用中', { exact: true })).toBeNull()
      expect(screen.getAllByText('未生效', { exact: true }).length).toBeGreaterThan(0)
      expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
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
        expect(screen.getAllByText('正在加载', { exact: true }).length).toBeGreaterThan(0)
        expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
        await act(async () => { await vi.advanceTimersByTimeAsync(WEB_CLIENT_SETTLE_MS) })
        expect(screen.getByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeTruthy()
        phase = 'active'
        syncing = true
        act(() => notify())
        expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
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

      expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
      phase = 'active'
      act(() => notify())
      await waitFor(() => expect(screen.getAllByText('使用中', { exact: true }).length).toBeGreaterThan(0))
      expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
    })

    it.each(['soft receipt', 'already applied receipt'] as const)('rechecks a loading Host with a state-only read before reporting success (%s)', async receipt => {
      let hostReady = false
      const fetchMock = serveWebState(() => [webSkin({ selectionHostApplied: hostReady, selectionHostStatus: hostReady ? 'applied' : 'switching',
        ...(receipt === 'already applied receipt' ? { activation: 'active' as const, restartSource: undefined } : {}) })])
      render(<SkinMarketSection t={key => key} clientRuntime={{ setActive: vi.fn(), probeActive: () => 'active', probeSyncing: () => false }} />)
      expect((await screen.findAllByText('正在加载', { exact: true })).length).toBeGreaterThan(0)
      expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
      hostReady = true
      await waitFor(() => expect(screen.getAllByText('使用中', { exact: true }).length).toBeGreaterThan(0), { timeout: 3000 })
      expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/catalog'))).toHaveLength(1)
      expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state'))).toHaveLength(2)
      expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
    })

    it('uses the actual probe after an activation request whose loader boolean is false', async () => {
      let activated = false
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({ ok: true, json: async () => {
        if (url.endsWith('/catalog')) return { skins: [skin] }
        if (url.endsWith('/state')) return { instanceId: 'accepted-is-not-applied', hostKind: 'dsh', runtime: dshRuntime,
          skins: [webSkin({ activation: activated ? 'restart-required' : 'inactive', primary: activated,
            restartSource: activated ? 'selection' : undefined, selectionClientTargets: [{ package: skin.package, active: activated }] })] }
        if (url.endsWith('/activate') && init?.method === 'POST') { activated = true; return { operationId: 'activate-client-probe' } }
        if (url.endsWith('/operations/activate-client-probe')) return { id: 'activate-client-probe', skinId: skin.id, kind: 'activate', phase: 'done' }
        return { updateAvailable: false }
      } }))
      vi.stubGlobal('fetch', fetchMock)
      const setActive = vi.fn(async () => false)
      render(<SkinMarketSection t={key => key} clientRuntime={{ setActive, probeActive: () => activated ? 'active' : 'disabled', probeSyncing: () => false }} />)
      await openSkinCard()
      fireEvent.click(screen.getByRole('button', { name: '使用' }))
      await waitFor(() => expect(screen.getAllByText('使用中', { exact: true }).length).toBeGreaterThan(0))
      expect(setActive).toHaveBeenCalledWith(skin.package, true)
      expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
    })

    it.each(['deactivate', 'unpin'] as const)('waits for a host-only skin browser companion to stop after %s', async kind => {
      let stopped = false
      let companionPhase = 'active' as 'active' | 'missing'
      let notify!: () => void
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({ ok: true, json: async () => {
        if (url.endsWith('/catalog')) return { skins: [skin] }
        if (url.endsWith('/state')) return { instanceId: 'stopping-companion', hostKind: 'dsh', runtime: dshRuntime,
          skins: [webSkin({ clientModule: undefined, activation: stopped ? 'restart-required' : 'active', primary: !stopped && kind === 'deactivate', pinned: !stopped && kind === 'unpin',
            restartSource: stopped ? 'selection' : undefined, selectionClientTargets: [{ package: 'extra-browser-companion', active: !stopped }] })] }
        if (url.endsWith(`/${kind}`) && init?.method === 'POST') { stopped = true; return { operationId: 'stop-browser-companion' } }
        if (url.endsWith('/operations/stop-browser-companion')) return { id: 'stop-browser-companion', skinId: skin.id, kind, phase: 'done' }
        return { updateAvailable: false }
      } }))
      vi.stubGlobal('fetch', fetchMock)
      render(<SkinMarketSection t={key => key} clientRuntime={{ setActive: vi.fn(async () => true), probeActive: () => companionPhase, probeSyncing: () => false,
        observe: listener => { notify = listener; return () => undefined } }} />)
      await openSkinCard()
      fireEvent.click(screen.getByRole('button', { name: kind === 'deactivate' ? '停用' : '取消常驻' }))
      await screen.findAllByText('正在加载', { exact: true })
      expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
      companionPhase = 'missing'
      act(() => notify())
      expect(screen.getByRole('button', { name: '使用' })).toBeTruthy()
      expect(screen.queryByText('待重启', { exact: true })).toBeNull()
      expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
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
      expect(screen.queryByRole('dialog', { name: '需要重启 DSH 完成停用' })).toBeNull()
      await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/restart/clear'))).toBe(true))
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
      const dialog = await screen.findByRole('dialog', { name: '需要重启 DSH 完成停用' }, { timeout: 3000 })
      expect(dialog.textContent).toContain('重启会断开当前会话连接，请先保存工作。')
      expect(screen.getAllByText('待重启', { exact: true }).length).toBeGreaterThan(0)
      expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/restart/clear'))).toBe(false)
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
      expect(await screen.findByRole('dialog', { name: '需要重启 DSH 完成停用' }, { timeout: 3000 })).toBeTruthy()
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
      const dialog = await screen.findByRole('dialog', { name: '需要重启 DSH 完成停用' }, { timeout: 3000 })
      expect(dialog.textContent).toContain('重启会断开当前会话连接，请先保存工作。')
      expect(screen.getAllByText('待重启', { exact: true }).length).toBeGreaterThan(0)
      expect(screen.queryByRole('button', { name: '重启以应用' })).toBeNull()
      expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
    })

    it('labels an already seen stop receipt with a stop action instead of applying the skin', async () => {
      window.sessionStorage.clear()
      const seenKey = JSON.stringify(['skin', skin.id, 'same-receipt', '1.0.0', 'protected'])
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
      expect(await screen.findByRole('button', { name: '重启以完成停用' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: '重启以应用' })).toBeNull()
      expect(screen.queryByRole('dialog', { name: '需要重启 DSH 完成停用' })).toBeNull()
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
      expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
    })

    it('clears a protected Web restart receipt when the requested client module is already active', async () => {
      serveWebState(() => [webSkin({ restartSource: undefined })])
      render(<SkinMarketSection t={key => key} clientRuntime={{ setActive: vi.fn(), probeActive: () => 'active', probeSyncing: () => false }} />)
      expect((await screen.findAllByText('使用中', { exact: true })).length).toBeGreaterThan(0)
      expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
    })

    it('rearms a protected same-version receipt after its soft selection reminder was dismissed', async () => {
      let protectedReceipt = false
      serveWebState(() => [webSkin({ restartSource: protectedReceipt ? undefined : 'selection' })])
      render(<SkinMarketSection t={key => key} />)
      fireEvent.click(within(await screen.findByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).getByRole('button', { name: '取消' }))
      expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
      protectedReceipt = true
      fireEvent(window, new Event('focus'))
      expect(await screen.findByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeTruthy()
    })
  })

  it.each(['activate', 'pin'] as const)('preserves a real Web-client failure after %s without fabricating a Host activation state', async kind => {
    let activated = false
    let instanceId = 'web-before-restart'
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ instanceId, runningAgentCount: 0, skins: [{ skinId: skin.id, installation: 'installed', activation: activated || kind === 'pin' ? 'active' : 'inactive', primary: activated || kind === 'pin', pinned: activated && kind === 'pin', installedVersion: '1.0.0', updateAvailable: false }], runtime: dshRuntime }) }
      if (url.endsWith(`/${kind}`) && init?.method === 'POST') { activated = true; return { ok: true, json: async () => ({ operationId: 'client-failure' }) } }
      if (url.endsWith('/operations/client-failure')) return { ok: true, json: async () => ({ id: 'client-failure', kind, skinId: skin.id, phase: 'done', restartRequired: false }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const clientRuntime = { setActive: vi.fn(async () => false) }
    render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: kind === 'pin' ? '设为常驻' : '使用' }))
    if (kind === 'pin') fireEvent.click(await screen.findByRole('button', { name: '确认设为常驻' }))
    const dialog = await screen.findByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })
    expect(dialog.textContent).not.toMatch(/仍可继续使用/)
    expect(dialog.textContent).not.toContain('当前 Host 尚未加载安全检查')
    expect(clientRuntime.setActive).toHaveBeenCalledWith(skin.package, true)
    expect(screen.queryByText('待重启')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
    expect(screen.queryByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })).toBeNull()
    expect(screen.queryByText(/待重启生效/)).toBeNull()
    instanceId = 'web-after-restart'
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(screen.queryByText(/待重启生效/)).toBeNull())
  })

  it('asks before using an incompatible installed skin and preserves the restart flow after consent', async () => {
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    let activated = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [incompatible] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ runningAgentCount: 0, skins: [{ skinId: incompatible.id, installation: 'installed', activation: activated ? 'restart-required' : 'inactive', installedVersion: '1.0.0', updateAvailable: false }], runtime: { version: '0.1.1-rc.1', capabilities: ['slot:keyed:settings.plugin.item'], source: 'injected' } }) }
      if (url.endsWith('/activate') && init?.method === 'POST') { activated = true; return { ok: true, json: async () => ({ operationId: 'activate-1' }) } }
      if (url.endsWith('/operations/activate-1')) return { ok: true, json: async () => ({ id: 'activate-1', phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const clientRuntime = { setActive: vi.fn(async () => false) }
    render(<SkinMarketSection t={key => key} clientRuntime={clientRuntime} />)
    await openSkinCard()

    expect(screen.queryByText(/仍可继续使用/)).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: '使用' }))
    const compatibilityDialog = await screen.findByRole('dialog', { name: '使用前确认' })
    expect(compatibilityDialog.textContent).toMatch(/不在作者声明的兼容范围/)
    expect(compatibilityDialog.querySelector('ul, ol, code, a, details')).toBeNull()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    fireEvent.click(within(compatibilityDialog).getByRole('button', { name: '仍然使用' }))
    const dialog = await screen.findByRole('dialog', { name: '需要重启 DSH 应用此皮肤' })
    expect(dialog.textContent).toContain('重启会断开当前会话连接，请先保存工作。')
    expect(screen.getByRole('button', { name: '确认重启' })).toBeTruthy()
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: incompatible.id, acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(incompatible, { ...dshRuntime, version: '0.1.1-rc.1' }) })
  })

  it('asks separately for an incompatible skin before enabling it as a pinned plugin', async () => {
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [incompatible] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }] }) }
      if (url.endsWith('/pin') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'incompatible-pin' }) }
      if (url.endsWith('/operations/incompatible-pin')) return { ok: true, json: async () => ({ id: 'incompatible-pin', kind: 'pin', skinId: skin.id, phase: 'done' }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '测试皮肤 已安装卡片' }))
    fireEvent.click(screen.getByRole('button', { name: '设为常驻' }))
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: '仍然设为常驻' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/pin') && init?.method === 'POST')).toBe(true))
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/pin') && init?.method === 'POST')?.[1]?.body))).toEqual({ skinId: skin.id, acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(incompatible, dshRuntime) })
  })

  it('filters the catalog from the native search input', async () => {
    const descriptionMatch = { ...skin, id: 'description.match', name: { zh: '描述皮肤', en: 'Description Skin' }, description: '终末地风格的深色主题' }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin, descriptionMatch] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('button', { name: /测试皮肤 界面预览/ })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '终末地' } })
    expect(screen.getByRole('button', { name: /描述皮肤 界面预览/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /测试皮肤 界面预览/ })).toBeNull()
    const clear = screen.getByRole('button', { name: '清空搜索' })
    fireEvent.click(clear)
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('button', { name: /测试皮肤 界面预览/ })).toBeTruthy()
  })

  it('shows heat, Stars and latest sorting modes and highlights the active one', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)
    await screen.findByRole('heading', { name: '发现更多' })
    const sortOptions = screen.getByRole('group', { name: '排序方式' })
    const heat = within(sortOptions).getByRole('button', { name: '热度' })
    const stars = within(sortOptions).getByRole('button', { name: 'Stars' })
    const latest = within(sortOptions).getByRole('button', { name: '最新' })
    expect(heat.getAttribute('aria-pressed')).toBe('true')
    expect(stars.getAttribute('aria-pressed')).toBe('false')
    expect(latest.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(stars)
    expect(heat.getAttribute('aria-pressed')).toBe('false')
    expect(stars.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(latest)
    expect(stars.getAttribute('aria-pressed')).toBe('false')
    expect(latest.getAttribute('aria-pressed')).toBe('true')
  })

  it('toggles discovery categories beside the heading and starts with skin and splash selected', async () => {
    const pet = { ...skin, id: 'test.pet', name: { zh: '桌面宠物', en: 'Desk Pet' }, category: 'pet' }
    const player = { ...skin, id: 'test.player', name: { zh: '音乐播放器', en: 'Music Player' }, category: 'player' }
    const legacy = { ...skin, id: 'test.legacy', name: { zh: '旧分类皮肤', en: 'Legacy Skin' }, category: 'theme' }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin, pet, player, legacy] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)
    const heading = await screen.findByRole('heading', { name: '发现更多' })
    const filters = screen.getByRole('group', { name: '分类' })
    expect(heading.parentElement).toBe(filters.parentElement)
    expect(screen.queryByText('使用中、常驻优先，其余按最近操作排序')).toBeNull()
    expect(within(filters).getByRole('button', { name: '皮肤' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(filters).getByRole('button', { name: '启动动画' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(filters).getByRole('button', { name: '桌宠' }).getAttribute('aria-pressed')).toBe('false')
    expect(within(filters).getByRole('button', { name: '播放器' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('button', { name: /桌面宠物 界面预览/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /音乐播放器 界面预览/ })).toBeNull()
    expect(screen.getByRole('button', { name: /旧分类皮肤 界面预览/ })).toBeTruthy()

    fireEvent.click(within(filters).getByRole('button', { name: '桌宠' }))
    expect(screen.getByRole('button', { name: /桌面宠物 界面预览/ })).toBeTruthy()
    fireEvent.click(within(filters).getByRole('button', { name: '皮肤' }))
    expect(within(filters).getByRole('button', { name: '皮肤' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('button', { name: /测试皮肤 界面预览/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /旧分类皮肤 界面预览/ })).toBeNull()
    expect(screen.getByRole('button', { name: /桌面宠物 界面预览/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /音乐播放器 界面预览/ })).toBeNull()

    fireEvent.click(within(filters).getByRole('button', { name: '播放器' }))
    expect(screen.getByRole('button', { name: /音乐播放器 界面预览/ })).toBeTruthy()
    fireEvent.click(within(filters).getByRole('button', { name: '播放器' }))
    expect(screen.queryByRole('button', { name: /音乐播放器 界面预览/ })).toBeNull()
    fireEvent.click(within(filters).getByRole('button', { name: '皮肤' }))
    expect(screen.getByRole('button', { name: /测试皮肤 界面预览/ })).toBeTruthy()
  })

  it('docks the discovery bar into the header and keeps the original space', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} layout="embedded" />)
    const title = (await screen.findByRole('heading', { name: '发现更多' })).parentElement!.parentElement!
    const header = title.closest('main')!.querySelector('header')!
    const section = title.parentElement!
    vi.spyOn(title, 'getBoundingClientRect').mockImplementation(() => ({ top: 240, height: 28, bottom: 268, left: 0, right: 100, width: 100, x: 0, y: 240, toJSON() { return {} } }) as DOMRect)
    vi.spyOn(header, 'getBoundingClientRect').mockImplementation(() => ({ top: 0, height: 120, bottom: 120, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON() { return {} } }) as DOMRect)
    fireEvent.scroll(window)
    expect(header.querySelector('[data-header-discover]')).toBeNull()
    expect(title.getAttribute('data-docked')).toBeNull()

    vi.spyOn(title, 'getBoundingClientRect').mockImplementation(() => ({ top: 120, height: 28, bottom: 148, left: 0, right: 100, width: 100, x: 0, y: 120, toJSON() { return {} } }) as DOMRect)
    fireEvent.scroll(window)
    expect(title.getAttribute('data-docked')).toBe('true')
    expect(section.contains(title)).toBe(true)
    expect(header.querySelector('[data-header-discover]')).toBeTruthy()
    expect(screen.getAllByRole('heading', { name: '发现更多' })).toHaveLength(1)
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

  it('names the skin and compact elapsed time in the operation banner, then shows failures promptly', async () => {
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

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('正在下载“测试皮肤”'))
    expect(within(screen.getByRole('status')).getByTitle(/^耗时 /).textContent).toMatch(/^\d+ 秒$/)
    const dialog = await screen.findByRole('dialog', { name: '安装未完成' }, { timeout: 2_000 })
    expect(dialog.textContent).toContain('未能完成本次操作。请复制日志反馈。')
    expect(dialog.textContent).not.toContain('GitHub 插件下载超时')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    window.dispatchEvent(new Event('focus'))
    expect(screen.getByRole('dialog', { name: '安装未完成' }).textContent).toContain('未能完成本次操作。请复制日志反馈。')
  })

  it('discloses command diagnostics, expires stale speed on its tick, and lets a running install copy its log', async () => {
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const clipboard = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, writable: true, value: { writeText: clipboard } })
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
      await waitFor(() => expect(screen.getByRole('status').querySelector('strong')?.textContent).toBe('正在下载“测试皮肤”'))
      const banner = screen.getByRole('status')
      const disclosure = within(banner).getByRole('button', { name: '详情' })
      const details = document.getElementById(disclosure.getAttribute('aria-controls')!)!
      expect(disclosure.getAttribute('aria-expanded')).toBe('false')
      expect(details.hasAttribute('hidden')).toBe(true)
      expect(within(banner).getByText('下载 npm 皮肤包').closest('[hidden]')).toBe(details)
      expect(within(banner).getByText('第 2 次尝试').closest('[hidden]')).toBe(details)
      expect(within(banner).getByText('1.0 KB/s').closest('[hidden]')).toBe(details)
      expect(within(banner).queryByRole('button', { name: '复制日志' })).toBeNull()
      expect(banner.querySelector('strong')?.textContent).toBe('正在下载“测试皮肤”')
      expect(within(banner).getAllByText('2.0 KB / 4.0 KB').some(element => element.closest('[hidden]') === null)).toBe(true)

      fireEvent.click(disclosure)
      expect(disclosure.getAttribute('aria-expanded')).toBe('true')
      expect(details.hasAttribute('hidden')).toBe(false)
      expect(within(details).getByText('下载 npm 皮肤包')).toBeTruthy()
      expect(within(details).getByText('第 2 次尝试')).toBeTruthy()
      expect(within(details).queryByText('下载依赖')).toBeNull()
      expect(within(details).getByText('1.0 KB/s')).toBeTruthy()

      clock.mockReturnValue(now + 5000)
      await waitFor(() => expect(within(details).queryByText(/KB\/s/)).toBeNull(), { timeout: 2000 })
      expect(within(details).queryByText(/没有输出/)).toBeNull()
      clock.mockReturnValue(now + 30_000)
      await waitFor(() => expect(within(details).getByText('已有 30 秒没有输出')).toBeTruthy(), { timeout: 2000 })
      expect(banner.textContent).not.toContain('可复制日志查看')
      const copyLog = within(banner).getByRole('button', { name: '复制日志' })
      fireEvent.click(copyLog)
      await waitFor(() => expect(clipboard).toHaveBeenCalledWith(expect.stringContaining('diagnostic log')))
      await waitFor(() => expect(copyLog.querySelector('[data-icon="check"]')).toBeTruthy())
      expect(copyLog.textContent).toBe('复制日志')
      expect(banner.textContent).not.toContain('redacted')
      fireEvent.click(within(banner).getByRole('button', { name: '收起' }))
      expect(details.hasAttribute('hidden')).toBe(true)
      expect(disclosure.getAttribute('aria-expanded')).toBe('false')
      expect(within(banner).queryByRole('button', { name: '日志已复制' })).toBeNull()
    } finally { clock.mockRestore() }
  })

  it.each([
    { phase: 'resolving', step: '解析 profile 依赖', title: '正在卸载“测试皮肤”' },
    { phase: 'downloading', step: '下载 profile 依赖', title: '正在卸载“测试皮肤”' },
    { phase: 'installing', step: '移除皮肤插件', title: '正在卸载“测试皮肤”' },
    { phase: 'installing', step: '恢复原有 profile 依赖', title: '正在恢复原有依赖 · 测试皮肤' },
  ] as const)('keeps the uninstall banner honest during $phase ($step)', async ({ phase, step, title }) => {
    const operation = {
      id: 'uninstall-status', kind: 'uninstall', skinId: skin.id, phase, step,
      startedAt: new Date().toISOString(), downloadedBytes: 2048, totalBytes: 4096,
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({
        skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }],
        operation, runtime: dshRuntime,
      }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    await waitFor(() => expect(screen.getByRole('status').querySelector('strong')?.textContent).toBe(title))
    await openSkinCard()
    const banner = within(screen.getByRole('main', { name: '皮肤详情内容' })).getByRole('status')
    expect(banner.querySelector('strong')?.textContent).toBe(title)
    expect(within(banner).queryByText('正在下载“测试皮肤”')).toBeNull()
    const disclosure = within(banner).getByRole('button', { name: '详情' })
    const details = document.getElementById(disclosure.getAttribute('aria-controls')!)!
    expect(details.hasAttribute('hidden')).toBe(true)
    expect(within(banner).getByText(step).closest('[hidden]')).toBe(details)
    expect(within(banner).getAllByText('2.0 KB / 4.0 KB').every(element => element.closest('[hidden]') === details)).toBe(true)
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
    await waitFor(() => expect(screen.getByRole('status').querySelector('strong')?.textContent).toBe('正在安装“测试皮肤”'))
    const banner = screen.getByRole('status')
    fireEvent.click(within(banner).getByRole('button', { name: '详情' }))
    expect(within(banner).getByText('写入插件').closest('[hidden]')).toBeNull()
    expect(within(banner).queryByText('链接依赖')).toBeNull()
    expect(within(banner).queryByText(/没有输出/)).toBeNull()
  })

  it.each([20, 44])('keeps a %s-second recovery concise until diagnostics are requested and leaves install controls locked', async elapsedSeconds => {
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const recoveringSkin = { ...skin, name: { zh: '深海女仆工坊', en: 'Deep Sea Maid Workshop' } }
    const clipboard = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, writable: true, value: { writeText: clipboard } })
    const operation = {
      id: 'install-recovery', kind: 'install', skinId: skin.id, phase: 'installing', cancelable: false,
      startedAt: new Date(now - elapsedSeconds * 1000).toISOString(), step: '恢复原有 profile 依赖',
      stepStartedAt: new Date(now - elapsedSeconds * 1000).toISOString(), attempt: 1,
      lastOutputAt: new Date(now - (elapsedSeconds - 5) * 1000).toISOString(), message: '安装未完成，正在恢复原有依赖',
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [recoveringSkin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], operation, runtime: dshRuntime }) }
      if (url.endsWith('/logs?operationId=install-recovery')) return { ok: true, text: async () => '# dsh-skin-market diagnostic log\nredacted' }
      throw new Error(`Unexpected request: ${url}`)
    }))
    try {
      render(<SkinMarketSection t={key => key} />)
      await openSkinCard(/深海女仆工坊 界面预览/)
      const banner = screen.getByRole('status')
      expect(banner.querySelector('strong')?.textContent).toBe('正在恢复原有依赖 · 深海女仆工坊')
      expect(within(banner).getByTitle(`耗时 ${elapsedSeconds} 秒`).textContent).toBe(`${elapsedSeconds} 秒`)
      expect(banner.textContent).not.toContain('正在写入插件')
      const disclosure = within(banner).getByRole('button', { name: '详情' })
      const details = document.getElementById(disclosure.getAttribute('aria-controls')!)!
      expect(details.hasAttribute('hidden')).toBe(true)
      expect(within(banner).getByText('恢复原有 profile 依赖').closest('[hidden]')).toBe(details)
      expect(within(banner).getByText('安装未完成，正在恢复原有依赖').closest('[hidden]')).toBe(details)
      if (elapsedSeconds === 44) expect(within(details).getByText('已有 39 秒没有输出').closest('[hidden]')).toBe(details)
      else expect(within(details).queryByText(/没有输出/)).toBeNull()
      expect(within(banner).queryByRole('button', { name: '复制日志' })).toBeNull()
      expect(within(banner).queryByRole('button', { name: '取消' })).toBeNull()
      expect(screen.getByRole('button', { name: '安装' }).hasAttribute('disabled')).toBe(true)
      expect(screen.getByRole('button', { name: '其他安装方式' }).hasAttribute('disabled')).toBe(true)

      fireEvent.click(disclosure)
      expect(details.hasAttribute('hidden')).toBe(false)
      expect(disclosure.getAttribute('aria-expanded')).toBe('true')
      fireEvent.click(within(banner).getByRole('button', { name: '复制日志' }))
      await waitFor(() => expect(clipboard).toHaveBeenCalledWith(expect.stringContaining('diagnostic log')))
      expect(banner.textContent).not.toContain('redacted')
      fireEvent.click(within(banner).getByRole('button', { name: '收起' }))
      expect(details.hasAttribute('hidden')).toBe(true)
      expect(within(banner).queryByRole('button', { name: '取消' })).toBeNull()
      expect(screen.getByRole('button', { name: '安装' }).hasAttribute('disabled')).toBe(true)
    } finally { clock.mockRestore() }
  })

  it.each([
    { phase: 'waiting', title: '等待宿主确认“测试皮肤”', message: '宿主未返回可确认的操作结果，请重新打开宿主后核对插件状态' },
    { phase: 'cancelling', title: '正在取消“测试皮肤”', message: '正在取消并清理临时文件' },
  ])('keeps the $phase stage and required explanation visible despite a stale recovery step', async ({ phase, title, message }) => {
    const operation = {
      id: 'stale-recovery-step', kind: 'install', skinId: skin.id, phase, cancelable: false,
      startedAt: new Date().toISOString(), step: '恢复原有 profile 依赖', message,
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], operation, runtime: dshRuntime }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    if (phase === 'waiting') {
      expect(await screen.findByRole('dialog', { name: '操作结果待确认' })).toBeTruthy()
      expect(screen.queryByRole('status')).toBeNull()
      return
    }
    await waitFor(() => expect(screen.getByRole('status').querySelector('strong')?.textContent).toBe(title))
    const banner = screen.getByRole('status')
    expect(within(banner).getByText(message).closest('[hidden]')).toBeNull()
    expect(within(banner).getByText('恢复原有 profile 依赖').closest('[hidden]')).not.toBeNull()
    expect(within(banner).queryByRole('button', { name: '取消' })).toBeNull()
  })

  it('explains a blocking failure in a dialog and copies the operation diagnostic log', async () => {
    let operationRequests = 0
    const longMessage = '依赖 @deepseek-ai/dsh-compact 无法从 npm registry 找到；这是一个很长的 pnpm 诊断信息，需要完整展示而不能挤在横幅里。'
    const clipboard = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, writable: true, value: { writeText: clipboard } })
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

    const dialog = await screen.findByRole('dialog', { name: '安装未完成' })
    expect(dialog.textContent).toContain('未能完成本次操作。请复制日志反馈。')
    expect(dialog.textContent).not.toContain(longMessage)
    expect(dialog.querySelector('details, code, ul, ol')).toBeNull()
    expect(dialog.className).toContain('warningModal')
    expect(dialog.textContent).not.toContain('diagnostic log')
    expect(dialog.textContent).not.toContain('为什么会这样')
    expect([...dialog.querySelectorAll('p')].some(paragraph => paragraph.textContent?.trim() === '')).toBe(false)
    expect(screen.queryByRole('status')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    expect(within(dialog).queryByRole('link', { name: '打开皮肤仓库' })).toBeNull()
    expect(within(dialog).getByRole('link', { name: '查看安装排查' }).getAttribute('href')).toBe(MARKET_INSTALL_TROUBLESHOOT_URL)
    const copyLog = within(dialog).getByRole('button', { name: '复制日志' })
    expect(copyLog.querySelector('[data-icon="copy"]')).toBeTruthy()
    fireEvent.click(copyLog)
    await waitFor(() => expect(clipboard).toHaveBeenCalledWith(expect.stringContaining('diagnostic log')))
    await waitFor(() => expect(copyLog.querySelector('[data-icon="check"]')).toBeTruthy())
    expect(copyLog.textContent).toBe('复制日志')
    expect(within(dialog).getByRole('button', { name: '复制日志' })).toBe(copyLog)
    fireEvent.click(within(dialog).getByRole('button', { name: '知道了' }))
    expect(screen.queryByRole('dialog', { name: '安装未完成' })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('explains a missing bundle patch as a skin packaging intercept', async () => {
    let operationRequests = 0
    const clipboard = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, writable: true, value: { writeText: clipboard } })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], operation: null, runtime: dshRuntime }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'install-patch' }) }
      if (url.endsWith('/logs?operationId=install-patch')) return { ok: true, text: async () => '# dsh-skin-market diagnostic log\nbundle patch is missing' }
      if (url.endsWith('/operations/install-patch')) {
        operationRequests += 1
        return { ok: true, json: async () => operationRequests === 1
          ? { id: 'install-patch', kind: 'install', skinId: skin.id, phase: 'downloading', startedAt: new Date().toISOString() }
          : { id: 'install-patch', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: `${skin.package} bundle patch is missing: ./cordis.patch.yml` } }
      }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '仅安装' }))

    const dialog = await screen.findByRole('dialog', { name: '安装已阻止' })
    expect(dialog.textContent).toContain('「测试皮肤」的安装包文件缺少必要文件。请先核对安装目标与安装包文件，确认缺包后反馈作者。')
    expect(dialog.textContent).not.toContain('cordis.patch.yml')
    expect(dialog.querySelector('details, code, ul, ol')).toBeNull()
    expect(dialog.className).toContain('warningModal')
    expect(dialog.textContent).not.toContain('diagnostic log')
    expect(dialog.textContent).not.toContain('第 1 次尝试')
    expect(dialog.textContent).not.toContain('链接依赖')
    expect(within(dialog).getByRole('button', { name: '知道了' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: '复制日志' })).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: '打开皮肤仓库' }).getAttribute('href')).toBe(`https://github.com/a/b/tree/${'a'.repeat(40)}`)
    expect(within(dialog).queryByRole('link', { name: '查看安装排查' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
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
    const dialog = await screen.findByRole('dialog', { name: '安装 测试皮肤' })
    expect(dialog.textContent).toContain('复制命令，在运行 DSH 的电脑上执行。')
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    expect(retryRequests).toBe(0)
  })

  it('allows only the displayed exact version then asks for use risks only after release-age approval completes installation', async () => {
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    let retryRequests = 0
    let activateRequests = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [incompatible] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'install-age-source' }) }
      if (url.endsWith('/operations/install-age-source')) return { ok: true, json: async () => ({ id: 'install-age-source', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), failure: {
        kind: 'release-age', message: '新包保护拦住市场版本', action: 'approve-release-age', releaseAgeTarget: { packageName: 'dsh-skin-market', version: '0.1.61' },
      } }) }
      if (url.endsWith('/operations/install-age-source/retry') && init?.method === 'POST') {
        retryRequests += 1
        expect(JSON.parse(String(init.body))).toEqual({ action: 'approve-release-age' })
        return { ok: true, json: async () => ({ operationId: 'install-age-approved' }) }
      }
      if (url.endsWith('/operations/install-age-approved')) return { ok: true, json: async () => ({ id: 'install-age-approved', kind: 'install', skinId: skin.id, phase: 'done' }) }
      if (url.endsWith('/activate') && init?.method === 'POST') {
        activateRequests += 1
        return { ok: true, json: async () => ({ operationId: 'activate-age-approved' }) }
      }
      if (url.endsWith('/operations/activate-age-approved')) return { ok: true, json: async () => ({ id: 'activate-age-approved', kind: 'activate', skinId: skin.id, phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '安装并使用' }))
    const dialog = await screen.findByRole('dialog', { name: '安装需要允许新版本' })
    expect(dialog.textContent).toContain('dsh-skin-market@0.1.61')
    expect(dialog.textContent).not.toContain('skin@1.0.0')
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    expect(retryRequests).toBe(0)
    const approval = within(dialog).getByRole('button', { name: '允许并继续' })
    fireEvent.click(approval)
    fireEvent.click(approval)
    await waitFor(() => expect(retryRequests).toBe(1))
    fireEvent.click(within(await screen.findByRole('dialog', { name: '使用前确认' })).getByRole('button', { name: '仍然使用' }))
    await waitFor(() => expect(activateRequests).toBe(1))
    expect(screen.queryByRole('dialog', { name: '安装需要允许新版本' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
  })

  it.each(['install-and-use', 'activate', 'pin'] as const)('combines artifact, compatibility, and first-use risks once when %s reaches use', async mode => {
    window.localStorage.removeItem('dsh-skin-market:activation-warning-accepted')
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    const risk = artifactRiskOperation().failure!.artifactRisk!
    let installed = mode !== 'install-and-use'
    let used = false
    const kind = mode === 'pin' ? 'pin' : 'activate'
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [incompatible] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ runtime: dshRuntime, skins: installed ? [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false, ...(!used && { artifactRisk: risk }) }] : [] }) }
      if (url.endsWith('/install') && init?.method === 'POST') {
        installed = true
        expect(JSON.parse(String(init.body))).toEqual({ skinId: skin.id })
        return { ok: true, json: async () => ({ operationId: 'merged-install' }) }
      }
      if (url.endsWith('/operations/merged-install')) return { ok: true, json: async () => ({ id: 'merged-install', kind: 'install', skinId: skin.id, phase: 'done' }) }
      if (url.endsWith(`/${kind}`) && init?.method === 'POST') {
        used = true
        expect(JSON.parse(String(init.body))).toEqual({ skinId: skin.id, acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(incompatible, dshRuntime), artifactContext: risk.context })
        return { ok: true, json: async () => ({ operationId: 'merged-use' }) }
      }
      if (url.endsWith('/operations/merged-use')) return { ok: true, json: async () => ({ id: 'merged-use', kind, skinId: skin.id, phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: mode === 'install-and-use' ? '安装并使用' : mode === 'pin' ? '设为常驻' : '使用' }))
    let dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    expect(dialog.textContent).toContain('安装包文件尚未验证')
    expect(dialog.textContent).not.toContain('SRI')
    expect(dialog.querySelector('ul, ol, code, a, details')).toBeNull()
    expect(dialog.textContent).toContain('不在作者声明的兼容范围')
    if (mode === 'pin') {
      expect(dialog.textContent).toContain('设为常驻后，其他皮肤仍可同时使用。')
      expect(dialog.textContent).not.toContain('使用后将停用其他普通皮肤')
    } else expect(dialog.textContent).toContain('使用后会停用其他未设为常驻的皮肤。')
    expect(dialog.textContent).not.toContain(risk.context)
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith(`/${kind}`))).toBe(false)
    expect(screen.queryByRole('dialog', { name: '设为常驻此皮肤' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '安装需要确认安装包风险' })).toBeNull()
    if (mode !== 'install-and-use') {
      fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
      expect(fetchMock.mock.calls.some(([url]) => url.endsWith(`/${kind}`))).toBe(false)
      expect(window.localStorage.getItem('dsh-skin-market:activation-warning-accepted')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: mode === 'pin' ? '设为常驻' : '使用' }))
      dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    }
    const accept = within(dialog).getByRole('button', { name: mode === 'pin' ? '仍然设为常驻' : '仍然使用' })
    fireEvent.click(accept)
    fireEvent.click(accept)
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith(`/${kind}`))).toHaveLength(1))
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
  })

  it('refreshes a changed artifact in the pending use dialog before sending its new context', async () => {
    let risk = artifactRiskOperation().failure!.artifactRisk!
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false, artifactRisk: risk }] }) }
      if (url.endsWith('/activate') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'changed-risk-use' }) }
      if (url.endsWith('/operations/changed-risk-use')) return { ok: true, json: async () => ({ id: 'changed-risk-use', kind: 'activate', skinId: skin.id, phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    const dialog = await screen.findByRole('dialog', { name: '使用前确认' })
    risk = { ...risk, context: 'changed-artifact-context', warnings: ['新构件缺少可核对的 SRI'] }
    const requests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent.focus(window)
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(requests))
    fireEvent.click(within(dialog).getByRole('button', { name: '仍然使用' }))
    expect(dialog.textContent).toContain('皮肤或运行环境已变化，请重新确认。')
    expect(dialog.textContent).toContain('安装包文件尚未验证')
    expect(dialog.textContent).not.toContain('SRI')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: '仍然使用' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(true))
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url]) => url.endsWith('/activate'))?.[1]?.body)).artifactContext).toBe('changed-artifact-context')
  })

  it('does not ask about an accepted unchanged artifact again after refreshed state removes its risk', async () => {
    const risk = artifactRiskOperation().failure!.artifactRisk!
    let accepted = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ runtime: dshRuntime, skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false, ...(!accepted && { artifactRisk: risk }) }] }) }
      if (url.endsWith('/activate') && init?.method === 'POST') { accepted = true; return { ok: true, json: async () => ({ operationId: 'accepted-use' }) } }
      if (url.endsWith('/operations/accepted-use')) return { ok: true, json: async () => ({ id: 'accepted-use', kind: 'activate', skinId: skin.id, phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: '使用前确认' })).getByRole('button', { name: '仍然使用' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '使用' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: '使用' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/activate'))).toHaveLength(2))
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
    expect(JSON.parse(String(fetchMock.mock.calls.filter(([url]) => url.endsWith('/activate'))[1]?.[1]?.body))).toEqual({ skinId: skin.id })
  })

  it.each(['取消', '关闭'])('keeps artifact risk approval explicit and makes %s leave the install unchanged', async closeLabel => {
    const operation = artifactRiskOperation()
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : url.endsWith('/state') ? { skins: [], runtime: dshRuntime } : url.endsWith('/install') && init?.method === 'POST' ? { operationId: operation.id } : url.endsWith(`/operations/${operation.id}`) ? operation : {} }))
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装并使用' }))
    const dialog = await screen.findByRole('dialog', { name: '安装需要确认安装包风险' })
    expect(dialog.textContent).toContain('测试皮肤（版本 1.0.0）')
    expect(dialog.textContent).toContain('安装包文件尚未验证')
    expect(dialog.textContent).not.toContain('SRI')
    expect(dialog.querySelector('ul, ol, code, a, details')).toBeNull()
    expect(dialog.textContent).not.toContain('actual-artifact-context')
    expect(within(dialog).getByRole('button', { name: '仍然继续' })).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/retry'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: closeLabel }))
    expect(screen.queryByRole('dialog', { name: '安装需要确认安装包风险' })).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/retry') || url.endsWith('/activate'))).toBe(false)
  })

  it('approves only on an explicit artifact risk click, prevents duplicate requests, and preserves compatibility and install-and-use', async () => {
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    const operation = artifactRiskOperation()
    let retryRequests = 0
    let activateRequests = 0
    let finishRetry!: () => void
    const retryGate = new Promise<void>(resolve => { finishRetry = resolve })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [incompatible] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: operation.id }) }
      if (url.endsWith(`/operations/${operation.id}`)) return { ok: true, json: async () => operation }
      if (url.endsWith(`/operations/${operation.id}/retry`) && init?.method === 'POST') {
        retryRequests += 1
        expect(JSON.parse(String(init.body))).toEqual({ action: 'approve-artifact', acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(incompatible, dshRuntime) })
        await retryGate
        return { ok: true, json: async () => ({ operationId: 'artifact-approved' }) }
      }
      if (url.endsWith('/operations/artifact-approved')) return { ok: true, json: async () => ({ id: 'artifact-approved', kind: 'install', skinId: skin.id, phase: 'done' }) }
      if (url.endsWith('/activate') && init?.method === 'POST') {
        activateRequests += 1
        expect(JSON.parse(String(init.body))).toEqual({ skinId: skin.id, acknowledgeCompatibility: true, compatibilityContext: compatibilityContext(incompatible, dshRuntime) })
        return { ok: true, json: async () => ({ operationId: 'artifact-approved-activate' }) }
      }
      if (url.endsWith('/operations/artifact-approved-activate')) return { ok: true, json: async () => ({ id: 'artifact-approved-activate', kind: 'activate', skinId: skin.id, phase: 'done' }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: '安装并使用' }))
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
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
  })

  it('keeps a rejected artifact approval in the same dialog with the changed-context error', async () => {
    const operation = artifactRiskOperation()
    let retries = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [skin] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: [], runtime: dshRuntime }) }
      if (url.endsWith('/install') && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: operation.id }) }
      if (url.endsWith(`/operations/${operation.id}`)) return { ok: true, json: async () => operation }
      if (url.endsWith(`/operations/${operation.id}/retry`) && init?.method === 'POST') {
        retries += 1
        return { ok: false, status: 409, json: async () => ({ error: '实际构件已变化，请重新操作后确认风险' }) }
      }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装并使用' }))
    const dialog = await screen.findByRole('dialog', { name: '安装需要确认安装包风险' })
    fireEvent.click(within(dialog).getByRole('button', { name: '仍然继续' }))
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toBe('未能继续操作，请复制日志反馈。'))
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : url.endsWith('/state') ? { skins: [], runtime: dshRuntime } : url.endsWith('/install') && init?.method === 'POST' ? { operationId: failedOperation.id } : url.endsWith('/operations/declined-age') ? failedOperation : {} }))
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装并使用' }))
    const dialog = await screen.findByRole('dialog', { name: '安装需要允许新版本' })
    expect(dialog.textContent).toContain('@example/dependency@2.3.4')
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog', { name: '安装需要允许新版本' })).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/retry'))).toBe(false)
  })

  it.each(['install', 'update', 'activate', 'pin'] as const)('acknowledges a Host compatibility rejection during %s without offering or issuing a retry', async kind => {
    const target = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    const hostRuntime = { ...dshRuntime, version: '0.2.0-rc.2' }
    const id = `host-compatibility-rejected-${kind}`
    const operation: Operation = { id, kind, skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), failure: {
      kind: 'compatibility', code: 'incompatible-version', message: 'Host rejected incompatible plugin peers',
    } }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [target] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: kind === 'install' ? [] : [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: kind === 'update' ? '0.9.0' : '1.0.0', updateAvailable: kind === 'update' }], runtime: hostRuntime }) }
      if (url.endsWith('/market-update')) return { ok: true, json: async () => ({ updateAvailable: false }) }
      if (url.endsWith(`/${kind}`) && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: id }) }
      if (url.endsWith(`/operations/${id}`)) return { ok: true, json: async () => operation }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    const actionLabel = { install: '仅安装', update: '更新', activate: '使用', pin: '设为常驻' }[kind]
    fireEvent.click(screen.getByRole('button', { name: actionLabel }))
    if (kind === 'activate' || kind === 'pin') {
      const confirmation = await screen.findByRole('dialog', { name: '使用前确认' })
      expect(confirmation.textContent).toContain('不在作者声明的兼容范围')
      expect(fetchMock.mock.calls.some(([url]) => url.endsWith(`/${kind}`))).toBe(false)
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
    const stateRequests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent.focus(window)
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateRequests))
    expect(screen.queryByRole('dialog', { name: title })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/retry'))).toBe(false)
  })

  it('does not offer approval when the host cannot identify the exact blocked version', async () => {
    const operation = { id: 'unknown-age', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), failure: {
      kind: 'release-age', message: '新包保护拦截，未能确定具体版本，请复制日志反馈。', action: 'approve-release-age',
    } }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : url.endsWith('/state') ? { skins: [], runtime: dshRuntime } : url.endsWith('/install') && init?.method === 'POST' ? { operationId: operation.id } : url.endsWith('/operations/unknown-age') ? operation : {} }))
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: '安装并使用' }))
    const dialog = await screen.findByRole('dialog', { name: '安装未完成' })
    expect(dialog.textContent).toContain('所需版本仍处于新包保护期。请等待保护期结束后重试。')
    expect(within(dialog).queryByRole('button', { name: '允许并继续' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/retry'))).toBe(false)
  })

  it.each([
    { kind: 'update', action: 'approve-release-age', failureKind: 'release-age' },
    { kind: 'install', action: 'approve-build', failureKind: 'build-approval' },
  ] as const)('does not ask optional use confirmation during a $kind $action retry', async ({ kind, action, failureKind }) => {
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
    let retries = 0
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { ok: true, json: async () => ({ skins: [incompatible] }) }
      if (url.endsWith('/state')) return { ok: true, json: async () => ({ skins: kind === 'update' ? [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '0.9.0', updateAvailable: true }] : [], runtime: dshRuntime }) }
      if (url.endsWith(`/${kind}`) && init?.method === 'POST') return { ok: true, json: async () => ({ operationId: 'compat-retry-source' }) }
      if (url.endsWith('/operations/compat-retry-source')) return { ok: true, json: async () => ({ id: 'compat-retry-source', kind, skinId: skin.id, phase: 'failed', failure: { kind: failureKind, message: '需要允许', action, releaseAgeTarget: { packageName: 'dsh-skin-market', version: '0.1.61' } } }) }
      if (url.endsWith('/operations/compat-retry-source/retry')) {
        retries += 1
        expect(JSON.parse(String(init?.body))).toEqual({ action })
        return { ok: true, json: async () => ({ operationId: 'compat-retry-target' }) }
      }
      if (url.endsWith('/operations/compat-retry-target')) return { ok: true, json: async () => ({ id: 'compat-retry-target', kind, skinId: skin.id, phase: 'done' }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(screen.getByRole('button', { name: kind === 'update' ? '更新' : '仅安装' }))
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: action === 'approve-build' ? '允许并重试' : '允许并继续' }))
    await waitFor(() => expect(retries).toBe(1))
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
  })

  it.each(['packageName', 'buildKeys'] as const)('puts exact %s build approval in one concise confirmation body', async targetMode => {
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
          : { id: 'install-build-approval', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: '依赖 node-pty 等 2 个依赖包含被 pnpm 阻止的构建脚本；请批准后重试', failure: { kind: 'build-approval', message: '依赖 node-pty 等 2 个依赖包含被 pnpm 阻止的构建脚本；请批准后重试', packageName: 'node-pty', ...(targetMode === 'buildKeys' && { buildKeys: ['node-pty', '@fixture/native-helper'] }), action: 'approve-build' } } }
      }
      if (url.endsWith('/operations/install-build-approval-retry')) return { ok: true, json: async () => ({ id: 'install-build-approval-retry', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: '仍然失败', failure: { kind: 'build-approval', message: '仍然失败', packageName: 'node-pty', action: 'approve-build' } }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '仅安装' }))

    const dialog = await screen.findByRole('dialog', { name: '需要批准构建脚本' })
    expect(dialog.textContent).toContain(`允许 ${targetMode === 'packageName' ? 'node-pty' : 'node-pty、@fixture/native-helper'} 运行本次安装脚本，然后继续安装。`)
    expect(dialog.querySelector('code, ul, ol, details')).toBeNull()
    expect(dialog.className).toContain('warningModal')
    expect(screen.queryByRole('button', { name: '批准构建并重试' })).toBeNull()
    expect(screen.getByRole('button', { name: '允许并重试' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '允许并重试' }))
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
    fireEvent.click(await screen.findByRole('button', { name: '允许并重试' }))

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

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('1.0 MB / 2.0 MB'))
    const banner = screen.getByRole('status')
    expect(within(banner).getAllByText('1.0 MB / 2.0 MB').some(element => element.closest('[hidden]') === null)).toBe(true)
    expect(within(banner).getByText('512.0 KB/s').closest('[hidden]')).not.toBeNull()
    fireEvent.click(within(banner).getByRole('button', { name: '详情' }))
    expect(within(banner).getByText('512.0 KB/s').closest('[hidden]')).toBeNull()
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
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
    fireEvent.click(automatic)
    expect(screen.queryByRole('button', { name: '确认重启' })).toBeNull()
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(true))
    expect(screen.queryByRole('dialog', { name: '使用前确认' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '安装已阻止' })).toBeNull()
    expect(screen.getByText('该仓库暂无可识别的皮肤截图，市场使用本地占位卡，不会加载 GitHub 仓库图片。')).toBeTruthy()
    expect(screen.getAllByRole('img', { name: '测试皮肤 暂无界面截图' }).length).toBeGreaterThanOrEqual(2)
    expect(document.querySelector(`img[src="${unverified.screenshots[0]}"]`)).toBeNull()
  })

  it('shows the Agent prompt first and one executable command in single-line capsules', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] } })))
    const writeText = vi.fn(async () => undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '其他安装方式' }))
    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    expect(dialog.textContent).toContain('复制命令，在运行 DSH 的电脑上执行。')
    expect([...dialog.querySelectorAll('code')].map(node => node.textContent)).toEqual([createSkinInstallPrompt(skin, 'dsh'), createSkinInstallCommands(skin)[0]!.value])
    expect(within(dialog).queryByRole('combobox')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '复制提示词' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(createSkinInstallPrompt(skin, 'dsh')))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '复制提示词' }).querySelector('[data-icon="check"]')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '复制命令' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(createSkinInstallCommands(skin)[0]!.value))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '复制命令' }).querySelector('[data-icon="check"]')).toBeTruthy())
    expect(within(dialog).getByRole('button', { name: '复制提示词' }).querySelector('[data-icon="copy"]')).toBeTruthy()
  })

  it.each(['darwin', 'linux'] as const)('uses the backend %s environment and actual profile directory for copied Web commands', async platform => {
    const subdirectorySkin = { ...skin, install: { ...skin.install, target: `${skin.install.target}&path:/packages/skin` } }
    const installEnvironment = { platform, profile: 'work', profileDir: '/srv/DSH data/profiles/work', dshHome: '/srv/DSH data' }
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [subdirectorySkin] } : { hostKind: 'dsh', skins: [], installEnvironment },
    })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '其他安装方式' }))

    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    expect(within(dialog).queryByRole('combobox')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '复制命令' }))
    const expected = createSkinInstallCommands(subdirectorySkin, { ...installEnvironment, shell: 'posix' })[0]!.value
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expected))
    expect(expected).toContain(installEnvironment.profileDir)
    expect(writeText.mock.calls[0]![0]).not.toMatch(/[\r\n]/)
  })

  it('defaults backend Windows commands to PowerShell and preserves the selected terminal after state refresh', async () => {
    const subdirectorySkin = { ...skin, install: { ...skin.install, target: `${skin.install.target}&path:/packages/skin` } }
    const installEnvironment = { platform: 'win32' as const, profile: 'work', profileDir: 'C:\\DSH data\\profiles\\work', dshHome: 'C:\\DSH data' }
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [subdirectorySkin] } : { hostKind: 'dsh', skins: [], installEnvironment: { ...installEnvironment } },
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '其他安装方式' }))

    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    const terminals = within(dialog).getByRole('group', { name: '终端' })
    const powershell = within(terminals).getByRole('button', { name: 'PowerShell' })
    const cmd = within(terminals).getByRole('button', { name: 'CMD' })
    expect(powershell.getAttribute('aria-pressed')).toBe('true')
    expect(within(dialog).queryByRole('combobox')).toBeNull()
    expect(within(dialog).queryByRole('combobox', { name: '运行 DSH 的系统' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '复制命令' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(createSkinInstallCommands(subdirectorySkin, { ...installEnvironment, shell: 'powershell' })[0]!.value))
    fireEvent.click(cmd)
    const stateReads = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent.focus(window)
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(stateReads))
    expect(cmd.getAttribute('aria-pressed')).toBe('true')
    expect(powershell.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(within(dialog).getByRole('button', { name: '复制命令' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(createSkinInstallCommands(subdirectorySkin, { ...installEnvironment, shell: 'cmd' })[0]!.value))
    for (const [copied] of writeText.mock.calls) expect(copied).not.toMatch(/[\r\n]/)
  })

  it('lists one primary command for each terminal when the backend system is unknown', async () => {
    const subdirectorySkin = { ...skin, install: { ...skin.install, target: `${skin.install.target}&path:/packages/skin`, companions: [
      { package: 'skin-manager', rowId: 'skin-manager', target: `${skin.install.target}&path:/packages/manager`, version: '1.2.3', commit: skin.install.commit },
    ] } }
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [subdirectorySkin] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '其他安装方式' }))

    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    expect(within(dialog).queryByRole('combobox')).toBeNull()
    expect(within(dialog).queryByRole('group', { name: '运行 DSH 的系统' })).toBeNull()
    expect(within(dialog).queryByRole('group', { name: '终端' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '复制命令' })).toBeNull()
    expect(within(dialog).queryByText(/按运行 Web 版 DSH 的电脑和终端选择/)).toBeNull()
    expect(within(dialog).queryByText('此皮肤需按实际环境安装，请复制提示词。')).toBeNull()
    for (const group of createSkinInstallCommandGroups(subdirectorySkin)) {
      const terminal = within(dialog).getByRole('group', { name: group.label })
      expect(terminal.querySelectorAll('code')).toHaveLength(1)
      for (const entry of group.commands) {
        fireEvent.click(within(terminal).getByRole('button', { name: `复制${group.label} ${entry.label}` }))
        await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(entry.value))
      }
    }
    expect(writeText).toHaveBeenCalledTimes(3)
    for (const [copied] of writeText.mock.calls) expect(copied).not.toMatch(/[\r\n]/)
    fireEvent.click(within(dialog).getByRole('button', { name: '复制提示词' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(createSkinInstallPrompt(subdirectorySkin, 'dsh')))
  })

  it('copies only the primary command and retains companion instructions in the Agent prompt', async () => {
    const companionSkin = { ...skin, install: { ...skin.install, companions: [
      { package: 'skin-manager', rowId: 'skin-manager', target: 'skin-manager@1.2.3', version: '1.2.3', commit: skin.install.commit },
    ] } }
    const installEnvironment = { platform: 'linux' as const, profile: 'web', profileDir: '/srv/dsh/profiles/web' }
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [companionSkin] } : { skins: [], installEnvironment } })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '其他安装方式' }))

    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    const commands = createSkinInstallCommands(companionSkin, { ...installEnvironment, shell: 'posix' })
    for (const entry of commands) {
      fireEvent.click(within(dialog).getByRole('button', { name: `复制${entry.label}` }))
      await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(entry.value))
    }
    expect(commands).toHaveLength(1)
    expect(within(dialog).queryByRole('button', { name: '复制配套插件命令' })).toBeNull()
    expect(writeText).toHaveBeenCalledTimes(1)
    for (const [copied] of writeText.mock.calls) {
      expect(copied).not.toMatch(/[\r\n]/)
      expect(copied).not.toContain('请分别')
      expect(copied).not.toContain('安装皮肤前')
    }
    fireEvent.click(within(dialog).getByRole('button', { name: '复制提示词' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(createSkinInstallPrompt(companionSkin, 'dsh', { ...installEnvironment, shell: 'posix' })))
    expect(writeText.mock.calls.at(-1)![0]).toContain('skin-manager@1.2.3')
  })

  it('explains when a custom profile directory cannot be addressed by the install CLI', async () => {
    const installEnvironment = { platform: 'linux' as const, profile: 'work', profileDir: '/srv/custom-profile', cliAvailable: false }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [skin] } : { skins: [], installEnvironment } })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '其他安装方式' }))

    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    expect(within(dialog).queryByRole('button', { name: '复制命令' })).toBeNull()
    expect(within(dialog).getByRole('status').textContent).toContain('当前 DSH 目录无法通过终端准确定位')
    expect(within(dialog).getByRole('button', { name: '复制提示词' })).toBeTruthy()
  })

  it('suggests PowerShell when CMD cannot represent the actual directory literally', async () => {
    const subdirectorySkin = { ...skin, install: { ...skin.install, target: `${skin.install.target}&path:/packages/skin` } }
    const installEnvironment = { platform: 'win32' as const, profile: 'work', profileDir: 'C:\\DSH!data\\profiles\\work' }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [subdirectorySkin] } : { skins: [], installEnvironment } })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '其他安装方式' }))

    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    const terminals = within(dialog).getByRole('group', { name: '终端' })
    fireEvent.click(within(terminals).getByRole('button', { name: 'CMD' }))
    expect(within(dialog).queryByRole('button', { name: '复制命令' })).toBeNull()
    expect(within(dialog).getByRole('status').textContent).toContain('请切换到 PowerShell')
    fireEvent.click(within(terminals).getByRole('button', { name: 'PowerShell' }))
    expect(within(dialog).getByRole('button', { name: '复制命令' })).toBeTruthy()
  })

  it('retains the original bare npm copy field for managed Desktop skins', async () => {
    const npmSkin = { ...managedDesktopSkin, package: '@example/skin', install: { ...managedDesktopSkin.install,
      npm: { name: '@example/skin', version: '1.0.0', repository: skin.repo, integrity: 'sha512-abc', gitHead: skin.install.commit },
      desktop: { mode: 'managed' as const, registry: 'npm' as const, packageName: '@example/skin', packageVersion: '1.0.0' },
    } }
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [npmSkin] } : { hostKind: 'desktop', skins: [], management: officialManagement } })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '其他安装方式' }))

    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    expect(within(dialog).queryByRole('button', { name: '复制命令' })).toBeNull()
    expect(within(dialog).queryByRole('combobox')).toBeNull()
    expect([...dialog.querySelectorAll('code')].map(node => node.textContent)).toEqual([createSkinInstallPrompt(npmSkin, 'desktop')])
    expect(within(dialog).getByRole('textbox', { name: '插件包名' })).toHaveProperty('value', '@example/skin')
    expect(within(dialog).queryByRole('textbox', { name: '伴生插件包名' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '复制插件包名' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('@example/skin'))
    expect(within(dialog).queryByRole('button', { name: '复制伴生插件包名' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '复制提示词' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(createSkinInstallPrompt(npmSkin, 'desktop')))
    expect(within(dialog).queryByRole('button', { name: '打开添加插件' })).toBeNull()
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
    fireEvent.click(within(screen.getByRole('main', { name: '皮肤详情内容' })).getByRole('button', { name: '安装' }))
    expect(screen.getByRole('dialog', { name: '安装 测试皮肤' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '打开安装页面' })).toBeNull()
    expect(open).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(false)
    expect(screen.getByText('该皮肤暂不支持市场直接安装。')).toBeTruthy()
  })

  it('does not expose repository health checks in skin details', async () => {
    const healthSkin = { ...skin, health: {
      status: 'improvements' as const,
      checks: { readmeScreenshots: 'pass' as const, compatibility: 'improve' as const, installation: 'pass' as const },
      suggestions: ['建议声明支持的 DSH Web 版本范围。'],
    } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/catalog') ? { skins: [healthSkin] } : { skins: [] } })))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    await screen.findByRole('heading', { name: '关于此皮肤' })
    expect(screen.queryByRole('heading', { name: '仓库健康' })).toBeNull()
    expect(screen.queryByText('README 截图')).toBeNull()
    expect(screen.queryByText('建议声明支持的 DSH Web 版本范围。')).toBeNull()
  })
})
