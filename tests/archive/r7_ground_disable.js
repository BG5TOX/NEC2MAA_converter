const fs = require('fs');
const html = fs.readFileSync('F:/temp/AGTC_anyGTa_2lite_V2-00/NEC2MAA_converter/NEC2MAA_converter_v03/index.html', 'utf8');
const src = ['state','utils','geometry','extract','maa2nec/maa-parser','maa2nec/maa-symbols','maa2nec/maa-writer','convert','app']
  .map(n => fs.readFileSync('F:/temp/AGTC_anyGTa_2lite_V2-00/NEC2MAA_converter/NEC2MAA_converter_v03/js/' + n + '.js', 'utf8')).join('\n');

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
                     appendChild: () => {}, options: [] };
  }
  return elements[id];
};
const documentStub = { getElementById: checkFn, querySelectorAll: () => [], createElement: () => ({ click: () => {}, style: {} }), body: { appendChild: () => {}, removeChild: () => {} } };
const windowStub = {};
let domReadyFn = null;
const patchedDoc = new Proxy(documentStub, { get(t, p) { if (p === 'addEventListener') return (ev, fn) => { if (ev === 'DOMContentLoaded') domReadyFn = fn; }; return t[p]; } });
const api = new Function('window', 'document', 'alert', src + '\nvar N2M = window.N2M;\nreturn { enterWorkScreen, setDirection, extractM2nPanel, syncGroundDisabled, processInputText, executeConvertM2N };')(windowStub, patchedDoc, () => {});
domReadyFn();

let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS', n, d || ''); } else { fail++; console.log('FAIL', n, d || ''); process.exitCode = 1; } }

const gGround = checkFn('g_ground');
const m2nGround = checkFn('m2nGround');
const m2nSigma = checkFn('m2nSigma');
const m2nEpsr = checkFn('m2nEpsr');

// --- NEC 侧 (R11 后: gnd_cond 已移除, N2M 地面参数走 G/H 行; syncGroundDisabled 仅管 M2N 侧) ---
api.enterWorkScreen('n2m');
check('NEC: gnd_cond 输入已移除 (R11)', !html.includes('id="gnd_cond"'), '');
gGround.value = '0';   // 自由空间
api.syncGroundDisabled();
check('NEC 模式: syncGroundDisabled 无异常 (gnd_cond 桩缺失不崩溃)', true, '');

// --- MAA 侧 ---
api.enterWorkScreen('m2n');
m2nGround.value = '0';
api.syncGroundDisabled();
check('MAA: 自由空间 → σ/εr 禁用', m2nSigma.disabled === true && m2nEpsr.disabled === true, `σ=${m2nSigma.disabled} εr=${m2nEpsr.disabled}`);
m2nGround.value = '2';
api.syncGroundDisabled();
check('MAA: 真实地面 → σ/εr 启用', m2nSigma.disabled === false && m2nEpsr.disabled === false, '');
m2nGround.value = '-1';
api.syncGroundDisabled();
check('MAA: S-N 地面 → σ/εr 启用', m2nSigma.disabled === false && m2nEpsr.disabled === false, '');
m2nGround.value = '1';
api.syncGroundDisabled();
check('MAA: 理想地面 → σ/εr 启用', m2nSigma.disabled === false && m2nEpsr.disabled === false, '');

// --- placeholder 文案 (R11 后: 手动填入) ---
check('σ/εr placeholder 手动填入', /id="m2nSigma"[^>]*placeholder="手动填入"/.test(html) && /id="m2nEpsr"[^>]*placeholder="手动填入"/.test(html), '');

// --- 提取联动 (VDP40B gtype=2 → σ/εr 启用 + R20 Average 默认; 自由空间文件 → 禁用) ---
const vdp = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');
windowStub.N2M.state.direction = 'm2n';
checkFn('inputNec').value = vdp;
api.processInputText(vdp, 'VDP40B.MAA');
check('VDP40B(真实地): σ/εr 启用 + R20 Average 默认(5/13)', m2nSigma.disabled === false && String(m2nSigma.value) === '5' && String(m2nEpsr.value) === '13', `σ=${m2nSigma.value} εr=${m2nEpsr.value}`);
const freespace = 'Test\nt\n*\n7.0\n***Wires***\n1\n0,0,0, 1,0,0, 0.001, -1\n*** G/H/M/R/AzEl/X ***\n0, 0, 0, 50, 120, 60, 0\n';
checkFn('inputNec').value = freespace;
api.processInputText(freespace, 'fs.maa');
check('自由空间文件: σ/εr 禁用', m2nSigma.disabled === true && m2nEpsr.disabled === true, `σ=${m2nSigma.disabled}`);

console.log(`\n${pass} PASS / ${fail} FAIL`);