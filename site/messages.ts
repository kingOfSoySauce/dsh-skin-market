import type { CatalogSkin } from '../src/client/types.ts'

export const SITE_LANGUAGES = ['zh', 'en'] as const
export type SiteLanguage = typeof SITE_LANGUAGES[number]
export const DEFAULT_SITE_LANGUAGE: SiteLanguage = 'zh'

type ChineseMessages = {
  readonly [key: string]: string
}

const zhMessages = {
  'metadata.title': 'DSH 皮肤市场',
  'metadata.description': '无需安装即可浏览 DSH 社区皮肤，并复制 Agent 安装提示词。',
  'metadata.themeColor': '#0d0e10',
  'site.brand': '皮肤市场',
  'site.platformActions': '站点操作',
  'site.github': 'GitHub',
  'site.installMarket': '安装皮肤市场',
  'site.qr.open': '扫码打开本页',
  'site.qr.alt': 'DSH 皮肤市场二维码',
  'catalog.section': '皮肤目录',
  'catalog.empty': '暂无皮肤',
  'catalog.noResults': '没有匹配的皮肤',
  'catalog.loadingMedia': '正在准备预览图…',
  'catalog.loading': '正在加载最新皮肤目录…',
  'catalog.error.request': '目录加载失败：请求返回 HTTP {status}。请刷新页面重试。',
  'catalog.error.invalidResponse': '目录加载失败：服务器返回了无效响应。请刷新页面重试。',
  'catalog.error.unsupportedVersion': '目录加载失败：目录版本不受支持。请刷新页面重试。',
  'catalog.error.missingSkins': '目录加载失败：目录缺少皮肤列表。请刷新页面重试。',
  'catalog.error.generic': '目录加载失败。请刷新页面重试。',
  'search.label': '搜索皮肤、作者或标签',
  'search.clear': '清空搜索',
  'sort.label': '排序方式',
  'sort.heat': '热度',
  'sort.stars': 'Stars',
  'sort.latest': '最新',
  'category.label': '分类',
  'category.skin': '皮肤',
  'category.pet': '桌宠',
  'category.player': '播放器',
  'category.splash': '启动动画',
  'skin.preview': '{name} 界面预览',
  'skin.manualInstall': '安装',
  'skin.install': '安装',
  'skin.details': '皮肤详情',
  'skin.detailsContent': '皮肤详情内容',
  'skin.closeDetails': '关闭详情',
  'skin.backToDiscover': '返回发现',
  'skin.version': '版本 {version}',
  'skin.dshVersion': 'DSH {version}',
  'skin.compatibilityVerified': '兼容已验证',
  'skin.compatibilityPending': '兼容待验证',
  'skin.installThis': '安装',
  'skin.compatibilityNotice': '兼容性待验证，安装前请先确认。',
  'skin.repositoryPreviewNotice': '该仓库暂无可识别的皮肤截图，页面使用本地占位卡，不会加载 GitHub 仓库图片。',
  'skin.marketScreenshotNotice': '当前展示的是市场在隔离 DSH 中实机补录的截图；仓库尚无可识别的界面截图。',
  'preview.noScreenshot': '{name} 暂无界面截图',
  'preview.noScreenshotShort': '暂无界面截图',
  'gallery.fullscreen': '全屏查看 {name} 截图 {index}',
  'gallery.preview': '{name} 界面预览',
  'gallery.previous': '上一张截图',
  'gallery.next': '下一张截图',
  'gallery.selection': '截图选择',
  'gallery.fullscreenLabel': '{name} 全屏查看截图',
  'gallery.close': '关闭全屏查看',
  'gallery.exit': '退出全屏查看',
  'gallery.viewShot': '查看截图 {index}',
  'info.about': '关于此皮肤',

  'info.license': '许可证',
  'info.modes': '模式',
  'info.platform': '平台',
  'info.recommendations': '更多推荐',
  'install.marketTitle': '安装皮肤市场',
  'install.skinTitle': '安装 {name}',
  'install.chooseOne': '选择一种方式即可，不必全部执行。',
  'install.close': '关闭',
  'install.skinSection': '安装这个皮肤',
  'install.marketSection': '通过皮肤市场安装',
  'install.desktop': '桌面版',
  'install.command': '命令',
  'install.prompt': '提示词',
  'install.copy': '复制{label}',
  'install.copied': '已复制{label}',
  'install.copyTitle': '复制',
  'install.copiedTitle': '已复制',
  'install.copyDesktop': '{group}的桌面版插件包名',
  'install.copyCommand': '{group}的命令',
  'install.copyPrompt': '{group}的提示词',
  'install.copyTerminal': '{group}的{terminal}',
  'install.manualCommandHint': '此皮肤需要按当前环境手动安装，请复制提示词。',
  'install.skinNote': '先检查已启用的皮肤，避免样式冲突。',
  'install.marketNote': '安装市场后，再在 DSH 内安装具体皮肤。',
  'install.terminal.posix': 'macOS / Linux',
  'install.terminal.powershell': 'Windows PowerShell',
  'install.terminal.cmd': 'Windows CMD',
  'toast.copied': '已复制',
  'preferences.group': '显示偏好',
  'preferences.language.label': '语言',
  'preferences.language.zh': '中文',
  'preferences.language.en': 'English',
  'preferences.theme.label': '主题',
  'preferences.theme.auto': '跟随系统',
  'preferences.theme.light': '日间',
  'preferences.theme.dark': '夜间',
  'preferences.language.menu': '语言',
  'preferences.theme.menu': '主题',
  'preferences.theme.description.auto': '跟随系统设置',
  'preferences.github.description': 'GitHub',
  'prompt.listSeparator': '、',
  'prompt.market': `请帮我安装 dsh-skin-market。先判断是 Web 版还是官方 Desktop，并核对当前宿主的实际 profile；无法判断就先问我。Web 查看 dsh --version；Desktop 以应用“关于”中的版本为准，不用系统终端的 npm dsh 版本代表桌面版本。不要读取 .env、凭据或其他存放秘密的配置。

这里只安装皮肤市场管理插件，不启用具体皮肤；无需先检查或停用其他皮肤，不要因为已有皮肤而阻断安装。
- Web 版：执行 {webCommand}，安装后验证同一 Web profile 中有 dsh-skin-market 的依赖和 bundle。
- 官方 Desktop：你负责只读检查和逐步指导，我负责操作。不要执行 dsh plugin --profile desktop，不要用 npm/pnpm 写入 Desktop profile，也不要修改 profile。指导我打开桌面应用「插件 → 添加插件」，输入 {desktopInput}，由我点击安装并按应用提示启用。每次只给一个操作，等我反馈再继续。安装后只读核对插件页的安装结果；读不到时请我提供状态，未核实不能宣称成功。

告诉我重启哪个宿主、从哪里打开「设置 → 皮肤市场」。Desktop 需要重启时，指导我完全退出应用再重新打开。不要替我安装、停用或卸载其他皮肤。

仓库：{repository}`,
  'prompt.skin.intro': '请帮我安装这个固定版本的 DSH 皮肤。{hostInstruction}',
  'prompt.skin.intro.desktop': '你负责检查和逐步指导，由我在桌面应用中操作。',
  'prompt.skin.metadata': '- 仓库：{repo}\n- 固定安装目标：{target}\n- package：{package}\n- loader rowId：{rowId}{companions}\n- 版本：{version}\n- commit：{commit}',
  'prompt.skin.companion': '- 伴生包：{package}（rowId {rowId}）\n- 伴生安装目标：{target}',
  'prompt.skin.buildApproval': "\n- 这个固定版本包含 prepare 构建脚本。只允许精确构件键 `{key}`：在 Web profile 的 pnpm-workspace.yaml 里合并 `allowBuilds:\n    '{key}': true`，不得开启 dangerouslyAllowAllBuilds。",
  'prompt.skin.reviewWarning': '\n维护者尚未声明可验证的 DSH 兼容范围。先只读检查仓库，核对当前宿主版本和安装方式；先告诉我结论和风险，等待我确认后再安装，不要直接安装。\n',
  'prompt.skin.conflict': '必须先完成只读冲突检查：从当前宿主的插件清单和实际启用状态识别其他皮肤、主题或外观插件，不能把“已安装”直接当成“已启用”。排除 @deepseek-ai/dsh-base、@deepseek-ai/dsh-web-app、dsh-skin-market 和本次目标 package {packages}。可只读核对 package.json 的名称、描述、dsh.client/dsh.bundle 声明及仓库 README。不要读取 .env、凭据、聊天记录或其他存放秘密的配置。发现可能冲突的已启用皮肤时，列出名称和依据并停在安装前，指导我通过当前宿主插件页停用；未经我确认不得修改任何 profile 文件，也不得执行安装。无法读取启用状态时，先请我提供插件页中的状态，不要声称没有冲突。确认没有其他已启用皮肤后，才说“未检测到其他已启用的皮肤插件”。',
  'prompt.skin.desktop.manual': '这款皮肤需要在桌面应用的官方插件面板确认安装。先只读查看仓库维护者的安装说明，确认固定安装目标及子目录（如有）可用于当前 Desktop；无法确认时说明缺少什么，不要猜测安装方式。\n{conflict}\n确认可以继续后，指导我在皮肤详情点击「安装」，由市场打开官方面板并填好固定目标；入口不可用时再指导我打开桌面应用「插件 → 添加插件」。按顺序核对以下完整固定安装目标（含伴生包），由我点击安装、处理应用提示并启用：\n{targets}\nGitHub 目标必须保留完整 commit 和 &path: 子目录，不要改成包名、main、HEAD 或最新版本。遇到构建授权，仅指导我在应用界面确认本次目标需要的精确构建项；界面不支持或安装失败时，收集完整错误并说明卡在哪一步，不要绕过限制。',
  'prompt.skin.desktop.managed': '{conflict}\n确认可以继续后，指导我在「设置 → 皮肤市场」打开这款皮肤，由我点击一键安装并按应用提示使用。',
  'prompt.skin.desktop': '官方 Desktop：你负责只读检查和指导，我负责点击安装、启用、停用和重启；不要代替我操作。以应用“关于”中的版本为准，不用系统终端的 npm dsh 版本代表桌面版本。不要执行 dsh plugin --profile desktop，不要用 npm/pnpm 写入 Desktop profile，也不要修改其 package.json、cordis.patch.yml 或构建权限。\n{steps}\n每次只给我一个具体操作，等我反馈后再给下一步；不要只丢给我仓库说明。安装后只读核对当前宿主的插件安装结果、版本和启用状态；读不到时请我提供插件页状态，未核实不能宣称安装成功。按应用提示指导我重启；需要时完全退出后重新打开（macOS 使用 ⌘Q，关闭窗口不算退出），然后确认皮肤已生效。',
  'prompt.skin.web': 'Web 版：\n{conflict}\n安装前只读确认实际 Web profile 的 package.json 中 dependencies 与 dsh.profile.bundles，以及当前插件启用状态；不要把 Desktop profile 当作 Web profile。\n没有冲突且兼容性确认完成后，先处理目标所需的精确构建授权，再执行下面的全部固定安装命令（含伴生包），不要改成 main、HEAD 或最新版本：{buildApproval}\n{command}\n如果目标只有 dsh.client，幂等地确认 package {packages} 和 rowId {rowIds} 已注册到 Web profile 的 cordis.patch.yml；不要放宽其他包的构建权限。安装后验证同一 profile 的 dependencies、dsh.profile.bundles、目标 package 的 dsh.client/dsh.bundle 声明及 loader 注册项；缺失则报告失败。告诉我如何重启当前 Web 宿主。',
  'prompt.skin.workflow': '先判断当前是 Web 版还是官方 Desktop，并核对实际 profile；无法判断就先问我。Web 查看 dsh --version；Desktop 查看应用“关于”中的版本。只执行对应宿主的流程。\n\n{desktop}\n\n{web}',
  'prompt.skin.footer': '\n\n不要替我安装、停用或卸载其他皮肤。',
  'prompt.skin.terminalFallback': '当前终端无法安全表示安装目录，请切换终端或使用市场内安装。',
  'prompt.skin.cliUnavailable': '当前自定义 profile 目录不支持 CLI 定位，请使用市场内安装，不要改写其他目录。',
  'prompt.skin.commandsForTerminals': '只执行实际终端对应的一组，不要把不同终端的命令全部执行。\nmacOS / Linux：\n{posix}\nWindows PowerShell：\n{powershell}\nWindows CMD：\n{cmd}',
  'prompt.terminal.posix': 'macOS / Linux',
  'prompt.terminal.powershell': 'Windows PowerShell',
  'prompt.terminal.cmd': 'Windows CMD',
} as const satisfies ChineseMessages

const enMessages: { [K in keyof typeof zhMessages]: string } = {
  'metadata.title': 'DSH Skin Market',
  'metadata.description': 'Browse community skins for DSH without installing them, and copy Agent installation prompts.',
  'metadata.themeColor': '#0d0e10',
  'site.brand': 'Skin Market',
  'site.platformActions': 'Site actions',
  'site.github': 'GitHub',
  'site.installMarket': 'Install Skin Market',
  'site.qr.open': 'Open this page by QR',
  'site.qr.alt': 'DSH Skin Market QR code',
  'catalog.section': 'Skin catalog',
  'catalog.empty': 'No skins yet',
  'catalog.noResults': 'No matching skins',
  'catalog.loadingMedia': 'Preparing previews…',
  'catalog.loading': 'Loading the latest skin catalog…',
  'catalog.error.request': 'The catalog could not load: HTTP {status}. Refresh and try again.',
  'catalog.error.invalidResponse': 'The catalog could not load: the server returned an invalid response. Refresh and try again.',
  'catalog.error.unsupportedVersion': 'The catalog could not load: this catalog version is not supported. Refresh and try again.',
  'catalog.error.missingSkins': 'The catalog could not load: the skin list is missing. Refresh and try again.',
  'catalog.error.generic': 'The catalog could not load. Refresh and try again.',
  'search.label': 'Search skins, authors, or tags',
  'search.clear': 'Clear search',
  'sort.label': 'Sort by',
  'sort.heat': 'Momentum',
  'sort.stars': 'Stars',
  'sort.latest': 'Latest',
  'category.label': 'Categories',
  'category.skin': 'Skins',
  'category.pet': 'Desk pets',
  'category.player': 'Players',
  'category.splash': 'Startup animations',
  'skin.preview': '{name} interface preview',
  'skin.manualInstall': 'Install',
  'skin.install': 'Install',
  'skin.details': 'Skin details',
  'skin.detailsContent': 'Skin details content',
  'skin.closeDetails': 'Close details',
  'skin.backToDiscover': 'Back to discover',
  'skin.version': 'Version {version}',
  'skin.dshVersion': 'DSH {version}',
  'skin.compatibilityVerified': 'Compatibility verified',
  'skin.compatibilityPending': 'Compatibility pending',
  'skin.installThis': 'Install',
  'skin.compatibilityNotice': 'Compatibility has not been verified. Confirm before installing.',
  'skin.repositoryPreviewNotice': 'This repository has no recognizable skin screenshots. The page uses a local placeholder and does not load images from GitHub.',
  'skin.marketScreenshotNotice': 'These screenshots were captured by the market in an isolated DSH environment; the repository has no recognizable interface screenshots.',
  'preview.noScreenshot': '{name} has no interface screenshot',
  'preview.noScreenshotShort': 'No interface screenshot',
  'gallery.fullscreen': 'View {name} screenshot {index} full screen',
  'gallery.preview': '{name} interface preview',
  'gallery.previous': 'Previous screenshot',
  'gallery.next': 'Next screenshot',
  'gallery.selection': 'Screenshot selection',
  'gallery.fullscreenLabel': '{name} full-screen screenshot viewer',
  'gallery.close': 'Close full-screen viewer',
  'gallery.exit': 'Exit full-screen viewer',
  'gallery.viewShot': 'View screenshot {index}',
  'info.about': 'About this skin',

  'info.license': 'License',
  'info.modes': 'Modes',
  'info.platform': 'Platform',
  'info.recommendations': 'More recommendations',
  'install.marketTitle': 'Install Skin Market',
  'install.skinTitle': 'Install {name}',
  'install.chooseOne': 'Choose one method; you do not need to run them all.',
  'install.close': 'Close',
  'install.skinSection': 'Install this skin',
  'install.marketSection': 'Install through Skin Market',
  'install.desktop': 'Desktop',
  'install.command': 'Command',
  'install.prompt': 'Prompt',
  'install.copy': 'Copy {label}',
  'install.copied': 'Copied {label}',
  'install.copyTitle': 'Copy',
  'install.copiedTitle': 'Copied',
  'install.copyDesktop': '{group} Desktop plugin package name',
  'install.copyCommand': '{group} command',
  'install.copyPrompt': '{group} prompt',
  'install.copyTerminal': '{group} {terminal} command',
  'install.manualCommandHint': 'This skin needs a manual install for the current environment. Copy the prompt for guidance.',
  'install.skinNote': 'Check enabled skins first to avoid style conflicts.',
  'install.marketNote': 'After installing Skin Market, install a specific skin inside DSH.',
  'install.terminal.posix': 'macOS / Linux',
  'install.terminal.powershell': 'Windows PowerShell',
  'install.terminal.cmd': 'Windows CMD',
  'toast.copied': 'Copied',
  'preferences.group': 'Display preferences',
  'preferences.language.label': 'Language',
  'preferences.language.zh': '中文',
  'preferences.language.en': 'English',
  'preferences.theme.label': 'Theme',
  'preferences.theme.auto': 'System',
  'preferences.theme.light': 'Light',
  'preferences.theme.dark': 'Dark',
  'preferences.language.menu': 'Language',
  'preferences.theme.menu': 'Theme',
  'preferences.theme.description.auto': 'Follow system settings',
  'preferences.github.description': 'GitHub',
  'prompt.listSeparator': ', ',
  'prompt.market': `Help me install dsh-skin-market. First determine whether this is DSH Web or the official Desktop app, then verify the actual host profile; ask me before acting if you cannot tell. For Web, check dsh --version. For Desktop, use the version in the app's About screen instead of the npm dsh version from a system terminal. Do not read .env, credentials, or other secret-bearing configuration.

Install only the skin-market management plugin; do not enable a specific skin. Do not inspect or disable other skins first, and do not block this installation because other skins exist.
- DSH Web: run {webCommand}, then verify the dsh-skin-market dependency and bundle in the same Web profile.
- Official Desktop: perform read-only checks and guide me step by step while I operate the app. Do not run dsh plugin --profile desktop, do not use npm/pnpm to write the Desktop profile, and do not modify the profile. Guide me to open the app's “Plugins → Add plugin” page, enter {desktopInput}, let me click install and follow the app prompts to enable it. Give me one action at a time and wait for my feedback before continuing. After installation, verify the result from the plugin page only; if it cannot be read, ask me to provide the status and do not claim success.

Tell me which host to restart and where to open “Settings → Skin Market”. If Desktop needs a restart, guide me to quit the app completely and open it again. Do not install, disable, or uninstall other skins for me.

Repository: {repository}`,
  'prompt.skin.intro': 'Help me install this pinned DSH skin version. {hostInstruction}',
  'prompt.skin.intro.desktop': 'You inspect and guide step by step; I operate the Desktop app.',
  'prompt.skin.metadata': '- Repository: {repo}\n- Pinned install target: {target}\n- package: {package}\n- loader rowId: {rowId}{companions}\n- Version: {version}\n- commit: {commit}',
  'prompt.skin.companion': '- Companion package: {package} (rowId {rowId})\n- Companion install target: {target}',
  'prompt.skin.buildApproval': "\n- This pinned version has a prepare build script. Allow only the exact artifact key `{key}`: merge `allowBuilds:\n    '{key}': true` into the Web profile's pnpm-workspace.yaml. Do not enable dangerouslyAllowAllBuilds.",
  'prompt.skin.reviewWarning': '\nThe maintainer has not declared a verifiable DSH compatibility range. Inspect the repository read-only and check the current host version and installation method; tell me the findings and risks first, wait for my confirmation, and do not install directly.\n',
  'prompt.skin.conflict': 'First perform a read-only conflict check: inspect the current host plugin list and actual enabled state for other skins, themes, or appearance plugins; do not treat “installed” as “enabled”. Exclude @deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app, dsh-skin-market, and the target packages {packages}. You may read package.json names and descriptions, dsh.client/dsh.bundle declarations, and repository READMEs. Do not read .env, credentials, chat history, or other secret-bearing configuration. If an enabled skin may conflict, list its name and evidence, stop before installation, and guide me to disable it through the current host plugin page; do not modify profile files or install anything without my confirmation. If enabled state cannot be read, ask me to provide the status from the plugin page and do not claim there is no conflict. Only say “no other enabled skin plugin detected” after confirming that there is no other enabled skin.',
  'prompt.skin.desktop.manual': 'This skin must be confirmed in the official Desktop plugin panel. First read the maintainer installation instructions, confirm that the pinned target and subdirectory, if any, can be used by the current Desktop, and explain what is missing if you cannot confirm it; do not guess the installation method.\n{conflict}\nAfter I confirm, guide me to click “Install” in the skin details. Let the market open the official panel and fill in the pinned target; if that entry point is unavailable, guide me to open the app’s “Plugins → Add plugin” page. Check these complete pinned install targets in order, including companion packages; I click install, handle app prompts, and enable them:\n{targets}\nGitHub targets must keep the complete commit and &path: subdirectory. Do not change them to a package name, main, HEAD, or latest version. If build approval is requested, guide me to confirm the exact build item required for this target in the app UI; if the UI does not support it or installation fails, collect the full error and explain where it stopped. Do not bypass the restriction.',
  'prompt.skin.desktop.managed': '{conflict}\nAfter I confirm, guide me to open this skin from “Settings → Skin Market”. I click the one-click install and follow the app prompts to use it.',
  'prompt.skin.desktop': 'Official Desktop: you inspect and guide while I click install, enable, disable, and restart; do not operate the app for me. Use the version in the app’s About screen, not the npm dsh version from a system terminal. Do not run dsh plugin --profile desktop, use npm/pnpm to write the Desktop profile, or modify its package.json, cordis.patch.yml, or build permissions.\n{steps}\nGive me one concrete action at a time and wait for my feedback; do not just paste repository instructions. After installation, read back the host plugin result, version, and enabled state; if they cannot be read, ask me for the plugin-page status and do not claim success. Follow the app prompts for a restart; when needed, quit completely and reopen it (use ⌘Q on macOS; closing the window is not quitting), then confirm that the skin is active.',
  'prompt.skin.web': 'DSH Web:\n{conflict}\nBefore installation, read the actual Web profile package.json dependencies and dsh.profile.bundles and the current plugin enabled state; do not treat the Desktop profile as the Web profile.\nAfter the conflict and compatibility checks pass, handle the exact build approval required by the target, then run all of the pinned installation commands below, including companion packages. Do not change them to main, HEAD, or latest: {buildApproval}\n{command}\nIf the target has only dsh.client, idempotently verify that packages {packages} and loader rowIds {rowIds} are registered in the Web profile’s cordis.patch.yml; do not widen build permissions for other packages. After installation, verify dependencies, dsh.profile.bundles, the target package dsh.client/dsh.bundle declarations, and loader registrations in the same profile; report failure if anything is missing. Tell me how to restart the current Web host.',
  'prompt.skin.workflow': 'First determine whether this is DSH Web or the official Desktop app and verify the actual profile; ask me before acting if you cannot tell. For Web, check dsh --version. For Desktop, check the version in the app’s About screen. Run only the workflow for the matching host.\n\n{desktop}\n\n{web}',
  'prompt.skin.footer': '\n\nDo not install, disable, or uninstall other skins for me.',
  'prompt.skin.terminalFallback': 'The current terminal cannot safely represent this install directory. Switch terminals or use the market installation flow.',
  'prompt.skin.cliUnavailable': 'The custom profile directory cannot be located by the CLI. Use the market installation flow and do not rewrite another directory.',
  'prompt.skin.commandsForTerminals': 'Run only the command group for the current terminal; do not run every terminal variant.\nmacOS / Linux:\n{posix}\nWindows PowerShell:\n{powershell}\nWindows CMD:\n{cmd}',
  'prompt.terminal.posix': 'macOS / Linux',
  'prompt.terminal.powershell': 'Windows PowerShell',
  'prompt.terminal.cmd': 'Windows CMD',
}

export const siteMessages = { zh: zhMessages, en: enMessages } as const
export type MessageKey = keyof typeof zhMessages

type PlaceholderNames<Value extends string> = Value extends `${string}{${infer Name}}${infer Rest}`
  ? Name | PlaceholderNames<Rest>
  : never

export type MessageParamsFor<Key extends MessageKey> = Record<PlaceholderNames<(typeof zhMessages)[Key]>, string | number>
export type SiteTranslator = <Key extends MessageKey>(key: Key, params?: MessageParamsFor<Key>) => string

export function translate<Key extends MessageKey>(locale: SiteLanguage, key: Key, params?: MessageParamsFor<Key>): string {
  const template = siteMessages[locale][key] ?? siteMessages[DEFAULT_SITE_LANGUAGE][key]
  if (template === undefined) return `⟦${String(key)}⟧`
  return template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (_match, name: string) => String((params as Record<string, string | number> | undefined)?.[name] ?? `{${name}}`))
}

export function localizedSkinName(skin: Pick<CatalogSkin, 'name'>, locale: SiteLanguage): string {
  if (locale === 'en' && skin.name.en.trim() !== '') return skin.name.en
  return skin.name.zh
}

export function messageKeys(): readonly MessageKey[] {
  return Object.keys(zhMessages) as MessageKey[]
}
