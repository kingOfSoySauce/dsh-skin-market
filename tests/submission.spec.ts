import { describe, expect, it } from 'vitest'
import { createSkinInstallCommand, createSkinInstallCommandGroups, createSkinInstallCommands, createSkinInstallInputs, createSkinInstallPrompt, createSkinInstallSearchKeyword, createSubmissionPrompt, normalizeGitHubRepository, REGISTRY_PATH, REGISTRY_REPOSITORY } from '../src/client/submission.ts'
import { createStaticTranslator } from '../src/client/i18n.ts'
import type { CatalogSkin } from '../src/client/types.ts'

describe('agent-assisted skin submission', () => {
  it('normalizes a public GitHub repository and rejects non-repository URLs', () => {
    expect(normalizeGitHubRepository('https://github.com/example/dsh-skin.git')).toBe('https://github.com/example/dsh-skin')
    expect(normalizeGitHubRepository('https://example.com/owner/repo')).toBeNull()
    expect(normalizeGitHubRepository('https://github.com/owner/repo/issues')).toBeNull()
    expect(normalizeGitHubRepository('not a url')).toBeNull()
  })

  it('generates a submission prompt that normalizes the repository and names the target catalog', () => {
    const prompt = createSubmissionPrompt('https://github.com/example/dsh-skin.git')
    expect(prompt).toContain(`皮肤仓库：https://github.com/example/dsh-skin`)
    expect(prompt).toContain(`目标目录仓库：${REGISTRY_REPOSITORY}`)
    expect(prompt).toContain(`目录路径：${REGISTRY_PATH}`)
    expect(prompt).toContain('npm run registry:check')
    expect(prompt).toContain('创建 PR')
    expect(prompt).toContain('不要读取 .env')
    expect(prompt).toContain('收录不等于安全认证')
  })

  it('requires url and reminds authors to fill every optional field', () => {
    const prompt = createSubmissionPrompt()
    expect(prompt).toContain('如果当前工作区就是待提交的皮肤仓库')
    expect(prompt).toContain('否则先向我索要公开 GitHub 仓库地址')
    expect(prompt).toContain('url（必填）')
    for (const field of ['subpath', 'name.zh', 'name.en', 'author', 'description', 'category', 'tags', 'modes', 'screenshots']) {
      expect(prompt).toContain(field)
    }
    expect(prompt).toContain('缺省时由 CI 推导')
    expect(prompt).toContain('尽量填写你能确认的可选字段')
    expect(prompt).toContain('category 只能是 skin、pet、player 或 splash')
    expect(prompt).toContain('tags 是非空字符串数组')
    expect(prompt).toContain('modes 只能是 light、dark 的非空子集')
    expect(prompt).toContain('package、rowId、install、license、compatibility、commit 仍由 CI 从仓库读取')
    expect(prompt).toContain('不要手写')
    expect(prompt).toContain('只允许以下字段，一个都不能多')
    expect(prompt).toContain('不要修改 data/catalog.json')
    expect(prompt).toContain('不要靠补全 schema 过 CI')
    expect(prompt).toContain('不要声称该皮肤已被 DSH 官方、安全团队或市场背书')
  })

  it('returns an empty prompt for a URL that is not a GitHub repository', () => {
    expect(createSubmissionPrompt('https://example.com/owner/repo')).toBe('')
    expect(createSubmissionPrompt('https://github.com/owner/repo/issues')).toBe('')
    expect(createSubmissionPrompt('not a url')).toBe('')
  })

  it('localizes the submission prompt in English', () => {
    const prompt = createSubmissionPrompt('https://github.com/example/dsh-skin', createStaticTranslator('en'))
    expect(prompt).toContain('Skin repository: https://github.com/example/dsh-skin')
    expect(prompt).toContain(`Target catalog repository: ${REGISTRY_REPOSITORY}`)
    expect(prompt).toContain('url (required)')
    expect(prompt).toContain('Every field except url may be omitted')
    expect(prompt).toContain('category is one of skin, pet, player, or splash')
    expect(prompt).toContain('npm run registry:check')
    expect(prompt).toContain('A catalog entry is not a safety certification')
  })

  it('generates a pinned installation fallback prompt with an exact build approval', () => {
    const skin = {
      id: 'dancingmemory.dskin', repo: 'https://github.com/dancingmemory/dskin', package: 'dskin', rowId: 'ui-skin-dskin',
      install: {
        target: 'github:dancingmemory/dskin#f24cf34bd21d23845a8b9bdaf3dbf46d01a952ed', version: '1.0.13', commit: 'f24cf34bd21d23845a8b9bdaf3dbf46d01a952ed',
        allowBuild: 'dskin@https://codeload.github.com/dancingmemory/dskin/tar.gz/f24cf34bd21d23845a8b9bdaf3dbf46d01a952ed',
      },
    } as CatalogSkin
    const prompt = createSkinInstallPrompt(skin)
    expect(prompt).toContain(skin.install.target)
    expect(prompt).toContain(skin.install.allowBuild!)
    expect(prompt).toContain('不得开启 dangerouslyAllowAllBuilds')
    expect(prompt).toContain('cordis.patch.yml')
    expect(prompt).toContain('必须先完成只读冲突检查')
    expect(prompt).toContain('停在安装前')
    expect(prompt).toContain('未经我确认不得修改任何 profile 文件，也不得执行安装')
    const webPrompt = createSkinInstallPrompt(skin, 'dsh')
    expect(webPrompt.indexOf('必须先完成只读冲突检查')).toBeLessThan(webPrompt.indexOf('dsh plugin --profile web add'))
    expect(createSkinInstallCommand(skin)).toBe(`dsh plugin --profile web add "${skin.install.target}"`)
  })

  it('lists one primary subdirectory command per terminal and keeps companions in the Agent prompt', () => {
    const commit = 'a'.repeat(40)
    const skin = {
      id: 'small-tailqwq.maid-atelier',
      install: {
        target: `github:Small-tailqwq/dsh-deep-whale#${commit}&path:/maid-atelier`,
        companions: [{
          package: '@dsh-external/dsh-client-ui-skin-deep-whale-manager',
          target: `github:Small-tailqwq/dsh-deep-whale#${commit}&path:/skin-manager`,
          version: '0.1.0',
          commit,
          rowId: 'ui-skin-deep-whale-manager',
        }],
      },
    } as CatalogSkin
    const command = createSkinInstallCommand(skin)
    expect(command).toContain(`pnpm add "${skin.install.target}" --dir "$HOME/.dsh/profiles/web"`)
    expect(command).not.toContain('\n')
    const commands = createSkinInstallCommands(skin, { shell: 'powershell' })
    expect(commands).toHaveLength(1)
    expect(commands[0]!.value).toContain('$env:USERPROFILE')
    expect(commands[0]!.value).not.toContain(skin.install.companions![0]!.target)
    const groups = createSkinInstallCommandGroups(skin)
    expect(groups.map(group => group.label)).toEqual(['macOS / Linux', 'Windows PowerShell', 'Windows CMD'])
    for (const group of groups) {
      expect(group.commands).toHaveLength(1)
      expect(group.commands[0]!.value).toContain(skin.install.target)
      expect(group.commands[0]!.value).not.toContain(skin.install.companions![0]!.target)
      for (const entry of group.commands) expect(entry.value).not.toMatch(/[\r\n]/)
    }
    expect(groups[0]!.commands[0]!.value).toContain('$HOME/.dsh/profiles/web')
    expect(groups[1]!.commands[0]!.value).toContain('$env:USERPROFILE')
    expect(groups[2]!.commands[0]!.value).toContain('%USERPROFILE%')
    expect(createSkinInstallCommandGroups(skin, { shell: 'powershell', profile: 'work', profileDir: 'C:\\DSH data\\profiles\\work' })).toEqual([
      expect.objectContaining({ key: 'powershell', commands: expect.arrayContaining([
        expect.objectContaining({ value: expect.stringContaining("--dir 'C:\\DSH data\\profiles\\work'") }),
      ]) }),
    ])
    expect(createSkinInstallInputs(skin).map(entry => entry.value)).toEqual([skin.install.target])
    const prompt = createSkinInstallPrompt(skin)
    expect(prompt).toContain('伴生包：@dsh-external/dsh-client-ui-skin-deep-whale-manager')
    expect(prompt).toContain('全部固定安装命令（含伴生包）')
    expect(prompt).toContain('ui-skin-deep-whale-manager')
    expect(createSkinInstallSearchKeyword(skin)).toBe(skin.install.target)
  })

  it('keeps a common primary command even when the Agent prompt includes a subdirectory companion', () => {
    const target = `github:owner/repo#${'a'.repeat(40)}&path:/manager`
    const skin = { install: { target: 'skin@1.0.0', companions: [{ target }] } } as CatalogSkin
    const groups = createSkinInstallCommandGroups(skin)
    expect(groups).toHaveLength(1)
    for (const group of groups) {
      expect(group.commands).toHaveLength(1)
      expect(group.commands[0]!.value).toBe('dsh plugin --profile web add "skin"')
    }
    expect(createSkinInstallCommandGroups({ install: { target: 'skin@1.0.0' } } as CatalogSkin)).toEqual([
      { key: 'posix', label: '', commands: [{ key: 'command', label: '命令', value: 'dsh plugin --profile web add "skin"' }] },
    ])
  })

  it('copies a bare npm name while keeping the reviewed target in the Agent prompt', () => {
    const skin = {
      repo: 'https://github.com/example/skin', package: 'example-skin', rowId: 'example-skin',
      install: { target: `github:example/skin#${'a'.repeat(40)}`, commit: 'a'.repeat(40), version: '1.2.3',
        allowBuild: 'github-only-build-key',
        npm: { name: 'example-skin', version: '1.2.3', repository: 'https://github.com/example/skin', integrity: 'sha512-abc', gitHead: 'a'.repeat(40) } },
    } as CatalogSkin
    expect(createSkinInstallCommand(skin)).toBe('dsh plugin --profile web add "example-skin"')
    expect(createSkinInstallSearchKeyword(skin)).toBe('example-skin')
    const prompt = createSkinInstallPrompt(skin)
    expect(prompt).toContain('固定安装目标：example-skin@1.2.3')
    expect(prompt).not.toContain('github-only-build-key')
    expect(prompt).not.toContain(skin.install.target)
  })

  it('routes manual Desktop installs through a confirmed agent install with a user fallback', () => {
    const commit = 'a'.repeat(40)
    const target = `github:owner/repo#${commit}&path:/packages/skin`
    const companionTarget = `github:owner/repo#${commit}&path:/packages/manager`
    const manual = {
      repo: 'https://github.com/owner/repo', package: 'skin', rowId: 'skin',
      install: { target, commit, version: '1.0.0', allowBuild: 'web-only-build-key',
        desktop: { mode: 'manual-only', reason: 'npm-package-not-found' },
        companions: [{ package: 'manager', rowId: 'manager', target: companionTarget, commit, version: '1.0.0' }] },
    } as CatalogSkin
    const prompt = createSkinInstallPrompt(manual, 'desktop')
    expect(prompt).toContain(target)
    expect(prompt).toContain(companionTarget)
    expect(prompt).toContain('插件管理工具')
    expect(prompt).toContain('由你安装（默认不启用）')
    expect(prompt).toContain('不能把“已安装”直接当成“已启用”')
    expect(prompt).toContain('无法读取启用状态时，先请我提供插件页中的状态')
    expect(prompt).toContain('「插件 → 添加插件」')
    expect(prompt).toContain('未核实不能宣称安装或启用成功')
    expect(prompt).not.toContain('dsh plugin --profile web')
    expect(prompt).not.toContain('pnpm add')
    expect(prompt).not.toContain('web-only-build-key')
    expect(prompt).not.toContain('幂等地确认')
    expect(prompt).not.toContain('Desktop 由皮肤市场负责安装')
  })

  it('prefers the published npm package in manual Desktop prompts', () => {
    const commit = 'a'.repeat(40)
    const manual = {
      repo: 'https://github.com/owner/repo', package: 'skin', rowId: 'skin',
      install: { target: `github:owner/repo#${commit}`, commit, version: '1.0.0',
        desktop: { mode: 'manual-only', reason: 'npm-package-not-found' },
        npm: {
          name: 'skin', version: '1.0.0',
          integrity: 'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
          repository: 'https://github.com/owner/repo', gitHead: commit,
        } },
    } as CatalogSkin
    const prompt = createSkinInstallPrompt(manual, 'desktop')
    expect(prompt).toContain('skin@1.0.0')
    expect(prompt).toContain('已发布的 npm 包')
    expect(prompt).toContain('没有 npm 包时再用 GitHub')
  })

  it('keeps managed npm Desktop skins on the market one-click path', () => {
    const managed = {
      repo: 'https://github.com/example/skin', package: 'skin', rowId: 'skin',
      review: { compatibility: 'verified', preview: 'verified', installation: 'manual-only' },
      install: { target: 'skin@1.0.0', version: '1.0.0', commit: 'a'.repeat(40),
        desktop: { mode: 'managed', registry: 'npm', packageName: 'skin', packageVersion: '1.0.0' } },
    } as CatalogSkin
    const prompt = createSkinInstallPrompt(managed, 'desktop')
    expect(prompt).toContain('点击一键安装')
    expect(prompt).toContain('插件管理工具')
    expect(prompt).not.toContain('这款皮肤在桌面市场需要手动安装')
    expect(prompt).not.toContain('dsh plugin --profile web')
  })
})
