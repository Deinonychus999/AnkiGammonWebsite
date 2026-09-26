/**
 * Trainer deck logic, independent of the page: turns a position pack into
 * trainer items, builds the question for an item, and grades an answer.
 *
 * A pack is the `ankigammon-position-pack` JSON the decks API serves and
 * ApkgReader builds: one entry per position with its XGID, tags and the
 * Decision exactly as ankigammon's decision_serialize.py wrote it.
 */
(function (root) {
    'use strict';

    var PACK_FORMAT = 'ankigammon-position-pack';
    var ANALYSIS_VERSION = 1;
    // Same as the Anki card's CLOSE_THRESHOLD (card_generator.py).
    var CLOSE_THRESHOLD = 0.020;
    var MAX_CHOICES = 5;

    var Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };

    function slug(text) {
        return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'deck';
    }

    /**
     * { deck, items, skipped } from a parsed pack. `info` names the deck when
     * the caller knows better than the pack (a community deck, a file name).
     */
    function fromPack(pack, info) {
        if (!pack || pack.format !== PACK_FORMAT || !Array.isArray(pack.positions)) {
            throw new Error('This is not an AnkiGammon position pack.');
        }
        if (pack.version !== 1) {
            throw new Error('This pack was made by a newer AnkiGammon (format version ' + pack.version + '). Reload the page to update the trainer.');
        }
        var meta = pack.deck || {};
        var fb = info || {};
        var title = fb.title || meta.title || 'Untitled deck';
        var deck = {
            id: fb.id || (meta.id ? 'deck:' + meta.id : 'file:' + slug(title)),
            title: title,
            author: fb.author || meta.author || '',
            source: fb.source || (meta.id ? 'community' : 'file')
        };
        var items = [];
        var seen = {};
        var skipped = 0;
        pack.positions.forEach(function (p) {
            var analysis = p && p.analysis;
            var decision = analysis && analysis.decision;
            var xgid = p && typeof p.xgid === 'string' ? p.xgid.trim() : '';
            if (!xgid || !decision || analysis.version !== ANALYSIS_VERSION ||
                !Array.isArray(decision.candidate_moves) || !decision.candidate_moves.length) {
                skipped++;
                return;
            }
            var id = deck.id + '|' + xgid;
            if (seen[id]) return;
            seen[id] = true;
            items.push({ id: id, deckId: deck.id, xgid: xgid, tags: p.tags || [], decision: decision });
        });
        deck.count = items.length;
        return { deck: deck, items: items, skipped: skipped };
    }

    function isCube(decision) {
        return decision.decision_type === 'cube_action';
    }

    function bestMove(decision) {
        var moves = decision.candidate_moves;
        for (var i = 0; i < moves.length; i++) if (moves[i].rank === 1) return moves[i];
        return moves[0];
    }

    function shuffle(list, rng) {
        var out = list.slice();
        for (var i = out.length - 1; i > 0; i--) {
            var j = Math.floor(rng() * (i + 1));
            var t = out[i]; out[i] = out[j]; out[j] = t;
        }
        return out;
    }

    /**
     * The choices for an item, as the Anki card offers them: the first
     * MAX_CHOICES checker plays shuffled, or all five cube actions in order.
     */
    function question(decision, rng) {
        var cube = isCube(decision);
        var moves = cube ? decision.candidate_moves.slice(0, 5) : decision.candidate_moves.slice(0, MAX_CHOICES);
        var choices = cube ? moves : shuffle(moves, rng || Math.random);
        return {
            cube: cube,
            prompt: cube ? 'What is the best cube action?' : 'What is the best move?',
            choices: choices,
            best: bestMove(decision)
        };
    }

    /**
     * How far the picked answer is from the best one. Cube actions are right
     * or wrong: "close" by equity means nothing between, say, Double/Take and
     * Too good/Pass, so the card grades them that way too.
     */
    function answerError(decision, move) {
        var best = bestMove(decision);
        if (move === best || move.rank === 1) return 0;
        if (isCube(decision)) return null;
        return Math.abs(move.equity - best.equity);
    }

    function verdict(decision, move) {
        var err = answerError(decision, move);
        if (err === 0) return 'best';
        if (err !== null && err <= CLOSE_THRESHOLD) return 'close';
        return 'wrong';
    }

    /** The grade the trainer suggests; the player can change it before continuing. */
    function suggestedRating(v) {
        if (v === 'best') return Rating.Good;
        if (v === 'close') return Rating.Hard;
        return Rating.Again;
    }

    function cubeOrder(move) {
        if (/^No /.test(move.notation)) return 0;
        return /Pass$/.test(move.notation) ? 2 : 1;
    }

    // Mirrors Move.analysis_tier_rank() in ankigammon/models.py.
    function tierRank(level) {
        if (!level) return -1;
        var fixed = { 'Rollout': 100, 'Book': 95, 'XG Roller++': 90, 'XG Roller+': 89, 'XG Roller': 88, '3-ply red': 3 };
        if (fixed[level] !== undefined) return fixed[level];
        var m = /^(\d+)-ply$/.exec(level);
        return m ? parseInt(m[1], 10) : 0;
    }

    /**
     * Rows for the analysis table, ordered and labelled like the card back:
     * XG's three cube rows with errors signed against the best of them, or
     * checker plays grouped by analysis depth, then by error. Checker plays
     * are the ones the question offered, plus the move played in the game
     * and `picked` when they rank lower, unless `all` asks for every move
     * the engine looked at, which for a position file can be dozens.
     */
    function analysisRows(decision, all, picked) {
        var moves = decision.candidate_moves;
        if (!isCube(decision) && !all) {
            moves = moves.filter(function (m, i) { return i < MAX_CHOICES || m.was_played || m === picked; });
        }
        var analysed = moves.filter(function (m) { return m.from_xg_analysis !== false; });
        var label = function (m) { return m.xg_notation || m.notation; };
        if (isCube(decision)) {
            var rows = analysed.slice().sort(function (a, b) { return cubeOrder(a) - cubeOrder(b); });
            var best = bestMove(decision);
            if (/^Too good/.test(best.notation)) {
                best = rows.filter(function (m) { return /^No /.test(m.notation); })[0] || best;
            } else {
                best = rows.filter(function (m) { return m.rank === 1; })[0] || rows[0];
            }
            return rows.map(function (m) {
                return { move: m, label: label(m), equity: m.equity, error: m.equity - best.equity, best: m === best };
            });
        }
        return analysed.slice().sort(function (a, b) {
            var t = tierRank(b.analysis_level) - tierRank(a.analysis_level);
            if (t) return t;
            return Math.abs(a.error || 0) - Math.abs(b.error || 0);
        }).map(function (m) {
            var err = m.xg_error !== null && m.xg_error !== undefined ? m.xg_error : m.error;
            return { move: m, label: label(m), equity: m.equity, error: -Math.abs(err || 0), best: m.rank === 1 };
        });
    }

    var api = {
        PACK_FORMAT: PACK_FORMAT,
        CLOSE_THRESHOLD: CLOSE_THRESHOLD,
        Rating: Rating,
        fromPack: fromPack,
        isCube: isCube,
        bestMove: bestMove,
        question: question,
        answerError: answerError,
        verdict: verdict,
        suggestedRating: suggestedRating,
        analysisRows: analysisRows,
        slug: slug
    };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.TrainDeck = api;
})(typeof self !== 'undefined' ? self : this);
