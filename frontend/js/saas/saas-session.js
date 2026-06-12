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
            const { data, error } = await client.rpc('api_me');
            if (error || !data || !data.tenant_id) {
                location.href = onboardingUrl || 'signup.html?step=org';
                return false;
            }
            return true;
        },

        /**
         * Authoritative tenant role for the signed-in user (from the DB via
         * api_me), mapped to the legacy role engine. owner/admin ⇒ 'admin'
         * (full nav); everyone else keeps their limited role. Falls back to
         * 'user' on any failure (least privilege).
         */
        async resolveRole() {
            try {
                await global.SaaS.ready;
                const client = global.SaaS.client();
                if (!client) return 'user';
                const { data, error } = await client.rpc('api_me');
                if (error || !data) return 'user';
                const r = (data.role || '').toLowerCase();
                if (r === 'owner' || r === 'admin') return 'admin';
                return r || 'user';
            } catch (_e) {
                return 'user';
            }
        },

        /** populate a legacy-compatible AppState.currentUser from the Supabase user */
        async hydrateAppStateUser() {
            const u = await global.SaaS.getUser();
            if (!u) return null;
            // Role is resolved SERVER-SIDE from tenant_users (never assumed).
            // The legacy nav/permission engine grants all modules for an admin
            // role; non-admin members get the limited default UI.
            const role = await this.resolveRole();
            const isAdmin = (role === 'admin');
            const cu = {
                id: u.id,
                email: u.email,
                name: (u.user_metadata && u.user_metadata.full_name) || u.email,
                role: role,
                permissions: isAdmin ? { admin: true, 'manage-modules': true } : {},
                isBootstrap: false,
                loginTime: new Date().toISOString()
            };
            if (typeof global.AppState !== 'undefined') {
                global.AppState.currentUser = Object.assign({}, global.AppState.currentUser, cu);
                // legacy modules read from AppState.appData; ensure a safe shape exists
                if (!global.AppState.appData || typeof global.AppState.appData !== 'object') {
                    global.AppState.appData = {};
                }
                if (!Array.isArray(global.AppState.appData.users)) {
                    global.AppState.appData.users = [];
                }
            }
            return cu;
        }
    };
    global.SaaSSession = Session;
})(window);
