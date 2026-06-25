/**
 * plan-gating.js — restrict modules by the tenant's plan.
 * Reads billing status + the sheet/module registry, then hides nav items
 * for modules not allowed on the current plan. Reuses the existing
 * ModuleManagement concept (module_key per sheet in app.sheets).
 *
 * Free / trial: explicit allow-list (never [] = all).
 * Pro / Enterprise: modules [] means "all modules".
 */
(function (global) {
    const DEFAULT_TRIAL_MODULES = [
        'clinic',
        'incidents',
        'nearmiss',
        'daily-observations',
        'user-tasks',
        'ptw',
        'training'
    ];

    const Gating = {
        _state: null,

        async load() {
            await global.SaaS.ready;
            const client = global.SaaS.client();
            const { data: billing } = await client.rpc('api_billing_status');
            const mods = billing && billing.modules;
            const planId = billing?.tenant?.plan_id || 'free';
            const isTrialLimited = planId === 'free' || billing?.module_gating?.mode === 'trial_limited';

            let allowed = null;
            if (Array.isArray(mods) && mods.length) {
                allowed = mods;
            } else if (isTrialLimited) {
                allowed = DEFAULT_TRIAL_MODULES.slice();
            }

            this._state = {
                planId,
                status: billing?.tenant?.status || 'active',
                allowed,
                isTrialLimited,
                paymentRequired: !!billing?.payment_required,
                writable: billing?.writable !== false,
                trialEndsAt: billing?.tenant?.trial_ends_at || null
            };
            return this._state;
        },

        CORE: ['dashboard', 'profile', 'help', 'settings', 'users', 'apptester'],

        isModuleAllowed(moduleKey) {
            if (!moduleKey) return true;
            if (this.CORE.includes(moduleKey)) return true;
            if (!this._state || !this._state.allowed) return true;
            return this._state.allowed.includes(moduleKey);
        },

        checkSectionAccess(sectionName) {
            const key = String(sectionName || '').trim();
            if (!key || this.isModuleAllowed(key)) return { ok: true };
            const isEn = (global.SaaSI18n && global.SaaSI18n.lang === 'en')
                || (document.documentElement.lang === 'en');
            const msg = (global.SaaSI18n && global.SaaSI18n.t('module_locked_trial'))
                || (isEn
                    ? 'This module is not included in the free trial. Upgrade from Pricing & Plans.'
                    : 'هذا المديول غير متاح في التجربة المجانية. رقِّ من «عروض الأسعار».');
            return { ok: false, message: msg };
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

        showTrialModulesBanner() {
            if (!this._state || !this._state.isTrialLimited || this._state.paymentRequired) return;
            if (document.getElementById('saas-trial-modules-banner')) return;
            const allowed = this._state.allowed || DEFAULT_TRIAL_MODULES;
            const isEn = (global.SaaSI18n && global.SaaSI18n.lang === 'en')
                || (document.documentElement.lang === 'en');
            const el = document.createElement('div');
            el.id = 'saas-trial-modules-banner';
            el.style.cssText = 'background:#eff6ff;color:#1e40af;padding:8px 14px;text-align:center;font-size:13px;border-bottom:1px solid #bfdbfe';
            el.innerHTML = (global.SaaSI18n && global.SaaSI18n.t('trial_modules_banner'))
                ? `${global.SaaSI18n.t('trial_modules_banner')} (${allowed.length}). <a href="billing.html" style="font-weight:700;color:#1d4ed8">${global.SaaSI18n.t('nav_pricing_short')}</a>`
                : (isEn
                    ? `Free trial: ${allowed.length} HSE modules enabled. <a href="billing.html" style="font-weight:700;color:#1d4ed8">See pricing</a> for full access.`
                    : `التجربة المجانية: ${allowed.length} مديولات HSE متاحة فقط. <a href="billing.html" style="font-weight:700;color:#1d4ed8">عروض الأسعار</a> للوصول الكامل.`);
            document.body.prepend(el);
        },

        showPricingNav() {
            const el = document.getElementById('nav-pricing-offers');
            if (!el) return;
            const saas = global.SAAS_CONFIG && global.SAAS_CONFIG.useSupabaseBackend;
            if (!saas) { el.style.display = 'none'; return; }
            const u = global.AppState && global.AppState.currentUser;
            const isAdmin = u && (u.role === 'admin' || u.permissions?.admin);
            el.style.display = isAdmin ? '' : 'none';
        },

        applyToNav() {
            if (!this._state) return;
            document.querySelectorAll('[data-section]').forEach(el => {
                const key = el.getAttribute('data-module') || el.getAttribute('data-section');
                if (!key) return;
                if (this.isModuleAllowed(key)) {
                    el.style.display = '';
                    el.removeAttribute('data-plan-locked');
                } else {
                    el.style.display = 'none';
                    el.setAttribute('data-plan-locked', '1');
                }
            });
        }
    };

    global.SaaSGating = Gating;
})(window);
