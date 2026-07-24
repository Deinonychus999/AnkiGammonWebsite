/**
 * Backgammon Board Image Exporter
 *
 * Rasterizes a BoardRenderer SVG at 2x resolution (1760 x 1200) and exposes
 * download and clipboard helpers for tool UIs.
 */
(function () {
    'use strict';

    var OUTPUT_WIDTH = 1760;
    var OUTPUT_HEIGHT = 1200;

    function requireSvg(svgElement) {
        if (!svgElement || String(svgElement.tagName).toLowerCase() !== 'svg') {
            throw new Error('No rendered board is available to export');
        }
    }

    function sanitizeFilename(filename) {
        var safe = String(filename || 'backgammon-position.png')
            .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '-')
            .replace(/[. ]+$/g, '')
            .trim();

        if (!safe) safe = 'backgammon-position.png';
        if (!/\.png$/i.test(safe)) safe += '.png';
        return safe;
    }

    function toPngBlob(svgElement) {
        try {
            requireSvg(svgElement);
        } catch (err) {
            return Promise.reject(err);
        }

        return new Promise(function (resolve, reject) {
            var clone = svgElement.cloneNode(true);
            clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            clone.setAttribute('width', String(OUTPUT_WIDTH));
            clone.setAttribute('height', String(OUTPUT_HEIGHT));

            var svgData = new XMLSerializer().serializeToString(clone);
            var svgBlob = new Blob([svgData], {
                type: 'image/svg+xml;charset=utf-8'
            });
            var svgUrl = URL.createObjectURL(svgBlob);
            var image = new Image();
            var cleanedUp = false;

            function cleanup() {
                if (!cleanedUp) {
                    URL.revokeObjectURL(svgUrl);
                    cleanedUp = true;
                }
            }

            image.onload = function () {
                try {
                    var canvas = document.createElement('canvas');
                    canvas.width = OUTPUT_WIDTH;
                    canvas.height = OUTPUT_HEIGHT;
                    var context = canvas.getContext('2d');
                    if (!context) {
                        throw new Error('Your browser could not create the PNG image');
                    }

                    context.drawImage(image, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
                    cleanup();

                    canvas.toBlob(function (blob) {
                        if (!blob) {
                            reject(new Error('Your browser could not create the PNG image'));
                            return;
                        }
                        resolve(blob);
                    }, 'image/png');
                } catch (err) {
                    cleanup();
                    reject(err);
                }
            };

            image.onerror = function () {
                cleanup();
                reject(new Error('The rendered board could not be converted to PNG'));
            };

            image.src = svgUrl;
        });
    }

    function downloadPng(svgElement, filename) {
        return toPngBlob(svgElement).then(function (blob) {
            var pngUrl = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = pngUrl;
            link.download = sanitizeFilename(filename);
            link.hidden = true;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.setTimeout(function () {
                URL.revokeObjectURL(pngUrl);
            }, 0);
            return blob;
        });
    }

    function copyPng(svgElement) {
        if (!navigator.clipboard || !navigator.clipboard.write ||
                typeof ClipboardItem === 'undefined') {
            return Promise.reject(new Error(
                'Copying images is not supported in this browser. Use Download PNG instead.'
            ));
        }

        return toPngBlob(svgElement).then(function (blob) {
            return navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]).then(function () {
                return blob;
            });
        });
    }

    window.BoardImageExporter = {
        toPngBlob: toPngBlob,
        downloadPng: downloadPng,
        copyPng: copyPng,
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT
    };
})();
