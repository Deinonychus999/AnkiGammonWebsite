/**
 * XG to MAT Converter — UI Controller
 *
 * Handles file input (drag-and-drop + browse), orchestrates XGParser and
 * MATWriter, and manages the UI state machine:
 *   IDLE → PROCESSING → RESULT | ERROR → IDLE
 */
(function () {
    'use strict';

    // ── DOM references ─────────────────────────────────────────────────
    var dropZone = document.getElementById('drop-zone');
    var fileInput = document.getElementById('file-input');
    var browseBtn = document.getElementById('browse-btn');
    var processing = document.getElementById('processing');
    var errorDisplay = document.getElementById('error-display');
    var errorMessage = document.getElementById('error-message');
    var results = document.getElementById('results');
    var resultsTitle = document.getElementById('results-title');
    var resultsMeta = document.getElementById('results-meta');
    var matOutput = document.getElementById('mat-output');
    var copyBtn = document.getElementById('copy-btn');
    var downloadBtn = document.getElementById('download-btn');
    var resetBtn = document.getElementById('reset-btn');

    var currentMatText = '';
    var currentFilename = '';

    // ── State management ───────────────────────────────────────────────

    function setState(state) {
        dropZone.hidden = state !== 'idle';
        processing.hidden = state !== 'processing';
        errorDisplay.hidden = state !== 'error';
        results.hidden = state !== 'result';
    }

    function showError(message) {
        errorMessage.textContent = message;
        setState('error');
    }

    // ── Core processing ────────────────────────────────────────────────

    function processFile(file) {
        if (!file.name.toLowerCase().endsWith('.xg')) {
            showError('Please select an .xg file (eXtreme Gammon format).');
            return;
        }

        currentFilename = file.name.replace(/\.xg$/i, '.mat');
        setState('processing');

        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                var parsed = window.XGParser.parse(e.target.result);
                currentMatText = window.MATWriter.write(parsed);

                // Display results
                resultsTitle.textContent =
                    parsed.match.player1 + ' vs ' + parsed.match.player2;

                var matchLen = parsed.match.matchLength > 0
                    ? parsed.match.matchLength + '-point match'
                    : 'Unlimited game';
                var gameCount = parsed.games.length;
                resultsMeta.textContent =
                    matchLen + '  |  ' + gameCount + ' game' +
                    (gameCount !== 1 ? 's' : '');

                matOutput.textContent = currentMatText;
                setState('result');
            } catch (err) {
                console.error('XG parsing error:', err);
                showError('Failed to convert: ' + err.message);
            }
        };
        reader.onerror = function () {
            showError('Failed to read file.');
        };
        reader.readAsArrayBuffer(file);
    }

    // ── Event handlers ─────────────────────────────────────────────────

    browseBtn.addEventListener('click', function () {
        fileInput.click();
    });

    fileInput.addEventListener('change', function (e) {
        if (e.target.files.length > 0) {
            processFile(e.target.files[0]);
        }
    });

    // Drag-and-drop
    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('drop-zone--active');
    });

    dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('drop-zone--active');
    });

    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drop-zone--active');
        if (e.dataTransfer.files.length > 0) {
            processFile(e.dataTransfer.files[0]);
        }
    });

    // Prevent default drag behaviour on the whole page
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) { e.preventDefault(); });

    // Copy to clipboard
    copyBtn.addEventListener('click', function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(currentMatText).then(function () {
                copyBtn.textContent = 'Copied!';
                setTimeout(function () { copyBtn.textContent = 'Copy to Clipboard'; }, 2000);
            });
        } else {
            // Fallback
            var ta = document.createElement('textarea');
            ta.value = currentMatText;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            copyBtn.textContent = 'Copied!';
            setTimeout(function () { copyBtn.textContent = 'Copy to Clipboard'; }, 2000);
        }
    });

    // Download .mat file
    downloadBtn.addEventListener('click', function () {
        var blob = new Blob([currentMatText], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = currentFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // Reset
    resetBtn.addEventListener('click', function () {
        currentMatText = '';
        currentFilename = '';
        fileInput.value = '';
        setState('idle');
    });

    // Error → retry
    document.getElementById('error-retry').addEventListener('click', function () {
        setState('idle');
    });

    // ── Init ───────────────────────────────────────────────────────────
    setState('idle');
})();
