# 市场 v2 架构：来源审核 + 发行观测 + 安装期解析

状态：草案（2026-11-14）
范围：公开仓插件、目录数据、构建脚本；ops 侧审批/发布契约见私有 ops 仓。

## 1. 要解决的问题

当前目录把四件事绑在同一个 40 位 commit 上：

1. **身份**：这条目是谁（repo/subpath/package/author）
2. **审核**：我们批准了什么（license、范围、安全基线、展示证据）
3. **安装物**：用户实际装哪棵树（`github:owner/repo#<40hex>` 或 npm 精确版本）
4. **证据**：决策所依据的文件/截图快照

后果：作者每发一个版本，pin 变化 → 审核证据、capture recipe、文案、发布决策全部失效；目录、截图、health.scan、blocker 全部按 pin 复制。市场从“审商品”退化成“审每一棵树”。

历史数据：2,435 个不同 pin、2,474 次 pin 变更；1,008 条里 320 条换过不只一个 pin；审批台 3 天 1,050 条决策、队列 1,932 个候选。逐 pin 人审不可持续。

## 2. 决策

把“审核对象”和“安装解析结果”拆开：

| 层 | 内容 | 维护方式 |
| --- | --- | --- |
| 来源登记 | repo/subpath/package、作者、license、范围、安全基线、sourceHash | 人审一次；只有风险事件重审 |
| 发行观测（release ledger） | 版本、commit、integrity、manifest/patch hash、扫描、能力 diff、宿主兼容 | 全自动，可追加 |
| 目录条目 | 身份 + 展示字段 + 安装策略（npm range / GitHub release / 快照兜底） | 构建生成 |
| 本机安装记录 | 实际解析到的版本/commit/integrity、lockfile | 客户端写入 |

原则：

- **决策哈希只绑来源身份**（`sourceHash`），发行版本用独立的 `releaseHash` 做证据新鲜度。patch/minor 不再让人工决策失效。
- **安装期解析**：客户端从发行观测解析目标，再以精确版本交给宿主；lockfile 仍然保存精确工件，可复现性不丢，只是位置从目录移到用户本机。
- **目录 v1 继续保留精确 install 字段**，供旧客户端使用；新字段只放顶层 sidecar。没有 flag day。
- **强制重审的触发条件**：repo 转移/换 owner、换维护者、license 变化、包名变化、新增 install hook/依赖/网络或 exec 能力、major 版本、loader/patch 身份变化、二进制资产。

## 3. 兼容契约（硬约束）

已核对历史发布包（用各版本自带的 `validateCatalog` 直接跑当前 `data/catalog.json`）：

| 客户端版本 | 对本变更前的目录 | 对本变更后的目录 | 说明 |
| --- | --- | --- | --- |
| 0.1.69 / 0.1.70 | OK | **OK，1,008 条全部通过** | 未知顶层 `installPolicies` 被忽略；这是当前实际可用的兼容基线 |
| 0.1.49 / 0.1.40 | FAIL | FAIL | 在本变更**之前**就已失败：当前目录有 fork 共用同一 rowId（`duplicate rowId: music`），不是本次引入 |
| 0.1.17 | FAIL | FAIL | 在本变更前就已失败：当前目录已有更新的 per-entry 字段（`additional properties`） |

结论：兼容基线按 **0.1.69+** 执行；更早版本早已无法接收当前目录，不应作为本次回归目标。发布前用 0.1.69/0.1.70 的 `package/lib/catalog.js` 对新 `data/catalog.json` 跑一次 `validateCatalog`（只需把旧包解压到临时目录并把 `node_modules` 指向本仓）。

因此新目录必须满足：

1. `schemaVersion === 1`。
2. `skins[]` 的每个条目仍然通过**冻结的 v1 skin schema**；不得新增 per-entry 字段（旧 schema `additionalProperties: false`）。
3. `install.target/version/commit/rowId` 对旧客户端保持现状语义：target 必须等于 `github:repo#commit[&path:/sub]`。
4. 新数据只允许放**顶层可选 sidecar**；旧客户端会忽略未知顶层键。
5. 新客户端必须能读**没有 sidecar 的旧目录**，并且行为与旧客户端一致。
6. sidecar 变化必须改变 `generatedAt`（旧客户端用时间戳判断缓存是否更新）。

新增 CI 测试 `tests/catalog-compat.spec.ts` 固定这些不变量；`registry:check` 继续验证 v1 条目的 target/rowId/重复键。

## 4. 第一块落地：安装策略 sidecar

顶层字段：

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-14T...",
  "skins": [ ... ],
  "installPolicies": {
    "owner.repo": {
      "schema": "install-policy-v1",
      "mode": "npm",
      "package": "dsh-foo",
      "range": "^1.2.0",
      "resolved": {
        "version": "1.4.2",
        "commit": "<40hex>",
        "integrity": "sha512-...",
        "gitHead": "<40hex>",
        "observedAt": "2026-11-14T..."
      }
    }
  }
}
```

- `mode`：`npm` 或 `github`。npm 必须有 integrity；github 可以只给 commit。
- `range`：可选；给出时必须满足 `resolved.version`。
- `resolved` 是机器观测到的**可安装精确工件**，不是审核结论。
- 解析规则（`src/install-policy.ts`）：仅当 `DSH_SKIN_MARKET_INSTALL_POLICY=1` 时，把 policy 覆盖到目录条目的 install 字段；否则完全走旧路径。
- 解析后仍然产出精确 `version/commit/integrity`，后续安装、校验、Desktop managed 全部沿用现有精确逻辑，不改变宿主接口。
- 有 companions、或 policy 与包名/repo 不一致、或 integrity 缺失时，**跳过该条并回退到目录原值**，绝不半应用。

数据来源：`data/install-policies.json`（可选，ops 机器维护）。缺失时目录不产生 sidecar，行为与今天一致。首批只种下已有 npm 来源的条目；GitHub-only 条目的 release tag/默认分支解析在下一阶段接入。

## 5. rowId 迁移

状态（2026-11-14）：**客户端侧第一刀已落地**。目录 `rowId` 仍是 wire 必填字段（旧客户端需要），但新客户端在 lifecycle 加载目录、安装预热完成、以及 reset 时都会用已安装包的主 loader id 覆盖目录提示值；上传中的 prefetch 不再因 hint 漂移拒绝安装，而是安装后采用实际 id。ops 侧 evidenceHash / capture / recipe 去 rowId 仍在下一批。

目标：目录 `rowId` 从必填身份降级为提示值；客户端以已安装包 `cordis.patch.yml` 的主 loader 行为准。

兼容要求：

- 旧客户端仍会自动获得 best-effort `rowId`；**不得先删字段**，否则旧客户端会拒绝整份目录更新并停在旧缓存。
- 新客户端：目录 rowId 与包内不一致时只记 warning；激活/冲突检查用包内解析出的实际 row id；插件注册、override、reset、receipt 的调用点全部改传实际 id。
- evidenceHash 去掉 rowId；ops 侧 admission-capture/recipe/policy/merge/promote 的绑定键同步迁移。
- 达到旧客户端采用率阈值后再升 `schemaVersion` 并停写。

## 6. 阶段

- **P0（本次）**：兼容契约 + `installPolicies` sidecar 读写 + 解析器（默认关闭）+ 兼容测试 + 审计文档。
- **P1**：ops 开始写 `data/install-policies.json`；客户端灰度打开 flag；更新校验从“等于目录版本”切到“等于解析版本”。
- **P2**：来源审核/发行账本拆分；决策 hash 换 sourceHash；已收录条目的更新执行器。
- **P3**：rowId 运行时解析；停写 pin；资产按内容寻址；schemaVersion 2。

## 7. 风险

- 旧客户端只认 v1：任何 per-entry 字段/语义变化都会让它拒绝新目录；所以 sidecar 只能放顶层。
- 解析后的版本没有经过人工审核：必须由发行账本的自动门禁（SRI、manifest/patch diff、能力 diff、扫描、宿主矩阵）兜底；高风险变化强制重审。
- Desktop managed 只接受精确 `name@version`：客户端必须先解析，再传精确版本。
- 回退：解析器按 flag 可整体关闭；`installPolicies` 可整体移除而不影响 v1 条目。
