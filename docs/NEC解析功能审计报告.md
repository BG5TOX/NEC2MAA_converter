# NEC 解析功能审计报告

> **审计对象**：`NEC2MAA_converter_main` 的 **NEC → MAA** 解析链路（`js/utils.js` / `js/geometry.js` / `js/extract.js` / `js/convert.js`）
> **审计日期**：2026-09-24 ｜ **审计方式**：**只读审计**（未修改本项目任何代码/文件；除本报告与 `tools/` 下技能副本外无新增文件）
> **审计依据**：NEC-2 User's Guide（Part 1–3）、NEC-4.2 Part I User's Manual、4NEC2 手册；**2493 个真实 `.nec` 文件**全量实测；
> 外部复现脚手架（Node + `vm` 只读加载本项目 JS，见 §9）
> **结论一句话**：**符号表达式层（`utils.js::evalExpr`）是最大短板**——`^`、`SQR`、单位字、AWG、前导零等常见语法缺失，
> 导致 **101 个文件几何塌缩（其中 27 个全部导线零长）**、**75 个文件解析不到任何导线**；另有两处**硬缺陷**：
> `extract.js:68` 在含 `GA/GH/GR/SP/SM` 的文件上**直接抛异常**（68 文件）、`GS 0 0 mm` 被误判 ⇒ **缩放丢失、模型放大 1000×**（92 文件）。

---

## 0. 摘要（按严重度排序）

| # | 严重度 | 问题 | 位置 | 影响面（语料实测） |
|---|---|---|---|---|
| 1 | **S1 崩溃** | `header.geomCardWarnings` 未初始化 ⇒ 导入抛 `TypeError` | `js/extract.js:24` + `:68` | **68 文件**（含 `GA/GH/GR/SP/SM` 的全部文件）导入**无任何提示地失败** |
| 2 | **S1 静默错** | `GS 0 0 mm` 裸单位被误解析为 0 ⇒ 缩放回退 1.0 | `js/utils.js:46-56` + `js/convert.js:118-130` | **92 文件**（毫米模型）**几何放大 1000×** |
| 3 | **S1 静默错** | `#NN`（AWG 线规半径）不支持 ⇒ 半径 0 ⇒ 导线按"GC 锥度"丢弃 | `js/utils.js:7-43` | **28 文件**（其中 `bev80`/`Rhomb1`/`2el160flag` 等**零导线**，无法转换） |
| 4 | **S1 静默错** | 前导零小数（`+00.27685`）与 `0021` 八进制 | `js/utils.js:42` | **22 文件**（如 `2M_4EL_HIGHGAIN_QUAD.nec` 16/16 导线零长） |
| 5 | S2 | `SY` 一卡多声明（`SY a=1, b=2`）只取第一个 | `js/extract.js:44-46`、`js/convert.js:115-117` | **128 文件**（后声明的符号全丢 ⇒ 0 导线/零长） |
| 6 | S2 | 符号在几何之前一次性求值 ⇒ 位置相关重定义失效 | `js/extract.js:229`、`js/convert.js:133` | **98 文件**（如 `LoopCirc20.nec`：12 根导线**几何完全相同**，静默错） |
| 7 | S2 | `^`（幂）按 JS 异或求值；`SQR`/`ATN`/`INT`/`LOG10`/`FIX`/`SGN`/`MOD` 缺失 | `js/utils.js:33-40` | `^` **20 文件**、`SQR` **6**、`ATN` **3**、`INT` **8** |
| 8 | S2 | 长度单位字（`mm/cm/in/ft`）后缀与裸单位不支持 | `js/utils.js:11-15` | 裸单位 SY 值 **15 文件**；GW/SY 数值后缀 **30 文件** |
| 9 | S2 | `GW` 的 `NS=0` 未处理；`CW`（悬链线）静默丢弃；`NX` 多数据集合并 | `js/geometry.js:16-33`、`js/extract.js` | `NS=0` **3 文件**（多出导线）；`CW` **1**；`NX` **3** |
| 10 | S2 | 字段内空格表达式（`A + H`）与隐式乘法（`0.5D1`）不支持 | `js/geometry.js:15` | 字段含空格 **9 文件**（字段错位）；隐式乘法 **1 文件** |
| 11 | S2 | `EX`/`LD` 的 `tag=0`（绝对段号）语义未实现 | `js/extract.js:95`、`:139` | 少见但语义错误（命中首根 tag=0 导线） |
| 12 | S3 | 两条转换路径写入 MAA 的 Warnings 集合不一致 | `js/convert.js:144-148` vs `js/extract.js:250-268` | 同一文件两次转换产出不同 Warnings |
| 13 | S3 | `GS` 取"最后一个值、全局应用"（NEC 为顺序生效） | `js/convert.js:107-132` | 多张 GS 卡 **4 文件**（XNEC2C 生成的多段 GS） |
| 14 | S3 | `evalExpr` 细节：`/PI/g` 无边界、函数替换无 `\b`、`2*ft` 类"表达式+单位"不支持 | `js/utils.js:33-40,46-56` | 边界情形（见 §5） |
| 15 | S3 | 替换循环无长度护栏（自引用/循环定义可致指数膨胀 OOM） | `js/utils.js:17-31` | **潜在**（修好 #5 后风险上升，见 §4.10） |

**先说优点**（本次审计确认的正确实现，建议保持）：

- `GX` 的 `IXYZ` **已按"一个三位整数"正确解析**（`js/geometry.js:34-73`：从右取位、Z→Y→X 反射、tag 增量翻倍、`tag=0` 不递增）——实测 `NGF_radial4.nec` 4 根、`2SA.nec` 652 根 ✓；
- `GM` 语义完整（旋转序 Rz·Ry·Rx、`NRPT=0` 移动 / `>0` 累积复制、`ITS` 十进制且"按线段位置到末尾"、`tag=0` 不递增、多轴告警、复制预算护栏）✓；
- `GS` 缩放**含半径**且作用于坐标/平移 ✓；`LD/EX` 到 MMANA 设计符的映射（含 LD2/LD4 的串并联等效换算与逐条告警）✓；
- 告警结构化 + 中英双语渲染（`L()`/`LF()` 双视图）✓；723 文件输出哈希基线（行为锁定）✓。

---

## 1. 审计范围与方法

### 1.1 代码范围

| 文件 | 职责 | 是否审计 |
|---|---|---|
| `js/utils.js` | 表达式求值 `evalExpr`、GS 缩放解析、MMANA 位置设计符 | ✅ 重点 |
| `js/geometry.js` | 几何收集 `collectWires`（GW/GX/GM 单遍） | ✅ 重点 |
| `js/extract.js` | 头卡扫描（CM/SY/FR/GN/几何卡/未知卡）+ EX/LD 映射 + 编排 | ✅ 重点 |
| `js/convert.js` | NEC→MAA 转换编排（SY/GS 预扫描 + `collectWires` + 各节构建） | ✅ 重点 |
| `js/app.js`、`index.html` | 事件绑定与调用链（崩溃可达性、错误处理） | ✅ 交叉确认 |
| `js/maa2nec/*` | **MAA→NEC 方向**（另一条链路） | ❌ 不在本次范围 |

### 1.2 依据

1. **规范**：NEC-2 User's Guide（`gw/gc/gx/gm/gr/ga/gh/gs/ge` 页）、NEC-4.2 Part I User's Manual（§3.2 几何卡、§7 *Differences between NEC-4 and NEC-3*）、4NEC2 手册（`SY` 符号与表达式、AWG 线规表）。
2. **语料实测**：`F:\Antenna_Models` 全部 **2493 个 `.nec`/`.inp`** 文件（含 4nec2_models / XNEC2C / W4RNL / ARRL / G4CQM / DL5SAY 等来源）。
3. **外部复现脚手架**：Node + `vm` 只读加载本项目 `state.js/utils.js/geometry.js/extract.js`，复刻 `convert.js` 的 NEC 侧流水线（§9）。

### 1.3 复现与证据链

- 每条发现都给出**规范依据 + 代码位置 + 语料样本 + 实测数字**；
- 全量实测：`node harness.mjs F:\Antenna_Models 0 result-full.json`（§9，约 12 s）；
- 所有临时脚本与本报告之外的产物均在系统临时目录，**未写入本项目**。

---

## 2. S1-1 崩溃：含 `GA/GH/GR/SP/SM` 的文件导入必抛异常

**现象**：加载/拖入含 `GA`（圆弧）、`GH`（螺旋）、`GR`（圆柱阵列）、`SP`/`SM`（面片）的 `.nec` 文件时，NEC 侧提取**抛出 `TypeError`**，文件无法导入。

**代码证据**：

```js
// js/extract.js:22-24 —— 局部数组已声明、也已随返回值返回
let geomCardWarnings = [];
let header = { hasLD: false, hasTL: false, rawFreqStr: "", groundValue: "0", groundWarning: "", frSweepNote: "" };
//                     ↑ header 字面量里【没有】geomCardWarnings 字段

// js/extract.js:66-68 —— 却往 header 上 push
} else if (cardPrefix === 'GA' || cardPrefix === 'GH' || cardPrefix === 'GR' || cardPrefix === 'SP' || cardPrefix === 'SM') {
    let geoDesc = {...}[cardPrefix];
    header.geomCardWarnings.push(geoDesc);     // ← TypeError: Cannot read properties of undefined
}
```

**实测**：2493 文件 **68 个崩溃**（2.7%），全部为含上述几何卡者，例如
`10-30m-box.nec`（GR）、`137Mhz-QFHA1.nec`（GH）、`gs_8d_bb.nec`（SP/SC）、`satellite.nec`（SP）。

**连带影响（同一根因）**：即使不崩溃，`geomCardWarnings` 也**永远是空数组**（没有任何地方向局部数组 push），
因此"不支持的几何卡（模型不完整）"这条告警**在两条路径上都不会出现**——本应提示用户"模型缺几何"，实际静默。

**可达性与用户可见性**：`js/app.js:453-459`（文件选择）与 `:467-474`（拖放）→ `processInputText()` → `extractFromNec()`，
调用链**无 try/catch** ⇒ 异常直接抛出事件处理器 ⇒ **界面无任何错误提示**，用户只看到"文件没反应"。

**修复方向**（1 行）：把 `header.geomCardWarnings.push(geoDesc)` 改为 `geomCardWarnings.push(geoDesc)`；
并建议给 `processInputText` 加 try/catch + 顶部错误提示（兜底任何未来异常）。

---

## 3. S1-2 静默错：`GS 0 0 mm` 被误判 ⇒ 毫米模型放大 1000×

**现象**：语料中 **123 个文件**的 `GS` 卡把**裸单位**写在缩放位（`GS 0 0 mm` 92 个、`GS 0 0 in` 16 个、`GS 0 0 ft` 15 个）。
其中 **`GS 0 0 mm`（92 文件）被解析为 0**，`convert.js` 判为 `n2m.gs.bad` 后**把 `globalScale` 重置为 1.0 并继续转换**，
于是"以毫米书写"的模型被当作**米**输出 ⇒ **几何放大 1000 倍**。

**代码证据**：

```js
// js/utils.js:46-56
let m = s.match(/^(.*[0-9.)]|[A-Z_][A-Z0-9_]*)\s*(MM|CM|M|IN|FT)$/);   // ① 先匹配"值+单位"
if (m && GS_UNITS.hasOwnProperty(m[2].toLowerCase())) { ... return ...; } //   对 "MM" 会拆成 m[1]="M"、m[2]="M"
m = s.match(/^(MM|CM|M|IN|FT)$/);                                        // ② 裸单位分支（本应命中 "MM"）
```

- 对字符串 `MM`：① 用 `[A-Z_][A-Z0-9_]*` 吃掉 `M`、再用单位候选 `M` 吃掉末尾 `M` ⇒ `m[1]="M"` ⇒ `evalExpr("M")` ⇒ **未定义符号 ⇒ 0** ⇒ `val = 0`；
- `val > 0` 不成立 ⇒ 走 `n2m.gs.bad` 分支（`js/convert.js:126-129`）⇒ `globalScale = 1.0` **继续转换**；
- ② 分支因此**永远轮不到** `MM`（`CM` 同理：`C`+`M`）。

**实测**：`gsNote=BAD` 的文件数 **92**，与 `GS 0 0 mm` 的文件数完全一致；
样本 `G4CQM/144NX13S.nec`：`SY D1P = 449.0000`（毫米）⇒ 期望 0.449 m，实际按 449 m 输出。
（`in`/`ft` 两个形态**不受影响**——`I`+`N`、`F`+`T` 都不能构成合法"单位"拆分，会正确落到 ② 分支。）

**修复方向**：
① 把裸单位分支**提前**（先 `^(MM|CM|M|IN|FT)$`，再匹配"数值+单位"）；或
② 对首正则加"值部分必须是合法数值/符号表达式"的校验（`M` 不是合法表达式 ⇒ 拒绝该分支）。
并建议：`GS` 解析失败时**不要静默按 1.0 继续**——改为阻断转换或至少红字确认（当前只有一条 alert，用户确认后仍按错比例输出）。

---

## 4. 逐条问题详情（S2）

### 4.1 `SY` 一卡多声明不支持（128 文件）

```js
// js/extract.js:44-46（convert.js:115-117 同）
} else if (cardPrefix === 'SY') {
    let paramParts = cleanLine.substring(2).split('=');
    if (paramParts.length >= 2) symbols[paramParts[0].trim()] = paramParts[1].split('\'')[0].split('!')[0].trim();
}
```

- 只取**第一个 `=`**：`SY len=20, hgh=10, width=0.1` ⇒ 符号 `LEN` 的值变成 `"20, HGH=10, WIDTH=0.1"` ⇒ 求值失败吞 0，**后两个符号完全不存在**；
- 实测 **128 文件**使用该形态（4NEC2 手册明确支持"一卡多声明，逗号分隔"）；
- 典型受害文件：`4nec2_models/Equations/*`（`SY LL=L^2, LM=LL*.0128` ⇒ `LM` 丢失）、`15_10_112OHM_DIAMOND_LOOP.NEC` 等。

**建议**：按**括号外逗号**切分声明逐条写入（括号内的逗号属于函数参数，如 `MOD(a,b)`），并加单测。

### 4.2 符号求值时机早于几何 ⇒ 位置相关重定义失效（98 文件）

```js
// js/extract.js:226-229（convert.js:133 同）：先全表求值，再收几何
let { ... } = parseHeaderCards(lines, symbols, validNecCards);
for (let key in symbols) symbols[key] = evalExpr(symbols[key], symbols);
...
wires = collectWires(lines, symbols, 1.0, gmNotes);
```

- NEC/4NEC2 的语义是**按文件顺序求值**：`SY` 与 `GW` 交错时，每条 `GW` 用"该位置生效的值"；同名重定义＝**顺序赋值**；
- 现在所有 `GW` 都用**最后**一次的值。**实测量化**：`LoopCirc20.nec`（每张 `GW` 前 `SY ang=…`，应画出 12 个方向的圆环）
  ⇒ 12 根导线**几何完全相同**（唯一端点组合数 = 1），**无任何告警**；
- 语料中 `SY` 出现在首张 `GW` 之后的文件 **98 个**。

**建议**：把符号求值**移入几何收集**（`collectWires` 行循环内遇到 `SY` 就地解析求值），头卡扫描只做非几何元信息；
这是与"逐字搬运"冲突的结构性改动，建议单独立项 + 用 `LoopCirc20.nec` 等 3–5 个定点文件做回归。

### 4.3 表达式函数与运算符缺口（`^` 20 文件、`SQR` 6、`ATN` 3、`INT` 8）

| 语法 | 4NEC2 语义 | 现状 | 后果 |
|---|---|---|---|
| `^` | **幂** | JS `^` 是**异或**（`3^2`=1） | **静默算错**（如 `L=.4343*LOG(D*10^5)`） |
| `SQR(x)` | 平方根（BASIC 风格） | 未替换 ⇒ ReferenceError ⇒ 0 | 几何塌缩（`Slopvee.nec`、`QM06F10_rope_*.NEC`） |
| `ATN(x)` | 反正切，**返回角度** | 未支持 ⇒ 0 | 3 文件（`VD.nec`/`VDA.nec`/`EFHW_10M_80M_VK3IL.nec`） |
| `INT(x)` | 下取整 | 未支持 ⇒ 0 | 8 文件（常用于段数/几何） |
| `LOG10`/`FIX`/`SGN`/`MOD` | 手册列出 | 未支持 | 语料 0 使用（可低优先） |

**建议**：`^`→`**`（注意一元负号 `-x^2` 的语义与 JS 语法）、`SQR`→`Math.sqrt`、`ATN`→角度、`INT`→`Math.floor`。

### 4.4 单位字与 AWG 线规

- **数值后缀**只支持 `UH/MH/PF/NF`（`js/utils.js:11-15`）：缺 `MM/CM/IN/FT`（长度）与 `UF/NH`；
- **裸单位**只在 `GS` 卡的特例里支持（`parseGsScale`），表达式里不支持（`SY Inp=mm` ⇒ 0）——**15 文件**；
- **AWG 线规**（`#12`、`#18/ft`）完全不支持 ⇒ 半径 0 ⇒ `GW` 被当作"GC 锥度续行"**丢弃**（**28 文件**），
  且告警文案是"锥度导线已跳过"（`n2m.gw.gcTaper`），**误导**（真实原因是半径无法解析）；
- 实测：`bev80.nec`（`#18/ft`）、`Rhomb1.nec`（`#12/ft`）、`2el160flag.nec`（`#12`）⇒ **0 导线**，用户无法转换。

**建议**：`#NN` → AWG 直径/2（手册表或 `d(mm)=0.127×92^((36−n)/39)`）；`#NN/unit` → 以该单位计的半径；
半径解析失败时给出**独立告警**（区分"GC 锥度"与"半径无法解析"）。

### 4.5 前导零字面量与八进制

- `+00.27685`（YagiCAD 导出形态，**22 文件**）在 JS 中**语法非法** ⇒ `new Function` 抛错 ⇒ 0 ⇒ **几何全塌缩**（实测 `2M_4EL_HIGHGAIN_QUAD.nec` 16/16 零长）；
- `0021` 会被 JS 当作**八进制**（=17）⇒ 若出现在 `GM` 的 `ITS` 等整数字段，**静默错位**。

**建议**：求值前做数值规范化（前导零小数按十进制、`0021`→`21`）。

### 4.6 `GW` 的 `NS=0`（3 文件）与 `CW`/`NX`（1/3 文件）

- `NS=0`：手册规定"仅取消对称标志，**不生成任何线段**"，现在会生成一根真实导线（`40m_vert_compromised.nec` 等 3 文件）；
- `CW`（悬链线，NEC-4 新增）：**不在**几何卡告警名单里 ⇒ **静默丢线**（`Nec4/Catenary.nec` 0 导线）；
- `NX`（多数据集）：未处理 ⇒ **两个数据集的结构被合并**为一个模型（`Gr_func.nec`、`Nec-Ex9.nec`、`LOGPERIO.nec`）。

### 4.7 字段内空格表达式（9 文件）与隐式乘法（1 文件）

- `GW 1 10 0 0 A + H 0 W A + H - h2 0.5*1e-3` 这类写法按空白切分会**整体错位**（半径落到别的字段）；
  语料 9 文件（`2lsloper.nec`、`G5RV.nec`、`20M_OblongLoop_12mPole.nec`、`40M_moxon-beam.nec`、`vert_dipole_array_trans_line.nec` 等）。
  注：其中"数值+空格+单位字"（`-68 ft`）可在切分后合并修复（成本低），"运算符两侧空格"需要真正的表达式分词（成本高）。
- 隐式乘法 `0.5D1`（`G0KSC_50MHz 5el OWA…NEC`）⇒ 半径 0 ⇒ 丢线；注意与 Fortran `D` 指数语义冲突，需先定口径。

### 4.8 `EX`/`LD` 的 `tag=0`（绝对段号）语义

```js
// js/extract.js:95 与 :139
let wireIdx = wires.findIndex(w => w.tag === tag);   // tag=0 时命中第一根 tag=0 的导线
```

NEC 规定：`I2=0` 时 `I3` 是**绝对段号**（按段排列顺序，从 1 起），不是 tag ⇒ 现在会错误地落到"第一根无标签导线"。
语料中少见（多数文件用 tag），但语义需修正；同理，`(tag, m)` 在**多个导线共用同一 tag**（如 `GR 0 6` 各份 tag 相同）时，
NEC 的段组是**跨导线**编号，现实现按"第一根匹配导线 + 该导线内段号"处理，属于线级近似（可在文档中说明）。

### 4.9 告警集合不一致（S3）

| 路径 | 写入 MAA `Warnings` 的来源 |
|---|---|
| `executeConvert()`（按钮） | 仅 `gmNotes`（GM/GX 预算/ITS）+ `gsUnitNote` |
| `extractFromNec(showPrompts=true)`（加载时） | 另含 GN 降级、几何卡、FR 扫描、TL、EX/LD 类告警 |

⇒ 同一文件"先加载再转换"与"直接转换"写出的 Warnings 段**不同**（前者多、后者少），
而"几何卡不完整"这类**关键**告警恰好只在加载路径出现（且因 S1-1 实际从不出现）。

**建议**：把告警收集与"是否弹窗"解耦——统一在解析层收集、两条路径共享同一集合，UI 只决定是否弹窗。

### 4.10 替换循环无长度护栏（潜在 OOM）

```js
// js/utils.js:17-31
while (changed && iterations < 15) { ... s = s.replace(regex, "(" + symbols[key] + ")"); ... }
```

自引用/循环定义会让文本**指数膨胀**（15 轮 ≈ 数万倍）。当前语料未触发（因为 4.1 的"一卡多声明"缺口恰好屏蔽了
`SY DE=…, DE=DE*8` 这类自引用形态），但**修好 4.1 后风险立刻出现**（同类实现在其他项目实测 3 个文件抛
`Invalid string length` / 直接 OOM）。**建议在修 4.1 的同时**加 `if (s.length > 1e5) return 0;` 之类的护栏并告警。

### 4.11 其他细节（低优先）

| 项 | 说明 |
|---|---|
| `/PI/g` 无词边界 | 会破坏含 "PI" 的标识符（如 `PITCH`）⇒ 建议 `\bPI\b` |
| 函数替换无 `\b` | `ASIN(` 会被当作 `SIN(` 误替换 ⇒ 建议加 `\b` |
| `parseGsScale("2*ft")` | "表达式+单位"形态不匹配 ⇒ 落回 `evalExpr` ⇒ 0 ⇒ 建议先按单位后缀切分 |
| `GS_UNITS` 含 `m` | 4NEC2 手册未列 `m`（无害，保留即可） |
| 行首 `*` 注释 | 头卡扫描跳过 ✓，但 `collectWires`/EX/LD 扫描未跳过（当前无害，建议统一） |
| 弯引号注释 | `‘ ’ “ ”` 未截断（1 文件 `EFHW_10M_80M_VK3IL.nec`；该文件同时含 `SQR`/`ATN`） |
| 多张 `GS` 卡 | 取"最后一个值、全局应用"（NEC 为顺序生效）；4 文件（XNEC2C 的多段 GS，如 `GS 3 4 7.75E-01 …`） |

---

## 5. 与 NEC 规范的逐项对照（NEC→MAA 解析）

| 项 | 规范 | 现状 | 判定 |
|---|---|---|---|
| `GW` 字段/连接语义 | 10 字段；端点相同即相连 | 9 字段起接受、端点不去重 | ✅ 基本符合（连接性由 MMANA 侧决定） |
| `GW` `NS=0` | 不生成线段 | 生成导线 | ❌ |
| `GW` `RAD=0` + `GC` | 读 GC 锥度 | 跳过 + 告警（MMANA 无锥度等价物） | ⚠ 设计取舍（但 AWG 也走此路 ⇒ 误报，见 4.4） |
| `GX` `IXYZ` | 三位整数、Z→Y→X、tag 翻倍 | **正确** | ✅ |
| `GM` | 顺序 Rx→Ry→Rz→平移、`NRPT` 累积、`ITS` 十进制到末尾 | **正确**（含预算护栏） | ✅ |
| `GR` | 旋转复制 `NR` 份（含原作） | 仅告警 | ⚠ 未支持（至少已列入告警名单，但见 S1-1） |
| `GA`/`GH` | 圆弧 / 螺旋（两版语义不同） | 仅告警 | ⚠ 未支持 |
| `GS` | 顺序缩放（含半径） | 最后值全局应用；`mm` 误判 | ⚠/❌ |
| `GE` | 几何段结束 | 不区分段（无害） | ✅ |
| `SP`/`SM`/`SC` | 面片 | 仅告警 | ⚠ 未支持（合理：MMANA 无线面等价物） |
| `CW` | 悬链线（NEC-4） | 静默丢弃 | ❌ |
| `NX` | 多数据集 | 合并 | ❌ |
| `SY` 表达式 | 顺序求值、一卡多声明、`^` 幂、单位字、AWG | 见 §4 | ❌ |
| `EX`/`LD` 段定位 | tag+组内段号 / 绝对段号 | tag 路径 ✓，绝对段号 ❌ | ⚠ |
| `TL`/`NT`/`GN`/`GD` | 控制卡 | 识别 + 告警/映射 | ✅（TL 仅提示、GN 映射到 MAA 地面） |
| `FR` | 频率（含扫描） | 取 F1 + 扫描提示 | ✅ |

---

## 6. 语料实测数据（2493 个 `.nec`/`.inp`）

**外部脚手架全量结果**（复刻 `convert.js` 的 NEC 侧流水线 + `extractFromNec`）：

| 指标 | 数值 | 说明 |
|---|---|---|
| 导入抛异常 | **68 文件（2.7%）** | 全部为 S1-1（`GA/GH/GR/SP/SM`） |
| 解析不到任何导线 | **75 文件（3.0%）** | 转换被 `ui.alert.noWire` 拒绝；主因：AWG `#NN`（28）、`SY` 全丢（Equations 系列）、纯 `CW`/`GA/GH` 模型 |
| 含零长导线 | **101 文件（4.1%）** | 其中 **27 文件全部导线零长**（几何完全塌缩）——前导零 22、`SQR`/`^`/多声明/裸单位等 |
| `GS` 解析为 BAD（按 1.0 继续） | **92 文件** | 全部为 `GS 0 0 mm` ⇒ **1000× 尺度错误** |
| 几何卡告警产出 | **0 次** | S1-1 的连带后果（数组恒空） |

**受影响文件数（按语法特征统计，去重）**：

| 特征 | 文件数 | 特征 | 文件数 |
|---|---|---|---|
| 一卡多声明 `SY` | **128** | `GS` 裸单位（MM/CM/IN/FT） | **123**（其中 `mm` 92 出错） |
| `SY` 与 `GW` 交错 | **98** | `GA` / `GH` / `GR` | 7 / 15 / 36 |
| `^`（幂） | **20** | `SP` / `SM` / `SC` | 14 / 13 / 19 |
| 前导零小数 | **22** | `GC`（锥度） | 18 |
| `#NN` 线规 | **28** | `GW NS=0` | 3 |
| `SQR(` | **6** | `GW` 字段含空格 | 9 |
| `ATN(` / `INT(` | 3 / 8 | `NX` / `CW` | 3 / 1 |
| 裸单位作 SY 值 | 15 | 多张 `GS` | 4 |
| GW/SY 数值后缀（mm/ft 等） | 30 | 隐式乘法 `0.5D1` | 1 |

> 参照：同类审计在另一实现（本项目"姊妹"解析器，同一语料）修复后的结果为 **硬报错 0、零长线文件 4**。
> 该对比只用于标定"可达水平"，不构成对本项目设计取舍的评价（两者输出目标不同）。

---

## 7. 建议的修复优先级与回归用例

### 7.1 优先级

1. **P0（1 行）**：修 S1-1（`header.geomCardWarnings` → `geomCardWarnings`）+ 给 `processInputText` 加 try/catch 兜底；
2. **P0（小改）**：修 `parseGsScale` 裸单位分支顺序（S1-2）；`GS` 解析失败时**阻断或红字确认**，不要静默按 1.0 输出；
3. **P1**：`evalExpr` 补 `^`/`SQR`/`ATN`/`INT`、单位字（长度 + `UF/NH` + 裸单位）、AWG `#NN`、前导零规范化、长度护栏（S1-3/4、4.3/4.4/4.5/4.10）；
4. **P1**：`SY` 一卡多声明（4.1）；随后按 4.2 把符号求值移入几何收集（结构性改动，单独立项）；
5. **P2**：`NS=0`、`CW` 告警、`NX` 只取首个数据集、字段内空格合并、`tag=0` 绝对段号、告警集合统一。

### 7.2 建议纳入 `tests/` 的定点用例（每条都能用文件复现）

| 用例 | 输入 | 期望 |
|---|---|---|
| 裸单位 GS | `GS 0 0 mm` + `SY D=449` + `GW 1 1 0 0 0 D 0 0 0.001` | 缩放 0.001（x2 = 0.449），无 `gs.bad` 告警 |
| 几何卡告警 | 任一含 `GR` 的文件（如 `10-30m-box.nec`） | 不抛异常；产出"不支持几何卡：GR"告警 |
| AWG 半径 | `GW 1 1 0 0 0 1 0 0 #12` | 半径 ≈0.001026 m；**不**被当作 GC 锥度丢弃 |
| 前导零 | `SY a=+00.27685` + 用 a 的 `GW` | a=0.27685（非 0） |
| `^` 幂 | `SY x=3^2` | x=9（非 1） |
| `SQR` | `SY d=sqr(9)` | d=3 |
| 一卡多声明 | `SY a=1, b=a*2` | a=1、b=2 |
| 交错重定义 | `SY ang=0` / `GW …` / `SY ang=90` / `GW …` | 两根导线方向不同（参照 `LoopCirc20.nec`） |
| `NS=0` | `GW 1 0 0 0 0 1 0 0 0.01` | 不生成导线 |
| `NX` | 两个数据集拼接 | 只取第一个数据集 + 告警 |
| `CW` | `Nec4/Catenary.nec` | 至少产出"CW 不支持"告警（不静默丢线） |

> 提示：现有 `backups/preR21h_723_output_hashes.json` 能锁定"输出是否变化"，但**锁不住"输入解析是否静默出错"**
> （基线由同一实现生成）。建议把上表用例做成**独立断言**（输入 → 期望几何/告警），与哈希基线并行。

---

## 8. 结论

- 本项目的 **GX/GM/GS(数值)/EX/LD 映射**等主干实现质量较好，且已建立告警结构化与哈希回归；
- 短板集中在 **符号表达式层**（`utils.js`）：它是**所有几何卡的公共入口**，一处缺失会同时污染 GW/GA/GH/GM/GX/GR/CW 的坐标与半径，
  本语料中因此有 **4% 的文件几何塌缩、3% 的文件零导线**；两处硬缺陷（`extract.js:68` 崩溃、`GS 0 0 mm` 尺度错）应**最先修**；
- 建议按 §7.1 的 P0→P2 顺序推进，并把 §7.2 的定点用例固化到 `tests/`，避免"输出哈希不变但语义已错"的情况再次发生。

---

## 9. 附录：复现方法
### 9.1 外部脚手架（Node，只读加载本项目代码）

```js
// harness.mjs —— 只读调用，不修改本项目任何文件；需 Node ≥ 18
import { readFileSync, readdirSync, statSync } from 'node:fs';
import vm from 'node:vm';
const PROJ = '<本项目路径>/NEC2MAA_converter_main';
const read = (p) => readFileSync(PROJ + '/' + p, 'utf8');

// 1) 浏览器环境 stub（DOM/alert/i18n）
const sb = { console, document: { getElementById: () => ({ value: '', style: {}, focus() {} }) },
             alert: () => {}, Math, JSON, Number, String, Array, Object, RegExp, Date, isFinite, isNaN, parseFloat, parseInt };
sb.window = sb; sb.globalThis = sb;
const ctx = vm.createContext(sb);
for (const f of ['js/state.js', 'js/utils.js', 'js/geometry.js']) vm.runInContext(read(f), ctx, { filename: f });
vm.runInContext('function L(k){return k} function LF(k){return k} function updateTitleInput(){}', ctx);
vm.runInContext(read('js/extract.js'), ctx, { filename: 'extract.js' });

// 2) 复刻 convert.js 的 NEC 侧流水线（SY/GS 预扫描 → 全表求值 → collectWires）
function runGeometry(text) {
  return vm.runInContext(`(function(text){
     const lines = text.split('\\n'); let symbols = {}; let globalScale = 1.0;
     for (const line of lines) {
       const c = line.trim().toUpperCase(); const parts = c.split(/[\\s,]+/).filter(Boolean);
       if (!parts.length) continue;
       if (parts[0] === 'SY') { const p = c.substring(2).split('='); if (p.length >= 2) symbols[p[0].trim()] = p[1].split("'")[0].split('!')[0].trim(); }
       else if (parts[0] === 'GS' && parts.length >= 4) {
         let raw = parts[3];
         if (parts.length >= 5 && /^[0-9.]+$/.test(parts[3]) && GS_UNITS.hasOwnProperty(parts[4].toLowerCase())) raw = parts[3] + parts[4];
         const gs = parseGsScale(raw, symbols);
         globalScale = (isFinite(gs.val) && gs.val > 0) ? gs.val : 1.0;
       }
     }
     for (const k in symbols) symbols[k] = evalExpr(symbols[k], symbols);
     return collectWires(lines, symbols, globalScale, []);
   })(${JSON.stringify(text)})`, ctx);
}
// 3) 遍历语料，统计 wires / 零长 / 异常；再调用 extractFromNec(text, false) 统计告警
```

### 9.2 本次审计的运行命令与产物

```powershell
node harness.mjs F:\Antenna_Models 0 result-full.json     # 全量 2493 文件，约 12 s
node counts.mjs        # 语法特征文件数统计
node filecounts.mjs    # 卡级文件数统计（去重）
```

- 本报告的全部数字均可由上述命令复现；脚手架与本报告之外无任何文件写入本项目。

---

## 10. 附：随本报告交付的社区技能（NEC 输入格式解析）

本报告同时附带一份**自包含的 NEC 输入格式解析技能**（不含本项目实现细节，可独立使用/再发布，MIT）：

| 路径 | 用途 |
|---|---|
| `.kilo/skills/nec-input-parsing/SKILL.md` | 供 AI 在解析/生成/审计 `.nec` 文件、或修改 NEC 解析代码时自动加载 |

内容：卡序与行语法、逐卡字段表与公式（`GW/GC/CW/GA/GH/GM/GX/GR/GS/SP·SM·SC/GE`）、控制卡、`SY` 符号与表达式（含单位字与 AWG 线规）、
NEC-2 与 NEC-4.2 版本差异（含 `GH` 同名不同义）、真实文件容错表、解析器实现清单与算法要点、**23 条验证用例**、4 个完整示例。

建议在推进 §7.1 的 P1 项（表达式层与 `SY` 层）时，对照该技能的"表达式陷阱清单"与 §9 验证用例逐条自检——
其中 `^` 幂、`SQR`、单位字、AWG `#NN`、前导零、一卡多声明、交错重定义、`NS=0`、`NX`、`CW` 等条目与本报告的发现一一对应。

