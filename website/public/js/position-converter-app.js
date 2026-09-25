/**
 * Position Editor & Converter — UI Controller
 *
 * Handles position IDs and XGP file input, orchestrates parsing/rendering,
 * and the on-board position editor. The board is always shown: a fresh visit
 * opens the starting position in edit mode, and loads replace it.
 */
(function () {
    'use strict';

    // ── DOM references ─────────────────────────────────────────────────
    var posInput     = document.getElementById('position-input');
    var xgpDropZone  = document.getElementById('xgp-drop-zone');
    var xgpFileInput = document.getElementById('xgp-file-input');
    var xgpBrowseBtn = document.getElementById('xgp-browse-btn');
    var processing   = document.getElementById('processing');
    var errorDisplay = document.getElementById('error-display');
    var errorMessage = document.getElementById('error-message');
    var resultsHeading = document.getElementById('results-heading');
    var boardContainer = document.getElementById('board-container');
    var onRollIndicator = document.getElementById('on-roll-indicator');
    var imageActionStatus = document.getElementById('image-action-status');
    var xgidOutput   = document.getElementById('xgid-output');
    var gnuidOutput  = document.getElementById('gnuid-output');
    var ogidOutput   = document.getElementById('ogid-output');
    var schemeSelect = document.getElementById('scheme-select');
    var errorRetry   = document.getElementById('error-retry');

    var swapColorsBtn = document.getElementById('swap-colors-btn');
    var swapDirectionBtn = document.getElementById('swap-direction-btn');
    var copyImageBtn  = document.getElementById('copy-image-btn');
    var downloadImageBtn = document.getElementById('download-image-btn');

    var editToggleBtn    = document.getElementById('edit-toggle-btn');
    var editorPanel      = document.getElementById('board-editor');
    var switchTurnBtn    = document.getElementById('edit-switch-btn');
    var clearBoardBtn    = document.getElementById('edit-clear-btn');
    var undoBtn          = document.getElementById('edit-undo-btn');
    var redoBtn          = document.getElementById('edit-redo-btn');
    var tapButtons       = document.querySelectorAll('.board-editor__tap-btn');
    var positionTypeSelect = document.getElementById('edit-position-type');
    var gameTypeSelect   = document.getElementById('edit-game-type');
    var matchFields      = document.getElementById('edit-match-fields');
    var moneyFields      = document.getElementById('edit-money-fields');
    var matchLengthInput = document.getElementById('edit-match-length');
    var scoreBottomInput = document.getElementById('edit-score-bottom');
    var scoreTopInput    = document.getElementById('edit-score-top');
    var crawfordInput    = document.getElementById('edit-crawford');
    var jacobyInput      = document.getElementById('edit-jacoby');
    var beaversInput     = document.getElementById('edit-beavers');
    var editStatus       = document.getElementById('edit-status');

    var currentPosition = null;
    var currentMetadata = null;
    var currentFormat = null;
    var currentImageFilename = 'backgammon-position.png';
    var colorsSwapped = false;
    var boardDirection = 'ccw';
    var MAX_XGP_FILE_SIZE = 2 * 1024 * 1024;

    var editing = false;
    var undoStack = [];
    var redoStack = [];
    var MAX_UNDO = 100;
    var tapPlayer = 'O';
    var lastDice = [3, 1];
    var hoverTarget = null;
    var drag = null;
    var hashTimer = null;
    var statusTimer = null;

    // ── Load feedback ──────────────────────────────────────────────────

    function showError(message) {
        processing.hidden = true;
        errorMessage.textContent = message;
        errorDisplay.hidden = false;
        errorDisplay.focus();
    }

    function clearError() {
        errorDisplay.hidden = true;
    }

    // ── Core conversion ────────────────────────────────────────────────

    // shareValue is omitted for the default starting position, which needs
    // neither a share link nor focus moved to the board.
    function showPosition(result, shareValue) {
        currentPosition = result.position;
        currentMetadata = result.metadata;
        currentFormat = result.format;
        undoStack = [];
        redoStack = [];
        window.clearTimeout(hashTimer);

        updateOutputs();
        imageActionStatus.textContent = '';
        imageActionStatus.hidden = true;
        processing.hidden = true;
        if (shareValue) {
            clearError();
            updateHash(shareValue);
            resultsHeading.focus();
        }
    }

    function showStartingPosition() {
        currentImageFilename = 'backgammon-position.png';
        showPosition(window.PositionParser.parse(window.PositionEditor.STARTING_XGID));
    }

    function convert(input) {
        if (!input.trim()) {
            showError('Please paste a position ID or open an .xgp file.');
            return false;
        }

        try {
            currentImageFilename = 'backgammon-position.png';
            showPosition(window.PositionParser.parse(input), input.trim());
            return true;
        } catch (err) {
            console.error('Position parsing error:', err);
            showError(err.message);
            return false;
        }
    }

    function processXgpFile(file) {
        if (!file || !file.name.toLowerCase().endsWith('.xgp')) {
            showError('Please select an .xgp position file from eXtreme Gammon.');
            return;
        }
        if (file.size === 0) {
            showError('This .xgp file is empty.');
            return;
        }
        if (file.size > MAX_XGP_FILE_SIZE) {
            showError('This .xgp file is too large. Select a single-position XGP file under 2 MB.');
            return;
        }

        clearError();
        processing.hidden = false;
        var reader = new FileReader();

        reader.onload = function (event) {
            window.setTimeout(function () {
                try {
                    var xgpResult = window.XGParser.parsePosition(event.target.result);
                    var parsed = window.PositionParser.parse(xgpResult.xgid);
                    currentImageFilename = file.name.replace(/\.xgp$/i, '') + '.png';
                    posInput.value = xgpResult.xgid;
                    showPosition(parsed, xgpResult.xgid);
                } catch (err) {
                    console.error('XGP parsing error:', err);
                    showError('Could not read this XGP position: ' + err.message);
                }
            }, 0);
        };

        reader.onerror = function () {
            showError('The .xgp file could not be read.');
        };

        reader.readAsArrayBuffer(file);
    }

    function updateOutputs() {
        xgidOutput.textContent  = window.PositionParser.encodeXGID(currentPosition, currentMetadata);
        gnuidOutput.textContent = window.PositionParser.encodeGNUID(currentPosition, currentMetadata);
        ogidOutput.textContent  = window.PositionParser.encodeOGID(currentPosition, currentMetadata);

        renderBoard();
        updateOnRoll();
        if (editing) syncEditor();
    }

    function renderBoard() {
        var scheme = schemeSelect.value;
        var svg = window.BoardRenderer.render(currentPosition, currentMetadata, scheme, colorsSwapped, boardDirection);
        boardContainer.innerHTML = svg;
    }

    function checkerChip(player) {
        var scheme = window.BoardRenderer.SCHEMES[schemeSelect.value] || window.BoardRenderer.SCHEMES.classic;
        var useX = player === 'X';
        if (colorsSwapped) useX = !useX;
        var fill = useX ? scheme.checkerX : scheme.checkerO;
        return '<svg width="14" height="14" style="vertical-align:middle" aria-hidden="true" focusable="false">' +
            '<circle cx="7" cy="7" r="6" fill="' + fill + '" stroke="' + scheme.checkerBorder + '" stroke-width="1.5"/></svg>';
    }

    function updateOnRoll() {
        if (!currentMetadata) { onRollIndicator.innerHTML = ''; return; }
        onRollIndicator.innerHTML = 'On Roll ' + checkerChip(currentMetadata.onRoll === 'X' ? 'X' : 'O');
        var chips = editorPanel.querySelectorAll('.board-editor__chip');
        for (var i = 0; i < chips.length; i++) {
            chips[i].innerHTML = checkerChip(chips[i].getAttribute('data-player'));
        }
    }

    // ── URL hash for sharing ───────────────────────────────────────────

    function updateHash(input) {
        if (history.replaceState) {
            history.replaceState(null, '', '#' + encodeURIComponent(input));
        }
    }

    function loadFromHash() {
        var hash = window.location.hash;
        if (!hash || hash.length < 2) return false;
        var input = decodeURIComponent(hash.substring(1));
        posInput.value = input;
        return convert(input);
    }

    // ── Copy to clipboard ──────────────────────────────────────────────

    function copyToClipboard(text, btn) {
        var originalText = btn.textContent;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                btn.textContent = 'Copied!';
                setTimeout(function () { btn.textContent = originalText; }, 2000);
            });
        } else {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            btn.textContent = 'Copied!';
            setTimeout(function () { btn.textContent = originalText; }, 2000);
        }
    }

    // ── Event handlers ─────────────────────────────────────────────────

    posInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            convert(posInput.value);
        }
    });

    xgpBrowseBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        xgpFileInput.click();
    });

    xgpFileInput.addEventListener('change', function (e) {
        if (e.target.files.length > 0) {
            processXgpFile(e.target.files[0]);
        }
    });

    xgpDropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        xgpDropZone.classList.add('load-bar--active');
    });

    xgpDropZone.addEventListener('dragleave', function () {
        xgpDropZone.classList.remove('load-bar--active');
    });

    xgpDropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        xgpDropZone.classList.remove('load-bar--active');

        if (e.dataTransfer.files.length > 1) {
            showError('Please upload one .xgp position file at a time.');
        } else if (e.dataTransfer.files.length === 1) {
            processXgpFile(e.dataTransfer.files[0]);
        }
    });

    // A position ID pasted anywhere loads at once. Pastes into other fields,
    // and text that isn't an ID, keep the browser's normal behaviour.
    document.addEventListener('paste', function (e) {
        var target = e.target;
        if (target !== posInput && target.closest && target.closest('input, textarea, select, [contenteditable]')) return;
        var text = ((e.clipboardData || window.clipboardData).getData('text') || '').trim();
        if (!text) return;
        try {
            window.PositionParser.detect(text);
        } catch (err) {
            return;
        }
        e.preventDefault();
        posInput.value = text;
        convert(text);
    });

    // Prevent the browser from navigating away when a file is dropped outside
    // the highlighted upload target.
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) { e.preventDefault(); });

    errorRetry.addEventListener('click', function () {
        xgpFileInput.value = '';
        clearError();
        posInput.focus();
    });

    // Color scheme change — reset swap since the new theme has its own color assignment
    schemeSelect.addEventListener('change', function () {
        colorsSwapped = false;
        try {
            localStorage.setItem('bg-scheme', schemeSelect.value);
            localStorage.setItem('bg-swap', '0');
        } catch (e) {}
        if (currentPosition) {
            renderBoard();
            updateOnRoll();
        }
    });

    // Swap colors
    swapColorsBtn.addEventListener('click', function () {
        colorsSwapped = !colorsSwapped;
        try { localStorage.setItem('bg-swap', colorsSwapped ? '1' : '0'); } catch (e) {}
        if (currentPosition) {
            renderBoard();
            updateOnRoll();
        }
    });

    // Swap board direction
    swapDirectionBtn.addEventListener('click', function () {
        boardDirection = (boardDirection === 'ccw') ? 'cw' : 'ccw';
        try { localStorage.setItem('bg-direction', boardDirection); } catch (e) {}
        if (currentPosition) {
            renderBoard();
        }
    });

    function runImageAction(btn, promise, successText, successMessage) {
        var originalText = btn.textContent;
        var originalTitle = btn.title;
        btn.disabled = true;
        imageActionStatus.textContent = '';
        imageActionStatus.hidden = true;

        promise.then(function () {
            btn.textContent = successText;
            imageActionStatus.textContent = successMessage;
            imageActionStatus.hidden = false;
            window.setTimeout(function () {
                btn.textContent = originalText;
                btn.title = originalTitle;
                btn.disabled = false;
            }, 2000);
        }, function (err) {
            console.error('Board image export error:', err);
            btn.textContent = 'Failed';
            btn.title = err.message;
            imageActionStatus.textContent = err.message;
            imageActionStatus.hidden = false;
            window.setTimeout(function () {
                btn.textContent = originalText;
                btn.title = originalTitle;
                btn.disabled = false;
            }, 2500);
        });
    }

    // Copy board as image
    copyImageBtn.addEventListener('click', function () {
        var svgEl = boardContainer.querySelector('svg');
        if (!svgEl) return;

        runImageAction(
            copyImageBtn,
            window.BoardImageExporter.copyPng(svgEl),
            'Copied!',
            'Board image copied to the clipboard.'
        );
    });

    // Download board as PNG
    downloadImageBtn.addEventListener('click', function () {
        var svgEl = boardContainer.querySelector('svg');
        if (!svgEl) return;

        runImageAction(
            downloadImageBtn,
            window.BoardImageExporter.downloadPng(svgEl, currentImageFilename),
            'Downloaded!',
            'Board image downloaded as a PNG file.'
        );
    });

    // Copy buttons (delegation)
    document.addEventListener('click', function (e) {
        if (e.target.classList.contains('copy-btn')) {
            var targetId = e.target.getAttribute('data-target');
            var targetEl = document.getElementById(targetId);
            if (targetEl) copyToClipboard(targetEl.textContent, e.target);
        }
    });

    // ── Position editing ───────────────────────────────────────────────

    function other(player) {
        return player === 'X' ? 'O' : 'X';
    }

    function playerName(player) {
        return player === 'O' ? 'bottom' : 'top';
    }

    function snapshot() {
        return JSON.stringify({ position: currentPosition, metadata: currentMetadata });
    }

    function pushUndo(before) {
        if (before === snapshot()) return;
        undoStack.push(before);
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        redoStack = [];
    }

    // Safari throws after 100 history.replaceState calls in 30 seconds,
    // which a single drag across the board can exceed.
    function refresh() {
        updateOutputs();
        window.clearTimeout(hashTimer);
        hashTimer = window.setTimeout(function () {
            updateHash(xgidOutput.textContent);
        }, 300);
    }

    function edited() {
        window.PositionEditor.forgetSourceFormat(currentMetadata);
        refresh();
    }

    function checkersMessage(complete, player) {
        return complete ? '' : 'All 15 ' + playerName(player) + ' checkers are on the board.';
    }

    function flashStatus(message) {
        if (!message) return;
        editStatus.textContent = message;
        window.clearTimeout(statusTimer);
        statusTimer = window.setTimeout(clearStatus, 2500);
    }

    function clearStatus() {
        window.clearTimeout(statusTimer);
        editStatus.textContent = '';
    }

    // Runs a discrete edit (button, key, form field) as one undo step.
    function edit(mutate) {
        var before = snapshot();
        flashStatus(mutate());
        if (snapshot() !== before) {
            pushUndo(before);
            edited();
        } else {
            syncEditor();
        }
    }

    function restore(from, to) {
        if (!from.length) return;
        to.push(snapshot());
        var state = JSON.parse(from.pop());
        currentPosition = state.position;
        currentMetadata = state.metadata;
        refresh();
    }

    function undo() {
        restore(undoStack, redoStack);
    }

    function redo() {
        restore(redoStack, undoStack);
    }

    function syncEditor() {
        var E = window.PositionEditor;
        var meta = currentMetadata;
        var ml = meta.matchLength || 0;

        positionTypeSelect.value = E.positionType(meta);
        gameTypeSelect.value = ml ? 'match' : 'money';
        matchFields.hidden = !ml;
        moneyFields.hidden = !!ml;
        matchLengthInput.value = ml || '';
        scoreBottomInput.value = meta.scoreO || 0;
        scoreTopInput.value = meta.scoreX || 0;
        scoreBottomInput.max = scoreTopInput.max = Math.max(ml - 1, 0);
        crawfordInput.checked = !!meta.crawford;
        crawfordInput.disabled = !E.canCrawford(meta);
        jacobyInput.checked = !!meta.jacoby;
        beaversInput.checked = !!meta.beaversAllowed;

        var empty = E.isEmpty(currentPosition);
        clearBoardBtn.textContent = empty ? 'Starting Position' : 'Clear Board';
        clearBoardBtn.title = empty ? 'Set up the starting position (Ins)' : 'Remove all checkers (Del)';
        undoBtn.disabled = !undoStack.length;
        redoBtn.disabled = !redoStack.length;
    }

    function setEditing(on) {
        editing = on;
        drag = null;
        hoverTarget = null;
        editToggleBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        editToggleBtn.textContent = on ? 'Done Editing' : 'Edit Position';
        editorPanel.hidden = !on;
        boardContainer.classList.toggle('board-container--editing', on);
        clearStatus();
        if (on) syncEditor();
    }

    function hitFromEvent(e) {
        var svg = boardContainer.querySelector('svg');
        var ctm = svg && svg.getScreenCTM();
        if (!ctm) return null;
        var pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        pt = pt.matrixTransform(ctm.inverse());
        return window.BoardRenderer.hitTest(pt.x, pt.y, boardDirection, currentMetadata);
    }

    function applyHit(hit, player, repeat) {
        var E = window.PositionEditor;
        var R = window.BoardRenderer;
        if (hit.kind === 'point') {
            return checkersMessage(E.applySlot(currentPosition, hit.point, player, hit.slot, R.POINT_SLOTS, repeat), player);
        }
        if (hit.kind === 'bar') {
            return checkersMessage(E.applySlot(currentPosition, E.barIndex(hit.player), hit.player, hit.slot, R.BAR_SLOTS, repeat), hit.player);
        }
        if (hit.kind === 'cube') E.stepCube(currentMetadata, player === 'O');
        else if (hit.kind === 'die') E.cycleDie(currentMetadata, hit.index, player === 'O' ? 1 : -1);
        return '';
    }

    function hoveredIndex() {
        if (!hoverTarget) return -1;
        return hoverTarget.kind === 'bar'
            ? window.PositionEditor.barIndex(hoverTarget.player)
            : hoverTarget.point;
    }

    boardContainer.addEventListener('pointerdown', function (e) {
        if (!editing || (e.button !== 0 && e.button !== 2)) return;
        var hit = hitFromEvent(e);
        if (!hit) return;
        e.preventDefault();

        // macOS sends Ctrl+click as a right click
        var player = e.button === 2 || e.ctrlKey ? other(tapPlayer) : tapPlayer;
        // Touch has no right button, so a tap on a stack edits that stack's player
        if (e.pointerType !== 'mouse' && hit.kind === 'point') {
            player = window.PositionEditor.occupant(currentPosition, hit.point) || tapPlayer;
        }
        var before = snapshot();
        flashStatus(applyHit(hit, player, true));
        if (snapshot() !== before) edited();

        if (hit.kind === 'point') {
            drag = { before: before, player: player, pointerId: e.pointerId, hit: hit };
            boardContainer.setPointerCapture(e.pointerId);
        } else {
            pushUndo(before);
            syncEditor();
        }
    });

    boardContainer.addEventListener('pointermove', function (e) {
        if (!editing) return;
        var hit = hitFromEvent(e);
        hoverTarget = hit && (hit.kind === 'point' || hit.kind === 'bar') ? hit : null;
        if (!drag || e.pointerId !== drag.pointerId || !hit || hit.kind !== 'point') return;

        var last = drag.hit;
        if (hit.point === last.point && hit.slot === last.slot) return;

        // Fill any points a fast drag skipped between two move events
        var cols = [hit.col];
        if (last.isTop === hit.isTop) {
            var step = Math.sign(hit.col - last.col);
            for (var c = last.col + step; c !== hit.col; c += step) cols.push(c);
        }

        var before = snapshot();
        var message = '';
        for (var i = 0; i < cols.length; i++) {
            var point = window.BoardRenderer.pointAt(cols[i], hit.isTop, boardDirection);
            message = applyHit({ kind: 'point', point: point, slot: hit.slot }, drag.player, false) || message;
        }
        flashStatus(message);
        drag.hit = hit;
        if (snapshot() !== before) edited();
    });

    function endDrag(e) {
        if (!drag || e.pointerId !== drag.pointerId) return;
        pushUndo(drag.before);
        drag = null;
        syncEditor();
    }

    boardContainer.addEventListener('pointerup', endDrag);
    boardContainer.addEventListener('pointercancel', endDrag);
    boardContainer.addEventListener('pointerleave', function () { hoverTarget = null; });

    boardContainer.addEventListener('contextmenu', function (e) {
        if (editing) e.preventDefault();
    });

    document.addEventListener('keydown', function (e) {
        if (!editing || e.altKey) return;
        if (e.target.closest && e.target.closest('input, select, textarea')) return;

        var E = window.PositionEditor;
        var key = e.key;
        if (e.ctrlKey || e.metaKey) {
            if (key === 'z' || key === 'Z') {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            } else if (key === 'y' || key === 'Y') {
                e.preventDefault();
                redo();
            }
            return;
        }

        var index = hoveredIndex();
        var owner = hoverTarget && hoverTarget.kind === 'bar' ? hoverTarget.player : 'O';
        if (key === 'Delete') {
            edit(function () { E.clearBoard(currentPosition); });
        } else if (key === 'Insert') {
            edit(function () { E.setStartingPosition(currentPosition); });
        } else if (index >= 0 && /^[0-9]$/.test(key)) {
            edit(function () {
                return checkersMessage(E.setCount(currentPosition, index, owner, parseInt(key, 10)), owner);
            });
        } else if (index >= 0 && (key === '+' || key === '=')) {
            edit(function () {
                var p = E.occupant(currentPosition, index) || owner;
                return checkersMessage(E.addOne(currentPosition, index, p), p);
            });
        } else if (index >= 0 && key === '-') {
            edit(function () { E.removeOne(currentPosition, index); });
        } else {
            return;
        }
        e.preventDefault();
    });

    editToggleBtn.addEventListener('click', function () {
        setEditing(!editing);
    });

    switchTurnBtn.addEventListener('click', function () {
        edit(function () {
            window.PositionEditor.switchTurn(currentMetadata);
        });
    });

    clearBoardBtn.addEventListener('click', function () {
        edit(function () {
            var E = window.PositionEditor;
            if (E.isEmpty(currentPosition)) E.setStartingPosition(currentPosition);
            else E.clearBoard(currentPosition);
        });
    });

    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);

    Array.prototype.forEach.call(tapButtons, function (btn) {
        btn.addEventListener('click', function () {
            tapPlayer = btn.getAttribute('data-player');
            Array.prototype.forEach.call(tapButtons, function (b) {
                b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
            });
        });
    });

    positionTypeSelect.addEventListener('change', function () {
        edit(function () {
            if (currentMetadata.dice) lastDice = currentMetadata.dice.slice();
            window.PositionEditor.setPositionType(currentMetadata, positionTypeSelect.value, lastDice);
        });
    });

    gameTypeSelect.addEventListener('change', function () {
        edit(function () {
            var ml = gameTypeSelect.value === 'match' ? 7 : 0;
            window.PositionEditor.setMatch(currentMetadata, ml, currentMetadata.scoreO, currentMetadata.scoreX);
        });
    });

    function onMatchFieldChange() {
        edit(function () {
            window.PositionEditor.setMatch(currentMetadata,
                parseInt(matchLengthInput.value, 10) || 1,
                scoreBottomInput.value, scoreTopInput.value);
        });
    }

    matchLengthInput.addEventListener('change', onMatchFieldChange);
    scoreBottomInput.addEventListener('change', onMatchFieldChange);
    scoreTopInput.addEventListener('change', onMatchFieldChange);

    crawfordInput.addEventListener('change', function () {
        edit(function () {
            currentMetadata.crawford = crawfordInput.checked && window.PositionEditor.canCrawford(currentMetadata);
        });
    });

    jacobyInput.addEventListener('change', function () {
        edit(function () { currentMetadata.jacoby = jacobyInput.checked; });
    });

    beaversInput.addEventListener('change', function () {
        edit(function () { currentMetadata.beaversAllowed = beaversInput.checked; });
    });

    // ── Init ───────────────────────────────────────────────────────────

    // Restore saved preferences
    try {
        var saved = localStorage.getItem('bg-scheme');
        if (saved && window.BoardRenderer.SCHEMES[saved]) {
            schemeSelect.value = saved;
        }
        colorsSwapped = localStorage.getItem('bg-swap') === '1';
        var savedDir = localStorage.getItem('bg-direction');
        if (savedDir === 'cw' || savedDir === 'ccw') boardDirection = savedDir;
    } catch (e) {}

    // A shared link opens for viewing; a fresh visit opens the editor
    if (!loadFromHash()) {
        showStartingPosition();
        setEditing(true);
    }
})();
