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
const api = new Function('window','document','alert', src + '\nvar N2M = window.N2M;\nreturn { enterWorkScreen, processInputText, executeConvertM2N, setDirection, syncGroundDisabled, getDirection: () => N2M.state.direction };')(windowStub, patchedDoc, (m) => alerts.push(m));
let alerts = [];
domReadyFn();

let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS', n, d || ''); } else { fail++; console.log('FAIL', n, d || ''); process.exitCode = 1; } }

const sigma = checkFn('m2nSigma');
const epsr = checkFn('m2nEpsr');
const m2nGround = checkFn('m2nGround');
const presetGroup = checkFn('m2nPresetGroup');

// ===== 1. 布局: 文字左、checkbox 右 (用户: 文字在左，勾选框紧挨着文字在右) =====
const segStart = html.indexOf('id="m2nForceSeg"');
const rowStart = html.lastIndexOf('<div class="control-group', segStart);
const rowEnd = html.indexOf('</div>', segStart);
const row = html.substring(rowStart, rowEnd + 6);
const labelPos = row.indexOf('打开强制分段');
const cbPos = row.indexOf('type="checkbox"');
check('文字在左、checkbox 在右', labelPos >= 0 && cbPos > labelPos, `label@${labelPos} cb@${cbPos}`);
check('row flex-row', /flex-direction:\s*row/.test(row), '');
// 2. 提醒框在 controls 之后 (box 最下方)
const controlsOpen = html.indexOf('<div class="controls"', rowStart - 500);
let depth = 0, closeIdx = -1;
for (let i = controlsOpen; i < html.length; i++) {
  if (html.startsWith('<div', i)) depth++;
  else if (html.startsWith('</div>', i)) { depth--; if (depth === 0) { closeIdx = i; break; } }
}
const notePos = html.indexOf('id="m2nAutoSegNote"', controlsOpen);
check('提醒框在 controls 之后', notePos > closeIdx && closeIdx > 0, `close@${closeIdx} note@${notePos}`);
// 3. σ/εr 初始 HTML disabled (首次进入自由空间灰显)
check('HTML: m2nSigma disabled', /id="m2nSigma"[^>]*disabled/.test(html), '');
check('HTML: m2nEpsr disabled', /id="m2nEpsr"[^>]*disabled/.test(html), '');
// 4. placeholder 双框手动填入
check('placeholder 手动填入 (双框)', /id="m2nSigma"[^>]*placeholder="手动填入"/.test(html) && /id="m2nEpsr"[^>]*placeholder="手动填入"/.test(html), '');
// 5. 运行态: 首次进入 m2n (未载入文件, 默认自由空间) → disabled
api.enterWorkScreen('m2n');
check('首次进入: σ disabled (自由空间默认)', sigma.disabled === true, String(sigma.disabled));
check('首次进入: εr disabled', epsr.disabled === true, String(epsr.disabled));
check('首次进入: 面板显示', m2nGround.value === '0' || m2nGround.value === '', m2nGround.value);
// 6. 载入 VDP40B (gtype=2) → 启用
const vdp = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');
checkFn('inputNec').value = vdp;
windowStub.N2M.state.currentFileName = 'VDP40B.MAA';
api.processInputText(vdp, 'VDP40B.MAA');
check('VDP40B: σ/εr 启用', sigma.disabled === false && epsr.disabled === false, `σ=${sigma.disabled} εr=${epsr.disabled}`);
check('VDP40B: 地面类型=2', m2nGround.value === '2', m2nGround.value);
// 7. 切回自由空间 → 再禁用
const zz = 'ZZ1 test\n*\n7.0\n***Wires***\n1\n0,0,0, 0,0,3.96, 8.000e-04, -1\n*** G/H/M/R/AzEl/X ***\n0, 10.0, 1, 50.0, 120, 60, 0\n';
checkFn('inputNec').value = zz;
api.processInputText(zz, 'zz.maa');
check('ZZ1(自由空间): σ/εr 禁用', sigma.disabled === true && epsr.disabled === true, `σ=${sigma.disabled}`);

console.log(`\n${pass} PASS / ${fail} FAIL`);