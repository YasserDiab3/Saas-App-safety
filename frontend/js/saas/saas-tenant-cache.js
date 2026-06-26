/**
 * saas-tenant-cache.js — tenant-scoped browser cache for multi-tenant SaaS.
 * Prevents cross-tenant leakage via shared localStorage keys on the same browser.
 */
(function (global) {
    const MARKER = 'hse_active_tenant_id';
    const SCOPED_BASES = [
        'hse_app_data',
        'hse_pending_sync_queue',
        'hse_sync_meta',
        'hse_cache_timestamps',
        'hse_company_logo',
        'company_logo',
        'hse_company_settings',
        'hse_incidents_registry',
        'hse_ptw_registry',
        'hse_kpi_targets',
        'hse_cached_users',
        'hse_read_notifications',
        'hse_backend_config',
        'hse_google_config',
        'hse_cloud_storage_config'
    ];

    function isSaas() {
        return !!(global.SAAS_CONFIG && global.SAAS_CONFIG.useSupabaseBackend);
    }

    function scopedKey(base, tenantId) {
        const tid = tenantId || global.SaaSTenantCache._tenantId;
        if (!isSaas() || !tid) return base;
        return `${base}:${tid}`;
    }

    function removeKey(base, tenantId) {
        try {
            localStorage.removeItem(scopedKey(base, tenantId));
            localStorage.removeItem(base);
        } catch (_e) { /* ignore */ }
    }

    function clearLegacyGlobalKeys() {
        SCOPED_BASES.forEach((base) => {
            try { localStorage.removeItem(base); } catch (_e) { /* ignore */ }
        });
    }

    function clearTenantScopedData(tenantId) {
        if (!tenantId) return;
        SCOPED_BASES.forEach((base) => removeKey(base, tenantId));
    }

    const Cache = {
        _tenantId: null,

        getTenantId() {
            return this._tenantId;
        },

        scopedKey(base) {
            return scopedKey(base);
        },

        /**
         * Resolve tenant from api_me, purge stale global cache, set active marker.
         * Call after successful Supabase session + tenant membership check.
         */
        async prepareSession() {
            if (!isSaas()) return null;
            await global.SaaS.ready;
            const client = global.SaaS.client();
            if (!client) return null;
            const { data, error } = await client.rpc('api_me');
            const tid = (!error && data && data.tenant_id) ? data.tenant_id : null;
            const prev = localStorage.getItem(MARKER);
            if (prev && tid && prev !== tid) {
                clearTenantScopedData(prev);
            }
            clearLegacyGlobalKeys();
            if (tid) {
                localStorage.setItem(MARKER, tid);
            } else {
                localStorage.removeItem(MARKER);
            }
            this._tenantId = tid;
            return tid;
        },

        /** Clear all tenant-bound cache (logout). */
        clearAllTenantData() {
            const tid = this._tenantId || localStorage.getItem(MARKER);
            if (tid) clearTenantScopedData(tid);
            clearLegacyGlobalKeys();
            localStorage.removeItem(MARKER);
            this._tenantId = null;
        }
    };

    global.SaaSTenantCache = Cache;
})(window);
