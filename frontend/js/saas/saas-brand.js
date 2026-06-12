/**
 * saas-brand.js — default platform logo & favicon (QHSSE Consultant).
 * Load after saas-config.js on any page.
 */
(function (global) {
    const cfg = global.SAAS_CONFIG || {};
    const logoUrl = cfg.defaultLogoUrl || 'assets/brand/logo.png';
    const faviconUrl = cfg.defaultFaviconUrl || 'assets/brand/favicon.png';

    function getDefaultLogoUrl() {
        return logoUrl;
    }

    function applyFavicon(url) {
        const href = url || faviconUrl;
        if (!href) return;
        let link = document.querySelector('link[rel="icon"]');
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.type = 'image/png';
        link.href = href;
        const shortcut = document.querySelector('link[rel="shortcut icon"]');
        if (shortcut) shortcut.href = href;
    }

    function applyDefaultFavicon() {
        applyFavicon(faviconUrl);
    }

    global.SaaSBrand = {
        logoUrl,
        faviconUrl,
        getDefaultLogoUrl,
        applyFavicon,
        applyDefaultFavicon
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyDefaultFavicon);
    } else {
        applyDefaultFavicon();
    }
})(window);
