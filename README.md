# DSH 皮肤市场 <sub><a href="./README.en.md">English</a></sub>

浏览、搜索、安装并管理 DSH 皮肤。

<p align="center">
  <img src="./docs/assets/skin-market-liang.png" alt="DSH 设置中的皮肤市场发现页" width="70%">
</p>

<p align="center">
  <img src="./docs/assets/skin-market-deep-whale.png" alt="DSH 皮肤市场中的 Deep Whale 皮肤详情弹窗" width="70%">
</p>

## 在线预览

[打开在线皮肤市场](https://kingofsoysauce.github.io/dsh-skin-market/)

### 近期收录

- **2026-11-13**：[奶蛙工作室](https://github.com/alaricchanchs-crypto/dsh-naiwa-studio)（alaricchanchs-crypto）——赛博风开机动画（视频 + 机械语音 + 现场合成的音效），配灵感池卡片、奶蛙表情库与玻璃质感配色。详见[收录日志](./docs/recently-added.md#recent-2026-11-13-alaricchanchs-crypto-dsh-naiwa-studio)。

最新收录见[收录日志](./docs/recently-added.md)。

<a id="manual-update"></a>
## 安装、更新

兼容 DSH Web `>=0.1.0-rc.6` 与官方 Desktop `>=0.2.0-rc.1`。

> 更新失败时先按弹窗原因处理，不要先卸载：官方 Desktop 卸载市场会先摘掉正在运行的插件。Web 可直接重装；Desktop 到「插件 → 添加插件」重新添加 `dsh-skin-market@latest`。重装仍失败时再复制诊断日志。

### 方法 1：命令

终端执行：

```sh
dsh plugin --profile web add "dsh-skin-market@latest"
```

### 方法 2：应用内

左上角「插件 → 添加插件」，输入：

```text
dsh-skin-market@latest
```

### 方法 3：插件内更新

皮肤市场内点击「更新」按钮

### 方法 4： Agent 帮忙

复制下面的提示词给你的 DSH Agent。它会先判断当前是 Web 还是官方 Desktop。Web 由 Agent 执行命令；官方 Desktop 如果当前 DSH 提供插件管理工具（plugin_manager），Agent 可以在你确认精确目标和 profile 后直接安装/启用；工具不可用或需要应用内确认时，Agent 指导你在「插件 → 添加插件」操作。重启仍由你完成。

<details>
<summary><strong>点击展开提示词</strong></summary>

**安装提示词**

```text
请帮我安装 dsh-skin-market。先只读确认当前是 Web 版还是官方 Desktop，以及当前宿主和实际 profile。Web 查看 dsh --version；官方 Desktop 以应用“关于”中的版本为准，不把系统终端的 npm dsh 版本当作桌面版本。无法读取应用信息时，请让我提供该版本；无法判断宿主就先问我。

- Web 版：执行 dsh plugin --profile web add "dsh-skin-market@latest"，然后核对同一 web profile 中的依赖和 bundle。
- 官方 Desktop：先只读确认当前 profile 和已安装版本。如果当前宿主提供插件管理工具（plugin_manager）且你能确认当前 profile，先告诉我准备安装/更新的精确目标和会修改的 profile，我确认后由你安装并启用；安装后核对实际版本、启用状态和是否需要重启。工具不可用、宿主拒绝或需要我在应用内确认时，再指导我打开「插件 → 添加插件」，输入 dsh-skin-market@latest，由我点击安装并按应用提示启用。不要执行 dsh plugin --profile desktop，不要用 npm/pnpm 直接写 Desktop profile，也不要手改 profile。重启由我完成。每次只给一个操作，等我反馈再继续。

这次只安装皮肤市场，不做其他皮肤的冲突检查，也不要求停用它们。不要替我安装其他皮肤。安装后告诉我从哪里打开「皮肤市场」；Desktop 以插件页状态和我的实际操作反馈核对结果，没有核实就不要声称安装或启用成功。不要读取 .env、凭据或聊天记录。
```

**更新提示词**

```text
请更新已安装的 dsh-skin-market。先判断当前宿主和实际 profile：Web 查看 dsh --version；官方 Desktop 查看应用“关于”中的版本，不用系统终端的 npm dsh 版本替代。无法判断就先问我。

- Web 版：只读确认 web profile 已安装 dsh-skin-market，再执行 dsh plugin --profile web add "dsh-skin-market@latest"。
- 官方 Desktop：先只读核对版本和插件状态。如果当前宿主提供插件管理工具（plugin_manager）且你能确认 profile，先告诉我准备更新的精确目标和会修改的 profile，我确认后由你更新并启用；更新后核对实际版本、启用状态和是否需要重启。工具不可用、宿主拒绝或需要我在应用内确认时，再指导我在「插件 → 添加插件」中输入 dsh-skin-market@latest、确认更新结果并按提示启用。不要执行 dsh plugin --profile desktop，不要用 npm/pnpm 直接写 Desktop profile，也不要手改 profile。重启由我完成。

Web 更新后验证同一宿主的 dsh-skin-market 依赖和 bundle；Desktop 根据插件页状态和我的实际反馈核对结果，没有核实就不要声称成功。告诉我更新前后版本及需要重启哪个宿主。不要替我更新或卸载其他皮肤。
```

</details>

## 使用皮肤

打开「设置 → 皮肤市场」或 「插件 → dsh-skin-market」

### 从市场安装具体皮肤

可直接安装的 npm 皮肤会使用「安装」或「安装并使用」流程。官方 Desktop 默认先安装，再进入使用确认；取消使用确认时，皮肤包会保留，但不会启用。

标为「需手动安装」的皮肤，需要把市场提供的完整固定目标交给 Agent。有已发布 npm 包时用 `name@version`（预构建）；没有 npm 包时才用 GitHub 完整 commit 和 `&path:/子目录`。不要用未构建的 GitHub 源码代替 npm 包，也不要把 commit 或子目录改成 `latest`、仓库主分支或另一个包名。

<details>
<summary><strong>点击展开手动皮肤安装流程</strong></summary>

Agent 先只读确认当前 Desktop 版本和其他已启用的皮肤；发现冲突时列出名称，指导你在应用中停用，并核对停用结果后再继续。拿不到启用状态时，应请你提供插件列表或界面状态，不能把“无法确认”当成“没有冲突”。

安装目标使用面板给出的完整固定 spec。有 npm 包的皮肤优先 `name@version`；没有 npm 包时用 GitHub 完整 commit，monorepo 子包还要保留 `&path:/子目录`，例如 `github:owner/repo#<完整 commit>&path:/packages/skin`。不要把该目标换成 `latest` 或仓库主分支。

如果当前宿主提供插件管理工具（plugin_manager），Agent 把最终精确目标和会修改的 profile 发给你确认后，可直接安装（默认不启用）；需要启用时先查冲突并再次确认。工具不可用、宿主拒绝或需要你在应用内处理构建授权时，Agent 指导你打开「插件 → 添加插件」、粘贴完整目标、确认安装结果、按提示启用，最后按当前版本要求完全退出并重新打开应用。Agent 不执行 `dsh plugin --profile desktop`，不手改 profile；构建授权只按宿主返回的精确项逐项确认；重启由你完成。界面不支持该目标或安装失败时，先核对原始报错和维护者说明，再决定下一步；依赖伴生包的皮肤须核对完整安装要求。

这些说明不改变市场的 npm 一键安装流程，也不代表所有 GitHub 或子目录皮肤都已完成官方 Desktop 实机验收。

</details>

<a id="install-troubleshooting"></a>
<a id="configuration-override"></a>
## 常见问题与故障处理

先按市场弹窗或横幅中的具体原因处理。不要因为“已安装”就重复安装，也不要因为某次启用失败就直接卸载整个 profile。

| 情况 | 先做什么 |
| --- | --- |
| 网络或下载超时 | 重试一次；持续失败时复制市场诊断日志，检查 DSH 实际使用的网络和安装源 |
| 已安装但没有生效 | 进入皮肤详情点击「使用」，检查是否显示「待重启」或「未生效」及其原因 |
| 启用/停用被其他配置覆盖 | 按弹窗指出的组件处理；不要反复重装。市场能安全定位覆盖时，会给出明确的修复入口 |
| 安装被新包保护阻止 | 只允许报错中明确指出的那个精确版本，或等待保护期结束；不要关闭全局保护 |
| 操作结果正在确认 | 等待市场核对宿主结果，不要再次点击安装、启用或卸载 |
| 安装/更新/卸载被另一个已安装插件的失效仓库挡住 | 按失败弹窗里默认折叠的三步处理：手动去掉该依赖、退出 DSH 后执行修复命令，或把提示词交给当前 DSH 以外的 Agent。不要在市场里卸载那个失效插件 |
| 页面因皮肤冲突无法操作 | 停止对应的 DSH Web 进程后，使用下面的 Web 重置命令 |
| 点击更新后市场从插件列表消失 | 旧版的 Desktop 自更新会先卸载市场再补装，补装可能没有执行。到「插件 → 添加插件」重新安装 `dsh-skin-market@latest` 并启用 |

### 更新后市场从插件列表消失

旧版市场在官方 Desktop 点击「更新」时会先卸载自己，再执行补装；卸载已经把市场从正在运行的组合里摘掉，补装那一步不会执行，profile 里就只剩一个没有市场的状态。

1. 不要再点市场里的「更新」，那会重复同一步。
2. 打开 DSH 的「插件 → 添加插件」，输入 `dsh-skin-market@latest`，安装并按提示启用。
3. 应用内安装被拒绝时，完全退出 DSH（关窗口不算），在 profile 目录（通常是 `~/.dsh/profiles/desktop`，Windows 为 `%USERPROFILE%\.dsh\profiles\desktop`）执行 `pnpm add dsh-skin-market@latest`，确认 `package.json` 的 `dependencies` 和 `dsh.profile.bundles` 都包含 `dsh-skin-market`，再重新打开。

修复后的版本改用 DSH 发布的宿主 pnpm 就地覆盖，不再卸载市场；更新完成后仍需重启 DSH 才会加载新代码。

<a id="release-wait"></a>
### 安装被新包保护阻止

市场会尽量合并当前 profile 中重复的精确版本例外。仍被阻止时，只有在确认包名和版本来自本次报错后，才允许这一版本继续；也可以等待 pnpm 的保护期结束。市场不会为整个包或所有未来版本关闭保护。

<details>
<summary><strong>需要 Agent 帮忙处理新包保护错误？</strong></summary>

```text
请处理这次 DSH Desktop 的新包保护错误。先确认 Desktop 实际使用的 profile 名称和目录，并从本次 ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION 诊断中确认被阻止的精确包名和版本；不要把正在安装的皮肤直接当成被阻止的包。

仅处理这个 profile 的 pnpm-workspace.yaml 中 minimumReleaseAgeExclude 字段。先合并同名规则中已经允许的版本，保留其他规则、注释和全局年龄策略。如果报错中的精确版本确实没有例外，先向我展示包名、版本和来源，由我确认后才添加这个精确版本。不要设置 minimumReleaseAge=0，不要允许整个包的未来版本，不要读取 .env、凭据或其他存放秘密的配置。混合配置可能含秘密时，先取得指定字段的限定读取授权。

如果你正运行在这个 DSH 中，不要修改自己的活动组合配置、重启或安装当前宿主；先准备可重复执行的 apply 与 rollback 方案，交给外部终端或独立 Agent 执行。Desktop 包操作由我在官方页面重试。最后核对实际安装版本和组件状态，报告具体结果。
```

</details>

<a id="profile-dependency-repair"></a>
### 安装被已安装插件的失效来源阻塞

报错形如 `ERR_PNPM_FETCH_404`，URL 指向 `codeload.github.com/...`，而该仓库属于你**之前安装过**的插件，并不是这次要装的皮肤。pnpm 每次安装都会重新解析 profile 里全部 Git 依赖；只要其中一个上游仓库或 commit 被删除，安装、更新、卸载和更新皮肤市场本身都会失败。

失败弹窗里有同样的三步，默认折叠。市场不能在运行中的 DSH 里替你修改依赖，需要先**完全退出 DSH**（不是只关页面），再从外部终端执行下面的命令。修复命令随市场包发布，通过 `npx` 取用最新版，不需要先更新当前 profile 里的市场，也不会对运行中的 DSH 执行 `pnpm add`。

```bash
# 只读诊断：列出失效来源、锁文件漂移和计划移除的包
npx -y -p dsh-skin-market@latest dsh-skin-market-repair --profile web

# 完全退出 DSH 后执行修复；用 --keep <包名> 可保留某个失效插件
npx -y -p dsh-skin-market@latest dsh-skin-market-repair --profile web --apply --yes --i-have-stopped-dsh

# 需要时回滚
npx -y -p dsh-skin-market@latest dsh-skin-market-repair --profile web --rollback ~/.dsh/profiles/web/.dsh-skin-market/backups/repair-<时间戳> --yes --i-have-stopped-dsh
```

修复会先把 `package.json` 和 `pnpm-lock.yaml` 备份到 profile 内，只移除诊断确认 404 的依赖，然后用该 profile 同一代际的 pnpm 执行一次 `install --no-frozen-lockfile`；完成后校验剩余依赖、锁文件一致性和皮肤市场版本。过程中可能需要网络（pnpm 会重新拉取其余 Git 依赖），不要关闭完整性校验，也不要删除整个锁文件。如果目录维护者已经把同名皮肤改到新仓库或 npm 源，并给出完整固定目标，可以用 `--migrate 包名=完整目标` 保留皮肤而不是删除（例如 `--migrate dsh-dream-skin=dsh-dream-skin@11.7.0`）。迁移目标必须由维护者确认；没有确认目标的失效依赖仍按默认方式移除。修复后启动 DSH，核对页面版本和保存的启用/停用选择，再重试原安装。诊断和修复都需要 `pnpm` 可用；如果 PATH 中没有 pnpm，用 `--pnpm <可执行文件>` 指向该 profile 使用的同一版本。

<details>
<summary><strong>需要 Agent 帮忙修复 profile 依赖？</strong></summary>

```text
这次 DSH 皮肤安装/更新失败在 pnpm 依赖解析阶段：报错指向 codeload.github.com 上某个我已安装插件的上游仓库 404，而不是我要装的皮肤。请先只读诊断，不要重试安装或卸载。

1. 确认当前 DSH 的 home、profile 和 profile 目录，不要假设默认路径；确认这个 DSH 正在使用该 profile。
2. 只读核对 profile 的 package.json、pnpm-lock.yaml 和 node_modules，找出：哪些已安装依赖的上游仓库/commit 已不可达、package.json 与锁文件有哪些不一致、哪些包实际已物化。不要读取 .env、凭据或可能含秘密的配置。
3. 先给我看诊断结果、计划移除的精确包名、备份目录和修复命令；我确认后，由我在外部终端或由独立 Agent 在完全退出 DSH 后执行修复。你如果正运行在这个 DSH 中，不要修改自己的活动 profile、安装或卸载当前 DSH、停止或重启自己。
4. 修复前保留备份；只移除确认不可达的依赖，不关闭完整性校验、不放宽 allowBuild、不删除整个锁文件、不改其他皮肤。
5. 修复后核对实际安装版本、锁定文件一致性与启用/停用选择；未读到运行状态时请我提供官方页面结果，并注明尚未验证。最后核对失败原因是否已消除，再按原操作重试。
```

</details>

### Web 页面异常时重置皮肤

如果皮肤冲突导致 DSH Web 页面无法操作，先停止当前 DSH Web 进程，再执行：

```bash
~/.dsh/profiles/web/node_modules/.bin/dsh-skin-market-reset --profile web
```

这个命令会关闭皮肤市场管理的皮肤并恢复默认外观，但保留已安装的皮肤包和皮肤市场。随后重新启动 DSH Web。官方 Desktop 不要执行这个 Web profile 命令，请在应用插件管理器或市场中停用冲突皮肤。

## 给开发者

维护 DSH 皮肤时，把下面的提示词交给 Agent，准备收录或更新展示字段。市场不会代替你登录 GitHub，也不会静默创建 PR。

新收录只写薄条目，字段和优先级见下表。`url` 必填；名称、作者、描述、类别、标签、适用模式、预览图和子目录都是可选字段，能确认就尽量填写，缺省由 CI 推导。package、loader id、commit、许可证和兼容范围由 CI 从皮肤仓库读取，不要写进 YAML。社区 PR 只改一个 `registry/skins/<owner>__<repo>.yml`，不要改 `data/catalog.json` 或 `data/catalog-copy.json`。

<!-- submission-contract:START -->
| 类别 | 字段 / 项 | 规则 |
| --- | --- | --- |
| 作者写（薄条目） | `url`、`subpath`、`name`、`author`、`description`、`category`、`tags`、`modes`、`screenshots` | 只写这些；`name` 写了就必须同时有 `zh` 和 `en`。除 `url` 外都可省略，缺省时由 CI 推导：`name`=仓库名（子包取子目录名）、`author`=GitHub owner、`description`=`package.json` 的 description、`category`=`skin`、`tags`=`appearance`、`modes`=`light` 和 `dark`、`screenshots`=仓库 `screenshots.json` 或 README 图片。 |
| CI 自动补 | `package`、`rowId`、`install`、`license`、`compatibility` | 不要手写；写了会被 schema 拒绝。 |
| 软必填（不阻断，进补全队列） | 可用预览图（上游或实机）、双语展示名 / 描述、动效 GIF（motion）、启动 launchGif（splash） | 缺了仍可合并，但会记录在每日完整性报告；补全队列接入后自动进队。 |
| 推荐（只提示） | 实机截图 `marketScreenshots`、封面 `listScreenshot`、WebP `media`、README 安装命令 / 版本范围（Web 与官方 Desktop）/ `dsh-plugin` topic、Desktop 安装支持（npm 包或手动安装说明） | 不阻断合并。 |
<!-- submission-contract:END -->

皮肤仓库需要能被 CI 读到：公开 GitHub 仓库或 monorepo 子目录；`package.json` 有 name、version、license 和 `dsh.client`；`cordis.patch.yml` 有对应 loader。预览图用仓库内的 png、jpg、webp 或 gif。建议 README 声明 DSH Web 与官方 Desktop 的版本范围和一条 `dsh plugin add` 安装命令，并为仓库加上 `dsh-plugin` Topic。

已收录皮肤只能改展示字段：`name.zh`、`name.en`、`author`、`description`、`category`、`tags`、`modes`、`screenshots`。不要改 id、安装目标、commit、package 或 rowId。固定版本刷新不由这次 PR 改写。收录不等于安全认证。

本地验收步骤见 [TESTING.md](./TESTING.md)。

<details>
<summary><strong>点击展开收录皮肤提示词</strong></summary>

复制以下整段提示词给你的 Agent：

```text
请帮我向 DSH 皮肤市场（DSH Skin Market）投稿一款 DSH 皮肤。

皮肤仓库：<你的皮肤仓库地址>
目标目录仓库：https://github.com/kingOfSoySauce/dsh-skin-market
目录路径：registry/skins

请按以下步骤完成：
1. 只用只读方式确认皮肤仓库是公开的 GitHub 仓库（或 monorepo 子目录），且确实是可安装的 DSH 皮肤（Web 与官方 Desktop 共用 Web 客户端）。不要读取 .env、凭据或聊天记录。
2. 确认 CI 能从该仓库读到这些材料；缺了就先告诉我，不要编造：
   - package.json 有 name、version、license，以及 dsh.client
   - cordis.patch.yml 有与 package 名对应的 loader 行
   - 描述在薄条目 description 或 package.json description
   - 预览图是仓库内的 png、jpg、webp 或 gif，来自 screenshots.json 相对路径、README 仓库图片，或薄条目 screenshots（https 图片地址）
   - 建议 README 声明 DSH Web 与官方 Desktop 的版本范围，并包含一条 dsh plugin add 安装命令；建议仓库加上 dsh-plugin Topic
3. fork 或 clone 目标目录仓库并新建分支。在 registry/skins 下只新增一个 YAML，文件名用 owner__repo.yml（子包用 owner__repo--path.yml）。不要覆盖已有条目，不要修改 data/catalog.json 或 data/catalog-copy.json。
4. YAML 必须写成薄条目，只允许以下字段，一个都不能多：
   - url（必填）：公开 GitHub 仓库地址；monorepo 子包再用 subpath 或仓库 tree 路径指定子目录
   - 可选字段：name.zh、name.en、author、description、category、tags、modes、screenshots
   除 url 外都可以省略，缺省时由 CI 推导：name 用仓库名，author 用 GitHub owner，description 用 package.json description，category 默认 skin，tags 默认 appearance，modes 默认 light 和 dark，screenshots 从仓库预览图读取。为了收录质量，请尽量填写你能确认的可选字段，尤其要同时写 name.zh 和 name.en，并补上作者、描述、类别、标签、适用模式和预览图。
   可选值约束：category 只能是 skin、pet、player 或 splash；tags 是非空字符串数组；modes 只能是 light、dark 的非空子集；screenshots 写 https 图片地址，或把图片放进仓库的 screenshots.json / README。package、rowId、install、license、compatibility、commit 仍由 CI 从仓库读取，不要手写。内容示例：
url: https://github.com/<owner>/<repo>
# subpath: packages/my-skin   # 仅 monorepo 子包需要
# name:                       # 可选；如果写，必须同时有 zh 和 en
#   zh: 中文名
#   en: English name
# author: owner               # 可选；未填写时使用 GitHub owner
# description: 一句用户能看到的外观或行为说明  # 可选；未填写则使用 package.json description
# category: skin              # 可选；skin、pet、player 或 splash
# tags:                       # 可选；非空字符串数组
#   - appearance
# modes:                      # 可选；light、dark 的非空子集
#   - light
#   - dark
# screenshots:                # 可选；https 图片地址，更推荐放进仓库 screenshots.json 或 README
#   - https://.../screenshots/home.png

5. 不要写完整 schema，不要编造 commit SHA、rowId 或许可证。若 npm run registry:check 报缺少 id/install，先删掉薄条目以外的字段再跑，不要靠补全 schema 过 CI。
6. 在目标目录仓库根目录运行 npm run registry:check。不得安装到我的真实 DSH profile。
7. git diff --name-only 应只有 registry/skins/<条目文件>.yml。提交并向 https://github.com/kingOfSoySauce/dsh-skin-market 创建 PR，标题 feat(registry): add <皮肤名>。
8. 返回 PR 链接；没有 GitHub 权限时只准备好分支和可复制的 PR 内容。

收录不等于安全认证。不要声称该皮肤已被 DSH 官方、安全团队或市场背书。
```

</details>

<details>
<summary><strong>点击展开更新展示字段提示词</strong></summary>

只改展示字段时，复制这段。把要改的字段和内容填进提示词。

```text
请帮我更新 DSH 皮肤市场里已收录皮肤的展示字段。

皮肤仓库：<你的皮肤仓库地址>
目标目录仓库：https://github.com/kingOfSoySauce/dsh-skin-market
目录路径：registry/skins
要改的字段：<name.zh / name.en / author / description / category / tags / modes / screenshots 中的哪几项，以及新内容>

请按以下步骤完成：
1. 只用只读方式确认这个仓库已经在 registry/skins 里有条目，并且仓库 remote 与条目的 repo 一致。找不到就停下来问我，不要新建条目。不要读取 .env、凭据或聊天记录。
2. 只修改这一条已有 YAML。社区 PR 只能改一个 registry/skins/<条目>.yml，不要改其他条目、data/catalog.json 或 data/catalog-copy.json。
3. 只允许改这些展示字段：name.zh、name.en、author、description、category、tags、modes、screenshots。name 必须同时保留 zh 和 en。description 写用户能看到的外观或行为。category 只能是 skin、pet、player 或 splash；tags 是非空字符串数组；modes 只能包含 light、dark 且不能为空。screenshots 只能使用当前已固定 commit 下的仓库内 png、jpg、webp 或 gif，不要换成更新的 commit、SVG、data URI 或第三方图床。
4. 不要改 id、repo、subpath、package、rowId、install、compatibility、review、health、license、featuredRank、star 计数或任何时间字段。固定版本刷新不由这次 PR 改写；如果需要更新固定版本，只在 PR 正文说明，不要编造 install.target。
5. 在目标目录仓库根目录运行 npm run registry:check。不得安装到我的真实 DSH profile。
6. git diff --name-only 应只有这一条 YAML。提交并创建 PR，标题 feat(registry): update <皮肤名> display fields。
7. 返回 PR 链接；没有 GitHub 权限时只准备好分支和可复制的 PR 内容。

说明：`description` 和 `screenshots` 是作者可以直接改的展示字段；PR 只改自己这一条 YAML 时，CI 不会因为“改了描述或截图”而报红。CI 不会判断条目归属，靠“只改一个 YAML”和人工审核控制范围。如果这个条目已经有维护者审核过的 `data/catalog-copy.json` 展示文案，YAML 改动不会自动改变插件和站点前台显示；请在 PR 正文附上要同步的中英双语描述，维护者合并后更新展示层。不要在本 PR 修改 `data/catalog-copy.json`。

不要声称字段已经在线上目录生效。合并后由仓库的目录同步写入 catalog。收录不等于安全认证。
```

</details>

## License

[MIT](./LICENSE)
