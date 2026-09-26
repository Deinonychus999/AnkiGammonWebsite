/**
 * SVG Backgammon Board Renderer
 *
 * Renders backgammon positions as SVG markup with 7 color schemes.
 * Supports counter-clockwise (default) and clockwise orientation.
 *
 * Usage:
 *   var svg = BoardRenderer.render(position, metadata, 'classic', false, 'ccw');
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
    var BY = MARGIN;
    var BEAROFF_W = BEAROFF_AREA - 20;
    var STACK_STEP = CR * 2 + 2;
    var BAR_GAP = CR * 2 + 10;
    var POINT_SLOTS = 5;
    var BAR_SLOTS = 3;
    var DIE_SIZE = 50, DIE_GAP = 15;
    var CUBE_SIZE = 50;

    // Orientation-dependent layout (set per render call)
    var boardX, bearoffX, cubeCX, isCW;

    function setLayout(clockwise) {
        isCW = clockwise;
        if (clockwise) {
            // Clockwise: bearoff on left, cube on right
            boardX = MARGIN + BEAROFF_AREA;
            bearoffX = MARGIN + 10;
            cubeCX = MARGIN + BEAROFF_AREA + PLAYING_W + CUBE_AREA / 2;
        } else {
            // Counter-clockwise: cube on left, bearoff on right
            boardX = MARGIN + CUBE_AREA;
            bearoffX = boardX + PLAYING_W + 10;
            cubeCX = (MARGIN + CUBE_AREA) / 2;
        }
    }

    // Mirror point-to-visual-position mapping (matches xg2anki Python renderer)
    function getVisualIndex(pn) {
        if (isCW) return (pn <= 12) ? (12 - pn) : (36 - pn);
        return pn - 1;
    }

    function pointAtVisualIndex(vi) {
        if (isCW) return vi < 12 ? 12 - vi : 36 - vi;
        return vi + 1;
    }

    function render(position, metadata, schemeName, swapped, orientation) {
        var base = SCHEMES[schemeName] || SCHEMES.classic;
        var meta = metadata || {};
        var s = Object.assign({}, base);
        if (swapped) {
            s.checkerX = base.checkerO;
            s.checkerO = base.checkerX;
        }
        // Dice take the colour of the checkers on roll: the scheme's pale dice
        // for the pale checker, dark dice with pale pips for the dark one.
        if ((meta.onRoll === 'X') !== !!swapped) {
            s.diceColor = base.checkerX;
            s.dicePipColor = base.diceColor;
        }
        setLayout(orientation === 'cw');
        var parts = [];

        parts.push('<svg viewBox="0 0 ' + WIDTH + ' ' + HEIGHT + '" xmlns="http://www.w3.org/2000/svg" class="backgammon-board">');
        parts.push(generateStyles(s));

        // Backgrounds
        parts.push('<rect x="0" y="0" width="' + WIDTH + '" height="' + HEIGHT + '" fill="' + s.boardLight + '"/>');
        parts.push('<rect x="' + boardX + '" y="' + BY + '" width="' + PLAYING_W + '" height="' + BOARD_H + '" fill="' + s.boardLight + '" stroke="' + s.boardDark + '" stroke-width="3"/>');

        // Bar
        var barX = boardX + HALF_W;
        parts.push('<rect x="' + barX + '" y="' + BY + '" width="' + BAR_W + '" height="' + BOARD_H + '" fill="' + s.bar + '" stroke="' + s.boardDark + '" stroke-width="2"/>');

        // Points
        parts.push(drawPoints(s));

        // Checkers
        parts.push(drawCheckers(position, s));

        // Bear-off
        parts.push(drawBearoff(position, s));

        // Dice
        if (meta.dice) parts.push(drawDice(meta.dice, meta.onRoll, s));

        // Cube
        parts.push(drawCube(meta.cubeValue || 1, meta.cubeOwner || 'centered', s));

        // Pip counts
        parts.push(drawPipCounts(position, s));

        // Scores
        if (meta.matchLength > 0) {
            parts.push(drawScores(meta.scoreX || 0, meta.scoreO || 0, meta.matchLength, s));
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
            var vi = getVisualIndex(pn);
            var x, yBase, yTip, color, labelY;

            if (vi < 6) {
                // Bottom right
                x = boardX + HALF_W + BAR_W + (5 - vi) * POINT_W;
                yBase = BY + BOARD_H; yTip = yBase - POINT_H;
                labelY = yBase + 13;
            } else if (vi < 12) {
                // Bottom left
                x = boardX + (11 - vi) * POINT_W;
                yBase = BY + BOARD_H; yTip = yBase - POINT_H;
                labelY = yBase + 13;
            } else if (vi < 18) {
                // Top left
                x = boardX + (vi - 12) * POINT_W;
                yBase = BY; yTip = yBase + POINT_H;
                labelY = yBase - 5;
            } else {
                // Top right
                x = boardX + HALF_W + BAR_W + (vi - 18) * POINT_W;
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
        var vi = getVisualIndex(pointIdx);
        var x, yBase, isTop;
        if (vi < 6) {
            x = boardX + HALF_W + BAR_W + (5 - vi) * POINT_W;
            yBase = BY + BOARD_H; isTop = false;
        } else if (vi < 12) {
            x = boardX + (11 - vi) * POINT_W;
            yBase = BY + BOARD_H; isTop = false;
        } else if (vi < 18) {
            x = boardX + (vi - 12) * POINT_W;
            yBase = BY; isTop = true;
        } else {
            x = boardX + HALF_W + BAR_W + (vi - 18) * POINT_W;
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

    function drawCheckers(pos, s) {
        var out = ['<g class="checkers">'];

        for (var pi = 1; pi <= 24; pi++) {
            var count = pos.points[pi];
            if (count === 0) continue;

            var pClass = count > 0 ? 'checker-x' : 'checker-o';
            var absCount = Math.abs(count);
            var pp = getPointPosition(pi);
            var cx = pp.x + POINT_W / 2;

            var visible = Math.min(absCount, POINT_SLOTS);
            for (var ci = 0; ci < visible; ci++) {
                var cy = pp.isTop
                    ? pp.yBase + CR + ci * STACK_STEP
                    : pp.yBase - CR - ci * STACK_STEP;
                out.push(checkerSvg(cx, cy, pClass));
            }

            if (absCount > POINT_SLOTS) {
                var lastY = pp.isTop
                    ? pp.yBase + CR + (POINT_SLOTS - 1) * STACK_STEP
                    : pp.yBase - CR - (POINT_SLOTS - 1) * STACK_STEP;
                var tc = count > 0 ? s.checkerO : s.checkerX;
                out.push(checkerWithNum(cx, lastY, pClass, absCount, tc));
            }
        }

        // Bar checkers
        var barCX = boardX + HALF_W + BAR_W / 2;
        var boardCenterY = BY + BOARD_H / 2;

        // X bar (bottom half of bar)
        var xBarCount = Math.max(pos.points[0], 0);
        if (xBarCount > 0) {
            var xVis = Math.min(xBarCount, BAR_SLOTS);
            for (var xi = 0; xi < xVis; xi++) {
                var xy = boardCenterY + BAR_GAP + xi * STACK_STEP;
                if (xi === xVis - 1 && xBarCount > BAR_SLOTS) {
                    out.push(checkerWithNum(barCX, xy, 'checker-x', xBarCount, s.checkerO));
                } else {
                    out.push(checkerSvg(barCX, xy, 'checker-x'));
                }
            }
        }

        // O bar (top half of bar)
        var oBarCount = Math.max(-pos.points[25], 0);
        if (oBarCount > 0) {
            var oVis = Math.min(oBarCount, BAR_SLOTS);
            for (var oi = 0; oi < oVis; oi++) {
                var oy = boardCenterY - BAR_GAP - oi * STACK_STEP;
                if (oi === oVis - 1 && oBarCount > BAR_SLOTS) {
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
        var boX = bearoffX;
        var boW = BEAROFF_W;
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

    // The bottom player's dice sit on their home-board side (right when
    // counter-clockwise, left when clockwise); the top player's on the other.
    function diceOrigin(onRoll) {
        var total = 2 * DIE_SIZE + DIE_GAP;
        var leftHalf = isCW !== (onRoll === 'X');
        var dx = leftHalf
            ? boardX + (HALF_W - total) / 2
            : boardX + HALF_W + BAR_W + (HALF_W - total) / 2;
        return { x: dx, y: BY + (BOARD_H - DIE_SIZE) / 2 };
    }

    function drawDice(dice, onRoll, s) {
        var o = diceOrigin(onRoll);
        return '<g class="dice">' +
            drawDie(o.x, o.y, DIE_SIZE, dice[0]) +
            drawDie(o.x + DIE_SIZE + DIE_GAP, o.y, DIE_SIZE, dice[1]) +
            '</g>';
    }

    // ── Cube ────────────────────────────────────────────────────────────

    function cubeTop(cubeOwner) {
        if (cubeOwner === 'centered') return BY + (BOARD_H - CUBE_SIZE) / 2;
        if (cubeOwner === 'o_owns') return BY + BOARD_H - CUBE_SIZE - 10;
        return BY + 10;
    }

    function drawCube(cubeValue, cubeOwner, s) {
        var sz = CUBE_SIZE;
        var cx = cubeCX - sz / 2;
        var cy = cubeTop(cubeOwner);

        var text = cubeOwner === 'centered' ? '64' : '' + cubeValue;

        return '<g class="cube-group">' +
            '<rect class="cube-rect" x="' + cx + '" y="' + cy + '" width="' + sz + '" height="' + sz + '" rx="3"/>' +
            '<text class="cube-text" x="' + (cx + sz / 2) + '" y="' + (cy + sz / 2 + 2) + '">' + text + '</text>' +
            '</g>';
    }

    // ── Pip Counts ──────────────────────────────────────────────────────

    function drawPipCounts(pos, s) {
        var pips = window.PositionParser.calculatePipCounts(pos);
        var tx = bearoffX + 5;
        var topY = BY + 10 + 21;
        var botY = BY + BOARD_H / 2 + 70 + 21;

        return '<g class="pip-counts">' +
            '<text class="pip-count" x="' + tx + '" y="' + topY + '">Pip: ' + pips.x + '</text>' +
            '<text class="pip-count" x="' + tx + '" y="' + botY + '">Pip: ' + pips.o + '</text>' +
            '</g>';
    }

    // ── Scores ──────────────────────────────────────────────────────────

    function drawScores(topScore, bottomScore, matchLength, s) {
        var centerX = bearoffX + BEAROFF_W / 2;
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

    // ── Hit testing ─────────────────────────────────────────────────────

    // Slots count checkers out from the board edge (points) or the bar's
    // centre, so a click on the Nth checker position reads as slot N and a
    // click in the margin beyond a point's base reads as slot 0.
    function stackSlot(distance, firstEdge, maxSlots) {
        if (distance < firstEdge) return 0;
        return Math.min(maxSlots, Math.floor((distance - firstEdge) / STACK_STEP) + 1);
    }

    function pointAt(col, isTop, orientation) {
        setLayout(orientation === 'cw');
        return pointAtVisualIndex(isTop ? 12 + col : 11 - col);
    }

    // Maps a point in SVG coordinates to the board element under it:
    //   { kind: 'point', point, slot, col, isTop }  col 0-11 from the left
    //   { kind: 'bar', player: 'X'|'O', slot }
    //   { kind: 'cube' } or { kind: 'die', index }
    function hitTest(x, y, orientation, metadata) {
        setLayout(orientation === 'cw');
        var meta = metadata || {};
        var inBoard = y >= BY && y <= BY + BOARD_H;
        var centerY = BY + BOARD_H / 2;

        if (inBoard && Math.abs(x - cubeCX) <= CUBE_AREA / 2) return { kind: 'cube' };

        if (meta.dice) {
            var d = diceOrigin(meta.onRoll);
            if (y >= d.y && y <= d.y + DIE_SIZE) {
                if (x >= d.x && x <= d.x + DIE_SIZE) return { kind: 'die', index: 0 };
                var d2 = d.x + DIE_SIZE + DIE_GAP;
                if (x >= d2 && x <= d2 + DIE_SIZE) return { kind: 'die', index: 1 };
            }
        }

        var barX = boardX + HALF_W;
        if (inBoard && x >= barX && x < barX + BAR_W) {
            return {
                kind: 'bar',
                player: y < centerY ? 'O' : 'X',
                slot: stackSlot(Math.abs(y - centerY), BAR_GAP - CR, BAR_SLOTS)
            };
        }

        var col;
        if (x >= boardX && x < barX) col = Math.floor((x - boardX) / POINT_W);
        else if (x >= barX + BAR_W && x < boardX + PLAYING_W) col = 6 + Math.floor((x - barX - BAR_W) / POINT_W);
        else return null;
        col = Math.min(col, 11);

        var isTop = y < centerY;
        return {
            kind: 'point',
            point: pointAtVisualIndex(isTop ? 12 + col : 11 - col),
            slot: stackSlot(isTop ? y - BY : BY + BOARD_H - y, 0, POINT_SLOTS),
            col: col,
            isTop: isTop
        };
    }

    // Where things sit on a rendered board, in SVG units, for drawing on top
    // of it: the n-th checker of a stack (0 at the edge) on a point, either
    // player's half of the bar or the bottom player's tray, the dice, and
    // the middle of the half the dice aren't on.
    function geometry(orientation, onRoll) {
        setLayout(orientation === 'cw');
        var centerY = BY + BOARD_H / 2;
        var barCX = boardX + HALF_W + BAR_W / 2;
        var points = [];
        for (var p = 1; p <= 24; p++) {
            var pp = getPointPosition(p);
            points[p] = { x: pp.x, w: POINT_W, yBase: pp.yBase, isTop: pp.isTop };
        }
        var tray = { x: bearoffX, y: centerY + 70, w: BEAROFF_W, h: BOARD_H / 2 - 80 };
        var d = diceOrigin(onRoll || 'O');
        var diceLeft = d.x < barCX;
        return {
            radius: CR,
            step: STACK_STEP,
            pointSlots: POINT_SLOTS,
            centerY: centerY,
            points: points,
            tray: tray,
            dice: [
                { x: d.x, y: d.y, size: DIE_SIZE },
                { x: d.x + DIE_SIZE + DIE_GAP, y: d.y, size: DIE_SIZE }
            ],
            otherHalf: { x: diceLeft ? boardX + HALF_W + BAR_W + HALF_W / 2 : boardX + HALF_W / 2, y: centerY },
            checker: function (where, index) {
                var i = Math.max(0, index);
                if (where === 'barO') return { x: barCX, y: centerY - BAR_GAP - Math.min(i, BAR_SLOTS - 1) * STACK_STEP };
                if (where === 'barX') return { x: barCX, y: centerY + BAR_GAP + Math.min(i, BAR_SLOTS - 1) * STACK_STEP };
                if (where === 'off') return { x: tray.x + tray.w / 2, y: tray.y + tray.h / 2 };
                var pt = points[where];
                var slot = Math.min(i, POINT_SLOTS - 1);
                return { x: pt.x + POINT_W / 2, y: pt.isTop ? pt.yBase + CR + slot * STACK_STEP : pt.yBase - CR - slot * STACK_STEP };
            }
        };
    }

    // ── Public API ──────────────────────────────────────────────────────

    window.BoardRenderer = {
        render: render,
        hitTest: hitTest,
        pointAt: pointAt,
        geometry: geometry,
        POINT_SLOTS: POINT_SLOTS,
        BAR_SLOTS: BAR_SLOTS,
        SCHEMES: SCHEMES
    };
})();
