// maa-symbols.js — SY 符号推导层（R2）
// 职责: 半径去重降序→D1..Dn(无上限); 负载 L/C/Q 或 R/X 逐参编号; h/f 基础符号
// 输出: { syCards[]: 一卡一参字符串数组, wireDiam: [半径rad→符号索引] }
// 依赖: 无 (纯函数)。

    function buildMaaSymbols(parsed) {
        // 1. 直径符号: 半径去重(按数值) → 降序 → D1..Dn; GW 半径字段输出 0.5*Dn
        const uniqRad = [...new Set(parsed.wires.map(w => w.rad))].sort((a, b) => b - a);
        const syCards = [];
        const radToD = {};
        uniqRad.forEach((r, i) => {
            const name = 'D' + (i + 1);
            radToD[r] = name;
            syCards.push(`SY ${name}=${formatRad(r)}`);
        });

        // 2. 负载符号: 每个负载一组编号 (lc→L/C/Q, rjx→R/X); A6/sparam/unknown 不符号化
        parsed.loads.forEach((ld, i) => {
            const n = i + 1;
            if (ld.type === 'lc') {
                syCards.push(`SY L${n}=${fmtNum(ld.L_uH)}`);
                syCards.push(`SY C${n}=${fmtNum(ld.C_pF)}`);
                syCards.push(`SY Q${n}=${fmtNum(ld.Q)}`);
            } else if (ld.type === 'rjx') {
                syCards.push(`SY R${n}=${fmtNum(ld.R)}`);
                syCards.push(`SY X${n}=${fmtNum(ld.X)}`);
            }
        });

        // 3. 基础符号: f/h (h = G/H 行第2字段 附加高度, 用户定名2026-09-02)
        const hVal = (parsed.ground && parsed.ground.height != null) ? parsed.ground.height : 0;
        syCards.unshift(`SY h=${hVal}`);
        syCards.unshift(`SY f=${parsed.freq || 0}`);

        return { syCards, radToD };
    }

    function formatRad(r) {
        if (Math.abs(r) >= 0.001) return r.toFixed(5).replace(/0+$/, '').replace(/\.$/, '');
        return String(r);
    }
    function fmtNum(v) {
        if (Number.isInteger(v) && Math.abs(v) < 1e6) return String(v);
        return String(v);
    }
