const fs = require('fs');
const html = fs.readFileSync('F:/temp/AGTC_anyGTa_2lite_V2-00/NEC2MAA_converter/NEC2MAA_converter_v03/index.html', 'utf8');
const src = ['state','utils','geometry','extract','maa2nec/maa-parser','maa2nec/maa-symbols','maa2nec/maa-writer','convert','app']
  .map(n => fs.readFileSync('F:/temp/AGTC_anyGTa_2lite_V2-00/NEC2MAA_converter/NEC2MAA_converter_v03/js/' + n + '.js', 'utf8')).join('\n');

function parseInlineStyle(htmlText) {
  const map = {};
  const re = /<[^>]+id="([^"]+)"[^>]*style="([^"]*)"/g;
  let m;
  while ((m = re.exec(htmlText)) !== null) {
    const d = m[2].match(/(?:^|;)\s*display\s*:\s*([^;]+)/);
    map[m[1]] = d ? d[1].trim() : undefined;
  }
  return map;
}
const inline = parseInlineStyle(html);
// 从 HTML 提取元素的直接文本内容 (用于桩的 textContent)
const textMap = {};
{ // B 法: 逐 id 定位, 取该标签 `>` 后到下一个 `<` 的文本 (稳定, 兼容自闭合/多行)
  const re2 = /<[^>]*?id="([^"]+)"[^>]*?>/g;
  let m;
  while ((m = re2.exec(html)) !== null) {
    const lt = html.indexOf('<', re2.lastIndex);
    if (lt < 0) break;
    textMap[m[1]] = html.slice(re2.lastIndex, lt);
  }
}
const elements = {};
const checkFn = (id) => {
  if (!elements[id]) {
    const st = {};
    const def = inline[id];
    if (def !== undefined) { st.display = def; st._initialDisplay = def; }
    elements[id] = { value: '', textContent: textMap[id] || '', disabled: false, style: st, classList: { toggle: () => {} },
                     addEventListener: () => {}, setAttribute: () => {}, click: () => {}, focus: () => {},
                     appendChild: () => {}, options: [] };
  }
  return elements[id];
};
const documentStub = { getElementById: checkFn, querySelectorAll: () => [], createElement: () => ({ click: () => {}, style: {} }), body: { appendChild: () => {}, removeChild: () => {} } };
const windowStub = {};
let domReadyFn = null;
const patchedDoc = new Proxy(documentStub, { get(t, p) { if (p === 'addEventListener') return (ev, fn) => { if (ev === 'DOMContentLoaded') domReadyFn = fn; }; return t[p]; } });
const api = new Function('window', 'document', 'alert', src + '\nvar N2M = window.N2M;\nreturn { enterWorkScreen, setDirection, extractM2nPanel, executeConvertM2N, autoDeriveEpsr, getDirection: () => N2M.state.direction };')(windowStub, patchedDoc, () => {});
domReadyFn();

let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS', n, d || ''); } else { fail++; console.log('FAIL', n, d || ''); process.exitCode = 1; } }

const epsr = checkFn('m2nEpsr');
const hint = checkFn('m2nEpsrHint');
const sigma = checkFn('m2nSigma');
const output = checkFn('outputMaa');

api.enterWorkScreen('m2n');

// 1. 提取 VDP40B (σ=20 → εr=17) → 自动填 εr + 显示提示
const vdp = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');
windowStub.N2M.state.currentFileName = 'VDP40B';
checkFn('inputNec').value = vdp;   // 关键: executeConvertM2N 读 inputNec.value
api.extractM2nPanel(vdp, false);
check('提取: σ=20', String(sigma.value) === '20', sigma.value);
check('提取: εr 自动填入 17', String(epsr.value) === '17', String(epsr.value));
check('提取: 提示显示', hint.style.display === '' && hint.textContent === '典型值（自动）', `${hint.style.display}|${hint.textContent}`);
check('提取: m2nEpsrAuto=true', windowStub.N2M.state.m2nEpsrAuto === true);

// 2. 转换 (自动模式 → GN epsr=17, σ=20/1000=0.02)
api.executeConvertM2N();
const gn = (output.value.split('\n').find(l => l.startsWith('GN ')) || '');
check('转换: GN 自动推导 epsr=17 σ=0.02', gn === 'GN 0, 0, 0, 0, 17, 0.02', gn);

// 3. 手改 εr → 提示隐藏 + manual
epsr.value = 13;
windowStub.N2M.state.m2nEpsrAuto = false;
hint.style.display = 'none';
api.executeConvertM2N();
const gn2 = (output.value.split('\n').find(l => l.startsWith('GN ')) || '');
check('手改 epsr=13 → GN 用 13', gn2 === 'GN 0, 0, 0, 0, 13, 0.02', gn2);

// 4. 自动识别 σ 变化 → εr 联动
api.autoDeriveEpsr();
check('自动识别: σ 未变 εr=17 保持', String(epsr.value) === '17');
sigma.value = 5;
api.autoDeriveEpsr();
check('σ=5 → εr=13 联动', String(epsr.value) === '13', String(epsr.value));
check('联动后提示仍显示', hint.style.display === '');

console.log(`\n${pass} PASS / ${fail} FAIL`);