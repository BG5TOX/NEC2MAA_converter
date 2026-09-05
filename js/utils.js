// utils.js — 纯函数层（自 v02 逐字迁移；告警文案/精度/分支不得改动）
// v0.5 i18n-3: getMmanaPos 告警改结构化条目 {key, params} — 屏显/写入两视图由调用方分别 L()/LF() 渲染
// 依赖: state.js (evalExpr 无状态, 此处不引用 N2M)

    function hasChinese(str) { return /[\u4e00-\u9fa5]/.test(str); }
    function removeChinese(str) { return str.replace(/[\u4e00-\u9fa5]/g, '').trim(); }
    function evalExpr(exprStr, symbols) {
        if (!exprStr && exprStr !== 0) return 0;
        let s = exprStr.toString().toUpperCase();
        
        // 自动转换常见电子单位 (如 37.8uH -> 37.8E-6)
        s = s.replace(/([0-9.]+)\s*UH/g, "$1E-6");
        s = s.replace(/([0-9.]+)\s*MH/g, "$1E-3");
        s = s.replace(/([0-9.]+)\s*PF/g, "$1E-12");
        s = s.replace(/([0-9.]+)\s*NF/g, "$1E-9");

        let changed = true, iterations = 0;
        while (changed && iterations < 15) {
            changed = false;
            for (let key in symbols) {
                // S1-S2 修复: 键先做正则元字符转义 — 原实现在键含 ( ? * | $ [ 等时抛 "Unterminated group"
                //   未捕获异常直穿 UI, 或静默错配; 转义后按字面量匹配
                const safeKey = key.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                let regex = new RegExp("\\b" + safeKey + "\\b", "g");
                if (regex.test(s)) {
                    s = s.replace(regex, "(" + symbols[key] + ")");
                    changed = true;
                }
            }
            iterations++;
        }
        
        s = s.replace(/PI/g, "Math.PI");
        s = s.replace(/SIN\s*\(/g, "Math.sin(Math.PI/180*");
        s = s.replace(/COS\s*\(/g, "Math.cos(Math.PI/180*");
        s = s.replace(/TAN\s*\(/g, "Math.tan(Math.PI/180*");
        s = s.replace(/SQRT\s*\(/g, "Math.sqrt(");
        s = s.replace(/ABS\s*\(/g, "Math.abs(");
        s = s.replace(/EXP\s*\(/g, "Math.exp(");
        s = s.replace(/LOG\s*\(/g, "Math.log(");
        
        try { return new Function('return (' + s + ')')(); } catch (e) { return 0; }
    }
    const GS_UNITS = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

    function parseGsScale(raw, symbols) {
        let s = raw.toString().trim();
        let m = s.match(/^(.*[0-9.)]|[A-Z_][A-Z0-9_]*)\s*(MM|CM|M|IN|FT)$/);
        if (m && GS_UNITS.hasOwnProperty(m[2].toLowerCase())) {
            let num = evalExpr(m[1], symbols);
            if (isFinite(num)) return { val: num * GS_UNITS[m[2].toLowerCase()], unit: m[2] };
        }
        m = s.match(/^(MM|CM|M|IN|FT)$/);
        if (m) return { val: GS_UNITS[m[1].toLowerCase()], unit: m[1] };
        return { val: evalExpr(s, symbols), unit: null };
    }
    function formatNum(num) { return Number(num).toFixed(4); }
    // MMANA 手册(gal-ana.de/basicmm): W#C/B/E + 带符号偏移。
    // 935 真实文件实测: b/c 双向偏移常见; E 仅见 e1(向外跨线连接点), 未见 e-2 向内。
    // 故 E 锚只用于"末段本身"(offset=0); 线内后段一律用 c 偏移表达(c0+dc 恒在界内)。
    function segToDesignator(segIdx, ns) {
        if (ns <= 1) return { anchor: 'c', offset: 0 };
        let c0 = Math.floor((ns + 1) / 2);
        let db = segIdx - 1, dc = segIdx - c0, de = segIdx - ns;
        let absDb = Math.abs(db), absDc = Math.abs(dc), absDe = Math.abs(de);
        if (segIdx === ns) return { anchor: 'e', offset: 0 };
        if (absDc <= absDb) return { anchor: 'c', offset: dc };
        return { anchor: 'b', offset: db };
    }
    function getMmanaPos(tag, segStr, ns, symbols, warningsArray) {
        let isPercent = segStr.includes('%');
        let segValStr = segStr.replace('%', '');
        let segVal = evalExpr(segValStr, symbols);
        if (!isFinite(segVal)) segVal = 0;

        let segIdx;
        if (isPercent || (segVal > 0 && segVal < 1)) {
            let pct = isPercent ? segVal : segVal * 100;
            segIdx = Math.max(1, Math.min(ns, Math.round(pct / 100 * ns)));
            warningsArray.push({ key: 'n2m.tag.pct', params: { tag, pct, seg: segIdx, ns } });
        } 
        else {
            segIdx = Math.round(segVal);
            if (segIdx > ns) {
                warningsArray.push({ key: 'n2m.tag.overSeg', params: { tag, seg: segIdx, ns } });
                segIdx = ns;
            }
            if (segIdx < 1) {
                warningsArray.push({ key: 'n2m.tag.underSeg', params: { tag, seg: segIdx, ns } });
                segIdx = 1;
            }
        }

        let d = segToDesignator(segIdx, ns);
        let desig;
        if (d.anchor === 'c' && ns > 1 && d.offset === 0) desig = 'c';
        else if (d.offset === 0) desig = d.anchor;
        else if (Math.abs(d.offset) <= 1) desig = `${d.anchor}${d.offset}`;
        else {
            // |偏移|>1: MMANA 自动分段下大偏移会位漂移(设计符按 NEC 段数标定),
            // 与 935 文件生态一致(偏移仅用于连接点/中心旁1脉冲) → 收敛最近纯锚 + 告警
            let anchorSeg = d.anchor === 'c' ? Math.floor((ns + 1) / 2) : (d.anchor === 'b' ? 1 : ns);
            desig = d.anchor;
            warningsArray.push({ key: 'n2m.tag.bigOffset', params: { tag, seg: segIdx, ns, anchor: d.anchor, off: d.offset, anchorSeg } });
        }
        return desig;
    }
