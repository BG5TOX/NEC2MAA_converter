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
const api = new Function('window','document','alert', src + '\nvar N2M = window.N2M;\nreturn { enterWorkScreen, processInputText, executeConvertM2N, executeConvert, syncGroundDisabled };')(windowStub, patchedDoc, (m) => alerts.push(m));
let alerts = [];
domReadyFn();

let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS', n, d || ''); } else { fail++; console.log('FAIL', n, d || ''); process.exitCode = 1; } }

const sigma = checkFn('m2nSigma');
const epsr = checkFn('m2nEpsr');
const m2nGround = checkFn('m2nGround');
const antMat = checkFn('ant_material');
const addH = checkFn('add_height');
const gGround = checkFn('g_ground');
const inputNec = checkFn('inputNec');
const out = checkFn('outputMaa');

// ===== 1. HTML 结构: 天线材料下拉 / 附加高度 / gnd_cond 移除 / 文案 =====
check('N2M: 天线材料下拉(7项不显数字)', html.includes('id="ant_material"') && /无损<\/option>/.test(html) && /铜管<\/option>/.test(html) && /铁管<\/option>/.test(html) && !/铁线 \(5\)/.test(html), '');
check('N2M: 附加高度输入', html.includes('id="add_height"') && html.includes('附加高度 (m)'), '');
check('N2M: gnd_cond 已移除', !html.includes('gnd_cond') && !html.includes('地面电导率 (mS/m)</label>\n                    <input type="number" id="gnd_cond"'), '');
check('M2N: 预设首项"自定义" (R11 后文案)', html.includes('>自定义</option>'), '');
check('M2N: σ placeholder 手动填入', /id="m2nSigma"[^>]*placeholder="手动填入"/.test(html), '');
check('M2N: εr placeholder 手动填入', /id="m2nEpsr"[^>]*placeholder="手动填入"/.test(html), '');
check('M2N: 典型值提示仅在分段密度区', !html.includes('m2nEpsrHint') && html.includes('id="m2nSegDensityHint" data-i18n="panel.m2n.segDensityHint">典型值：15~100'), '');

// ===== 2. M2N: VDP40B 提取 (gtype=2, R20: σ/εr 默认 Average 预设) =====
api.enterWorkScreen('m2n');
const vdp = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');
inputNec.value = vdp;
api.processInputText(vdp, 'VDP40B.MAA');
check('M2N 提取: σ 默认 5 (R20 Average)', String(sigma.value) === '5', JSON.stringify(sigma.value));
check('M2N 提取: εr 默认 13 (R20 Average)', String(epsr.value) === '13', JSON.stringify(epsr.value));

// 3. 拦截: 真实地手动清空 σ/εr → 拦截 (R20 后默认 Average, 用户清空即手动; 拦截仍有效)
sigma.value = ''; epsr.value = '';
alerts = [];
api.executeConvertM2N();
check('拦截: 真实地 σ/εr 手动清空 → 拦截', alerts.some(a => a.includes('请填写地面电导率') && a.includes('介电常数')), alerts[0] || '');

// 4. 填全后转换
sigma.value = '20'; epsr.value = '17';
api.executeConvertM2N();
const nec1 = out.value;
check('填全: GN epsr=17 σ=0.02', /GN 0, 0, 0, 0, 17, 0.02/.test(nec1), nec1.split('\n').find(l => l.startsWith('GN')));
check('填全: SY h=20 (高度)', nec1.includes('SY h=20'), nec1.split('\n').find(l => l.startsWith('SY h')));
check('填全: ASCII', /^[\x20-\x7E\n]*$/.test(nec1));

// 5. 预设选择 Sea water → σ=5000/εr=81 (预设填充路径不变)
sigma.value = ''; epsr.value = '';
// 模拟预设 change: 直接填值
sigma.value = '5000'; epsr.value = '81';
api.executeConvertM2N();
const nec2 = out.value;
check('预设 Sea water: GN epsr=81 σ=5', /GN 0, 0, 0, 0, 81, 5/.test(nec2), nec2.split('\n').find(l => l.startsWith('GN')));

// ===== 6. N2M: 天线材料/附加高度 → G/H 行 =====
api.enterWorkScreen('n2m');
const w8 = fs.readFileSync('F:\\Antenna_Models\\AntennaFiles-OLD-master_天线模型收藏\\AntennaFiles-OLD-master\\4nec2_models\\HFcollinear\\W8BYA Collinear 7 MHz.nec', 'utf8');
inputNec.value = w8;
windowStub.N2M.state.currentFileName = 'W8BYA Collinear 7 MHz.nec';
api.processInputText(w8, 'W8BYA Collinear 7 MHz.nec');
// 默认: 材料无损(0)/高度 0.0
antMat.value = '3';   // 铝线
addH.value = '5.5';
api.executeConvert();
const maa = out.value;
const ghLine = maa.split('\n').find(l => l.includes('***G/H')) !== null ? maa.split('\n')[maa.split('\n').indexOf(maa.split('\n').find(l => l.includes('***G/H'))) + 1] : '';
check('N2M G/H: 字段2=高度5.5 字段3=材料3', ghLine.startsWith('2,\t5.5,\t3,'), ghLine);
// 材料默认
antMat.value = '0'; addH.value = '0';
api.executeConvert();
const maa2 = out.value;
const gh2 = maa2.split('\n')[maa2.split('\n').indexOf(maa2.split('\n').find(l => l.includes('***G/H'))) + 1];
check('N2M G/H: 默认 0,0.0(高度) 材料0', /^2,\t0.0,\t0,/.test(gh2), gh2);

console.log(`\n${pass} PASS / ${fail} FAIL`);