# 目录展示内容治理

这是维护者流程，不是社区作者提交格式。它解决两个问题：社区原始目录如何保持兼容，以及市场展示名称/中英文描述如何有证据地生成和更新。

## 一、数据分层

### 原始目录层

`skins[]` 是社区/registry 的兼容数据层：

- `skins[].name`、`skins[].description`、作者、标签、许可证和安装字段保留原义；
- `skins[].description` 必须继续是字符串；
- 不把 `{zh,en}` 写进 `skins[]`；
- 不因为展示文案需要而批量改写社区原文。

### 展示层

`data/catalog-copy.json` 是人工审核的 authoring 输入；生成后的 `data/catalog.json` 使用顶层 `displayCopy.skins[id]`：

```json
{
  "name": {"zh": "中文名", "en": "English name"},
  "description": {"zh": "中文描述", "en": "English description"},
  "descriptionPolicy": "show"
}
```

`descriptionPolicy: "omit"` 时只显示名称和其他目录元数据，描述不得 fallback 到社区原文。

`curate` 是 `data/catalog-copy.json` 中的人工审核状态，不是客户端 wire policy；生成 `data/catalog.json` 时，已有经审核描述的 `curate` 条目投影为运行时 `show`，不把内部审核状态泄露给旧客户端或新客户端。

authoring 层可以额外保存：

- `source.kind`
- `source.hash`
- `source.approvedAt`
- `nameSource`
- `override`

构建 wire catalog 时只投影运行时字段，不能把内部审计字段发给客户端。

## 二、新皮肤/新增展示内容流程

每次新增皮肤或扩大展示覆盖范围，都按以下顺序执行：

1. **检查现状**
   - 按 `host/owner/repo/subpath` 判断是否已收录；
   - 对照 public registry、Ops registry、curation archive 和当前 display copy；
   - 不因为名称相似就把根包和 monorepo 子包合并。

2. **锁定固定可安装单元**
   - 固定 `install.commit`；
   - 读取实际 subpath 的 `package.json` 和 README；
   - 核对 `package`、`rowId`、`dsh.client`、loader、许可证、兼容版本和安装方式；
   - 根仓库没有 package 时，先从固定 commit 的 tree 找可安装子包。

3. **做来源适用性审查**
   - 优先使用固定 commit 的 README/package/subpath；
   - About、原始 registry description 只能作为候选来源；
   - 判断 `show`、`curate` 或 `omit`；
   - 根仓库集合描述、个人备注、标题级内容、发布日志、错抓字段和无法核验的内容不得直接作为市场描述。

4. **做名称审计**
   - 作者正式产品名优先；
   - README/package 的稳定产品名其次；
   - 没有产品名时，用仓库事实中能区分同类条目的具体特征；
   - package/repo/slug 是技术身份，不自动作为主标题；
   - `Claude Code` 保持原样；`Catppuccin` 保留专名；
   - 避免“DSH 外观”“开机动画”“主题库”这类只重复分类的标题。

5. **生成双语文案**
   - 英文来源必须生成真实中文；
   - 中文来源必须生成自然英文；
   - 描述从可核验能力开始，不重复市场已经知道的 DSH 背景；
   - 保留限定语、技术标识、协议、版本和路径；
   - 不把技术 jargon 直接当成用户友好的中文，必要时用短解释替代；
   - 不把 API key/token/密码、凭据变量名、凭据文件路径或认证地址写进展示名称和描述；只描述必要的凭据边界；
   - `omit` 条目不生成描述，也不 fallback。

6. **保存来源证据**
   - 为批准的有效来源保存 source hash；
   - 人工改名或人工整理的条目设置 `override: true`；
   - source 变化只触发 review，不自动覆盖人工文案；
   - 不能把 subagent 自报数量当完成证据，必须按 ID/index/count 程序化对账。

7. **生成与验证**
   - 串行运行 `npm run registry`；
   - 确认原始 `skins[]` 没有被展示层污染；
   - 运行 typecheck、测试、build、preflight 和 `git diff --check`；
   - 使用 `npm pack --json --ignore-scripts` 回读实际 tarball；
   - 只在用户授权时提交/推送/发布。

## 三、每日同步规则

- nightly ingestion 负责发现和更新自动来源；
- `catalog-copy-sync.mjs` 只比较 `github-about` source hash，生成私有 review queue；
- source hash 变化不等于允许重翻或覆盖；
- 有 manual override 时保留现有名称和中英文描述，只报告变化；
- 新仓库、新 subpath、新名称和双语文案必须经过上述固定 commit 审查；
- source-sync report、审计草稿和翻译中间文件不得写入公开 npm 包。

## 四、验收清单

- [ ] registry/catalog 中的原始 `skins[]` 未被展示层改写
- [ ] 每个 display copy ID 都能在 catalog 找到
- [ ] 名称没有把分类名当产品名
- [ ] `show/curate` 有真实 zh/en 描述
- [ ] `omit` 没有描述且不会 fallback
- [ ] source hash、override 和人工来源可回读
- [ ] 旧客户端仍能读取字符串 `skins[].description`
- [ ] tarball 中包含最终 display copy 和 runtime 逻辑
- [ ] Web 试用后再决定 commit、push 和 release
