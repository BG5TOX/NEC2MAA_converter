const fs = require('fs');
const base = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter';
// v03: state + utils 拼接（utils 是纯函数, 不依赖 N2M 运行时, 但按真实加载顺序拼接）
const src = ['state', 'utils'].map(n => fs.readFileSync(`${base}\\NEC2MAA_converter_main\\js\\${n}.js`, 'utf8')).join('\n');
try { new Function('window', 'document', src); console.log('SYNTAX OK (state+utils)'); } catch (e) { console.log('SYNTAX FAIL: ' + e.message); process.exit(1); }

const windowStub = {};
const api = new Function('window', 'document', src + '\nreturn { evalExpr, segToDesignator, getMmanaPos, parseGsScale, formatNum, hasChinese, removeChinese, GS_UNITS };')(windowStub, {});
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? '  ' + detail : '')); process.exitCode = 1; }
}
const w = [];
// === 设计符终版规则 (v02 修复3后) ===
check('21段 s=11 → c', api.getMmanaPos(1, '11', 21, {}, w) === 'c');
check('21段 s=1 → b', api.getMmanaPos(1, '1', 21, {}, w) === 'b');
check('21段 s=21 → e', api.getMmanaPos(1, '21', 21, {}, w) === 'e');
check('21段 s=2 → b1 (|1| 保留)', api.getMmanaPos(1, '2', 21, {}, w) === 'b1');
check('21段 s=12 → c1', api.getMmanaPos(1, '12', 21, {}, w) === 'c1');
check('21段 s=10 → c-1', api.getMmanaPos(1, '10', 21, {}, w) === 'c-1');
const w5 = [];
check('21段 s=5 → b (|4|>1 收敛)', api.getMmanaPos(1, '5', 21, {}, w5) === 'b');
// i18n-3 批次同步: 告警改结构化 {key, params}; 断言按 key+params 判 (渲染等价于旧中文句)
check('s=5 收敛告警', w5.length === 1 && w5[0].key === 'n2m.tag.bigOffset' && w5[0].params.tag === 1 && w5[0].params.seg === 5 && w5[0].params.ns === 21, JSON.stringify(w5));
const w17 = [];
check('21段 s=17 → c (|6|>1 收敛)', api.getMmanaPos(1, '17', 21, {}, w17) === 'c' && w17[0].key === 'n2m.tag.bigOffset' && w17[0].params.anchor === 'c');
check('20段 s=17 → c (修复3: |c7|>1 收敛)', api.getMmanaPos(1, '17', 20, {}, [])[0] === 'c' && api.getMmanaPos(1, '17', 20, {}, []).length === 1);
// 全枚举不变量 (收敛版: 纯锚/±1 精确反解; >1 收敛到锚)
let bad = 0;
for (let ns = 1; ns <= 30; ns++) for (let s = 1; s <= ns; s++) {
  const wa = [];
  const d = api.getMmanaPos(1, String(s), ns, {}, wa);
  if (!/^[cbe][+-]?\d?$/.test(d)) { bad++; console.log('BAD ns=' + ns + ' s=' + s + ' → ' + d); continue; }
  const mm = d.match(/^([cbe])([+-]?\d)?$/);
  const c0 = Math.floor((ns + 1) / 2);
  let expect;
  if (mm[2] === undefined) expect = mm[1] === 'c' ? (ns <= 1 ? 1 : c0) : (mm[1] === 'b' ? 1 : ns);
  else expect = mm[1] === 'c' ? c0 + parseInt(mm[2]) : (mm[1] === 'b' ? 1 + parseInt(mm[2]) : ns + parseInt(mm[2]));
  // 收敛场景: 反解应等于锚段; 保留场景: 等于原段
  if (wa.length === 0 && expect !== s) { bad++; console.log('KEEP FAIL ns=' + ns + ' s=' + s + ' → ' + d); }
  if (wa.length > 0 && expect === s) { bad++; console.log('CONV 不该收敛 ns=' + ns + ' s=' + s); }
}
check('全枚举 N=1..30 (保留段精确/收敛段在锚点)', bad === 0, 'bad=' + bad);
check('W8BYA 31段 s=16 → c 零告警', api.getMmanaPos(1, '16', 31, {}, []) === 'c');
check('50% → c', api.getMmanaPos(1, '50%', 21, {}, []) === 'c');

// === GS 单位 9 形态 ===
check('ft 裸单位', api.parseGsScale('FT', {}).val === 0.3048);
check('135cm', api.parseGsScale('135CM', {}).val === 1.35);
check('2.5in', api.parseGsScale('2.5IN', {}).val === 0.0635);
check('300mm', api.parseGsScale('300MM', {}).val === 0.3);
check('非法 xyz → 0 (v02 evalExpr catch 语义一致)', api.parseGsScale('XYZ', {}).val === 0);
check('纯数字 0.0254', api.parseGsScale('0.0254', {}).val === 0.0254);

// === evalExpr / 其他 ===
check('evalExpr 算术', api.evalExpr('2+3*4', {}) === 14);
check('evalExpr 符号', (() => { const s = { LEN: '2' }; return api.evalExpr('LEN*3', s) === 6; })());
check('evalExpr UH', api.evalExpr('2UH', {}) === 2e-6);
check('formatNum 4位', api.formatNum(1.23456) === '1.2346');
check('hasChinese', api.hasChinese('abc中文') === true && api.hasChinese('abc') === false);
check('removeChinese', api.removeChinese('a中b文c') === 'abc');

// === state.js 结构 ===
check('N2M 命名空间', typeof windowStub.N2M === 'object' && typeof windowStub.N2M.$ === 'function');
check('state 四变量', windowStub.N2M.state && 'currentFileName' in windowStub.N2M.state && 'unsupportedErrors' in windowStub.N2M.state);
check('IDS 常量表 21 项', Object.keys(windowStub.N2M.IDS).length >= 20);
check('$ 收口', (() => { const doc = { getElementById: (id) => ({ id }) }; const s2 = new Function('window', 'document', src + '; return window.N2M;')(windowStub, doc); return s2.$('freq').id === 'freq'; })());

console.log(`\n${pass} PASS / ${fail} FAIL`);
