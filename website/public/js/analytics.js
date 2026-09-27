/**
 * Anonymous usage counts through PostHog in cookieless mode: nothing is
 * stored in the browser, no one is identified, and nothing is sent until
 * POSTHOG_KEY is set. Pages report named events through
 * window.agTrack(name, props), which is a no-op when tracking is off.
 * Props carry counts and kinds only, never file contents or deck names.
 */
(function () {
    'use strict';

    var POSTHOG_KEY = 'phc_MjfUXfepPQXXQuY72KITRlGiG4jAHZuvgFHas1b34pV';
    var POSTHOG_HOST = 'https://us.i.posthog.com';

    var queue = [];
    var client = null;
    window.agTrack = function (name, props) {
        if (client) client.capture(name, props || {}, { send_instantly: true });
        else if (queue) queue.push([name, props || {}]);
    };

    var host = location.hostname;
    var optedOut = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
    if (!POSTHOG_KEY || optedOut || host === 'localhost' || host === '127.0.0.1') {
        queue = null;
        return;
    }

    // The trainer's #desktop=<port>.<key> handoff link and any query string
    // stay out of the recorded URLs.
    function bare(url) {
        return typeof url === 'string' ? url.split(/[?#]/)[0] : url;
    }

    var script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = POSTHOG_HOST.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
    script.onload = function () {
        if (!window.posthog || typeof window.posthog.init !== 'function') return;
        window.posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            cookieless_mode: 'always',
            person_profiles: 'identified_only',
            autocapture: false,
            capture_pageview: true,
            capture_pageleave: false,
            capture_performance: false,
            capture_heatmaps: false,
            capture_dead_clicks: false,
            rageclick: false,
            disable_session_recording: true,
            disable_surveys: true,
            advanced_disable_feature_flags: true,
            disable_external_dependency_loading: true,
            before_send: function (event) {
                var p = event && event.properties;
                if (p) {
                    p.$current_url = bare(p.$current_url);
                    p.$referrer = bare(p.$referrer);
                    p.$initial_referrer = bare(p.$initial_referrer);
                }
                return event;
            },
            loaded: function (ph) {
                client = ph;
                (queue || []).forEach(function (e) { ph.capture(e[0], e[1]); });
                queue = null;
            }
        });
    };
    document.head.appendChild(script);
})();
