const fs = require('fs');
const v03js = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_main\\js';
// i18n-2/3 批次同步: app/extract/convert 依赖 L() — 拼入 i18n.js + 语言包 (zh 默认, 中文断言不变)
const packs = ['i18n/zh', 'i18n/en'].map(n => fs.readFileSync(`${v03js}\\${n}.js`, 'utf8')).join('\n');
const src = ['state', 'i18n', 'i18n/zh', 'i18n/en', 'utils', 'geometry', 'extract', 'convert', 'app'].map(n => fs.readFileSync(`${v03js}\\${n}.js`, 'utf8')).join('\n');
try { new Function('window', 'document', 'alert', src); console.log('SYNTAX OK (六文件+i18n)'); } catch (e) { console.log('SYNTAX FAIL: ' + e.message); process.exit(1); }

const elements = {
  inputNec: { value: '', style: {}, addEventListener: () => {}, focus: () => {} },
  outputMaa: { value: '' }, freq: { value: '', style: {}, focus: () => {} }, maaTitle: { value: 'T' },
  g_ground: { value: '0', addEventListener: () => {}, classList: { toggle: () => {} } }, gnd_cond: { value: '0.0' }, r_imp: { value: '50.0' }, x_imp: { value: '0.0' },
  ant_material: { value: '0' }, add_height: { value: '0.0' },   // R11: G/H 字段2=高度/字段3=材料
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
  // 兜底桩补齐 R5b 后新增的 DOM 依赖 (m2nGroundPreset.appendChild / classList / setAttribute / checked)
  getElementById: (id) => elements[id] || (elements[id] = { value: '', textContent: '', disabled: false, checked: false, style: {},
    classList: { toggle: () => {} }, addEventListener: () => {}, setAttribute: () => {}, click: () => {}, focus: () => {}, appendChild: () => {}, insertBefore: () => {}, options: [] }),
  addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') elements.__domReady = fn; },
  querySelectorAll: () => [],
  createElement: () => ({ click: () => {}, style: {} }),
  createTextNode: (t) => ({ textContent: t }),   // i18n-1: applyI18n workTitle firstChild 路径
  documentElement: { setAttribute: () => {} },
  body: { appendChild: () => {}, removeChild: () => {} },
};
const windowStub = {};
const api = new Function('window', 'document', 'alert', src + '\nvar N2M = window.N2M;\nreturn { extractFromNec, executeConvert, setTitleMode, updateTitleInput, processInputText, downloadMaa, N2M: window.N2M, getDomReady: () => elements.__domReady };')(windowStub, documentStub, (m) => alerts.push(m));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? '  ' + detail : '')); process.exitCode = 1; }
}
function reset() {
  alerts = [];
  windowStub.N2M.state.unsupportedErrors = [];
  windowStub.N2M.state.currentFileName = '';
  windowStub.N2M.state.extractedCMs = [];
  elements.sourceInput.value = ''; elements.loadInput.value = '';
  elements.outputMaa.value = ''; elements.btnDownload.disabled = false;
}

// === 1. W8BYA 全流程 (真实文件) ===
reset();
const w8bya = fs.readFileSync('F:\\Antenna_Models\\AntennaFiles-OLD-master_天线模型收藏\\AntennaFiles-OLD-master\\4nec2_models\\HFcollinear\\W8BYA Collinear 7 MHz.nec', 'utf8');
api.processInputText(w8bya, 'W8BYA Collinear 7 MHz.nec');
api.executeConvert();
const out = elements.outputMaa.value;
const lines = out.split('\n');
check('W8BYA: 转换产出', out.length > 100, `${lines.length} 行`);
check('W8BYA: freq 7.2', lines[2] === '7.2', lines[2]);
check('W8BYA: 标题=文件名模式', lines[0].startsWith('Converted from'), lines[0]);
check('W8BYA: 导线 2 根 ×0.3048', lines[5].includes('-25.1460') && lines[5].includes('18.2880'), lines[5]);
const si = lines.indexOf('***Source***');
check('W8BYA: 源 2 个', lines[si+1].replace(/\s/g,'') === '2,0', lines[si+1]);
check('W8BYA: w1c/w2c', lines[si+2].startsWith('w1c,') && lines[si+3].startsWith('w2c,'));
const gi = lines.indexOf('***G/H/M/R/AzEl/X***');
check('W8BYA: G/H 行 (GN2 降级→2, 第3字段0)', lines[gi+1] === '2,\t0.0,\t0,\t50.0,\t120,\t60,\t0.0', lines[gi+1]);
check('W8BYA: Warnings 含 GN 降级', out.includes('Sommerfeld-Norton'));
check('W8BYA: Warnings 含 EX6×2', (out.match(/EX 6 current source/g) || []).length === 2);
check('W8BYA: Warnings 含 LD5×2', (out.match(/LD 5 conductivity/g) || []).length === 2);

// === 2. 4x_DJ9BV 反推样例 (M6 双跑预演) ===
reset();
elements.maaTitle.value = 'T';
const nec4x = ['CM 4x BVO subset regression','GW 1 11 0.134 -1.23135 -0.952 0.134 -0.89465 -0.952 0.004','GM 26 1 0 0 0 0 0 1.904','GM 26 1 0 0 0 0 0 1.904','GM 26 1 0 0 0 0 0 1.904','EX 0 1 6 0 1 0','EX 0 27 6 0 1 0','EX 0 53 6 0 1 0','EX 0 79 6 0 1 0','FR 0 1 0 0 432.1 0','EN'].join('\n');
elements.inputNec.value = nec4x;
api.extractFromNec(nec4x, true);
api.executeConvert();
const l2 = elements.outputMaa.value.split('\n');
const wi = l2.indexOf('***Wires***');
check('4x: 导线数 8 (连续GM指数)', l2[wi+1] === '8', l2[wi+1]);
check('4x: 第8根 z=4.76', l2[wi+9].includes('4.7600'), l2[wi+9]);
const s2 = l2.indexOf('***Source***');
check('4x: 源 4 个 w1c/w2c/w4c/w8c', l2[s2+1].replace(/\s/g,'') === '4,0' && l2[s2+2].startsWith('w1c,') && l2[s2+3].startsWith('w2c,') && l2[s2+4].startsWith('w4c,') && l2[s2+5].startsWith('w8c,'), l2.slice(s2+1, s2+6).join(' '));
const sg = l2.indexOf('***Segmentation***');
check('4x: Segmentation', l2[sg+1] === '800,\t80,\t2.0,\t2', l2[sg+1]);
const g2 = l2.indexOf('***G/H/M/R/AzEl/X***');
check('4x: G/H 第3字段0', l2[g2+1] === '0,\t0.0,\t0,\t50.0,\t120,\t60,\t0.0', l2[g2+1]);

// === 3. Load 行校验回归 ===
reset();
api.extractFromNec('GW 1 21 0 0 5 0 0 -5 0.001\nFR 0 1 0 0 14 0\nEN', true);
elements.loadInput.value = 'w1c, 1, 50.0000, 25.0000\nw2c 0 3\nw3c, 2, 50.0000\nw4c, 1, 50.0000, abc\nW5C-1, 0, 3.3, 100.0, 200.0';
api.executeConvert();
const l3 = elements.outputMaa.value.split('\n');
const li = l3.indexOf('***Load***');
check('Load校验: 数量行 2,0 (3坏行剔除)', l3[li+1].replace(/\s/g,'') === '2,0', l3[li+1]);
check('Load校验: 大写 W5C-1 进', l3[li+3].startsWith('W5C-1'), l3[li+3]);
check('Load校验: 坏行告警', alerts.some(a => a.includes('格式非法')));
check('Load校验: Warnings 3 条 BAD LOAD', (elements.outputMaa.value.match(/BAD LOAD row dropped/g) || []).length === 3);

// === 4. 事件绑定冒烟 ===
reset();
check('DOMContentLoaded 绑定函数已捕获', typeof elements.__domReady === 'function');
let bindCalls = [];
elements.btnConvert.addEventListener = (ev, fn) => bindCalls.push('btnConvert');
elements.__domReady();
check('domReady() 可执行无异常', true);

// === 5. setTitleMode/updateTitleInput (v02 行为) ===
reset();
api.setTitleMode('cm');
windowStub.N2M.state.extractedCMs = ['W8BYA Collinear  40 m'];
api.updateTitleInput();
check('CM 模式标题', elements.maaTitle.value === 'W8BYA Collinear  40 m', elements.maaTitle.value);
windowStub.N2M.state.currentFileName = 'test';
api.setTitleMode('file');
check('file 模式标题', elements.maaTitle.value === 'Converted from test', elements.maaTitle.value);

// === 6. 频率空 → executeConvert 拦截 ===
reset();
elements.inputNec.value = 'GW 1 9 0 0 5 0 0 -5 0.001\nEN';
elements.freq.value = '';
api.executeConvert();
check('频率空拦截', alerts.some(a => a.includes('频率不能为空')) && elements.outputMaa.value === '', '');

// === 7. 空输入拦截 ===
reset();
elements.inputNec.value = '';
elements.freq.value = '14';
api.executeConvert();
check('空输入拦截', alerts.some(a => a.includes('请先载入 NEC 代码')), '');

console.log(`\n${pass} PASS / ${fail} FAIL`);
