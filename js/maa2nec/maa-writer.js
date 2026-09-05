// maa-writer.js — NEC 输出层（R2）
// v0.5 i18n-4: warnings 结构化条目 {key, params} — 屏显/告警数组视图; CM 卡输出恒英文 (B1, ASCII 终检)
//   版本标记 v0.4 → v0.5 (D4)
// 卡序: CM(头,英文摘要) → SY(一卡一参) → GW(段1, 0.5*Dn, z+h) → GE → EX(百分比锚) → LD(表达式) → GN → FR → EN
// 强制: 纯 ASCII 输出 (终检断言); /2 一律 *0.5
// 依赖: maa-parser.js / maa-symbols.js (同目录, 经全局函数引用)

    function writeMaaToNec(parsed, fileName) {
        // ---- R21: 锥度振子重建 (默认开启; 未锥度文件 wires 为原引用, 字节不变) ----
        const rebuilt = expandTaperedWires(parsed.wires, parsed.taperDefs, parsed.warnings);
        parsed.taperRebuilt = rebuilt;   // app 层汇总提示用 (不参与输出)

        // ---- SF1-R1: 有限值门禁 (NaN/Infinity/半径下溢 → 告警+拦截, 不产出非法 NEC) ----
        //   覆盖: 频率 / 导线坐标与半径 (含锥度重建子段) / 负载数值
        const r1Errors = [];
        const freqNum0 = parseFloat(parsed.freq);
        if (!isFinite(freqNum0) || freqNum0 <= 0) r1Errors.push({ key: 'm2n.freqNan', params: { freq: parsed.freq } });
        rebuilt.wires.forEach((w, i) => {
            const id = w.origIdx ? LF('m2n.wireSub', { idx: w.origIdx }) : LF('terms.wire') + ' ' + (i + 1);
            if (![w.x1, w.y1, w.z1, w.x2, w.y2, w.z2, w.rad].every(isFinite)) {
                r1Errors.push({ key: 'm2n.wireNan', params: { id } });
            } else if (w.rad >= 0 && w.rad < 1E-9) {
                parsed.warnings.push({ key: 'm2n.wireRadZero', params: { id, rad: w.rad } });
            }
        });
        (parsed.loads || []).forEach((ld, i) => {
            const vals = ld.type === 'lc' ? [ld.L_uH, ld.C_pF, ld.Q] : (ld.type === 'rjx' ? [ld.R, ld.X] : []);
            if (vals.some(v => v !== undefined && !isFinite(v))) r1Errors.push({ key: 'm2n.loadNan', params: { n: i + 1, desig: ld.desig || ld.type } });
        });
        if (r1Errors.length > 0) {
            parsed.warnings.push({ key: 'm2n.r1Block', params: { errs: r1Errors.map(e => LF(e.key, e.params)).join('; ') } });
            throw new Error(LF('m2n.r1Throw', { errs: r1Errors.slice(0, 3).map(e => LF(e.key, e.params)).join('; ') }));
        }

        const { syCards, radToD } = buildMaaSymbols({ ...parsed, wires: rebuilt.wires });
        const out = [];

        // ---- 面板覆盖参数 (R5): 标题/频率/坐标/epsr/源/负载 ----
        const freqVal = parsed.freq ? String(parseFloat(parsed.freq)) : '0';
        const axisSwap = parsed.axisMap === 'swap';
        // 源/负载覆盖 (文本框行优先于解析结果)
        const sources = (parsed.sourceOverrides && parsed.sourceOverrides.length) ? parseOverrideSources(parsed.sourceOverrides, parsed.wires, parsed.warnings) : parsed.sources;
        const loads = (parsed.loadOverrides && parsed.loadOverrides.length) ? parseOverrideLoads(parsed.loadOverrides, parsed.wires, parsed.warnings) : parsed.loads;

        // ---- CM 头 (英文摘要) ----
        // R18/R19: .maa 原 title 独立成第一条 CM 卡; "Converted from" 行不再拼接标题(避免重复);
        //   cmTitleOverride = 用户自定义/按原文件标题模式的面板值 (R18: 文件名模式/空 → 空串)
        // SF1-S3: 标题/override/文件名统一单行净化 (控制字符含 \n 折叠为空格) — 防 CM 卡换行注入伪造卡
        // SF1-R2: 原标题卡同注释 70 字符截断 (超长标题部分 NEC 工具会截断)
        const oneLine = (s) => String(s).replace(/[\x00-\x1F]+/g, ' ').trim();
        const maaTitle = parsed.title && parsed.titleAscii ? oneLine(parsed.title) : '';
        let cmOverride = (parsed.cmTitleOverride !== undefined && parsed.cmTitleOverride !== null)
            ? oneLine(parsed.cmTitleOverride) : '';
        if (maaTitle) out.push(`CM ${maaTitle.length > 70 ? maaTitle.slice(0, 69) + '~' : maaTitle}`);   // 第 1 条: .maa 原标题 (≤70)
        out.push(`CM Converted from ${oneLine(fileName || 'antenna.maa')} by NEC2MAA v0.5.${cmOverride ? ' ' + cmOverride : ''}`);
        const seg = parsed.segParams;
        out.push(`CM Original: ${describeSegModes(parsed)}${seg ? ` dm1=${seg.dm1} dm2=${seg.dm2} sc=${seg.sc} ec=${seg.ec}` : ''}. Wires: ${parsed.wires.length}. Sources: ${parsed.sources.length}. Loads: ${parsed.loads.length}.`);
        if (rebuilt.expanded) {
            out.push(`CM Tapered wires: ${rebuilt.expandedFrom} original(s) expanded to ${rebuilt.expandedTo} connected GW sections (per $$$ taper table).`);
            parsed.warnings.push({ key: 'm2n.taperRebuilt', params: { from: rebuilt.expandedFrom, to: rebuilt.expandedTo } });
        }
        // 地网/材料信息 (2026-09-02 语义修正): G/H 第3字段 M=材料序号(0无损/1Cu wire/2Cu pipe/3Al wire/4Al pipe…) — 非地网数
        // 0=无损不提示不加LD; >0 提示在4NEC2自设材料 (材料参数数值未知, 不本工具处理)
        if (parsed.ground && parsed.ground.material > 0) {
            parsed.warnings.push({ key: 'm2n.materialHint', params: { m: parsed.ground.material } });
            out.push(`CM Material: M=${parsed.ground.material} (0=no-loss/1=Cu wire/2=Cu pipe/3=Al wire/4=Al pipe...); set wire material manually in 4NEC2.`);
        }
        out.push(`CM Note: all segments set to 1. NEC auto segmentation must be enabled.`);
        if (parsed.forceSeg) {
            out.push(`CM Forced segmentation: ${parsed.segDensity} segs/wavelength.`);
        }
        if (parsed.droppedNonAscii.title || parsed.droppedNonAscii.commentLines > 0) {
            const parts = [];
            if (parsed.droppedNonAscii.title) parts.push('title');
            if (parsed.droppedNonAscii.commentLines > 0) parts.push(`${parsed.droppedNonAscii.commentLines} of ${parsed.droppedNonAscii.totalCommentLines} comment line(s)`);
            out.push(`CM Dropped non-ASCII content: ${parts.join(', ')} (kept in source .maa only).`);
        }
        // 纯英文注释摘要 (≤70 字符截断)
        for (const c of parsed.comments) {
            if (c && /^[\x20-\x7E]+$/.test(c)) {
                const trimmed = c.length > 70 ? c.slice(0, 69) + '~' : c;
                out.push(`CM ${trimmed}`);
            }
        }
        out.push('CE');

        // ---- SY (一卡一参; 频率取覆盖值) ----
        for (const s of syCards) out.push(s === syCards[0] && parsed.freq ? `SY f=${freqVal}` : s);
        // 频率覆盖: buildMaaSymbols 用 parsed.freq (已是覆盖后的值), 此行确保首卡同步

        // ---- GW (R14: 强制分段 → 按密度 ceil(len·ρ/λ); 未勾选 → 段数 1 交 NEC 自动分段; R21: 遍历重建子段) ----
        const freqNum = parseFloat(freqVal) || 0;
        for (let i = 0; i < rebuilt.wires.length; i++) {
            const w = rebuilt.wires[i];
            const dName = radToD[w.rad];
            const radField = dName ? `0.5*${dName}` : String(w.rad);
            const x1 = axisSwap ? w.y1 : w.x1, y1 = axisSwap ? w.x1 : w.y1;
            const x2 = axisSwap ? w.y2 : w.x2, y2 = axisSwap ? w.x2 : w.y2;
            let segCount = 1;
            if (parsed.forceSeg && freqNum > 0 && parsed.segDensity > 0) {
                const len = Math.sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1) + (w.z2-w.z1)*(w.z2-w.z1));
                const lambda = 299.7925 / freqNum;   // metres
                segCount = Math.max(1, Math.ceil(len * parsed.segDensity / lambda));
            }
            out.push(`GW ${i + 1}, ${segCount}, ${num(x1)}, ${num(y1)}, ${nz(w.z1)}, ${num(x2)}, ${num(y2)}, ${nz(w.z2)}, ${radField}`);
        }

        out.push('GE 1');

        // ---- EX (百分比锚定; 覆盖源; R21: 锥度线 segField 含子段定位 "tag, seg") ----
        for (const s of sources) {
            let tag = 0, segField = '', re = 0, im = 0;
            if (s.type === 'desig') {
                tag = s.wire;
                segField = anchorToSegField(s.anchor, s.offset, parsed.wires[s.wire - 1] ? parsed.wires[s.wire - 1].segRaw : null, parsed.warnings, s.desig, true, rebuilt.origToSubs[s.wire - 1], rebuilt.wires.length);
                const ph = s.phase * Math.PI / 180;
                re = s.mag * Math.cos(ph); im = s.mag * Math.sin(ph);
            } else if (s.type === 'numA') {
                tag = s.wire;
                const wr = parsed.wires[s.wire - 1];
                const n = wr && parseInt(wr.segRaw) > 0 ? parseInt(wr.segRaw) : null;
                if (n && s.seg > 0) segField = `${Math.round(s.seg / n * 1000) / 10}%`;
                else segField = '50%';
                const ph = s.phase * Math.PI / 180;
                re = s.mag * Math.cos(ph); im = s.mag * Math.sin(ph);
            }
            if (tag >= 1 && tag <= rebuilt.wires.length) {
                out.push(formatExLine(tag, segField, re, im, rebuilt));
            } else {
                parsed.warnings.push({ key: 'm2n.sourceOutOfRange', params: { tag, total: rebuilt.wires.length, desig: s.desig || s.type } });
            }
        }

        // ---- LD (覆盖负载; 手动 epsr) ----
        loads.forEach((ld, i) => {
            const n = i + 1;
            const segField = anchorToSegField(ld.anchor, ld.offset, parsed.wires[ld.wire - 1] ? parsed.wires[ld.wire - 1].segRaw : null, parsed.warnings, ld.desig, false, rebuilt.origToSubs[ld.wire - 1], rebuilt.wires.length);
            const [ldTag, ldSeg] = splitSegField(segField, ld.wire, rebuilt);
            if (ld.type === 'lc') {
                const rField = ld.Q > 0 ? `2*PI*f*L${n}*1E-6/Q${n}` : '0';
                out.push(`LD 1, ${ldTag}, ${ldSeg}, ${ldSeg}, ${rField}, L${n}*1E-6, C${n}*1E-12`);
            } else if (ld.type === 'rjx') {
                out.push(`LD 3, ${ldTag}, ${ldSeg}, ${ldSeg}, R${n}, X${n}`);
            } else if (ld.type === 'A6') {
                // Variant A 六字段: wire, seg, R, X, L, C → LD 1 (R,X 为串联电阻/电抗, L/C 单位已是 H/F? 普查未见, 保守原值直出)
                out.push(`LD 0, ${ldTag}, ${ldSeg}, ${ldSeg}, ${num(ld.R)}, ${num(ld.L)}, ${num(ld.C)}`);
                parsed.warnings.push({ key: 'm2n.a6', params: { lineNo: ld.lineNo } });
            } else if (ld.type === 'sparam' || ld.type === 'unknown') {
                // 不写入 (警告已在 parser 聚合)
            }
        });

        // ---- GN (σ/εr 全来自面板手动填入; R11: 自动推导 deriveEpsr 已移除, 拦截在 executeConvertM2N 保证真实地 σ/εr 已填全) ----
        if (parsed.ground && parsed.ground.gtype !== 0) {
            if (parsed.ground.gtype === 1) out.push('GN 1');
            else {
                const necType = parsed.ground.gtype === -1 ? 2 : 0;
                const epsr = parsed.groundEpsrManual || 13;
                const sigma = (parsed.ground.sigma_mS || 0) / 1000;
                out.push(`GN ${necType}, 0, 0, 0, ${epsr}, ${sigma}`);
            }
        }

        // ---- FR (频率取覆盖值) ----
        out.push(`FR 0, 1, 0, 0, ${freqVal}, 0`);
        out.push('EN');

        // ---- ASCII 终检 (防御断言) ----
        const text = out.join('\n');
        if (/[^\x20-\x7E\n]/.test(text)) {
            throw new Error('ASCII-CHECK-FAIL: output contains non-ASCII characters');
        }
        return text;
    }

    // 锚点→段号字段 (c→50%, b→1, e→100%, 偏移→收敛+告警; V2 备选 SY segs 方案写作 0.5*(segs+1))
    // R21: subs!=null 且多子段时按锥度重建重映射:
    //   b(起点)/e(终点)/c(中心) → 原线弧长位置 → 定位子段; 落在子段边界 → 后继子段段号 1 (整数段号, T5 已覆盖 '1');
    //   落在子段内部 → 局部百分比 (如 43.2%, T5 新增待测矩阵项); 单子段线(未锥度) → 走原路径字节不变
    function anchorToSegField(anchor, offset, segRaw, warnings, desig, isSource = true, subs = null, totalGw = 0) {
        const kindKey = isSource ? 'm2n.srcOffset.kind.src' : 'm2n.srcOffset.kind.load';
        if (offset !== 0) {
            const near = { c: '50%', b: '1', e: '100%' }[anchor] || '50%';
            if (warnings) warnings.push({ key: 'm2n.srcOffset', params: { kindKey, desig, sign: offset > 0 ? '+' : '', off: Math.abs(offset), near } });
            return near;
        }
        if (subs && subs.length > 1) {
            // 弧长位置 (比例): b→0, c→0.5, e→1
            const posFrac = anchor === 'b' ? 0 : (anchor === 'c' ? 0.5 : 1);
            const total = subs[subs.length - 1].arcEnd;
            const p = posFrac * total;
            // 定位子段: arcStart <= p <= arcEnd (浮点边界容差)
            for (let k = 0; k < subs.length; k++) {
                const s = subs[k];
                if (p >= s.arcStart - 1e-9 && p <= s.arcEnd + 1e-9) {
                    const localLen = s.arcEnd - s.arcStart;
                    if (localLen <= 1e-9) return `${s.gwIdx0 + 1}, 1`;   // 零长子段 (防御)
                    const frac = (p - s.arcStart) / localLen;
                    if (frac <= 1e-9) return `${s.gwIdx0 + 1}, 1`;       // 边界 → 后继子段段号 1
                    const pct = Math.round(frac * 1000) / 10;
                    if (pct >= 100) return `${s.gwIdx0 + 1}, 1`;         // 末端边界
                    return `${s.gwIdx0 + 1}, ${pct}%`;
                }
            }
            return `${subs[0].gwIdx0 + 1}, 1`;   // 兜底 (弧长异常)
        }
        if (anchor === 'c') return '50%';
        if (anchor === 'b') return '1';
        return '100%';
    }

    // R21 辅助: 锥度线 segField 形如 "29, 1" / "29, 43.2%" (已含子段 tag); 未锥度形如 "50%" / "1" / "100%"
    // splitSegField: → [tag, seg] (未锥度: 原线号 + 原段字段)
    function splitSegField(segField, origWire, rebuilt) {
        const m = String(segField).match(/^(\d+), (\S+)$/);
        if (m) return [parseInt(m[1], 10), m[2]];
        return [origWire, segField];
    }
    function formatExLine(origTag, segField, re, im, rebuilt) {
        const [t, s] = splitSegField(segField, origTag, rebuilt);
        return `EX 0, ${t}, ${s}, ${re.toFixed(6)}, ${im.toFixed(6)}, 0, 0, 0`;
    }

    function describeSegModes(parsed) {
        const modes = [...new Set(parsed.wires.map(w => w.segRaw))];
        if (modes.length === 1) return `seg mode=${modes[0]}`;
        return `seg modes=${modes.join('/')}`;
    }

    function num(v) { return Number(v).toFixed(5).replace(/0+$/, '').replace(/\.$/, ''); }
    function nz(v) { return v === 0 ? '0' : v + '+h'; }

    // 覆盖源行解析: "w3c, 0.0, 1.0" (desig, phase, mag) 或 "3, 11, 1.0, 0.0" (numA)
    function parseOverrideSources(lines, wires, warnings) {
        const out = [];
        for (const l of lines) {
            const p = l.split(',').map(s => s.trim());
            if (/^[WwVv]\d/.test(p[0])) {
                const d = parseMaaDesignator(p[0]);
                if (d) out.push({ type: 'desig', desig: p[0], wire: d.wire, anchor: d.anchor, offset: d.offset,
                                  phase: parseFloat(p[1]) || 0, mag: parseFloat(p[2]) || 0 });
            } else if (/^\d+$/.test(p[0])) {
                out.push({ type: 'numA', wire: parseInt(p[0]), seg: parseFloat(p[1]) || 1, mag: parseFloat(p[2]) || 1, phase: parseFloat(p[3]) || 0 });
            } else {
                warnings.push({ key: 'm2n.badSourceRow', params: { line: l } });
            }
        }
        return out;
    }

    // 覆盖负载行解析: "w?c, 0, L(uH), C(pF), Q" / "w?c, 1, R, X"
    function parseOverrideLoads(lines, wires, warnings) {
        const out = [];
        for (const l of lines) {
            const p = l.split(',').map(s => s.trim());
            if (/^[WwVv]\d/.test(p[0])) {
                const d = parseMaaDesignator(p[0]);
                if (!d) { warnings.push({ key: 'm2n.badLoadDesignator', params: { line: l } }); continue; }
                if (p[1] === '0') out.push({ type: 'lc', desig: p[0], wire: d.wire, anchor: d.anchor, offset: d.offset,
                                              L_uH: parseFloat(p[2]) || 0, C_pF: parseFloat(p[3]) || 0, Q: parseFloat(p[4]) || 0 });
                else if (p[1] === '1') out.push({ type: 'rjx', desig: p[0], wire: d.wire, anchor: d.anchor, offset: d.offset,
                                                 R: parseFloat(p[2]) || 0, X: parseFloat(p[3]) || 0 });
                else warnings.push({ key: 'm2n.badLoadType', params: { line: l } });
            } else {
                warnings.push({ key: 'm2n.badLoadRow', params: { line: l } });
            }
        }
        return out;
    }
