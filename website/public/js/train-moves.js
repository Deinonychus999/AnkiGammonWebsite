/**
 * Checker moves for the trainer, independent of the page: legal plays for
 * a roll, applying a move written in XG notation, and writing a play back
 * in that notation.
 *
 * Positions are position-parser.js's with the player on roll as O, which
 * it always makes the bottom player: points[1..24] counted from O's side
 * (O moves from 24 towards 1), O's checkers negative and X's positive,
 * points[25] is O's bar, points[0] X's bar, and oOff counts O's checkers
 * borne off. Move notation is written from the same side, so "bar" is 25
 * and "off" is 0.
 */
(function (root) {
    'use strict';

    var BAR = 25;
    var OFF = 0;

    function clone(pos) {
        return { points: pos.points.slice(), xOff: pos.xOff, oOff: pos.oOff };
    }

    function key(pos) {
        return pos.points.join(',') + '|' + pos.oOff;
    }

    function allHome(pos) {
        if (pos.points[BAR] < 0) return false;
        for (var i = 7; i <= 24; i++) if (pos.points[i] < 0) return false;
        return true;
    }

    function highest(pos) {
        for (var i = 24; i >= 1; i--) if (pos.points[i] < 0) return i;
        return 0;
    }

    /** Where a checker on `from` lands with `die`, or null when it can't move. */
    function target(pos, from, die) {
        if (pos.points[BAR] < 0 && from !== BAR) return null;
        if (pos.points[from] >= 0) return null;
        var to = from - die;
        if (to >= 1) return pos.points[to] >= 2 ? null : to;
        if (!allHome(pos)) return null;
        if (to === 0) return OFF;
        return highest(pos) === from ? OFF : null;
    }

    /** { pos, hit } after moving one checker, legal or not. */
    function hop(pos, from, to) {
        var next = clone(pos);
        var pts = next.points;
        var hit = false;
        pts[from] += 1;
        if (to === OFF) {
            next.oOff += 1;
        } else {
            if (pts[to] === 1) {
                pts[to] = 0;
                pts[0] += 1;
                hit = true;
            }
            pts[to] -= 1;
        }
        return { pos: next, hit: hit };
    }

    function sources(pos) {
        if (pos.points[BAR] < 0) return [BAR];
        var out = [];
        for (var i = 24; i >= 1; i--) if (pos.points[i] < 0) out.push(i);
        return out;
    }

    function diceList(dice) {
        return dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
    }

    function without(list, i) {
        return list.slice(0, i).concat(list.slice(i + 1));
    }

    /**
     * Every legal play for the roll, as { pos, hops } with one entry per
     * distinct final position. A play uses as many dice as it can, and when
     * only one of two different dice can be used, the larger one if possible.
     */
    function legalPlays(pos, dice) {
        var ends = [];
        var seen = {};
        (function walk(p, remaining, hops) {
            var moved = false;
            var triedDie = {};
            remaining.forEach(function (die, i) {
                if (triedDie[die]) return;
                triedDie[die] = true;
                var rest = without(remaining, i);
                sources(p).forEach(function (from) {
                    var to = target(p, from, die);
                    if (to === null) return;
                    moved = true;
                    var r = hop(p, from, to);
                    walk(r.pos, rest, hops.concat([{ from: from, to: to, die: die, hit: r.hit }]));
                });
            });
            if (!moved) {
                var k = key(p) + '#' + hops.length;
                if (!seen[k]) {
                    seen[k] = true;
                    ends.push({ pos: p, hops: hops });
                }
            }
        })(pos, diceList(dice), []);

        var most = ends.reduce(function (m, e) { return Math.max(m, e.hops.length); }, 0);
        var legal = ends.filter(function (e) { return e.hops.length === most; });
        if (most === 1 && dice[0] !== dice[1]) {
            var larger = Math.max(dice[0], dice[1]);
            if (legal.some(function (e) { return e.hops[0].die === larger; })) {
                legal = legal.filter(function (e) { return e.hops[0].die === larger; });
            }
        }
        var byPos = {};
        return legal.filter(function (e) {
            var k = key(e.pos);
            if (byPos[k]) return false;
            byPos[k] = true;
            return true;
        });
    }

    function pointOf(text) {
        if (text === 'bar') return BAR;
        if (text === 'off') return OFF;
        var n = parseInt(text, 10);
        return n >= 1 && n <= 24 ? n : null;
    }

    /**
     * The position after a move in XG notation, such as "8/5(2) 6/5",
     * "bar/21*" or "6/off", or null when the notation can't be read.
     */
    function applyNotation(pos, notation) {
        var tokens = String(notation || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
        if (!tokens.length) return null;
        var p = clone(pos);
        for (var t = 0; t < tokens.length; t++) {
            var m = /^([a-z0-9*/]+?)(?:\((\d)\))?$/.exec(tokens[t]);
            if (!m) return null;
            var path = m[1].replace(/\*/g, '').split('/').map(pointOf);
            if (path.length < 2 || path.some(function (x) { return x === null; })) return null;
            var times = m[2] ? parseInt(m[2], 10) : 1;
            for (var n = 0; n < times; n++) {
                for (var i = 1; i < path.length; i++) {
                    if (p.points[path[i - 1]] >= 0) return null;
                    p = hop(p, path[i - 1], path[i]).pos;
                }
            }
        }
        return p;
    }

    function label(point) {
        if (point === BAR) return 'bar';
        if (point === OFF) return 'off';
        return String(point);
    }

    /**
     * XG-style notation for a play given as checker paths, each a list of
     * { from, to, hit } hops of one checker: intermediate points are written
     * only where the checker hit, and repeated moves get a count.
     */
    function formatPlay(paths) {
        var parts = paths.map(function (path) {
            var out = label(path[0].from);
            path.forEach(function (h, i) {
                var last = i === path.length - 1;
                if (last || h.hit) out += '/' + label(h.to) + (h.hit ? '*' : '');
            });
            return out;
        });
        var counts = {};
        var order = [];
        parts.forEach(function (s) {
            if (!counts[s]) order.push(s);
            counts[s] = (counts[s] || 0) + 1;
        });
        return order.map(function (s) { return counts[s] > 1 ? s + '(' + counts[s] + ')' : s; }).join(' ');
    }

    var api = {
        BAR: BAR,
        OFF: OFF,
        key: key,
        target: target,
        hop: hop,
        diceList: diceList,
        legalPlays: legalPlays,
        applyNotation: applyNotation,
        formatPlay: formatPlay
    };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.TrainMoves = api;
})(typeof self !== 'undefined' ? self : this);
