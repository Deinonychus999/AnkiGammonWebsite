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
    var DEFAULTS = { scheme: 'classic', orientation: 'ccw', swap: false, newPerDay: 20 };
    var LETTERS = 'ABCDEFGHIJ';

    var D = window.TrainDeck;
    var Store = window.TrainStore;
    var Rating = D.Rating;
    var scheduler = window.FSRS.fsrs({ enable_fuzz: true });

    var $ = function (id) { return document.getElementById(id); };

    var settings = Object.assign({}, DEFAULTS);
    var decks = [];
    var progressById = {};
    var newToday = { day: '', count: 0 };

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
        box.textContent = text || '';
        box.hidden = !text;
        box.className = 'trainer-notice' + (kind ? ' trainer-notice--' + kind : '');
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
        return { due: due, fresh: Math.max(0, (deck.count || 0) - seen) };
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
        var totalDue = 0, totalNew = 0;
        decks.sort(function (a, b) { return a.title.localeCompare(b.title); });
        decks.forEach(function (deck) {
            var c = deckCounts(deck, now);
            totalDue += c.due;
            totalNew += c.fresh;

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
            var study = el('button', 'btn btn-primary btn-sm', 'Study');
            study.type = 'button';
            study.disabled = !c.due && !(c.fresh && newLeftToday());
            study.addEventListener('click', function () { startSession(deck.id); });
            var remove = el('button', 'app-link-btn trainer-deck__remove', 'Remove');
            remove.type = 'button';
            remove.addEventListener('click', function () { removeDeck(deck); });
            actions.appendChild(study);
            actions.appendChild(remove);
            row.appendChild(actions);
            list.appendChild(row);
        });

        $('deck-empty').hidden = decks.length > 0;
        $('decks-heading').hidden = decks.length === 0;
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
        $('study-all').disabled = !totalDue && !newShown;
        renderCommunityState();
    }

    function refresh() {
        return Promise.all([Store.decks(), Store.progress(), Store.getMeta('newToday', { day: '', count: 0 })]).then(function (r) {
            decks = r[0];
            progressById = {};
            r[1].forEach(function (p) { progressById[p.id] = p; });
            newToday = r[2];
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

    function buildQueue(items) {
        var now = Date.now();
        var due = [], fresh = [];
        items.forEach(function (it) {
            var p = progressById[it.id];
            if (!p) fresh.push(it);
            else if (isDue(p, now)) due.push(it);
        });
        due.sort(function (a, b) { return new Date(progressById[a.id].card.due) - new Date(progressById[b.id].card.due); });
        return due.concat(fresh.slice(0, newLeftToday()));
    }

    function startSession(deckId) {
        notify('');
        Store.items(deckId || null).then(function (items) {
            var queue = buildQueue(items);
            if (!queue.length) {
                notify('Nothing to study right now.');
                return;
            }
            var title = deckId ? (decks.filter(function (d) { return d.id === deckId; })[0] || {}).title : 'All decks';
            session = { deckId: deckId, title: title, queue: queue, learning: [], answered: 0, best: 0, current: null };
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
        $('study-board').innerHTML = window.BoardRenderer.render(parsed.position, parsed.metadata, settings.scheme, settings.swap, orientation());
        $('study-context').textContent = contextLine(parsed.metadata);
        var dice = parsed.metadata.dice;
        $('study-prompt').textContent = q.cube || !dice ? q.prompt : 'You rolled ' + dice[0] + '-' + dice[1] + '. ' + q.prompt;
        $('study-left').textContent = plural(remaining(), 'position') + ' left';

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
        $('study-skip').hidden = false;
        $('study-answer').hidden = true;
        window.scrollTo(0, 0);
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
        if (cur.verdict === 'best') return q.cube ? 'Correct: ' + best + '.' : 'Best move.';
        if (cur.verdict === 'close') {
            return 'Close: ' + cur.picked.notation + ' is ' + D.answerError(d, cur.picked).toFixed(3) + ' behind ' + best + '.';
        }
        if (q.cube) return 'The best action is ' + best + ', not ' + cur.picked.notation + '.';
        return cur.picked.notation + ' loses ' + D.answerError(d, cur.picked).toFixed(3) + '. The best move is ' + best + '.';
    }

    function renderAnalysis(d, all) {
        var table = $('study-analysis');
        table.textContent = '';
        var head = el('tr');
        [D.isCube(d) ? 'Action' : 'Move', 'Equity', 'Error'].forEach(function (h) { head.appendChild(el('th', null, h)); });
        var thead = el('thead');
        thead.appendChild(head);
        table.appendChild(thead);
        var body = el('tbody');
        var picked = session.current.picked;
        D.analysisRows(d, all).forEach(function (row) {
            var tr = el('tr');
            if (row.best) tr.classList.add('is-best');
            if (row.move === picked) tr.classList.add('is-picked');
            var abs = Math.abs(row.error);
            tr.dataset.severity = abs < 0.0005 ? 'none' : abs < 0.02 ? 'small' : abs < 0.08 ? 'mid' : 'big';
            var name = el('td', 'study-analysis__move', row.label);
            if (row.move.was_played) name.appendChild(el('span', 'study-tag', 'Played'));
            if (row.move.analysis_level && !D.isCube(d)) name.appendChild(el('span', 'study-level', row.move.analysis_level));
            tr.appendChild(name);
            tr.appendChild(el('td', 'study-analysis__num', fmtEquity(row.equity)));
            tr.appendChild(el('td', 'study-analysis__num', fmtError(row.error)));
            body.appendChild(tr);
        });
        table.appendChild(body);
        var more = d.candidate_moves.filter(function (m) { return m.from_xg_analysis !== false; }).length - body.rows.length;
        $('study-all-moves').hidden = all || more <= 0;
        $('study-all-moves').textContent = 'Show ' + plural(more, 'more move');
    }

    function pct(n) {
        return n === null || n === undefined ? '–' : n.toFixed(1) + '%';
    }

    function renderChances(d) {
        var src = D.isCube(d) ? d : D.bestMove(d);
        var box = $('study-chances');
        box.textContent = '';
        if (src.player_win_pct === null || src.player_win_pct === undefined) {
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
        box.appendChild(el('p', 'study-chances__label', D.isCube(d) ? 'Winning chances' : 'Winning chances after ' + src.notation));
        box.appendChild(table);
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

    function reveal() {
        var cur = session.current;
        var d = cur.item.decision;
        var bestIndex = cur.question.choices.indexOf(cur.question.best);
        Array.prototype.forEach.call(document.querySelectorAll('#study-choices .study-choice'), function (btn, i) {
            btn.disabled = true;
            if (i === bestIndex) btn.classList.add('is-answer');
            if (cur.picked && cur.question.choices[i] === cur.picked && i !== bestIndex) btn.classList.add('is-' + cur.verdict);
        });
        var verdict = $('study-verdict');
        verdict.textContent = verdictText(cur);
        verdict.dataset.verdict = cur.verdict;
        renderAnalysis(d);
        renderChances(d);
        renderNote(d);
        $('study-skip').hidden = true;
        $('study-answer').hidden = false;
        renderGrades(D.suggestedRating(cur.verdict));
    }

    function pick(i) {
        var cur = session.current;
        if (!cur || cur.verdict) return;
        cur.picked = cur.question.choices[i];
        cur.verdict = D.verdict(cur.item.decision, cur.picked);
        reveal();
    }

    function skip() {
        var cur = session.current;
        if (!cur || cur.verdict) return;
        cur.verdict = 'wrong';
        reveal();
    }

    function grade(rating) {
        var cur = session.current;
        if (!cur || !cur.verdict) return;
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
        session = null;
        showView('done');
    }

    function leaveStudy() {
        session = null;
        showView('home');
        refresh();
    }

    function showView(name) {
        $('view-home').hidden = name !== 'home';
        $('view-study').hidden = name !== 'study';
        $('view-done').hidden = name !== 'done';
        document.body.classList.toggle('is-studying', name !== 'home');
        window.scrollTo(0, 0);
    }

    // ── Settings ───────────────────────────────────────────────────────

    function loadSettings() {
        return Store.getMeta('settings', {}).then(function (saved) {
            settings = Object.assign({}, DEFAULTS, saved);
            $('set-scheme').value = settings.scheme;
            $('set-orientation').value = settings.orientation;
            $('set-swap').checked = !!settings.swap;
            $('set-new').value = settings.newPerDay;
        });
    }

    function saveSettings() {
        var n = parseInt($('set-new').value, 10);
        settings = {
            scheme: $('set-scheme').value,
            orientation: $('set-orientation').value,
            swap: $('set-swap').checked,
            newPerDay: isFinite(n) && n >= 0 ? Math.min(n, 9999) : DEFAULTS.newPerDay
        };
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

    // ── Entry points: #deck=<id> from a deck page, #inbox from the app ──

    function handleHash() {
        var hash = location.hash.replace(/^#/, '');
        if (!hash) return Promise.resolve();
        history.replaceState(null, '', location.pathname + location.search);
        var m = /^deck=([\w-]+)$/.exec(hash);
        if (m) {
            var id = m[1];
            return catalogLoaded.then(function () {
                return addCommunityDeck(id, (catalog || []).filter(function (d) { return d.id === id; })[0]);
            });
        }
        if (hash === 'inbox') {
            return Store.takeInbox('app').then(function (entry) {
                if (!entry) return;
                return importApkg(entry.bytes, entry.name + '.apkg', { title: entry.name, id: 'app:' + D.slug(entry.name), source: 'app' });
            }).catch(function (e) { notify(e.message, 'error'); }).then(function () { setStatus('Ready', 'ready'); });
        }
        return Promise.resolve();
    }

    // ── Events ─────────────────────────────────────────────────────────

    $('study-all').addEventListener('click', function () { startSession(null); });
    $('study-back').addEventListener('click', function () { history.back(); });
    $('done-back').addEventListener('click', leaveStudy);
    $('study-skip').addEventListener('click', skip);
    $('study-all-moves').addEventListener('click', function () {
        if (session && session.current) renderAnalysis(session.current.item.decision, true);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#study-grades [data-rating]'), function (btn) {
        btn.addEventListener('click', function () { grade(parseInt(btn.dataset.rating, 10)); });
    });
    window.addEventListener('popstate', function () {
        if (!$('view-home').hidden) return;
        leaveStudy();
    });

    document.addEventListener('keydown', function (e) {
        if (!session || !session.current || e.ctrlKey || e.metaKey || e.altKey) return;
        var cur = session.current;
        var key = e.key.toUpperCase();
        if (!cur.verdict) {
            var i = LETTERS.indexOf(key);
            if (i < 0 && /^[1-9]$/.test(key)) i = parseInt(key, 10) - 1;
            if (i >= 0 && i < cur.question.choices.length) {
                e.preventDefault();
                pick(i);
            }
        } else if (/^[1-4]$/.test(key)) {
            e.preventDefault();
            grade(parseInt(key, 10));
        }
    });

    $('file-btn').addEventListener('click', function () { $('file-input').click(); });
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
        drop.classList.remove('drop-zone--active');
        importFile(e.dataTransfer.files[0]);
    });

    ['set-scheme', 'set-orientation', 'set-swap', 'set-new'].forEach(function (id) {
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
