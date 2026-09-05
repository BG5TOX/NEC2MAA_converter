# backups 目录说明（v0.5 终态，2026-09-05 收尾整理）

## 现行基线
- `preR21h_723_output_hashes.json` — **723 文件输出 hash 基线（v0.5 版）**。i18n-4 批重审定：全部文件因 CM 行 `by NEC2MAA v0.5.` + 告警英文化（B1）一次性全量变化；由 v0.5 代码重新生成，r21_taper_rebuild.js "723 全一致 0 漂移" 断言对拍对象。后续任何 M2N 输出格式变化须重新生成并同步 r21 断言。
- `preR21h_723_output_hashes.v04baseline.json` — **v0.4 基线存档**（v0.4 标记 + R21f 锥度语义快照，i18n 前最后状态）。

## i18n 批次快照（v0.5，2026-09-04/05）
| 文件（前缀 = 改动前状态） | 节点 |
|---|---|
| AGENTS.md.pre-i18n1 / index.html.pre-i18n1 / state.js.pre-i18n1 | i18n-1 基建前 |
| app.js.pre-i18n2 | i18n-2 屏显层前 |
| extract/convert/geometry/utils .pre-i18n3 | i18n-3 N2M 告警前 |
| maa-parser/maa-taper/maa-writer .pre-i18n4 | i18n-4 M2N 告警+版本标记前 |
| r21/sf1/sf2 .pre-i18n1 | 测试改造前（路径 v03/v04→v05 + 结构化断言） |
| *.i18n5fix（index/app/i18n/zh/en） | 修复轮 1：&nbsp; 残留 / 方向文案不跟随切换 / toggle 去重 |
| *.i18n6ui（index/css/app/i18n） | 修复轮 2：开屏按钮恢复 + .lang-btn 胶囊样式 + 位置优化 |
| *.i18n7wizhide（index/css） | 修复轮 3：开屏按钮入 wizardScreen（消除工作区两层叠加） |
| *.i18n8flag（index/css/i18n） | 修复轮 4：min-width 128px + 国旗徽章（纯 CSS gb/cn） |
| *.i18n9lh（css） | 修复轮 5：全局 line-height 归一（按钮定高 30/34px） |
| *.i18n10icon（index/css） | 修复轮 6：assets/ 资源夹 + 开屏卡片 ico 徽标替换 |

## R21 批次快照（v0.4 继承，有效序列）
| 文件 | 节点 |
|---|---|
| maa-parser.js.R21a / R21b / SF2 | $$$ 捕获实施 → R21 终态 parser → SF2（S4 悬空告警） |
| maa-taper.js.R21a / preR21c / R21c / R21f | 锥度模块初版 → R21c 前置 → R21c（中心合并）→ **R21f（终态，长度语义定案）** |
| maa-writer.js.R21b / R21g / SF2 | writer 集成 → v0.4 标记 → SF2（S3 净化+R1 门禁+R2 截断） |
| index.html.R21a / R21g / R21i / R21j | script 引入 → v0.4 徽标 → 副标题徽标 → 主标题右端（终态） |
| app.js.preR21g / R21g / R21h / R21j / preSfix / Sfix | readFileSmart 前 → 后 → 弹窗排版 → 徽标文本节点修复 → SF1 前 → SF1 后（M2/M3） |
| extract.js.R21h | 弹窗排版后 |
| utils.js.preSfix / Sfix | SF1 前 → SF1 后（S2） |
| geometry.js.preSfix / Sfix | SF1 前 → SF1 后（M1） |

注：`pre-X` 快照 = 各批次改动前状态（与前一节点终态相同文件），保留用于回滚链完整性。

## R21语义试错存档/（已推翻语义的中间态，仅供溯源）
- `maa-taper.js.R21d.bak`（全 L/2 半宽解读——被 R21e 推翻）
- `maa-taper.js.R21e.bak`（L1=半长解读——被 R21f 推翻）
- `preR21d/preR21e` 为其各自前置
- `preR21_723_output_hashes.v03marker.json`（v0.3 标记时代旧基线，v0.4 标记后失效）

## 语义收敛轨迹（R21c→R21d→R21e→R21f）
1. R21c：每对 L=每侧长度（A 解读）+ 中心节跨中心合并
2. R21d：全部 L=节总宽/每侧 L/2（B1 解读）——8EL6MW 判别证据支持
3. R21e：L1=中心节半长、其余每侧（用户第一次纠正）
4. **R21f（终案）**：L1=中心节整体长度、L2~L10=每侧长度（用户公式 jp2000 w10=5.10 定谳）

## SF1/SF2 快照
- SF1（安全）：utils（S2 键字面量化）/geometry（M1 预算 200,000）/app（M2 revoke+M3 TextDecoder）
- SF2（质量）：writer（S3 oneLine 净化+R1 有限值门禁+R2 标题 70 截断）/parser（S4 悬空告警）
- preSfix/preSF2 为改动前状态
