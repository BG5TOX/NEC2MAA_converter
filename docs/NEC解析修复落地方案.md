# NEC 解析修复落地方案（v0.7）

> **关联审计**：`docs/NEC解析功能审计报告.md`（2026-09-24，2493 个真实 `.nec/.inp` 全量实测）
> **本方案日期**：2026-09-24 ｜ **状态**：**已实施**（v0.7 发布；用户 10 项裁决见 §0，实施记录见 §8）
> **影响面**：NEC → MAA 解析链路 `js/utils.js` / `js/geometry.js` / `js/extract.js` / `js/convert.js` / `js/app.js` + 语言包 + `tests/`；**M2N（.maa→.nec）链路不涉及**（723 hash 基线仅在升版本号时因 CM 行变化而重审定）
> **执行纪律**：全部改动按 AGENTS 工作规则 2/5 执行——每批次前备份到 `backups/`；文件读写一律 edit 工具或 Node `fs` 显式 utf8；严禁 PowerShell 改文件内容。

---

## 0. 决策记录（用户裁决，2026-09-24）

| # | 决策点 | 裁决 |
|---|---|---|
| D1 | 方案覆盖范围 | **全部 P0–P2**（含结构性改动与卡片层） |
| D2 | GS 解析失败行为 | **阻断转换**（alert 说明后不产出，修正后重试） |
| D3 | SY 求值时机 | **本轮实施按文件顺序求值**（纯顺序，不做未解析回退） |
| D4 | 多张 / 段范围 GS | **NEC-2 顺序语义**：I1/I2=0 的 GS 按序缩放此前几何；I1/I2≠0（XNEC2C 段范围形态）不应用 + 告警 |
| D5 | 几何字段求值失败 | **跳过该导线 + 按文件聚合告警**（不产出零长/NaN 导线） |
| D6 | `^` 与表达式层 | **括号感知改写 `Math.pow(base,exp)`**；补 `SQR/ATN/INT/FIX/SGN/MOD/LOG10` + 长度单位字 + `UF/NH` |
| D7 | GR 卡 | **本轮实现**旋转复制（NR 份含原作、360/NR、tag+ITGI） |
| D8 | 版本 | **升 v0.7**（`tools/bump_version.js` + 723 基线重审定） |
| D9 | 隐式乘法 `0.5D1` | **符号感知支持**（尾随标识符为已定义符号时按乘法） |
| D10 | app.js 兜底 / 告警统一 | **都做**（try/catch + 解析层统一收集、两条路径 Warnings 一致） |

---

## 1. 复核结论（审计报告逐条验证）

复核方式：只读探针（Node 加载本项目 JS，装配方式同 `tests/m3_geometry.js` / `m4_extract.js`）+ 语料精确扫描；
全部脚本在系统临时目录（`C:\Users\DELL\AppData\Local\Temp\kilo\nec_*.js`），**未写入本项目任何文件**。

### 1.1 确认项（审计成立）

| 审计项 | 复核证据（实测值） |
|---|---|
| S1-1 `extract.js:68` 崩溃 | `extractFromNec('…GR…')` → `TypeError: Cannot read properties of undefined (reading 'push')`；`header` 字面量（`extract.js:24`）确无 `geomCardWarnings` 字段 |
| S1-2 `GS 0 0 mm` | `parseGsScale('MM')` → `{val:0,unit:'M'}`（`M`+`M` 被拆分）；全链复刻：`SY D1P=449` + `GS 0 0 mm` → 输出 `x2=449`（应 0.449） |
| S1-3 AWG `#NN` | `evalExpr('#12')=0` → 半径 0 → 走 GC 锥度分支丢弃，告警 `n2m.gw.gcTaper`（误导） |
| S1-4 前导零 | `evalExpr('+00.27685')=0`；`evalExpr('05.33467')=0`；`evalExpr('0021')=17`（八进制） |
| SY 一卡多声明 | `SY len=20, hgh=10` → `LEN => "20, HGH"` 求值吞 0；Equations 系列 `SY DE=…, DE=DE*8` 依赖卡内顺序赋值 |
| SY 交错重定义 | `LoopCirc20.nec` 12 张 GW 前各有 `SY ang=…`，现实现全用最后一次值 |
| 表达式函数缺口 | `3^2=1`（异或）、`SQR(9)=0`、`ATN(1)=0`、`INT(3.7)=0`、`LOG10(100)=0`、`MOD(7,3)=0`；`PITCH` → **undefined**（`/PI/g` 无边界，比 0 更危险，NaN 传播） |
| 单位字 | `evalExpr('27.5ft')=0`、`evalExpr('MM')=0`；`parseGsScale('2*ft')=0` |
| NS=0 / CW / NX | `GW … NS=0` 多出 1 根导线；`CW` 0 根且**零告警**（在 `validNecCards` 内，连未知卡告警都不触发）；`NX` 两数据集合并为 2 根 |
| tag=0 绝对段号 | `findIndex(w => w.tag === tag)`；见 §1.2-② |
| 告警集合不一致 | `executeConvert` 只追加 `gsUnitNote` + `gmNotes`；见 §1.2-③ |
| 替换循环无护栏 | `utils.js:17-31` 仅 15 轮上限，无长度检查 |
| 语料特征计数 | `GS 0 0 mm` 92 文件、裸单位 GS 123、AWG 28、前导零 22、SY 多声明 128（我方粗扫 156）、SY 在 GW 后 98、CW 1、NX 3、GR 36、NS=0 3、`^` 20、SQR 6、ATN 3、INT 8、多张 GS 4 —— 与报告同量级 |

### 1.2 修正与补充（对审计报告的 4 处修正/细化）

① **723 hash 基线是 M2N 专属**：`backups/preR21h_723_output_hashes.json` 由 `.maa → .nec`（`maa2nec/*`）生成（`tools/bump_version.js:77-103`、`tests/r21_taper_rebuild.js:200-220`）。
   N2M 修复**不会**影响该基线；审计报告 §7.2 提示语按"输出是否变化"通用护栏理解需修正——N2M 方向**当前无 hash 基线**，本方案用 §4 的定点/语料回归替代（并在 v0.7 升版时因 CM 行变化重审定 723 基线）。

② **tag=0 的更隐蔽后果**：若文件中**没有** tag=0 的导线，`findIndex` 返回 −1 → EX/LD **被完全静默丢弃**（连一条告警都没有），比"命中首根 tag=0 导线"更严重。实测：`GW 5…` + `GW 7…` + `EX 0 0 2 0 1 0` → 源回退为默认 `w1c, 1.0, 0.0`。

③ **告警集合不一致的实际形态**：`executeConvert` 复用上一次提取留在 `N2M.state.unsupportedErrors` 中的条目——若用户**未重新提取**而直接点"转换"（粘贴文本路径），Warnings 可能来自**上一个文件**（跨文件污染），比"集合少几条"更严重。见 §2-3-C5。

④ **隐式乘法与 SY 顺序求值的语料风险实测**（支撑 D3/D9）：
   - 真隐式乘法（数字紧邻标识符且非单位/非指数）**精确计数 = 1 文件**：`G0KSC_50MHz 5el OWA Yagi_3.4m_BOOM_SC0605SM.NEC`，其 `SY D1=0.012` 且第 23 行写作 `0.5*D1`（作者意图明确）；**带符号 Fortran D 指数（`1.5D-3`）语料 0 文件** → 符号感知隐式乘法无歧义风险。
   - 前向引用（使用早于声明）**仅 2 例命中且均为 `CE` 注释文本误报** → 纯顺序求值（D3）语料安全。
   - 多张 GS 的 4 个文件均为 XNEC2C 生成形态（`GS 2 2 1.03` / `GS 3 4 0.775`：I1/I2=段范围）；`GM` 出现在 `GS` 之后的仅 3 文件，其中 2 个是上述 XNEC2C 文件、1 个为 `GS 0 0 1.0`（无操作）→ **顺序 GS 语义在语料中除"段范围不应用+告警"外无可观察行为变化**。
   - 9 字段 GW（半径空白）确认为**合法 GC 锥度续行**（`42-vert.nec`、`d240(EHX2).NEC`、`YI20_40B.nec` 等紧随 `GC` 卡）→ 保持现有"跳过+聚合告警"设计；只有 RHOM.NEC 一类"无半径且无 GC"属残缺模型，保持告警。

### 1.3 复核脚本（可复现）

| 脚本（临时目录） | 作用 |
|---|---|
| `nec_audit_probe.js` | 逐条验证 S1-1/S1-2/S1-3/S1-4、表达式缺口、GS 全链、tag=0 |
| `nec_corpus_scan.js` | 语料语法特征计数（2493 文件） |
| `nec_forwardref_scan.js` | 前向引用 / 多 GS / SY 重定义计数 |
| `nec_suffix_scan.js` + `nec_implicit_scan.js` + `nec_Dexp_scan.js` | 单位后缀 / 隐式乘法 / Fortran D 指数精确计数 |
| `nec_gw_fields_scan.js` | GW 字段数异常（26 文件）分类 |
| `nec_gs_order_scan.js` | GS 位置（在末张 GW 前 = 3 文件）、GM 在 GS 后 = 3 文件 |

---

## 2. 修复设计

统一约定：

- **新告警键**必须 zh/en 双写（规则 6），键名与文案见 §3；告警条目结构化 `{key, params}`。
- **求值失败语义**（支撑 D5）：`evalExpr` 失败一律返回 **NaN**（不再返回 0）；调用点用 `isFinite` 判定，几何卡失败 → 跳过该导线/该卡 + 聚合告警；GS 失败 → 阻断。
- **告警顺序契约**（`extract.js:8-9` 注释）保留并更新：GM 提示 → groundWarning → geomCards → frSweep → unknownCards → TL → failedLD → ld1 → ld5 → exNotes → fuzzyPosition → **新增：exprFailed / cardShape / cw / nx / gr 相关**（插入点见各条）。
- 每批次完成后：`node tests/<相关>.js` + 全量 17 套件全绿，再进入下一批。

### 批次 1（P0：崩溃、尺度、阻断、兜底）

#### 2-1-A1 `extract.js:68` 崩溃（1 行）

- 现状：`header.geomCardWarnings.push(geoDesc)`（`header` 字面量无此字段）。
- 改法：改为 `geomCardWarnings.push(geoDesc)`（局部数组已随返回值返回，`extract.js:72`，并在 `:255-259` 被消费）。
- 连带收益：`n2m.alert.geomCards` 告警**首次真正生效**（含 `GA/GH/GR/SP/SM` 的文件：不再崩溃 + 明确"几何不完整"告警）。
- 测试：`tests/m4_extract.js` 增 2 断言（含 GR 文件不抛异常；`geomCardWarnings` 产出 `GR (cylindrical array)`）。

#### 2-1-A2 `utils.js::parseGsScale` 重写（修 `MM/CM` 误判 + 表达式+单位）

```js
function parseGsScale(raw, symbols) {
    let s = raw.toString().trim().toUpperCase();
    // 1) 裸单位（必须最先 — 修复 "MM"/"CM" 被 [A-Z_][A-Z0-9_]* 拆成 M+M）
    if (GS_UNITS.hasOwnProperty(s.toLowerCase())) return { val: GS_UNITS[s.toLowerCase()], unit: s };
    // 2) 值/表达式 + 单位后缀（"135cm"、"2*ft"、".3048ft"）；值部分不能是裸标识符（避免符号名尾字母被当单位）
    let m = s.match(/^(.*?)\s*(MM|CM|M|IN|FT)$/);
    if (m && m[1] !== '' && !/^[A-Z_][A-Z0-9_]*$/.test(m[1])) {
        let num = evalExpr(m[1], symbols);
        if (isFinite(num) && num > 0) return { val: num * GS_UNITS[m[2].toLowerCase()], unit: m[2] };
    }
    // 3) 纯表达式/符号（含 evalExpr 自身的单位字处理）
    let v = evalExpr(s, symbols);
    return { val: isFinite(v) && v > 0 ? v : NaN, unit: null };
}
```

- 失败返回值由 `0` 改为 **NaN**（配合 A3 阻断）。
- `convert.js:121` 的"数值 + 空格 + 单位"合并逻辑保留（`GS 0 0 0.3048 ft`），条件放宽为 `parts[4]` 是单位字且 `parts[3]` 非单位字即可（覆盖 `GS 0 0 Scal ft` 形态）。
- 测试（m2）：`parseGsScale('MM')===0.001`、`('CM')===0.01`、`('M')===1`、`('IN')===0.0254`、`('FT')===0.3048`、`('2*ft')===0.6096`、`('XYZ')` → **NaN**（旧断言"→0"同步改）。

#### 2-1-A3 GS 顺序语义 + 阻断（geometry / convert / extract）

**核心改动：GS 处理从 `convert.js` 预扫描移入 `collectWires`，按文件顺序就地缩放此前几何**（NEC-2 语义：GS 缩放"已读入"的结构，其后几何按新单位解释）：

```js
// geometry.js — collectWires(lines, symbols, notes)   ← globalScale 参数删除
} else if (parts[0] === 'GS') {
    if (fields.length < 4) { addNote(notes,'n2m.gs.bad',{raw:cleanLine}); }
    else {
        const i1 = parseInt(evalExpr(fields[1], symbols)) || 0;
        const i2 = parseInt(evalExpr(fields[2], symbols)) || 0;
        const gs = parseGsScale(fields[3], symbols);
        if (!isFinite(gs.val) || gs.val <= 0) addNote(notes,'n2m.gs.bad',{raw:fields[3]});   // 阻断由调用方执行
        else if (i1 !== 0 || i2 !== 0)       addNote(notes,'n2m.gs.segRange',{i1,i2});      // XNEC2C 段范围：不应用
        else {
            for (const w of wires) { w.x1*=gs.val; w.y1*=gs.val; w.z1*=gs.val; w.x2*=gs.val; w.y2*=gs.val; w.z2*=gs.val; w.rad*=gs.val; }
            if (gs.unit) addNote(notes,'n2m.gs.unit',{unit:gs.unit,val:gs.val});
        }
    }
}
```

- **GM 平移不再乘缩放**（GM 卡处于"当前单位"；语料实测无行为差异，见 §1.2-④）；`GM` 在 `GS` 之前的文件结果与旧实现一致（旧实现整体乘 globalScale）。
- **阻断（D2）**：`executeConvert` 解析后若 `notes` 含 `n2m.gs.bad` → `alert(L('n2m.gs.bad', params))` + `return`（不产出、不启用下载）；加载路径（`extractFromNec`）同样弹告警但**不阻断**（用户可修文本）。
- `convert.js` 预扫描循环中删除 `SY`/`GS` 分支（SY 见批次 2；GS 移入几何层），保留 `CM` 收集。
- `extract.js:245` 调用改 `collectWires(lines, symbols, notes)`（原传 1.0——extract 只用 tag/ns，不受缩放影响）。
- 测试（m3）：`GS 0 0 mm` 缩放（新增）；`GS×GM` 断言按新语义改写（`GW z=±1` + `GS 0 0 2` + `GM z+1` → `z1=3, z2=−1, rad=0.002`）；`GS 3 4 0.775` → 不缩放 + `n2m.gs.segRange`。m5：GS 失败 → 无产出 + 阻断告警。

#### 2-1-A4 app.js 异常兜底（D10 前半）

- `processInputText`：`try { extractFromNec / extractM2nPanel } catch (e) { console.error(e); alert(L('ui.alert.parseError', {msg: e.message})); }`；`triggerManualExtract`、`executeConvert`、`executeConvertM2N` 同样包裹。
- 新增 i18n 键 `ui.alert.parseError`（§3）。
- 测试：m5 增"桩函数抛异常 → 弹出 parseError 且不冒泡"断言（可注入 throwing stub）。

### 批次 2（P1：表达式层 + SY 层）

#### 2-2-B1 `utils.js::evalExpr` 重构（保留 new Function 沙箱与大写化）

预处理顺序（全部在符号替换前，除注明者）：

| 步 | 内容 | 说明 |
|---|---|---|
| ① | **前导零规范化**：`s.replace(/(^|[^\w.])0+(\d)/g,'$1$2')` | `+00.27685`→`+0.27685`；`0021`→`21`；不碰 `0.5`/`1.05`/`100` |
| ② | **AWG**：`#NN[/unit]` → 半径数值 | `d(mm)=0.127×92^((36−n)/39)`，n≥0；`#00/#000/#0000` → n=−1/−2/−3；半径=d/2/1000 m；`/unit` → 以该单位计（`#12/ft` = r_m/0.3048，与 `GS 0 0 ft` 互抵）；残留 `#` → 失败 |
| ③ | 电学单位（保留原语义，补 `UF`/`NH`） | `UH→E-6, MH→E-3, PF→E-12, NF→E-9, UF→E-6, NH→E-9` |
| ④ | **长度单位字**（含裸用/后缀/表达式+单位） | `s.replace(/(^|[^A-Z_0-9]|[0-9)])(MM|CM|IN|FT|M)(?![A-Z0-9_])/g, …)`：前导为数字/`)` → 插 `*`，前导为运算符/行首 → 只包括号。`56ft/in`→`56*(0.3048)/(0.0254)`；`MIN` 不误伤；`1.2MM`、`42*ft`、`-68ft` 全通 |
| ⑤ | **符号替换循环**（保留键转义 + 15 轮） | 循环内加**长度护栏**：`if (s.length > 1e5) return NaN;`；另在循环前对"已定义符号"做**隐式乘法插入**（D9）：`/(^|[^A-Z0-9_])((?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+|\)))\s*(KEY)(?![A-Z0-9_])/g → '$1$2*$3'`（`R01LENGTH` 不误伤；`0.5D1`→`0.5*D1`） |
| ⑥ | **幂（括号感知）** | 扫描 `^`，向左/右按括号配平取操作数 → `Math.pow(base,exp)`；`-x^2` → `-(x^2)`（BASIC 语义）；`(a+b)^2`、`2^3^2` 左结合 |
| ⑦ | 函数与常量（统一 `\b`） | `\bPI\b`→`Math.PI`；`SQR(`/`SQRT(`→`Math.sqrt(`；`SIN/COS/TAN` 保留角度制注入；`ATN/ASIN/ACOS` → `Math.atan/asin/acos(...)×180/π`（用配平扫描包装）；`ABS/EXP/LOG10/LOG/INT(Math.floor)/FIX(Math.trunc)/SGN(Math.sign)`；`MOD(a,b)`→`((a)%(b))`（仅简单实参，语料 0 使用） |
| ⑧ | 求值 | `try { const v = new Function('return ('+s+')')(); return (typeof v === 'number' && isFinite(v)) ? v : NaN; } catch { return NaN; }` |

- 注意：`\bLOG\b` 与 `LOG10` 的替换顺序（先 `LOG10`）；`\bSIN\b` 修复 `ASIN` 误替换（旧 `/SIN\s*\(/` 无边界）。
- 兼容性：既有测试 `m2` 的 `evalExpr UH`、`sf1` 的键转义用例保持通过（复核过用例形态）；`m2` "非法 xyz → 0"改为 → NaN。
- 测试（m2 扩 + 新 m6）：`3^2=9`、`-2^2=-4`、`(1+2)^2=9`、`SQR(9)=3`、`ATN(1)=45`、`INT(3.7)=3`、`FIX(-3.7)=-3`、`SGN(-2)=-1`、`LOG10(100)=2`、`MOD(7,3)=1`、`#12≈0.001026`、`#18/ft≈0.001680`、`#0000`、`+00.27685`、`0021=21`、`42*ft`、`56ft/in`、`2*ft`、`0.5D1`（D1=0.012 → 0.006）、自引用护栏（`DE=DE*DE` 不膨胀、有界返回）。

#### 2-2-B2 SY 层：`applySyDecl` + 求值时机迁移（D3）

```js
// utils.js
function splitTopLevel(s, sep)      // 括号配平切分（MOD(a,b) 的逗号不切）
function stripComment(line)         // ' ! ‘ ’ “ ” 截断（弯引号修复 EFHW 类文件）
function applySyDecl(cleanLine, symbols, notes) {
    const body = stripComment(cleanLine).substring(2).trim();
    for (const decl of splitTopLevel(body, ',')) {
        const eq = decl.indexOf('='); if (eq < 0) continue;
        const name = decl.slice(0, eq).trim().toUpperCase().replace(/\s+/g,'');
        if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) continue;
        const v = evalExpr(decl.slice(eq + 1).trim(), symbols);
        if (isFinite(v)) symbols[name] = v;                                  // 立即求值（卡内顺序赋值：DE=…, DE=DE*8）
        else { addNote(notes,'n2m.expr.evalFailed',{where:'SY '+name, expr:decl.slice(eq+1).trim()}); symbols[name] = NaN; }
    }
}
```

- **调用点**（各自按行顺序维护同一张表，删除"最后统一求值"步骤）：
  - `extract.js::parseHeaderCards` SY 分支 → `applySyDecl`（FR/GN 随即使用当时值）；
  - `geometry.js::collectWires` 行循环新增 `SY` 分支（在 GW/GX/GM 之前）；
  - `extract.js::parseExcitation` / `parseLoads` 行循环新增 `SY` 分支（`3vertical.nec` 这类 GE 后 `SY I=1, Pha=90` 按位置生效）；
  - 删除 `extract.js:229` 与 `convert.js:133` 的 `for (key in symbols) …` 全表求值；`convert.js` 的 SY 预扫描分支删除。
- 兼容：语料前向引用≈0（§1.2-④）；`GS 0 0 Scal`（8 文件）在 collectWires 内可拿到当时符号值。
- 测试（m4/m6）：`SY a=1, b=a*2` → b=2；`SY X=2` + `SY X=X*3` → X=6；`SY DE=…, DE=DE*8`（Equations 真实文件）；`LoopCirc20.nec` 12 根导线**唯一几何组合数 > 1**；`3vertical.nec` 多 EX 相位按位置生效；`SY Inp=mm` → 0.001。

### 批次 3（P2：卡片层 + 统一）

#### 2-3-C1 字段切分与注释截断（`splitCardFields` / `stripComment`）

- `stripComment(line)`：按最早出现的 `'`、`!`、`‘ ’ “ ”` 截断（全扫描器统一使用，修 `EFHW_10M_80M_VK3IL.nec` 弯引号/变码）。
- `splitCardFields(cleanLine)`：
  1. 按 `[\s,]+` 切 token；
  2. **非 ASCII token 视为注释起始**，截断（数值卡字段不可能含非 ASCII）；
  3. **合并**：token 恰为运算符（`+ - * / ^`）或**前一 token 以运算符结尾** → 并入前一字段；token 是单位字且前一字段为数值/表达式 → 并入（`-68 ft`）；
  4. 返回 `{card, fields}`；各卡期望字段数表 `GW 10 / GC 7 / GM 10 / GX 3 / GS 4 / EX 6 / LD 7 / FR 6`（不足即从宽处理，超出 → `n2m.card.fieldShape` 告警）。
- 覆盖语料 26 个异常文件：`2lsloper.nec`/`G5RV.nec`（`-68 ft`）、`40M_moxon-beam.nec`（`gap/2 + x1`）、`20M_OblongLoop_12mPole.nec`（`A + H`）、`vert_dipole_array_trans_line.nec`（`H + L/2 - 0.05`）、`2J2M-166.NEC` 系列（`D/2 - g/2`）、`EFHW…`（弯引号）等。
- 风险控制：只对"运算符/前导运算符结尾/单位字"三类合并；9 字段 GW（半径空白）保持原样（GC 锥度路径）；字段数异常文件全部纳入 §4 语料定点清单。

#### 2-3-C2 `NS=0` / `CW` / `NX`

- `GW NS=0`（3 文件）：按 NEC 语义**不生成线段**，`addNote(notes,'n2m.gw.ns0',{tag})`。
- `CW`（1 文件）：`collectWires` 新增分支 → `addNote(notes,'n2m.cw.unsupported',{count})`（聚合计数）；不再静默丢线。
- `NX`（3 文件）：所有扫描器（`parseHeaderCards`/`collectWires`/`parseExcitation`/`parseLoads`）遇 `NX` 即**停止读入**并 `addNote(notes,'n2m.nx.multiDataset')`（一次）；避免两个数据集合并。

#### 2-3-C3 `EX/LD` 段定位：tag=0 绝对段号 + 多导线同 tag 段组

```js
// utils.js
function locateSegment(wires, tag, mStr, symbols) {
    const m = Math.round(evalExpr(mStr, symbols));
    if (tag === 0) {                       // NEC: I2=0 ⇒ I3 为绝对段号（按段排列，从 1 起）
        let acc = 0;
        for (let i = 0; i < wires.length; i++) { acc += wires[i].ns; if (m <= acc) return { wireIdx: i, seg: m - (acc - wires[i].ns) }; }
        return null;                       // 越界 → 告警
    }
    const idxs = wires.map((w,i)=>[w,i]).filter(([w])=>w.tag===tag).map(([,i])=>i);   // 同一 tag 可跨多根（GR/ITGI=0）
    let acc = 0;
    for (const i of idxs) { acc += wires[i].ns; if (m <= acc) return { wireIdx: i, seg: m - (acc - wires[i].ns) }; }
    return idxs.length ? { wireIdx: idxs[0], seg: m } : null;
}
```

- `parseExcitation` / `parseLoads` 用 `locateSegment` 取代 `findIndex`；越界/未命中 → `n2m.tag.notFound` 告警（新增键）+ 跳过该源/负载（不再静默）。
- `getMmanaPos` 仍接收"该导线内段号"。
- 测试：`EX 0 0 2 0 1 0`（tag=0，绝对段号 2 → 第二根导线）；多根同 tag（`GR 0 6` 形态）内第 m 段定位；越界告警。

#### 2-3-C4 `GR` 旋转复制（D7）

```js
// geometry.js — GR ITGI NR：绕 z 轴复制 NR 份（含原作），相邻 360/NR，tag 每份 +ITGI
} else if (parts[0] === 'GR') {
    const itg = parseInt(evalExpr(fields[1], symbols)) || 0;
    const nr  = parseInt(evalExpr(fields[2], symbols)) || 0;
    if (nr > 1) {
        if (nr * wires.length + wires.length > 200000) addNote(notes,'n2m.gm.budget',{nrpt:nr,n:wires.length,budget:200000});
        else { const snap=[...wires]; for (let j=1;j<nr;j++) for (const w of snap) { const c=rotZ(w,j*360/nr); if (w.tag!==0) c.tag=w.tag+itg*j; wires.push(c); } }
    }
}
```

- 复用现有 GM 旋转矩阵（Rz）与预算护栏；`ITGI=0`（语料常见）→ 各份 tag 相同。
- 36 个 GR 文件从"崩溃/仅告警"变为**几何完整**；`n2m.alert.geomCards` 名单移除 `GR`（`GA/GH/SP/SM` 保留）。
- 测试（m3/m7）：`GR 10 4` 4 根、第 2 根转 90°、tag=11/21/31（审计用例 11）；`10-30m-box.nec` 不抛异常且导线数 = 预期。

#### 2-3-C5 告警集合统一（D10 后半）

- 重构 `extract.js` 为 **`parseNec(text)`（纯解析，无 UI/无弹窗）** + `extractFromNec(text, showPrompts)`（= parseNec + UI 填充 + 按序弹窗）：
  - `parseNec` 返回 `{ lines, symbols, header, wires, ex, ld, displayNotes, fileWarnings, blockers }`；
  - `displayNotes`：结构化 `{key,params}`（屏显 `L()`）；`fileWarnings`：写入输出的英文串（`LF()` 渲染 + 既有历史字面量条目）；两者由同一解析过程填充（`addNote` 双写），**顺序即现有告警顺序契约**；
  - `blockers`：`n2m.gs.bad` 等致命项（供 convert 阻断）。
- `executeConvert`：开头 `try { r = parseNec(文本) } catch → parseError`；`r.blockers` → 告警 + return；`N2M.state.unsupportedErrors = r.fileWarnings.slice()`（**先重置再填充**，消除跨文件污染）；源/负载仍取 UI 输入框（保留用户编辑）。
- 效果：**先加载再转换** 与 **直接粘贴后转换** 写出的 Warnings 完全一致；"几何卡不完整"等关键告警不再只在加载路径出现。
- 测试（m5/m7）：同一文本两条路径 `Warnings` 段逐字节相等；连续两个不同文件转换无残留告警。

### 批次 4（v0.7 版本与发布，D8）

1. `node tools/bump_version.js v0.7`（自动：index/语言包/writer/测试版本标记 + 归档旧基线 + 重生成 723 基线 + 跑 r19/sf2/r21/i18n_lang）；先 `--dry-run` 预演。
2. 手工补写（脚本结尾清单）：`AGENTS.md`（顶部声明/规则 4 基线快照/§5 测试说明/§6 状态条目/版本史）、`README.md` + `README.en.md`（历史表/页脚/断言计数）、新建 `docs/发布归档_v0.7.md`、`backups/README.md`。
3. 全量回归：20 个活跃套件（17 旧 + 新 3）全绿；N2M 语料定点清单（§4）通过。

---

## 3. 语言包增量（zh/en 双写；规则 6）

| 键 | zh | en |
|---|---|---|
| `n2m.expr.evalFailed` | `[错误] 表达式求值失败（{where}，共 {count} 处）：{list}；相关几何/参数已跳过，请人工核查！` | `[Error] Expression evaluation failed ({where}, {count} place(s)): {list}; affected geometry/parameters were skipped — please verify manually!` |
| `n2m.gw.radUnparsed` | `[错误] GW 卡半径无法解析（tag {tag}，表达式 "{expr}"），该导线已跳过。` | `[Error] GW radius could not be evaluated (tag {tag}, expression "{expr}"); the wire was skipped.` |
| `n2m.gw.ns0` | `[提示] GW 卡 NS=0（tag {tag}）按 NEC 语义不生成线段，已跳过。` | `[Note] GW with NS=0 (tag {tag}) generates no segments per NEC; skipped.` |
| `n2m.card.fieldShape` | `[提示] {card} 卡字段数异常（{n} 个，期望 {expect}），已按宽松合并解析，请人工核查。` | `[Note] {card} has an unusual field count ({n}, expected {expect}); parsed leniently — please verify manually.` |
| `n2m.cw.unsupported` | `[提示] CW 卡（悬链线，NEC-4）不支持：共 {count} 根已跳过，几何不完整，请人工处理。` | `[Note] CW catenary wires (NEC-4) are unsupported: {count} skipped; model incomplete — please handle manually.` |
| `n2m.nx.multiDataset` | `[提示] 检测到 NX 卡（多数据集文件）：仅转换第一个数据集，其后内容已忽略。` | `[Note] NX card found (multi-dataset file): only the first dataset is converted; the rest is ignored.` |
| `n2m.gs.segRange` | `[提示] GS 卡段范围缩放（I1={i1}, I2={i2}）不支持，该卡未应用（XNEC2C 生成形态）。` | `[Note] GS segment-range scaling (I1={i1}, I2={i2}) is unsupported; this card was not applied (XNEC2C form).` |
| `n2m.tag.notFound` | `[提示] {card} 段定位失败（tag {tag}, 段 {seg}），该条目已跳过。` | `[Note] {card} segment lookup failed (tag {tag}, segment {seg}); the entry was skipped.` |
| `ui.alert.parseError` | `文件解析失败：{msg}` | `Failed to parse the file: {msg}` |
| `n2m.gs.bad`（**改文案**） | `[错误] GS 卡缩放因子无法解析（{raw}）：为避免尺度错误，已阻断本次转换，请修正后重试！` | `[Error] GS scale factor could not be parsed ({raw}): conversion was blocked to avoid a wrong scale — please fix and retry!` |

> 注：`n2m.gw.gcTaper` 文案与键保持不变（半径空白/0 的真锥度场景）；AWG/求值失败走 `n2m.gw.radUnparsed` 与 `n2m.expr.evalFailed`，实现审计 §4.4 要求的"告警区分"。

---

## 4. 测试与回归计划

### 4.1 新增套件

| 套件 | 覆盖 |
|---|---|
| `tests/m6_expr_sy.js` | 表达式层（§2-2-B1 全部用例表）+ SY 层（一卡多声明/卡内顺序/交错重定义/LoopCirc20/3vertical/Equations 真实文件）+ 隐式乘法 + 护栏 |
| `tests/m7_cards_gs.js` | GS 裸单位/顺序/段范围/阻断；NS=0；CW；NX；tag=0 与多导线段组；GR；字段切分（26 文件定点）；告警统一（两路径 Warnings 相等）；app.js 兜底 |
| `tests/m8_corpus_fixedpoint.js` | 语料定点清单 + 全量阈值（依赖 `F:\Antenna_Models`） |

### 4.2 语料定点清单（m8，真实文件 → 期望）

| 文件 | 期望 |
|---|---|
| `10-30m-box.nec`（GR） | 不抛异常；导线数 = 24+8+8…（以修复后实测固化）；`geomCards` 不含 GR |
| `137Mhz-QFHA1.nec`（GH）/ `gs_8d_bb.nec`（SP） | 不抛异常；geomCards 告警含 GH/SP |
| `G4CQM/144NX13S.nec`（`GS 0 0 mm`） | 缩放 0.001（`D1P=449` → 0.449） |
| `bev80.nec`（`#18/ft` + `GS 0 0 ft`） | 4 根导线，半径 ≈ 0.000512 m |
| `Rhomb1.nec`（`#12/ft`）/ `2el160flag.nec`（`#12`） | 导线数 > 0，半径 ≈ 0.001026 m |
| `2M_4EL_HIGHGAIN_QUAD.nec`（前导零） | 16 根，零长 = 0 |
| `LoopCirc20.nec`（交错 SY） | 12 根，唯一几何组合数 > 1 |
| `Nec4/Catenary.nec`（CW） | 0 根 + `n2m.cw.unsupported` |
| `Gr_func.nec`（NX） | 仅第一个数据集 + `n2m.nx.multiDataset` |
| `40m_vert_compromised.nec`（NS=0） | 少 1 根 + `n2m.gw.ns0` |
| `2lsloper.nec` / `G5RV.nec` | 字段合并成功（`-68 ft`），坐标 = ±68×0.3048 |
| `40M_moxon-beam.nec` / `20M_OblongLoop_12mPole.nec` / `vert_dipole_array_trans_line.nec` | 字段合并成功，无 `card.fieldShape` 误报 |
| `EFHW_10M_80M_VK3IL.nec`（弯引号 + SQR/ATN） | 无异常；导线数 > 0 |
| `G0KSC_50MHz…SC0605SM.NEC`（`0.5D1`） | 半径 = 0.006 |
| `4nec2_models/Equations/4elQuad.nec` | `Wr > 0`、几何非塌缩（`^`/LOG/多声明全链） |
| `2J2M-166.NEC`（`D/2 - g/2`） | 字段合并成功 |
| 全量阈值（2493 文件） | **崩溃 0**（现 68）；**全零长文件 ≤ 5**（现 27）；含零长文件 ≤ 15（现 101）；AWG 28 文件导线数全部 > 0；`GS 0 0 mm` 92 文件无 `gs.bad` |

### 4.3 既有测试更新（行为变化即失败，须同步断言并注明批次）

| 套件 | 更新点 |
|---|---|
| `m2_state_utils.js` | `parseGsScale('XYZ')` → NaN；新增 MM/CM/2*ft 断言；evalExpr 失败 → NaN；`^`/SQR 等新增 |
| `m3_geometry.js` | `collectWires` 签名（去 globalScale）；GS 就地缩放语义；GS×GM 断言改写；新增 NS=0/CW/NX/GR/字段合并/求值失败跳过 |
| `m4_extract.js` | 含 GR 不抛异常 + geomCards 告警；SY 顺序求值；tag=0；告警顺序（新增键插入点） |
| `m5_convert_app.js` | GS 失败阻断；两路径 Warnings 一致；parseError 兜底 |
| `r19/sf2/r21` | 由 `bump_version.js` 自动同步 v0.7 版本断言（sf1 键转义用例保持通过） |
| `i18n_lang.js` | 词条数自动增长（>150 断言不变），zh/en 键集与占位符对齐自动校验 |

---

## 5. 风险与缓解

| # | 风险 | 缓解 |
|---|---|---|
| R1 | `evalExpr` 失败语义 0→NaN 波及全部调用点 | §2 已逐点列出处理（几何跳过、GS 阻断、FR/GN/EX/LD 跳过+告警）；保留 `getMmanaPos` 既有 `!isFinite → 0` 路径；输出前加非有限值终检（防御） |
| R2 | SY 顺序求值改变 98 文件输出 | 语料前向引用≈0；LoopCirc20 等定点断言；N2M 无 hash 基线 → m8 定点清单锁定新行为 |
| R3 | 字段合并误合并 | 仅三类合并规则 + 字段数校验 + 告警；26 个异常文件全部定点回归；9 字段 GW 原样保留 |
| R4 | 顺序 GS 与既有 m3 断言冲突 | 明确改写断言并记录语义（GM 在 GS 后按新单位、不缩放）；语料无其他可观察差异（§1.2-④） |
| R5 | 告警统一重构触碰顺序契约 | `displayNotes` 顺序 = 现有契约顺序，逐条对照 `extract.js:8-9`；m4/m5 顺序断言回归 |
| R6 | 版本升级触发 723 基线重生成 | `bump_version.js --dry-run` 预演；N2M 改动不影响 M2N 输出，仅 CM 行变化；旧基线自动归档 `.v06baseline.json` |
| R7 | 大批量改动失控 | 4 批次停等确认（规则 2）；每批前 `backups/*.necparse<批次>.bak`；每批后全量套件 |

---

## 6. 不纳入本批（后续项，保持现状或另行立项）

| 项 | 说明 |
|---|---|
| LD 类型编号与 NEC-2 手册差异（AGENTS §3 遗留②） | 需 4NEC2 实测裁决，本批不动（m4 断言按项目编号固化） |
| GN εr/σ（F1/F2）与第二介质（遗留③） | 本批仅保持地面类型映射；εr/σ 仍由 MMANA 侧预设替代 |
| `SP/SM/SC` 面片几何 | 保持"明确不支持 + 告警"（MMANA 无线面等价物） |
| `CW` 悬链线展开 | 仅告警（1 文件）；如需忠实几何单独立项 |
| `GA/GH` 圆弧/螺旋展开、`GH` NEC-2/NEC-4 语义判定 | 单独立项（涉及选项/询问 UI） |
| 完整表达式解析器（分词+优先级，替代正则预处理） | 本批用"保守增强 + 配平扫描"覆盖语料；解析器重写留待后续 |
| P0 T5 4NEC2 实测（AGENTS §3） | 不变，仍需实机验证（`50%`/`100%`、表达式求值、子段锚点） |

---

## 7. 实施顺序与验收标准

| 批次 | 内容 | 验收标准 |
|---|---|---|
| 1 | §2-1（A1–A4） | 含 GR 文件导入不崩溃且告警；`GS 0 0 mm` → 0.449；GS 失败阻断；异常兜底弹窗；m2/m3/m4/m5 全绿（更新断言） |
| 2 | §2-2（B1–B2） | 表达式用例全过；Equations/LoopCirc20/3vertical 定点通过；17 套件全绿 |
| 3 | §2-3（C1–C5） | 26 个字段异常文件、NS=0/CW/NX、tag=0、GR、告警一致用例全过；17 套件全绿 |
| 4 | §2-4 + §4 | v0.7 标记全同步；723 基线重生成；20 套件全绿；m8 全量阈值达标；文档四件套更新 |
| 全 | 规则 2/5/6/7/8 | 每批备份可查；zh/en 键集对齐；双 README 同步；版本脚本记录完整 |

> 实施完成后回写：`AGENTS.md` §6 状态条目、`docs/开发历史日志.md`、`backups/README.md`、`docs/发布归档_v0.7.md`。

---

## 附录 A：本次复核关键实测输出（摘要）

```
evalExpr('3^2')=1            evalExpr('SQR(9)')=0        evalExpr('ATN(1)')=0
evalExpr('INT(3.7)')=0       evalExpr('LOG10(100)')=0    evalExpr('#12')=0
evalExpr('+00.27685')=0      evalExpr('0021')=17         evalExpr('27.5ft')=0
evalExpr('PITCH')=undefined  evalExpr('ASIN(0.5)')=0     evalExpr('0.5D1')=0
parseGsScale('MM')={val:0,unit:'M'}     parseGsScale('CM')={val:0,unit:'M'}
parseGsScale('IN')=0.0254               parseGsScale('2*ft')={val:0,unit:null}
GS 0 0 mm 全链: {gsBad:'MM', scale:1, x2:449}      ← 期望 0.449
含 GR 文件: extractFromNec → THROW TypeError: Cannot read properties of undefined (reading 'push')
GW NS=0: 生成 2 根（期望 1）；NX: 合并 2 根（期望 1）；CW: 0 根 + 0 告警（静默）
AWG #12: 0 根 + gcTaper 告警（误导）；EX tag=0: 源被静默丢弃（回退默认 w1c）
语料：GS 0 0 mm 92 / AWG 28 / 前导零 22 / SY 在 GW 后 98 / CW 1 / NX 3 / GR 36 / NS=0 3
      真隐式乘法 1 文件（D1 已定义）；Fortran D 指数 0；前向引用 2 例均为 CE 注释误报
      GS 在末张 GW 前 3 文件（均 XNEC2C 段范围形态）；GM 在 GS 后 3 文件（含 1 个 GS 1.0 无操作）
```

## 附录 B：批次备份与回滚

- 备份命名：`backups/<file>.necparse<批次号>.bak`（如 `utils.js.necparse2.bak`），由 `Copy-Item` 或 Node `fs.copyFileSync` 完成（二进制安全）。
- 回滚：`Copy-Item backups/<file>.necparse<批次号>.bak js/<file>`；测试与语言包同理。
- 每批次结束时在批次记录中登记：改动文件清单、测试结果、残留风险。

---

## 8. 实施记录（2026-09-24，无人值守，v0.7 发布）

### 8.1 批次执行结果

| 批次 | 内容 | 结果 |
|---|---|---|
| 1 | P0：extract 崩溃 / parseGsScale 重写 / GS 顺序语义+阻断 / app.js 兜底 | m2 35 / m3 32 / m4 27 / m5 28 / sf1 19 全绿 |
| 2 | P1：evalExpr 重构 / applySyDecl 顺序求值 / 调用点迁移 | 新增 m6_expr_sy 64 全绿；17 套件回归全绿 |
| 3 | P2：splitCardFields / NS=0 / CW / NX / tag=0 / GR / parseNec 告警统一 | 新增 m7_cards_gs 35、m8_corpus_fixedpoint 28 全绿 |
| 4 | v0.7 版本标记 + 723 基线重生成 + 文档四件套 | bump_version 自动流程通过；20 套件 516 断言全绿 |

### 8.2 实施期补充决策 / 偏差（3 项）

1. **GS 顺序语义的用例形态修正**：GS 只缩放“此前已读入”的几何——测试用例须把 GS 放在其缩放的几何之后（语料 370 个 GS 文件中 365 个在末张 GW 之后、0 个在首张 GW 之前）。审计报告 §7.2 示例（GS 前置）与 NEC-2 语义不符，m3/m5 用例已按真实形态改写。
2. **splitCardFields 合并容错仅在“字段数 > 期望值”时启用**：否则 `GS 0 0 mm` 的裸单位字段会被并入前一字段（0mm）→ 回归。字段数正常的行零改动，降低误合并风险。
3. **`^` 改写与函数替换的顺序**：`^`→`Math.pow` 必须最先（且在符号替换后）；`\bPI\b` 必须先于 ATN/ASIN/ACOS/SIN 重写（否则插入的 `Math.PI` 被二次替换成 `Math.Math.PI`）。

4. **交付前独立审查（只读子代理复核 12 项，修复 11 项）**：① EX F1/F2 求值失败产出 NaN 源行 → 新增 EX 非有限值门禁 + N2M 侧非有限值终检（补 R1 同款）；② NX 告警在 fileWarnings 重复 → 单一来源（collectWires）；③ `2^3.5E-3` 科学计数法操作数被截断 → rewritePow 两侧操作数支持 E±指数；④ `^` 护栏耗尽后遗留字面量被 new Function 按位异或静默出错值 → 改为 NaN；⑤ 多字符符号后接带符号数被误抑制隐式乘法（`2D1-3`）→ 仅单字母 E/D 保留指数保护；⑥ EX/LD 的独立 `+/-` 被误合并为表达式 → 运算符合并容错限定 GW/GC/GM/GX/GS；⑦ LD「值+空格+电学单位」（`60.7 uh`）未合并致行被丢弃 → 单位合并集补 UH/MH/PF/NF/UF/NH；⑧ GN 类型求值失败静默保持默认 → 新增 `n2m.gn.bad` 告警；⑨ `EX 0 1 0.5` 小数段号丢失百分比语义 → locateSegment 识别 0<seg<1；⑩ M2N 重新提取按钮缺 try/catch → 补齐；⑪ 文档漂移（见下条）。
5. **告警键参数形态与 parseNec 返回结构（与 §2 设计的差异）**：`n2m.expr.evalFailed` 实际使用 `{where}/{expr}`（每次失败一条，未做 count/list 聚合，i18n 文案与代码一致）；`parseNec` 返回单一 `fileWarnings` 集合（未实现 displayNotes/blockers 双数组；GS 阻断通过扫描 `gmNotes` 中的 `n2m.gs.bad` 实现）。
6. **未修复 1 项（记录待 4NEC2 实测）**：GS 语义与 `.kilo/skills/nec-input-parsing/SKILL.md` 验证用例 #1 的差异——skill §2.3 称「其后读入的几何按新单位解释」，用例 #1 又称「其后的 GW 也按新系数缩放」（两者自相矛盾）；本实现按裁决 D4「缩放此前几何」（与 NEC-2 手册/nec2c 一致；语料 370 个 GS 文件无可观察差异：365 个 GS 位于末张 GW 之后、0 个位于首张 GW 之前）→ 列入 T5 4NEC2 实测清单。
### 8.3 实施期额外发现并修复的语料形态（审计报告未列，3 项）

| 形态 | 文件面 | 修复 |
|---|---|---|
| 卡名与首字段粘连（`GW1,8,-1.,0.,...`；老 ARRL 风格） | DIP.NEC、LFA-Q、OBLONG、G0KSC 432MHz 等 | splitCardFields 拆 `^[A-Z]{2}[0-9+\-.]` 前缀（恢复几何，原 0 根） |
| 变码注释（CP1251 弯引号被读成 â，值后未截断） | EFHW_10M_80M_VK3IL.nec 等 | stripComment 增“首个非 ASCII 字符截断”（6 根导线恢复） |
| `SY X=135 ft`（值 + 空格 + 单位） | 2lsloper.nec 等 | replaceLengthUnits 按 token 边界替换并对值后补乘号 |

### 8.4 终态验收数据

- **N2M 语料（2493 文件）**：崩溃 68→**0**、全零长文件 27→**0**、含零长文件 101→**0**、GS 解析失败 92→**0**、无导线 75→**25**（CW/SP/GH/GA/GC 锥度/空文件等合理情形）
- **定点**：`GS 0 0 mm`→0.449（144NX13S）、`#18/ft`→0.512mm（bev80）、前导零 16 根无零长（2M_4EL_HIGHGAIN_QUAD）、交错 SY 12 根唯一几何（LoopCirc20）、CW 告警（Catenary）、GR 19 根（10-30m-box）、`0.5D1`→0.006（G0KSC 50MHz）、`GW1,8,`→1 根（DIP.NEC）
- **回归**：20 套件 516 断言全绿；723 文件 hash 基线重生成 0 漂移；语言包 zh/en 210 词条键集对齐
- **备份**：`*.necparse1.bak`（全部改动前）、`*.necparse3.bak`（批次 3 后）、`*.<v0.6>bump.bak`（版本标记前）

### 8.5 未纳入（保持后续项）

LD 类型编号与 NEC-2 手册差异（需 4NEC2 实测裁决）、GN εr/σ 与第二介质、`GA/GH/SP/SM/CW` 展开、`GH` NEC-2/NEC-4 同名不同义判定、完整表达式解析器、P0 T5 4NEC2 实测——见 §6 与 `docs/发布归档_v0.7.md` §6。
