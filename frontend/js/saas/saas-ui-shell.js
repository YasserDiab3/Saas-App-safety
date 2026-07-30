/**
 * saas-ui-shell.js — shared page chrome using hse-* tokens.
 */
(function (global) {
    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function pageHeader(title, subtitle, actionsHtml) {
        return `<div class="hse-page-header">
          <div class="hse-page-header__text">
            <h2 class="hse-page-header__title">${escapeHtml(title)}</h2>
            ${subtitle ? `<p class="hse-page-header__sub">${escapeHtml(subtitle)}</p>` : ''}
          </div>
          ${actionsHtml ? `<div class="hse-page-header__actions">${actionsHtml}</div>` : ''}
        </div>`;
    }

    function emptyState(title, hint, actionHtml) {
        return `<div class="hse-empty-state" role="status">
          <p class="hse-empty-state__title">${escapeHtml(title || 'لا توجد بيانات')}</p>
          ${hint ? `<p class="hse-empty-state__hint">${escapeHtml(hint)}</p>` : ''}
          ${actionHtml || ''}
        </div>`;
    }

    function sectionCard(innerHtml, extraClass) {
        return `<div class="hse-section-card ${extraClass || ''}">${innerHtml || ''}</div>`;
    }

    /** Normalize legacy .empty-state nodes under a root to hse-empty-state look */
    function enhanceEmptyStates(root) {
        const el = root || document;
        try {
            el.querySelectorAll?.('.empty-state:not(.hse-empty-enhanced)').forEach((node) => {
                node.classList.add('hse-empty-state', 'hse-empty-enhanced');
                const p = node.querySelector('p');
                if (p && !p.classList.contains('hse-empty-state__hint')) {
                    p.classList.add('hse-empty-state__hint');
                }
            });
        } catch (_e) { /* ignore */ }
    }

    function observe() {
        if (global.__hseUiShellObserved || !global.MutationObserver || !document.body) return;
        global.__hseUiShellObserved = true;
        const mo = new MutationObserver(() => enhanceEmptyStates(document.body));
        mo.observe(document.body, { childList: true, subtree: true });
        enhanceEmptyStates(document.body);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(observe, 400));
    } else {
        setTimeout(observe, 400);
    }

    global.SaaSUiShell = { pageHeader, emptyState, sectionCard, enhanceEmptyStates };
})(window);
