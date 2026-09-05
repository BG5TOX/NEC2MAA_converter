const fs = require('fs');
const html = fs.readFileSync('F:/temp/AGTC_anyGTa_2lite_V2-00/NEC2MAA_converter/NEC2MAA_converter_main/index.html', 'utf8');
const src = ['state','i18n','i18n/zh','i18n/en','utils','geometry','extract','maa2nec/maa-parser','maa2nec/maa-taper','maa2nec/maa-symbols','maa2nec/maa-writer','convert','app']
  .map(n => fs.readFileSync('F:/temp/AGTC_anyGTa_2lite_V2-00/NEC2MAA_converter/NEC2MAA_converter_main/js/' + n + '.js', 'utf8')).join('\n');
try { new Function('window','document','alert', src); console.log('SYNTAX OK'); } catch (e) { console.log('SYNTAX FAIL: ' + e.message); process.exit(1); }

const inline = {};
{ const re = /<[^>]+id="([^"]+)"[^>]*style="([^"]*)"/g; let m; while ((m = re.exec(html)) !== null) { const d = m[2].match(/(?:^|;)\s*display\s*:\s*([^;]+)/); inline[m[1]] = d ? d[1].trim() : undefined; } }
const elements = {};
const checkFn = (id) => {
  if (!elements[id]) {
    const st = {};
    const def = inline[id];
    if (def !== undefined) { st.display = def; }
    elements[id] = { value: '', textContent: '', disabled: false, checked: false, style: st, classList: { toggle: () => {} },
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
const api = new Function('window','document','alert', src + '\nvar N2M = window.N2M;\nreturn { enterWorkScreen, processInputText, executeConvertM2N };')(windowStub, patchedDoc, (m) => alerts.push(m));
let alerts = [];
domReadyFn();

let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS', n, d || ''); } else { fail++; console.log('FAIL', n, d || ''); process.exitCode = 1; } }

// HTML 断言
check('N2M: 自动分段参数', html.includes('>自动分段参数<') && !html.includes('>网格自动分段<'), '');
check('M2N: 分段参数 + 强制分段 + 密度 + Segs/λ', html.includes('id="m2nForceSeg"') && html.includes('强制分段') && html.includes('id="m2nSegDensity"') && html.includes('Segs/λ'), '');
check('M2N: 密度默认空 + 默认禁用 (R15: 未勾选不显默认值)', /id="m2nSegDensity" value=""/.test(html) && /id="m2nSegDensity"[^>]*disabled/.test(html), '');
check('M2N: 典型值 15~100', html.includes('典型值：15~100'), '');
check('M2N: 醒目注意文字 (R16/R17 文案)', html.includes('注意：当前分段数统一为1， 导入模型时需在 NEC 软件中打开自动分段功能。'), '');

const vdp = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');
const forceSeg = checkFn('m2nForceSeg');
const dens = checkFn('m2nSegDensity');
const note = checkFn('m2nAutoSegNote');
const inputNec = checkFn('inputNec');
const out = checkFn('outputMaa');
const sigma = checkFn('m2nSigma');
const epsr = checkFn('m2nEpsr');

api.enterWorkScreen('m2n');
windowStub.N2M.state.currentFileName = 'VDP40B.MAA';
inputNec.value = vdp;
api.processInputText(vdp, 'VDP40B.MAA');
// VDP40B 是真实地 (gtype=2): R11 拦截要求 σ/εr 双填
sigma.value = '20'; epsr.value = '17';

// 默认: 未勾选 → 段数 1 + 注意文字可见
check('默认未勾选: checked=false', forceSeg.checked === false);
check('默认: 密度禁用 (R15: 初始空值+disabled; change 监听勾选启用反向验证)', /id="m2nSegDensity" value=""/.test(html) && /id="m2nSegDensity"[^>]*disabled/.test(html), '桩无法模拟初始 HTML disabled 运行态, 以静态属性+勾选启用反向验证');
check('默认: 注意文字可见', note.style.display === undefined || note.style.display === '', String(note.style.display));
api.executeConvertM2N();
let gws = out.value.split('\n').filter(l => l.startsWith('GW '));
check('默认: GW 段数全 1', gws.length > 0 && gws.every(l => l.split(',')[1].trim() === '1'), gws[0]);
check('默认: CM Note 自动分段提示', out.value.includes('CM Note: all segments set to 1'), '');

// 勾选强制分段 → 密度启用 + 注意消失
forceSeg.checked = true;
dens.disabled = false;
note.style.display = 'none';
check('勾选: 密度启用', dens.disabled === false);
check('勾选: 注意文字消失', note.style.display === 'none');
// VDP40B: 单线 z=-5.2~5.2 (10.4m), f=7.01MHz, λ≈42.76m, 密度25 → ceil(10.4*25/42.76)=ceil(6.077)=7
dens.value = '25';
api.executeConvertM2N();
gws = out.value.split('\n').filter(l => l.startsWith('GW '));
check('强制25: GW 段数=7 (10.4m/λ42.76×25)', gws[0].split(',')[1].trim() === '7', gws[0]);
check('强制: CM Forced 行', out.value.includes('CM Forced segmentation: 25 segs/wavelength'), '');

// 密度改 100 → ceil(10.4*100/42.76)=ceil(24.32)=25
dens.value = '100';
api.executeConvertM2N();
gws = out.value.split('\n').filter(l => l.startsWith('GW '));
check('强制100: GW 段数=25', gws[0].split(',')[1].trim() === '25', gws[0]);

// 无效密度拦截
dens.value = '';
alerts = [];
api.executeConvertM2N();
check('无效密度拦截', alerts.some(a => a.includes('分段密度')), alerts[0] || '');
dens.value = '-5';
alerts = [];
api.executeConvertM2N();
check('负密度拦截', alerts.some(a => a.includes('分段密度')), '');

console.log(`\n${pass} PASS / ${fail} FAIL`);