/**
 * HedgeHog (hedgehog-bg.com) from the browser app: connecting the user's
 * account and running analyses on it. The contract is docs/PARTNER_API.md in
 * gitlab.com/eranlambooij/hedgehog-public; the desktop app's
 * ankigammon/utils/hedgehog_client.py is the same client in Python.
 *
 * Connecting opens HedgeHog in a popup that comes back to /app/ with a code,
 * so the page (and the file it has loaded) never reloads. The refresh token
 * stays in localStorage so the user connects once; HedgeHog rotates it on
 * every use and ends the connection after 30 days unused.
 */
(function () {
    'use strict';

    var BASE = 'https://hedgehog-bg.com';
    var CLIENT_ID = 'https://ankigammon.com/oauth/client.json';
    var STORE_KEY = 'ankigammon-hedgehog-v1';
    var CALLBACK = 'ag-hedgehog-callback';
    var CONNECT_TIMEOUT_MS = 5 * 60 * 1000;
    var PRESET_LABELS = { '1ply': '2-ply', '2ply': '3-ply', '3ply': '4-ply', '+': '+', '++': '++' };

    function redirectUri() {
        // Registered in /oauth/client.json; on 127.0.0.1 HedgeHog ignores the port.
        return location.origin + '/app/';
    }

    // ── Errors ─────────────────────────────────────────────────────────

    // `message` is written by HedgeHog for the user; its Developer Terms
    // require showing it as returned. A 5xx answer carries none.
    function Refusal(code, message, status, body) {
        var error = new Error(message);
        error.name = 'HedgehogRefusal';
        error.code = code;
        error.status = status || 0;
        error.body = body || {};
        return error;
    }

    function notConnected() {
        return Refusal('not_connected', 'Connect your HedgeHog account in Card options to analyze this.');
    }

    function refusalFrom(status, body) {
        body = body || {};
        if (status >= 500) {
            return Refusal('server_error', 'HedgeHog had a problem on its side (HTTP ' + status +
                '). Try again later, and tell HedgeHog if it keeps happening with this file.', status);
        }
        var message = body.message || body.error_description || ('HedgeHog answered HTTP ' + status + '.');
        if (body.error === 'invalid_match' && body.detail) message += ' ' + body.detail;
        return Refusal(body.error || ('http_' + status), message, status, body);
    }

    // ── Stored tokens ──────────────────────────────────────────────────

    function stored() {
        try {
            var tokens = JSON.parse(localStorage.getItem(STORE_KEY));
            return tokens && tokens.refresh_token ? tokens : null;
        } catch (e) { return null; }
    }

    function remember(tokens) {
        var record = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            // A margin keeps a request from arriving just after expiry.
            expires_at: Date.now() + Math.max(0, (tokens.expires_in || 900) - 30) * 1000
        };
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(record));
        } catch (e) {
            throw storageBlocked();
        }
        return record;
    }

    function storageBlocked() {
        return Refusal('storage_blocked', 'This browser blocks site storage for this page, which the HedgeHog ' +
            'connection needs. Allow site data (or leave private browsing), then connect again.');
    }

    function storageWorks() {
        try {
            localStorage.setItem('ankigammon-storage-probe', '1');
            localStorage.removeItem('ankigammon-storage-probe');
            return true;
        } catch (e) { return false; }
    }

    function forget() {
        try { localStorage.removeItem(STORE_KEY); } catch (e) { /* storage blocked */ }
    }

    function isConnected() {
        return !!stored();
    }

    // ── Token endpoint ─────────────────────────────────────────────────

    function tokenRequest(path, form) {
        // A form body keeps it a CORS simple request.
        return fetch(BASE + path, { method: 'POST', body: new URLSearchParams(form) }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (body) {
                if (!r.ok) throw refusalFrom(r.status, body);
                return body;
            });
        }, function () {
            throw Refusal('unreachable', 'Could not reach HedgeHog. Check your internet connection and try again.');
        });
    }

    // Two refreshes of one refresh token revoke the whole connection, so every
    // tab refreshes under one lock and re-reads the pair inside it.
    function withRefreshLock(task) {
        if (navigator.locks && navigator.locks.request) {
            return navigator.locks.request('ankigammon-hedgehog-refresh', task);
        }
        return task();
    }

    function refresh(staleAccessToken) {
        return withRefreshLock(function () {
            var current = stored();
            if (!current) throw notConnected();
            if (current.access_token !== staleAccessToken && current.expires_at > Date.now()) {
                return current.access_token;  // another tab already rotated it
            }
            return tokenRequest('/api/v1/oauth/token', {
                grant_type: 'refresh_token', refresh_token: current.refresh_token, client_id: CLIENT_ID
            }).then(function (tokens) {
                return remember(tokens).access_token;
            }, function (error) {
                if (error.code === 'invalid_grant') {
                    forget();
                    throw Refusal('not_connected',
                        'Your HedgeHog connection has ended. Connect your account again in Card options.');
                }
                throw error;
            });
        });
    }

    function accessToken() {
        var current = stored();
        if (!current) return Promise.reject(notConnected());
        if (current.access_token && current.expires_at > Date.now()) return Promise.resolve(current.access_token);
        return refresh(current.access_token);
    }

    // ── API ────────────────────────────────────────────────────────────

    function api(method, path, options) {
        options = options || {};
        return accessToken().then(function (token) {
            return send(token).then(function (r) {
                if (r.status !== 401) return r;
                return r.clone().json().catch(function () { return {}; }).then(function (body) {
                    if (body.error !== 'invalid_token') return r;
                    return refresh(token).then(send);
                });
            });
        }).then(function (r) {
            if (options.binary && r.ok) return r.arrayBuffer();
            return r.json().catch(function () { return {}; }).then(function (body) {
                if (!r.ok) throw refusalFrom(r.status, body);
                return body;
            });
        });

        function send(token) {
            var headers = { Authorization: 'Bearer ' + token };
            var body;
            if (options.json !== undefined) {
                headers['Content-Type'] = 'application/json';
                body = JSON.stringify(options.json);
            } else if (options.bytes !== undefined) {
                headers['Content-Type'] = 'application/octet-stream';
                body = options.bytes;
            }
            return fetch(BASE + path, { method: method, headers: headers, body: body, signal: options.signal })
                .catch(function (e) {
                    if (e && e.name === 'AbortError') throw e;
                    throw Refusal('unreachable', 'Could not reach HedgeHog. Check your internet connection and try again.');
                });
        }
    }

    function me() {
        return api('GET', '/api/v1/oauth/me');
    }

    function disconnect() {
        var current = stored();
        forget();
        if (!current) return Promise.resolve();
        return tokenRequest('/api/v1/oauth/revoke', {
            token: current.refresh_token, client_id: CLIENT_ID, token_type_hint: 'refresh_token'
        }).catch(function () { /* the local connection is gone either way */ });
    }

    // ── Connecting ─────────────────────────────────────────────────────

    function base64url(bytes) {
        var text = '';
        new Uint8Array(bytes).forEach(function (b) { text += String.fromCharCode(b); });
        return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function randomString(size) {
        return base64url(crypto.getRandomValues(new Uint8Array(size)));
    }

    // HedgeHog's pages send Cross-Origin-Opener-Policy: same-origin, which
    // cuts the popup off from this page for good once it visits HedgeHog:
    // window.opener is gone when it comes back, and popup.closed reads true.
    // So the reply travels through same-origin storage instead: the pending
    // attempt is recorded here, and the page HedgeHog returns to broadcasts it.
    var PENDING_KEY = 'ankigammon-hedgehog-pending';
    var REPLY_KEY = 'ankigammon-hedgehog-reply';
    var cancelWaiting = null;

    function connect() {
        if (!storageWorks()) return Promise.reject(storageBlocked());
        var verifier = randomString(48);
        var state = randomString(18);
        // Opened before any await, or the browser treats it as an unrequested popup.
        var popup = window.open('about:blank', 'ag-hedgehog', 'popup,width=520,height=720');
        if (!popup) {
            return Promise.reject(Refusal('popup_blocked',
                'Your browser blocked the HedgeHog window. Allow pop-ups for this site, then connect again.'));
        }
        localStorage.setItem(PENDING_KEY, JSON.stringify({ state: state, at: Date.now() }));
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then(function (digest) {
            popup.location.href = BASE + '/oauth/authorize?' + new URLSearchParams({
                response_type: 'code', client_id: CLIENT_ID, redirect_uri: redirectUri(),
                scope: 'analyze', state: state, code_challenge: base64url(digest), code_challenge_method: 'S256'
            });
            return waitForReply(state);
        }).then(function (params) {
            return tokenRequest('/api/v1/oauth/token', {
                grant_type: 'authorization_code', code: params.code, redirect_uri: redirectUri(),
                client_id: CLIENT_ID, code_verifier: verifier
            });
        }).then(function (tokens) {
            remember(tokens);
            return me();
        });
    }

    function cancelConnect() {
        if (cancelWaiting) cancelWaiting();
    }

    function waitForReply(state) {
        return new Promise(function (resolve, reject) {
            var channel = window.BroadcastChannel ? new BroadcastChannel(CALLBACK) : null;
            var timeout = setTimeout(function () {
                finish(Refusal('timeout', 'HedgeHog did not send an approval. If its window shows an error, try again later.'));
            }, CONNECT_TIMEOUT_MS);

            function receive(params) {
                if (!params || params.state !== state || params.iss !== BASE) return;  // not this request's reply
                if (params.error) {
                    finish(Refusal(params.error, params.error === 'access_denied'
                        ? 'You did not approve AnkiGammon on HedgeHog.'
                        : (params.error_description || 'HedgeHog refused: ' + params.error + '.')));
                } else {
                    finish(null, params);
                }
            }
            function onChannel(e) { receive(e.data); }
            function onStorage(e) {
                if (e.key !== REPLY_KEY || !e.newValue) return;
                try { receive(JSON.parse(e.newValue)); } catch (err) { /* not ours */ }
            }

            function finish(error, params) {
                clearTimeout(timeout);
                cancelWaiting = null;
                if (channel) channel.close();
                window.removeEventListener('storage', onStorage);
                try { localStorage.removeItem(PENDING_KEY); } catch (e) { /* storage blocked */ }
                if (error) reject(error); else resolve(params);
            }

            cancelWaiting = function () {
                finish(Refusal('cancelled', 'Connecting to HedgeHog was cancelled.'));
            };
            if (channel) channel.onmessage = onChannel;
            window.addEventListener('storage', onStorage);
        });
    }

    // Runs first thing on /app/. In the window HedgeHog sent back to, it passes
    // the reply to the page that is waiting and closes, so that window never
    // starts the app. Elsewhere it only takes the reply out of the address bar.
    function handleCallback() {
        var query = new URLSearchParams(location.search);
        if (!query.has('state') || !(query.has('code') || query.has('error'))) return false;
        var params = {};
        query.forEach(function (value, key) { params[key] = value; });
        history.replaceState(null, '', location.pathname + location.hash);
        var pending = null;
        try { pending = JSON.parse(localStorage.getItem(PENDING_KEY)); } catch (e) { pending = null; }
        if (!pending || pending.state !== params.state) return false;
        if (window.BroadcastChannel) {
            var channel = new BroadcastChannel(CALLBACK);
            channel.postMessage(params);
            channel.close();
        }
        try {
            localStorage.setItem(REPLY_KEY, JSON.stringify(params));
            localStorage.removeItem(REPLY_KEY);
        } catch (e) { /* the channel carried it */ }
        window.close();
        // A browser that keeps the window open gets a plain page instead of the app.
        setTimeout(function () {
            document.title = 'AnkiGammon';
            document.body.innerHTML = '<main style="font:16px system-ui,sans-serif;padding:3rem 1.5rem;text-align:center">' +
                '<p>' + (params.error ? 'AnkiGammon was not connected.' : 'Connected to HedgeHog.') + '</p>' +
                '<p>You can close this window and go back to AnkiGammon.</p></main>';
        }, 300);
        return true;
    }

    // ── Analyses ───────────────────────────────────────────────────────

    function sleep(ms, signal) {
        return new Promise(function (resolve, reject) {
            if (signal && signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
            var timer = setTimeout(resolve, ms);
            if (signal) signal.addEventListener('abort', function () {
                clearTimeout(timer);
                reject(new DOMException('Cancelled', 'AbortError'));
            }, { once: true });
        });
    }

    function failure(error, fallback) {
        error = error || {};
        return Refusal(error.error || 'analysis_failed', error.message || fallback);
    }

    // Batches come from web.position_requests or web.matrix_requests; the
    // answers come back in input order for the matching web.apply_* call. A
    // refused batch stops the run, but the answers already paid for are kept:
    // the positions not analyzed carry HedgeHog's refusal instead.
    function analyzePositions(batches, preset, onProgress, signal) {
        var total = batches.reduce(function (n, b) { return n + b.indices.length; }, 0);
        var results = new Array(total);
        var done = 0;
        var refusal = null;
        return batches.reduce(function (chain, batch) {
            return chain.then(function () {
                if (refusal) return null;
                return api('POST', '/api/v1/analyze/positions', {
                    json: { ogids: batch.ogids, preset: preset, jacoby: batch.jacoby }, signal: signal
                }).then(function (job) {
                    return poll(job.job_id);
                }).then(function (answer) {
                    if (!answer.results || answer.results.length !== batch.indices.length) {
                        throw Refusal('bad_answer', 'HedgeHog returned an incomplete answer; try again.');
                    }
                    answer.results.forEach(function (result, i) { results[batch.indices[i]] = result; });
                    done += batch.indices.length;
                    if (onProgress) onProgress(done, total);
                }).catch(function (error) {
                    if (error && error.name === 'AbortError') throw error;
                    refusal = error;
                });
            });
        }, Promise.resolve()).then(function () {
            if (refusal && !done) throw refusal;
            for (var i = 0; i < total; i++) {
                if (!results[i]) results[i] = { success: false, error: { error: refusal.code, message: refusal.message } };
            }
            return results;
        });

        function poll(jobId) {
            return api('GET', '/api/v1/analyze/position/' + jobId, { signal: signal }).then(function (answer) {
                if (answer.status === 'completed') return answer.result;
                if (answer.status === 'failed') throw failure(answer.error, 'HedgeHog could not analyze these positions.');
                return sleep(500, signal).then(function () { return poll(jobId); });
            });
        }
    }

    // A match file in; HedgeHog's .ogxm analysis of it out, with the model name.
    function analyzeMatch(bytes, kind, preset, onStatus, signal) {
        var status = onStatus || function () {};
        status('sending');
        return api('POST', '/api/v1/matches/import/' + kind, { bytes: bytes, signal: signal }).then(function (converted) {
            return api('POST', '/api/v1/matches/save', { json: converted.data, signal: signal });
        }).then(function (saved) {
            status('analyzing');
            return api('POST', '/api/v1/analyze', {
                json: { match_id: saved.match_id, preset: preset, notify: false }, signal: signal
            }).catch(function (error) {
                // One analysis runs per match at a time; follow the running one.
                if (error.code === 'already_analysing' && error.body) return error.body;
                throw error;
            });
        }).then(function (job) {
            return waitForAnalysis(job.analysis_id);
        }).then(function (analysis) {
            status('downloading');
            return api('GET', '/api/v1/analysis/' + analysis.id + '/ogxm', { binary: true, signal: signal })
                .then(function (data) {
                    return { bytes: data, modelName: analysis.model_name || 'HedgeHog' };
                });
        });

        function waitForAnalysis(id) {
            return api('GET', '/api/v1/analysis/' + id, { signal: signal }).then(function (analysis) {
                if (analysis.status === 'completed') return analysis;
                if (analysis.status === 'failed' || analysis.status === 'cancelled') {
                    throw failure(analysis.error, 'The HedgeHog analysis was ' + analysis.status + '.');
                }
                return sleep(5000, signal).then(function () { return waitForAnalysis(id); });
            });
        }
    }

    window.AgHedgeHog = {
        PRESET_LABELS: PRESET_LABELS,
        handleCallback: handleCallback,
        isConnected: isConnected,
        connect: connect,
        cancelConnect: cancelConnect,
        disconnect: disconnect,
        me: me,
        analyzePositions: analyzePositions,
        analyzeMatch: analyzeMatch
    };
})();
