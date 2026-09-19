/**
 * Deck Review — moderation UI over the admin endpoints of the decks API.
 */
(function () {
    'use strict';

    var API = window.ANKIGAMMON_DECKS_API || null;
    var TOKEN_KEY = 'ankigammon-decks-admin-token';
    var C = window.DeckCards;

    var authForm = document.getElementById('review-auth');
    var tokenInput = document.getElementById('review-token');
    var status = document.getElementById('review-status');
    var pendingList = document.getElementById('review-pending');
    var publishedList = document.getElementById('review-published');
    var pendingHeading = document.getElementById('review-pending-heading');
    var publishedHeading = document.getElementById('review-published-heading');

    function setStatus(text, kind) {
        status.textContent = text;
        status.hidden = !text;
        status.className = 'deck-list-status' + (kind ? ' deck-list-status--' + kind : '');
        if (text && kind !== 'muted') status.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function token() {
        return tokenInput.value.trim();
    }

    function api(method, path) {
        return fetch(API + path, {
            method: method,
            headers: { Authorization: 'Bearer ' + token(), Accept: 'application/json' }
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (data) {
                if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
                return data;
            });
        });
    }

    function detailRows(meta) {
        var box = C.el('div', 'review-details');
        var s = meta.summary || {};
        var rows = [
            ['Submitted', C.formatDate(meta.submitted_at)],
            ['Deck file', C.formatBytes(meta.apkg_bytes) + (meta.apkg_filename ? ' · ' + meta.apkg_filename : '')],
            ['Contact', meta.contact_email || '—'],
            ['Analysis sources', Object.keys(s.sourceDescriptions || {}).map(function (k) {
                return k + ' (' + s.sourceDescriptions[k] + ')';
            }).join('; ') || '—'],
            ['Source files', Object.keys(s.sourceFiles || {}).slice(0, 12).join(', ') || '—']
        ];
        rows.forEach(function (r) {
            var row = C.el('div', 'review-details__row');
            row.appendChild(C.el('span', 'review-details__label', r[0]));
            row.appendChild(C.el('span', 'review-details__value', r[1]));
            box.appendChild(row);
        });
        return box;
    }

    function pendingActions(meta) {
        var wrap = C.el('div', 'review-actions');
        var dl = C.el('a', 'btn btn-secondary btn-sm', 'Download');
        dl.href = '#';
        dl.addEventListener('click', function (e) {
            e.preventDefault();
            downloadPending(meta.id);
        });
        var approve = C.el('button', 'btn btn-primary btn-sm', 'Approve');
        approve.type = 'button';
        approve.addEventListener('click', function () { act('POST', '/admin/approve/' + meta.id, approve, 'Approved: "' + meta.title + '" is now published.'); });
        var rejectBtn = C.el('button', 'btn btn-secondary btn-sm review-actions__danger', 'Reject');
        rejectBtn.type = 'button';
        rejectBtn.addEventListener('click', function () {
            if (window.confirm('Reject and delete "' + meta.title + '"?')) act('POST', '/admin/reject/' + meta.id, rejectBtn, 'Rejected and deleted "' + meta.title + '".');
        });
        wrap.appendChild(dl);
        wrap.appendChild(approve);
        wrap.appendChild(rejectBtn);
        return wrap;
    }

    function publishedActions(deck) {
        var wrap = C.el('div', 'review-actions');
        var dl = C.el('a', 'btn btn-secondary btn-sm', 'Download');
        dl.href = API + deck.apkg_url;
        var remove = C.el('button', 'btn btn-secondary btn-sm review-actions__danger', 'Remove');
        remove.type = 'button';
        remove.addEventListener('click', function () {
            if (window.confirm('Remove "' + deck.title + '" from the catalog and delete its files?')) act('DELETE', '/admin/decks/' + deck.id, remove, 'Removed "' + deck.title + '" from the catalog.');
        });
        wrap.appendChild(dl);
        wrap.appendChild(remove);
        return wrap;
    }

    function downloadPending(id) {
        fetch(API + '/admin/pending/' + id + '/deck.apkg', { headers: { Authorization: 'Bearer ' + token() } })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                var disposition = r.headers.get('Content-Disposition') || '';
                var m = /filename="([^"]+)"/.exec(disposition);
                return r.blob().then(function (blob) { return { blob: blob, name: m ? m[1] : id + '.apkg' }; });
            })
            .then(function (file) {
                var url = URL.createObjectURL(file.blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = file.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            })
            .catch(function (err) { setStatus('Download failed: ' + err.message, 'error'); });
    }

    function act(method, path, button, successMessage) {
        button.disabled = true;
        button.textContent = 'Working\u2026';
        api(method, path)
            .then(function () { return load(successMessage); })
            .catch(function (err) {
                button.disabled = false;
                setStatus('That did not work: ' + err.message, 'error');
            });
    }

    function renderPending(items) {
        pendingHeading.textContent = 'Pending (' + items.length + ')';
        pendingList.innerHTML = '';
        if (!items.length) {
            pendingList.appendChild(C.el('p', 'deck-list-status deck-list-status--muted', 'Nothing waiting for review.'));
            return;
        }
        items.forEach(function (meta) {
            var card = C.deckCard(meta, { actions: pendingActions });
            card.insertBefore(detailRows(meta), card.querySelector('.deck-card__foot'));
            var previews = C.previewsFromXgids((meta.summary || {}).previewXgids);
            if (previews.length) {
                var wrap = C.el('div', 'deck-preview');
                C.renderPreviewBoards(wrap, previews);
                card.insertBefore(wrap, card.querySelector('.deck-card__foot'));
            }
            pendingList.appendChild(card);
        });
    }

    function renderPublished(decks) {
        publishedHeading.textContent = 'Published (' + decks.length + ')';
        publishedList.innerHTML = '';
        if (!decks.length) {
            publishedList.appendChild(C.el('p', 'deck-list-status deck-list-status--muted', 'No published decks.'));
            return;
        }
        decks.forEach(function (deck) {
            publishedList.appendChild(C.deckCard(deck, { actions: publishedActions }));
        });
    }

    function load(doneMessage) {
        if (!API) { setStatus('The decks API URL is not configured on this page.', 'error'); return Promise.resolve(); }
        if (!token()) { setStatus('Enter the admin token.', 'error'); return Promise.resolve(); }
        setStatus('Loading…', 'muted');
        return Promise.all([
            api('GET', '/admin/pending'),
            fetch(API + '/catalog?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); })
        ]).then(function (results) {
            try { sessionStorage.setItem(TOKEN_KEY, token()); } catch (e) { /* private mode */ }
            renderPending(results[0].pending || []);
            renderPublished((results[1] && results[1].decks) || []);
            setStatus(doneMessage || '', doneMessage ? 'success' : '');
        }).catch(function (err) {
            setStatus(err.message, 'error');
        });
    }

    authForm.addEventListener('submit', function (e) {
        e.preventDefault();
        load();
    });

    try {
        var saved = sessionStorage.getItem(TOKEN_KEY);
        if (saved) { tokenInput.value = saved; load(); }
    } catch (e) { /* private mode */ }
})();
