/**
 * saas-terms-modal.js — terms popup with scroll-to-end gate before acceptance.
 */
(function (global) {
    const SCROLL_THRESHOLD = 24;

    function t(key) {
        return (global.SaaSI18n && SaaSI18n.t(key)) || key;
    }

    function $(id) {
        return document.getElementById(id);
    }

    const Modal = {
        _accepted: false,
        _scrolledEnd: false,
        onAccept: null,

        isAccepted() {
            return this._accepted;
        },

        _els() {
            return {
                modal: $('terms-modal'),
                body: $('terms-modal-body'),
                hint: $('terms-scroll-hint'),
                check: $('terms-modal-accept'),
                confirm: $('terms-modal-confirm'),
                hidden: $('terms-accept'),
                status: $('terms-status-accepted'),
                openBtn: $('terms-open-btn')
            };
        },

        _syncUi() {
            const { check, confirm, hidden, status, openBtn } = this._els();
            if (hidden) hidden.checked = this._accepted;
            if (status) status.hidden = !this._accepted;
            if (openBtn) openBtn.hidden = this._accepted;
            if (typeof this.onAccept === 'function') this.onAccept(this._accepted);
        },

        _canEnableAccept() {
            return this._scrolledEnd;
        },

        _updateScrollGate() {
            const { body, hint, check, confirm } = this._els();
            if (!body) return;

            const fits = body.scrollHeight <= body.clientHeight + SCROLL_THRESHOLD;
            const atBottom = fits ||
                (body.scrollTop + body.clientHeight >= body.scrollHeight - SCROLL_THRESHOLD);

            this._scrolledEnd = atBottom;

            if (hint) {
                hint.classList.toggle('is-done', atBottom);
                hint.textContent = atBottom ? t('su_terms_scroll_done') : t('su_terms_scroll_hint');
            }
            if (check) check.disabled = !atBottom;
            if (confirm) confirm.disabled = !(atBottom && check && check.checked);
        },

        open() {
            const { modal, body, check, confirm } = this._els();
            if (!modal) return;

            this._scrolledEnd = false;
            if (body) body.scrollTop = 0;
            if (check) { check.checked = false; check.disabled = true; }
            if (confirm) confirm.disabled = true;

            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('saas-modal-open');

            requestAnimationFrame(() => {
                this._updateScrollGate();
                if (body) body.focus();
            });
        },

        close() {
            const { modal } = this._els();
            if (!modal) return;
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('saas-modal-open');
        },

        accept() {
            const { check } = this._els();
            if (!check || !check.checked || !this._scrolledEnd) return;
            this._accepted = true;
            this._syncUi();
            this.close();
        },

        reset() {
            this._accepted = false;
            this._scrolledEnd = false;
            const { check } = this._els();
            if (check) check.checked = false;
            this._syncUi();
        },

        refreshI18n() {
            this._updateScrollGate();
        },

        bind(opts) {
            this.onAccept = (opts && opts.onAccept) || null;
            const { modal, body, check, confirm, openBtn } = this._els();
            if (!modal) return;

            if (body) {
                body.addEventListener('scroll', () => this._updateScrollGate(), { passive: true });
            }
            if (check) {
                check.addEventListener('change', () => this._updateScrollGate());
            }
            if (confirm) {
                confirm.addEventListener('click', () => this.accept());
            }
            if (openBtn) {
                openBtn.addEventListener('click', () => this.open());
            }

            modal.querySelectorAll('[data-terms-close]').forEach(function (btn) {
                btn.addEventListener('click', () => Modal.close());
            });

            modal.addEventListener('click', function (e) {
                if (e.target.classList.contains('saas-modal-backdrop')) Modal.close();
            });

            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && modal.classList.contains('is-open')) Modal.close();
            });

            this._syncUi();
        }
    };

    global.SaaSTermsModal = Modal;
})(window);
