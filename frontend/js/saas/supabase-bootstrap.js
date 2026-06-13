/**
 * supabase-bootstrap.js
 * Loads supabase-js (UMD), creates the singleton client, and exposes session helpers.
 */
(function (global) {
    const CFG = global.SAAS_CONFIG || {};
    let _client = null;
    let _readyResolve;
    const ready = new Promise((res) => { _readyResolve = res; });

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.crossOrigin = 'anonymous';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('failed to load ' + src));
            document.head.appendChild(s);
        });
    }

    const SUPABASE_CDN = [
        '/js/vendor/supabase.min.js',
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js'
    ];

    async function loadSupabaseUmd() {
        if (typeof global.supabase !== 'undefined') return;
        let lastErr;
        for (const src of SUPABASE_CDN) {
            try {
                await loadScript(src);
                if (typeof global.supabase !== 'undefined') return;
            } catch (e) { lastErr = e; }
        }
        throw lastErr || new Error('could not load supabase-js');
    }

    function authStorage() {
        if (global.SaaSAuthStorage && typeof global.SaaSAuthStorage.createAuthStorage === 'function') {
            return global.SaaSAuthStorage.createAuthStorage(CFG);
        }
        const memory = {};
        return {
            getItem(k) {
                try { return localStorage.getItem(k); } catch (_e) { return memory[k] ?? null; }
            },
            setItem(k, v) {
                try { localStorage.setItem(k, v); } catch (_e) { memory[k] = String(v); }
            },
            removeItem(k) {
                try { localStorage.removeItem(k); } catch (_e) { delete memory[k]; }
            }
        };
    }

    async function init() {
        if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) {
            console.warn('[SaaS] missing supabaseUrl/anonKey in SAAS_CONFIG');
            _readyResolve();
            return;
        }
        try {
            await loadSupabaseUmd();
        } catch (e) {
            console.error('[SaaS] could not load supabase-js', e);
            _readyResolve();
            return;
        }
        _client = global.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: false,
                storage: authStorage()
            }
        });
        _readyResolve();
    }

    const SaaS = {
        ready,
        client() { return _client; },

        async signIn(email, password) {
            await ready;
            if (!_client) return { data: null, error: { message: 'Supabase client not ready' } };
            return _client.auth.signInWithPassword({ email, password });
        },
        async signUp(email, password, fullName) {
            await ready;
            return _client.auth.signUp({
                email, password,
                options: { data: { full_name: fullName || '' } }
            });
        },
        async verifySignupOtp(email, token) {
            await ready;
            return _client.auth.verifyOtp({
                email,
                token: String(token || '').trim(),
                type: 'signup'
            });
        },
        async resendSignupOtp(email) {
            await ready;
            return _client.auth.resend({ type: 'signup', email });
        },
        async signOut() {
            await ready;
            return _client.auth.signOut();
        },
        async getSession() {
            await ready;
            if (!_client) return null;
            const { data } = await _client.auth.getSession();
            return data?.session || null;
        },
        async getUser() {
            await ready;
            if (!_client) return null;
            const { data } = await _client.auth.getUser();
            return data?.user || null;
        },
        async getTenantId() {
            const u = await this.getUser();
            return u?.app_metadata?.tenant_id || null;
        },

        /** Wait until session is readable in storage (iOS Safari flush). */
        async waitForPersistedSession(maxMs) {
            const limit = maxMs || 3000;
            const start = Date.now();
            while (Date.now() - start < limit) {
                const s = await this.getSession();
                if (s && s.access_token) {
                    if (global.SaaSAuthStorage) {
                        const raw = global.SaaSAuthStorage.readRaw(CFG);
                        if (raw) return s;
                    } else {
                        return s;
                    }
                }
                await new Promise(function (r) { setTimeout(r, 80); });
            }
            return await this.getSession();
        }
    };

    global.SaaS = SaaS;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
