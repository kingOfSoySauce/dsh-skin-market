// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../site/main.tsx'
import type { CatalogSkin } from '../src/client/types.ts'

const commit = 'a'.repeat(40)
const skin = {
  id: 'test.skin', name: { zh: '测试皮肤', en: 'Test Skin' }, author: 'example', description: '测试皮肤',
  repo: 'https://github.com/example/skins', package: '@example/skin', rowId: 'skin', tags: [], modes: ['dark'],
  install: {
    target: `github:example/skins#${commit}&path:/packages/skin`, version: '1.0.0', commit,
    companions: [{ package: '@example/bridge', rowId: 'bridge', target: '@example/bridge@1.2.3', version: '1.2.3', commit }],
  },
  compatibility: { dsh: '*', platform: ['web'] }, screenshots: [],
  review: { compatibility: 'verified', preview: 'verified', installation: 'manual-only' },
  featuredRank: 0, starsSnapshot: 10, updatedAt: '2026-10-16',
} as CatalogSkin & { featuredRank: number; starsSnapshot: number; updatedAt: string }

const writeText = vi.fn(async (_value: string) => undefined)

beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener() {}, removeListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('public catalog filters', () => {
  it('omits the redundant public page headings while keeping search and filters', () => {
    render(<App skins={[skin]} />)

    expect(screen.queryByText('发现皮肤')).toBeNull()
    expect(screen.queryByText('发现更多')).toBeNull()
    expect(screen.getByRole('textbox', { name: '搜索皮肤、作者或标签' })).toBeTruthy()
    expect(screen.getByRole('group', { name: '分类' })).toBeTruthy()
  })

  it('clears the public catalog search from the visible clear button', () => {
    render(<App skins={[skin]} />)

    const search = screen.getByRole('textbox', { name: '搜索皮肤、作者或标签' })
    fireEvent.change(search, { target: { value: '测试' } })
    fireEvent.click(screen.getByRole('button', { name: '清空搜索' }))

    expect((search as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('button', { name: /测试皮肤 界面预览/ })).toBeTruthy()
  })

  it('shows skins and splash by default and toggles the other categories', () => {
    const pet = { ...skin, id: 'test.pet', name: { zh: '桌面宠物', en: 'Desk Pet' }, category: 'pet' as const }
    const player = { ...skin, id: 'test.player', name: { zh: '音乐播放器', en: 'Music Player' }, category: 'player' as const }
    render(<App skins={[skin, pet, player]} />)
    const filters = screen.getByRole('group', { name: '分类' })
    expect(within(filters).getByRole('button', { name: '皮肤' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(filters).getByRole('button', { name: '启动动画' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(filters).getByRole('button', { name: '桌宠' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('button', { name: /桌面宠物 界面预览/ })).toBeNull()
    fireEvent.click(within(filters).getByRole('button', { name: '桌宠' }))
    expect(screen.getByRole('button', { name: /桌面宠物 界面预览/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /音乐播放器 界面预览/ })).toBeNull()
  })
})

describe('public install panel', () => {
  it('shows aligned skin and market groups with one package and one common command each', async () => {
    render(<App skins={[{ ...skin, install: { ...skin.install, target: `github:example/skins#${commit}`, desktop: { mode: 'managed', registry: 'npm', packageName: '@example/skin', packageVersion: '1.0.0' } } }]} />)
    fireEvent.click(screen.getByRole('button', { name: '需手动安装' }))

    const dialog = screen.getByRole('dialog', { name: '安装 测试皮肤' })
    expect(dialog.querySelector('.install-method-grid')?.getAttribute('data-single')).toBe('false')
    expect(within(dialog).queryByRole('combobox')).toBeNull()
    expect(within(dialog).queryByRole('tablist')).toBeNull()
    expect(within(dialog).queryByRole('group', { name: '安装环境' })).toBeNull()
    expect(within(dialog).queryByText(/伴生插件包名|伴生插件命令/)).toBeNull()
    const group = screen.getByRole('region', { name: '安装这个皮肤' })
    expect(within(group).getAllByText('提示词')).toHaveLength(1)
    expect(within(group).getAllByText('桌面版')).toHaveLength(1)
    const desktopInput = within(group).getByRole('textbox', { name: '安装这个皮肤的桌面版插件包名' }) as HTMLInputElement
    expect(desktopInput.value).toBe('@example/skin')
    expect(desktopInput.readOnly).toBe(true)
    expect(within(group).getAllByText('命令')).toHaveLength(1)

    fireEvent.click(within(group).getByRole('button', { name: '复制安装这个皮肤的桌面版插件包名' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('@example/skin'))
    expect(within(group).getByRole('button', { name: '已复制安装这个皮肤的桌面版插件包名' })).toBeTruthy()
    fireEvent.click(within(group).getByRole('button', { name: '复制安装这个皮肤的命令' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(`dsh plugin --profile web add "github:example/skins#${commit}"`))
    expect(writeText.mock.calls.at(-1)![0]).not.toMatch(/[\r\n]/)

    fireEvent.click(within(group).getByRole('button', { name: '复制安装这个皮肤的提示词' }))
    await waitFor(() => expect(writeText.mock.calls.at(-1)![0]).toContain('@example/bridge@1.2.3'))
    const market = screen.getByRole('region', { name: '安装皮肤市场' })
    fireEvent.click(within(market).getByRole('button', { name: '复制安装皮肤市场的桌面版插件包名' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('dsh-skin-market'))
    fireEvent.click(within(market).getByRole('button', { name: '复制安装皮肤市场的命令' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('dsh plugin --profile web add "dsh-skin-market"'))
  })

  it('lists one maid atelier command per terminal and keeps companions in the prompt', async () => {
    const commit = 'b693d2c224a0a6fb5b621e7cc1284f20d9849c1c'
    const primary = `github:Small-tailqwq/dsh-deep-whale#${commit}&path:/maid-atelier`
    const companion = `github:Small-tailqwq/dsh-deep-whale#${commit}&path:/skin-manager`
    const maidAtelier = {
      ...skin, id: 'small-tailqwq.maid-atelier', name: { zh: '深海女仆工坊', en: 'Abyssal Maid Atelier' },
      repo: 'https://github.com/Small-tailqwq/dsh-deep-whale', package: '@dsh-external/dsh-client-ui-skin-maid-atelier', rowId: 'ui-skin-maid-atelier',
      install: { target: primary, version: '0.0.1', commit, desktop: { mode: 'manual-only' as const, reason: 'npm-package-not-found' }, companions: [{
        package: '@dsh-external/dsh-client-ui-skin-deep-whale-manager', rowId: 'ui-skin-deep-whale-manager', target: companion, version: '0.1.0', commit,
      }] },
      review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'verified' as const },
    }
    render(<App skins={[maidAtelier]} />)
    fireEvent.click(screen.getByRole('button', { name: '安装' }))
    const group = screen.getByRole('region', { name: '安装这个皮肤' })
    expect(within(group).queryByText('此皮肤需按实际环境安装，请复制提示词。')).toBeNull()
    expect(within(group).queryByText(/按运行 Web 版 DSH 的电脑和终端选择一组/)).toBeNull()
    expect(within(group).queryByRole('button', { name: '复制安装这个皮肤的命令' })).toBeNull()
    const terminals = [
      { label: 'macOS / Linux', directory: '"$HOME/.dsh/profiles/web"' },
      { label: 'Windows PowerShell', directory: '"$env:USERPROFILE\\.dsh\\profiles\\web"' },
      { label: 'Windows CMD', directory: '"%USERPROFILE%\\.dsh\\profiles\\web"' },
    ]
    for (const terminal of terminals) {
      const primaryCommand = `pnpm add "${primary}" --dir ${terminal.directory}`
      expect(within(group).getByText(terminal.label)).toBeTruthy()
      expect(within(group).getByText(primaryCommand).closest('.copy-capsule')).toBeTruthy()
      fireEvent.click(within(group).getByRole('button', { name: `复制安装这个皮肤的${terminal.label}` }))
      await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(primaryCommand))
    }
    const commandRows = [...group.querySelectorAll('code')].filter(node => node.textContent?.startsWith('pnpm add '))
    expect(commandRows).toHaveLength(3)
    expect(commandRows.every(node => !node.textContent?.includes(companion))).toBe(true)
    fireEvent.click(within(group).getByRole('button', { name: '复制安装这个皮肤的桌面版插件包名' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(primary))
    fireEvent.click(within(group).getByRole('button', { name: '复制安装这个皮肤的提示词' }))
    await waitFor(() => expect(writeText.mock.calls.at(-1)![0]).toContain(companion))
  })

  it('keeps the market-only dialog as a single group with the same three fields', async () => {
    render(<App skins={[skin]} />)
    fireEvent.click(screen.getByRole('button', { name: '安装皮肤市场' }))
    const dialog = screen.getByRole('dialog', { name: '安装皮肤市场' })
    expect(dialog.querySelector('.install-method-grid')?.getAttribute('data-single')).toBe('true')
    expect(within(dialog).queryByRole('region', { name: '安装这个皮肤' })).toBeNull()
    expect(within(dialog).getAllByRole('region')).toHaveLength(1)
    expect(within(dialog).getByText('提示词')).toBeTruthy()
    expect(within(dialog).getByText('桌面版')).toBeTruthy()
    expect(within(dialog).getByText('命令')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '复制安装皮肤市场的命令' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('dsh plugin --profile web add "dsh-skin-market"'))
  })

  it('shows inline sorting modes with only Stars on a skin card', () => {
    const withHeat = {
      ...skin,
      heat: { ageDays: 12, starsPerDay: 1, starGrowthPerDay: 0.5, commitsPerDay: 0, pullsPerDay: 0, issuesPerDay: 0, score: 2, asOf: '2026-10-27' },
    }
    render(<App skins={[withHeat]} />)

    const sortOptions = screen.getByRole('group', { name: '排序方式' })
    expect(within(sortOptions).getByRole('button', { name: '热度' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(sortOptions).getByRole('button', { name: 'Stars' }).getAttribute('aria-pressed')).toBe('false')
    expect(within(sortOptions).getByRole('button', { name: '最新' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByText(/优先/)).toBeNull()
    expect(screen.getByRole('button', { name: '测试皮肤 界面预览' }).textContent).not.toContain('/天')

    fireEvent.click(within(sortOptions).getByRole('button', { name: 'Stars' }))
    expect(within(sortOptions).getByRole('button', { name: 'Stars' }).getAttribute('aria-pressed')).toBe('true')
  })
})
