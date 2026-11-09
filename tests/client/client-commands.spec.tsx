// Client market tests: Agent prompts and copied install commands
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => (await import('../fixtures/client-market.tsx')).createPrimitivesMock())

import { SkinMarketSection } from '../../src/client/SkinMarketSection.tsx'
import { createSkinInstallCommandGroups, createSkinInstallCommands, createSkinInstallPrompt } from '../../src/client/submission.ts'
import { requestCount, stubMarketFetch } from '../fixtures/market-host.ts'
import { managedDesktopSkin, officialManagement, openSkinCard, registerMarketTestDom, skin, zh } from '../fixtures/client-market.tsx'

registerMarketTestDom()

describe('client market commands', () => {
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
    const stateReads = requestCount(fetchMock, '/state')
    fireEvent.focus(window)
    await waitFor(() => expect(requestCount(fetchMock, '/state')).toBeGreaterThan(stateReads))
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
})
