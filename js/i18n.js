// i18n.js — 语言机制层（v0.5 i18n-1 新增; 无任何文案, 文案全部在 js/i18n/<code>.js 语言包）
// 职责: 注册表读取(语言包自发现) / L(跟随语言) / LF(恒英文, B1 输出文件视图) / applyI18n / setLang / toggle
// 语言包规范: 纯数据 JS (file:// 禁 fetch JSON 的结构性约束), window.N2M_LANG[<code>] = { meta, terms, ui, warn }
// 回退链: 当前语言 → en → zh (zh 为键集基准); 缺键 console.warn, 界面不崩
// {{terms.x}} 句内术语引用: 渲染时先递归展开术语再插值; {name} 参数插值
// 依赖: state.js (N2M.state.lang)。本文件不得引用 DOM 之外的任何业务层。

    function i18nLangs() {
        // 注册表自发现: 可用语言 = 已加载语言包的键 (语言包在 i18n.js 之后、业务层之前加载)
        return Object.keys(window.N2M_LANG || {});
    }
    function i18nPack(code) {
        return (window.N2M_LANG && window.N2M_LANG[code]) || null;
    }

    // 取原始词条字符串 (不含插值); 回退链 当前→en→zh; 全缺返回 undefined
    function i18nRaw(key, code) {
        const chain = [code, 'en', 'zh'];
        for (const c of chain) {
            const pack = i18nPack(c);
            if (!pack) continue;
            const v = i18nLookup(pack, key);
            if (v !== undefined) return v;
        }
        return undefined;
    }
    function i18nLookup(pack, key) {
        // 先查完整字面键 (如 'ui.alert.noInput' 在 ui 段内整键存储), 再退化段前缀剥离
        const segs = [['terms', 'terms'], ['ui', 'ui'], ['warn', 'warn']];
        for (const [prefix, seg] of segs) {
            if (pack[seg] && pack[seg][key] !== undefined) return pack[seg][key];
        }
        if (key.startsWith('terms.')) return pack.terms ? pack.terms[key.slice(6)] : undefined;
        if (key.startsWith('ui.')) return pack.ui ? pack.ui[key.slice(3)] : undefined;
        if (key.startsWith('warn.')) return pack.warn ? pack.warn[key.slice(5)] : undefined;
        return undefined;
    }

    // 渲染: 术语引用展开({{terms.x}}) + 参数插值({name})
    function i18nRender(template, params, code) {
        let s = template;
        s = s.replace(/\{\{(terms\.[\w.]+)\}\}/g, (m, tKey) => {
            const v = i18nRaw(tKey, code);
            return v !== undefined ? v : m;   // 未定义术语保留原样 (测试会拦)
        });
        if (params) {
            s = s.replace(/\{(\w+)\}/g, (m, name) => {
                return params[name] !== undefined ? String(params[name]) : m;
            });
        }
        return s;
    }

    // L(key, params) — 跟随界面语言 (屏显视图)
    function L(key, params) {
        const code = (typeof N2M !== 'undefined' && N2M.state && N2M.state.lang) || 'zh';
        const raw = i18nRaw(key, code);
        if (raw === undefined) {
            console.warn('[i18n] missing key: ' + key + ' (lang=' + code + ')');
            return key;   // 开发期可见缺失; 界面不崩溃
        }
        return i18nRender(raw, params, code);
    }
    // LF(key, params) — 恒英文 (B1: 写入输出文件的告警/注释视图, 与屏显同键不同语言)
    function LF(key, params) {
        const raw = i18nRaw(key, 'en');
        if (raw === undefined) {
            console.warn('[i18n] missing key (LF/en): ' + key);
            return key;
        }
        return i18nRender(raw, params, 'en');
    }

    // 应用静态 UI: [data-i18n] 文本 / [data-i18n-ph] placeholder
    // workTitle 特判: 只改 firstChild 文本节点, 保留版本徽标 span (R21j 纪律)
    function applyI18n() {
        const code = (N2M.state && N2M.state.lang) || 'zh';
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const k = el.getAttribute('data-i18n');
            if (k === 'work.title.dynamic') return;   // 动态标题: 由 setDirection/语言切换共同决定
            el.textContent = L(k);
        });
        document.querySelectorAll('[data-i18n-ph]').forEach(el => {
            el.placeholder = L(el.getAttribute('data-i18n-ph'));
        });
        // workTitle: 按当前方向渲染 (与 setDirection 同源键)
        const wt = document.getElementById('workTitle');
        if (wt && N2M.state) {
            const isM2N = N2M.state.direction === 'm2n';
            const titleText = L(isM2N ? 'work.title.m2n' : 'work.title.n2m');
            if (wt.firstChild) wt.firstChild.textContent = titleText;
            else wt.insertBefore(document.createTextNode(titleText), wt.firstChild);
        }
        // i18n5fix: 方向相关动态文案随语言同步刷新 (与 setDirection 同源同键, 按 state.direction 派生 — 两处赋值恒一致)
        //   覆盖: 导入按钮 / 下载按钮 / 输入区拖拽占位符 (工作屏在显示时才有意义, 向导屏由 setDirection 进入时刷新)
        if (N2M.state) {
            const isM2N = N2M.state.direction === 'm2n';
            const up = document.getElementById('btnUpload');
            const dl = document.getElementById('btnDownload');
            const inp = document.getElementById('inputNec');
            if (up) up.textContent = isM2N ? L('main.upload.maa') : L('main.upload.nec');
            if (dl) dl.textContent = isM2N ? L('main.download.nec') : L('main.download.maa');
            if (inp) inp.placeholder = isM2N ? L('main.input.ph.maa') : L('main.input.ph.nec');
        }
        // 语言切换按钮 (D2 toggle): 显示目标语言的旗帜徽章+名称 (zh 态→English/🇬🇧, en 态→简体中文/🇨🇳)
        // i18n8flag: flag 纯 CSS 圆形双色徽章 (min-width 消除中英切换的宽度抖动)
        const TARGET_FLAG = { en: 'gb', zh: 'cn' };   // 目标语言代码 → 徽章样式类 (按 meta.code 映射)
        document.querySelectorAll('.lang-toggle').forEach(btn => {
            const target = (code === 'zh') ? 'en' : 'zh';
            const flagCls = TARGET_FLAG[target] || 'gb';
            const label = (code === 'zh') ? L('lang.toggle.to') : L('lang.toggle.from');
            btn.innerHTML = '<span class="flag ' + flagCls + '"></span><span>' + label + '</span>';
        });
        document.documentElement.setAttribute('lang', (i18nPack(code) && i18nPack(code).meta && i18nPack(code).meta.htmlLang) || code);
    }

    // setLang(code) — 切换语言; state → localStorage(try/catch) → applyI18n
    function setLang(code) {
        if (!i18nPack(code)) return;                    // 未注册语言包: 忽略
        N2M.state.lang = code;
        try { localStorage.setItem('n2m_lang', code); } catch (e) { /* file:// 个别浏览器受限: 回退内存态 */ }
        applyI18n();
    }
    // toggleLang() — zh ↔ en 双语切换 (D2 决策: toggle 按钮; 未来加语言改此处扩展为循环/下拉)
    function toggleLang() {
        setLang(N2M.state.lang === 'zh' ? 'en' : 'zh');
    }
    // initLang() — 启动恢复: localStorage 记忆 → 默认 zh (D3)
    function initLang() {
        let saved = null;
        try { saved = localStorage.getItem('n2m_lang'); } catch (e) { /* ignore */ }
        N2M.state.lang = (saved && i18nPack(saved)) ? saved : 'zh';
    }
