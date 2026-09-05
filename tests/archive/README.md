# 已归档测试脚本

2026-09-02 收尾归档：以下脚本与现行功能测试重叠、或断言已被 R11–R20 的行为演进取代（引用已删除的 `autoDeriveEpsr`/`gnd_cond`/dirBadge 等已废接口，或验证已被新实现替换的旧行为），不再参与常规回归。

| 脚本 | 归档原因 | 其覆盖被谁取代 |
|---|---|---|
| r1_t1_smoke_722.js | 全库 722 冒烟已并入 r2 的 T2 段（722 转换+ASCII 0 违例） | r2_t2t3_writer.js |
| r3_ui_fusion.js | 方向切换/嗅探/双链路已被 R4 向导改版废弃（btnDir 切换条已删）；M2N 链路由 r19/r20 覆盖 | r19/r20 |
| r4_wizard.js | 断言 dirBadge（R5b 已删胶囊徽标） | r5b_backfix2 |
| r5_m2n_flow.js | σ=20 面板加载（R11 移除自动识别、R20 改 Average 默认）；epsr 分档（R11 已删 deriveEpsr） | r11/r20 |
| r5b_backfix.js | r5b_backfix2 覆盖同一往返复位场景且更完整（内联 style 解析） | r5b_backfix2 |
| r6_epsr_auto.js | εr 自动推导整链路 R11 全删（autoDeriveEpsr/m2nEpsrAuto/提示元素） | r20 |
| r7_ground_disable.js | σ/εr 禁用矩阵 r20 已含（NEC 侧 gnd_cond 输入 R11 已移除） | r20 |
| r8_ground_link.js | gnd_cond 断言 + σ=20 加载（均过时） | r20 |
| r10_gh_semantics.js | G/H 语义断言（height/material/refZ）由 r11 的 G/H 完整行验证 + r19/r20 覆盖；导出已删的 autoDeriveEpsr | r11/r20 |
| r15_seg_copy.js | 文案断言已被 R15/R16/R17 演进覆盖 | r14/r16/r17 |

注意：`m5_convert_app.js` 的 `gnd_cond` 桩仍保留——N2M 转换链路不再读它，但作为无害残留未清理（G/H 行已改由 ant_material/add_height 提供，见该文件 R11 注释）。

保留在上级目录的活跃回归集（13 个，239 断言全绿）：m2/m3/m4/m5（基础四层）、r2（M2N writer 核心+全库 722 冒烟）、r5b_backfix2（wizard flex 往返）、r9（文件名/标题契约）、r11（G/H 行+材料+拦截）、r14（分段参数）、r16（布局+首次进入禁用）、r17（提醒框位置）、r19（.maa 标题→首条 CM）、r20（Average 地面默认）。
