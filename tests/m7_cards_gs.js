// m7_cards_gs.js — 2026-09-24 NEC 解析审计修复批次 3 回归：卡片层 (GR/NS=0/CW/NX/字段切分/tag=0/段组) + GS 语义 + 告警统一
// 装配方式同 m5（state+i18n+语言包+utils+geometry+extract+convert+app）
const fs = require('fs');
const jsRoot = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_main\\js';
const packs = ['i18n/zh', 'i18n/en'].map(n => fs.readFileSync(`${jsRoot}\\${n}.js`, 'utf8')).join('\n');
const src = ['state', 'i18n', 'i18n/zh', 'i18n/en', 'utils', 'geometry', 'extract', 'convert', 'app'].map(n => fs.readFileSync(`${jsRoot}\\${n}.js`, 'utf8')).join('\n');
try { new Function('window', 'document', 'alert', src); console.log('SYNTAX OK (八文件+i18n)'); } catch (e) { console.log('SYNTAX FAIL: ' + e.message); process.exit(1); }

const elements = {
  inputNec: { value: '', style: {}, addEventListener: () => {}, focus: () => {} },
  outputMaa: { value: '' }, freq: { value: '', style: {}, focus: () => {} }, maaTitle: { value: 'T' },
  g_ground: { value: '0', addEventListener: () => {}, classList: { toggle: () => {} } }, gnd_cond: { value: '0.0' }, r_imp: { value: '50.0' }, x_imp: { value: '0.0' },
  ant_material: { value: '0' }, add_height: { value: '0.0' },
  az_angle: { value: '120' }, el_angle: { value: '60' },
  dm1: { value: '800' }, dm2: { value: '80' }, sc: { value: '2.0' }, ec: { value: '2' },
  sourceInput: { value: '' }, loadInput: { value: '' }, axis_map: { value: 'keep' },
  btnDownload: { disabled: false, addEventListener: () => {} },
  btnModeFile: { classList: { toggle: () => {} }, addEventListener: () => {} },
  btnModeCM: { classList: { toggle: () => {} }, addEventListener: () => {} },
  btnReExtract: { addEventListener: () => {} }, btnUpload: { addEventListener: () => {} }, btnConvert: { addEventListener: () => {} },
  fileInput: { addEventListener: () => {}, click: () => {} },
};
let alerts = [];
const documentStub = {
  getElementById: (id) => elements[id] || (elements[id] = { value: '', textContent: '', disabled: false, checked: false, style: {},
    classList: { toggle: () => {} }, addEventListener: () => {}, setAttribute: () => {}, click: () => {}, focus: () => {}, appendChild: () => {}, insertBefore: () => {}, options: [] }),
  addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') elements.__domReady = fn; },
  querySelectorAll: () => [], createElement: () => ({ click: () => {}, style: {} }),
  createTextNode: (t) => ({ textContent: t }), documentElement: { setAttribute: () => {} },
  body: { appendChild: () => {}, removeChild: () => {} },
};
const windowStub = {};
const api = new Function('window', 'document', 'alert', src + '\nvar N2M = window.N2M;\nreturn { extractFromNec, executeConvert, parseNec, collectWires, N2M: window.N2M };')(windowStub, documentStub, (m) => alerts.push(m));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? '  ' + detail : '')); process.exitCode = 1; }
}
const near = (a, b, eps = 1e-9) => typeof a === 'number' && isFinite(a) && Math.abs(a - b) <= eps;
const wOf = (nec, notes, sym) => api.collectWires(nec.split('\n'), sym || {}, notes || []);
function reset() {
  alerts = [];
  windowStub.N2M.state.unsupportedErrors = [];
  windowStub.N2M.state.currentFileName = '';
  windowStub.N2M.state.extractedCMs = [];
  elements.sourceInput.value = ''; elements.loadInput.value = '';
  elements.outputMaa.value = ''; elements.btnDownload.disabled = false;
}
function setup(nec) { reset(); elements.inputNec.value = nec; api.extractFromNec(nec, true); }

// === 1. GR 旋转复制 (审计用例 11) ===
let w = wOf('GW 1 1 1 0 0 2 0 0 0.01\nGR 10 4');
check('GR 10 4: 4 根; 第2根沿 +y tag=11; 第4根沿 -y tag=31',
  w.length === 4 && near(w[1].x1, 0) && near(w[1].y1, 1) && w[1].tag === 11 && near(w[3].x1, 0) && near(w[3].y1, -1) && w[3].tag === 31,
  JSON.stringify(w.map(x => ({ t: x.tag, x: +x.x1.toFixed(4), y: +x.y1.toFixed(4) }))));
w = wOf('GW 1 1 1 0 0 2 0 0 0.01\nGR 0 3');
check('GR ITGI=0: 3 根 tag 全相同 (段组跨导线)', w.length === 3 && w.every(x => x.tag === 1));
check('GR 后新 GW 隔离', wOf('GW 1 1 1 0 0 2 0 0 0.01\nGR 0 2\nGW 2 1 5 0 0 6 0 0 0.01').length === 3);

// === 2. NS=0 / CW / NX ===
let notes = [];
w = wOf('GW 1 0 0 0 0 1 0 0 0.01\nGW 2 3 0 0 0 1 0 0 0.01', notes);
check('NS=0: 不生成线段 + gw.ns0 告警', w.length === 1 && w[0].tag === 2 && notes.some(n => n.key === 'n2m.gw.ns0' && n.params.tag === 1), JSON.stringify(notes));
notes = [];
w = wOf('CW 1 39 -19.64 0 20 19.64 0 20 0.001 2 19.64 1', notes);
check('CW: 0 根 + cw.unsupported (不再静默)', w.length === 0 && notes.some(n => n.key === 'n2m.cw.unsupported' && n.params.count === 1), JSON.stringify(notes));
notes = [];
w = wOf('GW 1 1 0 0 0 1 0 0 0.01\nNX\nGW 2 1 0 0 0 2 0 0 0.01', notes);
check('NX: 只取首数据集 + nx.multiDataset', w.length === 1 && w[0].tag === 1 && notes.some(n => n.key === 'n2m.nx.multiDataset'), JSON.stringify(notes));

// === 3. 半径失败 vs GC 锥度 区分 ===
notes = [];
w = wOf('GW 1 1 0 0 0 1 0 0 0.5D1', notes);
check('半径求值失败: radUnparsed (非 gcTaper)', w.length === 0 && notes.some(n => n.key === 'n2m.gw.radUnparsed' && n.params.tag === '1') && !notes.some(n => n.key === 'n2m.gw.gcTaper'), JSON.stringify(notes));
notes = [];
w = wOf('GW 1 1 0 0 0 1 0 0 0\nGC 0 0 1 0.001 0.001', notes);
check('半径 0: gcTaper (真锥度, 保持原语义)', w.length === 0 && notes.some(n => n.key === 'n2m.gw.gcTaper' && !notes.some(m => m.key === 'n2m.gw.radUnparsed')), JSON.stringify(notes));

// === 4. 求值失败 → 跳过导线 + 聚合告警 ===
notes = [];
w = wOf('SY Q=XYZ\nGW 1 1 0 0 0 Q 0 0 0.01\nGW 2 1 0 0 0 1 0 0 0.01', notes);
check('坐标求值失败: 跳过该导线 + expr.evalFailed 聚合', w.length === 1 && w[0].tag === 2 && notes.some(n => n.key === 'n2m.expr.evalFailed'), JSON.stringify(notes));

// === 5. 字段切分 (含空格表达式 / 数值+单位 / 非 ASCII 注释) ===
w = wOf('GW 1 31 0 -51 ft 0 0 51 ft 0 #12');
check('G5RV 形态: -51 ft/51 ft + #12 半径', w.length === 1 && near(w[0].y1, -51 * 0.3048, 1e-12) && near(w[0].rad, 0.0010259, 5e-7), JSON.stringify(w[0]));
w = wOf('GW 1 1 0 0 A + H 0 W A + H - h2 0.5*1e-3', null, { A: 1, H: 2, W: 3, H2: 4 });
check('运算符空格: A + H 表达式合并且求值', w.length === 1 && near(w[0].z1, 3) && near(w[0].y2, 3) && near(w[0].z2, -1) && near(w[0].rad, 0.0005), JSON.stringify(w[0]));
w = wOf('GW 4 8 0 s h 0 D/2 - g/2 h wrad', null, { S: 1, H: 2, D: 2, G: 1, WRAD: 0.001 });
check('D/2 - g/2 形态合并求值', w.length === 1 && near(w[0].y2, 0.5), JSON.stringify(w[0]));
w = wOf('GW 1 10 0 0 EndHeight CoilSX 0 CoilSZ 0.00025 \u00e2Section from start to coil', null, { ENDHEIGHT: 1, COILSX: 2, COILSZ: 3 });
check('非 ASCII 注释截断 (EFHW 形态): 10 字段', w.length === 1 && near(w[0].rad, 0.00025) && near(w[0].x2, 2), JSON.stringify(w[0]));
notes = [];
w = wOf('GW 1 1 0 0 0 1 0 0 0.01 XYZ ABC', notes);
check('字段数异常: card.fieldShape 告警', w.length === 1 && notes.some(n => n.key === 'n2m.card.fieldShape' && n.params.card === 'GW' && n.params.n === 11), JSON.stringify(notes));

// === 6. EX/LD 段定位 (tag=0 绝对段号 / 多导线同 tag 段组 / 越界) ===
setup('GW 5 1 0 0 0 1 0 0 0.01\nGW 7 1 0 0 0 2 0 0 0.01\nEX 0 0 2 0 1 0\nFR 0 1 0 0 14 0\nEN');
check('EX tag=0: 绝对段号 2 → w2', elements.sourceInput.value.startsWith('w2'), elements.sourceInput.value);
setup('GW 5 2 0 0 0 1 0 0 0.01\nGW 7 2 0 0 0 2 0 0 0.01\nEX 0 0 3 0 1 0\nFR 0 1 0 0 14 0\nEN');
check('EX tag=0: 绝对段号 3 跨导线 → w2c', elements.sourceInput.value.startsWith('w2c'), elements.sourceInput.value);
setup('GW 9 2 0 0 0 1 0 0 0.01\nGR 0 4\nEX 0 9 3 0 1 0\nFR 0 1 0 0 14 0\nEN');
check('EX 多导线同 tag 段组: (9,3) → w2c', elements.sourceInput.value.startsWith('w2c'), elements.sourceInput.value);
setup('GW 5 1 0 0 0 1 0 0 0.01\nEX 0 99 1 0 1 0\nFR 0 1 0 0 14 0\nEN');
check('EX 段定位失败: 告警 + 不产出源', alerts.some(a => a.includes('段定位失败')) && elements.sourceInput.value === 'w1c, 1.0, 0.0', JSON.stringify(alerts.slice(-2)));
setup('GW 5 2 0 0 0 1 0 0 0.01\nGW 7 2 0 0 0 2 0 0 0.01\nLD 3 0 2 2 50 25\nFR 0 1 0 0 14 0\nEN');
check('LD tag=0: 绝对段号 2 → w1e (线1末段)', elements.loadInput.value.startsWith('w1e'), elements.loadInput.value);

// === 7. 告警统一 (D10): 两路径 Warnings 一致 + 无跨文件污染 ===
reset();
const necA = 'GW 1 1 0 0 0 1 0 0 0.01\nEX 6 1 1 0 0.707 0.707\nFR 0 1 0 0 14 0\nEN';
elements.inputNec.value = necA; elements.freq.value = '14';
api.extractFromNec(necA, true);
api.executeConvert();
const warnLoadThenConvert = (elements.outputMaa.value.split('Warnings:')[1] || '').trim();
reset();
elements.inputNec.value = necA; elements.freq.value = '14';
api.executeConvert();
const warnDirect = (elements.outputMaa.value.split('Warnings:')[1] || '').trim();
check('告警统一: 加载→转换 与 直接转换 Warnings 逐字一致', warnLoadThenConvert.length > 0 && warnLoadThenConvert === warnDirect, JSON.stringify({ warnLoadThenConvert, warnDirect }));
reset();
elements.inputNec.value = 'GW 1 1 0 0 0 1 0 0 0.01\nEX 1 0 0 0 1 0 0 1 0 0\nFR 0 1 0 0 14 0\nEN'; elements.freq.value = '14';
api.executeConvert();
check('文件 A: EX1 平面波告警在 Warnings', elements.outputMaa.value.includes('plane-wave'), '');
reset();
elements.inputNec.value = 'GW 1 1 0 0 0 1 0 0 0.01\nFR 0 1 0 0 14 0\nEN'; elements.freq.value = '14';
api.executeConvert();
check('文件 B: 无跨文件告警残留 (污染消除)', !elements.outputMaa.value.includes('plane-wave'), (elements.outputMaa.value.split('Warnings:')[1] || 'none').slice(0, 60));

// === 8. 语料定点 (批次 3 关键文件) ===
const R = 'F:\\Antenna_Models\\AntennaFiles-OLD-master_天线模型收藏\\AntennaFiles-OLD-master\\4nec2_models\\';
function corpus(rel) { const p = R + rel; return fs.existsSync(p) ? fs.readFileSync(p, 'latin1') : null; }
const gr = corpus('Objects\\Gr_func.nec');
if (gr) {
  const r = api.parseNec(gr);
  check('Gr_func.nec (GR+NX): 不抛异常; NX 告警; GR 已复制', r.wires.length > 0 && r.fileWarnings.some(x => x.includes('NX') || x.includes('first dataset')), `n=${r.wires.length}`);
} else check('Gr_func.nec 存在', false, R);
const cw = corpus('Nec4\\Catenary.nec');
if (cw) {
  const r = api.parseNec(cw);
  check('Catenary.nec (CW): 0 根 + CW 告警', r.wires.length === 0 && r.fileWarnings.some(x => x.includes('CW')), JSON.stringify(r.fileWarnings));
} else check('Catenary.nec 存在', false, R);
const slop = corpus('HFActiveFeed\\2lsloper.nec');
if (slop) {
  const r = api.parseNec(slop);
  check('2lsloper.nec (-68 ft + #12): 2 根, y=±68ft 缩放, 半径>0', r.wires.length === 2 && r.wires.every(x => x.rad > 0) && near(Math.abs(r.wires[0].y1), 68 * 0.3048, 1e-9), JSON.stringify(r.wires[0]));
} else check('2lsloper.nec 存在', false, R);
const ns0 = corpus('..\\..\\..\\40m_vert_compromised.nec') || (fs.existsSync('F:\\Antenna_Models\\AntennaFiles-OLD-master_天线模型收藏\\AntennaFiles-OLD-master\\40m_vert_compromised.nec') ? fs.readFileSync('F:\\Antenna_Models\\AntennaFiles-OLD-master_天线模型收藏\\AntennaFiles-OLD-master\\40m_vert_compromised.nec', 'latin1') : null);
if (ns0) {
  const r = api.parseNec(ns0);
  check('40m_vert_compromised.nec (NS=0): ns0 告警', r.fileWarnings.some(x => x.includes('NS=0')), JSON.stringify(r.fileWarnings).slice(0, 120));
} else console.log('SKIP 40m_vert_compromised.nec (路径)');

// === 9. 端到端 (真实文件 → .maa 输出, 含 Warnings 区) ===
const nxFile = 'F:\\Antenna_Models\\G4CQM\\144NX13S.nec';
if (fs.existsSync(nxFile)) {
  reset();
  elements.inputNec.value = fs.readFileSync(nxFile, 'latin1');
  elements.freq.value = '144.5';
  api.executeConvert();
  const out = elements.outputMaa.value;
  check('端到端: 144NX13S → .maa x2=0.4490 + Warnings 区', out.includes('0.4490') && out.includes('Warnings'), out.split('\n').slice(0, 6).join(' | '));
  check('端到端: 输出无 NaN', !out.includes('NaN'), '');
} else console.log('SKIP 144NX13S.nec (路径)');

// === 10. 审查修复回归 (2026-09-24 独立审查 12 项) ===
setup('GW 1 4 0 0 0 1 0 0 0.01\nEX 0 1 1 0 1 BAD\nFR 0 1 0 0 14 0\nEN');
check('EX 幅度求值失败: 丢弃 + 告警 (不产出 NaN)', !elements.sourceInput.value.includes('NaN') && alerts.some(a => a.includes('表达式求值失败')), elements.sourceInput.value);
{
  const r = api.parseNec('GW 1 1 0 0 0 1 0 0 0.01\nNX\nGW 2 1 0 0 0 2 0 0 0.01\nEN');
  check('NX 告警单条 (Warnings 不重复)', r.fileWarnings.filter(x => /first dataset/.test(x)).length === 1, JSON.stringify(r.fileWarnings));
}
{
  const r = api.parseNec('GW 1 4 0 0 0 1 0 0 0.01\nEX 0 1 1 0 1 - 0.5\nFR 0 1 0 0 14 0\nEN');
  check('EX 独立 +/- 不合并求值 (告警而非静默 0.5)', r.parsedSources.length === 0 && r.fileWarnings.some(x => x.includes('unparseable')), JSON.stringify(r.fileWarnings));
}
{
  const r = api.parseNec('GW 1 4 0 0 0 1 0 0 0.01\nLD 1 1 1 0 0 60.7 uh 0\nFR 0 1 0 0 14 0\nEN');
  check('LD 值+空格+uh 合并 (行有效, 无 NaN)', r.ld.parsedLoads.length === 1 && !r.ld.parsedLoads[0].includes('NaN'), JSON.stringify(r.ld.parsedLoads));
}
{
  const r = api.parseNec('GW 1 1 0 0 0 1 0 0 0.01\nGN BAD 0 0 0 5 13\nFR 0 1 0 0 14 0\nEN');
  check('GN 类型求值失败: 告警 (原静默保持默认)', r.fileWarnings.some(x => x.includes('ground type unparseable')), JSON.stringify(r.fileWarnings));
}
setup('GW 1 4 0 0 0 1 0 0 0.01\nEX 0 1 0.5 0 1 0\nFR 0 1 0 0 14 0\nEN');
check('EX 0.5 段 → 百分比 50% (w1c)', elements.sourceInput.value.startsWith('w1c'), elements.sourceInput.value);
reset();
elements.inputNec.value = 'GW 1 1 0 0 0 1 0 0 0.01\nFR 0 1 0 0 14 0\nEN';
elements.freq.value = '14'; elements.sourceInput.value = 'w1c, NaN, 0.0';
api.executeConvert();
const srcSec = (elements.outputMaa.value.split('***Source***')[1] || '').split('***')[0];
check('源行 NaN 门禁: 丢弃 + 告警 (N2M 补 R1 同款)', !srcSec.includes('NaN') && elements.outputMaa.value.includes('non-finite values dropped'), JSON.stringify(srcSec.slice(0, 40)));

console.log(`\n${pass} PASS / ${fail} FAIL`);
