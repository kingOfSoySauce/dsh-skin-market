import { describe, expect, it } from 'vitest'
import { MARKET_CLI_COMMAND, MARKET_DESKTOP_INPUT, MARKET_PROMPT, MARKET_REPOSITORY, MARKET_WEB_COMMAND, skinCommand, skinPrompt, skinWebCommand, skinWebCommandGroups } from '../site/prompts.ts'
import type { CatalogSkin } from '../src/client/types.ts'

const skin = {
  repo: 'https://github.com/example/dsh-skin', package: 'example-skin', rowId: 'example-skin',
  install: { target: `github:example/dsh-skin#${'a'.repeat(40)}`, version: '1.0.0', commit: 'a'.repeat(40) },
} as CatalogSkin

describe('static catalog prompts', () => {
  it('generates the platform installation prompt', () => {
    expect(MARKET_PROMPT).toContain(MARKET_REPOSITORY)
    expect(MARKET_DESKTOP_INPUT).toBe('dsh-skin-market')
    expect(MARKET_CLI_COMMAND).toBe('dsh plugin --profile web add "dsh-skin-market"')
    expect(MARKET_CLI_COMMAND).toBe(MARKET_WEB_COMMAND)
    expect(MARKET_CLI_COMMAND).not.toContain('\n')
    expect(MARKET_CLI_COMMAND).not.toContain('#')
    expect(MARKET_CLI_COMMAND).not.toContain('--profile desktop')
    expect(MARKET_PROMPT).toContain('判断是 Web 版还是官方 Desktop')
    expect(MARKET_PROMPT).toContain('无法判断就先问我')
    expect(MARKET_PROMPT).toContain('不要执行 dsh plugin --profile desktop')
    expect(MARKET_PROMPT).toContain('无需先检查或停用其他皮肤')
    expect(MARKET_PROMPT).not.toContain('发现其他皮肤插件就列出并停下')
    const desktop = MARKET_PROMPT.split('- 官方 Desktop：')[1]!
    expect(desktop).toContain('插件管理工具')
    expect(desktop).toContain('我确认后由你安装并启用')
    expect(desktop).toContain('每次只给一个操作，等我反馈再继续')
    expect(desktop).toContain('未核实不能宣称成功')
    expect(desktop).not.toContain(MARKET_WEB_COMMAND)
  })

  it('routes manual Desktop skins to a confirmed agent install with a user fallback', () => {
    const prompt = skinPrompt(skin)
    expect(prompt).toContain(`仓库：${skin.repo}`)
    expect(prompt).toContain(skin.install.target)
    expect(prompt).toContain('判断当前是 Web 版还是官方 Desktop')
    expect(prompt).toContain('不要执行 dsh plugin --profile desktop')
    expect(prompt).toContain('皮肤详情点击「安装」')
    expect(prompt).toContain('必须先完成只读冲突检查')
    expect(prompt).toContain('停在安装前')
    const desktop = prompt.split('\n\n官方 Desktop：')[1]!.split('\n\nWeb 版：')[0]!
    expect(desktop).toContain('「插件 → 添加插件」')
    expect(desktop).toContain('插件管理工具')
    expect(desktop).toContain('由你安装（默认不启用）')
    expect(desktop).not.toContain('dsh plugin --profile web add')
  })

  it('prefers the published npm package in manual Desktop prompts', () => {
    const npmSkin = {
      ...skin,
      install: {
        ...skin.install,
        npm: {
          name: 'example-skin', version: '1.0.0',
          integrity: 'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
          repository: 'https://github.com/example/dsh-skin', gitHead: 'a'.repeat(40),
        },
      },
    } as CatalogSkin
    const prompt = skinPrompt(npmSkin)
    expect(prompt).toContain('example-skin@1.0.0')
    expect(prompt).toContain('已发布的 npm 包')
    expect(prompt).toContain('没有 npm 包时再用 GitHub')
  })

  it('adds a review-first guard to unverified skin prompts', () => {
    const prompt = skinPrompt({ ...skin, review: { compatibility: 'unverified', preview: 'verified', installation: 'manual-only' } })

    expect(prompt).toContain(`仓库：${skin.repo}`)
    expect(prompt).toContain('先只读检查仓库')
    expect(prompt).toContain('等待我确认后再安装')
    expect(prompt).toContain('不要直接安装')
  })

  it('generates a command for the catalog-pinned skin target', () => {
    const target = `github:example/dsh-skin#${'a'.repeat(40)}`
    const command = skinCommand(target)

    expect(command).toBe(`dsh plugin --profile web add "${target}"`)
    expect(command).not.toContain('\n')
    expect(command).not.toContain('--profile desktop')
  })

  it('keeps the legacy single-command helper unavailable for subdirectory targets', () => {
    const target = `github:example/dsh-skin#${'a'.repeat(40)}&path:/packages/skin`
    expect(skinWebCommand({ ...skin, install: { ...skin.install, target } })).toBeUndefined()
  })

  it('keeps a common standalone command in one unlabeled group', () => {
    const groups = skinWebCommandGroups(skin)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.label).toBe('')
    expect(groups[0]!.commands.map(entry => entry.value)).toEqual([`dsh plugin --profile web add "${skin.install.target}"`])
  })

  it('keeps public npm copy commands on the default tag', () => {
    const groups = skinWebCommandGroups({ ...skin, install: { ...skin.install, target: 'example-skin@1.2.3' } })
    expect(groups[0]!.commands.map(entry => entry.value)).toEqual(['dsh plugin --profile web add "example-skin"'])
  })

  it('provides each terminal with only the primary subdirectory command', () => {
    const commit = 'b693d2c224a0a6fb5b621e7cc1284f20d9849c1c'
    const primary = `github:Small-tailqwq/dsh-deep-whale#${commit}&path:/maid-atelier`
    const companion = `github:Small-tailqwq/dsh-deep-whale#${commit}&path:/skin-manager`
    const groups = skinWebCommandGroups({ ...skin, install: { ...skin.install, target: primary, companions: [{
      package: '@dsh-external/dsh-client-ui-skin-deep-whale-manager', rowId: 'ui-skin-deep-whale-manager',
      target: companion, version: '0.1.0', commit,
    }] } })
    expect(groups.map(group => group.label)).toEqual(['macOS / Linux', 'Windows PowerShell', 'Windows CMD'])
    const directories = ['"$HOME/.dsh/profiles/web"', '"$env:USERPROFILE\\.dsh\\profiles\\web"', '"%USERPROFILE%\\.dsh\\profiles\\web"']
    groups.forEach((group, index) => {
      expect(group.commands.map(entry => entry.value)).toEqual([
        `pnpm add "${primary}" --dir ${directories[index]}`,
      ])
    })
  })
})
