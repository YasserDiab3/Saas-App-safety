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

            if (verEl) {
                verEl.textContent = this._server ? formatDisplay(this._server) : '…';
                verEl.classList.toggle('login-footer-version-badge--update', this.isUpdateAvailable());
            }

            if (updEl) {
                const show = this.isUpdateAvailable();
                updEl.hidden = !show;
                updEl.textContent = l === 'en' ? 'Update available — refresh' : 'تحديث متاح — حدّث الصفحة';
            }
        },

        reloadForUpdate() {
            if (this._server) this.markSeen(this._server);
            global.location.reload();
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

            if (!hasUpdate) return false;

            if (isLoginScreenVisible()) {
                return true;
            }

            if (global.UI && typeof global.UI._showUpdateModal === 'function') {
                global.UI._showUpdateModal(this._server);
            }
            return true;
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
                    (t.id === 'login-footer-version' && t.classList.contains('login-footer-version-badge--update'))) {
                    e.preventDefault();
                    Version.reloadForUpdate();
                }
            };
            document.addEventListener('click', onClick);
        },

        startPolling() {
            if (this._pollTimer) return;
            const tick = () => {
                if (!isLoginScreenVisible()) return;
                this.notifyIfUpdate(getLang());
            };
            this._pollTimer = setInterval(tick, 5 * 60 * 1000);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') tick();
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
