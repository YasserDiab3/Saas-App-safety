/**
 * supabase-bootstrap.js
 * Loads supabase-js (UMD from CDN), creates the singleton client, and exposes
 * session + tenant helpers. No business logic here — just connectivity/auth.
 *
 * Exposes: window.SaaS = {
 *   client(): SupabaseClient,
 *   ready: Promise<void>,
 *   signIn(email, pwd), signUp(email, pwd, fullName), signOut(),
 *   getSession(), getUser(), getTenantId()
 * }
 */
(function (global) {
    const CFG = global.SAAS_CONFIG || {};
    let _client = null;
    let _readyResolve;
    const ready = new Promise((res) => { _readyResolve = res; });

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src; s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('failed to load ' + src));
            document.head.appendChild(s);
        });
    }

    /** Safe storage for Safari private mode / blocked localStorage */
    function createAuthStorage() {
        const memory = {};
        return {
            getItem(key) {
                try { return localStorage.getItem(key); } catch (_e) { return memory[key] ?? null; }
            },
            setItem(key, value) {
                try { localStorage.setItem(key, value); } catch (_e) { memory[key] = String(value); }
            },
            removeItem(key) {
                try { localStorage.removeItem(key); } catch (_e) { delete memory[key]; }
            }
        };
    }

    const SUPABASE_CDN = [
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
                storage: createAuthStorage()
            }
        });
        _readyResolve();
    }

    const SaaS = {
        ready,
        client() { return _client; },

        async signIn(email, password) {
            await ready;
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
            const { data } = await _client.auth.getSession();
            return data?.session || null;
        },
        async getUser() {
            await ready;
            const { data } = await _client.auth.getUser();
            return data?.user || null;
        },
        /** tenant_id is carried in the JWT app_metadata (set server-side at onboarding) */
        async getTenantId() {
            const u = await this.getUser();
            return u?.app_metadata?.tenant_id || null;
        }
    };

    global.SaaS = SaaS;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
