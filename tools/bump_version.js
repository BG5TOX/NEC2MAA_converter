#!/usr/bin/env node
'use strict';
// tools/bump_version.js — 一键升版本号（NEC2MAA_converter 开发期工具；运行时零依赖，不参与 index.html 加载）
//
// 用法:
//   node tools/bump_version.js <新版本> [--dry-run] [--no-baseline] [--no-tests]
//   例: node tools/bump_version.js v0.7
//
// 做什么:
//   1. 从 js/maa2nec/maa-writer.js 的 "by NEC2MAA vX.Y." 自动识别当前版本
//   2. 将**精确的当前版本 token** 替换为新版本（仅代码/测试白名单；历史版本 v0.3~v0.5 与文档正文不受影响）
//   3. 改动前把每个文件备份到 backups/<扁平名>.<oldVer>bump.bak（fs.copyFileSync，二进制安全）
//   4. 归档旧基线 backups/preR21h_723_output_hashes.<oldVer>baseline.json，并用当前代码重生成 723 文件基线
//   5. 运行版本敏感测试 r19 / sf2 / r21 / i18n_lang
//
// 不做（语义内容脚本无法代写，结尾打印清单）:
//   AGENTS.md 顶部声明/规则/状态条目/版本史、README 历史表与页脚、docs/发布归档_<新版本>.md
//
// 约束: 一律 Node fs 显式 utf8（AGENTS 工作规则 5：禁 PowerShell 改文件内容）。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const newVer = args.find((a) => !a.startsWith('--'));
const DRY = flags.has('--dry-run');

function die(msg) { console.error('ERROR: ' + msg); process.exit(1); }
if (!newVer) die('用法: node tools/bump_version.js <新版本> [--dry-run] [--no-baseline] [--no-tests]');
if (!/^v\d+\.\d+$/.test(newVer)) die('版本格式应为 vX.Y（如 v0.7）');

// ---- 1. 识别当前版本（ma-writer CM 行 = 唯一权威 literal）----
const writerRel = 'js/maa2nec/maa-writer.js';
const writerPath = path.join(ROOT, writerRel);
const m = fs.readFileSync(writerPath, 'utf8').match(/by NEC2MAA (v\d+\.\d+)\./);
if (!m) die('无法从 ' + writerRel + ' 识别当前版本（缺少 "by NEC2MAA vX.Y."）');
const oldVer = m[1];
if (oldVer === newVer) die('新版本与当前版本相同: ' + oldVer);
console.log(`版本升级: ${oldVer} -> ${newVer}${DRY ? '   [dry-run]' : ''}`);

// ---- 2. 目标文件（代码 + 测试；不碰文档正文）----
const targets = [
  'index.html',
  'js/i18n/zh.js',
  'js/i18n/en.js',
  writerRel,
  'tests/r19_title_cm.js',
  'tests/sf2_quality_fixes.js',
  'tests/r21_taper_rebuild.js',
];
// 精确 token：v0.6 命中，但不误伤 v0.60 / 历史 v0.5
const token = new RegExp(oldVer.replace(/\./g, '\\.') + '(?![0-9])', 'g');
const backupsDir = path.join(ROOT, 'backups');
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);

let totalHits = 0;
console.log('替换标记:');
for (const rel of targets) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.log('  skip (missing): ' + rel); continue; }
  const src = fs.readFileSync(p, 'utf8');
  const hits = (src.match(token) || []).length;
  totalHits += hits;
  console.log(`  ${rel}: ${hits} 处`);
  if (hits === 0 || DRY) continue;
  const bak = path.join(backupsDir, rel.replace(/[\\/]/g, '_') + '.' + oldVer + 'bump.bak');
  fs.copyFileSync(p, bak);
  fs.writeFileSync(p, src.replace(token, newVer), 'utf8');
}
console.log(`  合计 ${totalHits} 处`);

// ---- 3. 基线重生成 ----
function regenBaseline(outPath) {
  const jsRoot = path.join(ROOT, 'js');
  const prelude = ['state', 'i18n', 'i18n/zh', 'i18n/en']
    .map((n) => fs.readFileSync(path.join(jsRoot, n + '.js'), 'utf8')).join('\n');
  const base = path.join(jsRoot, 'maa2nec');
  const src = prelude + '\n' + ['maa-parser', 'maa-taper', 'maa-symbols', 'maa-writer']
    .map((n) => fs.readFileSync(path.join(base, n + '.js'), 'utf8')).join('\n');
  const api = new Function('window', src + '\nvar N2M = window.N2M;\nreturn { parseMaa, writeMaaToNec };')({});
  function walk(dir, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out); else if (/\.maa$/i.test(e.name)) out.push(p);
    }
    return out;
  }
  const files = walk('C:\\MMANA-GALBasic3\\ANT', []);
  const jp = 'F:\\Antenna\\jp2000_147.maa';
  const snap = {};
  for (const f of files.concat([jp])) {
    const text = fs.readFileSync(f, 'latin1');
    const parsed = api.parseMaa(text, path.basename(f));
    const nec = api.writeMaaToNec(parsed, path.basename(f));
    snap[f] = crypto.createHash('sha256').update(nec).digest('hex');
  }
  fs.writeFileSync(outPath, JSON.stringify(snap), 'utf8');
  return Object.keys(snap).length;
}

if (flags.has('--no-baseline')) {
  console.log('基线: 已跳过 (--no-baseline)');
} else {
  const baselinePath = path.join(backupsDir, 'preR21h_723_output_hashes.json');
  const oldVerTag = oldVer.replace('.', ''); // v0.6 -> v06（对齐既有 .v05baseline.json 命名）
  const archivePath = path.join(backupsDir, `preR21h_723_output_hashes.${oldVerTag}baseline.json`);
  if (DRY) {
    console.log(`基线: [dry-run] 归档 -> ${path.basename(archivePath)}，并用新代码重生成 723 文件`);
  } else {
    if (fs.existsSync(baselinePath)) fs.copyFileSync(baselinePath, archivePath);
    const n = regenBaseline(baselinePath);
    if (n !== 723) die(`基线生成异常: ${n} 文件（期望 723）`);
    console.log(`基线: 已重生成 ${n} 文件，旧基线归档 ${path.basename(archivePath)}`);
  }
}

// ---- 4. 版本敏感测试 ----
if (flags.has('--no-tests') || DRY) {
  if (DRY) console.log('测试: [dry-run] 跳过');
} else {
  const suites = ['tests/r19_title_cm.js', 'tests/sf2_quality_fixes.js', 'tests/r21_taper_rebuild.js', 'tests/i18n_lang.js'];
  let bad = 0;
  console.log('回归:');
  for (const s of suites) {
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, s)], { stdio: 'inherit' });
    if (r.status !== 0) { bad++; console.error('  FAIL: ' + s); } else { console.log('  OK: ' + s); }
  }
  if (bad) { console.error(`${bad} 套件失败 —— 请检查`); process.exitCode = 1; }
}

// ---- 5. 手工清单 ----
console.log('\n手工补写（语义内容，脚本不代改）:');
console.log('  - AGENTS.md：顶部版本声明 / 工作规则 4 基线快照 / §5 测试说明 / §6 新增状态条目 / 版本史');
console.log('  - README.md + README.en.md：项目历史表新增一行 / 页脚版本 / 断言计数');
console.log(`  - docs/发布归档_${newVer}.md：新建本版发布归档`);
console.log('  - backups/README.md：现行基线说明 + 本批次快照表');
console.log('\n完成。建议再跑全量:  Get-ChildItem tests/*.js | % { node $_ }');
