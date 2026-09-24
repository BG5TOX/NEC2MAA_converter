// extract.js — 提取层（自 v02 extractFromNec L644-907 拆分迁移）
// v0.5 i18n-3: 告警改结构化条目 {key, params}。B1 双视图: 屏显 alert 用 L() (跟随语言),
//   写入输出文件 Warnings 区的 N2M.state.unsupportedErrors 用 LF() (恒英文)。键值 zh 逐字等于 v0.4 原句。
// 拆分策略（较实施方案原粒度收窄, 按红线"逐字搬运优先"调整）:
//   三大块 (首遍头卡循环/EX 循环/LD 循环) 的循环体逐字搬运, 仅以函数签名参数化局部变量;
//   GN/FR/未知卡等分支保持在内联循环 (共享 symbols/局部状态过多, 硬拆引入行为风险)。
// 依赖: state.js (N2M.$/N2M.state), utils.js (evalExpr/getMmanaPos/formatNum/hasChinese), geometry.js (collectWires)。
// 告警顺序 (行为契约, 勿改): GM 提示 → groundWarning → geomCards → frSweep → unknownCards → TL
//   → failedLD → ld1Notes → ld5Notes → [exNotes 在 hasLD 块外!] → fuzzyPosition。

    const validNecCards = new Set([
        'CM','CE','GW','GX','GE','GN','EX','FR','LD','SY','GS',
        'EK','EN','PT','RP','TL','NT','PQ','PL','NE','NH',
        'KH','XQ','GA','GH','GM','GR','SP','SM','GD','WG',
        'CW','LC','NX','GC','GF'
    ]);

    // 头卡首遍: CM/SY/FR/GN/TL/LD标记/几何卡告警/未知卡收集 (v02 L661-705 逐字)
    function parseHeaderCards(lines, symbols, validNecCards) {
        let extractedCMs = [];
        let unknownCardsFound = new Set();
        let fuzzyPositionWarnings = [];
        let geomCardWarnings = [];
        let header = { hasLD: false, hasTL: false, rawFreqStr: "", groundValue: "0", groundWarning: "", frSweepNote: "" };

        for (let line of lines) {
            let cleanLine = line.trim().toUpperCase();
            if (cleanLine.length === 0 || cleanLine.startsWith('\'') || cleanLine.startsWith('!') || cleanLine.startsWith('*')) continue;

            let parts = cleanLine.split(/[\s,]+/).filter(Boolean);
            if (parts.length === 0) continue;

            let cardPrefix = parts[0];

            if (cardPrefix.length === 2 && /^[A-Z]{2}$/.test(cardPrefix) && !validNecCards.has(cardPrefix)) {
                unknownCardsFound.add(cardPrefix);
            } else if (!validNecCards.has(cardPrefix) && !symbols.hasOwnProperty(cardPrefix)) {
                if (cardPrefix !== '###') unknownCardsFound.add(cardPrefix);
            }

            if (cardPrefix === 'CM') {
                let cmText = line.substring(2).trim();
                if (!hasChinese(cmText) && cmText.length > 0) extractedCMs.push(cmText);
            } else if (cardPrefix === 'SY') {
                let paramParts = cleanLine.substring(2).split('=');
                if (paramParts.length >= 2) symbols[paramParts[0].trim()] = paramParts[1].split('\'')[0].split('!')[0].trim();
            } else if (cardPrefix === 'FR') {
                if (parts.length >= 6) header.rawFreqStr = parts[5];
                let frSteps = parts.length > 2 ? (parseInt(evalExpr(parts[2], symbols)) || 0) : 0;
                if (frSteps > 1) header.frSweepNote = { key: 'n2m.frSweep', params: { steps: frSteps } };
            } else if (cardPrefix === 'GN') {
                if (parts.length >= 2) {
                    let gnType = parseInt(evalExpr(parts[1], symbols));
                    if (gnType === -1) header.groundValue = "0";
                    else if (gnType === 0) header.groundValue = "2";
                    else if (gnType === 1) header.groundValue = "1";
                    else if (gnType === 2) {
                        header.groundValue = "2";
                        header.groundWarning = { key: 'n2m.gn2Degrade' };
                    }
                }
            } else if (cardPrefix === 'TL') {
                header.hasTL = true;
            } else if (cardPrefix === 'LD') {
                header.hasLD = true;
            } else if (cardPrefix === 'GA' || cardPrefix === 'GH' || cardPrefix === 'GR' || cardPrefix === 'SP' || cardPrefix === 'SM') {
                let geoDesc = { GA: 'GA (arc)', GH: 'GH (helix)', GR: 'GR (cylindrical array)', SP: 'SP (surface patch)', SM: 'SM (surface mesh)' }[cardPrefix];
                header.geomCardWarnings.push(geoDesc);
            }
        }

        return { extractedCMs, unknownCardsFound, fuzzyPositionWarnings, geomCardWarnings, header };
    }

    // EX 全类型解析 (v02 L755-793 循环体逐字; type 策略: 0/5/6 映射, 6 加电流→电压近似告警, 5 加连接点提示, 1/2/3/4 丢弃+告警)
    function parseExcitation(lines, wires, symbols, parsedSources, exNotes, fuzzyPositionWarnings) {
        let unsupportedErrors = N2M.state.unsupportedErrors;
        for (let line of lines) {
            let cleanLine = line.trim().toUpperCase();
            let parts = cleanLine.split(/[\s,]+/).filter(Boolean);
            if (parts[0] === 'EX' && parts.length >= 6) {
                let type = parseInt(evalExpr(parts[1], symbols));
                if (type === 0 || type === 5 || type === 6) {
                    let tag = parseInt(evalExpr(parts[2], symbols));
                    let segStr = parts[3];
                    let realVal = parts.length > 5 ? evalExpr(parts[5], symbols) : 0;
                    let imagVal = parts.length > 6 ? evalExpr(parts[6], symbols) : 0;

                    let mag = Math.sqrt(realVal * realVal + imagVal * imagVal);
                    let phase = Math.atan2(imagVal, realVal) * 180 / Math.PI;

                    if (Math.abs(mag) < 1e-6) mag = 0;
                    if (Math.abs(phase) < 1e-6) phase = 0;

                    let wireIdx = wires.findIndex(w => w.tag === tag);
                    if (wireIdx !== -1) {
                        let ns = wires[wireIdx].ns;
                        let posLetter = getMmanaPos(tag, segStr, ns, symbols, fuzzyPositionWarnings);
                        parsedSources.push(`w${wireIdx + 1}${posLetter}, ${formatNum(mag)}, ${formatNum(phase)}`);
                        if (type === 6) {
                            exNotes.push({ key: 'n2m.ex6', params: { tag, mag: formatNum(mag), phase: formatNum(phase) } });
                            unsupportedErrors.push(`EX 6 current source -> voltage source (approximate, verify in MMANA): ${line.trim()}`);
                        }
                        if (type === 5) {
                            exNotes.push({ key: 'n2m.ex5', params: { tag, seg: segStr } });
                        }
                    }
                } else if (type === 1 || type === 2 || type === 3) {
                    exNotes.push({ key: 'n2m.exPlane', params: { type } });
                    unsupportedErrors.push(`EX ${type} plane-wave excitation dropped (no MMANA equivalent): ${line.trim()}`);
                } else if (type === 4) {
                    exNotes.push({ key: 'n2m.ex4' });
                    unsupportedErrors.push(`EX 4 elementary current source dropped: ${line.trim()}`);
                }
            }
        }
    }

    // LD 手册七类型解析 + 告警 (v02 L795-893 逐字; exNotes 告警块在 hasLD 外—由编排函数负责)
    function parseLoads(lines, wires, symbols, parsedFreq, showPrompts) {
        let parsedLoads = [];
        let failedLDMsgs = [];
        let ld1Notes = [];
        let ld5Notes = [];
        let fuzzyPositionWarnings = [];
        let unsupportedErrors = N2M.state.unsupportedErrors;

        for (let line of lines) {
            let cleanLine = line.trim().toUpperCase();
            let parts = cleanLine.split(/[\s,]+/).filter(Boolean);
            if (parts[0] === 'LD' && parts.length >= 4) {
                let type = parseInt(evalExpr(parts[1], symbols));
                let tag = parseInt(evalExpr(parts[2], symbols));
                let segStr = parts[3];
                let p1 = parts.length > 5 ? evalExpr(parts[5], symbols) : 0;
                let p2 = parts.length > 6 ? evalExpr(parts[6], symbols) : 0;
                let p3 = parts.length > 7 ? evalExpr(parts[7], symbols) : 0;

                let wireIdx = wires.findIndex(w => w.tag === tag);
                if (wireIdx !== -1) {
                    let mmanaIdx = wireIdx + 1;
                    let ns = wires[wireIdx].ns;

                    let posLetter = 'c';
                    let pureSegVal = evalExpr(segStr.replace('%', ''), symbols);

                    if (pureSegVal === 0 && !segStr.includes('%')) {
                        posLetter = 'c';
                        fuzzyPositionWarnings.push({ key: 'n2m.ld.distributed', params: { tag } });
                    } else {
                        posLetter = getMmanaPos(tag, segStr, ns, symbols, fuzzyPositionWarnings);
                    }

                    let pos = `w${mmanaIdx}${posLetter}`;
                    if (type === 1) {
                        let qVal = 0;
                        if (parsedFreq > 0 && p1 > 0) {
                            let freqHz = parsedFreq * 1e6;
                            if (p2 > 0) qVal = (2 * Math.PI * freqHz * p2) / p1;
                            else if (p3 > 0) qVal = 1 / (2 * Math.PI * freqHz * p3 * p1);
                        }
                        parsedLoads.push(`${pos}, 0, ${formatNum(p2 * 1e6)}, ${formatNum(p3 * 1e12)}, ${formatNum(qVal)}`);
                    } else if (type === 3) {
                        parsedLoads.push(`${pos}, 1, ${formatNum(p1)}, ${formatNum(p2)}`);
                    } else if (type === 2) {
                        if (parsedFreq > 0) {
                            let w0 = 2 * Math.PI * parsedFreq * 1e6;
                            let gR = p1 > 0 ? 1 / p1 : 0;
                            let bSus = (p2 > 0 ? -1 / (w0 * p2) : 0) + (p3 > 0 ? w0 * p3 : 0);
                            let den = gR * gR + bSus * bSus;
                            if (den < 1e-30) {
                                ld1Notes.push({ key: 'n2m.ld1.parallelOpen', params: { tag } });
                                unsupportedErrors.push(`LD 2 parallel-open unmapped: ${line.trim()}`);
                            } else {
                                let rs = gR / den;
                                let xs = -bSus / den;
                                parsedLoads.push(`${pos}, 1, ${formatNum(rs)}, ${formatNum(xs)}`);
                                ld1Notes.push({ key: 'n2m.ld1.parallelEquiv', params: { tag, r: p1, l: p2, c: p3, f: parsedFreq, rs: formatNum(rs), xs: formatNum(xs) } });
                                unsupportedErrors.push(`LD 2 parallel->series @F1=${parsedFreq}MHz (${formatNum(rs)}+j${formatNum(xs)}Ω): ${line.trim()}`);
                            }
                        } else {
                            ld1Notes.push({ key: 'n2m.ld1.noFreq', params: { tag } });
                            unsupportedErrors.push(`LD 2 no-frequency unmapped: ${line.trim()}`);
                        }
                    } else if (type === 4) {
                        let gr = p1, gb = p2;
                        let den = gr * gr + gb * gb;
                        if (Math.abs(den) < 1e-30) {
                            ld1Notes.push({ key: 'n2m.ld4.open', params: { tag, g: p1, b: p2 } });
                            unsupportedErrors.push(`LD 4 admittance-open unmapped: ${line.trim()}`);
                        } else {
                            let rs = gr / den;
                            let xs = -gb / den;
                            parsedLoads.push(`${pos}, 1, ${formatNum(rs)}, ${formatNum(xs)}`);
                            ld1Notes.push({ key: 'n2m.ld4.equiv', params: { tag, g: p1, b: p2, rs: formatNum(rs), xs: formatNum(xs) } });
                            unsupportedErrors.push(`LD 4 admittance->impedance (${formatNum(rs)}+j${formatNum(xs)}Ω): ${line.trim()}`);
                        }
                    } else if (type === 5) {
                        ld5Notes.push({ key: 'n2m.ld5', params: { tag, s: p1 } });
                        unsupportedErrors.push(`LD 5 conductivity (no .maa field, set wire material in MMANA): ${line.trim()}`);
                    } else {
                        let typeDescKey = 'n2m.ldType.unknown';
                        if (type === 0) typeDescKey = 'n2m.ldType.seriesRLC';
                        else if (type === 6) typeDescKey = 'n2m.ldType.lcTrap';
                        else if (type === 7) typeDescKey = 'n2m.ldType.insulated';

                        failedLDMsgs.push({ key: 'n2m.failedLD.item', params: { tag, type, descKey: typeDescKey } });
                        unsupportedErrors.push(`LD Type ${type} (${L(typeDescKey)}) unmapped: ${line.trim()}`);
                    }
                }
            }
        }

        return { parsedLoads, failedLDMsgs, ld1Notes, ld5Notes, fuzzyPositionWarnings };
    }

    // 编排函数 (v02 extractFromNec L644-907, 控制流与告警顺序逐字保持; i18n-3: 屏显 L()/结构化条目)
    function extractFromNec(text, showPrompts = false) {
        const lines = text.split('\n');
        let symbols = {};
        let wires = [];

        N2M.state.extractedCMs = [];
        N2M.state.unsupportedErrors = [];

        let { extractedCMs, unknownCardsFound, fuzzyPositionWarnings, geomCardWarnings, header } = parseHeaderCards(lines, symbols, validNecCards);
        N2M.state.extractedCMs = extractedCMs;

        for (let key in symbols) symbols[key] = evalExpr(symbols[key], symbols);

        let parsedFreq = header.rawFreqStr ? evalExpr(header.rawFreqStr, symbols) : "";
        updateTitleInput();

        if (parsedFreq && parsedFreq > 0) {
            N2M.$('freq').value = parseFloat(parsedFreq);
            N2M.$('freq').style.borderColor = "var(--border-color)";
        } else {
            N2M.$('freq').value = "";
            N2M.$('freq').style.borderColor = "var(--danger)";
        }

        N2M.$('g_ground').value = header.groundValue;

        let gmNotes = [];
        wires = collectWires(lines, symbols, 1.0, gmNotes);
        if (gmNotes.length > 0 && showPrompts) {
            alert(L('n2m.alert.gm') + "\n\n" + [...new Set(gmNotes.map(n => L(n.key, n.params)))].map((w, i) => `${i + 1}. ${w}`).join("\n\n"));
        }

        if (showPrompts) {
            if (header.groundWarning) {
                alert("⚠️ " + L(header.groundWarning.key, header.groundWarning.params));
                N2M.state.unsupportedErrors.push(LF(header.groundWarning.key, header.groundWarning.params));
            }
            if (geomCardWarnings.length > 0) {
                let gw = L('n2m.alert.geomCards', { cards: [...new Set(geomCardWarnings)].join(', ') });
                alert(gw);
                N2M.state.unsupportedErrors.push(`Unsupported geometry cards (model incomplete): ${[...new Set(geomCardWarnings)].join(', ')}`);
            }
            if (header.frSweepNote) {
                alert("ℹ️ " + L(header.frSweepNote.key, header.frSweepNote.params));
                N2M.state.unsupportedErrors.push(LF(header.frSweepNote.key, header.frSweepNote.params));
            }
            if (unknownCardsFound.size > 0) {
                alert(L('n2m.alert.unknown', { cards: Array.from(unknownCardsFound).join(', ') }));
            }
            if (header.hasTL) alert(L('n2m.alert.tl'));
        }

        let parsedSources = [];
        let exNotes = [];

        parseExcitation(lines, wires, symbols, parsedSources, exNotes, fuzzyPositionWarnings);

        let ld = { parsedLoads: [], failedLDMsgs: [], ld1Notes: [], ld5Notes: [], fuzzyPositionWarnings: [] };
        if (header.hasLD) {
            ld = parseLoads(lines, wires, symbols, parsedFreq, showPrompts);

            if (ld.failedLDMsgs.length > 0 && showPrompts) {
                alert(L('n2m.alert.failedLD', { rows: ld.failedLDMsgs.map((n, i) => `${i + 1}. ` + L('n2m.failedLD.item', { tag: n.params.tag, type: n.params.type, desc: L(n.params.descKey) })).join("\n") }));
            }
            if (ld.ld1Notes.length > 0 && showPrompts) {
                alert(L('n2m.alert.ld1') + "\n\n" + [...new Set(ld.ld1Notes.map(n => L(n.key, n.params)))].map((w, i) => `${i + 1}. ${w}`).join("\n\n"));
            }
            if (ld.ld5Notes.length > 0 && showPrompts) {
                alert(L('n2m.alert.ld5') + "\n\n" + [...new Set(ld.ld5Notes.map(n => L(n.key, n.params)))].map((w, i) => `${i + 1}. ${w}`).join("\n\n"));
            }
        }

        // fuzzyPosition 合并: EX 侧传入的是 parseHeaderCards 的数组(引用共享), LD 侧返回自己的数组
        let allFuzzy = fuzzyPositionWarnings.concat(ld.fuzzyPositionWarnings);

        if (exNotes.length > 0 && showPrompts) {
            alert(L('n2m.alert.ex') + "\n\n" + [...new Set(exNotes.map(n => L(n.key, n.params)))].map((w, i) => `${i + 1}. ${w}`).join("\n\n"));
        }

        if (allFuzzy.length > 0 && showPrompts) {
            alert(L('n2m.alert.fuzzy') + "\n\n" + [...new Set(allFuzzy.map(n => L(n.key, n.params)))].map((w, i) => `${i + 1}. ${w}`).join("\n\n"));
        }

        if (parsedSources.length > 0) N2M.$('sourceInput').value = parsedSources.join('\n');
        else N2M.$('sourceInput').value = "w1c, 1.0, 0.0";

        N2M.$('loadInput').value = ld.parsedLoads.join('\n');
    }
