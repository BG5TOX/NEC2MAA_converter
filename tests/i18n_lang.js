// tests/i18n_lang.js — v0.5 i18n 语言包/机制自检 (i18n-1 新增)
// 覆盖: ①js/i18n/ 目录全部语言包自动扫描 (新语言包零维护纳入)
//       ②键集与 zh 基准对齐 (多/缺键逐条报告) ③{param} 插值占位符跨语言一致
//       ④{{terms.x}} 引用的术语键存在 ⑤meta 完整 ⑥语言包语法可执行
//       ⑦L() 回退链 (构造缺键) ⑧插值渲染正确性 ⑨术语引用展开
// 不依赖外部库文件, 独立可跑: node tests/i18n_lang.js
const fs = require('fs');
const path = require('path');
const base = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_main';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? '  ' + detail : '')); process.exitCode = 1; }
}

// ---- 1. 目录扫描语言包 ----
const i18nDir = path.join(base, 'js', 'i18n');
const packFiles = fs.readdirSync(i18nDir).filter(f => f.endsWith('.js'));
check('语言包文件存在 (zh.js/en.js)', packFiles.includes('zh.js') && packFiles.includes('en.js'), packFiles.join(', '));

const packs = {};   // code -> pack
for (const f of packFiles) {
  const src = fs.readFileSync(path.join(i18nDir, f), 'utf8');
  // 语法预检 (防编辑手误整包失效)
  try { new Function('window', src); } catch (e) {
    check('语言包语法可执行: ' + f, false, e.message);
    continue;
  }
  const win = {};
  new Function('window', src)(win);
  const codes = Object.keys(win.N2M_LANG || {});
  check('语言包注册: ' + f, codes.length === 1, 'registered: ' + codes.join(','));
  if (codes.length === 1) packs[codes[0]] = win.N2M_LANG[codes[0]];
}

// ---- 2. meta 完整 ----
for (const code of Object.keys(packs)) {
  const m = packs[code].meta;
  check('meta 完整: ' + code, !!(m && m.code === code && m.name && m.htmlLang),
        m ? `${m.code}/${m.name}/${m.htmlLang}` : 'missing');
}

// ---- 3. 键集对齐 (zh 基准) ----
function flatKeys(obj, prefix) {
  const keys = [];
  for (const k of Object.keys(obj || {})) {
    const v = obj[k];
    const full = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) keys.push(...flatKeys(v, full));
    else keys.push(full);
  }
  return keys;
}
const zhKeys = new Set(flatKeys({ terms: packs.zh.terms, ui: packs.zh.ui, warn: packs.zh.warn }, ''));
check('zh 基准词条数 > 150', zhKeys.size > 150, 'zh keys: ' + zhKeys.size);
for (const code of Object.keys(packs)) {
  if (code === 'zh') continue;
  const keys = new Set(flatKeys({ terms: packs[code].terms, ui: packs[code].ui, warn: packs[code].warn }, ''));
  const missing = [...zhKeys].filter(k => !keys.has(k));
  const extra = [...keys].filter(k => !zhKeys.has(k));
  check('键集对齐: ' + code + ' 无缺键', missing.length === 0, missing.slice(0, 8).join(', '));
  check('键集对齐: ' + code + ' 无多键', extra.length === 0, extra.slice(0, 8).join(', '));
}

// ---- 4. 插值占位符跨语言一致 ----
function placeholders(s) {
  return [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
}
for (const code of Object.keys(packs)) {
  if (code === 'zh') continue;
  let bad = [];
  for (const k of zhKeys) {
    const zhV = lookup(packs.zh, k), enV = lookup(packs[code], k);
    if (zhV === undefined || enV === undefined) continue;
    if (placeholders(zhV) !== placeholders(enV)) bad.push(k + ' [zh:' + placeholders(zhV) + ' vs ' + code + ':' + placeholders(enV) + ']');
  }
  check('插值占位符一致: ' + code, bad.length === 0, bad.slice(0, 5).join('; '));
}
function lookup(pack, key) {
  if (key.startsWith('terms.')) return pack.terms ? pack.terms[key.slice(6)] : undefined;
  if (key.startsWith('ui.')) return pack.ui ? pack.ui[key.slice(3)] : undefined;
  if (key.startsWith('warn.')) return pack.warn ? pack.warn[key.slice(5)] : undefined;
  return undefined;
}

// ---- 5. {{terms.x}} 引用有效 ----
for (const code of Object.keys(packs)) {
  const p = packs[code];
  const bad = [];
  const all = [...flatKeys({ terms: p.terms, ui: p.ui, warn: p.warn }, '')];
  for (const k of all) {
    const v = lookup(p, k);
    if (v === undefined || typeof v !== 'string') continue;
    for (const m of v.matchAll(/\{\{(terms\.[\w.]+)\}\}/g)) {
      if (lookup(p, m[1]) === undefined) bad.push(k + ' -> ' + m[1]);
    }
  }
  check('terms 引用有效: ' + code, bad.length === 0, bad.slice(0, 5).join('; '));
}

// ---- 6. 机制加载 + L()/LF() 单测 (i18n.js + state.js 拼接, DOM/localStorage 桩) ----
const i18nSrc = fs.readFileSync(path.join(base, 'js', 'i18n.js'), 'utf8');
const stateSrc = fs.readFileSync(path.join(base, 'js', 'state.js'), 'utf8');
const packSrcs = packFiles.map(f => fs.readFileSync(path.join(i18nDir, f), 'utf8')).join('\n');
function makeSandbox(lang) {
  const sandbox = { window: {}, console: { warn: () => {} }, localStorage: (() => { let s = {}; return { getItem: k => s[k] ?? null, setItem: (k, v) => { s[k] = String(v); } }; })() };
  sandbox.window.N2M = { state: { lang } };
  // var 声明使 N2M 在函数作用域内可见 (浏览器中 window.N2M 即全局; 沙箱经 var 桥接, state.js 运行后重新指向真实对象)
  const full = 'var N2M;\n' + stateSrc + '\nN2M = window.N2M;\n' + packSrcs + '\n' + i18nSrc +
    '\nreturn { L, LF, i18nLangs, i18nPack, setLang: (typeof setLang !== "undefined" ? setLang : null), applyI18n: (typeof applyI18n !== "undefined" ? applyI18n : null), toggleLang: (typeof toggleLang !== "undefined" ? toggleLang : null), state: window.N2M.state };';
  const api = new Function('window', 'document', 'localStorage', 'console', 'alert', full)(sandbox.window, { getElementById: () => null, querySelectorAll: () => [], documentElement: { setAttribute: () => {} } }, sandbox.localStorage, sandbox.console, () => {});
  return { api, sandbox };
}
// state.js 定义 window.N2M, 会覆盖桩 — 重新挂 lang
const sb1 = makeSandbox('zh'); sb1.api.state.lang = 'zh';
check('L() zh 渲染', sb1.api.L('ui.alert.noInput') === '请先在左侧输入代码！', sb1.api.L('ui.alert.noInput'));
check('L() 插值', sb1.api.L('ui.alert.parseDone', { w: 3, s: 1, l: 2 }) === '✅ 解析完成: 3 根导线, 1 源, 2 负载。', sb1.api.L('ui.alert.parseDone', { w: 3, s: 1, l: 2 }));
const sb2 = makeSandbox('en'); sb2.api.state.lang = 'en';
check('L() en 渲染', sb2.api.L('ui.alert.noInput') === 'Please enter code on the left first!', sb2.api.L('ui.alert.noInput'));
check('LF() 恒英文 (zh 态)', sb1.api.LF('ui.alert.noInput') === 'Please enter code on the left first!', sb1.api.LF('ui.alert.noInput'));
check('语言注册表自发现', JSON.stringify(sb1.api.i18nLangs().sort()) === JSON.stringify(Object.keys(packs).sort()), sb1.api.i18nLangs().join(','));
// 缺键场景: zh 删除 → 回退 en (回退链生效)
const sb3 = makeSandbox('zh');
delete sb3.sandbox.window.N2M_LANG.zh.ui['ui.alert.noInput'];
sb3.api.state.lang = 'zh';
check('L() 缺键回退 en', sb3.api.L('ui.alert.noInput') === 'Please enter code on the left first!', sb3.api.L('ui.alert.noInput'));
// 全缺键 (zh+en 均删) → 返回键名
const sb4 = makeSandbox('zh');
delete sb4.sandbox.window.N2M_LANG.zh.ui['ui.alert.noInput'];
delete sb4.sandbox.window.N2M_LANG.en.ui['ui.alert.noInput'];
sb4.api.state.lang = 'zh';
check('L() 全缺键返回键名', sb4.api.L('ui.alert.noInput') === 'ui.alert.noInput', 'returns key when missing everywhere');
// setLang 状态切换
const sb5 = makeSandbox('zh');
sb5.api.state.lang = 'zh';
sb5.api.setLang('en');
check('setLang 切换 state', sb5.api.state.lang === 'en');
sb5.api.setLang('zh');
check('setLang 切回 zh', sb5.api.state.lang === 'zh');

console.log('\n===== i18n_lang: ' + pass + ' PASS, ' + fail + ' FAIL =====');
