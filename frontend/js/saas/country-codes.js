/**
 * country-codes.js — dial codes for signup phone field
 */
(function (global) {
    const CODES = [
        { code: '+966', labelAr: 'السعودية', labelEn: 'Saudi Arabia', country: 'SA' },
        { code: '+20', labelAr: 'مصر', labelEn: 'Egypt', country: 'EG' },
        { code: '+971', labelAr: 'الإمارات', labelEn: 'UAE', country: 'AE' },
        { code: '+965', labelAr: 'الكويت', labelEn: 'Kuwait', country: 'KW' },
        { code: '+973', labelAr: 'البحرين', labelEn: 'Bahrain', country: 'BH' },
        { code: '+974', labelAr: 'قطر', labelEn: 'Qatar', country: 'QA' },
        { code: '+968', labelAr: 'عُمان', labelEn: 'Oman', country: 'OM' },
        { code: '+962', labelAr: 'الأردن', labelEn: 'Jordan', country: 'JO' },
        { code: '+961', labelAr: 'لبنان', labelEn: 'Lebanon', country: 'LB' },
        { code: '+964', labelAr: 'العراق', labelEn: 'Iraq', country: 'IQ' },
        { code: '+967', labelAr: 'اليمن', labelEn: 'Yemen', country: 'YE' },
        { code: '+963', labelAr: 'سوريا', labelEn: 'Syria', country: 'SY' },
        { code: '+970', labelAr: 'فلسطين', labelEn: 'Palestine', country: 'PS' },
        { code: '+218', labelAr: 'ليبيا', labelEn: 'Libya', country: 'LY' },
        { code: '+249', labelAr: 'السودان', labelEn: 'Sudan', country: 'SD' },
        { code: '+212', labelAr: 'المغرب', labelEn: 'Morocco', country: 'MA' },
        { code: '+216', labelAr: 'تونس', labelEn: 'Tunisia', country: 'TN' },
        { code: '+213', labelAr: 'الجزائر', labelEn: 'Algeria', country: 'DZ' },
        { code: '+90', labelAr: 'تركيا', labelEn: 'Turkey', country: 'TR' },
        { code: '+44', labelAr: 'بريطانيا', labelEn: 'UK', country: 'GB' },
        { code: '+1', labelAr: 'الولايات المتحدة', labelEn: 'USA', country: 'US' },
        { code: '+33', labelAr: 'فرنسا', labelEn: 'France', country: 'FR' },
        { code: '+49', labelAr: 'ألمانيا', labelEn: 'Germany', country: 'DE' },
        { code: '+91', labelAr: 'الهند', labelEn: 'India', country: 'IN' },
        { code: '+92', labelAr: 'باكستان', labelEn: 'Pakistan', country: 'PK' }
    ];

    function formatLabel(entry) {
        const lang = (global.SaaSI18n && global.SaaSI18n.lang) || document.documentElement.lang || 'ar';
        const name = lang === 'en' ? entry.labelEn : entry.labelAr;
        return `${name} (${entry.code})`;
    }

    global.SaaSCountryCodes = CODES;

    global.SaaSCountryCodes.fillSelect = function (selectEl, defaultCode) {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        CODES.forEach((c) => {
            const opt = document.createElement('option');
            opt.value = c.code;
            opt.textContent = formatLabel(c);
            selectEl.appendChild(opt);
        });
        if (defaultCode) selectEl.value = defaultCode;
    };

    global.SaaSCountryCodes.refreshLabels = function (selectEl) {
        if (!selectEl) return;
        const current = selectEl.value;
        global.SaaSCountryCodes.fillSelect(selectEl, current);
    };
})(window);
