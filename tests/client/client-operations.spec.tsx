// Client market tests: operation banners, diagnostics, approvals, progress and media
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import React from 'react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => (await import('../fixtures/client-market.tsx')).createPrimitivesMock())

import { SkinMarketSection } from '../../src/client/SkinMarketSection.tsx'
import { MARKET_INSTALL_TROUBLESHOOT_URL } from '../../src/client/failure-help.ts'
import { createSkinInstallCommandGroups, createSkinInstallCommands, createSkinInstallPrompt } from '../../src/client/submission.ts'
import { compatibilityContext } from '../../src/compatibility.ts'
import type { Operation } from '../../src/client/types.ts'
import { stubMarketFetch } from '../fixtures/market-host.ts'
import { artifactRiskOperation, dshRuntime, managedDesktopSkin, officialManagement, openSkinCard, skin, useMarketTestDom, zh } from '../fixtures/client-market.tsx'

useMarketTestDom()

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
  it('allows only the displayed exact version then asks for use risks only after release-age approval completes installation', async () => {
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
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
    const incompatible = { ...skin, compatibility: { dsh: '<0.1.0-rc.6', platform: ['web'] } }
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
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith(`/${kind}`))).toBe(false)
    expect(screen.queryByRole('dialog', { name: '设为常驻此皮肤' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '安装需要确认安装包风险' })).toBeNull()
    if (mode !== 'install-and-use') {
      fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
      expect(fetchMock.mock.calls.some(([url]) => url.endsWith(`/${kind}`))).toBe(false)
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
    const requests = fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length
    fireEvent.focus(window)
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/state')).length).toBeGreaterThan(requests))
    fireEvent.click(within(dialog).getByRole('button', { name: '仍然使用' }))
    expect(dialog.textContent).toContain(zh['common.confirmationChanged'])
    expect(dialog.textContent).toContain(zh['common.installPackageUnverified'])
    expect(dialog.textContent).not.toContain('SRI')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: '仍然使用' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/activate'))).toBe(true))
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
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/retry'))).toBe(false)
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
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => (url.endsWith('/catalog') ? { skins: [skin] } : url.endsWith('/state') ? { skins: [], runtime: dshRuntime } : url.endsWith('/install') && init?.method === 'POST' ? { operationId: operation.id } : url.endsWith('/operations/unknown-age') ? operation : {}))
    render(<SkinMarketSection t={key => key} />)
    fireEvent.click(await screen.findByRole('button', { name: zh['common.installAndUse'] }))
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

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/activate') && init?.method === 'POST')).toBe(true))
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
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(true))
    expect(screen.queryByRole('dialog', { name: zh['common.switchConfirmation'] })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '安装已阻止' })).toBeNull()
    expect(screen.getByText(zh['common.noRepositoryScreenshot'])).toBeTruthy()
    expect(screen.getAllByRole('img', { name: '测试皮肤 暂无界面截图' }).length).toBeGreaterThanOrEqual(2)
    expect(document.querySelector(`img[src="${unverified.screenshots[0]}"]`)).toBeNull()
  })
  it('shows the Agent prompt first and one executable command in single-line capsules', async () => {
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] }))
    const writeText = vi.fn(async () => undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    fireEvent.click(await screen.findByRole('button', { name: zh['common.otherInstallMethods'] }))
    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    expect(dialog.textContent).toContain(zh['common.manualInstallInput'])
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
    stubMarketFetch(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [subdirectorySkin] } : { hostKind: 'dsh', skins: [], installEnvironment },
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: zh['common.otherInstallMethods'] }))

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
    const fetchMock = stubMarketFetch(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/catalog') ? { skins: [subdirectorySkin] } : { hostKind: 'dsh', skins: [], installEnvironment: { ...installEnvironment } },
    }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: zh['common.otherInstallMethods'] }))

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
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [subdirectorySkin] } : { skins: [] }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: zh['common.otherInstallMethods'] }))

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
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [companionSkin] } : { skins: [], installEnvironment }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: zh['common.otherInstallMethods'] }))

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
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [skin] } : { skins: [], installEnvironment }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: zh['common.otherInstallMethods'] }))

    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    expect(within(dialog).queryByRole('button', { name: '复制命令' })).toBeNull()
    expect(within(dialog).getByRole('status').textContent).toContain('当前 DSH 目录无法通过终端准确定位')
    expect(within(dialog).getByRole('button', { name: '复制提示词' })).toBeTruthy()
  })
  it('suggests PowerShell when CMD cannot represent the actual directory literally', async () => {
    const subdirectorySkin = { ...skin, install: { ...skin.install, target: `${skin.install.target}&path:/packages/skin` } }
    const installEnvironment = { platform: 'win32' as const, profile: 'work', profileDir: 'C:\\DSH!data\\profiles\\work' }
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [subdirectorySkin] } : { skins: [], installEnvironment }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: zh['common.otherInstallMethods'] }))

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
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [npmSkin] } : { hostKind: 'desktop', skins: [], management: officialManagement }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()
    fireEvent.click(await screen.findByRole('button', { name: zh['common.otherInstallMethods'] }))

    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    expect(within(dialog).queryByRole('button', { name: '复制命令' })).toBeNull()
    expect(within(dialog).queryByRole('combobox')).toBeNull()
    expect([...dialog.querySelectorAll('code')].map(node => node.textContent)).toEqual([createSkinInstallPrompt(npmSkin, 'desktop')])
    expect(within(dialog).getByRole('textbox', { name: zh['common.packageName'] })).toHaveProperty('value', '@example/skin')
    expect(within(dialog).queryByRole('textbox', { name: '伴生插件包名' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '复制插件包名' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('@example/skin'))
    expect(within(dialog).queryByRole('button', { name: '复制伴生插件包名' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '复制提示词' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(createSkinInstallPrompt(npmSkin, 'desktop')))
    expect(within(dialog).queryByRole('button', { name: '打开添加插件' })).toBeNull()
  })
  it('replaces a failed verified screenshot instead of retaining stale image pixels', async () => {
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [skin] } : { skins: [] }))
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
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [supplemented] } : { skins: [] }))
    render(<SkinMarketSection t={key => key} />)

    await openSkinCard()
    expect(screen.getByText(zh['common.marketScreenshotNotice'])).toBeTruthy()
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
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [supplemented] } : { skins: [] }))
    render(<SkinMarketSection t={key => key} />)

    await openSkinCard()
    expect(document.querySelector(`img[src="${upstreamCover}"]`)).toBeTruthy()
    expect(screen.getByAltText('测试皮肤 大图预览').getAttribute('src')).toBe(upstreamCover)
    expect(screen.queryByText(zh['common.marketScreenshotNotice'])).toBeNull()
  })
  it('uses catalog WebP media by default and keeps the original-image fallback available', async () => {
    const preview = 'https://cdn.example.com/preview.webp'
    const full = 'https://cdn.example.com/full.webp'
    const layered = {
      ...skin,
      media: { list: { preview, full }, screenshots: [{ preview, full }] },
    }
    const fetchMock = stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [layered] } : { skins: [] }))

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
    stubMarketFetch(async (url: string) => {
      if (url.endsWith('/catalog')) return { skins: [layered] }
      if (url.endsWith('/manifest.json')) return {}
      return { skins: [], installedClientPlugins: [], runningAgentCount: 0 }
    })
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
    stubMarketFetch(async (url: string) => {
      if (url.endsWith('/catalog')) return { skins: [layered] }
      if (url.endsWith('/manifest.json')) return { [first]: 'first', [second]: 'second' }
      return { skins: [], installedClientPlugins: [], runningAgentCount: 0 }
    })
    render(<SkinMarketSection t={key => key} />)

    const image = await screen.findByRole('img', { name: '测试皮肤 界面预览' })
    await waitFor(() => expect(image.getAttribute('src')).toBe(firstPreview))
    fireEvent.error(image)
    expect(image.getAttribute('src')).toBe(first)
    fireEvent.error(image)
    expect(image.getAttribute('src')).toBe(secondPreview)
  })
  it('warns before automatically installing a manual-only web skin', async () => {
    const manual = {
      ...skin,
      review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'manual-only' as const },
      health: {
        status: 'improvements' as const,
        checks: { readmeScreenshots: 'pass' as const, compatibility: 'pass' as const, installation: 'improve' as const },
        suggestions: [],
        scan: {
          commit: skin.install.commit, packageVersion: skin.install.version, scannerVersion: 'static-v2', mode: 'static' as const,
          result: 'unknown' as const, checkedAt: '2026-11-08T00:00:00.000Z',
          findings: [{ code: 'client-source-unavailable', message: '无法读取固定版本的 client 入口，静态扫描结果未知。' }],
        },
      },
    }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [manual] }
      if (url.endsWith('/state')) return { hostKind: 'dsh', runtime: dshRuntime, skins: [] }
      if (url.endsWith('/install') && init?.method === 'POST') return { operationId: 'manual-install' }
      if (url.endsWith('/operations/manual-install')) return { id: 'manual-install', kind: 'install', skinId: manual.id, phase: 'done' }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)

    await openSkinCard()
    fireEvent.click(within(screen.getByRole('main', { name: zh['common.detailContent'] })).getByRole('button', { name: '仅安装' }))
    const dialog = await screen.findByRole('dialog', { name: zh['common.installationUnverifiedTitle'] })
    expect(dialog.textContent).toContain('固定版本的仓库没有提交可读取的客户端入口')
    expect(dialog.textContent).toContain(manual.install.target)
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/install'))).toBe(false)

    fireEvent.click(within(dialog).getByRole('button', { name: zh['common.stillInstall'] }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/install') && init?.method === 'POST')).toBe(true))
  })
  it('warns before updating a manual-only web skin and keeps the update entry visible', async () => {
    const manual = { ...skin, review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'manual-only' as const } }
    const fetchMock = stubMarketFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalog')) return { skins: [manual] }
      if (url.endsWith('/state')) return { hostKind: 'dsh', runtime: dshRuntime, skins: [{ skinId: manual.id, installation: 'installed', activation: 'inactive', installedVersion: '0.9.0', updateAvailable: true }] }
      if (url.endsWith('/update') && init?.method === 'POST') return { operationId: 'manual-update' }
      if (url.endsWith('/operations/manual-update')) return { id: 'manual-update', kind: 'update', skinId: manual.id, phase: 'done' }
      return {}
    })
    render(<SkinMarketSection t={key => key} />)

    await openSkinCard()
    fireEvent.click(within(screen.getByRole('main', { name: zh['common.detailContent'] })).getByRole('button', { name: '更新' }))
    const dialog = await screen.findByRole('dialog', { name: zh['common.installationUnverifiedUpdateTitle'] })
    fireEvent.click(within(dialog).getByRole('button', { name: zh['common.stillUpdate'] }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/update') && init?.method === 'POST')).toBe(true))
  })
  it('does not expose repository health checks in skin details', async () => {
    const healthSkin = { ...skin, health: {
      status: 'improvements' as const,
      checks: { readmeScreenshots: 'pass' as const, compatibility: 'improve' as const, installation: 'pass' as const },
      suggestions: ['建议声明支持的 DSH Web 版本范围。'],
    } }
    stubMarketFetch(async (url: string) => (url.endsWith('/catalog') ? { skins: [healthSkin] } : { skins: [] }))
    render(<SkinMarketSection t={key => key} />)
    await openSkinCard()

    await screen.findByRole('heading', { name: zh['common.aboutSkin'] })
    expect(screen.queryByRole('heading', { name: '仓库健康' })).toBeNull()
    expect(screen.queryByText('README 截图')).toBeNull()
    expect(screen.queryByText('建议声明支持的 DSH Web 版本范围。')).toBeNull()
  })
})
