/**
 * saas-version.js — single source of truth: frontend/version.json
 * Updates login footer badge, AppState.appVersion, and update-available UI.
 */
(function (global) {
    const STORAGE_KEY = 'hse_last_seen_version';

    function compareVersions(a, b) {
        if (!a || !b) return 0;
        const parts = (v) => String(v).trim().replace(/^[vV]/, '').split('.').map((n) => parseInt(n, 10) || 0);
        const pa = parts(a);
        const pb = parts(b);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
            const na = pa[i] || 0;
            const nb = pb[i] || 0;
            if (na > nb) return 1;
            if (na < nb) return -1;
        }
        return 0;
    }

    function formatDisplay(version) {
        if (!version) return '…';
        const s = String(version).trim().replace(/^[vV]/, '');
        return 'V' + s;
    }

    function getLang() {
        try {
            return localStorage.getItem('language') || 'ar';
        } catch (_e) {
            return 'ar';
        }
    }

    function isLoginScreenVisible() {
        const el = document.getElementById('login-screen');
        if (!el) return false;
        return el.style.display !== 'none' && !el.classList.contains('hidden');
    }

    function isMainAppVisible() {
        if (document.body && document.body.classList.contains('app-active')) return true;
        const el = document.getElementById('main-app');
        if (!el) return false;
        return el.style.display !== 'none';
    }

    function isBannerDismissed(version) {
        try {
            return sessionStorage.getItem('hse_update_banner_dismissed') === version;
        } catch (_e) {
            return false;
        }
    }

    function setBannerDismissed(version) {
        try {
            sessionStorage.setItem('hse_update_banner_dismissed', version);
        } catch (_e) { /* ignore */ }
    }

    async function fetchManifest() {
        const base = (global.location && global.location.origin) ? global.location.origin : '';
        if (!base || base === 'null' || global.location.protocol === 'file:') return null;
        const res = await fetch(base + '/version.json?t=' + Date.now(), { cache: 'no-store', method: 'GET' });
        if (!res || !res.ok) return null;
        return res.json();
    }

    const Version = {
        _server: null,
        _message: '',
        _pollTimer: null,

        compareVersions,
        formatDisplay,

        getServerVersion() {
            return this._server;
        },

        getLastSeen() {
            try {
                return (localStorage.getItem(STORAGE_KEY) || '').trim();
            } catch (_e) {
                return '';
            }
        },

        markSeen(version) {
            const v = (version || this._server || '').trim();
            if (!v) return;
            try { localStorage.setItem(STORAGE_KEY, v); } catch (_e) { /* ignore */ }
        },

        isUpdateAvailable() {
            const server = this._server;
            const last = this.getLastSeen();
            if (!server || !last) return false;
            return compareVersions(server, last) > 0;
        },

        applyToAppState() {
            if (!this._server) return;
            if (typeof global.AppState !== 'undefined') {
                global.AppState.appVersion = this._server;
                if (this._message) global.AppState.updateMessage = this._message;
            }
        },

        updateLoginFooter(lang) {
            const verEl = document.getElementById('login-footer-version');
            const updEl = document.getElementById('login-footer-update');
            const l = lang || getLang();
            const hasUpdate = this.isUpdateAvailable();

            if (verEl) {
                verEl.textContent = this._server ? formatDisplay(this._server) : '…';
                verEl.classList.toggle('login-footer-version-badge--update', hasUpdate);
                verEl.classList.toggle('saas-version-badge--update', hasUpdate);
            }

            if (updEl) {
                updEl.hidden = !hasUpdate;
                updEl.textContent = l === 'en' ? 'Update available — refresh' : 'تحديث متاح — حدّث الصفحة';
            }

            this.updateSidebarBadge(l);
        },

        updateSidebarBadge(lang) {
            const el = document.getElementById('sidebar-app-version');
            if (!el) return;
            const l = lang || getLang();
            const hasUpdate = this.isUpdateAvailable();
            el.textContent = this._server ? formatDisplay(this._server) : '…';
            el.classList.toggle('sidebar-app-version-badge--update', hasUpdate);
            el.title = hasUpdate
                ? (l === 'en' ? 'Update available — click to refresh' : 'تحديث متاح — انقر للتحديث')
                : (l === 'en' ? 'App version' : 'إصدار التطبيق');
        },

        reloadForUpdate() {
            if (this._server) this.markSeen(this._server);
            global.location.reload();
        },

        hideInAppBanner() {
            const banner = document.getElementById('hse-app-update-banner');
            if (banner) banner.style.display = 'none';
            if (document.body) document.body.classList.remove('hse-update-banner-visible');
        },

        showInAppBanner(lang) {
            const l = lang || getLang();
            const isEn = l === 'en';
            const v = this._server;
            if (!v || isBannerDismissed(v)) {
                this.hideInAppBanner();
                return;
            }

            let banner = document.getElementById('hse-app-update-banner');
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'hse-app-update-banner';
                banner.setAttribute('role', 'alert');
                banner.setAttribute('aria-live', 'polite');
                banner.innerHTML =
                    '<div class="hse-update-banner-inner">' +
                    '<span class="hse-update-banner-icon" aria-hidden="true"><i class="fas fa-sync-alt"></i></span>' +
                    '<span class="hse-update-banner-text"></span>' +
                    '<button type="button" class="hse-update-banner-btn-reload"></button>' +
                    '<button type="button" class="hse-update-banner-btn-dismiss" aria-label="Close">×</button>' +
                    '</div>';
                document.body.appendChild(banner);

                banner.querySelector('.hse-update-banner-btn-reload').addEventListener('click', () => {
                    Version.reloadForUpdate();
                });
                banner.querySelector('.hse-update-banner-btn-dismiss').addEventListener('click', () => {
                    setBannerDismissed(Version._server || '');
                    Version.hideInAppBanner();
                });
            }

            const textEl = banner.querySelector('.hse-update-banner-text');
            const reloadBtn = banner.querySelector('.hse-update-banner-btn-reload');
            const msg = this._message;
            const verLabel = formatDisplay(v);
            if (textEl) {
                textEl.textContent = isEn
                    ? ('New version ' + verLabel + ' is available.' + (msg ? ' ' + msg : ''))
                    : ('يتوفر تحديث جديد ' + verLabel + '.' + (msg ? ' ' + msg : ''));
            }
            if (reloadBtn) {
                reloadBtn.textContent = isEn ? 'Update now' : 'تحديث الآن';
            }
            banner.style.display = 'flex';
            banner.setAttribute('dir', isEn ? 'ltr' : 'rtl');
            if (document.body) document.body.classList.add('hse-update-banner-visible');

            const offline = document.getElementById('hse-offline-banner');
            const offlineVisible = offline && offline.style.display !== 'none';
            banner.style.top = offlineVisible ? (offline.offsetHeight || 40) + 'px' : '0';
        },

        _maybeToast(lang) {
            if (this._toastShownFor === this._server) return;
            if (!global.Notification || typeof global.Notification.info !== 'function') return;
            const isEn = (lang || getLang()) === 'en';
            const verLabel = formatDisplay(this._server);
            global.Notification.info(
                isEn
                    ? ('Update available: ' + verLabel)
                    : ('يتوفر تحديث جديد: ' + verLabel),
                { duration: 8000 }
            );
            this._toastShownFor = this._server;
        },

        _maybeModal() {
            if (!global.UI || typeof global.UI._showUpdateModal !== 'function') return;
            const sessionKey = 'hse_update_modal_shown_version';
            try {
                if (sessionStorage.getItem(sessionKey) === this._server) return;
            } catch (_e) { /* ignore */ }
            global.UI._showUpdateModal(this._server);
        },

        async refresh() {
            const data = await fetchManifest();
            if (!data) return null;
            this._server = String(data.version || '').trim();
            this._message = String(data.message || '').trim();
            this.applyToAppState();
            return this._server;
        },

        async notifyIfUpdate(lang) {
            await this.refresh();
            const last = this.getLastSeen();

            if (!last && this._server) {
                this.markSeen(this._server);
                this.updateLoginFooter(lang);
                return false;
            }

            const hasUpdate = this.isUpdateAvailable();
            this.updateLoginFooter(lang);

            if (!hasUpdate) {
                this.hideInAppBanner();
                return false;
            }

            if (isLoginScreenVisible()) {
                return true;
            }

            if (isMainAppVisible() || document.body.classList.contains('app-active')) {
                this.showInAppBanner(lang);
                this._maybeToast(lang);
                this._maybeModal();
            }
            return true;
        },

        /** استدعاء بعد showMainApp — فحص فوري داخل النظام */
        checkInApp(lang) {
            return this.notifyIfUpdate(lang);
        },

        async initLoginScreen(lang) {
            await this.notifyIfUpdate(lang);
            this._bindLoginUpdateClick();
        },

        _bindLoginUpdateClick() {
            if (this._loginClickBound) return;
            this._loginClickBound = true;

            const onClick = (e) => {
                const t = e.target;
                if (!t) return;
                if (t.id === 'login-footer-update' ||
                    (t.id === 'login-footer-version' && (t.classList.contains('login-footer-version-badge--update') || t.classList.contains('saas-version-badge--update'))) ||
                    (t.id === 'sidebar-app-version' && t.classList.contains('sidebar-app-version-badge--update'))) {
                    e.preventDefault();
                    Version.reloadForUpdate();
                }
            };
            document.addEventListener('click', onClick);
        },

        startPolling() {
            if (this._pollTimer) return;
            const tick = () => {
                if (document.visibilityState !== 'visible') return;
                this.notifyIfUpdate(getLang());
            };
            setTimeout(tick, 2500);
            this._pollTimer = setInterval(tick, 5 * 60 * 1000);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') tick();
            });
            document.addEventListener('loginSuccess', () => {
                setTimeout(() => tick(), 1500);
            });
        }
    };

    global.SaaSVersion = Version;

    function boot() {
        Version.startPolling();
        if (document.getElementById('login-footer-version')) {
            Version.initLoginScreen(getLang());
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);
