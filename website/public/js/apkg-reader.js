/**
 * APKG Reader — opens an Anki .apkg package in the browser and checks that
 * every note was produced by AnkiGammon.
 *
 * Pipeline: zip (stored or deflate via pako) → collection SQLite (sql.js)
 * → notes of the AnkiGammon note type → validation report + position pack.
 */
(function () {
    'use strict';

    var SQL_JS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.14.2/';
    var AG_MODEL_NAMES = ['AnkiGammon', 'XG Backgammon Decision'];
    var AG_TAG = 'ankigammon';
    var MAX_PREVIEWS = 4;
    var FIELD_SEP = '\x1f';

    var sqlPromise = null;

    // ── sql.js loading ─────────────────────────────────────────────────

    function loadSqlJs() {
        if (sqlPromise) return sqlPromise;
        sqlPromise = new Promise(function (resolve, reject) {
            if (window.initSqlJs) { resolve(); return; }
            var s = document.createElement('script');
            s.src = SQL_JS_BASE + 'sql-wasm.js';
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('Could not load the SQLite reader (sql.js). Check your connection and try again.')); };
            document.head.appendChild(s);
        }).then(function () {
            return window.initSqlJs({ locateFile: function (f) { return SQL_JS_BASE + f; } });
        });
        sqlPromise.catch(function () { sqlPromise = null; });
        return sqlPromise;
    }

    // ── Zip reading ────────────────────────────────────────────────────

    function readZip(buffer) {
        var view = new DataView(buffer);
        var bytes = new Uint8Array(buffer);
        var eocd = -1;
        var minEocd = Math.max(0, buffer.byteLength - 65557);
        for (var i = buffer.byteLength - 22; i >= minEocd; i--) {
            if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('This file is not a zip archive, so it cannot be an .apkg package.');

        var entryCount = view.getUint16(eocd + 10, true);
        var cdOffset = view.getUint32(eocd + 16, true);
        if (cdOffset === 0xFFFFFFFF) throw new Error('Zip64 archives are not supported. Packages over 4 GB cannot be submitted.');

        var entries = {};
        var p = cdOffset;
        var decoder = new TextDecoder('utf-8');
        for (var n = 0; n < entryCount; n++) {
            if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt zip archive (bad central directory entry).');
            var method = view.getUint16(p + 10, true);
            var csize = view.getUint32(p + 20, true);
            var usize = view.getUint32(p + 24, true);
            var fnLen = view.getUint16(p + 28, true);
            var exLen = view.getUint16(p + 30, true);
            var cmLen = view.getUint16(p + 32, true);
            var localOffset = view.getUint32(p + 42, true);
            var name = decoder.decode(bytes.subarray(p + 46, p + 46 + fnLen));
            entries[name] = { method: method, csize: csize, usize: usize, localOffset: localOffset };
            p += 46 + fnLen + exLen + cmLen;
        }

        function extract(name) {
            var e = entries[name];
            if (!e) return null;
            var lo = e.localOffset;
            if (view.getUint32(lo, true) !== 0x04034b50) throw new Error('Corrupt zip archive (bad local header for ' + name + ').');
            var start = lo + 30 + view.getUint16(lo + 26, true) + view.getUint16(lo + 28, true);
            var data = bytes.subarray(start, start + e.csize);
            if (e.method === 0) return data;
            if (e.method === 8) {
                if (!window.pako) throw new Error('The compression library (pako) did not load.');
                return window.pako.inflateRaw(data);
            }
            throw new Error('Unsupported zip compression method ' + e.method + ' for ' + name + '.');
        }

        return { names: Object.keys(entries), extract: extract };
    }

    // ── Collection reading ─────────────────────────────────────────────

    function pickCollectionFile(names) {
        if (names.indexOf('collection.anki21') >= 0) return 'collection.anki21';
        if (names.indexOf('collection.anki2') >= 0) return 'collection.anki2';
        return null;
    }

    function readModels(db) {
        var models = {};
        var colRows = db.exec('SELECT models FROM col');
        if (colRows.length && colRows[0].values.length) {
            var raw = colRows[0].values[0][0];
            var parsed = {};
            try { parsed = JSON.parse(raw || '{}'); } catch (e) { parsed = {}; }
            Object.keys(parsed).forEach(function (id) {
                var m = parsed[id];
                models[String(id)] = {
                    name: m.name || '',
                    fields: (m.flds || []).map(function (f) { return f.name; })
                };
            });
        }
        if (Object.keys(models).length) return models;

        // Schema 15+ keeps note types in tables instead of the col JSON blob.
        var hasNotetypes = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='notetypes'").length > 0;
        if (!hasNotetypes) return models;
        db.exec('SELECT id, name FROM notetypes')[0].values.forEach(function (row) {
            models[String(row[0])] = { name: row[1], fields: [] };
        });
        var fieldRows = db.exec('SELECT ntid, ord, name FROM fields ORDER BY ntid, ord');
        if (fieldRows.length) {
            fieldRows[0].values.forEach(function (row) {
                var m = models[String(row[0])];
                if (m) m.fields[row[1]] = row[2];
            });
        }
        return models;
    }

    function deckNamesById(db) {
        var names = {};
        try {
            var rows = db.exec('SELECT decks FROM col');
            if (rows.length && rows[0].values.length) {
                var decks = JSON.parse(rows[0].values[0][0] || '{}');
                Object.keys(decks).forEach(function (id) { names[String(id)] = decks[id].name || ''; });
            }
        } catch (e) { /* fall through to the table form */ }
        if (!Object.keys(names).length) {
            try {
                var t = db.exec('SELECT id, name FROM decks');
                if (t.length) t[0].values.forEach(function (row) { names[String(row[0])] = row[1] || ''; });
            } catch (e) { /* no deck names available */ }
        }
        return names;
    }

    /** Full Anki deck paths that actually contain cards, most cards first. */
    function readCardDecks(db) {
        var names = deckNamesById(db);
        var out = [];
        try {
            var rows = db.exec('SELECT did, COUNT(*) FROM cards GROUP BY did ORDER BY COUNT(*) DESC');
            if (rows.length) {
                rows[0].values.forEach(function (row) {
                    var name = names[String(row[0])];
                    if (name && name !== 'Default') out.push(name);
                });
            }
        } catch (e) { /* deck paths are informational */ }
        return out;
    }

    function commonDeckPrefix(paths) {
        var parts = paths.map(function (p) { return p.split('::'); });
        var prefix = [];
        for (var i = 0; ; i++) {
            var seg = parts[0][i];
            if (seg === undefined) break;
            for (var k = 1; k < parts.length; k++) if (parts[k][i] !== seg) return prefix;
            prefix.push(seg);
        }
        return prefix;
    }

    function suggestTitle(cardDecks, fileName) {
        if (cardDecks.length === 1) return cardDecks[0].split('::').join(' / ');
        if (cardDecks.length > 1) {
            var prefix = commonDeckPrefix(cardDecks);
            if (prefix.length) return prefix.join(' / ');
            return cardDecks[0].split('::')[0];
        }
        return fileName.replace(/\.apkg$/i, '');
    }

    function parseTags(raw) {
        return (raw || '').split(/\s+/).filter(Boolean);
    }

    // ── Validation ─────────────────────────────────────────────────────

    function validateCollection(db, fileName, apkgBytes) {
        var errors = [];
        var warnings = [];
        var models = readModels(db);
        var modelIds = Object.keys(models);

        if (!modelIds.length) {
            errors.push('No note types were found in this package.');
            return { ok: false, errors: errors, warnings: warnings };
        }

        var agModels = {};
        modelIds.forEach(function (id) {
            if (AG_MODEL_NAMES.indexOf(models[id].name) >= 0) agModels[id] = models[id];
        });

        var noteRows = db.exec('SELECT id, guid, mid, tags, flds FROM notes');
        var notes = noteRows.length ? noteRows[0].values : [];
        if (!notes.length) {
            errors.push('This package contains no notes.');
            return { ok: false, errors: errors, warnings: warnings };
        }

        var foreignByModel = {};
        var agNotes = [];
        notes.forEach(function (row) {
            var mid = String(row[2]);
            if (agModels[mid]) {
                agNotes.push({ id: row[0], guid: row[1], mid: mid, tags: parseTags(row[3]), fields: (row[4] || '').split(FIELD_SEP) });
            } else {
                var name = models[mid] ? models[mid].name : 'unknown note type';
                foreignByModel[name] = (foreignByModel[name] || 0) + 1;
            }
        });

        var foreignNames = Object.keys(foreignByModel);
        if (foreignNames.length) {
            var parts = foreignNames.map(function (n) { return foreignByModel[n] + ' × "' + n + '"'; });
            errors.push('Only decks made with AnkiGammon are accepted. This package contains notes of other types: ' + parts.join(', ') + '.');
        }
        if (!agNotes.length) {
            if (!foreignNames.length) errors.push('No AnkiGammon notes were found in this package.');
            return { ok: false, errors: errors, warnings: warnings };
        }

        var positions = [];
        var seenXgids = {};
        var duplicates = 0;
        var untagged = 0;
        var badXgid = 0;
        var missingAnalysis = 0;
        var brokenAnalysis = 0;
        var mismatched = 0;
        var stats = {
            positions: 0, checkerPlays: 0, cubeActions: 0, annotated: 0,
            matchLengths: {}, sourceDescriptions: {}, sourceFiles: {}
        };

        agNotes.forEach(function (note) {
            var model = agModels[note.mid];
            var xgidIdx = model.fields.indexOf('XGID');
            var analysisIdx = model.fields.indexOf('AnalysisData');
            if (xgidIdx < 0 || analysisIdx < 0) {
                missingAnalysis++;
                return;
            }
            var xgid = (note.fields[xgidIdx] || '').trim();
            var blob = (note.fields[analysisIdx] || '').trim();
            if (!xgid) { badXgid++; return; }
            if (!blob) { missingAnalysis++; return; }

            var analysis;
            try { analysis = JSON.parse(blob); } catch (e) { brokenAnalysis++; return; }
            var decision = analysis && analysis.decision;
            if (!decision || !decision.position || !Array.isArray(decision.position.points)) { brokenAnalysis++; return; }

            try { window.PositionParser.parse(xgid); } catch (e) { badXgid++; return; }
            if (decision.xgid && decision.xgid !== xgid) mismatched++;
            if (note.tags.indexOf(AG_TAG) < 0) untagged++;
            if (seenXgids[xgid]) { duplicates++; return; }
            seenXgids[xgid] = true;

            var type = decision.decision_type || (note.tags.indexOf('cube_action') >= 0 ? 'cube_action' : 'checker_play');
            if (type === 'cube_action') stats.cubeActions++; else stats.checkerPlays++;
            var ml = typeof decision.match_length === 'number' ? decision.match_length : 0;
            var mlKey = ml > 0 ? ml + 'pt' : 'unlimited';
            stats.matchLengths[mlKey] = (stats.matchLengths[mlKey] || 0) + 1;
            if (decision.note && String(decision.note).trim()) stats.annotated++;
            if (decision.source_description) {
                stats.sourceDescriptions[decision.source_description] = (stats.sourceDescriptions[decision.source_description] || 0) + 1;
            }
            if (decision.source_file) {
                var base = String(decision.source_file).split(/[\\/]/).pop();
                stats.sourceFiles[base] = (stats.sourceFiles[base] || 0) + 1;
            }
            stats.positions++;
            positions.push({ xgid: xgid, tags: note.tags, analysis: analysis });
        });

        if (missingAnalysis) {
            errors.push(missingAnalysis + ' card(s) have no saved analysis data. Re-export the deck with AnkiGammon 1.3.0 or newer, which stores the analysis inside every card.');
        }
        if (brokenAnalysis) errors.push(brokenAnalysis + ' card(s) have analysis data that could not be read.');
        if (badXgid) errors.push(badXgid + ' card(s) have a missing or invalid XGID.');
        if (!positions.length && !errors.length) errors.push('No usable positions were found.');

        if (duplicates) warnings.push(duplicates + ' duplicate position(s) were skipped. Anki keeps one card per XGID.');
        if (untagged) warnings.push(untagged + ' card(s) are missing the "ankigammon" tag. The deck is still accepted because the cards are AnkiGammon notes.');
        if (mismatched) warnings.push(mismatched + ' card(s) have an XGID field that differs from the analysis data. The XGID field is used.');

        var previews = [];
        for (var i = 0; i < positions.length && previews.length < MAX_PREVIEWS; i++) {
            try {
                var parsed = window.PositionParser.parse(positions[i].xgid);
                previews.push({ xgid: positions[i].xgid, position: parsed.position, metadata: parsed.metadata });
            } catch (e) { /* already validated; skip defensively */ }
        }

        var cardDecks = readCardDecks(db);
        var suggestedTitle = suggestTitle(cardDecks, fileName);

        return {
            ok: errors.length === 0,
            errors: errors,
            warnings: warnings,
            summary: {
                suggestedTitle: suggestedTitle,
                ankiDecks: cardDecks,
                positions: stats.positions,
                checkerPlays: stats.checkerPlays,
                cubeActions: stats.cubeActions,
                annotated: stats.annotated,
                matchLengths: stats.matchLengths,
                sourceDescriptions: stats.sourceDescriptions,
                sourceFiles: stats.sourceFiles,
                apkgBytes: apkgBytes
            },
            positions: positions,
            previews: previews
        };
    }

    // ── Public API ─────────────────────────────────────────────────────

    function read(buffer, fileName) {
        var zip;
        try {
            zip = readZip(buffer);
        } catch (e) {
            return Promise.reject(e);
        }
        var collectionName = pickCollectionFile(zip.names);
        if (!collectionName) {
            if (zip.names.indexOf('collection.anki21b') >= 0) {
                return Promise.reject(new Error('This package uses the newest Anki export format, which this page cannot read. In Anki, export again with "Support older Anki versions" enabled, or export the deck directly from AnkiGammon.'));
            }
            return Promise.reject(new Error('No Anki collection was found inside this file. Make sure it is an .apkg package.'));
        }

        return loadSqlJs().then(function (SQL) {
            var db = new SQL.Database(zip.extract(collectionName));
            try {
                return validateCollection(db, fileName || 'deck.apkg', buffer.byteLength);
            } finally {
                db.close();
            }
        });
    }

    function buildPack(result, deck) {
        return {
            format: 'ankigammon-position-pack',
            version: 1,
            deck: deck,
            positions: result.positions
        };
    }

    window.ApkgReader = {
        read: read,
        buildPack: buildPack,
        MAX_PREVIEWS: MAX_PREVIEWS
    };
})();
