const fs = require('fs');
const path = require('path');
const parserSrc = fs.readFileSync('F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_v03\\js\\maa2nec\\maa-parser.js', 'utf8');
try { new Function(parserSrc); console.log('SYNTAX OK'); } catch (e) { console.log('SYNTAX FAIL: ' + e.message); process.exit(1); }
const api = new Function(parserSrc + '\nreturn { parseMaa, parseMaaDesignator, isAsciiText, MAA_LAMBDA_SENTINEL };')();

const ANT = 'C:\\MMANA-GALBasic3\\ANT';
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.maa$/i.test(e.name) || /\.mma$/i.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk(ANT, []);
console.log('文件总数:', files.length);

let okCount = 0, failCount = 0;
const stats = { variantA: 0, variantB: 0, zeroWires: 0, withSrc: 0, withLoad: 0, lcLoads: 0, rjxLoads: 0,
                sparamLoads: 0, otherLoads: 0, srcDesig: 0, srcNumA: 0, segParams: 0, ground: 0,
                comments: 0, droppedFiles: 0, lambdaFiles: 0, countMismatch: 0, srcTotal: 0 };
const failures = [];
for (const f of files) {
  try {
    const text = fs.readFileSync(f, 'latin1');
    const r = api.parseMaa(text, path.basename(f));
    if (r.wires.length > 0) okCount++; else { failCount++; stats.zeroWires++; if (failures.length < 8) failures.push(`零导线: ${path.basename(f)}`); continue; }
    if (r.variant === 'A') stats.variantA++; else stats.variantB++;
    if (r.wires.length !== r.wireCount) { stats.countMismatch++; if (failures.length < 8) failures.push(`计数不符: ${path.basename(f)} ${r.wires.length}/${r.wireCount}`); }
    if (r.sources.length) { stats.withSrc++; stats.srcTotal += r.sources.length; for (const s of r.sources) s.type === 'desig' ? stats.srcDesig++ : stats.srcNumA++; }
    if (r.loads.length) { stats.withLoad++; for (const l of r.loads) { if (l.type === 'lc') stats.lcLoads++; else if (l.type === 'rjx') stats.rjxLoads++; else if (l.type === 'sparam') stats.sparamLoads++; else stats.otherLoads++; } }
    if (r.segParams) stats.segParams++;
    if (r.ground) stats.ground++;
    if (r.comments.length) stats.comments++;
    if (r.droppedNonAscii.title || r.droppedNonAscii.commentLines > 0) stats.droppedFiles++;
    if (r.lambdaMode) stats.lambdaFiles++;
    okCount++;
  } catch (e) { failCount++; if (failures.length < 8) failures.push(`异常: ${path.basename(f)} — ${e.message}`); }
}

console.log('解析成功(有导线):', okCount - 0, ' 失败:', failCount);
console.log('统计:', JSON.stringify(stats, null, 1));
if (failures.length) { console.log('失败样本:'); failures.forEach(x => console.log(' ', x)); }

// 对拍普查基准 (R0): B394/A328, src 735行(全desig), load lc542+rjx163+s8, seg -1×98.9%
console.log('\n--- 对拍 R0 普查 ---');
console.log(`变体: A=${stats.variantA} (基准 328) / B=${stats.variantB} (基准 394)`);
console.log(`Source: desig=${stats.srcDesig} (基准 735) / numA=${stats.srcNumA} (基准 0, 官方库)`);
console.log(`Load: lc=${stats.lcLoads} (基准 542) / rjx=${stats.rjxLoads} (基准 163) / sparam=${stats.sparamLoads} (基准 8) / other=${stats.otherLoads}`);
console.log(`丢弃警告文件: ${stats.droppedFiles} (预估 ~387) | λ模式: ${stats.lambdaFiles} (预估 ~12 文件)`);
