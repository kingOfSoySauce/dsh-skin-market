# 截图资产清理报告（2026-11-14）

- 生成时间：2026-11-14T15:11:57.225Z（本地 Sat Nov 14 2026 23:11:57 GMT+0800 (China Standard Time)）
- 生成命令：`node scripts/prune-unreferenced-screenshots.mjs --apply --ignore-commit-refs --report docs/asset-prune-2026-11-14.md`（`--note` 参数从命令展示中省略，内容见文末「备注」）
- 模式：--apply（已执行删除）

## 结论

- 删除 commit 目录：**136** 个
- 删除文件：**380** 个
- 释放逻辑字节：**303,161,358 B（289.12 MiB）**
- 清理后 commit 目录：276 个（855 文件 / 453.01 MiB）
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
| commit 目录 | 412 | 276 |
| 文件 | 1235 | 855 |
| 逻辑字节 | 778,174,645 B（742.13 MiB） | 475,013,287 B（453.01 MiB） |
| catalog 引用目录 | 274（缺失 0） | 274（缺失 0） |
| catalog 引用文件 | 815（缺失 0） | 815（缺失 0） |

- 磁盘上 commit 目录总数：412；其中 catalog 未引用：138 个
- catalog 未引用目录的合计：387 文件 / 303,920,040 B（289.84 MiB）
- tracked 文本引用保护：路径引用 2 个目录（保留）；仅 commit hash 引用 114 个目录（按授权放宽删除）

## 已删除目标（前 20 个，按逻辑字节降序）

| # | 目录 | 文件数 | 逻辑字节 |
| --- | --- | --- | --- |
| 1 | `d-dev0101__open-sea-skin/2437d80a96de4124c54fbe89872fa7090103f025` | 5 | 35,415,126 B（33.77 MiB） |
| 2 | `CAPTAIN1275__dsh-ui-web/4a275b080cb6ff1a1a7a91a77e08aad6ad1eab56` | 14 | 22,735,382 B（21.68 MiB） |
| 3 | `LilycleHeart__liuli-theme/776d01d0fbcda91922af2ffda9f213ff400023b5` | 5 | 16,105,458 B（15.36 MiB） |
| 4 | `lyq3__dsh-skin-nebula/57b9f7ff42faf9e71e038fb4f7c1826804eb47c7` | 6 | 12,930,916 B（12.33 MiB） |
| 5 | `kingOfSoySauce__dsh-elon-skin/bccc746872cf8caa4005c9b144bcd1497717537a` | 3 | 8,384,912 B（8.00 MiB） |
| 6 | `cjz-wr__background-plugin/1d3a6d063992cc74c60e03d65202d6615ab73ec4` | 3 | 8,313,784 B（7.93 MiB） |
| 7 | `Rainpomelo__deepseek-harness-liquid-glass-theme/0f7f8dfffdcd06e1b8f9d5e5361cd806de9c9912` | 4 | 8,057,049 B（7.68 MiB） |
| 8 | `tpmoonchefryan__dsh-joi-channel-theme/3c12a2706759104a94b51013d19bb3e9c3f2bef1` | 6 | 7,559,964 B（7.21 MiB） |
| 9 | `tpmoonchefryan__dsh-joi-channel-theme/8eb1379dd04f18592f7ae6b833d1890f57e26f24` | 6 | 7,559,964 B（7.21 MiB） |
| 10 | `gooosie__dsh-whale-bg/2746a7eacba5c0dde28e29d00b6b15f1f2894164` | 1 | 7,091,228 B（6.76 MiB） |
| 11 | `H-table__dsh-bg-tool/409445faed5f594e646228d5c28d659998cbb1d5` | 5 | 6,724,941 B（6.41 MiB） |
| 12 | `Ayase34__gal-view/d002fe0e7051c618a2665af3c653f9838cd6aa8a` | 1 | 6,318,823 B（6.03 MiB） |
| 13 | `elysia395__dsh-wallpaper-engine/86ce2f776021dee409294f8c44fab918e4703aa7` | 4 | 5,934,486 B（5.66 MiB） |
| 14 | `SoDaZilla-zzz__dsh-liquid-glass-balance-card/3fbca87bf6d68af66f1669c592bae1e6e6ab4463` | 2 | 5,238,907 B（5.00 MiB） |
| 15 | `Nagi-ovo__dsh-ads/3a2ba704bc383099c686d3288ff6e0d61fc391e5` | 6 | 5,071,124 B（4.84 MiB） |
| 16 | `StarryHui__dsh-custom-background/f20300f49ee95fef949c5d55e6a6bbd62c5d692d` | 2 | 4,931,409 B（4.70 MiB） |
| 17 | `bblike__dsh-plugin-odette/e8014e7b32daa8b23b2847d75e05f16ee4263ae9` | 1 | 4,678,789 B（4.46 MiB） |
| 18 | `lengduan__dsh-815-skin/5b0c843b8fb0e3e4a0a223209fb8768d3cd3275d` | 2 | 4,517,940 B（4.31 MiB） |
| 19 | `webkubor__dsh-bloom-theme/9fa79ccea3c95703e9d928c768e433e3b01eb448` | 6 | 4,189,508 B（4.00 MiB） |
| 20 | `niiang__dsh-kimino-theme/0a17159ecc9cf61834bac3265f5c8dab333431e9` | 3 | 4,134,126 B（3.94 MiB） |

全部删除目标合计：136 目录 / 380 文件 / 303,161,358 B（289.12 MiB）

## 保留的 catalog 未引用目录（相对路径引用保护）

本次按明确授权使用 `--ignore-commit-refs`：仅"commit hash 出现在 tracked 文本"不再作为保留条件；目录相对路径/其中文件路径被 tracked 文本引用的 2 个目录仍然保留。

| 目录 | 文件数 | 逻辑字节 | 真实路径引用来源 |
| --- | --- | --- | --- |
| `Sutera-Diffusus__dsh-whale-musume/e6394df50539cbd143a5e838d4e9901d007be3de` | 4 | 533,780 B（0.51 MiB） | docs |
| `tianyhjg-lab__dsh-font/d299f56bde1e10e7fef152848e74cff2eecd7917` | 3 | 224,902 B（0.21 MiB） | skin-media manifest |

另有 114 个仅被 commit hash 引用的目录已按授权放宽删除（309 文件 / 262,069,988 B（249.93 MiB））。

## 复跑与校验

```bash
node scripts/prune-unreferenced-screenshots.mjs            # dry-run（默认）
node scripts/prune-unreferenced-screenshots.mjs --apply    # 执行删除（不 git add / commit）
node scripts/prune-unreferenced-screenshots.mjs --verify   # 校验 catalog 引用完整性
```

本次校验：catalog 引用文件 815 个、目录 274 个；缺失文件 0、缺失目录 0。

删除后顺带清理的空 owner 目录：124 个。

Worktree 变更：`git status --short site/public/skin-screenshots` 共 380 行（删除仅存在于 worktree，未 `git add` / 未 commit）。

## 备注

- 本次删除依据 lead 于 2026-11-14 晚的明确授权（A/宽）：仅放宽「commit hash 出现在 tracked 文本」这一项；任何目录的完整相对路径或其中文件路径仍出现在 tracked 文本/docs 的必须保留。实测被真实路径引用保护 2 个目录：Sutera-Diffusus__dsh-whale-musume/e6394df50539cbd143a5e838d4e9901d007be3de（docs/recently-added.md 图片路径）与 tianyhjg-lab__dsh-font/d299f56bde1e10e7fef152848e74cff2eecd7917（site/public/skin-media/v1/manifest.json 源路径）。其余 114 个仅被 commit hash 引用（catalog 上游 raw.githubusercontent 图片 URL、manifest 源 URL、registry install pin、docs 历史记录、tests fixture）的目录已按授权删除。对 136 个待删目录的 380 个文件路径另做 git grep 校验，命中 0。
- 审计估计 154 个 commit 目录 / 425 文件 / 418.6MB 与本次实测不一致：按当前 data/catalog.json 全量字符串引用，catalog 未引用目录为 138 个 / 387 文件 / 303,920,040 B（289.84 MiB）；其中 136 个已删除、2 个因真实路径引用保留。差额可能来自审计时点之后的 catalog pin 更新（当前 15 个 skin 保留 2 个 commit 目录）；以本次可复跑脚本的实测为准。
- 本地 ignored 构建产物 dist-site/（923 MiB / 945,336 KiB）已在本次操作中 rm -rf 删除；脚本不处理该目录，其他 ignored 目录未改动。
- 过程说明：先按严格门禁试删 22 个目录（39.19 MiB），收到授权 A 后立即 `git checkout -- site/public/skin-screenshots` 还原 worktree，再以 `--ignore-commit-refs` 一次性删除 136 个目录；最终 worktree 变更等价于单次授权删除，全程未产生 commit。
- 抽查（2026-11-14T23:1x）：`du -sh site/public/skin-screenshots` 由 745M 降至 455M（磁盘占用）；`git diff --name-only --diff-filter=D -- site/public/skin-screenshots` 共 380 个删除，全部停留在 worktree（未 `git add`、未 commit）；`site/public/skin-media` 未变更（140M，`git status --short` 0 行）。

