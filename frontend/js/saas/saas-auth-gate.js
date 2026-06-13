/**
 * saas-auth-gate.js — instant redirect for unauthenticated SaaS visitors.
 * Loaded synchronously in <head> before heavy app scripts (mobile / incognito).
 */
(function (global) {
    const CFG = global.SAAS_CONFIG || {};
    if (!CFG.useSupabaseBackend) return;

    function projectRef() {
        const m = String(CFG.supabaseUrl || '').match(/https:\/\/([^.]+)\.supabase\.co/i);
        return m ? m[1] : '';
    }

    function hasStoredSession() {
        const ref = projectRef();
        if (!ref) return false;
        try {
            const raw = localStorage.getItem('sb-' + ref + '-auth-token');
            if (!raw) return false;
            const data = JSON.parse(raw);
            return !!(data && (data.access_token || (data.currentSession && data.currentSession.access_token)));
        } catch (_e) {
            return false;
        }
    }

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

    if (isPublicSaasPage()) return;
    if (hasStoredSession()) return;

    const next = encodeURIComponent(location.pathname + location.search + location.hash);
    location.replace('/login?next=' + next);
})(window);
