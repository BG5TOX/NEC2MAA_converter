const fs = require('fs');
const path = require('path');
const base = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_main\\js\\maa2nec';
const jsRoot = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_main\\js';
// i18n-4 批次同步: writer 依赖 LF() — 拼入 state + i18n + 语言包
const prelude = ['state', 'i18n', 'i18n/zh', 'i18n/en'].map(n => fs.readFileSync(`${jsRoot}\\${n}.js`, 'utf8')).join('\n');
const src = prelude + '\n' + ['maa-parser', 'maa-taper', 'maa-symbols', 'maa-writer'].map(n => fs.readFileSync(`${base}\\${n}.js`, 'utf8')).join('\n');
try { new Function('window', src + '\nvar N2M = window.N2M;'); console.log('SYNTAX OK (i18n+四文件)'); } catch (e) { console.log('SYNTAX FAIL: ' + e.message); process.exit(1); }
const api = new Function('window', src + '\nvar N2M = window.N2M;\nreturn { parseMaa, expandTaperedWires, buildMaaSymbols, writeMaaToNec, parseMaaDesignator };')({});

let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? '  ' + d : '')); process.exitCode = 1; } }
function near(a, b, eps = 1e-9) { return Math.abs(a - b) <= eps; }

// === R21a-1: jp2000 金标准 — parser $$$ 捕获 ===
{
  const text = fs.readFileSync('F:\\Antenna\\jp2000_147.maa', 'latin1');
  const parsed = api.parseMaa(text, 'jp2000_147.maa');
  check('jp2000: taperDefs 声明数 10', parsed.taperDefs.declaredCount === 10, String(parsed.taperDefs.declaredCount));
  check('jp2000: taperDefs 解析数 10', parsed.taperDefs.parsedCount === 10, String(parsed.taperDefs.parsedCount));
  const d1 = parsed.taperDefs.byName.get(-0.001);
  check('jp2000: -0.001 type=2 (对称)', d1 && d1.type === 2, d1 && String(d1.type));
  check('jp2000: -0.001 四对含尾哨兵', d1 && d1.pairs.length === 4 && d1.pairs[3].isTail === true && near(d1.pairs[0].L, 2.0) && near(d1.pairs[0].R, 0.015), JSON.stringify(d1 && d1.pairs));
  check('jp2000: 导线 10 根全负半径', parsed.wires.length === 10 && parsed.wires.every(w => w.rad < 0), '');
}

// === R21a-2: jp2000 重建 — R21f 最终语义 (L1=中心节整体长; L2..Ln=细锥度节每侧长; 用户公式 w10=L3+L2+L1+L2+L3=5.10 ✓) ===
// jp2000 w1 def [2.0/0.015, 1.4/0.0125, 1.4/0.0095, 尾/0.006] 半长 5.55:
//   中心 2m@15 ([4.55,6.55]) + 每侧 1.4@12.5 + 1.4@9.5 + 尾 3.15@6 → 7 段; 全文件 [7,5,5,5,7,5,5,5,7,5]=56
{
  const text = fs.readFileSync('F:\\Antenna\\jp2000_147.maa', 'latin1');
  const parsed = api.parseMaa(text, 'jp2000_147.maa');
  const warns = parsed.warnings;
  const rb = api.expandTaperedWires(parsed.wires, parsed.taperDefs, warns);
  check('jp2000 重建: 总子段 56 (R21f)', rb.wires.length === 56, String(rb.wires.length));
  check('jp2000 重建: 展开统计 10→56', rb.expanded && rb.expandedFrom === 10 && rb.expandedTo === 56, `${rb.expandedFrom}→${rb.expandedTo}`);
  const expect = [7, 5, 5, 5, 7, 5, 5, 5, 7, 5];
  const subsPerWire = rb.origToSubs.map(a => a.length);
  check('jp2000 重建: 各线子段数 [7,5,5,5,7,5,5,5,7,5] (R21f)', JSON.stringify(subsPerWire) === JSON.stringify(expect), JSON.stringify(subsPerWire));
  // 全局连续性: sub[k].end ≡ sub[k+1].start (同一原线内)
  let contOK = true, contMsg = '';
  rb.origToSubs.forEach((subs, wi) => {
    for (let k = 0; k < subs.length - 1; k++) {
      const e1 = rb.wires[subs[k].gwIdx0], s2 = rb.wires[subs[k + 1].gwIdx0];
      if (!near(e1.x2, s2.x1) || !near(e1.y2, s2.y1) || !near(e1.z2, s2.z1)) { contOK = false; contMsg = `w${wi + 1} sub${k + 1}/${k + 2}`; break; }
    }
  });
  check('jp2000 重建: 子段端点连续', contOK, contMsg);
  // w1 明细 (R21f): 尾 [0,1.75]@6 | [1.75,3.15]@9.5 | [3.15,4.55]@12.5 | 中心 [4.55,6.55]@15 (2m=L1) | 镜像 | 尾 [9.35,11.1]@6
  const w1subs = rb.origToSubs[0];
  const arcs1 = w1subs.map(s => [rb.wires[s.gwIdx0].arcStart, rb.wires[s.gwIdx0].arcEnd, rb.wires[s.gwIdx0].rad]);
  const exp1 = [[0, 1.75, 0.006], [1.75, 3.15, 0.0095], [3.15, 4.55, 0.0125], [4.55, 6.55, 0.015], [6.55, 7.95, 0.0125], [7.95, 9.35, 0.0095], [9.35, 11.1, 0.006]];
  let w1ok = arcs1.length === 7 && exp1.every((e, k) => near(arcs1[k][0], e[0]) && near(arcs1[k][1], e[1]) && near(arcs1[k][2], e[2], 1e-12));
  check('jp2000 重建: w1 R21f 弧段明细 (中心节 2m@15mm = L1)', w1ok, JSON.stringify(arcs1));
  check('jp2000 重建: w1 中心节连续覆盖中心 5.55', rb.origToSubs[0].some(s => rb.wires[s.gwIdx0].arcStart < 5.55 - 0.01 && rb.wires[s.gwIdx0].arcEnd > 5.55 + 0.01), '');
  // w10 用户公式验证: def [2.0, 0.52, 尾] 半长 2.55 → 尾1.03 + 0.52 + 2.0 + 0.52 + 1.03 = 5.10
  {
    const arcs10 = rb.origToSubs[9].map(s => [rb.wires[s.gwIdx0].arcStart, rb.wires[s.gwIdx0].arcEnd, rb.wires[s.gwIdx0].rad]);
    const len10 = arcs10[arcs10.length - 1][1] - arcs10[0][0];
    const segLens = arcs10.map(a => a[1] - a[0]);
    check('jp2000 重建: w10 用户公式 (1.03+0.52+2.0+0.52+1.03=5.10)',
      arcs10.length === 5 && near(segLens[0], 1.03, 1e-6) && near(segLens[1], 0.52, 1e-6) && near(segLens[2], 2.0, 1e-6) && near(segLens[3], 0.52, 1e-6) && near(segLens[4], 1.03, 1e-6) && near(len10, 5.10, 1e-6),
      JSON.stringify(segLens.map(x => x.toFixed(3))));
  }
  // w3 明细 (R21f): def [2.0/0.0125, 0.52/0.0095, 尾/0.006] 半长 2.76:
  //   中心 [1.76,3.76]@12.5 (2m) + 每侧 0.52@9.5 + 尾 1.24@6 → 5 段
  const arcs3 = rb.origToSubs[2].map(s => [rb.wires[s.gwIdx0].arcStart, rb.wires[s.gwIdx0].arcEnd, rb.wires[s.gwIdx0].rad]);
  const exp3 = [[0, 1.24, 0.006], [1.24, 1.76, 0.0095], [1.76, 3.76, 0.0125], [3.76, 4.28, 0.0095], [4.28, 5.52, 0.006]];
  let w3ok = arcs3.length === 5 && exp3.every((e, k) => near(arcs3[k][0], e[0], 1e-6) && near(arcs3[k][1], e[1], 1e-6) && near(arcs3[k][2], e[2], 1e-12));
  check('jp2000 重建: w3 R21f 明细 (尾 1.24m)', w3ok, JSON.stringify(arcs3));
  // w9 尾: 半长 4.85, 中心半宽1.0+1.4+1.4=3.8 → 尾 1.05
  const w9tail = rb.wires[rb.origToSubs[8][0].gwIdx0];
  check('jp2000 重建: w9 尾 1.05m (R21f)', near(w9tail.arcEnd - w9tail.arcStart, 1.05, 1e-6), (w9tail.arcEnd - w9tail.arcStart).toFixed(6));
}

// === R21a-3: 4EL20HM 类型映射 (type=2 对称 + type=1 顺序) ===
{
  const text = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\HF beams\\4EL20HM.MAA', 'latin1');
  const parsed = api.parseMaa(text, '4EL20HM.MAA');
  const rb = api.expandTaperedWires(parsed.wires, parsed.taperDefs, parsed.warnings);
  // R21f: 寄生 (对称 type=2) def [1.8/0.015, 1.8/0.0125, 尾/0.01] 半长 5.405:
  //   中心节 [c-0.9, c+0.9]=[4.505,6.305] 1.8m@15 (L1 整体长) + 每侧 1.8@12.5 + 尾 2.705@10 → 5 段
  //   "30/25/20mm Pipe" 三管全现
  // 馈电半元 (顺序 type=1) 不变 3; 普通线 1
  const subs = rb.origToSubs.map(a => a.length);
  const exp = [3, 5, 5, 5, 1, 3, 1, 1, 1];
  check('4EL20HM: 子段数 [3,5,5,5,1,3,1,1,1] (R21f)', JSON.stringify(subs) === JSON.stringify(exp), JSON.stringify(subs));
  // 寄生 w2 对称: 中心节 [4.505,6.305] (1.8m=L1, R=0.015) — 中心 5.405 不断开
  const w2center = rb.origToSubs[1].some(s => {
    const w = rb.wires[s.gwIdx0];
    return near(w.arcStart, 4.505, 1e-3) && near(w.arcEnd, 6.305, 1e-3);
  });
  check('4EL20HM: w2 中心节 [4.505,6.305] 1.8m@15mm (R21f)', w2center, JSON.stringify(rb.origToSubs[1].map(s => [rb.wires[s.gwIdx0].arcStart.toFixed(3), rb.wires[s.gwIdx0].arcEnd.toFixed(3)])));
}

// === R21a-4: dx415tt (type=0 对称 + type=3 顺序) ===
{
  const text = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\HF beams\\dx415tt.maa', 'latin1');
  const parsed = api.parseMaa(text, 'dx415tt.maa');
  const rb = api.expandTaperedWires(parsed.wires, parsed.taperDefs, parsed.warnings);
  const subs = rb.origToSubs.map(a => a.length);
  // w1/w5 DE 半元 3.35m 顺序型 -0.002 [1,1,1,尾0.35] = 4 段 (顺序型不受 R21f 影响)
  // w2..4 寄生 7.22/6.62/6.38 对称型 -0.001 [2,1,1,尾] R21f: 中心节 2m@13 (L1) + 每侧 1@12 + 1@10 (半侧累计 3.0) + 尾 (半长-3.0)@8 → 7 段
  // w6..9 普通线原样
  const exp = [4, 7, 7, 7, 4, 1, 1, 1, 1];
  check('dx415tt: 子段数 [4,7,7,7,4,1,1,1,1] (R21f)', JSON.stringify(subs) === JSON.stringify(exp), JSON.stringify(subs));
  check('dx415tt: 展开统计 5→29 (仅锥度线, R21f)', rb.expandedFrom === 5 && rb.expandedTo === 29, `${rb.expandedFrom}→${rb.expandedTo}`);
}

// === R21a-4b: 8EL6MW — R21f 语义 (L1=2.0 整体 → 中心节 2m@7mm; 半长 1.46 > 1.0 → 有尾) ===
{
  const p8 = (function () { const pathMod = require('path'); function walk(dir, out) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = pathMod.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (/^8EL6MW\.MAA$/i.test(e.name)) out.push(p); } return out; } return walk('C:\\MMANA-GALBasic3\\ANT', [])[0]; })();
  const text = fs.readFileSync(p8, 'latin1');
  const parsed = api.parseMaa(text, '8EL6MW.MAA');
  const rb = api.expandTaperedWires(parsed.wires, parsed.taperDefs, []);
  // R21f: L1=2.0 → 中心节 [c-1.0, c+1.0] 2m@7mm; 每根元件半长 1.29~1.50 > 1.0 → 尾对(5mm)出现 → 3 段
  check('8EL6MW: 8 根元件各 3 段 (R21f: 中心节 2m@7mm + 尾@5mm)', JSON.stringify(rb.origToSubs.map(s => s.length)) === JSON.stringify([3, 3, 3, 3, 3, 3, 3, 3]), JSON.stringify(rb.origToSubs.map(s => s.length)));
  const w1 = rb.origToSubs[0].map(s => [rb.wires[s.gwIdx0].arcStart.toFixed(2), rb.wires[s.gwIdx0].arcEnd.toFixed(2), rb.wires[s.gwIdx0].rad]);
  check('8EL6MW: w1 = 尾0.46@5mm + 中心2m@7mm + 尾0.46@5mm', w1[0][2] === 0.005 && near(w1[1][1] - w1[1][0], 2.0, 1e-6) && w1[1][2] === 0.007, JSON.stringify(w1));
}

// === R21a-5: 未定义锥度名 fallback ===
{
  const wires = [{ x1: 0, y1: 0, z1: 0, x2: 1, y2: 0, z2: 0, rad: -0.099, segRaw: '-1' }];
  const rb = api.expandTaperedWires(wires, { byName: new Map(), declaredCount: 0, parsedCount: 0 }, []);
  // expandOne 修改原线 rad → 0.001; expandTaperedWires 返回原对象
  check('未定义名: fallback rad=0.001', wires[0].rad === 0.001 && rb.wires[0] === wires[0], String(wires[0].rad));
}

// === R21a-6: 边角 — 累计不足无哨兵 / 零长 / type 越界兜底 ===
{
  // 无哨兵 + 累计 < 线长 (顺序)
  const defs = { byName: new Map([[-0.001, { type: 1, pairs: [{ L: 0.3, R: 0.01, isTail: false }, { L: 0.3, R: 0.005, isTail: false }], lineNo: 1 }]]) };
  const w = [{ x1: 0, y1: 0, z1: 0, x2: 1, y2: 0, z2: 0, rad: -0.001, segRaw: '-1' }];
  const warns = [];
  const rb = api.expandTaperedWires(w, defs, warns);
  check('无哨兵: 余段沿用末对 R', rb.wires.length === 3 && near(rb.wires[2].rad, 0.005) && near(rb.wires[2].arcEnd, 1), JSON.stringify(rb.origToSubs[0]));
  // i18n-4 批次同步: 告警改结构化 {key, params}
  check('无哨兵: 告警触发', warns.some(x => x.key === 'n2m.taper.seqNoTail' || x.key === 'n2m.taper.centerNoTail'), JSON.stringify(warns[0]));
  // 零长跳过: 对长 0.5 线上 [L=0.5, L=0.3, 尾] → 第二对被截断为零长跳过
  const defs2 = { byName: new Map([[-0.001, { type: 1, pairs: [{ L: 0.5, R: 0.01, isTail: false }, { L: 0.3, R: 0.005, isTail: false }, { L: 99999.9, R: 0.002, isTail: true }], lineNo: 1 }]]) };
  const w2 = [{ x1: 0, y1: 0, z1: 0, x2: 0.5, y2: 0, z2: 0, rad: -0.001, segRaw: '-1' }];
  const rb2 = api.expandTaperedWires(w2, defs2, []);
  check('零长跳过: 截断对不计段', rb2.wires.length === 1 && near(rb2.wires[0].arcEnd, 0.5) && near(rb2.wires[0].rad, 0.01), String(rb2.wires.length));
  // type 越界 (9): 兜底顺序型 (不炸)
  const defs3 = { byName: new Map([[-0.001, { type: 9, pairs: [{ L: 99999.9, R: 0.01, isTail: true }], lineNo: 1 }]]) };
  const w3 = [{ x1: 0, y1: 0, z1: 0, x2: 1, y2: 0, z2: 0, rad: -0.001, segRaw: '-1' }];
  const rb3 = api.expandTaperedWires(w3, defs3, []);
  check('type 越界: 兜底顺序型不炸', rb3.wires.length === 1 && near(rb3.wires[0].rad, 0.01), '');
}

// === R21a-7: 702 字节不变预检 — 未锥度文件 rebuilt.wires 与原引用一致 ===
{
  const text = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');
  const parsed = api.parseMaa(text, 'VDP40B.MAA');
  const rb = api.expandTaperedWires(parsed.wires, parsed.taperDefs, parsed.warnings);
  check('VDP40B (无锥度): expanded=false 且原对象引用', rb.expanded === false && rb.wires[0] === parsed.wires[0], '');
}

// === R21b-1: jp2000 端到端 writer 输出 ===
{
  const text = fs.readFileSync('F:\\Antenna\\jp2000_147.maa', 'latin1');
  const parsed = api.parseMaa(text, 'jp2000_147.maa');
  parsed.groundEpsrManual = null; parsed.ground.sigma_mS = 0;   // 模拟面板缺省 (gtype=0 自由空间 → 无 GN)
  const nec = api.writeMaaToNec(parsed, 'jp2000_147.maa');
  const lines = nec.split('\n');
  const gws = lines.filter(l => l.startsWith('GW '));
  check('jp2000 输出: 56 张 GW (R21f)', gws.length === 56, String(gws.length));
  check('jp2000 输出: SY f=14.1', nec.includes('SY f=14.1'), '');
  check('jp2000 输出: SY h=7 (G/H 字段2)', nec.includes('SY h=7'), '');
  check('jp2000 输出: SY D1=0.015 (最大半径符号)', nec.includes('SY D1=0.015') || nec.includes('SY D1=0.0150'), nec.split('\n').find(l => l.startsWith('SY D1')));
  // D 符号唯一半径集: {0.006, 0.0095, 0.0125, 0.015} → 去重降序 D1=0.015 D2=0.0125 D3=0.0095 D4=0.006
  check('jp2000 输出: D 符号 4 个 (0.015/0.0125/0.0095/0.006)', ['SY D1=0.015', 'SY D2=0.0125', 'SY D3=0.0095', 'SY D4=0.006'].every(s => nec.includes(s)), lines.filter(l => l.startsWith('SY D')).join(' | '));
  // EX (R21f): w5c → 中心节 [4.35,6.35] (2m@15) 内部 50%; 前 4 线 7+5+5+5=22 前置 → 中心节 tag 26
  const ex = lines.find(l => l.startsWith('EX '));
  check('jp2000 输出: EX w5c → tag 26 段内 50% (中心节内部, R21f)', ex === 'EX 0, 26, 50%, 1.000000, 0.000000, 0, 0, 0', ex);
  check('jp2000 输出: CM Tapered 行', nec.includes('CM Tapered wires: 10 original(s) expanded to 56 connected GW sections (per $$$ taper table).'), '');
  // GW 首张: w1 尾段 (0,-5.55,0)-(0,-3.80,0) 1.75m R=0.006 → 0.5*D4
  check('jp2000 输出: 首张 GW = w1 尾段 1.75m (R21f)', gws[0] === 'GW 1, 1, 0, -5.55, 0, 0, -3.8, 0, 0.5*D4', gws[0]);
  // R21f: w1 中心节 GW4 (0,-1,0)-(0,1,0) 长 2m=L1 R=0.015 → 0.5*D1 (连续覆盖中心, 无断点)
  check('jp2000 输出: w1 中心节 GW4 2m@15mm (R21f)', gws[3] === 'GW 4, 1, 0, -1, 0, 0, 1, 0, 0.5*D1', gws[3]);
  // 材料提示 M=4 (Al pipe)
  check('jp2000 输出: CM Material M=4', nec.includes('CM Material: M=4'), '');
  check('jp2000 输出: ASCII 终检', /^[\x20-\x7E\n]*$/.test(nec), '');
  // i18n-4 批次同步: 汇总提示改结构化键断言
  check('jp2000 输出: 汇总提示 warnings', parsed.warnings.some(w => w.key === 'm2n.taperRebuilt'), parsed.warnings.find(w => w.key === 'm2n.taperRebuilt') || '');
}

// === R21b-2: VDP40B 回归 — 输出与 R19 时代逐字节一致 (无锥度不受影响) ===
{
  const text = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');
  const parsed = api.parseMaa(text, 'VDP40B.MAA');
  parsed.ground.sigma_mS = 20; parsed.groundEpsrManual = 17;
  const nec = api.writeMaaToNec(parsed, 'VDP40B.MAA');
  check('VDP40B 输出: LD 表达式不变', nec.includes('LD 1, 1, 50%, 50%, 2*PI*f*L1*1E-6/Q1, L1*1E-6, C1*1E-12'), nec.split('\n').find(l => l.startsWith('LD ')));
  check('VDP40B 输出: EX 50% 不变', nec.includes('EX 0, 1, 50%'), nec.split('\n').find(l => l.startsWith('EX ')));
  check('VDP40B 输出: 无 CM Tapered', !nec.includes('Tapered'), '');
}

// === R21b-3: 全库 723 文件 — hash 基线对拍 (v0.5 基线 = v0.4 + i18n-4 D1(B1)/D4: CM 行 v0.5 标记 + 告警英文重审定) ===
// 基线语义: 当前基线 = 当前契约快照; 此断言防后续改动意外漂移未锥度文件输出。
// v0.5 重审定 (2026-09-04): 723 文件因 CM 版本行 v0.4→v0.5 + 结构化告警全量 hash 变化一次, 属 D4 批准变更;
//   旧 v0.4 基线存档 backups/preR21h_723_output_hashes.v04baseline.json。
// 锥度文件清单 (20 库 + jp2000) 单独断言其确实被基线收录 (即这些文件允许因锥度语义变化而 hash 改变时, 须重新审定基线)。
{
  const snap = JSON.parse(fs.readFileSync('F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_main\\backups\\preR21h_723_output_hashes.json', 'utf8'));
  const pathMod = require('path');
  function walk(dir, out) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = pathMod.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (/\.maa$/i.test(e.name)) out.push(p); } return out; }
  const files = walk('C:\\MMANA-GALBasic3\\ANT', []);
  const crypto = require('crypto');
  let unchanged = 0, changed = [], fails = [], asciiViol = 0;
  const jpPath = 'F:\\Antenna\\jp2000_147.maa';
  const all = files.concat([jpPath]);
  for (const f of all) {
    try {
      const text = fs.readFileSync(f, 'latin1');
      const parsed = api.parseMaa(text, pathMod.basename(f));
      const nec = api.writeMaaToNec(parsed, pathMod.basename(f));
      const h = crypto.createHash('sha256').update(nec).digest('hex');
      if (!/^[\x20-\x7E\n]*$/.test(nec)) { asciiViol++; fails.push('ASCII ' + pathMod.basename(f)); }
      if (snap[f] === h) unchanged++;
      else { changed.push(pathMod.basename(f)); if (changed.length <= 30) {} }
    } catch (e) { fails.push(pathMod.basename(f) + ' — ' + e.message); }
  }
  check('全库+jp: 0 转换失败', fails.length === 0, fails.slice(0, 5).join('; '));
  check('全库+jp: ASCII 0 违例', asciiViol === 0, String(asciiViol));
  // v0.5 基线 (i18n-4 重审定, 由当前代码生成): 全部 723 文件应与基线一致 — 后续任何 M2N 改动造成漂移都会在此暴露
  check('v0.5 基线: 723 文件全部一致 (0 漂移)', changed.length === 0 && unchanged === 723, `unchanged=${unchanged} changed=${changed.length}: ${changed.slice(0, 10).join(', ')}`);
  // 锥度文件清单固化: 这 21 个文件 (20 库 + jp2000) 的输出依赖 R21f 语义, 锥度语义再变时须重新审定基线
  const TAPERED_FILES = ['2DELTA20.MAA', '3EL20.MAA', '4EL20.MAA', '4EL20HM.MAA', '5EL20.MAA', '6EL10.MAA', 'dx415tt.maa', 'V-Yagi.maa', 'DL2KQ15.maa', 'DL2KQ20.maa', 'DL2KQ40.maa', 'DL2KQ80.maa', '4EL20CM.maa', 'Parasitic currents.maa', 'Short 160m  grounded GP- best.maa', 'Short 160m  grounded GP-best-1.maa', '2x6el10.maa', 'syack3el20.maa', '8EL6MW.MAA', 'jp2000_147.maa'];
  const taperedInBaseline = TAPERED_FILES.every(n => Object.keys(snap).some(k => k.replace(/\\/g, '/').endsWith('/' + n) || k.endsWith('\\' + n) || k.split('\\').pop() === n));
  check('锥度文件清单: 21 文件全部在基线收录', taperedInBaseline, '');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
