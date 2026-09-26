/**
 * Offline support for the trainer. The page and its files are served from
 * the cache and refreshed in the background, so a change reaches the
 * installed app on its second launch. Deck and catalog requests to the decks
 * API go straight to the network; the trainer keeps decks in IndexedDB.
 */
var CACHE = 'ankigammon-trainer-v1';

var SHELL = [
    './',
    'manifest.webmanifest',
    '../css/reset.css',
    '../css/variables.css',
    '../css/base.css',
    '../css/layout.css',
    '../css/components.css',
    '../css/responsive.css',
    '../css/tool.css',
    '../css/app.css',
    '../css/train.css',
    '../js/position-parser.js',
    '../js/board-renderer.js',
    '../js/apkg-reader.js',
    '../js/vendor/ts-fsrs.umd.js',
    '../js/train-deck.js',
    '../js/train-store.js',
    '../js/train-app.js',
    '../assets/images/icon.webp',
    '../assets/images/icon.png',
    '../assets/images/icon-192.png'
];

// The .apkg importer's libraries, cached the first time they are used.
var CDN_HOSTS = ['unpkg.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', function (event) {
    event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(SHELL); }));
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }));
});

function cacheable(url) {
    if (url.origin === self.location.origin) return /^\/(train|css|js|assets)\//.test(url.pathname);
    return CDN_HOSTS.indexOf(url.host) >= 0;
}

self.addEventListener('fetch', function (event) {
    var request = event.request;
    if (request.method !== 'GET') return;
    var url = new URL(request.url);
    if (!cacheable(url)) return;
    event.respondWith(caches.open(CACHE).then(function (cache) {
        return cache.match(request, { ignoreSearch: true }).then(function (hit) {
            var fresh = fetch(request).then(function (response) {
                if (response.ok) cache.put(request, response.clone());
                return response;
            });
            if (!hit) return fresh;
            event.waitUntil(fresh.catch(function () {}));
            return hit;
        });
    }));
});
