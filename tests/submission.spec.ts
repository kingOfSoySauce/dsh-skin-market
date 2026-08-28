import { describe, expect, it } from 'vitest'
import { createSkinInstallCommand, createSkinInstallPrompt, createSubmissionPrompt, normalizeGitHubRepository, REGISTRY_REPOSITORY } from '../src/client/submission.ts'
import type { CatalogSkin } from '../src/client/types.ts'

describe('agent-assisted skin submission', () => {
  it('normalizes a public GitHub repository and generates an actionable PR prompt', () => {
    const repository = normalizeGitHubRepository('https://github.com/example/dsh-skin.git')
    expect(repository).toBe('https://github.com/example/dsh-skin')

    const prompt = createSubmissionPrompt(repository!)
    expect(prompt).toContain('皮肤仓库：https://github.com/example/dsh-skin')
    expect(prompt).toContain(`目标目录仓库：${REGISTRY_REPOSITORY}`)
    expect(prompt).toContain('YAML 默认写成薄条目即可')
    expect(prompt).toContain('url: https://github.com/<owner>/<repo>')
    expect(prompt).toContain('npm run registry:check')
    expect(prompt).toContain('不要修改 data/catalog.json')
    expect(prompt).toContain('创建 PR')
    expect(prompt).toContain('不要读取 .env')
  })

  it('rejects non-repository and non-GitHub URLs', () => {
    expect(normalizeGitHubRepository('https://example.com/owner/repo')).toBeNull()
    expect(normalizeGitHubRepository('https://github.com/owner/repo/issues')).toBeNull()
    expect(createSubmissionPrompt('not a url')).toBe('')
  })

  it('generates a direct prompt that asks the agent to resolve the skin repository', () => {
    const prompt = createSubmissionPrompt()
    expect(prompt).toContain('如果当前工作区就是待提交的皮肤仓库')
    expect(prompt).toContain('否则先向我索要公开 GitHub 仓库地址')
    expect(prompt).toContain(`目标目录仓库：${REGISTRY_REPOSITORY}`)
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
    expect(prompt.indexOf('安装前只读检查')).toBeLessThan(prompt.indexOf('然后执行上面的全部固定安装命令'))
    expect(createSkinInstallCommand(skin)).toBe(`dsh plugin --profile web add "${skin.install.target}"`)
  })

  it('copies subdirectory install targets as pnpm add so Windows cmd does not split on &', () => {
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
    expect(command).toContain(`pnpm add "${skin.install.target}" --dir "$env:USERPROFILE\\.dsh\\profiles\\web"`)
    expect(command).toContain(`pnpm add "${skin.install.companions![0]!.target}" --dir "$HOME/.dsh/profiles/web"`)
    const prompt = createSkinInstallPrompt(skin)
    expect(prompt).toContain('伴生包：@dsh-external/dsh-client-ui-skin-deep-whale-manager')
    expect(prompt).toContain('全部固定安装命令（含伴生包）')
    expect(prompt).toContain('ui-skin-deep-whale-manager')
  })
})
