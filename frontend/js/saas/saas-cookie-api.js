/**
 * saas-cookie-api.js — client for cookie-consent Edge Function + policy RPC fallback.
 */
(function (global) {
    const CFG = global.SAAS_CONFIG || {};

    function baseUrl() {
        return String(CFG.supabaseUrl || '').replace(/\/$/, '') + '/functions/v1/cookie-consent';
    }

    function headers(jwt) {
        const h = {
            'apikey': CFG.supabaseAnonKey || '',
            'Content-Type': 'application/json'
        };
        if (jwt) h.Authorization = 'Bearer ' + jwt;
        return h;
    }

    async function parseJson(res) {
        try { return await res.json(); } catch (_e) { return { error: 'invalid response' }; }
    }

    const Api = {
        async getPolicy(lang) {
            const l = (lang || 'ar').toString().toLowerCase().startsWith('en') ? 'en' : 'ar';
            try {
                const res = await fetch(baseUrl() + '/cookie-policy?lang=' + encodeURIComponent(l), {
                    headers: headers()
                });
                const data = await parseJson(res);
                if (data && data.success) return data;
            } catch (_e) { /* fallback below */ }
            if (global.SaaS && SaaS.client()) {
                const { data, error } = await SaaS.client().rpc('api_get_cookie_policy');
                if (!error && data) return data;
            }
            return null;
        },

        async recordConsent(payload, jwt) {
            const res = await fetch(baseUrl() + '/cookie-consent', {
                method: 'POST',
                headers: headers(jwt),
                body: JSON.stringify(payload)
            });
            const data = await parseJson(res);
            if (!res.ok) throw new Error(data.error || res.statusText);
            return data;
        },

        async updateConsent(payload, jwt) {
            const res = await fetch(baseUrl() + '/cookie-consent/update', {
                method: 'PUT',
                headers: headers(jwt),
                body: JSON.stringify(payload)
            });
            const data = await parseJson(res);
            if (!res.ok) throw new Error(data.error || res.statusText);
            return data;
        },

        async getHistory(opts, jwt) {
            const o = opts || {};
            const qs = new URLSearchParams();
            if (o.limit) qs.set('limit', String(o.limit));
            if (o.visitor_id) qs.set('visitor_id', o.visitor_id);
            const res = await fetch(baseUrl() + '/cookie-consent/history?' + qs.toString(), {
                headers: headers(jwt)
            });
            const data = await parseJson(res);
            if (!res.ok) throw new Error(data.error || res.statusText);
            return data;
        },

        async linkVisitor(visitorId, jwt) {
            if (!global.SaaS || !SaaS.client() || !jwt) return null;
            const { data, error } = await SaaS.client().rpc('api_link_visitor_cookie_consents', {
                p_visitor_id: visitorId
            });
            if (error) throw new Error(error.message);
            return data;
        }
    };

    global.SaaSCookieApi = Api;
})(window);
