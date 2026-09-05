const fs = require('fs');
const base = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_main\\js';
// i18n-3 批次同步: extract 依赖 L() — 拼入 i18n.js + 语言包 (zh 默认语言, 告警中文断言不变)
const packs = ['i18n/zh', 'i18n/en'].map(n => fs.readFileSync(`${base}\\${n}.js`, 'utf8')).join('\n');
const src = ['state', 'i18n', 'utils', 'geometry', 'extract'].map(n => fs.readFileSync(`${base}\\${n}.js`, 'utf8')).join('\n') + '\n' + packs;
try { new Function('window', 'document', 'alert', 'updateTitleInput_missing', src); } catch (e) { if (!/updateTitleInput/.test(e.message)) { console.log('SYNTAX FAIL: ' + e.message); process.exit(1); } else { console.log('SYNTAX OK (updateTitleInput 未定义属预期, app.js 未建)'); } }

const elements = {
  inputNec: { value: '', style: {}, addEventListener: () => {}, focus: () => {} },
  outputMaa: { value: '' }, freq: { value: '', style: {} }, maaTitle: { value: 'T' },
  g_ground: { value: '0' }, gnd_cond: { value: '0.0' }, r_imp: { value: '50.0' }, x_imp: { value: '0.0' },
  az_angle: { value: '120' }, el_angle: { value: '60' },
  dm1: { value: '800' }, dm2: { value: '80' }, sc: { value: '2.0' }, ec: { value: '2' },
  sourceInput: { value: '' }, loadInput: { value: '' }, axis_map: { value: 'keep' }, btnDownload: { disabled: false },
  btnModeFile: { classList: { toggle: () => {} } }, btnModeCM: { classList: { toggle: () => {} } },
};
let alerts = [];
const documentStub = {
  getElementById: (id) => elements[id] || (elements[id] = { value: '', style: {}, addEventListener: () => {}, focus: () => {} }),
  addEventListener: () => {}, querySelectorAll: () => [],
};
// updateTitleInput 桩 (app.js 未建)
const appStub = 'function updateTitleInput() {}';
// N2M 桥接: state.js 写 window.N2M; Node Function 桩无全局 N2M → src 后同步 var N2M = window.N2M
// (浏览器里 window.N2M 自动成为全局 N2M, 产品代码裸引用合法; 此桥接仅测试基建)
const windowStub = {};
const bridge = 'var N2M = window.N2M;';
const api2 = new Function('window', 'document', 'alert', src + '\n' + bridge + '\n' + appStub + '\nreturn { extractFromNec, N2M: window.N2M };')(windowStub, documentStub, (m) => alerts.push(m));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? '  ' + detail : '')); process.exitCode = 1; }
}
function setup(nec) { alerts = []; windowStub.N2M.state.unsupportedErrors = []; elements.sourceInput.value = ''; elements.loadInput.value = ''; api2.extractFromNec(nec, true); }

const GW21 = 'GW 1 21 0 0 5 0 0 -5 0.001';
const FR14 = 'FR 0 1 0 0 14 0';

// === LD 七类型 (v02 batch6 用例) ===
setup(`${GW21}\nLD 1 1 11 11 100 2E-6 100E-12\n${FR14}\nEN`);
check('LD1 串联RLC集总', elements.loadInput.value.startsWith('w1c, 0, 2.0000, 100.0000, 1.7593'), elements.loadInput.value);
setup(`${GW21}\nLD 3 1 11 11 50 25\n${FR14}\nEN`);
check('LD3 串联阻抗', elements.loadInput.value === 'w1c, 1, 50.0000, 25.0000', elements.loadInput.value);
setup(`${GW21}\nLD 2 1 11 11 50 2E-6 100E-12\n${FR14}\nEN`);
check('LD2 并联RLC 等效', elements.loadInput.value.startsWith('w1c, 1, 48.8178, -7.5969'), elements.loadInput.value);
check('LD2 Warnings parallel->series', windowStub.N2M.state.unsupportedErrors.some(x => x.includes('LD 2 parallel->series @F1=14')), '');
setup(`${GW21}\nLD 2 1 11 11 50 2E-6 100E-12\nEN`);
check('LD2 无FR → 告警', elements.loadInput.value === '' && alerts.some(a => a.includes('需要工作频率')), '');
setup(`${GW21}\nLD 4 1 11 11 0.02 0\n${FR14}\nEN`);
check('LD4 并联导纳', elements.loadInput.value === 'w1c, 1, 50.0000, 0.0000', elements.loadInput.value);
setup(`${GW21}\nLD 5 1 0 0 5.8E7\n${FR14}\nEN`);
check('LD5 电导率告警', elements.loadInput.value === '' && alerts.some(a => a.includes('手动设置线材质') && a.includes('5.8e7')), '');
setup(`${GW21}\nLD 0 1 0 0 0.5 2E-6 100E-12\n${FR14}\nEN`);
check('LD0 单位长 → 失败告警', alerts.some(a => a.includes('转换失败') && a.includes('每单位长')), '');
setup(`${GW21}\nLD 3 1 0 0 50 25\n${FR14}\nEN`);
check('LD seg_from=0 → 中心告警', elements.loadInput.value.startsWith('w1c, 1, 50.0000, 25.0000') && alerts.some(a => a.includes('整段分布负载')), elements.loadInput.value);
setup(`${GW21}\nLD 1 1 11 11 100 2E-6 100E-12\nLD 3 1 11 11 50 25\nLD 4 1 21 21 0.02 0\n${FR14}\nEN`);
const loads = elements.loadInput.value.split('\n');
check('LD 混合 3 行', loads.length === 3 && loads[2].startsWith('w1e, 1, 50.0000, 0.0000'), JSON.stringify(loads));

// === EX 全类型 (v02 bugfix_ex 用例) ===
setup(`${GW21}\nEX 0 1 11 0 1 0\n${FR14}\nEN`);
check('EX0 → w1c 无告警', elements.sourceInput.value.startsWith('w1c, 1.0000, 0.0000') && !alerts.some(a => a.includes('激励源 (EX) 处理说明')), '');
setup(`${GW21}\nEX 5 1 11 0 1 0\n${FR14}\nEN`);
check('EX5 连接点提示', alerts.some(a => a.includes('电荷不连续') && a.includes('连接处')), '');
setup(`${GW21}\nEX 1 0 0 0 1 0 0 1 0 0\n${FR14}\nEN`);
check('EX1 平面波丢弃', alerts.some(a => a.includes('入射平面波')) && windowStub.N2M.state.unsupportedErrors.some(x => x.includes('EX 1 plane-wave')), '');
setup(`${GW21}\nEX 6 1 11 0 0.707 0.707\n${FR14}\nEN`);
check('EX6 复数 0.9998∠45', elements.sourceInput.value.startsWith('w1c, 0.9998, 45.0000'), elements.sourceInput.value);

// === W8BYA 原文件 (真实文件端到端) ===
const w8bya = fs.readFileSync('F:\\Antenna_Models\\AntennaFiles-OLD-master_天线模型收藏\\AntennaFiles-OLD-master\\4nec2_models\\HFcollinear\\W8BYA Collinear 7 MHz.nec', 'utf8');
setup(w8bya);
check('W8BYA 双源 w1c+w2c', elements.sourceInput.value.split('\n')[0].startsWith('w1c, 1.0000') && elements.sourceInput.value.split('\n')[1].startsWith('w2c, 1.0000'), JSON.stringify(elements.sourceInput.value));
check('W8BYA EX6 告警', alerts.some(a => a.includes('电流源') && a.includes('电压源')), '');
check('W8BYA GN2 降级告警', alerts.some(a => a.includes('Sommerfeld-Norton')), '');
check('W8BYA freq=7.2', String(elements.freq.value) === '7.2', String(elements.freq.value));
check('W8BYA g_ground=2', elements.g_ground.value === '2', elements.g_ground.value);
// 告警顺序契约: GN 降级 → LD5 → (无 LD1) → EX → 模糊定位
const order = alerts.map(a => a.includes('Sommerfeld-Norton') ? 'GN' : a.includes('导线电导率') ? 'LD5' : a.includes('激励源 (EX)') ? 'EX' : a.includes('点位定义') ? 'FUZZY' : 'other');
check('W8BYA 告警顺序 GN→LD5→EX→FUZZY', JSON.stringify(order) === JSON.stringify(['GN', 'LD5', 'EX', 'FUZZY']), JSON.stringify(order));
// LD5 告警在 hasLD 块内 (W8BYA 有 LD → 应触发)
check('W8BYA Warnings 含 2 条 LD5', windowStub.N2M.state.unsupportedErrors.filter(x => x.includes('LD 5 conductivity')).length === 2, '');

// === exNotes 块外专测: 无 LD 卡文件 EX 告警仍弹出 ===
setup(`${GW21}\nEX 1 0 0 0 1 0 0 1 0 0\n${FR14}\nEN`);
check('无LD文件 EX 告警仍弹 (exNotes 块外)', alerts.some(a => a.includes('入射平面波')), '');

// === 无 EX/LD 简单文件 → 兜底假源 ===
setup(`${GW21}\n${FR14}\nEN`);
check('无源文件 → 兜底 w1c, 1.0, 0.0', elements.sourceInput.value === 'w1c, 1.0, 0.0', elements.sourceInput.value);

console.log(`\n${pass} PASS / ${fail} FAIL`);
