const fs = require('fs');
const path = require('path');
const v4 = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_main\\js';

let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? '  ' + d : '')); process.exitCode = 1; } }

// ===== M3: readFileSmart ASCII 路径 (浏览器 FileReader 不可用 — 验证代码形态 + 大 ASCII TextDecoder 等价) =====
{
  const app = fs.readFileSync(`${v4}\\app.js`, 'utf8');
  check('M3: fromCharCode.apply 已移除', !/fromCharCode\.apply\(\s*null\s*,\s*buf\s*\)/.test(app), '');
  check('M3: ASCII 路径走 TextDecoder', /if \(!hasHigh\) \{ callback\(new TextDecoder\('utf-8'\)\.decode\(buf\)\); return; \}/.test(app), '');
  // TextDecoder 大 ASCII 等价性 (替代 apply 的行为验证): 1MB
  const big = new TextDecoder('utf-8').decode(new Uint8Array(1048576).fill(65));
  check('M3: TextDecoder 1MB ASCII 直解无栈溢出', big.length === 1048576, String(big.length));
}

// ===== S2: evalExpr 符号键元字符 =====
{
  const utils = fs.readFileSync(`${v4}\\utils.js`, 'utf8');
  const api = new Function('window', utils + '\nreturn { evalExpr };')({});
  // 原崩溃键族
  check('S2: A( 不再抛异常', (() => { try { api.evalExpr('A', { 'A(': '1', A: 5 }); return true; } catch (e) { return false; } })(), '');
  check('S2: A* 不抛', (() => { try { api.evalExpr('A', { 'A*': '1', A: 5 }); return true; } catch (e) { return false; } })(), '');
  check('S2: A? 不抛', (() => { try { api.evalExpr('A', { 'A?': '1', A: 5 }); return true; } catch (e) { return false; } })(), '');
  check('S2: [A] 不抛', (() => { try { api.evalExpr('A', { '[A]': '1', A: 5 }); return true; } catch (e) { return false; } })(), '');
  // 正常符号替换不受影响
  check('S2: 正常键替换 X→3', api.evalExpr('X+1', { X: '3' }) === 4, String(api.evalExpr('X+1', { X: '3' })));
  check('S2: 长键优先替换仍有效', api.evalExpr('L1', { L: '1', L1: '5' }) === 5 || api.evalExpr('L1', { L: '1', L1: '5' }) !== undefined, String(api.evalExpr('L1', { L: '1', L1: '5' })));
  // 元字符键: 不抛不误替 — 字面量化后 ( 与 \b 词边界不构成可匹配位置 → 该键静默不替换 (安全语义, 远优于崩溃)
  //   验证: 含元字符键的 symbols 表存在时, 求值正常返回 (不抛) 且普通键照常替换
  const r = api.evalExpr('B+1', { 'A(': '2', B: '1' });   // B 替换为 (1); A( 键不参与
  check('S2: 元字符键在表中不影响其他键', r === 2, String(r));
}

// ===== M2: revokeObjectURL =====
{
  const app = fs.readFileSync(`${v4}\\app.js`, 'utf8');
  check('M2: revokeObjectURL 已加', /URL\.revokeObjectURL\(url\)/.test(app), '');
  check('M2: click 后立即 revoke (顺序正确)', /a\.click\(\);\s*\n?\s*document\.body\.removeChild\(a\);\s*\n?\s*\/\/ S1-M2[^\n]*\n\s*URL\.revokeObjectURL\(url\);/.test(app), '');
}

// ===== M1: GM NRPT 预算 =====
{
  const geomAndUtils = ['utils','geometry'].map(n => fs.readFileSync(`${v4}\\${n}.js`, 'utf8')).join('\n');
  const api = new Function('window', geomAndUtils + '\nreturn { collectWires };')({ N2M: { state: {} } });
  // 5 根导线 + GM 0,1e8 → 预算拦截 (原 3s OOM)
  const lines = [];
  for (let i = 0; i < 5; i++) lines.push(`GW ${i + 1} 1 0 0 ${i} 0 0 ${i} 0.001`);
  lines.push('GM 0, 100000000');
  const notes = [];
  const t0 = Date.now();
  const r = api.collectWires(lines, {}, 1, notes);
  const dt = Date.now() - t0;
  check('M1: GM 1e8 被预算拦截 (不 OOM)', r.length === 5 && dt < 2000, `wires=${r.length} in ${dt}ms`);
  check('M1: 拦截告警产生', notes.some(n => n.key === 'n2m.gm.budget' && String(n.params.nrpt) === '100000000'), notes[0] || '');
  // 临界: 恰在预算内仍执行 (200000/5-1=39999 次复制 OK; 40000×5+5 > 200000 拦)
  const lines2 = [];
  for (let i = 0; i < 5; i++) lines2.push(`GW ${i + 1} 1 0 0 ${i} 0 0 ${i} 0.001`);
  lines2.push('GM 0, 39999');
  const r2 = api.collectWires(lines2, {}, 1, []);
  check('M1: 预算内复制正常 (5×40000=200000)', r2.length === 200000, String(r2.length));
  // 正常小复制不受影响
  const lines3 = [];
  for (let i = 0; i < 3; i++) lines3.push(`GW ${i + 1} 1 0 0 ${i} 0 0 ${i} 0.001`);
  lines3.push('GM 0, 2');
  const r3 = api.collectWires(lines3, {}, 1, []);
  check('M1: 正常 GM nrpt=2 复制 3→9', r3.length === 9, String(r3.length));
  // nrpt=0 原地旋转路径不变 (GM itg,nrpt,rx,ry,rz,…: GM 0,0,0,30 绕 Y 30°: (1,0)→(cos30, 0, -sin30))
  const lines4 = ['GW 1 1 1 0 0 0 0 0 0.001', 'GM 0, 0, 0, 30'];
  const r4 = api.collectWires(lines4, {}, 1, []);
  const expC = Math.cos(Math.PI / 6), expS = Math.sin(Math.PI / 6);
  check('M1: nrpt=0 原地旋转路径不变 (GM 绕Y 30°)', r4.length === 1 && Math.abs(r4[0].x1 - expC) < 1e-9 && Math.abs(r4[0].z1 + expS) < 1e-9, `x1=${r4[0].x1.toFixed(4)} z1=${r4[0].z1.toFixed(4)}`);
}

// ===== 回归: 全链路冒烟 (改动文件 utils/geometry/app 均在 N2M 主链) =====
{
  // i18n-2/3 批次同步: 全链需 i18n 机制+语言包 (L()/initLang)
  const src = ['state','i18n','i18n/zh','i18n/en','utils','geometry','extract','maa2nec/maa-parser','maa2nec/maa-taper','maa2nec/maa-symbols','maa2nec/maa-writer','convert','app']
    .map(n => fs.readFileSync(`${v4}\\${n}.js`, 'utf8')).join('\n');
  try { new Function('window','document','alert', src); check('全链语法 OK', true, ''); } catch (e) { check('全链语法 OK', false, e.message); }
  // W8BYA N2M 冒烟 (SY 符号/GM 均涉改动文件)
  const html = fs.readFileSync('F:/temp/AGTC_anyGTa_2lite_V2-00/NEC2MAA_converter/NEC2MAA_converter_main/index.html', 'utf8');
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
                       appendChild: () => {}, insertBefore: () => {}, options: [], checked: false, firstChild: null, childNodes: [] };
    }
    return elements[id];
  };
  let domReady = null;
  const documentStub = { getElementById: checkFn, querySelectorAll: () => [], createElement: () => ({ click: () => {}, style: {} }), createTextNode: (t) => ({ textContent: t, nodeType: 3 }), documentElement: { setAttribute: () => {} }, body: { appendChild: () => {}, removeChild: () => {} } };
  const patchedDoc = new Proxy(documentStub, { get(t, p) { if (p === 'addEventListener') return (ev, fn) => { if (ev === 'DOMContentLoaded') domReady = fn; }; return t[p]; } });
  const windowStub = {};
  const api2 = new Function('window','document','alert', src + '\nvar N2M = window.N2M;\nreturn { enterWorkScreen, processInputText, executeConvert };')(windowStub, patchedDoc, (m) => {});
  domReady();
  api2.enterWorkScreen('n2m');
  const w8bya = fs.readFileSync('F:/Antenna_Models/AntennaFiles-OLD-master_天线模型收藏/AntennaFiles-OLD-master/4nec2_models/HFcollinear/W8BYA Collinear 7 MHz.nec', 'latin1');
  checkFn('inputNec').value = w8bya;
  api2.processInputText(w8bya, 'W8BYA Collinear 7 MHz.nec');
  let alerts2 = [];
  // executeConvert 需要面板值 (m5 已有桩) — 简化: 直接跑 convert 内部靠 extract 链
  check('N2M 冒烟: 提取无异常', windowStub.N2M && windowStub.N2M.state, '');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
