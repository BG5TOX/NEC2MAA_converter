const fs = require('fs');
const html = fs.readFileSync('F:/temp/AGTC_anyGTa_2lite_V2-00/NEC2MAA_converter/NEC2MAA_converter_v03/index.html', 'utf8');
const src = ['state','utils','geometry','extract','maa2nec/maa-parser','maa2nec/maa-symbols','maa2nec/maa-writer','convert','app']
  .map(n => fs.readFileSync('F:/temp/AGTC_anyGTa_2lite_V2-00/NEC2MAA_converter/NEC2MAA_converter_v03/js/' + n + '.js', 'utf8')).join('\n');
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
                     appendChild: () => {}, options: [] };
  }
  return elements[id];
};
const documentStub = { getElementById: checkFn, querySelectorAll: () => [], createElement: () => ({ click: () => {}, style: {} }), body: { appendChild: () => {}, removeChild: () => {} } };
const windowStub = {};
let domReadyFn = null;
const patchedDoc = new Proxy(documentStub, { get(t, p) { if (p === 'addEventListener') return (ev, fn) => { if (ev === 'DOMContentLoaded') domReadyFn = fn; }; return t[p]; } });
const api = new Function('window','document','alert', src + '\nvar N2M = window.N2M;\nreturn { enterWorkScreen, processInputText, executeConvertM2N };')(windowStub, patchedDoc, (m) => alerts.push(m));
let alerts = [];
domReadyFn();

let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS', n, d || ''); } else { fail++; console.log('FAIL', n, d || ''); process.exitCode = 1; } }

// HTML 断言 (R15)
check('同行左对齐 + "打开强制分段"', /justify-content:flex-start[^>]*>\s*<input type="checkbox" id="m2nForceSeg"[^>]*>\s*<label[^>]*>打开强制分段</.test(html), '');
check('"自定义" 首项', html.includes('>自定义</option>') && !html.includes('自定义地面参数'), '');
check('密度 value 空 + placeholder 手动填入', /id="m2nSegDensity" value="" [^>]*placeholder="手动填入"/.test(html) || /id="m2nSegDensity" value=""[^>]*disabled/.test(html), '');
check('新提醒文案', html.includes('注意：当前分段数统一为1， 导入模型时需在 NEC 软件中打开自动分段功能。'), '');
// 提醒在 box 最下方: m2nAutoSegNote 是分段参数 controls 内最后一个子元素 (按 M2N 节 id 精确定位)
const m2nSegSec = html.substring(html.indexOf('id="m2nForceSeg"'), html.indexOf('id="btnM2NReparse"'));
check('提醒框位于 controls 最末', m2nSegSec.lastIndexOf('m2nAutoSegNote') > m2nSegSec.lastIndexOf('m2nSegDensity'), '');

// 运行时行为
const vdp = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');
const forceSeg = checkFn('m2nForceSeg');
const dens = checkFn('m2nSegDensity');
const inputNec = checkFn('inputNec');
const out = checkFn('outputMaa');
api.enterWorkScreen('m2n');
windowStub.N2M.state.currentFileName = 'VDP40B.MAA';
inputNec.value = vdp;
api.processInputText(vdp, 'VDP40B.MAA');
checkFn('m2nSigma').value = '20'; checkFn('m2nEpsr').value = '17';

// 勾选: 空恢复 25
forceSeg.checked = true; dens.value = '';
// 模拟 change 逻辑
if (forceSeg.checked && !dens.value) dens.value = '25';
check('勾选: 空值恢复 25', dens.value === '25', dens.value);
// 取消勾选: 值清空
forceSeg.checked = false;
if (!forceSeg.checked) dens.value = '';
check('取消勾选: 值清空(不显默认值)', dens.value === '', dens.value);
// 勾选再转换: GW 段数 7 (10.4m λ42.76 ρ25)
forceSeg.checked = true; dens.value = '25';
api.executeConvertM2N();
const gw = out.value.split('\n').find(l => l.startsWith('GW '));
check('强制25: 段数 7', gw.split(',')[1].trim() === '7', gw);
check('CM Note 新文案', out.value.includes('CM Note: all segments set to 1. NEC auto segmentation must be enabled.'), out.value.split('\n').find(l => l.includes('CM Note')));
// 未勾选转换: 段数 1
forceSeg.checked = false; dens.value = '';
api.executeConvertM2N();
const gw2 = out.value.split('\n').find(l => l.startsWith('GW '));
check('未勾选: 段数 1', gw2.split(',')[1].trim() === '1', gw2);
// 勾选+空密度拦截
forceSeg.checked = true; dens.value = '';
alerts = [];
api.executeConvertM2N();
check('空密度拦截', alerts.some(a => a.includes('分段密度')), '');

console.log(`\n${pass} PASS / ${fail} FAIL`);