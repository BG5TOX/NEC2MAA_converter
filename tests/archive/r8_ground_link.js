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
const api = new Function('window','document','alert', src + '\nvar N2M = window.N2M;\nreturn { enterWorkScreen, processInputText, extractFromNec, extractM2nPanel, syncGroundDisabled };')(windowStub, patchedDoc, () => {});
domReadyFn();

let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS', n, d || ''); } else { fail++; console.log('FAIL', n, d || ''); process.exitCode = 1; } }
const gGround = checkFn('g_ground');
const gndCond = checkFn('gnd_cond');
const m2nGround = checkFn('m2nGround');
const m2nSigma = checkFn('m2nSigma');
const m2nEpsr = checkFn('m2nEpsr');

// === NEC 侧载入联动: W8BYA (GN 2) ===
api.enterWorkScreen('n2m');
const w8 = fs.readFileSync('F:\\Antenna_Models\\AntennaFiles-OLD-master_天线模型收藏\\AntennaFiles-OLD-master\\4nec2_models\\HFcollinear\\W8BYA Collinear 7 MHz.nec', 'utf8');
checkFn('inputNec').value = w8;
api.processInputText(w8, 'W8BYA Collinear 7 MHz.nec');
check('NEC W8BYA(GN2): g_ground=2', gGround.value === '2', gGround.value);
check('NEC W8BYA(GN2): 电导率启用', gndCond.disabled === false, String(gndCond.disabled));

// === NEC 侧自由空间 (无 GN) ===
const necFS = 'GW 1 9 0 0 5 0 0 -5 0.001\nFR 0 1 0 0 14 0\nEN\n';
api.processInputText(necFS, 'fs.nec');
check('NEC 无GN: g_ground=0(自由空间)', gGround.value === '0', gGround.value);
check('NEC 无GN: 电导率禁用', gndCond.disabled === true, String(gndCond.disabled));

// === NEC 侧 GN 1 (理想地面) ===
const necIdeal = 'GW 1 9 0 0 5 0 0 -5 0.001\nGN 1\nFR 0 1 0 0 14 0\nEN\n';
api.processInputText(necIdeal, 'ideal.nec');
check('NEC GN1: g_ground=1', gGround.value === '1', gGround.value);
check('NEC GN1: 电导率启用', gndCond.disabled === false, String(gndCond.disabled));

// === M2N 侧载入联动: VDP40B (gtype=2, σ=20) ===
api.enterWorkScreen('m2n');
const vdp = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');
checkFn('inputNec').value = vdp;
api.processInputText(vdp, 'VDP40B.MAA');
check('MAA VDP40B(gtype2): m2nGround=2', m2nGround.value === '2', m2nGround.value);
check('MAA VDP40B(gtype2): σ 填 20', String(m2nSigma.value) === '20', String(m2nSigma.value));
check('MAA VDP40B(gtype2): σ/εr 启用', m2nSigma.disabled === false && m2nEpsr.disabled === false, '');

// === M2N 侧载入联动: ZZ1_hen (gtype=0 自由空间) ===
const zz1 = fs.readFileSync('F:\\Antenna_Models\\AntennaFiles-OLD-master_天线模型收藏\\AntennaFiles-OLD-master\\ANT\\HF simple\\Loop\\ZZ1_hen_DL2KQ.maa', 'latin1');
checkFn('inputNec').value = zz1;
api.processInputText(zz1, 'ZZ1_hen_DL2KQ.maa');
check('MAA ZZ1(gtype0): m2nGround=0', m2nGround.value === '0', m2nGround.value);
check('MAA ZZ1(gtype0): σ/εr 禁用', m2nSigma.disabled === true && m2nEpsr.disabled === true, `σ=${m2nSigma.disabled}`);

// === M2N 无 G/H 节 (默认自由空间?) ===
const noGH = 'Test\n*\n7.0\n***Wires***\n1\n0,0,0, 1,0,0, 0.001, -1\n*** Source ***\n1, 0\nw1c, 0.0, 1.0\n';
api.processInputText(noGH, 'nogh.maa');
check('MAA 无G/H: m2nGround 保持默认0', m2nGround.value === '0', m2nGround.value);
check('MAA 无G/H: σ/εr 禁用(自由空间默认)', m2nSigma.disabled === true, '');

console.log(`\n${pass} PASS / ${fail} FAIL`);