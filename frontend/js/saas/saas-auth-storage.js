/**
 * saas-auth-storage.js — persist Supabase auth across iOS Safari / mobile navigations.
 * Writes to localStorage + sessionStorage (sessionStorage survives some iOS restrictions).
 */
(function (global) {
    const SESSION_COOKIE = 'hse_has_session';
    const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

    function projectRef(url) {
        const m = String(url || '').match(/https:\/\/([^.]+)\.supabase\.co/i);
        return m ? m[1] : '';
    }

    function authKey(cfg) {
        const ref = projectRef((cfg || global.SAAS_CONFIG || {}).supabaseUrl);
        return ref ? ('sb-' + ref + '-auth-token') : '';
    }

    function parseToken(raw) {
        if (!raw) return null;
        try {
            const data = JSON.parse(raw);
            if (data && (data.access_token || (data.currentSession && data.currentSession.access_token))) {
                return data;
            }
        } catch (_e) { /* ignore */ }
        return null;
    }

    function tokenExpiresAt(data) {
        if (!data) return 0;
        const exp = data.expires_at
            || (data.currentSession && data.currentSession.expires_at)
            || 0;
        return Number(exp) || 0;
    }

    function isValidToken(data) {
        if (!data) return false;
        const token = data.access_token || (data.currentSession && data.currentSession.access_token);
        if (!token) return false;
        const exp = tokenExpiresAt(data);
        if (exp && exp < Math.floor(Date.now() / 1000) - 30) return false;
        return true;
    }

    function readKey(key) {
        if (!key) return null;
        try {
            const v = parseToken(localStorage.getItem(key));
            if (v) return v;
        } catch (_e) { /* ignore */ }
        try {
            return parseToken(sessionStorage.getItem(key));
        } catch (_e) { /* ignore */ }
        return null;
    }

    const Storage = {
        key(cfg) {
            return authKey(cfg);
        },

        markSessionActive() {
            try {
                const secure = (typeof location !== 'undefined' && location.protocol === 'https:') ? '; Secure' : '';
                document.cookie = SESSION_COOKIE + '=1; path=/; max-age=' + SESSION_COOKIE_MAX_AGE + '; SameSite=Lax' + secure;
            } catch (_e) { /* ignore */ }
        },

        clearSessionCookie() {
            try {
                const secure = (typeof location !== 'undefined' && location.protocol === 'https:') ? '; Secure' : '';
                document.cookie = SESSION_COOKIE + '=; path=/; max-age=0; SameSite=Lax' + secure;
            } catch (_e) { /* ignore */ }
        },

        hasSession(cfg) {
            const key = authKey(cfg);
            const data = readKey(key);
            if (!isValidToken(data)) {
                if (data) this.clearSession(cfg);
                return false;
            }
            this.markSessionActive();
            return true;
        },

        clearSession(cfg) {
            const key = authKey(cfg);
            if (!key) return;
            try { localStorage.removeItem(key); } catch (_e) { /* ignore */ }
            try { sessionStorage.removeItem(key); } catch (_e) { /* ignore */ }
            this.clearSessionCookie();
        },

        readRaw(cfg) {
            const key = authKey(cfg);
            if (!key) return null;
            try {
                return localStorage.getItem(key) || sessionStorage.getItem(key);
            } catch (_e) {
                return null;
            }
        },

        writeRaw(cfg, raw) {
            const key = authKey(cfg);
            if (!key || !raw) return;
            try { localStorage.setItem(key, raw); } catch (_e) { /* ignore */ }
            try { sessionStorage.setItem(key, raw); } catch (_e) { /* ignore */ }
        },

        createAuthStorage(cfg) {
            const key = authKey(cfg);
            const memory = {};
            return {
                getItem(k) {
                    try {
                        const v = localStorage.getItem(k);
                        if (v != null) return v;
                    } catch (_e) { /* ignore */ }
                    try {
                        const v = sessionStorage.getItem(k);
                        if (v != null) return v;
                    } catch (_e) { /* ignore */ }
                    return memory[k] ?? null;
                },
                setItem(k, value) {
                    const s = String(value);
                    try { localStorage.setItem(k, s); } catch (_e) { /* ignore */ }
                    try { sessionStorage.setItem(k, s); } catch (_e) { /* ignore */ }
                    memory[k] = s;
                },
                removeItem(k) {
                    try { localStorage.removeItem(k); } catch (_e) { /* ignore */ }
                    try { sessionStorage.removeItem(k); } catch (_e) { /* ignore */ }
                    delete memory[k];
                }
            };
        },

        /** Unregister service workers (stale SW breaks mobile after deploy). */
        async clearServiceWorkers() {
            if (!('serviceWorker' in navigator)) return;
            try {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map(function (r) { return r.unregister(); }));
            } catch (_e) { /* ignore */ }
        }
    };

    global.SaaSAuthStorage = Storage;
})(window);
