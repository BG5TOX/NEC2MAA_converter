const fs = require('fs');
const base = 'F:\\temp\\AGTC_anyGTa_2lite_V2-00\\NEC2MAA_converter\\NEC2MAA_converter_main\\js';
const src = ['state', 'utils', 'geometry'].map(n => fs.readFileSync(`${base}\\${n}.js`, 'utf8')).join('\n');
try { new Function('window', 'document', src); console.log('SYNTAX OK (state+utils+geometry)'); } catch (e) { console.log('SYNTAX FAIL: ' + e.message); process.exit(1); }
const api = new Function('window', 'document', src + '\nreturn { collectWires, evalExpr };')({}, {});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? '  ' + detail : '')); process.exitCode = 1; }
}
function wiresOf(nec) { return api.collectWires(nec.split('\n'), {}, 1.0, []); }

// === v02 文档 §6 GM 全用例 ===
// 1. 绕Z 90° 就地
let w = wiresOf('GW 1 9 1 0 0 -1 0 0 0.001\nGM 0 0 0 0 90 0 0 0');
check('GM 绕Z90°: (1,0,0)→(0,1,0)', w.length === 1 && Math.abs(w[0].x1 - 0) < 1e-9 && Math.abs(w[0].y1 - 1) < 1e-9 && Math.abs(w[0].x2 - 0) < 1e-9 && Math.abs(w[0].y2 + 1) < 1e-9, JSON.stringify(w[0]));
// 2. 平移 y+2 就地
w = wiresOf('GW 1 9 0 0 5 0 0 -5 0.001\nGM 0 0 0 0 0 0 2 0');
check('GM 平移 y+2', w[0].y1 === 2 && w[0].y2 === 2 && w[0].z1 === 5 && w[0].z2 === -5);
// 3. NRPT=1 ITG=1 复制: tag 1→2
w = wiresOf('GW 1 9 0 0 5 0 0 -5 0.001\nGM 1 1 0 0 0 0 2 0');
check('GM NRPT=1 复制: 2 根', w.length === 2);
check('GM 副本 y+2 tag=2', w[1].y1 === 2 && w[1].tag === 2 && w[0].y1 === 0, JSON.stringify(w.map(x => ({ t: x.tag, y: x.y1 }))));
// 4. NRPT=0 ITG=5 就地: tag 1→6
w = wiresOf('GW 1 9 0 0 5 0 0 -5 0.001\nGM 5 0 0 0 0 0 2 0');
check('GM NRPT=0 ITG=5: tag 1→6 就地', w.length === 1 && w[0].tag === 6 && w[0].y1 === 2);
// 5. GX 100 x 镜像
w = wiresOf('GW 1 9 2 0 5 2 0 -5 0.001\nGX 5 100');
check('GX 100 镜像: 2 根 x=-2', w.length === 2 && w[1].x1 === -2 && w[0].x1 === 2);
// 6. GM 后新 GW 不受影响
w = wiresOf('GW 1 9 1 0 0 -1 0 0 0.001\nGM 0 0 0 0 90 0 0 0\nGW 2 9 1 0 0 -1 0 0 0.001');
check('GM 后新 GW 隔离', w.length === 2 && Math.abs(w[0].y1 - 1) < 1e-9 && w[1].x1 === 1, `w0=(${w[0].x1},${w[0].y1}) w1=(${w[1].x1},${w[1].y1})`);
// 7. 多轴告警 (i18n-3 批次同步: 告警改结构化 {key, params})
let gmNotes = [];
wiresOf2 = (nec) => api.collectWires(nec.split('\n'), {}, 1.0, gmNotes);
api.collectWires('GW 1 9 1 0 0 -1 0 0 0.001\nGM 0 0 30 40 0 0 0 0'.split('\n'), {}, 1.0, gmNotes);
check('多轴旋转告警', gmNotes.some(n => n.key === 'n2m.gm.multiAxis'), JSON.stringify(gmNotes));
// 8. GS×GM: 坐标乘缩放, 平移不乘
w = api.collectWires('GW 1 9 0 0 1 0 0 -1 0.001\nGS 0 0 2\nGM 0 0 0 0 0 0 0 1'.split('\n'), {}, 2.0, []);
check('GS×GM: z=(±2)+1, rad=0.002', w[0].z1 === 3 && w[0].z2 === -1 && w[0].rad === 0.002, JSON.stringify(w[0]));
// 9. 连续 GM 指数复制 (batch8 发现): 3 次 NRPT=1 → 8 根, z 序列
w = wiresOf('GW 1 11 0.134 -1.23135 -0.952 0.134 -0.89465 -0.952 0.004\nGM 26 1 0 0 0 0 0 1.904\nGM 26 1 0 0 0 0 0 1.904\nGM 26 1 0 0 0 0 0 1.904');
const zs = w.map(x => x.z1);
check('连续 GM 指数复制: 8 根', w.length === 8, 'n=' + w.length);
check('z 序列 (1→2→4→8)', JSON.stringify(zs) === JSON.stringify([-0.952, 0.952, 0.952, 2.856, 0.952, 2.856, 2.856, 4.76]), JSON.stringify(zs));
// 10. ns 字段保留 (GW 段数进 wire 对象)
w = wiresOf('GW 1 21 0 0 5 0 0 -5 0.001');
check('wire.ns 保留 (21)', w[0].ns === 21 && w[0].tag === 1);
// 11. SY/SYMBOL 经 evalExpr
w = api.collectWires('SY LEN=5\nGW 1 9 0 0 5 0 0 -5 0.001'.split('\n'), { LEN: 5 }, 1.0, []);
check('SY 符号进 collectWires (经调用方 symbols)', w[0].z1 === 5);

console.log(`\n${pass} PASS / ${fail} FAIL`);
