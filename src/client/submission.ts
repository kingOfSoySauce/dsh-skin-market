import { createInstallCommand } from '../install-command.ts'
import { effectiveBuildApprovalKey } from '../build-approval.ts'

export const REGISTRY_REPOSITORY = 'https://github.com/kingOfSoySauce/dsh-skin-market'
export const REGISTRY_PATH = 'registry/skins'
export const CLI_INSTALL_WARNING = '安装前请确保已关闭其他皮肤插件，避免全局样式冲突；也可以复制提示词，让 Agent 先检查冲突再安装。'

export function normalizeGitHubRepository(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null
    const parts = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean)
    if (parts.length !== 2) return null
    return `https://github.com/${parts[0]}/${parts[1]}`
  } catch {
    return null
  }
}

export function createSubmissionPrompt(repositoryInput?: string): string {
  const repository = repositoryInput === undefined ? null : normalizeGitHubRepository(repositoryInput)
  if (repositoryInput !== undefined && repository === null) return ''
  const repositoryLine = repository === null
    ? '皮肤仓库：如果当前工作区就是待提交的皮肤仓库，请确认它的公开 GitHub remote；否则先向我索要公开 GitHub 仓库地址。'
    : `皮肤仓库：${repository}`

  return `请把我的 DSH 皮肤提交到 DSH Skin Market。

${repositoryLine}
目标目录仓库：${REGISTRY_REPOSITORY}
目录路径：${REGISTRY_PATH}

请自主完成以下工作：
1. 只用只读方式确认皮肤仓库是公开的 GitHub 仓库（或 monorepo 子目录），且确实是可安装的 DSH Web 皮肤。不要读取 .env、凭据或聊天记录。
2. fork/clone 目标目录仓库并新建分支。在 ${REGISTRY_PATH} 下只新增一个 YAML，文件名用 owner__repo.yml（子包用 owner__repo--path.yml）。不要覆盖已有条目，不要修改 data/catalog.json。
3. YAML 默认写成薄条目即可，CI 会从仓库读取 package、loader id、许可证、commit 和预览图。最小内容：

url: https://github.com/<owner>/<repo>
# subpath: packages/my-skin   # 仅 monorepo 子包需要
# description: 一句中文或英文描述  # 可选；缺省则用 package.json description

4. 预览图优先放在皮肤仓库自己的 screenshots.json（相对路径），或 README 里的仓库内图片。不要把 SVG、data URI、第三方图床写进市场 YAML。
5. 若你要自己写完整 schema，也可以；不要编造 commit SHA、rowId 或许可证。缺少关键信息时先列出缺项。
6. 在目标目录仓库根目录运行 npm run registry:check。不得安装到我的真实 DSH profile。
7. git diff --name-only 应只有 ${REGISTRY_PATH}/<条目文件>.yml。提交并向 ${REGISTRY_REPOSITORY} 创建 PR，标题 feat(registry): add <皮肤名>。
8. 返回 PR 链接；没有 GitHub 权限时只准备好分支和可复制的 PR 内容。

收录不等于安全认证。不要声称该皮肤已被 DSH 官方、安全团队或市场背书。`
}

export function createSkinInstallPrompt(skin: CatalogSkin): string {
  const buildApprovalKey = effectiveBuildApprovalKey(skin)
  const buildApproval = buildApprovalKey === undefined
    ? ''
    : `\n- 这个固定版本包含 prepare 构建脚本。只允许精确构件键 \`${buildApprovalKey}\`：在 profile 的 pnpm-workspace.yaml 里合并 \`allowBuilds:\n    '${buildApprovalKey}': true\`，不得开启 dangerouslyAllowAllBuilds。`
  const companions = skin.install.companions ?? []
  const companionLines = companions.length === 0
    ? ''
    : `\n${companions.map(companion => `- 伴生包：${companion.package}（rowId ${companion.rowId}）\n- 伴生安装目标：${companion.target}`).join('\n')}`
  const command = createSkinInstallCommand(skin)
  const packages = [skin.package, ...companions.map(companion => companion.package)].join('、')
  const rowIds = [skin.rowId ?? skin.package, ...companions.map(companion => companion.rowId)].join('、')
  return `请把下面这个已固定版本的 DSH Web 皮肤安装到 web profile。必须先完成只读冲突检查，确认可以继续后再安装。\n\n- 仓库：${skin.repo}\n- 安装目标：${skin.install.target}\n- 安装命令：\n${command}\n- package：${skin.package}\n- loader rowId：${skin.rowId ?? skin.package}${companionLines}\n- 版本：${skin.install.version}\n- commit：${skin.install.commit}${buildApproval}\n\n严格按以下顺序执行：\n1. 不要改成 main、HEAD 或最新版本，必须使用上面的完整 commit。\n2. 安装前只读检查 web profile 的 package.json（dependencies 与 dsh.profile.bundles）、profile 的 cordis.patch.yml 和 $DSH_HOME/cordis.patch.yml（如有）。不要读取 .env、凭据或聊天记录。\n3. 从当前启用的 bundles 中识别其他皮肤、主题或外观插件：排除 @deepseek-ai/dsh-base、@deepseek-ai/dsh-web-app、dsh-skin-market 和本次目标 package ${skin.package}；读取候选 package.json 的名称、描述、dsh.client/dsh.bundle 声明，必要时再读 README。无法确定的候选先列出包名和描述。\n4. 如果发现其他已启用的皮肤插件，列出它们并停在安装前，提醒我先在“设置 → 皮肤市场”或 profile 的 cordis.patch.yml 中停用；未经我确认不得修改任何 profile 文件，也不得执行安装。\n5. 如果没有冲突，明确说“未检测到其他已启用的皮肤插件”，然后执行上面的全部固定安装命令（含伴生包）；不要替我安装、停用或卸载其他皮肤。\n6. 如果目标只有 dsh.client，幂等地确认 package ${packages} 和 rowId ${rowIds} 已注册到 web profile 的 cordis.patch.yml；不要放宽其他包的构建权限。\n7. 安装后验证 profile package.json 的 dependencies 和 dsh.profile.bundles、node_modules 中目标 package.json 的 dsh.client/dsh.bundle 声明，以及 loader rowId 注册项。任一缺失都要报告为安装或注册失败。\n8. 告诉我如何重启 DSH Web 使皮肤生效。`
}

export function createSkinInstallCommand(skin: CatalogSkin): string {
  const targets = [skin.install.target, ...(skin.install.companions ?? []).map(companion => companion.target)]
  return [...new Set(targets)].map(target => createInstallCommand(target)).join('\n')
}
import type { CatalogSkin } from './types.ts'
