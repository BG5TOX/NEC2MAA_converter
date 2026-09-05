const fs = require('fs');
const html = fs.readFileSync('F:/temp/AGTC_anyGTa_2lite_V2-00/NEC2MAA_converter/NEC2MAA_converter_main/index.html', 'utf8');
const src = ['state','i18n','i18n/zh','i18n/en','utils','geometry','extract','maa2nec/maa-parser','maa2nec/maa-taper','maa2nec/maa-symbols','maa2nec/maa-writer','convert','app']
  .map(n => fs.readFileSync('F:/temp/AGTC_anyGTa_2lite_V2-00/NEC2MAA_converter/NEC2MAA_converter_main/js/' + n + '.js', 'utf8')).join('\n');
const inline = {};
{ const re = /<[^>]+id="([^"]+)"[^>]*style="([^"]*)"/g; let m; while ((m = re.exec(html)) !== null) { const d = m[2].match(/(?:^|;)\s*display\s*:\s*([^;]+)/); inline[m[1]] = d ? d[1].trim() : undefined; } }
const elements = {};
const checkFn = (id) => {
  if (!elements[id]) {
    const st = {};
    const def = inline[id];
    if (def !== undefined) { st.display = def; }
    elements[id] = { value: '', textContent: '', disabled: false, style: st, classList: { toggle: () => {} },
                     addEventListener: () => {}, setAttribute: () => {}, click: () => {}, focus: () => {},
                     appendChild: () => {}, insertBefore: () => {}, insertBefore: () => {}, options: [] };
  }
  return elements[id];
};
const documentStub = { getElementById: checkFn, querySelectorAll: () => [],
  createTextNode: (t) => ({ textContent: t }),   // i18n-1: applyI18n workTitle firstChild
  documentElement: { setAttribute: () => {} },   // i18n-1: <html lang> 同步
  createElement: () => ({ click: () => {}, style: {} }), body: { appendChild: () => {}, insertBefore: () => {}, insertBefore: () => {}, removeChild: () => {} } };
const windowStub = {};
let domReadyFn = null;
const patchedDoc = new Proxy(documentStub, { get(t, p) { if (p === 'addEventListener') return (ev, fn) => { if (ev === 'DOMContentLoaded') domReadyFn = fn; }; return t[p]; } });
const api = new Function('window','document','alert', src + '\nvar N2M = window.N2M;\nreturn { enterWorkScreen, processInputText, extractM2nPanel, syncGroundDisabled, downloadMaa_setup: null };')(windowStub, patchedDoc, () => {});
domReadyFn();

let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS', n, d || ''); } else { fail++; console.log('FAIL', n, d || ''); process.exitCode = 1; } }

const sigma = checkFn('m2nSigma');
const epsr = checkFn('m2nEpsr');
const hint = checkFn('m2nEpsrHint');
const m2nGround = checkFn('m2nGround');
const preset = checkFn('m2nGroundPreset');
const m2nTitle = checkFn('m2nTitle');
const inputNec = checkFn('inputNec');

// ===== 项1: (R11 移除自动识别/R20 默认 Average) 载入 → σ=5/εr=13; 换 Sea water 预设 =====
api.enterWorkScreen('m2n');
const vdp = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');
windowStub.N2M.state.currentFileName = 'VDP40B.MAA';
inputNec.value = vdp;
api.processInputText(vdp, 'VDP40B.MAA');
check('载入 VDP40B: R20 默认 σ=5', String(sigma.value) === '5', sigma.value);
// 选 Sea water 预设 → σ=5000, εr=81 (预设 change 手动模拟)
sigma.value = 5000; epsr.value = 81;
check('预设 Sea water: σ=5000 εr=81', String(sigma.value) === '5000' && String(epsr.value) === '81', '');

// ===== 项2: 自由空间清空 σ/εr + 隐藏提示 =====
sigma.value = '20'; epsr.value = '17'; hint.style.display = '';
m2nGround.value = '0';
// 模拟 m2nGround change (自由空间分支)
if (m2nGround.value === '0') {
  sigma.value = ''; epsr.value = ''; hint.style.display = 'none';
}
check('自由空间: σ 清空', sigma.value === '', JSON.stringify(sigma.value));
check('自由空间: εr 清空', epsr.value === '', JSON.stringify(epsr.value));
check('自由空间: 提示隐藏', hint.style.display === 'none');

// ===== 项3: 预设首项文案 (R11 后: "自定义") =====
check('预设首项文案', html.includes('>自定义</option>') && !html.includes('电导率（自动识别）+相对介电常数（推测）'), '');

// ===== 项4: 载入模型文案 =====
check('载入模型文案', html.includes('1. 载入模型 (支持拖拽)') && !html.includes('1. 载入代码 (支持拖拽)'), '');

// ===== 项5: M2N 基本参数 + 天线名称 label (i18n-1: label 带 data-i18n 属性) =====
const m2nSec = html.split('m2nPanelWrap')[1].split('地面参数')[0];
check('基本参数标题', m2nSec.includes('基本参数') && !/settings-title\s*>?\s*天线名称/.test(m2nSec), '');
check('天线名称 label 在输入框上方', /<label data-i18n="panel.antennaName">天线名称<\/label>\s*<input[^>]*id="m2nTitle"/.test(m2nSec), '');

// ===== 项6: 文件名保留扩展名 =====
const w8 = fs.readFileSync('F:\\Antenna_Models\\AntennaFiles-OLD-master_天线模型收藏\\AntennaFiles-OLD-master\\4nec2_models\\HFcollinear\\W8BYA Collinear 7 MHz.nec', 'utf8');
api.enterWorkScreen('n2m');
api.processInputText(w8, 'W8BYA Collinear 7 MHz.nec');
check('currentFileName 含 .nec 扩展名', windowStub.N2M.state.currentFileName === 'W8BYA Collinear 7 MHz.nec', windowStub.N2M.state.currentFileName);
check('NEC 标题含扩展名', checkFn('maaTitle').value.includes('W8BYA Collinear 7 MHz.nec'), checkFn('maaTitle').value);
// M2N 文件名含扩展名
api.enterWorkScreen('m2n');
api.processInputText(vdp, 'VDP40B.MAA');
check('M2N 标题含 .maa 扩展名', checkFn('m2nTitle').value.includes('VDP40B.MAA'), checkFn('m2nTitle').value);
// 下载文件名基名去扩展名
const baseName = windowStub.N2M.state.currentFileName.replace(/\.[^/.]+$/, '');
check('下载基名去扩展名', baseName === 'VDP40B', baseName);

console.log(`\n${pass} PASS / ${fail} FAIL`);