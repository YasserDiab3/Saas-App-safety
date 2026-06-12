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
                allowed: (Array.isArray(mods) && mods.length) ? mods : null,
                paymentRequired: !!billing?.payment_required,
                writable: billing?.writable !== false,
                trialEndsAt: billing?.tenant?.trial_ends_at || null
            };
            return this._state;
        },
        // Always-available modules — never gated by plan (app would break /
        // user would be locked out without them).
        CORE: ['dashboard', 'profile', 'settings', 'users', 'apptester'],
        isModuleAllowed(moduleKey) {
            if (this.CORE.includes(moduleKey)) return true;       // core always on
            if (!this._state || !this._state.allowed) return true; // [] / null = all
            return this._state.allowed.includes(moduleKey);
        },
        isReadOnly() {
            if (!this._state) return false;
            if (this._state.paymentRequired) return true;
            if (this._state.writable === false) return true;
            return this._state.status === 'frozen' || this._state.status === 'past_due';
        },
        showPaymentBanner() {
            if (!this._state || !this._state.paymentRequired) return;
            const el = document.createElement('div');
            el.id = 'saas-payment-banner';
            el.style.cssText = 'background:#fef3c7;color:#92400e;padding:10px 16px;text-align:center;font-size:14px';
            el.innerHTML = (global.SaaSI18n && SaaSI18n.t('payment_required_banner')) ||
              'انتهت التجربة المجانية — أضف بيانات الدفع من صفحة الفوترة.';
            const link = document.createElement('a');
            link.href = 'billing.html';
            link.textContent = (global.SaaSI18n && SaaSI18n.t('billing_title')) || 'الفوترة';
            link.style.marginInlineStart = '8px';
            el.appendChild(link);
            document.body.prepend(el);
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
