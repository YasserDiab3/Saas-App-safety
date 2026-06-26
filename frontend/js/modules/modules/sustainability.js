/**
 * Sustainability Module - Environmental Resource Management
 * مديول الاستدامة البيئية - إدارة استهلاك الموارد
 * 
 * Features:
 * - Resource Consumption Registers (Water, Electricity, Natural Gas)
 * - Monitoring & Analytics
 * - Smart Alerts
 * - Sustainability Dashboard
 * - Permission Management
 */

const Sustainability = {
    currentTab: 'dashboard',
    currentWasteSubTab: 'regular',
    /** سنة العرض لتصفية لوحة التحليل وسجلات المياه/الكهرباء/الغاز (مثل مؤشرات السلامة والعمالة الخارجية) */
    dashboardYear: new Date().getFullYear(),
    settings: {
        consumptionLimits: {
            water: 10000,      // م³ شهرياً
            electricity: 50000, // كيلووات شهرياً
            gas: 30000         // م³ شهرياً
        },
        alertThreshold: 1.2   // 120% من المتوسط
    },

    /**
     * إدارة كاملة للاستدامة: مخلفات، إعدادات، تعديل/حذف سجلات الموارد
     */
    hasFullSustainabilityManage() {
        if (typeof AppState === 'undefined' || !AppState.currentUser) return false;
        const user = AppState.currentUser;
        if (user.role === 'admin' || user.role === 'مدير النظام') return true;
        if (typeof Permissions !== 'undefined') {
            if (Permissions.isCurrentUserEffectiveAdmin(user)) return true;
            const perms = Permissions.getEffectivePermissions(user);
            if (perms.__isAdmin || perms['admin'] === true) return true;
            if (perms['sustainability-manage'] === true) return true;
            const allowed = Permissions.getAllowedDetailedPermissions('sustainability');
            return Array.isArray(allowed) && allowed.includes('full-manage');
        }
        return false;
    },

    /**
     * إضافة سجلات استهلاك المياه/الكهرباء/الغاز وعرض لوحة التحليل والسجلات
     */
    canRegisterResourceConsumption() {
        if (typeof AppState === 'undefined' || !AppState.currentUser) return false;
        if (typeof Permissions !== 'undefined' && !Permissions.hasAccess('sustainability')) return false;
        if (this.hasFullSustainabilityManage()) return true;
        if (typeof Permissions !== 'undefined') {
            const allowed = Permissions.getAllowedDetailedPermissions('sustainability');
            return Array.isArray(allowed) && allowed.includes('consumption-register');
        }
        return false;
    },

    /** توافقاً مع الخطة — عرض واجهة استهلاك الموارد */
    canViewSustainabilityConsumptionUi() {
        return this.canRegisterResourceConsumption();
    },

    /** مدير المديول (إدارة كاملة) — توافق مع الكود السابق */
    isAdmin() {
        return this.hasFullSustainabilityManage();
    },

    canEdit() {
        return this.hasFullSustainabilityManage();
    },

    canDelete() {
        return this.hasFullSustainabilityManage();
    },

    canManageSettings() {
        return this.hasFullSustainabilityManage();
    },

    /**
     * السنوات المتاحة في القائمة (من البيانات + نطاق حول السنة الحالية)
     */
    getSustainabilityYearOptions() {
        const ySet = new Set();
        const cur = new Date().getFullYear();
        for (let d = -3; d <= 1; d++) ySet.add(cur + d);
        ['water', 'electricity', 'gas'].forEach((k) => {
            (AppState.appData.resourceConsumption?.[k] || []).forEach((r) => {
                const dt = new Date(r?.date);
                if (!Number.isNaN(dt.getTime())) {
                    const ty = dt.getFullYear();
                    if (ty > 2000 && ty < 2100) ySet.add(ty);
                }
            });
        });
        return Array.from(ySet).sort((a, b) => b - a);
    },

    ensureDashboardYearInRange() {
        const years = this.getSustainabilityYearOptions();
        if (!years.length) {
            this.dashboardYear = new Date().getFullYear();
            return;
        }
        if (!years.includes(this.dashboardYear)) {
            this.dashboardYear = years.includes(new Date().getFullYear())
                ? new Date().getFullYear()
                : years[0];
        }
    },

    filterResourceRowsByYear(records, year) {
        const y = Number(year);
        if (!Number.isFinite(y)) return records || [];
        return (records || []).filter((r) => {
            const dt = new Date(r?.date);
            return !Number.isNaN(dt.getTime()) && dt.getFullYear() === y;
        });
    },

    /** بيانات الاستهلاك المصفّاة حسب سنة العرض الحالية */
    getViewFilteredConsumption() {
        const rc = AppState.appData.resourceConsumption || { water: [], electricity: [], gas: [] };
        const year = Number(this.dashboardYear) || new Date().getFullYear();
        return {
            year,
            water: this.filterResourceRowsByYear(rc.water, year),
            electricity: this.filterResourceRowsByYear(rc.electricity, year),
            gas: this.filterResourceRowsByYear(rc.gas, year)
        };
    },

    renderYearFilterToolbarHtml() {
        const show =
            this.canRegisterResourceConsumption() &&
            ['dashboard', 'water', 'electricity', 'gas'].includes(this.currentTab);
        if (!show) return '';
        this.ensureDashboardYearInRange();
        const years = this.getSustainabilityYearOptions();
        const opts = years
            .map((y) => `<option value="${y}" ${y === this.dashboardYear ? 'selected' : ''}>${y}</option>`)
            .join('');
        return `
            <div id="sustainability-year-toolbar-wrap" class="mt-4 mb-2">
                <div class="rounded-2xl border border-emerald-200/80 dark:border-emerald-800/60 bg-gradient-to-l from-emerald-50/90 via-white to-white dark:from-emerald-950/40 dark:via-gray-900 dark:to-gray-900 shadow-sm">
                    <div class="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
                        <div class="flex items-start gap-3 min-w-0 flex-1">
                            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md">
                                <i class="fas fa-calendar-alt" aria-hidden="true"></i>
                            </div>
                            <div class="min-w-0">
                                <div class="text-sm font-bold text-gray-900 dark:text-gray-100">تصفية حسب السنة</div>
                                <p class="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                                    عرض مؤشرات لوحة التحليل، الرسوم البيانية، وأكثر المواقع استهلاكاً والجداول للسنة المحددة — بنفس أسلوب لوحة مؤشرات السلامة والعمالة الخارجية.
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 shrink-0">
                            <label for="sustainability-dashboard-year" class="text-sm font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">السنة</label>
                            <select id="sustainability-dashboard-year" class="form-input !w-auto min-w-[132px] rounded-xl border-gray-200 dark:border-gray-600 shadow-sm focus:ring-emerald-500 focus:border-emerald-500" title="اختر سنة العرض">
                                ${opts}
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * تحديث الواجهة بعد تغيير سنة العرض دون إعادة تحميل الشيت.
     */
    refreshConsumptionYearView() {
        this.ensureDashboardYearInRange();
        const qs = document.getElementById('sustainability-quick-stats');
        if (qs) qs.innerHTML = this.renderQuickStats();
        const sel = document.getElementById('sustainability-dashboard-year');
        if (sel && String(sel.value) !== String(this.dashboardYear)) {
            sel.value = String(this.dashboardYear);
        }
        const contentArea = document.getElementById('sustainability-content');
        if (!contentArea || !document.getElementById('sustainability-section')) return;
        Promise.resolve(this.renderContent())
            .then((html) => {
                contentArea.innerHTML = html;
                if (this.currentTab === 'dashboard') {
                    setTimeout(() => this.renderCharts(), 280);
                }
            })
            .catch((e) => Utils.safeWarn('⚠️ تعذر تحديث عرض السنة:', e));
    },

    /**
     * مدير النظام فقط (لا يشمل صلاحية sustainability-manage أو full-manage لوحدها).
     */
    isSystemAdmin() {
        if (typeof AppState === 'undefined' || !AppState.currentUser) return false;
        const user = AppState.currentUser;
        const role = String(user.role || '').trim().toLowerCase();
        if (role === 'admin' || user.role === 'مدير النظام') return true;
        if (typeof Permissions !== 'undefined') {
            if (Permissions.isCurrentUserEffectiveAdmin(user)) return true;
            const perms = Permissions.getEffectivePermissions(user);
            if (perms && (perms.__isAdmin === true || perms.admin === true)) return true;
        }
        return false;
    },

    renderAdminImportExportToolbarHtml() {
        if (!this.isSystemAdmin()) return '';
        return `
            <div class="inline-flex flex-wrap items-center gap-2 sustainability-admin-tools mr-2 md:mr-3" id="sustainability-admin-tools-wrap">
                <button type="button" class="btn btn-secondary" id="sustainability-excel-import-open-btn" title="استيراد من Excel">
                    <i class="fas fa-file-excel ml-2"></i>استيراد من Excel
                </button>
                <button type="button" class="btn btn-secondary" id="sustainability-export-pdf-btn" title="تصدير تقرير PDF">
                    <i class="fas fa-file-pdf ml-2"></i>تصدير PDF
                </button>
            </div>
        `;
    },

    /**
     * نموذج (modal) لاستيراد Excel مع تحميل القالب واختيار الملف.
     */
    showExcelImportModal() {
        if (!this.isSystemAdmin()) return;
        try {
            document.getElementById('sustainability-excel-import-modal')?.remove();
        } catch (e) { /* ignore */ }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'sustainability-excel-import-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 480px;">
                <div class="modal-header">
                    <h2 class="modal-title"><i class="fas fa-file-excel ml-2 text-green-600"></i>استيراد من Excel</h2>
                    <button type="button" class="modal-close sustainability-excel-modal-close" aria-label="إغلاق"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body space-y-4">
                    <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        حمّل القالب أولاً، عبّئ الصفوف وفق الأعمدة، ثم اختر الملف بصيغة .xlsx أو .xls. الأنواع المسموحة في عمود نوع_الموارد: <strong>water</strong> أو <strong>electricity</strong> أو <strong>gas</strong> (أو المكافئ بالعربية).
                    </p>
                    <input type="file" id="sustainability-modal-excel-file-input" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" class="hidden" tabindex="-1" aria-hidden="true">
                    <div class="flex flex-col sm:flex-row gap-2 flex-wrap">
                        <button type="button" id="sustainability-modal-download-template" class="btn-secondary flex-1 min-w-[10rem]">
                            <i class="fas fa-download ml-2"></i>تحميل قالب الاستيراد
                        </button>
                        <button type="button" id="sustainability-modal-pick-file" class="btn-primary flex-1 min-w-[10rem]">
                            <i class="fas fa-folder-open ml-2"></i>اختيار ملف Excel
                        </button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary sustainability-excel-modal-close">إغلاق</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const close = () => {
            try { modal.remove(); } catch (e) { /* ignore */ }
        };
        modal.querySelectorAll('.sustainability-excel-modal-close').forEach((el) => el.addEventListener('click', close));
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

        const fileInput = modal.querySelector('#sustainability-modal-excel-file-input');
        modal.querySelector('#sustainability-modal-download-template').addEventListener('click', () => this.downloadExcelImportTemplate());
        modal.querySelector('#sustainability-modal-pick-file').addEventListener('click', () => fileInput?.click());

        if (fileInput) {
            fileInput.addEventListener('change', async () => {
                const f = fileInput.files && fileInput.files[0];
                fileInput.value = '';
                if (!f) return;
                close();
                if (typeof Loading !== 'undefined') Loading.show('جاري استيراد Excel...');
                try {
                    await this.importResourceConsumptionFromExcelFile(f);
                } finally {
                    if (typeof Loading !== 'undefined') Loading.hide();
                }
            });
        }
    },

    async ensureSheetJS() {
        if (typeof XLSX !== 'undefined') return;
        if (this._sheetJsPromise) {
            await this._sheetJsPromise;
            return;
        }
        this._sheetJsPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
            script.onload = () => resolve();
            script.onerror = () => {
                const s2 = document.createElement('script');
                s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                s2.onload = () => resolve();
                s2.onerror = () => {
                    this._sheetJsPromise = null;
                    reject(new Error('فشل تحميل مكتبة Excel'));
                };
                document.head.appendChild(s2);
            };
            document.head.appendChild(script);
        });
        await this._sheetJsPromise;
    },

    downloadExcelImportTemplate() {
        this.ensureSheetJS().then(() => {
            const headers = [
                'نوع_الموارد',
                'التاريخ',
                'الموقع_المصنع',
                'المصدر',
                'قراءة_البداية',
                'قراءة_النهاية',
                'وحدة_القياس',
                'القسم',
                'ملاحظات'
            ];
            const example = {
                نوع_الموارد: 'water',
                التاريخ: new Date().toISOString().slice(0, 10),
                الموقع_المصنع: 'اسم المصنع أو الموقع كما في الإعدادات',
                المصدر: 'مياه',
                قراءة_البداية: 0,
                قراءة_النهاية: 100,
                وحدة_القياس: 'م³',
                القسم: '',
                ملاحظات: 'أدخل water أو electricity أو gas في عمود نوع_الموارد'
            };
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet([example], { header: headers });
            XLSX.utils.book_append_sheet(wb, ws, 'الاستيراد');
            XLSX.writeFile(wb, `قالب_استيراد_الاستدامة_${new Date().toISOString().slice(0, 10)}.xlsx`);
            if (typeof Notification !== 'undefined') Notification.success('تم تنزيل القالب');
        }).catch((e) => {
            Utils.safeWarn('⚠️ تعذر تحميل مكتبة Excel:', e);
            if (typeof Notification !== 'undefined') Notification.error('تعذر تحميل مكتبة Excel للقالب');
        });
    },

    _parseResourceTypeFromExcelCell(val) {
        const v = String(val == null ? '' : val).trim().toLowerCase();
        if (!v) return null;
        if (['water', 'w', 'مياه', 'water_management'].includes(v)) return 'water';
        if (['electricity', 'electric', 'e', 'elc', 'كهرباء'].includes(v)) return 'electricity';
        if (['gas', 'g', 'غاز', 'غاز طبيعي', 'natural gas', 'natural_gas'].includes(v)) return 'gas';
        return null;
    },

    _normalizeExcelRowKeys(row) {
        const out = {};
        const aliases = {
            نوع_الموارد: 'type', resource_type: 'type', نوع: 'type', type: 'type',
            التاريخ: 'date', date: 'date',
            الموقع_المصنع: 'location', location: 'location', موقع: 'location', المصنع: 'location',
            المصدر: 'source', source: 'source',
            قراءة_البداية: 'startReading', start_reading: 'startReading', بداية: 'startReading',
            قراءة_النهاية: 'endReading', end_reading: 'endReading', نهاية: 'endReading',
            إجمالي_الاستهلاك: 'totalConsumption', total: 'totalConsumption',
            وحدة_القياس: 'unit', unit: 'unit',
            القسم: 'department', department: 'department', جهة: 'department',
            ملاحظات: 'notes', notes: 'notes'
        };
        Object.keys(row || {}).forEach((k) => {
            const raw = String(k || '').trim();
            const nk = aliases[raw] || aliases[raw.replace(/\s+/g, '_')] || raw;
            out[nk] = row[k];
        });
        return out;
    },

    async importResourceConsumptionFromExcelFile(file) {
        if (!this.isSystemAdmin()) {
            if (typeof Notification !== 'undefined') Notification.error('غير مصرّح');
            return;
        }
        if (!file) return;
        await this.ensureSheetJS();
        const buf = await file.arrayBuffer();
        const workbook = XLSX.read(buf, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        if (!rows.length) {
            if (typeof Notification !== 'undefined') Notification.warning('الملف فارغ أو لا يحتوي صفوفاً');
            return;
        }

        if (!AppState.appData.resourceConsumption) {
            AppState.appData.resourceConsumption = { water: [], electricity: [], gas: [] };
        }
        ['water', 'electricity', 'gas'].forEach((t) => {
            if (!Array.isArray(AppState.appData.resourceConsumption[t])) AppState.appData.resourceConsumption[t] = [];
        });

        let ok = 0;
        let skipped = 0;
        const errs = [];
        /** لتصفية الدُفعة من الذاكرة إذا فشل الحفظ في الشيت */
        const importedIdsByType = { water: [], electricity: [], gas: [] };

        rows.forEach((rawRow, idx) => {
            const row = this._normalizeExcelRowKeys(rawRow);
            const type = this._parseResourceTypeFromExcelCell(row.type);
            const dateStr = row.date != null && row.date !== '' ? String(row.date).trim() : '';
            const location = row.location != null ? String(row.location).trim() : '';
            if (!type || !dateStr || !location) {
                skipped++;
                errs.push(`صف ${idx + 2}: نقص في النوع أو التاريخ أو الموقع`);
                return;
            }
            let d = new Date(dateStr);
            if (isNaN(d.getTime())) {
                skipped++;
                errs.push(`صف ${idx + 2}: تاريخ غير صالح`);
                return;
            }
            const startReading = parseFloat(row.startReading);
            const endReading = parseFloat(row.endReading);
            if (!Number.isFinite(startReading) || !Number.isFinite(endReading)) {
                skipped++;
                errs.push(`صف ${idx + 2}: قراءات غير رقمية`);
                return;
            }
            if (endReading < startReading) {
                skipped++;
                errs.push(`صف ${idx + 2}: قراءة النهاية أقل من البداية`);
                return;
            }
            let totalConsumption = parseFloat(row.totalConsumption);
            if (!Number.isFinite(totalConsumption)) totalConsumption = endReading - startReading;

            const unit = String(row.unit || this.getDefaultUnit(type)).trim() || this.getDefaultUnit(type);
            const source = String(row.source || this.getTypeName(type)).trim() || this.getTypeName(type);
            const department = row.department != null ? String(row.department).trim() : '';
            const notes = row.notes != null ? String(row.notes).trim() : '';
            const monthYear = this.getMonthYear(d);

            const id = Utils.generateId(type.toUpperCase().substring(0, 3));
            const serialNumber = this.generateSerialNumber(type);
            const hasAlert = this.checkConsumptionAlert(type, totalConsumption, monthYear);

            const formData = {
                id,
                serialNumber,
                date: d.toISOString(),
                monthYear,
                location,
                source,
                startReading,
                endReading,
                totalConsumption,
                unit,
                department,
                notes,
                hasAlert,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: AppState.currentUser?.email || AppState.currentUser?.name || 'System',
                updatedBy: AppState.currentUser?.email || AppState.currentUser?.name || 'System'
            };
            AppState.appData.resourceConsumption[type].push(formData);
            importedIdsByType[type].push(formData.id);
            ok++;
        });

        if (ok === 0) {
            if (typeof Notification !== 'undefined') {
                Notification.warning('لم يُستورد أي صف صالح.' + (skipped ? ` تخطّي ${skipped} صفًا.` : ''));
                if (errs.length && errs.length <= 8) errs.forEach((m) => Notification.warning(m));
                else if (errs.length > 8) Notification.warning('راجع القالب والبيانات.');
            }
            return;
        }

        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        }

        const saveResult = await this.saveResourceConsumptionToSheets();
        if (!saveResult.success) {
            ['water', 'electricity', 'gas'].forEach((t) => {
                const drop = new Set(importedIdsByType[t] || []);
                if (!drop.size || !Array.isArray(AppState.appData.resourceConsumption[t])) return;
                AppState.appData.resourceConsumption[t] = AppState.appData.resourceConsumption[t].filter((r) => !drop.has(r.id));
            });
            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }
            if (typeof Notification !== 'undefined') {
                Notification.error(
                    'فشل حفظ الاستيراد في الخادم — لم تُسجَّل البيانات في قاعدة الشيت. ' +
                        (saveResult.message || saveResult.error || '')
                );
                if (errs.length && errs.length <= 8) errs.forEach((m) => Notification.warning(m));
            }
            await this.loadResourceConsumptionFromSheets().catch(() => {});
            this.load();
            return;
        }

        if (typeof Notification !== 'undefined') {
            Notification.success(`تم استيراد ${ok} سجلًا وحفظها في الخادم${skipped ? ` — تخطّي ${skipped}` : ''}`);
            if (errs.length && errs.length <= 8) errs.forEach((m) => Notification.warning(m));
            else if (errs.length > 8) Notification.warning('بعض الصفوف لم تُستورد — راجع القالب والبيانات.');
        }
        await this.loadResourceConsumptionFromSheets().catch(() => {});
        this.load();
    },

    exportSustainabilityPdfReport() {
        if (!this.isSystemAdmin()) {
            if (typeof Notification !== 'undefined') Notification.error('غير مصرّح');
            return;
        }
        if (Sustainability._pdfExportInProgress) return;
        Sustainability._pdfExportInProgress = true;
        try {
            if (typeof Loading !== 'undefined') Loading.show('جاري تجهيز PDF...');
            const esc = (s) => (typeof Utils !== 'undefined' && Utils.escapeHTML ? Utils.escapeHTML(String(s == null ? '' : s)) : String(s == null ? '' : s));
            const fmtDate = (iso) => {
                try {
                    return Utils.formatDate ? Utils.formatDate(iso) : String(iso || '');
                } catch (e) {
                    return String(iso || '');
                }
            };
            const fv = this.getViewFilteredConsumption();
            const rc = { water: fv.water, electricity: fv.electricity, gas: fv.gas };
            const pdfYear = fv.year;
            const types = [
                { key: 'water', label: 'المياه' },
                { key: 'electricity', label: 'الكهرباء' },
                { key: 'gas', label: 'الغاز الطبيعي' }
            ];
            let body = '';
            types.forEach(({ key, label }) => {
                const arr = Array.isArray(rc[key]) ? rc[key] : [];
                body += `<h2 style="margin-top:1.25em;margin-bottom:10px;font-size:15px;font-weight:700;color:#0f172a;border-bottom:2px solid #003865;padding-bottom:8px;">سجلات استهلاك — ${esc(label)} — سنة ${pdfYear} <span style="color:#64748b;font-weight:600;">(${arr.length})</span></h2>`;
                body += '<table class="report-table" style="width:100%;font-size:12px;margin-bottom:14px;"><thead><tr>';
                ['الرقم', 'التاريخ', 'الموقع', 'البداية', 'النهاية', 'الإجمالي', 'الوحدة', 'القسم'].forEach((h) => {
                    body += `<th style="padding:8px;text-align:right;">${esc(h)}</th>`;
                });
                body += '</tr></thead><tbody>';
                arr.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 500).forEach((r) => {
                    body += '<tr>';
                    [r.serialNumber || r.id, fmtDate(r.date), r.location, r.startReading, r.endReading, r.totalConsumption, r.unit, r.department || '-'].forEach((c) => {
                        body += `<td style="padding:6px;text-align:right;">${esc(c)}</td>`;
                    });
                    body += '</tr>';
                });
                body += '</tbody></table>';
                if (arr.length > 500) body += `<p style="font-size:11px;color:#64748b;margin-bottom:12px;">عرض أحدث 500 سجل لكل نوع ضمن التصدير.</p>`;
            });

            const waste = AppState.appData.wasteManagement;
            if (waste && this.hasFullSustainabilityManage()) {
                const rw = (waste.regularWasteRecords || []).length;
                const hw = (waste.hazardousWasteRecords || []).length;
                const sl = (waste.regularWasteSales || []).length;
                body += `<h2 style="margin-top:1.25em;margin-bottom:10px;font-size:15px;font-weight:700;color:#0f172a;border-bottom:2px solid #003865;padding-bottom:8px;">ملخص المخلفات</h2>`;
                body += `<p style="font-size:13px;line-height:1.7;color:#334155;">سجلات عادية: <strong>${rw}</strong> | خطرة: <strong>${hw}</strong> | مبيعات: <strong>${sl}</strong></p>`;
            }

            const title = `تقرير الاستدامة البيئية — استهلاك الموارد (${pdfYear})`;
            const exportTs = new Date();
            let exportTsStr = '';
            try {
                exportTsStr = typeof Utils !== 'undefined' && Utils.formatDateTime
                    ? Utils.formatDateTime(exportTs, 'ar-EG')
                    : exportTs.toLocaleString('ar-SA');
            } catch (e) {
                exportTsStr = exportTs.toLocaleString('ar-SA');
            }

            const innerContent = `
                <div style="margin-bottom:18px;padding:14px 16px;border-radius:14px;background:linear-gradient(135deg,rgba(16,185,129,0.14),rgba(5,150,105,0.06));border:1px solid rgba(16,185,129,0.3);">
                    <p style="margin:0;font-size:13px;line-height:1.85;color:#0f172a;">
                        يتضمن هذا المستند سجلات استهلاك الموارد البيئية (مياه، كهرباء، غاز طبيعي) للسنة <strong>${esc(String(pdfYear))}</strong>
                        ${this.hasFullSustainabilityManage() ? ' مع ملخص إحصائي لإدارة المخلفات.' : '.'}
                        استخدم «طباعة» ثم «حفظ كـ PDF» من المتصفح عند الحاجة.
                    </p>
                </div>
                ${body}`;

            let htmlContent;
            if (typeof PDFTemplates !== 'undefined' && PDFTemplates.buildDocument) {
                htmlContent = PDFTemplates.buildDocument({
                    title,
                    formCode: 'SUST-ENV-RC',
                    content: innerContent,
                    createdAt: exportTs,
                    updatedAt: exportTs,
                    meta: {
                        'سنة التقرير': String(pdfYear),
                        'تاريخ التصدير': exportTsStr,
                        'مصدر التقرير': 'مديول الاستدامة البيئية'
                    },
                    includeQRCode: true,
                    qrData: `HSE Sustainability | ResourceConsumption | Year:${pdfYear} | ${exportTs.toISOString()}`
                });
            } else {
                Utils.safeWarn('PDFTemplates غير متاح — تصدير PDF بقالب مبسّط');
                htmlContent = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<style>
body{font-family:Tahoma,Arial,sans-serif;padding:16px;color:#111;}
h1{font-size:18px;margin:0 0 12px;}
table{font-family:inherit;}
@media print { body { padding: 0; } }
</style><title>${esc(title)}</title></head><body>
<h1>${esc(title)}</h1>
<p style="font-size:12px;color:#444;margin-bottom:16px;">سنة التقرير: <strong>${pdfYear}</strong> — تاريخ التصدير: ${esc(exportTsStr)}</p>
${innerContent}
</body></html>`;
            }

            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const winName = 'hse_sustainability_pdf_export';
            const printWindow = window.open(url, winName);
            let printed = false;
            const finishPrint = () => {
                if (printed || !printWindow || printWindow.closed) return;
                printed = true;
                try {
                    printWindow.focus();
                    printWindow.print();
                } catch (e) { /* ignore */ }
                setTimeout(() => {
                    try { URL.revokeObjectURL(url); } catch (e2) { /* ignore */ }
                    if (typeof Loading !== 'undefined') Loading.hide();
                    if (typeof Notification !== 'undefined') Notification.success('استخدم «حفظ كـ PDF» من نافذة الطباعة إن لزم');
                }, 400);
            };

            if (printWindow) {
                printWindow.onload = () => finishPrint();
                setTimeout(() => {
                    if (!printed && printWindow.document && printWindow.document.readyState === 'complete') finishPrint();
                }, 500);
            } else {
                try { URL.revokeObjectURL(url); } catch (e3) { /* ignore */ }
                if (typeof Loading !== 'undefined') Loading.hide();
                if (typeof Notification !== 'undefined') Notification.error('يرجى السماح بالنوافذ المنبثقة لعرض PDF');
            }
        } catch (error) {
            if (typeof Loading !== 'undefined') Loading.hide();
            Utils.safeError('خطأ تصدير PDF الاستدامة:', error);
            if (typeof Notification !== 'undefined') Notification.error('فشل تصدير PDF: ' + (error.message || ''));
        } finally {
            setTimeout(() => { Sustainability._pdfExportInProgress = false; }, 1200);
        }
    },

    bindAdminImportExportToolbar() {
        if (!this.isSystemAdmin()) return;
        // مستمع واحد على المستند لتجنّب تكرار الربط عند كل Sustainability.load() (كان يفتح عدة نوافذ PDF)
        if (Sustainability._adminToolbarDocDelegateBound) return;
        Sustainability._adminToolbarDocDelegateBound = true;
        document.addEventListener('click', (ev) => {
            const excelBtn = ev.target.closest && ev.target.closest('#sustainability-excel-import-open-btn');
            if (excelBtn) {
                ev.preventDefault();
                Sustainability.showExcelImportModal();
                return;
            }
            const pdfBtn = ev.target.closest && ev.target.closest('#sustainability-export-pdf-btn');
            if (pdfBtn) {
                ev.preventDefault();
                Sustainability.exportSustainabilityPdfReport();
            }
        });
    },

    /**
     * مصفوفة المواقع الخام (مع الأماكن الفرعية) بنفس ترتيب الأولوية المستخدم في إعدادات النماذج.
     * مهم: لا نعتمد على formSettingsState.sites إن كانت مصفوفة فارغة — وإلا تُحجب البيانات من observationSites أو الافتراضيات.
     */
    _resolveSitesFromHierarchy() {
        try {
            if (typeof Permissions !== 'undefined' && Permissions.formSettingsState &&
                Array.isArray(Permissions.formSettingsState.sites) &&
                Permissions.formSettingsState.sites.length > 0) {
                return Permissions.formSettingsState.sites;
            }
            if (typeof AppState !== 'undefined' && Array.isArray(AppState.appData?.observationSites) &&
                AppState.appData.observationSites.length > 0) {
                return AppState.appData.observationSites;
            }
            if (typeof DailyObservations !== 'undefined' && Array.isArray(DailyObservations.DEFAULT_SITES)) {
                return DailyObservations.DEFAULT_SITES;
            }
        } catch (e) { /* ignore */ }
        return [];
    },

    /**
     * الحصول على قائمة المواقع من الإعدادات
     */
    getSiteOptions() {
        try {
            const sites = this._resolveSitesFromHierarchy();
            return sites.map((site, index) => ({
                id: site.id || site.siteId || Utils.generateId('SITE'),
                name: site.name || site.title || site.label || `موقع ${index + 1}`
            }));
        } catch (error) {
            Utils.safeWarn('⚠️ خطأ في الحصول على قائمة المواقع:', error);
            return [];
        }
    },

    /**
     * جلب مواقع المصنع من الخادم عند الحاجة (قبل إظهار نماذج تتطلب الموقع *).
     */
    async ensureObservationSitesForForms() {
        try {
            if (this.getSiteOptions().length > 0) return;
            if (typeof Permissions !== 'undefined' && typeof Permissions.ensureFormSettingsState === 'function') {
                await Permissions.ensureFormSettingsState(true);
            }
        } catch (e) {
            if (typeof Utils !== 'undefined' && Utils.safeWarn) {
                Utils.safeWarn('⚠️ تعذر جلب قائمة المواقع للاستدامة:', e);
            }
        }
    },

    /**
     * تحديث واجهة الاستدامة بعد تحميل إعدادات النماذج (نفس نمط المديولات الأخرى).
     */
    refreshSiteDropdowns() {
        try {
            const section = document.getElementById('sustainability-section');
            if (!section || !String(section.innerHTML || '').trim()) return;
            this.load();
        } catch (e) { /* ignore */ }
    },

    _onFormSettingsUpdatedForSustainability() {
        if (this._formSettingsReloadTimer) {
            clearTimeout(this._formSettingsReloadTimer);
        }
        this._formSettingsReloadTimer = setTimeout(() => {
            this._formSettingsReloadTimer = null;
            const section = document.getElementById('sustainability-section');
            if (!section || !section.isConnected) return;
            if (!String(section.innerHTML || '').trim()) return;
            this.load();
        }, 40);
    },

    /**
     * تحميل المديول
     */
    async load() {
        // Add language change listener
        if (!this._languageChangeListenerAdded) {
            document.addEventListener('language-changed', () => {
                this.load();
            });
            this._languageChangeListenerAdded = true;
        }

        if (!this._formSettingsSitesListenerAdded) {
            if (typeof window !== 'undefined' && window.addEventListener) {
                window.addEventListener('formSettingsUpdated', () => this._onFormSettingsUpdatedForSustainability());
            }
            this._formSettingsSitesListenerAdded = true;
        }

        const section = document.getElementById('sustainability-section');
        if (!section) return;

        if (typeof AppState === 'undefined') {
            if (typeof Utils !== 'undefined' && Utils.safeError) {
                Utils.safeError('AppState غير متوفر!');
            } else {
                console.error('AppState غير متوفر!');
            }
            return;
        }

        await this.ensureObservationSitesForForms();

        // تحميل الإعدادات المحفوظة
        this.loadSettings();

        if (!this.hasFullSustainabilityManage() && (this.currentTab === 'waste-management' || this.currentTab === 'settings')) {
            this.currentTab = 'dashboard';
        }
        if (!this.canRegisterResourceConsumption() && ['dashboard', 'water', 'electricity', 'gas'].includes(this.currentTab)) {
            this.currentTab = 'dashboard';
        }

        // تهيئة بنية البيانات إذا لم تكن موجودة
        if (!AppState.appData.resourceConsumption) {
            AppState.appData.resourceConsumption = {
                water: [],
                electricity: [],
                gas: []
            };
        }

        // تهيئة بيانات إدارة المخلفات
        if (!AppState.appData.wasteManagement) {
            AppState.appData.wasteManagement = {
                regularWasteTypes: ['خشب', 'ورق', 'استرتش', 'بلاستيك', 'شكائر', 'جراكن فارغة'],
                regularWasteRecords: [],
                regularWasteSales: [],
                hazardousWasteRecords: []
            };
        }

        // تحميل بيانات استهلاك الموارد من Google Sheets (في الخلفية)
        this.loadResourceConsumptionFromSheets().catch(error => {
            Utils.safeWarn('⚠️ تعذر تحميل بيانات استهلاك الموارد من Google Sheets:', error);
        });

        // تحميل بيانات إدارة المخلفات من Google Sheets (في الخلفية)
        this.loadWasteManagementFromSheets().catch(error => {
            Utils.safeWarn('⚠️ تعذر تحميل بيانات إدارة المخلفات من Google Sheets:', error);
        });

        try {
            section.innerHTML = `
                <div class="section-header">
                    <h1 class="section-title">
                        <i class="fas fa-leaf ml-3"></i>
                        الاستدامة البيئية
                    </h1>
                    <p class="section-subtitle">إدارة ومتابعة استهلاك الموارد البيئية (مياه، كهرباء، غاز طبيعي)</p>
                </div>
                
                ${this.renderYearFilterToolbarHtml()}
                
                <!-- لوحة المؤشرات السريعة -->
                <div id="sustainability-quick-stats" class="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    ${this.renderQuickStats()}
                </div>

                <!-- التبويبات -->
                <div class="mt-6">
                    <div class="flex gap-2 mb-6 border-b overflow-x-auto items-center flex-wrap">
                        ${this.canRegisterResourceConsumption() ? `
                        <button class="tab-btn ${this.currentTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">
                            <i class="fas fa-chart-line ml-2"></i>لوحة التحليل
                        </button>
                        <button class="tab-btn ${this.currentTab === 'water' ? 'active' : ''}" data-tab="water">
                            <i class="fas fa-tint ml-2"></i>استهلاك المياه
                        </button>
                        <button class="tab-btn ${this.currentTab === 'electricity' ? 'active' : ''}" data-tab="electricity">
                            <i class="fas fa-bolt ml-2"></i>استهلاك الكهرباء
                        </button>
                        <button class="tab-btn ${this.currentTab === 'gas' ? 'active' : ''}" data-tab="gas">
                            <i class="fas fa-fire ml-2"></i>استهلاك الغاز الطبيعي
                        </button>
                        ` : `
                        <span class="text-sm text-gray-500 dark:text-gray-400 px-2 py-2">لا توجد صلاحية لعرض لوحة التحليل وسجلات الاستهلاك. يطلب مدير النظام منح «تسجيل استهلاك الموارد» أو «إدارة كاملة» من الصلاحيات التفصيلية للاستدامة.</span>
                        `}
                        ${this.hasFullSustainabilityManage() ? `
                        <button class="tab-btn ${this.currentTab === 'waste-management' ? 'active' : ''}" data-tab="waste-management">
                            <i class="fas fa-recycle ml-2"></i>إدارة المخلفات
                        </button>
                        <button class="tab-btn ${this.currentTab === 'settings' ? 'active' : ''}" data-tab="settings">
                            <i class="fas fa-cog ml-2"></i>الإعدادات
                        </button>
                        ` : ''}
                        ${this.renderAdminImportExportToolbarHtml()}
                        <button type="button" class="btn btn-secondary sustainability-refresh-btn ml-4" id="sustainability-refresh-btn" data-action="refresh" title="تحديث البيانات من المصدر">
                            <i class="fas fa-sync-alt ml-2"></i>تحديث
                        </button>
                    </div>
                    <div id="sustainability-content">
                        <div class="content-card">
                            <div class="card-body">
                                <div class="empty-state">
                                    <div style="width: 300px; margin: 0 auto 16px;">
                                        <div style="width: 100%; height: 6px; background: rgba(59, 130, 246, 0.2); border-radius: 3px; overflow: hidden;">
                                            <div style="height: 100%; background: linear-gradient(90deg, #3b82f6, #2563eb, #3b82f6); background-size: 200% 100%; border-radius: 3px; animation: loadingProgress 1.5s ease-in-out infinite;"></div>
                                        </div>
                                    </div>
                                    <p class="text-gray-500">جاري تحميل المحتوى...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            this.setupEventListeners();

            // ✅ تحميل المحتوى فوراً بعد عرض الواجهة
            setTimeout(async () => {
                try {
                    const contentArea = document.getElementById('sustainability-content');
                    if (!contentArea) return;

                    const content = await this.renderContent().catch(error => {
                        Utils.safeWarn('⚠️ خطأ في تحميل المحتوى:', error);
                        return `
                            <div class="content-card">
                                <div class="card-body">
                                    <div class="empty-state">
                                        <i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>
                                        <p class="text-gray-500 mb-4">حدث خطأ في تحميل البيانات</p>
                                        <button onclick="Sustainability.load()" class="btn-primary">
                                            <i class="fas fa-redo ml-2"></i>
                                            إعادة المحاولة
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
                    });

                    contentArea.innerHTML = content;

                    // ✅ تحديث الكروت السريعة بعد تحميل البيانات
                    if (this.currentTab === 'dashboard') {
                        this.renderCharts();
                        // إعادة رسم الكروت بعد تحميل البيانات من Google Sheets
                        setTimeout(() => {
                            const quickStatsPanel = document.getElementById('sustainability-quick-stats');
                            if (quickStatsPanel) {
                                quickStatsPanel.innerHTML = this.renderQuickStats();
                            }
                        }, 100);
                    }
                } catch (error) {
                    Utils.safeWarn('⚠️ خطأ في تحميل المحتوى:', error);
                }
            }, 0);
        } catch (error) {
            if (typeof Utils !== 'undefined' && Utils.safeError) {
                Utils.safeError('❌ خطأ في تحميل مديول الاستدامة:', error);
            } else {
                console.error('❌ خطأ في تحميل مديول الاستدامة:', error);
            }
            if (section) {
                section.innerHTML = `
                    <div class="content-card">
                        <div class="card-body">
                            <div class="empty-state">
                                <i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>
                                <p class="text-gray-500 mb-4">حدث خطأ أثناء تحميل البيانات</p>
                                <button onclick="Sustainability.load()" class="btn-primary">
                                    <i class="fas fa-redo ml-2"></i>
                                    إعادة المحاولة
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    },

    /**
     * عرض المؤشرات السريعة
     */
    renderQuickStats() {
        if (!this.canRegisterResourceConsumption()) {
            return `
                <div class="md:col-span-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-center text-sm text-gray-700 dark:text-gray-300">
                    لا توجد صلاحية لعرض ملخص الاستهلاك. اطلب من مدير النظام منح صلاحية مناسبة ضمن «الاستدامة» (التفاصيل).
                </div>
            `;
        }
        const { water: waterData, electricity: electricityData, gas: gasData, year: viewYear } = this.getViewFilteredConsumption();

        // استخدم آخر شهر متاح في البيانات المصفّاة للسنة المعروضة
        const waterLatest = this.getLatestMonthlyConsumption(waterData);
        const electricityLatest = this.getLatestMonthlyConsumption(electricityData);
        const gasLatest = this.getLatestMonthlyConsumption(gasData);

        const waterThisMonth = waterLatest.total;
        const electricityThisMonth = electricityLatest.total;
        const gasThisMonth = gasLatest.total;

        const waterTrend = this.getTrend(waterData, 'water');
        const electricityTrend = this.getTrend(electricityData, 'electricity');
        const gasTrend = this.getTrend(gasData, 'gas');

        return `
            <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center hover:shadow-md transition-shadow">
                <div class="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">${waterThisMonth.toFixed(2)}</div>
                <div class="text-sm text-gray-700 dark:text-gray-300 font-semibold">
                    <i class="fas fa-tint ml-1"></i>مياه (م³)
                </div>
                <div class="text-xs mt-1 ${waterTrend === 'up' ? 'text-red-600' : waterTrend === 'down' ? 'text-green-600' : 'text-gray-500'}">
                    ${waterTrend === 'up' ? '↑' : waterTrend === 'down' ? '↓' : '→'} ${this.getTrendText(waterTrend)}
                </div>
                <div class="text-[11px] text-gray-500 dark:text-gray-400 mt-2 font-medium">سنة ${viewYear}</div>
            </div>
            <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-center hover:shadow-md transition-shadow">
                <div class="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mb-2">${electricityThisMonth.toFixed(2)}</div>
                <div class="text-sm text-gray-700 dark:text-gray-300 font-semibold">
                    <i class="fas fa-bolt ml-1"></i>كهرباء (ك.و)
                </div>
                <div class="text-xs mt-1 ${electricityTrend === 'up' ? 'text-red-600' : electricityTrend === 'down' ? 'text-green-600' : 'text-gray-500'}">
                    ${electricityTrend === 'up' ? '↑' : electricityTrend === 'down' ? '↓' : '→'} ${this.getTrendText(electricityTrend)}
                </div>
                <div class="text-[11px] text-gray-500 dark:text-gray-400 mt-2 font-medium">سنة ${viewYear}</div>
            </div>
            <div class="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 text-center hover:shadow-md transition-shadow">
                <div class="text-3xl font-bold text-orange-600 dark:text-orange-400 mb-2">${gasThisMonth.toFixed(2)}</div>
                <div class="text-sm text-gray-700 dark:text-gray-300 font-semibold">
                    <i class="fas fa-fire ml-1"></i>غاز (م³)
                </div>
                <div class="text-xs mt-1 ${gasTrend === 'up' ? 'text-red-600' : gasTrend === 'down' ? 'text-green-600' : 'text-gray-500'}">
                    ${gasTrend === 'up' ? '↑' : gasTrend === 'down' ? '↓' : '→'} ${this.getTrendText(gasTrend)}
                </div>
                <div class="text-[11px] text-gray-500 dark:text-gray-400 mt-2 font-medium">سنة ${viewYear}</div>
            </div>
            <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center hover:shadow-md transition-shadow cursor-pointer" onclick="Sustainability.currentTab='dashboard'; Sustainability.load();">
                <div class="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">
                    ${this.getTotalAlerts()}
                </div>
                <div class="text-sm text-gray-700 dark:text-gray-300 font-semibold">
                    <i class="fas fa-exclamation-triangle ml-1"></i>تنبيهات
                </div>
                <div class="text-[11px] text-gray-500 dark:text-gray-400 mt-2 font-medium">سنة ${viewYear}</div>
            </div>
        `;
    },

    /**
     * إعداد مستمعي الأحداث
     */
    setupEventListeners() {
        setTimeout(() => {
            if (!this._sustainabilityYearFilterDelegateBound) {
                this._sustainabilityYearFilterDelegateBound = true;
                document.addEventListener('change', (ev) => {
                    const t = ev.target;
                    if (!t || t.id !== 'sustainability-dashboard-year') return;
                    if (typeof AppState !== 'undefined' && AppState.currentSection !== 'sustainability') return;
                    const v = Number(t.value);
                    if (!Number.isFinite(v) || v < 1990 || v > 2100) return;
                    this.dashboardYear = v;
                    this.refreshConsumptionYearView();
                });
            }

            const tabs = document.querySelectorAll('#sustainability-section .tab-btn');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const nextTab = tab.getAttribute('data-tab');
                    if ((nextTab === 'waste-management' || nextTab === 'settings') && !this.hasFullSustainabilityManage()) {
                        if (typeof Notification !== 'undefined') Notification.error('ليس لديك صلاحية الوصول إلى هذا القسم');
                        return;
                    }
                    if ((nextTab === 'dashboard' || nextTab === 'water' || nextTab === 'electricity' || nextTab === 'gas') && !this.canRegisterResourceConsumption()) {
                        if (typeof Notification !== 'undefined') Notification.error('ليس لديك صلاحية عرض سجلات الاستهلاك');
                        return;
                    }
                    this.currentTab = nextTab;
                    this.load();
                });
            });
            const refreshBtn = document.getElementById('sustainability-refresh-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => this.handleRefresh());
            }
            this.bindAdminImportExportToolbar();
        }, 100);
    },

    /**
     * تحديث البيانات من Google Sheets وإعادة عرض المحتوى
     */
    async handleRefresh() {
        const btn = document.getElementById('sustainability-refresh-btn');
        if (!btn) return;
        const icon = btn.querySelector('i.fa-sync-alt');
        btn.disabled = true;
        if (icon) icon.classList.add('fa-spin');
        try {
            await Promise.all([
                this.loadResourceConsumptionFromSheets(),
                this.loadWasteManagementFromSheets()
            ]);
            await this.load();
        } catch (error) {
            if (typeof Utils !== 'undefined' && Utils.safeError) {
                Utils.safeError('خطأ أثناء تحديث بيانات الاستدامة:', error);
            } else {
                console.error('خطأ أثناء تحديث بيانات الاستدامة:', error);
            }
        } finally {
            btn.disabled = false;
            if (icon) icon.classList.remove('fa-spin');
        }
    },

    /**
     * عرض المحتوى حسب التبويب
     */
    async renderContent() {
        let content = '';
        switch (this.currentTab) {
            case 'dashboard':
                if (!this.canRegisterResourceConsumption()) {
                    return `
                        <div class="content-card">
                            <div class="card-body">
                                <div class="empty-state">
                                    <p class="text-gray-600 dark:text-gray-400">لا توجد صلاحية لعرض لوحة التحليل. يطلب مدير النظام منح «تسجيل استهلاك الموارد» أو «إدارة كاملة» ضمن صلاحيات الاستدامة التفصيلية.</p>
                                </div>
                            </div>
                        </div>
                    `;
                }
                content = await this.renderDashboard();
                // رسم الرسوم البيانية بعد تحميل المحتوى
                setTimeout(() => {
                    this.renderCharts();
                }, 300);
                return content;
            case 'water':
                if (!this.canRegisterResourceConsumption()) {
                    return '<div class="content-card"><div class="card-body"><p class="text-gray-500">لا توجد صلاحية لعرض هذا القسم.</p></div></div>';
                }
                return await this.renderResourceRegister('water', 'مياه', 'tint', 'blue');
            case 'electricity':
                if (!this.canRegisterResourceConsumption()) {
                    return '<div class="content-card"><div class="card-body"><p class="text-gray-500">لا توجد صلاحية لعرض هذا القسم.</p></div></div>';
                }
                return await this.renderResourceRegister('electricity', 'كهرباء', 'bolt', 'yellow');
            case 'gas':
                if (!this.canRegisterResourceConsumption()) {
                    return '<div class="content-card"><div class="card-body"><p class="text-gray-500">لا توجد صلاحية لعرض هذا القسم.</p></div></div>';
                }
                return await this.renderResourceRegister('gas', 'غاز طبيعي', 'fire', 'orange');
            case 'waste-management':
                if (!this.hasFullSustainabilityManage()) {
                    return '<div class="content-card"><div class="card-body"><p class="text-gray-500">ليس لديك صلاحية إدارة المخلفات.</p></div></div>';
                }
                return await this.renderWasteManagement();
            case 'settings':
                if (!this.hasFullSustainabilityManage()) {
                    return '<div class="content-card"><div class="card-body"><p class="text-gray-500">ليس لديك صلاحية الإعدادات.</p></div></div>';
                }
                return await this.renderSettings();
            default:
                if (!this.canRegisterResourceConsumption()) {
                    return `
                        <div class="content-card">
                            <div class="card-body">
                                <div class="empty-state">
                                    <p class="text-gray-600 dark:text-gray-400">لا توجد صلاحية لعرض هذا المحتوى.</p>
                                </div>
                            </div>
                        </div>
                    `;
                }
                content = await this.renderDashboard();
                setTimeout(() => {
                    this.renderCharts();
                }, 300);
                return content;
        }
    },

    /**
     * تحديث فوري لأرقام الإجماليات في الكروت دون إعادة رسم كاملة
     */
    _refreshDashboardTotals() {
        try {
            const analytics = this.calculateAnalytics();
            // كروت الـ dashboard — نبحث عن العناصر الموجودة ونحدثها مباشرة
            const types = [
                { key: 'water',       selector: '.text-blue-600,.text-blue-400',   total: analytics.water.total },
                { key: 'electricity', selector: '.text-yellow-600,.text-yellow-400', total: analytics.electricity.total },
                { key: 'gas',         selector: '.text-orange-600,.text-orange-400', total: analytics.gas.total }
            ];
            // تحديث مباشر للأرقام في الـ DOM
            const waterEls      = document.querySelectorAll('.text-3xl.font-bold.text-blue-600, .text-3xl.font-bold.text-blue-400');
            const electricityEls= document.querySelectorAll('.text-3xl.font-bold.text-yellow-600, .text-3xl.font-bold.text-yellow-400');
            const gasEls        = document.querySelectorAll('.text-3xl.font-bold.text-orange-600, .text-3xl.font-bold.text-orange-400');
            waterEls.forEach(el       => { el.textContent = analytics.water.total.toFixed(2); });
            electricityEls.forEach(el => { el.textContent = analytics.electricity.total.toFixed(2); });
            gasEls.forEach(el         => { el.textContent = analytics.gas.total.toFixed(2); });
        } catch (e) {
            /* تجاهل أخطاء التحديث الفوري - سيتم تحديثه بـ load() */
        }
    },

    /**
     * عرض لوحة التحليل
     */
    async renderDashboard() {
        const analytics = this.calculateAnalytics();
        const alerts = this.getActiveAlerts();
        const yLabel = this.dashboardYear || new Date().getFullYear();

        return `
            <div class="space-y-6">
                <div class="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span class="inline-flex items-center gap-2 rounded-full bg-emerald-100/80 dark:bg-emerald-900/30 px-3 py-1 font-semibold text-emerald-800 dark:text-emerald-200 border border-emerald-200/70 dark:border-emerald-700">
                        <i class="fas fa-filter text-emerald-600 dark:text-emerald-400" aria-hidden="true"></i>
                        عرض بيانات سنة <strong class="mx-1">${yLabel}</strong>
                    </span>
                    <span class="text-xs opacity-90">جميع الإجماليات والرسوم أدناه مخصّصة لهذه السنة.</span>
                </div>
                <!-- التنبيهات النشطة -->
                ${alerts.length > 0 ? `
                <div class="content-card border-l-4 border-red-500">
                    <div class="card-header bg-red-50 dark:bg-red-900/20">
                        <h2 class="card-title text-red-700 dark:text-red-400">
                            <i class="fas fa-exclamation-triangle ml-2"></i>
                            تنبيهات الاستهلاك
                        </h2>
                    </div>
                    <div class="card-body">
                        <div class="space-y-3">
                            ${alerts.map(alert => `
                                <div class="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
                                    <div class="flex items-center gap-3">
                                        <i class="fas fa-${alert.icon} text-red-600 dark:text-red-400 text-xl"></i>
                                        <div>
                                            <div class="font-semibold text-red-700 dark:text-red-300">${alert.title}</div>
                                            <div class="text-sm text-red-600 dark:text-red-400">${alert.message}</div>
                                        </div>
                                    </div>
                                    <span class="badge badge-danger">${alert.percentage.toFixed(1)}%</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                ` : ''}

                <!-- مؤشرات الأداء -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title text-sm">
                                <i class="fas fa-tint text-blue-500 ml-2"></i>
                                إجمالي استهلاك المياه
                            </h3>
                        </div>
                        <div class="card-body">
                            <div class="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                                ${analytics.water.total.toFixed(2)}
                            </div>
                            <div class="text-sm text-gray-600 dark:text-gray-400">م³</div>
                            <div class="mt-2 text-xs ${analytics.water.trend === 'up' ? 'text-red-600' : analytics.water.trend === 'down' ? 'text-green-600' : 'text-gray-500'}">
                                ${analytics.water.trend === 'up' ? '↑' : analytics.water.trend === 'down' ? '↓' : '→'} 
                                ${analytics.water.trendText}
                            </div>
                        </div>
                    </div>
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title text-sm">
                                <i class="fas fa-bolt text-yellow-500 ml-2"></i>
                                إجمالي استهلاك الكهرباء
                            </h3>
                        </div>
                        <div class="card-body">
                            <div class="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mb-2">
                                ${analytics.electricity.total.toFixed(2)}
                            </div>
                            <div class="text-sm text-gray-600 dark:text-gray-400">كيلووات</div>
                            <div class="mt-2 text-xs ${analytics.electricity.trend === 'up' ? 'text-red-600' : analytics.electricity.trend === 'down' ? 'text-green-600' : 'text-gray-500'}">
                                ${analytics.electricity.trend === 'up' ? '↑' : analytics.electricity.trend === 'down' ? '↓' : '→'} 
                                ${analytics.electricity.trendText}
                            </div>
                        </div>
                    </div>
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title text-sm">
                                <i class="fas fa-fire text-orange-500 ml-2"></i>
                                إجمالي استهلاك الغاز
                            </h3>
                        </div>
                        <div class="card-body">
                            <div class="text-3xl font-bold text-orange-600 dark:text-orange-400 mb-2">
                                ${analytics.gas.total.toFixed(2)}
                            </div>
                            <div class="text-sm text-gray-600 dark:text-gray-400">م³</div>
                            <div class="mt-2 text-xs ${analytics.gas.trend === 'up' ? 'text-red-600' : analytics.gas.trend === 'down' ? 'text-green-600' : 'text-gray-500'}">
                                ${analytics.gas.trend === 'up' ? '↑' : analytics.gas.trend === 'down' ? '↓' : '→'} 
                                ${analytics.gas.trendText}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- أكثر موقع استهلاكاً -->
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-map-marker-alt ml-2"></i>
                            أكثر المواقع استهلاكاً
                        </h2>
                    </div>
                    <div class="card-body">
                        ${this.renderTopConsumingLocations()}
                    </div>
                </div>

                <!-- الرسوم البيانية -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="content-card">
                        <div class="card-header">
                            <h2 class="card-title">
                                <i class="fas fa-chart-bar ml-2"></i>
                                مقارنة شهرية - المياه (${yLabel})
                            </h2>
                        </div>
                        <div class="card-body">
                            <div style="position: relative; height: 300px;">
                                <canvas id="water-monthly-chart"></canvas>
                            </div>
                        </div>
                    </div>
                    <div class="content-card">
                        <div class="card-header">
                            <h2 class="card-title">
                                <i class="fas fa-chart-bar ml-2"></i>
                                مقارنة شهرية - الكهرباء (${yLabel})
                            </h2>
                        </div>
                        <div class="card-body">
                            <div style="position: relative; height: 300px;">
                                <canvas id="electricity-monthly-chart"></canvas>
                            </div>
                        </div>
                    </div>
                    <div class="content-card">
                        <div class="card-header">
                            <h2 class="card-title">
                                <i class="fas fa-chart-bar ml-2"></i>
                                مقارنة شهرية - الغاز (${yLabel})
                            </h2>
                        </div>
                        <div class="card-body">
                            <div style="position: relative; height: 300px;">
                                <canvas id="gas-monthly-chart"></canvas>
                            </div>
                        </div>
                    </div>
                    <div class="content-card">
                        <div class="card-header">
                            <h2 class="card-title">
                                <i class="fas fa-chart-pie ml-2"></i>
                                توزيع الاستهلاك حسب المصدر (${yLabel})
                            </h2>
                        </div>
                        <div class="card-body">
                            <div style="position: relative; height: 300px;">
                                <canvas id="source-distribution-chart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * عرض سجل استهلاك الموارد
     */
    async renderResourceRegister(type, name, icon, color) {
        const full = AppState.appData.resourceConsumption?.[type] || [];
        const viewY = Number(this.dashboardYear) || new Date().getFullYear();
        const data = this.filterResourceRowsByYear(full, viewY);
        const hasAlerts = data.some(record => record.hasAlert);

        return `
            <div class="space-y-4">
                <div class="content-card">
                    <div class="card-header">
                        <div class="flex items-center justify-between flex-wrap gap-3">
                            <div>
                            <h2 class="card-title">
                                <i class="fas fa-${icon} text-${color}-500 ml-2"></i>
                                سجل استهلاك ${name}
                            </h2>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                عرض السجلات الخاصة بسنة <strong>${viewY}</strong> — غيّر السنة من شريط التصفية أعلى الصفحة لعرض أعوام أخرى.
                            </p>
                            </div>
                            ${this.canRegisterResourceConsumption() ? `
                            <button class="btn-primary" onclick="Sustainability.showResourceForm('${type}')">
                                <i class="fas fa-plus ml-2"></i>
                                إضافة سجل جديد
                            </button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="card-body">
                        ${data.length === 0 ? `
                            <div class="empty-state">
                                <i class="fas fa-${icon} text-4xl text-${color}-400 mb-4"></i>
                                <p class="text-gray-500">لا توجد سجلات لاستهلاك ${name} ضمن سنة <strong>${viewY}</strong>. جرّب اختيار سنة أخرى من شريط التصفية أو أضف سجلاً جديداً.</p>
                            </div>
                        ` : `
                            <div class="filters-row" style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 16px 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
                                <div class="filters-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; align-items: end;">
                                    <div class="filter-field" style="min-width: 180px;">
                                        <label class="filter-label text-sm text-gray-600 mb-1 block font-medium">
                                            <i class="fas fa-search ml-1 text-gray-400"></i> بحث شامل
                                        </label>
                                        <div class="relative">
                                            <input type="text" id="search-filter-${type}" class="form-input w-full pr-10" placeholder="بحث في السجلات..." oninput="Sustainability.filterResourceTable('${type}')">
                                            <i class="fas fa-search absolute top-3 right-3 text-gray-400"></i>
                                        </div>
                                    </div>
                                    <div class="filter-field" style="min-width: 160px;">
                                        <label class="filter-label text-sm text-gray-600 mb-1 block font-medium">
                                            <i class="fas fa-industry ml-1 text-gray-400"></i> الموقع / المصنع
                                        </label>
                                        <select id="factory-filter-${type}" class="form-input w-full" onchange="Sustainability.filterResourceTable('${type}')">
                                            <option value="">الكل</option>
                                            ${[...new Set(data.map(r => r.location).filter(Boolean))].map(loc => `<option value="${Utils.escapeHTML(loc)}">${Utils.escapeHTML(loc)}</option>`).join('')}
                                        </select>
                                    </div>
                                    <div class="filter-field" style="min-width: 160px;">
                                        <label class="filter-label text-sm text-gray-600 mb-1 block font-medium">
                                            <i class="fas fa-exclamation-triangle ml-1 text-gray-400"></i> الحالة
                                        </label>
                                        <select id="status-filter-${type}" class="form-input w-full" onchange="Sustainability.filterResourceTable('${type}')">
                                            <option value="">الكل</option>
                                            <option value="alert">تنبيه</option>
                                            <option value="normal">طبيعي</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="overflow-x-auto">
                                <table class="data-table" id="table-${type}">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>التاريخ</th>
                                            <th>الشهر / السنة</th>
                                            <th>الموقع / المصنع</th>
                                            <th>المصدر</th>
                                            <th>قراءة البداية</th>
                                            <th>قراءة النهاية</th>
                                            <th>إجمالي الاستهلاك</th>
                                            <th>وحدة القياس</th>
                                            <th>الجهة / القسم</th>
                                            <th>الحالة</th>
                                            <th>الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${data.map((record, index) => {
                                            const alertClass = record.hasAlert ? 'bg-red-50 dark:bg-red-900/10 border-l-4 border-red-500' : '';
                                            return `
                                                <tr class="${alertClass}" data-record-id="${record.id}">
                                                    <td>${index + 1}</td>
                                                    <td>${Utils.formatDate(record.date)}</td>
                                                    <td>${record.monthYear || this.getMonthYear(record.date)}</td>
                                                    <td>${Utils.escapeHTML(record.location || '')}</td>
                                                    <td>${Utils.escapeHTML(record.source || '')}</td>
                                                    <td>${parseFloat(record.startReading || 0).toFixed(2)}</td>
                                                    <td>${parseFloat(record.endReading || 0).toFixed(2)}</td>
                                                    <td class="font-semibold">${parseFloat(record.totalConsumption || 0).toFixed(2)}</td>
                                                    <td>${Utils.escapeHTML(record.unit || this.getDefaultUnit(type))}</td>
                                                    <td>${Utils.escapeHTML(record.department || '')}</td>
                                                    <td>
                                                        ${record.hasAlert ? `
                                                            <span class="badge badge-danger">
                                                                <i class="fas fa-exclamation-triangle ml-1"></i>
                                                                تنبيه
                                                            </span>
                                                        ` : `
                                                            <span class="badge badge-success">طبيعي</span>
                                                        `}
                                                    </td>
                                                    <td>
                                                        <div class="flex items-center gap-2">
                                                            <button onclick="Sustainability.viewResourceRecord('${type}', '${record.id}')" 
                                                                    class="btn-icon btn-icon-info" title="عرض">
                                                                <i class="fas fa-eye"></i>
                                                            </button>
                                                            ${this.canEdit() ? `
                                                            <button onclick="Sustainability.editResourceRecord('${type}', '${record.id}')" 
                                                                    class="btn-icon btn-icon-primary" title="تعديل">
                                                                <i class="fas fa-edit"></i>
                                                            </button>
                                                            ` : ''}
                                                            ${this.canDelete() ? `
                                                            <button onclick="Sustainability.deleteResourceRecord('${type}', '${record.id}')" 
                                                                    class="btn-icon btn-icon-danger" title="حذف">
                                                                <i class="fas fa-trash"></i>
                                                            </button>
                                                            ` : ''}
                                                        </div>
                                                    </td>
                                                </tr>
                                            `;
                                        }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * فلتر ديناميكي للبحث في السجلات المعروضة في الجدول بناء على معايير متعددة
     */
    filterResourceTable(type) {
        const searchInput = document.getElementById(`search-filter-${type}`);
        const factoryInput = document.getElementById(`factory-filter-${type}`);
        const statusInput = document.getElementById(`status-filter-${type}`);
        
        const searchVal = searchInput ? searchInput.value.toLowerCase() : '';
        const factoryVal = factoryInput ? factoryInput.value.toLowerCase() : '';
        const statusVal = statusInput ? statusInput.value : '';

        const table = document.getElementById(`table-${type}`);
        if (!table) return;
        
        const tbody = table.getElementsByTagName('tbody')[0];
        if (!tbody) return;
        
        const rows = tbody.getElementsByTagName('tr');
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            
            // قراءة الخلايا
            const textContent = row.textContent.toLowerCase();
            const locationCell = row.cells[3] ? row.cells[3].textContent.toLowerCase() : '';
            const statusCell = row.cells[10] ? row.cells[10].textContent.trim() : '';

            // الفحص
            let matchesSearch = textContent.includes(searchVal);
            let matchesFactory = factoryVal === '' || locationCell.includes(factoryVal);
            
            let matchesStatus = true;
            if (statusVal === 'alert') {
                matchesStatus = statusCell.includes('تنبيه');
            } else if (statusVal === 'normal') {
                matchesStatus = statusCell.includes('طبيعي');
            }

            if (matchesSearch && matchesFactory && matchesStatus) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        }
    },

    /**
     * عرض نموذج إضافة/تعديل سجل
     */
    showResourceForm(type, recordId = null) {
        if (recordId && !this.hasFullSustainabilityManage()) {
            if (typeof Notification !== 'undefined') Notification.error('ليس لديك صلاحية تعديل أو حذف السجلات');
            return;
        }
        if (!recordId && !this.canRegisterResourceConsumption()) {
            if (typeof Notification !== 'undefined') Notification.error('ليس لديك صلاحية إضافة سجلات الاستهلاك');
            return;
        }
        const record = recordId
            ? (AppState.appData.resourceConsumption?.[type] || []).find(r => r.id === recordId)
            : null;

        // ألوان مخصصة لكل نوع — inline styles بالكامل (بدون Tailwind)
        const typeConfig = {
            water: {
                name: 'مياه', icon: 'tint',
                grad: 'linear-gradient(135deg,#1d4ed8 0%,#0891b2 100%)',
                sectionBg: '#eff6ff', sectionBorder: '#bfdbfe',
                badgeBg: '#dbeafe', badgeColor: '#1e40af',
                saveBg: 'linear-gradient(135deg,#2563eb 0%,#0891b2 100%)'
            },
            electricity: {
                name: 'كهرباء', icon: 'bolt',
                grad: 'linear-gradient(135deg,#d97706 0%,#f59e0b 100%)',
                sectionBg: '#fffbeb', sectionBorder: '#fde68a',
                badgeBg: '#fef3c7', badgeColor: '#92400e',
                saveBg: 'linear-gradient(135deg,#d97706 0%,#f59e0b 100%)'
            },
            gas: {
                name: 'غاز طبيعي', icon: 'fire',
                grad: 'linear-gradient(135deg,#c2410c 0%,#ef4444 100%)',
                sectionBg: '#fff7ed', sectionBorder: '#fed7aa',
                badgeBg: '#ffedd5', badgeColor: '#9a3412',
                saveBg: 'linear-gradient(135deg,#c2410c 0%,#ef4444 100%)'
            }
        };
        const cfg = typeConfig[type] || typeConfig.water;

        const dateValue = record?.date ? new Date(record.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
        const monthYearValue = record?.monthYear || this.getMonthYear(new Date());
        const unit = record?.unit || this.getDefaultUnit(type);

        const isEdit = !!recordId;
        const initialLocTrim = record?.location != null ? String(record.location).trim() : '';
        const prevRecInitial = isEdit ? null : this.getPreviousConsumptionRecord(type, initialLocTrim);
        const useAutoStart = !isEdit && prevRecInitial != null;
        const defaultStartStr = isEdit
            ? (record?.startReading != null && record.startReading !== '' ? String(record.startReading) : '')
            : (useAutoStart ? String(parseFloat(prevRecInitial.endReading) || 0) : '');
        const defaultEndStr = record?.endReading != null && record.endReading !== '' ? String(record.endReading) : '';

        // إزالة أي مودال سابق
        const existing = document.getElementById(`resource-modal-${type}`);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = `resource-modal-${type}`;
        modal.className = 'modal-overlay';

        // ============ HTML ============
        modal.innerHTML = `
<div style="background:#fff;width:95%;max-width:680px;border-radius:18px;overflow:hidden;
            box-shadow:0 30px 80px rgba(0,0,0,0.35);position:relative;">

  <!-- ======== HEADER ======== -->
  <div style="background:${cfg.grad};padding:20px 24px;text-align:center;position:relative;">
    <!-- زر الإغلاق -->
    <button id="close-res-${type}"
            style="position:absolute;top:14px;left:14px;width:34px;height:34px;border-radius:50%;
                   background:rgba(255,255,255,0.25);border:none;cursor:pointer;
                   display:flex;align-items:center;justify-content:center;transition:background .2s;"
            onmouseover="this.style.background='rgba(255,255,255,0.4)'"
            onmouseout="this.style.background='rgba(255,255,255,0.25)'">
      <i class="fas fa-times" style="color:#fff;font-size:15px;"></i>
    </button>
    <!-- الأيقون -->
    <div style="width:56px;height:56px;border-radius:16px;background:rgba(255,255,255,0.22);
                display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
      <i class="fas fa-${cfg.icon}" style="font-size:26px;color:#fff;"></i>
    </div>
    <!-- العنوان -->
    <h2 style="color:#fff;font-size:20px;font-weight:800;margin:0 0 4px;letter-spacing:0.3px;">
      ${record ? 'تعديل سجل' : 'تسجيل استهلاك'} ${cfg.name}
    </h2>
    <p style="color:rgba(255,255,255,0.82);font-size:13px;margin:0;">
      ${record ? 'قم بتحديث بيانات هذا السجل' : 'أدخل قراءات العداد للفترة الجديدة'}
    </p>
  </div>

  <!-- ======== BODY ======== -->
  <div style="padding:24px;background:#f8fafc;max-height:65vh;overflow-y:auto;">
    <form id="resource-form-${type}" novalidate>

      <!-- القسم 1: التاريخ والموقع -->
      <div style="background:${cfg.sectionBg};border:1.5px solid ${cfg.sectionBorder};
                  border-radius:12px;padding:16px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
          <span style="background:${cfg.badgeBg};color:${cfg.badgeColor};font-size:12px;
                       font-weight:700;padding:4px 10px;border-radius:8px;">
            <i class="fas fa-calendar-alt" style="margin-left:5px;"></i>التاريخ والموقع
          </span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <!-- التاريخ -->
          <div>
            <label style="display:block;font-size:13px;font-weight:700;color:#374151;margin-bottom:6px;">
              التاريخ <span style="color:#ef4444;">*</span>
            </label>
            <input type="date" id="resource-date-${type}" required class="form-input"
                   value="${dateValue}"
                   onchange="Sustainability.updateMonthYear('${type}')"
                   style="width:100%;box-sizing:border-box;">
          </div>
          <!-- الشهر / السنة -->
          <div>
            <label style="display:block;font-size:13px;font-weight:700;color:#374151;margin-bottom:6px;">
              الشهر / السنة
            </label>
            <input type="text" id="resource-month-year-${type}" class="form-input"
                   value="${monthYearValue}" readonly
                   style="width:100%;box-sizing:border-box;background:#e5e7eb;color:#6b7280;">
          </div>
          <!-- الموقع -->
          <div>
            <label style="display:block;font-size:13px;font-weight:700;color:#374151;margin-bottom:6px;">
              الموقع / المصنع <span style="color:#ef4444;">*</span>
            </label>
            <select id="resource-location-${type}" required class="form-input"
                    style="width:100%;box-sizing:border-box;">
              <option value="">-- اختر الموقع --</option>
              ${this.getSiteOptions().map(s => `
                <option value="${Utils.escapeHTML(s.name)}" ${record?.location === s.name ? 'selected' : ''}>
                  ${Utils.escapeHTML(s.name)}
                </option>`).join('')}
            </select>
          </div>
          <!-- القسم -->
          <div>
            <label style="display:block;font-size:13px;font-weight:700;color:#374151;margin-bottom:6px;">
              الجهة / القسم
            </label>
            <input type="text" id="resource-department-${type}" class="form-input"
                   value="${Utils.escapeHTML(record?.department || '')}"
                   placeholder="اختياري"
                   style="width:100%;box-sizing:border-box;">
          </div>
        </div>
      </div>

      <!-- القسم 2: قراءات العداد (3 حقول في صف واحد متساوي) -->
      <div style="background:${cfg.sectionBg};border:1.5px solid ${cfg.sectionBorder};
                  border-radius:12px;padding:16px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
          <span style="background:${cfg.badgeBg};color:${cfg.badgeColor};font-size:12px;
                       font-weight:700;padding:4px 10px;border-radius:8px;">
            <i class="fas fa-tachometer-alt" style="margin-left:5px;"></i>قراءات العداد
          </span>
        </div>

        <input type="hidden" id="resource-source-${type}"  value="${Utils.escapeHTML(record?.source || cfg.name)}">
        <input type="hidden" id="resource-unit-${type}"    value="${Utils.escapeHTML(unit)}">

        <!-- الحقول الثلاثة في صف واحد -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;align-items:start;">

          <!-- قراءة البداية -->
          <div>
            <label id="resource-start-label-${type}"
                   style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:4px;min-height:20px;">
              قراءة البداية ${useAutoStart ? '' : '<span style="color:#ef4444;">*</span>'}
            </label>
            <p id="resource-start-help-${type}"
               style="font-size:11px;color:#6366f1;margin:0 0 4px;min-height:16px;${useAutoStart ? '' : 'display:none;'}">
              ${useAutoStart ? '<i class="fas fa-link" style="margin-left:3px;"></i>من آخر سجل' : ''}
            </p>
            <div style="position:relative;">
              <input type="number" id="resource-start-${type}" step="0.01"
                     ${useAutoStart ? 'readonly' : 'required'}
                     class="form-input"
                     value="${Utils.escapeHTML(defaultStartStr)}"
                     placeholder="0.00"
                     onchange="Sustainability.calculateConsumption('${type}')"
                     style="width:100%;box-sizing:border-box;padding-left:40px;
                            ${useAutoStart ? 'background:#e5e7eb;' : ''}">
              <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);
                           font-size:11px;font-weight:700;color:#9ca3af;">${unit}</span>
            </div>
          </div>

          <!-- قراءة النهاية -->
          <div>
            <label id="resource-end-label-${type}"
                   style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:4px;min-height:20px;">
              ${useAutoStart ? 'القراءة الحالية' : 'قراءة النهاية'}
              <span style="color:#ef4444;">*</span>
            </label>
            <p style="font-size:11px;color:transparent;margin:0 0 4px;min-height:16px;">-</p>
            <div style="position:relative;">
              <input type="number" id="resource-end-${type}" step="0.01" required
                     class="form-input"
                     value="${Utils.escapeHTML(defaultEndStr)}"
                     placeholder="0.00"
                     oninput="Sustainability.calculateConsumption('${type}')"
                     onchange="Sustainability.calculateConsumption('${type}')"
                     style="width:100%;box-sizing:border-box;padding-left:40px;">
              <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);
                           font-size:11px;font-weight:700;color:#9ca3af;">${unit}</span>
            </div>
          </div>

          <!-- الاستهلاك الإجمالي -->
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:4px;min-height:20px;">
              الإجمالي <span style="font-size:10px;font-weight:400;color:#9ca3af;">(تلقائي)</span>
            </label>
            <p style="font-size:11px;color:transparent;margin:0 0 4px;min-height:16px;">-</p>
            <div style="position:relative;">
              <input type="number" id="resource-total-${type}" step="0.01" readonly
                     class="form-input"
                     value="${record?.totalConsumption || ''}"
                     placeholder="—"
                     style="width:100%;box-sizing:border-box;padding-left:40px;
                            background:#e5e7eb;font-weight:800;color:#111827;">
              <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);
                           font-size:11px;font-weight:700;color:#9ca3af;">${unit}</span>
            </div>
          </div>

        </div>
      </div>

      <!-- القسم 3: ملاحظات -->
      <div>
        <label style="display:block;font-size:13px;font-weight:700;color:#374151;margin-bottom:6px;">
          <i class="fas fa-sticky-note" style="margin-left:6px;color:#9ca3af;"></i>
          ملاحظات <span style="font-size:11px;font-weight:400;color:#9ca3af;">(اختياري)</span>
        </label>
        <textarea id="resource-notes-${type}" class="form-input" rows="2"
                  placeholder="أي ملاحظات إضافية..."
                  style="width:100%;box-sizing:border-box;">${Utils.escapeHTML(record?.notes || '')}</textarea>
      </div>

    </form>
  </div>

  <!-- ======== FOOTER ======== -->
  <div style="padding:16px 24px;background:#fff;border-top:1.5px solid #e5e7eb;
              display:flex;align-items:center;justify-content:center;gap:12px;">
    <button id="cancel-res-${type}"
            style="min-width:130px;padding:10px 20px;border-radius:10px;border:1.5px solid #d1d5db;
                   background:#fff;color:#374151;font-size:14px;font-weight:600;cursor:pointer;
                   display:flex;align-items:center;justify-content:center;gap:8px;transition:background .2s;"
            onmouseover="this.style.background='#f3f4f6'"
            onmouseout="this.style.background='#fff'">
      <i class="fas fa-ban" style="color:#6b7280;font-size:13px;"></i>
      إلغاء
    </button>
    <button id="save-res-${type}"
            style="min-width:160px;padding:10px 20px;border-radius:10px;border:none;
                   background:${cfg.saveBg};color:#fff;font-size:14px;font-weight:700;cursor:pointer;
                   display:flex;align-items:center;justify-content:center;gap:8px;
                   box-shadow:0 4px 14px rgba(0,0,0,0.18);transition:opacity .2s;"
            onmouseover="this.style.opacity='0.92'"
            onmouseout="this.style.opacity='1'">
      <i class="fas fa-${record ? 'check-circle' : 'plus-circle'}" style="font-size:15px;"></i>
      ${record ? 'حفظ التعديلات' : 'إضافة السجل'}
    </button>
  </div>

</div>`;

        document.body.appendChild(modal);

        const closeModal = () => {
            modal.style.opacity = '0';
            modal.style.transition = 'opacity 0.15s ease';
            setTimeout(() => { try { modal.remove(); } catch (_) {} }, 160);
        };

        modal.querySelector(`#close-res-${type}`).addEventListener('click', closeModal);
        modal.querySelector(`#cancel-res-${type}`).addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        modal.querySelector(`#save-res-${type}`).addEventListener('click',
            () => this.handleResourceSubmit(type, recordId, modal, closeModal));

        if (!recordId) {
            const locSel = document.getElementById(`resource-location-${type}`);
            if (locSel) locSel.addEventListener('change', () => this.applyResourceStartFromPreviousChain(type, recordId));
            this.applyResourceStartFromPreviousChain(type, recordId);
        } else {
            this.calculateConsumption(type);
        }
    },

    /**
     * تحديث الشهر/السنة تلقائياً
     */
    updateMonthYear(type) {
        const dateInput = document.getElementById(`resource-date-${type}`);
        if (dateInput && dateInput.value) {
            const date = new Date(dateInput.value);
            const monthYear = this.getMonthYear(date);
            const monthYearInput = document.getElementById(`resource-month-year-${type}`);
            if (monthYearInput) {
                monthYearInput.value = monthYear;
            }
        }
    },

    /**
     * حساب الاستهلاك تلقائياً مع تحقق لحظي من القيم
     */
    calculateConsumption(type) {
        const startInput = document.getElementById(`resource-start-${type}`);
        const endInput   = document.getElementById(`resource-end-${type}`);
        const totalInput = document.getElementById(`resource-total-${type}`);
        if (!startInput || !endInput || !totalInput) return;

        const start = parseFloat(startInput.value);
        const end   = parseFloat(endInput.value);

        // تحقق: القراءة الجديدة لا تقل عن القراءة الحالية
        const isStartValid = !isNaN(start) && start >= 0;
        const isEndValid   = !isNaN(end)   && end   >= 0;
        const isOrderValid = isEndValid && isStartValid ? end >= start : true;

        // تلوين حدود الحقول لحظياً
        const okStyle   = '1.5px solid #d1d5db';
        const errStyle  = '2px solid #ef4444';
        endInput.style.border = (isEndValid && !isOrderValid) ? errStyle : okStyle;

        // عرض رسالة تحذير تحت حقل النهاية
        let warnEl = document.getElementById(`resource-end-warn-${type}`);
        if (!isOrderValid && isEndValid && isStartValid) {
            if (!warnEl) {
                warnEl = document.createElement('p');
                warnEl.id = `resource-end-warn-${type}`;
                warnEl.style.cssText = 'color:#ef4444;font-size:11px;margin:3px 0 0;';
                endInput.parentElement.insertAdjacentElement('afterend', warnEl);
            }
            warnEl.textContent = '⚠️ القراءة الجديدة أقل من قراءة البداية!';
        } else if (warnEl) {
            warnEl.remove();
        }

        // حساب الإجمالي
        if (isStartValid && isEndValid && isOrderValid) {
            totalInput.value = Math.max(0, end - start).toFixed(2);
            totalInput.style.color = '#111827';
            totalInput.style.background = '#e5e7eb';
        } else if (!isOrderValid) {
            totalInput.value = '0.00';
            totalInput.style.color = '#ef4444';
            totalInput.style.background = '#fee2e2';
        } else {
            totalInput.value = '';
            totalInput.style.color = '#111827';
            totalInput.style.background = '#e5e7eb';
        }
    },

    /**
     * معالجة حفظ السجل — مع تحقق شامل من القيم
     */
    async handleResourceSubmit(type, recordId, modal, closeModal) {
        if (recordId && !this.hasFullSustainabilityManage()) {
            if (typeof Notification !== 'undefined') Notification.error('ليس لديك صلاحية تعديل السجلات');
            return;
        }
        if (!recordId && !this.canRegisterResourceConsumption()) {
            if (typeof Notification !== 'undefined') Notification.error('ليس لديك صلاحية إضافة سجلات الاستهلاك');
            return;
        }

        // ===== جمع القيم =====
        const dateVal   = document.getElementById(`resource-date-${type}`)?.value;
        const monthYear = document.getElementById(`resource-month-year-${type}`)?.value?.trim();
        const location  = document.getElementById(`resource-location-${type}`)?.value?.trim();
        const source    = document.getElementById(`resource-source-${type}`)?.value?.trim();
        const startRaw  = document.getElementById(`resource-start-${type}`)?.value;
        const endRaw    = document.getElementById(`resource-end-${type}`)?.value;
        const totalRaw  = document.getElementById(`resource-total-${type}`)?.value;
        const unit      = document.getElementById(`resource-unit-${type}`)?.value?.trim() || this.getDefaultUnit(type);
        const department= document.getElementById(`resource-department-${type}`)?.value?.trim() || '';
        const notes     = document.getElementById(`resource-notes-${type}`)?.value?.trim() || '';

        const startReading    = parseFloat(startRaw);
        const endReading      = parseFloat(endRaw);
        const totalConsumption= parseFloat(totalRaw);

        // ===== قواعد التحقق =====
        const errors = [];

        if (!dateVal)                               errors.push('يرجى تحديد التاريخ');
        if (!location)                              errors.push('يرجى اختيار الموقع / المصنع');
        if (startRaw === '' || isNaN(startReading)) errors.push('قراءة البداية مطلوبة');
        if (endRaw   === '' || isNaN(endReading))   errors.push('قراءة النهاية / القراءة الحالية مطلوبة');
        if (!isNaN(startReading) && startReading < 0) errors.push('قراءة البداية لا يمكن أن تكون سالبة');
        if (!isNaN(endReading)   && endReading   < 0) errors.push('القراءة الحالية لا يمكن أن تكون سالبة');
        if (!isNaN(startReading) && !isNaN(endReading) && endReading < startReading)
            errors.push(`القراءة الجديدة (${endReading}) أقل من قراءة البداية (${startReading}) — يرجى مراجعة العداد`);
        if (isNaN(totalConsumption) || totalConsumption < 0)
            errors.push('إجمالي الاستهلاك غير صحيح — تأكد من قراءة البداية والنهاية');

        if (errors.length > 0) {
            Notification.error(errors[0]);
            return;
        }

        const date = new Date(dateVal);

        // التحقق من التنبيهات
        const hasAlert = this.checkConsumptionAlert(type, totalConsumption, monthYear);

        const formData = {
            id: recordId || Utils.generateId(type.toUpperCase().substring(0, 3)),
            serialNumber: recordId ? (AppState.appData.resourceConsumption?.[type] || []).find(r => r.id === recordId)?.serialNumber : this.generateSerialNumber(type),
            date: date.toISOString(),
            monthYear: monthYear,
            location: location,
            source: source,
            startReading: startReading,
            endReading: endReading,
            totalConsumption: totalConsumption,
            unit: unit,
            department: department,
            notes: notes,
            hasAlert: hasAlert,
            createdAt: recordId ? (AppState.appData.resourceConsumption?.[type] || []).find(r => r.id === recordId)?.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: AppState.currentUser?.email || AppState.currentUser?.name || 'Unknown',
            updatedBy: AppState.currentUser?.email || AppState.currentUser?.name || 'Unknown'
        };

        if (!AppState.appData.resourceConsumption) {
            AppState.appData.resourceConsumption = {};
        }
        if (!AppState.appData.resourceConsumption[type]) {
            AppState.appData.resourceConsumption[type] = [];
        }

        Loading.show();
        try {
            let previousRecord = null;
            let previousIndex = -1;
            if (recordId) {
                previousIndex = AppState.appData.resourceConsumption[type].findIndex((r) => r.id === recordId);
                if (previousIndex !== -1) {
                    try {
                        previousRecord = JSON.parse(JSON.stringify(AppState.appData.resourceConsumption[type][previousIndex]));
                    } catch (e) {
                        previousRecord = null;
                    }
                }
            }

            if (recordId) {
                const index = AppState.appData.resourceConsumption[type].findIndex(r => r.id === recordId);
                if (index !== -1) {
                    AppState.appData.resourceConsumption[type][index] = formData;
                }
            } else {
                AppState.appData.resourceConsumption[type].push(formData);
            }

            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            } else {
                Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
            }


            // ✅ 1) إغلاق المودال فوراً (قبل المزامنة مع الشيت)
            Notification.success(recordId ? 'تم تحديث السجل بنجاح' : 'تم إضافة السجل بنجاح');
            if (typeof closeModal === 'function') {
                closeModal();
            } else {
                try { modal.remove(); } catch (e) { /* ignore */ }
            }

            // ✅ 2) تحديث فوري للكروت ومسح الكاش المخبأ لجلب البيانات الفعلية من الشيت
            this._resourceConsumptionFetchPromise = null;
            this._refreshDashboardTotals();
            this.load();

            // ✅ 3) المزامنة مع Google Sheets في الخلفية
            this.saveResourceConsumptionToSheets().then(saveResult => {
                if (!saveResult.success) {
                    // rollback إذا فشل الحفظ
                    if (recordId && previousRecord !== null && previousIndex !== -1) {
                        AppState.appData.resourceConsumption[type][previousIndex] = previousRecord;
                    } else if (!recordId) {
                        AppState.appData.resourceConsumption[type] =
                            AppState.appData.resourceConsumption[type].filter(r => r.id !== formData.id);
                    }
                    if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                        window.DataManager.save();
                    }
                    Notification.error('⚠️ فشل المزامنة مع الشيت: ' + (saveResult.message || saveResult.error || ''));
                    this._refreshDashboardTotals();
                    this.load();
                }
            }).catch(err => {
                Utils.safeError('خطأ في المزامنة مع الشيت:', err);
            });

            if (hasAlert) {
                Notification.warning(`تنبيه: استهلاك ${this.getTypeName(type)} تجاوز الحد المسموح`);
            }
        } catch (error) {
            Loading.hide();
            Notification.error('حدث خطأ: ' + error.message);
        }
    },

    /**
     * عرض تفاصيل السجل
     */
    viewResourceRecord(type, recordId) {
        const data = AppState.appData.resourceConsumption?.[type] || [];
        const record = data.find(r => r.id === recordId);
        if (!record) {
            Notification.error('السجل غير موجود');
            return;
        }

        const typeNames = {
            water: { name: 'مياه', icon: 'tint', color: 'blue' },
            electricity: { name: 'كهرباء', icon: 'bolt', color: 'yellow' },
            gas: { name: 'غاز طبيعي', icon: 'fire', color: 'orange' }
        };
        const typeInfo = typeNames[type] || typeNames.water;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-${typeInfo.icon} text-${typeInfo.color}-500 ml-2"></i>
                        تفاصيل سجل استهلاك ${typeInfo.name}
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="space-y-3">
                        <div class="grid grid-cols-2 gap-4">
                            <div><strong>الرقم التسلسلي:</strong> ${Utils.escapeHTML(record.serialNumber || '')}</div>
                            <div><strong>التاريخ:</strong> ${Utils.formatDate(record.date)}</div>
                            <div><strong>الشهر / السنة:</strong> ${Utils.escapeHTML(record.monthYear || '')}</div>
                            <div><strong>الموقع / المصنع:</strong> ${Utils.escapeHTML(record.location || '')}</div>
                            <div><strong>المصدر:</strong> ${Utils.escapeHTML(record.source || '')}</div>
                            <div><strong>قراءة البداية:</strong> ${parseFloat(record.startReading || 0).toFixed(2)}</div>
                            <div><strong>قراءة النهاية:</strong> ${parseFloat(record.endReading || 0).toFixed(2)}</div>
                            <div><strong>إجمالي الاستهلاك:</strong> <span class="font-semibold">${parseFloat(record.totalConsumption || 0).toFixed(2)} ${Utils.escapeHTML(record.unit || '')}</span></div>
                            <div><strong>وحدة القياس:</strong> ${Utils.escapeHTML(record.unit || '')}</div>
                            <div><strong>الجهة / القسم:</strong> ${Utils.escapeHTML(record.department || '-')}</div>
                            <div><strong>الحالة:</strong> 
                                ${record.hasAlert ? `
                                    <span class="badge badge-danger">
                                        <i class="fas fa-exclamation-triangle ml-1"></i>
                                        تنبيه
                                    </span>
                                ` : `
                                    <span class="badge badge-success">طبيعي</span>
                                `}
                            </div>
                        </div>
                        ${record.notes ? `
                            <div class="mt-4 pt-4 border-t">
                                <strong>ملاحظات:</strong>
                                <p class="text-gray-700 dark:text-gray-300 mt-2">${Utils.escapeHTML(record.notes)}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                        إغلاق
                    </button>
                    ${this.canEdit() ? `
                    <button type="button" class="btn-primary" onclick="Sustainability.editResourceRecord('${type}', '${recordId}'); this.closest('.modal-overlay').remove();">
                        <i class="fas fa-edit ml-2"></i>
                        تعديل
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    /**
     * تعديل السجل
     */
    editResourceRecord(type, recordId) {
        if (!this.canEdit()) {
            Notification.error('ليس لديك صلاحية لتعديل السجلات');
            return;
        }
        this.showResourceForm(type, recordId);
    },

    /**
     * حذف السجل
     */
    async deleteResourceRecord(type, recordId) {
        if (!this.canDelete()) {
            Notification.error('ليس لديك صلاحية لحذف السجلات');
            return;
        }

        if (!confirm('هل أنت متأكد من حذف هذا السجل؟')) return;

        Loading.show();
        try {
            const snapshot = Array.isArray(AppState.appData.resourceConsumption[type])
                ? [...AppState.appData.resourceConsumption[type]]
                : [];

            AppState.appData.resourceConsumption[type] = AppState.appData.resourceConsumption[type].filter(r => r.id !== recordId);

            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }

            const saveResult = await this.saveResourceConsumptionToSheets();
            if (!saveResult.success) {
                AppState.appData.resourceConsumption[type] = snapshot;
                if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                    window.DataManager.save();
                }
                Notification.error('فشل حذف السجل في الخادم: ' + (saveResult.message || saveResult.error || ''));
                return;
            }
            Notification.success('تم حذف السجل بنجاح');
            this.load();
        } catch (error) {
            Notification.error('حدث خطأ: ' + error.message);
        } finally {
            Loading.hide();
        }
    },

    /**
     * عرض الإعدادات (للمدير فقط)
     */
    renderSettings() {
        if (!this.canManageSettings()) {
            return '<div class="empty-state"><p class="text-gray-500">ليس لديك صلاحية للوصول إلى الإعدادات</p></div>';
        }

        return `
            <div class="content-card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-cog ml-2"></i>
                        إعدادات الاستدامة البيئية
                    </h2>
                </div>
                <div class="card-body">
                    <form id="sustainability-settings-form" class="space-y-6">
                        <div>
                            <h3 class="text-lg font-semibold mb-4">حدود الاستهلاك الشهرية</h3>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label for="limit-water" class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                        <i class="fas fa-tint text-blue-500 ml-1"></i>
                                        حد استهلاك المياه (م³)
                                    </label>
                                    <input type="number" id="limit-water" step="0.01" 
                                           class="form-input" 
                                           value="${this.settings.consumptionLimits.water}">
                                </div>
                                <div>
                                    <label for="limit-electricity" class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                        <i class="fas fa-bolt text-yellow-500 ml-1"></i>
                                        حد استهلاك الكهرباء (ك.و)
                                    </label>
                                    <input type="number" id="limit-electricity" step="0.01" 
                                           class="form-input" 
                                           value="${this.settings.consumptionLimits.electricity}">
                                </div>
                                <div>
                                    <label for="limit-gas" class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                        <i class="fas fa-fire text-orange-500 ml-1"></i>
                                        حد استهلاك الغاز (م³)
                                    </label>
                                    <input type="number" id="limit-gas" step="0.01" 
                                           class="form-input" 
                                           value="${this.settings.consumptionLimits.gas}">
                                </div>
                            </div>
                        </div>
                        <div>
                            <label for="alert-threshold" class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                نسبة التنبيه (% من المتوسط)
                            </label>
                            <input type="number" id="alert-threshold" step="0.1" min="1" max="2"
                                   class="form-input" 
                                   value="${this.settings.alertThreshold}">
                            <p class="text-xs text-gray-500 mt-1">
                                سيتم إظهار تنبيه عند تجاوز الاستهلاك لهذه النسبة من المتوسط الشهري
                            </p>
                        </div>
                        <div class="flex justify-end gap-2 pt-4 border-t">
                            <button type="button" class="btn-secondary" onclick="Sustainability.loadSettings(); Sustainability.currentTab='settings'; Sustainability.load();">
                                إلغاء
                            </button>
                            <button type="button" class="btn-primary" onclick="Sustainability.saveSettings()">
                                <i class="fas fa-save ml-2"></i>
                                حفظ الإعدادات
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    },

    /**
     * حفظ الإعدادات
     */
    async saveSettings() {
        if (!this.canManageSettings()) {
            Notification.error('ليس لديك صلاحية لحفظ الإعدادات');
            return;
        }

        this.settings.consumptionLimits.water = parseFloat(document.getElementById('limit-water').value) || 10000;
        this.settings.consumptionLimits.electricity = parseFloat(document.getElementById('limit-electricity').value) || 50000;
        this.settings.consumptionLimits.gas = parseFloat(document.getElementById('limit-gas').value) || 30000;
        this.settings.alertThreshold = parseFloat(document.getElementById('alert-threshold').value) || 1.2;

        // حفظ في localStorage
        try {
            localStorage.setItem('sustainability_settings', JSON.stringify(this.settings));
            Notification.success('تم حفظ الإعدادات بنجاح');
            this.load();
        } catch (error) {
            Notification.error('حدث خطأ أثناء حفظ الإعدادات: ' + error.message);
        }
    },

    /**
     * تحميل الإعدادات
     */
    loadSettings() {
        try {
            const saved = localStorage.getItem('sustainability_settings');
            if (saved) {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
            }
        } catch (error) {
            Utils.safeWarn('خطأ في تحميل إعدادات الاستدامة:', error);
        }
    },

    // ===== دوال مساعدة =====

    /**
     * الحصول على الشهر/السنة من التاريخ
     */
    getMonthYear(date) {
        const d = new Date(date);
        const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 
                       'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        return `${months[d.getMonth()]} ${d.getFullYear()}`;
    },

    /**
     * الحصول على الوحدة الافتراضية
     */
    getDefaultUnit(type) {
        const units = {
            water: 'م³',
            electricity: 'ك.و',
            gas: 'م³'
        };
        return units[type] || '';
    },

    /**
     * الحصول على اسم النوع
     */
    getTypeName(type) {
        const names = {
            water: 'المياه',
            electricity: 'الكهرباء',
            gas: 'الغاز الطبيعي'
        };
        return names[type] || type;
    },

    /**
     * سجلات استهلاك النوع مرتبة من الأحدث إلى الأقدم
     */
    getConsumptionRecordsSortedDesc(type) {
        const arr = [...(AppState.appData.resourceConsumption?.[type] || [])];
        return arr.sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    /**
     * آخر سجل لنفس الموقع بعد اختياره (لا يُستخدم قبل اختيار الموقع لتجنب خلط العدادات).
     */
    getPreviousConsumptionRecord(type, locationFilter) {
        const sorted = this.getConsumptionRecordsSortedDesc(type);
        if (!sorted.length) return null;
        if (locationFilter == null || String(locationFilter).trim() === '') return null;
        const loc = String(locationFilter).trim();
        return sorted.find(r => String(r.location || '').trim() === loc) || null;
    },

    /**
     * تحديث قراءة البداية من السجل السابق عند الإضافة (بعد أول تسجيل لكل موقع/نوع)
     */
    applyResourceStartFromPreviousChain(type, recordId) {
        if (recordId) return;
        const locSel = document.getElementById(`resource-location-${type}`);
        const startEl = document.getElementById(`resource-start-${type}`);
        if (!startEl) return;
        const loc = (locSel?.value || '').trim();
        const prev = this.getPreviousConsumptionRecord(type, loc);
        const helpEl = document.getElementById(`resource-start-help-${type}`);
        const startLab = document.getElementById(`resource-start-label-${type}`);
        const endLab = document.getElementById(`resource-end-label-${type}`);
        if (prev != null) {
            const endVal = parseFloat(prev.endReading);
            startEl.value = Number.isFinite(endVal) ? endVal.toFixed(2) : '';
            startEl.readOnly = true;
            startEl.classList.add('bg-gray-100', 'dark:bg-gray-800');
            startEl.removeAttribute('required');
            if (helpEl) {
                helpEl.textContent = 'مُستخرجة تلقائياً من قراءة نهاية آخر سجل لهذا الموقع.';
                helpEl.classList.remove('hidden');
            }
            if (startLab) startLab.innerHTML = 'قراءة البداية ';
            if (endLab) endLab.innerHTML = 'القراءة الحالية (قراءة العداد) <span class="text-red-500">*</span>';
        } else {
            startEl.value = '';
            startEl.readOnly = false;
            startEl.classList.remove('bg-gray-100', 'dark:bg-gray-800');
            startEl.setAttribute('required', 'required');
            if (helpEl) {
                helpEl.textContent = '';
                helpEl.classList.add('hidden');
            }
            if (startLab) startLab.innerHTML = 'قراءة البداية <span class="text-red-500">*</span>';
            if (endLab) endLab.innerHTML = 'قراءة النهاية <span class="text-red-500">*</span>';
        }
        this.calculateConsumption(type);
    },

    /**
     * إنشاء رقم تسلسلي
     */
    generateSerialNumber(type) {
        const data = AppState.appData.resourceConsumption?.[type] || [];
        const prefix = {
            water: 'WTR',
            electricity: 'ELC',
            gas: 'GAS'
        }[type] || 'RES';
        
        const nextNum = data.length + 1;
        return `${prefix}-${String(nextNum).padStart(6, '0')}`;
    },

    /**
     * الحصول على استهلاك الشهر الحالي
     */
    getMonthlyConsumption(data, month, year) {
        return data
            .filter(record => {
                const recordDate = new Date(record.date);
                return recordDate.getMonth() === month && recordDate.getFullYear() === year;
            })
            .reduce((sum, record) => sum + (parseFloat(record.totalConsumption) || 0), 0);
    },

    /**
     * اتجاه الاستهلاك ضمن نفس سنة البيانات المعروضة (آخر شهر له بيانات مقارنة بالشهر السابق في نفس السنة)
     */
    getTrendForYearScopedData(data) {
        if (!data || data.length < 2) return 'stable';
        const latest = this.getLatestMonthContext(data);
        if (!latest) return 'stable';
        const cm = latest.month;
        const cy = latest.year;
        const pm = cm === 0 ? 11 : cm - 1;
        const py = cy;
        const current = this.getMonthlyConsumption(data, cm, cy);
        const previous = this.getMonthlyConsumption(data, pm, py);
        if (previous === 0) return 'stable';
        const change = ((current - previous) / previous) * 100;
        if (change > 5) return 'up';
        if (change < -5) return 'down';
        return 'stable';
    },

    getLatestMonthContext(data = []) {
        const validDates = (data || [])
            .map((record) => new Date(record?.date))
            .filter((d) => !Number.isNaN(d.getTime()))
            .sort((a, b) => a - b);

        if (!validDates.length) return null;
        const latest = validDates[validDates.length - 1];
        return { month: latest.getMonth(), year: latest.getFullYear() };
    },

    getLatestMonthlyConsumption(data = []) {
        const latest = this.getLatestMonthContext(data);
        if (!latest) {
            return { total: 0, month: null, year: null };
        }
        return {
            total: this.getMonthlyConsumption(data, latest.month, latest.year),
            month: latest.month,
            year: latest.year
        };
    },

    /**
     * الحصول على اتجاه الاستهلاك
     */
    getTrend(data, type) {
        if (data.length < 2) return 'stable';

        const latest = this.getLatestMonthContext(data);
        if (!latest) return 'stable';
        const currentMonth = latest.month;
        const currentYear = latest.year;
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

        const current = this.getMonthlyConsumption(data, currentMonth, currentYear);
        const previous = this.getMonthlyConsumption(data, lastMonth, lastMonthYear);

        if (previous === 0) return 'stable';
        const change = ((current - previous) / previous) * 100;

        if (change > 5) return 'up';
        if (change < -5) return 'down';
        return 'stable';
    },

    /**
     * الحصول على نص الاتجاه
     */
    getTrendText(trend) {
        const texts = {
            up: 'زيادة',
            down: 'انخفاض',
            stable: 'ثابت'
        };
        return texts[trend] || 'ثابت';
    },

    /**
     * حساب التحليلات
     */
    calculateAnalytics() {
        const { water: waterData, electricity: electricityData, gas: gasData } = this.getViewFilteredConsumption();

        const calculate = (data) => {
            const total = data.reduce((sum, r) => sum + (parseFloat(r.totalConsumption) || 0), 0);
            const average = data.length > 0 ? total / data.length : 0;
            const trend = this.getTrendForYearScopedData(data);
            const trendText = this.getTrendText(trend);
            return { total, current: 0, previous: 0, average, trend, trendText };
        };

        return {
            water: calculate(waterData),
            electricity: calculate(electricityData),
            gas: calculate(gasData)
        };
    },

    /**
     * التحقق من تنبيه الاستهلاك
     */
    checkConsumptionAlert(type, consumption, monthYear) {
        const data = AppState.appData.resourceConsumption?.[type] || [];
        const monthlyData = data.filter(r => r.monthYear === monthYear);
        
        if (monthlyData.length === 0) return false;

        const monthlyTotal = monthlyData.reduce((sum, r) => sum + (parseFloat(r.totalConsumption) || 0), 0);
        const average = monthlyTotal / monthlyData.length;
        const threshold = average * this.settings.alertThreshold;

        return consumption > threshold;
    },

    /**
     * الحصول على التنبيهات النشطة
     */
    getActiveAlerts() {
        const alerts = [];
        const { water: waterData, electricity: electricityData, gas: gasData, year: viewYear } = this.getViewFilteredConsumption();

        const checkAlerts = (data, type, name, icon) => {
            const latest = this.getLatestMonthContext(data);
            if (!latest || latest.year !== viewYear) return;
            const monthlyData = data.filter(r => {
                const recordDate = new Date(r.date);
                return recordDate.getMonth() === latest.month && recordDate.getFullYear() === latest.year;
            });

            if (monthlyData.length === 0) return;

            const monthlyTotal = monthlyData.reduce((sum, r) => sum + (parseFloat(r.totalConsumption) || 0), 0);
            const limit = this.settings.consumptionLimits[type];
            const percentage = limit > 0 ? (monthlyTotal / limit) * 100 : 0;

            if (percentage > 100) {
                alerts.push({
                    type: type,
                    title: `استهلاك ${name} تجاوز الحد`,
                    message: `الاستهلاك الحالي: ${monthlyTotal.toFixed(2)} (${percentage.toFixed(1)}% من الحد)`,
                    percentage: percentage,
                    icon: icon
                });
            }
        };

        checkAlerts(waterData, 'water', 'المياه', 'tint');
        checkAlerts(electricityData, 'electricity', 'الكهرباء', 'bolt');
        checkAlerts(gasData, 'gas', 'الغاز', 'fire');

        return alerts;
    },

    /**
     * الحصول على إجمالي التنبيهات
     */
    getTotalAlerts() {
        return this.getActiveAlerts().length;
    },

    /**
     * رسم الرسوم البيانية
     */
    async renderCharts() {
        // التأكد من تحميل Chart.js
        const chartLoaded = await this.ensureChartJSLoaded();
        if (!chartLoaded || typeof Chart === 'undefined') {
            Utils.safeWarn('Chart.js غير متاح - لن يتم عرض الرسوم البيانية');
            return;
        }

        // رسم رسوم بيانية شهرية
        this.renderMonthlyChart('water-monthly-chart', 'water', 'مياه', 'rgba(59, 130, 246, 0.8)');
        this.renderMonthlyChart('electricity-monthly-chart', 'electricity', 'كهرباء', 'rgba(245, 158, 11, 0.8)');
        this.renderMonthlyChart('gas-monthly-chart', 'gas', 'غاز', 'rgba(249, 115, 22, 0.8)');
        
        // رسم توزيع المصادر
        this.renderSourceDistributionChart();
    },

    /**
     * التأكد من تحميل Chart.js
     */
    async ensureChartJSLoaded() {
        if (typeof Chart !== 'undefined') {
            return true;
        }

        const existingScript = document.querySelector('script[src*="chart.js"], script[src*="chartjs"]');
        if (existingScript) {
            return new Promise((resolve) => {
                let attempts = 0;
                const maxAttempts = 50; // 5 ثوان
                const checkInterval = setInterval(() => {
                    attempts++;
                    if (typeof Chart !== 'undefined') {
                        clearInterval(checkInterval);
                        resolve(true);
                    } else if (attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        resolve(false);
                    }
                }, 100);
            });
        }

        return false;
    },

    /**
     * رسم الرسم البياني الشهري
     */
    renderMonthlyChart(canvasId, type, name, color) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        // إزالة الرسم السابق إن وجد
        if (canvas.chart) {
            canvas.chart.destroy();
        }

        const fv = this.getViewFilteredConsumption();
        const data = fv[type] || [];
        const monthlyData = this.getMonthlyDataForYear(data, fv.year);

        const ctx = canvas.getContext('2d');
        canvas.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: monthlyData.map(d => d.month),
                datasets: [{
                    label: `استهلاك ${name} (${fv.year})`,
                    data: monthlyData.map(d => d.total),
                    backgroundColor: color,
                    borderColor: color.replace('0.8', '1'),
                    borderWidth: 2,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        rtl: true
                    },
                    tooltip: {
                        rtl: true,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(0);
                            }
                        }
                    }
                }
            }
        });
    },

    /**
     * الحصول على البيانات الشهرية
     */
    getMonthlyData(data) {
        const monthlyMap = {};
        
        data.forEach(record => {
            const date = new Date(record.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthLabel = this.getMonthYear(date);
            
            if (!monthlyMap[monthKey]) {
                monthlyMap[monthKey] = {
                    month: monthLabel,
                    total: 0
                };
            }
            
            monthlyMap[monthKey].total += parseFloat(record.totalConsumption) || 0;
        });

        // ترتيب حسب التاريخ
        return Object.entries(monthlyMap)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-12) // آخر 12 شهر
            .map(([key, value]) => value);
    },

    /** سلسلة شهرية ضمن سنة واحدة (للرسوم عند تصفية السنة) */
    getMonthlyDataForYear(data, year) {
        const y = Number(year);
        if (!Number.isFinite(y)) return [];
        const monthlyMap = {};
        (data || []).forEach((record) => {
            const date = new Date(record.date);
            if (Number.isNaN(date.getTime()) || date.getFullYear() !== y) return;
            const monthKey = `${y}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthLabel = this.getMonthYear(date);
            if (!monthlyMap[monthKey]) {
                monthlyMap[monthKey] = { month: monthLabel, total: 0 };
            }
            monthlyMap[monthKey].total += parseFloat(record.totalConsumption) || 0;
        });
        return Object.entries(monthlyMap)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([, value]) => value);
    },

    /**
     * رسم توزيع المصادر
     */
    renderSourceDistributionChart() {
        const canvas = document.getElementById('source-distribution-chart');
        if (!canvas) return;

        if (canvas.chart) {
            canvas.chart.destroy();
        }

        const { water: waterData, electricity: electricityData, gas: gasData } = this.getViewFilteredConsumption();

        const waterTotal = waterData.reduce((sum, r) => sum + (parseFloat(r.totalConsumption) || 0), 0);
        const electricityTotal = electricityData.reduce((sum, r) => sum + (parseFloat(r.totalConsumption) || 0), 0);
        const gasTotal = gasData.reduce((sum, r) => sum + (parseFloat(r.totalConsumption) || 0), 0);

        const ctx = canvas.getContext('2d');
        canvas.chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['مياه', 'كهرباء', 'غاز طبيعي'],
                datasets: [{
                    data: [waterTotal, electricityTotal, gasTotal],
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(249, 115, 22, 0.8)'
                    ],
                    borderColor: [
                        'rgba(59, 130, 246, 1)',
                        'rgba(245, 158, 11, 1)',
                        'rgba(249, 115, 22, 1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        rtl: true
                    },
                    tooltip: {
                        rtl: true,
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${context.label}: ${context.parsed.toFixed(2)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    },

    /**
     * عرض تبويب إدارة المخلفات
     */
    async renderWasteManagement() {
        try {
            const defaultWasteData = {
                regularWasteTypes: ['خشب', 'ورق', 'استرتش', 'بلاستيك', 'شكائر', 'جراكن فارغة'],
                regularWasteRecords: [],
                regularWasteSales: [],
                hazardousWasteRecords: []
            };
            
            const wasteData = AppState.appData.wasteManagement || defaultWasteData;
            
            // التأكد من وجود جميع الخصائص
            if (!wasteData.regularWasteTypes) wasteData.regularWasteTypes = defaultWasteData.regularWasteTypes;
            if (!wasteData.regularWasteRecords) wasteData.regularWasteRecords = [];
            if (!wasteData.regularWasteSales) wasteData.regularWasteSales = [];
            if (!wasteData.hazardousWasteRecords) wasteData.hazardousWasteRecords = [];

        return `
            <div class="space-y-6">
                <!-- التحليلات السريعة -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                        <div class="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">
                            ${this.getTotalRegularWasteQuantity(wasteData.regularWasteRecords || [])}
                        </div>
                        <div class="text-sm text-gray-700 dark:text-gray-300 font-semibold">
                            <i class="fas fa-recycle ml-1"></i>إجمالي المخلفات العادية
                        </div>
                    </div>
                    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
                        <div class="text-3xl font-bold text-red-600 dark:text-red-400 mb-2">
                            ${this.getTotalHazardousWasteQuantity(wasteData.hazardousWasteRecords || [])}
                        </div>
                        <div class="text-sm text-gray-700 dark:text-gray-300 font-semibold">
                            <i class="fas fa-exclamation-triangle ml-1"></i>إجمالي المخلفات الخطرة
                        </div>
                    </div>
                    <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
                        <div class="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                            ${this.getTotalSalesRevenue(wasteData.regularWasteSales || []).toFixed(2)}
                        </div>
                        <div class="text-sm text-gray-700 dark:text-gray-300 font-semibold">
                            <i class="fas fa-money-bill-wave ml-1"></i>إجمالي العائد (ج.م)
                        </div>
                    </div>
                    <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-center">
                        <div class="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mb-2">
                            ${(wasteData.regularWasteSales || []).length}
                        </div>
                        <div class="text-sm text-gray-700 dark:text-gray-300 font-semibold">
                            <i class="fas fa-shopping-cart ml-1"></i>عمليات البيع
                        </div>
                    </div>
                </div>

                <!-- التبويبات الداخلية -->
                <div class="mt-6">
                    <div class="flex gap-2 mb-6 border-b overflow-x-auto">
                        <button class="tab-btn-internal ${this.currentWasteSubTab === 'regular' ? 'active' : ''}" 
                                onclick="Sustainability.currentWasteSubTab='regular'; Sustainability.load();">
                            <i class="fas fa-recycle ml-2"></i>المخلفات العادية
                        </button>
                        <button class="tab-btn-internal ${this.currentWasteSubTab === 'hazardous' ? 'active' : ''}" 
                                onclick="Sustainability.currentWasteSubTab='hazardous'; Sustainability.load();">
                            <i class="fas fa-exclamation-triangle ml-2"></i>المخلفات الخطرة
                        </button>
                        <button class="tab-btn-internal ${this.currentWasteSubTab === 'analytics' ? 'active' : ''}" 
                                onclick="Sustainability.currentWasteSubTab='analytics'; Sustainability.load();">
                            <i class="fas fa-chart-bar ml-2"></i>التحليلات
                        </button>
                        ${this.isAdmin() ? `
                        <button class="tab-btn-internal ${this.currentWasteSubTab === 'waste-types' ? 'active' : ''}" 
                                onclick="Sustainability.currentWasteSubTab='waste-types'; Sustainability.load();">
                            <i class="fas fa-list ml-2"></i>إدارة أنواع المخلفات
                        </button>
                        ` : ''}
                    </div>
                    <div id="waste-management-content">
                        ${await this.renderWasteManagementContent()}
                    </div>
                </div>
            </div>
            <style>
                .tab-btn-internal {
                    padding: 10px 20px;
                    border: none;
                    background: transparent;
                    color: #6b7280;
                    font-weight: 500;
                    cursor: pointer;
                    border-bottom: 3px solid transparent;
                    transition: all 0.3s;
                    white-space: nowrap;
                }
                .tab-btn-internal:hover {
                    color: #3b82f6;
                }
                .tab-btn-internal.active {
                    color: #3b82f6;
                    border-bottom-color: #3b82f6;
                    font-weight: 600;
                }
            </style>
        `;
        } catch (error) {
            Utils.safeError('❌ خطأ في renderWasteManagement:', error);
            return `
                <div class="content-card">
                    <div class="card-body">
                        <div class="empty-state">
                            <i class="fas fa-exclamation-triangle text-red-500 text-4xl mb-4"></i>
                            <p class="text-gray-500 mb-4">حدث خطأ أثناء عرض بيانات إدارة المخلفات</p>
                            <button onclick="Sustainability.load()" class="btn-primary">
                                <i class="fas fa-redo ml-2"></i>
                                إعادة المحاولة
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    /**
     * عرض محتوى تبويب إدارة المخلفات حسب التبويب الفرعي
     */
    async renderWasteManagementContent() {
        if (!this.currentWasteSubTab) {
            this.currentWasteSubTab = 'regular';
        }

        switch (this.currentWasteSubTab) {
            case 'regular':
                return await this.renderRegularWaste();
            case 'hazardous':
                return await this.renderHazardousWaste();
            case 'analytics':
                return await this.renderWasteAnalytics();
            case 'waste-types':
                return await this.renderWasteTypesManagement();
            default:
                return await this.renderRegularWaste();
        }
    },

    /**
     * عرض قسم المخلفات العادية
     */
    async renderRegularWaste() {
        const wasteData = AppState.appData.wasteManagement || {
            regularWasteRecords: [],
            regularWasteSales: []
        };
        const records = wasteData.regularWasteRecords || [];
        const sales = wasteData.regularWasteSales || [];

        return `
            <div class="space-y-6">
                <!-- سجل المخلفات العادية -->
                <div class="content-card border-l-4 border-green-500">
                    <div class="card-header bg-green-50 dark:bg-green-900/20">
                        <div class="flex items-center justify-between">
                            <h2 class="card-title text-green-700 dark:text-green-400">
                                <i class="fas fa-recycle ml-2"></i>
                                سجل المخلفات العادية
                            </h2>
                            <button class="btn-success" onclick="Sustainability.showRegularWasteForm()">
                                <i class="fas fa-plus ml-2"></i>
                                إضافة سجل جديد
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        ${records.length === 0 ? `
                            <div class="empty-state">
                                <i class="fas fa-recycle text-4xl text-green-400 mb-4"></i>
                                <p class="text-gray-500">لا توجد سجلات للمخلفات العادية. ابدأ بإضافة سجلات جديدة.</p>
                            </div>
                        ` : `
                            <div class="overflow-x-auto">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>الرقم التسلسلي</th>
                                            <th>التاريخ</th>
                                            <th>الموقع / المصنع</th>
                                            <th>نوع المخلفات</th>
                                            <th>الكمية</th>
                                            <th>وحدة القياس</th>
                                            <th>القسم المنتج</th>
                                            <th>طريقة التخزين المؤقت</th>
                                            <th>الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${records.map((record, index) => `
                                            <tr class="bg-green-50/50 dark:bg-green-900/10" data-record-id="${record.id}">
                                                <td>${index + 1}</td>
                                                <td>${Utils.escapeHTML(record.serialNumber || '')}</td>
                                                <td>${Utils.formatDate(record.date)}</td>
                                                <td>${Utils.escapeHTML(record.location || '')}</td>
                                                <td>${Utils.escapeHTML(record.wasteType || '')}</td>
                                                <td class="font-semibold">${parseFloat(record.quantity || 0).toFixed(2)}</td>
                                                <td>${Utils.escapeHTML(record.unit || '')}</td>
                                                <td>${Utils.escapeHTML(record.department || '')}</td>
                                                <td>${Utils.escapeHTML(record.storageMethod || '')}</td>
                                                <td>
                                                    <div class="flex items-center gap-2">
                                                        <button onclick="Sustainability.viewRegularWasteRecord('${record.id}')" 
                                                                class="btn-icon btn-icon-info" title="عرض">
                                                            <i class="fas fa-eye"></i>
                                                        </button>
                                                        ${this.canEdit() ? `
                                                        <button onclick="Sustainability.editRegularWasteRecord('${record.id}')" 
                                                                class="btn-icon btn-icon-primary" title="تعديل">
                                                            <i class="fas fa-edit"></i>
                                                        </button>
                                                        ` : ''}
                                                        ${this.canDelete() ? `
                                                        <button onclick="Sustainability.deleteRegularWasteRecord('${record.id}')" 
                                                                class="btn-icon btn-icon-danger" title="حذف">
                                                            <i class="fas fa-trash"></i>
                                                        </button>
                                                        ` : ''}
                                                    </div>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `}
                    </div>
                </div>

                <!-- سجل بيع المخلفات العادية -->
                <div class="content-card border-l-4 border-blue-500">
                    <div class="card-header bg-blue-50 dark:bg-blue-900/20">
                        <div class="flex items-center justify-between">
                            <h2 class="card-title text-blue-700 dark:text-blue-400">
                                <i class="fas fa-shopping-cart ml-2"></i>
                                سجل بيع المخلفات العادية
                            </h2>
                            <button class="btn-primary" onclick="Sustainability.showRegularWasteSaleForm()">
                                <i class="fas fa-plus ml-2"></i>
                                إضافة عملية بيع
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        ${sales.length === 0 ? `
                            <div class="empty-state">
                                <i class="fas fa-shopping-cart text-4xl text-blue-400 mb-4"></i>
                                <p class="text-gray-500">لا توجد عمليات بيع مسجلة. ابدأ بإضافة عمليات بيع جديدة.</p>
                            </div>
                        ` : `
                            <div class="overflow-x-auto">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>رقم العملية</th>
                                            <th>التاريخ</th>
                                            <th>الموقع</th>
                                            <th>نوع المخلفات</th>
                                            <th>الكمية</th>
                                            <th>وحدة القياس</th>
                                            <th>سعر الوحدة</th>
                                            <th>إجمالي القيمة</th>
                                            <th>اسم المشتري</th>
                                            <th>طريقة البيع</th>
                                            <th>الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${sales.map((sale, index) => `
                                            <tr class="bg-blue-50/50 dark:bg-blue-900/10" data-sale-id="${sale.id}">
                                                <td>${index + 1}</td>
                                                <td>${Utils.escapeHTML(sale.transactionNumber || '')}</td>
                                                <td>${Utils.formatDate(sale.date)}</td>
                                                <td>${Utils.escapeHTML(sale.location || '')}</td>
                                                <td>${Utils.escapeHTML(sale.wasteType || '')}</td>
                                                <td>${parseFloat(sale.quantity || 0).toFixed(2)}</td>
                                                <td>${Utils.escapeHTML(sale.unit || '')}</td>
                                                <td>${parseFloat(sale.unitPrice || 0).toFixed(2)} ج.م</td>
                                                <td class="font-semibold text-green-600">${parseFloat(sale.totalValue || 0).toFixed(2)} ج.م</td>
                                                <td>${Utils.escapeHTML(sale.buyerName || '')}</td>
                                                <td>${Utils.escapeHTML(sale.paymentMethod || '')}</td>
                                                <td>
                                                    <div class="flex items-center gap-2">
                                                        <button onclick="Sustainability.viewRegularWasteSale('${sale.id}')" 
                                                                class="btn-icon btn-icon-info" title="عرض">
                                                            <i class="fas fa-eye"></i>
                                                        </button>
                                                        ${this.canEdit() ? `
                                                        <button onclick="Sustainability.editRegularWasteSale('${sale.id}')" 
                                                                class="btn-icon btn-icon-primary" title="تعديل">
                                                            <i class="fas fa-edit"></i>
                                                        </button>
                                                        ` : ''}
                                                        ${this.canDelete() ? `
                                                        <button onclick="Sustainability.deleteRegularWasteSale('${sale.id}')" 
                                                                class="btn-icon btn-icon-danger" title="حذف">
                                                            <i class="fas fa-trash"></i>
                                                        </button>
                                                        ` : ''}
                                                    </div>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * عرض قسم المخلفات الخطرة
     */
    async renderHazardousWaste() {
        const wasteData = AppState.appData.wasteManagement || {};
        const records = wasteData.hazardousWasteRecords || [];

        return `
            <div class="space-y-6">
                <div class="content-card border-l-4 border-red-500">
                    <div class="card-header bg-red-50 dark:bg-red-900/20">
                        <div class="flex items-center justify-between">
                            <h2 class="card-title text-red-700 dark:text-red-400">
                                <i class="fas fa-exclamation-triangle ml-2"></i>
                                سجل المخلفات الخطرة
                            </h2>
                            <button class="btn-danger" onclick="Sustainability.showHazardousWasteForm()">
                                <i class="fas fa-plus ml-2"></i>
                                إضافة سجل جديد
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        ${records.length === 0 ? `
                            <div class="empty-state">
                                <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i>
                                <p class="text-gray-500">لا توجد سجلات للمخلفات الخطرة. ابدأ بإضافة سجلات جديدة.</p>
                            </div>
                        ` : `
                            <div class="overflow-x-auto">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>الرقم التسلسلي</th>
                                            <th>التاريخ</th>
                                            <th>الموقع</th>
                                            <th>نوع المخلفات</th>
                                            <th>الكمية</th>
                                            <th>وحدة القياس</th>
                                            <th>تصنيف الخطورة</th>
                                            <th>طريقة التخزين</th>
                                            <th>شركة النقل</th>
                                            <th>جهة المعالجة</th>
                                            <th>تاريخ النقل</th>
                                            <th>الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${records.map((record, index) => `
                                            <tr class="bg-red-50/50 dark:bg-red-900/10" data-record-id="${record.id}">
                                                <td>${index + 1}</td>
                                                <td>${Utils.escapeHTML(record.serialNumber || '')}</td>
                                                <td>${Utils.formatDate(record.date)}</td>
                                                <td>${Utils.escapeHTML(record.location || '')}</td>
                                                <td>${Utils.escapeHTML(record.wasteType || '')}</td>
                                                <td class="font-semibold">${parseFloat(record.quantity || 0).toFixed(2)}</td>
                                                <td>${Utils.escapeHTML(record.unit || '')}</td>
                                                <td>
                                                    <span class="badge badge-danger">${Utils.escapeHTML(record.hazardClassification || '')}</span>
                                                </td>
                                                <td>${Utils.escapeHTML(record.storageMethod || '')}</td>
                                                <td>${Utils.escapeHTML(record.transportCompany || '')}</td>
                                                <td>${Utils.escapeHTML(record.treatmentFacility || '')}</td>
                                                <td>${record.transportDate ? Utils.formatDate(record.transportDate) : '-'}</td>
                                                <td>
                                                    <div class="flex items-center gap-2">
                                                        <button onclick="Sustainability.viewHazardousWasteRecord('${record.id}')" 
                                                                class="btn-icon btn-icon-info" title="عرض">
                                                            <i class="fas fa-eye"></i>
                                                        </button>
                                                        ${this.canEdit() ? `
                                                        <button onclick="Sustainability.editHazardousWasteRecord('${record.id}')" 
                                                                class="btn-icon btn-icon-primary" title="تعديل">
                                                            <i class="fas fa-edit"></i>
                                                        </button>
                                                        ` : ''}
                                                        ${this.canDelete() ? `
                                                        <button onclick="Sustainability.deleteHazardousWasteRecord('${record.id}')" 
                                                                class="btn-icon btn-icon-danger" title="حذف">
                                                            <i class="fas fa-trash"></i>
                                                        </button>
                                                        ` : ''}
                                                    </div>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * عرض تحليلات المخلفات
     */
    async renderWasteAnalytics() {
        const wasteData = AppState.appData.wasteManagement || {
            regularWasteRecords: [],
            regularWasteSales: [],
            hazardousWasteRecords: []
        };

        const monthlyData = this.getMonthlyWasteData(wasteData);

        return `
            <div class="space-y-6">
                <!-- مؤشرات الأداء -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title text-sm">
                                <i class="fas fa-recycle text-green-500 ml-2"></i>
                                إجمالي كميات المخلفات العادية
                            </h3>
                        </div>
                        <div class="card-body">
                            <div class="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">
                                ${this.getTotalRegularWasteQuantity(wasteData.regularWasteRecords || [])}
                            </div>
                            <div class="text-sm text-gray-600 dark:text-gray-400">وحدة قياس</div>
                        </div>
                    </div>
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title text-sm">
                                <i class="fas fa-exclamation-triangle text-red-500 ml-2"></i>
                                إجمالي كميات المخلفات الخطرة
                            </h3>
                        </div>
                        <div class="card-body">
                            <div class="text-3xl font-bold text-red-600 dark:text-red-400 mb-2">
                                ${this.getTotalHazardousWasteQuantity(wasteData.hazardousWasteRecords || [])}
                            </div>
                            <div class="text-sm text-gray-600 dark:text-gray-400">وحدة قياس</div>
                        </div>
                    </div>
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title text-sm">
                                <i class="fas fa-money-bill-wave text-blue-500 ml-2"></i>
                                إجمالي العائد من بيع المخلفات العادية
                            </h3>
                        </div>
                        <div class="card-body">
                            <div class="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                                ${this.getTotalSalesRevenue(wasteData.regularWasteSales || []).toFixed(2)}
                            </div>
                            <div class="text-sm text-gray-600 dark:text-gray-400">جنيه مصري</div>
                        </div>
                    </div>
                </div>

                <!-- مقارنة شهرية -->
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-chart-bar ml-2"></i>
                            مقارنة شهرية - الكميات والعائد
                        </h2>
                    </div>
                    <div class="card-body">
                        <div class="overflow-x-auto">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>الشهر</th>
                                        <th>المخلفات العادية</th>
                                        <th>المخلفات الخطرة</th>
                                        <th>عائد البيع (ج.م)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${monthlyData && monthlyData.length > 0 ? monthlyData.map(month => `
                                        <tr>
                                            <td class="font-semibold">${Utils.escapeHTML(month.month || '')}</td>
                                            <td class="text-green-600 font-semibold">${(month.regularQuantity || 0).toFixed(2)}</td>
                                            <td class="text-red-600 font-semibold">${(month.hazardousQuantity || 0).toFixed(2)}</td>
                                            <td class="text-blue-600 font-semibold">${(month.revenue || 0).toFixed(2)}</td>
                                        </tr>
                                    `).join('') : `
                                        <tr>
                                            <td colspan="4" class="text-center text-gray-500 py-4">لا توجد بيانات للعرض</td>
                                        </tr>
                                    `}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * عرض إدارة أنواع المخلفات (Admin Only)
     */
    async renderWasteTypesManagement() {
        if (!this.isAdmin()) {
            return '<div class="empty-state"><p class="text-gray-500">ليس لديك صلاحية للوصول إلى هذا القسم</p></div>';
        }

        const wasteData = AppState.appData.wasteManagement || {
            regularWasteTypes: ['خشب', 'ورق', 'استرتش', 'بلاستيك', 'شكائر', 'جراكن فارغة']
        };
        const types = wasteData.regularWasteTypes || [];

        return `
            <div class="content-card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-list ml-2"></i>
                        إدارة أنواع المخلفات العادية
                    </h2>
                </div>
                <div class="card-body">
                    <div class="space-y-3 mb-4">
                        ${types.map((type, index) => `
                            <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                <span class="font-semibold">${Utils.escapeHTML(type)}</span>
                                <button onclick="Sustainability.deleteWasteType(${index})" 
                                        class="btn-danger btn-sm">
                                    <i class="fas fa-trash ml-2"></i>
                                    حذف
                                </button>
                            </div>
                        `).join('')}
                    </div>
                    <div class="flex gap-2">
                        <input type="text" id="new-waste-type-input" 
                               class="form-input flex-1" 
                               placeholder="أدخل نوع مخلفات جديد">
                        <button onclick="Sustainability.addWasteType()" class="btn-success">
                            <i class="fas fa-plus ml-2"></i>
                            إضافة نوع جديد
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * عرض أكثر المواقع استهلاكاً
     */
    renderTopConsumingLocations() {
        const { water: waterData, electricity: electricityData, gas: gasData, year: viewYear } = this.getViewFilteredConsumption();

        const locationStats = {};

        [...waterData, ...electricityData, ...gasData].forEach(record => {
            const location = record.location || 'غير محدد';
            if (!locationStats[location]) {
                locationStats[location] = { water: 0, electricity: 0, gas: 0, total: 0 };
            }
            
            const type = record.source === 'مياه' ? 'water' : 
                        record.source === 'كهرباء' ? 'electricity' : 
                        record.source === 'غاز' ? 'gas' : 'other';
            
            if (type !== 'other') {
                locationStats[location][type] += parseFloat(record.totalConsumption) || 0;
                locationStats[location].total += parseFloat(record.totalConsumption) || 0;
            }
        });

        const sorted = Object.entries(locationStats)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 5);

        if (sorted.length === 0) {
            return `<p class="text-gray-500 text-center py-4">لا توجد بيانات مواقع لسنة <strong>${viewYear}</strong></p>`;
        }

        return `
            <div class="space-y-3">
                ${sorted.map(([location, stats], index) => `
                    <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                                ${index + 1}
                            </div>
                            <div>
                                <div class="font-semibold">${Utils.escapeHTML(location)}</div>
                                <div class="text-xs text-gray-500">
                                    مياه: ${stats.water.toFixed(2)} | كهرباء: ${stats.electricity.toFixed(2)} | غاز: ${stats.gas.toFixed(2)}
                                </div>
                            </div>
                        </div>
                        <div class="text-lg font-bold text-blue-600 dark:text-blue-400">
                            ${stats.total.toFixed(2)}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    // ===== دوال إدارة المخلفات =====

    /**
     * عرض نموذج إضافة/تعديل سجل مخلفات عادية
     */
    showRegularWasteForm(recordId = null) {
        const wasteData = AppState.appData.wasteManagement || {
            regularWasteTypes: ['خشب', 'ورق', 'استرتش', 'بلاستيك', 'شكائر', 'جراكن فارغة'],
            regularWasteRecords: []
        };
        const record = recordId 
            ? (wasteData.regularWasteRecords || []).find(r => r.id === recordId)
            : null;

        const dateValue = record?.date ? new Date(record.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
        const wasteTypes = wasteData.regularWasteTypes || [];

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-recycle text-green-500 ml-2"></i>
                        ${record ? 'تعديل' : 'إضافة'} سجل مخلفات عادية
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="regular-waste-form" class="space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    التاريخ <span class="text-red-500">*</span>
                                </label>
                                <input type="date" id="regular-waste-date" required 
                                       class="form-input" value="${dateValue}">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    الموقع / المصنع <span class="text-red-500">*</span>
                                </label>
                                <select id="regular-waste-location" required class="form-input">
                                    <option value="">-- اختر الموقع --</option>
                                    ${this.getSiteOptions().map(site => `
                                        <option value="${Utils.escapeHTML(site.name)}" ${record?.location === site.name ? 'selected' : ''}>
                                            ${Utils.escapeHTML(site.name)}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    نوع المخلفات <span class="text-red-500">*</span>
                                </label>
                                <select id="regular-waste-type" required class="form-input">
                                    <option value="">-- اختر النوع --</option>
                                    ${wasteTypes.map(type => `
                                        <option value="${Utils.escapeHTML(type)}" ${record?.wasteType === type ? 'selected' : ''}>
                                            ${Utils.escapeHTML(type)}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    وحدة القياس <span class="text-red-500">*</span>
                                </label>
                                <input type="text" id="regular-waste-unit" required 
                                       class="form-input" 
                                       value="${Utils.escapeHTML(record?.unit || 'كجم')}"
                                       placeholder="كجم / طن / م³">
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                الكمية <span class="text-red-500">*</span>
                            </label>
                            <input type="number" id="regular-waste-quantity" required step="0.01"
                                   class="form-input" 
                                   value="${record?.quantity || ''}"
                                   placeholder="0.00">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                القسم المنتج
                            </label>
                            <input type="text" id="regular-waste-department" 
                                   class="form-input" 
                                   value="${Utils.escapeHTML(record?.department || '')}"
                                   placeholder="أدخل القسم المنتج">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                طريقة التخزين المؤقت
                            </label>
                            <input type="text" id="regular-waste-storage" 
                                   class="form-input" 
                                   value="${Utils.escapeHTML(record?.storageMethod || '')}"
                                   placeholder="أدخل طريقة التخزين">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                ملاحظات
                            </label>
                            <textarea id="regular-waste-notes" 
                                      class="form-input" rows="3"
                                      placeholder="ملاحظات إضافية">${Utils.escapeHTML(record?.notes || '')}</textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                        إلغاء
                    </button>
                    <button type="button" id="save-regular-waste-btn" class="btn-success">
                        <i class="fas fa-save ml-2"></i>
                        حفظ
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const saveBtn = modal.querySelector('#save-regular-waste-btn');
        saveBtn.addEventListener('click', () => this.handleRegularWasteSubmit(recordId, modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    /**
     * معالجة حفظ سجل مخلفات عادية
     */
    async handleRegularWasteSubmit(recordId, modal) {
        const form = document.getElementById('regular-waste-form');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const date = new Date(document.getElementById('regular-waste-date').value);
        const location = document.getElementById('regular-waste-location').value.trim();
        const wasteType = document.getElementById('regular-waste-type').value.trim();
        const quantity = parseFloat(document.getElementById('regular-waste-quantity').value);
        const unit = document.getElementById('regular-waste-unit').value.trim();
        const department = document.getElementById('regular-waste-department').value.trim();
        const storageMethod = document.getElementById('regular-waste-storage').value.trim();
        const notes = document.getElementById('regular-waste-notes').value.trim();

        if (!AppState.appData.wasteManagement) {
            AppState.appData.wasteManagement = {
                regularWasteTypes: ['خشب', 'ورق', 'استرتش', 'بلاستيك', 'شكائر', 'جراكن فارغة'],
                regularWasteRecords: [],
                regularWasteSales: [],
                hazardousWasteRecords: []
            };
        }

        const formData = {
            id: recordId || Utils.generateId('RWR'),
            serialNumber: recordId ? (AppState.appData.wasteManagement.regularWasteRecords || []).find(r => r.id === recordId)?.serialNumber : this.generateWasteSerialNumber('regular'),
            date: date.toISOString(),
            location: location,
            wasteType: wasteType,
            quantity: quantity,
            unit: unit,
            department: department,
            storageMethod: storageMethod,
            notes: notes,
            createdAt: recordId ? (AppState.appData.wasteManagement.regularWasteRecords || []).find(r => r.id === recordId)?.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: AppState.currentUser?.email || AppState.currentUser?.name || 'Unknown',
            updatedBy: AppState.currentUser?.email || AppState.currentUser?.name || 'Unknown'
        };

        Loading.show();
        try {
            if (!AppState.appData.wasteManagement.regularWasteRecords) {
                AppState.appData.wasteManagement.regularWasteRecords = [];
            }

            if (recordId) {
                const index = AppState.appData.wasteManagement.regularWasteRecords.findIndex(r => r.id === recordId);
                if (index !== -1) {
                    AppState.appData.wasteManagement.regularWasteRecords[index] = formData;
                    Notification.success('تم تحديث السجل بنجاح');
                }
            } else {
                AppState.appData.wasteManagement.regularWasteRecords.push(formData);
                Notification.success('تم إضافة السجل بنجاح');
            }

            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }

            await this.saveWasteManagementToSheets();

            Loading.hide();
            modal.remove();
            this.load();
        } catch (error) {
            Loading.hide();
            Notification.error('حدث خطأ: ' + error.message);
        }
    },

    /**
     * عرض نموذج إضافة/تعديل عملية بيع مخلفات عادية
     */
    showRegularWasteSaleForm(saleId = null) {
        const wasteData = AppState.appData.wasteManagement || {
            regularWasteTypes: ['خشب', 'ورق', 'استرتش', 'بلاستيك', 'شكائر', 'جراكن فارغة'],
            regularWasteSales: []
        };
        const sale = saleId 
            ? (wasteData.regularWasteSales || []).find(s => s.id === saleId)
            : null;

        const dateValue = sale?.date ? new Date(sale.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
        const wasteTypes = wasteData.regularWasteTypes || [];

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-shopping-cart text-blue-500 ml-2"></i>
                        ${sale ? 'تعديل' : 'إضافة'} عملية بيع مخلفات عادية
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="regular-waste-sale-form" class="space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    التاريخ <span class="text-red-500">*</span>
                                </label>
                                <input type="date" id="sale-date" required 
                                       class="form-input" value="${dateValue}">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    الموقع <span class="text-red-500">*</span>
                                </label>
                                <select id="sale-location" required class="form-input">
                                    <option value="">-- اختر الموقع --</option>
                                    ${this.getSiteOptions().map(site => `
                                        <option value="${Utils.escapeHTML(site.name)}" ${sale?.location === site.name ? 'selected' : ''}>
                                            ${Utils.escapeHTML(site.name)}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    نوع المخلفات <span class="text-red-500">*</span>
                                </label>
                                <select id="sale-waste-type" required class="form-input">
                                    <option value="">-- اختر النوع --</option>
                                    ${wasteTypes.map(type => `
                                        <option value="${Utils.escapeHTML(type)}" ${sale?.wasteType === type ? 'selected' : ''}>
                                            ${Utils.escapeHTML(type)}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    وحدة القياس <span class="text-red-500">*</span>
                                </label>
                                <input type="text" id="sale-unit" required 
                                       class="form-input" 
                                       value="${Utils.escapeHTML(sale?.unit || 'كجم')}"
                                       placeholder="كجم / طن / م³">
                            </div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    الكمية <span class="text-red-500">*</span>
                                </label>
                                <input type="number" id="sale-quantity" required step="0.01"
                                       class="form-input" 
                                       value="${sale?.quantity || ''}"
                                       placeholder="0.00"
                                       onchange="Sustainability.calculateSaleTotal()">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    سعر الوحدة (ج.م) <span class="text-red-500">*</span>
                                </label>
                                <input type="number" id="sale-unit-price" required step="0.01"
                                       class="form-input" 
                                       value="${sale?.unitPrice || ''}"
                                       placeholder="0.00"
                                       onchange="Sustainability.calculateSaleTotal()">
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                إجمالي القيمة (ج.م) <span class="text-red-500">*</span>
                            </label>
                            <input type="number" id="sale-total-value" required step="0.01"
                                   class="form-input font-semibold" 
                                   value="${sale?.totalValue || ''}"
                                   placeholder="سيتم حسابه تلقائياً" readonly>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    اسم المشتري / الجهة <span class="text-red-500">*</span>
                                </label>
                                <input type="text" id="sale-buyer" required 
                                       class="form-input" 
                                       value="${Utils.escapeHTML(sale?.buyerName || '')}"
                                       placeholder="أدخل اسم المشتري">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    طريقة البيع <span class="text-red-500">*</span>
                                </label>
                                <select id="sale-payment-method" required class="form-input">
                                    <option value="">-- اختر طريقة البيع --</option>
                                    <option value="نقدي" ${sale?.paymentMethod === 'نقدي' ? 'selected' : ''}>نقدي</option>
                                    <option value="تحويل" ${sale?.paymentMethod === 'تحويل' ? 'selected' : ''}>تحويل</option>
                                    <option value="تعاقد" ${sale?.paymentMethod === 'تعاقد' ? 'selected' : ''}>تعاقد</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                ملاحظات
                            </label>
                            <textarea id="sale-notes" 
                                      class="form-input" rows="3"
                                      placeholder="ملاحظات إضافية">${Utils.escapeHTML(sale?.notes || '')}</textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                        إلغاء
                    </button>
                    <button type="button" id="save-sale-btn" class="btn-primary">
                        <i class="fas fa-save ml-2"></i>
                        حفظ
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const saveBtn = modal.querySelector('#save-sale-btn');
        saveBtn.addEventListener('click', () => this.handleRegularWasteSaleSubmit(saleId, modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // حساب القيمة الإجمالية عند التحميل
        setTimeout(() => this.calculateSaleTotal(), 100);
    },

    /**
     * حساب إجمالي قيمة البيع
     */
    calculateSaleTotal() {
        const quantityInput = document.getElementById('sale-quantity');
        const unitPriceInput = document.getElementById('sale-unit-price');
        const totalInput = document.getElementById('sale-total-value');

        if (quantityInput && unitPriceInput && totalInput) {
            const quantity = parseFloat(quantityInput.value) || 0;
            const unitPrice = parseFloat(unitPriceInput.value) || 0;
            const total = quantity * unitPrice;
            totalInput.value = total.toFixed(2);
        }
    },

    /**
     * معالجة حفظ عملية بيع مخلفات عادية
     */
    async handleRegularWasteSaleSubmit(saleId, modal) {
        const form = document.getElementById('regular-waste-sale-form');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const date = new Date(document.getElementById('sale-date').value);
        const location = document.getElementById('sale-location').value.trim();
        const wasteType = document.getElementById('sale-waste-type').value.trim();
        const quantity = parseFloat(document.getElementById('sale-quantity').value);
        const unit = document.getElementById('sale-unit').value.trim();
        const unitPrice = parseFloat(document.getElementById('sale-unit-price').value);
        const totalValue = parseFloat(document.getElementById('sale-total-value').value);
        const buyerName = document.getElementById('sale-buyer').value.trim();
        const paymentMethod = document.getElementById('sale-payment-method').value.trim();
        const notes = document.getElementById('sale-notes').value.trim();

        if (!AppState.appData.wasteManagement) {
            AppState.appData.wasteManagement = {
                regularWasteTypes: ['خشب', 'ورق', 'استرتش', 'بلاستيك', 'شكائر', 'جراكن فارغة'],
                regularWasteRecords: [],
                regularWasteSales: [],
                hazardousWasteRecords: []
            };
        }

        const formData = {
            id: saleId || Utils.generateId('RWS'),
            transactionNumber: saleId ? (AppState.appData.wasteManagement.regularWasteSales || []).find(s => s.id === saleId)?.transactionNumber : this.generateSaleTransactionNumber(),
            date: date.toISOString(),
            location: location,
            wasteType: wasteType,
            quantity: quantity,
            unit: unit,
            unitPrice: unitPrice,
            totalValue: totalValue,
            buyerName: buyerName,
            paymentMethod: paymentMethod,
            notes: notes,
            createdAt: saleId ? (AppState.appData.wasteManagement.regularWasteSales || []).find(s => s.id === saleId)?.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: AppState.currentUser?.email || AppState.currentUser?.name || 'Unknown',
            updatedBy: AppState.currentUser?.email || AppState.currentUser?.name || 'Unknown'
        };

        Loading.show();
        try {
            if (!AppState.appData.wasteManagement.regularWasteSales) {
                AppState.appData.wasteManagement.regularWasteSales = [];
            }

            if (saleId) {
                const index = AppState.appData.wasteManagement.regularWasteSales.findIndex(s => s.id === saleId);
                if (index !== -1) {
                    AppState.appData.wasteManagement.regularWasteSales[index] = formData;
                    Notification.success('تم تحديث عملية البيع بنجاح');
                }
            } else {
                AppState.appData.wasteManagement.regularWasteSales.push(formData);
                Notification.success('تم إضافة عملية البيع بنجاح');
            }

            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }

            await this.saveWasteManagementToSheets();

            Loading.hide();
            modal.remove();
            this.load();
        } catch (error) {
            Loading.hide();
            Notification.error('حدث خطأ: ' + error.message);
        }
    },

    /**
     * عرض نموذج إضافة/تعديل سجل مخلفات خطرة
     */
    showHazardousWasteForm(recordId = null) {
        const wasteData = AppState.appData.wasteManagement || {
            hazardousWasteRecords: []
        };
        const record = recordId 
            ? (wasteData.hazardousWasteRecords || []).find(r => r.id === recordId)
            : null;

        const dateValue = record?.date ? new Date(record.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
        const transportDateValue = record?.transportDate ? new Date(record.transportDate).toISOString().slice(0, 10) : '';

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-exclamation-triangle text-red-500 ml-2"></i>
                        ${record ? 'تعديل' : 'إضافة'} سجل مخلفات خطرة
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="hazardous-waste-form" class="space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    التاريخ <span class="text-red-500">*</span>
                                </label>
                                <input type="date" id="hazardous-waste-date" required 
                                       class="form-input" value="${dateValue}">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    الموقع <span class="text-red-500">*</span>
                                </label>
                                <select id="hazardous-waste-location" required class="form-input">
                                    <option value="">-- اختر الموقع --</option>
                                    ${this.getSiteOptions().map(site => `
                                        <option value="${Utils.escapeHTML(site.name)}" ${record?.location === site.name ? 'selected' : ''}>
                                            ${Utils.escapeHTML(site.name)}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                نوع المخلفات <span class="text-red-500">*</span>
                            </label>
                            <input type="text" id="hazardous-waste-type" required 
                                   class="form-input" 
                                   value="${Utils.escapeHTML(record?.wasteType || '')}"
                                   placeholder="أدخل نوع المخلفات الخطرة">
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    الكمية <span class="text-red-500">*</span>
                                </label>
                                <input type="number" id="hazardous-waste-quantity" required step="0.01"
                                       class="form-input" 
                                       value="${record?.quantity || ''}"
                                       placeholder="0.00">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    وحدة القياس <span class="text-red-500">*</span>
                                </label>
                                <input type="text" id="hazardous-waste-unit" required 
                                       class="form-input" 
                                       value="${Utils.escapeHTML(record?.unit || 'كجم')}"
                                       placeholder="كجم / لتر / م³">
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                تصنيف الخطورة <span class="text-red-500">*</span>
                            </label>
                            <input type="text" id="hazardous-waste-classification" required 
                                   class="form-input" 
                                   value="${Utils.escapeHTML(record?.hazardClassification || '')}"
                                   placeholder="مثال: سام / قابل للاشتعال / مسبب للتآكل">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                طريقة التخزين
                            </label>
                            <input type="text" id="hazardous-waste-storage" 
                                   class="form-input" 
                                   value="${Utils.escapeHTML(record?.storageMethod || '')}"
                                   placeholder="أدخل طريقة التخزين">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                شركة النقل المعتمدة
                            </label>
                            <input type="text" id="hazardous-waste-transport" 
                                   class="form-input" 
                                   value="${Utils.escapeHTML(record?.transportCompany || '')}"
                                   placeholder="أدخل اسم شركة النقل">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                جهة المعالجة النهائية
                            </label>
                            <input type="text" id="hazardous-waste-treatment" 
                                   class="form-input" 
                                   value="${Utils.escapeHTML(record?.treatmentFacility || '')}"
                                   placeholder="أدخل اسم جهة المعالجة">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                تاريخ النقل
                            </label>
                            <input type="date" id="hazardous-waste-transport-date" 
                                   class="form-input" 
                                   value="${transportDateValue}">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                مستندات مرفقة (رابط)
                            </label>
                            <input type="url" id="hazardous-waste-documents" 
                                   class="form-input" 
                                   value="${Utils.escapeHTML(record?.documents || '')}"
                                   placeholder="https://...">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                ملاحظات
                            </label>
                            <textarea id="hazardous-waste-notes" 
                                      class="form-input" rows="3"
                                      placeholder="ملاحظات إضافية">${Utils.escapeHTML(record?.notes || '')}</textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                        إلغاء
                    </button>
                    <button type="button" id="save-hazardous-waste-btn" class="btn-danger">
                        <i class="fas fa-save ml-2"></i>
                        حفظ
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const saveBtn = modal.querySelector('#save-hazardous-waste-btn');
        saveBtn.addEventListener('click', () => this.handleHazardousWasteSubmit(recordId, modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    /**
     * معالجة حفظ سجل مخلفات خطرة
     */
    async handleHazardousWasteSubmit(recordId, modal) {
        const form = document.getElementById('hazardous-waste-form');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const date = new Date(document.getElementById('hazardous-waste-date').value);
        const location = document.getElementById('hazardous-waste-location').value.trim();
        const wasteType = document.getElementById('hazardous-waste-type').value.trim();
        const quantity = parseFloat(document.getElementById('hazardous-waste-quantity').value);
        const unit = document.getElementById('hazardous-waste-unit').value.trim();
        const hazardClassification = document.getElementById('hazardous-waste-classification').value.trim();
        const storageMethod = document.getElementById('hazardous-waste-storage').value.trim();
        const transportCompany = document.getElementById('hazardous-waste-transport').value.trim();
        const treatmentFacility = document.getElementById('hazardous-waste-treatment').value.trim();
        const transportDateInput = document.getElementById('hazardous-waste-transport-date').value;
        const transportDate = transportDateInput ? new Date(transportDateInput).toISOString() : null;
        const documents = document.getElementById('hazardous-waste-documents').value.trim();
        const notes = document.getElementById('hazardous-waste-notes').value.trim();

        if (!AppState.appData.wasteManagement) {
            AppState.appData.wasteManagement = {
                regularWasteTypes: ['خشب', 'ورق', 'استرتش', 'بلاستيك', 'شكائر', 'جراكن فارغة'],
                regularWasteRecords: [],
                regularWasteSales: [],
                hazardousWasteRecords: []
            };
        }

        const formData = {
            id: recordId || Utils.generateId('HWR'),
            serialNumber: recordId ? (AppState.appData.wasteManagement.hazardousWasteRecords || []).find(r => r.id === recordId)?.serialNumber : this.generateWasteSerialNumber('hazardous'),
            date: date.toISOString(),
            location: location,
            wasteType: wasteType,
            quantity: quantity,
            unit: unit,
            hazardClassification: hazardClassification,
            storageMethod: storageMethod,
            transportCompany: transportCompany,
            treatmentFacility: treatmentFacility,
            transportDate: transportDate,
            documents: documents,
            notes: notes,
            createdAt: recordId ? (AppState.appData.wasteManagement.hazardousWasteRecords || []).find(r => r.id === recordId)?.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: AppState.currentUser?.email || AppState.currentUser?.name || 'Unknown',
            updatedBy: AppState.currentUser?.email || AppState.currentUser?.name || 'Unknown'
        };

        Loading.show();
        try {
            if (!AppState.appData.wasteManagement.hazardousWasteRecords) {
                AppState.appData.wasteManagement.hazardousWasteRecords = [];
            }

            if (recordId) {
                const index = AppState.appData.wasteManagement.hazardousWasteRecords.findIndex(r => r.id === recordId);
                if (index !== -1) {
                    AppState.appData.wasteManagement.hazardousWasteRecords[index] = formData;
                    Notification.success('تم تحديث السجل بنجاح');
                }
            } else {
                AppState.appData.wasteManagement.hazardousWasteRecords.push(formData);
                Notification.success('تم إضافة السجل بنجاح');
            }

            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }

            await this.saveWasteManagementToSheets();

            Loading.hide();
            modal.remove();
            this.load();
        } catch (error) {
            Loading.hide();
            Notification.error('حدث خطأ: ' + error.message);
        }
    },

    /**
     * إضافة نوع مخلفات جديد
     */
    async addWasteType() {
        if (!this.isAdmin()) {
            Notification.error('ليس لديك صلاحية لإضافة أنواع المخلفات');
            return;
        }

        const input = document.getElementById('new-waste-type-input');
        if (!input || !input.value.trim()) {
            Notification.warning('يرجى إدخال نوع المخلفات');
            return;
        }

        if (!AppState.appData.wasteManagement) {
            AppState.appData.wasteManagement = {
                regularWasteTypes: ['خشب', 'ورق', 'استرتش', 'بلاستيك', 'شكائر', 'جراكن فارغة'],
                regularWasteRecords: [],
                regularWasteSales: [],
                hazardousWasteRecords: []
            };
        }

        if (!AppState.appData.wasteManagement.regularWasteTypes) {
            AppState.appData.wasteManagement.regularWasteTypes = [];
        }

        const newType = input.value.trim();
        if (AppState.appData.wasteManagement.regularWasteTypes.includes(newType)) {
            Notification.warning('هذا النوع موجود بالفعل');
            return;
        }

        AppState.appData.wasteManagement.regularWasteTypes.push(newType);
        input.value = '';

        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        }

        await this.saveWasteManagementToSheets();
        Notification.success('تم إضافة نوع المخلفات بنجاح');
        this.load();
    },

    /**
     * حذف نوع مخلفات
     */
    async deleteWasteType(index) {
        if (!this.isAdmin()) {
            Notification.error('ليس لديك صلاحية لحذف أنواع المخلفات');
            return;
        }

        if (!confirm('هل أنت متأكد من حذف هذا النوع؟')) return;

        const wasteData = AppState.appData.wasteManagement || {};
        if (wasteData.regularWasteTypes && wasteData.regularWasteTypes[index]) {
            wasteData.regularWasteTypes.splice(index, 1);

            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }

            await this.saveWasteManagementToSheets();
            Notification.success('تم حذف نوع المخلفات بنجاح');
            this.load();
        }
    },

    // ===== دوال العرض والحذف =====

    viewRegularWasteRecord(recordId) {
        const wasteData = AppState.appData.wasteManagement || {};
        const record = (wasteData.regularWasteRecords || []).find(r => r.id === recordId);
        if (!record) {
            Notification.error('السجل غير موجود');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-recycle text-green-500 ml-2"></i>
                        تفاصيل سجل مخلفات عادية
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="space-y-3">
                        <div class="grid grid-cols-2 gap-4">
                            <div><strong>الرقم التسلسلي:</strong> ${Utils.escapeHTML(record.serialNumber || '')}</div>
                            <div><strong>التاريخ:</strong> ${Utils.formatDate(record.date)}</div>
                            <div><strong>الموقع:</strong> ${Utils.escapeHTML(record.location || '')}</div>
                            <div><strong>نوع المخلفات:</strong> ${Utils.escapeHTML(record.wasteType || '')}</div>
                            <div><strong>الكمية:</strong> ${parseFloat(record.quantity || 0).toFixed(2)}</div>
                            <div><strong>وحدة القياس:</strong> ${Utils.escapeHTML(record.unit || '')}</div>
                            <div><strong>القسم المنتج:</strong> ${Utils.escapeHTML(record.department || '-')}</div>
                            <div><strong>طريقة التخزين:</strong> ${Utils.escapeHTML(record.storageMethod || '-')}</div>
                        </div>
                        ${record.notes ? `
                            <div class="mt-4 pt-4 border-t">
                                <strong>ملاحظات:</strong>
                                <p class="text-gray-700 dark:text-gray-300 mt-2">${Utils.escapeHTML(record.notes)}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                        إغلاق
                    </button>
                    ${this.canEdit() ? `
                    <button type="button" class="btn-success" onclick="Sustainability.editRegularWasteRecord('${recordId}'); this.closest('.modal-overlay').remove();">
                        <i class="fas fa-edit ml-2"></i>
                        تعديل
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    editRegularWasteRecord(recordId) {
        if (!this.canEdit()) {
            Notification.error('ليس لديك صلاحية لتعديل السجلات');
            return;
        }
        this.showRegularWasteForm(recordId);
    },

    async deleteRegularWasteRecord(recordId) {
        if (!this.canDelete()) {
            Notification.error('ليس لديك صلاحية لحذف السجلات');
            return;
        }

        if (!confirm('هل أنت متأكد من حذف هذا السجل؟')) return;

        Loading.show();
        try {
            const wasteData = AppState.appData.wasteManagement || {};
            if (wasteData.regularWasteRecords) {
                wasteData.regularWasteRecords = wasteData.regularWasteRecords.filter(r => r.id !== recordId);
            }

            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }

            await this.saveWasteManagementToSheets();
            Notification.success('تم حذف السجل بنجاح');
            this.load();
        } catch (error) {
            Notification.error('حدث خطأ: ' + error.message);
        } finally {
            Loading.hide();
        }
    },

    viewRegularWasteSale(saleId) {
        const wasteData = AppState.appData.wasteManagement || {};
        const sale = (wasteData.regularWasteSales || []).find(s => s.id === saleId);
        if (!sale) {
            Notification.error('عملية البيع غير موجودة');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-shopping-cart text-blue-500 ml-2"></i>
                        تفاصيل عملية البيع
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="space-y-3">
                        <div class="grid grid-cols-2 gap-4">
                            <div><strong>رقم العملية:</strong> ${Utils.escapeHTML(sale.transactionNumber || '')}</div>
                            <div><strong>التاريخ:</strong> ${Utils.formatDate(sale.date)}</div>
                            <div><strong>الموقع:</strong> ${Utils.escapeHTML(sale.location || '')}</div>
                            <div><strong>نوع المخلفات:</strong> ${Utils.escapeHTML(sale.wasteType || '')}</div>
                            <div><strong>الكمية:</strong> ${parseFloat(sale.quantity || 0).toFixed(2)}</div>
                            <div><strong>وحدة القياس:</strong> ${Utils.escapeHTML(sale.unit || '')}</div>
                            <div><strong>سعر الوحدة:</strong> ${parseFloat(sale.unitPrice || 0).toFixed(2)} ج.م</div>
                            <div><strong>إجمالي القيمة:</strong> <span class="font-semibold text-green-600">${parseFloat(sale.totalValue || 0).toFixed(2)} ج.م</span></div>
                            <div><strong>اسم المشتري:</strong> ${Utils.escapeHTML(sale.buyerName || '')}</div>
                            <div><strong>طريقة البيع:</strong> ${Utils.escapeHTML(sale.paymentMethod || '')}</div>
                        </div>
                        ${sale.notes ? `
                            <div class="mt-4 pt-4 border-t">
                                <strong>ملاحظات:</strong>
                                <p class="text-gray-700 dark:text-gray-300 mt-2">${Utils.escapeHTML(sale.notes)}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                        إغلاق
                    </button>
                    ${this.canEdit() ? `
                    <button type="button" class="btn-primary" onclick="Sustainability.editRegularWasteSale('${saleId}'); this.closest('.modal-overlay').remove();">
                        <i class="fas fa-edit ml-2"></i>
                        تعديل
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    editRegularWasteSale(saleId) {
        if (!this.canEdit()) {
            Notification.error('ليس لديك صلاحية لتعديل عمليات البيع');
            return;
        }
        this.showRegularWasteSaleForm(saleId);
    },

    async deleteRegularWasteSale(saleId) {
        if (!this.canDelete()) {
            Notification.error('ليس لديك صلاحية لحذف عمليات البيع');
            return;
        }

        if (!confirm('هل أنت متأكد من حذف عملية البيع هذه؟')) return;

        Loading.show();
        try {
            const wasteData = AppState.appData.wasteManagement || {};
            if (wasteData.regularWasteSales) {
                wasteData.regularWasteSales = wasteData.regularWasteSales.filter(s => s.id !== saleId);
            }

            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }

            await this.saveWasteManagementToSheets();
            Notification.success('تم حذف عملية البيع بنجاح');
            this.load();
        } catch (error) {
            Notification.error('حدث خطأ: ' + error.message);
        } finally {
            Loading.hide();
        }
    },

    viewHazardousWasteRecord(recordId) {
        const wasteData = AppState.appData.wasteManagement || {};
        const record = (wasteData.hazardousWasteRecords || []).find(r => r.id === recordId);
        if (!record) {
            Notification.error('السجل غير موجود');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-exclamation-triangle text-red-500 ml-2"></i>
                        تفاصيل سجل مخلفات خطرة
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="space-y-3">
                        <div class="grid grid-cols-2 gap-4">
                            <div><strong>الرقم التسلسلي:</strong> ${Utils.escapeHTML(record.serialNumber || '')}</div>
                            <div><strong>التاريخ:</strong> ${Utils.formatDate(record.date)}</div>
                            <div><strong>الموقع:</strong> ${Utils.escapeHTML(record.location || '')}</div>
                            <div><strong>نوع المخلفات:</strong> ${Utils.escapeHTML(record.wasteType || '')}</div>
                            <div><strong>الكمية:</strong> ${parseFloat(record.quantity || 0).toFixed(2)}</div>
                            <div><strong>وحدة القياس:</strong> ${Utils.escapeHTML(record.unit || '')}</div>
                            <div><strong>تصنيف الخطورة:</strong> <span class="badge badge-danger">${Utils.escapeHTML(record.hazardClassification || '')}</span></div>
                            <div><strong>طريقة التخزين:</strong> ${Utils.escapeHTML(record.storageMethod || '-')}</div>
                            <div><strong>شركة النقل:</strong> ${Utils.escapeHTML(record.transportCompany || '-')}</div>
                            <div><strong>جهة المعالجة:</strong> ${Utils.escapeHTML(record.treatmentFacility || '-')}</div>
                            <div><strong>تاريخ النقل:</strong> ${record.transportDate ? Utils.formatDate(record.transportDate) : '-'}</div>
                            ${record.documents ? `
                            <div class="col-span-2">
                                <strong>مستندات مرفقة:</strong>
                                <a href="${Utils.escapeHTML(record.documents)}" target="_blank" class="text-blue-600 hover:underline">
                                    ${Utils.escapeHTML(record.documents)}
                                </a>
                            </div>
                            ` : ''}
                        </div>
                        ${record.notes ? `
                            <div class="mt-4 pt-4 border-t">
                                <strong>ملاحظات:</strong>
                                <p class="text-gray-700 dark:text-gray-300 mt-2">${Utils.escapeHTML(record.notes)}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                        إغلاق
                    </button>
                    ${this.canEdit() ? `
                    <button type="button" class="btn-danger" onclick="Sustainability.editHazardousWasteRecord('${recordId}'); this.closest('.modal-overlay').remove();">
                        <i class="fas fa-edit ml-2"></i>
                        تعديل
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    editHazardousWasteRecord(recordId) {
        if (!this.canEdit()) {
            Notification.error('ليس لديك صلاحية لتعديل السجلات');
            return;
        }
        this.showHazardousWasteForm(recordId);
    },

    async deleteHazardousWasteRecord(recordId) {
        if (!this.canDelete()) {
            Notification.error('ليس لديك صلاحية لحذف السجلات');
            return;
        }

        if (!confirm('هل أنت متأكد من حذف هذا السجل؟')) return;

        Loading.show();
        try {
            const wasteData = AppState.appData.wasteManagement || {};
            if (wasteData.hazardousWasteRecords) {
                wasteData.hazardousWasteRecords = wasteData.hazardousWasteRecords.filter(r => r.id !== recordId);
            }

            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }

            await this.saveWasteManagementToSheets();
            Notification.success('تم حذف السجل بنجاح');
            this.load();
        } catch (error) {
            Notification.error('حدث خطأ: ' + error.message);
        } finally {
            Loading.hide();
        }
    },

    // ===== دوال مساعدة للمخلفات =====

    /**
     * تحميل بيانات إدارة المخلفات من Google Sheets
     */
    async loadWasteManagementFromSheets() {
        // التحقق من تفعيل Google Integration
        if (!Utils.hasCloudBackendSync()) {
            return;
        }

        if (typeof Backend === 'undefined' || typeof Backend.sendRequest !== 'function') {
            return;
        }

        try {
            const spreadsheetId = AppState.backendConfig?.sheets?.spreadsheetId;
            if (!spreadsheetId) return;

            // استخدام طلب واحد لجلب كافة جداول إدارة المخلفات (أسرع بكثير)
            const result = await Backend.sendRequest({
                action: 'batchReadSheets',
                data: {
                    sheetNames: [
                        'WasteManagement_RegularWasteTypes',
                        'WasteManagement_RegularWasteRecords',
                        'WasteManagement_RegularWasteSales',
                        'WasteManagement_HazardousWasteRecords'
                    ],
                    spreadsheetId: spreadsheetId
                }
            });

            if (result && result.success && result.data) {
                const batchData = result.data;
                
                if (batchData['WasteManagement_RegularWasteTypes']) {
                    const types = batchData['WasteManagement_RegularWasteTypes'].map(item => item.name).filter(Boolean);
                    if (types.length > 0) {
                        AppState.appData.wasteManagement.regularWasteTypes = types;
                    }
                }
                
                if (batchData['WasteManagement_RegularWasteRecords']) {
                    AppState.appData.wasteManagement.regularWasteRecords = batchData['WasteManagement_RegularWasteRecords'];
                }
                
                if (batchData['WasteManagement_RegularWasteSales']) {
                    AppState.appData.wasteManagement.regularWasteSales = batchData['WasteManagement_RegularWasteSales'];
                }
                
                if (batchData['WasteManagement_HazardousWasteRecords']) {
                    AppState.appData.wasteManagement.hazardousWasteRecords = batchData['WasteManagement_HazardousWasteRecords'];
                }
            } else {
                Utils.safeWarn('⚠️ فشل في تحميل جداول إدارة المخلفات أو لا توجد استجابة صالحة', result);
            }

            // حفظ البيانات المحلية
            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }

            // إعادة تحميل الواجهة إذا كان التبويب مفتوحاً
            if (this.currentTab === 'waste-management') {
                this.load();
            }
        } catch (error) {
            Utils.safeError('❌ خطأ في تحميل بيانات إدارة المخلفات:', error);
        }
    },

    /**
     * تحميل بيانات استهلاك الموارد من Google Sheets (جداول منفصلة)
     * — طلبات متوازية لتقليل زمن الانتظار، ودمج متزامن لمنع تكرار الشبكة.
     */
    async loadResourceConsumptionFromSheets() {
        if (!Utils.hasCloudBackendSync()) {
            return;
        }

        if (typeof Backend === 'undefined' || typeof Backend.sendRequest !== 'function') {
            return;
        }

        if (this._resourceConsumptionFetchPromise) {
            return this._resourceConsumptionFetchPromise;
        }

        const spreadsheetId = AppState.backendConfig?.sheets?.spreadsheetId;
        if (!spreadsheetId) return;

        this._resourceConsumptionFetchPromise = (async () => {
            try {
                if (!AppState.appData.resourceConsumption) {
                    AppState.appData.resourceConsumption = {
                        water: [],
                        electricity: [],
                        gas: []
                    };
                }

                const normalizeList = (list = []) => (Array.isArray(list) ? list : []).map((row) => this.normalizeResourceConsumptionRecord(row)).filter(Boolean);

                // استخدام batchReadSheets بدلاً من إرسال 3 طلبات متزامنة قد تسبب تأخيراً أو اختناقاً في الخادم
                const result = await Backend.sendRequest({
                    action: 'batchReadSheets',
                    data: {
                        sheetNames: [
                            'WaterManagement_Records',
                            'GasManagement_Records',
                            'ElectricityManagement_Records'
                        ],
                        spreadsheetId: spreadsheetId
                    }
                });

                if (result && result.success && result.data) {
                    const batchData = result.data;
                    if (batchData['WaterManagement_Records']) {
                        AppState.appData.resourceConsumption.water = normalizeList(batchData['WaterManagement_Records']);
                    }
                    if (batchData['GasManagement_Records']) {
                        AppState.appData.resourceConsumption.gas = normalizeList(batchData['GasManagement_Records']);
                    }
                    if (batchData['ElectricityManagement_Records']) {
                        AppState.appData.resourceConsumption.electricity = normalizeList(batchData['ElectricityManagement_Records']);
                    }
                } else {
                    Utils.safeWarn('⚠️ فشل في تحميل بيانات الموارد باستخدام batchReadSheets', result);
                }

                if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                    window.DataManager.save();
                }

                const quickStatsPanel = document.getElementById('sustainability-quick-stats');
                if (quickStatsPanel) {
                    quickStatsPanel.innerHTML = this.renderQuickStats();
                }

                const onSustainabilitySection = typeof AppState !== 'undefined' && AppState.currentSection === 'sustainability';
                if (onSustainabilitySection && document.getElementById('sustainability-section')) {
                    if (this.currentTab === 'dashboard') {
                        const contentArea = document.getElementById('sustainability-content');
                        if (contentArea) {
                            contentArea.innerHTML = await this.renderDashboard();
                            this.renderCharts();
                        }
                    } else if (this.currentTab === 'water' || this.currentTab === 'electricity' || this.currentTab === 'gas') {
                        const contentArea = document.getElementById('sustainability-content');
                        if (contentArea) {
                            contentArea.innerHTML = await this.renderContent();
                        }
                    }
                }

                if (typeof Dashboard !== 'undefined' && typeof Dashboard.updateReportsStatistics === 'function') {
                    Dashboard.updateReportsStatistics();
                }
            } catch (error) {
                Utils.safeError('❌ خطأ في تحميل بيانات استهلاك الموارد:', error);
            } finally {
                this._resourceConsumptionFetchPromise = null;
            }
        })();

        return this._resourceConsumptionFetchPromise;
    },

    normalizeResourceConsumptionRecord(record) {
        if (!record || typeof record !== 'object') return null;

        const pick = (...keys) => {
            for (const key of keys) {
                if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') {
                    return record[key];
                }
            }
            return '';
        };

        // تحويل قيمة hasAlert من string إلى boolean — هذا سبب ظهور "false" كنص في الجدول
        const parseBool = (val) => {
            if (typeof val === 'boolean') return val;
            const s = String(val || '').trim().toLowerCase();
            return s === 'true' || s === '1' || s === 'yes' || s === 'TRUE';
        };

        const parsedDate = (() => {
            const rawDate = pick('date', 'Date', 'التاريخ', 'recordDate');
            const d = new Date(rawDate || new Date());
            return Number.isNaN(d.getTime()) ? new Date() : d;
        })();

        const startReading = parseFloat(
            pick('startReading', 'start_reading', 'بداية', 'StartReading', 'قراءة البداية')
        );
        const endReading = parseFloat(
            pick('endReading', 'end_reading', 'نهاية', 'EndReading', 'قراءة النهاية')
        );

        // حساب الإجمالي: من الشيت أو فرق القراءتين
        let totalConsumption = parseFloat(
            pick('totalConsumption', 'total', 'Total Consumption', 'إجمالي الاستهلاك', 'الاستهلاك')
        );
        if (!Number.isFinite(totalConsumption)) {
            totalConsumption = (Number.isFinite(endReading) && Number.isFinite(startReading))
                ? Math.max(0, endReading - startReading)
                : 0;
        }

        const monthYearRaw = pick('monthYear', 'month', 'Month/Year', 'الشهر / السنة', 'الشهر/السنة');

        return {
            id:              String(pick('id', 'ID', 'recordId') || Utils.generateId('RES')),
            serialNumber:    String(pick('serialNumber', 'serial', 'Serial Number', 'الرقم التسلسلي') || ''),
            date:            parsedDate.toISOString(),
            monthYear:       String(monthYearRaw || this.getMonthYear(parsedDate)),
            location:        String(pick('location', 'site', 'locationName', 'الموقع', 'المصنع') || ''),
            source:          String(pick('source', 'المصدر', 'Source') || ''),
            startReading:    Number.isFinite(startReading) ? startReading : 0,
            endReading:      Number.isFinite(endReading) ? endReading : 0,
            totalConsumption: totalConsumption,
            unit:            String(pick('unit', 'وحدة القياس', 'Unit') || ''),
            department:      String(pick('department', 'الجهة', 'القسم', 'Department') || ''),
            notes:           String(pick('notes', 'Notes', 'ملاحظات') || ''),
            hasAlert:        parseBool(pick('hasAlert', 'has_alert', 'HasAlert', 'تنبيه')),
            createdAt:       String(pick('createdAt', 'Created At', 'تاريخ الإنشاء') || parsedDate.toISOString()),
            updatedAt:       new Date().toISOString(),
            createdBy:       String(pick('createdBy', 'created_by', 'المنشئ') || ''),
            updatedBy:       String(pick('updatedBy', 'updated_by', 'المعدل') || '')
        };
    },

    /**
     * حفظ بيانات إدارة المخلفات في Google Sheets (جداول منفصلة)
     */
    async saveWasteManagementToSheets() {
        const wasteData = AppState.appData.wasteManagement || {
            regularWasteTypes: ['خشب', 'ورق', 'استرتش', 'بلاستيك', 'شكائر', 'جراكن فارغة'],
            regularWasteRecords: [],
            regularWasteSales: [],
            hazardousWasteRecords: []
        };

        try {
            // حفظ أنواع المخلفات العادية (كقائمة بسيطة)
            const wasteTypesData = (wasteData.regularWasteTypes || []).map((name, index) => ({
                id: `WT-${index + 1}`,
                name: name,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }));
            await Backend.autoSave('WasteManagement_RegularWasteTypes', wasteTypesData);

            // حفظ سجلات المخلفات العادية
            await Backend.autoSave('WasteManagement_RegularWasteRecords', wasteData.regularWasteRecords || []);

            // حفظ عمليات بيع المخلفات العادية
            await Backend.autoSave('WasteManagement_RegularWasteSales', wasteData.regularWasteSales || []);

            // حفظ سجلات المخلفات الخطرة
            await Backend.autoSave('WasteManagement_HazardousWasteRecords', wasteData.hazardousWasteRecords || []);

            return { success: true };
        } catch (error) {
            Utils.safeError('❌ خطأ في حفظ بيانات إدارة المخلفات:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * حفظ بيانات استهلاك الموارد في Google Sheets (جداول منفصلة)
     */
    async saveResourceConsumptionToSheets() {
        const resourceData = AppState.appData.resourceConsumption || {
            water: [],
            electricity: [],
            gas: []
        };

        const tasks = [
            { sheetName: 'WaterManagement_Records', rows: resourceData.water || [] },
            { sheetName: 'GasManagement_Records', rows: resourceData.gas || [] },
            { sheetName: 'ElectricityManagement_Records', rows: resourceData.electricity || [] }
        ];

        try {
            const results = [];
            for (const { sheetName, rows } of tasks) {
                const res = await Backend.autoSave(sheetName, rows, { silent: true });
                results.push({
                    sheetName,
                    success: !!(res && res.success),
                    message: res && (res.message || '')
                });
            }

            const failed = results.filter((r) => !r.success);
            if (failed.length === 0) {
                return { success: true, results };
            }

            const msg = failed
                .map((f) => `${f.sheetName}: ${f.message || 'فشل الحفظ'}`)
                .join(' — ');
            Utils.safeWarn('⚠️ حفظ استهلاك الموارد لم يكتمل:', msg);
            return { success: false, results, message: msg };
        } catch (error) {
            Utils.safeError('❌ خطأ في حفظ بيانات استهلاك الموارد:', error);
            return { success: false, error: error.message, results: [] };
        }
    },

    /**
     * إنشاء رقم تسلسلي للمخلفات
     */
    generateWasteSerialNumber(type) {
        const wasteData = AppState.appData.wasteManagement || {};
        const prefix = type === 'regular' ? 'RWR' : 'HWR';
        const records = type === 'regular' 
            ? (wasteData.regularWasteRecords || [])
            : (wasteData.hazardousWasteRecords || []);
        const nextNum = records.length + 1;
        return `${prefix}-${String(nextNum).padStart(6, '0')}`;
    },

    /**
     * إنشاء رقم عملية بيع
     */
    generateSaleTransactionNumber() {
        const wasteData = AppState.appData.wasteManagement || {};
        const sales = wasteData.regularWasteSales || [];
        const nextNum = sales.length + 1;
        const year = new Date().getFullYear();
        return `SALE-${year}-${String(nextNum).padStart(6, '0')}`;
    },

    /**
     * الحصول على إجمالي كمية المخلفات العادية
     */
    getTotalRegularWasteQuantity(records) {
        if (!records || records.length === 0) return '0.00';
        const total = records.reduce((sum, record) => sum + (parseFloat(record.quantity) || 0), 0);
        return total.toFixed(2);
    },

    /**
     * الحصول على إجمالي كمية المخلفات الخطرة
     */
    getTotalHazardousWasteQuantity(records) {
        if (!records || records.length === 0) return '0.00';
        const total = records.reduce((sum, record) => sum + (parseFloat(record.quantity) || 0), 0);
        return total.toFixed(2);
    },

    /**
     * الحصول على إجمالي عائد البيع
     */
    getTotalSalesRevenue(sales) {
        if (!sales || sales.length === 0) return 0;
        return sales.reduce((sum, sale) => sum + (parseFloat(sale.totalValue) || 0), 0);
    },

    /**
     * الحصول على البيانات الشهرية للمخلفات
     */
    getMonthlyWasteData(wasteData) {
        try {
            const monthlyMap = {};
            const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 
                           'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

            // معالجة المخلفات العادية
            (wasteData?.regularWasteRecords || []).forEach(record => {
                try {
                    if (!record || !record.date) return;
                    const date = new Date(record.date);
                    if (isNaN(date.getTime())) return;
                    
                    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    const monthLabel = `${months[date.getMonth()]} ${date.getFullYear()}`;
                    
                    if (!monthlyMap[monthKey]) {
                        monthlyMap[monthKey] = {
                            month: monthLabel,
                            regularQuantity: 0,
                            hazardousQuantity: 0,
                            revenue: 0
                        };
                    }
                    
                    monthlyMap[monthKey].regularQuantity += parseFloat(record.quantity) || 0;
                } catch (error) {
                    Utils.safeWarn('⚠️ خطأ في معالجة سجل مخلفات عادية:', error);
                }
            });

            // معالجة المخلفات الخطرة
            (wasteData?.hazardousWasteRecords || []).forEach(record => {
                try {
                    if (!record || !record.date) return;
                    const date = new Date(record.date);
                    if (isNaN(date.getTime())) return;
                    
                    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    const monthLabel = `${months[date.getMonth()]} ${date.getFullYear()}`;
                    
                    if (!monthlyMap[monthKey]) {
                        monthlyMap[monthKey] = {
                            month: monthLabel,
                            regularQuantity: 0,
                            hazardousQuantity: 0,
                            revenue: 0
                        };
                    }
                    
                    monthlyMap[monthKey].hazardousQuantity += parseFloat(record.quantity) || 0;
                } catch (error) {
                    Utils.safeWarn('⚠️ خطأ في معالجة سجل مخلفات خطرة:', error);
                }
            });

            // معالجة عمليات البيع
            (wasteData?.regularWasteSales || []).forEach(sale => {
                try {
                    if (!sale || !sale.date) return;
                    const date = new Date(sale.date);
                    if (isNaN(date.getTime())) return;
                    
                    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    const monthLabel = `${months[date.getMonth()]} ${date.getFullYear()}`;
                    
                    if (!monthlyMap[monthKey]) {
                        monthlyMap[monthKey] = {
                            month: monthLabel,
                            regularQuantity: 0,
                            hazardousQuantity: 0,
                            revenue: 0
                        };
                    }
                    
                    monthlyMap[monthKey].revenue += parseFloat(sale.totalValue) || 0;
                } catch (error) {
                    Utils.safeWarn('⚠️ خطأ في معالجة عملية بيع:', error);
                }
            });

            // ترتيب حسب التاريخ (آخر 12 شهر)
            return Object.entries(monthlyMap)
                .sort((a, b) => b[0].localeCompare(a[0]))
                .slice(0, 12)
                .map(([key, value]) => value);
        } catch (error) {
            Utils.safeError('❌ خطأ في getMonthlyWasteData:', error);
            return [];
        }
    }
};

// ===== Export module to global scope =====
(function () {
    'use strict';
    try {
        if (typeof window !== 'undefined' && typeof Sustainability !== 'undefined') {
            window.Sustainability = Sustainability;
            
            if (typeof AppState !== 'undefined' && AppState.debugMode && typeof Utils !== 'undefined' && Utils.safeLog) {
                Utils.safeLog('✅ Sustainability module loaded and available on window.Sustainability');
            }
        }
    } catch (error) {
        console.error('❌ خطأ في تصدير Sustainability:', error);
        if (typeof window !== 'undefined' && typeof Sustainability !== 'undefined') {
            try {
                window.Sustainability = Sustainability;
            } catch (e) {
                console.error('❌ فشل تصدير Sustainability:', e);
            }
        }
    }
})();
