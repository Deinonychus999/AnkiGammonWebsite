/**
 * Community Decks — catalog rendering and the submission flow.
 *
 * Submission state machine (inside the share panel):
 *   IDLE → READING → INVALID | VALID(form) → SENDING → SENT | ERROR
 */
(function () {
    'use strict';

    var API = window.ANKIGAMMON_DECKS_API || null;
    var MAX_APKG_BYTES = 50 * 1024 * 1024;
    var DISCORD_URL = 'https://discord.gg/vyFSgtWXSr';
    var LICENSE = 'CC-BY-4.0';
    var LICENSE_LABELS = { 'CC-BY-4.0': 'CC BY 4.0' };

    // ── Shared rendering helpers (also used by the review page) ────────

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function formatBytes(bytes) {
        if (!bytes && bytes !== 0) return '';
        if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
    }

    function formatDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function matchLengthLabels(map) {
        var keys = Object.keys(map || {});
        keys.sort(function (a, b) {
            if (a === 'unlimited') return 1;
            if (b === 'unlimited') return -1;
            return parseInt(a, 10) - parseInt(b, 10);
        });
        return keys.map(function (k) { return k === 'unlimited' ? 'money game' : k.replace('pt', '-point'); });
    }

    function plural(n, singular, pluralForm) {
        return n + ' ' + (n === 1 ? singular : (pluralForm || singular + 's'));
    }

    function statsParts(summary) {
        var parts = [plural(summary.positions || 0, 'position')];
        if (summary.checkerPlays) parts.push(plural(summary.checkerPlays, 'checker play'));
        if (summary.cubeActions) parts.push(plural(summary.cubeActions, 'cube decision'));
        var lengths = matchLengthLabels(summary.matchLengths);
        if (lengths.length) parts.push(lengths.join(', '));
        if (summary.annotated) parts.push(summary.annotated + ' with notes');
        return parts;
    }

    function summaryBadges(summary) {
        var wrap = el('div', 'deck-badges');
        statsParts(summary).forEach(function (text, i) {
            wrap.appendChild(el('span', 'deck-badge' + (i === 0 ? ' deck-badge--strong' : ''), text));
        });
        return wrap;
    }

    function renderPreviewBoards(container, previews) {
        container.innerHTML = '';
        previews.forEach(function (p) {
            var fig = el('figure', 'deck-preview__board');
            fig.innerHTML = window.BoardRenderer.render(p.position, p.metadata, 'classic', false, 'ccw');
            fig.appendChild(el('figcaption', 'deck-preview__caption', p.xgid));
            container.appendChild(fig);
        });
    }

    function previewsFromXgids(xgids) {
        var out = [];
        (xgids || []).forEach(function (xgid) {
            try {
                var parsed = window.PositionParser.parse(xgid);
                out.push({ xgid: xgid, position: parsed.position, metadata: parsed.metadata });
            } catch (e) { /* skip unparseable preview */ }
        });
        return out;
    }

    function deckCard(deck, options) {
        options = options || {};
        var card = el('article', 'deck-card');
        var titleWrap = el('div');
        titleWrap.appendChild(el('h3', 'deck-card__title', deck.title));
        var byline = 'by ' + deck.author + (deck.published_at ? ' · ' + formatDate(deck.published_at) : '');
        titleWrap.appendChild(el('p', 'deck-card__byline', byline));
        card.appendChild(titleWrap);
        card.appendChild(summaryBadges(deck.summary || {}));
        card.appendChild(el('p', 'deck-card__desc', deck.description));

        var foot = el('div', 'deck-card__foot');
        foot.appendChild(el('span', 'deck-card__license', LICENSE_LABELS[deck.license] || deck.license || ''));
        if (options.actions) {
            foot.appendChild(options.actions(deck));
        } else if (deck.apkg_url) {
            var dl = el('a', 'btn btn-primary btn-sm', 'Download .apkg');
            dl.href = API + deck.apkg_url;
            foot.appendChild(dl);
        }
        card.appendChild(foot);
        return card;
    }

    function deckRow(deck) {
        var row = el('article', 'deck-row');
        var main = el('div', 'deck-row__main');
        var head = el('div', 'deck-row__head');
        var title = el('h3', 'deck-row__title');
        if (hasPage(deck)) {
            var link = el('a', 'deck-row__link', deck.title);
            link.href = deck.id + '/';
            title.appendChild(link);
        } else {
            title.textContent = deck.title;
        }
        head.appendChild(title);
        var byline = 'by ' + deck.author + (deck.published_at ? ' · ' + formatDate(deck.published_at) : '');
        head.appendChild(el('span', 'deck-row__byline', byline));
        main.appendChild(head);
        var stats = statsParts(deck.summary || {});
        if (deck.apkg_bytes) stats.push(formatBytes(deck.apkg_bytes));
        main.appendChild(el('p', 'deck-row__stats', stats.join(' · ')));
        main.appendChild(el('p', 'deck-row__desc', deck.description));
        row.appendChild(main);

        var previews = previewsFromXgids(((deck.summary || {}).previewXgids || []).slice(0, 1));
        if (previews.length) {
            var board = el(hasPage(deck) ? 'a' : 'div', 'deck-row__board');
            if (hasPage(deck)) {
                board.href = deck.id + '/';
                board.setAttribute('aria-label', 'Open ' + deck.title);
            }
            board.innerHTML = window.BoardRenderer.render(previews[0].position, previews[0].metadata, 'classic', false, 'ccw');
            row.appendChild(board);
        }
        var dl = el('a', 'btn btn-primary deck-row__download', 'Download');
        dl.href = API + deck.apkg_url;
        dl.title = 'Download ' + deck.title + ' (.apkg)';
        row.appendChild(dl);
        return row;
    }

    window.DeckCards = {
        el: el,
        deckCard: deckCard,
        summaryBadges: summaryBadges,
        renderPreviewBoards: renderPreviewBoards,
        previewsFromXgids: previewsFromXgids,
        formatBytes: formatBytes,
        formatDate: formatDate,
        LICENSE_LABELS: LICENSE_LABELS
    };

    // ── Catalog ────────────────────────────────────────────────────────

    var catalogList = document.getElementById('deck-list');
    var catalogStatus = document.getElementById('deck-list-status');
    var toolbar = document.getElementById('deck-toolbar');
    var filterInput = document.getElementById('deck-filter');
    var sortSelect = document.getElementById('deck-sort');
    var countLabel = document.getElementById('deck-count');
    var allDecks = [];
    // Deck pages are generated at build time, so only prerendered decks have one to link to.
    var builtIds = null;

    function hasPage(deck) {
        return !builtIds || builtIds[deck.id] === true;
    }

    function setCatalogStatus(text, kind) {
        if (!catalogStatus) return;
        catalogStatus.textContent = text;
        catalogStatus.hidden = !text;
        catalogStatus.className = 'deck-list-status' + (kind ? ' deck-list-status--' + kind : '');
    }

    function sortDecks(decks, mode) {
        var sorted = decks.slice();
        if (mode === 'positions') {
            sorted.sort(function (a, b) { return ((b.summary || {}).positions || 0) - ((a.summary || {}).positions || 0); });
        } else if (mode === 'title') {
            sorted.sort(function (a, b) { return a.title.localeCompare(b.title); });
        } else {
            sorted.sort(function (a, b) { return (b.published_at || '').localeCompare(a.published_at || ''); });
        }
        return sorted;
    }

    function renderCatalog() {
        if (!catalogList) return;
        var query = (filterInput.value || '').trim().toLowerCase();
        var shown = allDecks.filter(function (d) {
            if (!query) return true;
            return (d.title + ' ' + d.author + ' ' + d.description).toLowerCase().indexOf(query) >= 0;
        });
        shown = sortDecks(shown, sortSelect.value);

        catalogList.innerHTML = '';
        shown.forEach(function (deck) { catalogList.appendChild(deckRow(deck)); });

        countLabel.textContent = query
            ? shown.length + ' of ' + plural(allDecks.length, 'deck')
            : plural(allDecks.length, 'deck');
        if (!shown.length && allDecks.length) {
            setCatalogStatus('No decks match that filter.', 'muted');
        } else {
            setCatalogStatus('');
        }
    }

    function showDecks(decks) {
        allDecks = (decks || []).filter(function (d) { return d && d.id && d.title; });
        if (!allDecks.length) {
            toolbar.hidden = true;
            catalogList.innerHTML = '';
            setCatalogStatus('No decks have been published yet. Yours could be the first.', 'muted');
            return;
        }
        toolbar.hidden = false;
        renderCatalog();
    }

    function embeddedCatalog() {
        var node = document.getElementById('deck-catalog');
        if (!node) return null;
        try { return JSON.parse(node.textContent); } catch (e) { return null; }
    }

    function loadCatalog() {
        if (!catalogList) return;
        // The build prerenders the catalog; hydrate from it, then refresh from the API.
        var payload = embeddedCatalog();
        var embedded = payload ? (payload.decks || []) : null;
        if (embedded) {
            builtIds = {};
            embedded.forEach(function (d) { if (d && d.id) builtIds[d.id] = true; });
            showDecks(embedded);
        }
        if (!API || (payload && payload.frozen)) {
            if (!embedded) setCatalogStatus('The deck catalog is not online yet.', 'muted');
            return;
        }
        if (!embedded) setCatalogStatus('Loading decks\u2026', 'muted');
        fetch(API + '/catalog', { headers: { Accept: 'application/json' }, cache: 'no-store' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) {
                var live = (data && data.decks) || [];
                if (!embedded || JSON.stringify(live) !== JSON.stringify(embedded)) showDecks(live);
            })
            .catch(function (err) {
                console.error('Catalog refresh failed:', err);
                if (!embedded) setCatalogStatus('The deck catalog could not be loaded right now.', 'error');
            });
    }

    if (filterInput) filterInput.addEventListener('input', renderCatalog);
    if (sortSelect) sortSelect.addEventListener('change', renderCatalog);

    // ── Share panel ────────────────────────────────────────────────────

    var panel = document.getElementById('deck-share');
    if (!panel) { loadCatalog(); return; }

    var toggleBtn = document.getElementById('deck-share-toggle');
    var closeBtn = document.getElementById('deck-share-close');
    var dropZone = document.getElementById('deck-drop-zone');
    var fileInput = document.getElementById('deck-file-input');
    var browseBtn = document.getElementById('deck-browse-btn');
    var processing = document.getElementById('deck-processing');
    var processingText = processing.querySelector('.processing__text');
    var invalid = document.getElementById('deck-invalid');
    var invalidList = document.getElementById('deck-invalid-list');
    var invalidRetry = document.getElementById('deck-invalid-retry');
    var valid = document.getElementById('deck-valid');
    var validFile = document.getElementById('deck-valid-file');
    var validBadges = document.getElementById('deck-valid-badges');
    var validWarnings = document.getElementById('deck-valid-warnings');
    var validPreview = document.getElementById('deck-valid-preview');
    var form = document.getElementById('deck-form');
    var formError = document.getElementById('deck-form-error');
    var submitBtn = document.getElementById('deck-submit-btn');
    var cancelBtn = document.getElementById('deck-cancel-btn');
    var sent = document.getElementById('deck-sent');
    var sentId = document.getElementById('deck-sent-id');
    var sentAnother = document.getElementById('deck-sent-another');
    var sentDone = document.getElementById('deck-sent-done');
    var offline = document.getElementById('deck-offline');

    var current = null;

    function setPanel(open) {
        panel.hidden = !open;
        toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggleBtn.textContent = open ? 'Back to decks' : 'Share a deck';
        if (open) browseBtn.focus({ preventScroll: true });
    }

    function setState(state) {
        dropZone.hidden = state !== 'idle';
        processing.hidden = state !== 'reading' && state !== 'sending';
        invalid.hidden = state !== 'invalid';
        valid.hidden = state !== 'valid';
        sent.hidden = state !== 'sent';
        if (state === 'reading') processingText.textContent = 'Reading the deck…';
        if (state === 'sending') processingText.textContent = 'Uploading… this can take a moment for large decks.';
    }

    function showInvalid(messages) {
        invalidList.innerHTML = '';
        messages.forEach(function (m) { invalidList.appendChild(el('li', null, m)); });
        setState('invalid');
    }

    function processFile(file) {
        if (!/\.apkg$/i.test(file.name)) {
            showInvalid(['Choose an .apkg file exported from AnkiGammon (File → Export → APKG).']);
            return;
        }
        if (file.size > MAX_APKG_BYTES) {
            showInvalid(['This file is ' + formatBytes(file.size) + '. Decks up to 50 MB can be submitted.']);
            return;
        }
        setState('reading');
        file.arrayBuffer()
            .then(function (buffer) { return window.ApkgReader.read(buffer, file.name); })
            .then(function (result) {
                if (!result.ok) { showInvalid(result.errors); return; }
                current = { file: file, result: result };
                showValid(file, result);
            })
            .catch(function (err) {
                console.error('Deck read failed:', err);
                showInvalid([err.message || 'The file could not be read.']);
            });
    }

    function showValid(file, result) {
        validFile.textContent = '· ' + file.name + ', ' + formatBytes(file.size);
        validBadges.innerHTML = '';
        validBadges.appendChild(summaryBadges(result.summary));

        validWarnings.innerHTML = '';
        validWarnings.hidden = !result.warnings.length;
        result.warnings.forEach(function (w) { validWarnings.appendChild(el('li', null, w)); });

        renderPreviewBoards(validPreview, result.previews);

        form.reset();
        form.elements.title.value = result.summary.suggestedTitle || '';
        formError.hidden = true;
        offline.hidden = !!API;
        submitBtn.disabled = !API;
        setState('valid');
        form.elements.title.focus({ preventScroll: true });
    }

    function readForm() {
        var f = form.elements;
        var meta = {
            title: f.title.value.trim(),
            author: f.author.value.trim(),
            description: f.description.value.trim(),
            contact_email: f.contact_email.value.trim(),
            license: LICENSE,
            attestations: {
                own_work: f.agree.checked,
                no_paid_content: f.agree.checked,
                license_grant: f.agree.checked
            }
        };
        var problems = [];
        if (!meta.title) problems.push('Give the deck a title.');
        if (!meta.author) problems.push('Add the name to show as the author.');
        if (meta.description.length < 20) problems.push('Describe the deck in at least a sentence.');
        if (!meta.attestations.own_work) problems.push('Please tick the confirmation above.');
        return { meta: meta, problems: problems };
    }

    function submitDeck(e) {
        e.preventDefault();
        if (!current || !API) return;
        var read = readForm();
        if (read.problems.length) {
            formError.innerHTML = '';
            read.problems.forEach(function (p) { formError.appendChild(el('div', null, p)); });
            formError.hidden = false;
            return;
        }
        formError.hidden = true;

        var summary = current.result.summary;
        var meta = read.meta;
        meta.summary = {
            positions: summary.positions,
            checkerPlays: summary.checkerPlays,
            cubeActions: summary.cubeActions,
            annotated: summary.annotated,
            matchLengths: summary.matchLengths,
            sourceDescriptions: summary.sourceDescriptions,
            sourceFiles: summary.sourceFiles,
            previewXgids: current.result.previews.map(function (p) { return p.xgid; })
        };

        var pack = window.ApkgReader.buildPack(current.result, {
            title: meta.title,
            author: meta.author,
            license: meta.license,
            source: 'https://ankigammon.com/decks/'
        });

        var body = new FormData();
        body.append('meta', JSON.stringify(meta));
        body.append('pack', new Blob([JSON.stringify(pack)], { type: 'application/json' }), 'pack.json');
        body.append('apkg', current.file, current.file.name);

        setState('sending');
        fetch(API + '/submit', { method: 'POST', body: body })
            .then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (data) {
                    if (!r.ok) throw new Error(data.error || ('Upload failed (HTTP ' + r.status + ')'));
                    return data;
                });
            })
            .then(function (data) {
                sentId.textContent = data.id || '';
                current = null;
                fileInput.value = '';
                setState('sent');
            })
            .catch(function (err) {
                console.error('Submit failed:', err);
                formError.textContent = err.message || 'The upload failed. Please try again.';
                formError.hidden = false;
                setState('valid');
            });
    }

    function reset() {
        current = null;
        fileInput.value = '';
        setState('idle');
    }

    // ── Events ─────────────────────────────────────────────────────────

    toggleBtn.addEventListener('click', function () { setPanel(panel.hidden); });
    closeBtn.addEventListener('click', function () { setPanel(false); });
    sentDone.addEventListener('click', function () { reset(); setPanel(false); });

    browseBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function (e) {
        if (e.target.files.length) processFile(e.target.files[0]);
    });
    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('drop-zone--active');
    });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drop-zone--active'); });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drop-zone--active');
        if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
    });
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) { e.preventDefault(); });

    form.addEventListener('submit', submitDeck);
    cancelBtn.addEventListener('click', reset);
    invalidRetry.addEventListener('click', reset);
    sentAnother.addEventListener('click', reset);

    var discordLinks = document.querySelectorAll('[data-discord-link]');
    for (var i = 0; i < discordLinks.length; i++) discordLinks[i].href = DISCORD_URL;

    setState('idle');
    if (location.hash === '#submit' || location.hash === '#share') setPanel(true);
    loadCatalog();
})();
