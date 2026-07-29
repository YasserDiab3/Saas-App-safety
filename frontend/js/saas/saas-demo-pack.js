/**
 * saas-demo-pack.js — small demo datasets tagged source=demo / _demo=true.
 */
(function (global) {
    const now = () => new Date().toISOString();
    const day = (offset) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return d.toISOString().slice(0, 10);
    };

    function pack() {
        return {
            ClinicVisits: [
                {
                    id: 'demo-clinic-visit-1',
                    employeeName: 'أحمد محمد (تجريبي)',
                    employeeCode: 'DEMO-E001',
                    visitDate: day(-2),
                    visitType: 'كشف روتيني',
                    diagnosis: 'صداع خفيف',
                    treatment: 'راحة ومسكن عند الحاجة',
                    personType: 'employee',
                    createdAt: now()
                },
                {
                    id: 'demo-clinic-visit-2',
                    employeeName: 'سارة علي (تجريبي)',
                    employeeCode: 'DEMO-E002',
                    visitDate: day(-1),
                    visitType: 'متابعة',
                    diagnosis: 'التهاب حلق',
                    treatment: 'مضاد حيوي حسب الوصفة',
                    personType: 'employee',
                    createdAt: now()
                }
            ],
            Incidents: [
                {
                    id: 'demo-incident-1',
                    title: 'انزلاق في منطقة التخزين (تجريبي)',
                    date: day(-5),
                    severity: 'متوسط',
                    location: 'مستودع أ',
                    description: 'بيانات تجريبية للمعاينة فقط',
                    status: 'مفتوح',
                    createdAt: now()
                }
            ],
            NearMiss: [
                {
                    id: 'demo-nearmiss-1',
                    title: 'سقوط أداة من ارتفاع (تجريبي)',
                    date: day(-3),
                    location: 'ورشة الصيانة',
                    description: 'ملاحظة تجريبية — لم تحدث إصابة',
                    status: 'مغلق',
                    createdAt: now()
                }
            ],
            Violations: [
                {
                    id: 'demo-violation-1',
                    employeeName: 'خالد حسن (تجريبي)',
                    violationType: 'عدم ارتداء PPE',
                    date: day(-4),
                    description: 'مخالفة تجريبية للمعاينة',
                    status: 'مسجّلة',
                    createdAt: now()
                }
            ],
            Training: [
                {
                    id: 'demo-training-1',
                    topic: 'التوعية بالسلامة العامة (تجريبي)',
                    date: day(-10),
                    trainer: 'مدرب تجريبي',
                    duration: 2,
                    attendeesCount: 12,
                    status: 'مكتمل',
                    createdAt: now()
                }
            ],
            Contractors: [
                {
                    id: 'demo-contractor-1',
                    companyName: 'شركة النور للمقاولات (تجريبي)',
                    serviceType: 'صيانة ميكانيكية',
                    contactName: 'محمود سعيد',
                    phone: '01000000000',
                    status: 'active',
                    createdAt: now()
                }
            ],
            Employees: [
                {
                    id: 'demo-employee-1',
                    name: 'أحمد محمد (تجريبي)',
                    employeeCode: 'DEMO-E001',
                    department: 'الإنتاج',
                    position: 'فني',
                    active: true,
                    createdAt: now()
                },
                {
                    id: 'demo-employee-2',
                    name: 'سارة علي (تجريبي)',
                    employeeCode: 'DEMO-E002',
                    department: 'الجودة',
                    position: 'مفتش',
                    active: true,
                    createdAt: now()
                }
            ],
            PTW: [
                {
                    id: 'demo-ptw-1',
                    permitNumber: 'DEMO-PTW-001',
                    workType: 'أعمال ساخنة',
                    location: 'منطقة اللحام',
                    startDate: day(0),
                    endDate: day(1),
                    status: 'مسودة',
                    createdAt: now()
                }
            ],
            DailyObservations: [
                {
                    id: 'demo-obs-1',
                    title: 'ملاحظة سلامة يومية (تجريبي)',
                    date: day(-1),
                    location: 'خط الإنتاج 2',
                    description: 'ملاحظة تجريبية للمعاينة',
                    status: 'مفتوحة',
                    createdAt: now()
                }
            ]
        };
    }

    global.SaaSDemoPack = {
        getPack: pack,
        sheetNames() {
            return Object.keys(pack());
        }
    };
})(window);
