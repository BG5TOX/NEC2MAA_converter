const fs = require('fs');
const base = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_v03\\js';
const src = ['state', 'utils', 'geometry', 'extract',
             'maa2nec/maa-parser', 'maa2nec/maa-symbols', 'maa2nec/maa-writer',
             'convert', 'app'].map(n => fs.readFileSync(`${base}\\${n}.js`, 'utf8')).join('\n');
try { new Function('window', 'document', 'alert', src); console.log('SYNTAX OK (九文件)'); } catch (e) { console.log('SYNTAX FAIL: ' + e.message); process.exit(1); }

const elements = {
  inputNec: { value: '', style: {}, addEventListener: () => {}, focus: () => {} },
  outputMaa: { value: '' }, freq: { value: '', style: {}, focus: () => {} }, maaTitle: { value: 'T' },
  g_ground: { value: '0' }, gnd_cond: { value: '0.0' }, r_imp: { value: '50.0' }, x_imp: { value: '0.0' },
  az_angle: { value: '120' }, el_angle: { value: '60' },
  dm1: { value: '800' }, dm2: { value: '80' }, sc: { value: '2.0' }, ec: { value: '2' },
  sourceInput: { value: '' }, loadInput: { value: '' }, axis_map: { value: 'keep' },
  btnDownload: { disabled: false, addEventListener: () => {}, textContent: '' },
  btnModeFile: { classList: { toggle: () => {} }, addEventListener: () => {} },
  btnModeCM: { classList: { toggle: () => {} }, addEventListener: () => {} },
  btnReExtract: { addEventListener: () => {} }, btnUpload: { addEventListener: () => {}, textContent: '' },
  btnConvert: { addEventListener: () => {} },
  wizN2M: { addEventListener: () => {} }, wizM2N: { addEventListener: () => {} },
  btnSwitchDir: { addEventListener: () => {} }, btnSwitchDirLabel: { textContent: '' },
  dirBadge: { textContent: '' },
  wizardScreen: { style: {} }, workScreen: { style: { display: 'none' } },
  panelSettingsWrap: { style: {} },
  fileInput: { addEventListener: () => {}, click: () => {}, setAttribute: () => {} },
};
let alerts = [];
const documentStub = {
  getElementById: (id) => elements[id] || (elements[id] = { value: '', style: {}, addEventListener: () => {}, focus: () => {} }),
  addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') elements.__domReady = fn; },
  querySelectorAll: () => [],
  createElement: () => ({ click: () => {}, style: {} }),
  body: { appendChild: () => {}, removeChild: () => {} },
};
const windowStub = {};
let domReadyFn = null;
const patchedDoc = new Proxy(documentStub, { get(t, p) { if (p === 'addEventListener') return (ev, fn) => { if (ev === 'DOMContentLoaded') domReadyFn = fn; }; return t[p]; } });
const api = new Function('window', 'document', 'alert', src + '\nvar N2M = window.N2M;\nreturn { extractFromNec, executeConvert, executeConvertM2N, setDirection, sniffDirection, processInputText, parseMaa, writeMaaToNec };')(windowStub, patchedDoc, (m) => alerts.push(m));
api.domReady = () => domReadyFn && domReadyFn();
api.getDirection = () => windowStub.N2M.state.direction;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? '  ' + detail : '')); process.exitCode = 1; }
}

api.domReady();

// === 1. 开屏向导: 初始只显向导 ===
check('开屏: wizardScreen 可见', elements.wizardScreen.style.display !== 'none');
check('开屏: workScreen 隐藏', elements.workScreen.style.display === 'none');

// === 2. 点击 MAA→NEC 卡片进入 ===
elements.wizM2N.click = () => { };  // 模拟: 直接调用绑定链 (桩无真实事件, 手动触发 setDirection+enterWorkScreen 效果)
// 手动执行 enterWorkScreen 等效逻辑 (绑定在 domReady, 桩中 wizM2M.addEventListener 为空 — 直接调用 api)
// enterWorkScreen 未导出, 用 setDirection + 显隐模拟:
api.setDirection('m2n');
elements.wizardScreen.style.display = 'none';
elements.workScreen.style.display = '';
check('进入 m2n: 徽标', elements.dirBadge.textContent === 'MAA → NEC', elements.dirBadge.textContent);
check('进入 m2n: 切换按钮文案', elements.btnSwitchDirLabel.textContent === 'NEC转MAA', elements.btnSwitchDirLabel.textContent);
check('进入 m2n: NEC侧面板隐藏', elements.panelSettingsWrap.style.display === 'none');
check('进入 m2n: 导入按钮 .maa', elements.btnUpload.textContent.includes('.maa'));

// === 3. 切回 NEC→MAA ===
api.setDirection('n2m');
check('切回 n2m: 徽标', elements.dirBadge.textContent === 'NEC → MAA');
check('切回 n2m: 面板恢复', elements.panelSettingsWrap.style.display === '');
check('切回 n2m: 导入按钮 .nec', elements.btnUpload.textContent.includes('.nec'));

// === 4. 向导卡进入 NEC 方向后全链路回归 (W8BYA) ===
alerts = []; windowStub.N2M.state.unsupportedErrors = [];
windowStub.N2M.state.currentFileName = 'W8BYA';
const w8byaNec = fs.readFileSync('F:\\Antenna_Models\\AntennaFiles-OLD-master_天线模型收藏\\AntennaFiles-OLD-master\\4nec2_models\\HFcollinear\\W8BYA Collinear 7 MHz.nec', 'utf8');
api.processInputText(w8byaNec, 'W8BYA Collinear 7 MHz.nec');
api.executeConvert();
check('n2m 链路回归: .maa 输出', elements.outputMaa.value.includes('***Wires***') && elements.outputMaa.value.includes('w1c'));

// === 5. MAA 方向链路回归 (VDP40B) ===
alerts = [];
api.setDirection('m2n');
const vdp = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');
elements.inputNec.value = vdp;
api.executeConvertM2N();
check('m2n 链路回归: .nec 输出', elements.outputMaa.value.includes('SY D1=') && elements.outputMaa.value.includes('EX 0, 1, 50%'));
check('m2n: 下载启用', elements.btnDownload.disabled === false);

console.log(`\n${pass} PASS / ${fail} FAIL`);
