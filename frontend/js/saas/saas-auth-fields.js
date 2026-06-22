/**
 * saas-auth-fields.js — enhanced auth inputs (password visibility toggle).
 */
(function (global) {
    const EYE =
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    const EYE_OFF =
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

    function labelShow() {
        return (global.SaaSI18n && SaaSI18n.t('pwd_show')) || 'Show password';
    }

    function labelHide() {
        return (global.SaaSI18n && SaaSI18n.t('pwd_hide')) || 'Hide password';
    }

    function bindToggle(btn) {
        if (btn.dataset.pwdBound === '1') return;
        btn.dataset.pwdBound = '1';
        const inputId = btn.getAttribute('aria-controls');
        const input = inputId ? document.getElementById(inputId) : null;
        if (!input) return;

        btn.innerHTML = EYE;
        btn.setAttribute('aria-label', labelShow());
        btn.setAttribute('type', 'button');

        btn.addEventListener('click', function () {
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.innerHTML = show ? EYE_OFF : EYE;
            btn.setAttribute('aria-label', show ? labelHide() : labelShow());
            btn.classList.toggle('is-visible', show);
            input.focus();
        });
    }

    const AuthFields = {
        init(root) {
            const scope = root || document;
            scope.querySelectorAll('.saas-pwd-toggle').forEach(bindToggle);
        },

        refreshLabels(root) {
            (root || document).querySelectorAll('.saas-pwd-toggle').forEach(function (btn) {
                const inputId = btn.getAttribute('aria-controls');
                const input = inputId ? document.getElementById(inputId) : null;
                if (!input) return;
                const visible = input.type === 'text';
                btn.setAttribute('aria-label', visible ? labelHide() : labelShow());
            });
        }
    };

    global.SaaSAuthFields = AuthFields;
})(window);
