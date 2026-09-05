const fs = require('fs');
const base = 'F:/temp/AGTC_anyGTa_2lite_V2-00/NEC2MAA_converter/NEC2MAA_converter_v03/js';
const src = ['state','utils','geometry','extract','maa2nec/maa-parser','maa2nec/maa-symbols','maa2nec/maa-writer','convert','app'].map(n => fs.readFileSync(base + '/' + n + '.js', 'utf8')).join('\n');
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
  btnReExtract: { addEventListener: () => {} }, btnUpload: { addEventListener: () => {}, textContent: '📁 导入 .nec' },
  btnConvert: { addEventListener: () => {} },
  wizN2M: { addEventListener: () => {} }, wizM2N: { addEventListener: () => {} },
  btnSwitchDir: { addEventListener: () => {} }, workTitle: { textContent: '' },
  workScreen: { style: { display: 'none' } }, wizardScreen: { style: {} },
  panelSettingsWrap: { style: {} }, m2nPanelWrap: { style: { display: 'none' } },
  m2nTitle: { value: '' }, m2nFreq: { value: '', style: {}, focus: () => {} }, m2nRImp: { value: '50.0' }, m2nXImp: { value: '0.0' },
  m2nAxisMap: { value: 'keep' }, m2nGround: { value: '0', addEventListener: () => {} }, m2nSigma: { value: '0.0' }, m2nEpsr: { value: '' },
  m2nGroundPreset: { value: '', addEventListener: () => {}, appendChild: () => {} }, m2nPresetGroup: { style: { display: 'none' } },
  m2nSourceInput: { value: '' }, m2nLoadInput: { value: '' },
  m2nBtnModeFile: { classList: { toggle: () => {} }, addEventListener: () => {} },
  m2nBtnModeTitle: { classList: { toggle: () => {} }, addEventListener: () => {} },
  fileInput: { addEventListener: () => {}, click: () => {}, setAttribute: () => {} },
};
const documentStub = { getElementById: (id) => elements[id] || (elements[id] = { value: '', style: {}, addEventListener: () => {}, focus: () => {} }), addEventListener: () => {}, querySelectorAll: () => [], createElement: () => ({ click: () => {} }), body: { appendChild: () => {}, removeChild: () => {} } };
const windowStub = {};
let domReadyFn = null;
const patchedDoc = { getElementById: documentStub.getElementById, addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') domReadyFn = fn; }, querySelectorAll: () => [], createElement: documentStub.createElement };
const api = new Function('window', 'document', 'alert', src + '\nvar N2M = window.N2M;\nreturn { enterWorkScreen, backToWizard, setDirection, getDirection: () => N2M.state.direction };')(windowStub, patchedDoc, () => {});
domReadyFn();
let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS', n, d || ''); } else { fail++; console.log('FAIL', n, d || ''); process.exitCode = 1; } }

api.enterWorkScreen('m2n');
check('进入后: 按钮 .maa / M2N面板显示', elements.btnUpload.textContent.includes('.maa') && elements.m2nPanelWrap.style.display === '');
api.backToWizard();
check('返回后: 按钮 .nec / direction=n2m / workScreen 隐藏 / 双面板复位', elements.btnUpload.textContent.includes('.nec') && api.getDirection() === 'n2m' && elements.workScreen.style.display === 'none' && elements.panelSettingsWrap.style.display === '' && elements.m2nPanelWrap.style.display === 'none');
api.enterWorkScreen('n2m');
check('再进 n2m: NEC面板恢复', elements.panelSettingsWrap.style.display === '' && elements.btnUpload.textContent.includes('.nec'));
api.backToWizard();
api.enterWorkScreen('m2n');
check('再进 m2n: M2N面板恢复', elements.m2nPanelWrap.style.display === '' && elements.btnUpload.textContent.includes('.maa'));
api.backToWizard();
check('最终: 全部复位', elements.btnUpload.textContent.includes('.nec') && api.getDirection() === 'n2m' && elements.m2nPanelWrap.style.display === 'none');
console.log(pass + ' PASS / ' + fail + ' FAIL');
