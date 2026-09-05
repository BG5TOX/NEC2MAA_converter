# NEC2MAA_converter_v05 — AGENTS.md

> **v05 = v04 + i18n（英文界面 + 中英文运行时切换，2026-09-05 发布 v0.5 终态）。**
> v0.5 决策（用户批复 2026-09-04）：**D1=B1**（UI 跟随语言，输出文件恒英文 LF()）／**D2=toggle 按钮**（简体中文↔English）／**D3=默认简体中文**（localStorage 记忆恢复）／**D4=版本标记升 v0.5**（含 723 hash 基线一次性重审定）。方案文档：`docs/v0.5英文界面与中英文切换_可行性评估与实施方案.md`。
> 发布后经 6 轮用户验收修正（i18n5fix–i18n10icon，见 §6）；v0.5 归档见 `docs/发布归档_v0.5.md`。
> v04 = v03 + R21 锥度振子重建（2026-09-03 发布 v0.4）+ 安全审计闭环（SF1/SF2）。NEC↔MMANA-GAL 双向转换工具。双击 index.html 即用（file:// 协议，经典脚本 + N2M 全局命名空间，禁 ES modules/npm/构建链）。
> 历史实施细节见 `docs/开发历史日志.md`；v03/v0.4 归档见 `docs/发布归档_v0.3/4.md`；已完成的方案/评估类文档见 `docs/archive/`（含 README）。

## 0. v0.5 i18n 架构与契约（i18n-1..4 已实施）

- **机制/数据分离**：`js/i18n.js` 只含机制（`L(key,params)` 屏显视图/`LF(key,params)` 恒英文输出文件视图/`applyI18n()`/`setLang()`/`toggleLang()`/`initLang()`/注册表 `window.N2M_LANG` 自发现）；**全部文案在独立语言包 `js/i18n/zh.js` + `js/i18n/en.js`**（纯数据 JS：meta/terms/ui/warn 四段；file:// 禁 fetch JSON 的结构性约束）。
- **新增语言步骤**（机制零改动）：复制 `js/i18n/en.js` → 改 meta + 翻译 → index.html 加一行 `<script src="js/i18n/<code>.js">` → 完成；`tests/i18n_lang.js` 自动扫描纳入校验。翻译不全可运行（回退链 当前→en→zh，缺键 console.warn 返回键名）。
- **语言包编辑**：直接改字符串值，Ctrl+F5 强刷生效；句子内 `{{terms.x}}` 引用术语（改一处术语引用句自动同步）；`{name}` 插值参数名跨语言必须一致（测试断言）。
- **告警双视图（B1 核心）**：所有转换告警为结构化条目 `{key, params}`（不再是中文字符串）——屏显 `alert(L(...))` 跟随语言；写入输出文件（.maa Warnings 区 / .nec CM 摘要）恒英文 `LF(...)`。zh 语言包键值与 v0.4 原中文告警**逐字一致**（m2/m4 断言验证渲染语义不变）。
- **UI 纪律延续**：`applyI18n()` 对 workTitle 特判走 `firstChild.textContent`（R21j 徽标保留）；切换语言不触碰 display 属性；select option 仅改 textContent 保 value；`<html lang>` 随 meta.htmlLang 同步；toggle 按钮经 `.lang-toggle` 批量刷新——**显示目标语言的国旗徽章+名称**（zh 态→🇬🇧 English，en 态→🇨🇳 简体中文；徽章为纯 CSS 双色圆 `.flag.gb/.flag.cn`，`TARGET_FLAG` 映射表在 i18n.js，加语言须补一行）；**applyI18n 同步刷新方向相关动态文案**（导入/下载按钮、输入区占位符——与 setDirection 同源同键按 state.direction 派生，两处赋值恒一致）。
- **加载顺序**：state → **i18n.js → i18n/zh.js → i18n/en.js** → utils → geometry → extract → maa2nec → convert → app（语言包无依赖任意顺序安全，须在 DOMContentLoaded 前就位）。
- **hash 基线重审定**：i18n-4 批 723 文件全量重生成（CM 行 `by NEC2MAA v0.5.` + 告警英文）——旧 v0.4 基线存档 `backups/preR21h_723_output_hashes.v04baseline.json`，现行基线仍为 `preR21h_723_output_hashes.json`（723 文件，含 20 库锥度 + jp2000）。

## 1. 工程结构

```
NEC2MAA_converter_v05/
├── index.html          # 双屏: wizardScreen(两卡, 4nec2/MMANA.ico 徽标) ↔ workScreen; N2M/M2N 双参数面板; data-i18n 标注
├── assets/             # v0.5 资源夹: 4nec2.ico / MMANA.ico (开屏卡片软件徽标)
├── css/style.css       # v0.5 增: .lang-btn(胶囊 30px 定高/min-width 128) + .flag 徽章 + .wiz-logo 40px + 全局 line-height 归一
├── js/
│   ├── state.js        # N2M 命名空间 + state(+lang) + $(id)
│   ├── i18n.js         # v0.5 新建: i18n 机制 (L/LF/applyI18n/setLang/toggle/init/注册表自发现/方向文案刷新/TARGET_FLAG)
│   ├── i18n/           # v0.5 新建: 独立语言包 (纯数据 JS; NBSP 为真实字符非 &nbsp; 实体)
│   │   ├── zh.js       #   简体中文 (键集基准, 191 词条; values 与 v0.4 原句逐字一致)
│   │   └── en.js       #   English (键集与 zh 完全对齐)
│   ├── utils.js        # evalExpr/parseGsScale/segToDesignator/formatNum/hasChinese/removeChinese (告警→结构化条目)
│   ├── geometry.js     # collectWires (GW/GX/GM; GM 告警→结构化条目)
│   ├── extract.js      # NEC 解析 (CM/SY/FR/GN/GS/EX/LD; 告警→结构化条目+L()/LF() 双视图)
│   ├── maa2nec/
│   │   ├── maa-parser.js   # .maa 解析: 双变体/单星节头/形态判别(防 CP1251 变码)/titleAscii 门禁/$$$ 锥度捕获(R21); warnings→结构化条目
│   │   ├── maa-taper.js    # R21: expandTaperedWires 锥度重建 (R21f 长度语义/中心节跨中心合并/哨兵裁断/零长跳过); 告警→结构化条目
│   │   ├── maa-symbols.js  # 半径→Dn 符号/负载逐参/一卡一参
│   │   └── maa-writer.js  # NEC 输出: CM 头(v0.5)/GW/EX 百分比锚+锥度锚点重映射(R21)/LD 表达式/GN/FR + ASCII 终检; R1 告警→LF() 英文
│   ├── convert.js      # N2M 输出编排 (告警→L()/LF() 双视图)
│   └── app.js          # 事件绑定/双屏切换/M2N 面板/地面预设/readFileSmart(R21g)/弹窗排版(R21h)/i18n 初始化+toggle 绑定
├── tests/              # 活跃回归 17 个 (16 旧 + i18n_lang 新); archive/ 10 个已归档+README
├── backups/            # 批次 .bak 快照 (v04 R21/SF + v05 i18n1-4 + 修复轮 i18n5-10) + hash 基线×2 + README
└── docs/               # 格式文档×2 / 发布归档 v0.3–v0.5 / 开发历史日志 / i18n 方案 / 安全审计 / Ground.txt
```

加载顺序：state → **i18n → 语言包** → utils → geometry → extract → maa2nec（parser → **taper** → symbols → writer）→ convert → app。调用方向禁止反向。

**toggle 按钮布局（v0.5 终态）**：开屏一个（wizardScreen **内部**首子元素——随屏隐藏不残留叠加，绝对定位于 container 右上角）；工作区一个（顶栏返回按钮**上方**，margin-bottom 10px 间距）。两按钮同一 `toggleLang` 事件。

## 2. 核心行为契约（现行，改动须过回归）

### N2M (4NEC2 → MMANA)
- G/H 行输出：`{g_ground}, {add_height}, {ant_material}, {r_imp}, {az}, {el}, {x_imp}`——字段2=H 附加高度、字段3=M 材料序号(0-6)，材料/高度与地面类型无关不禁用
- 标题双模式（文件名 `Converted from <name>.<ext>` / CM 拼接）；currentFileName 保留扩展名；下载命名 `<基名>_converted.<ext>`
- EX 6 电流源/E 锚方向/大偏移收敛/GN2→降级告警 等告警序列逐字保持 v02 契约

### M2N (MMANA → 4NEC2)
- **R21 锥度振子重建（v04 核心，默认开启无控制项）**：`$$$` 区（英文 `Taper wire set` / 俄文变码标签，只认 `$$$` 前缀）捕获锥度组合定义 `{负半径名, Type, L/R 对…至 10 对}`；负半径导线按定义重建为多根首尾相连不同半径 GW 子段。**单位=米**（存盘统一；"R(mm)" 为 UI 语义）；**Type 文件存 0–3 = UI 编号−1**：0/2=中心向两端（对称）、1/3=起点向末端（顺序）；**R21f 对称型长度最终语义（用户给出公式裁决：jp2000 w10 = 尾1.03+L2 0.52+L1 2.0+L2 0.52+尾1.03 = 5.10 ✓）：L1=中心节整体长度（跨中心单段 `[c−L1/2, c+L1/2]`），L2~L10=细锥度节每侧长度，尾对到端点；L1/2 超半长时中心节截到整根**；中心节不拆分——馈电锚 `w?c` 落其内部 50%（jp2000: `EX 0, 26, 50%`）；尾对 `L≥99999` 哨兵延伸至线端点；未定义锥度名→fallback 1mm+告警；零长子段跳过。锚点重映射：b/c/e→原线弧长→子段定位（边界→后继子段段号 1，内部→局部百分比如 43.2%）；未锥度文件路径**字节不变**（723 文件 hash 红线：702 不变+20 库锥度文件+jp2000 允许变化）。涉及 maa-parser.js（$$$ 捕获→parsed.taperDefs）、maa-taper.js（新建，expandTaperedWires+R21c 中心合并+R21f 长度语义）、maa-writer.js（rebuilt 接入+锚点重映射+`CM Tapered wires:` 行+汇总提示）、index.html（script 引入）
- CM 区：首条 = .maa 原标题（titleAscii 门禁 `^[\x20-\x7E]*$`，非英文/控制字符阻断进 Dropped 聚合卡）；次条 `CM Converted from <file> by NEC2MAA v0.4.` (+override 仅自定义/原标题模式)；CE 前注释英文摘要 ≤70 字符
- GW：段 1（勾选强制分段→ceil(len·ρ/λ)，ρ 默认 25）；半径 `0.5*Dn`；z `z+h`；EX 百分比锚（c→50%/b→1/e→100%，偏移>1 收敛+告警）
- 地面：真实地(2/-1) 默认 Average 预设（σ=5 mS/m, εr=13，applyRealGroundDefault 统一三处调用）；自由空间→σ/εr 禁用+清空+预设组隐藏；自定义未填全拦截；GN 映射 2→`GN 0,…`、-1→`GN 2,…`、1→`GN 1`
- 文件读入：**readFileSmart 编码探测（R21g）**——纯 ASCII 直读；UTF-8 试解含 U+FFFD → TextDecoder('windows-1251') 重解码（CP1251 俄文 .maa 节头恢复真西里尔，parser 俄文关键词精确命中）；文件选择与拖放两路径
- 弹窗多条提示排版（R21h）：编号 + 空行分隔 `N. <提示>`，共 8 处（app.js×2 + extract.js×6）
- 输出强制纯 ASCII（writer 终检断言；非英文标题/注释丢弃+聚合警告）

### UI 纪律
- 显隐切换必须显式设目标值（'flex'/'none'），禁空串复位（wizardScreen 内联 flex 陷阱）
- app.js 触碰 UI 状态的函数（setDirection/backToWizard 等）新增字段必须同步复位函数

## 3. 风险列表与待办

完整审计记录：`docs/安全审计与内存风险清单.md`（2026-09-03 S1 初版 + **v0.4 复核版**——含 R21 新代码面增量审计）

| # | 风险 | 级别 | 状态 |
|---|---|---|---|
| S1 | evalExpr new Function 求值面（大写化隐性沙箱，重构须保留） | LOW | 接受·已文档化 |
| S2 | evalExpr 符号键正则元字符崩溃 | MED | **已修复 SF1** |
| S3 | writer CM 卡换行注入面 | MED 契约 | **已修复 SF2** |
| S4 | `$$$` 计数行悬空无告警 | LOW | **已修复 SF2** |
| M1 | GM NRPT 资源放大（总量预算 200,000） | MED | **已修复 SF1** |
| M2 | createObjectURL 不 revoke | LOW | **已修复 SF1** |
| M3 | readFileSmart ASCII 路径栈溢出 | MED | **已修复 SF1** |
| R1 | NaN/Infinity 传播无门禁（含锥度子段；零/下溢半径提示） | LOW | **已修复 SF2** |
| R2 | CM 标题卡无 70 字符截断 | LOW | **已修复 SF2** |
| I1 | 无 CSP meta（仅未来 Web 宿主时需补） | INFO | 备查 |

**审计可修复项全部闭环（SF1+SF2 共 8 项；S1 接受、I1 备查）。**

- **P0：T5 4NEC2 实测**——`50%`/`100%`/`1` 段号解析、`0.5*D1`/`z+h`/`2*PI*f*L1*1E-6/Q1` 表达式求值、SY 一卡一参多卡连续性；**R21 新增**：锥度锚点子段内部百分比（如 43.2%）、子段边界整数段号（"tag, 1" 复合段字段）、多段相连 GW 台阶半径的 4NEC2 几何/电流连续性表现；`100%` 不识别则改 `99%` 兜底
- 次级：M6 双跑回归（可选加固）；安全审计已闭环（SF1+SF2 八项修复，见 docs/安全审计与内存风险清单.md）

## 4. 工作规则

1. v05 项目内只允许写 `NEC2MAA_converter_v05/`；v04/v03/v02/v01/备份只读（v04 已归档为发布基线）
2. 每批次 1–2 步，做完停等确认；改动前备份到 `backups/`（`<file>.R<n>.bak` 或 `<file>.日期_批次.bak`）
3. 测试脚本入 `tests/`（硬编码绝对路径，重跑注意）；被取代/过时的测试移入 `tests/archive/` 并更新其 README
4. 行为变化即失败——改动须跑相关回归套件全绿后才算完成；M2N 输出有 723 文件 hash 基线（`backups/preR21h_723_output_hashes.json`，**v0.5 快照**=v0.5 CM 行+英文告警；旧 v0.4 基线存档 `.v04baseline.json`；任何输出格式变化须重新审定基线并在 r21 断言同步）
5. **【禁令】严禁通过 PowerShell 修改本项目任何文件**——包括但不限于 `Get-Content`/`Set-Content`/`Out-File`/`Add-Content`/重定向 `>`/`>>` 及一切 PowerShell 文本管道改写。历史事故两次实证：R21g 一次全损（CP1251/UTF-8 编码陷阱）、v0.5 i18n 批一次测试文件成批乱码（同根因：Windows PowerShell 5.1 文本管线按系统 ANSI 代码页静默转码 UTF-8 中文文件）。**文件读写一律用 edit 工具（精确字符串替换，编码无损）；批量程序化改写一律用 Node `fs.readFileSync/writeFileSync`（显式 utf8，编码受控）**。PowerShell 仅允许用于：目录/文件管理（New-Item/Copy-Item/Move-Item/Remove-Item 等二进制安全操作）与命令执行（node/git），不触碰文件内容。
6. **改告警文案 = 改语言包 zh.js/en.js 两处同步**，键集/插值占位符跑 `node tests/i18n_lang.js` 自检；新增 UI 文案同步加 data-i18n 属性与词条；语言包内空白间隔用真实 NBSP 字符（U+00A0），**禁用 `&nbsp;` HTML 实体**（textContent 渲染为字面量）
7. **双 README 同步维护**：`README.md`（中文）与 `README.en.md`（英文）为并列镜像文档——**任何功能/版本/结构变更须两文件同步更新**（章节结构、数据、表格一一对应，顶部互链）；本项目以 **MIT License** 发布（根目录 LICENSE 标准文本，改协议须先经用户批复）

## 5. 测试集（2026-09-04 v0.5 发布后）

活跃 17 个（全绿）：
- **基础层**：m2_state_utils / m3_geometry / m4_extract / m5_convert_app（N2M 端到端）
- **M2N 核心**：r2_t2t3_writer（writer 契约+全库 722 冒烟+ASCII）
- **UI/流程**：r5b_backfix2（wizard flex 往返）/ r9_six_items（文件名/标题契约）
- **功能契约**：r11_manual_ground（G/H 行+材料+拦截）/ r14_seg_params（分段）/ r16_layout_firstentry（布局+首进禁用）/ r17_note_bottom（提醒框）/ r19_title_cm（标题→首条 CM，v0.5 版本行断言）/ r20_avg_ground_default（Average 地面默认）
- **R21 锥度**：r21_taper_rebuild（jp2000 金标准 10→56（R21f）+ w10 用户公式 + 8EL6MW/4EL20HM/dx415tt 类型映射 + 边角矩阵 + 端到端输出 + **v0.5 基线 0 漂移** + 21 锥度文件清单固化）
- **SF1 安全修复**：sf1_security_fixes（M3 TextDecoder / S2 键字面量化 / M2 revoke / M1 GM 预算）
- **SF2 质量修复**：sf2_quality_fixes（S3 CM 单行净化 / R1 有限值门禁（英文 throw 断言）/ R2 标题 70 截断 / S4 $$$ 悬空告警 + VDP40B/jp2000 回归）
- **i18n（v0.5 新增）**：i18n_lang（目录扫描语言包：注册/meta/键集对齐 191 词条/插值占位符一致/terms 引用有效/语法预检/L·LF 渲染/回退链/setLang）

运行：`node tests/<script>.js`（依赖 C:\MMANA-GALBasic3\ANT 官方 722 文件库、F:\Antenna_Models 的 W8BYA.nec、F:\Antenna\jp2000_147.maa；i18n_lang 独立可跑无外部依赖）。
已归档 10 个 + README 见 `tests/archive/`。

**v0.5 测试同步说明**：各测试 src 拼接均已加入 state+i18n+语言包（+maa-taper 修复 v04 遗留缺链）；结构化告警断言改 `{key, params}` 判定（注明"i18n-N 批次同步"）；r2 俄文节头 EX 断言修正为 R21 真实行为（v04 测试因指向 v03 js 而失真——已修正指向）。

## 6. 当前状态

- 2026-09-05（v0.5 收尾终态）：**6 轮用户验收修正（i18n5fix–i18n10icon）+ 文档/备份收尾**——
  - **i18n5fix**：语言包 `&nbsp;` 实体→真实 NBSP 字符（textContent 渲染修复）；applyI18n 增方向相关动态文案刷新（M2N 占位符/导入/下载按钮随语言切换）；toggle 按钮去重（暂留工作区一个）
  - **i18n6ui**：开屏页按钮恢复（右上角悬浮）；`.lang-btn` 胶囊描边样式；工作区按钮置于返回键上方留 10px 间距
  - **i18n7wizhide**：开屏按钮移入 wizardScreen 内（随屏隐藏，消除进入工作区后两层叠加 bug）
  - **i18n8flag**：`min-width: 128px` 消除中英切换宽度抖动；国旗徽章（纯 CSS `.flag.gb/.flag.cn` 双色圆，规避 Windows Chrome 不渲染 emoji 国旗；按钮显示目标语言旗帜+名称）
  - **i18n9lh**：全局 `line-height` 归一（body 1.45 / h1 1.3 / 按钮定高 30/34px + line-height:1）——消除中文字体（雅黑行高~1.32）与西文（Segoe~1.21）行高差导致的按钮变矮与整页排版微移
  - **i18n10icon**：新建 `assets/` 资源夹收编根目录 ico；开屏卡片 ⚡/🔄 → 4nec2.ico / MMANA.ico 徽标（.wiz-logo 40px）
  - **GitHub 发布准备**（2026-09-05）：根目录 `README.md`（中文，功能/历史/外部参考/结构/扩展指南）+ `README.en.md`（英文镜像，顶部互链，双文档同步规则入工作规则 7）+ `LICENSE`（MIT 标准文本，Copyright (c) 2026 BG5TOX）
  - **i18n11copyright / i18n12wizfooter**：工作区与开屏页双页脚（版权+MIT 许可，词条 footer.* 双语言）；README 两版 OpenNEC 加项目链接、"权威参考"→"完整参考"（补非官方说明）；验收后**另存发布分支 `NEC2MAA_converter_main`**（2026-09-05 收尾快照）
  - **收尾**：backups/README 重写（v0.5 批次快照表+双基线说明）；AGENTS.md 更新（PowerShell 禁令升格规则 5、结构/契约/状态同步）；发布归档_v0.5.md 已含发布时状态（修复轮详见本节）
- 2026-09-04（v0.5 发布）：**i18n 全四批实施完成 + 17 套件回归全绿 + 723 hash 基线重审定**——
  - **i18n-1**：js/i18n.js 机制 + js/i18n/zh.js/en.js 语言包（191 词条）+ state.lang + index.html data-i18n 标注 + toggle 按钮 + script 引入 + 测试路径 v03/v04→v05 全量修正
  - **i18n-2**：app.js 全部动态文案接 L()（alert/按钮/placeholder/预设渲染/renderM2nWarnings 出口）
  - **i18n-3**：extract/convert/geometry/utils 告警→结构化条目 + 屏显 L()/写入 LF() 双视图（B1）
  - **i18n-4**：parser/taper/writer 告警→结构化条目 + 版本标记 v0.4→v0.5（CM 行/徽标/发布日期）+ 723 基线重生成（旧基线存档 `.v04baseline.json`）+ 测试断言同步
  - **验收**：17 套件 367 断言全绿；W8BYA N2M（zh 屏显+英文 Warnings）与 VDP40B M2N（en 全链）双语言端到端冒烟通过；ASCII 终检 0 违例
  - **v04 测试遗留缺陷修正**：v04 多个测试硬编码指向 v03 js（r2 俄文节头断言因 v03 无 R21 而失真）——v05 已全部指向真实 v05 代码并按实际行为修断言
- 待办：P0 T5 4NEC2 实测（同 v04 遗留）；用户浏览器最终双语言 UI 走查（发布后 6 轮修正已覆盖反馈问题）
- 版本史：v0.3（2026-09-02，M0–M5+R1–R20）→ v0.4（2026-09-03，R21 系列+审计闭环）→ **v0.5（2026-09-04 发布，2026-09-05 收尾，i18n-1..4 + i18n5fix–i18n10icon）**
