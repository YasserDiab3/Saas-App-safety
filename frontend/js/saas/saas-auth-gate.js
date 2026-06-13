/**
 * saas-auth-gate.js — instant redirect for unauthenticated SaaS visitors.
 */
(function (global) {
    const CFG = global.SAAS_CONFIG || {};
    if (!CFG.useSupabaseBackend) return;

    function isPublicSaasPage() {
        const path = (location.pathname || '/').replace(/\/$/, '') || '/';
        const publicPaths = [
            '/login', '/signup', '/accept-invite', '/billing', '/team',
            '/login.html', '/signup.html', '/accept-invite.html', '/billing.html', '/team.html'
        ];
        return publicPaths.some(function (p) {
            return path === p || path.endsWith(p);
        });
    }

    function hasStoredSession() {
        if (global.SaaSAuthStorage && global.SaaSAuthStorage.hasSession(CFG)) return true;
        const ref = String(CFG.supabaseUrl || '').match(/https:\/\/([^.]+)\.supabase\.co/i);
        if (!ref) return false;
        const key = 'sb-' + ref[1] + '-auth-token';
        try {
            const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
            if (!raw) return false;
            const data = JSON.parse(raw);
            return !!(data && (data.access_token || (data.currentSession && data.currentSession.access_token)));
        } catch (_e) {
            return false;
        }
    }

    if (isPublicSaasPage()) return;
    if (hasStoredSession()) return;

    const next = encodeURIComponent(location.pathname + location.search + location.hash);
    location.replace('/login?next=' + next);
})(window);
