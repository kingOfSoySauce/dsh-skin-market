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

- **2026-10-25**：本批新增 **1 条**；详见[本批收录日志](./docs/recently-added.md#自动同步更新)。

## 安装

### 安装方式

> 安装皮肤市场本身不要求停用现有皮肤；安装或切换具体皮肤前再检查冲突。

#### Web 版（命令行）

```sh
dsh plugin --profile web add "dsh-skin-market@latest"
```

#### 官方 Desktop

APP 左上角「插件 → 添加插件」中输入 `dsh-skin-market@latest` 安装并按应用提示启用；如果提示需要重启，请完全退出 Desktop App 并重新打开。

使用“关于 DeepSeek Harness”中的应用版本判断 Desktop 兼容性。系统终端里的 `dsh --version` 可能来自另一份 npm 安装，不能代表当前桌面应用。

### 宿主与管理接口兼容性

以下按 **2026-10-17 已核验的官方源码与安装包**说明功能边界；自动化检查与 Web、原生 Desktop 的实机验收分别记录，源码支持不等于所有平台已完成实测。

| 官方 DSH 版本 | 市场可用的管理能力 | 额外接口边界 |
| --- | --- | --- |
| `0.1.5-alpha.1`～`0.1.5-rc.3`、`0.1.6-alpha.1` | 旧桌面壳的插件 IPC 属于其自有窗口；市场不接入这套私有接口 | 启动/恢复页的内部 restart 不提供给第三方插件 |
| `0.1.6-alpha.2` | 安装、更新、使用、停用、卸载与精确构建项授权，通过共享 `pluginManager` | 安装后保存使用选择，提示手动重启以加载新包；安装结果恢复、registry、`saveExact` 尚不可用 |
| `0.1.7-alpha.1`、`0.1.7-alpha.2`、`0.1.7-rc.1`、`0.1.7-rc.2` | 上述管理能力；增加安装结果恢复与 registry 选项 | 安装后保存使用选择，提示手动重启以加载新包；支持按序读取多个 bundle patch，`saveExact` 尚不可用 |
| `0.2.0-rc.1`、`0.2.0-rc.2` | 延续共享插件管理能力 | 安装后保存使用选择，提示手动重启以加载新包；`0.2.0-rc.2` 起 Desktop 自带命令支持应用退出后的离线插件维护 |
| `0.2.1-alpha.1` | 上述能力，官方管理器增加安装后的运行时包解析刷新 | 按实际管理结果判断是否仍需重启；`saveExact` 尚不可用 |
| `0.2.1-alpha.2` | 上述能力，并支持 `saveExact` | 市场可请求精确保存依赖版本 |
| `0.2.1-alpha.3` | 延续上述能力；官方修复更新/重装后的旧代码加载，并返回 `restartReason` | 可热重载的修改直接应用；其他修改保存选择后提示手动重启 |
| `0.2.1-rc.1` 及更新版本 | 已核对 `0.2.1-rc.1` 安装包；更新版本在对应方法仍存在时沿用这份契约 | 支持安装结果恢复、registry 与 `saveExact`；按真实运行清单显示启用、停用或加载异常。不再因为版本号未写入名单而拒绝 |

市场同时检查实际服务的方法是否存在。官方版本无法识别、尚未核验或缺少方法时，相应按钮会说明原因，不再将维护者的接口核验记录汇总为常驻横幅；不会猜测接口可用，也不会改走另一个 profile。版本未适配与宿主缺少清单接口分别报告，不能将市场拒绝读取说成宿主未提供接口。

`0.2.1-rc.1` 已完成官方 macOS 安装包内的版本、接口实现与清单结构核对，并有自动化回归覆盖；原生 Desktop 操作与外观验收仍需单独记录。比它新的版本沿用这份契约，方法缺失或宿主返回无法识别的结果时只拒绝该次操作。比它旧、且不在上表中的版本仍然拒绝，不把中间未核验的预发布版收进范围。

已核验的旧版官方 Desktop 同样支持先保存启停选择。市场不会因为版本早于 `0.2.1-alpha.1` 就跳过切换：安装验证成功并完成所需的使用确认后，继续调用官方管理接口，保存旧普通皮肤停用、目标皮肤启用的配置。较旧宿主加载新包可能仍需重启；这不等于启用配置不能保存。

已核验的同一皮肤更名也支持自动切换。目前支持「滑动变祖」从 `dsh-client-liang-intensity-skin` 切到 `@leon___/dsh-client-liang-intensity-skin`：点击使用后，市场通过官方接口撤下旧组合包，再启用新版，保留旧安装包和本地链接；失败时尝试恢复旧选择。旧包已停用时可直接启新版。市场会核对旧包身份、仓库、唯一组件和官方清单；未知插件、额外组件或手工重复注册仍会拦截。旧 Desktop 保存选择后可能需要重启；组件仍指向旧包时，仅在确认新版没有禁用覆盖后提示待重启，宿主结果未知时暂停后续修改。

官方 Desktop 点击「安装」默认继续一键使用：市场先安装并验证目标皮肤，再切换使用；首次使用、兼容性和构件风险合并在使用前确认，取消后保留已安装包、不启用目标。确认后自动停用原先的普通皮肤，保留常驻皮肤与无关插件。需要重启时，在切换选择保存后弹出「请手动重启 Desktop App」；点击“知道了”或关闭后，同一次提醒不再显示横幅，仍可从皮肤卡片的待重启入口查看。macOS 使用 `⌘Q` 完全退出并重新打开，仅关闭窗口不算退出。更新通常保留原有启用和常驻选择；新版存在待确认风险时先保持停用，确认使用或常驻后再启用。真正的启用失败会显示原因并恢复旧选择。

官方 Desktop 可直接安装已核验的 npm 包，以及通过市场安装审查、固定完整 commit 和子目录、不需额外构建或伴随插件处理的 GitHub 目标。安装由当前应用的插件管理器执行；GitHub 更新保留原来源，并核对锁文件中的仓库、commit、子目录和实际包入口。

其他皮肤同样点击「安装」：市场直接打开应用现有弹窗并填好固定目标，由用户确认安装。已有安装任务或未提交的其他输入会保留；「其他安装方式」保留原有提示词和复制目标面板。该面板桥接按宿主实际能力检查，未使用私有 Electron IPC，也不代替用户提交安装。

从市场打开的原生安装完成后会刷新安装状态；用户继续点击原生「启用」且宿主确认已保存后，返回市场完成停用旧普通皮肤、保留常驻项的切换。仅安装不自动启用。市场读取原生页的真实组件状态，启动和刷新目录时保留宿主已保存的选择；有界面模块的皮肤还需确认该模块已经加载，未加载时显示「待重启」，加载失败时显示「未生效」。

启用同时核对组合包选择与目标主组件的有效开关。组件仍关闭或尚未运行时，市场显示「未生效」及具体原因；等待重启的修改显示「待重启」。旧版宿主首次安装的保守重启提示，会在确认目标组件已启用并运行后清除，无需额外退出应用；其他皮肤遗留的重启要求保留在原皮肤上。完整退出重开后重新核对实际运行状态，已生效的提示会清除，加载错误不会变成无限重复的重启要求。

Web 的普通使用、切换、常驻和停用先尝试热应用，再核对宿主组件与当前页面的实际运行状态。目标皮肤已运行、旧普通皮肤已停止且常驻项保留时，不弹重启提示；正在加载时显示应用中，加载失败时显示原因。异步加载完成后会重新核对并收起本次切换的推断提示，不按 DSH 版本或是否声明客户端模块一律要求重启。当前页面的确认不代表其他浏览器页面也已同步。

安装、更新、重装和宿主明确要求的重启仍单独保留，不会因为同名皮肤模块仍在运行就清除。接口是否可调用继续按已核验的版本和实际服务能力判断。

表中的离线维护仅由 Desktop 自带命令提供，须先初始化 Desktop profile 并完全退出应用；npm 安装的 dsh 不能修改 Desktop profile。

<details>
<summary><strong>点击展开 API、结果与来源校验说明</strong></summary>

官方 Desktop 使用 Host 的 `ctx.pluginManager`：安装和更新调用 `installBundle(spec, options)`，组合包启停调用 `setBundleEnabled(name, enabled)`，单个条目启停调用 `setPluginEnabled(entryId, enabled)`，卸载调用 `removeBundle(name)`。安装有独立 `requestId`，取消走 `cancelInstall(requestId)`；支持结果恢复的版本可通过 `waitForInstall(requestId)`核对已有操作，不重新发起安装。安装日志和状态由 `plugin-manager/install-log`、`plugin-manager/install-state` 事件提供。

结果中的 `application` 决定管理事务状态：`applied` 表示本次管理修改已应用，安装事务的这个结果不证明插件代码已加载；市场继续核对启用结果和实际状态。`restart-required` 表示修改已保存、仍需重启，`overridden` 表示修改保留但启用状态被其他配置覆盖，`failed`/`cancelled` 分别表示失败/已确认取消。`0.2.1-alpha.3` 的 `restartReason` 区分未开启热重载、包位置变化、宿主模块、非 Loader 管理的插件或无法比较模块；这些结果不等于启用接口不可用。允许继续启用的宿主可先完成停旧、启目标；宿主明确要求的重启，以及更新、修复或来源不明的历史重启记录，会保留到应用重启，不能仅凭旧组件仍在运行就清除。取消请求到达太晚时，以管理器最终结果为准。结果无法确认时，市场保留“等待宿主确认”，阻止重复写入并提示重新启动应用后核验。

较旧服务可能把 `1.2.3` 保存成 `^1.2.3`。市场会核对实际包版本、锁文件 importer 的 specifier/解析版本以及目录记录的 SRI；可验证的范围写法不会绕过完整性检查，也不会被直接声称为精确固定版本。缺少 SRI 的旧 Desktop 元数据只提供包名、版本与入口检查，不代表通过了哈希校验。

所有上述已核验官方 Desktop 版本都未提供供第三方调用的通用 App 退出或重启接口。只有确实需要重启时，市场提示「请手动重启 Desktop App」，用户完全退出并重新打开。`dshDesktop.updates.open()`打开桌面更新确认流程，不是通用重启 App API。市场不调用 Electron 私有 IPC 或从运行中的 Desktop 执行 `dsh plugin --profile desktop`。

第三方桌面壳提供的 `desktopProfiles`/`desktopPnpm` 与官方 `pluginManager` 分开适配。市场使用各自宿主提供的当前 profile 和安装服务；不会自动迁移第三方壳的配置、依赖、启用状态或 profile。

依据：[官方 `0.1.6-alpha.2` 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.6-alpha.2)、[官方 `0.2.0-rc.2` Desktop 命令说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/apps/desktop/README.md#bundled-command-runtime)、[`0.2.1-alpha.3` 管理结果](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.3/packages/boot/plugin-manager/src/types.ts)、[`0.2.1-alpha.3` 启停与安装实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.3/packages/boot/plugin-manager/src/index.ts#L492)、[Desktop 产品接口](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.3/apps/desktop/src/ipc.ts#L72)。

</details>

#### 提示词安装
<details>
<summary><strong>点击展开安装提示词</strong></summary>

复制以下给 DSH Agent；Web 可由 Agent 执行安装，官方 Desktop 由 Agent 逐步指导你操作。

```text
请帮我安装 dsh-skin-market。先只读确认当前是 Web 版还是官方 Desktop，以及当前宿主和实际 profile。Web 查看 dsh --version；官方 Desktop 以应用“关于”中的版本为准，不把系统终端的 npm dsh 版本当作桌面版本。无法读取应用信息时，请让我提供该版本；无法判断宿主就先问我。

- Web 版：执行 dsh plugin --profile web add "dsh-skin-market@latest"，然后核对同一 web profile 中的依赖和 bundle。
- 官方 Desktop：你负责只读核查和操作指导，安装、启用及重启由我在应用界面完成。不要代我点击安装或启用，不要执行 dsh plugin --profile desktop、pnpm 或其他安装命令，也不要修改 Desktop profile。每次只给下一项操作，等我反馈后继续：打开「插件 → 添加插件」，输入 dsh-skin-market@latest，确认安装结果，再按应用提示启用；需要重启时指导我完全退出并重新打开应用。

这次只安装皮肤市场，不做其他皮肤的冲突检查，也不要求停用它们。不要替我安装其他皮肤。安装后告诉我从哪里打开「皮肤市场」；Desktop 以插件页状态和我的实际操作反馈核对结果，没有核实就不要声称安装或启用成功。不要读取 .env、凭据或聊天记录。
```

</details>

#### 官方 Desktop 安装具体皮肤

支持一键安装的 npm 皮肤，在官方 Desktop 市场中点击「安装」会先安装，再进入使用流程，需要确认或重启时弹窗提醒；Web 市场的对应主按钮为「安装并使用」，详情页另有「仅安装」。仅安装不弹可选风险确认。标为「需手动安装」的 GitHub 或子目录皮肤，可以复制安装面板中的提示词，让 Agent 检查冲突、核对目标并指导你在插件页安装。

<details>
<summary><strong>点击展开手动皮肤安装流程</strong></summary>

Agent 先只读确认当前 Desktop 版本和其他已启用的皮肤；发现冲突时列出名称，指导你在应用中停用，并核对停用结果后再继续。拿不到启用状态时，应请你提供插件列表或界面状态，不能把“无法确认”当成“没有冲突”。

安装目标使用面板给出的完整固定 spec。GitHub 目标保留完整 commit；monorepo 子包还要保留 `&path:/子目录`，例如 `github:owner/repo#<完整 commit>&path:/packages/skin`。没有 npm 包时，不要把该目标换成包名、`latest` 或仓库主分支。

Agent 每次只指导一项操作，等你反馈后继续：打开「插件 → 添加插件」、粘贴完整目标、确认安装结果、按提示启用，最后按当前版本要求完全退出并重新打开应用。Agent 不代点安装或启用，不执行 Desktop 安装命令，也不修改 profile。界面不支持该目标或安装失败时，先核对原始报错和维护者说明，再决定下一步；依赖伴生包的皮肤须核对完整安装要求。

这些说明不改变市场的 npm 一键安装流程，也不代表所有 GitHub 或子目录皮肤已通过官方 Desktop 实机验收。

</details>

---

<a id="install-troubleshooting"></a>
### 操作失败后的检查与修复

先按市场显示的具体原因处理。网络失败可以重试；构建审批和新包保护有独立的精确批准入口；结果待确认时先核对状态，不能重复发起操作。本地环境或安装状态问题可点“复制排查提示词”，把当前皮肤身份、宿主版本、原操作与脱敏日志交给能访问这台机器的 Agent。提示词用于定位问题，不代表已经确认根因或保证能修复。

| 具体情况 | 优先处理方式 |
| --- | --- |
| 网络或下载超时 | 先重试，持续失败再核对宿主实际使用的网络、代理与安装源 |
| 包管理器缺失、存储位置冲突、权限或磁盘空间 | 检查真实宿主环境，Agent 可先只读定位 |
| 锁文件不一致、记录缺失、恢复未完成 | 先核对实际状态与备份，局部修复；不删除整个锁文件 |
| 找不到包、精确版本、模块或安装文件 | 区分安装未完成、访问权限、宿主依赖、源同步及包声明，不能直接归咎皮肤作者 |
| 启停被其他配置覆盖 | 查看市场能否提供可审核的修复方案；没有安全方案时交给本地 Agent 或原管理工具 |
| 安装身份冲突 | 核对冲突的包、来源和组件标识；仅停用未必能解决，不能一律要求卸载 |
| 宿主限制、无法定位组件、来源检查失败 | 按具体提示刷新、核对或使用官方管理入口，不绕过保护 |
| 目录信息与实际安装包不一致 | 复制日志反馈市场维护者；确认发布包缺文件后再向皮肤作者反馈 |

<details>
<summary><strong>Agent 如何安全排查？</strong></summary>

Agent 应从真实进程、应用与运行时确认 DSH home 和实际 profile，不猜测默认路径。Desktop 版本以应用“关于”为准，系统终端的 npm dsh 版本不能代表桌面应用。`ERR_PNPM_UNEXPECTED_STORE` 要比较实际 profile 的 `node_modules/.modules.yaml`（`packageManager`、`storeDir`）与宿主使用的 pnpm，不能用源码仓库中的版本判断。

不要读取 `.env`、凭据或其他存放秘密的配置。混合配置可能含秘密时，先取得指定文件和目标字段的限定读取授权，仅输出这些字段。全局或启动设置的修改须先展示最小差异，确认后备份，保留注释和无关字段。

运行在被修复的同一个 DSH 中的 Agent，不应改写自己的活动组合配置、安装或卸载当前宿主，也不应停止或重启自己。需要此类操作时，先准备可重复执行的 `apply` 与 `rollback` 方案，由外部终端或独立 Agent 在退出相关宿主后执行。Desktop 安装、卸载、启停和重启由用户在官方页面操作；不要执行 `dsh plugin --profile desktop`，或使用 npm/pnpm 直接写 Desktop profile。

修复后重试原来的操作，不把停用、取消常驻或卸载变成安装。核对实际包版本、启停选择和运行状态；“已安装”不等于“已启用”，`application: applied` 也不证明代码已加载。需要重启时按当前宿主提示操作。来源检查、完整性校验和宿主保护不能由 Agent 绕过。

</details>

<a id="configuration-override"></a>
### 皮肤的启停设置被覆盖

启用失败可能是其他设置强制禁用；停用失败也可能是其他设置强制启用。切换皮肤时还可能是原皮肤无法停用，而非新皮肤无法启用。请以弹窗指出的目标组件和本次期望状态为准，不反复重装。

<details>
<summary><strong>市场能修复哪些覆盖？</strong></summary>

官方启停接口修改当前 profile，不能直接清理更高层覆盖。市场可检查静态 home 补丁中的目标启停字段；仅在目标唯一、内容可安全局部修改时展示准确文件、字段、期望状态与修复方案。确认后先备份，再移除目标 `disabled` 覆盖，保留其他字段与注释。此修改影响使用同一 home 的其他 profile，须先审核范围。

市场在启停前只读检查本次切换涉及的覆盖项，将版本兼容性、构件风险和共享配置修改合并在一次确认中。点击“解除覆盖并使用”后，后台完成备份、批量移除覆盖和正常官方启停，再核对实际运行状态；移除覆盖不保证皮肤已经加载或停用。切换涉及旧皮肤和新皮肤的多项覆盖时，一次展示、一次备份写入；取消不修改配置。确认期间皮肤、安装包、选择或配置发生变化时，更新方案并重新确认。只有 id 的空覆盖行才可删除，不能删除整份配置，或改成更高层的反向强制设置。

YAML 结构复杂、目标重复、配置变化、无权限，或覆盖来自启动参数、动态工具及远程来源时，市场应拒绝自动修改。此时可复制针对本次目标的排查提示词；Agent 先只读确认来源，能访问实际环境且找到可编辑的静态覆盖后才能提出修复。由皮肤切换工具维护的设置，优先回到原工具处理。

</details>

<a id="release-wait"></a>
### 安装被新包保护阻止

市场会先合并已经允许、但因重复规则而失效的精确版本。若 Desktop 仍明确阻止某个新包，市场会显示包名和版本；确认来源后，可点“允许此版本并继续”。只放行报错中的这个版本，不关闭全局保护。已有皮肤仍可切换和启停。

<details>
<summary><strong>为什么旧皮肤也受影响？其他更新入口怎么办？</strong></summary>

Desktop 调用本机 pnpm 安装插件，pnpm 可能检查整组依赖。即使操作的是旧皮肤，市场或其他依赖的新版本也可能使整次包操作失败。请以报错中点名的包和版本为准。

pnpm 有时会给同一个包追加多条版本例外，而安装检查只读取第一条。市场会在包操作前合并同名规则中已经允许的版本；若安装失败后又产生重复规则，合并后只自动重试一次。没有已有例外时，只有用户点击“允许此版本并继续”后才添加报错中的精确版本。已确认的新包保护失败即使部分写入了文件，也可在明确允许后继续同一精确目标，完成清单、锁文件与安装文件的修复。结果未知、取消或超时时不会这样重试。若已明确是新包保护失败，并修复了报错所指包的重复例外，即使 Desktop 仅回滚清单而保留了新版文件，市场也会对同一精确目标重试一次以修复状态；其他失败须先确认原构件已恢复。

官方 Desktop 当前没有管理这项例外的接口，市场仅维护当前 profile 的 `pnpm-workspace.yaml` 中 `minimumReleaseAgeExclude` 字段，保留其他配置。官方插件页、其他市场或外部命令的安装过程不经过本市场，市场无法提前拦截；市场加载时及后续包操作前会修复已有重复规则。新市场尚未安装或加载时，其修复代码无法处理当前安装。无法自动处理时，可复制下面的提示词交给你的 DSH Agent：

```text
请处理这次 DSH Desktop 的新包保护错误。先确认 Desktop 实际使用的 profile 名称和目录，并从本次 ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION 诊断中确认被阻止的精确包名和版本；不要把正在安装的皮肤直接当成被阻止的包。

仅处理这个 profile 的 pnpm-workspace.yaml 中 minimumReleaseAgeExclude 字段。先合并同名规则中已经允许的版本，保留其他规则、注释和配置。如果报错中的精确版本确实没有例外，先向我展示包名、版本和来源，由我确认后才添加这个精确版本。不要设置 minimumReleaseAge=0，不要允许整个包的未来版本，不要读取 .env、凭据或其他存放秘密的配置。混合配置可能含秘密时，先取得指定字段的限定读取授权。

如果你正运行在这个 DSH 中，不要修改自己的活动组合配置、重启或安装当前宿主；先准备可重复执行的 apply 与 rollback 方案，交给外部终端或独立 Agent 执行。Desktop 包操作由我在官方页面重试。最后核对实际安装版本和组件状态，报告具体结果。
```

也可以等待本机 pnpm 要求的保护期结束后重试。默认通常为 24 小时，用户可自行配置；等待不会修复其他安装故障，也不会自动修复之前失败留下的异常包状态。

</details>

### 安装来源与长时间等待

Web 市场优先使用目录中已经核验的 npm 精确版本；没有合格 npm 来源时，继续使用 GitHub 固定 commit。遇到长时间等待时，请提供皮肤名、DSH/市场版本、操作系统及市场横幅中的“复制日志”。

<details>
<summary><strong>点击展开安装来源校验与等待机制</strong></summary>

npm 来源会核对目录记录与实际安装包；包名、版本或可加载入口不符时仍停止操作。SRI 缺失或不一致等来源风险可在安装后保留，使用或常驻前再确认，不会标成完整性已核验；构件或核验目标变化后须重新确认。已有的 GitHub 安装仍然有效，不会仅因目录补充 npm 来源而要求重装。

安装横幅默认显示当前状态、皮肤名和耗时，下载时保留下载量；展开“详情”可查看具体步骤、尝试次数、pnpm 阶段和连续 30 秒无输出的提示，也可复制诊断日志。Web 安装和更新的准备、下载、重试共用 15 分钟预算，达到时限后结束当前任务；已修改 profile 的失败操作只做一次、独立限时 60 秒的依赖恢复，并核对更新前的实际版本和声明入口。恢复未完成或入口仍缺失时会明确提示。官方 Desktop 的安装事务与失败恢复由宿主插件管理器处理；市场仅在包操作前修复发布年龄例外，或在用户批准后添加对应精确版本，不额外恢复宿主的包文件。

宿主启停操作超过 10 秒仍未结束时，市场进入“等待宿主确认”并暂停新的 profile 写入；这不表示原操作已经取消。迟到的成功或失败仍会被处理、核对，结束前不会重复启停同一个 loader。读取目录和状态不受这次隔离影响。

普通进度保留在横幅；需要批准、可重试失败、结果待确认和重启等关键节点及时弹窗，同一结果去重，多个提示依次显示。关闭后仍可查看横幅中的状态、日志，并重新打开批准、失败或重启提示。

锁文件与 manifest 不一致、锁文件缺少依赖条目、安装脚本长期无输出是不同错误，市场分别提示，不把它们都当网络错误自动重试。请保留诊断并先备份再修复，不要删除整个锁文件重新解析其他插件。

`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` 表示依赖尚未达到 pnpm 要求的发布时间，见[安装被新包保护阻止](#release-wait)。安装器报告失败后仍须核对实际包状态，不能据此认定文件完全未变。

浏览器能够访问 GitHub，不能单独证明实际运行 DSH 的进程和 pnpm 已使用相同代理；也可能卡在依赖解析或构建阶段。

</details>

<a id="manual-update"></a>
## 更新本插件

### 方式一：页面更新（推荐）

在「设置 → 皮肤市场」标题右侧点击“更新”，完成后按界面提示重启 DSH Web 或官方 Desktop。

### 方式二：命令更新

#### Web 版

```bash
dsh plugin --profile web add "dsh-skin-market@latest"
```

#### 官方 Desktop

在桌面应用「插件 → 添加插件」中输入 `dsh-skin-market@latest`

> 完成后按界面提示重启对应宿主。

### 方式三：提示词更新
<details>
<summary><strong>点击展开提示词</strong></summary>

复制以下内容给 DSH Agent；它会先判断宿主，再选择更新方式：

```text
请更新已安装的 dsh-skin-market。先判断当前宿主和实际 profile：Web 查看 dsh --version；官方 Desktop 查看应用“关于”中的版本，不用系统终端的 npm dsh 版本替代。无法判断就先问我。

- Web 版：只读确认 web profile 已安装 dsh-skin-market，再执行 dsh plugin --profile web add "dsh-skin-market@latest"。
- 官方 Desktop：只读核对版本和插件状态，逐步指导我在桌面应用「插件 → 添加插件」中输入 dsh-skin-market@latest、确认更新结果并按提示启用；每次只给下一项操作，等我反馈后继续。安装、启用及重启由我在应用界面完成，不要代操作、执行 Desktop 安装命令或修改 profile。

Web 更新后验证同一宿主的 dsh-skin-market 依赖和 bundle；Desktop 根据插件页状态和我的实际反馈核对结果，没有核实就不要声称成功。告诉我更新前后版本及需要重启哪个宿主。不要替我更新或卸载其他皮肤。
```

</details>

## 收录你的皮肤

如果你开发了 DSH 皮肤，准备一个公开 GitHub 仓库后，向本仓库提 **一个** `registry/skins/<owner>__<repo>.yml` 即可。YAML 只允许 `url`、`subpath`、`name`、`author`、`description`、`screenshots`；不要写 `package`、`rowId`、`install` 等字段。CI 会补全 package、commit、loader id 和预览图：

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
- 安装和更新不弹可选风险确认；使用或设为常驻前，将首次使用提醒、当前版本的兼容性与构件风险合并确认。取消不启用目标，已安装包保留。兼容确认只允许本次尝试，不修改作者声明或皮肤源码；官方 DSH 对插件自身依赖的兼容检查仍由宿主执行。
- 失败、等待和手动重启弹窗点击“知道了”、取消或关闭后，同一次通知不再显示横幅；后台操作状态和待重启标识仍保留，新失败或新的重启事项会再次提醒。
- 市场安装表示目录是否具备固定安装目标、package、`dsh.client` Web 声明、row ID 和可解析的已构建客户端入口。符合这些条件时，市场会调用 DSH 的 `plugin add` 命令完成安装；不要求插件仓库自行实现名为 `add` 的命令。

## 兼容性验证

目录中的安装目标固定到收录时的完整 commit。下面是 **2026-08-17 的历史验证记录**，用于说明当时的版本组合，不代表当前所有第三方皮肤都已完成同等级别的验证。

<details>
<summary><strong>点击展开历史验证记录</strong></summary>

当时面向 DSH Web `0.1.0-rc.6`；npm 的 `latest` 与 `next` 均为 `0.1.0-rc.6`。本项目使用重新安装的该版本完成了以下验证：

- 皮肤市场 `0.1.15`：132 条目录校验、70 项自动化测试、类型检查、Host/Client 构建、站点构建和 package preflight 全部通过
- DSH Web 实机启动：市场 Host 路由、客户端设置入口、在线目录和 5 分钟静默更新正常加载
- Liang Intensity `0.1.4` 联合冒烟：8 项测试和客户端 bundle 构建通过，并可在同一 DSH Web profile 中保持 active

这组结果证明上述版本组合可以启动和运行。

</details>

## 在线目录更新

已安装的皮肤市场不需要升级插件才能看到新收录或更新后的皮肤：

- 打开市场时由 DSH Host 从 GitHub Pages 拉取最新 `catalog.json`
- 页面保持打开时每 5 分钟静默检查一次；窗口重新获得焦点时也会立即静默检查
- npm 上出现更高的市场插件版本时，标题右侧会显示下载按钮；悬停后显示“更新”，安装完成后提示重启生效
- 浏览器会用 IndexedDB 保留最近一次有效目录；再次打开时先展示缓存，再在后台校验在线目录
- 列表首批只渲染 20 个皮肤，接近底部时每次无感追加 20 个；搜索和排序仍覆盖完整目录
- 默认按「热度」排序：按每款皮肤自己的观察年龄计算 Stars/天、线性衰减后的 Star 增长/天，再叠加按同一皮肤年龄归一化的提交、外部 PR 和外部 issue；排序按钮在「热度 / Stars / 最新」之间切换
- 热度依赖两个生成文件：`data/star-history.json` 每日记录仓库 Stars 和每款皮肤的首次观察日；`data/repo-activity.json` 由 ops 夜间任务保存按天的提交、外部 PR 和外部 issue，作者自己开的 issue 和机器人账号不计入
- 卡片上的 `+N/天` 是按皮肤自身年龄和线性衰减计算出的 Star 增长速率，悬停可查看年龄、Stars/天和活动速率
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
# 先将 VERSION 替换为目标版本，例如 0.1.58
npm run release -- VERSION --dry-run
```

正式发布时将 `VERSION` 换成目标版本并去掉 `--dry-run`；脚本会依次校验工作区、同步版本、提交并创建 Git tag、发布 npm，再推送 `main` 和 tag。需要同时创建 GitHub Release 时追加 `--github-release`。

完整的本地安装和回滚验证步骤见 [TESTING.md](./TESTING.md)。

## 目录维护

目录继续使用原来的 `data/catalog.json` URL 和 `schemaVersion: 1`。registry YAML 的 `install.npm` 在生成时移到顶层 `npmSources[skinId]`，旧版市场忽略这个字段并继续使用 GitHub；新版验证包名、版本、仓库、commit/gitHead 和完整性信息后读取 npm 来源，Host 缓存也保存同一兼容格式。

新版 Web 市场首次安装优先使用已验证的 npm 包，没有匹配包时仍使用固定 commit 的 GitHub 源。普通“更新”保留已有安装来源；通过 GitHub 安装且与目录版本及 commit 一致的皮肤，会单独显示“换用 npm”，确认后换成同版本 npm 包。

Web 通过 `file:`、`link:` 或明确本地路径安装的皮肤，只有实际包名、仓库与目录一致，包和可加载入口完整、没有 loader 冲突，且市场提供已通过安装审查的 npm 包时，才提供“替换为市场版本”；含伴随插件的本地安装暂不支持。确认前显示当前版本与市场版本，市场版本较旧时明确提示降级。用户确认后才替换为已核验的市场版本；安装来源、代码、锁文件或市场目标变化后，旧确认失效，需要刷新后重新核对。

换源通常保留启用和常驻选择，原本地目录及 `.tgz` 文件保留；有待确认风险时先保持停用，使用或常驻确认后再启用，确需重启时提示。失败时恢复原安装来源与选择，恢复未完成会明确报告。旧 GitHub 版本、分支及无法核验的自定义来源不自动迁移。官方 Desktop 不提供上述换源入口，继续使用其原有安装与更新流程。

公共仓库保留 registry Schema、目录生成和社区提交校验。候选发现、全量收录、实机截图补录和运营报告属于维护者内部流程，不随市场运行时发布；正式目录条目仍位于 `registry/skins/`，`data/catalog.json` 是生成文件。

市场截图会作为 `marketScreenshots` 与上游截图合并展示；公共构建只负责校验和合并，不包含截图采集或提升工具。

## 安全说明

- 浏览器只能提交 registry 中的 `skinId`，不能提交任意命令或安装地址
- Web 的目录、状态、日志与修改 API 使用宿主登录检查；POST 同时核对同源和宿主声明的可信地址。宿主没有登录接口时保留原有地址限制
- Web 重启只接受直接回环连接、拒绝代理转发，并检查正在进行的插件操作和 Agent 状态；官方 Desktop 使用手动应用重启
- Web 失败恢复使用操作前的快照并核验实际构件；官方 Desktop 保留管理器的权威结果，不把未知结果或配置恢复单独当作安装成功
- GitHub Stars 与仓库活动由定时收录任务写入带更新时间的目录快照，页面和 Host 都不在浏览时请求 GitHub API
- 市场不会代替开发者登录 GitHub，也不会静默创建 PR

## Web 页面异常时重置皮肤

如果皮肤冲突导致 DSH Web 页面无法操作，先停止当前 DSH Web 进程，再执行：

```bash
~/.dsh/profiles/web/node_modules/.bin/dsh-skin-market-reset --profile web
```

该命令会关闭皮肤市场管理的所有皮肤并恢复默认外观，但保留已经安装的皮肤包和皮肤市场。随后重新启动 DSH 即可。命令使用原子写入；任何一步失败都会恢复执行前的 profile 文件。

官方 Desktop 请在桌面应用的插件管理器或皮肤市场中停用冲突皮肤，不要执行上面的 Web profile 命令。

## License

[MIT](./LICENSE)
