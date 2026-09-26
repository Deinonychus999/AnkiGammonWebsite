/**
 * Trainer storage in IndexedDB: decks, their items, review progress, small
 * settings, and an inbox through which the browser app hands the trainer a
 * deck. Everything stays on this device; a backup file moves it elsewhere.
 */
(function () {
    'use strict';

    var DB_NAME = 'ankigammon-trainer';
    var DB_VERSION = 1;
    var BACKUP_FORMAT = 'ankigammon-trainer-backup';

    var dbPromise = null;

    function open() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            if (!window.indexedDB) {
                reject(new Error('This browser has no storage for the trainer. Try a current Chrome, Edge, Firefox or Safari, outside private browsing.'));
                return;
            }
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function () {
                var db = req.result;
                db.createObjectStore('decks', { keyPath: 'id' });
                db.createObjectStore('items', { keyPath: 'id' }).createIndex('deckId', 'deckId');
                db.createObjectStore('progress', { keyPath: 'id' }).createIndex('deckId', 'deckId');
                db.createObjectStore('meta', { keyPath: 'key' });
                db.createObjectStore('inbox', { keyPath: 'key' });
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error || new Error('The trainer storage could not be opened.')); };
            req.onblocked = function () { reject(new Error('Close the trainer in your other tabs, then reload this page.')); };
        });
        dbPromise.catch(function () { dbPromise = null; });
        return dbPromise;
    }

    function tx(stores, mode, work) {
        return open().then(function (db) {
            return new Promise(function (resolve, reject) {
                var t = db.transaction(stores, mode);
                var result;
                t.oncomplete = function () { resolve(result); };
                t.onerror = function () { reject(t.error); };
                t.onabort = function () { reject(t.error || new Error('Storage write was cancelled. The device may be out of space.')); };
                result = work(t);
            });
        });
    }

    function request(req) {
        return new Promise(function (resolve, reject) {
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    function getAll(store, indexName, key) {
        return open().then(function (db) {
            var s = db.transaction(store).objectStore(store);
            return request(indexName ? s.index(indexName).getAll(key) : s.getAll());
        });
    }

    /**
     * Adds or refreshes a deck. With `replace`, items the new version no
     * longer has are removed (a community deck its author edited); otherwise
     * the items are merged in, so decks sent from the app under one name add
     * up. Progress is never removed here, so a position that comes back later
     * keeps its history.
     */
    function saveDeck(deck, items, replace) {
        return getAll('items', 'deckId', deck.id).then(function (old) {
            var ids = {};
            items.forEach(function (it) { ids[it.id] = true; });
            var stale = old.filter(function (it) { return !ids[it.id]; });
            var count = items.length + (replace ? 0 : stale.length);
            return tx(['decks', 'items'], 'readwrite', function (t) {
                var itemStore = t.objectStore('items');
                if (replace) stale.forEach(function (it) { itemStore.delete(it.id); });
                items.forEach(function (it) { itemStore.put(it); });
                t.objectStore('decks').put(Object.assign({}, deck, { count: count, updatedAt: new Date().toISOString() }));
                return { added: items.length - (old.length - stale.length), total: count };
            });
        });
    }

    function deleteDeck(id) {
        return Promise.all([getAll('items', 'deckId', id), getAll('progress', 'deckId', id)]).then(function (r) {
            return tx(['decks', 'items', 'progress'], 'readwrite', function (t) {
                t.objectStore('decks').delete(id);
                r[0].forEach(function (it) { t.objectStore('items').delete(it.id); });
                r[1].forEach(function (p) { t.objectStore('progress').delete(p.id); });
            });
        });
    }

    function putProgress(p) {
        return tx(['progress'], 'readwrite', function (t) { t.objectStore('progress').put(p); });
    }

    function getMeta(key, fallback) {
        return open().then(function (db) {
            return request(db.transaction('meta').objectStore('meta').get(key));
        }).then(function (row) { return row ? row.value : fallback; });
    }

    function setMeta(key, value) {
        return tx(['meta'], 'readwrite', function (t) { t.objectStore('meta').put({ key: key, value: value }); });
    }

    function putInbox(key, value) {
        return tx(['inbox'], 'readwrite', function (t) { t.objectStore('inbox').put({ key: key, value: value }); });
    }

    /** Reads and removes an inbox entry, so a reload doesn't import it twice. */
    function takeInbox(key) {
        var found;
        return tx(['inbox'], 'readwrite', function (t) {
            var s = t.objectStore('inbox');
            s.get(key).onsuccess = function (e) {
                found = e.target.result;
                if (found) s.delete(key);
            };
        }).then(function () { return found ? found.value : null; });
    }

    function exportAll() {
        return Promise.all([getAll('decks'), getAll('items'), getAll('progress'), getAll('meta')]).then(function (r) {
            return {
                format: BACKUP_FORMAT,
                version: 1,
                exportedAt: new Date().toISOString(),
                decks: r[0],
                items: r[1],
                progress: r[2],
                meta: r[3]
            };
        });
    }

    function reviewCount(p) {
        return (p && p.log ? p.log.length : 0);
    }

    /**
     * Merges a backup into this device. Decks and items are replaced; for
     * progress, whichever copy has more reviews wins, so restoring an older
     * backup never throws away newer study.
     */
    function importAll(backup) {
        if (!backup || backup.format !== BACKUP_FORMAT) throw new Error('This is not an AnkiGammon trainer backup.');
        if (backup.version !== 1) throw new Error('This backup was made by a newer version of the trainer. Reload the page to update it.');
        return getAll('progress').then(function (current) {
            var mine = {};
            current.forEach(function (p) { mine[p.id] = p; });
            return tx(['decks', 'items', 'progress', 'meta'], 'readwrite', function (t) {
                (backup.decks || []).forEach(function (d) { t.objectStore('decks').put(d); });
                (backup.items || []).forEach(function (it) { t.objectStore('items').put(it); });
                (backup.progress || []).forEach(function (p) {
                    if (reviewCount(p) >= reviewCount(mine[p.id])) t.objectStore('progress').put(p);
                });
                (backup.meta || []).forEach(function (m) {
                    if (m.key === 'settings') t.objectStore('meta').put(m);
                });
                return { decks: (backup.decks || []).length, items: (backup.items || []).length };
            });
        });
    }

    window.TrainStore = {
        open: open,
        decks: function () { return getAll('decks'); },
        items: function (deckId) { return deckId ? getAll('items', 'deckId', deckId) : getAll('items'); },
        progress: function () { return getAll('progress'); },
        saveDeck: saveDeck,
        deleteDeck: deleteDeck,
        putProgress: putProgress,
        getMeta: getMeta,
        setMeta: setMeta,
        putInbox: putInbox,
        takeInbox: takeInbox,
        exportAll: exportAll,
        importAll: importAll
    };
})();
