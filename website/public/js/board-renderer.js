/**
 * SVG Backgammon Board Renderer
 *
 * Renders backgammon positions as SVG markup with 7 color schemes.
 * Counter-clockwise orientation only (standard layout).
 *
 * Usage:
 *   var renderer = new BoardRenderer();
 *   var svg = renderer.render(position, metadata, 'classic');
 */
(function () {
    'use strict';

    // ── Color Schemes ───────────────────────────────────────────────────

    var SCHEMES = {
        classic: {
            name: 'Classic',
            boardLight: '#DEB887', boardDark: '#8B4513',
            pointLight: '#F5DEB3', pointDark: '#8B4513',
            checkerX: '#000000', checkerO: '#FFFFFF',
            checkerBorder: '#333333', bar: '#654321',
            text: '#000000', bearoff: '#DEB887',
            diceColor: '#FFFFFF', dicePipColor: '#000000',
            cubeFill: '#FFD700', cubeText: '#000000'
        },
        forest: {
            name: 'Forest',
            boardLight: '#A8C5A0', boardDark: '#3D5A3D',
            pointLight: '#C9D9C4', pointDark: '#5F7A5F',
            checkerX: '#6B4423', checkerO: '#F5F5DC',
            checkerBorder: '#3D5A3D', bar: '#4A6147',
            text: '#000000', bearoff: '#A8C5A0',
            diceColor: '#F5F5DC', dicePipColor: '#000000',
            cubeFill: '#FFD700', cubeText: '#000000'
        },
        ocean: {
            name: 'Ocean',
            boardLight: '#87CEEB', boardDark: '#191970',
            pointLight: '#B0E0E6', pointDark: '#4682B4',
            checkerX: '#8B0000', checkerO: '#FFFACD',
            checkerBorder: '#191970', bar: '#1E3A5F',
            text: '#000000', bearoff: '#87CEEB',
            diceColor: '#FFFACD', dicePipColor: '#000000',
            cubeFill: '#FFD700', cubeText: '#000000'
        },
        desert: {
            name: 'Desert',
            boardLight: '#D4A574', boardDark: '#8B6F47',
            pointLight: '#E8C9A0', pointDark: '#B8956A',
            checkerX: '#6B4E71', checkerO: '#FFF8DC',
            checkerBorder: '#6B4E71', bar: '#9B7653',
            text: '#000000', bearoff: '#D4A574',
            diceColor: '#FFF8DC', dicePipColor: '#000000',
            cubeFill: '#FFD700', cubeText: '#000000'
        },
        sunset: {
            name: 'Sunset',
            boardLight: '#D4825A', boardDark: '#5C3317',
            pointLight: '#E69B7B', pointDark: '#B8552F',
            checkerX: '#4A1E1E', checkerO: '#FFF5E6',
            checkerBorder: '#5C3317', bar: '#8B4726',
            text: '#000000', bearoff: '#D4825A',
            diceColor: '#FFF5E6', dicePipColor: '#000000',
            cubeFill: '#FFD700', cubeText: '#000000'
        },
        midnight: {
            name: 'Midnight',
            boardLight: '#2F4F4F', boardDark: '#000000',
            pointLight: '#708090', pointDark: '#1C1C1C',
            checkerX: '#DC143C', checkerO: '#E6E6FA',
            checkerBorder: '#000000', bar: '#0F0F0F',
            text: '#FFFFFF', bearoff: '#2F4F4F',
            diceColor: '#E6E6FA', dicePipColor: '#000000',
            cubeFill: '#FFD700', cubeText: '#000000'
        },
        monochrome: {
            name: 'Monochrome',
            boardLight: '#FFFFFF', boardDark: '#000000',
            pointLight: '#FFFFFF', pointDark: '#B0B0B0',
            checkerX: '#000000', checkerO: '#FFFFFF',
            checkerBorder: '#000000', bar: '#FFFFFF',
            text: '#000000', bearoff: '#FFFFFF',
            diceColor: '#FFFFFF', dicePipColor: '#000000',
            cubeFill: '#FFFFFF', cubeText: '#000000'
        }
    };

    // ── Renderer ────────────────────────────────────────────────────────

    var WIDTH = 880;
    var HEIGHT = 600;
    var MARGIN = 20;
    var CUBE_AREA = 70;
    var BEAROFF_AREA = 100;
    var PLAYING_W = 900 - 2 * MARGIN - CUBE_AREA - BEAROFF_AREA; // 690
    var BOARD_H = HEIGHT - 2 * MARGIN; // 560
    var BAR_W = PLAYING_W * 0.08;
    var HALF_W = (PLAYING_W - BAR_W) / 2;
    var POINT_W = HALF_W / 6;
    var POINT_H = BOARD_H * 0.45;
    var CR = Math.min(POINT_W * 0.45, 25); // checker radius

    // Board x (counter-clockwise: cube on left, bearoff on right)
    var BX = MARGIN + CUBE_AREA;
    var BY = MARGIN;

    function render(position, metadata, schemeName, swapped) {
        var s = SCHEMES[schemeName] || SCHEMES.classic;
        if (swapped) {
            s = Object.assign({}, s);
            var tmp = s.checkerX;
            s.checkerX = s.checkerO;
            s.checkerO = tmp;
        }
        var meta = metadata || {};
        var onRoll = meta.onRoll || 'O';
        var flipped = (onRoll === 'X');
        var parts = [];

        parts.push('<svg viewBox="0 0 ' + WIDTH + ' ' + HEIGHT + '" xmlns="http://www.w3.org/2000/svg" class="backgammon-board">');
        parts.push(generateStyles(s));

        // Backgrounds
        parts.push('<rect x="0" y="0" width="' + WIDTH + '" height="' + HEIGHT + '" fill="' + s.boardLight + '"/>');
        parts.push('<rect x="' + BX + '" y="' + BY + '" width="' + PLAYING_W + '" height="' + BOARD_H + '" fill="' + s.boardLight + '" stroke="' + s.boardDark + '" stroke-width="3"/>');

        // Bar
        var barX = BX + HALF_W;
        parts.push('<rect x="' + barX + '" y="' + BY + '" width="' + BAR_W + '" height="' + BOARD_H + '" fill="' + s.bar + '" stroke="' + s.boardDark + '" stroke-width="2"/>');

        // Points
        parts.push(drawPoints(s));

        // Checkers
        parts.push(drawCheckers(position, s, flipped));

        // Bear-off
        parts.push(drawBearoff(position, s));

        // Dice
        if (meta.dice) parts.push(drawDice(meta.dice, s));

        // Cube
        parts.push(drawCube(meta.cubeValue || 1, meta.cubeOwner || 'centered', s, flipped));

        // Pip counts
        parts.push(drawPipCounts(position, s));

        // Scores
        if (meta.matchLength > 0) {
            var topScore, bottomScore;
            if (onRoll === 'X') {
                topScore = meta.scoreO || 0;
                bottomScore = meta.scoreX || 0;
            } else {
                topScore = meta.scoreX || 0;
                bottomScore = meta.scoreO || 0;
            }
            parts.push(drawScores(topScore, bottomScore, meta.matchLength, s));
        }

        parts.push('</svg>');
        return parts.join('');
    }

    // ── Styles ──────────────────────────────────────────────────────────

    function generateStyles(s) {
        return '<defs><style>' +
            '.backgammon-board{max-width:100%;height:auto}' +
            '.point{stroke:' + s.boardDark + ';stroke-width:1}' +
            '.checker{stroke:' + s.checkerBorder + ';stroke-width:2}' +
            '.checker-x{fill:' + s.checkerX + '}' +
            '.checker-o{fill:' + s.checkerO + '}' +
            '.checker-text{font-family:Arial,sans-serif;font-weight:bold;text-anchor:middle;dominant-baseline:middle;pointer-events:none}' +
            '.point-label{font-family:Arial,sans-serif;font-size:10px;fill:' + s.text + ';text-anchor:middle}' +
            '.pip-count{font-family:Arial,sans-serif;font-size:16px;fill:' + s.text + '}' +
            '.die{fill:' + s.diceColor + ';stroke:' + s.dicePipColor + ';stroke-width:2}' +
            '.die-pip{fill:' + s.dicePipColor + '}' +
            '.cube-rect{fill:' + s.cubeFill + ';stroke:' + s.cubeText + ';stroke-width:2}' +
            '.cube-text{font-family:Arial,sans-serif;font-size:32px;font-weight:bold;fill:' + s.cubeText + ';text-anchor:middle;dominant-baseline:middle}' +
            '</style></defs>';
    }

    // ── Points ──────────────────────────────────────────────────────────

    function drawPoints(s) {
        var out = ['<g class="points">'];
        for (var pn = 1; pn <= 24; pn++) {
            var vi = pn - 1; // visual index (counter-clockwise)
            var x, yBase, yTip, color, labelY;

            if (vi < 6) {
                // Bottom right
                x = BX + HALF_W + BAR_W + (5 - vi) * POINT_W;
                yBase = BY + BOARD_H; yTip = yBase - POINT_H;
                labelY = yBase + 13;
            } else if (vi < 12) {
                // Bottom left
                x = BX + (11 - vi) * POINT_W;
                yBase = BY + BOARD_H; yTip = yBase - POINT_H;
                labelY = yBase + 13;
            } else if (vi < 18) {
                // Top left
                x = BX + (vi - 12) * POINT_W;
                yBase = BY; yTip = yBase + POINT_H;
                labelY = yBase - 5;
            } else {
                // Top right
                x = BX + HALF_W + BAR_W + (vi - 18) * POINT_W;
                yBase = BY; yTip = yBase + POINT_H;
                labelY = yBase - 5;
            }

            color = (pn % 2 === 1) ? s.pointDark : s.pointLight;
            var xMid = x + POINT_W / 2;

            out.push('<polygon class="point" points="' + x + ',' + yBase + ' ' + (x + POINT_W) + ',' + yBase + ' ' + xMid + ',' + yTip + '" fill="' + color + '"/>');
            out.push('<text class="point-label" x="' + xMid + '" y="' + labelY + '">' + pn + '</text>');
        }
        out.push('</g>');
        return out.join('');
    }

    // ── Checkers ────────────────────────────────────────────────────────

    function getPointPosition(pointIdx) {
        var vi = pointIdx - 1;
        var x, yBase, isTop;
        if (vi < 6) {
            x = BX + HALF_W + BAR_W + (5 - vi) * POINT_W;
            yBase = BY + BOARD_H; isTop = false;
        } else if (vi < 12) {
            x = BX + (11 - vi) * POINT_W;
            yBase = BY + BOARD_H; isTop = false;
        } else if (vi < 18) {
            x = BX + (vi - 12) * POINT_W;
            yBase = BY; isTop = true;
        } else {
            x = BX + HALF_W + BAR_W + (vi - 18) * POINT_W;
            yBase = BY; isTop = true;
        }
        return { x: x, yBase: yBase, isTop: isTop };
    }

    function checkerSvg(cx, cy, playerClass) {
        return '<circle class="checker ' + playerClass + '" cx="' + cx + '" cy="' + cy + '" r="' + CR + '"/>';
    }

    function checkerWithNum(cx, cy, playerClass, num, textColor) {
        return '<circle class="checker ' + playerClass + '" cx="' + cx + '" cy="' + cy + '" r="' + CR + '"/>' +
               '<text class="checker-text" x="' + cx + '" y="' + cy + '" font-size="' + (CR * 1.2) + '" fill="' + textColor + '">' + num + '</text>';
    }

    function drawCheckers(pos, s, flipped) {
        var out = ['<g class="checkers">'];

        for (var pi = 1; pi <= 24; pi++) {
            var count = pos.points[pi];
            if (count === 0) continue;

            var pClass = count > 0 ? 'checker-x' : 'checker-o';
            var absCount = Math.abs(count);
            var pp = getPointPosition(pi);
            var cx = pp.x + POINT_W / 2;

            var visible = Math.min(absCount, 5);
            for (var ci = 0; ci < visible; ci++) {
                var cy = pp.isTop
                    ? pp.yBase + CR + ci * (CR * 2 + 2)
                    : pp.yBase - CR - ci * (CR * 2 + 2);
                out.push(checkerSvg(cx, cy, pClass));
            }

            if (absCount > 5) {
                var lastY = pp.isTop
                    ? pp.yBase + CR + 4 * (CR * 2 + 2)
                    : pp.yBase - CR - 4 * (CR * 2 + 2);
                var tc = count > 0 ? s.checkerO : s.checkerX;
                out.push(checkerWithNum(cx, lastY, pClass, absCount, tc));
            }
        }

        // Bar checkers
        var barCX = BX + HALF_W + BAR_W / 2;
        var boardCenterY = BY + BOARD_H / 2;
        var sepOff = CR * 2 + 10;

        // X bar (bottom half of bar)
        var xBarCount = Math.max(pos.points[0], 0);
        if (xBarCount > 0) {
            var xVis = Math.min(xBarCount, 3);
            for (var xi = 0; xi < xVis; xi++) {
                var xy = boardCenterY + sepOff + xi * (CR * 2 + 2);
                if (xi === xVis - 1 && xBarCount > 3) {
                    out.push(checkerWithNum(barCX, xy, 'checker-x', xBarCount, s.checkerO));
                } else {
                    out.push(checkerSvg(barCX, xy, 'checker-x'));
                }
            }
        }

        // O bar (top half of bar)
        var oBarCount = Math.max(-pos.points[25], 0);
        if (oBarCount > 0) {
            var oVis = Math.min(oBarCount, 3);
            for (var oi = 0; oi < oVis; oi++) {
                var oy = boardCenterY - sepOff - oi * (CR * 2 + 2);
                if (oi === oVis - 1 && oBarCount > 3) {
                    out.push(checkerWithNum(barCX, oy, 'checker-o', oBarCount, s.checkerX));
                } else {
                    out.push(checkerSvg(barCX, oy, 'checker-o'));
                }
            }
        }

        out.push('</g>');
        return out.join('');
    }

    // ── Bear-off ────────────────────────────────────────────────────────

    function drawBearoff(pos, s) {
        var out = ['<g class="bearoff">'];
        var boX = BX + PLAYING_W + 10;
        var boW = BEAROFF_AREA - 20;
        var cw = 10, ch = 50, csx = 3, csy = 4, cpr = 5;

        // Top tray (X)
        var trayTop = BY + 10;
        var trayBot = BY + BOARD_H / 2 - 70;
        out.push('<rect x="' + boX + '" y="' + trayTop + '" width="' + boW + '" height="' + (trayBot - trayTop) + '" fill="' + s.bearoff + '" stroke="' + s.boardDark + '" stroke-width="2"/>');

        var xOff = Math.max(pos.xOff, 0);
        if (xOff > 0) {
            var rw = cpr * cw + (cpr - 1) * csx;
            var sx = boX + (boW - rw) / 2;
            var sy = trayBot - 10 - ch;
            for (var i = 0; i < xOff; i++) {
                var row = Math.floor(i / cpr), col = i % cpr;
                out.push('<rect x="' + (sx + col * (cw + csx)) + '" y="' + (sy - row * (ch + csy)) + '" width="' + cw + '" height="' + ch + '" fill="' + s.checkerX + '" stroke="' + s.checkerBorder + '" stroke-width="1"/>');
            }
        }

        // Bottom tray (O)
        var trayTop2 = BY + BOARD_H / 2 + 70;
        var trayBot2 = BY + BOARD_H - 10;
        out.push('<rect x="' + boX + '" y="' + trayTop2 + '" width="' + boW + '" height="' + (trayBot2 - trayTop2) + '" fill="' + s.bearoff + '" stroke="' + s.boardDark + '" stroke-width="2"/>');

        var oOff = Math.max(pos.oOff, 0);
        if (oOff > 0) {
            var rw2 = cpr * cw + (cpr - 1) * csx;
            var sx2 = boX + (boW - rw2) / 2;
            var sy2 = trayBot2 - 10 - ch;
            for (var j = 0; j < oOff; j++) {
                var row2 = Math.floor(j / cpr), col2 = j % cpr;
                out.push('<rect x="' + (sx2 + col2 * (cw + csx)) + '" y="' + (sy2 - row2 * (ch + csy)) + '" width="' + cw + '" height="' + ch + '" fill="' + s.checkerO + '" stroke="' + s.checkerBorder + '" stroke-width="1"/>');
            }
        }

        out.push('</g>');
        return out.join('');
    }

    // ── Dice ────────────────────────────────────────────────────────────

    var PIP_POS = {
        1: [[0.5, 0.5]],
        2: [[0.25, 0.25], [0.75, 0.75]],
        3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
        4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
        5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
        6: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.5], [0.75, 0.5], [0.25, 0.75], [0.75, 0.75]]
    };

    function drawDie(x, y, sz, val) {
        var out = '<rect class="die" x="' + x + '" y="' + y + '" width="' + sz + '" height="' + sz + '" rx="5"/>';
        var pr = sz / 10;
        var pips = PIP_POS[val] || [];
        for (var i = 0; i < pips.length; i++) {
            out += '<circle class="die-pip" cx="' + (x + pips[i][0] * sz) + '" cy="' + (y + pips[i][1] * sz) + '" r="' + pr + '"/>';
        }
        return out;
    }

    function drawDice(dice, s) {
        var sz = 50, sp = 15;
        var total = 2 * sz + sp;
        var rhStart = BX + HALF_W + BAR_W;
        var dx = rhStart + (HALF_W - total) / 2;
        var dy = BY + (BOARD_H - sz) / 2;

        return '<g class="dice">' +
            drawDie(dx, dy, sz, dice[0]) +
            drawDie(dx + sz + sp, dy, sz, dice[1]) +
            '</g>';
    }

    // ── Cube ────────────────────────────────────────────────────────────

    function drawCube(cubeValue, cubeOwner, s, flipped) {
        var sz = 50;
        var areaCenter = (MARGIN + CUBE_AREA) / 2;
        var cx = areaCenter - sz / 2;
        var cy;

        if (cubeOwner === 'centered') {
            cy = BY + (BOARD_H - sz) / 2;
        } else if (cubeOwner === 'o_owns') {
            cy = flipped ? BY + 10 : BY + BOARD_H - sz - 10;
        } else { // x_owns
            cy = flipped ? BY + BOARD_H - sz - 10 : BY + 10;
        }

        var text = cubeOwner === 'centered' ? '64' : '' + cubeValue;

        return '<g class="cube-group">' +
            '<rect class="cube-rect" x="' + cx + '" y="' + cy + '" width="' + sz + '" height="' + sz + '" rx="3"/>' +
            '<text class="cube-text" x="' + (cx + sz / 2) + '" y="' + (cy + sz / 2 + 2) + '">' + text + '</text>' +
            '</g>';
    }

    // ── Pip Counts ──────────────────────────────────────────────────────

    function drawPipCounts(pos, s) {
        var pips = window.PositionParser.calculatePipCounts(pos);
        var tx = BX + PLAYING_W + 15;
        var topY = BY + 10 + 21;
        var botY = BY + BOARD_H / 2 + 70 + 21;

        return '<g class="pip-counts">' +
            '<text class="pip-count" x="' + tx + '" y="' + topY + '">Pip: ' + pips.x + '</text>' +
            '<text class="pip-count" x="' + tx + '" y="' + botY + '">Pip: ' + pips.o + '</text>' +
            '</g>';
    }

    // ── Scores ──────────────────────────────────────────────────────────

    function drawScores(topScore, bottomScore, matchLength, s) {
        var boX = BX + PLAYING_W + 10;
        var boW = BEAROFF_AREA - 20;
        var centerX = boX + boW / 2;
        var centerY = BY + BOARD_H / 2;
        var bw = 60, bh = 35, bsp = 5;
        var totalH = 3 * bh + 2 * bsp;
        var startY = centerY - totalH / 2;

        return '<g class="match-scores">' +
            '<rect x="' + (centerX - bw/2) + '" y="' + startY + '" width="' + bw + '" height="' + bh + '" fill="' + s.pointDark + '" stroke="' + s.bearoff + '" stroke-width="2"/>' +
            '<text x="' + centerX + '" y="' + (startY + bh/2 + 8) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="22px" font-weight="bold" fill="' + s.text + '">' + topScore + '</text>' +
            '<rect x="' + (centerX - bw/2) + '" y="' + (startY + bh + bsp) + '" width="' + bw + '" height="' + bh + '" fill="' + s.pointDark + '" stroke="' + s.bearoff + '" stroke-width="2"/>' +
            '<text x="' + centerX + '" y="' + (startY + bh + bsp + bh/2 + 7) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="16px" font-weight="bold" fill="' + s.text + '">' + matchLength + 'pt</text>' +
            '<rect x="' + (centerX - bw/2) + '" y="' + (startY + 2*bh + 2*bsp) + '" width="' + bw + '" height="' + bh + '" fill="' + s.pointDark + '" stroke="' + s.bearoff + '" stroke-width="2"/>' +
            '<text x="' + centerX + '" y="' + (startY + 2*bh + 2*bsp + bh/2 + 8) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="22px" font-weight="bold" fill="' + s.text + '">' + bottomScore + '</text>' +
            '</g>';
    }

    // ── Public API ──────────────────────────────────────────────────────

    window.BoardRenderer = {
        render: render,
        SCHEMES: SCHEMES
    };
})();
