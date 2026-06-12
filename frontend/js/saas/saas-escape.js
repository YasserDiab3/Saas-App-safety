/**
 * saas-escape.js — minimal HTML escaping for SaaS standalone pages
 */
(function (global) {
    global.SaaSEscape = {
        html(s) {
            return String(s ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    };
})(window);
