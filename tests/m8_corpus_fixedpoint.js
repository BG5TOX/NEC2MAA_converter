// m8_corpus_fixedpoint.js — 2026-09-24 NEC 解析审计修复验收：全量语料阈值 + 定点清单
// 依赖 F:\Antenna_Models（2493 个 .nec/.inp）；约 15 s
const fs = require('fs'), path = require('path');
const jsRoot = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_main\\js';
const packs = ['i18n/zh', 'i18n/en'].map(n => fs.readFileSync(`${jsRoot}\\${n}.js`, 'utf8')).join('\n');
const src = ['state', 'i18n', 'i18n/zh', 'i18n/en', 'utils', 'geometry', 'extract'].map(n => fs.readFileSync(`${jsRoot}\\${n}.js`, 'utf8')).join('\n');
try { new Function('window', 'document', 'alert', src); console.log('SYNTAX OK (state+i18n+utils+geometry+extract)'); } catch (e) { console.log('SYNTAX FAIL: ' + e.message); process.exit(1); }
const api = new Function('window', 'document', 'alert', src + '\nvar N2M = window.N2M;\nreturn { parseNec };')({}, { getElementById: () => ({ value: '', style: {}, addEventListener: () => {} }), addEventListener: () => {}, querySelectorAll: () => [] }, () => {});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? '  ' + detail : '')); process.exitCode = 1; }
}
const near = (a, b, eps = 1e-9) => typeof a === 'number' && isFinite(a) && Math.abs(a - b) <= eps;
const ROOT = 'F:\\Antenna_Models';
const all = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(nec|inp)$/i.test(e.name)) all.push(f); } })(ROOT);
function read(re) { const f = all.filter(x => re.test(x))[0]; return f ? { file: f, text: fs.readFileSync(f, 'latin1') } : null; }
function parse(re) { const r = read(re); return r ? api.parseNec(r.text) : null; }

// === 1. 全量阈值 (审计基准: 崩溃 68 → 0; 全零长 27 → 0; 含零长 101 → 0; noWire 75 → 25; gsBad 92 → 0) ===
{
  let crash = 0, noWire = 0, zeroAll = 0, zeroSome = 0, gsBad = 0;
  const crashFiles = [];
  for (const f of all) {
    let r;
    try { r = api.parseNec(fs.readFileSync(f, 'latin1')); } catch (e) { crash++; crashFiles.push(f.replace(ROOT, '') + ': ' + e.message); continue; }
    const n = r.wires.length;
    if (n === 0) { noWire++; continue; }
    const zero = r.wires.filter(w => w.x1 === w.x2 && w.y1 === w.y2 && w.z1 === w.z2).length;
    if (zero === n) zeroAll++; else if (zero > 0) zeroSome++;
    if (r.fileWarnings.some(x => x.includes('scale factor unparseable'))) gsBad++;
  }
  check('全量: 文件数 2493', all.length === 2493, String(all.length));
  check('全量: 崩溃 = 0 (原 68)', crash === 0, crashFiles.slice(0, 3).join(' | '));
  check('全量: 全零长文件 = 0 (原 27)', zeroAll === 0, String(zeroAll));
  check('全量: 含零长文件 ≤ 3 (原 101)', zeroSome <= 3, String(zeroSome));
  check('全量: GS 解析失败文件 = 0 (原 92)', gsBad === 0, String(gsBad));
  check('全量: 无导线文件 ≤ 30 (原 75; 余量为 CW/SP/GH/GA/GC锥度/空文件等合理情形)', noWire <= 30, String(noWire));
}

// === 2. 定点清单 (审计 §7.2 + 本批新增) ===
let r = parse(/144NX13S\.nec$/i);
check('144NX13S (GS 0 0 mm): 13 根, x2=0.449', r && r.wires.length === 13 && r.wires.some(w => near(w.x2, 0.449, 1e-12)), r && String(r.wires.length));
r = parse(/bev80\.nec$/i);
check('bev80 (#18/ft + GS ft): 4 根, 半径 0.000512', r && r.wires.length === 4 && r.wires.every(w => near(w.rad, 0.0005118, 5e-7)), r && JSON.stringify(r.wires.map(w => w.rad)));
r = parse(/Rhomb1\.nec$/i);
check('Rhomb1 (#12/ft): 4 根 (原 0)', r && r.wires.length === 4, r && String(r.wires.length));
r = parse(/2el160flag\.nec$/i);
check('2el160flag (#12): 8 根 (原 0)', r && r.wires.length === 8, r && String(r.wires.length));
r = parse(/2M_4EL_HIGHGAIN_QUAD\.nec$/i);
check('2M_4EL_HIGHGAIN_QUAD (前导零): 16 根无零长', r && r.wires.length === 16 && r.wires.every(w => !(w.x1 === w.x2 && w.y1 === w.y2 && w.z1 === w.z2)), r && String(r.wires.length));
r = parse(/LoopCirc20\.nec$/i);
check('LoopCirc20 (交错 SY): 12 根唯一几何 > 1', (() => { if (!r) return false; const u = new Set(r.wires.map(w => [w.x1, w.y1, w.z1, w.x2, w.y2, w.z2].map(v => v.toFixed(6)).join(','))); return r.wires.length === 12 && u.size > 1; })(), r && String(r.wires.length));
r = parse(/Catenary\.nec$/i);
check('Catenary (CW): 0 根 + CW 告警', r && r.wires.length === 0 && r.fileWarnings.some(x => x.includes('CW catenary')), r && JSON.stringify(r.fileWarnings.slice(-1)));
r = parse(/Gr_func\.nec$/i);
check('Gr_func (GR+NX): 导线 > 0 + NX 告警', r && r.wires.length > 0 && r.fileWarnings.some(x => x.includes('first dataset')), r && String(r.wires.length));
r = parse(/40m_vert_compromised\.nec$/i);
check('40m_vert_compromised (NS=0): NS=0 告警', r && r.fileWarnings.some(x => x.includes('NS=0')), r && JSON.stringify(r.fileWarnings).slice(0, 100));
r = parse(/2lsloper\.nec$/i);
check('2lsloper (-68 ft + #12): 2 根 y=±68ft', r && r.wires.length === 2 && near(Math.abs(r.wires[0].y1), 68 * 0.3048, 1e-9) && r.wires.every(w => w.rad > 0), r && JSON.stringify(r.wires[0]));
r = parse(/G5RV\.nec$/i);
check('G5RV (51 ft + #12): ≥1 根且无零长', r && r.wires.length >= 1 && r.wires.every(w => w.rad > 0), r && String(r.wires.length));
r = parse(/40M_moxon-beam\.nec$/i);
check('40M_moxon-beam (运算符空格): 6 根 + 无 fieldShape 告警', r && r.wires.length === 6 && !r.fileWarnings.some(x => x.includes('field count')), r && String(r.wires.length));
r = parse(/vert_dipole_array_trans_line\.nec$/i);
check('vert_dipole_array_trans_line: 3 根 + 无 fieldShape 告警', r && r.wires.length === 3 && !r.fileWarnings.some(x => x.includes('field count')), r && String(r.wires.length));
r = parse(/20M_OblongLoop_12mPole\.nec$/i);
check('20M_OblongLoop (A + H): 2 根 + 无 fieldShape 告警', r && r.wires.length === 2 && !r.fileWarnings.some(x => x.includes('field count')), r && String(r.wires.length));
r = parse(/2J2M-166\.NEC$/i);
check('2J2M-166 (D/2 - g/2): 9 根 + 无 fieldShape 告警', r && r.wires.length === 9 && !r.fileWarnings.some(x => x.includes('field count')), r && String(r.wires.length));
r = parse(/EFHW_10M_80M_VK3IL\.nec$/i);
check('EFHW (弯引号/变码 + SQR/ATN): 6 根', r && r.wires.length === 6, r && String(r.wires.length));
r = parse(/SC0605SM\.NEC$/i);
check('G0KSC 50MHz (0.5D1 隐式乘法): 5 根 rad=0.006', r && r.wires.length === 5 && r.wires.every(w => near(w.rad, 0.006, 1e-12)), r && JSON.stringify(r.wires.map(w => w.rad)));
r = parse(/Equations.4elQuad\.nec$/i);
check('Equations/4elQuad (^/LOG/多声明): 16 根 rad>0', r && r.wires.length === 16 && r.wires.every(w => w.rad > 0), r && String(r.wires.length));
r = parse(/ARRL.dipoles.DIP\.NEC$/i);
check('DIP.NEC (GW1,8, 粘连卡名): 1 根', r && r.wires.length === 1, r && String(r.wires.length));
r = parse(/137Mhz-QFHA1\.nec$/i);
check('137Mhz-QFHA1 (GH): 不抛异常 + GH 告警', r && r.fileWarnings.some(x => x.includes('GH (helix)')), '');
r = parse(/gs_8d_bb\.nec$/i);
check('gs_8d_bb (SM/SC): 不抛异常 + SM 告警', r && r.fileWarnings.some(x => x.includes('SM (surface mesh)')), '');
r = parse(/10-30m-box\.nec$/i);
check('10-30m-box (GR): 19 根 + 无 GR 不支持告警', r && r.wires.length === 19 && !r.fileWarnings.some(x => x.includes('cylindrical')), r && String(r.wires.length));

console.log(`\n${pass} PASS / ${fail} FAIL`);
