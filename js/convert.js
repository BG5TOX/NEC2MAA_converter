// convert.js — 转换层（自 v02 executeConvert L909-1048 拆分迁移）
// v0.5 i18n-3: 校验告警/面板备注经 L() 屏显; 写入输出文件的告警经 LF() (B1 恒英文)。
// 拆分策略: 循环体/构建体逐字搬运; validateLoadRows 提取 Load 校验; build* 提取节构建;
//   编排函数持输出行序契约 (Wires→Source→Load→Segmentation→G/H→###Comment###→Warnings)。
// 依赖: state.js (N2M.$/N2M.state), utils.js (evalExpr/parseGsScale/formatNum/hasChinese/removeChinese), geometry.js (collectWires)。

    // Load 行四重校验 (v02 L1006-1018 逐字): 设计符正则/类型位∈{0,1}/字段数≥4/数值合法
    function validateLoadRows(loadLines, unsupportedErrors) {
        let badLoadLines = [];
        loadLines = loadLines.filter(ll => {
            let p = ll.split(',').map(s => s.trim());
            if (p.length < 4 || !/^w\d+[cbe](-?\d+)?$/i.test(p[0]) || (p[1] !== '0' && p[1] !== '1') || p.slice(2).some(v => v === '' || isNaN(parseFloat(v)))) {
                badLoadLines.push(ll);
                return false;
            }
            return true;
        });
        if (badLoadLines.length > 0) {
            alert(L('n2m.badLoadRow', { rows: badLoadLines.join("\n") }));
            for (let bl of badLoadLines) unsupportedErrors.push(`! BAD LOAD row dropped: ${bl}`);
        }
        return loadLines;
    }

    // Wires 节构建 (v02 L969-986 逐字; axis_map swap 对调)
    function buildWiresSection(maaLines, wires, axisMap) {
        for (let w of wires) {
            let outX1 = axisMap === 'swap' ? w.y1 : w.x1;
            let outY1 = axisMap === 'swap' ? w.x1 : w.y1;
            let outX2 = axisMap === 'swap' ? w.y2 : w.x2;
            let outY2 = axisMap === 'swap' ? w.x2 : w.y2;

            maaLines.push(`${formatNum(outX1)},\t${formatNum(outY1)},\t${formatNum(w.z1)},\t${formatNum(outX2)},\t${formatNum(outY2)},\t${formatNum(w.z2)},\t${formatNum(w.rad)},\t-1`);
        }
    }

    // Source 节构建 (v02 L988-1003 逐字; 空源兜底; p.length>=3 重排 phase,mag)
    function buildSourceSection(maaLines, sourceLines) {
        maaLines.push("***Source***");
        if(sourceLines.length === 0) {
            maaLines.push("1,\t0");
            maaLines.push("w1c,\t0.0,\t1.0");
        } else {
            maaLines.push(`${sourceLines.length},\t0`);
            for (let sl of sourceLines) {
                let p = sl.split(',').map(s => s.trim());
                if (p.length >= 3) {
                    maaLines.push(`${p[0]},\t${p[2]},\t${p[1]}`);
                } else {
                    maaLines.push(sl);
                }
            }
        }
    }

    // Load 节构建 (v02 L1019-1028 逐字)
    function buildLoadSection(maaLines, loadLines) {
        maaLines.push("***Load***");
        if (loadLines.length > 0) {
            maaLines.push(`${loadLines.length},\t0`);
            for (let ll of loadLines) {
                let p = ll.split(',').map(s => s.trim());
                maaLines.push(p.join(',\t'));
            }
        } else {
            maaLines.push("0,\t0");
        }
    }

    // 尾节构建: Segmentation / G-H(第3字段固定0) / ###Comment### + CM / Warnings (v02 L1030-1043 逐字)
    function buildTailSections(maaLines, commentsForOutput, unsupportedErrors) {
        maaLines.push("***Segmentation***");
        maaLines.push(`${N2M.$('dm1').value},\t${N2M.$('dm2').value},\t${parseFloat(N2M.$('sc').value).toFixed(1)},\t${N2M.$('ec').value}`);

        maaLines.push("***G/H/M/R/AzEl/X***");
        maaLines.push(`${N2M.$('g_ground').value},\t${parseFloat(N2M.$('add_height').value).toFixed(1)},\t${N2M.$('ant_material').value},\t${parseFloat(N2M.$('r_imp').value).toFixed(1)},\t${N2M.$('az_angle').value},\t${N2M.$('el_angle').value},\t${parseFloat(N2M.$('x_imp').value).toFixed(1)}`);

        maaLines.push("###Comment###");
        if (commentsForOutput.length > 0) {
            for (let c of commentsForOutput) maaLines.push(c);
        }
        if (unsupportedErrors.length > 0) {
            maaLines.push("Warnings:");
            for (let err of unsupportedErrors) maaLines.push(err);
        }
    }

    // 编排函数 (v02 executeConvert L909-1047, 控制流与输出行序逐字保持)
    function executeConvert() {
        const necText = N2M.$('inputNec').value;
        if (!necText.trim()) return alert(L('ui.alert.noNecCode'));

        let freqInput = N2M.$('freq').value;
        if (!freqInput) {
            alert(L('ui.alert.freqEmpty2'));
            N2M.$('freq').focus();
            return;
        }

        const lines = necText.split('\n');
        let symbols = {};
        let wires = [];
        let commentsForOutput = [];
        let globalScale = 1.0;
        let gsUnitNote = "";

        for (let line of lines) {
            let cleanLine = line.trim().toUpperCase();
            let parts = cleanLine.split(/[\s,]+/).filter(Boolean);
            if (parts.length === 0) continue;

            if (parts[0] === 'CM') {
                let txt = line.substring(2).trim();
                if(!hasChinese(txt)) commentsForOutput.push(txt);
            } else if (parts[0] === 'SY') {
                let paramParts = cleanLine.substring(2).split('=');
                if (paramParts.length >= 2) symbols[paramParts[0].trim()] = paramParts[1].split('\'')[0].split('!')[0].trim();
            } else if (parts[0] === 'GS') {
                if (parts.length >= 4) {
                    let gsRaw = parts[3];
                    if (parts.length >= 5 && /^[0-9.]+$/.test(parts[3]) && GS_UNITS.hasOwnProperty(parts[4].toLowerCase())) gsRaw = parts[3] + parts[4];
                    let gs = parseGsScale(gsRaw, symbols);
                    if (isFinite(gs.val) && gs.val > 0) {
                        globalScale = gs.val;
                        if (gs.unit) gsUnitNote = { key: 'n2m.gs.unit', params: { unit: gs.unit, val: gs.val } };
                    } else {
                        gsUnitNote = { key: 'n2m.gs.bad', params: { raw: gsRaw } };
                        globalScale = 1.0;
                    }
                }
            }
        }
        for (let key in symbols) symbols[key] = evalExpr(symbols[key], symbols);

        let gmNotes = [];
        wires = collectWires(lines, symbols, globalScale, gmNotes);

        if (wires.length === 0) {
            alert(L('ui.alert.noWire'));
            return;
        }

        let unsupportedErrors = N2M.state.unsupportedErrors;
        if (gsUnitNote) {
            if (gsUnitNote.key === 'n2m.gs.bad') alert("⚠️ " + L(gsUnitNote.key, gsUnitNote.params));
            unsupportedErrors.push(LF(gsUnitNote.key, gsUnitNote.params));
        }
        for (let n of gmNotes) unsupportedErrors.push(LF(n.key, n.params));

        let maaLines = [];
        let cleanTitle = removeChinese(N2M.$('maaTitle').value) || "Converted_Antenna";
        maaLines.push(cleanTitle);
        maaLines.push("*");
        maaLines.push(freqInput);
        maaLines.push("***Wires***");
        maaLines.push(wires.length);

        let axisMap = N2M.$('axis_map').value;

        buildWiresSection(maaLines, wires, axisMap);

        let sourceLines = N2M.$('sourceInput').value.split('\n').map(l=>removeChinese(l).trim()).filter(l=>l);
        buildSourceSection(maaLines, sourceLines);

        let loadLines = N2M.$('loadInput').value.split('\n').map(l=>removeChinese(l).trim()).filter(l=>l);
        loadLines = validateLoadRows(loadLines, unsupportedErrors);
        buildLoadSection(maaLines, loadLines);

        buildTailSections(maaLines, commentsForOutput, unsupportedErrors);

        N2M.$('outputMaa').value = maaLines.join('\n');
        N2M.$('btnDownload').disabled = false;
    }
