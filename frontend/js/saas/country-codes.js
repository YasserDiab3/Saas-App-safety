/**
 * country-codes.js — dial codes for signup phone field
 */
(function (global) {
    global.SaaSCountryCodes = [
        { code: '+966', label: '🇸🇦 +966', country: 'SA' },
        { code: '+971', label: '🇦🇪 +971', country: 'AE' },
        { code: '+965', label: '🇰🇼 +965', country: 'KW' },
        { code: '+973', label: '🇧🇭 +973', country: 'BH' },
        { code: '+974', label: '🇶🇦 +974', country: 'QA' },
        { code: '+968', label: '🇴🇲 +968', country: 'OM' },
        { code: '+962', label: '🇯🇴 +962', country: 'JO' },
        { code: '+961', label: '🇱🇧 +961', country: 'LB' },
        { code: '+20', label: '🇪🇬 +20', country: 'EG' },
        { code: '+212', label: '🇲🇦 +212', country: 'MA' },
        { code: '+216', label: '🇹🇳 +216', country: 'TN' },
        { code: '+213', label: '🇩🇿 +213', country: 'DZ' },
        { code: '+964', label: '🇮🇶 +964', country: 'IQ' },
        { code: '+967', label: '🇾🇪 +967', country: 'YE' },
        { code: '+90', label: '🇹🇷 +90', country: 'TR' },
        { code: '+44', label: '🇬🇧 +44', country: 'GB' },
        { code: '+1', label: '🇺🇸 +1', country: 'US' },
        { code: '+33', label: '🇫🇷 +33', country: 'FR' },
        { code: '+49', label: '🇩🇪 +49', country: 'DE' },
        { code: '+91', label: '🇮🇳 +91', country: 'IN' },
        { code: '+92', label: '🇵🇰 +92', country: 'PK' }
    ];

    global.SaaSCountryCodes.fillSelect = function (selectEl, defaultCode) {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        (global.SaaSCountryCodes || []).forEach((c) => {
            const opt = document.createElement('option');
            opt.value = c.code;
            opt.textContent = c.label;
            selectEl.appendChild(opt);
        });
        if (defaultCode) selectEl.value = defaultCode;
    };
})(window);
