# 截图资产清理报告（2026-11-14）

- 生成时间：2026-11-16T12:35:33.228Z（本地 Mon Nov 16 2026 20:35:33 GMT+0800 (China Standard Time)）
- 生成命令：`node scripts/prune-unreferenced-screenshots.mjs --apply --report docs/asset-prune-2026-11-16.md --note recovery-20261114 downlist 28`
- 模式：--apply（已执行删除）

## 结论

- 删除 commit 目录：**7** 个
- 删除文件：**21** 个
- 释放逻辑字节：**3,036,842 B（2.90 MiB）**
- 清理后 commit 目录：281 个（870 文件 / 483.43 MiB）
- catalog 引用但缺失的目录：**0**（期望 0）
- catalog 引用但缺失的文件：**0**（期望 0）

## 判定规则

目录只有在以下两个条件同时满足时才可删除：

1. 目录路径 `site/public/skin-screenshots/<owner>/<40hex>/` 未被 `data/catalog.json` 中任何字符串引用
   （对 catalog 全量字符串扫描，覆盖 `listScreenshot`、`marketScreenshots`、`screenshots`、`media.list`、`media.screenshots` 等字段）。
2. 该 40hex commit 及相对路径 `skin-screenshots/<owner>/<40hex>` 未被任何 tracked 文本文件引用
   （`git grep -I -F` 扫描 tracked 文本文件，二进制图片自动跳过）。

## 清理前后统计

| 指标 | 清理前 | 清理后 |
| --- | --- | --- |
| commit 目录 | 288 | 281 |
| 文件 | 891 | 870 |
| 逻辑字节 | 509,948,772 B（486.33 MiB） | 506,911,930 B（483.43 MiB） |
| catalog 引用目录 | 278（缺失 0） | 278（缺失 0） |
| catalog 引用文件 | 827（缺失 0） | 827（缺失 0） |

- 磁盘上 commit 目录总数：288；其中 catalog 未引用：10 个
- catalog 未引用目录的合计：31 文件 / 4,007,433 B（3.82 MiB）
- tracked 文本引用保护：3 个目录（路径引用 3，仅 commit hash 引用 0）

## 已删除目标（前 20 个，按逻辑字节降序）

| # | 目录 | 文件数 | 逻辑字节 |
| --- | --- | --- | --- |
| 1 | `FOX4096__dsh-custom-css/69c0f7fe7f77b86aa57192abda5cf75c5263fc02` | 3 | 1,866,030 B（1.78 MiB） |
| 2 | `He2way__dsh-task-console/eacfe1cbdf5b9e06fa1d4d2e99a4083114a562fe` | 4 | 253,143 B（0.24 MiB） |
| 3 | `Juryorca__dsh-custom-theme-import/3a501cf063b288009cf62d2f9c04c3dd59a2e74f` | 3 | 203,099 B（0.19 MiB） |
| 4 | `SnoWinKK__dsh-web-skin/d5bbefba7668c51bd28b0d13a88593ffabfa4af3` | 3 | 202,187 B（0.19 MiB） |
| 5 | `yhPrime__dsh-theme-picker/d9b00d6c212187baa5590533afa1816a0119f11e` | 3 | 201,222 B（0.19 MiB） |
| 6 | `Sim-xia__dsh-vscode-theme/1e22fa74783f5f84e7ecb8d7b96fb2997dc9d4f8` | 3 | 199,941 B（0.19 MiB） |
| 7 | `loyalchiiina__dsh-todo-float-ball/693e16b8d3386a3d7b4a6ab12efe1a0b498823ba` | 2 | 111,220 B（0.11 MiB） |

全部删除目标合计：7 目录 / 21 文件 / 3,036,842 B（2.90 MiB）

## 保留的 catalog 未引用目录（tracked 文本引用保护）

共 3 个目录未删除：其中 3 个存在相对路径引用，0 个仅存在 commit hash 引用（catalog 上游图片 URL、skin-media manifest 源 URL、registry pin、docs、tests 等）。

引用来源（按目录计，一个目录可能有多个来源）：skin-media manifest 2 / docs 2

| 目录 | 文件数 | 逻辑字节 | 保护原因 |
| --- | --- | --- | --- |
| `Sutera-Diffusus__dsh-whale-musume/e6394df50539cbd143a5e838d4e9901d007be3de` | 4 | 533,780 B（0.51 MiB） | 相对路径引用 |
| `tianyhjg-lab__dsh-font/d299f56bde1e10e7fef152848e74cff2eecd7917` | 3 | 224,902 B（0.21 MiB） | 相对路径引用 |
| `tiantyu__dsh-skin-toggle/781fd4605756503f9635d6083686e079b5a8944f` | 3 | 211,909 B（0.20 MiB） | 相对路径引用 |

## 复跑与校验

```bash
node scripts/prune-unreferenced-screenshots.mjs            # dry-run（默认）
node scripts/prune-unreferenced-screenshots.mjs --apply    # 执行删除（不 git add / commit）
node scripts/prune-unreferenced-screenshots.mjs --verify   # 校验 catalog 引用完整性
```

本次校验：catalog 引用文件 827 个、目录 278 个；缺失文件 0、缺失目录 0。

删除后顺带清理的空 owner 目录：7 个。

Worktree 变更：`git status --short site/public/skin-screenshots` 共 21 行（删除仅存在于 worktree，未 `git add` / 未 commit）。

## 备注

- recovery-20261114 downlist 28

