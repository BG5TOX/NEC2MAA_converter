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
  btnDirN2M: { classList: { toggle: () => {} }, addEventListener: () => {} },
  btnDirM2N: { classList: { toggle: () => {} }, addEventListener: () => {} },
  dirHint: { textContent: '' },
  panelSettings: { style: {} }, panelSettingsWrap: { style: {} },
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
const patchedDoc = new Proxy(documentStub, {
  get(target, prop) { if (prop === 'addEventListener') return (ev, fn) => { if (ev === 'DOMContentLoaded') domReadyFn = fn; }; return target[prop]; }
});
const api = new Function('window', 'document', 'alert', src + '\nvar N2M = window.N2M;\nreturn { extractFromNec, executeConvert, executeConvertM2N, setDirection, sniffDirection, processInputText, parseMaa, writeMaaToNec };')(windowStub, patchedDoc, (m) => alerts.push(m));
api.domReady = () => domReadyFn && domReadyFn();
api.getDirection = () => windowStub.N2M.state.direction;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? '  ' + detail : '')); process.exitCode = 1; }
}
function reset() {
  alerts = [];
  windowStub.N2M.state.unsupportedErrors = [];
  windowStub.N2M.state.currentFileName = '';
  elements.inputNec.value = ''; elements.outputMaa.value = '';
  elements.btnDownload.disabled = false;
}

api.domReady();  // 绑定 + setDirection('n2m')

// === 1. 方向切换 UI 行为 ===
check('初始方向 n2m', api.getDirection() === 'n2m');
api.setDirection('m2n');
check('切 m2n: 方向状态', api.getDirection() === 'm2n');
check('切 m2n: 面板组隐藏 (R4: panelSettingsWrap)', elements.panelSettingsWrap.style.display === 'none');
check('切 m2n: 按钮文案 .nec', elements.btnDownload.textContent.includes('.nec'));
api.setDirection('n2m');
check('切回 n2m: 面板组可见', elements.panelSettingsWrap.style.display === '');

// === 2. 嗅探: .nec 输入不切, .maa 特征自动切 ===
reset();
api.setDirection('n2m');
elements.inputNec.value = 'GW 1 9 0 0 5 0 0 -5 0.001\nEN';
api.sniffDirection(elements.inputNec.value);
check('嗅探: .nec 不切换', api.getDirection() === 'n2m');
const maaText = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');
elements.inputNec.value = maaText;
api.sniffDirection(maaText);
check('嗅探: .maa 特征自动切 m2n', api.getDirection() === 'm2n');
check('嗅探: 提示弹窗', alerts.some(a => a.includes('自动切换')));

// === 3. MAA→NEC 全链路 (VDP40B) ===
reset();
api.setDirection('m2n');
alerts = [];
windowStub.N2M.state.currentFileName = 'VDP40B';
api.processInputText(maaText, 'VDP40B.MAA');
api.executeConvertM2N();
const necOut = elements.outputMaa.value;
check('M2N: 输出产生', necOut.length > 200, necOut.split('\n').length + ' 行');
check('M2N: CM 头', necOut.split('\n')[0].includes('Converted from VDP40B'));
check('M2N: 下载按钮启用', elements.btnDownload.disabled === false);
check('M2N: 偏移收敛告警弹', alerts.some(a => a.includes('w1c+1') && a.includes('50%')));
check('M2N: ASCII', /^[\x20-\x7E\n]*$/.test(necOut));

// === 4. T6 双向冒烟: W8BYA.nec → v03 转回 .maa → 新方向转 .nec′ ===
reset();
api.setDirection('n2m');
const w8byaNec = fs.readFileSync('F:\\Antenna_Models\\AntennaFiles-OLD-master_天线模型收藏\\AntennaFiles-OLD-master\\4nec2_models\\HFcollinear\\W8BYA Collinear 7 MHz.nec', 'utf8');
elements.inputNec.value = w8byaNec;
api.processInputText(w8byaNec, 'W8BYA Collinear 7 MHz.nec');   // extract
api.executeConvert();                                           // → .maa
const maaOut = elements.outputMaa.value;
check('T6: NEC→MAA 输出', maaOut.includes('***Wires***') && maaOut.includes('***Source***'));
// .maa → 回 NEC
reset();
api.setDirection('m2n');
elements.inputNec.value = maaOut;
api.sniffDirection(maaOut);
check('T6: 往返件嗅探切向', api.getDirection() === 'm2n');
api.executeConvertM2N();
const nec2 = elements.outputMaa.value;
check('T6: MAA→NEC 输出', nec2.includes('SY f=') && nec2.includes('EX 0, 1, 50%'));
check('T6: 往返频率保真', nec2.includes('FR 0, 1, 0, 0, 7.2, 0') || /FR 0, 1, 0, 0, 7\.2/.test(nec2), nec2.split('\n').find(l => l.startsWith('FR')));
const gw2 = nec2.split('\n').filter(l => l.startsWith('GW '));
check('T6: 往返导线数 2', gw2.length === 2, String(gw2.length));
check('T6: 往返 ASCII', /^[\x20-\x7E\n]*$/.test(nec2));

// === 5. 空 MAA 输入拦截 ===
reset();
api.setDirection('m2n');
elements.inputNec.value = '';
api.executeConvertM2N();
check('M2N 空输入拦截', alerts.some(a => a.includes('请先载入 MMANA')), '');

console.log(`\n${pass} PASS / ${fail} FAIL`);
