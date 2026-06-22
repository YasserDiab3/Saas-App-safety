/**
 * saas-brand.js — default platform logo, favicon & social meta (HSEHub 360).
 * Load after saas-config.js on any page.
 */
(function (global) {
    const cfg = global.SAAS_CONFIG || {};
    const logoUrl = cfg.defaultLogoUrl || 'assets/brand/logo.png';
    const faviconUrl = cfg.defaultFaviconUrl || 'assets/brand/favicon.png';

    function getAppName() {
        return cfg.appName || 'HSEHub 360';
    }

    function getDefaultLogoUrl() {
        return logoUrl;
    }

    function absoluteAssetUrl(relative) {
        const rel = String(relative || '').replace(/^\.\//, '');
        if (/^https?:\/\//i.test(rel)) return rel;
        try {
            const base = (cfg.publicSiteUrl || global.location?.origin || '').replace(/\/$/, '');
            if (base) return `${base}/${rel.replace(/^\//, '')}`;
            return new URL(rel, `${global.location.origin}/`).href;
        } catch (_) {
            return rel;
        }
    }

    function upsertMetaByAttr(attr, key, value) {
        if (!value || !document.head) return;
        let el = document.head.querySelector(`meta[${attr}="${key}"]`);
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute(attr, key);
            document.head.appendChild(el);
        }
        el.setAttribute('content', value);
    }

    function upsertLinkRel(rel, href) {
        if (!href || !document.head) return;
        let el = document.head.querySelector(`link[rel="${rel}"]`);
        if (!el) {
            el = document.createElement('link');
            el.rel = rel;
            document.head.appendChild(el);
        }
        el.href = href;
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

    /**
     * Apply document title + description + Open Graph / Twitter cards.
     * @param {{ title?: string, description?: string, url?: string, image?: string }} overrides
     */
    function applySocialMeta(overrides) {
        const opts = overrides && typeof overrides === 'object' ? overrides : {};
        const name = getAppName();
        const title = opts.title || cfg.metaTitle || `${name} — Safety • Health • Environment`;
        const description = opts.description || cfg.metaDescription ||
            `${name} — ${cfg.appTaglineAr || ''} ${cfg.appTaglineEn || ''}`.trim();
        const pageUrl = opts.url || cfg.publicSiteUrl || (global.location ? global.location.href.split('#')[0] : '');
        const image = absoluteAssetUrl(opts.image || cfg.ogImageUrl || logoUrl);

        if (document.title !== title) document.title = title;
        upsertMetaByAttr('name', 'description', description);
        upsertMetaByAttr('name', 'application-name', name);
        upsertMetaByAttr('name', 'apple-mobile-web-app-title', name);
        upsertMetaByAttr('property', 'og:type', 'website');
        upsertMetaByAttr('property', 'og:site_name', name);
        upsertMetaByAttr('property', 'og:title', title);
        upsertMetaByAttr('property', 'og:description', description);
        upsertMetaByAttr('property', 'og:url', pageUrl);
        upsertMetaByAttr('property', 'og:image', image);
        upsertMetaByAttr('property', 'og:image:alt', name);
        upsertMetaByAttr('property', 'og:locale', 'ar_AR');
        upsertMetaByAttr('name', 'twitter:card', 'summary');
        upsertMetaByAttr('name', 'twitter:title', title);
        upsertMetaByAttr('name', 'twitter:description', description);
        upsertMetaByAttr('name', 'twitter:image', image);
        if (pageUrl) upsertLinkRel('canonical', pageUrl);
    }

    global.SaaSBrand = {
        logoUrl,
        faviconUrl,
        getDefaultLogoUrl,
        getAppName,
        absoluteAssetUrl,
        applyFavicon,
        applyDefaultFavicon,
        applySocialMeta
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyDefaultFavicon);
    } else {
        applyDefaultFavicon();
    }
})(window);
