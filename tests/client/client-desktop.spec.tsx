// Client market tests: manual Desktop handoff, plugin panel and native intents
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => (await import('../fixtures/client-market.tsx')).createPrimitivesMock())

import { SkinMarketSection } from '../../src/client/SkinMarketSection.tsx'
import { createSkinInstallCommands, createSkinInstallInputs, createSkinInstallPrompt } from '../../src/client/submission.ts'
import type { CatalogSkin } from '../../src/client/types.ts'
import { requestSent, stubMarketFetch } from '../fixtures/market-host.ts'
import { dshRuntime, managedDesktopSkin, officialManagement, openSkinCard, registerMarketTestDom, skin, zh } from '../fixtures/client-market.tsx'

registerMarketTestDom()

describe('client market desktop', () => {
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
    expect(requestSent(fetchMock, '/install')).toBe(false)
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
    expect(requestSent(fetchMock, '/install')).toBe(false)

    fireEvent.click(within(dialog).getByRole('button', { name: zh['common.stillInstall'] }))
    await waitFor(() => expect(requestSent(fetchMock, '/install', 'POST')).toBe(true))
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
    await waitFor(() => expect(requestSent(fetchMock, '/activate', 'POST')).toBe(true))
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
    expect(requestSent(fetchMock, '/install')).toBe(false)
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
    expect(requestSent(fetchMock, '/activate')).toBe(false)
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
    expect(requestSent(fetchMock, '/activate')).toBe(false)
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
    expect(requestSent(fetchMock, '/activate')).toBe(false)
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
