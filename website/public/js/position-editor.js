/**
 * Position Editor — edit operations on a parsed position
 *
 * Works on the { position, metadata } model from PositionParser: O is the
 * bottom player (negative counts) and X the top player (positive counts).
 * Parsed positions put the player on roll at the bottom, but the editor lets
 * either side be on roll so the board never turns mid-edit. Checker edits
 * follow eXtreme Gammon's setup mode: a click sets a point to the number of
 * checkers at the clicked height.
 */
(function () {
    'use strict';

    var CHECKERS = 15;
    var MAX_CUBE_LOG = 6;
    var MAX_MATCH_LENGTH = 99;
    var STARTING_XGID = 'XGID=-b----E-C---eE---c-e----B-:0:0:1:00:0:0:0:0:10';

    function sign(player) {
        return player === 'X' ? 1 : -1;
    }

    function barIndex(player) {
        return player === 'X' ? 0 : 25;
    }

    function countOf(pos, index, player) {
        var c = pos.points[index] * sign(player);
        return c > 0 ? c : 0;
    }

    function onBoard(pos, player) {
        var n = 0;
        for (var i = 0; i < 26; i++) n += countOf(pos, i, player);
        return n;
    }

    function updateBorneOff(pos) {
        pos.xOff = CHECKERS - onBoard(pos, 'X');
        pos.oOff = CHECKERS - onBoard(pos, 'O');
    }

    function occupant(pos, index) {
        var c = pos.points[index];
        return c > 0 ? 'X' : (c < 0 ? 'O' : null);
    }

    // Any opponent checkers on the point go to their tray. Returns false when
    // the player ran out of checkers before reaching `count`.
    function setCount(pos, index, player, count) {
        var spare = CHECKERS - onBoard(pos, player) + countOf(pos, index, player);
        var n = Math.max(0, Math.min(count, spare));
        if (n === 0 && count > 0) return false;
        pos.points[index] = n ? n * sign(player) : 0;
        updateBorneOff(pos);
        return n === count;
    }

    // `repeat` is true for a fresh click: clicking the top slot of a full stack
    // adds one more checker. While dragging, the top slot means "at least full".
    function applySlot(pos, index, player, slot, maxSlots, repeat) {
        var own = countOf(pos, index, player);
        if (slot === maxSlots && own >= maxSlots) {
            return repeat ? setCount(pos, index, player, own + 1) : true;
        }
        return setCount(pos, index, player, slot);
    }

    function addOne(pos, index, player) {
        var p = occupant(pos, index) || player;
        return setCount(pos, index, p, countOf(pos, index, p) + 1);
    }

    function removeOne(pos, index) {
        var p = occupant(pos, index);
        if (p) setCount(pos, index, p, countOf(pos, index, p) - 1);
    }

    function isEmpty(pos) {
        for (var i = 0; i < 26; i++) if (pos.points[i] !== 0) return false;
        return true;
    }

    function clearBoard(pos) {
        for (var i = 0; i < 26; i++) pos.points[i] = 0;
        updateBorneOff(pos);
    }

    function setStartingPosition(pos) {
        pos.points = window.PositionParser.parse(STARTING_XGID).position.points;
        updateBorneOff(pos);
    }

    // ── Cube and dice ───────────────────────────────────────────────────

    // The cube sits on one track: top player's 64 ... top 2, centred 1,
    // bottom 2 ... bottom 64. Each click moves it one step toward a player.
    function cubeTrack(meta) {
        if (meta.cubeOwner === 'centered') return 0;
        var log = Math.round(Math.log(meta.cubeValue || 1) / Math.LN2);
        return meta.cubeOwner === 'o_owns' ? log : -log;
    }

    function stepCube(meta, towardBottom) {
        var t = cubeTrack(meta) + (towardBottom ? 1 : -1);
        t = Math.max(-MAX_CUBE_LOG, Math.min(MAX_CUBE_LOG, t));
        meta.cubeOwner = t === 0 ? 'centered' : (t > 0 ? 'o_owns' : 'x_owns');
        meta.cubeValue = Math.pow(2, Math.abs(t));
    }

    function cycleDie(meta, index, delta) {
        meta.dice[index] = (meta.dice[index] - 1 + delta + 6) % 6 + 1;
    }

    function positionType(meta) {
        if (meta.cubeAction) return 'take';
        return meta.dice ? 'checker' : 'double';
    }

    function setPositionType(meta, type, dice) {
        meta.cubeAction = type === 'take' ? 'D' : null;
        meta.dice = type === 'checker' ? dice.slice() : null;
    }

    // ── Turn and match ──────────────────────────────────────────────────

    function switchTurn(meta) {
        meta.onRoll = meta.onRoll === 'X' ? 'O' : 'X';
    }

    function canCrawford(meta) {
        var ml = meta.matchLength || 0;
        return ml > 0 && (meta.scoreO === ml - 1 || meta.scoreX === ml - 1);
    }

    function clampInt(value, min, max) {
        var n = parseInt(value, 10);
        if (isNaN(n)) n = min;
        return Math.max(min, Math.min(max, n));
    }

    function setMatch(meta, matchLength, scoreBottom, scoreTop) {
        var ml = clampInt(matchLength, 0, MAX_MATCH_LENGTH);
        meta.matchLength = ml;
        meta.scoreO = ml ? clampInt(scoreBottom, 0, ml - 1) : 0;
        meta.scoreX = ml ? clampInt(scoreTop, 0, ml - 1) : 0;
        if (!canCrawford(meta)) meta.crawford = false;
        if (ml) {
            meta.jacoby = false;
            meta.beaversAllowed = false;
        }
    }

    // Round-trip fields from the source ID describe the unedited position, so
    // the encoders must fall back to the edited checkers, cube and dice.
    function forgetSourceFormat(meta) {
        delete meta._xgidRules;
        delete meta._ogidCentre;
        delete meta._ogidColor;
        delete meta._ogidState;
        delete meta._ogidMatch;
        delete meta._ogidMoveId;
    }

    // ── Public API ──────────────────────────────────────────────────────

    window.PositionEditor = {
        STARTING_XGID: STARTING_XGID,
        barIndex: barIndex,
        countOf: countOf,
        occupant: occupant,
        applySlot: applySlot,
        addOne: addOne,
        removeOne: removeOne,
        setCount: setCount,
        isEmpty: isEmpty,
        clearBoard: clearBoard,
        setStartingPosition: setStartingPosition,
        stepCube: stepCube,
        cycleDie: cycleDie,
        positionType: positionType,
        setPositionType: setPositionType,
        switchTurn: switchTurn,
        canCrawford: canCrawford,
        setMatch: setMatch,
        forgetSourceFormat: forgetSourceFormat
    };
})();
