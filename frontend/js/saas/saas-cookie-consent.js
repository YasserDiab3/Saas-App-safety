/**
 * saas-cookie-consent.js — GDPR cookie banner, preferences modal, gating API.
 */
(function (global) {
    const STORAGE_KEY = 'hse_cookie_consent';
    const VISITOR_KEY = 'hse_device_id';

    const DEFAULT_CATEGORIES = {
        essential: true,
        functional: false,
        analytics: false,
        marketing: false
    };

    const ALL_CATEGORIES = {
        essential: true,
        functional: true,
        analytics: true,
        marketing: true
    };

    let _policy = null;
    let _modalEl = null;

    function uuid() {
        if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function visitorId() {
        try {
            let id = localStorage.getItem(VISITOR_KEY);
            if (!id) {
                id = uuid();
                localStorage.setItem(VISITOR_KEY, id);
            }
            return id;
        } catch (_e) {
            return uuid();
        }
    }

    const I18N_KEYS = {
        'cookie.banner.aria': 'cookie_banner_aria',
        'cookie.banner.text': 'cookie_banner_text',
        'cookie.banner.accept': 'cookie_banner_accept',
        'cookie.banner.reject': 'cookie_banner_reject',
        'cookie.banner.customize': 'cookie_banner_customize',
        'cookie.modal.title': 'cookie_modal_title',
        'cookie.modal.close': 'cookie_modal_close',
        'cookie.modal.save': 'cookie_modal_save',
        'cookie.categories.essential': 'cookie_cat_essential',
        'cookie.categories.functional': 'cookie_cat_functional',
        'cookie.categories.analytics': 'cookie_cat_analytics',
        'cookie.categories.marketing': 'cookie_cat_marketing'
    };

    function t(key, fallback) {
        const flat = I18N_KEYS[key] || key;
        if (global.SaaSI18n && typeof SaaSI18n.t === 'function') {
            const v = SaaSI18n.t(flat);
            if (v && v !== flat) return v;
        }
        if (global.I18n && typeof I18n.t === 'function') {
            const v = I18n.t(flat);
            if (v && v !== flat) return v;
        }
        return fallback || key;
    }

    function lang() {
        if (global.SaaSI18n && SaaSI18n.lang) return SaaSI18n.lang();
        if (global.AppState && AppState.currentLanguage) return AppState.currentLanguage;
        try {
            return localStorage.getItem('language') || localStorage.getItem('saas_lang') || 'ar';
        } catch (_e) {
            return 'ar';
        }
    }

    function readLocal() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (_e) {
            return null;
        }
    }

    function writeLocal(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (_e) { /* ignore */ }
    }

    function categoryLabel(id, cat) {
        const isEn = lang().toLowerCase().startsWith('en');
        if (cat) return isEn ? (cat.name_en || id) : (cat.name_ar || id);
        return t('cookie.categories.' + id, id);
    }

    function categoryDesc(id, cat) {
        const isEn = lang().toLowerCase().startsWith('en');
        if (cat) return isEn ? (cat.description_en || '') : (cat.description_ar || '');
        return t('cookie.categories.' + id + '_desc', '');
    }

    async function jwt() {
        if (!global.SaaS || typeof SaaS.getSession !== 'function') return null;
        try {
            const s = await SaaS.getSession();
            return s && s.access_token ? s.access_token : null;
        } catch (_e) {
            return null;
        }
    }

    async function persist(action, categories) {
        const policyVersion = (_policy && _policy.version) || (readLocal() && readLocal().policy_version) || '1.0.0';
        const payload = {
            visitor_id: visitorId(),
            action: action,
            policy_version: policyVersion,
            categories: categories
        };
        const token = await jwt();
        const api = global.SaaSCookieApi;
        if (!api) return;
        try {
            if (action === 'update' && token) {
                await api.updateConsent(payload, token);
            } else {
                await api.recordConsent(payload, token);
            }
        } catch (_e) { /* UX: local consent still applies */ }
    }

    function applyConsent(categories, action, policyVersion) {
        const data = {
            policy_version: policyVersion || (_policy && _policy.version) || '1.0.0',
            categories: Object.assign({}, DEFAULT_CATEGORIES, categories, { essential: true }),
            action: action || 'customize',
            consent_at: new Date().toISOString()
        };
        writeLocal(data);
        global.dispatchEvent(new CustomEvent('cookie-consent-changed', { detail: data }));
        return data;
    }

    function needsBanner() {
        const local = readLocal();
        const activeVersion = (_policy && _policy.version) || '1.0.0';
        if (!local) return true;
        if (local.policy_version !== activeVersion) return true;
        return false;
    }

    function removeBanner() {
        const el = document.getElementById('hse-cookie-banner');
        if (el) el.remove();
        document.body.classList.remove('hse-cookie-banner-open');
    }

    function removeModal() {
        if (_modalEl) {
            _modalEl.remove();
            _modalEl = null;
        }
    }

    function buildToggleRow(id, cat, checked, disabled) {
        const label = categoryLabel(id, cat);
        const desc = categoryDesc(id, cat);
        return `<div class="hse-cookie-pref-row">
            <div class="hse-cookie-pref-text">
                <strong>${label}</strong>
                <p>${desc}</p>
            </div>
            <label class="hse-cookie-switch">
                <input type="checkbox" data-cat="${id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
                <span class="hse-cookie-switch-ui"></span>
            </label>
        </div>`;
    }

    function openModal(mode) {
        removeModal();
        const local = readLocal();
        const cats = (local && local.categories) || DEFAULT_CATEGORIES;
        const meta = Array.isArray(_policy && _policy.categories) ? _policy.categories : [];
        const metaMap = {};
        meta.forEach(c => { if (c && c.id) metaMap[c.id] = c; });

        const rows = ['essential', 'functional', 'analytics', 'marketing'].map(id =>
            buildToggleRow(id, metaMap[id], !!cats[id], id === 'essential')
        ).join('');

        _modalEl = document.createElement('div');
        _modalEl.className = 'hse-cookie-modal-overlay saas-modal';
        _modalEl.setAttribute('role', 'dialog');
        _modalEl.setAttribute('aria-modal', 'true');
        _modalEl.innerHTML = `
            <div class="hse-cookie-modal">
                <header class="hse-cookie-modal-head">
                    <h2>${t('cookie.modal.title', 'تفضيلات الكوكيز')}</h2>
                    <button type="button" class="hse-cookie-modal-close" aria-label="${t('cookie.modal.close', 'إغلاق')}">&times;</button>
                </header>
                <div class="hse-cookie-modal-body">${rows}</div>
                <footer class="hse-cookie-modal-foot">
                    <button type="button" class="hse-cookie-btn hse-cookie-btn--ghost" data-act="reject">${t('cookie.banner.reject', 'رفض غير الأساسية')}</button>
                    <button type="button" class="hse-cookie-btn hse-cookie-btn--primary" data-act="save">${t('cookie.modal.save', 'حفظ التفضيلات')}</button>
                </footer>
            </div>`;

        document.body.appendChild(_modalEl);

        _modalEl.querySelector('.hse-cookie-modal-close').addEventListener('click', removeModal);
        _modalEl.addEventListener('click', e => {
            if (e.target === _modalEl) removeModal();
        });

        _modalEl.querySelector('[data-act="reject"]').addEventListener('click', () => {
            Consent.accept('reject_non_essential', DEFAULT_CATEGORIES);
            removeModal();
            removeBanner();
        });

        _modalEl.querySelector('[data-act="save"]').addEventListener('click', () => {
            const selected = { essential: true };
            _modalEl.querySelectorAll('input[data-cat]').forEach(inp => {
                selected[inp.getAttribute('data-cat')] = inp.checked || inp.getAttribute('data-cat') === 'essential';
            });
            Consent.accept(mode === 'update' ? 'update' : 'customize', selected);
            removeModal();
            removeBanner();
        });
    }

    function showBanner() {
        if (document.getElementById('hse-cookie-banner')) return;
        const localized = (_policy && _policy.localized) || {};
        const bodyText = localized.body || t('cookie.banner.text', 'نستخدم الكوكيز لتشغيل المنصة وتحسين تجربتك. يمكنك قبول الكل أو الرفض أو التخصيص.');

        const el = document.createElement('div');
        el.id = 'hse-cookie-banner';
        el.className = 'hse-cookie-banner';
        el.setAttribute('role', 'region');
        el.setAttribute('aria-label', t('cookie.banner.aria', 'موافقة الكوكيز'));
        el.innerHTML = `
            <div class="hse-cookie-banner-inner">
                <p class="hse-cookie-banner-text">${bodyText}</p>
                <div class="hse-cookie-banner-actions">
                    <button type="button" class="hse-cookie-btn hse-cookie-btn--primary" data-act="accept">${t('cookie.banner.accept', 'قبول الكل')}</button>
                    <button type="button" class="hse-cookie-btn hse-cookie-btn--ghost" data-act="reject">${t('cookie.banner.reject', 'رفض غير الأساسية')}</button>
                    <button type="button" class="hse-cookie-btn hse-cookie-btn--link" data-act="customize">${t('cookie.banner.customize', 'تخصيص')}</button>
                </div>
            </div>`;

        el.querySelector('[data-act="accept"]').addEventListener('click', () => {
            Consent.accept('accept_all', ALL_CATEGORIES);
            removeBanner();
        });
        el.querySelector('[data-act="reject"]').addEventListener('click', () => {
            Consent.accept('reject_non_essential', DEFAULT_CATEGORIES);
            removeBanner();
        });
        el.querySelector('[data-act="customize"]').addEventListener('click', () => openModal('customize'));

        document.body.appendChild(el);
        document.body.classList.add('hse-cookie-banner-open');
    }

    const Consent = {
        visitorId,
        read: readLocal,

        has(category) {
            const local = readLocal();
            if (!local || !local.categories) {
                return category === 'essential';
            }
            if (category === 'essential') return true;
            return !!local.categories[category];
        },

        async accept(action, categories) {
            const pv = (_policy && _policy.version) || '1.0.0';
            const data = applyConsent(categories, action, pv);
            await persist(action, data.categories);
            return data;
        },

        openSettings() {
            openModal('update');
        },

        async loadHistory(limit) {
            const api = global.SaaSCookieApi;
            if (!api) return [];
            const token = await jwt();
            try {
                const opts = { limit: limit || 10 };
                if (!token) opts.visitor_id = visitorId();
                const res = await api.getHistory(opts, token);
                return Array.isArray(res.items) ? res.items : [];
            } catch (_e) {
                return [];
            }
        },

        async linkVisitorAfterLogin() {
            const token = await jwt();
            if (!token || !global.SaaSCookieApi) return;
            try {
                await SaaSCookieApi.linkVisitor(visitorId(), token);
            } catch (_e) { /* ignore */ }
        },

        async init() {
            if (!global.SAAS_CONFIG || !SAAS_CONFIG.useSupabaseBackend) return;
            try {
                const api = global.SaaSCookieApi;
                if (api) _policy = await api.getPolicy(lang());
            } catch (_e) { /* ignore */ }

            if (needsBanner()) showBanner();
        }
    };

    global.CookieConsent = Consent;

    function boot() {
        Consent.init().catch(() => {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);
