# DSH 皮肤市场 <sub><a href="./README.en.md">English</a></sub>

一个嵌入 DSH 设置页的社区皮肤市场：浏览、搜索、安装、使用、停用、常驻、更新和卸载 DSH 皮肤。

<p align="center">
  <img src="./docs/assets/skin-market-liang.png" alt="DSH 设置中的皮肤市场发现页" width="70%">
</p>

<p align="center">
  <img src="./docs/assets/skin-market-deep-whale.png" alt="DSH 皮肤市场中的 Deep Whale 皮肤详情弹窗" width="70%">
</p>

## 在线预览

[打开在线皮肤市场](https://kingofsoysauce.github.io/dsh-skin-market/)

### 近期收录

- **2026-11-07**：[星河 Galaxy](https://github.com/haoranx98/dsh-skin-galaxy)（haoranx98）——原生 WebGPU 实时渲染的紫蓝星云皮肤：银河尘带斜贯视野，远近星点带视差与轻微闪烁，并有随机流星；深空配色适配 light/dark/system，无运行时 CDN、图片或额外依赖。详见[收录日志](./docs/recently-added.md#recent-2026-11-07-haoranx98-dsh-skin-galaxy)。


<a id="manual-update"></a>
## 安装、更新

> 更新失败时，可先卸载 `dsh-skin-market`，再按上面的安装方法重装；如果卸载或重装仍失败，再查看错误提示并复制诊断日志。

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

复制下面的提示词给你的 DSH Agent。它会先判断当前是 Web 还是官方 Desktop；Desktop 的安装、启用和重启仍由你在应用界面完成。

<details>
<summary><strong>点击展开提示词</strong></summary>

**安装提示词**

```text
请帮我安装 dsh-skin-market。先只读确认当前是 Web 版还是官方 Desktop，以及当前宿主和实际 profile。Web 查看 dsh --version；官方 Desktop 以应用“关于”中的版本为准，不把系统终端的 npm dsh 版本当作桌面版本。无法读取应用信息时，请让我提供该版本；无法判断宿主就先问我。

- Web 版：执行 dsh plugin --profile web add "dsh-skin-market@latest"，然后核对同一 web profile 中的依赖和 bundle。
- 官方 Desktop：你负责只读核查和操作指导，安装、启用及重启由我在应用界面完成。不要代我点击安装或启用，不要执行 dsh plugin --profile desktop、pnpm 或其他安装命令，也不要修改 Desktop profile。每次只给下一项操作，等我反馈后继续：打开「插件 → 添加插件」，输入 dsh-skin-market@latest，确认安装结果，再按应用提示启用；需要重启时指导我完全退出并重新打开应用。

这次只安装皮肤市场，不做其他皮肤的冲突检查，也不要求停用它们。不要替我安装其他皮肤。安装后告诉我从哪里打开「皮肤市场」；Desktop 以插件页状态和我的实际操作反馈核对结果，没有核实就不要声称安装或启用成功。不要读取 .env、凭据或聊天记录。
```

**更新提示词**

```text
请更新已安装的 dsh-skin-market。先判断当前宿主和实际 profile：Web 查看 dsh --version；官方 Desktop 查看应用“关于”中的版本，不用系统终端的 npm dsh 版本替代。无法判断就先问我。

- Web 版：只读确认 web profile 已安装 dsh-skin-market，再执行 dsh plugin --profile web add "dsh-skin-market@latest"。
- 官方 Desktop：只读核对版本和插件状态，逐步指导我在桌面应用「插件 → 添加插件」中输入 dsh-skin-market@latest、确认更新结果并按提示启用；每次只给下一项操作，等我反馈后继续。安装、启用及重启由我在应用界面完成，不要代操作、执行 Desktop 安装命令或修改 profile。

Web 更新后验证同一宿主的 dsh-skin-market 依赖和 bundle；Desktop 根据插件页状态和我的实际反馈核对结果，没有核实就不要声称成功。告诉我更新前后版本及需要重启哪个宿主。不要替我更新或卸载其他皮肤。
```

</details>

## 使用皮肤

打开「设置 → 皮肤市场」或 「插件 → dsh-skin-market」

### 从市场安装具体皮肤

可直接安装的 npm 皮肤会使用「安装」或「安装并使用」流程。官方 Desktop 默认先安装，再进入使用确认；取消使用确认时，皮肤包会保留，但不会启用。

标为「需手动安装」的 GitHub 或 monorepo 子目录皮肤，需要把市场提供的完整固定目标交给 Agent，并由你在 Desktop 的「插件 → 添加插件」中确认。不要把完整 commit 或 `&path:/子目录` 改成 `latest`、仓库主分支或另一个包名。

<details>
<summary><strong>点击展开手动皮肤安装流程</strong></summary>

Agent 先只读确认当前 Desktop 版本和其他已启用的皮肤；发现冲突时列出名称，指导你在应用中停用，并核对停用结果后再继续。拿不到启用状态时，应请你提供插件列表或界面状态，不能把“无法确认”当成“没有冲突”。

安装目标使用面板给出的完整固定 spec。GitHub 目标保留完整 commit；monorepo 子包还要保留 `&path:/子目录`，例如 `github:owner/repo#<完整 commit>&path:/packages/skin`。没有 npm 包时，不要把该目标换成包名、`latest` 或仓库主分支。

Agent 每次只指导一项操作，等你反馈后继续：打开「插件 → 添加插件」、粘贴完整目标、确认安装结果、按提示启用，最后按当前版本要求完全退出并重新打开应用。Agent 不代点安装或启用，不执行 Desktop 安装命令，也不修改 profile。界面不支持该目标或安装失败时，先核对原始报错和维护者说明，再决定下一步；依赖伴生包的皮肤须核对完整安装要求。

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
| 页面因皮肤冲突无法操作 | 停止对应的 DSH Web 进程后，使用下面的 Web 重置命令 |

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

### Web 页面异常时重置皮肤

如果皮肤冲突导致 DSH Web 页面无法操作，先停止当前 DSH Web 进程，再执行：

```bash
~/.dsh/profiles/web/node_modules/.bin/dsh-skin-market-reset --profile web
```

这个命令会关闭皮肤市场管理的皮肤并恢复默认外观，但保留已安装的皮肤包和皮肤市场。随后重新启动 DSH Web。官方 Desktop 不要执行这个 Web profile 命令，请在应用插件管理器或市场中停用冲突皮肤。

## 在线目录

新皮肤和目录信息会独立更新，不需要先升级市场插件：

- 市场打开时读取最新目录，页面保持打开时约每 5 分钟检查一次，重新获得焦点时也会检查；
- 浏览器会保留最近一次有效目录，网络异常时优先展示缓存；
- 搜索和排序覆盖完整目录，列表按批次加载；
- 目录中的安装目标固定到收录时的版本或完整 commit，市场会在安装前校验目标和入口；
- 社区皮肤不是 DSH 官方或市场的安全背书，使用前请查看皮肤仓库说明、许可证和兼容范围。

## 提交你的皮肤

如果你开发了 DSH 皮肤，准备一个公开 GitHub 仓库后，在本仓库提交一个 `registry/skins/<owner>__<repo>.yml` 即可。目录条目只写收录信息，CI 会补全 package、commit、loader id 和预览图。

```yaml
url: https://github.com/<owner>/<repo>
```

monorepo 子包再加 `subpath:`。YAML 只允许 `url`、`subpath`、`name`、`author`、`description`、`screenshots`；不要写 `package`、`rowId`、`category`、`tags` 或 `install`。目录生成文件 `data/catalog.json` 不需要在社区 PR 中维护。

收录要求：

- 必须是公开、可安装的 DSH Web 皮肤仓库或 monorepo 子包；
- 安装来源固定到完整 40 位 commit SHA；
- 仓库或 package 元数据提供 package、row ID、许可证和 DSH 兼容范围；
- 预览图来自仓库中的真实界面截图；
- 收录不等于安全认证或官方背书。

<details>
<summary><strong>点击展开提交皮肤提示词</strong></summary>

复制以下整段提示词给你的 Agent：

```text
请把我的 DSH 皮肤提交到 DSH 皮肤市场。

皮肤仓库：<你的皮肤仓库地址>
目标目录仓库：https://github.com/kingOfSoySauce/dsh-skin-market
目录路径：registry/skins

请自主完成以下工作：
1. 只用只读方式确认皮肤仓库是公开的 GitHub 仓库（或 monorepo 子目录），且确实是可安装的 DSH Web 皮肤。不要读取 .env、凭据或聊天记录。
2. fork 或 clone 目标目录仓库并新建分支。在 registry/skins 下只新增一个 YAML，不要覆盖已有条目，不要修改 data/catalog.json。
3. YAML 必须写成薄条目。只允许 url、subpath、name、author、description、screenshots。多写 package、rowId、category、tags、modes、compatibility、install 等字段会失败；CI 会从皮肤仓库补全其余字段：

url: https://github.com/<owner>/<repo>
# subpath: packages/my-skin   # 仅 monorepo 子包需要

4. 预览图放在皮肤仓库的 screenshots.json 或 README 内；不要使用 SVG、data URI 或第三方图床。
5. 不要写完整 schema。若 registry:check 报缺少 id/install，删掉多余字段再跑，不要补全 schema。
6. 在目标目录仓库根目录运行 npm run registry:check。不得安装到我的真实 DSH profile。
7. git diff --name-only 应只有 registry/skins/<条目文件>.yml。提交并向目标目录仓库创建 PR，标题 feat(registry): add <皮肤名>。
8. 返回 PR 链接；没有 GitHub 权限时只准备好分支和可复制的 PR 内容。

收录不等于安全认证。不要声称该皮肤已被 DSH 官方、安全团队或市场背书。
```

</details>

## 安全与边界

- 市场只能安装目录中收录的皮肤标识，不接受任意命令或安装地址。
- 市场不会代替你登录 GitHub，也不会静默创建 PR；提交皮肤时，是否 fork、提交或创建 PR 由你和 Agent 的实际操作决定。
- 社区皮肤不是 DSH 官方或市场的安全认证。安装前请查看皮肤仓库、许可证、兼容范围和来源。

## 本地开发

需要 Node.js 22 或更高版本。

```bash
git clone https://github.com/kingOfSoySauce/dsh-skin-market.git
cd dsh-skin-market
npm install
npm run dev
```

`npm run dev` 启动使用 Mock Host 数据的预览页面，不会修改任何 DSH profile。

本地开发目录条目时，可以让市场固定读取当前构建包内的目录：

```sh
DSH_SKIN_MARKET_LOCAL_CATALOG=1 dsh web
```

常用检查命令：

```bash
npm run registry
npm test
npm run typecheck
npm run build
```

完整的本地安装和人工验收步骤见 [TESTING.md](./TESTING.md)。

## License

[MIT](./LICENSE)