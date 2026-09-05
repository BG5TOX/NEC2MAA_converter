const fs = require('fs');
const html = fs.readFileSync('F:/temp/AGTC_anyGTa_2lite_V2-00/NEC2MAA_converter/NEC2MAA_converter_main/index.html', 'utf8');
let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS', n, d || ''); } else { fail++; console.log('FAIL', n, d || ''); process.exitCode = 1; } }

// 分段参数节切片 (i18n-1: 标签改 <span data-i18n="panel.m2n.segParams">分段参数</span> — 锚点随结构)
const segStart = html.indexOf('>分段参数<');
check('分段参数锚点存在', segStart > 0, 'html.indexOf(分段参数)=' + segStart);
const secStart = html.lastIndexOf('<div class="settings-section"', segStart);
// 找该 section 的闭合 (配平)
let depth = 0, secEnd = -1;
for (let i = secStart; i < html.length; i++) {
  if (html.startsWith('<div', i)) depth++;
  else if (html.startsWith('</div>', i)) { depth--; if (depth === 0) { secEnd = i; break; } }
}
const sec = html.substring(secStart, secEnd + 6);

// 1. 提醒框在 controls 闭合之后 (box 最下方)
const controlsOpen = sec.indexOf('<div class="controls"');
let d2 = 0, controlsClose = -1;
for (let i = controlsOpen; i < sec.length; i++) {
  if (sec.startsWith('<div', i)) d2++;
  else if (sec.startsWith('</div>', i)) { d2--; if (d2 === 0) { controlsClose = i; break; } }
}
const notePos = sec.indexOf('id="m2nAutoSegNote"');
const controlsCloseEnd = sec.indexOf('>', controlsClose) + 1;
check('提醒框在 controls 之后 (box 最下方)', notePos > controlsCloseEnd && controlsCloseEnd > 0, `controls闭@${controlsCloseEnd} note@${notePos}`);
check('提醒框与 controls 间距 12px', sec.includes('m2nAutoSegNote" style="background:#fff8e1; border:1px solid #f0c36d; border-radius:6px; padding:8px 10px; box-sizing:border-box; margin-top:12px;'), '');
// 2. controls 行距优化
check('controls row-gap:14px', sec.includes('row-gap:14px'), '');
// 3. 文字左、框右 (i18n-1: label 含 data-i18n 属性, 文本仍在 span 内)
const row = sec.substring(sec.indexOf('m2nForceSeg') - 200, sec.indexOf('m2nForceSeg') + 200);
check('文字左、checkbox 右', row.indexOf('打开强制分段') < row.indexOf('type="checkbox"'), '');
check('flex-direction:row !important', sec.includes('flex-direction:row !important'), '');
// 4. 提醒框不含 control-group 类 (不在 grid 内)
const noteTag = sec.substring(sec.indexOf('<div id="m2nAutoSegNote"'), sec.indexOf('>', sec.indexOf('<div id="m2nAutoSegNote"')) + 1);
check('提醒框非 grid item (无 control-group 类)', !noteTag.includes('control-group'), noteTag);

console.log(`\n${pass} PASS / ${fail} FAIL`);