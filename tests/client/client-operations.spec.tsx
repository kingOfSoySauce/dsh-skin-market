// Client market tests: operation banners, diagnostics and progress
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => (await import('../fixtures/client-market.tsx')).createPrimitivesMock())

import { SkinMarketSection } from '../../src/client/SkinMarketSection.tsx'
import { MARKET_INSTALL_TROUBLESHOOT_URL } from '../../src/client/failure-help.ts'


import { requestSent, stubMarketFetch } from '../fixtures/market-host.ts'
import { dshRuntime, openSkinCard, registerMarketTestDom, skin, zh } from '../fixtures/client-market.tsx'

registerMarketTestDom()

describe('client market operations', () => {
  it('names the skin and compact elapsed time in the operation banner, then shows failures promptly', async () => {
    let operationRequests = 0
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], operation: null, runtime: dshRuntime }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'install-progress' }
      if (url.endsWith('/operations/install-progress')) {
        operationRequests += 1
        return operationRequests === 1
          ? { id: 'install-progress', kind: 'install', skinId: skin.id, phase: 'downloading', startedAt: new Date().toISOString() }
          : { id: 'install-progress', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: 'GitHub 插件下载超时' }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '仅安装' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('正在下载“测试皮肤”'))
    expect(within(screen.getByRole('status')).getByTitle(/^耗时 /).textContent).toMatch(/^\d+ 秒$/)
    const dialog = await screen.findByRole('dialog', { name: '安装未完成' }, { timeout: 2_000 })
    expect(dialog.textContent).toContain('未能完成本次操作。请复制日志反馈给市场维护者。')
    expect(dialog.textContent).not.toContain('GitHub 插件下载超时')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    window.dispatchEvent(new Event('focus'))
    expect(screen.getByRole('dialog', { name: '安装未完成' }).textContent).toContain('未能完成本次操作。请复制日志反馈给市场维护者。')
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
    stubMarketFetch(async (url: string) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], operation, runtime: dshRuntime }
      if (url.endsWith('/logs?operationId=install-live-log')) return { ok: true, text: async () => '# dsh-skin-market diagnostic log\nredacted' }
      throw new Error(`Unexpected request: ${url}`)
    })
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
      expect(within(details).queryByText(zh['common.stageDownloading'])).toBeNull()
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
    { phase: 'installing', step: zh['common.stepRestoreProfile'], title: '正在恢复原有依赖 · 测试皮肤' },
  ] as const)('keeps the uninstall banner honest during $phase ($step)', async ({ phase, step, title }) => {
    const operation = {
      id: 'uninstall-status', kind: 'uninstall', skinId: skin.id, phase, step,
      startedAt: new Date().toISOString(), downloadedBytes: 2048, totalBytes: 4096,
    }
    stubMarketFetch(async (url: string) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return {
        skins: [{ skinId: skin.id, installation: 'installed', activation: 'inactive', installedVersion: '1.0.0', updateAvailable: false }],
        operation, runtime: dshRuntime,
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await waitFor(() => expect(screen.getByRole('status').querySelector('strong')?.textContent).toBe(title))
    await openSkinCard()
    const banner = within(screen.getByRole('main', { name: zh['common.detailContent'] })).getByRole('status')
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
    stubMarketFetch(async (url: string) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime, operation: {
        id: 'new-step', kind: 'install', skinId: skin.id, phase: 'installing', startedAt: new Date(now - 300_000).toISOString(),
        step: '写入插件', stepStartedAt: new Date(now).toISOString(), attempt: 1, pnpmStage: 'linking', lastOutputAt: new Date(now - 60_000).toISOString(),
      } }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await waitFor(() => expect(screen.getByRole('status').querySelector('strong')?.textContent).toBe('正在安装“测试皮肤”'))
    const banner = screen.getByRole('status')
    fireEvent.click(within(banner).getByRole('button', { name: '详情' }))
    expect(within(banner).getByText('写入插件').closest('[hidden]')).toBeNull()
    expect(within(banner).queryByText(zh['common.stageLinking'])).toBeNull()
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
      startedAt: new Date(now - elapsedSeconds * 1000).toISOString(), step: zh['common.stepRestoreProfile'],
      stepStartedAt: new Date(now - elapsedSeconds * 1000).toISOString(), attempt: 1,
      lastOutputAt: new Date(now - (elapsedSeconds - 5) * 1000).toISOString(), message: '安装未完成，正在恢复原有依赖',
    }
    stubMarketFetch(async (url: string) => {
      if (url.endsWith('/catalog')) return { skins: [recoveringSkin] }
      if (url.endsWith('/state')) return { skins: [], operation, runtime: dshRuntime }
      if (url.endsWith('/logs?operationId=install-recovery')) return { ok: true, text: async () => '# dsh-skin-market diagnostic log\nredacted' }
      throw new Error(`Unexpected request: ${url}`)
    })
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
      expect(within(banner).getByText(zh['common.stepRestoreProfile']).closest('[hidden]')).toBe(details)
      expect(within(banner).getByText('安装未完成，正在恢复原有依赖').closest('[hidden]')).toBe(details)
      if (elapsedSeconds === 44) expect(within(details).getByText('已有 39 秒没有输出').closest('[hidden]')).toBe(details)
      else expect(within(details).queryByText(/没有输出/)).toBeNull()
      expect(within(banner).queryByRole('button', { name: '复制日志' })).toBeNull()
      expect(within(banner).queryByRole('button', { name: '取消' })).toBeNull()
      expect(screen.getByRole('button', { name: '安装' }).hasAttribute('disabled')).toBe(true)
      expect(screen.getByRole('button', { name: zh['common.otherInstallMethods'] }).hasAttribute('disabled')).toBe(true)

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
    { phase: 'cancelling', title: '正在取消“测试皮肤”', message: zh['common.operationCancelCleanup'] },
  ])('keeps the $phase stage and required explanation visible despite a stale recovery step', async ({ phase, title, message }) => {
    const operation = {
      id: 'stale-recovery-step', kind: 'install', skinId: skin.id, phase, cancelable: false,
      startedAt: new Date().toISOString(), step: zh['common.stepRestoreProfile'], message,
    }
    stubMarketFetch(async (url: string) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], operation, runtime: dshRuntime }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    if (phase === 'waiting') {
      expect(await screen.findByRole('dialog', { name: zh['common.confirmResult'] })).toBeTruthy()
      expect(screen.queryByRole('status')).toBeNull()
      return
    }
    await waitFor(() => expect(screen.getByRole('status').querySelector('strong')?.textContent).toBe(title))
    const banner = screen.getByRole('status')
    expect(within(banner).getByText(message).closest('[hidden]')).toBeNull()
    expect(within(banner).getByText(zh['common.stepRestoreProfile']).closest('[hidden]')).not.toBeNull()
    expect(within(banner).queryByRole('button', { name: '取消' })).toBeNull()
  })
  it('explains a blocking failure in a dialog and copies the operation diagnostic log', async () => {
    let operationRequests = 0
    const longMessage = '依赖 @deepseek-ai/dsh-compact 无法从 npm registry 找到；这是一个很长的 pnpm 诊断信息，需要完整展示而不能挤在横幅里。'
    const clipboard = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, writable: true, value: { writeText: clipboard } })
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], operation: null, runtime: dshRuntime }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'install-copy' }
      if (url.endsWith('/logs?operationId=install-copy')) return { ok: true, text: async () => '# dsh-skin-market diagnostic log\nredacted' }
      if (url.endsWith('/operations/install-copy')) {
        operationRequests += 1
        return operationRequests === 1
          ? { id: 'install-copy', kind: 'install', skinId: skin.id, phase: 'downloading', startedAt: new Date().toISOString() }
          : { id: 'install-copy', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: longMessage }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '仅安装' }))

    const dialog = await screen.findByRole('dialog', { name: '安装未完成' })
    expect(dialog.textContent).toContain('未能完成本次操作。请复制日志反馈给市场维护者。')
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
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], operation: null, runtime: dshRuntime }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'install-patch' }
      if (url.endsWith('/logs?operationId=install-patch')) return { ok: true, text: async () => '# dsh-skin-market diagnostic log\nbundle patch is missing' }
      if (url.endsWith('/operations/install-patch')) {
        operationRequests += 1
        return operationRequests === 1
          ? { id: 'install-patch', kind: 'install', skinId: skin.id, phase: 'downloading', startedAt: new Date().toISOString() }
          : { id: 'install-patch', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: `${skin.package} bundle patch is missing: ./cordis.patch.yml` }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: '仅安装' }))

    const dialog = await screen.findByRole('dialog', { name: '安装已阻止' })
    expect(dialog.textContent).toContain('「测试皮肤」的安装包文件缺少必要文件。请复制日志反馈作者，等待修复后的版本。')
    expect(dialog.textContent).not.toContain('cordis.patch.yml')
    expect(dialog.querySelector('details, code, ul, ol')).toBeNull()
    expect(dialog.className).toContain('warningModal')
    expect(dialog.textContent).not.toContain('diagnostic log')
    expect(dialog.textContent).not.toContain('第 1 次尝试')
    expect(dialog.textContent).not.toContain(zh['common.stageLinking'])
    expect(within(dialog).getByRole('button', { name: '知道了' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: '复制日志' })).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: '打开皮肤仓库' }).getAttribute('href')).toBe(`https://github.com/a/b/tree/${'a'.repeat(40)}`)
    expect(within(dialog).queryByRole('link', { name: '查看安装排查' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('keeps a classified install failure in its dialog without offering retry', async () => {
    let operationRequests = 0
    let retryRequests = 0
    stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'install-retry-source' }
      if (url.endsWith('/operations/install-retry-source/retry') && init?.method === 'POST') {
        retryRequests += 1
        expect(JSON.parse(String(init.body))).toEqual({ action: 'retry' })
        return { operationId: 'install-retry-target' }
      }
      if (url.endsWith('/operations/install-retry-source')) {
        operationRequests += 1
        return operationRequests === 1
          ? { id: 'install-retry-source', kind: 'install', skinId: skin.id, phase: 'downloading', startedAt: new Date().toISOString() }
          : { id: 'install-retry-source', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: '插件下载遇到临时网络错误', failure: { kind: 'network', message: '插件下载遇到临时网络错误', action: 'retry' } }
      }
      if (url.endsWith('/operations/install-retry-target')) return { id: 'install-retry-target', kind: 'install', skinId: skin.id, phase: 'failed', startedAt: new Date().toISOString(), message: '仍然失败', failure: { kind: 'network', message: '仍然失败', action: 'retry' } }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: '仅安装' }))
    const dialog = await screen.findByRole('dialog', { name: '安装 测试皮肤' })
    expect(dialog.textContent).toContain(zh['failure.manualInstallFallback'])
    expect(within(dialog).queryByRole('button', { name: '打开安装面板' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
    expect(retryRequests).toBe(0)
  })
  it('shows available byte progress in one banner and cancels the download', async () => {
    let cancelled = false
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], operation: null, runtime: dshRuntime }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'install-cancel' }
      if (url.endsWith('/operations/install-cancel/cancel') && init?.method === 'POST') {
        cancelled = true
        return { id: 'install-cancel', phase: 'cancelling' }
      }
      if (url.endsWith('/operations/install-cancel')) return cancelled
        ? { id: 'install-cancel', kind: 'install', skinId: skin.id, phase: 'cancelled', startedAt: new Date().toISOString() }
        : { id: 'install-cancel', kind: 'install', skinId: skin.id, phase: 'downloading', startedAt: new Date().toISOString(), cancelable: true, downloadedBytes: 1024 ** 2, totalBytes: 2 * 1024 ** 2, bytesPerSecond: 512 * 1024 }
      throw new Error(`Unexpected request: ${url}`)
    })
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
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [skin] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'install-1' }
      if (url.endsWith('/operations/install-1')) return { id: 'install-1', phase: 'done' }
      if (url.endsWith('/activate') && init?.method === 'POST') return await new Promise(() => undefined)
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: zh['common.installAndUse'] }))

    await waitFor(() => expect(requestSent(fetchMock, '/activate', 'POST')).toBe(true))
  })
  it('warns that compatibility is unverified but still installs', async () => {
    const unverified = { ...skin, review: { compatibility: 'unverified' as const, preview: 'repository-card' as const, installation: 'verified' as const }, compatibility: { dsh: 'unverified', platform: ['web'] } }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [unverified] }
      if (url.endsWith('/state')) return { skins: [], runtime: dshRuntime }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'op-unverified' }
      if (url.endsWith('/operations/op-unverified')) return { id: 'op-unverified', kind: 'install', skinId: unverified.id, phase: 'done' }
      if (url.endsWith('/activate') && init?.method === 'POST') return { operationId: 'op-activate' }
      if (url.endsWith('/operations/op-activate')) return { id: 'op-activate', kind: 'activate', skinId: unverified.id, phase: 'done' }
      throw new Error(`Unexpected request: ${url}`)
    })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    const otherMethods = await screen.findByRole('button', { name: zh['common.otherInstallMethods'] })
    const automatic = screen.getByRole('button', { name: zh['common.installAndUse'] })
    expect(automatic.getAttribute('variant')).toBe('primary')
    expect(otherMethods.getAttribute('variant')).toBe('outline')
    expect(screen.queryByRole('button', { name: '待验证，手动安装' })).toBeNull()
    expect(screen.queryByText(/维护者尚未声明 DSH 兼容范围，仍可一键安装/)).toBeNull()
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
    fireEvent.click(automatic)
    expect(screen.queryByRole('button', { name: zh['common.confirmRestart'] })).toBeNull()
    await waitFor(() => expect(requestSent(fetchMock, '/install')).toBe(true))
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '安装已阻止' })).toBeNull()
    expect(screen.getByText(zh['common.noRepositoryScreenshot'])).toBeTruthy()
    expect(screen.getAllByRole('img', { name: '测试皮肤 暂无界面截图' }).length).toBeGreaterThanOrEqual(2)
    expect(document.querySelector(`img[src="${unverified.screenshots[0]}"]`)).toBeNull()
  })
})
