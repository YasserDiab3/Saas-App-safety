/**
 * saas-device-track.js — report device/session metadata after login (IP/geo via edge function).
 * Browsers cannot expose MAC addresses; we use a stable device_id in localStorage instead.
 */
(function (global) {
    const STORAGE_KEY = 'hse_device_id';
    const LAST_REPORT_KEY = 'hse_device_report_at';
    const MIN_INTERVAL_MS = 15 * 60 * 1000;

    function uuid() {
        if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function deviceId() {
        try {
            let id = localStorage.getItem(STORAGE_KEY);
            if (!id) {
                id = uuid();
                localStorage.setItem(STORAGE_KEY, id);
            }
            return id;
        } catch (_e) {
            return uuid();
        }
    }

    function detectPlatform(ua) {
        const s = ua.toLowerCase();
        if (/iphone|ipad|ipod/.test(s)) return 'iOS';
        if (/android/.test(s)) return 'Android';
        if (/windows/.test(s)) return 'Windows';
        if (/mac os|macintosh/.test(s)) return 'macOS';
        if (/linux/.test(s)) return 'Linux';
        return 'Unknown';
    }

    function detectBrowser(ua) {
        const s = ua;
        if (/Edg\//.test(s)) return 'Edge';
        if (/OPR\//.test(s) || /Opera/.test(s)) return 'Opera';
        if (/Chrome\//.test(s) && !/Edg\//.test(s)) return 'Chrome';
        if (/Safari\//.test(s) && !/Chrome\//.test(s)) return 'Safari';
        if (/Firefox\//.test(s)) return 'Firefox';
        return 'Unknown';
    }

    function detectDeviceType(ua) {
        const s = ua.toLowerCase();
        if (/ipad|tablet/.test(s)) return 'tablet';
        if (/mobile|iphone|ipod|android/.test(s) && !/ipad/.test(s)) return 'mobile';
        return 'desktop';
    }

    function deviceLabel(ua) {
        return detectBrowser(ua) + ' · ' + detectPlatform(ua);
    }

    function shouldReport() {
        try {
            const last = Number(localStorage.getItem(LAST_REPORT_KEY) || 0);
            return !last || (Date.now() - last) >= MIN_INTERVAL_MS;
        } catch (_e) {
            return true;
        }
    }

    function markReported() {
        try { localStorage.setItem(LAST_REPORT_KEY, String(Date.now())); } catch (_e) { /* ignore */ }
    }

    async function tryGpsCoords() {
        if (!navigator.geolocation) return null;
        try {
            if (navigator.permissions && navigator.permissions.query) {
                const perm = await navigator.permissions.query({ name: 'geolocation' });
                if (perm && perm.state !== 'granted') return null;
            }
        } catch (_e) { /* ignore */ }

        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    geo_source: 'gps'
                }),
                () => resolve(null),
                { timeout: 4000, maximumAge: 600000, enableHighAccuracy: false }
            );
        });
    }

    async function report(opts) {
        const SaaS = global.SaaS;
        const CFG = global.SAAS_CONFIG || {};
        if (!SaaS || !CFG.supabaseUrl || !CFG.supabaseAnonKey) return;

        await SaaS.ready;
        const session = await SaaS.getSession();
        if (!session || !session.access_token) return;

        if (!opts || !opts.force) {
            if (!shouldReport()) return;
        }

        const ua = (navigator && navigator.userAgent) ? String(navigator.userAgent) : '';
        const payload = {
            device_id: deviceId(),
            device_label: deviceLabel(ua),
            user_agent: ua.substring(0, 500),
            platform: detectPlatform(ua),
            browser: detectBrowser(ua),
            device_type: detectDeviceType(ua),
            screen_size: (global.screen ? (screen.width + 'x' + screen.height) : ''),
            language: (navigator && navigator.language) ? String(navigator.language) : '',
            timezone: (Intl.DateTimeFormat && Intl.DateTimeFormat().resolvedOptions().timeZone) || '',
            page_url: (global.location && location.href) ? String(location.href).substring(0, 500) : ''
        };

        const gps = await tryGpsCoords();
        if (gps) {
            payload.latitude = gps.latitude;
            payload.longitude = gps.longitude;
            payload.geo_source = gps.geo_source;
        }

        const url = CFG.supabaseUrl.replace(/\/$/, '') + '/functions/v1/device-session';
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + session.access_token,
                    apikey: CFG.supabaseAnonKey
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) markReported();
        } catch (_e) { /* silent — non-critical telemetry */ }
    }

    function bind() {
        document.addEventListener('loginSuccess', () => report({ force: true }));
        global.SaaS.ready.then(() => {
            if (global.SaaSAuthStorage && global.SAAS_CONFIG &&
                global.SaaSAuthStorage.hasSession(global.SAAS_CONFIG)) {
                report({ force: false });
            }
        });
    }

    global.SaaSDeviceTrack = { report, deviceId, bind };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
})(window);
