/**
 * Position Converter & Visualizer — UI Controller
 *
 * Handles position IDs and XGP file input, orchestrates parsing/rendering,
 * and manages the four-state tool UI.
 * States: IDLE, PROCESSING, RESULT, and ERROR.
 */
(function () {
    'use strict';

    // ── DOM references ─────────────────────────────────────────────────
    var inputArea    = document.getElementById('input-area');
    var posInput     = document.getElementById('position-input');
    var convertBtn   = document.getElementById('convert-btn');
    var xgpDropZone  = document.getElementById('xgp-drop-zone');
    var xgpFileInput = document.getElementById('xgp-file-input');
    var xgpBrowseBtn = document.getElementById('xgp-browse-btn');
    var processing   = document.getElementById('processing');
    var errorDisplay = document.getElementById('error-display');
    var errorMessage = document.getElementById('error-message');
    var results      = document.getElementById('results');
    var resultsHeading = document.getElementById('results-heading');
    var boardContainer = document.getElementById('board-container');
    var onRollIndicator = document.getElementById('on-roll-indicator');
    var imageActionStatus = document.getElementById('image-action-status');
    var xgidOutput   = document.getElementById('xgid-output');
    var gnuidOutput  = document.getElementById('gnuid-output');
    var ogidOutput   = document.getElementById('ogid-output');
    var schemeSelect = document.getElementById('scheme-select');
    var resetBtn     = document.getElementById('reset-btn');
    var errorRetry   = document.getElementById('error-retry');

    var swapColorsBtn = document.getElementById('swap-colors-btn');
    var swapDirectionBtn = document.getElementById('swap-direction-btn');
    var copyImageBtn  = document.getElementById('copy-image-btn');
    var downloadImageBtn = document.getElementById('download-image-btn');

    var currentPosition = null;
    var currentMetadata = null;
    var currentFormat = null;
    var currentImageFilename = 'backgammon-position.png';
    var colorsSwapped = false;
    var boardDirection = 'ccw';
    var MAX_XGP_FILE_SIZE = 2 * 1024 * 1024;

    // ── State management ───────────────────────────────────────────────

    function setState(state) {
        inputArea.hidden    = state !== 'idle';
        processing.hidden   = state !== 'processing';
        errorDisplay.hidden = state !== 'error';
        results.hidden      = state !== 'result';
    }

    function showError(message) {
        errorMessage.textContent = message;
        setState('error');
        errorDisplay.focus();
    }

    // ── Core conversion ────────────────────────────────────────────────

    function showPosition(result, shareValue) {
        currentPosition = result.position;
        currentMetadata = result.metadata;
        currentFormat = result.format;

        // Encode all three formats
        xgidOutput.textContent  = window.PositionParser.encodeXGID(currentPosition, currentMetadata);
        gnuidOutput.textContent = window.PositionParser.encodeGNUID(currentPosition, currentMetadata);
        ogidOutput.textContent  = window.PositionParser.encodeOGID(currentPosition, currentMetadata);

        renderBoard();
        updateOnRoll();
        updateHash(shareValue);
        imageActionStatus.textContent = '';
        imageActionStatus.hidden = true;
        setState('result');
        resultsHeading.focus();
    }

    function convert(input) {
        if (!input.trim()) {
            showError('Please paste a position ID or upload an .xgp file.');
            return;
        }

        try {
            currentImageFilename = 'backgammon-position.png';
            showPosition(window.PositionParser.parse(input), input.trim());
        } catch (err) {
            console.error('Position parsing error:', err);
            showError(err.message);
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

        setState('processing');
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

    function renderBoard() {
        var scheme = schemeSelect.value;
        var svg = window.BoardRenderer.render(currentPosition, currentMetadata, scheme, colorsSwapped, boardDirection);
        boardContainer.innerHTML = svg;
    }

    function updateOnRoll() {
        if (!currentMetadata) { onRollIndicator.innerHTML = ''; return; }
        var scheme = window.BoardRenderer.SCHEMES[schemeSelect.value] || window.BoardRenderer.SCHEMES.classic;
        var onRoll = currentMetadata.onRoll === 'X' ? 'X' : 'O';
        var useX = onRoll === 'X';
        if (colorsSwapped) useX = !useX;
        var fill = useX ? scheme.checkerX : scheme.checkerO;
        var border = scheme.checkerBorder;
        onRollIndicator.innerHTML = 'On Roll ' +
            '<svg width="14" height="14" style="vertical-align:middle" aria-hidden="true" focusable="false">' +
            '<circle cx="7" cy="7" r="6" fill="' + fill + '" stroke="' + border + '" stroke-width="1.5"/></svg>';
    }

    // ── URL hash for sharing ───────────────────────────────────────────

    function updateHash(input) {
        if (history.replaceState) {
            history.replaceState(null, '', '#' + encodeURIComponent(input));
        }
    }

    function loadFromHash() {
        var hash = window.location.hash;
        if (hash && hash.length > 1) {
            var input = decodeURIComponent(hash.substring(1));
            posInput.value = input;
            convert(input);
        }
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

    convertBtn.addEventListener('click', function () {
        convert(posInput.value);
    });

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

    xgpDropZone.addEventListener('click', function (e) {
        if (e.target === xgpFileInput) return;
        xgpFileInput.click();
    });

    xgpFileInput.addEventListener('change', function (e) {
        if (e.target.files.length > 0) {
            processXgpFile(e.target.files[0]);
        }
    });

    xgpDropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        xgpDropZone.classList.add('xgp-upload--active');
    });

    xgpDropZone.addEventListener('dragleave', function () {
        xgpDropZone.classList.remove('xgp-upload--active');
    });

    xgpDropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        xgpDropZone.classList.remove('xgp-upload--active');

        if (e.dataTransfer.files.length > 1) {
            showError('Please upload one .xgp position file at a time.');
        } else if (e.dataTransfer.files.length === 1) {
            processXgpFile(e.dataTransfer.files[0]);
        }
    });

    // Prevent the browser from navigating away when a file is dropped outside
    // the highlighted upload target.
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) { e.preventDefault(); });

    resetBtn.addEventListener('click', function () {
        currentPosition = null;
        currentMetadata = null;
        currentFormat = null;
        currentImageFilename = 'backgammon-position.png';
        colorsSwapped = false;
        imageActionStatus.textContent = '';
        imageActionStatus.hidden = true;
        posInput.value = '';
        xgpFileInput.value = '';
        if (history.replaceState) {
            history.replaceState(null, '', window.location.pathname);
        }
        setState('idle');
        posInput.focus();
    });

    errorRetry.addEventListener('click', function () {
        xgpFileInput.value = '';
        setState('idle');
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

    setState('idle');
    loadFromHash();
})();
