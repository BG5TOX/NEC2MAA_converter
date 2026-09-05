const fs = require('fs');
const base = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_v03\\js';
const src = ['state', 'utils', 'geometry', 'extract',
             'maa2nec/maa-parser', 'maa2nec/maa-symbols', 'maa2nec/maa-writer',
             'convert', 'app'].map(n => fs.readFileSync(`${base}\\${n}.js`, 'utf8')).join('\n');
try { new Function('window', 'document', 'alert', src); console.log('SYNTAX OK'); } catch (e) { console.log('SYNTAX FAIL: ' + e.message); process.exit(1); }

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
  btnSwitchDir: { addEventListener: () => {} },
  workTitle: { textContent: '' }, workScreen: { style: { display: 'none' } }, wizardScreen: { style: {} },
  panelSettingsWrap: { style: {} }, m2nPanelWrap: { style: { display: 'none' } },
  m2nTitle: { value: '' }, m2nFreq: { value: '', style: {}, focus: () => {} }, m2nRImp: { value: '50.0' }, m2nXImp: { value: '0.0' },
  m2nAxisMap: { value: 'keep' }, m2nGround: { value: '0' }, m2nSigma: { value: '0.0' }, m2nEpsr: { value: '' },
  m2nSourceInput: { value: '' }, m2nLoadInput: { value: '' },
  m2nBtnModeFile: { classList: { toggle: () => {} }, addEventListener: () => {} },
  m2nBtnModeTitle: { classList: { toggle: () => {} }, addEventListener: () => {} },
  fileInput: { addEventListener: () => {}, click: () => {}, setAttribute: () => {} },
};
let alerts = [];
const documentStub = {
  getElementById: (id) => elements[id] || (elements[id] = { value: '', style: {}, addEventListener: () => {}, focus: () => {} }),
  addEventListener: (ev, fn) => {},
  querySelectorAll: () => [],
  createElement: () => ({ click: () => {}, style: {} }),
  body: { appendChild: () => {}, removeChild: () => {} },
};
const windowStub = {};
let domReadyFn = null;
const patchedDoc = new Proxy(documentStub, { get(t, p) { if (p === 'addEventListener') return (ev, fn) => { if (ev === 'DOMContentLoaded') domReadyFn = fn; }; return t[p]; } });
const api = new Function('window', 'document', 'alert', src + '\nvar N2M = window.N2M;\nreturn { extractFromNec, executeConvert, executeConvertM2N, extractM2nPanel, setDirection, setM2nTitleMode, backToWizard_fallback: null, sniffDirection, processInputText, parseMaa, writeMaaToNec };')(windowStub, patchedDoc, (m) => alerts.push(m));
api.domReady = () => domReadyFn && domReadyFn();
api.getDirection = () => windowStub.N2M.state.direction;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? '  ' + detail : '')); process.exitCode = 1; }
}

api.domReady();

// === 1. 向导文案/标题/返回 (R5 新断言) ===
const idxHtml = fs.readFileSync('F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_v03\\index.html', 'utf8');
check('向导卡: 4NEC2 → MMANA-GAL 文案', idxHtml.includes('4NEC2 → MMANA-GAL') && idxHtml.includes('MMANA-GAL → 4NEC2'));
check('向导卡: .nec/.maa 格式标注在下方', idxHtml.includes('wiz-format') && idxHtml.includes('.nec') && idxHtml.includes('.maa'));
check('返回按钮: 尺寸加大类', idxHtml.includes('btn-back-wizard') && idxHtml.includes('⬅ 返回选择方向'));
check('胶囊徽标已删', !idxHtml.includes('dirBadge'));
api.setDirection('n2m');
check('n2m 标题配套', elements.workTitle.textContent === '4NEC2 转 MMANA-GAL 格式转换工具', elements.workTitle.textContent);
api.setDirection('m2n');
check('m2n 标题配套', elements.workTitle.textContent === 'MMANA-GAL 转 4NEC2 格式转换工具');
check('m2n: NEC侧面板隐藏', elements.panelSettingsWrap.style.display === 'none');
check('m2n: M2N 面板显示', elements.m2nPanelWrap.style.display === '');

// === 2. VDP40B M2N 面板流程 ===
const vdp = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');
alerts = [];
windowStub.N2M.state.currentFileName = 'VDP40B';
api.processInputText(vdp, 'VDP40B.MAA');
check('M2N 提取: 频率面板', String(elements.m2nFreq.value) === '7.01', String(elements.m2nFreq.value));
check('M2N 提取: 地面 gtype=2', elements.m2nGround.value === '2');
check('M2N 提取: 电导率 20', String(elements.m2nSigma.value) === '20');
check('M2N 提取: 源框 w1c', elements.m2nSourceInput.value.startsWith('w1c'), elements.m2nSourceInput.value);
check('M2N 提取: 负载框 2 行 LC', elements.m2nLoadInput.value.split('\n').length === 2 && elements.m2nLoadInput.value.includes('10.8'), elements.m2nLoadInput.value.replace(/\n/g, ' | '));
check('M2N 提取: 标题(文件名模式)', elements.m2nTitle.value === 'Converted from VDP40B', elements.m2nTitle.value);
// 转换 (面板默认值直通)
api.executeConvertM2N();
const nec1 = elements.outputMaa.value;
check('M2N 转换: SY f=7.01', nec1.includes('SY f=7.01'));
check('M2N 转换: GN epsr 分档 (sigma20→17)', nec1.includes('GN 0, 0, 0, 0, 17, 0.02'), nec1.split('\n').find(l => l.startsWith('GN')));
check('M2N 转换: LD 表达式', nec1.includes('2*PI*f*L1*1E-6/Q1'));
// 面板覆盖: 改频率 + 手动 epsr + swap 坐标 (swap 用构造输入验证, VDP40B 单线 x/y 全 0 无可见差异)
elements.m2nFreq.value = '14.2';
elements.m2nEpsr.value = '13';
api.executeConvertM2N();
const nec2 = elements.outputMaa.value;
check('覆盖: 频率 14.2', nec2.includes('SY f=14.2') && nec2.includes('FR 0, 1, 0, 0, 14.2, 0'));
check('覆盖: 手动 epsr=13', nec2.includes('GN 0, 0, 0, 0, 13, 0.02'), nec2.split('\n').find(l => l.startsWith('GN')));
{
  const mk = 'Test Swap\n*\n14\n***Wires***\n1\n1, 2, 3, 4, 5, 6, 0.001, -1\n*** Source ***\n1, 0\nw1c, 0.0, 1.0\n';
  const parsedSwap = api.parseMaa(mk, 'swaptest.maa');
  parsedSwap.axisMap = 'swap';
  const necSwap = api.writeMaaToNec(parsedSwap, 'swaptest.maa');
  const gwSwap = necSwap.split('\n').find(l => l.startsWith('GW 1'));
  check('覆盖: swap 坐标 (x/y 互换: 1,2 → 2,1)', gwSwap === 'GW 1, 1, 2, 1, 3+h, 5, 4, 6+h, 0.5*D1', gwSwap);
}
// 源覆盖: 手改源行
elements.m2nAxisMap.value = 'keep';
elements.m2nSourceInput.value = 'w1b, 0.0, 1.0';
api.executeConvertM2N();
const nec3 = elements.outputMaa.value;
check('覆盖: 源 w1b → EX 段号 1', nec3.includes('EX 0, 1, 1, '), nec3.split('\n').find(l => l.startsWith('EX')));

// === 3. 频率空拦截 ===
alerts = [];
elements.m2nFreq.value = '';
api.executeConvertM2N();
check('M2N 频率空拦截', alerts.some(a => a.includes('频率不能为空')), '');

// === 4. NEC 侧回归 (W8BYA 全链路无回归) ===
alerts = []; windowStub.N2M.state.unsupportedErrors = [];
api.setDirection('n2m');
windowStub.N2M.state.currentFileName = 'W8BYA';
const w8 = fs.readFileSync('F:\\Antenna_Models\\AntennaFiles-OLD-master_天线模型收藏\\AntennaFiles-OLD-master\\4nec2_models\\HFcollinear\\W8BYA Collinear 7 MHz.nec', 'utf8');
api.processInputText(w8, 'W8BYA Collinear 7 MHz.nec');
api.executeConvert();
check('n2m 回归: .maa 输出', elements.outputMaa.value.includes('***Wires***') && elements.outputMaa.value.includes('w1c'));

console.log(`\n${pass} PASS / ${fail} FAIL`);
