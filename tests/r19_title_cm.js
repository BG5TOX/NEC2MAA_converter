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

// === R19-1: VDP40B (ASCII 标题 "VDP 40m with Bottom LOAD") ===
{
  const { parsed, nec } = convert('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA');
  const lines = nec.split('\n');
  const cmIdx = lines.findIndex(l => l.startsWith('CM '));
  check('VDP40B: 首条 CM = .maa 原标题', lines[cmIdx] === 'CM VDP 40m with Bottom LOAD', lines[cmIdx]);
  check('VDP40B: 次条 CM = Converted from', lines[cmIdx + 1] === 'CM Converted from VDP40B.MAA by NEC2MAA v0.5.', lines[cmIdx + 1]);
  check('VDP40B: CM 卡在 CE 前', lines.indexOf('CE') > cmIdx + 1, '');
  check('VDP40B: 标题未在 Converted 行重复', !lines[cmIdx + 1].includes('VDP 40m'), lines[cmIdx + 1]);
  check('VDP40B: 全文 ASCII', /^[\x20-\x7E\n]*$/.test(nec), '');
}

// === R19-2: 无标题文件 (标题行为空) ===
{
  const maaNoTitle = ['7.05', '1', '0, 0, 0, 2, 2', 'w1c, 0, 1', '***', '0, 0, 0'].join('\n');
  const parsed = api.parseMaa(maaNoTitle, 'noTitle.maa');
  const nec = api.writeMaaToNec(parsed, 'noTitle.maa');
  const lines = nec.split('\n');
  const cmIdx = lines.findIndex(l => l.startsWith('CM '));
  check('无标题: 首条 CM = Converted from', lines[cmIdx] === 'CM Converted from noTitle.maa by NEC2MAA v0.5.', lines[cmIdx]);
  check('无标题: 无空标题 CM 卡', !lines.some(l => l === 'CM ' || l === 'CM'), '');
}

// === R19-3: 非英文标题 (Apiram 俄文) ===
{
  const { parsed, nec } = convert('C:\\MMANA-GALBasic3\\ANT\\Aperiodic\\Apiram.maa');
  const lines = nec.split('\n');
  const cmIdx = lines.findIndex(l => l.startsWith('CM '));
  check('非英文标题: 首条 CM = Converted from (无标题卡)', lines[cmIdx].startsWith('CM Converted from'), lines[cmIdx]);
  check('非英文标题: 标题未泄漏到 CM', !lines.some(l => l.includes('МГц')), '');
  check('非英文标题: droppedNonAscii.title', parsed.droppedNonAscii.title === true, '');
  check('非英文标题: Dropped 卡在', lines.some(l => l.startsWith('CM Dropped non-ASCII content: title')), '');
  check('非英文标题: ASCII 终检通过', /^[\x20-\x7E\n]*$/.test(nec), '');
}

// === R19-4: 标题含控制字符 → 非法文本, 阻断 (与英文门禁一致) ===
{
  const maaCtl = ['Antenna\x09Title\x0B\x08', '7.05', '1', '0, 0, 0, 2, 2', 'w1c, 0, 1', '***', '0, 0, 0'].join('\n');
  const parsed = api.parseMaa(maaCtl, 'ctl.maa');
  const nec = api.writeMaaToNec(parsed, 'ctl.maa');
  const lines = nec.split('\n');
  const first = lines[0];
  check('控制字符标题: 阻断, 首条 CM = Converted from', first === 'CM Converted from ctl.maa by NEC2MAA v0.5.', JSON.stringify(first));
  check('控制字符标题: titleAscii=false', parsed.titleAscii === false, '');
  check('控制字符标题: droppedNonAscii.title=true', parsed.droppedNonAscii.title === true, '');
  check('控制字符标题: ASCII 通过', /^[\x20-\x7E\n]*$/.test(nec), '');
}

// === R19-5: cmTitleOverride (用户自定义标题模式) — 无重复打印 ===
{
  const { parsed } = convert('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA');
  parsed.cmTitleOverride = 'My custom title';
  const nec2 = api.writeMaaToNec(parsed, 'VDP40B.MAA');
  const lines2 = nec2.split('\n');
  const cmIdx = lines2.findIndex(l => l.startsWith('CM '));
  check('Override: 首条 CM = 原标题', lines2[cmIdx] === 'CM VDP 40m with Bottom LOAD', lines2[cmIdx]);
  check('Override: 次条带自定义后缀', lines2[cmIdx + 1] === 'CM Converted from VDP40B.MAA by NEC2MAA v0.5. My custom title', lines2[cmIdx + 1]);
  check('Override: 标题只出现一次', lines2.filter(l => l.includes('VDP 40m with Bottom LOAD')).length === 1, '');
}

// === R19-6: 回归 — r2 原有断言不破 (关键几项) ===
{
  const { parsed, nec } = convert('C:\\MMANA-GALBasic3\\ANT\\Short\\L\\VDP40B.MAA');
  const lines = nec.split('\n');
  check('回归: LD 1 表达式不变', lines.find(l => l.startsWith('LD ')) === 'LD 1, 1, 50%, 50%, 2*PI*f*L1*1E-6/Q1, L1*1E-6, C1*1E-12', '');
  check('回归: SY 一卡一参', lines.filter(l => l.startsWith('SY ')).every(l => (l.match(/=/g) || []).length === 1), '');
  check('回归: 卡序 CM→SY→GW→GE', nec.indexOf('CM ') < nec.indexOf('SY ') && nec.indexOf('SY ') < nec.indexOf('GW ') && nec.indexOf('GW ') < nec.indexOf('GE'), '');
}

// === R19-7: 全库 722 冒烟 (R19 后) ===
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
  let okNec = 0, failNec = 0, asciiViolations = 0, titleFirstOk = 0, titleFiles = 0;
  const fails = [];
  for (const f of files) {
    try {
      const text = fs.readFileSync(f, 'latin1');
      const parsed = api.parseMaa(text, path.basename(f));
      const nec = api.writeMaaToNec(parsed, path.basename(f));
      if (!/^[\x20-\x7E\n]*$/.test(nec)) { asciiViolations++; if (fails.length < 5) fails.push('ASCII: ' + path.basename(f)); }
      const lines = nec.split('\n');
      const firstCm = lines.find(l => l.startsWith('CM '));
      if (parsed.title && parsed.titleAscii) {
        titleFiles++;
        const expected = 'CM ' + parsed.title.replace(/[\x00-\x1F]/g, '').trim();
        if (firstCm === expected) titleFirstOk++;
        else if (fails.length < 5) fails.push('TITLE-FIRST: ' + path.basename(f) + ' got=' + JSON.stringify(firstCm) + ' want=' + JSON.stringify(expected));
      }
      okNec++;
    } catch (e) { failNec++; if (fails.length < 5) fails.push(path.basename(f) + ' — ' + e.message); }
  }
  check('全库 722 转换成功', okNec === files.length && failNec === 0, `ok=${okNec} fail=${failNec}`);
  check('全库 ASCII 0 违例', asciiViolations === 0, String(asciiViolations));
  check('全库有 ASCII 标题文件: 首条 CM = 原标题', titleFirstOk === titleFiles, `${titleFirstOk}/${titleFiles}`);
  if (fails.length) fails.forEach(x => console.log('  失败样本:', x));
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
