/**
 * i18n-extra-langs.js — French + Turkish core keys; patches AppI18n fallback chain.
 * Full UI parity remains ar/en; fr/tr cover nav/common/settings/login-facing keys.
 */
(function (global) {
    const SUPPORTED = ['ar', 'en', 'fr', 'tr'];
    const LABELS = { ar: 'العربية', en: 'English', fr: 'Français', tr: 'Türkçe' };
    const SHORT = { ar: 'AR', en: 'EN', fr: 'FR', tr: 'TR' };

    const CORE_FR = {
        'nav.dashboard': 'Tableau de bord',
        'nav.settings': 'Paramètres',
        'nav.incidents': 'Incidents',
        'nav.training': 'Formation',
        'nav.ptw': 'Permis de travail',
        'nav.nearmiss': 'Presqu’accidents',
        'app.save': 'Enregistrer',
        'app.cancel': 'Annuler',
        'app.delete': 'Supprimer',
        'app.search': 'Rechercher',
        'app.loading': 'Chargement…',
        'app.close': 'Fermer',
        'app.language': 'Langue',
        'app.toggleLanguage': 'Changer de langue',
        'language.current': 'Français',
        'settings.title': 'Paramètres',
        'settings.backup_management': 'Sauvegarde et données démo',
        'dash.overview': 'Aperçu des activités HSE',
        'dash.totalIncidents': 'Total des incidents',
        'dash.noData30d': 'Aucune donnée sur 30 jours',
        'empty.no_data': 'Aucune donnée',
        'empty.hint': 'Ajoutez un enregistrement pour commencer'
    };

    const CORE_TR = {
        'nav.dashboard': 'Kontrol paneli',
        'nav.settings': 'Ayarlar',
        'nav.incidents': 'Olaylar',
        'nav.training': 'Eğitim',
        'nav.ptw': 'Çalışma izni',
        'nav.nearmiss': 'Ramak kala',
        'app.save': 'Kaydet',
        'app.cancel': 'İptal',
        'app.delete': 'Sil',
        'app.search': 'Ara',
        'app.loading': 'Yükleniyor…',
        'app.close': 'Kapat',
        'app.language': 'Dil',
        'app.toggleLanguage': 'Dili değiştir',
        'language.current': 'Türkçe',
        'settings.title': 'Ayarlar',
        'settings.backup_management': 'Yedekleme ve demo veriler',
        'dash.overview': 'İSG faaliyetlerine genel bakış',
        'dash.totalIncidents': 'Toplam olaylar',
        'dash.noData30d': 'Son 30 günde veri yok',
        'empty.no_data': 'Veri yok',
        'empty.hint': 'Başlamak için bir kayıt ekleyin'
    };

    function nextLang(current) {
        const i = SUPPORTED.indexOf(current);
        return SUPPORTED[(i >= 0 ? i + 1 : 0) % SUPPORTED.length];
    }

    function isRtl(lang) {
        return lang === 'ar';
    }

    function label(lang) {
        return LABELS[lang] || lang;
    }

    function shortLabel(lang) {
        return SHORT[lang] || String(lang || '').toUpperCase();
    }

    function patchAppI18n() {
        const core = global.AppI18n || global.I18n;
        if (!core || !core.translations) return;
        core.translations.fr = Object.assign({}, core.translations.en || {}, CORE_FR);
        core.translations.tr = Object.assign({}, core.translations.en || {}, CORE_TR);
        core.SUPPORTED_LANGS = SUPPORTED;
        if (typeof core.t === 'function' && !core.__extraLangPatched) {
            const prev = core.t.bind(core);
            core.t = function (key, arg2, arg3) {
                const langHint = (arg2 === 'ar' || arg2 === 'en' || arg2 === 'fr' || arg2 === 'tr')
                    ? arg2
                    : null;
                if (langHint === 'fr' || langHint === 'tr' || (!langHint && (global.AppState?.currentLanguage === 'fr' || global.AppState?.currentLanguage === 'tr' || localStorage.getItem('language') === 'fr' || localStorage.getItem('language') === 'tr'))) {
                    const current = langHint || global.AppState?.currentLanguage || localStorage.getItem('language') || 'ar';
                    if (current === 'fr' || current === 'tr') {
                        const fb = arg3 !== undefined ? arg3 : (langHint ? '' : (arg2 != null && arg2 !== 'fr' && arg2 !== 'tr' ? String(arg2) : ''));
                        return (core.translations[current]?.[key]
                            ?? core.translations.en?.[key]
                            ?? core.translations.ar?.[key]
                            ?? fb)
                            || key;
                    }
                }
                if (arg3 !== undefined && (arg2 === 'fr' || arg2 === 'tr')) {
                    return (core.translations[arg2]?.[key] ?? core.translations.en?.[key] ?? core.translations.ar?.[key] ?? String(arg3)) || key;
                }
                if (arg2 === 'fr' || arg2 === 'tr') {
                    return (core.translations[arg2]?.[key] ?? core.translations.en?.[key] ?? core.translations.ar?.[key] ?? '') || key;
                }
                return prev(key, arg2, arg3);
            };
            core.__extraLangPatched = true;
        }
        if (typeof core.applyLiteralTranslations === 'function' && !core.__literalFrTrPatched) {
            const prevLit = core.applyLiteralTranslations.bind(core);
            core.applyLiteralTranslations = function (root, lang) {
                const selected = lang || (global.AppState?.currentLanguage || localStorage.getItem('language') || 'ar');
                if (selected === 'fr' || selected === 'tr') {
                    // Use English literal map direction from Arabic when coming from AR UI strings
                    return prevLit(root, 'en');
                }
                return prevLit(root, lang);
            };
            core.__literalFrTrPatched = true;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(patchAppI18n, 0));
    } else {
        setTimeout(patchAppI18n, 0);
    }
    // Also try immediately if AppI18n already present
    patchAppI18n();

    global.HseI18nExtra = { SUPPORTED, LABELS, SHORT, nextLang, isRtl, label, shortLabel, CORE_FR, CORE_TR, patchAppI18n };
})(window);
