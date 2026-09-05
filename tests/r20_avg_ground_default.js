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
                     appendChild: () => {}, insertBefore: () => {}, insertBefore: () => {}, options: [], checked: false };
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
const api = new Function('window','document','alert', src + '\nvar N2M = window.N2M;\nreturn { enterWorkScreen, processInputText, executeConvertM2N, extractM2nPanel, applyRealGroundDefault, syncGroundDisabled };')(windowStub, patchedDoc, (m) => alerts.push(m));
let alerts = [];
domReadyFn();

let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS', n, d || ''); } else { fail++; console.log('FAIL', n, d || ''); process.exitCode = 1; } }

const sigma = checkFn('m2nSigma');
const epsr = checkFn('m2nEpsr');
const ground = checkFn('m2nGround');
const preset = checkFn('m2nGroundPreset');
const presetGroup = checkFn('m2nPresetGroup');
const inputNec = checkFn('inputNec');
const out = checkFn('outputMaa');

// ===== 1. 单元: 地面类型切换 → Average 默认 (R20) =====
api.enterWorkScreen('m2n');
ground.value = '2';   // 真实地面 MININEC
api.applyRealGroundDefault();
check('类型2: σ 默认 5 (Average)', String(sigma.value) === '5', JSON.stringify(sigma.value));
check('类型2: εr 默认 13 (Average)', String(epsr.value) === '13', JSON.stringify(epsr.value));
check('类型2: 预设选中 Average', preset.value === '0.005,13', JSON.stringify(preset.value));
check('类型2: 预设组显示', presetGroup.style.display === '', JSON.stringify(presetGroup.style.display));

ground.value = '-1';  // 真实地面 Sommerfeld-Norton
api.applyRealGroundDefault();
check('类型-1: σ 默认 5 (Average)', String(sigma.value) === '5', JSON.stringify(sigma.value));
check('类型-1: εr 默认 13 (Average)', String(epsr.value) === '13', JSON.stringify(epsr.value));
check('类型-1: 预设选中 Average', preset.value === '0.005,13', JSON.stringify(preset.value));
check('类型-1: 预设组显示', presetGroup.style.display === '', '');

// 自由空间 / 理想地面: 不默认 Average
ground.value = '0';
api.applyRealGroundDefault();
check('自由空间: σ/εr 清空', sigma.value === '' && epsr.value === '', `σ=${JSON.stringify(sigma.value)} εr=${JSON.stringify(epsr.value)}`);
check('自由空间: 预设复位 自定义', preset.value === '', JSON.stringify(preset.value));
check('自由空间: 预设组隐藏', presetGroup.style.display === 'none', JSON.stringify(presetGroup.style.display));
sigma.value = '5'; epsr.value = '13';   // 模拟用户之前填的残留
ground.value = '1';   // 理想地面
api.applyRealGroundDefault();
check('理想地面: 预设组隐藏+复位', presetGroup.style.display === 'none' && preset.value === '', '');
check('理想地面: σ/εr 不强制清空(与旧行为一致)', sigma.value === '5' && epsr.value === '13', `σ=${sigma.value} εr=${epsr.value}`);

// ===== 2. 提取路径: VDP40B (gtype=2 真实地) → 面板默认 Average =====
const vdp = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');
inputNec.value = vdp;
api.processInputText(vdp, 'VDP40B.MAA');
check('VDP40B 提取: σ 默认 5', String(sigma.value) === '5', JSON.stringify(sigma.value));
check('VDP40B 提取: εr 默认 13', String(epsr.value) === '13', JSON.stringify(epsr.value));
check('VDP40B 提取: 预设选中 Average', preset.value === '0.005,13', '');
check('VDP40B 提取: σ/εr 启用 (真实地)', sigma.disabled === false && epsr.disabled === false, '');

// ===== 3. 转换路径: VDP40B 直接转换 → GN 含 Average 参数 (不再拦截) =====
alerts = [];
api.executeConvertM2N();
check('VDP40B 默认转换: 无 σ/εr 拦截', !alerts.some(a => a.includes('请填写地面电导率')), alerts[0] || '');
const gnLine = out.value.split('\n').find(l => l.startsWith('GN'));
check('VDP40B 默认转换: GN epsr=13 σ=0.005 (MININEC)', gnLine === 'GN 0, 0, 0, 0, 13, 0.005', gnLine);

// ===== 4. 换选 Sea water 预设 → GN epsr=81 σ=5 =====
sigma.value = '5000'; epsr.value = '81';   // 模拟预设 change 填值
api.executeConvertM2N();
const gn2 = out.value.split('\n').find(l => l.startsWith('GN'));
check('Sea water: GN epsr=81 σ=5', gn2 === 'GN 0, 0, 0, 0, 81, 5', gn2);

// ===== 5. S-N 地面 (-1) → GN 2 卡型 =====
ground.value = '-1';
sigma.value = '5'; epsr.value = '13';
api.executeConvertM2N();
const gn3 = out.value.split('\n').find(l => l.startsWith('GN'));
check('S-N 地面: GN 2, 0, 0, 0, 13, 0.005', gn3 === 'GN 2, 0, 0, 0, 13, 0.005', gn3);

// ===== 6. 自定义拦截仍有效 (真实地 + σ/εr 手动清空) =====
ground.value = '2';
sigma.value = ''; epsr.value = '';
alerts = [];
api.executeConvertM2N();
check('拦截: 真实地 σ/εr 清空 → 拦截', alerts.some(a => a.includes('请填写地面电导率') && a.includes('介电常数')), alerts[0] || '');

// ===== 7. 自由空间文件提取: 禁用+清空 (回归 R7/R9) =====
const freespace = 'Test\nt\n*\n7.0\n***Wires***\n1\n0,0,0, 1,0,0, 0.001, -1\n*** G/H/M/R/AzEl/X ***\n0, 0, 0, 50, 120, 60, 0\n';
inputNec.value = freespace;
api.processInputText(freespace, 'fs.maa');
check('自由空间文件: σ/εr 禁用', sigma.disabled === true && epsr.disabled === true, '');
check('自由空间文件: σ/εr 清空', sigma.value === '' && epsr.value === '', '');
check('自由空间文件: 预设组隐藏', presetGroup.style.display === 'none', '');

// ===== 8. 回归: R19 首条 CM = .maa 原标题 (不受 R20 影响) =====
inputNec.value = vdp;
api.processInputText(vdp, 'VDP40B.MAA');
sigma.value = '5'; epsr.value = '13';
api.executeConvertM2N();
const firstCm = out.value.split('\n').find(l => l.startsWith('CM '));
check('回归 R19: 首条 CM = 原标题', firstCm === 'CM VDP 40m with Bottom LOAD', firstCm);
check('回归: ASCII', /^[\x20-\x7E\n]*$/.test(out.value), '');

console.log(`\n${pass} PASS / ${fail} FAIL`);
