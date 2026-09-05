const fs = require('fs');
const path = require('path');
const base = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_main\\js\\maa2nec';
const jsRoot = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_main\\js';
// i18n-4 批次同步: writer 依赖 LF() — 拼入 state + i18n + 语言包
const prelude = ['state', 'i18n', 'i18n/zh', 'i18n/en'].map(n => fs.readFileSync(`${jsRoot}\\${n}.js`, 'utf8')).join('\n');
const src = prelude + '\n' + ['maa-parser', 'maa-taper', 'maa-symbols', 'maa-writer'].map(n => fs.readFileSync(`${base}\\${n}.js`, 'utf8')).join('\n');
try { new Function('window', src + '\nvar N2M = window.N2M;'); console.log('SYNTAX OK (i18n+四文件)'); } catch (e) { console.log('SYNTAX FAIL: ' + e.message); process.exit(1); }
const api = new Function('window', src + '\nvar N2M = window.N2M;\nreturn { parseMaa, writeMaaToNec };')({});

let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('PASS ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? '  ' + d : '')); process.exitCode = 1; } }
function conv(text, name) {
  const p = api.parseMaa(text, name);
  try { return { p, nec: api.writeMaaToNec(p, name), err: null }; }
  catch (e) { return { p, nec: null, err: e }; }
}
const GOOD = 'T\n7.05\n1\n0,0,0, 1,0,0, 0.001, -1\n***Source***\n1\nw1c, 0.0, 1.0\n';

// ===== S3: CM 单行净化 =====
{
  // override 含 \n 伪造 GW 卡
  const p = api.parseMaa(GOOD, 'e.maa');
  p.cmTitleOverride = 'A\nGW 1 999 0 0 0 1 1 1 0.01';
  const nec = api.writeMaaToNec(p, 'e.maa');
  const cmLine = nec.split('\n').find(l => l.startsWith('CM Converted from'));
  check('S3: override \\n 折叠为空格 (单行)', cmLine === 'CM Converted from e.maa by NEC2MAA v0.5. A GW 1 999 0 0 0 1 1 1 0.01', JSON.stringify(cmLine));
  check('S3: 无伪造独立 GW 卡行', !nec.split('\n').some(l => l === 'GW 1 999 0 0 0 1 1 1 0.01'), '');
  check('S3: CM 总行数不含注入行', nec.split('\n').filter(l => l.startsWith('GW ')).length === 1, '');
  // 文件名含 \n
  const p2 = api.parseMaa(GOOD, 'x\nGW 5.maa');
  const nec2 = api.writeMaaToNec(p2, 'x\nGW 5.maa');
  check('S3: 文件名 \\n 净化', nec2.split('\n').find(l => l.startsWith('CM Converted from')) === 'CM Converted from x GW 5.maa by NEC2MAA v0.5.', JSON.stringify(nec2.split('\n').find(l => l.startsWith('CM Converted'))));
}

// ===== R2: 标题卡 70 截断 =====
{
  const title = 'A'.repeat(5000);
  const p = api.parseMaa(title + '\n7.05\n1\n0,0,0, 1,0,0, 0.001, -1\n', 'e.maa');
  const nec = api.writeMaaToNec(p, 'e.maa');
  const first = nec.split('\n')[0];
  check('R2: 5000 字符标题截断为 70', first === 'CM ' + 'A'.repeat(69) + '~', `len=${first.length}`);
  // 短标题不截断
  const p2 = api.parseMaa('Short Title\n7.05\n1\n0,0,0, 1,0,0, 0.001, -1\n', 'e.maa');
  check('R2: 短标题原样', api.writeMaaToNec(p2, 'e.maa').split('\n')[0] === 'CM Short Title', '');
  // 恰 70 不截断
  const t70 = 'B'.repeat(70);
  const p3 = api.parseMaa(t70 + '\n7.05\n1\n0,0,0, 1,0,0, 0.001, -1\n', 'e.maa');
  check('R2: 恰 70 不截断', api.writeMaaToNec(p3, 'e.maa').split('\n')[0] === 'CM ' + t70, '');
}

// ===== R1: 有限值门禁 (i18n-4 批次同步: warnings 结构化 {key,params}; throw 消息 LF 恒英文) =====
{
  // z 坐标 NaN
  const r1 = conv('T\n7\n1\n0,0,NaN, 1,0,NaN, 0.001, -1\n', 'e.maa');
  check('R1: z=NaN 拦截 (异常+告警)', r1.err !== null && r1.err.message.includes('non-finite') && r1.p.warnings.some(w => w.key === 'm2n.r1Block'), r1.err ? r1.err.message.slice(0, 60) : 'no-err');
  check('R1: z=NaN 不产出', r1.nec === null, '');
  // 频率 Infinity
  const r2 = conv('T\n1E999\n1\n0,0,0, 1,0,0, 0.001, -1\n', 'e.maa');
  check('R1: 频率 1E999 拦截', r2.err !== null && r2.err.message.includes('frequency'), r2.err ? r2.err.message.slice(0, 50) : 'no-err');
  // 半径下溢: 告警不拦截 (JS parseFloat('1E-999') 下溢为 0 → rad=0 告警)
  const r3 = conv('T\n7\n1\n0,0,0, 1,0,0, 1E-999, -1\n', 'e.maa');
  check('R1: 半径下溢(→0) 告警不拦截 (仍产出)', r3.err === null && r3.p.warnings.some(w => w.key === 'm2n.wireRadZero'), JSON.stringify(r3.p.warnings.find(w => w.key === 'm2n.wireRadZero') || 'NONE').slice(0, 90));
  // 锥度子段 R=NaN: parser 对级校验拒收 (isFinite), 定义丢弃 → 线 fallback 1mm+告警 — 无 NaN 抵达 writer
  const evil = 'T\n7\n1\n0,0,0, 1,0,0, -0.001, -1\n$$$ X $$$\n1\n-0.001, 2, 0.5, NaN, 99999.9, 0.005\n';
  const r4 = conv(evil, 'e.maa');
  check('R1: 锥度 R=NaN 在 parser 拒收 (对级告警+定义丢弃)', r4.err === null && r4.p.warnings.some(w => w.key === 'n2m.taper.badPair' || w.key === 'n2m.taper.undefinedName'), JSON.stringify(r4.p.warnings.find(w => w.key && w.key.indexOf('taper') >= 0) || 'NONE').slice(0, 90));
  // 锥度 L=Infinity (静默吞锥度 → 现须有告警或拦截; 实际弧为 [0,1] 有限 → 检查 def 有效值域)
  const evil2 = 'T\n7\n1\n0,0,0, 1,0,0, -0.001, -1\n$$$ X $$$\n1\n-0.001, 2, 1E999, 0.01, 99999.9, 0.005\n';
  const r5 = conv(evil2, 'e.maa');
  check('R1: 锥度 L=1E999 处理有感知 (告警或拦截)', r5.err !== null || r5.p.warnings.some(w => /taper|r1Block/.test(w.key || '')), r5.err ? '拦截: ' + r5.err.message.slice(0, 40) : JSON.stringify(r5.p.warnings.find(w => (w.key || '').indexOf('taper') >= 0) || '无锥度告警').slice(0, 80));
  // 正常文件不受影响
  const r6 = conv(GOOD, 'e.maa');
  check('R1: 正常文件零告警零拦截', r6.err === null && !r6.p.warnings.some(w => w.key === 'm2n.r1Block'), '');
}

// ===== S4: $$$ 计数悬空告警 (i18n-4: 键断言) =====
{
  // EOF 悬空: declared=5 无定义行
  const p1 = api.parseMaa('T\n7\n1\n0,0,0, 1,0,0, 0.001, -1\n$$$ X $$$\n5\n', 'e.maa');
  check('S4: EOF 悬空 (声明5/实际0) 告警', p1.warnings.some(w => w.key === 'm2n.taper.shortEof' && w.params.declared === 5 && w.params.parsed === 0), JSON.stringify(p1.warnings.find(w => w.key === 'm2n.taper.shortEof') || 'NONE').slice(0, 80));
  // 节头中断: declared=3 读 1 行后遇 ###Comment###
  const p2 = api.parseMaa('T\n7\n1\n0,0,0, 1,0,0, 0.001, -1\n$$$ X $$$\n3\n-0.001, 2, 2.0, 0.015, 99999.9, 0.006\n###Comment###\nZzz\n', 'e.maa');
  check('S4: 节头中断 (声明3/实际1) 告警', p2.warnings.some(w => w.key === 'm2n.taper.shortComment' && w.params.declared === 3 && w.params.parsed === 1), JSON.stringify(p2.warnings.find(w => w.key === 'm2n.taper.shortComment') || 'NONE').slice(0, 80));
  check('S4: 节头中断场景已解析的定义保留', p2.taperDefs.parsedCount === 1, String(p2.taperDefs.parsedCount));
  // 正常 $$$ 区 (jp2000 全 10/10) 不告警
  const jp = fs.readFileSync('F:\\Antenna\\jp2000_147.maa', 'latin1');
  const p3 = api.parseMaa(jp, 'jp2000_147.maa');
  check('S4: jp2000 全量定义 (10/10) 无悬空告警', !p3.warnings.some(w => /shortEof|shortDeclared|shortComment/.test(w.key || '')), (p3.warnings.find(w => /taper/.test(w.key || '')) || 'NONE'));
}

// ===== 回归: 正常链路完好 (VDP40B + jp2000 关键断言) =====
{
  const vdp = fs.readFileSync('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA', 'latin1');
  const pv = api.parseMaa(vdp, 'VDP40B.MAA');
  pv.ground.sigma_mS = 20; pv.groundEpsrManual = 17;
  const nv = api.writeMaaToNec(pv, 'VDP40B.MAA');
  check('回归 VDP40B: LD 表达式不变', nv.includes('LD 1, 1, 50%, 50%, 2*PI*f*L1*1E-6/Q1, L1*1E-6, C1*1E-12'), '');
  check('回归 VDP40B: 首条 CM 原标题', nv.split('\n')[0] === 'CM VDP 40m with Bottom LOAD', nv.split('\n')[0]);
  const jp2 = fs.readFileSync('F:\\Antenna\\jp2000_147.maa', 'latin1');
  const pj = api.parseMaa(jp2, 'jp2000_147.maa');
  const nj = api.writeMaaToNec(pj, 'jp2000_147.maa');
  const gws = nj.split('\n').filter(l => l.startsWith('GW '));
  check('回归 jp2000: 56 GW 不变', gws.length === 56, String(gws.length));
  check('回归 jp2000: EX 26 50% 不变', nj.split('\n').find(l => l.startsWith('EX ')) === 'EX 0, 26, 50%, 1.000000, 0.000000, 0, 0, 0', '');
  check('回归 jp2000: ASCII 终检', /^[\x20-\x7E\n]*$/.test(nj), '');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
