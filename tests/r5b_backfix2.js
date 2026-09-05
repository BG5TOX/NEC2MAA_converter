const fs = require('fs');
const html = fs.readFileSync('F:/temp/AGTC_anyGTa_2lite_V2-00/NEC2MAA_converter/NEC2MAA_converter_main/index.html', 'utf8');
const src = ['state','i18n','i18n/zh','i18n/en','utils','geometry','extract','maa2nec/maa-parser','maa2nec/maa-taper','maa2nec/maa-symbols','maa2nec/maa-writer','convert','app']
  .map(n => fs.readFileSync('F:/temp/AGTC_anyGTa_2lite_V2-00/NEC2MAA_converter/NEC2MAA_converter_main/js/' + n + '.js', 'utf8')).join('\n');

// 更真实的 DOM 桩: 从 index.html 解析初始内联 style (display:flex / display:none 等),
// 模拟浏览器 style.display='' 移除内联时的回落行为, 以复现"返回后不居中"类 bug。
function parseInlineStyle(htmlText) {
  const map = {};
  const re = /<[^>]+id="([^"]+)"[^>]*style="([^"]*)"/g;
  let m;
  while ((m = re.exec(htmlText)) !== null) {
    const styleText = m[2];
    const d = styleText.match(/(?:^|;)\s*display\s*:\s*([^;]+)/);
    map[m[1]] = { inline: styleText, display: d ? d[1].trim() : undefined };
  }
  return map;
}
const inline = parseInlineStyle(html);
const elements = {};
const checkFn = (id) => {
  if (!elements[id]) {
    const st = {};
    const def = inline[id];
    if (def && def.display !== undefined) {
      st.display = def.display;   // 初始保留内联 display (如 flex/none)
      st._initialDisplay = def.display;
    }
    elements[id] = { value: '', textContent: '', disabled: false, style: st, classList: { toggle: () => {} },
                     addEventListener: () => {}, setAttribute: () => {}, click: () => {}, focus: () => {},
                     appendChild: () => {}, insertBefore: () => {}, insertBefore: () => {}, options: [] };
  }
  return elements[id];
};
const documentStub = {
  getElementById: checkFn,
  querySelectorAll: () => [],
  createTextNode: (t) => ({ textContent: t }),   // i18n-1: applyI18n workTitle firstChild
  documentElement: { setAttribute: () => {} },   // i18n-1: <html lang> 同步
  createElement: () => ({ click: () => {}, style: {} }),
  body: { appendChild: () => {}, insertBefore: () => {}, insertBefore: () => {}, removeChild: () => {} },
};
const windowStub = {};
let domReadyFn = null;
const patchedDoc = new Proxy(documentStub, { get(t, p) { if (p === 'addEventListener') return (ev, fn) => { if (ev === 'DOMContentLoaded') domReadyFn = fn; }; return t[p]; } });
const api = new Function('window', 'document', 'alert', src + '\nvar N2M = window.N2M;\nreturn { enterWorkScreen, backToWizard, getDirection: () => N2M.state.direction };')(windowStub, patchedDoc, () => {});
domReadyFn();

let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS', n, d || ''); } else { fail++; console.log('FAIL', n, d || ''); process.exitCode = 1; } }

const wizard = checkFn('wizardScreen');
const work = checkFn('workScreen');

// 1. 初屏: wizardScreen flex 显示
check('初屏: wizardScreen display=flex', wizard.style.display === 'flex', wizard.style.display);
check('初屏: workScreen display=none (隐藏)', work.style.display === 'none', work.style.display);

// 2. 进入 MAA 工作区
api.enterWorkScreen('m2n');
check('进入: wizardScreen 隐藏', wizard.style.display === 'none', wizard.style.display);
check('进入: workScreen 显示', work.style.display === '', work.style.display || '(empty→block)');

// 3. 返回 → 关键: wizardScreen 必须恢复 flex
api.backToWizard();
check('返回: wizardScreen 恢复 flex (居中保持!)', wizard.style.display === 'flex', wizard.style.display);
check('返回: workScreen 隐藏', work.style.display === 'none');
check('返回: direction 复位 n2m', api.getDirection() === 'n2m');
check('返回: 按钮文案 .nec', checkFn('btnUpload').textContent.includes('.nec'), checkFn('btnUpload').textContent);

// 4. 再进 NEC → 再返回 → 再进 MAA → 返回 (双向往返, 每次检查 flex)
for (const [dir, label] of [['n2m', 'NEC'], ['m2n', 'MAA'], ['n2m', 'NEC'], ['m2n', 'MAA']]) {
  api.enterWorkScreen(dir);
  check(`再进 ${label}: wizard 隐藏`, wizard.style.display === 'none');
  api.backToWizard();
  check(`再返回(${label}): wizard 恢复 flex`, wizard.style.display === 'flex', wizard.style.display);
  check(`再返回(${label}): direction=n2m`, api.getDirection() === 'n2m');
}

// 5. HTML 结构: 无重复 body
check('HTML: 单 body', (html.match(/<body/g) || []).length === 1);

console.log(`\n${pass} PASS / ${fail} FAIL`);