/**
 * XG Binary File Parser
 *
 * Parses eXtreme Gammon .xg match files and .xgp position files.
 * Based on the xgdatatools library (LGPL) by Michael Petch.
 *
 * File format reference:
 *   - xgstruct.py (record definitions)
 *   - xgzarc.py (zlib archive structure)
 *   - xgimport.py (extraction flow)
 */
(function () {
    'use strict';

    // ── Constants ──────────────────────────────────────────────────────
    var GDF_HEADER_SIZE = 8232;
    var RECORD_SIZE = 2560;
    var FILE_INDEX_ENTRY_SIZE = 532;
    var ARCHIVE_RECORD_SIZE = 36;
    var MAX_ARCHIVE_FILES = 1000;
    var MAX_EXTRACTED_FILE_SIZE = 128 * 1024 * 1024;
    var MAX_XGP_RECORDS = 128;
    var MAX_XGP_GAME_DATA_SIZE = MAX_XGP_RECORDS * RECORD_SIZE;

    var ENTRY_HEADER_MATCH = 0;
    var ENTRY_HEADER_GAME = 1;
    var ENTRY_CUBE = 2;
    var ENTRY_MOVE = 3;
    var ENTRY_FOOTER_GAME = 4;
    var ENTRY_FOOTER_MATCH = 5;

    // ── Helpers ────────────────────────────────────────────────────────

    /** Read a Delphi short string: first byte = length, then N ASCII bytes */
    function readDelphiString(bytes, offset) {
        var len = bytes[offset];
        var chars = [];
        for (var i = 0; i < len; i++) {
            chars.push(String.fromCharCode(bytes[offset + 1 + i]));
        }
        return chars.join('');
    }

    /** Read a UTF-16 int array (from struct.unpack 'H' values) to string */
    function readUTF16String(dv, offset, maxChars) {
        var chars = [];
        for (var i = 0; i < maxChars; i++) {
            var code = dv.getUint16(offset + i * 2, true);
            if (code === 0) break;
            chars.push(String.fromCharCode(code));
        }
        return chars.join('');
    }

    function getInt32(dv, off) { return dv.getInt32(off, true); }
    function getUint32(dv, off) { return dv.getUint32(off, true); }
    function getInt8(dv, off) { return dv.getInt8(off); }
    function getUint8(dv, off) { return dv.getUint8(off); }

    function readSignedBytes(dv, offset, count) {
        var values = [];
        for (var i = 0; i < count; i++) {
            values.push(getInt8(dv, offset + i));
        }
        return values;
    }

    function inflateWithLimit(data, maxOutputSize, raw) {
        if (!isFinite(maxOutputSize) || maxOutputSize <= 0) {
            throw new Error('Invalid decompression size limit');
        }

        var inflator = new pako.Inflate({
            raw: raw,
            chunkSize: 64 * 1024
        });
        var outputSize = 0;

        inflator.onData = function (chunk) {
            outputSize += chunk.length;
            if (outputSize > maxOutputSize) {
                var limitError = new Error('Decompressed data exceeds the allowed size');
                limitError.outputLimitExceeded = true;
                throw limitError;
            }
            this.chunks.push(chunk);
        };

        var succeeded = inflator.push(data, true);
        if (!succeeded || inflator.err || !inflator.ended || !inflator.result) {
            throw new Error(inflator.msg || 'Invalid compressed data');
        }
        return inflator.result;
    }

    /** Try zlib, then raw deflate, while enforcing an output-size cap. */
    function decompress(data, maxOutputSize) {
        try {
            return inflateWithLimit(data, maxOutputSize, false);
        } catch (e) {
            if (e && e.outputLimitExceeded) throw e;
            try {
                return inflateWithLimit(data, maxOutputSize, true);
            } catch (e2) {
                if (e2 && e2.outputLimitExceeded) throw e2;
                var detail = e2 && e2.message ? e2.message : String(e2);
                throw new Error('Failed to decompress data: ' + detail);
            }
        }
    }

    // ── Archive Layer ──────────────────────────────────────────────────

    /**
     * Parse the ArchiveRecord from the last 36 bytes of the buffer.
     * Layout: <llllll12B>  (6 × int32 + 12 bytes reserved)
     */
    function parseArchiveRecord(dv, fileSize) {
        var base = fileSize - ARCHIVE_RECORD_SIZE;
        return {
            crc: getUint32(dv, base + 0),
            filecount: getInt32(dv, base + 4),
            version: getInt32(dv, base + 8),
            registrysize: getInt32(dv, base + 12),
            archivesize: getInt32(dv, base + 16),
            compressedregistry: !!getInt32(dv, base + 20)
        };
    }

    /**
     * Parse the file index from the archive.
     * Each FileRecord is 532 bytes: <256B 256B l l l l B B xx>
     */
    function parseFileIndex(registryBytes, filecount) {
        var requiredSize = filecount * FILE_INDEX_ENTRY_SIZE;
        if (registryBytes.length < requiredSize) {
            throw new Error('The XG archive file index is truncated');
        }

        var files = [];
        for (var i = 0; i < filecount; i++) {
            var off = i * FILE_INDEX_ENTRY_SIZE;
            var name = readDelphiString(registryBytes, off);
            // path is at offset 256 (skip it)
            var rdv = new DataView(registryBytes.buffer, registryBytes.byteOffset + off);
            var osize = getInt32(rdv, 512);
            var csize = getInt32(rdv, 516);
            var start = getInt32(rdv, 520);
            var crc = getUint32(rdv, 524);
            // compressed: byte == 0 means compressed (Delphi convention)
            var compressedByte = getUint8(rdv, 528);

            files.push({
                name: name,
                osize: osize,
                csize: csize,
                start: start,
                crc: crc,
                compressed: compressedByte === 0
            });
        }
        return files;
    }

    /**
     * Extract and decompress a file from the archive.
     */
    function extractArchiveFile(buffer, fileRec, startOfArcData, endOfArcData, maxOutputSize) {
        var dataStart = startOfArcData + fileRec.start;

        if (fileRec.start < 0 || fileRec.osize <= 0 || fileRec.csize < 0 ||
                fileRec.osize > MAX_EXTRACTED_FILE_SIZE ||
                fileRec.osize > maxOutputSize ||
                dataStart < startOfArcData || dataStart >= endOfArcData) {
            throw new Error('The XG archive contains an invalid file entry');
        }

        if (!fileRec.compressed) {
            if (dataStart + fileRec.osize > endOfArcData) {
                throw new Error('The XG archive contains a truncated file');
            }
            return new Uint8Array(buffer, dataStart, fileRec.osize);
        }

        if (fileRec.csize <= 0 || dataStart + fileRec.csize > endOfArcData) {
            throw new Error('The XG archive contains truncated compressed data');
        }

        // Use the exact compressed size. Pako 2 inflates concatenated zlib
        // streams, so including the next archive member would merge files.
        var compressed = new Uint8Array(buffer, dataStart, fileRec.csize);
        var extracted = decompress(compressed, fileRec.osize);
        if (extracted.length !== fileRec.osize) {
            throw new Error('The extracted XG game data has an invalid size');
        }
        return extracted;
    }

    /**
     * Validate the GDF archive and return its embedded temp.xg game data.
     */
    function extractGameData(arrayBuffer, maxGameDataSize) {
        if (Object.prototype.toString.call(arrayBuffer) !== '[object ArrayBuffer]') {
            throw new Error('Expected binary XG file data');
        }

        var fileSize = arrayBuffer.byteLength;
        if (fileSize < GDF_HEADER_SIZE + ARCHIVE_RECORD_SIZE) {
            throw new Error('File is too small to be a valid XG file');
        }

        var dv = new DataView(arrayBuffer);

        // GDF stores the "HMGR" magic with its bytes reversed.
        var magic = String.fromCharCode(
            dv.getUint8(3), dv.getUint8(2), dv.getUint8(1), dv.getUint8(0)
        );
        if (magic !== 'HMGR') {
            throw new Error('Not a valid eXtreme Gammon file');
        }

        var arcRec = parseArchiveRecord(dv, fileSize);
        if (arcRec.filecount <= 0 || arcRec.filecount > MAX_ARCHIVE_FILES) {
            throw new Error('The XG archive has an invalid file count');
        }
        if (arcRec.registrysize <= 0 || arcRec.archivesize <= 0) {
            throw new Error('The XG archive has invalid size metadata');
        }

        var endOfArcData = fileSize - ARCHIVE_RECORD_SIZE;
        var registryStart = endOfArcData - arcRec.registrysize;
        var startOfArcData = registryStart - arcRec.archivesize;
        if (registryStart < GDF_HEADER_SIZE || registryStart > endOfArcData ||
                startOfArcData < GDF_HEADER_SIZE || startOfArcData > registryStart) {
            throw new Error('The XG archive layout is invalid');
        }

        var registryRaw = new Uint8Array(arrayBuffer, registryStart, arcRec.registrysize);
        var expectedRegistrySize = arcRec.filecount * FILE_INDEX_ENTRY_SIZE;
        var registryBytes = arcRec.compressedregistry
            ? decompress(registryRaw, expectedRegistrySize)
            : registryRaw;
        if (registryBytes.length !== expectedRegistrySize) {
            throw new Error('The XG archive file index has an invalid size');
        }
        var files = parseFileIndex(registryBytes, arcRec.filecount);

        var tempXgRec = null;
        for (var fi = 0; fi < files.length; fi++) {
            if (files[fi].name.toLowerCase() === 'temp.xg') {
                tempXgRec = files[fi];
                break;
            }
        }
        if (!tempXgRec) {
            throw new Error('The XG archive does not contain position data');
        }

        var tempXgData = extractArchiveFile(
            arrayBuffer,
            tempXgRec,
            startOfArcData,
            registryStart,
            maxGameDataSize
        );
        if (tempXgData.length < RECORD_SIZE || tempXgData.length % RECORD_SIZE !== 0) {
            throw new Error('The embedded XG game data is truncated');
        }

        var gameDv = new DataView(
            tempXgData.buffer,
            tempXgData.byteOffset,
            tempXgData.byteLength
        );
        if (getUint32(gameDv, 556) !== 0x494C4D44) {
            throw new Error('The embedded XG game data is invalid');
        }

        return tempXgData;
    }

    // ── Record Parsing Layer ───────────────────────────────────────────

    /**
     * Parse HeaderMatchEntry at the given offset in the temp.xg data.
     * Struct: <9x 41B 41B x l l B B B B d d l l d 129B xxx l l l B B B 129B l B 129B xx l l L l 2l B B B x l l B xxx f f l f l l>
     * Total base read: 612 bytes, then version-dependent extensions.
     */
    function parseHeaderMatch(data, offset) {
        var p1 = readDelphiString(data, offset + 9);
        var p2 = readDelphiString(data, offset + 9 + 41);

        // We need a DataView for multi-byte fields
        var dv = new DataView(data.buffer, data.byteOffset + offset);

        // Calculate byte offset for MatchLength.
        // After 9 skip + 41 (SPlayer1) + 41 (SPlayer2) + 1 padding = 92 bytes
        // MatchLength is the first 'l' after the two player strings.
        // struct format: <9x 41B 41B x ll BBBB ...>
        // Offsets: 9 skip, 41 bytes p1, 41 bytes p2, 1 pad = 92
        // Then: l(MatchLength)=4, l(Variation)=4, B(Crawford), B(Jacoby), B(Beaver), B(AutoDouble)
        // Then: d(Elo1)=8, d(Elo2)=8, l(Exp1)=4, l(Exp2)=4, d(Date)=8
        // Then: 129B(SEvent), 3 pad, ...
        var matchLength = getInt32(dv, 92);
        var crawford = !!getUint8(dv, 100);
        var jacoby = !!getUint8(dv, 101);
        var beaver = !!getUint8(dv, 102);

        // Version is deep in the struct. We need to calculate the exact offset.
        // From the struct format analysis (unpacked_data index 489 maps to Version)
        // The struct: '<9x41B41BxllBBBBddlld129BxxxlllBBB129BlB129BxxllLl2lBBBxllBxxxfflfll'
        // Let me calculate byte offsets:
        //   9x = 9 bytes
        //   41B = 41 bytes (SPlayer1)
        //   41B = 41 bytes (SPlayer2)
        //   x = 1 byte pad
        //   l = 4 (MatchLength)     → offset 92
        //   l = 4 (Variation)       → offset 96
        //   B = 1 (Crawford)        → offset 100
        //   B = 1 (Jacoby)          → offset 101
        //   B = 1 (Beaver)          → offset 102
        //   B = 1 (AutoDouble)      → offset 103
        //   d = 8 (Elo1)            → offset 104
        //   d = 8 (Elo2)            → offset 112
        //   l = 4 (Exp1)            → offset 120
        //   l = 4 (Exp2)            → offset 124
        //   d = 8 (Date)            → offset 128
        //   129B = 129 (SEvent)     → offset 136
        //   xxx = 3                 → offset 265
        //   l = 4 (GameId)          → offset 268
        //   l = 4 (CompLevel1)      → offset 272
        //   l = 4 (CompLevel2)      → offset 276
        //   B = 1 (CountForElo)     → offset 280
        //   B = 1 (AddtoProfile1)   → offset 281
        //   B = 1 (AddtoProfile2)   → offset 282
        //   129B = 129 (SLocation)  → offset 283
        //   l = 4 (GameMode)        → offset 412
        //   B = 1 (Imported)        → offset 416
        //   129B = 129 (SRound)     → offset 417
        //   xx = 2                  → offset 546
        //   l = 4 (Invert)          → offset 548
        //   l = 4 (Version)         → offset 552
        //   L = 4 (Magic)           → offset 556
        var version = getInt32(dv, 552);
        var magic = getUint32(dv, 556);

        // Try to get Unicode player names (v24+)
        // After the base 612 bytes + optional v8 fields (8 bytes)
        var player1Unicode = null;
        var player2Unicode = null;
        if (version >= 24) {
            // v8 adds 8 bytes (CubeLimit + AutoDoubleMax)
            var unicodeStart = 612 + (version >= 8 ? 8 : 0);
            // v24: Bx (2 bytes) then 5 × 129H (5 × 258 bytes)
            // Skip Transcribed byte + pad (2 bytes), then Event (258), Player1 (258), Player2 (258)
            var p1UnicodeOffset = offset + unicodeStart + 2 + 258;
            var p2UnicodeOffset = p1UnicodeOffset + 258;
            if (p2UnicodeOffset + 258 <= data.length) {
                var udv = new DataView(data.buffer, data.byteOffset);
                player1Unicode = readUTF16String(udv, p1UnicodeOffset, 129);
                player2Unicode = readUTF16String(udv, p2UnicodeOffset, 129);
            }
        }

        return {
            player1: (player1Unicode && player1Unicode.length > 0) ? player1Unicode : p1,
            player2: (player2Unicode && player2Unicode.length > 0) ? player2Unicode : p2,
            matchLength: matchLength === 99999 ? 0 : matchLength,
            crawford: crawford,
            jacoby: jacoby,
            beaver: beaver,
            version: version,
            magic: magic
        };
    }

    /**
     * Parse HeaderGameEntry.
     * Struct: <9xxxxllB26bxlBxxxlll>
     *   9x = 9 pad, xxx = 3 pad → 12 bytes skip
     *   Score1(4)@12, Score2(4)@16, CrawfordApply(1)@20,
     *   PosInit(26)@21, 1 pad@47, GameNumber(4)@48
     */
    function parseHeaderGame(data, offset) {
        var dv = new DataView(data.buffer, data.byteOffset + offset);
        return {
            score1: getInt32(dv, 12),
            score2: getInt32(dv, 16),
            crawfordApply: !!getUint8(dv, 20),
            position: readSignedBytes(dv, 21, 26),
            gameNumber: getInt32(dv, 48)
        };
    }

    /**
     * Parse MoveEntry (only the fields we need for .mat).
     * Struct part 1: <9x 26b 26b xxx l 8l 2l l d l>
     *   9 skip, 26 (PosI), 26 (PosEnd), 3 pad = 64
     *   ActiveP(4) = 64, Moves(8×4=32) = 68, Dice(2×4=8) = 100, CubeA(4) = 108
     */
    function parseMoveEntry(data, offset) {
        var dv = new DataView(data.buffer, data.byteOffset + offset);

        var position = readSignedBytes(dv, 9, 26);
        var activeP = getInt32(dv, 64);

        // Moves: 8 × int32 at offset 68
        var moves = [];
        for (var i = 0; i < 8; i++) {
            moves.push(getInt32(dv, 68 + i * 4));
        }

        // Dice: 2 × int32 at offset 100
        var dice = [getInt32(dv, 100), getInt32(dv, 104)];

        // CubeA at offset 108
        var cubeA = getInt32(dv, 108);

        return {
            position: position,
            activePlayer: activeP,
            moves: moves,
            dice: dice,
            cubeA: cubeA
        };
    }

    /**
     * Parse CubeEntry (only the fields we need for .mat).
     * Struct: <9xxxxllllll26bxx>
     *   9x = 9 pad, xxx = 3 pad → 12 bytes skip
     *   ActiveP(4)@12, Double(4)@16, Take(4)@20, BeaverR(4)@24, RaccoonR(4)@28, CubeB(4)@32
     */
    function parseCubeEntry(data, offset) {
        var dv = new DataView(data.buffer, data.byteOffset + offset);
        return {
            activePlayer: getInt32(dv, 12),
            double: getInt32(dv, 16),
            take: getInt32(dv, 20),
            beaver: getInt32(dv, 24),
            raccoon: getInt32(dv, 28),
            cubeValue: getInt32(dv, 32),
            position: readSignedBytes(dv, 36, 26),
            jacobyBits: getInt32(dv, 112),
            isBeaver: dv.getInt16(122, true)
        };
    }

    /**
     * Parse FooterGameEntry.
     * Struct: <9xxxxllBxxxlllxxxxdd7dl>
     *   9x = 9 pad, xxx = 3 pad → 12 bytes skip
     *   Score1g(4)@12, Score2g(4)@16, CrawfordApplyg(1)@20, 3 pad
     *   Winner(4)@24, PointsWon(4)@28, Termination(4)@32
     */
    function parseFooterGame(data, offset) {
        var dv = new DataView(data.buffer, data.byteOffset + offset);
        return {
            winner: getInt32(dv, 24),
            pointsWon: getInt32(dv, 28),
            termination: getInt32(dv, 32)
        };
    }

    // ── Main Parse Function ────────────────────────────────────────────

    function parse(arrayBuffer) {
        var tempXgData = extractGameData(arrayBuffer, MAX_EXTRACTED_FILE_SIZE);

        // Iterate 2560-byte records.
        var recordCount = Math.floor(tempXgData.length / RECORD_SIZE);
        var matchInfo = null;
        var fileVersion = -1;
        var games = [];
        var currentGame = null;

        for (var r = 0; r < recordCount; r++) {
            var recOffset = r * RECORD_SIZE;
            // Record type is at byte 8 within the record
            var entryType = tempXgData[recOffset + 8];

            switch (entryType) {
                case ENTRY_HEADER_MATCH:
                    matchInfo = parseHeaderMatch(tempXgData, recOffset);
                    fileVersion = matchInfo.version;
                    break;

                case ENTRY_HEADER_GAME:
                    currentGame = {
                        header: parseHeaderGame(tempXgData, recOffset),
                        actions: [],
                        footer: null
                    };
                    break;

                case ENTRY_MOVE:
                    if (currentGame) {
                        currentGame.actions.push({
                            type: 'move',
                            data: parseMoveEntry(tempXgData, recOffset)
                        });
                    }
                    break;

                case ENTRY_CUBE:
                    if (currentGame) {
                        var cubeData = parseCubeEntry(tempXgData, recOffset);
                        // Only include actual cube actions (double offered),
                        // skip position-marker cube entries
                        if (cubeData.double === 1) {
                            currentGame.actions.push({
                                type: 'cube',
                                data: cubeData
                            });
                        }
                    }
                    break;

                case ENTRY_FOOTER_GAME:
                    if (currentGame) {
                        currentGame.footer = parseFooterGame(tempXgData, recOffset);
                        games.push(currentGame);
                        currentGame = null;
                    }
                    break;

                case ENTRY_FOOTER_MATCH:
                    // Match complete
                    break;
            }
        }

        if (!matchInfo) {
            throw new Error('No match header found in file');
        }

        return { match: matchInfo, games: games };
    }

    function encodeXGPosition(rawPosition) {
        if (!rawPosition || rawPosition.length !== 26) {
            throw new Error('The XGP position record is incomplete');
        }

        var positiveTotal = 0;
        var negativeTotal = 0;
        var chars = [];

        for (var i = 0; i < rawPosition.length; i++) {
            var count = rawPosition[i];
            var magnitude = Math.abs(count);
            if (magnitude > 15) {
                throw new Error('The XGP file contains an invalid checker count');
            }

            if (count > 0) positiveTotal += count;
            if (count < 0) negativeTotal += magnitude;

            if (count === 0) {
                chars.push('-');
            } else if (count > 0) {
                chars.push(String.fromCharCode(64 + count));
            } else {
                chars.push(String.fromCharCode(96 + magnitude));
            }
        }

        if (positiveTotal > 15 || negativeTotal > 15) {
            throw new Error('The XGP file contains an invalid checker position');
        }

        return chars.join('');
    }

    function cubeExponent(cubeCode) {
        var exponent = Math.abs(cubeCode);
        if (exponent > 7) {
            throw new Error('The XGP file contains an invalid doubling cube value');
        }
        return exponent;
    }

    function cubeOwnerField(cubeCode) {
        return cubeCode === 0 ? 0 : (cubeCode > 0 ? 1 : -1);
    }

    /**
     * Extract the single position in an eXtreme Gammon .xgp file.
     *
     * XGP may include both a CubeEntry (context) and a MoveEntry. Match the
     * desktop parser by preferring the MoveEntry when present. Returning XGID
     * keeps PositionParser as the visualizer's one normalization path.
     */
    function parsePosition(arrayBuffer) {
        var tempXgData = extractGameData(arrayBuffer, MAX_XGP_GAME_DATA_SIZE);
        var recordCount = Math.floor(tempXgData.length / RECORD_SIZE);

        if (recordCount > MAX_XGP_RECORDS) {
            throw new Error('This file contains a match, not a single XGP position');
        }

        var matchInfo = null;
        var gameInfo = null;
        var moveEntry = null;
        var cubeEntry = null;
        var gameHeaderCount = 0;
        var moveEntryCount = 0;
        var cubeEntryCount = 0;
        var hasFooter = false;

        for (var r = 0; r < recordCount; r++) {
            var recOffset = r * RECORD_SIZE;
            var entryType = tempXgData[recOffset + 8];

            if (entryType === ENTRY_HEADER_MATCH && !matchInfo) {
                matchInfo = parseHeaderMatch(tempXgData, recOffset);
            } else if (entryType === ENTRY_HEADER_GAME) {
                gameHeaderCount++;
                if (!gameInfo) gameInfo = parseHeaderGame(tempXgData, recOffset);
            } else if (entryType === ENTRY_MOVE) {
                moveEntryCount++;
                if (!moveEntry) moveEntry = parseMoveEntry(tempXgData, recOffset);
            } else if (entryType === ENTRY_CUBE) {
                cubeEntryCount++;
                if (!cubeEntry) cubeEntry = parseCubeEntry(tempXgData, recOffset);
            } else if (entryType === ENTRY_FOOTER_GAME ||
                    entryType === ENTRY_FOOTER_MATCH) {
                hasFooter = true;
            }
        }

        if (!matchInfo || !gameInfo) {
            throw new Error('The XGP file is missing its position header');
        }
        if (gameHeaderCount !== 1 || moveEntryCount > 1 ||
                cubeEntryCount > 1 || hasFooter) {
            throw new Error('This file contains a match, not a single XGP position');
        }
        if (!moveEntry && !cubeEntry) {
            throw new Error('No renderable position was found in this XGP file');
        }

        var selected = moveEntry || cubeEntry;
        var cubeCode = moveEntry ? moveEntry.cubeA : cubeEntry.cubeValue;
        var turn;
        var diceField;
        var decisionType;

        if (moveEntry) {
            turn = moveEntry.activePlayer === 1 ? 1 : -1;
            if (moveEntry.dice[0] < 1 || moveEntry.dice[0] > 6 ||
                    moveEntry.dice[1] < 1 || moveEntry.dice[1] > 6) {
                throw new Error('The XGP file contains invalid dice');
            }
            diceField = '' + moveEntry.dice[0] + moveEntry.dice[1];
            decisionType = 'checker play';
        } else {
            turn = cubeCode > 0 ? 1 :
                (cubeCode < 0 ? -1 : (cubeEntry.activePlayer === 1 ? 1 : -1));
            diceField = '00';
            decisionType = 'cube decision';
        }

        var matchLength = matchInfo.matchLength;
        var rulesField;
        if (matchLength > 0) {
            rulesField = gameInfo.crawfordApply ? 1 : 0;
        } else if (cubeEntry) {
            rulesField = cubeEntry.jacobyBits & 3;
            if (cubeEntry.isBeaver) rulesField |= 2;
        } else {
            rulesField = (matchInfo.jacoby ? 1 : 0) | (matchInfo.beaver ? 2 : 0);
        }

        var xgid = 'XGID=' + encodeXGPosition(selected.position) + ':' +
            cubeExponent(cubeCode) + ':' + cubeOwnerField(cubeCode) + ':' +
            turn + ':' + diceField + ':' +
            gameInfo.score1 + ':' + gameInfo.score2 + ':' +
            rulesField + ':' + matchLength + ':8';

        return {
            xgid: xgid,
            decisionType: decisionType
        };
    }

    // ── Public API ─────────────────────────────────────────────────────
    window.XGParser = {
        parse: parse,
        parsePosition: parsePosition
    };
})();
