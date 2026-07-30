/**
 * saas-industry-packs.js — Construction + Oil & Gas starter packs.
 * Rows tagged _demo=true and _pack=<id> so demo wipe can clear them.
 */
(function (global) {
    const now = () => new Date().toISOString();
    const day = (offset) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return d.toISOString().slice(0, 10);
    };

    function tag(row, packId) {
        return Object.assign({}, row, {
            _demo: true,
            source: 'demo',
            _pack: packId,
            createdAt: row.createdAt || now()
        });
    }

    const PACKS = {
        construction: {
            id: 'construction',
            titleAr: 'حزمة مقاولات / إنشاءات',
            titleEn: 'Construction pack',
            description: 'قوائم تحقق موقع + حوادث/PTW تجريبية لقطاع الإنشاءات'
        },
        oil_gas: {
            id: 'oil_gas',
            titleAr: 'حزمة نفط وغاز',
            titleEn: 'Oil & Gas pack',
            description: 'قوائم تحقق H2S/PTW + سجلات تجريبية لقطاع الطاقة'
        }
    };

    function constructionPack() {
        const id = 'construction';
        return {
            ComplianceChecklists: [
                tag({ id: 'pack-c-iso-4.1', framework: 'ISO45001', clause: '4.1', titleAr: 'سياق موقع الإنشاء', titleEn: 'Construction site context', status: 'open' }, id),
                tag({ id: 'pack-c-scaffold', framework: 'Construction', clause: 'SCAFFOLD', titleAr: 'تفتيش السقالات', titleEn: 'Scaffold inspection', status: 'open' }, id),
                tag({ id: 'pack-c-excavation', framework: 'Construction', clause: 'EXCAV', titleAr: 'أعمال الحفر', titleEn: 'Excavation controls', status: 'open' }, id),
                tag({ id: 'pack-c-workatheight', framework: 'Construction', clause: 'WAH', titleAr: 'العمل على ارتفاع', titleEn: 'Work at height', status: 'open' }, id)
            ],
            Incidents: [
                tag({
                    id: 'pack-c-incident-1',
                    title: 'سقوط مواد من سقالة (حزمة إنشاءات)',
                    date: day(-7),
                    severity: 'متوسط',
                    location: 'برج أ — طابق 3',
                    description: 'سجل تجريبي من حزمة الإنشاءات',
                    status: 'مفتوح'
                }, id)
            ],
            PTW: [
                tag({
                    id: 'pack-c-ptw-1',
                    permitNumber: 'PACK-C-PTW-001',
                    workType: 'عمل على ارتفاع',
                    location: 'واجهة المبنى',
                    startDate: day(0),
                    endDate: day(1),
                    status: 'مسودة'
                }, id)
            ],
            DailyObservations: [
                tag({
                    id: 'pack-c-obs-1',
                    title: 'PPE ناقص في منطقة الحفر (حزمة)',
                    date: day(-1),
                    location: 'حفرة B',
                    description: 'ملاحظة تجريبية',
                    status: 'مفتوحة'
                }, id)
            ]
        };
    }

    function oilGasPack() {
        const id = 'oil_gas';
        return {
            ComplianceChecklists: [
                tag({ id: 'pack-og-h2s', framework: 'OilGas', clause: 'H2S', titleAr: 'ضوابط H2S', titleEn: 'H2S controls', status: 'open' }, id),
                tag({ id: 'pack-og-ptw', framework: 'OilGas', clause: 'PTW', titleAr: 'نظام تصاريح العمل', titleEn: 'Permit to work system', status: 'open' }, id),
                tag({ id: 'pack-og-loto', framework: 'OilGas', clause: 'LOTO', titleAr: 'عزل الطاقة LOTO', titleEn: 'LOTO energy isolation', status: 'open' }, id),
                tag({ id: 'pack-og-iso-8.1', framework: 'ISO45001', clause: '8.1', titleAr: 'التحكم التشغيلي — منشأة', titleEn: 'Operational control — facility', status: 'open' }, id)
            ],
            Incidents: [
                tag({
                    id: 'pack-og-incident-1',
                    title: 'تسرب طفيف في خط عملية (حزمة نفط وغاز)',
                    date: day(-4),
                    severity: 'منخفض',
                    location: 'وحدة المعالجة',
                    description: 'سجل تجريبي من حزمة النفط والغاز',
                    status: 'مفتوح'
                }, id)
            ],
            NearMiss: [
                tag({
                    id: 'pack-og-nm-1',
                    title: 'اكتشاف غاز بالقرب من flange (حزمة)',
                    date: day(-2),
                    location: 'منطقة الضواغط',
                    description: 'وشيك تجريبي — لم تحدث إصابة',
                    status: 'مغلق'
                }, id)
            ],
            PTW: [
                tag({
                    id: 'pack-og-ptw-1',
                    permitNumber: 'PACK-OG-PTW-001',
                    workType: 'أعمال ساخنة',
                    location: 'وحدة التكرير',
                    startDate: day(0),
                    endDate: day(1),
                    status: 'مسودة'
                }, id)
            ],
            Training: [
                tag({
                    id: 'pack-og-train-1',
                    topic: 'توعية H2S (حزمة نفط وغاز)',
                    date: day(-14),
                    trainer: 'مدرب HSE',
                    duration: 4,
                    attendeesCount: 18,
                    status: 'مكتمل'
                }, id)
            ]
        };
    }

    function getPack(packId) {
        if (packId === 'construction') return constructionPack();
        if (packId === 'oil_gas') return oilGasPack();
        return null;
    }

    function listPacks() {
        return Object.keys(PACKS).map((k) => PACKS[k]);
    }

    global.SaaSIndustryPacks = {
        PACKS,
        listPacks,
        getPack,
        sheetNames(packId) {
            const p = getPack(packId);
            return p ? Object.keys(p) : [];
        }
    };
})(window);
