/**
 * plan-gating.js — restrict modules by the tenant's plan.
 * Reads billing status + the sheet/module registry, then hides nav items
 * for modules not allowed on the current plan. Reuses the existing
 * ModuleManagement concept (module_key per sheet in app.sheets).
 *
 * Plan.modules = [] means "all modules". Otherwise it's an allow-list of
 * module_key values. Frozen/past_due tenants → read-only hint.
 */
(function (global) {
    const Gating = {
        _state: null,
        async load() {
            await global.SaaS.ready;
            const client = global.SaaS.client();
            // api_billing_status now returns the active plan's `modules` allow-list
            // directly (the old client.from('plans') path hit a non-exposed schema
            // and silently failed → gating never applied).
            const { data: billing } = await client.rpc('api_billing_status');
            const mods = billing && billing.modules;
            this._state = {
                planId: billing?.tenant?.plan_id || 'free',
                status: billing?.tenant?.status || 'active',
                allowed: (Array.isArray(mods) && mods.length) ? mods : null // [] / null = all
            };
            return this._state;
        },
        isModuleAllowed(moduleKey) {
            if (!this._state || !this._state.allowed) return true; // all allowed
            return this._state.allowed.includes(moduleKey);
        },
        isReadOnly() {
            return this._state && (this._state.status === 'frozen' || this._state.status === 'past_due');
        },
        /** hide nav buttons whose data-section maps to a disallowed module */
        applyToNav() {
            if (!this._state || !this._state.allowed) return;
            document.querySelectorAll('[data-section]').forEach(el => {
                const key = el.getAttribute('data-module') || el.getAttribute('data-section');
                if (key && !this.isModuleAllowed(key)) el.style.display = 'none';
            });
        }
    };
    global.SaaSGating = Gating;
})(window);
