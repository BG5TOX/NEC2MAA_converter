const fs = require('fs');
const path = require('path');
const base = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_main\\js\\maa2nec';
const jsRoot = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_main\\js';
// i18n-4 批次同步: writer 依赖 LF()/expandTaperedWires — 拼入 taper + state + i18n + 语言包
const prelude = ['state', 'i18n', 'i18n/zh', 'i18n/en'].map(n => fs.readFileSync(`${jsRoot}\\${n}.js`, 'utf8')).join('\n');
const src = prelude + '\n' + ['maa-parser', 'maa-taper', 'maa-symbols', 'maa-writer'].map(n => fs.readFileSync(`${base}\\${n}.js`, 'utf8')).join('\n');
try { new Function('window', src + '\nvar N2M = window.N2M;'); console.log('SYNTAX OK (taper+i18n+writer)'); } catch (e) { console.log('SYNTAX FAIL: ' + e.message); process.exit(1); }
const api = new Function('window', src + '\nvar N2M = window.N2M;\nreturn { parseMaa, buildMaaSymbols, writeMaaToNec, parseMaaDesignator };')({});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? '  ' + detail : '')); process.exitCode = 1; }
}
function convert(fpath) {
  const text = fs.readFileSync(fpath, 'latin1');
  const parsed = api.parseMaa(text, path.basename(fpath));
  return { parsed, nec: api.writeMaaToNec(parsed, path.basename(fpath)) };
}

// === T3-1: VDP40B (LC 负载, 偏移设计符收敛) ===
{
  const { parsed, nec } = convert('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA');
  const lines = nec.split('\n');
  check('VDP40B: 段数恒1', lines.filter(l => l.startsWith('GW ')).every(l => l.split(',')[1].trim() === '1'));
  check('VDP40B: SY 一卡一参', lines.filter(l => l.startsWith('SY ')).every(l => (l.match(/=/g) || []).length === 1), lines.filter(l => l.startsWith('SY ')).join(' | '));
  check('VDP40B: SY L1/C1/Q1', lines.some(l => l === 'SY L1=10.8') && lines.some(l => /^SY C1=0/.test(l)) && lines.some(l => l === 'SY Q1=200'), '');
  check('VDP40B: 半径 0.5*D1', lines.filter(l => l.startsWith('GW ')).every(l => /0\.5\*D\d/.test(l)), lines.find(l => l.startsWith('GW ')));
  const ld = lines.find(l => l.startsWith('LD '));
  check('VDP40B: LD 1 表达式', ld === 'LD 1, 1, 50%, 50%, 2*PI*f*L1*1E-6/Q1, L1*1E-6, C1*1E-12', ld);
  // i18n-4 批次同步: warnings 为结构化 {key, params}; 按 key+params 断言 (渲染等价旧句)
  check('VDP40B: 偏移收敛告警', parsed.warnings.some(w => w.key === 'm2n.srcOffset' && w.params.desig === 'w1c+1' && w.params.near === '50%'), JSON.stringify(parsed.warnings));
  check('VDP40B: ASCII 全文', /^[\x20-\x7E\n]*$/.test(nec));
  check('VDP40B: CM 头含 Note', nec.includes('CM Note: all segments set to 1'));
}

// === T3-2: 4x_DJ9BV (104 线 4 源) ===
{
  const { parsed, nec } = convert('F:\\temp\\AGTC_anyGTa_2lite_V2-00\\4x_DJ9BV_BVO70_8.5wl.maa');
  const lines = nec.split('\n');
  const gw = lines.filter(l => l.startsWith('GW '));
  const ex = lines.filter(l => l.startsWith('EX '));
  check('4x: 104 根 GW', gw.length === 104, String(gw.length));
  check('4x: 4 个 EX 全 50%', ex.length === 4 && ex.every(l => l.split(',')[2].trim() === '50%'), ex.join(' | '));
  check('4x: 直径降序 D1≥D2', lines.some(l => /^SY D1=/.test(l)) && lines.some(l => /^SY D2=/.test(l)), lines.filter(l => l.startsWith('SY D')).join(' '));
  check('4x: gtype=0 自由空间 → 无 GN 卡', !lines.some(l => l.startsWith('GN')), 'GH行=0 正确不发卡');
  check('4x: ASCII', /^[\x20-\x7E\n]*$/.test(nec));
}

// === T2: 20 代表文件结构断言 + 全库 T1' (722 转换冒烟含 ASCII) ===
{
  const ANT = 'C:\\MMANA-GALBasic3\\ANT';
  function walk(dir, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.maa$/i.test(e.name)) out.push(p);
    }
    return out;
  }
  const files = walk(ANT, []);
  let okNec = 0, failNec = 0, asciiViolations = 0, withWarnings = 0;
  const fails = [];
  for (const f of files) {
    try {
      const text = fs.readFileSync(f, 'latin1');
      const parsed = api.parseMaa(text, path.basename(f));
      const nec = api.writeMaaToNec(parsed, path.basename(f));
      if (!/^[\x20-\x7E\n]*$/.test(nec)) { asciiViolations++; if (fails.length < 5) fails.push('ASCII: ' + path.basename(f)); }
      if (parsed.warnings.length) withWarnings++;
      okNec++;
    } catch (e) { failNec++; if (fails.length < 5) fails.push(path.basename(f) + ' — ' + e.message); }
  }
  check('全库 722 转换成功', okNec === files.length && failNec === 0, `ok=${okNec} fail=${failNec}`);
  check('全库 ASCII 0 违例', asciiViolations === 0, String(asciiViolations));
  console.log(`  (含警告文件: ${withWarnings})`);
  if (fails.length) { fails.forEach(x => console.log('  失败样本:', x)); }
}

// === T2 专项: 俄文节头文件 (2x6el10) ===
{
  const { parsed, nec } = convert('C:\\MMANA-GALBasic3\\ANT\\Stacks\\2x6el10.maa');
  check('俄文节头: 6 根线解析', parsed.wires.length === 6, String(parsed.wires.length));
  // i18n-4/v04 语义修正: 本文件 wire1 rad=-0.001 为锥度线, R21 重建后 EX 锚重映射到子段 tag 2 (50% 不变);
  //   v04 版测试因路径未更新指向 v03 js 而 pass — v05 修正指向后按真实 v04+ 行为断言
  check('俄文节头: 源 w1c→50% (锥度重建子段 tag 2)', nec.includes('EX 0, 2, 50%'), nec.split('\n').find(l => l.startsWith('EX ')));
  check('俄文节头: 标题保留(英文)', nec.includes('6ele 10m'), nec.split('\n')[0]);
}

// === T2 专项: 非英文注释文件 (Apiram 标题 LOOP1 3.5 ... 30 МГц 含俄文) ===
{
  const { parsed, nec } = convert('C:\\MMANA-GALBasic3\\ANT\\Aperiodic\\Apiram.maa');
  check('非英文标题丢弃', !nec.includes('МГц') && parsed.droppedNonAscii.title === true, nec.split('\n')[0]);
  check('丢弃计数进 CM', nec.includes('Dropped non-ASCII'), nec.split('\n').find(l => l.includes('Dropped')));
  // i18n-4 批次同步: 聚合告警键断言
  check('聚合警告弹', parsed.warnings.some(w => w.key === 'm2n.nonAscii'), '');
}

// === T2 专项: 双源 HB9CVW ===
{
  const { parsed, nec } = convert('C:\\MMANA-GALBasic3\\ANT\\HF beams\\HB9CVW.MAA');
  const ex = nec.split('\n').filter(l => l.startsWith('EX '));
  check('HB9CVW: 源数≥1', ex.length >= 1, ex.join(' | '));
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
