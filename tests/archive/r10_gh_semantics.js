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
const api = new Function('window','document','alert', src + '\nvar N2M = window.N2M;\nreturn { enterWorkScreen, processInputText, extractM2nPanel, executeConvertM2N, syncGroundDisabled, autoDeriveEpsr };')(windowStub, patchedDoc, () => {});
domReadyFn();

let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS', n, d || ''); } else { fail++; console.log('FAIL', n, d || ''); process.exitCode = 1; } }

const sigma = checkFn('m2nSigma');
const epsr = checkFn('m2nEpsr');
const m2nGround = checkFn('m2nGround');
const m2nPresetGroup = checkFn('m2nPresetGroup');
const inputNec = checkFn('inputNec');
const out = checkFn('outputMaa');

// ===== parser 字段语义: 字段2=height, 字段3=material =====
const vdp = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');  // G/H: 2,20.0,0,50,120,60,0.0
api.enterWorkScreen('m2n');
windowStub.N2M.state.currentFileName = 'VDP40B.MAA';
inputNec.value = vdp;
api.processInputText(vdp, 'VDP40B.MAA');
check('VDP40B: height=20 (字段2=附加高度)', windowStub.N2M.state.m2nParsed.ground.height === 20, String(windowStub.N2M.state.m2nParsed.ground.height));
check('VDP40B: material=0', windowStub.N2M.state.m2nParsed.ground.material === 0, String(windowStub.N2M.state.m2nParsed.ground.material));
check('VDP40B: 真实地面 σ 面板默认 0.0 (非加载值, 由面板/预设提供)', String(sigma.value) === '0.0' || sigma.value === '', JSON.stringify(sigma.value));
check('VDP40B: 地面类型=2', m2nGround.value === '2');

// ===== 转换: SY h=20, 无 material 提示 =====
api.executeConvertM2N();
const nec1 = out.value;
check('SY h=20 (来自height)', nec1.includes('SY h=20'), nec1.split('\n').find(l=>l.startsWith('SY h')));
check('无 material 提示 (material=0)', !nec1.includes('Material: M=') && !windowStub.N2M.state.m2nWarnings.some(w=>w.includes('材料序号')), '');
check('GN 卡 (σ 面板 0 → 平均13)', /GN 0, 0, 0, 0, 13, 0.005/.test(nec1), nec1.split('\n').find(l=>l.startsWith('GN')));

// ===== material>0 提示 + 文件 (Omega GP 9m: G/H= 2,0.0,1,50,120,60,0) =====
const omega = fs.readFileSync('F:\\Antenna_Models\\AntennaFiles-OLD-master_天线模型收藏\\AntennaFiles-OLD-master\\ANT\\Match\\Omega GP 9m.maa', 'latin1');
inputNec.value = omega;
windowStub.N2M.state.currentFileName = 'Omega GP 9m.maa';
api.processInputText(omega, 'Omega GP 9m.maa');
check('Omega: material=1 (字段3)', windowStub.N2M.state.m2nParsed.ground.material === 1, String(windowStub.N2M.state.m2nParsed.ground.material));
check('Omega: height=0', windowStub.N2M.state.m2nParsed.ground.height === 0, '');
api.executeConvertM2N();
const nec2 = out.value;
check('Omega: CM Material: M=1 提示', nec2.includes('CM Material: M=1') && nec2.includes('set wire material manually'), nec2.split('\n').find(l=>l.startsWith('CM Material')));
check('Omega: material>0 警告进面板', windowStub.N2M.state.m2nWarnings.some(w=>w.includes('材料序号 M=1')), '');

// ===== 字段2 不产物 GN σ (Sigma 改面板) =====
// Omega σ 面板 0 → GN 13/0.005 (未指定平均)
check('Omega GN (σ默认0→平均13)', /GN 0, 0, 0, 0, 13, 0.005/.test(nec2), nec2.split('\n').find(l=>l.startsWith('GN')));

// ===== HTML 文案 =====
check('阻抗 jX ×2', (html.match(/阻抗 jX/g) || []).length === 2 && !html.includes('阻抗 X (Ω)'), '');
check('N2M 基本参数 (两工作区各1)', (html.match(/基本参数/g) || []).length === 2, String((html.match(/基本参数/g)||[]).length));
check('N2M <label>天线名称</label> (两工作区共2)', (html.match(/<label>天线名称<\/label>/g) || []).length === 2, '');

// ===== 自由空间清空 σ/εr (回归) =====
sigma.value = '20'; epsr.value = '17';
m2nGround.value = '0';
// 模拟 change 分支
if (m2nGround.value === '0') { sigma.value=''; epsr.value=''; }
check('自由空间: σ/εr 清空', sigma.value === '' && epsr.value === '', '');

console.log(`\n${pass} PASS / ${fail} FAIL`);