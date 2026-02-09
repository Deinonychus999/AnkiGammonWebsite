/**
 * Position ID Parser & Encoder
 *
 * Parses and encodes backgammon position IDs in three formats:
 *   - XGID  (eXtreme Gammon)
 *   - GNUID (GNU Backgammon)
 *   - OGID  (OpenGammon)
 *
 * Internal position model:
 *   { points: int[26], xOff: int, oOff: int }
 *   points[0]    = X's bar (top player)
 *   points[1-24] = board points (1 = O's home, 24 = X's home)
 *   points[25]   = O's bar (bottom player)
 *   Positive = X checkers, Negative = O checkers
 */
(function () {
    'use strict';

    // ── Helpers ──────────────────────────────────────────────────────────

    function makePosition() {
        return {
            points: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            xOff: 0,
            oOff: 0
        };
    }

    function calcBorneOff(pos) {
        var totalX = 0, totalO = 0;
        for (var i = 0; i < 26; i++) {
            if (pos.points[i] > 0) totalX += pos.points[i];
            if (pos.points[i] < 0) totalO += Math.abs(pos.points[i]);
        }
        pos.xOff = 15 - totalX;
        pos.oOff = 15 - totalO;
    }

    function log2(v) {
        var n = 0;
        var t = v;
        while (t > 1) { t = Math.floor(t / 2); n++; }
        return n;
    }

    // ── XGID ────────────────────────────────────────────────────────────

    function decodeCheckerCount(ch, turn) {
        if (ch === '-') return 0;
        var count, isLower;
        var code = ch.charCodeAt(0);
        if (code >= 97 && code <= 112) {       // 'a'-'p'
            count = code - 96;
            isLower = true;
        } else if (code >= 65 && code <= 80) { // 'A'-'P'
            count = code - 64;
            isLower = false;
        } else {
            throw new Error('Invalid XGID position character: ' + ch);
        }
        if (turn === 1) {
            return isLower ? count : -count;
        } else {
            return isLower ? -count : count;
        }
    }

    function encodeCheckerCount(count, turn) {
        if (count === 0) return '-';
        var abs = Math.min(Math.abs(count), 16);
        if (turn === 1) {
            return count > 0
                ? String.fromCharCode(96 + abs)    // lowercase = X
                : String.fromCharCode(64 + abs);   // uppercase = O
        } else {
            return count > 0
                ? String.fromCharCode(64 + abs)    // uppercase = X
                : String.fromCharCode(96 + abs);   // lowercase = O
        }
    }

    function parseXGID(input) {
        var s = input;
        if (s.toUpperCase().indexOf('XGID=') === 0) s = s.substring(5);

        var parts = s.split(':');
        if (parts.length < 9)
            throw new Error('Invalid XGID: expected at least 9 colon-separated fields, got ' + parts.length);

        var posStr = parts[0];
        if (posStr.length !== 26)
            throw new Error('Invalid XGID: position string must be 26 characters, got ' + posStr.length);

        var cubeLog   = parseInt(parts[1], 10);
        var cubePos   = parseInt(parts[2], 10);
        var turn      = parseInt(parts[3], 10);
        var diceStr   = parts[4];
        var scoreO    = parseInt(parts[5], 10);
        var scoreX    = parseInt(parts[6], 10);
        var cj        = parts.length > 7 ? parseInt(parts[7], 10) : 0;
        var ml        = parts.length > 8 ? parseInt(parts[8], 10) : 0;

        // Parse position (perspective-dependent)
        var pos = makePosition();
        if (turn === 1) {
            // O on roll: standard mapping
            for (var i = 0; i < 26; i++) {
                pos.points[i] = decodeCheckerCount(posStr[i], turn);
            }
        } else {
            // X on roll: reversed
            pos.points[0]  = decodeCheckerCount(posStr[25], turn);
            pos.points[25] = decodeCheckerCount(posStr[0], turn);
            for (var j = 1; j < 25; j++) {
                pos.points[j] = decodeCheckerCount(posStr[25 - j], turn);
            }
        }
        calcBorneOff(pos);

        // For turn=-1 the position was reversed, so negate cubePos and swap scores
        // to keep the internal model consistent (same physical player = same X/O)
        if (turn === -1) {
            cubePos = -cubePos;
            var tmpScore = scoreX; scoreX = scoreO; scoreO = tmpScore;
        }

        // Metadata
        var meta = {
            cubeValue:   cubeLog >= 0 ? Math.pow(2, cubeLog) : 1,
            cubeOwner:   cubePos === 0 ? 'centered' : (cubePos === -1 ? 'x_owns' : 'o_owns'),
            onRoll:      'O',
            _xgidTurn:   turn,
            dice:        null,
            scoreX:      scoreX,
            scoreO:      scoreO,
            matchLength: ml,
            crawford:    cj === 1
        };

        diceStr = diceStr.toUpperCase().trim();
        if (diceStr !== '00' && diceStr !== 'D' && diceStr !== 'B' && diceStr !== 'R') {
            if (diceStr.length === 2 && /^\d\d$/.test(diceStr)) {
                var d1 = parseInt(diceStr[0], 10);
                var d2 = parseInt(diceStr[1], 10);
                if (d1 >= 1 && d1 <= 6 && d2 >= 1 && d2 <= 6) {
                    meta.dice = [d1, d2];
                }
            }
        }

        return { position: pos, metadata: meta };
    }

    function encodeXGID(pos, meta) {
        var turn = meta._xgidTurn !== undefined ? meta._xgidTurn : (meta.onRoll === 'O' ? 1 : -1);
        var chars = new Array(26);

        if (turn === 1) {
            for (var i = 0; i < 26; i++) {
                chars[i] = encodeCheckerCount(pos.points[i], turn);
            }
        } else {
            chars[0]  = encodeCheckerCount(pos.points[25], turn);
            chars[25] = encodeCheckerCount(pos.points[0], turn);
            for (var j = 1; j < 25; j++) {
                chars[25 - j] = encodeCheckerCount(pos.points[j], turn);
            }
        }

        var cubeLog = log2(meta.cubeValue || 1);
        var cubePos = meta.cubeOwner === 'centered' ? 0 :
                      meta.cubeOwner === 'x_owns'   ? -1 : 1;
        var diceStr = meta.dice ? '' + meta.dice[0] + meta.dice[1] : '00';
        var cj = meta.crawford ? 1 : 0;

        // For turn=-1, reverse the normalization done in parseXGID
        var scoreOOut = meta.scoreO || 0;
        var scoreXOut = meta.scoreX || 0;
        if (turn === -1) {
            cubePos = -cubePos;
            var tmp = scoreOOut; scoreOOut = scoreXOut; scoreXOut = tmp;
        }

        return 'XGID=' + chars.join('') + ':' +
            cubeLog + ':' + cubePos + ':' + turn + ':' + diceStr + ':' +
            scoreOOut + ':' + scoreXOut + ':' +
            cj + ':' + (meta.matchLength || 0) + ':' + log2(256);
    }

    // ── GNUID ───────────────────────────────────────────────────────────

    var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    function b64ToBytes(str) {
        // Pad to multiple of 4
        while (str.length % 4 !== 0) str += '=';
        var raw = atob(str);
        var bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        return bytes;
    }

    function bytesToB64(bytes) {
        var raw = '';
        for (var i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
        return btoa(raw).replace(/=+$/, '');
    }

    function bytesToBits(bytes) {
        var bits = [];
        for (var i = 0; i < bytes.length; i++) {
            for (var b = 0; b < 8; b++) {
                bits.push((bytes[i] >> b) & 1);
            }
        }
        return bits;
    }

    function bitsToBytes(bits, numBytes) {
        var bytes = new Uint8Array(numBytes);
        for (var i = 0; i < bits.length && i < numBytes * 8; i++) {
            var byteIdx = Math.floor(i / 8);
            var bitIdx = i % 8;
            bytes[byteIdx] |= (bits[i] << bitIdx);
        }
        return bytes;
    }

    function extractBits(bits, start, count) {
        var val = 0;
        for (var i = 0; i < count; i++) {
            if (start + i < bits.length) val |= (bits[start + i] << i);
        }
        return val;
    }

    function setBits(bits, start, count, value) {
        for (var i = 0; i < count; i++) {
            bits[start + i] = (value >> i) & 1;
        }
    }

    function decodePositionId(posId) {
        var bytes = b64ToBytes(posId);
        if (bytes.length !== 10)
            throw new Error('Invalid GNUID Position ID: expected 10 bytes');

        var bits = bytesToBits(bytes);

        // Decode TanBoard: [player0 25pts][player1 25pts]
        var anBoard = [new Array(25), new Array(25)];
        for (var p = 0; p < 2; p++)
            for (var q = 0; q < 25; q++)
                anBoard[p][q] = 0;

        var bitIdx = 0, player = 0, point = 0;
        while (bitIdx < bits.length && player < 2) {
            var checkers = 0;
            while (bitIdx < bits.length && bits[bitIdx] === 1) {
                checkers++;
                bitIdx++;
            }
            if (point < 25) anBoard[player][point] = checkers;
            if (bitIdx < bits.length && bits[bitIdx] === 0) bitIdx++;
            point++;
            if (point >= 25) { player++; point = 0; }
        }

        // TanBoard → Position
        var pos = makePosition();
        // Player X: anBoard[0][0-23] → points 24..1 (reversed)
        for (var i = 0; i < 24; i++) {
            pos.points[24 - i] += anBoard[0][i];
        }
        pos.points[0] = anBoard[0][24]; // X bar

        // Player O: anBoard[1][0-23] → points 1..24 (direct)
        for (var k = 0; k < 24; k++) {
            pos.points[k + 1] -= anBoard[1][k];
        }
        pos.points[25] = -anBoard[1][24]; // O bar

        calcBorneOff(pos);
        return pos;
    }

    function encodePositionId(pos) {
        // Position → TanBoard
        var anBoard = [new Array(25), new Array(25)];
        for (var p = 0; p < 2; p++)
            for (var q = 0; q < 25; q++)
                anBoard[p][q] = 0;

        // Player X: reverse mapping
        for (var pt = 1; pt < 25; pt++) {
            if (pos.points[pt] > 0) anBoard[0][24 - pt] = pos.points[pt];
        }
        anBoard[0][24] = pos.points[0]; // X bar

        // Player O: direct mapping
        for (var pt2 = 1; pt2 < 25; pt2++) {
            if (pos.points[pt2] < 0) anBoard[1][pt2 - 1] = -pos.points[pt2];
        }
        anBoard[1][24] = pos.points[25] < 0 ? -pos.points[25] : 0; // O bar

        // TanBoard → bits
        var bits = [];
        for (var pl = 0; pl < 2; pl++) {
            for (var pp = 0; pp < 25; pp++) {
                for (var c = 0; c < anBoard[pl][pp]; c++) bits.push(1);
                bits.push(0); // separator
            }
        }
        while (bits.length < 80) bits.push(0);

        var bytes = bitsToBytes(bits, 10);
        return bytesToB64(bytes);
    }

    function decodeMatchId(matchId) {
        var bytes = b64ToBytes(matchId);
        if (bytes.length !== 9)
            throw new Error('Invalid GNUID Match ID: expected 9 bytes');

        var bits = bytesToBits(bytes);

        var cubeLog = extractBits(bits, 0, 4);
        var cubeOwnerBits = extractBits(bits, 4, 2);
        var crawford = bits[7] === 1;
        var turnBit = bits[11];
        var die0 = extractBits(bits, 15, 3);
        var die1 = extractBits(bits, 18, 3);
        var matchLength = extractBits(bits, 21, 15);
        var scoreO = extractBits(bits, 36, 15);
        var scoreX = extractBits(bits, 51, 15);

        var cubeOwner = cubeOwnerBits === 3 ? 'centered' :
                        cubeOwnerBits === 0 ? 'o_owns' : 'x_owns';

        var meta = {
            cubeValue:   cubeLog < 15 ? Math.pow(2, cubeLog) : 1,
            cubeOwner:   cubeOwner,
            onRoll:      turnBit === 0 ? 'O' : 'X',
            dice:        (die0 > 0 && die1 > 0) ? [die0, die1] : null,
            scoreX:      scoreX,
            scoreO:      scoreO,
            matchLength: matchLength,
            crawford:    crawford
        };
        return meta;
    }

    function encodeMatchId(meta) {
        var bits = new Array(72);
        for (var i = 0; i < 72; i++) bits[i] = 0;

        setBits(bits, 0, 4, log2(meta.cubeValue || 1));

        var ownerVal = meta.cubeOwner === 'centered' ? 3 :
                       meta.cubeOwner === 'o_owns'   ? 0 : 1;
        setBits(bits, 4, 2, ownerVal);

        bits[7] = meta.crawford ? 1 : 0;

        // Game state = 1 (playing)
        setBits(bits, 8, 3, 1);

        bits[11] = meta.onRoll === 'O' ? 0 : 1;

        if (meta.dice) {
            setBits(bits, 15, 3, meta.dice[0]);
            setBits(bits, 18, 3, meta.dice[1]);
        }

        setBits(bits, 21, 15, meta.matchLength || 0);
        setBits(bits, 36, 15, meta.scoreO || 0);
        setBits(bits, 51, 15, meta.scoreX || 0);

        var bytes = bitsToBytes(bits, 9);
        return bytesToB64(bytes);
    }

    function parseGNUID(input) {
        var s = input.trim();
        if (s.toUpperCase().indexOf('GNUID=') === 0) s = s.substring(6);
        else if (s.toUpperCase().indexOf('GNUBGID=') === 0) s = s.substring(8);
        else if (s.toUpperCase().indexOf('GNUBGID ') === 0) s = s.substring(8);

        var parts = s.split(':');
        var posId = parts[0].trim();
        var matchIdStr = parts.length > 1 ? parts[1].trim() : null;

        if (posId.length !== 14)
            throw new Error('Invalid GNUID: Position ID must be 14 characters, got ' + posId.length);

        var pos = decodePositionId(posId);
        var meta = matchIdStr ? decodeMatchId(matchIdStr) : {
            cubeValue: 1, cubeOwner: 'centered', onRoll: 'X',
            dice: null, scoreX: 0, scoreO: 0, matchLength: 0, crawford: false
        };

        return { position: pos, metadata: meta };
    }

    function encodeGNUID(pos, meta) {
        var posId = encodePositionId(pos);
        var matchId = encodeMatchId(meta);
        return posId + ':' + matchId;
    }

    // ── OGID ────────────────────────────────────────────────────────────

    function charToPoint(ch) {
        var code = ch.charCodeAt(0);
        if (code >= 48 && code <= 57) return code - 48;        // '0'-'9' → 0-9
        if (code >= 97 && code <= 112) return code - 97 + 10;  // 'a'-'p' → 10-25
        throw new Error('Invalid OGID position character: ' + ch);
    }

    function pointToChar(pt) {
        if (pt >= 0 && pt <= 9) return String.fromCharCode(48 + pt);
        if (pt >= 10 && pt <= 25) return String.fromCharCode(97 + pt - 10);
        throw new Error('Invalid point number: ' + pt);
    }

    function parseOGID(input) {
        var s = input;
        if (s.toUpperCase().indexOf('OGID=') === 0) s = s.substring(5);

        var parts = s.split(':');
        if (parts.length < 3)
            throw new Error('Invalid OGID: expected at least 3 colon-separated fields');

        var whiteStr = parts[0]; // X checkers
        var blackStr = parts[1]; // O checkers
        var cubeStr  = parts[2];

        // Parse position
        var pos = makePosition();
        for (var i = 0; i < whiteStr.length; i++) {
            pos.points[charToPoint(whiteStr[i])] += 1;
        }
        for (var j = 0; j < blackStr.length; j++) {
            pos.points[charToPoint(blackStr[j])] -= 1;
        }
        calcBorneOff(pos);

        // Parse metadata
        var meta = {
            cubeValue: 1, cubeOwner: 'centered', onRoll: null,
            dice: null, scoreX: 0, scoreO: 0, matchLength: 0, crawford: false
        };

        if (cubeStr.length === 3) {
            var ownerCh = cubeStr[0];
            var valLog  = parseInt(cubeStr[1], 10);
            meta.cubeValue = Math.pow(2, valLog);
            meta.cubeOwner = ownerCh === 'W' ? 'x_owns' :
                             ownerCh === 'B' ? 'o_owns' : 'centered';
        }

        // Optional fields
        if (parts.length > 3 && parts[3]) {
            var ds = parts[3];
            if (ds.length === 2 && /^\d\d$/.test(ds)) {
                var d1 = parseInt(ds[0], 10), d2 = parseInt(ds[1], 10);
                if (d1 >= 1 && d1 <= 6 && d2 >= 1 && d2 <= 6) meta.dice = [d1, d2];
            }
        }
        if (parts.length > 4 && parts[4]) {
            var t = parts[4].toUpperCase();
            if (t === 'W') meta.onRoll = 'X';
            else if (t === 'B') meta.onRoll = 'O';
        }
        if (parts.length > 6 && parts[6]) meta.scoreX = parseInt(parts[6], 10) || 0;
        if (parts.length > 7 && parts[7]) meta.scoreO = parseInt(parts[7], 10) || 0;
        if (parts.length > 8 && parts[8]) {
            var mlMatch = parts[8].match(/^(\d+)/);
            if (mlMatch) meta.matchLength = parseInt(mlMatch[1], 10);
            if (parts[8].indexOf('C') !== -1) meta.crawford = true;
        }

        return { position: pos, metadata: meta };
    }

    function encodeOGID(pos, meta) {
        var whiteCh = [], blackCh = [];
        for (var i = 0; i < 26; i++) {
            var c = pos.points[i];
            if (c > 0) {
                for (var w = 0; w < c; w++) whiteCh.push(pointToChar(i));
            } else if (c < 0) {
                for (var b = 0; b < Math.abs(c); b++) blackCh.push(pointToChar(i));
            }
        }

        var ownerCh = meta.cubeOwner === 'x_owns' ? 'W' :
                      meta.cubeOwner === 'o_owns' ? 'B' : 'N';
        var cubeLog = log2(meta.cubeValue || 1);
        var cubeStr = ownerCh + cubeLog + 'N';

        var ogidParts = [whiteCh.sort().join(''), blackCh.sort().join(''), cubeStr];

        // Dice
        ogidParts.push(meta.dice ? '' + meta.dice[0] + meta.dice[1] : '');
        // Turn
        ogidParts.push(meta.onRoll === 'X' ? 'W' : (meta.onRoll === 'O' ? 'B' : ''));
        // Game state
        ogidParts.push('');
        // Scores
        ogidParts.push('' + (meta.scoreX || 0));
        ogidParts.push('' + (meta.scoreO || 0));
        // Match length
        var mlStr = '' + (meta.matchLength || 0);
        if (meta.crawford) mlStr += 'C';
        ogidParts.push(mlStr);
        // Move ID
        ogidParts.push('');

        return ogidParts.join(':');
    }

    // ── Auto-detection ──────────────────────────────────────────────────

    function detect(input) {
        var s = input.trim();

        // Check explicit prefixes first
        var upper = s.toUpperCase();
        if (upper.indexOf('XGID=') === 0) return 'xgid';
        if (upper.indexOf('GNUID=') === 0 || upper.indexOf('GNUBGID=') === 0 || upper.indexOf('GNUBGID ') === 0) return 'gnuid';
        if (upper.indexOf('OGID=') === 0) return 'ogid';

        var parts = s.split(':');

        // XGID: first part is 26 chars of [a-pA-P-]
        if (parts[0].length === 26 && /^[a-pA-P\-]{26}$/.test(parts[0])) {
            return 'xgid';
        }

        // GNUID: first part is 14 chars of Base64
        if (parts[0].length === 14 && /^[A-Za-z0-9+\/]{14}$/.test(parts[0])) {
            if (parts.length === 1 || (parts.length === 2 && /^[A-Za-z0-9+\/]{12}$/.test(parts[1]))) {
                return 'gnuid';
            }
        }

        // OGID: 3+ parts, third is 3-char cube string [WBN][0-8][NOTP]
        if (parts.length >= 3 && /^[WBN][0-8][NOTP]$/.test(parts[2])) {
            return 'ogid';
        }

        throw new Error('Unrecognized position ID format. Supported: XGID, GNUID, OGID.');
    }

    // ── Pip counts ──────────────────────────────────────────────────────

    function calculatePipCounts(pos) {
        var xPips = 0, oPips = 0;
        for (var pt = 1; pt < 25; pt++) {
            if (pos.points[pt] > 0) xPips += (25 - pt) * pos.points[pt];
            if (pos.points[pt] < 0) oPips += pt * Math.abs(pos.points[pt]);
        }
        if (pos.points[0] > 0)  xPips += 25 * pos.points[0];
        if (pos.points[25] < 0) oPips += 25 * Math.abs(pos.points[25]);
        return { x: xPips, o: oPips };
    }

    // ── Public API ──────────────────────────────────────────────────────

    window.PositionParser = {
        detect: detect,

        parse: function (input) {
            var fmt = detect(input);
            var result;
            if (fmt === 'xgid')  result = parseXGID(input.trim());
            else if (fmt === 'gnuid') result = parseGNUID(input.trim());
            else result = parseOGID(input.trim());

            // Ensure onRoll has a default
            if (!result.metadata.onRoll) result.metadata.onRoll = 'O';

            result.format = fmt;
            return result;
        },

        parseXGID:  parseXGID,
        parseGNUID: parseGNUID,
        parseOGID:  parseOGID,

        encodeXGID:  encodeXGID,
        encodeGNUID: encodeGNUID,
        encodeOGID:  encodeOGID,

        calculatePipCounts: calculatePipCounts
    };
})();
