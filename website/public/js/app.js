/**
 * Browser app UI. The Python side (ankigammon.web under Pyodide) lives in
 * app-worker.js; this file keeps the page state and talks to it.
 */
(function () {
    'use strict';

    var root = document.getElementById('app');
    if (!root) return;

    var PREFS_KEY = 'ankigammon-app-prefs-v1';
    var CARD_SETTINGS = ['color_scheme', 'board_orientation', 'max_moves', 'score_format',
        'show_pip_count', 'swap_checker_colors', 'split_cube_decisions'];
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
        if (data.type === 'status') { setStatus(data.text, 'busy'); return; }
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
        return out;
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
        ['browse-btn', 'paste-btn', 'sample-btn'].forEach(function (id) { $(id).disabled = busy || !ready; });
        $('drop-zone').classList.toggle('drop-zone--disabled', busy || !ready);
    }

    function isMatchFile() {
        return source && source.kind === 'file' && /\.xg$/i.test(source.name);
    }

    function load(newSource) {
        if (!ready) return;
        source = newSource || source;
        if (!source) return;
        var token = ++loadToken;
        showError('');
        setBusy(true);
        setStatus(source.kind === 'file' ? 'Reading ' + source.name + '…' : 'Reading the pasted analysis…', 'busy');

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
                    includeO: $('include-o').checked
                }, [bytes]);
            });
        } else {
            request = call('configure', { settings: cardSettings() }).then(function () {
                return call('loadText', { text: source.text });
            });
        }

        request.then(function (result) {
            if (token !== loadToken) return;
            if (result.players) players = result.players;
            else if (source.kind === 'text' || !isMatchFile()) players = { o: null, x: null };
            positions = result.positions.map(function (p) { return Object.assign({ picked: true }, p); });
            showLoaded(result.total);
        }).catch(function (e) {
            if (token !== loadToken) return;
            setStatus('Ready', 'ready');
            showError(e.message);
        }).then(function () {
            if (token === loadToken) setBusy(false);
        });
    }

    function playerName(side) {
        return players[side === 'X' ? 'x' : 'o'] || ('Player ' + side);
    }

    function plural(n, word) {
        return n + ' ' + word + (n === 1 ? '' : 's');
    }

    function showLoaded(total) {
        var label = source.kind === 'file' ? source.name : 'Pasted analysis';
        var meta;
        if (isMatchFile()) {
            meta = plural(positions.length, 'mistake') + ' kept from ' + plural(total, 'decision') + '.';
        } else if (source.kind === 'text' && total > positions.length) {
            var skipped = total - positions.length;
            meta = plural(positions.length, 'analyzed position') + '. ' + plural(skipped, 'position') +
                ' without analysis ' + (skipped === 1 ? 'was' : 'were') + ' skipped; the desktop app can analyze them.';
        } else {
            meta = plural(positions.length, 'position') + '.';
        }
        $('source-meta').textContent = label + ': ' + meta;

        $('filter-panel').hidden = !isMatchFile();
        $('name-o').textContent = playerName('O');
        $('name-x').textContent = playerName('X');

        $('step-review').hidden = false;
        $('step-export').hidden = false;
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
            td.colSpan = 6;
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

            var typeCell = el('td');
            typeCell.appendChild(el('span', 'app-tag app-tag--' + p.type, p.type === 'cube' ? 'Cube' : 'Checker'));
            if (p.has_note) typeCell.appendChild(el('span', 'app-tag app-tag--note', 'Note'));
            tr.appendChild(typeCell);

            tr.appendChild(el('td', 'app-table__game', p.game !== null ? 'Game ' + p.game : ''));
            tr.appendChild(el('td', 'app-table__roll', playerName(p.on_roll) + (p.dice ? ' ' + p.dice.join('-') : '')));
            tr.appendChild(el('td', 'app-table__move', p.played || ''));
            tr.appendChild(el('td', 'app-table__err', p.error !== null ? p.error.toFixed(3) : ''));
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
        call('configure', { settings: cardSettings() }).then(function () {
            return call('preview', { index: active, showOptions: opts.show_options, interactiveMoves: opts.interactive_moves });
        }).then(function (result) {
            if (token !== previewToken) return;
            card = result;
            $('show-front').disabled = $('show-back').disabled = false;
            $('preview-hint').textContent = opts.show_options
                ? 'Pick a move on the front to flip it, as in Anki.'
                : 'Use Back to see the answer.';
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
        $('anki-help').hidden = false;
        if (kind === 'key') {
            $('anki-settings').open = true;
            $('anki-key').focus();
        }
    }

    function sendToAnki() {
        var picked = positions.filter(function (p) { return p.picked; });
        if (!picked.length || sending) return;
        var url = $('anki-url').value.trim() || ANKI_DEFAULT_URL;
        var key = $('anki-key').value.trim();
        var opts = cardOptions();
        sending = true;
        renderCounts();
        $('anki-help').hidden = true;
        showError('');
        setStatus('Connecting to Anki…', 'busy');

        ankiRequest(url, 'requestPermission').catch(function () {
            throw { help: 'unreachable' };
        }).then(function (reply) {
            var result = (reply && reply.result) || {};
            if (result.permission !== 'granted') throw { help: 'denied' };
            if (result.requireApikey && !key) throw { help: 'key' };
            return call('configure', { settings: cardSettings() });
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
        }).catch(function (e) {
            setStatus('Ready', 'ready');
            if (e && e.help) showAnkiHelp(e.help);
            else showAnkiHelp('failed', e && e.message);
        }).then(function () {
            sending = false;
            renderCounts();
        });
    }

    function buildDeck(picked, deckName) {
        var opts = cardOptions();
        setStatus('Building ' + plural(picked.length, 'card') + '…', 'busy');
        return call('configure', { settings: cardSettings() }).then(function () {
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
        var deckName = ($('deck-name').value.trim() || 'AnkiGammon').split('::').pop();
        $('train-btn').disabled = true;
        setStatus('Preparing ' + plural(picked.length, 'position') + ' for the trainer…', 'busy');
        call('exportPack', {
            indices: picked.map(function (p) { return p.index; }),
            deckName: deckName
        }).then(function (pack) {
            return window.TrainStore.putInbox('app', { name: deckName, pack: pack });
        }).then(function () {
            location.href = '../train/#inbox';
        }).catch(function (e) {
            setStatus('Ready', 'ready');
            showError('The cards could not be opened in the trainer: ' + e.message);
            renderCounts();
        });
    }

    function exportDeck() {
        var picked = positions.filter(function (p) { return p.picked; });
        if (!picked.length) return;
        var deckName = $('deck-name').value.trim() || 'AnkiGammon';
        $('export-btn').disabled = true;
        buildDeck(picked, deckName).then(function (buffer) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([buffer], { type: 'application/octet-stream' }));
            a.download = deckName.replace(/::/g, ' - ').replace(/[\\/:*?"<>|]+/g, '_') + '.apkg';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000);
            setStatus('Downloaded ' + plural(picked.length, 'card') + '. Open the file to import it into Anki.', 'ready');
        }).catch(function (e) {
            setStatus('Ready', 'ready');
            showError('The deck could not be built: ' + e.message);
        }).then(function () {
            renderCounts();
        });
    }

    // ── Events ─────────────────────────────────────────────────────────

    function readFile(file) {
        if (!file) return;
        if (!/\.xgp?$/i.test(file.name)) {
            showError('The browser version reads eXtreme Gammon .xg and .xgp files. ' +
                'For .mat, .sgf and other formats, use the desktop app, which analyzes them with GNU Backgammon.');
            return;
        }
        file.arrayBuffer().then(function (bytes) {
            load({ kind: 'file', name: file.name, bytes: bytes });
        });
    }

    var dropZone = $('drop-zone');
    $('browse-btn').addEventListener('click', function () { $('file-input').click(); });
    $('file-input').addEventListener('change', function () {
        readFile($('file-input').files[0]);
        $('file-input').value = '';
    });
    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('drop-zone--active');
    });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drop-zone--active'); });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drop-zone--active');
        if (ready) readFile(e.dataTransfer.files[0]);
    });

    $('paste-btn').addEventListener('click', function () {
        var text = $('paste-input').value;
        if (!text.trim()) { showError('Paste the analysis text from eXtreme Gammon first.'); return; }
        load({ kind: 'text', text: text });
    });

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
        if (tr) selectPosition(+tr.dataset.index, false);
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

    // ── Start ──────────────────────────────────────────────────────────

    applyPrefs(loadPrefs());
    applyTheme();
    setBusy(true);

    if (!wheels.length) {
        setStatus('The browser app is not available right now. Please try again later, or use the desktop app.', 'error');
        return;
    }

    try {
        worker = new Worker('../js/app-worker.js', { type: 'module' });
    } catch (e) {
        setStatus('This browser cannot run the app. Try a current version of Chrome, Edge, Firefox or Safari.', 'error');
        return;
    }
    worker.addEventListener('message', onWorkerMessage);
    worker.addEventListener('error', function (e) {
        e.preventDefault();
        setStatus('The app could not start. Check your connection and reload the page.', 'error');
    });

    call('init', { wheels: wheels, base: new URL('wheels/', location.href).href }).then(function () {
        ready = true;
        setBusy(false);
        setStatus('Ready. Add a file or paste analysis to begin.', 'ready');
    }).catch(function (e) {
        setStatus('The app could not start: ' + e.message + ' Reload the page to try again.', 'error');
    });
})();
