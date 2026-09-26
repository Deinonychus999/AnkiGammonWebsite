/**
 * The trainer's playable board: the player on roll makes their move by
 * tapping or dragging checkers, with the same mechanics as OpenGammon's
 * board.
 *
 * - Tapping one of your checkers plays one die with it: the first die in the
 *   dice order that can be played from there (right click: the other die).
 *   Tapping an empty point or a blot brings up to two checkers there, one
 *   per die, to make a point. Tapping your tray bears off as many checkers
 *   as possible.
 * - Dragging past 12px (18px by touch) picks a checker up: the points it can
 *   reach light up, with the dice in any combination, and dropping on one
 *   plays it.
 * - The dice show what's been used. Clicking them swaps their order while
 *   dice are left, and submits the move once it is complete.
 * - Undo, drawn on the board once a checker has moved, takes back the last
 *   tap or drop.
 *
 * Moves are checked with train-moves.js: a die can be played only if the
 * move can still be completed legally.
 */
(function () {
    'use strict';

    var M = window.TrainMoves;
    var NS = 'http://www.w3.org/2000/svg';
    var DRAG_START_MOUSE = 12;
    var DRAG_START_TOUCH = 18;
    // Over this much further travel, the checker's grab offset eases away.
    var GRIP_SETTLE = 60;
    var ZONE_COLOR = '#FF7C00';

    function without(list, value) {
        var i = list.indexOf(value);
        return i < 0 ? list.slice() : list.slice(0, i).concat(list.slice(i + 1));
    }

    function el(name, attrs) {
        var node = document.createElementNS(NS, name);
        Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
        return node;
    }

    function reducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /**
     * Makes `container` a board for playing `options.dice` in
     * `options.position` (position-parser.js's, with the player on roll as O).
     * options.onChange(state) runs after every move, options.onSubmit(state)
     * when the player submits; state is { pos, paths, complete }.
     */
    function create(container, options) {
        var start = options.position;
        var dice = options.dice;
        var legal = M.legalPlays(start, dice);
        if (!legal.length || !legal[0].hops.length) return null;

        var keys = {};
        legal.forEach(function (e) { keys[M.key(e.pos)] = true; });
        var most = legal[0].hops.length;
        var memo = {};
        var scheme = window.BoardRenderer.SCHEMES[options.scheme] || window.BoardRenderer.SCHEMES.classic;
        var colorO = options.swap ? scheme.checkerX : scheme.checkerO;
        var geo = window.BoardRenderer.geometry(options.orientation, 'O');

        var state = {
            pos: start,
            remaining: M.diceList(dice),
            order: dice[0] === dice[1] ? [dice[0], dice[0]] : [Math.max(dice[0], dice[1]), Math.min(dice[0], dice[1])],
            paths: [],
            history: []
        };
        var svg = null;
        // Moves take effect at once and glides only show them, so taps during
        // a glide count and several glides can run together. The board is
        // drawn without the checkers still in flight, which glide above it.
        var flights = [];
        var press = null;
        var done = false;

        function hopsPlayed() {
            return state.paths.reduce(function (n, path) { return n + path.length; }, 0);
        }

        function complete() {
            return hopsPlayed() === most;
        }

        // Whether `need` more hops with these dice still end in a legal play.
        function canFinish(pos, remaining, need) {
            if (need === 0) return !!keys[M.key(pos)];
            var memoKey = M.key(pos) + '#' + remaining.slice().sort().join('');
            if (memo[memoKey] !== undefined) return memo[memoKey];
            var ok = false;
            distinct(remaining).forEach(function (die) {
                if (ok) return;
                for (var from = 25; from >= 1 && !ok; from--) {
                    var to = M.target(pos, from, die);
                    if (to !== null && canFinish(M.hop(pos, from, to).pos, without(remaining, die), need - 1)) ok = true;
                }
            });
            memo[memoKey] = ok;
            return ok;
        }

        function distinct(list) {
            return list.filter(function (v, i) { return list.indexOf(v) === i; });
        }

        // The values among `remaining`, in the order the player has the dice.
        function inOrder(remaining, reverse) {
            var order = distinct(state.order).filter(function (v) { return remaining.indexOf(v) >= 0; });
            return reverse ? order.reverse() : order;
        }

        function need() {
            return most - hopsPlayed();
        }

        function hits(path) {
            return path.filter(function (h) { return h.hit; }).length;
        }

        // Where the checker on `from` can be dropped: each destination's
        // shortest way there, then the one hitting more, then the dice order.
        // To the tray, the smallest die that does it.
        function dropTargets(from) {
            var out = {};
            (function walk(pos, at, remaining, chain) {
                inOrder(remaining).forEach(function (die) {
                    var to = M.target(pos, at, die);
                    if (to === null) return;
                    var r = M.hop(pos, at, to);
                    var next = chain.concat([{ from: at, to: to, die: die, hit: r.hit }]);
                    var rest = without(remaining, die);
                    if (next.length <= need() && canFinish(r.pos, rest, need() - next.length)) {
                        var old = out[to];
                        var better = !old || next.length < old.length ||
                            (next.length === old.length && hits(next) > hits(old)) ||
                            (to === M.OFF && next.length === 1 && old.length === 1 && die < old[0].die);
                        if (better) out[to] = next;
                    }
                    if (to !== M.OFF && next.length < need()) walk(r.pos, to, rest, next);
                });
            })(state.pos, from, state.remaining, []);
            return out;
        }

        // ── Moves from taps ────────────────────────────────────────────

        function tapChecker(from, reverse) {
            var dice = inOrder(state.remaining, reverse);
            for (var i = 0; i < dice.length; i++) {
                var to = M.target(state.pos, from, dice[i]);
                if (to === null) continue;
                var r = M.hop(state.pos, from, to);
                if (canFinish(r.pos, without(state.remaining, dice[i]), need() - 1)) {
                    play([[{ from: from, to: to, die: dice[i], hit: r.hit }]], true);
                    return;
                }
            }
        }

        // One checker per die, up to two, from wherever that die brings one.
        function tapPoint(dest) {
            if (state.pos.points[dest] < 0 || state.pos.points[dest] >= 2) return;
            var pos = state.pos;
            var remaining = state.remaining.slice();
            var paths = [];
            for (var n = 0; n < 2; n++) {
                var found = false;
                var dice = inOrder(remaining);
                for (var i = 0; i < dice.length && !found; i++) {
                    var from = dest + dice[i];
                    if (from > 25 || pos.points[from] >= 0 || M.target(pos, from, dice[i]) !== dest) continue;
                    var r = M.hop(pos, from, dest);
                    var rest = without(remaining, dice[i]);
                    if (!canFinish(r.pos, rest, need() - paths.length - 1)) continue;
                    paths.push([{ from: from, to: dest, die: dice[i], hit: r.hit }]);
                    pos = r.pos;
                    remaining = rest;
                    found = true;
                }
                if (!found) break;
            }
            if (paths.length) play(paths, true);
        }

        // As many checkers off as the dice allow, by the shortest way; nothing
        // when two ways would leave different positions.
        function tapTray() {
            var bestCount = 0;
            var lines = [];
            (function walk(pos, remaining, hops) {
                var moved = false;
                distinct(remaining).forEach(function (die) {
                    for (var from = 6; from >= 1; from--) {
                        if (M.target(pos, from, die) !== M.OFF) continue;
                        var r = M.hop(pos, from, M.OFF);
                        var rest = without(remaining, die);
                        if (!canFinish(r.pos, rest, need() - hops.length - 1)) continue;
                        moved = true;
                        walk(r.pos, rest, hops.concat([{ from: from, to: M.OFF, die: die, hit: false }]));
                    }
                });
                if (!moved && hops.length) {
                    if (hops.length > bestCount) {
                        bestCount = hops.length;
                        lines = [];
                    }
                    if (hops.length === bestCount) lines.push({ hops: hops, key: M.key(pos) });
                }
            })(state.pos, state.remaining, []);
            if (!lines.length) return;
            if (lines.some(function (l) { return l.key !== lines[0].key; })) return;
            play(lines[0].hops.map(function (h) { return [h]; }), true);
        }

        function tapDice() {
            if (complete()) {
                submit();
                return;
            }
            if (dice[0] !== dice[1]) {
                state.order = [state.order[1], state.order[0]];
                render();
            }
        }

        // ── Applying moves ─────────────────────────────────────────────

        function play(paths, animate) {
            state.history.push({ pos: state.pos, remaining: state.remaining.slice(), paths: state.paths.slice() });
            var pos = state.pos;
            var remaining = state.remaining.slice();
            paths.forEach(function (path) {
                path.forEach(function (h) {
                    pos = M.hop(pos, h.from, h.to).pos;
                    remaining = without(remaining, h.die);
                });
            });
            var before = state.pos;
            state.pos = pos;
            state.remaining = remaining;
            state.paths = state.paths.concat(paths);
            if (animate && !reducedMotion()) glide(before, paths);
            else render();
            changed();
        }

        // Lands every checker in flight at once.
        function stopGlide() {
            if (!flights.length) return;
            flights.forEach(function (f) { f.alive = false; });
            flights = [];
            render();
        }

        function undo() {
            if (done || !state.history.length) return;
            stopGlide();
            var last = state.history.pop();
            state.pos = last.pos;
            state.remaining = last.remaining;
            state.paths = last.paths;
            render();
            changed();
        }

        function submit() {
            if (done || !complete()) return;
            stopGlide();
            done = true;
            if (options.onSubmit) options.onSubmit(snapshot());
        }

        function snapshot() {
            return { pos: state.pos, paths: state.paths.slice(), complete: complete() };
        }

        function changed() {
            if (options.onChange) options.onChange(snapshot());
        }

        // ── Drawing ────────────────────────────────────────────────────

        function render() {
            var meta = Object.assign({}, options.metadata, { dice: state.order.slice(0, 2) });
            container.innerHTML = window.BoardRenderer.render(shownPos(), meta, options.scheme, options.swap, options.orientation);
            svg = container.querySelector('svg');
            drawDiceUse();
            if (state.history.length && !done) drawUndo();
            if (flights.length) {
                var layer = el('g', { 'pointer-events': 'none' });
                flights.forEach(function (f) { f.nodes.forEach(function (n) { layer.appendChild(n); }); });
                svg.appendChild(layer);
            }
        }

        // The position without the checkers still gliding to where they land,
        // and without hit blots that haven't reached the bar yet.
        function shownPos() {
            var pos = { points: state.pos.points.slice(), xOff: state.pos.xOff, oOff: state.pos.oOff };
            flights.forEach(function (f) {
                f.landing.forEach(function (to) {
                    if (to === M.OFF) pos.oOff -= 1;
                    else pos.points[to] += 1;
                });
                f.blots.forEach(function (b) { if (!b.home) pos.points[0] -= 1; });
            });
            return pos;
        }

        // A used die is dimmed; with doubles each die stands for two moves,
        // and one of them used dims its left half.
        function drawDiceUse() {
            var used = M.diceList(dice).length - state.remaining.length;
            var covers;
            if (dice[0] === dice[1]) {
                covers = [Math.min(used, 2) / 2, Math.max(0, used - 2) / 2];
            } else {
                covers = state.order.map(function (v) { return state.remaining.indexOf(v) < 0 ? 1 : 0; });
            }
            covers.forEach(function (part, i) {
                if (!part) return;
                var d = geo.dice[i];
                svg.appendChild(el('rect', {
                    x: d.x - 1, y: d.y - 1, width: d.size * part + (part === 1 ? 2 : 1), height: d.size + 2,
                    fill: scheme.boardLight, opacity: 0.7, 'pointer-events': 'none'
                }));
            });
        }

        var UNDO = { w: 110, h: 44 };

        function undoBox() {
            return { x: geo.otherHalf.x - UNDO.w / 2, y: geo.otherHalf.y - UNDO.h / 2, w: UNDO.w, h: UNDO.h };
        }

        function drawUndo() {
            var b = undoBox();
            var g = el('g', { 'class': 'board-undo' });
            g.appendChild(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 8, fill: 'rgba(18,18,18,0.72)', stroke: 'rgba(255,255,255,0.35)', 'stroke-width': 1.5 }));
            var t = el('text', { x: b.x + b.w / 2, y: b.y + b.h / 2 + 7, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 600, fill: '#fff', 'font-family': 'Inter, system-ui, sans-serif' });
            t.textContent = 'Undo';
            g.appendChild(t);
            svg.appendChild(g);
        }

        function zonePath(point, height) {
            var p = geo.points[point];
            var r = p.w / 2;
            if (p.isTop) {
                var yEnd = p.yBase + height;
                return 'M' + p.x + ' ' + p.yBase + 'V' + (yEnd - r) + 'A' + r + ' ' + r + ' 0 0 0 ' + (p.x + p.w) + ' ' + (yEnd - r) + 'V' + p.yBase + 'Z';
            }
            var yTop = p.yBase - height;
            return 'M' + p.x + ' ' + p.yBase + 'V' + (yTop + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (p.x + p.w) + ' ' + (yTop + r) + 'V' + p.yBase + 'Z';
        }

        function drawZones(targets) {
            var g = el('g', { 'class': 'board-zones', 'pointer-events': 'none' });
            Object.keys(targets).forEach(function (t) {
                var to = +t;
                var shape = to === M.OFF
                    ? el('rect', { x: geo.tray.x, y: geo.tray.y, width: geo.tray.w, height: geo.tray.h, rx: 3 })
                    : el('path', { d: zonePath(to, geo.step * 4.5) });
                shape.setAttribute('fill', ZONE_COLOR);
                shape.setAttribute('opacity', 0.25);
                shape.dataset.target = to;
                g.appendChild(shape);
            });
            svg.appendChild(g);
            return g;
        }

        function stackIndex(pos, point) {
            if (point === M.BAR) return Math.abs(Math.min(pos.points[M.BAR], 0)) - 1;
            return Math.abs(Math.min(pos.points[point], 0)) - 1;
        }

        function checkerAt(pos, point) {
            return geo.checker(point === M.BAR ? 'barO' : point, stackIndex(pos, point));
        }

        function checkerNode(x, y, color, extra) {
            return el('circle', Object.assign({ cx: x, cy: y, r: geo.radius, fill: color, stroke: scheme.checkerBorder, 'stroke-width': 1.5, 'pointer-events': 'none' }, extra || {}));
        }

        // ── Gliding ────────────────────────────────────────────────────

        function glideTime(dist) {
            return (240 + 160 * Math.min(dist / 450, 1)) / 0.6;
        }

        function animate(node, from, to, ms, arc, doneFn, flight) {
            var dx = to.x - from.x, dy = to.y - from.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
            var lift = arc ? 40 * (0.35 + 0.65 * Math.min(dist / 450, 1)) : 0;
            var ctrl = { x: mid.x, y: mid.y + (geo.centerY > mid.y ? lift : -lift) };
            var t0 = null;
            function frame(now) {
                if (!flight.alive) return;
                if (t0 === null) t0 = now;
                var t = Math.min(1, (now - t0) / ms);
                var e = 1 - Math.pow(1 - t, 3);
                var x = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * ctrl.x + e * e * to.x;
                var y = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * ctrl.y + e * e * to.y;
                node.setAttribute('cx', x);
                node.setAttribute('cy', y);
                if (t < 1) requestAnimationFrame(frame);
                else doneFn();
            }
            requestAnimationFrame(frame);
        }

        // Every checker of the gesture glides at once, hop by hop along its
        // path; a hit blot flies to the bar as the mover lands on it.
        function glide(before, paths) {
            var flight = {
                alive: true,
                landing: paths.map(function (path) { return path[path.length - 1].to; }),
                blots: [],
                nodes: []
            };
            var xBar = Math.max(before.points[0], 0);
            var landed = {};
            var pending = paths.length;
            var finish = function () {
                if (!flight.alive || pending > 0 || flight.blots.some(function (b) { return !b.home; })) return;
                flight.alive = false;
                flights.splice(flights.indexOf(flight), 1);
                render();
            };
            var starts = paths.map(function (path) { return checkerAt(before, path[0].from); });
            var movers = [];
            paths.forEach(function (path, n) {
                var node = checkerNode(starts[n].x, starts[n].y, colorO);
                movers.push(node);
                flight.nodes.push(node);
                path.forEach(function (h) {
                    if (!h.hit) return;
                    var c = geo.checker(h.to, 0);
                    var blot = { point: h.to, home: false, node: checkerNode(c.x, c.y, options.swap ? scheme.checkerO : scheme.checkerX) };
                    flight.blots.push(blot);
                    flight.nodes.push(blot.node);
                });
            });
            flights.push(flight);
            render();
            paths.forEach(function (path, n) {
                var node = movers[n];
                var here = starts[n];
                var i = 0;
                (function next() {
                    if (i >= path.length) {
                        pending--;
                        finish();
                        return;
                    }
                    var h = path[i++];
                    var to;
                    if (h.to === M.OFF) {
                        to = geo.checker('off');
                    } else {
                        var own = Math.abs(Math.min(before.points[h.to], 0)) + (landed[h.to] || 0);
                        to = geo.checker(h.to, h.hit ? 0 : own);
                        if (i === path.length) landed[h.to] = (landed[h.to] || 0) + 1;
                    }
                    var dx = to.x - here.x, dy = to.y - here.y;
                    animate(node, here, to, glideTime(Math.sqrt(dx * dx + dy * dy)), true, function () {
                        var blot = h.hit && flight.blots.filter(function (b) { return b.point === h.to && !b.flying; })[0];
                        if (blot) {
                            blot.flying = true;
                            var bar = geo.checker('barX', xBar++);
                            animate(blot.node, { x: +blot.node.getAttribute('cx'), y: +blot.node.getAttribute('cy') }, bar, 200, false, function () {
                                blot.home = true;
                                finish();
                            }, flight);
                        }
                        here = to;
                        next();
                    }, flight);
                })();
            });
        }

        // ── Pointer input ──────────────────────────────────────────────

        function toSvg(e) {
            var ctm = svg && svg.getScreenCTM();
            if (!ctm) return null;
            var pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            return pt.matrixTransform(ctm.inverse());
        }

        function inside(pt, b) {
            return pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;
        }

        // What is under a board coordinate, as far as moving goes.
        function whatAt(pt) {
            if (state.history.length && inside(pt, undoBox())) return { kind: 'undo' };
            for (var i = 0; i < 2; i++) {
                var d = geo.dice[i];
                if (inside(pt, { x: d.x, y: d.y, w: d.size, h: d.size })) return { kind: 'dice' };
            }
            if (inside(pt, geo.tray)) return { kind: 'tray' };
            var hit = window.BoardRenderer.hitTest(pt.x, pt.y, options.orientation, options.metadata);
            if (!hit) return null;
            if (hit.kind === 'bar') return hit.player === 'O' && state.pos.points[M.BAR] < 0 ? { kind: 'source', point: M.BAR } : null;
            if (hit.kind === 'point') {
                return state.pos.points[hit.point] < 0 ? { kind: 'source', point: hit.point } : { kind: 'point', point: hit.point };
            }
            return null;
        }

        function dropAt(pt) {
            if (inside(pt, geo.tray)) return M.OFF;
            var hit = window.BoardRenderer.hitTest(pt.x, pt.y, options.orientation, options.metadata);
            return hit && hit.kind === 'point' ? hit.point : null;
        }

        function tap(what, reverse) {
            if (!what) return;
            if (what.kind === 'undo') undo();
            else if (what.kind === 'dice') tapDice();
            else if (what.kind === 'tray') tapTray();
            else if (what.kind === 'source') tapChecker(what.point, reverse);
            else if (what.kind === 'point' && !reverse) tapPoint(what.point);
        }

        function onDown(e) {
            if (done) return;
            if (e.button === 1) {
                e.preventDefault();
                undo();
                return;
            }
            if (e.button !== 0) return;
            var pt = toSvg(e);
            if (!pt) return;
            var what = whatAt(pt);
            press = { what: what, x: e.clientX, y: e.clientY, pt: pt, touch: e.pointerType === 'touch', dragging: false, targets: null };
            if (what && what.kind === 'source') {
                press.targets = dropTargets(what.point);
                var c = checkerAt(state.pos, what.point);
                press.grab = { x: c.x - pt.x, y: c.y - pt.y };
                press.origin = c;
            }
            try { container.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
        }

        function startDrag() {
            stopGlide();
            press.dragging = true;
            var ghost = el('circle', { cx: press.origin.x, cy: press.origin.y, r: geo.radius, fill: '#FFF', opacity: 0.6, 'pointer-events': 'none' });
            svg.appendChild(ghost);
            press.zones = drawZones(press.targets);
            press.node = checkerNode(press.origin.x, press.origin.y, colorO, { r: geo.radius + 2, 'stroke-width': 3, style: 'filter: drop-shadow(0 2px 4px rgba(0,0,0,.5))' });
            svg.appendChild(press.node);
        }

        function onMove(e) {
            if (!press || !press.targets) return;
            var travel = Math.sqrt(Math.pow(e.clientX - press.x, 2) + Math.pow(e.clientY - press.y, 2));
            var threshold = press.touch ? DRAG_START_TOUCH : DRAG_START_MOUSE;
            if (!press.dragging) {
                if (travel < threshold || !Object.keys(press.targets).length) return;
                startDrag();
            }
            var pt = toSvg(e);
            if (!pt) return;
            var grip = Math.max(0, 1 - (travel - threshold) / GRIP_SETTLE);
            press.node.setAttribute('cx', pt.x + press.grab.x * grip);
            press.node.setAttribute('cy', pt.y + press.grab.y * grip);
            var over = dropAt(pt);
            Array.prototype.forEach.call(press.zones.childNodes, function (z) {
                z.setAttribute('opacity', +z.dataset.target === over ? 0.45 : 0.25);
            });
        }

        function onUp(e) {
            if (!press) return;
            var p = press;
            press = null;
            if (!p.dragging) {
                if (e.button === 0) tap(p.what, false);
                return;
            }
            var pt = toSvg(e);
            var to = pt ? dropAt(pt) : null;
            if (to !== null && p.targets[to]) {
                play([p.targets[to]], false);
            } else if (to === p.what.point) {
                render();
                tap(p.what, false);
            } else {
                render();
            }
        }

        function onCancel() {
            if (press && press.dragging) render();
            press = null;
        }

        function onContext(e) {
            e.preventDefault();
            if (done) return;
            var pt = toSvg(e);
            var what = pt && whatAt(pt);
            if (what && what.kind === 'source') tapChecker(what.point, true);
        }

        // While a checker is being dragged, the page must not scroll under it.
        function onTouchMove(e) {
            if (press && press.dragging) e.preventDefault();
        }

        container.addEventListener('pointerdown', onDown);
        container.addEventListener('pointermove', onMove);
        container.addEventListener('pointerup', onUp);
        container.addEventListener('pointercancel', onCancel);
        container.addEventListener('contextmenu', onContext);
        container.addEventListener('touchmove', onTouchMove, { passive: false });

        render();

        return {
            undo: undo,
            submit: submit,
            // Space does what clicking the dice does.
            dice: function () { if (!done) tapDice(); },
            state: snapshot,
            destroy: function () {
                done = true;
                container.removeEventListener('pointerdown', onDown);
                container.removeEventListener('pointermove', onMove);
                container.removeEventListener('pointerup', onUp);
                container.removeEventListener('pointercancel', onCancel);
                container.removeEventListener('contextmenu', onContext);
                container.removeEventListener('touchmove', onTouchMove);
            }
        };
    }

    window.TrainBoard = { create: create };
})();
