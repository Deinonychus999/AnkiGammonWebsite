/**
 * Position ID Converter — UI Controller
 *
 * Handles text input, orchestrates PositionParser and BoardRenderer,
 * and manages the UI state machine:
 *   IDLE ↔ RESULT | ERROR
 */
(function () {
    'use strict';

    // ── DOM references ─────────────────────────────────────────────────
    var inputArea    = document.getElementById('input-area');
    var posInput     = document.getElementById('position-input');
    var convertBtn   = document.getElementById('convert-btn');
    var errorDisplay = document.getElementById('error-display');
    var errorMessage = document.getElementById('error-message');
    var results      = document.getElementById('results');
    var boardContainer = document.getElementById('board-container');
    var onRollIndicator = document.getElementById('on-roll-indicator');
    var xgidOutput   = document.getElementById('xgid-output');
    var gnuidOutput  = document.getElementById('gnuid-output');
    var ogidOutput   = document.getElementById('ogid-output');
    var schemeSelect = document.getElementById('scheme-select');
    var resetBtn     = document.getElementById('reset-btn');
    var errorRetry   = document.getElementById('error-retry');

    var swapColorsBtn = document.getElementById('swap-colors-btn');
    var copyImageBtn  = document.getElementById('copy-image-btn');

    var currentPosition = null;
    var currentMetadata = null;
    var currentFormat = null;
    var colorsSwapped = false;

    // ── State management ───────────────────────────────────────────────

    function setState(state) {
        inputArea.hidden    = state !== 'idle';
        errorDisplay.hidden = state !== 'error';
        results.hidden      = state !== 'result';
    }

    function showError(message) {
        errorMessage.textContent = message;
        setState('error');
    }

    // ── Core conversion ────────────────────────────────────────────────

    function convert(input) {
        if (!input.trim()) {
            showError('Please paste a position ID.');
            return;
        }

        try {
            var result = window.PositionParser.parse(input);
            currentPosition = result.position;
            currentMetadata = result.metadata;
            currentFormat = result.format;

            // Encode all three formats
            xgidOutput.textContent  = window.PositionParser.encodeXGID(currentPosition, currentMetadata);
            gnuidOutput.textContent = window.PositionParser.encodeGNUID(currentPosition, currentMetadata);
            ogidOutput.textContent  = window.PositionParser.encodeOGID(currentPosition, currentMetadata);

            // Render board
            renderBoard();

            // Update on-roll indicator
            updateOnRoll();

            // Update URL hash for sharing
            updateHash(input.trim());

            setState('result');
        } catch (err) {
            console.error('Position parsing error:', err);
            showError(err.message);
        }
    }

    function renderBoard() {
        var scheme = schemeSelect.value;
        var svg = window.BoardRenderer.render(currentPosition, currentMetadata, scheme, colorsSwapped);
        boardContainer.innerHTML = svg;
    }

    function updateOnRoll() {
        if (!currentMetadata) { onRollIndicator.innerHTML = ''; return; }
        var scheme = window.BoardRenderer.SCHEMES[schemeSelect.value] || window.BoardRenderer.SCHEMES.classic;
        // XGID/GNUID: on-roll player's checkers always map to positive (X)
        // OGID: mapping is absolute, so use the onRoll flag
        var useX = (currentFormat === 'ogid')
            ? currentMetadata.onRoll === 'X'
            : currentMetadata.onRoll !== 'X';
        if (colorsSwapped) useX = !useX;
        var fill = useX ? scheme.checkerX : scheme.checkerO;
        var border = scheme.checkerBorder;
        onRollIndicator.innerHTML = 'On Roll ' +
            '<svg width="14" height="14" style="vertical-align:middle">' +
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

    resetBtn.addEventListener('click', function () {
        currentPosition = null;
        currentMetadata = null;
        currentFormat = null;
        colorsSwapped = false;
        posInput.value = '';
        if (history.replaceState) {
            history.replaceState(null, '', window.location.pathname);
        }
        setState('idle');
        posInput.focus();
    });

    errorRetry.addEventListener('click', function () {
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

    // Copy board as image
    copyImageBtn.addEventListener('click', function () {
        var btn = copyImageBtn;
        var svgEl = boardContainer.querySelector('svg');
        if (!svgEl) return;

        var originalText = btn.textContent;
        var clone = svgEl.cloneNode(true);
        clone.setAttribute('width', '1760');
        clone.setAttribute('height', '1200');

        var svgData = new XMLSerializer().serializeToString(clone);
        var svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        var url = URL.createObjectURL(svgBlob);

        var img = new Image();
        img.onload = function () {
            var canvas = document.createElement('canvas');
            canvas.width = 1760;
            canvas.height = 1200;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 1760, 1200);
            URL.revokeObjectURL(url);

            canvas.toBlob(function (blob) {
                if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
                    navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]).then(function () {
                        btn.textContent = 'Copied!';
                        setTimeout(function () { btn.textContent = originalText; }, 2000);
                    }).catch(function () {
                        btn.textContent = 'Failed';
                        setTimeout(function () { btn.textContent = originalText; }, 2000);
                    });
                } else {
                    btn.textContent = 'Not supported';
                    setTimeout(function () { btn.textContent = originalText; }, 2000);
                }
            }, 'image/png');
        };
        img.onerror = function () {
            URL.revokeObjectURL(url);
            btn.textContent = 'Failed';
            setTimeout(function () { btn.textContent = originalText; }, 2000);
        };
        img.src = url;
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
    } catch (e) {}

    setState('idle');
    loadFromHash();
})();
