// m6_expr_sy.js — 2026-09-24 NEC 解析审计修复批次 2 回归：表达式层（^/SQR/ATN/INT/单位/AWG/前导零/隐式乘法/护栏）+ SY 顺序求值
// 装配方式同 m3（state+utils+geometry）；真实文件依赖 F:\Antenna_Models
const fs = require('fs');
const base = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_main\\js';
const src = ['state', 'utils', 'geometry'].map(n => fs.readFileSync(`${base}\\${n}.js`, 'utf8')).join('\n');
try { new Function('window', 'document', src); console.log('SYNTAX OK (state+utils+geometry)'); } catch (e) { console.log('SYNTAX FAIL: ' + e.message); process.exit(1); }
const api = new Function('window', 'document', src + '\nreturn { evalExpr, parseGsScale, applySyDecl, stripComment, splitTopLevel, collectWires, awgRadius };')({}, {});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? '  ' + detail : '')); process.exitCode = 1; }
}
const near = (a, b, eps = 1e-9) => typeof a === 'number' && isFinite(a) && Math.abs(a - b) <= eps;
const ev = (e, s) => api.evalExpr(e, s || {});
const wOf = (nec, sym) => api.collectWires(nec.split('\n'), sym || {}, []);

// === 1. 运算符/函数/常量 ===
check('^ 幂: 3^2=9', ev('3^2') === 9, String(ev('3^2')));
check('^ 一元负号 BASIC 语义: -2^2=-4', ev('-2^2') === -4, String(ev('-2^2')));
check('^ 括号底数: (1+2)^2=9', ev('(1+2)^2') === 9, String(ev('(1+2)^2')));
check('^ 左结合: 2^3^2=64', ev('2^3^2') === 64, String(ev('2^3^2')));
check('^ 符号底数: D*10^5', near(ev('D*10^5', { D: 2 }), 200000, 1e-6), String(ev('D*10^5', { D: 2 })));
check('^ 科学计数法指数: 2^3.5E-3', near(ev('2^3.5E-3'), Math.pow(2, 0.0035), 1e-12), String(ev('2^3.5E-3')));
check('^ 底数科学计数法: 1E-3^2 = 1e-6', near(ev('1E-3^2'), 1e-6, 1e-18), String(ev('1E-3^2')));
check('^ 护栏耗尽 → NaN (绝不留异或静默错值)', !isFinite(ev('2' + '^2'.repeat(60))), String(ev('2' + '^2'.repeat(60))));
check('SQR: sqr(9)=3', ev('SQR(9)') === 3, String(ev('SQR(9)')));
check('ATN 角度制: ATN(1)=45', near(ev('ATN(1)'), 45, 1e-9), String(ev('ATN(1)')));
check('INT 下取整: INT(3.7)=3 / INT(-3.2)=-4', ev('INT(3.7)') === 3 && ev('INT(-3.2)') === -4, String(ev('INT(-3.2)')));
check('FIX 截断: FIX(-3.7)=-3', ev('FIX(-3.7)') === -3, String(ev('FIX(-3.7)')));
check('SGN: SGN(-2)=-1', ev('SGN(-2)') === -1);
check('LOG10(100)=2 / LOG(1)=0', ev('LOG10(100)') === 2 && ev('LOG(1)') === 0, String(ev('LOG10(100)')));
check('MOD(7,3)=1', ev('MOD(7,3)') === 1, String(ev('MOD(7,3)')));
check('PI 常量', near(ev('PI'), Math.PI, 1e-12));
check('ASIN 角度制: ASIN(1)=90', near(ev('ASIN(1)'), 90, 1e-9), String(ev('ASIN(1)')));
check('SIN 角度制: SIN(30)=0.5', near(ev('SIN(30)'), 0.5, 1e-12), String(ev('SIN(30)')));
check('PITCH 不再被 PI 破坏 → NaN', !isFinite(ev('PITCH')), String(ev('PITCH')));
check('ASIN 不再被 SIN 误替换 (ASIN(0.5)=30)', near(ev('ASIN(0.5)'), 30, 1e-9), String(ev('ASIN(0.5)')));

// === 2. 单位字 ===
check('27.5ft = 8.382', near(ev('27.5ft'), 8.382, 1e-12), String(ev('27.5ft')));
check('42*ft = 12.8016', near(ev('42*ft'), 12.8016, 1e-12), String(ev('42*ft')));
check('135cm = 1.35', near(ev('135cm'), 1.35, 1e-12));
check('56ft/in = 672', near(ev('56ft/in'), 672, 1e-9), String(ev('56ft/in')));
check('裸单位 MM = 0.001', near(ev('MM'), 0.001, 1e-15));
check('1.2MM = 0.0012', near(ev('1.2MM'), 0.0012, 1e-15));
check('10M = 10', near(ev('10M'), 10, 1e-15));
check('37.8UH = 3.78e-5 / 470PF = 4.7e-10', near(ev('37.8UH'), 3.78e-5, 1e-18) && near(ev('470PF'), 4.7e-10, 1e-22));
check('符号优先于同名单位: SY M=2 → M*3=6', ev('M*3', { M: 2 }) === 6, String(ev('M*3', { M: 2 })));
check('MIN 不被当单位: NaN', !isFinite(ev('MIN')), String(ev('MIN')));

// === 3. AWG ===
check('#12 ≈ 0.001026 m', near(ev('#12'), 0.0010259, 5e-7), String(ev('#12')));
check('#18/ft ≈ awgRadius(18)/0.3048 (以 ft 计)', near(ev('#18/ft'), api.awgRadius(18) / 0.3048, 1e-12), String(ev('#18/ft')));
check('#18 ≈ 0.000512 m (手册 1.024mm/2)', near(ev('#18'), 0.000512, 5e-7), String(ev('#18')));
check('#0000 ≈ 0.005842 m', near(ev('#0000'), 0.011684 / 2, 1e-9), String(ev('#0000')));
check('非法 #12X → NaN', !isFinite(ev('#12X')), String(ev('#12X')));

// === 4. 前导零 / 八进制 ===
check('+00.27685 = 0.27685', near(ev('+00.27685'), 0.27685, 1e-12), String(ev('+00.27685')));
check('05.33467 = 5.33467', near(ev('05.33467'), 5.33467, 1e-12), String(ev('05.33467')));
check('0021 = 21 (非八进制 17)', ev('0021') === 21, String(ev('0021')));
check('0.5/1.05/100 不受影响', ev('0.5') === 0.5 && ev('1.05') === 1.05 && ev('100') === 100);

// === 5. 隐式乘法 (符号感知) ===
check('0.5D1 = 0.006 (D1=0.012)', near(ev('0.5D1', { D1: 0.012 }), 0.006, 1e-15), String(ev('0.5D1', { D1: 0.012 })));
check('2 D1 (空格) = 0.024', near(ev('2 D1', { D1: 0.012 }), 0.024, 1e-15), String(ev('2 D1', { D1: 0.012 })));
check('未定义 D1: 0.5D1 → NaN (不误插乘)', !isFinite(ev('0.5D1')), String(ev('0.5D1')));
check('3.5E-3 指数不被破坏', ev('3.5E-3') === 0.0035, String(ev('3.5E-3')));
check('R01LENGTH 不误插乘 (LENGTH 已定义)', !isFinite(ev('R01LENGTH', { LENGTH: 5 })), String(ev('R01LENGTH', { LENGTH: 5 })));
check('E 符号不破坏指数: 3.5E-3', ev('3.5E-3', { E: 7 }) === 0.0035, String(ev('3.5E-3', { E: 7 })));
check('多字符符号后接带符号数: 2D1-3 = 7', ev('2D1-3', { D1: 5 }) === 7, String(ev('2D1-3', { D1: 5 })));
check('单字母 D 后接带符号数按指数保护 (不插乘 → NaN)', !isFinite(ev('3.5D-3', { D: 7 })), String(ev('3.5D-3', { D: 7 })));

// === 6. 失败语义 / 护栏 ===
check('未定义符号 → NaN (不再静默 0)', !isFinite(ev('XYZ')));
check('1/0 (Infinity) → NaN', !isFinite(ev('1/0')));
check('语法错 → NaN', !isFinite(ev('1+*2')));
check('自引用护栏: DE=DE*DE 有界返回 NaN', !isFinite(ev('DE*DE', { DE: 'DE*DE' })));
check('空串 → NaN', !isFinite(ev('')));

// === 7. SY 层 ===
check('一卡多声明: SY a=1, b=a*2', (() => { const w = wOf('SY a=1, b=a*2\nGW 1 1 0 0 0 b 0 0 0.001'); return w.length === 1 && w[0].x2 === 2; })(), '');
check('卡内顺序赋值: SY DE=1, DE=DE*8 → 8', (() => { const w = wOf('SY DE=1, DE=DE*8\nGW 1 1 0 0 0 DE 0 0 0.001'); return w[0].x2 === 8; })(), '');
check('跨卡重定义: X=2 → X=X*3 → 6', (() => { const w = wOf('SY X=2\nSY X=X*3\nGW 1 1 0 0 0 X 0 0 0.001'); return w[0].x2 === 6; })(), '');
check('交错重定义 (位置相关): 两 GW 几何不同', (() => {
  const w = wOf('SY ang=0\nGW 1 1 0 0 0 1*cos(ang) 0 0 0.001\nSY ang=90\nGW 2 1 0 0 0 1*cos(ang) 0 0 0.001');
  return w.length === 2 && Math.abs(w[0].x2 - 1) < 1e-12 && Math.abs(w[1].x2) < 1e-12;
})(), '');
check('SY 失败 → n2m.expr.evalFailed 告警 + NaN', (() => {
  const notes = [];
  api.collectWires('SY A=B*2\nGW 1 1 0 0 0 A 0 0 0.001'.split('\n'), {}, notes);
  return notes.some(n => n.key === 'n2m.expr.evalFailed' && n.params.where === 'SY A');
})(), '');
check('SY Inp=mm + 3*Inp → 0.003', (() => { const w = wOf('SY Inp=mm\nGW 1 1 0 0 0 3*Inp 0 0 0.001'); return near(w[0].x2, 0.003, 1e-15); })(), '');
check('GS 使用当时符号: SY S=0.001 + GW + GS 0 0 S', (() => {
  const w = wOf('SY S=0.001\nGW 1 1 0 0 0 449 0 0 0.001\nGS 0 0 S');
  return near(w[0].x2, 0.449, 1e-12);
})(), '');

// === 8. 工具函数 ===
check('stripComment: 撇号/弯引号', api.stripComment("GW 1 1 'c").trim() === 'GW 1 1' && api.stripComment('GW 1 1 \u2018c').trim() === 'GW 1 1');
check('splitTopLevel: MOD(a,b) 逗号不切', JSON.stringify(api.splitTopLevel('a=MOD(1,2), b=3', ',').map(s => s.trim())) === JSON.stringify(['a=MOD(1,2)', 'b=3']));

// === 9. 真实文件定点 (F:\Antenna_Models) ===
const R = 'F:\\Antenna_Models\\AntennaFiles-OLD-master_天线模型收藏\\AntennaFiles-OLD-master\\4nec2_models\\';
const loop = R + 'HFsimple\\LoopCirc20.nec';
if (fs.existsSync(loop)) {
  const w = api.collectWires(fs.readFileSync(loop, 'utf8').split('\n'), {}, []);
  const uniq = new Set(w.map(x => [x.x1, x.y1, x.z1, x.x2, x.y2, x.z2].map(v => v.toFixed(6)).join(',')));
  check('LoopCirc20: 12 根 + 唯一几何 > 1 (交错 SY 生效)', w.length === 12 && uniq.size > 1, `n=${w.length} uniq=${uniq.size}`);
} else check('LoopCirc20 文件存在', false, loop);

const eq = R + 'Equations\\4elQuad.nec';
if (fs.existsSync(eq)) {
  const w = api.collectWires(fs.readFileSync(eq, 'utf8').split('\n'), {}, []);
  check('4elQuad (Equations): 16 根 + 半径>0 + 无 NaN', w.length === 16 && w.every(x => x.rad > 0 && isFinite(x.x1) && isFinite(x.z2)), `n=${w.length} rad=${w[0] && w[0].rad}`);
} else check('4elQuad 文件存在', false, eq);

const v3 = R + 'HFActiveFeed\\3vertical.nec';
if (fs.existsSync(v3)) {
  const w = api.collectWires(fs.readFileSync(v3, 'utf8').split('\n'), {}, []);
  check('3vertical: 3 根 + GS ft 缩放 (x1=-20.8191)', w.length === 3 && near(w[0].x1, -20.8191, 1e-4) && near(w[0].z2, 23.0124, 1e-4), JSON.stringify(w[0]));
} else check('3vertical 文件存在', false, v3);

console.log(`\n${pass} PASS / ${fail} FAIL`);
