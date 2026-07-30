/**
 * saas-device-track.js — report device/session metadata after login (IP/geo via edge function).
 * Browsers cannot expose MAC addresses; we use a stable device_id in localStorage instead.
 *
 * This telemetry is security-essential for platform admins (session/device audit)
 * and reports for authenticated users regardless of marketing/functional cookie prefs.
 */
(function (global) {
    const STORAGE_KEY = 'hse_device_id';
    const LAST_REPORT_KEY = 'hse_device_report_at';
    const MIN_INTERVAL_MS = 5 * 60 * 1000;
    let _inflight = null;
    let _bound = false;

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
                { timeout: 2500, maximumAge: 600000, enableHighAccuracy: false }
            );
        });
    }

    async function postPayload(session, payload) {
        const SaaS = global.SaaS;
        const CFG = global.SAAS_CONFIG || {};
        const client = SaaS && typeof SaaS.client === 'function' ? SaaS.client() : null;

        // Prefer supabase-js invoke (handles auth headers consistently)
        if (client && client.functions && typeof client.functions.invoke === 'function') {
            const { data, error } = await client.functions.invoke('device-session', { body: payload });
            if (!error) return { ok: true, data };
            // Fall through to raw fetch for clearer CORS/status diagnostics
        }

        const url = String(CFG.supabaseUrl || '').replace(/\/$/, '') + '/functions/v1/device-session';
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + session.access_token,
                apikey: CFG.supabaseAnonKey || ''
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            let detail = '';
            try { detail = await res.text(); } catch (_e) { /* ignore */ }
            const err = new Error('device-session HTTP ' + res.status + (detail ? (': ' + detail) : ''));
            err.status = res.status;
            throw err;
        }
        try {
            return { ok: true, data: await res.json() };
        } catch (_e) {
            return { ok: true, data: null };
        }
    }

    async function report(opts) {
        const SaaS = global.SaaS;
        const CFG = global.SAAS_CONFIG || {};
        if (!SaaS || !CFG.supabaseUrl || !CFG.supabaseAnonKey) return false;

        try {
            if (SaaS.ready && typeof SaaS.ready.then === 'function') await SaaS.ready;
        } catch (_e) { /* continue */ }

        const session = await SaaS.getSession();
        if (!session || !session.access_token) return false;

        if (!opts || !opts.force) {
            if (!shouldReport()) return false;
        }

        if (_inflight) return _inflight;

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

        _inflight = (async () => {
            try {
                // Don't block heartbeat on GPS permission prompts
                const gpsPromise = tryGpsCoords();
                const gps = await Promise.race([
                    gpsPromise,
                    new Promise((resolve) => setTimeout(() => resolve(null), 2800))
                ]);
                if (gps) {
                    payload.latitude = gps.latitude;
                    payload.longitude = gps.longitude;
                    payload.geo_source = gps.geo_source;
                }

                await postPayload(session, payload);
                markReported();
                return true;
            } catch (e) {
                if (typeof Utils !== 'undefined' && Utils.safeWarn) {
                    Utils.safeWarn('device-session report error', e && (e.message || e));
                }
                return false;
            } finally {
                _inflight = null;
            }
        })();

        return _inflight;
    }

    function schedule(force) {
        try {
            report({ force: !!force });
        } catch (_e) { /* ignore */ }
    }

    function bind() {
        if (_bound) return;
        _bound = true;
        document.addEventListener('loginSuccess', () => schedule(true));
        document.addEventListener('app:ready', () => schedule(true));
        if (global.SaaS && global.SaaS.ready && typeof global.SaaS.ready.then === 'function') {
            global.SaaS.ready.then(() => schedule(false)).catch(() => { /* ignore */ });
        } else {
            setTimeout(() => schedule(false), 1500);
        }
        global.addEventListener('focus', () => schedule(false));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') schedule(false);
        });
        global.addEventListener('online', () => schedule(true));
        // Periodic heartbeat while the tab stays open
        setInterval(() => schedule(false), MIN_INTERVAL_MS);
    }

    global.SaaSDeviceTrack = { report, deviceId, bind };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
})(window);
