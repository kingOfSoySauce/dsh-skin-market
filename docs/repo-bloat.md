# 仓库体积优化记录（2026-11-14）

本轮只处理两处体积来源：`data/catalog.json` 的生成格式，以及 `client/` 构建产物是否入库。
没有 commit/push，没有重写 git 历史，没有改动 `lib/` 的跟踪状态。

## 结论

- `data/catalog.json` 必须继续提交在 `main`：旧客户端从 raw URL 直接拉取，删掉会破坏已安装版本。
  本次只把输出改成紧凑 JSON，**不改变 wire 结构**（仍是 `schemaVersion: 1`，客户端 `JSON.parse` 即可）。
- 压缩后 raw 体积 5,439,638 → **4,336,088 字节（-20.3%）**；gzip 936,308 → **901,716 字节（-3.7%）**。
- `client/` 构建产物不再入库（`git rm -r --cached client` + `.gitignore` 的 `/client/`），
  工作区文件保留；发布包由 `prepack` 重新构建，因此 npm 包仍包含 `client/client.js`。
- 历史对象仍在：`client` 历史 379 个 blob ≈ 120.4 MiB、`data/catalog.json` 历史 291 个 blob ≈ 508.3 MiB
  （当前 `.git` ≈ 1.0 GiB）。不重写历史的前提下，本轮收益是**未来每次 catalog 同步/改动少写约 1.1 MB**。

## 为什么 catalog 不能取消跟踪

`src/catalog.ts` 里写死了旧客户端使用的地址：

```ts
export const REMOTE_CATALOG_URL = 'https://raw.githubusercontent.com/kingOfSoySauce/dsh-skin-market/main/data/catalog.json'
```

已发布客户端（以及仍在运行的 0.1.x 版本）启动时直接 GET `main/data/catalog.json`。只要还有旧客户端在跑，
这个路径就必须存在且能被旧读取器解析，因此不能像 `client/` 那样取消跟踪或改放 releases/Pages。

## 变更一：catalog 紧凑输出

`scripts/build-registry.mjs` 的写文件调用：

```js
// before
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)
// after
await writeFile(catalogPath, `${JSON.stringify(catalog)}\n`)
```

末尾换行保留（POSIX 文本习惯，gzip/传输差异可忽略）。`--check` 模式仍然不写文件。

| 指标 | 改前（pretty） | 改后（compact） | 变化 |
| --- | --- | --- | --- |
| 原始字节 | 5,439,638 | 4,336,088 | -1,103,550（-20.3%） |
| 行数 | 117,225 | 1 | — |
| gzip -9 | 936,308 | 901,716 | -34,592（-3.7%） |

- 数据量：`validated 1008 skins`；`generatedAt` 保持 `2026-11-14T13:40:34.540Z` 不变。
- 语义校验：改前/改后文件分别 `JSON.parse` 后内容深度相等（`JSON.stringify` 再比较）。
- 关于「≤4MB」目标：仅在写文件格式上压缩的极限是 4.34 MB（4.14 MiB），未达到十进制 4 MB。
  继续下降需要 wire 层去重（repo/截图 URL 等重复前缀）或目录格式升级，这会动到旧客户端解析契约，留作后续评估。

## 变更二：client 构建产物不再入库

- `client/` 下只有构建产物：`client.js`（591,486 B）和 `client.js.map`（786,813 B）；源码在 `src/client/`，
  由 `npm run build:client`（tsdown，`config/tsdown.config.ts` 的 `outDir: 'client'`）生成。
- 操作：`git rm -r --cached client`（保留工作区文件），`.gitignore` 增加 `/client/`。
- 效果：`git status` 中 `client/client.js`、`client/client.js.map` 为 staged deleted；工作区文件仍在且被忽略；
  `npm run build:client` 可随时重建（本次验证重建成功）。
- 历史中的 379 个 client blob（≈120.4 MiB）不会消失，但之后的 registry 同步/发布流程不再新增这类 blob。

### 发布与 CI 不依赖 tracked client

- `package.json` 的 `files` 仍包含 `client`；`prepack` = `npm run check` 会先跑 `build:client` 再打包。
  `npm pack --dry-run --ignore-scripts` 验证：`client/client.js` 与 `client/client.js.map` 仍在包内（`files` 优先于 .gitignore）。
- `.github/workflows/test.yml`：只跑 `npm run typecheck` 和 `npm test`；测试用 `src/` 源码与临时 fixture，不读 tracked `client/`。
- `.github/workflows/pages.yml`：`npm run registry` + `npm run media:build` + `npm run build:site`；站点 import 的是 `src/client/` 源码，不依赖 `client/client.js`。
- `.github/workflows/sync-catalog.yml` / `registry-pr.yml`：只跑 registry/contract 相关脚本，不构建客户端。
- `scripts/preflight.mjs` 需要 `client/client.js`，但它只在 `npm run check` / `prepack`（build 之后）运行，不属于测试/Pages 路径。

## 验证命令与结果（本轮）

| 命令 | 结果 |
| --- | --- |
| `node scripts/build-registry.mjs` | 0，validated 1008 skins，写出紧凑 catalog |
| `npm run registry:check` | 0，validated 1008 skins (catalog not written) |
| `npx vitest run tests/catalog.spec.ts tests/catalog-wire-reader.spec.ts` | 55 passed（2 files） |
| `npx vitest run tests/catalog.spec.ts`（停止跟踪 client 后） | 15 passed |
| `npm run build:client` | 0，重建 client.js 593,363 B + map 789,302 B |
| `node scripts/preflight.mjs` | package preflight passed |

## 后续建议（本轮不做）

1. **不重写历史、不 force push**：历史里的大 blob 不影响日常 checkout 大小之外的判断，重写会破坏协作与已发布 tag/客户端缓存。
2. 需要更小的新 clone 时，用 partial clone（`git clone --filter=blob:none`）或浅克隆；`git gc` 只回收不可达对象，不会缩小可达历史。
3. `data/catalog.json` 若还要继续瘦身，应先做 wire v2 设计（重复字符串字典化/分片），并保证旧 raw URL 继续返回旧格式；不要直接改现有 schema。
4. 任何把 catalog 移出 `main` 的方案，都必须保留 raw.githubusercontent.com 的 main 路径（或永久重定向），否则旧客户端目录刷新失败。
