// state.js — N2M 命名空间与全局状态（v03 唯一新增代码）
// 纪律：其余文件一律经 N2M.state / N2M.$ 访问，不得直接声明全局或 getElementById
window.N2M = {
    state: {
        currentFileName: "",
        extractedCMs: [],
        titleMode: "file",
        unsupportedErrors: [],
        direction: "n2m",
        m2nWarnings: [],
        m2nTitleMode: "file",
        lang: "zh"   // v0.5 i18n: 界面语言 (D3 默认简体中文; initLang 启动时按 localStorage 恢复)
    },
    $: function (id) { return document.getElementById(id); },
    IDS: {
        INPUT_NEC: 'inputNec', FILE_INPUT: 'fileInput', OUTPUT_MAA: 'outputMaa',
        FREQ: 'freq', MAA_TITLE: 'maaTitle',
        BTN_MODE_FILE: 'btnModeFile', BTN_MODE_CM: 'btnModeCM',
        G_GROUND: 'g_ground', ANT_MATERIAL: 'ant_material', ADD_HEIGHT: 'add_height',
        R_IMP: 'r_imp', X_IMP: 'x_imp',
        AZ_ANGLE: 'az_angle', EL_ANGLE: 'el_angle',
        AXIS_MAP: 'axis_map', SOURCE_INPUT: 'sourceInput', LOAD_INPUT: 'loadInput',
        DM1: 'dm1', DM2: 'dm2', SC: 'sc', EC: 'ec',
        BTN_DOWNLOAD: 'btnDownload'
    }
};
