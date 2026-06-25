/**
 * safety-calendar-seeds.js — global HSE + Egypt (EG) default calendar seeds.
 */
(function (global) {
    const COLORS = {
        holiday: '#059669',
        occasion: '#D97706',
        hse_event: '#2563EB',
        custom: '#64748B',
        country: '#7C3AED'
    };

    function yearly(month, day, extra) {
        return Object.assign({ recurrence: { rule: 'yearly', month, day } }, extra || {});
    }

    const GLOBAL_EVENTS = [
        yearly(4, 28, {
            title: 'اليوم العالمي للسلامة والصحة في العمل',
            titleEn: 'World Day for Safety and Health at Work',
            eventType: 'hse_event', scope: 'global', countryCode: null,
            description: 'منظمة العمل الدولية — توعية ببيئة العمل الآمنة.'
        }),
        yearly(6, 5, {
            title: 'اليوم العالمي للبيئة',
            titleEn: 'World Environment Day',
            eventType: 'hse_event', scope: 'global', countryCode: null
        }),
        yearly(9, 16, {
            title: 'اليوم العالمي لحماية طبقة الأوزون',
            titleEn: 'International Day for the Preservation of the Ozone Layer',
            eventType: 'hse_event', scope: 'global', countryCode: null
        }),
        yearly(10, 16, {
            title: 'اليوم العالمي للغذاء',
            titleEn: 'World Food Day',
            eventType: 'hse_event', scope: 'global', countryCode: null
        }),
        yearly(12, 4, {
            title: 'اليوم العالمي للحماية من الكوارث',
            titleEn: 'International Day for Disaster Risk Reduction',
            eventType: 'hse_event', scope: 'global', countryCode: null
        }),
        yearly(5, 12, {
            title: 'اليوم العالمي للتمريض',
            titleEn: 'International Nurses Day',
            eventType: 'hse_event', scope: 'global', countryCode: null
        }),
        yearly(3, 20, {
            title: 'اليوم العالمي للسعادة',
            titleEn: 'International Day of Happiness',
            eventType: 'hse_event', scope: 'global', countryCode: null,
            description: 'توعية بالصحة النفسية في بيئة العمل.'
        })
    ];

    const EGYPT_EVENTS = [
        yearly(1, 7, {
            title: 'عيد الميلاد المجيد (القبطي)',
            titleEn: 'Coptic Christmas',
            eventType: 'holiday', scope: 'country', countryCode: 'EG'
        }),
        yearly(1, 25, {
            title: 'عيد الثورة 25 يناير',
            titleEn: '25 January Revolution',
            eventType: 'occasion', scope: 'country', countryCode: 'EG'
        }),
        { startDate: '2026-03-20', endDate: '2026-03-23', title: 'عيد الفطر المبارك', titleEn: 'Eid al-Fitr',
          eventType: 'holiday', scope: 'country', countryCode: 'EG', allDay: true, source: 'seed',
          description: 'تواريخ 2026 — يُحدَّث سنوياً من الإدارة.' },
        { startDate: '2026-04-20', endDate: '2026-04-20', title: 'شم النسيم', titleEn: 'Sham El-Nessim',
          eventType: 'occasion', scope: 'country', countryCode: 'EG', allDay: true, source: 'seed' },
        yearly(4, 25, {
            title: 'عيد تحرير سيناء',
            titleEn: 'Sinai Liberation Day',
            eventType: 'holiday', scope: 'country', countryCode: 'EG'
        }),
        yearly(5, 1, {
            title: 'عيد العمال',
            titleEn: 'Labour Day',
            eventType: 'holiday', scope: 'country', countryCode: 'EG'
        }),
        { startDate: '2026-05-27', endDate: '2026-05-30', title: 'عيد الأضحى المبارك', titleEn: 'Eid al-Adha',
          eventType: 'holiday', scope: 'country', countryCode: 'EG', allDay: true, source: 'seed',
          description: 'تواريخ 2026 — يُحدَّث سنوياً من الإدارة.' },
        yearly(6, 30, {
            title: 'عيد ثورة 30 يونيو',
            titleEn: '30 June Revolution',
            eventType: 'occasion', scope: 'country', countryCode: 'EG'
        }),
        yearly(7, 23, {
            title: 'عيد الثورة 23 يوليو',
            titleEn: '23 July Revolution',
            eventType: 'holiday', scope: 'country', countryCode: 'EG'
        }),
        yearly(10, 6, {
            title: 'عيد القوات المسلحة',
            titleEn: 'Armed Forces Day',
            eventType: 'holiday', scope: 'country', countryCode: 'EG'
        })
    ];

    function expandSeed(raw, year) {
        const y = year || new Date().getFullYear();
        const rec = raw.recurrence;
        let start = raw.startDate;
        let end = raw.endDate || raw.startDate;
        if (rec && rec.rule === 'yearly') {
            const m = String(rec.month).padStart(2, '0');
            const d = String(rec.day).padStart(2, '0');
            start = `${y}-${m}-${d}`;
            end = start;
        }
        const type = raw.eventType || 'custom';
        const color = type === 'holiday' || type === 'occasion'
            ? COLORS[type]
            : (raw.scope === 'country' ? COLORS.country : COLORS[type] || COLORS.custom);
        return {
            title: raw.title,
            titleEn: raw.titleEn || raw.title,
            eventType: type,
            scope: raw.scope || 'tenant',
            countryCode: raw.countryCode || null,
            startDate: start,
            endDate: end,
            allDay: raw.allDay !== false,
            color,
            description: raw.description || '',
            source: 'seed',
            recurrence: raw.recurrence || null
        };
    }

    const Seeds = {
        defaultCountry: 'EG',
        globalEvents() {
            return GLOBAL_EVENTS.map(e => expandSeed(e));
        },
        countryEvents(code) {
            if (code === 'EG') return EGYPT_EVENTS.map(e => expandSeed(e));
            return [];
        },
        allDefaults(countryCode) {
            const cc = countryCode || Seeds.defaultCountry;
            return Seeds.globalEvents().concat(Seeds.countryEvents(cc));
        }
    };

    global.SafetyCalendarSeeds = Seeds;
})(window);
