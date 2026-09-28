/**
 * Browser app UI. The Python side (ankigammon.web under Pyodide) lives in
 * app-worker.js; this file keeps the page state and talks to it.
 */
(function () {
    'use strict';

    var root = document.getElementById('app');
    if (!root) return;
    // The window HedgeHog sends back to after connecting never starts the app.
    var H = window.AgHedgeHog;
    if (H && H.handleCallback()) return;

    var PREFS_KEY = 'ankigammon-app-prefs-v1';
    var CARD_SETTINGS = ['color_scheme', 'board_orientation', 'max_moves', 'score_format',
        'show_pip_count', 'swap_checker_colors', 'split_cube_decisions',
        'generate_score_matrix', 'generate_move_score_matrix', 'generate_move_cube_matrix'];
    var MATRIX_SETTINGS = ['generate_score_matrix', 'generate_move_score_matrix', 'generate_move_cube_matrix'];
    var CARD_FLAGS = ['show_options', 'interactive_moves'];

    var $ = function (id) { return document.getElementById(id); };

    var wheels = [];
    try { wheels = JSON.parse(root.dataset.wheels || '[]'); } catch (e) { wheels = []; }

    // ── Worker RPC ─────────────────────────────────────────────────────

    var worker = null;
    var pending = {};
    var nextId = 0;
    var ready = false;

    function call(cmd, args, transfer) {
        return new Promise(function (resolve, reject) {
            var id = nextId++;
            pending[id] = { resolve: resolve, reject: reject };
            worker.postMessage({ id: id, cmd: cmd, args: args }, transfer || []);
        });
    }

    function onWorkerMessage(event) {
        var data = event.data;
        if (data.type === 'status') {
            setStatus(data.text, 'busy');
            if (/AnkiGammon/.test(data.text)) bootStep('ankigammon');
            return;
        }
        if (data.type === 'send-progress') {
            setStatus('Sending to Anki: ' + data.done + ' of ' + plural(data.total, 'card') + '…', 'busy');
            return;
        }
        var p = pending[data.id];
        delete pending[data.id];
        if (!p) return;
        if (data.ok) {
            p.resolve(data.result);
        } else {
            if (data.detail) console.error(data.detail);
            p.reject(new Error(data.error));
        }
    }

    // ── Status and errors ──────────────────────────────────────────────

    function setStatus(text, state) {
        $('app-status-text').textContent = text;
        $('app-status').dataset.state = state || '';
    }

    // ── Startup progress in the middle of the stage ────────────────────

    var BOOT_ORDER = ['python', 'ankigammon'];
    // Set after the first successful start. Pyodide's files are cached by the
    // browser for a year, so later visits start Python from cache rather than
    // downloading it (unless the browser has cleared its cache).
    var STARTED_KEY = 'ankigammon-app-started';

    function startedBefore() {
        try { return localStorage.getItem(STARTED_KEY) === '1'; } catch (e) { return false; }
    }

    function describeBoot() {
        if (!startedBefore()) return;
        $('app-boot-python').textContent = 'Starting Python';
        $('app-boot-note').textContent = 'Loading from this browser, which keeps the files from your first visit.';
    }

    function bootStep(step) {
        var reached = BOOT_ORDER.indexOf(step);
        document.querySelectorAll('#app-boot [data-step]').forEach(function (li) {
            var i = BOOT_ORDER.indexOf(li.dataset.step);
            li.dataset.state = i < reached ? 'done' : i === reached ? 'active' : 'waiting';
        });
    }

    // analytics.js loads deferred, after this script, so look it up per call.
    function track(name, props) {
        if (window.agTrack) window.agTrack(name, props);
    }

    function sourceKind() {
        if (!source) return null;
        if (source.kind === 'text') return 'paste';
        if (source.kind === 'analyzed') return 'ids';
        if (source.name === 'sample-match.xg') return 'sample';
        return ((source.label || source.name).match(/\.(\w+)$/) || [, 'other'])[1].toLowerCase();
    }

    function bootReady() {
        track('app_ready', { seconds: Math.round(performance.now() / 1000) });
        try { localStorage.setItem(STARTED_KEY, '1'); } catch (e) { /* storage blocked */ }
        bootStep('done');
        $('app-boot').hidden = true;
        $('app-start').hidden = false;
    }

    function bootFail(message) {
        var active = document.querySelector('#app-boot [data-state="active"]');
        if (active) active.dataset.state = 'error';
        $('app-boot').dataset.state = 'error';
        $('app-boot-note').textContent = message;
        $('app-boot-failed').hidden = false;
        track('app_start_failed');
    }

    function showError(message) {
        $('error-message').textContent = message;
        $('error-display').hidden = !message;
    }

    // ── Preferences (per viewer, best effort) ──────────────────────────

    function loadPrefs() {
        try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; }
    }

    function savePrefs() {
        var prefs = cardOptions();
        prefs.checker = $('checker-threshold').value;
        prefs.cube = $('cube-threshold').value;
        prefs.deck = $('deck-name').value;
        prefs.use_subdecks = $('use-subdecks').checked;
        prefs.night_mode = nightMode;
        prefs.anki_url = $('anki-url').value.trim();
        prefs.hedgehog_preset = $('hedgehog-preset').value;
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* storage blocked */ }
    }

    function applyPrefs(prefs) {
        CARD_SETTINGS.concat(CARD_FLAGS).forEach(function (key) {
            var el = $('opt-' + key);
            if (!el || prefs[key] === undefined) return;
            if (el.type === 'checkbox') el.checked = !!prefs[key];
            else el.value = String(prefs[key]);
        });
        if (prefs.checker !== undefined) $('checker-threshold').value = prefs.checker;
        if (prefs.cube !== undefined) $('cube-threshold').value = prefs.cube;
        if (prefs.deck) $('deck-name').value = prefs.deck;
        if (prefs.use_subdecks !== undefined) $('use-subdecks').checked = !!prefs.use_subdecks;
        if (prefs.night_mode !== undefined) nightMode = !!prefs.night_mode;
        if (prefs.anki_url) $('anki-url').value = prefs.anki_url;
        if (prefs.hedgehog_preset) $('hedgehog-preset').value = prefs.hedgehog_preset;
    }

    function cardOptions() {
        var out = {};
        CARD_SETTINGS.concat(CARD_FLAGS).forEach(function (key) {
            var el = $('opt-' + key);
            if (el.type === 'checkbox') out[key] = el.checked;
            else if (key === 'max_moves') out[key] = parseInt(el.value, 10);
            else out[key] = el.value;
        });
        return out;
    }

    function cardSettings() {
        var all = cardOptions();
        var out = {};
        CARD_SETTINGS.forEach(function (key) { out[key] = all[key]; });
        out.hedgehog_preset = $('hedgehog-preset').value;
        return out;
    }

    function matricesWanted() {
        var all = cardOptions();
        return MATRIX_SETTINGS.some(function (key) { return all[key]; });
    }

    function threshold(id) {
        var v = parseFloat($(id).value);
        return isFinite(v) && v >= 0 ? v : 0.08;
    }

    // ── Loading a source ───────────────────────────────────────────────

    var source = null;
    var positions = [];
    var players = { o: null, x: null };
    var active = -1;
    var loadToken = 0;

    function setBusy(busy) {
        ['browse-btn', 'paste-open', 'empty-open', 'empty-paste', 'sample-btn', 'paste-btn'].forEach(function (id) {
            $(id).disabled = busy || !ready;
        });
    }

    // Loads, analyses and exports can overlap (a preview's matrix fetch runs
    // while an export waits), so opening another file stays off until all end.
    var working = 0;

    function beginWork() {
        working++;
        setBusy(true);
    }

    function endWork() {
        working = Math.max(0, working - 1);
        setBusy(working > 0);
    }

    function setView(view) {
        $('app-shell').dataset.view = view;
        $('stage-empty').hidden = view !== 'empty';
        $('stage-preview').hidden = view === 'empty';
        $('position-list').hidden = view === 'empty';
    }

    function isMatchFile() {
        return source && source.kind === 'file' && /\.(xg|ogxm)$/i.test(source.name);
    }

    function load(newSource) {
        if (!ready) return;
        // A failed load leaves the list on screen, so later reloads (a new
        // threshold) must keep using the source that list came from.
        var shown = source;
        source = newSource || source;
        // Positions HedgeHog analyzed from a paste exist only in the worker.
        if (!source || source.kind === 'analyzed') return;
        var token = ++loadToken;
        showError('');
        beginWork();
        setStatus(source.kind === 'file' ? 'Reading ' + (source.label || source.name) + '…' : 'Reading the pasted analysis…', 'busy');

        var request;
        if (source.kind === 'file') {
            var bytes = source.bytes.slice(0);
            request = call('configure', { settings: cardSettings() }).then(function () {
                return call('loadFile', {
                    name: source.name,
                    bytes: bytes,
                    checker: threshold('checker-threshold'),
                    cube: threshold('cube-threshold'),
                    includeX: $('include-x').checked,
                    includeO: $('include-o').checked,
                    sourceDescription: source.sourceDescription || null
                }, [bytes]);
            });
        } else {
            request = call('configure', { settings: cardSettings() }).then(function () {
                return call('loadText', { text: source.text });
            });
        }

        request.then(function (result) {
            if (token !== loadToken) return;
            showResult(result);
            track('app_file_loaded', { kind: sourceKind(), positions: positions.length });
        }).catch(function (e) {
            if (token !== loadToken) return;
            track('app_file_failed', { kind: sourceKind() });
            source = shown;
            setStatus('Ready', 'ready');
            showError(e.message);
        }).then(endWork);
    }

    function showResult(result) {
        if (result.players) players = result.players;
        else if (source.kind !== 'file' || !isMatchFile()) players = { o: null, x: null };
        positions = result.positions.map(function (p) { return Object.assign({ picked: true }, p); });
        showLoaded(result.total);
    }

    function playerName(side) {
        return players[side === 'X' ? 'x' : 'o'] || ('Player ' + side);
    }

    function plural(n, word) {
        return n + ' ' + word + (n === 1 ? '' : 's');
    }

    function showLoaded(total) {
        var label = source.kind === 'file' ? (source.label || source.name)
            : source.kind === 'analyzed' ? 'Pasted positions' : 'Pasted analysis';
        var meta;
        if (isMatchFile()) {
            meta = plural(positions.length, 'mistake') + ' kept from ' + plural(total, 'decision') + '.';
        } else if (source.kind === 'analyzed') {
            meta = plural(positions.length, 'position') + (source.byHedgeHog === positions.length
                ? ', analyzed by HedgeHog.' : ' (' + source.byHedgeHog + ' analyzed by HedgeHog).');
        } else if (source.kind === 'text' && total > positions.length) {
            var skipped = total - positions.length;
            meta = plural(positions.length, 'analyzed position') + '. ' + plural(skipped, 'position') +
                ' without analysis ' + (skipped === 1 ? 'was' : 'were') + ' skipped.';
        } else {
            meta = plural(positions.length, 'position') + '.';
        }
        $('source-meta').textContent = label + ': ' + meta;

        $('filter-panel').hidden = !isMatchFile();
        $('name-o').textContent = playerName('O');
        $('name-x').textContent = playerName('X');

        setView('loaded');
        active = -1;
        renderList();
        setStatus('Ready', 'ready');
        if (positions.length) selectPosition(positions[0].index, false);
        else clearPreview(isMatchFile() ? 'No mistakes at these thresholds. Lower them to keep more positions.' : '');
    }

    // ── Position list ──────────────────────────────────────────────────

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function renderList() {
        var rows = $('rows');
        rows.textContent = '';
        if (!positions.length) {
            var tr = el('tr');
            var td = el('td', 'app-table__empty', isMatchFile()
                ? 'No mistakes at these thresholds. Lower them to keep more positions.'
                : 'No positions.');
            td.colSpan = 2;
            tr.appendChild(td);
            rows.appendChild(tr);
        }
        positions.forEach(function (p) {
            var tr = el('tr', p.index === active ? 'is-active' : '');
            tr.dataset.index = p.index;
            tr.tabIndex = 0;

            var pickCell = el('td', 'app-table__pick');
            var box = el('input');
            box.type = 'checkbox';
            box.checked = p.picked;
            box.dataset.pick = p.index;
            box.setAttribute('aria-label', 'Include position ' + (p.index + 1));
            pickCell.appendChild(box);
            tr.appendChild(pickCell);

            var main = el('td', 'app-row');
            var top = el('div', 'app-row__top');
            top.appendChild(el('span', 'app-row__who', playerName(p.on_roll) + (p.dice ? ' ' + p.dice.join('-') : '')));
            top.appendChild(el('span', 'app-row__err', p.error !== null ? p.error.toFixed(3) : ''));
            var bottom = el('div', 'app-row__bottom');
            bottom.appendChild(el('span', 'app-tag app-tag--' + p.type, p.type === 'cube' ? 'Cube' : 'Checker'));
            if (p.has_note) bottom.appendChild(el('span', 'app-tag app-tag--note', 'Note'));
            bottom.appendChild(el('span', 'app-row__move', p.played || ''));
            if (p.game !== null) bottom.appendChild(el('span', 'app-row__game', 'Game ' + p.game));
            main.appendChild(top);
            main.appendChild(bottom);
            tr.appendChild(main);
            rows.appendChild(tr);
        });
        renderCounts();
    }

    // Updating in place keeps keyboard focus on the checkbox or row the user is on.
    function renderCounts() {
        var picked = positions.filter(function (p) { return p.picked; }).length;
        $('pick-count').textContent = positions.length ? picked + ' of ' + positions.length + ' selected' : '';
        $('select-all').checked = positions.length > 0 && picked === positions.length;
        $('select-all').indeterminate = picked > 0 && picked < positions.length;
        $('select-all').disabled = !positions.length;
        $('export-btn').disabled = picked === 0 || !ready;
        $('export-btn').textContent = picked ? 'Download .apkg (' + plural(picked, 'card') + ')' : 'Download .apkg';
        $('send-btn').disabled = picked === 0 || !ready || sending;
        $('train-btn').disabled = picked === 0 || !ready;
    }

    // ── Card preview ───────────────────────────────────────────────────

    // Mirrors Anki's reviewer: one <body> that survives flipping (the cards
    // keep the chosen option on body.dataset) and a #qa node whose scripts
    // run again on every side, with pycmd('ans') flipping to the back.
    // Theme variables, margins and night-mode classes are Anki 25.9's
    // (webview.css, reviewer.css, aqt/theme.py); the card CSS relies on them.
    // color-scheme matters: the card CSS colors text with --text-fg, which
    // Anki no longer defines, so text falls back to the scheme's default.
    var ANKI_CSS = ':root{--fg:#020202;--canvas:#f5f5f5;--canvas-elevated:#fff;--canvas-inset:#fff;' +
        '--border:#c4c4c4;color-scheme:light}' +
        ':root.night-mode{--fg:#fcfcfc;--canvas:#2c2c2c;--canvas-elevated:#363636;--canvas-inset:#2c2c2c;' +
        '--border:#202020;color-scheme:dark}' +
        'body{color:var(--fg);background:var(--canvas);margin:20px;overflow-wrap:break-word}';
    var REVIEWER = '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<style>' + ANKI_CSS + '</style>' +
        '<style id="card-css"></style></head><body class="card card1"><div id="qa"></div><script>' +
        'window.pycmd = function (c) { if (c === "ans") parent.postMessage({ type: "ag-show-answer" }, "*"); };' +
        'window.setQA = function (html) {' +
        '  var qa = document.getElementById("qa"); qa.innerHTML = html;' +
        '  qa.querySelectorAll("script").forEach(function (old) {' +
        '    var s = document.createElement("script"); s.textContent = old.textContent; old.replaceWith(s);' +
        '  });' +
        '  window.scrollTo(0, 0);' +
        '};' +
        '<\/script></body></html>';

    var frame = $('card-frame');
    var frameReady = new Promise(function (resolve) {
        frame.addEventListener('load', resolve, { once: true });
        frame.srcdoc = REVIEWER;
    });
    var card = null;
    var previewToken = 0;

    var nightMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    function applyTheme() {
        frameReady.then(function () {
            var d = frame.contentDocument;
            d.documentElement.classList.toggle('night-mode', nightMode);
            d.body.classList.toggle('nightMode', nightMode);
            d.body.classList.toggle('night_mode', nightMode);
        });
        $('theme-light').classList.toggle('app-seg__btn--on', !nightMode);
        $('theme-dark').classList.toggle('app-seg__btn--on', nightMode);
        $('theme-light').setAttribute('aria-pressed', !nightMode);
        $('theme-dark').setAttribute('aria-pressed', nightMode);
    }

    function showSide(side) {
        if (!card) return;
        frameReady.then(function () {
            var w = frame.contentWindow;
            w.document.getElementById('card-css').textContent = card.css;
            if (side === 'front') delete w.document.body.dataset.ankigammonChoice;
            w.setQA(side === 'front' ? card.front : card.back);
            $('show-front').classList.toggle('app-seg__btn--on', side === 'front');
            $('show-back').classList.toggle('app-seg__btn--on', side === 'back');
            $('show-front').setAttribute('aria-pressed', side === 'front');
            $('show-back').setAttribute('aria-pressed', side === 'back');
        });
    }

    function clearPreview(message) {
        card = null;
        frameReady.then(function () { frame.contentWindow.setQA(''); });
        $('preview-hint').textContent = message || '';
        $('show-front').disabled = $('show-back').disabled = true;
    }

    function selectPosition(index, focusRow) {
        active = index;
        document.querySelectorAll('#rows tr[data-index]').forEach(function (tr) {
            tr.classList.toggle('is-active', +tr.dataset.index === index);
        });
        if (focusRow) {
            var row = document.querySelector('#rows tr[data-index="' + index + '"]');
            if (row) row.focus();
        }
        refreshPreview();
    }

    function refreshPreview() {
        if (active < 0 || !ready) return;
        var token = ++previewToken;
        var opts = cardOptions();
        $('preview-hint').textContent = 'Rendering…';
        var index = active;
        var current = function () { return token === previewToken; };
        fetchMatrices([index], 'preview', current).then(function () {
            if (!current()) return null;
            return call('preview', { index: index, showOptions: opts.show_options, interactiveMoves: opts.interactive_moves });
        }).then(function (result) {
            if (!result || !current()) return;
            card = result;
            $('show-front').disabled = $('show-back').disabled = false;
            $('preview-hint').textContent = result.warnings && result.warnings.length
                ? 'Some card-back analyses are missing: ' + result.warnings[0]
                : opts.show_options ? 'Pick a move on the front to flip it, as in Anki.' : 'Use Back to see the answer.';
            showSide('front');
        }).catch(function (e) {
            if (token !== previewToken) return;
            clearPreview('This card could not be drawn: ' + e.message);
        });
    }

    window.addEventListener('message', function (e) {
        if (e.source === frame.contentWindow && e.data && e.data.type === 'ag-show-answer') showSide('back');
    });

    // ── Export ─────────────────────────────────────────────────────────

    // ── Send to Anki ───────────────────────────────────────────────────

    var ANKI_DEFAULT_URL = 'http://127.0.0.1:8765';
    var sending = false;

    // Runs on the page, not in the worker: this first request is what opens
    // Anki's permission dialog and the browser's local-network prompt. A
    // string body keeps it a CORS simple request, which AnkiConnect answers
    // for origins it doesn't know yet.
    function ankiRequest(url, action, key) {
        var body = { action: action, version: 6 };
        if (key) body.key = key;
        return fetch(url, { method: 'POST', body: JSON.stringify(body) }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    function showAnkiHelp(kind, detail) {
        var lead = {
            unreachable: 'Could not reach Anki.',
            denied: 'Anki refused the connection.',
            key: 'Your AnkiConnect needs an API key.',
            failed: 'Sending stopped: ' + (detail || 'unknown error') + '.'
        }[kind];
        $('anki-help-lead').textContent = lead;
        $('anki-help-origin').textContent = location.origin;
        document.querySelectorAll('#anki-help [data-case]').forEach(function (el) {
            el.hidden = el.dataset.case.split(' ').indexOf(kind) < 0;
        });
        if (!$('anki-help').open) $('anki-help').showModal();
    }

    function selectOptionsTab(tab) {
        document.querySelectorAll('#options-dialog [role="tab"]').forEach(function (t) {
            var on = t === tab;
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            t.tabIndex = on ? 0 : -1;
            $(t.getAttribute('aria-controls')).hidden = !on;
        });
    }

    function openOptions(focusId) {
        var dialog = $('options-dialog');
        if (focusId) selectOptionsTab($($(focusId).closest('[role="tabpanel"]').getAttribute('aria-labelledby')));
        if (!dialog.open) {
            dialog.showModal();
            if (!connecting) refreshHedgeHogStatus();
        }
        if (focusId) $(focusId).focus();
    }

    function syncDeckChip() {
        $('deck-chip-name').textContent = $('deck-name').value.trim() || 'AnkiGammon';
    }

    function sendToAnki() {
        var picked = positions.filter(function (p) { return p.picked; });
        if (!picked.length || sending) return;
        withMatrices(function () { sendPicked(picked); });
    }

    function exportCancelled(e) {
        return e && e.cancelled;
    }

    function showWarnings(warnings) {
        if (warnings && warnings.length) showError(warnings.join(' '));
    }

    function sendPicked(picked) {
        var url = $('anki-url').value.trim() || ANKI_DEFAULT_URL;
        var key = $('anki-key').value.trim();
        var opts = cardOptions();
        sending = true;
        beginWork();
        renderCounts();
        if ($('anki-help').open) $('anki-help').close();
        showError('');
        setStatus('Connecting to Anki…', 'busy');

        ankiRequest(url, 'requestPermission').catch(function () {
            throw { help: 'unreachable' };
        }).then(function (reply) {
            var result = (reply && reply.result) || {};
            if (result.permission !== 'granted') throw { help: 'denied' };
            if (result.requireApikey && !key) throw { help: 'key' };
            return fetchMatrices(picked.map(function (p) { return p.index; }), 'export');
        }).then(function () {
            return call('sendToAnki', {
                indices: picked.map(function (p) { return p.index; }),
                deckName: $('deck-name').value.trim() || 'AnkiGammon',
                url: url,
                apiKey: key,
                showOptions: opts.show_options,
                interactiveMoves: opts.interactive_moves,
                useSubdecks: $('use-subdecks').checked
            });
        }).then(function (summary) {
            var parts = [];
            if (summary.added) parts.push(summary.added + ' added');
            if (summary.updated) parts.push(summary.updated + ' updated');
            setStatus('Sent ' + plural(summary.total, 'card') + ' to Anki (' + parts.join(', ') + ').', 'ready');
            showWarnings(summary.warnings);
            track('app_sent_to_anki', { cards: summary.total });
        }).catch(function (e) {
            if (exportCancelled(e)) { setStatus('Sending cancelled.', 'ready'); return; }
            track('app_send_failed', { reason: (e && e.help) || 'failed' });
            setStatus('Ready', 'ready');
            if (e && e.help) showAnkiHelp(e.help);
            else showAnkiHelp('failed', e && e.message);
        }).then(function () {
            sending = false;
            endWork();
            renderCounts();
        });
    }

    function buildDeck(picked, deckName) {
        var opts = cardOptions();
        return fetchMatrices(picked.map(function (p) { return p.index; }), 'export').then(function () {
            setStatus('Building ' + plural(picked.length, 'card') + '…', 'busy');
            return call('exportDeck', {
                indices: picked.map(function (p) { return p.index; }),
                deckName: deckName,
                showOptions: opts.show_options,
                interactiveMoves: opts.interactive_moves,
                useSubdecks: $('use-subdecks').checked
            });
        });
    }

    // The positions go to the trainer as a study pack, through its IndexedDB inbox.
    function studyInTrainer() {
        var picked = positions.filter(function (p) { return p.picked; });
        if (!picked.length) return;
        withMatrices(function () { trainPicked(picked); });
    }

    function trainPicked(picked) {
        var deckName = ($('deck-name').value.trim() || 'AnkiGammon').split('::').pop();
        $('train-btn').disabled = true;
        beginWork();
        fetchMatrices(picked.map(function (p) { return p.index; }), 'export').then(function () {
            setStatus('Preparing ' + plural(picked.length, 'position') + ' for the trainer…', 'busy');
            return call('exportPack', {
                indices: picked.map(function (p) { return p.index; }),
                deckName: deckName
            });
        }).then(function (pack) {
            return window.TrainStore.putInbox('app', { name: deckName, pack: pack });
        }).then(function () {
            track('app_study_in_trainer', { cards: picked.length });
            location.href = '../train/#inbox';
        }).catch(function (e) {
            endWork();
            renderCounts();
            if (exportCancelled(e)) { setStatus('Cancelled.', 'ready'); return; }
            setStatus('Ready', 'ready');
            showError('The cards could not be opened in the trainer: ' + e.message);
        });
    }

    function exportDeck() {
        var picked = positions.filter(function (p) { return p.picked; });
        if (!picked.length) return;
        withMatrices(function () { downloadPicked(picked); });
    }

    function downloadPicked(picked) {
        var deckName = $('deck-name').value.trim() || 'AnkiGammon';
        $('export-btn').disabled = true;
        beginWork();
        buildDeck(picked, deckName).then(function (buffer) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([buffer], { type: 'application/octet-stream' }));
            a.download = deckName.replace(/::/g, ' - ').replace(/[\\/:*?"<>|]+/g, '_') + '.apkg';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000);
            setStatus('Downloaded ' + plural(picked.length, 'card') + '. Open the file to import it into Anki.', 'ready');
            track('app_apkg_downloaded', { cards: picked.length });
            return call('generationWarnings').then(showWarnings);
        }).catch(function (e) {
            if (exportCancelled(e)) { setStatus('Download cancelled.', 'ready'); return; }
            setStatus('Ready', 'ready');
            showError('The deck could not be built: ' + e.message);
        }).then(function () {
            endWork();
            renderCounts();
        });
    }

    // ── HedgeHog analysis ──────────────────────────────────────────────

    var hedgehogLabels = null;
    var connecting = false;
    var runs = [];
    var afterConnect = null;
    var matrixQueue = Promise.resolve();

    function presetLabel(preset) {
        return (hedgehogLabels && hedgehogLabels[preset]) || H.PRESET_LABELS[preset] || preset;
    }

    function fillPresets(presets) {
        var select = $('hedgehog-preset');
        var current = select.value;
        select.textContent = '';
        presets.forEach(function (preset) {
            var option = el('option', null, presetLabel(preset));
            option.value = preset;
            select.appendChild(option);
        });
        select.value = presets.indexOf(current) >= 0 ? current : presets.indexOf('2ply') >= 0 ? '2ply' : presets[0];
    }

    function analysesLeft(allowance) {
        return allowance ? Math.max(0, allowance.limit - allowance.used + (allowance.credits || 0)) : 0;
    }

    function syncHedgeHogBadges() {
        var connected = H.isConnected();
        $('hedgehog-chip-state').textContent = connected ? 'Connected' : 'Connect';
        $('hedgehog-chip').classList.toggle('is-connected', connected);
        $('hedgehog-panel-btn').textContent = connected ? 'HedgeHog settings' : 'Connect HedgeHog';
    }

    function openHedgeHogSettings() {
        openOptions('hedgehog-connect');
    }

    function refreshHedgeHogStatus() {
        syncHedgeHogBadges();
        var connected = H.isConnected();
        $('hedgehog-connect').textContent = connected ? 'Disconnect' : 'Connect HedgeHog';
        $('hedgehog-status').textContent = connected ? 'Connected.' : 'Not connected.';
        if (!connected) return;
        H.me().then(function (me) {
            hedgehogLabels = me.preset_labels || null;
            fillPresets((me.presets && me.presets.position) || Object.keys(H.PRESET_LABELS));
            var text = 'Connected' + (me.username ? ' as ' + me.username : '') + '.';
            var allowance = me.allowance;
            if (allowance && allowance.position && allowance.position.limit !== null) {
                text += ' Free plan, left today: ' + analysesLeft(allowance.position) + ' position and ' +
                    analysesLeft(allowance.match) + ' match analyses.';
            }
            $('hedgehog-status').textContent = text;
        }).catch(function (e) {
            $('hedgehog-status').textContent = e.message;
            $('hedgehog-connect').textContent = H.isConnected() ? 'Disconnect' : 'Connect HedgeHog';
            syncHedgeHogBadges();
        });
    }

    function allowanceLeft(me, kind) {
        var allowance = me && me.allowance && me.allowance[kind];
        return allowance && allowance.limit !== null ? analysesLeft(allowance) : null;
    }

    // On HedgeHog's free plan, asks before a run needs more analyses than are
    // left today; HedgeHog would refuse the rest part way through.
    function confirmCost(kind, cost) {
        if (!cost) return Promise.resolve(true);
        return H.me().then(function (me) {
            var left = allowanceLeft(me, kind);
            if (left === null || cost <= left) return true;
            return window.confirm('This needs about ' + cost + ' ' + kind + (cost === 1 ? ' analysis' : ' analyses') +
                ' on HedgeHog, and your free plan has ' + left + ' left today. HedgeHog will refuse the rest.\n\nContinue anyway?');
        }, function () { return true; });  // the run itself shows what HedgeHog says
    }

    function noteAllowance(text) {
        H.me().then(function (me) {
            var positionsLeft = allowanceLeft(me, 'position');
            if (positionsLeft === null) return;
            setStatus(text + ' HedgeHog free plan: ' + positionsLeft + ' position and ' +
                allowanceLeft(me, 'match') + ' match analyses left today.', 'ready');
        }).catch(function () { /* the note is optional */ });
    }

    // Score matrices and the other card-back analyses: the worker says which
    // positions the cards will ask about, the page fetches them, and the cards
    // are built from the answers, cached per depth for the session. Runs one at
    // a time. For an export, declining the cost or cancelling stops the export;
    // a preview goes on without the analyses, and skips the fetch once stale.
    function fetchMatrices(indices, mode, stillWanted) {
        var run = matrixQueue.then(function () { return fetchMatricesNow(indices, mode, stillWanted); });
        matrixQueue = run.catch(function () {});
        return run;
    }

    function fetchMatricesNow(indices, mode, stillWanted) {
        var stop = function () {
            if (mode === 'export') throw { cancelled: true };
            return null;
        };
        return call('configure', { settings: cardSettings() }).then(function () {
            if (!matricesWanted() || !H.isConnected() || (stillWanted && !stillWanted())) return null;
            var preset = $('hedgehog-preset').value;
            return call('matrixRequests', { indices: indices, preset: preset }).then(function (requests) {
                if (!requests.xgids.length) return null;
                return confirmCost('position', requests.cost).then(function (go) {
                    if (!go) return stop();
                    var controller = startAnalysis();
                    setStatus('HedgeHog is analyzing the card-back analyses: ' + plural(requests.xgids.length, 'position') + '…', 'busy');
                    return H.analyzePositions(requests.batches, preset, function (done, total) {
                        setStatus('Card-back analyses: HedgeHog analyzed ' + done + ' of ' + plural(total, 'position') + '…', 'busy');
                    }, controller.signal).then(function (results) {
                        return call('applyMatrixAnalysis', { xgids: requests.xgids, results: results, preset: preset });
                    }).then(function (stored) {
                        endAnalysis(controller);
                        setStatus('Ready', 'ready');
                        if (stored.failed.length) {
                            showError('Card-back analyses left off for ' + plural(stored.failed.length, 'position') +
                                ': ' + stored.failed[0]);
                        }
                    }, function (e) {
                        endAnalysis(controller);
                        if (e && e.name === 'AbortError') { setStatus('Ready', 'ready'); return stop(); }
                        // The cards are still made, without the analyses that failed.
                        showError('Card-back analyses left off: ' + e.message);
                    });
                });
            });
        });
    }

    // Exports without a HedgeHog connection offer to connect when matrices are on.
    function withMatrices(work) {
        if (!matricesWanted() || H.isConnected()) { work(); return; }
        withHedgeHog(work, 'the score matrices');
    }

    // Runs `work` now if HedgeHog is connected, otherwise once the user connects.
    function withHedgeHog(work, what) {
        if (H.isConnected()) { work(); return; }
        afterConnect = work;
        setStatus('Ready', 'ready');
        openHedgeHogSettings();
        $('hedgehog-status').textContent = 'Connect your HedgeHog account to analyze ' + what +
            '. The analysis runs on hedgehog-bg.com and counts toward your HedgeHog plan.';
    }

    function connectOrDisconnect() {
        if (connecting) { H.cancelConnect(); return; }
        if (H.isConnected()) {
            H.disconnect().then(refreshHedgeHogStatus);
            syncHedgeHogBadges();
            track('app_hedgehog_disconnect');
            return;
        }
        connecting = true;
        $('hedgehog-connect').textContent = 'Cancel';
        $('hedgehog-status').textContent = 'Sign in to HedgeHog in the window that opened and click Allow.';
        H.connect().then(function () {
            connecting = false;
            track('app_hedgehog_connect');
            refreshHedgeHogStatus();
            var work = afterConnect;
            afterConnect = null;
            if (work) {
                $('options-dialog').close();
                work();
            }
        }).catch(function (e) {
            connecting = false;
            syncHedgeHogBadges();
            $('hedgehog-connect').textContent = H.isConnected() ? 'Disconnect' : 'Connect HedgeHog';
            $('hedgehog-status').textContent = e.message;
        });
    }

    // Each run gets its own controller; Cancel stops every run in progress.
    function startAnalysis() {
        var controller = new AbortController();
        runs.push(controller);
        $('analysis-cancel').hidden = false;
        beginWork();
        return controller;
    }

    function endAnalysis(controller) {
        runs = runs.filter(function (c) { return c !== controller; });
        $('analysis-cancel').hidden = runs.length === 0;
        endWork();
    }

    function analysisFailed(controller, e) {
        endAnalysis(controller);
        if (e && e.name === 'AbortError') {
            setStatus('Analysis cancelled.', 'ready');
            return;
        }
        track('app_hedgehog_failed', { reason: (e && e.code) || 'error' });
        setStatus('Ready', 'ready');
        showError(e.message);
    }

    // A match file without analysis: HedgeHog analyzes it and returns its .ogxm.
    function analyzeFile(name, bytes, kind) {
        withHedgeHog(function () {
            confirmCost('match', 1).then(function (go) { if (go) runMatchAnalysis(name, bytes, kind); });
        }, name);
    }

    function runMatchAnalysis(name, bytes, kind) {
        var preset = $('hedgehog-preset').value;
        var label = presetLabel(preset);
        var controller = startAnalysis();
        var steps = {
            sending: 'Sending ' + name + ' to HedgeHog…',
            analyzing: 'HedgeHog is analyzing ' + name + ' (' + label + '). Long matches take a minute…',
            downloading: 'Downloading HedgeHog’s analysis…'
        };
        H.analyzeMatch(bytes, kind, preset, function (step) { setStatus(steps[step], 'busy'); }, controller.signal)
            .then(function (result) {
                endAnalysis(controller);
                track('app_hedgehog_analyzed', { kind: 'match' });
                load({
                    kind: 'file', name: name + '.ogxm', label: name, bytes: result.bytes,
                    sourceDescription: 'HedgeHog analysis (' + result.modelName + ', ' + label + ") from '" + name + "'"
                });
            }).catch(function (e) { analysisFailed(controller, e); });
    }

    function pasteNotes(requests, result) {
        var notes = [];
        if (requests.rejected.length) {
            notes.push(plural(requests.rejected.length, 'line') + ' did not read as a position ID: ' +
                requests.rejected.map(function (r) { return r.split('\n')[0]; }).join(', ') + '.');
        }
        if (result.failed.length) {
            notes.push(plural(result.failed.length, 'position') + ' could not be analyzed: ' + result.failed[0]);
        }
        return notes.join(' ');
    }

    function analyzePaste(text, requests, preset) {
        var label = presetLabel(preset);
        var controller = startAnalysis();
        setStatus('HedgeHog is analyzing ' + plural(requests.pending, 'position') + ' (' + label + ')…', 'busy');
        H.analyzePositions(requests.batches, preset, function (done, total) {
            setStatus('HedgeHog analyzed ' + done + ' of ' + plural(total, 'position') + '…', 'busy');
        }, controller.signal).then(function (results) {
            return call('configure', { settings: cardSettings() }).then(function () {
                return call('applyPositionAnalysis', { results: results, presetLabel: label, request: requests.request });
            });
        }).then(function (result) {
            endAnalysis(controller);
            source = { kind: 'analyzed', text: text, byHedgeHog: requests.pending - result.failed.length };
            showResult(result);
            showError(pasteNotes(requests, result));
            noteAllowance('Analyzed ' + plural(source.byHedgeHog, 'position') + '.');
            track('app_file_loaded', { kind: 'ids', positions: positions.length });
            track('app_hedgehog_analyzed', { kind: 'positions', positions: requests.pending });
        }).catch(function (e) { analysisFailed(controller, e); });
    }

    function makeCardsFromPaste(text) {
        if (!ready) return;
        var preset = $('hedgehog-preset').value;
        afterConnect = null;
        showError('');
        call('positionRequests', { text: text, preset: preset }).then(function (requests) {
            if (!requests.pending && !requests.analyzed && requests.rejected.length) {
                showError(requests.rejected.join('\n\n'));
                return;
            }
            if (!requests.pending) {
                load({ kind: 'text', text: text });
                return;
            }
            withHedgeHog(function () {
                confirmCost('position', requests.cost).then(function (go) {
                    if (go) analyzePaste(text, requests, preset);
                });
            }, plural(requests.pending, 'pasted position'));
        }).catch(function (e) { showError(e.message); });
    }

    // ── Events ─────────────────────────────────────────────────────────

    function readFile(file) {
        if (!file || !ready) return;
        if (working) {
            showError('Wait for the current analysis or export to finish, then open ' + file.name + '.');
            return;
        }
        afterConnect = null;
        showError('');
        file.arrayBuffer().then(function (bytes) {
            return call('analysisKind', { name: file.name, bytes: bytes.slice(0) }).then(function (kind) {
                if (kind.text) {
                    load({ kind: 'text', text: new TextDecoder().decode(bytes) });
                } else if (kind.analyzed) {
                    load({ kind: 'file', name: file.name, bytes: bytes });
                } else if (kind.import) {
                    analyzeFile(file.name, bytes, kind.import);
                } else {
                    showError(file.name + ' is not a match file. Open an .xg, .xgp, .ogxm, .mat, .sgf or .txt match.');
                }
            });
        }).catch(function (e) { showError(e.message); });
    }

    function openFilePicker() { $('file-input').click(); }
    $('browse-btn').addEventListener('click', openFilePicker);
    $('empty-open').addEventListener('click', openFilePicker);
    $('file-input').addEventListener('change', function () {
        readFile($('file-input').files[0]);
        $('file-input').value = '';
    });

    var shell = $('app-shell');
    var overlay = $('drop-overlay');
    function hasFiles(e) {
        return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0;
    }
    shell.addEventListener('dragover', function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        overlay.hidden = !ready;
    });
    shell.addEventListener('dragleave', function (e) {
        if (!e.relatedTarget || !shell.contains(e.relatedTarget)) overlay.hidden = true;
    });
    shell.addEventListener('drop', function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        overlay.hidden = true;
        if (ready) readFile(e.dataTransfer.files[0]);
    });

    function openPaste() {
        $('paste-dialog').showModal();
        $('paste-input').focus();
    }
    $('paste-open').addEventListener('click', openPaste);
    $('empty-paste').addEventListener('click', openPaste);
    $('paste-btn').addEventListener('click', function () {
        var text = $('paste-input').value;
        if (!text.trim()) { $('paste-input').focus(); return; }
        $('paste-dialog').close();
        makeCardsFromPaste(text);
    });

    $('options-open').addEventListener('click', function () { openOptions(); });
    document.querySelectorAll('#options-dialog [role="tab"]').forEach(function (tab, i, tabs) {
        tab.addEventListener('click', function () { selectOptionsTab(tab); });
        tab.addEventListener('keydown', function (e) {
            var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            var next = tabs[(i + step + tabs.length) % tabs.length];
            selectOptionsTab(next);
            next.focus();
        });
    });
    $('deck-chip').addEventListener('click', function () { openOptions('deck-name'); });
    $('anki-help-settings').addEventListener('click', function () {
        $('anki-help').close();
        openOptions($('anki-help-lead').textContent.indexOf('API key') >= 0 ? 'anki-key' : 'anki-url');
    });
    $('error-close').addEventListener('click', function () { showError(''); });
    $('deck-name').addEventListener('input', syncDeckChip);

    $('sample-btn').addEventListener('click', function () {
        setStatus('Fetching the sample match…', 'busy');
        fetch('sample-match.xg').then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.arrayBuffer();
        }).then(function (bytes) {
            load({ kind: 'file', name: 'sample-match.xg', bytes: bytes });
        }).catch(function () {
            setStatus('Ready', 'ready');
            showError('The sample match could not be downloaded. Check your connection and try again.');
        });
    });

    ['checker-threshold', 'cube-threshold', 'include-x', 'include-o'].forEach(function (id) {
        $(id).addEventListener('change', function () {
            savePrefs();
            if (isMatchFile()) load();
        });
    });

    CARD_SETTINGS.concat(CARD_FLAGS).forEach(function (key) {
        $('opt-' + key).addEventListener('change', function () {
            savePrefs();
            // Which move gets a slot for the played move is decided at import.
            if (key === 'max_moves' && isMatchFile()) load();
            else refreshPreview();
        });
    });
    $('deck-name').addEventListener('change', savePrefs);
    $('use-subdecks').addEventListener('change', savePrefs);

    $('rows').addEventListener('click', function (e) {
        var pick = e.target.dataset && e.target.dataset.pick;
        if (pick !== undefined) {
            var p = positions.find(function (x) { return x.index === +pick; });
            p.picked = e.target.checked;
            renderCounts();
            return;
        }
        var tr = e.target.closest('tr[data-index]');
        if (!tr) return;
        selectPosition(+tr.dataset.index, false);
        // On phones the preview sits below the list.
        if (window.matchMedia('(max-width: 900px)').matches) {
            $('stage-preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
    $('rows').addEventListener('keydown', function (e) {
        var tr = e.target.closest && e.target.closest('tr[data-index]');
        if (!tr || e.target.tagName === 'INPUT') return;
        var i = positions.findIndex(function (p) { return p.index === +tr.dataset.index; });
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectPosition(+tr.dataset.index, true);
        } else if (e.key === 'ArrowDown' && i < positions.length - 1) {
            e.preventDefault();
            selectPosition(positions[i + 1].index, true);
        } else if (e.key === 'ArrowUp' && i > 0) {
            e.preventDefault();
            selectPosition(positions[i - 1].index, true);
        }
    });
    $('select-all').addEventListener('change', function () {
        var on = $('select-all').checked;
        positions.forEach(function (p) { p.picked = on; });
        document.querySelectorAll('#rows input[data-pick]').forEach(function (box) { box.checked = on; });
        renderCounts();
    });
    $('theme-light').addEventListener('click', function () { nightMode = false; applyTheme(); savePrefs(); });
    $('theme-dark').addEventListener('click', function () { nightMode = true; applyTheme(); savePrefs(); });
    $('show-front').addEventListener('click', function () { showSide('front'); });
    $('show-back').addEventListener('click', function () { showSide('back'); });
    $('export-btn').addEventListener('click', exportDeck);
    $('send-btn').addEventListener('click', sendToAnki);
    $('train-btn').addEventListener('click', studyInTrainer);
    $('anki-url').addEventListener('change', savePrefs);
    $('hedgehog-preset').addEventListener('change', savePrefs);
    $('hedgehog-connect').addEventListener('click', connectOrDisconnect);
    $('hedgehog-chip').addEventListener('click', openHedgeHogSettings);
    $('hedgehog-panel-btn').addEventListener('click', function () {
        var connected = H.isConnected();
        openHedgeHogSettings();
        // The popup must open inside this click, or the browser blocks it.
        if (!connected && !connecting) connectOrDisconnect();
    });
    $('analysis-cancel').addEventListener('click', function () {
        runs.forEach(function (controller) { controller.abort(); });
    });
    // Work queued behind Connect only runs if the user connects from that prompt.
    $('options-dialog').addEventListener('close', function () {
        if (!connecting) afterConnect = null;
    });

    // ── Start ──────────────────────────────────────────────────────────

    applyPrefs(loadPrefs());
    syncHedgeHogBadges();
    describeBoot();
    syncDeckChip();
    applyTheme();
    setView('empty');
    setBusy(true);

    // The shell fills the window below the sticky nav, whose height changes when it wraps.
    var nav = document.querySelector('.nav');
    if (nav && window.ResizeObserver) {
        new ResizeObserver(function () {
            shell.style.setProperty('--app-nav', nav.offsetHeight + 'px');
        }).observe(nav);
    }

    $('app-boot-reload').addEventListener('click', function () { location.reload(); });

    function startFailed(message) {
        setStatus(message, 'error');
        bootFail(message);
    }

    if (!wheels.length) {
        startFailed('The browser app is not available right now. Please try again later, or use the desktop app.');
        return;
    }

    try {
        // build.py writes a content-hashed URL, so a deploy never pairs this page with an old worker.
        var workerUrl = (root.dataset.worker || '').indexOf('{{') === 0 || !root.dataset.worker
            ? '../js/app-worker.js' : root.dataset.worker;
        worker = new Worker(workerUrl, { type: 'module' });
    } catch (e) {
        startFailed('This browser cannot run the app. Try a current version of Chrome, Edge, Firefox or Safari.');
        return;
    }
    worker.addEventListener('message', onWorkerMessage);
    worker.addEventListener('error', function (e) {
        e.preventDefault();
        startFailed('The app could not start. Check your connection and reload the page.');
    });

    call('init', { wheels: wheels, base: new URL('wheels/', location.href).href }).then(function () {
        ready = true;
        setBusy(false);
        bootReady();
        setStatus('Ready. Open a match file, or paste analysis or position IDs, to begin.', 'ready');
    }).catch(function (e) {
        startFailed('The app could not start: ' + e.message + ' Reload the page to try again.');
    });
})();
