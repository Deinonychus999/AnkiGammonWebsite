/**
 * MAT Format Writer
 *
 * Converts a parsed XG match object into Jellyfish .mat text format,
 * compatible with GnuBG, Backgammon Studio, and other tools.
 *
 * .mat format reference: Jellyfish match format (plain text).
 */
(function () {
    'use strict';

    var LEFT_COL_WIDTH = 42;

    /**
     * Convert a single XG move sub-move to .mat notation.
     * XG uses 0-based points (0-23), 24 for bar, -1 for off/end.
     * .mat uses 1-based points (1-24), 25 for bar, 0 for off.
     * Conveniently: .mat_point = xg_point + 1
     */
    function pointToStr(xgPoint) {
        var p = xgPoint + 1;
        if (p < 0) p = 0; // clamp over-bearoff to 0 (off)
        return String(p);
    }

    /**
     * Format a move's sub-moves from the 8-int moves array.
     * Returns notation like "24/18 13/9" or "" for no moves.
     */
    function formatSubMoves(moves) {
        var parts = [];
        for (var i = 0; i < 8; i += 2) {
            var from = moves[i];
            var to = moves[i + 1];
            // -1 as "from" signals end of move list
            if (from === -1) break;
            // skip non-moves (corrupt data: from === to)
            if (from === to) continue;
            parts.push(pointToStr(from) + '/' + pointToStr(to));
        }
        return parts.join(' ');
    }

    /**
     * Format dice as a two-digit string (e.g., "46", "55").
     */
    function formatDice(dice) {
        var d1 = dice[0], d2 = dice[1];
        if (d1 < d2) { var tmp = d1; d1 = d2; d2 = tmp; }
        return String(d1) + String(d2);
    }

    /**
     * Pad string to a given width with spaces on the right.
     */
    function padRight(str, width) {
        while (str.length < width) str += ' ';
        return str;
    }

    /**
     * Format a move number prefix like "  1) " or " 10) ".
     */
    function formatMoveNum(n) {
        var s = String(n) + ')';
        while (s.length < 3) s = ' ' + s;
        return ' ' + s + ' ';
    }

    /**
     * Get the new cube value after a double (2^(|cubeB|+1) or 2 if centered).
     */
    function getDoubleCubeValue(cubeEntry) {
        var cubeB = cubeEntry.cubeValue;
        if (cubeB === 0) return 2;
        return Math.pow(2, Math.abs(cubeB) + 1);
    }

    /**
     * Write the full .mat text from a parsed match.
     */
    function write(parsed) {
        var match = parsed.match;
        var games = parsed.games;
        var lines = [];

        // Match length header
        if (match.matchLength > 0) {
            lines.push(match.matchLength + ' point match');
        } else {
            lines.push('Unlimited game');
        }
        lines.push('');

        // XG Player mapping for .mat format:
        // XG SPlayer1 (activeP=1) → .mat right column (P2)
        // XG SPlayer2 (activeP≠1) → .mat left column (P1)
        var leftPlayer = match.player2;
        var rightPlayer = match.player1;

        for (var g = 0; g < games.length; g++) {
            var game = games[g];
            var hdr = game.header;

            // Game header
            lines.push(' Game ' + hdr.gameNumber);

            // Score line (swapped: XG score2 = left, score1 = right)
            var scoreLine = ' ' + leftPlayer + ': ' + hdr.score2;
            scoreLine = padRight(scoreLine, LEFT_COL_WIDTH);
            scoreLine += rightPlayer + ': ' + hdr.score1;
            lines.push(scoreLine);

            // Process actions into paired turns
            var moveNum = 1;
            var pendingLeft = null; // string for left column's part of the line

            var actions = game.actions;
            for (var a = 0; a < actions.length; a++) {
                var action = actions[a];

                if (action.type === 'cube') {
                    var cube = action.data;
                    // activePlayer=1 → right column, activePlayer≠1 → left column
                    var isLeft = cube.activePlayer !== 1;
                    var newCubeVal = getDoubleCubeValue(cube);

                    if (cube.double === 1) {
                        var doubleTxt = 'Doubles => ' + newCubeVal;
                        // Determine response text
                        var responseTxt = '';
                        if (cube.take === 1) {
                            responseTxt = 'Takes';
                        } else if (cube.take === 0) {
                            responseTxt = 'Drops';
                        } else if (cube.take === 2) {
                            responseTxt = 'Beavers';
                        }

                        if (isLeft) {
                            // Left doubles, right responds (same line)
                            var leftStr = formatMoveNum(moveNum) + doubleTxt;
                            if (responseTxt) {
                                lines.push(padRight(leftStr, LEFT_COL_WIDTH) + responseTxt);
                            } else {
                                lines.push(padRight(leftStr, LEFT_COL_WIDTH));
                            }
                        } else {
                            // Right doubles
                            if (pendingLeft !== null) {
                                // Pair pending left move with right's double on same line
                                lines.push(padRight(pendingLeft, LEFT_COL_WIDTH) + doubleTxt);
                                pendingLeft = null;
                                moveNum++;
                            } else {
                                lines.push(padRight(formatMoveNum(moveNum), LEFT_COL_WIDTH) + doubleTxt);
                            }
                            // Left responds on next line
                            if (responseTxt) {
                                lines.push(padRight(formatMoveNum(moveNum) + responseTxt, LEFT_COL_WIDTH));
                            }
                        }
                    }
                    continue;
                }

                if (action.type === 'move') {
                    var move = action.data;
                    var diceStr = formatDice(move.dice);
                    var moveStr = formatSubMoves(move.moves);
                    var fullMove = diceStr + ': ' + moveStr;

                    // activePlayer=1 → right column, activePlayer≠1 → left column
                    if (move.activePlayer !== 1) {
                        // Left column move — store as pending
                        pendingLeft = formatMoveNum(moveNum) + fullMove;
                    } else {
                        // Right column move — pair with pending left move
                        var leftPart;
                        if (pendingLeft !== null) {
                            leftPart = pendingLeft;
                        } else {
                            leftPart = formatMoveNum(moveNum);
                        }
                        lines.push(padRight(leftPart, LEFT_COL_WIDTH) + fullMove);
                        pendingLeft = null;
                        moveNum++;
                    }
                }
            }

            // Flush remaining left move if right didn't respond
            if (pendingLeft !== null) {
                lines.push(padRight(pendingLeft, LEFT_COL_WIDTH));
                pendingLeft = null;
            }

            // Game result
            if (game.footer) {
                var pts = game.footer.pointsWon;
                var isLastGame = (g === games.length - 1);
                var resultStr = '   Wins ' + pts + ' point' + (pts !== 1 ? 's' : '');
                if (isLastGame && match.matchLength > 0) {
                    resultStr += ' and the match';
                }
                // Winner: XG winner=1 → right player won, winner≠1 → left player won
                if (game.footer.winner !== 1) {
                    lines.push(padRight(resultStr, LEFT_COL_WIDTH));
                } else {
                    lines.push(padRight('', LEFT_COL_WIDTH) + resultStr.trim());
                }
            }

            lines.push('');
        }

        return lines.join('\n');
    }

    // ── Public API ─────────────────────────────────────────────────────
    window.MATWriter = { write: write };
})();
