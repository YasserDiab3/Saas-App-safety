/**
 * saas-session.js — session/tenant guard helpers for the SaaS app.
 * Depends on supabase-bootstrap.js (window.SaaS).
 */
(function (global) {
    const Session = {
        /** redirect to login if no active session; returns the user or null */
        async requireSession(loginUrl) {
            const s = await global.SaaS.getSession();
            if (!s) {
                location.href = loginUrl || 'login.html';
                return null;
            }
            return s.user || null;
        },

        /** ensure the signed-in user has a tenant; if not, send to signup/onboarding */
        async requireTenant(onboardingUrl) {
            await global.SaaS.ready;
            const client = global.SaaS.client();
            // tenant is resolved server-side (profiles.default_tenant_id); confirm via a cheap RPC
            const { data, error } = await client.rpc('api_read_sheet', { p_sheet: '__tenant_probe__' });
            if (error && /no active tenant/i.test(error.message || '')) {
                location.href = onboardingUrl || 'signup.html?step=org';
                return false;
            }
            return true;
        },

        /** populate a legacy-compatible AppState.currentUser from the Supabase user */
        async hydrateAppStateUser() {
            const u = await global.SaaS.getUser();
            if (!u) return null;
            const cu = {
                id: u.id,
                email: u.email,
                name: (u.user_metadata && u.user_metadata.full_name) || u.email,
                role: (u.app_metadata && u.app_metadata.role) || 'user'
            };
            if (typeof global.AppState !== 'undefined') {
                global.AppState.currentUser = Object.assign({}, global.AppState.currentUser, cu);
            }
            return cu;
        }
    };
    global.SaaSSession = Session;
})(window);
