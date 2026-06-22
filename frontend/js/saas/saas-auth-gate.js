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
        return false;
    }

    if (isPublicSaasPage()) return;
    if (hasStoredSession()) return;

    const next = encodeURIComponent(location.pathname + location.search + location.hash);
    location.replace('/login?next=' + next);
})(window);
