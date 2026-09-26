/**
 * Trainer UI: decks on this device, a study session scheduled with FSRS,
 * imports (community decks, .apkg files, backups) and settings.
 * Deck logic is in train-deck.js, storage in train-store.js.
 */
(function () {
    'use strict';

    var root = document.getElementById('trainer');
    if (!root) return;

    var API = window.ANKIGAMMON_DECKS_API || '';
    var PAKO_URL = 'https://unpkg.com/pako@2.1.0/dist/pako.min.js';
    // Cards due again within this window (a failed card's 1-minute step)
    // come back in the same session instead of waiting for the next one.
    var LEARN_AHEAD_MS = 20 * 60 * 1000;
    // Anki's default: a late-night session still counts toward the day before.
    var DAY_CUTOFF_HOURS = 4;
    var DEFAULTS = { scheme: 'classic', orientation: 'ccw', swap: false, newPerDay: 20, answerMode: 'board',
                     equity: 'cubeful', matrixValues: 'errors' };
    var STORM_MS = 3 * 60 * 1000;
    var STORM_PENALTY_MS = 10 * 1000;
    var MISSED_SHOWN = 20;
    var LETTERS = 'ABCDEFGHIJ';

    var D = window.TrainDeck;
    var Moves = window.TrainMoves;
    var Store = window.TrainStore;
    var Rating = D.Rating;
    var scheduler = window.FSRS.fsrs({ enable_fuzz: true });

    var $ = function (id) { return document.getElementById(id); };

    var settings = Object.assign({}, DEFAULTS);
    var decks = [];
    var progressById = {};
    var newToday = { day: '', count: 0 };
    var bests = { streak: 0, storm: 0 };

    // ── Small helpers ──────────────────────────────────────────────────

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function plural(n, word) {
        return n + ' ' + word + (n === 1 ? '' : 's');
    }

    function setStatus(text, state) {
        $('trainer-status-text').textContent = text;
        $('trainer-status').dataset.state = state || '';
    }

    function notify(text, kind) {
        var box = $('trainer-notice');
        $('trainer-notice-text').textContent = text || '';
        box.hidden = !text;
        if (kind) box.dataset.kind = kind;
        else delete box.dataset.kind;
    }

    function openDialog(id) {
        var dialog = $(id);
        if (!dialog.open) dialog.showModal();
    }

    function closeDialog(id) {
        var dialog = $(id);
        if (dialog.open) dialog.close();
    }

    function loadScript(src, globalName) {
        if (window[globalName]) return Promise.resolve();
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('A library the importer needs could not be downloaded. Check your connection and try again.')); };
            document.head.appendChild(s);
        });
    }

    function dayKey(date) {
        var d = new Date(date.getTime() - DAY_CUTOFF_HOURS * 3600000);
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }

    function newLeftToday() {
        var used = newToday.day === dayKey(new Date()) ? newToday.count : 0;
        return Math.max(0, settings.newPerDay - used);
    }

    function formatInterval(ms) {
        var min = ms / 60000;
        if (min < 1) return '<1m';
        if (min < 60) return Math.round(min) + 'm';
        var hours = min / 60;
        if (hours < 24) return Math.round(hours) + 'h';
        var days = hours / 24;
        if (days < 30) return Math.round(days) + 'd';
        if (days < 365) return (days / 30).toFixed(1).replace(/\.0$/, '') + 'mo';
        return (days / 365).toFixed(1).replace(/\.0$/, '') + 'y';
    }

    function isDue(p, now) {
        return p && new Date(p.card.due).getTime() <= now;
    }

    // ── Home ───────────────────────────────────────────────────────────

    function deckCounts(deck, now) {
        var seen = 0, due = 0;
        Object.keys(progressById).forEach(function (id) {
            var p = progressById[id];
            if (p.deckId !== deck.id) return;
            seen++;
            if (isDue(p, now)) due++;
        });
        return { due: due, seen: seen, fresh: Math.max(0, (deck.count || 0) - seen) };
    }

    function dueSoon(now) {
        var count = 0, at = Infinity;
        Object.keys(progressById).forEach(function (id) {
            var t = new Date(progressById[id].card.due).getTime();
            if (t > now && t - now < LEARN_AHEAD_MS) {
                count++;
                at = Math.min(at, t);
            }
        });
        return { count: count, at: at };
    }

    function renderHome() {
        var now = Date.now();
        var list = $('deck-list');
        list.textContent = '';
        var totalDue = 0, totalNew = 0, totalSeen = 0;
        decks.sort(function (a, b) { return a.title.localeCompare(b.title); });
        decks.forEach(function (deck) {
            var c = deckCounts(deck, now);
            totalDue += c.due;
            totalNew += c.fresh;
            totalSeen += c.seen;

            var row = el('li', 'trainer-deck');
            var main = el('div', 'trainer-deck__main');
            main.appendChild(el('h3', 'trainer-deck__title', deck.title));
            var by = [plural(deck.count || 0, 'position')];
            if (deck.author) by.unshift('by ' + deck.author);
            main.appendChild(el('p', 'trainer-deck__meta', by.join(' · ')));
            var counts = el('p', 'trainer-deck__counts');
            counts.appendChild(el('span', 'trainer-count trainer-count--due', c.due + ' due'));
            counts.appendChild(el('span', 'trainer-count trainer-count--new', c.fresh + ' new'));
            main.appendChild(counts);
            row.appendChild(main);

            var actions = el('div', 'trainer-deck__actions');
            // With nothing due, positions already studied can be reviewed ahead.
            var ready = c.due || (c.fresh && newLeftToday());
            var study = el('button', 'btn btn-sm ' + (ready ? 'btn-primary' : 'btn-secondary'), ready ? 'Study' : 'Study ahead');
            study.type = 'button';
            study.disabled = !ready && !c.seen;
            study.addEventListener('click', function () { startSession(deck.id, !ready); });
            var remove = el('button', 'app-link-btn trainer-deck__remove', 'Remove');
            remove.type = 'button';
            remove.addEventListener('click', function () { removeDeck(deck); });
            actions.appendChild(study);
            actions.appendChild(remove);
            row.appendChild(actions);
            list.appendChild(row);
        });

        $('deck-empty').hidden = decks.length > 0;
        $('trainer-dash').hidden = decks.length === 0;
        syncShell();
        var newShown = Math.min(totalNew, newLeftToday());
        var summary = $('today-summary');
        if (!decks.length) {
            summary.textContent = 'Add a deck to start.';
        } else if (!totalDue && !newShown) {
            var soon = dueSoon(now);
            if (soon.count) {
                summary.textContent = plural(soon.count, 'position') + ' you missed ' + (soon.count === 1 ? 'comes' : 'come') +
                    ' back in ' + formatInterval(soon.at - now) + '.';
            } else {
                summary.textContent = totalNew
                    ? 'All caught up. New positions resume tomorrow, or raise the daily limit in Settings.'
                    : 'All caught up. Come back when reviews are due.';
            }
        } else {
            summary.textContent = plural(totalDue, 'review') + ' due and ' + plural(newShown, 'new position') + ' for today.';
        }
        var ahead = !totalDue && !newShown;
        $('study-all').textContent = ahead && totalSeen ? 'Study ahead' : 'Study now';
        $('study-all').classList.toggle('btn-primary', !ahead);
        $('study-all').classList.toggle('btn-secondary', ahead);
        $('study-all').dataset.ahead = ahead ? 'true' : '';
        $('study-all').disabled = ahead && !totalSeen;
        renderDrills();
        renderCommunityState();
    }

    function refresh() {
        return Promise.all([Store.decks(), Store.progress(), Store.getMeta('newToday', { day: '', count: 0 }),
            Store.getMeta('bests', { streak: 0, storm: 0 })]).then(function (r) {
            decks = r[0];
            progressById = {};
            r[1].forEach(function (p) { progressById[p.id] = p; });
            newToday = r[2];
            bests = r[3];
            renderHome();
        });
    }

    function removeDeck(deck) {
        if (!window.confirm('Remove "' + deck.title + '" and its review history from this device?')) return;
        Store.deleteDeck(deck.id).then(refresh).then(function () {
            notify('Removed "' + deck.title + '".');
        }).catch(function (e) { notify(e.message, 'error'); });
    }

    // ── Importing ──────────────────────────────────────────────────────

    function askToKeepStorage() {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    }

    function saveImported(result, replace, extra) {
        if (!result.items.length) throw new Error('This deck has no positions the trainer can use.');
        return Store.saveDeck(result.deck, result.items, replace).then(function (saved) {
            askToKeepStorage();
            var parts = ['"' + result.deck.title + '" is ready: ' + plural(saved.total, 'position')];
            if (saved.added > 0 && saved.added < saved.total) parts[0] += ', ' + saved.added + ' of them new';
            if (result.skipped) parts.push(plural(result.skipped, 'position') + ' without analysis ' + (result.skipped === 1 ? 'was' : 'were') + ' left out');
            if (extra && extra.length) parts = parts.concat(extra);
            notify(parts.join('. ') + '.', 'ok');
            closeDialog('add-dialog');
            return refresh();
        });
    }

    function importApkg(buffer, name, info) {
        setStatus('Reading ' + name + '…', 'busy');
        return loadScript(PAKO_URL, 'pako').then(function () {
            return window.ApkgReader.read(buffer, name);
        }).then(function (result) {
            if (!result.positions || !result.positions.length) {
                throw new Error((result.errors || []).join(' ') || 'No AnkiGammon positions were found in ' + name + '.');
            }
            var title = (info && info.title) || result.summary.suggestedTitle;
            var pack = window.ApkgReader.buildPack(result, null);
            var imported = D.fromPack(pack, {
                id: (info && info.id) || 'file:' + D.slug(title),
                title: title,
                source: (info && info.source) || 'file'
            });
            return saveImported(imported, false, result.warnings);
        });
    }

    function importJson(text, name) {
        var data;
        try { data = JSON.parse(text); } catch (e) { throw new Error(name + ' is not a trainer backup or an AnkiGammon position pack.'); }
        if (data && data.format === 'ankigammon-trainer-backup') {
            return Store.importAll(data).then(function (r) {
                closeDialog('settings-dialog');
                closeDialog('add-dialog');
                return loadSettings().then(refresh).then(function () {
                    notify('Restored ' + plural(r.decks, 'deck') + ' with ' + plural(r.items, 'position') + '.', 'ok');
                });
            });
        }
        var imported = D.fromPack(data, { title: data && data.deck && data.deck.title ? null : name.replace(/\.json$/i, '') });
        return saveImported(imported, imported.deck.source === 'community');
    }

    function importFile(file) {
        if (!file) return;
        notify('');
        var name = file.name || 'file';
        var job;
        if (/\.apkg$/i.test(name)) {
            job = file.arrayBuffer().then(function (buf) { return importApkg(buf, name); });
        } else if (/\.json$/i.test(name)) {
            job = file.text().then(function (text) { return importJson(text, name); });
        } else {
            notify('The trainer reads AnkiGammon .apkg decks, position packs (.json) and trainer backups (.json).', 'error');
            return;
        }
        job.catch(function (e) { notify(e.message, 'error'); }).then(function () { setStatus('Ready', 'ready'); });
    }

    // ── Community decks ────────────────────────────────────────────────

    var catalog = null;
    var catalogLoaded = Promise.resolve();

    function packUrl(deckId) {
        return API + '/decks/' + encodeURIComponent(deckId) + '/pack.json';
    }

    function addCommunityDeck(deckId, meta) {
        setStatus('Downloading the deck…', 'busy');
        notify('');
        return fetch(packUrl(deckId)).then(function (r) {
            if (!r.ok) throw new Error(r.status === 404 ? 'That community deck no longer exists.' : 'The deck could not be downloaded (HTTP ' + r.status + ').');
            return r.json();
        }).then(function (pack) {
            var m = meta || pack.deck || {};
            var imported = D.fromPack(pack, { id: 'deck:' + deckId, title: m.title, author: m.author, source: 'community' });
            return saveImported(imported, true);
        }).catch(function (e) {
            // fetch() rejects with a TypeError when the network fails; each browser words it differently.
            notify(e instanceof TypeError ? 'The deck could not be downloaded. Check your connection and try again.' : e.message, 'error');
        }).then(function () { setStatus('Ready', 'ready'); });
    }

    function renderCommunityState() {
        if (!catalog) return;
        var have = {};
        decks.forEach(function (d) { have[d.id] = true; });
        Array.prototype.forEach.call(document.querySelectorAll('#community-list [data-deck]'), function (btn) {
            btn.textContent = have['deck:' + btn.dataset.deck] ? 'Update' : 'Add';
        });
    }

    function loadCatalog() {
        var list = $('community-list');
        if (!API) return Promise.resolve();
        return fetch(API + '/catalog').then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (data) {
            catalog = (data.decks || []).filter(function (d) { return d && d.id && d.title; });
            list.textContent = '';
            if (!catalog.length) {
                list.appendChild(el('li', 'trainer-community__empty', 'No community decks yet.'));
                return;
            }
            catalog.forEach(function (deck) {
                var row = el('li', 'trainer-community__row');
                var text = el('div', 'trainer-community__text');
                text.appendChild(el('span', 'trainer-community__title', deck.title));
                var s = deck.summary || {};
                text.appendChild(el('span', 'trainer-community__meta', 'by ' + (deck.author || 'unknown') + ' · ' + plural(s.positions || 0, 'position')));
                row.appendChild(text);
                var btn = el('button', 'btn btn-secondary btn-sm', 'Add');
                btn.type = 'button';
                btn.dataset.deck = deck.id;
                btn.addEventListener('click', function () { addCommunityDeck(deck.id, deck); });
                row.appendChild(btn);
                list.appendChild(row);
            });
            renderCommunityState();
        }).catch(function () {
            list.textContent = '';
            list.appendChild(el('li', 'trainer-community__empty', 'The community decks could not be loaded. You are probably offline.'));
        });
    }

    // ── Study session ──────────────────────────────────────────────────

    var session = null;

    // Ahead: every position already studied, due or not, soonest first.
    function buildQueue(items, ahead) {
        var now = Date.now();
        var due = [], fresh = [];
        items.forEach(function (it) {
            var p = progressById[it.id];
            if (!p) fresh.push(it);
            else if (ahead || isDue(p, now)) due.push(it);
        });
        due.sort(function (a, b) { return new Date(progressById[a.id].card.due) - new Date(progressById[b.id].card.due); });
        return due.concat(fresh.slice(0, newLeftToday()));
    }

    function startSession(deckId, ahead) {
        notify('');
        Store.items(deckId || null).then(function (items) {
            var queue = buildQueue(items, ahead);
            if (!queue.length) {
                notify('Nothing to study right now.');
                return;
            }
            var title = deckId ? (decks.filter(function (d) { return d.id === deckId; })[0] || {}).title : 'All decks';
            session = { mode: 'review', deckId: deckId, title: title, queue: queue, learning: [], answered: 0, best: 0, current: null };
            $('study-deck').textContent = title;
            showView('study');
            history.pushState({ trainer: 'study' }, '');
            nextCard();
        }).catch(function (e) { notify(e.message, 'error'); });
    }

    function remaining() {
        return session.queue.length + session.learning.length + (session.current ? 1 : 0);
    }

    function nextCard() {
        var now = Date.now();
        session.learning.sort(function (a, b) { return a.due - b.due; });
        var item;
        if (session.learning.length && session.learning[0].due <= now) item = session.learning.shift().item;
        else if (session.queue.length) item = session.queue.shift();
        else if (session.learning.length) item = session.learning.shift().item;
        if (!item) {
            finishSession();
            return;
        }
        session.current = { item: item, question: D.question(item.decision), picked: null, verdict: null };
        renderCard();
    }

    function orientation() {
        if (settings.orientation === 'random') return Math.random() < 0.5 ? 'ccw' : 'cw';
        return settings.orientation;
    }

    function contextLine(meta) {
        var parts = [];
        if (meta.matchLength > 0) {
            parts.push(meta.matchLength + '-point match', 'You ' + (meta.scoreO || 0) + ', opponent ' + (meta.scoreX || 0));
            if (meta.crawford) parts.push('Crawford');
        } else {
            parts.push('Unlimited game');
            if (meta.jacoby) parts.push('Jacoby');
            if (meta.beaversAllowed) parts.push('Beavers');
        }
        return parts.join(' · ');
    }

    function renderCard() {
        var cur = session.current;
        var q = cur.question;
        var parsed = window.PositionParser.parse(cur.item.xgid);
        cur.orientation = orientation();
        cur.parsed = parsed;
        if (board) board.destroy();
        board = null;
        if (!q.cube && settings.answerMode !== 'list' && session.mode !== 'missed' && parsed.metadata.dice) {
            board = window.TrainBoard.create($('study-board'), {
                position: parsed.position, metadata: parsed.metadata, dice: parsed.metadata.dice,
                scheme: settings.scheme, swap: settings.swap, orientation: cur.orientation,
                onChange: showPlayState, onSubmit: submitPlay
            });
        }
        cur.play = !!board;
        $('study-choices').hidden = cur.play || (session.mode === 'missed' && !!cur.result);
        $('study-play').hidden = !cur.play;
        $('study-views').hidden = true;
        if (cur.play) showPlayState(board.state());
        else drawBoard(parsed.position);
        $('study-context').textContent = contextLine(parsed.metadata);
        var dice = parsed.metadata.dice;
        $('study-prompt').textContent = q.cube || !dice ? q.prompt : 'You rolled ' + dice[0] + '-' + dice[1] + '. ' + q.prompt;
        if (session.mode === 'review' || session.mode === 'missed') {
            $('study-left').textContent = session.mode === 'review'
                ? plural(remaining(), 'position') + ' left'
                : 'Miss ' + (session.index + 1) + ' of ' + session.misses.length;
            delete $('study-left').dataset.drill;
            delete $('study-left').dataset.urgent;
            $('storm-meter').hidden = true;
        } else {
            renderDrillStatus();
        }

        var box = $('study-choices');
        box.textContent = '';
        q.choices.forEach(function (move, i) {
            var btn = el('button', 'study-choice');
            btn.type = 'button';
            btn.dataset.index = i;
            btn.appendChild(el('span', 'study-choice__key', LETTERS[i]));
            btn.appendChild(el('span', 'study-choice__text', move.notation));
            btn.addEventListener('click', function () { pick(i); });
            box.appendChild(btn);
        });
        $('study-skip').hidden = session.mode !== 'review';
        $('study-answer').hidden = true;
        scrollToTop();
    }

    function fmtEquity(n) {
        return (n === null || n === undefined) ? '' : n.toFixed(3);
    }

    function fmtError(n) {
        if (!n) return '0.000';
        return (n > 0 ? '+' : '') + n.toFixed(3);
    }

    function verdictText(cur) {
        var q = cur.question;
        var d = cur.item.decision;
        var best = q.best.notation;
        if (!cur.picked) return (q.cube ? 'The best action is ' : 'The best move is ') + best + '.';
        if (cur.picked.unlisted) {
            return cur.picked.notation + " isn't among the moves XG analysed, so it costs at least " +
                unlistedFloor(d).toFixed(3) + '. The best move is ' + best + '.';
        }
        if (cur.verdict === 'best') return q.cube ? 'Correct: ' + best + '.' : 'Best move.';
        if (cur.verdict === 'close') {
            return 'Close: ' + cur.picked.notation + ' is ' + D.answerError(d, cur.picked).toFixed(3) + ' behind ' + best + '.';
        }
        if (q.cube) return 'The best action is ' + best + ', not ' + cur.picked.notation + '.';
        return cur.picked.notation + ' loses ' + D.answerError(d, cur.picked).toFixed(3) + '. The best move is ' + best + '.';
    }

    function saveView(patch) {
        settings = Object.assign({}, settings, patch);
        Store.setMeta('settings', settings).catch(function () { /* only a view preference */ });
    }

    function renderAnalysis(d, all) {
        var cur = session.current;
        cur.allMoves = !!all;
        var table = $('study-analysis');
        table.textContent = '';
        var rows = D.analysisRows(d, all, cur.picked);
        var cubeless = rows.some(function (r) { return r.move.cubeless_equity !== null && r.move.cubeless_equity !== undefined; });
        var showCubeless = cubeless && settings.equity === 'cubeless';
        var head = el('tr');
        head.appendChild(el('th', null, D.isCube(d) ? 'Action' : 'Move'));
        var eqHead = el('th');
        if (cubeless) {
            var flip = el('button', 'study-eqtoggle', showCubeless ? 'Cubeless' : 'Equity');
            flip.type = 'button';
            flip.title = showCubeless ? 'Showing cubeless equities. Click for cubeful.' : 'Showing cubeful equities. Click for cubeless.';
            flip.addEventListener('click', function () {
                saveView({ equity: showCubeless ? 'cubeful' : 'cubeless' });
                renderAnalysis(d, cur.allMoves);
            });
            eqHead.appendChild(flip);
        } else {
            eqHead.textContent = 'Equity';
        }
        head.appendChild(eqHead);
        head.appendChild(el('th', null, 'Error'));
        var thead = el('thead');
        thead.appendChild(head);
        table.appendChild(thead);
        var body = el('tbody');
        var clickable = !!cur.display;
        cur.rows = [];
        rows.forEach(function (row) {
            var tr = el('tr');
            if (row.best) tr.classList.add('is-best');
            if (row.move === cur.picked) tr.classList.add('is-picked');
            var abs = Math.abs(row.error);
            tr.dataset.severity = abs < 0.0005 ? 'none' : abs < 0.02 ? 'small' : abs < 0.08 ? 'mid' : 'big';
            var name = el('td', 'study-analysis__move', row.label);
            if (row.move.was_played) name.appendChild(el('span', 'study-tag', 'Played'));
            if (row.move.analysis_level && !D.isCube(d)) name.appendChild(el('span', 'study-level', row.move.analysis_level));
            tr.appendChild(name);
            tr.appendChild(el('td', 'study-analysis__num', fmtEquity(showCubeless ? row.move.cubeless_equity : row.equity)));
            tr.appendChild(el('td', 'study-analysis__num', fmtError(row.error)));
            if (clickable) {
                var toggle = function () { showMove(cur.shown === row.move ? null : row.move, true); };
                tr.classList.add('is-clickable');
                tr.tabIndex = 0;
                tr.addEventListener('click', toggle);
                tr.addEventListener('keydown', function (e) {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    toggle();
                });
            }
            cur.rows.push({ tr: tr, move: row.move });
            body.appendChild(tr);
        });
        table.appendChild(body);
        markShown();
        var more = d.candidate_moves.filter(function (m) { return m.from_xg_analysis !== false; }).length - body.rows.length;
        $('study-all-moves').hidden = all || more <= 0;
        $('study-all-moves').textContent = 'Show ' + plural(more, 'more move');
        $('study-analysis-hint').hidden = !clickable;
    }

    function pct(n) {
        return n === null || n === undefined ? '–' : n.toFixed(1) + '%';
    }

    function hasChances(m) {
        return !!m && m.player_win_pct !== null && m.player_win_pct !== undefined;
    }

    // For a checker play, after the move on the board, or else the best one.
    function renderChances(d, move) {
        var src = D.isCube(d) ? d : hasChances(move) ? move : D.bestMove(d);
        var box = $('study-chances');
        box.textContent = '';
        if (!hasChances(src)) {
            box.hidden = true;
            return;
        }
        box.hidden = false;
        var table = el('table', 'study-chances__table');
        var head = el('tr');
        ['', 'Win', 'Gammon', 'Backgammon'].forEach(function (h) { head.appendChild(el('th', null, h)); });
        table.appendChild(head);
        [['You', 'player'], ['Opponent', 'opponent']].forEach(function (side) {
            var tr = el('tr');
            tr.appendChild(el('th', null, side[0]));
            ['win', 'gammon', 'backgammon'].forEach(function (k) { tr.appendChild(el('td', null, pct(src[side[1] + '_' + k + '_pct']))); });
            table.appendChild(tr);
        });
        box.appendChild(el('p', 'study-chances__label', D.isCube(d) ? 'Winning chances' : 'Winning chances after ' + (src.xg_notation || src.notation)));
        box.appendChild(table);
        if (D.isCube(d) && d.cubeless_equity !== null && d.cubeless_equity !== undefined) {
            var doubled = d.double_cubeless_equity;
            // As the card: without a stored value, twice the cubeless equity, which holds for unlimited games only.
            if ((doubled === null || doubled === undefined) && !session.current.parsed.metadata.matchLength) doubled = d.cubeless_equity * 2;
            var line = 'Cubeless equity ' + fmtError(d.cubeless_equity);
            if (doubled !== null && doubled !== undefined) line += ', doubled ' + fmtError(doubled);
            box.appendChild(el('p', 'study-chances__cubeless', line));
        }
    }

    function appendLinked(parent, text) {
        var re = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g;
        var last = 0, m;
        while ((m = re.exec(text))) {
            parent.appendChild(document.createTextNode(text.slice(last, m.index)));
            var a = el('a', null, m[0]);
            a.href = m[0];
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            parent.appendChild(a);
            last = m.index + m[0].length;
        }
        parent.appendChild(document.createTextNode(text.slice(last)));
    }

    // ── Score matrices and cube comparison sent by the desktop app ─────

    var ACTION_CLASS = { 'D/T': 'dt', 'D/P': 'dp', 'N/T': 'nd' };

    function actionClass(action) {
        var a = String(action || '').toUpperCase();
        return ACTION_CLASS[a] || (a.indexOf('TG') === 0 ? 'tg' : 'none');
    }

    // The two errors a card cell shows, the best action's own left out, in
    // thousandths (as score_matrix.ScoreMatrixCell.format_errors).
    function cellErrors(c) {
        var k = function (e) { return e === null || e === undefined ? null : Math.round(e * 1000); };
        var a = String(c.best_action || '').toUpperCase();
        var shown = a === 'D/T' ? [c.error_no_double, c.error_pass]
            : a === 'D/P' ? [c.error_no_double, c.error_double]
            : [c.error_double, c.error_pass];
        if (shown[0] === null && shown[1] === null) return null;
        return shown.map(function (e) { return k(e) || 0; });
    }

    function cellEquities(c) {
        return c.equity_no_double !== null && c.equity_no_double !== undefined &&
            c.equity_double_take !== null && c.equity_double_take !== undefined;
    }

    function matrixCell(c, current, equities) {
        var errors = cellErrors(c);
        var td = el('td', 'extra-cell extra-cell--' + actionClass(c.best_action));
        if (errors && Math.min(errors[0], errors[1]) < 20) td.classList.add('is-close');
        if (current) td.classList.add('is-current');
        td.appendChild(el('span', 'extra-cell__action', c.best_action));
        if (equities && cellEquities(c)) {
            td.appendChild(el('span', 'extra-cell__errors', fmtError(c.equity_no_double)));
            td.appendChild(el('span', 'extra-cell__errors', fmtError(c.equity_double_take)));
        } else {
            td.appendChild(el('span', 'extra-cell__errors', errors ? errors.join('/') : '—'));
        }
        if (cellEquities(c)) {
            td.title = 'No double ' + fmtError(c.equity_no_double) + ', double/take ' + fmtError(c.equity_double_take);
        }
        return td;
    }

    function valueSwitch(on, onPick) {
        var seg = el('div', 'app-seg study-extra__switch');
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', 'Cells show');
        [['errors', 'Errors'], ['equities', 'Equities']].forEach(function (o) {
            var b = el('button', 'app-seg__btn' + (o[0] === on ? ' app-seg__btn--on' : ''), o[1]);
            b.type = 'button';
            b.setAttribute('aria-pressed', o[0] === on);
            b.addEventListener('click', function () { if (o[0] !== on) onPick(o[0]); });
            seg.appendChild(b);
        });
        return seg;
    }

    function extraSection(title, analysis) {
        var box = el('section', 'study-extra');
        var h = el('h3', 'study-extra__title', title);
        if (analysis) h.appendChild(el('span', 'study-extra__depth', analysis));
        box.appendChild(h);
        return box;
    }

    function renderScoreMatrix(m, d, item) {
        var box = extraSection(d.cube_value > 1 ? 'Score matrix: redouble to ' + d.cube_value * 2 : 'Score matrix: initial double', m.analysis);
        var cells = [].concat.apply([], m.cells);
        if (m.unlimited) cells = cells.concat([m.unlimited.no_jacoby, m.unlimited.jacoby].filter(Boolean));
        var canSwitch = cells.every(cellEquities);
        var equities = canSwitch && settings.matrixValues === 'equities';
        if (canSwitch) {
            box.querySelector('.study-extra__title').appendChild(valueSwitch(equities ? 'equities' : 'errors', function (v) {
                saveView({ matrixValues: v });
                renderExtras(item);
            }));
        }
        var scroll = el('div', 'study-extra__scroll');
        var table = el('table', 'extra-matrix');
        var head = el('tr');
        head.appendChild(el('th', 'extra-matrix__corner'));
        (m.cells[0] || []).forEach(function (c) { head.appendChild(el('th', null, c.opponent_away + 'a')); });
        table.appendChild(head);
        m.cells.forEach(function (row) {
            var tr = el('tr');
            tr.appendChild(el('th', null, row[0].player_away + 'a'));
            row.forEach(function (c) {
                var current = m.current && m.current.player_away === c.player_away && m.current.opponent_away === c.opponent_away;
                tr.appendChild(matrixCell(c, current, equities));
            });
            table.appendChild(tr);
        });
        scroll.appendChild(table);
        box.appendChild(scroll);
        if (m.unlimited && m.unlimited.no_jacoby) {
            var u = el('table', 'extra-matrix extra-matrix--unlimited');
            var uh = el('tr');
            uh.appendChild(el('th'));
            uh.appendChild(el('th', null, m.unlimited.jacoby ? 'No Jacoby' : 'No beavers'));
            if (m.unlimited.jacoby) uh.appendChild(el('th', null, 'Jacoby'));
            u.appendChild(uh);
            var ur = el('tr');
            ur.appendChild(el('th', null, 'Unlimited'));
            ur.appendChild(matrixCell(m.unlimited.no_jacoby, false, equities));
            if (m.unlimited.jacoby) ur.appendChild(matrixCell(m.unlimited.jacoby, false, equities));
            u.appendChild(ur);
            box.appendChild(u);
        }
        var what = equities
            ? 'Each cell has the best action, then the no-double and double/take equities.'
            : 'Each cell has the best action and the errors of the other two, in thousandths; paler cells are close.';
        box.appendChild(el('p', 'study-extra__note', m.projection
            ? 'An unlimited game, shown as if it were a match at each score. ' + what
            : 'Rows are your score, columns your opponent\'s, in points away. ' + what));
        if (m.caption) box.appendChild(el('p', 'study-extra__note', m.caption));
        return box;
    }

    var SCORE_TYPES = {
        'Neutral': 'Neutral (7-point match, 0-0)',
        'DMP': 'Double match point',
        'G-Save': 'Gammon-save (ahead 2-1 to 3, Crawford)',
        'G-Go': 'Gammon-go (behind 1-2 to 3, Crawford)',
        'Player': 'You own the cube',
        'Opponent': 'Opponent owns the cube'
    };

    function renderMoveColumns(title, columns, key, analysis, note) {
        var box = extraSection(title, analysis);
        var list = el('div', 'extra-moves');
        columns.forEach(function (col) {
            var name = col[key];
            var card = el('div', 'extra-moves__col');
            card.appendChild(el('h4', 'extra-moves__head', key === 'cube_type' && name === 'Neutral' ? 'Centered cube' : (SCORE_TYPES[name] || name)));
            col.top_moves.forEach(function (m) {
                var line = el('p', 'extra-moves__line' + (m.rank === 1 ? ' is-best' : ''));
                line.appendChild(el('span', 'extra-moves__move', m.notation));
                line.appendChild(el('span', 'extra-moves__err', m.rank === 1 ? '' : (-Math.abs(m.error)).toFixed(3)));
                card.appendChild(line);
            });
            list.appendChild(card);
        });
        box.appendChild(list);
        if (note) box.appendChild(el('p', 'study-extra__note', note));
        return box;
    }

    function renderExtras(item) {
        var box = $('study-extras');
        box.textContent = '';
        var x = item.extras || {};
        var d = item.decision;
        if (x.score_matrix && x.score_matrix.cells && x.score_matrix.cells.length) box.appendChild(renderScoreMatrix(x.score_matrix, d, item));
        if (x.move_score_matrix && x.move_score_matrix.columns) {
            box.appendChild(renderMoveColumns('Best moves by score', x.move_score_matrix.columns, 'score_type', x.move_score_matrix.analysis));
        }
        if (x.cube_matrix && x.cube_matrix.best_move_differs) {
            box.appendChild(renderMoveColumns('The best move depends on the cube', x.cube_matrix.columns, 'cube_type', x.cube_matrix.analysis,
                'With a 2-cube when one player owns it, or the position\'s own cube when it is already owned.'));
        }
        box.hidden = !box.childNodes.length;
    }

    function renderNote(d) {
        var box = $('study-note');
        box.textContent = '';
        var note = d.note ? String(d.note).trim() : '';
        box.hidden = !note;
        if (note) appendLinked(box, note);
        var src = [];
        if (d.source_description) src.push(d.source_description);
        if (d.game_number) src.push('game ' + d.game_number + (d.move_number ? ', move ' + d.move_number : ''));
        $('study-source').textContent = src.join(', ');
    }

    function progressFor(item) {
        return progressById[item.id] || { id: item.id, deckId: item.deckId, card: null, log: [] };
    }

    function currentCard(p, now) {
        return p.card ? window.FSRS.TypeConvert.card(p.card) : window.FSRS.createEmptyCard(now);
    }

    function renderGrades(suggested) {
        var now = new Date();
        var options = scheduler.repeat(currentCard(progressFor(session.current.item), now), now);
        Array.prototype.forEach.call(document.querySelectorAll('#study-grades [data-rating]'), function (btn) {
            var r = parseInt(btn.dataset.rating, 10);
            btn.querySelector('.study-grade__when').textContent = formatInterval(options[r].card.due - now);
            btn.classList.toggle('is-suggested', r === suggested);
        });
        var focus = document.querySelector('#study-grades [data-rating="' + suggested + '"]');
        if (focus) focus.focus({ preventScroll: true });
    }

    // ── Playing the move on the board ──────────────────────────────────

    function drawBoard(pos, overlay) {
        var cur = session.current;
        var svg = window.BoardRenderer.render(pos, cur.parsed.metadata, settings.scheme, settings.swap, cur.orientation);
        $('study-board').innerHTML = overlay ? svg.replace(/<\/svg>\s*$/, overlay + '</svg>') : svg;
    }

    var board = null;

    function showPlayState(play) {
        $('study-play-move').textContent = play.paths.length ? Moves.formatPlay(play.paths) : '';
        $('study-play-hint').textContent = play.complete
            ? 'Move complete: tap the dice (or press Space) to submit it, or Undo.'
            : 'Tap a checker to play a die, or drag it. Tap the dice to swap their order.';
    }

    // A move the candidates don't include ranks below every one of them.
    function unlistedFloor(decision) {
        return decision.candidate_moves.reduce(function (worst, m) {
            return Math.max(worst, Math.abs(m.error || 0));
        }, 0);
    }

    function submitPlay(play) {
        var cur = session && session.current;
        if (!cur || !cur.play || cur.verdict || !play.complete) return;
        var d = cur.item.decision;
        var played = Moves.key(play.pos);
        var match = d.candidate_moves.filter(function (m) {
            var after = Moves.applyNotation(cur.parsed.position, m.notation);
            return after && Moves.key(after) === played;
        })[0];
        cur.result = { pos: play.pos, notation: Moves.formatPlay(play.paths), played: true };
        cur.picked = match || { notation: cur.result.notation, equity: null, error: null, rank: Infinity, unlisted: true };
        cur.verdict = match ? D.verdict(d, match) : 'wrong';
        if (session.mode === 'review') reveal();
        else drillAnswer();
    }

    function movePos(cur, move) {
        if (move === cur.picked && cur.result) return cur.result.pos;
        return Moves.applyNotation(cur.parsed.position, move.notation);
    }

    // Once answered, the board replays any move from the start position.
    function startDisplay() {
        var cur = session.current;
        if (board) board.destroy();
        board = null;
        var meta = cur.parsed.metadata;
        if (meta.dice) {
            board = window.TrainBoard.create($('study-board'), {
                position: cur.parsed.position, metadata: meta, dice: meta.dice,
                scheme: settings.scheme, swap: settings.swap, orientation: cur.orientation, display: true
            });
        }
        cur.display = board;
        $('study-views').hidden = false;
        $('view-yours').hidden = !cur.result;
    }

    function markShown() {
        var cur = session.current;
        (cur.rows || []).forEach(function (r) {
            r.tr.classList.toggle('is-shown', r.move === cur.shown);
            if (r.move === cur.shown) r.tr.setAttribute('aria-current', 'true');
            else r.tr.removeAttribute('aria-current');
        });
    }

    // null shows the start position.
    function showMove(move, animate) {
        var cur = session.current;
        cur.shown = move || null;
        var pos = move ? movePos(cur, move) : null;
        if (cur.display) cur.display.show(pos, animate);
        else drawBoard(pos || cur.parsed.position);
        var on = { start: !move, yours: !!move && move === cur.picked, best: !!move && move === cur.question.best };
        ['start', 'yours', 'best'].forEach(function (v) {
            $('view-' + v).classList.toggle('app-seg__btn--on', on[v]);
            $('view-' + v).setAttribute('aria-pressed', on[v]);
        });
        markShown();
        renderChances(cur.item.decision, move);
    }

    function stepShown(delta) {
        var cur = session.current;
        if (!cur.display || !cur.rows || !cur.rows.length) return false;
        var i = -1;
        cur.rows.forEach(function (r, n) { if (r.move === cur.shown) i = n; });
        var next = i < 0 ? 0 : Math.max(0, Math.min(cur.rows.length - 1, i + delta));
        showMove(cur.rows[next].move, true);
        return true;
    }

    function markChoices(cur) {
        var bestIndex = cur.question.choices.indexOf(cur.question.best);
        Array.prototype.forEach.call(document.querySelectorAll('#study-choices .study-choice'), function (btn, i) {
            btn.disabled = true;
            if (i === bestIndex) btn.classList.add('is-answer');
            if (cur.picked && cur.question.choices[i] === cur.picked && i !== bestIndex) btn.classList.add('is-' + cur.verdict);
        });
    }

    function reveal() {
        var cur = session.current;
        var d = cur.item.decision;
        markChoices(cur);
        $('study-play').hidden = true;
        cur.display = null;
        cur.shown = null;
        if (!cur.question.cube) startDisplay();
        var verdict = $('study-verdict');
        verdict.textContent = verdictText(cur);
        verdict.dataset.verdict = cur.verdict;
        renderAnalysis(d);
        if (cur.question.cube) {
            renderChances(d);
        } else {
            // A move just made on the board is already there to see.
            var justPlayed = cur.result && cur.result.played && session.mode !== 'missed';
            showMove(cur.result ? cur.picked : cur.question.best, !justPlayed);
        }
        renderNote(d);
        $('study-editor').href = '/tools/position-editor#' + encodeURIComponent(cur.item.xgid);
        renderExtras(cur.item);
        $('study-skip').hidden = true;
        $('study-answer').hidden = false;
        var review = session.mode === 'review';
        var viewer = session.mode === 'missed';
        $('study-grades').hidden = !review;
        $('study-drill-end').hidden = review || viewer;
        $('study-miss-nav').hidden = !viewer;
        if (review) renderGrades(D.suggestedRating(cur.verdict));
        else if (viewer) renderMissNav();
        else $('study-drill-end').focus({ preventScroll: true });
    }

    function pick(i) {
        var cur = session.current;
        if (!cur || cur.verdict) return;
        cur.picked = cur.question.choices[i];
        cur.verdict = D.verdict(cur.item.decision, cur.picked);
        if (!cur.question.cube) {
            var after = Moves.applyNotation(cur.parsed.position, cur.picked.notation);
            if (after) cur.result = { pos: after, notation: cur.picked.notation };
        }
        if (session.mode === 'review') reveal();
        else drillAnswer();
    }

    function skip() {
        var cur = session.current;
        if (!cur || cur.verdict) return;
        cur.verdict = 'wrong';
        reveal();
    }

    function grade(rating) {
        var cur = session.current;
        if (!cur || !cur.verdict || session.mode !== 'review') return;
        var now = new Date();
        var p = progressFor(cur.item);
        var wasNew = !p.card;
        var next = scheduler.next(currentCard(p, now), now, rating).card;
        p.card = JSON.parse(JSON.stringify(next));
        p.log.push([now.toISOString(), rating, cur.picked ? cur.verdict : 'skipped']);
        progressById[p.id] = p;

        var writes = [Store.putProgress(p)];
        if (wasNew) {
            var today = dayKey(now);
            newToday = { day: today, count: (newToday.day === today ? newToday.count : 0) + 1 };
            writes.push(Store.setMeta('newToday', newToday));
        }
        Promise.all(writes).catch(function (e) { notify('Your answer could not be saved: ' + e.message, 'error'); });

        session.answered++;
        if (cur.verdict === 'best') session.best++;
        if (next.due - now < LEARN_AHEAD_MS) session.learning.push({ item: cur.item, due: next.due.getTime() });
        session.current = null;
        nextCard();
    }

    function finishSession() {
        var s = session;
        $('done-summary').textContent = s.answered
            ? 'You answered ' + plural(s.answered, 'position') + ' and found the best play ' + s.best + ' ' + (s.best === 1 ? 'time' : 'times') + '.'
            : 'Nothing left to study.';
        var upcoming = Object.keys(progressById).map(function (id) { return progressById[id]; })
            .filter(function (p) { return !s.deckId || p.deckId === s.deckId; })
            .map(function (p) { return new Date(p.card.due).getTime(); })
            .filter(function (t) { return t > Date.now(); })
            .sort(function (a, b) { return a - b; })[0];
        $('done-next').textContent = upcoming ? 'Next review in ' + formatInterval(upcoming - Date.now()) + '.' : '';
        $('done-title').textContent = 'Session done';
        $('done-missed').hidden = true;
        $('done-again').hidden = true;
        session = null;
        showView('done');
    }

    // ── Drills: Blunder Streak and Storm ───────────────────────────────
    // Drills quiz positions at random for speed; they never touch the
    // review schedule.

    var lastDrill = null;

    function shuffled(list) {
        var out = list.slice();
        for (var i = out.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = out[i]; out[i] = out[j]; out[j] = t;
        }
        return out;
    }

    function renderDrills() {
        $('drills').hidden = decks.length === 0;
        var select = $('drill-deck');
        var chosen = select.value;
        select.textContent = '';
        var all = el('option', null, 'All decks');
        all.value = '';
        select.appendChild(all);
        decks.forEach(function (d) {
            var o = el('option', null, d.title);
            o.value = d.id;
            select.appendChild(o);
        });
        select.value = decks.some(function (d) { return d.id === chosen; }) ? chosen : '';
        $('best-streak').textContent = bests.streak ? 'Your best: ' + bests.streak + ' in a row' : '';
        $('best-storm').textContent = bests.storm ? 'Your best: ' + plural(bests.storm, 'point') : '';
    }

    function startDrill(mode, deckId) {
        notify('');
        Store.items(deckId || null).then(function (items) {
            if (!items.length) {
                notify('Add a deck first.');
                return;
            }
            var scope = deckId ? (decks.filter(function (d) { return d.id === deckId; })[0] || {}).title : 'All decks';
            lastDrill = { mode: mode, deckId: deckId };
            session = {
                mode: mode, deckId: deckId, title: (mode === 'streak' ? 'Blunder Streak' : 'Storm') + ' · ' + scope,
                pool: items, queue: shuffled(items), answered: 0, best: 0, score: 0, lost: 0, missed: [],
                current: null, endsAt: mode === 'storm' ? Date.now() + STORM_MS : 0, timer: null, token: 0
            };
            $('study-deck').textContent = session.title;
            showView('study');
            history.pushState({ trainer: 'study' }, '');
            if (mode === 'storm') session.timer = setInterval(tickStorm, 250);
            nextDrillCard();
        }).catch(function (e) { notify(e.message, 'error'); });
    }

    function nextDrillCard() {
        if (!session.queue.length) {
            if (session.mode === 'streak') {
                finishDrill();
                return;
            }
            session.queue = shuffled(session.pool);
        }
        var item = session.queue.shift();
        session.current = { item: item, question: D.question(item.decision), picked: null, verdict: null };
        renderCard();
    }

    function formatClock(ms) {
        var sec = Math.max(0, Math.ceil(ms / 1000));
        return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
    }

    function renderDrillStatus() {
        var s = session;
        var status = $('study-left');
        status.dataset.drill = s.mode;
        if (s.mode === 'streak') {
            status.textContent = 'Streak ' + s.score + (bests.streak ? ' · best ' + bests.streak : '');
            delete status.dataset.urgent;
            $('storm-meter').hidden = true;
        } else {
            var left = Math.max(0, s.endsAt - Date.now());
            status.textContent = '';
            status.appendChild(el('span', 'drill-clock', formatClock(left)));
            status.appendChild(el('span', 'drill-score', plural(s.score, 'point')));
            var urgency = left < 10000 ? 'final' : left < 30000 ? 'soon' : '';
            if (urgency) status.dataset.urgent = urgency;
            else delete status.dataset.urgent;
            var meter = $('storm-meter');
            meter.hidden = false;
            meter.dataset.urgent = urgency;
            meter.firstElementChild.style.width = (100 * left / STORM_MS) + '%';
        }
    }

    function tickStorm() {
        if (!session || session.mode !== 'storm') return;
        if (Date.now() >= session.endsAt) finishDrill();
        else renderDrillStatus();
    }

    // Cube actions have no "close" answer, so their loss is the picked
    // action's error as the analysis gives it.
    function equityLost(cur) {
        if (cur.picked.unlisted) return unlistedFloor(cur.item.decision);
        var err = D.answerError(cur.item.decision, cur.picked);
        return err !== null ? err : Math.abs(cur.picked.error || 0);
    }

    function drillAnswer() {
        var s = session;
        var cur = s.current;
        var kept = cur.verdict !== 'wrong';
        var lost = equityLost(cur);
        s.answered++;
        s.lost += lost;
        if (kept) s.score++;
        if (cur.verdict === 'best') s.best++;
        if (!kept) s.missed.push({ item: cur.item, question: cur.question, picked: cur.picked, verdict: cur.verdict, lost: lost, result: cur.result });
        markChoices(cur);
        renderDrillStatus();
        if (s.mode === 'streak' && !kept) {
            reveal();
            return;
        }
        if (s.mode === 'storm' && !kept) s.endsAt -= STORM_PENALTY_MS;
        var token = ++s.token;
        setTimeout(function () {
            if (session !== s || s.token !== token) return;
            if (s.mode === 'storm' && Date.now() >= s.endsAt) finishDrill();
            else nextDrillCard();
        }, kept ? 350 : 900);
    }

    // The results keep the misses of the last drill, so the viewer can step
    // through them and return here.
    var lastMissed = [];

    function renderMissed(missed) {
        lastMissed = missed;
        var grid = $('done-missed-grid');
        grid.textContent = '';
        $('done-missed').hidden = !missed.length;
        if (!missed.length) return;
        $('done-missed-title').textContent = missed.length === 1 ? 'The position you missed' : plural(missed.length, 'position') + ' you missed';
        missed.slice(0, MISSED_SHOWN).forEach(function (m, i) {
            var card = el('button', 'missed-card');
            card.type = 'button';
            var parsed = window.PositionParser.parse(m.item.xgid);
            var board = el('div', 'missed-card__board');
            board.innerHTML = window.BoardRenderer.render(parsed.position, parsed.metadata, settings.scheme, settings.swap, settings.orientation === 'cw' ? 'cw' : 'ccw');
            card.appendChild(board);
            var text = el('span', 'missed-card__text');
            var dice = m.item.decision.dice;
            text.appendChild(el('span', 'missed-card__kind', m.question.cube ? 'Cube decision' : (dice ? 'Rolled ' + dice.join('-') : 'Checker play')));
            text.appendChild(el('span', 'missed-card__line missed-card__line--you', 'You: ' + m.picked.notation));
            text.appendChild(el('span', 'missed-card__line', 'Best: ' + m.question.best.notation));
            // A "too good" cube miss can cost no equity and still be the wrong action.
            text.appendChild(el('span', 'missed-card__lost', m.picked.unlisted ? '−' + m.lost.toFixed(3) + ' or worse'
                : m.lost < 0.0005 ? 'Same equity, wrong action' : '−' + m.lost.toFixed(3)));
            card.appendChild(text);
            card.setAttribute('aria-label', 'Review this position: you played ' + m.picked.notation + ', best was ' + m.question.best.notation);
            card.addEventListener('click', function () { openMiss(i); });
            grid.appendChild(card);
        });
        $('done-missed-more').textContent = missed.length > MISSED_SHOWN ? 'And ' + (missed.length - MISSED_SHOWN) + ' more; study them all with the button above.' : '';
    }

    function openMiss(index) {
        var m = lastMissed[index];
        if (!m) return;
        session = { mode: 'missed', misses: lastMissed, index: index, title: $('done-title').textContent + ' · missed positions',
                    current: { item: m.item, question: m.question, picked: m.picked, verdict: m.verdict, result: m.result } };
        $('study-deck').textContent = session.title;
        if (view !== 'study') showView('study');
        renderCard();
        reveal();
    }

    function renderMissNav() {
        $('miss-prev').disabled = session.index === 0;
        $('miss-next').disabled = session.index >= session.misses.length - 1;
    }

    function backToResults() {
        session = null;
        showView('done');
    }

    // Missed positions go into a normal review session, which does schedule them.
    function studyMissed() {
        var items = [];
        var seen = {};
        lastMissed.forEach(function (m) {
            if (!seen[m.item.id]) {
                seen[m.item.id] = true;
                items.push(m.item);
            }
        });
        if (!items.length) return;
        session = { mode: 'review', deckId: null, title: 'Missed in ' + $('done-title').textContent, queue: items, learning: [], answered: 0, best: 0, current: null };
        $('study-deck').textContent = session.title;
        showView('study');
        nextCard();
    }

    function finishDrill() {
        var s = session;
        if (!s || s.mode === 'review') return;
        if (s.timer) clearInterval(s.timer);
        $('storm-meter').hidden = true;
        var record = s.score > (bests[s.mode] || 0);
        if (record) {
            bests[s.mode] = s.score;
            Store.setMeta('bests', bests).catch(function () {});
        }
        $('done-title').textContent = s.mode === 'streak' ? 'Blunder Streak' : 'Storm';
        var summary;
        if (s.mode === 'streak') {
            summary = s.missed.length
                ? 'Streak of ' + s.score + '.'
                : 'A perfect run: all ' + plural(s.score, 'position') + ' without a miss.';
        } else {
            summary = plural(s.score, 'point') + ' in 3 minutes, from ' + plural(s.answered, 'position') + '.';
        }
        if (s.answered) summary += ' Equity lost: ' + s.lost.toFixed(3) + '.';
        $('done-summary').textContent = summary;
        $('done-next').textContent = record ? 'New personal best!' : (bests[s.mode] ? 'Your best: ' + bests[s.mode] + '.' : '');
        renderMissed(s.missed);
        $('done-again').hidden = false;
        session = null;
        showView('done');
    }

    function leaveStudy() {
        if (board) board.destroy();
        board = null;
        if (session && session.timer) clearInterval(session.timer);
        $('storm-meter').hidden = true;
        session = null;
        showView('home');
        refresh();
    }

    var view = 'home';

    // The shell's data-view drives the bar, the deck list and the layout;
    // "empty" is the home view before any deck is added.
    function syncShell() {
        $('trainer-shell').dataset.view = view === 'home' ? (decks.length ? 'home' : 'empty') : view;
    }

    function scrollToTop() {
        $('trainer-shell').querySelector('.trainer-stage').scrollTop = 0;
        window.scrollTo(0, 0);
    }

    function showView(name) {
        view = name;
        $('view-home').hidden = name !== 'home';
        $('view-study').hidden = name !== 'study';
        $('view-done').hidden = name !== 'done';
        document.body.classList.toggle('is-studying', name !== 'home');
        syncShell();
        scrollToTop();
    }

    // ── Settings ───────────────────────────────────────────────────────

    function loadSettings() {
        return Store.getMeta('settings', {}).then(function (saved) {
            settings = Object.assign({}, DEFAULTS, saved);
            $('set-scheme').value = settings.scheme;
            $('set-orientation').value = settings.orientation;
            $('set-swap').checked = !!settings.swap;
            $('set-new').value = settings.newPerDay;
            $('set-answer').value = settings.answerMode;
        });
    }

    function saveSettings() {
        var n = parseInt($('set-new').value, 10);
        settings = Object.assign({}, settings, {
            scheme: $('set-scheme').value,
            orientation: $('set-orientation').value,
            swap: $('set-swap').checked,
            newPerDay: isFinite(n) && n >= 0 ? Math.min(n, 9999) : DEFAULTS.newPerDay,
            answerMode: $('set-answer').value
        });
        Store.setMeta('settings', settings).then(refresh);
    }

    // ── Backup ─────────────────────────────────────────────────────────

    function downloadBackup() {
        Store.exportAll().then(function (data) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
            a.download = 'ankigammon-trainer-backup-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000);
        }).catch(function (e) { notify(e.message, 'error'); });
    }

    // ── Install ────────────────────────────────────────────────────────

    function setUpInstall() {
        var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
        if (standalone) return;
        var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (ios) $('install-ios').hidden = false;
        var deferred = null;
        window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();
            deferred = e;
            $('install-app').hidden = false;
        });
        $('install-btn').addEventListener('click', function () {
            if (!deferred) return;
            deferred.prompt();
            deferred.userChoice.then(function () {
                deferred = null;
                $('install-app').hidden = true;
            });
        });
    }

    // The desktop app serves one study pack on 127.0.0.1 for about two minutes,
    // and opens the trainer with its port and a single-use key.
    function importFromDesktop(port, key) {
        notify('');
        setStatus('Getting positions from AnkiGammon on this computer…', 'busy');
        return fetch('http://127.0.0.1:' + port + '/pack/' + key).then(function (r) {
            if (r.status === 404) throw new Error('This link from AnkiGammon was already used or has expired. In the desktop app, choose Study in Trainer again.');
            if (!r.ok) throw new Error('AnkiGammon on this computer answered with an error (HTTP ' + r.status + ').');
            return r.json();
        }).then(function (pack) {
            var title = (pack && pack.deck && pack.deck.title) || 'AnkiGammon';
            return saveImported(D.fromPack(pack, { title: title, id: 'desktop:' + D.slug(title), source: 'desktop' }), false).then(function () {
                // The desktop app keeps offering the pack until this receipt, because
                // Chrome can deliver the request before the user allows local access.
                fetch('http://127.0.0.1:' + port + '/done/' + key, { method: 'POST' }).catch(function () {});
            });
        }).catch(function (e) {
            notify(e instanceof TypeError
                ? "Couldn't reach AnkiGammon on this computer. In the desktop app, use File → Export to Trainer to save the positions as a file, then open it here."
                : e.message, 'error');
        }).then(function () { setStatus('Ready', 'ready'); });
    }

    // ── Entry points: #deck=<id> from a deck page, #inbox from the app, ──
    // ── #desktop=<port>.<key> from the desktop app                       ──

    function handleHash() {
        var hash = location.hash.replace(/^#/, '');
        if (!hash) return Promise.resolve();
        history.replaceState(null, '', location.pathname + location.search);
        var desktop = /^desktop=(\d{1,5})\.([0-9a-f]{32})$/.exec(hash);
        if (desktop && +desktop[1] >= 1 && +desktop[1] <= 65535) return importFromDesktop(+desktop[1], desktop[2]);
        var m = /^deck=([\w-]+)$/.exec(hash);
        if (m) {
            var id = m[1];
            return catalogLoaded.then(function () {
                return addCommunityDeck(id, (catalog || []).filter(function (d) { return d.id === id; })[0]);
            });
        }
        // The handoff is removed only once imported, so a trainer too old to
        // read it can be reloaded and try again.
        if (hash === 'inbox') {
            return Store.readInbox('app').then(function (entry) {
                if (!entry) return;
                var info = { title: entry.name, id: 'app:' + D.slug(entry.name), source: 'app' };
                var imported;
                if (entry.pack) imported = saveImported(D.fromPack(JSON.parse(entry.pack), info), false);
                else if (entry.bytes) imported = importApkg(entry.bytes, entry.name + '.apkg', info);
                else throw new Error('The positions from the web app could not be read. Reload this page to update the trainer.');
                return imported.then(function () { return Store.clearInbox('app'); });
            }).catch(function (e) { notify(e.message, 'error'); }).then(function () { setStatus('Ready', 'ready'); });
        }
        return Promise.resolve();
    }

    // ── Events ─────────────────────────────────────────────────────────

    $('study-all').addEventListener('click', function () { startSession(null, !!$('study-all').dataset.ahead); });
    $('drill-streak').addEventListener('click', function () { startDrill('streak', $('drill-deck').value); });
    $('drill-storm').addEventListener('click', function () { startDrill('storm', $('drill-deck').value); });
    $('study-drill-end').addEventListener('click', finishDrill);
    ['start', 'yours', 'best'].forEach(function (v) {
        $('view-' + v).addEventListener('click', function () {
            var cur = session && session.current;
            if (!cur || !cur.verdict) return;
            showMove(v === 'start' ? null : v === 'yours' ? cur.picked : cur.question.best, v !== 'start');
        });
    });
    $('study-copy').addEventListener('click', function () {
        var cur = session && session.current;
        if (!cur) return;
        var btn = $('study-copy');
        var say = function (text) {
            btn.textContent = text;
            setTimeout(function () { btn.textContent = 'Copy XGID'; }, 1500);
        };
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            say('Copy failed');
            return;
        }
        navigator.clipboard.writeText(cur.item.xgid).then(function () { say('Copied'); }, function () { say('Copy failed'); });
    });
    $('miss-prev').addEventListener('click', function () { if (session) openMiss(session.index - 1); });
    $('miss-next').addEventListener('click', function () { if (session) openMiss(session.index + 1); });
    $('miss-back').addEventListener('click', backToResults);
    $('done-study-missed').addEventListener('click', studyMissed);
    $('done-again').addEventListener('click', function () {
        if (lastDrill) startDrill(lastDrill.mode, lastDrill.deckId);
    });
    $('study-back').addEventListener('click', function () { history.back(); });
    $('done-back').addEventListener('click', leaveStudy);
    $('study-skip').addEventListener('click', skip);
    $('study-all-moves').addEventListener('click', function () {
        if (session && session.current) renderAnalysis(session.current.item.decision, true);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#study-grades [data-rating]'), function (btn) {
        btn.addEventListener('click', function () { grade(parseInt(btn.dataset.rating, 10)); });
    });
    // A link opened in a trainer tab that is already open only changes the hash.
    window.addEventListener('hashchange', function () {
        if (location.hash) handleHash();
    });
    window.addEventListener('popstate', function () {
        if (!$('view-home').hidden) return;
        leaveStudy();
    });

    document.addEventListener('keydown', function (e) {
        if (!session || !session.current || e.ctrlKey || e.metaKey || e.altKey) return;
        if (session.mode === 'missed') {
            if (e.key === 'ArrowLeft' && session.index > 0) openMiss(session.index - 1);
            else if (e.key === 'ArrowRight' && session.index < session.misses.length - 1) openMiss(session.index + 1);
            else if (e.key === 'Escape') backToResults();
            return;
        }
        var cur = session.current;
        var key = e.key.toUpperCase();
        if (cur.verdict && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) {
            if (stepShown(e.key === 'ArrowDown' ? 1 : -1)) e.preventDefault();
            return;
        }
        if (cur.play && !cur.verdict) {
            if (e.key === ' ') { e.preventDefault(); if (board) board.dice(); }
            else if (e.key === 'Backspace' || key === 'X') { e.preventDefault(); if (board) board.undo(); }
            return;
        }
        if (!cur.verdict) {
            var i = LETTERS.indexOf(key);
            if (i < 0 && /^[1-9]$/.test(key)) i = parseInt(key, 10) - 1;
            if (i >= 0 && i < cur.question.choices.length) {
                e.preventDefault();
                pick(i);
            }
        } else if (session.mode === 'review' && /^[1-4]$/.test(key)) {
            e.preventDefault();
            grade(parseInt(key, 10));
        }
    });

    $('file-btn').addEventListener('click', function () { $('file-input').click(); });
    ['add-open', 'add-open-side', 'empty-community'].forEach(function (id) {
        $(id).addEventListener('click', function () { openDialog('add-dialog'); });
    });
    $('settings-open').addEventListener('click', function () { openDialog('settings-dialog'); });
    $('empty-file').addEventListener('click', function () { $('file-input').click(); });
    $('empty-restore').addEventListener('click', function () { $('file-input').click(); });
    $('trainer-notice-close').addEventListener('click', function () { notify(''); });
    $('file-input').addEventListener('change', function () {
        importFile($('file-input').files[0]);
        $('file-input').value = '';
    });
    var drop = $('drop-zone');
    drop.addEventListener('dragover', function (e) {
        e.preventDefault();
        drop.classList.add('drop-zone--active');
    });
    drop.addEventListener('dragleave', function () { drop.classList.remove('drop-zone--active'); });
    drop.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        drop.classList.remove('drop-zone--active');
        importFile(e.dataTransfer.files[0]);
    });

    // A file dropped anywhere on the home view is added too.
    var shell = $('trainer-shell');
    var overlay = $('drop-overlay');
    function carriesFiles(e) {
        return view === 'home' && e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0;
    }
    shell.addEventListener('dragover', function (e) {
        if (!carriesFiles(e)) return;
        e.preventDefault();
        overlay.hidden = false;
    });
    shell.addEventListener('dragleave', function (e) {
        if (!shell.contains(e.relatedTarget)) overlay.hidden = true;
    });
    shell.addEventListener('drop', function (e) {
        overlay.hidden = true;
        if (!carriesFiles(e)) return;
        e.preventDefault();
        importFile(e.dataTransfer.files[0]);
    });

    // The shell fills the window below the sticky nav, whose height changes when it wraps.
    var nav = document.querySelector('.nav');
    if (nav && window.ResizeObserver) {
        new ResizeObserver(function () {
            shell.style.setProperty('--app-nav', nav.offsetHeight + 'px');
        }).observe(nav);
    }

    ['set-scheme', 'set-orientation', 'set-swap', 'set-new', 'set-answer'].forEach(function (id) {
        $(id).addEventListener('change', saveSettings);
    });
    $('backup-btn').addEventListener('click', downloadBackup);
    $('restore-btn').addEventListener('click', function () { $('file-input').click(); });

    // ── Start ──────────────────────────────────────────────────────────

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function () { /* works online without it */ });
    }
    setUpInstall();
    Store.open().then(loadSettings).then(refresh).then(function () {
        setStatus('Ready', 'ready');
        catalogLoaded = loadCatalog();
        return handleHash();
    }).catch(function (e) {
        setStatus(e.message, 'error');
    });
})();
