/**
 * saas-trial-notify.js — trial countdown UI, weekly upgrade toast, dashboard banner.
 * Depends on plan-gating.js (SaaSGating._state) and Notification toast API.
 */
(function (global) {
    const TOAST_KEY = 'saas_trial_toast_at';
    const TOP_DISMISS_KEY = 'saas_trial_top_dismissed';
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    function getLang() {
        if (global.SaaSI18n && global.SaaSI18n.lang) return global.SaaSI18n.lang;
        try { return localStorage.getItem('saas_lang') === 'en' ? 'en' : 'ar'; } catch (_e) { return 'ar'; }
    }

    function t(key) {
        if (global.SaaSI18n && typeof global.SaaSI18n.t === 'function') {
            const v = global.SaaSI18n.t(key);
            if (v && v !== key) return v;
        }
        return key;
    }

    function state() {
        return (global.SaaSGating && global.SaaSGating._state) || null;
    }

    function daysLeft(endsAt) {
        if (!endsAt) return null;
        const ms = new Date(endsAt).getTime() - Date.now();
        if (ms <= 0) return 0;
        return Math.ceil(ms / (24 * 60 * 60 * 1000));
    }

    function isTrialing() {
        const s = state();
        if (!s || s.paymentRequired) return false;
        if (s.planId !== 'free') return false;
        const d = daysLeft(s.trialEndsAt);
        return d !== null && d > 0;
    }

    function isOwnerOrAdmin() {
        const u = global.AppState && global.AppState.currentUser;
        return u && (u.role === 'admin' || u.permissions?.admin);
    }

    function tenantScopeKey() {
        const s = state();
        return (s && s.planId) ? String(s.trialEndsAt || 'trial') : 'default';
    }

    function formatCountdown(endsAt) {
        const ms = Math.max(0, new Date(endsAt).getTime() - Date.now());
        const sec = Math.floor(ms / 1000);
        const d = Math.floor(sec / 86400);
        const h = Math.floor((sec % 86400) / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        const pad = (n) => String(n).padStart(2, '0');
        return { d, h, m, s, label: `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` };
    }

    function billingUrl() {
        return 'billing.html';
    }

    function adjustBodyPadding() {
        const banners = [
            document.getElementById('hse-app-update-banner'),
            document.getElementById('saas-trial-top-banner'),
            document.getElementById('saas-payment-banner')
        ].filter((el) => el && el.offsetParent !== null && el.style.display !== 'none');
        let top = 0;
        banners.forEach((el) => {
            if (el.id === 'hse-app-update-banner' || el.id === 'saas-trial-top-banner') {
                el.style.top = top + 'px';
                top += el.offsetHeight || 48;
            }
        });
        if (document.body) {
            const fixed = document.getElementById('hse-app-update-banner') || document.getElementById('saas-trial-top-banner');
            document.body.classList.toggle('saas-trial-banner-visible', !!fixed && fixed.style.display !== 'none');
            if (fixed) document.body.style.paddingTop = top ? top + 'px' : '';
        }
    }

    const TrialNotify = {
        _timer: null,

        hideTopBanner() {
            const el = document.getElementById('saas-trial-top-banner');
            if (el) el.style.display = 'none';
            adjustBodyPadding();
        },

        showTopBanner() {
            if (!isTrialing()) { this.hideTopBanner(); return; }
            const endsAt = state().trialEndsAt;
            const days = daysLeft(endsAt);
            try {
                if (sessionStorage.getItem(TOP_DISMISS_KEY) === String(endsAt)) {
                    this.hideTopBanner();
                    return;
                }
            } catch (_e) { /* ignore */ }

            const lang = getLang();
            const isEn = lang === 'en';
            let el = document.getElementById('saas-trial-top-banner');
            if (!el) {
                el = document.createElement('div');
                el.id = 'saas-trial-top-banner';
                el.setAttribute('role', 'status');
                el.innerHTML =
                    '<div class="saas-trial-top-inner">' +
                    '<span class="saas-trial-top-icon" aria-hidden="true"><i class="fas fa-hourglass-half"></i></span>' +
                    '<span class="saas-trial-top-text"></span>' +
                    '<a class="saas-trial-top-cta" href="billing.html"></a>' +
                    '<button type="button" class="saas-trial-top-dismiss" aria-label="Close">×</button>' +
                    '</div>';
                document.body.appendChild(el);
                el.querySelector('.saas-trial-top-dismiss').addEventListener('click', () => {
                    try { sessionStorage.setItem(TOP_DISMISS_KEY, String(endsAt)); } catch (_e) { /* ignore */ }
                    TrialNotify.hideTopBanner();
                });
            }

            const text = el.querySelector('.saas-trial-top-text');
            const cta = el.querySelector('.saas-trial-top-cta');
            const dayWord = isEn ? (days === 1 ? 'day' : 'days') : (days === 1 ? 'يوم' : (days === 2 ? 'يومين' : 'أيام'));
            if (text) {
                text.textContent = isEn
                    ? `Your free trial ends in ${days} ${dayWord} — subscribe for the full version.`
                    : `تجربتك المجانية تنتهي خلال ${days} ${dayWord} — اشترك للنسخة الكاملة.`;
            }
            if (cta) {
                cta.textContent = isEn ? 'Subscribe now' : 'اشترك الآن';
                cta.href = billingUrl();
            }
            el.setAttribute('dir', isEn ? 'ltr' : 'rtl');
            el.style.display = 'flex';
            adjustBodyPadding();
        },

        showWeeklyToast() {
            if (!isTrialing() || !isOwnerOrAdmin()) return;
            if (!global.Notification || typeof global.Notification.info !== 'function') return;
            const scope = tenantScopeKey();
            let last = 0;
            try { last = parseInt(localStorage.getItem(TOAST_KEY + '_' + scope) || '0', 10) || 0; } catch (_e) { /* ignore */ }
            const days = daysLeft(state().trialEndsAt);
            const interval = (days !== null && days <= 3) ? (24 * 60 * 60 * 1000) : WEEK_MS;
            if (Date.now() - last < interval) return;

            const isEn = getLang() === 'en';
            global.Notification.info(
                isEn
                    ? `Trial: ${days} day(s) left. Upgrade to Pro or Enterprise for the full HSE platform.`
                    : `التجربة: متبقٍ ${days} ${days === 1 ? 'يوم' : 'أيام'}. رقِّ إلى Pro أو Enterprise للمنصّة الكاملة.`,
                { duration: 10000 }
            );
            try { localStorage.setItem(TOAST_KEY + '_' + scope, String(Date.now())); } catch (_e) { /* ignore */ }
        },

        hideDashboardBanner() {
            const el = document.getElementById('saas-trial-dashboard-banner');
            if (el) el.remove();
            if (this._timer) { clearInterval(this._timer); this._timer = null; }
        },

        refreshDashboardBanner() {
            const root = document.getElementById('dashboard-section');
            if (!root || !root.classList.contains('active')) return;
            if (!isTrialing()) { this.hideDashboardBanner(); return; }

            const endsAt = state().trialEndsAt;
            const isEn = getLang() === 'en';
            let el = document.getElementById('saas-trial-dashboard-banner');
            if (!el) {
                el = document.createElement('div');
                el.id = 'saas-trial-dashboard-banner';
                el.className = 'saas-trial-dashboard-banner';
                const header = root.querySelector('.section-header');
                if (header) root.insertBefore(el, header);
                else root.prepend(el);
            }

            const cd = formatCountdown(endsAt);
            const days = daysLeft(endsAt);
            el.innerHTML =
                '<div class="saas-trial-dash-inner" dir="' + (isEn ? 'ltr' : 'rtl') + '">' +
                '<div class="saas-trial-dash-copy">' +
                '<strong>' + (isEn ? 'Free trial' : 'التجربة المجانية') + '</strong>' +
                '<p>' + (isEn
                    ? `${days} day(s) remaining. Unlock Pro or Enterprise for unlimited access.`
                    : `متبقٍ ${days} ${days === 1 ? 'يوم' : 'أيام'}. فعّل Pro أو Enterprise للوصول الكامل.`) +
                '</p></div>' +
                '<div class="saas-trial-dash-countdown" aria-live="polite">' +
                '<span class="saas-trial-dash-countdown-label">' + (isEn ? 'Time left' : 'الوقت المتبقي') + '</span>' +
                '<span class="saas-trial-dash-countdown-value" id="saas-trial-countdown-value">' + cd.label + '</span>' +
                '</div>' +
                '<a class="saas-trial-dash-cta" href="billing.html">' + (isEn ? 'View plans' : 'عرض الخطط') + '</a>' +
                '</div>';

            if (!this._timer) {
                this._timer = setInterval(() => {
                    const val = document.getElementById('saas-trial-countdown-value');
                    if (!val || !isTrialing()) { TrialNotify.hideDashboardBanner(); return; }
                    val.textContent = formatCountdown(state().trialEndsAt).label;
                }, 1000);
            }
        },

        _watchDashboard() {
            const root = document.getElementById('dashboard-section');
            if (!root || root._saasTrialObs) return;
            root._saasTrialObs = new MutationObserver(() => {
                if (root.classList.contains('active')) TrialNotify.refreshDashboardBanner();
                else TrialNotify.hideDashboardBanner();
            });
            root._saasTrialObs.observe(root, { attributes: true, attributeFilter: ['class'] });
        },

        apply() {
            const s = state();
            if (!s) return;

            if (s.paymentRequired) {
                this.hideTopBanner();
                this.hideDashboardBanner();
                if (global.SaaSGating && typeof global.SaaSGating.showPaymentBanner === 'function') {
                    global.SaaSGating.showPaymentBanner();
                }
                return;
            }

            const payBanner = document.getElementById('saas-payment-banner');
            if (payBanner) payBanner.remove();

            if (isTrialing()) {
                this.showTopBanner();
                this.showWeeklyToast();
                this._watchDashboard();
                this.refreshDashboardBanner();
            } else {
                this.hideTopBanner();
                this.hideDashboardBanner();
            }
        }
    };

    global.SaaSTrialNotify = TrialNotify;
})(window);
