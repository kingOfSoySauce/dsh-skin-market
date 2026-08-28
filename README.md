# DSH 皮肤市场

一个嵌入 DSH 设置页的皮肤市场，可以浏览、安装、使用、停用、更新和卸载社区皮肤。
<p align="center">
  <img src="./docs/assets/skin-market-liang.png" alt="DSH 设置中的皮肤市场发现页" width="70%">
</p>

<p align="center">
  <img src="./docs/assets/skin-market-deep-whale.png" alt="DSH 皮肤市场中的 Deep Whale 皮肤详情弹窗" width="70%">
</p>

### 在线预览

[点击查看在线皮肤市场](https://kingofsoysauce.github.io/dsh-skin-market/)

### 近期收录

- 2026-08-28：[fengb3/dsh-theme-aurum](https://github.com/fengb3/dsh-theme-aurum)（`1.1.0`）——鎏金 Aurum 主题
- 更多请查看[收录日志](./docs/recently-added.md)


## 安装

#### 方式一，命令安装：

> 安装前请确保已关闭其他皮肤插件，避免冲突

```sh
dsh plugin --profile web add "dsh-skin-market@latest"
```



#### 方式二，提示词安装：
<details>
<summary><strong>点击展开提示词</strong></summary>

复制以下给 DSH 即可，会先检查冲突，再安装皮肤市场

```text
请把 dsh-skin-market 插件安装到 DSH 的 web profile。不能先安装再检查，必须严格按以下顺序执行：

1. 安装前只读检查 web profile 的 package.json（dependencies 与 dsh.profile.bundles）、profile 的 cordis.patch.yml 和 $DSH_HOME/cordis.patch.yml（如有）。
2. 从当前启用的 bundles 中识别皮肤、主题或外观插件：排除 @deepseek-ai/dsh-base、@deepseek-ai/dsh-web-app 和 dsh-skin-market；读取候选 package.json 的名称、描述、dsh.client/dsh.bundle 声明，必要时再读 README。无法确定的候选先列出包名和描述。
3. 如果发现已启用的皮肤插件，列出它们并停在安装前，提醒我先停用以避免冲突；未经我确认不得修改任何 profile 文件，也不得执行安装。
4. 如果没有冲突，明确说“未检测到已启用的皮肤插件”，然后直接执行：

dsh plugin --profile web add "dsh-skin-market@latest"

5. 安装后读取 web profile 的 package.json，确认 dependencies 和 dsh.profile.bundles 中都有 dsh-skin-market；缺失则报告安装或注册失败。
6. 告诉我如何重启 DSH Web，并确认重启后可从“设置 → 皮肤市场”打开。不要替我安装任何皮肤。

如果安装命令报错（例如 pnpm 不在 PATH、allowBuilds 构建审批、manifest 缺失），再读 https://github.com/kingOfSoySauce/dsh-skin-market 的 README「安装失败时，可以让 DSH 自己排查」一节处理，或把完整报错贴给我。
```

</details>

---

### 安装失败时，可以让 DSH 自己排查

> 皮肤市场的安装、更新和卸载会调用 DSH 的 profile 插件管理器；当前 DSH 使用 `pnpm` 管理 profile 依赖。如果出现 `pnpm is not recognized`、`package manifest missing` 或 `allowBuilds` 相关报错，不必手动猜测 profile 状态。
>
> 含子目录路径的 GitHub 目标（`github:…#commit&path:/…`）请优先用市场页一键安装。Windows 上不要把这段 spec 交给 `dsh plugin add`：cmd.exe 会在 `&` 处截断。需要手动安装时用：
>
> ```powershell
> pnpm add "github:owner/repo#<commit>&path:/subdir" --dir $env:USERPROFILE\.dsh\profiles\web
> ```

<details>
<summary><strong>点击展开排查提示词</strong></summary>

把完整原始报错填入后复制给你的 DSH Agent：

```text
请帮我排查 DSH Web 皮肤市场的安装失败。下面是完整原始报错：

<把完整报错粘贴到这里>

请严格按以下 3 步处理，并报告每一步的结果：

1. 确认当前使用的 profile 名称和实际目录，并检查 DSH 进程自身是否能找到 pnpm（Windows 同时检查 pnpm.cmd）。如果 pnpm 不在 PATH，先说明如何安装或修复 pnpm，并停止把问题误判为 allowBuilds 配置问题。
2. 只有确认 pnpm 可用后，才检查 profile 的 pnpm-workspace.yaml。若 pnpm 输出了构建审批 key，只把报错中完整、精确的 key 合并到 allowBuilds，对应值设为 true；不要启用 dangerouslyAllowAllBuilds，也不要放宽其他包。不要读取 .env、凭据或聊天记录。
3. 重新执行原来的皮肤安装命令。完成后验证 profile package.json 依赖、node_modules 中目标包的 package.json、dsh.client/dsh.bundle 声明和 loader 注册项；如果仍失败，请指出具体失败阶段和完整错误，不要把 package manifest missing 当作根因。
```

</details>

## 更新本插件

#### 方式一，页面更新（推荐）：

在「设置 → 皮肤市场」标题右侧点击“更新”，完成后会提醒重启 DSH Web。

#### 方式二，命令更新：

```bash
dsh plugin --profile web add "dsh-skin-market@latest"
```
> 完成后需手动重启 DSH

#### 方式三，提示词更新：
<details>
<summary><strong>点击展开提示词</strong></summary>

复制以下内容给 DSH Agent：

```text
请把已安装在 DSH Web profile 的 dsh-skin-market 更新到 npm 最新版本。

请严格按以下顺序执行：
1. 确认当前使用的是 web profile，并读取其 package.json，确认已安装 dsh-skin-market；不要先卸载，也不要修改其他皮肤。
2. 执行：

dsh plugin --profile web add "dsh-skin-market@latest"

3. 更新后重新读取 web profile 的 package.json，确认 dsh-skin-market 依赖和 bundle 注册仍然存在。
4. 告诉我更新前后版本，并提醒我确认没有 Agent 正在运行后重启 DSH Web。不要替我更新或卸载任何社区皮肤。
```

</details>

## 收录你的皮肤

如果你开发了 DSH 皮肤，准备一个公开 GitHub 仓库后，向本仓库提 **一个** `registry/skins/<owner>__<repo>.yml` 即可。默认只写仓库地址，CI 会补全 package、commit、loader id 和预览图：

```yaml
url: https://github.com/<owner>/<repo>
```

monorepo 子包加上 `subpath:`。也可以继续让 Agent 代为开 PR，复制下面提示词并把 `<你的皮肤仓库地址>` 换成真实地址。

这不是终端命令，而是交给 Agent 的任务说明：

<details>
<summary><strong>点击展开提示词</strong></summary>

复制以下整段提示词给你的 Agent：

```text
请把我的 DSH 皮肤提交到 DSH 皮肤市场。

皮肤仓库：<你的皮肤仓库地址>
目标目录仓库：https://github.com/kingOfSoySauce/dsh-skin-market
目录路径：registry/skins

请自主完成以下工作：
1. 只用只读方式确认皮肤仓库是公开的 GitHub 仓库（或 monorepo 子目录），且确实是可安装的 DSH Web 皮肤。不要读取 .env、凭据或聊天记录。
2. fork 或 clone 目标目录仓库并新建分支。在 registry/skins 下只新增一个 YAML，不要覆盖已有条目，不要修改 data/catalog.json。
3. YAML 默认写成薄条目即可，CI 会从皮肤仓库补全其余字段：

url: https://github.com/<owner>/<repo>

4. 预览图放在皮肤仓库的 screenshots.json 或 README 内；不要使用 SVG、data URI 或第三方图床。
5. 在目标目录仓库根目录运行 npm run registry:check。不得安装到我的真实 DSH profile。
6. git diff --name-only 应只有 registry/skins/<条目文件>.yml。提交并向目标目录仓库创建 PR，标题 feat(registry): add <皮肤名>。
7. 返回 PR 链接；没有 GitHub 权限时只准备好分支和可复制的 PR 内容。

收录不等于安全认证。不要声称该皮肤已被 DSH 官方、安全团队或市场背书。
```

</details>

皮肤市场里的「提交皮肤」也可以根据仓库地址生成这段提示词。

`registry/skins/` 是社区提交的唯一事实来源，每个皮肤一个 YAML 文件。`data/catalog.json` 是生成文件，不需要在社区 PR 中维护；PR 合并到 `main` 后会由仓库自动重生成。这样新增皮肤之间不会因为共同编辑一个目录文件而反复冲突。

## 收录要求

皮肤市场同时支持带 `dsh.bundle` 的完整插件和只有 `dsh.client` 的纯前端皮肤。对于后者，市场会在安装后自动、幂等地写入该皮肤已审核的 `rowId` 和 package 注册项；卸载时一并移除。维护者不必为了进入市场而额外复制一份 `cordis.patch.yml`，但仍须在 package 或 README 中提供明确的 row ID 和 DSH 兼容范围。

- 必须是公开、可安装的 DSH Web 皮肤仓库或 monorepo 子包
- 安装来源必须固定到完整 40 位 commit SHA
- 必须提供明确的 package、row ID、许可证和兼容范围
- 预览图必须是仓库中的真实界面截图
- Topic、仓库名称和 Stars 只用于发现与排序，不代表安全审核或官方背书

## 仓库健康建议

市场在同步已收录仓库时会检查三项便于用户理解和安装的基础规范，并在皮肤详情页展示结果：

- README 是否展示仓库内、可固定到版本的真实界面截图
- README 或 package 元数据是否明确声明支持的 DSH Web 版本范围
- package 名称、`dsh.client` Web 声明、row ID 和已构建客户端入口是否满足市场的一键安装要求

检查结果用于给维护者提供改进建议，不代表安全认证。暂未满足某项规范时，页面会说明如何完善，而不会把仓库描述为“不可用”。

“兼容性待验证”和“市场能否安装”是两个独立维度：

- 兼容性表示维护者是否明确声明并验证了支持的 DSH Web 版本；缺少声明时会提示风险，但不会单独阻止市场安装。
- 市场安装表示目录是否具备固定安装目标、package、`dsh.client` Web 声明、row ID 和可解析的已构建客户端入口。符合这些条件时，市场会调用 DSH 的 `plugin add` 命令完成安装；不要求插件仓库自行实现名为 `add` 的命令。

## 兼容性验证

当前面向 DSH Web `0.1.0-rc.6`。目录中的安装目标固定到收录时的完整 commit。

截至 2026-08-17，npm 的 DSH `latest` 与 `next` 均为 `0.1.0-rc.6`。本项目使用重新安装的该版本完成了以下验证：

- 皮肤市场 `0.1.15`：132 条目录校验、70 项自动化测试、类型检查、Host/Client 构建、站点构建和 package preflight 全部通过
- DSH Web 实机启动：市场 Host 路由、客户端设置入口、在线目录和 5 分钟静默更新正常加载
- Liang Intensity `0.1.4` 联合冒烟：8 项测试和客户端 bundle 构建通过，并可在同一 DSH Web profile 中保持 active

这组结果证明上述版本组合可以启动和运行，不代表市场内所有第三方皮肤都已完成同等级别的人工兼容或安全审核。

## 在线目录更新

已安装的皮肤市场不需要升级插件才能看到新收录或更新后的皮肤：

- 打开市场时由 DSH Host 从 GitHub Pages 拉取最新 `catalog.json`
- 页面保持打开时每 5 分钟静默检查一次；窗口重新获得焦点时也会立即静默检查
- npm 上出现更高的市场插件版本时，标题右侧会显示下载按钮；悬停后显示“更新”，安装完成后提示重启生效
- 浏览器会用 IndexedDB 保留最近一次有效目录；再次打开时先展示缓存，再在后台校验在线目录
- 列表首批只渲染 20 个皮肤，接近底部时每次无感追加 20 个；搜索和排序仍覆盖完整目录
- 首次无缓存时显示结构化骨架屏，预览图延迟加载并保留固定尺寸，避免页面跳动
- 远程目录通过 schema、唯一 ID/package/rowId、GitHub 仓库地址和固定 commit 安装目标校验后，才会进入可安装生命周期
- 验证成功的目录会缓存到当前 profile；离线、超时或远程数据不合法时自动回退到缓存，再回退到插件内置目录
- 每日抓取任务在完整测试通过后直接部署在线目录，同时继续创建 registry PR 留下可审查记录



## 本地开发

需要 Node.js 22 或更高版本。

```bash
git clone https://github.com/kingOfSoySauce/dsh-skin-market.git
cd dsh-skin-market
npm install
npm run dev
```

`npm run dev` 只启动使用 Mock Host 数据的预览页面，不会修改任何 DSH profile。

### 本地目录调试

本地开发 DSH 皮肤时，市场默认仍会从 GitHub Pages 请求远程 `catalog.json`，因此刚写入本地 `registry/skins` 的条目可能被远程目录覆盖。启动 DSH Web 前设置下面的开发环境变量，市场会固定使用当前构建包内的 `data/catalog.json`，不发起远程目录请求：

```sh
DSH_SKIN_MARKET_LOCAL_CATALOG=1 dsh web
```

该开关只影响当前进程的目录读取；安装、激活、停用、更新和卸载仍然经过本地市场的完整生命周期。未设置时保持线上行为：优先读取远程目录，并在失败时回退到缓存和内置目录。

本地条目验证完成后，再删除该环境变量运行 DSH，确认远程目录行为没有被改变。

### 本地验证生成的 WebP

WebP 是独立的市场静态资源，catalog 中的 `media` 字段会让插件和在线页默认直接请求 GitHub Pages 上的 preview/full；没有对应 WebP 或请求失败时，继续使用原始 PNG/JPG。需要重新生成资源时，先安装 `cwebp`（macOS 可用 `brew install webp`），然后运行：

```bash
npm run registry
npm run media:build
```

本地调试默认也请求线上 WebP。只有需要关闭 WebP 对比原图时，才在地址后追加：

```text
?dsh-media=0
```

对应仓库图片更新后，媒体脚本会重新下载并更新同一内容键；图片资源先发布到 ops 和 public market，插件代码可以单独发布。

常用检查命令：

```bash
npm run registry
npm test
npm run typecheck
npm run build
npm run release -- 0.1.31 --dry-run
```

正式发布时去掉 `--dry-run`；脚本会校验工作区、同步 npm 版本、提交并推送 Git tag，再发布 npm。需要同时创建 GitHub Release 时追加 `--github-release`。

完整的本地安装和回滚验证步骤见 [TESTING.md](./TESTING.md)。

## 目录维护

公共仓库保留 registry Schema、目录生成和社区提交校验。候选发现、全量收录、实机截图补录和运营报告属于维护者内部流程，不随市场运行时发布；正式目录条目仍位于 `registry/skins/`，`data/catalog.json` 是生成文件。

市场截图会作为 `marketScreenshots` 与上游截图合并展示；公共构建只负责校验和合并，不包含截图采集或提升工具。

## 安全说明

- 浏览器只能提交 registry 中的 `skinId`，不能提交任意命令或安装地址
- 安装、更新和激活失败时会恢复 profile manifest 快照并清理半安装状态
- GitHub Stars 由定时收录任务写入带更新时间的目录快照，页面和 Host 都不在浏览时请求 GitHub API
- 市场不会代替开发者登录 GitHub，也不会静默创建 PR

## 页面异常时重置皮肤

如果皮肤冲突导致 DSH 页面无法操作，先停止当前 DSH 进程，再执行：

```bash
~/.dsh/profiles/web/node_modules/.bin/dsh-skin-market-reset --profile web
```

该命令会关闭皮肤市场管理的所有皮肤并恢复默认外观，但保留已经安装的皮肤包和皮肤市场。随后重新启动 DSH 即可。命令使用原子写入；任何一步失败都会恢复执行前的 profile 文件。

## License

[MIT](./LICENSE)
