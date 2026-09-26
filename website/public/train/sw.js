/**
 * Offline support for the trainer. Its own page, scripts and styles come
 * from the network when it answers, revalidated so they are never older than
 * the web app page that hands the trainer decks (a cached trainer once got a
 * handoff format it did not know). The cache answers when offline or when
 * the network is too slow. The .apkg importer's CDN libraries have
 * versioned URLs, so they are served from the cache first. Deck and catalog
 * requests to the decks API go straight to the network; the trainer keeps
 * decks in IndexedDB.
 */
var CACHE = 'ankigammon-trainer-v2';
var NETWORK_TIMEOUT_MS = 4000;

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

function ownFile(url) {
    return url.origin === self.location.origin && /^\/(train|css|js|assets)\//.test(url.pathname);
}

// The page asks for its files with a ?v= content hash; the cache keeps one
// copy per file, stored without it.
function cacheKey(url) {
    return url.origin + url.pathname;
}

function networkFirst(request, url) {
    return caches.open(CACHE).then(function (cache) {
        // By URL: a navigation Request can't be copied with new options.
        var network = fetch(request.url, { cache: 'no-cache' }).then(function (response) {
            if (response.ok) cache.put(cacheKey(url), response.clone());
            return response;
        });
        network.catch(function () {});
        var timeout = new Promise(function (resolve) { setTimeout(resolve, NETWORK_TIMEOUT_MS); });
        var cached = function () { return cache.match(cacheKey(url)); };
        return Promise.race([network, timeout.then(cached)]).then(function (response) {
            return response || network;
        }).catch(function () {
            return cached().then(function (hit) { return hit || Promise.reject(new Error('offline')); });
        });
    });
}

function cacheFirst(request) {
    return caches.open(CACHE).then(function (cache) {
        return cache.match(request).then(function (hit) {
            return hit || fetch(request).then(function (response) {
                // <script> loads are no-cors, so their responses are opaque (status 0).
                if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
                return response;
            });
        });
    });
}

self.addEventListener('fetch', function (event) {
    var request = event.request;
    if (request.method !== 'GET') return;
    var url = new URL(request.url);
    if (ownFile(url)) event.respondWith(networkFirst(request, url));
    else if (CDN_HOSTS.indexOf(url.host) >= 0) event.respondWith(cacheFirst(request));
});
