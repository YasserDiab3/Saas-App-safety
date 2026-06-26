/**
 * Dashboard Module - موديول لوحة التحكم
 * تم استخراجه من app-modules.js لتحسين الأداء
 */

// ===== Dashboard Module =====
const Dashboard = {
    contractorReportCache: new Map(),
    contractorReportRequests: new Map(),
    t(key, fallback) {
        const i18nCore = (window.AppI18n && typeof window.AppI18n.t === 'function')
            ? window.AppI18n
            : ((window.I18n && typeof window.I18n.t === 'function') ? window.I18n : null);
        if (i18nCore) {
            return i18nCore.t(key, null, fallback || key);
        }
        return fallback || key;
    },

    /** صلاحية عرض جزء من لوحة التحكم مرتبط بمفتاح موديول في MODULE_PERMISSIONS_CONFIG */
    dashboardCan(moduleKey) {
        if (!moduleKey) return false;
        if (typeof Permissions !== 'undefined' && typeof Permissions.isCurrentUserEffectiveAdmin === 'function') {
            if (Permissions.isCurrentUserEffectiveAdmin()) return true;
        }
        if (typeof Permissions !== 'undefined' && typeof Permissions.hasAccess === 'function') {
            return Permissions.hasAccess(moduleKey);
        }
        return false;
    },

    _dashboardReportStatIdsForTotal() {
        return ['incidents', 'nearmiss', 'periodic-inspections', 'training', 'violations', 'contractors', 'ptw', 'iso', 'electricity-consumption', 'water-consumption', 'gas-consumption'];
    },

    anyReportsStatisticVisibleForDashboard() {
        return this._dashboardReportStatIdsForTotal().some((statId) => {
            const mod = this.getModuleNameFromStatId(statId);
            return mod && this.dashboardCan(mod);
        });
    },

    reportsStatisticsMetricVisible(statId) {
        if (statId === 'total-reports') return this.anyReportsStatisticVisibleForDashboard();
        const mod = this.getModuleNameFromStatId(statId);
        if (!mod) return false;
        return this.dashboardCan(mod);
    },

    _setDashboardElVisibility(el, allowed) {
        if (!el) return;
        if (allowed) {
            el.removeAttribute('hidden');
            el.style.removeProperty('display');
        } else {
            el.setAttribute('hidden', '');
            try {
                el.style.setProperty('display', 'none', 'important');
            } catch (e) {
                el.style.display = 'none';
            }
        }
        el.setAttribute('aria-hidden', allowed ? 'false' : 'true');
    },

    applyDashboardLayoutPermissions() {
        const root = document.getElementById('dashboard-section');
        if (!root) return;
        root.querySelectorAll('[data-dash-scope]').forEach((el) => {
            const raw = el.getAttribute('data-dash-scope') || '';
            const keys = raw.split(',').map((s) => s.trim()).filter(Boolean);
            // بدون مفاتيح صريحة: لا تعرض (لا افتراضي بعرض كل شيء)
            const allowed = keys.length > 0 && keys.some((k) => this.dashboardCan(k));
            this._setDashboardElVisibility(el, allowed);
        });
        root.querySelectorAll('.reports-statistics-section .metric-card-frame[data-stat-id]').forEach((card) => {
            const statId = card.getAttribute('data-stat-id');
            const allowed = statId ? this.reportsStatisticsMetricVisible(statId) : false;
            this._setDashboardElVisibility(card, allowed);
        });
    },

    normalizePTWStatus(status) {
        if (window.PTW && typeof window.PTW.normalizePermitStatus === 'function') {
            return window.PTW.normalizePermitStatus(status);
        }
        const t = String(status || '').trim();
        if (!t) return 'مغلق';
        if (t === 'closed' || t === 'Closed' || t === 'CLOSED' || t === 'مغلقة' || t === 'اكتمل') return 'مغلق';
        return t;
    },

    isPTWClosedStatus(status) {
        if (window.PTW && typeof window.PTW.isPermitClosedStatus === 'function') {
            return window.PTW.isPermitClosedStatus(status);
        }
        const t = this.normalizePTWStatus(status);
        return t === 'مغلق' || t === 'مرفوض' || t === 'اكتمل العمل بشكل آمن' || t === 'إغلاق جبري' || t === 'لم يكتمل العمل';
    },

    getUnifiedPTWDataset(data) {
        if (window.PTW && typeof window.PTW.getPermitMetricsDataset === 'function') {
            const dataset = window.PTW.getPermitMetricsDataset();
            const source = Array.isArray(dataset?.source) ? dataset.source : [];
            if (source.length > 0) {
                return source.map((p) => ({ ...p, status: this.normalizePTWStatus(p?.status) }));
            }
            // مصفوفة فارغة رغم وجود بيانات في AppState (مثلاً قبل مزامنة registryData داخل الموديول)
        }

        const list = Array.isArray(data?.ptw) ? data.ptw : [];
        const registryRaw = Array.isArray(data?.ptwRegistry) ? data.ptwRegistry : [];
        const registry = registryRaw.map((r) => ({
            id: r?.permitId || r?.id,
            ...r,
            status: this.normalizePTWStatus(r?.status),
            isFromRegistry: true
        }));

        const mergedMap = new Map();
        list.forEach((p) => {
            if (!p || !p.id) return;
            mergedMap.set(p.id, { ...p, status: this.normalizePTWStatus(p.status) });
        });
        registry.forEach((r) => {
            if (!r || !r.id) return;
            mergedMap.set(r.id, r);
        });
        return registry.length > 0 ? registry : Array.from(mergedMap.values());
    },

    /**
     * تحميل لوحة التحكم
     * يُنتظر تحميل كارت التقارير والجلب المجمع أولاً حتى تُحدَّث كروت التصاريح وغيرها بأرقام فعلية دون وميض خاطئ.
     */
    async load() {
        this.setupReportsStatisticsCardsClickHandlers();

        // ✅ عرض البيانات المتوفرة محلياً فوراً (من AppState/localStorage) بدون انتظار الخادم
        try {
            this.updateKPIs();
            this.updateStats();
            this.updateReportsStatistics();
        } catch (_) { /* تجاهل — البيانات قد تكون غير مكتملة بعد */ }

        try {
            await this.loadReportsWidget();
        } catch (e) {
            if (typeof Utils !== 'undefined' && Utils.safeWarn) Utils.safeWarn('⚠️ تعذر تحميل كارت التقارير:', e);
            try {
                this.updateKPIs();
                this.updateStats();
            } catch (_) { /* ignore */ }
        }
        this.loadRecentActivities();
        this.loadSafetyCalendarWidget();
        this.loadUserTasksWidget();
        this.loadEmployeeReportWidget();
        try {
            this.loadCharts();
        } catch (chartErr) {
            if (typeof Utils !== 'undefined' && Utils.safeWarn) Utils.safeWarn('⚠️ تعذر تحميل رسوم لوحة التحكم:', chartErr);
        }
        this.applyDashboardLayoutPermissions();
        // بيانات المياه/الكهرباء/الغاز تُقرأ من أوراق منفصلة؛ بدء التحميل مبكراً يحدّ من بطء كروت الاستهلاك في لوحة التحكم
        if (this.dashboardCan('sustainability') && typeof Sustainability !== 'undefined' && typeof Sustainability.loadResourceConsumptionFromSheets === 'function') {
            void Sustainability.loadResourceConsumptionFromSheets().catch(() => {});
        }
        const i18nCore = (window.AppI18n && typeof window.AppI18n.applyI18n === 'function')
            ? window.AppI18n
            : ((window.I18n && typeof window.I18n.applyI18n === 'function') ? window.I18n : null);
        if (i18nCore) {
            i18nCore.applyI18n(document);
            i18nCore.applyLiteralTranslations(document);
        }
    },

    getContractorReportDataSignature() {
        const data = AppState.appData || {};
        const keys = [
            'approvedContractors',
            'violations',
            'incidents',
            'sickLeave',
            'clinicVisits',
            'clinicContractorVisits',
            'contractorEvaluations',
            'training',
            'contractorTrainings',
            'ptw',
            'ptwRegistry',
            'injuries'
        ];
        return keys.map((key) => `${key}:${Array.isArray(data[key]) ? data[key].length : 0}`).join('|');
    },

    getContractorReportCacheKey(reportContractor, contractorLookupKey, searchTerm) {
        const normalize = (value) => {
            if (typeof Utils !== 'undefined' && typeof Utils.normalizeContractorIdentityValue === 'function') {
                return Utils.normalizeContractorIdentityValue(value);
            }
            return String(value || '').trim().toLowerCase();
        };

        const parts = [
            contractorLookupKey,
            reportContractor?.code,
            reportContractor?.isoCode,
            reportContractor?.contractorId,
            reportContractor?.id,
            reportContractor?.companyName,
            reportContractor?.name,
            searchTerm
        ].map(normalize).filter(Boolean);

        return parts.join('|');
    },

    renderContractorReportLoading(reportContractor, contractorCodeVal) {
        const reportContainer = document.getElementById('contractor-report-data');
        const contentContainer = document.getElementById('contractor-report-content');
        const exportBtnEl = document.getElementById('export-contractor-report-btn');
        const employeeContent = document.getElementById('employee-report-content');

        if (employeeContent) employeeContent.classList.add('hidden');
        if (!reportContainer || !contentContainer) return;

        const contractorName = String(reportContractor?.companyName || reportContractor?.name || '').trim();
        const approvalDateStr = reportContractor?.approvalDate ? Utils.formatDate(reportContractor.approvalDate) : '';
        const expiryDateStr = reportContractor?.expiryDate ? Utils.formatDate(reportContractor.expiryDate) : '';
        const skeletonCard = (background, border) => `
            <div class="dashboard-stat-card" style="background: ${background}; border: 1px solid ${border}; border-radius: 12px; padding: 1rem; min-height: 128px; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);">
                <div style="height: 28px; width: 64px; margin: 0 auto 0.75rem; border-radius: 999px; background: rgba(255,255,255,0.8); animation: contractorReportPulse 1.1s ease-in-out infinite;"></div>
                <div style="height: 14px; width: 110px; margin: 0 auto; border-radius: 999px; background: rgba(255,255,255,0.75); animation: contractorReportPulse 1.1s ease-in-out infinite;"></div>
            </div>
        `;

        reportContainer.innerHTML = `
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-xl font-bold text-gray-800 mb-2">
                            <i class="fas fa-hard-hat ml-2"></i>
                            ${Utils.escapeHTML(contractorName || 'مقاول')}
                        </h3>
                        <p class="text-gray-600">
                            <i class="fas fa-barcode ml-2"></i>
                            كود المقاول: <strong>${Utils.escapeHTML(String(contractorCodeVal || ''))}</strong>
                        </p>
                        ${reportContractor?.entityType ? `<p class="text-gray-600 mt-1"><i class="fas fa-tag ml-2"></i>نوع الكيان: ${Utils.escapeHTML(reportContractor.entityType)}</p>` : ''}
                        ${reportContractor?.serviceType ? `<p class="text-gray-600 mt-1"><i class="fas fa-tools ml-2"></i>نوع الخدمة: ${Utils.escapeHTML(reportContractor.serviceType)}</p>` : ''}
                        ${approvalDateStr ? `<p class="text-gray-600 mt-1"><i class="fas fa-calendar-check ml-2"></i>تاريخ الاعتماد: ${approvalDateStr}</p>` : ''}
                        ${expiryDateStr ? `<p class="text-gray-600 mt-1"><i class="fas fa-calendar-times ml-2"></i>تاريخ الانتهاء: ${expiryDateStr}</p>` : ''}
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                ${skeletonCard('linear-gradient(145deg, #ccfbf1 0%, #99f6e4 100%)', '#2dd4bf')}
                ${skeletonCard('linear-gradient(145deg, #ffedd5 0%, #fed7aa 100%)', '#fb923c')}
                ${skeletonCard('linear-gradient(145deg, #fee2e2 0%, #fecaca 100%)', '#f87171')}
                ${skeletonCard('linear-gradient(145deg, #dbeafe 0%, #bfdbfe 100%)', '#60a5fa')}
                ${skeletonCard('linear-gradient(145deg, #d1fae5 0%, #a7f3d0 100%)', '#34d399')}
                ${skeletonCard('linear-gradient(145deg, #fce7f3 0%, #fbcfe8 100%)', '#f472b6')}
                ${skeletonCard('linear-gradient(145deg, #e0e7ff 0%, #c7d2fe 100%)', '#818cf8')}
            </div>
            <div class="rounded-lg border border-dashed border-gray-200 bg-white/80 p-6 text-center text-sm text-gray-500">
                جاري تجهيز بيانات المقاول من السجلات المرتبطة...
            </div>
            <style>
                @keyframes contractorReportPulse {
                    0%, 100% { opacity: 0.45; }
                    50% { opacity: 1; }
                }
            </style>
        `;

        contentContainer.classList.remove('hidden');
        if (exportBtnEl) exportBtnEl.disabled = true;
    },

    renderContractorReportFromData(report) {
        const reportContainer = document.getElementById('contractor-report-data');
        const contentContainer = document.getElementById('contractor-report-content');
        const exportBtnEl = document.getElementById('export-contractor-report-btn');
        const employeeContent = document.getElementById('employee-report-content');
        if (employeeContent) employeeContent.classList.add('hidden');
        if (!reportContainer || !contentContainer || !report) return;

        const contractor = report.contractor || {};
        const contractorName = String(report.contractorName || contractor.companyName || contractor.name || '').trim();
        const contractorCodeVal = report.contractorCode || contractor.code || contractor.isoCode || contractor.contractorId || contractor.id || '';
        const violations = Array.isArray(report.violations) ? report.violations : [];
        const incidents = Array.isArray(report.incidents) ? report.incidents : [];
        const sickLeave = Array.isArray(report.sickLeave) ? report.sickLeave : [];
        const training = Array.isArray(report.training) ? report.training : [];
        const clinicVisits = Array.isArray(report.clinicVisits) ? report.clinicVisits : [];
        const contractorEvaluations = Array.isArray(report.contractorEvaluations) ? report.contractorEvaluations : [];
        const ptwContractor = Array.isArray(report.ptwContractor) ? report.ptwContractor : [];
        const ptwOpen = typeof report.ptwOpen === 'number' ? report.ptwOpen : 0;
        const ptwClosed = typeof report.ptwClosed === 'number' ? report.ptwClosed : 0;
        const injuriesContractor = Array.isArray(report.injuriesContractor) ? report.injuriesContractor : [];
        const approvalDateStr = contractor.approvalDate ? Utils.formatDate(contractor.approvalDate) : '';
        const expiryDateStr = contractor.expiryDate ? Utils.formatDate(contractor.expiryDate) : '';

        reportContainer.innerHTML = `
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-xl font-bold text-gray-800 mb-2">
                            <i class="fas fa-hard-hat ml-2"></i>
                            ${Utils.escapeHTML(contractorName || 'مقاول')}
                        </h3>
                        <p class="text-gray-600">
                            <i class="fas fa-barcode ml-2"></i>
                            كود المقاول: <strong>${Utils.escapeHTML(String(contractorCodeVal))}</strong>
                        </p>
                        ${contractor.entityType ? `<p class="text-gray-600 mt-1"><i class="fas fa-tag ml-2"></i>نوع الكيان: ${Utils.escapeHTML(contractor.entityType)}</p>` : ''}
                        ${contractor.serviceType ? `<p class="text-gray-600 mt-1"><i class="fas fa-tools ml-2"></i>نوع الخدمة: ${Utils.escapeHTML(contractor.serviceType)}</p>` : ''}
                        ${approvalDateStr ? `<p class="text-gray-600 mt-1"><i class="fas fa-calendar-check ml-2"></i>تاريخ الاعتماد: ${approvalDateStr}</p>` : ''}
                        ${expiryDateStr ? `<p class="text-gray-600 mt-1"><i class="fas fa-calendar-times ml-2"></i>تاريخ الانتهاء: ${expiryDateStr}</p>` : ''}
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="dashboard-stat-card" style="background: linear-gradient(145deg, #ccfbf1 0%, #99f6e4 100%); border: 1px solid #2dd4bf; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: 0 2px 6px rgba(13, 148, 136, 0.15);">
                    <div style="font-size: 1.5rem; font-weight: 700; color: #0d9488; margin-bottom: 0.25rem;">${ptwOpen}</div>
                    <div style="font-size: 0.75rem; color: #115e59; margin-bottom: 0.5rem;">مفتوح</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #0f766e; margin-bottom: 0.25rem;">${ptwClosed}</div>
                    <div style="font-size: 0.75rem; color: #115e59; margin-bottom: 0.5rem;">مغلق</div>
                    <div style="font-size: 1.125rem; font-weight: 700; color: #134e4a; border-top: 1px solid #2dd4bf; padding-top: 0.5rem; margin-top: 0.5rem;">${ptwContractor.length}</div>
                    <div style="font-size: 0.8125rem; font-weight: 600; color: #134e4a;">التصاريح (الإجمالي)</div>
                </div>
                <div class="dashboard-stat-card" style="background: linear-gradient(145deg, #ffedd5 0%, #fed7aa 100%); border: 1px solid #fb923c; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: 0 2px 6px rgba(234, 88, 12, 0.15);">
                    <div style="font-size: 1.5rem; font-weight: 700; color: #ea580c; margin-bottom: 0.25rem;">${incidents.length}</div>
                    <div style="font-size: 0.75rem; color: #9a3412; margin-bottom: 0.5rem;">حوادث</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #c2410c; margin-bottom: 0.25rem;">${injuriesContractor.length}</div>
                    <div style="font-size: 0.75rem; color: #9a3412; margin-bottom: 0.5rem;">إصابات</div>
                    <div style="font-size: 0.8125rem; font-weight: 600; color: #9a3412;">الحوادث والإصابات</div>
                </div>
                <div class="dashboard-stat-card" style="background: linear-gradient(145deg, #fee2e2 0%, #fecaca 100%); border: 1px solid #f87171; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: 0 2px 6px rgba(220, 38, 38, 0.15);">
                    <div style="font-size: 1.875rem; font-weight: 700; color: #dc2626; margin-bottom: 0.25rem;">${violations.length}</div>
                    <div style="font-size: 0.8125rem; font-weight: 600; color: #991b1b;">المخالفات</div>
                </div>
                <div class="dashboard-stat-card" style="background: linear-gradient(145deg, #dbeafe 0%, #bfdbfe 100%); border: 1px solid #60a5fa; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.15);">
                    <div style="font-size: 1.875rem; font-weight: 700; color: #2563eb; margin-bottom: 0.25rem;">${sickLeave.length}</div>
                    <div style="font-size: 0.8125rem; font-weight: 600; color: #1e40af;">الإجازات المرضية</div>
                </div>
                <div class="dashboard-stat-card" style="background: linear-gradient(145deg, #d1fae5 0%, #a7f3d0 100%); border: 1px solid #34d399; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: 0 2px 6px rgba(5, 150, 105, 0.15);">
                    <div style="font-size: 1.875rem; font-weight: 700; color: #059669; margin-bottom: 0.25rem;">${training.length}</div>
                    <div style="font-size: 0.8125rem; font-weight: 600; color: #065f46;">برامج التدريب</div>
                </div>
                <div class="dashboard-stat-card" style="background: linear-gradient(145deg, #fce7f3 0%, #fbcfe8 100%); border: 1px solid #f472b6; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: 0 2px 6px rgba(219, 39, 119, 0.15);">
                    <div style="font-size: 1.875rem; font-weight: 700; color: #db2777; margin-bottom: 0.25rem;">${clinicVisits.length}</div>
                    <div style="font-size: 0.8125rem; font-weight: 600; color: #9d174d;">التردد على العيادة</div>
                </div>
                <div class="dashboard-stat-card" style="background: linear-gradient(145deg, #e0e7ff 0%, #c7d2fe 100%); border: 1px solid #818cf8; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: 0 2px 6px rgba(99, 102, 241, 0.15);">
                    <div style="font-size: 1.875rem; font-weight: 700; color: #4f46e5; margin-bottom: 0.25rem;">${contractorEvaluations.length}</div>
                    <div style="font-size: 0.8125rem; font-weight: 600; color: #3730a3;">التقييمات</div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                ${violations.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-exclamation-circle ml-2"></i>المخالفات (${violations.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${violations.slice(0, 5).map(v => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">${Utils.escapeHTML(v.violationType || '')}</span>
                                            <span class="badge badge-${v.severity === 'عالية' ? 'danger' : 'warning'}">${v.severity || ''}</span>
                                        </div>
                                        <p class="text-sm text-gray-600">${Utils.escapeHTML((v.actionTaken || '').substring(0, 100))}</p>
                                        <p class="text-xs text-gray-500 mt-2">${v.violationDate ? Utils.formatDate(v.violationDate) : ''}</p>
                                    </div>
                                `).join('')}
                                ${violations.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${violations.length - 5} مخالفات أخرى...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${incidents.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-exclamation-triangle ml-2"></i>الحوادث (${incidents.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${incidents.slice(0, 5).map(i => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">${Utils.escapeHTML(String(i.title || i.description || '').substring(0, 60))}</span>
                                            <span class="badge badge-warning">${i.severity || ''}</span>
                                        </div>
                                        <p class="text-xs text-gray-500 mt-2">${i.date ? Utils.formatDate(i.date) : ''}</p>
                                    </div>
                                `).join('')}
                                ${incidents.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${incidents.length - 5} حادث آخر...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${sickLeave.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-calendar-times ml-2"></i>الإجازات المرضية (${sickLeave.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${sickLeave.slice(0, 5).map(s => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">من ${s.startDate ? Utils.formatDate(s.startDate) : ''} إلى ${s.endDate ? Utils.formatDate(s.endDate) : ''}</span>
                                        </div>
                                        <p class="text-sm text-gray-600">${Utils.escapeHTML(s.reason || '')}</p>
                                    </div>
                                `).join('')}
                                ${sickLeave.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${sickLeave.length - 5} إجازة أخرى...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${training.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-graduation-cap ml-2"></i>برامج التدريب (${training.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${training.slice(0, 5).map(t => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">${Utils.escapeHTML(t.name || '')}</span>
                                            <span class="badge badge-success">${t.status || ''}</span>
                                        </div>
                                        <p class="text-sm text-gray-600">المدرب: ${Utils.escapeHTML(t.trainer || '')}</p>
                                        <p class="text-xs text-gray-500 mt-2">${t.startDate ? Utils.formatDate(t.startDate) : ''}</p>
                                    </div>
                                `).join('')}
                                ${training.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${training.length - 5} برنامج آخر...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${clinicVisits.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-hospital ml-2"></i>التردد على العيادة (${clinicVisits.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${clinicVisits.slice(0, 5).map(c => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">${Utils.escapeHTML(c.reason || 'زيارة عادية')}</span>
                                        </div>
                                        ${c.diagnosis ? `<p class="text-sm text-gray-600">التشخيص: ${Utils.escapeHTML(c.diagnosis)}</p>` : ''}
                                        <p class="text-xs text-gray-500 mt-2">${c.visitDate ? Utils.formatDate(c.visitDate) : ''}</p>
                                    </div>
                                `).join('')}
                                ${clinicVisits.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${clinicVisits.length - 5} زيارة أخرى...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${contractorEvaluations.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-clipboard-check ml-2"></i>التقييمات (${contractorEvaluations.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${contractorEvaluations.slice(0, 5).map(e => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">${Utils.escapeHTML(e.projectName || 'تقييم')}</span>
                                            <span class="badge badge-info">${e.finalScore != null ? e.finalScore : ''} ${e.finalRating || ''}</span>
                                        </div>
                                        <p class="text-sm text-gray-600">المقيّم: ${Utils.escapeHTML(e.evaluatorName || '')}</p>
                                        <p class="text-xs text-gray-500 mt-2">${e.evaluationDate ? Utils.formatDate(e.evaluationDate) : ''}</p>
                                    </div>
                                `).join('')}
                                ${contractorEvaluations.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${contractorEvaluations.length - 5} تقييم آخر...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        contentContainer.classList.remove('hidden');
        if (exportBtnEl) exportBtnEl.disabled = false;
        window.currentContractorReport = report;
    },

    /**
     * تحميل قسم التقارير في Dashboard - تصميم محسّن وتحديثات غير متزحمة
     */
    /**
     * جلب أوراق إحصائيات التقارير (مخالفات، تدريب، مهمات، سلوكيات، إجازات، حوادث/سجل، تصاريح العمل)
     * دون انتظار فتح الموديول — نفس فكرة كارت العيادة عبر readFromSheet / batchReadSheets.
     */
    async prefetchReportStatsSheetsForDashboard(opts = {}) {
        const forceRefresh = opts && opts.forceRefresh === true;
        try {
            if (!AppState || !AppState.appData) return;
            if (typeof Backend === 'undefined' || typeof Backend.batchReadFromSheets !== 'function') return;
            if (typeof Backend._isBackendRpcConfigured !== 'function' || !Backend._isBackendRpcConfigured()) return;

            // كاش 5 دقائق للزيارات المتكررة — لكن أول فتح لكل جلسة يجلب دائماً بغض النظر عن الكاش
            const CACHE_MS = 5 * 60 * 1000;
            const now = Date.now();
            const alreadyFetchedThisSession = this._reportStatsSheetsFetchedInSession === true;
            if (!forceRefresh && alreadyFetchedThisSession && typeof this._reportStatsSheetsFetchedAt === 'number' && (now - this._reportStatsSheetsFetchedAt) < CACHE_MS) {
                return;
            }

            const tuples = [];
            if (this.dashboardCan('violations')) {
                tuples.push(['Violations', 'violations']);
                // ✅ تحميل طلبات الاعتماد لكي تظهر إشعارات الاعتماد/الرفض في جرس الإشعارات
                tuples.push(['ViolationApprovalRequests', 'violationApprovalRequests']);
            }
            if (this.dashboardCan('training')) tuples.push(['Training', 'training']);
            if (this.dashboardCan('ppe')) tuples.push(['PPE', 'ppe']);
            if (this.dashboardCan('behavior-monitoring')) tuples.push(['BehaviorMonitoring', 'behaviorMonitoring']);
            if (this.dashboardCan('clinic')) {
                tuples.push(['SickLeave', 'sickLeave']);
                tuples.push(['Medications', 'medications']);
                tuples.push(['ClinicInventory', 'clinicInventory']);
            }
            if (this.dashboardCan('incidents')) {
                tuples.push(['Incidents', 'incidents']);
                tuples.push(['IncidentsRegistry', 'incidentsRegistry']);
            }
            if (this.dashboardCan('ptw')) {
                tuples.push(['PTW', 'ptw']);
                tuples.push(['PTWRegistry', 'ptwRegistry']);
            }
            if (this.dashboardCan('employees')) {
                tuples.push(['Employees', 'employees']);
                tuples.push(['ExternalWorkforceMonthly', 'externalWorkforceMonthly']);
                tuples.push(['ApprovedContractors', 'approvedContractors']);
            }

            const sheetNames = [];
            tuples.forEach(([sheet]) => {
                if (!sheetNames.includes(sheet)) sheetNames.push(sheet);
            });

            if (sheetNames.length === 0) {
                this._reportStatsSheetsFetchedAt = now;
                return;
            }

            const res = await Backend.batchReadFromSheets(sheetNames, { timeout: 45000, batchSize: 12 });
            const map = res && res.data && typeof res.data === 'object' ? res.data : {};

            tuples.forEach(([sheet, appKey]) => {
                const rows = map[sheet];
                if (Array.isArray(rows)) {
                    AppState.appData[appKey] = rows;
                }
            });

            this._reportStatsSheetsFetchedAt = now;
            this._reportStatsSheetsFetchedInSession = true; // علامة أول جلب ناجح في الجلسة

            // ✅ تحديث الكروت فوراً بعد وصول البيانات من الخادم
            try {
                this.updateStats();
                this.updateReportsStatistics();
            } catch (_) { /* تجاهل */ }

            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                try {
                    window.DataManager.save();
                } catch (e) { /* ignore */ }
            }
        } catch (e) {
            if (typeof Utils !== 'undefined' && Utils.safeWarn) {
                Utils.safeWarn('⚠️ تعذر جلب أوراق إحصائيات لوحة التحكم:', e);
            }
        }
    },

    async loadReportsWidget(forceOrOpts) {
        const forceRefresh = forceOrOpts === true || (forceOrOpts && forceOrOpts.forceRefresh === true);
        const container = document.getElementById('dashboard-reports-widget');
        if (!container) {
            try {
                const prefetchClinic = this.dashboardCan('clinic')
                    ? this.prefetchClinicVisitsForDashboard({ forceRefresh })
                    : Promise.resolve();
                await Promise.all([
                    this.prefetchReportStatsSheetsForDashboard({ forceRefresh }),
                    prefetchClinic
                ]);
                this.updateKPIs();
                this.updateStats();
            } catch (e) {
                if (typeof Utils !== 'undefined' && Utils.safeWarn) Utils.safeWarn('⚠️ جلب بيانات لوحة التحكم بدون حاوية التقارير:', e);
            }
            return;
        }

        // Stale-While-Revalidate: render immediately from cache then update from server
        const _self = this;
        const _renderWidgetFromData = async (snapshot) => {
            try {
                const stats = await _self.calculateStatsAsync(snapshot || AppState.appData || {});
                const expiringMeds = _self.dashboardCan('clinic')
                    ? await _self.getExpiringMedicationsAsync(snapshot || {})
                    : [];
                if (!document.contains(container)) return;
                container.innerHTML = _self.renderReportsWidget(stats, expiringMeds);
                _self.animateStatCards(container);
                _self.setupReportsWidgetEvents(container);
                _self.applyDashboardLayoutPermissions();
                try {
                    _self.updateKPIs();
                    _self.updateStats();
                    _self.updateReportsStatistics();
                } catch (_) {}
            } catch (e) {
                if (typeof Utils !== 'undefined' && Utils.safeWarn) Utils.safeWarn('dashboard render error:', e);
            }
        };

        try {
            // 1 - render immediately from local cache (no server wait)
            await _renderWidgetFromData(AppState.appData || {});

            // 2 - fetch fresh data from server in background (non-blocking)
            const prefetchClinic = this.dashboardCan('clinic')
                ? this.prefetchClinicVisitsForDashboard({ forceRefresh })
                : Promise.resolve();

            Promise.all([
                this.prefetchReportStatsSheetsForDashboard({ forceRefresh }),
                prefetchClinic
            ]).then(() => _renderWidgetFromData(AppState.appData))
              .catch(e => {
                  if (typeof Utils !== 'undefined' && Utils.safeWarn) Utils.safeWarn('dashboard prefetch failed:', e);
              });

        } catch (error) {
            Utils.safeError('dashboard load error:', error);
            container.innerHTML = `
                <div class="content-card">
                    <div class="card-body">
                        <div class="empty-state">
                            <i class="fas fa-exclamation-triangle text-4xl text-gray-300 mb-4"></i>
                            <p class="text-gray-500">حدث خطأ أثناء تحميل البيانات</p>
                            <button onclick="Dashboard.loadReportsWidget(true)" class="btn-primary mt-4">
                                <i class="fas fa-redo ml-2"></i>إعادة المحاولة
                            </button>
                        </div>
                    </div>
                </div>
            `;
            try {
                this.updateKPIs();
                this.updateStats();
            } catch (_) {}
        }
    },

    /**
     * عرض حالة التحميل (Skeleton Loader)
     */
    renderReportsWidgetSkeleton() {
        return `
            <div class="content-card">
                <div class="card-header">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="skeleton-icon" style="width: 24px; height: 24px; border-radius: 6px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;"></div>
                            <div class="skeleton-text" style="width: 200px; height: 24px; border-radius: 4px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;"></div>
                        </div>
                        <button class="btn-icon" id="refresh-reports-btn" style="display: none;">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="stats-cards-grid mb-6">
                        ${Array.from({ length: 5 }).map(() => `
                            <div class="stat-card" style="opacity: 0.7;">
                                <div class="skeleton-icon" style="width: 48px; height: 48px; border-radius: 12px; margin: 0 auto 0.75rem; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;"></div>
                                <div class="skeleton-text" style="width: 60px; height: 32px; border-radius: 4px; margin: 0 auto 0.5rem; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;"></div>
                                <div class="skeleton-text" style="width: 100px; height: 16px; border-radius: 4px; margin: 0 auto; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;"></div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <style>
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
            </style>
        `;
    },

    /**
     * هل السجل يمثل زيارة مقاول/خارجي (وليس موظفاً فقط) — لاكتشاف دمج getAllClinicVisits في clinicVisits
     */
    _isClinicContractorLikeVisit(v) {
        if (!v || typeof v !== 'object') return false;
        const t = String(v.personType || '').toLowerCase();
        if (t === 'contractor' || t === 'external') return true;
        if (String(v.contractorName || '').trim()) return true;
        if (String(v.externalName || '').trim()) return true;
        if (String(v.contractorWorkerName || '').trim()) return true;
        return false;
    },

    /**
     * إجمالي التردد على العيادة (موظفين + مقاولين).
     * - بعد getAllClinicVisits: كل السجلات في clinicVisits فقط؛ لا نجمع clinicContractorVisits لتفادي العد المزدوج.
     * - عند التحميل المنفصل من الشيتين: نجمع الطولين دون دمج بالمعرف (تصادم ids بين الشيتين كان يسبب نقصاً في العد).
     */
    getClinicVisitsTotalCount(data) {
        if (!data || typeof data !== 'object') return 0;
        const main = Array.isArray(data.clinicVisits) ? data.clinicVisits : [];
        const extra = Array.isArray(data.clinicContractorVisits) ? data.clinicContractorVisits : [];
        const legacy = Array.isArray(data.Clinic) ? data.Clinic : [];

        const mergedFromServer =
            typeof Clinic !== 'undefined' &&
            Clinic._visitsBackendFetchOk === true &&
            main.length > 0;
        if (mergedFromServer) {
            return main.length;
        }

        const hasContractorRowsInMain = main.some((v) => this._isClinicContractorLikeVisit(v));
        if (main.length > 0 && hasContractorRowsInMain) {
            return main.length;
        }

        let total = main.length + extra.length;
        if (total === 0 && legacy.length > 0) {
            total = legacy.length;
        }
        return total;
    },

    /**
     * جلب سجل التردد الكامل للوحة التحكم (لا يعتمد على فتح موديول العيادة)
     * يطابق شروط تحديث تبويب الزيارات: بيانات ناقصة، انتهاء الكاش، أو عدم إكمال جلب الخادم بعد.
     */
    async prefetchClinicVisitsForDashboard(opts = {}) {
        const forceRefresh = opts && opts.forceRefresh === true;
        try {
            if (!AppState || !AppState.appData) return;
            if (!this.dashboardCan('clinic')) return;
            if (typeof Clinic === 'undefined' || typeof Clinic.loadVisitsDataFromBackend !== 'function') return;
            if (typeof Backend === 'undefined' || typeof Backend.sendRequest !== 'function') return;

            if (!forceRefresh && typeof Clinic.shouldFetchClinicVisitsFromBackend === 'function') {
                if (!Clinic.shouldFetchClinicVisitsFromBackend()) return;
            }

            await Clinic.loadVisitsDataFromBackend();
        } catch (e) {
            if (typeof Utils !== 'undefined' && Utils.safeWarn) {
                Utils.safeWarn('⚠️ تعذر جلب سجل التردد على العيادة للوحة التحكم:', e);
            }
        }
    },

    /**
     * حساب الإحصائيات بشكل غير متزحم
     */
    async calculateStatsAsync(data) {
        return new Promise((resolve) => {
            // استخدام requestIdleCallback أو setTimeout للتحميل غير المتزحم
            const calculate = () => {
                const registryData = (data.incidentsRegistry || []);
                const incidentsCount = (registryData && registryData.length > 0)
                    ? registryData.length
                    : (data.incidents || []).length;

                resolve({
                    incidents: incidentsCount,
                    training: (data.training || []).length,
                    ptw: (data.ptw || []).length,
                    violations: (data.violations || []).length,
                    sickLeave: (data.sickLeave || []).length,
                    ppe: (data.ppe || []).length,
                    behaviorMonitoring: (data.behaviorMonitoring || []).length,
                    clinicVisits: this.getClinicVisitsTotalCount(data)
                });
            };

            if (window.requestIdleCallback) {
                window.requestIdleCallback(calculate, { timeout: 500 });
            } else {
                setTimeout(calculate, 50);
            }
        });
    },

    /**
     * الحصول على الأدوية المنتهية الصلاحية بشكل غير متزحم
     */
    async getExpiringMedicationsAsync(data) {
        return new Promise((resolve) => {
            const process = () => {
                const clinicMedications = data.clinicMedications || data.clinicInventory || [];
                const today = new Date();
                const expiringMedications = clinicMedications
                    .filter((med) => {
                        if (!med || !med.expiryDate) return false;
                        const expiry = new Date(med.expiryDate);
                        if (Number.isNaN(expiry.getTime())) return false;
                        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
                        
                        // ✅ مهم: عرض الأدوية قريبة الانتهاء فقط إذا كان هناك رصيد متبقي
                        // يجب أن يتطابق مع منطق جدول الأدوية في العيادة
                        const remainingQuantity = parseFloat(med.remainingQuantity ?? med.quantityAdded ?? med.quantity ?? 0);
                        const hasStock = remainingQuantity > 0;
                        
                        return diffDays >= 0 && diffDays <= 30 && hasStock;
                    })
                    .sort((a, b) => {
                        const aDate = new Date(a.expiryDate || 0);
                        const bDate = new Date(b.expiryDate || 0);
                        return aDate - bDate;
                    });
                resolve(expiringMedications);
            };

            if (window.requestIdleCallback) {
                window.requestIdleCallback(process, { timeout: 500 });
            } else {
                setTimeout(process, 50);
            }
        });
    },

    /**
     * عرض كارت التقارير مع البيانات
     */
    renderReportsWidget(stats, expiringMedications) {
        const today = new Date();

        const statCardSpecs = [
            { id: 'violations', key: 'violations', labelKey: 'dash.violations', labelFb: 'المخالفات', icon: 'fa-ban', color: 'yellow', module: 'violations' },
            { id: 'sickLeave', key: 'sickLeave', labelKey: 'dash.sickLeaves', labelFb: 'الإجازات المرضية', icon: 'fa-calendar-times', color: 'blue', module: 'clinic' },
            { id: 'training', key: 'training', labelKey: 'dash.trainingPrograms', labelFb: 'برامج التدريب', icon: 'fa-graduation-cap', color: 'green', module: 'training' },
            { id: 'ppe', key: 'ppe', labelKey: 'dash.ppeEquipment', labelFb: 'مهمات الوقاية', icon: 'fa-hard-hat', color: 'orange', module: 'ppe' },
            { id: 'behaviorMonitoring', key: 'behaviorMonitoring', labelKey: 'dash.behaviorMonitoring', labelFb: 'مراقبة السلوكيات', icon: 'fa-user-check', color: 'purple', module: 'behavior-monitoring' },
            { id: 'clinicVisits', key: 'clinicVisits', labelKey: 'dash.clinicVisits', labelFb: 'التردد على العيادة', icon: 'fa-hospital', color: 'pink', module: 'clinic' },
            { id: 'incidents', key: 'incidents', labelKey: 'dash.incidents', labelFb: 'الحوادث', icon: 'fa-exclamation-triangle', color: 'red', module: 'incidents' }
        ];

        let delay = 0;
        const statCardsHtml = statCardSpecs
            .filter((spec) => this.dashboardCan(spec.module))
            .map((spec) => {
                const val = typeof stats[spec.key] === 'number' ? stats[spec.key] : 0;
                const card = this.renderStatCard(spec.id, val, this.t(spec.labelKey, spec.labelFb), spec.icon, spec.color, delay);
                delay += 100;
                return card;
            })
            .join('');

        const exportIncidents = this.dashboardCan('incidents');
        const exportTraining = this.dashboardCan('training');
        const exportFull = typeof Permissions !== 'undefined' && typeof Permissions.isCurrentUserEffectiveAdmin === 'function'
            ? Permissions.isCurrentUserEffectiveAdmin()
            : false;

        const exportButtonsHtml = [
            exportIncidents ? `
                            <button class="report-export-btn report-export-btn-incidents" data-report-type="incidents">
                                <div class="btn-content">
                                    <div class="btn-icon-wrapper">
                                        <i class="fas fa-file-pdf"></i>
                                    </div>
                                    <span class="btn-label">${this.t('dash.incidentsReport', 'تقرير الحوادث')}</span>
                                </div>
                                <span class="btn-description">${this.t('dash.incidentsReportDesc', 'تصدير تقرير شامل عن الحوادث')}</span>
                            </button>` : '',
            exportTraining ? `
                            <button class="report-export-btn report-export-btn-training" data-report-type="training">
                                <div class="btn-content">
                                    <div class="btn-icon-wrapper">
                                        <i class="fas fa-file-pdf"></i>
                                    </div>
                                    <span class="btn-label">${this.t('dash.trainingReport', 'تقرير التدريب')}</span>
                                </div>
                                <span class="btn-description">${this.t('dash.trainingReportDesc', 'تصدير تقرير عن برامج التدريب')}</span>
                            </button>` : '',
            exportFull ? `
                            <button class="report-export-btn report-export-btn-full" data-report-type="full">
                                <div class="btn-content">
                                    <div class="btn-icon-wrapper">
                                        <i class="fas fa-file-pdf"></i>
                                    </div>
                                    <span class="btn-label">${this.t('dash.fullReport', 'تقرير شامل')}</span>
                                </div>
                                <span class="btn-description">${this.t('dash.fullReportDesc', 'تصدير تقرير شامل لجميع البيانات')}</span>
                            </button>` : ''
        ].join('');

        const statsSectionInner = statCardsHtml.trim()
            ? `<div class="stats-cards-grid" id="reports-stats-grid">${statCardsHtml}</div>`
            : `<p class="text-gray-500 text-sm px-2">${this.t('dash.noStatsForPermissions', 'لا توجد إحصائيات سريعة مطابقة لصلاحياتك الحالية.')}</p>`;

        const exportSectionHtml = exportButtonsHtml.trim()
            ? `
                    <div class="reports-actions-section">
                        <div class="section-header-row">
                            <h3>
                                <i class="fas fa-file-export"></i>
                                <span>${this.t('dash.exportReports', 'تصدير التقارير')}</span>
                            </h3>
                            <span class="info-text">
                                <i class="fas fa-info-circle"></i>
                                ${this.t('dash.exportReportsPdfHint', 'يمكنك تصدير التقارير بصيغة PDF')}
                            </span>
                        </div>
                        <div class="reports-export-grid">
                            ${exportButtonsHtml}
                        </div>
                    </div>`
            : '';

        const medicationsHtml = this.dashboardCan('clinic')
            ? this.renderMedicationsAlerts(expiringMedications, today)
            : '';

        return `
            <div class="reports-widget-card">
                
                <!-- الهيدر -->
                <div class="card-header reports-widget-header">
                    <div class="header-content-wrapper">
                        <div class="header-title-section">
                            <div class="reports-icon-wrapper">
                                <i class="fas fa-chart-line"></i>
                            </div>
                            <div class="title-text">
                                <h2>${this.t('dash.reportsStatistics', 'التقارير والإحصائيات')}</h2>
                                <p>${this.t('dash.reportsStatisticsSubtitle', 'نظرة شاملة على جميع البيانات والإحصائيات في النظام')}</p>
                            </div>
                        </div>
                        <div class="header-actions">
                            <button class="btn-icon reports-refresh-btn" id="refresh-reports-btn" title="تحديث البيانات">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- المحتوى الرئيسي -->
                <div class="card-body">
                    <!-- قسم كروت الإحصائيات -->
                    <div class="stats-section">
                        <div class="section-header-row">
                            <h3>
                                <i class="fas fa-chart-pie"></i>
                                <span>${this.t('dash.quickStats', 'الإحصائيات السريعة')}</span>
                            </h3>
                        </div>
                        ${statsSectionInner}
                    </div>
                    
                    ${exportSectionHtml}
                    
                    <!-- تنبيهات الأدوية -->
                    ${medicationsHtml}
                </div>
            </div>

        `;
    },

    /**
     * تحويل معرف الكارت إلى اسم الموديول
     */
    getModuleNameFromStatId(statId) {
        const statToModuleMap = {
            'violations': 'violations',
            'contractors': 'contractors',
            'sickLeave': 'clinic',
            'training': 'training',
            'ppe': 'ppe',
            'behaviorMonitoring': 'behavior-monitoring',
            'clinicVisits': 'clinic',
            'incidents': 'incidents',
            'nearmiss': 'nearmiss',
            'periodic-inspections': 'periodic-inspections',
            'ptw': 'ptw',
            'iso': 'iso',
            'electricity-consumption': 'sustainability',
            'water-consumption': 'sustainability',
            'gas-consumption': 'sustainability',
            // ✅ كروت إصابات العيادة (موظفين + مقاولين) — يفتح العيادة
            'clinic-injuries-employee': 'clinic',
            'clinic-injuries-contractor': 'clinic'
        };
        return statToModuleMap[statId] || null;
    },

    /**
     * عرض كارت إحصائية واحد - تصميم محسّن ومتطور
     */
    renderStatCard(id, value, label, icon, color, delay) {
        // استخدام formatNumber لضمان عرض الأرقام بالإنجليزية
        const formattedValue = typeof value === 'number' ? this.formatNumber(value) : value;

        return `
            <div class="enhanced-stat-card stat-card-${color}" 
                 data-stat-id="${id}" 
                 data-stat-value="${value}"
                 data-clickable="true"
                 style="animation-delay: ${delay}ms; cursor: pointer;">
                
                <div class="stat-card-icon">
                    <i class="fas ${icon}"></i>
                </div>
                
                <div class="stat-card-value">
                    <span class="stat-value-number english-number" dir="ltr" style="direction: ltr; text-align: left; font-variant-numeric: tabular-nums;">${formattedValue}</span>
                </div>
                
                <div class="stat-card-label">
                    ${label}
                </div>
            </div>
        `;
    },

    /**
     * عرض تنبيهات الأدوية
     */
    renderMedicationsAlerts(expiringMedications, today) {
        if (expiringMedications.length === 0) {
            return `
                <div class="medications-alerts-section" style="border-top: 1px solid var(--border-color); padding-top: 2rem; margin-top: 2rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
                        <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(139, 92, 246, 0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i class="fas fa-pills" style="color: #7c3aed; font-size: 1.125rem;"></i>
                        </div>
                        <h3 style="margin: 0; font-size: 1.25rem; font-weight: 600; color: var(--text-primary);">
                            ${this.t('dash.medicationsExpiryAlerts', 'تنبيهات صلاحية الأدوية')}
                        </h3>
                    </div>
                    <div style="background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 12px; padding: 1.25rem; display: flex; align-items: center; gap: 1rem;">
                        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(34, 197, 94, 0.15); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i class="fas fa-check-circle" style="color: #16a34a; font-size: 1.5rem;"></i>
                        </div>
                        <p style="margin: 0; font-size: 0.9375rem; font-weight: 500; color: var(--text-primary); line-height: 1.5;">
                            ${this.t('dash.noExpiringMedications30Days', 'لا توجد أدوية منتهية أو قريبة الانتهاء خلال 30 يوماً.')}
                        </p>
                    </div>
                </div>
            `;
        }

        return `
            <div class="medications-alerts-section" style="border-top: 1px solid var(--border-color); padding-top: 2rem; margin-top: 2rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(139, 92, 246, 0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i class="fas fa-pills" style="color: #7c3aed; font-size: 1.125rem;"></i>
                        </div>
                        <h3 style="margin: 0; font-size: 1.25rem; font-weight: 600; color: var(--text-primary);">
                            ${this.t('dash.medicationsExpiryAlerts', 'تنبيهات صلاحية الأدوية')}
                        </h3>
                    </div>
                    <span class="badge badge-warning" style="padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; font-size: 0.875rem; background: rgba(234, 179, 8, 0.15); color: #ca8a04; border: 1px solid rgba(234, 179, 8, 0.3);">
                        ${expiringMedications.length} تنبيه
                    </span>
                </div>
                <div class="medications-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
                    ${expiringMedications.slice(0, 5).map((med, index) => {
            const expiry = med.expiryDate ? new Date(med.expiryDate) : null;
            const diff = expiry ? Math.ceil((expiry - today) / (1000 * 60 * 60 * 24)) : null;
            const statusText = diff !== null
                ? (diff < 0 ? 'منتهية الصلاحية' : `يتبقى ${diff} يوم`)
                : 'تاريخ غير محدد';
            const badgeClass = diff !== null
                ? (diff < 0 ? 'badge-danger' : diff <= 7 ? 'badge-danger' : diff <= 30 ? 'badge-warning' : 'badge-success')
                : 'badge-secondary';

            const badgeStyles = {
                'badge-danger': 'background: rgba(220, 38, 38, 0.1); color: #dc2626; border: 1px solid rgba(220, 38, 38, 0.2);',
                'badge-warning': 'background: rgba(234, 179, 8, 0.1); color: #ca8a04; border: 1px solid rgba(234, 179, 8, 0.2);',
                'badge-success': 'background: rgba(34, 197, 94, 0.1); color: #16a34a; border: 1px solid rgba(34, 197, 94, 0.2);',
                'badge-secondary': 'background: rgba(107, 114, 128, 0.1); color: #6b7280; border: 1px solid rgba(107, 114, 128, 0.2);'
            };

            return `
                        <div class="medication-alert-item" style="opacity: 0; transform: translateX(-20px); animation: slideInRight 0.4s ease ${index * 80}ms forwards; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.25rem; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s ease; cursor: pointer; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);">
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; line-height: 1.4;">
                                    ${Utils.escapeHTML(med.name || '')}
                                </div>
                                <div style="font-size: 0.8125rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.5rem;">
                                    <i class="fas fa-calendar-alt" style="font-size: 0.75rem; opacity: 0.7;"></i>
                                    <span>${med.expiryDate ? Utils.formatDate(med.expiryDate) : 'تاريخ غير محدد'}</span>
                                </div>
                            </div>
                            <span class="badge ${badgeClass}" style="margin-right: 1rem; font-weight: 600; padding: 0.5rem 0.875rem; border-radius: 8px; font-size: 0.8125rem; white-space: nowrap; flex-shrink: 0; ${badgeStyles[badgeClass] || badgeStyles['badge-secondary']}">
                                ${statusText}
                            </span>
                        </div>
                    `;
        }).join('')}
                    ${expiringMedications.length > 5
                ? `<div class="text-center mt-3">
                        <p class="text-xs font-medium" style="color: var(--text-secondary);">
                            <i class="fas fa-info-circle ml-1"></i>
                            يوجد ${expiringMedications.length - 5} أدوية أخرى تتطلب المتابعة
                        </p>
                    </div>`
                : ''}
                </div>
            </div>
        `;
    },

    /**
     * إضافة animations للكروت
     */
    animateStatCards(container) {
        // البحث عن جميع أنواع الكروت (القديمة والجديدة)
        const oldCards = container.querySelectorAll('.reports-stat-card');
        const enhancedCards = container.querySelectorAll('.enhanced-stat-card');
        const cards = [...oldCards, ...enhancedCards];
        const self = this; // حفظ المرجع للكائن Dashboard

        cards.forEach((card, index) => {
            // إزالة أي event listeners سابقة لتجنب التكرار
            // استخدام dataset لتجنب إعادة إنشاء العناصر
            if (card.dataset.animated === 'true') {
                return; // تم إعداد هذا الكارت بالفعل
            }
            card.dataset.animated = 'true';

            // إضافة تأثير hover مع تحسين الأداء ومنع الاهتزاز
            let hoverTimeout = null;

            // CSS يتعامل مع hover effects تلقائياً، لكن نضيف event listeners للكروت المحسّنة
            // لضمان عمل جميع التأثيرات بشكل صحيح
            if (card.classList.contains('enhanced-stat-card')) {
                // الكروت المحسّنة تستخدم CSS للـ hover effects
                // فقط نضيف animation للقيم
            } else {
                // للكروت القديمة، نضيف hover effects يدوياً
                card.addEventListener('mouseenter', function () {
                    if (hoverTimeout) {
                        cancelAnimationFrame(hoverTimeout);
                    }
                    hoverTimeout = requestAnimationFrame(() => {
                        this.style.transform = 'translateY(-8px) scale(1.02)';
                        this.style.boxShadow = '0 12px 24px rgba(0,0,0,0.15)';
                        this.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease';

                        const topBar = this.querySelector('.stat-card-top-bar');
                        if (topBar) {
                            topBar.style.height = '6px';
                            topBar.style.transition = 'height 0.3s ease';
                        }

                        const icon = this.querySelector('.stat-card-icon');
                        if (icon) {
                            icon.style.transform = 'scale(1.1) rotate(5deg)';
                            icon.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
                        }
                    });
                }, { passive: true });

                card.addEventListener('mouseleave', function () {
                    if (hoverTimeout) {
                        cancelAnimationFrame(hoverTimeout);
                    }
                    hoverTimeout = requestAnimationFrame(() => {
                        this.style.transform = '';
                        this.style.boxShadow = '';

                        const topBar = this.querySelector('.stat-card-top-bar');
                        if (topBar) {
                            topBar.style.height = '';
                        }

                        const icon = this.querySelector('.stat-card-icon');
                        if (icon) {
                            icon.style.transform = '';
                        }
                    });
                }, { passive: true });
            }

            // Animation للقيم (Count Up)
            const valueElement = card.querySelector('.stat-value-number');
            if (valueElement) {
                const targetValue = parseInt(card.dataset.statValue) || 0;
                self.animateValue(valueElement, 0, targetValue, 1000 + (index * 100));
            }
        });

        // إعداد معالجات النقر للكروت بعد إعداد الـ animations
        // (سيتم استدعاؤها مرة أخرى من setupReportsWidgetEvents، لكن هذا يضمن أنها تعمل)
        this.setupStatCardsClickHandlers(container);
    },

    /**
     * Animation للقيم (Count Up Effect)
     */
    animateValue(element, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const current = Math.floor(progress * (end - start) + start);
            element.textContent = current.toLocaleString('en-US');
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    },

    /**
     * إعداد مستمعي الأحداث
     */
    setupReportsWidgetEvents(container) {
        // زر التحديث
        const refreshBtn = container.querySelector('#refresh-reports-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                const icon = refreshBtn.querySelector('i');
                if (icon) {
                    icon.style.transform = 'rotate(360deg)';
                    setTimeout(() => {
                        icon.style.transform = 'rotate(0deg)';
                    }, 500);
                }
                await this.loadReportsWidget({ forceRefresh: true });
            });
        }

        // أزرار التصدير
        const exportBtns = container.querySelectorAll('.report-export-btn');
        exportBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const reportType = btn.dataset.reportType;
                if (typeof Reports !== 'undefined' && Reports.generateAndExport) {
                    Reports.generateAndExport(reportType);
                } else {
                    Notification.warning('نظام التقارير غير متاح حالياً');
                }
            });

            // تأثير hover
            btn.addEventListener('mouseenter', function () {
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
            });
            btn.addEventListener('mouseleave', function () {
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = '';
            });
        });

        // إضافة معالجات النقر على كروت الإحصائيات
        this.setupStatCardsClickHandlers(container);
    },

    /**
     * إعداد معالجات النقر على كروت التقارير والإحصائيات (Reports & Statistics)
     */
    setupReportsStatisticsCardsClickHandlers() {
        const reportsStatisticsSection = document.querySelector('.reports-statistics-section');
        if (!reportsStatisticsSection) return;

        const metricCards = reportsStatisticsSection.querySelectorAll('.metric-card-frame[data-clickable="true"]');
        
        metricCards.forEach(card => {
            // تجنب إضافة معالج النقر أكثر من مرة
            if (card.dataset.clickHandlerAdded === 'true') {
                return;
            }
            card.dataset.clickHandlerAdded = 'true';

            card.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const statId = card.getAttribute('data-stat-id');
                if (!statId) return;

                // الحصول على اسم الموديول من معرف الكارت
                const moduleName = this.getModuleNameFromStatId(statId);
                if (!moduleName) {
                    console.warn('لم يتم العثور على موديول للكارت:', statId);
                    return;
                }

                // التحقق من الصلاحيات (fail-closed إذا Permissions غير متاح)
                const canAccess = (typeof Permissions !== 'undefined' && typeof Permissions.hasAccess === 'function')
                    ? Permissions.hasAccess(moduleName)
                    : ((AppState?.currentUser?.role || '').toLowerCase() === 'admin');

                if (!canAccess) {
                    // المستخدم ليس لديه صلاحية للوصول إلى هذا الموديول
                    if (typeof Notification !== 'undefined' && typeof Notification.warning === 'function') {
                        Notification.warning('ليس لديك صلاحية للوصول إلى هذا القسم');
                    } else {
                        alert('ليس لديك صلاحية للوصول إلى هذا القسم');
                    }
                    return;
                }

                // التنقل إلى الموديول المطلوب
                if (typeof UI !== 'undefined' && typeof UI.showSection === 'function') {
                    UI.showSection(moduleName);
                } else if (typeof window !== 'undefined' && window.location) {
                    window.location.hash = moduleName;
                } else {
                    console.warn('لا يمكن التنقل إلى الموديول:', moduleName);
                }
            });
        });
    },

    /**
     * إعداد معالجات النقر على كروت الإحصائيات
     */
    setupStatCardsClickHandlers(container) {
        const statCards = container.querySelectorAll('.enhanced-stat-card[data-clickable="true"]');
        
        statCards.forEach(card => {
            // تجنب إضافة معالج النقر أكثر من مرة
            if (card.dataset.clickHandlerAdded === 'true') {
                return;
            }
            card.dataset.clickHandlerAdded = 'true';

            card.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const statId = card.getAttribute('data-stat-id');
                if (!statId) return;

                // الحصول على اسم الموديول من معرف الكارت
                const moduleName = this.getModuleNameFromStatId(statId);
                if (!moduleName) {
                    console.warn('لم يتم العثور على موديول للكارت:', statId);
                    return;
                }

                // التحقق من الصلاحيات (fail-closed إذا Permissions غير متاح)
                const canAccess = (typeof Permissions !== 'undefined' && typeof Permissions.hasAccess === 'function')
                    ? Permissions.hasAccess(moduleName)
                    : ((AppState?.currentUser?.role || '').toLowerCase() === 'admin');

                if (!canAccess) {
                    // المستخدم ليس لديه صلاحية للوصول إلى هذا الموديول
                    if (typeof Notification !== 'undefined' && typeof Notification.warning === 'function') {
                        Notification.warning('ليس لديك صلاحية للوصول إلى هذا القسم');
                    } else {
                        alert('ليس لديك صلاحية للوصول إلى هذا القسم');
                    }
                    return;
                }

                // التنقل إلى الموديول المطلوب
                if (typeof UI !== 'undefined' && typeof UI.showSection === 'function') {
                    UI.showSection(moduleName);
                } else if (typeof window !== 'undefined' && window.location) {
                    window.location.hash = moduleName;
                } else {
                    console.warn('لا يمكن التنقل إلى الموديول:', moduleName);
                }
            });
        });
    },

    /**
     * تحميل قسم تقرير الموظف
     */
    loadEmployeeReportWidget() {
        const container = document.getElementById('employee-report-widget');
        if (!container) return;

        const canEmp = this.dashboardCan('employees');
        const canCon = this.dashboardCan('contractors');
        if (!canEmp && !canCon) {
            container.innerHTML = '';
            container.hidden = true;
            return;
        }
        container.hidden = false;

        const headerTitle = (canEmp && canCon)
            ? this.t('dash.queryComprehensiveReport', 'الاستعلام - تقرير شامل (موظف / مقاول)')
            : canEmp
                ? this.t('dash.queryEmployeeReport', 'الاستعلام - تقرير موظف')
                : this.t('dash.queryContractorReport', 'الاستعلام - تقرير مقاول');

        const employeeBlock = canEmp ? `
                        <div class="dashboard-query-block dashboard-query-employee" style="flex: 0 0 auto; min-width: 260px; display: flex; align-items: flex-end; gap: 0.75rem; padding: 1.25rem 1.5rem; border-radius: 12px; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #93c5fd; box-shadow: 0 1px 3px rgba(59, 130, 246, 0.12);">
                            <div style="flex: 1; min-width: 0;">
                                <label class="block text-sm font-semibold mb-2" style="color: #1e40af;">
                                    <i class="fas fa-id-card ml-2"></i>
                                    الكود الوظيفي
                                </label>
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <input type="text" id="employee-code-search" class="form-input"
                                        placeholder="أدخل الكود الوظيفي"
                                        style="width: 130px; min-width: 100px; padding: 0.625rem 0.75rem; border-radius: 8px; font-size: 0.95rem; text-align: center; border: 1px solid #93c5fd;">
                                    <button id="search-employee-btn" class="btn-primary" style="width: 44px; height: 44px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 8px; flex-shrink: 0; background: #2563eb;">
                                        <i class="fas fa-search"></i>
                                    </button>
                                </div>
                            </div>
                            <div style="flex-shrink: 0;">
                                <button id="export-employee-report-btn" class="btn-success" disabled style="height: 44px; padding: 0 1rem; display: flex; align-items: center; gap: 0.25rem; border-radius: 8px; background: #059669;">
                                    <i class="fas fa-file-pdf ml-2"></i>تصدير PDF
                                </button>
                            </div>
                        </div>` : '';

        const contractorBlock = canCon ? `
                        <div class="dashboard-query-block dashboard-query-contractor" style="flex: 0 0 auto; min-width: 260px; display: flex; align-items: flex-end; gap: 0.75rem; padding: 1.25rem 1.5rem; border-radius: 12px; background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border: 1px solid #fcd34d; box-shadow: 0 1px 3px rgba(245, 158, 11, 0.12);">
                            <div style="flex: 1; min-width: 0;">
                                <label class="block text-sm font-semibold mb-2" style="color: #b45309;">
                                    <i class="fas fa-barcode ml-2"></i>
                                    كود المقاول / اسم الشركة
                                </label>
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <input type="text" id="contractor-code-search" class="form-input"
                                        placeholder="أدخل كود المقاول أو اسم الشركة"
                                        style="width: 190px; min-width: 140px; padding: 0.625rem 0.75rem; border-radius: 8px; font-size: 0.95rem; border: 1px solid #fcd34d;">
                                    <button id="search-contractor-btn" class="btn-primary" style="width: 44px; height: 44px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 8px; flex-shrink: 0; background: #d97706;">
                                        <i class="fas fa-search"></i>
                                    </button>
                                </div>
                            </div>
                            <div style="flex-shrink: 0;">
                                <button id="export-contractor-report-btn" class="btn-success" disabled style="height: 44px; padding: 0 1rem; display: flex; align-items: center; gap: 0.25rem; border-radius: 8px; background: #059669;">
                                    <i class="fas fa-file-pdf ml-2"></i>تصدير PDF
                                </button>
                            </div>
                        </div>` : '';

        container.innerHTML = `
            <div class="content-card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-user-search ml-2"></i>
                        ${headerTitle}
                    </h2>
                </div>
                <div class="card-body">
                    <div class="mb-4" style="display: flex; flex-wrap: wrap; align-items: flex-end; gap: 1.25rem 3rem;">
                        ${employeeBlock}
                        ${contractorBlock}
                    </div>
                    <div id="employee-report-content" class="hidden">
                        <div id="employee-report-data"></div>
                    </div>
                    <div id="contractor-report-content" class="hidden">
                        <div id="contractor-report-data"></div>
                    </div>
                </div>
            </div>
        `;

        if (canEmp) {
            const searchBtn = document.getElementById('search-employee-btn');
            const exportBtn = document.getElementById('export-employee-report-btn');
            const searchInput = document.getElementById('employee-code-search');

            if (searchBtn) {
                searchBtn.addEventListener('click', async () => {
                    const code = searchInput?.value.trim();
                    if (code) {
                        await this.generateEmployeeReport(code);
                    } else {
                        Notification.warning('يرجى إدخال الكود الوظيفي');
                    }
                });
            }

            if (searchInput) {
                searchInput.addEventListener('keypress', async (e) => {
                    if (e.key === 'Enter') {
                        const code = searchInput.value.trim();
                        if (code) {
                            await this.generateEmployeeReport(code);
                        }
                    }
                });
            }

            if (exportBtn) {
                exportBtn.addEventListener('click', () => {
                    const code = searchInput?.value.trim();
                    if (code) {
                        this.exportEmployeeReportPDF(code);
                    }
                });
            }
        }

        if (canCon) {
            const contractorSearchBtn = document.getElementById('search-contractor-btn');
            const contractorExportBtn = document.getElementById('export-contractor-report-btn');
            const contractorSearchInput = document.getElementById('contractor-code-search');

            if (contractorSearchBtn) {
                contractorSearchBtn.addEventListener('click', async () => {
                    const code = contractorSearchInput?.value.trim();
                    if (code) {
                        await this.generateContractorReport(code);
                    } else {
                        Notification.warning('يرجى إدخال كود المقاول أو اسم الشركة');
                    }
                });
            }

            if (contractorSearchInput) {
                contractorSearchInput.addEventListener('keypress', async (e) => {
                    if (e.key === 'Enter') {
                        const code = contractorSearchInput.value.trim();
                        if (code) {
                            await this.generateContractorReport(code);
                        }
                    }
                });
            }

            if (contractorExportBtn) {
                contractorExportBtn.addEventListener('click', () => {
                    const code = contractorSearchInput?.value.trim();
                    if (code) {
                        this.exportContractorReportPDF(code);
                    }
                });
            }
        }
    },

    /**
     * ضمان تحميل بيانات التقرير الشامل من الموديولات (إن لم تكن محمّلة) لظهور الأعداد في الكروت بدقة
     */
    async ensureEmployeeReportData() {
        if (!AppState.appData) AppState.appData = {};
        const ad = AppState.appData;
        const sheetToKey = {
            'Violations': 'violations',
            'Training': 'training',
            'TrainingAttendance': 'trainingAttendance',
            'ClinicVisits': 'clinicVisits',
            'PPE': 'ppe',
            'BehaviorMonitoring': 'behaviorMonitoring',
            'Incidents': 'incidents',
            'SickLeave': 'sickLeave'
        };
        const toLoad = [];
        for (const [sheetName, key] of Object.entries(sheetToKey)) {
            const current = ad[key];
            if (!Array.isArray(current) || current.length === 0) toLoad.push({ sheetName, key });
        }
        if (typeof Loading !== 'undefined' && Loading.show) Loading.show();
        try {
            for (const { sheetName, key } of toLoad) {
                try {
                    if (typeof Backend === 'undefined' || !Backend.readFromSheets) continue;
                    const data = await Backend.readFromSheets(sheetName);
                    if (Array.isArray(data)) {
                        AppState.appData[key] = data;
                        if (Utils.safeLog) Utils.safeLog(`✅ تقرير الموظف: تم تحميل ${sheetName} (${data.length} سجل)`);
                    }
                } catch (err) {
                    if (Utils.safeWarn) Utils.safeWarn(`⚠️ تقرير الموظف: فشل تحميل ${sheetName}:`, err?.message || err);
                }
            }
            if ((!ad.training || ad.training.length === 0) && typeof Backend !== 'undefined' && (Backend.sendToAppsScript || Backend.sendRequest)) {
                try {
                    const send = Backend.sendToAppsScript || ((opts) => Backend.sendRequest && Backend.sendRequest({ action: opts.action || opts.method, data: opts.data || {} }));
                    const trainingRes = await (Backend.sendToAppsScript ? Backend.sendToAppsScript('getAllTrainings', {}) : Promise.resolve(Backend.sendRequest({ action: 'getAllTrainings', data: {} })));
                    const trainingData = (trainingRes && (trainingRes.data || trainingRes.value)) && (Array.isArray(trainingRes.data) ? trainingRes.data : Array.isArray(trainingRes.value) ? trainingRes.value : Array.isArray((trainingRes.value || {}).data) ? (trainingRes.value || {}).data : null);
                    if (Array.isArray(trainingData) && trainingData.length > 0) {
                        AppState.appData.training = trainingData;
                        if (Utils.safeLog) Utils.safeLog('✅ تقرير الموظف: تم تحميل التدريب عبر getAllTrainings');
                    }
                } catch (e) {
                    if (Utils.safeWarn) Utils.safeWarn('⚠️ تقرير الموظف: فشل getAllTrainings:', e?.message || e);
                }
            }
            if ((!ad.trainingAttendance || ad.trainingAttendance.length === 0) && typeof Backend !== 'undefined' && Backend.sendRequest) {
                try {
                    const attRes = await Backend.sendRequest({ action: 'getAllTrainingAttendance', data: {} });
                    const attData = (attRes && attRes.value && Array.isArray(attRes.value.data) && attRes.value.data) ? attRes.value.data
                        : (attRes && Array.isArray(attRes.data) ? attRes.data : (Array.isArray(attRes && attRes.value) ? attRes.value : null));
                    if (Array.isArray(attData)) {
                        AppState.appData.trainingAttendance = attData;
                        if (Utils.safeLog) Utils.safeLog('✅ تقرير الموظف: تم تحميل سجل الحضور عبر getAllTrainingAttendance');
                    }
                } catch (e) {
                    if (Utils.safeWarn) Utils.safeWarn('⚠️ تقرير الموظف: فشل getAllTrainingAttendance:', e?.message || e);
                }
            }
            if (sheetToKey.PPE && (!ad.ppe || ad.ppe.length === 0) && typeof Backend !== 'undefined' && Backend.sendToAppsScript) {
                try {
                    const ppeResult = await Backend.sendToAppsScript('getAllPPE', {});
                    if (ppeResult && ppeResult.success && Array.isArray(ppeResult.data)) {
                        AppState.appData.ppe = ppeResult.data;
                        if (Utils.safeLog) Utils.safeLog('✅ تقرير الموظف: تم تحميل PPE عبر getAllPPE');
                    }
                } catch (e) {
                    if (Utils.safeWarn) Utils.safeWarn('⚠️ تقرير الموظف: فشل getAllPPE:', e?.message || e);
                }
            }
        } finally {
            if (typeof Loading !== 'undefined' && Loading.hide) Loading.hide();
        }
    },

    /**
     * توليد تقرير شامل للموظف
     */
    async generateEmployeeReport(employeeCode) {
        if (!AppState.appData) AppState.appData = {};
        const data = AppState.appData;
        const employees = Array.isArray(data.employees) ? data.employees : (Array.isArray(data.Employees) ? data.Employees : []);
        let employee = null;
        const searchCodeNorm = String(employeeCode || '').trim();

        const codeMatches = (emp, code) => {
            if (!code) return false;
            const c = String(code).trim();
            if (!c) return false;
            const a = String(emp.employeeNumber ?? '').trim();
            const b = String(emp.sapId ?? '').trim();
            const d = String(emp.employeeCode ?? '').trim();
            const e = String(emp.id ?? '').trim();
            const f = String(emp.code ?? '').trim();
            if (a === c || b === c || d === c || e === c || f === c) return true;
            if (a.toLowerCase() === c.toLowerCase() || b.toLowerCase() === c.toLowerCase()) return true;
            const numC = Number(c);
            if (!isNaN(numC) && isFinite(numC)) {
                if (Number(a) === numC || Number(b) === numC || Number(d) === numC || Number(e) === numC || Number(f) === numC) return true;
                if (String(Number(a)) === c || String(Number(b)) === c || a === String(numC) || b === String(numC)) return true;
            }
            return false;
        };

        // استعلام بالكود الوظيفي فقط: مطابقة دقيقة دون استخدام includes أو البحث بالاسم
        // (لتجنب ظهور بيانات موظف خاطئ عند تشابه جزئي في الكود أو الاسم)
        employee = employees.find(emp => codeMatches(emp, employeeCode));

        if (!employee) {
            Notification.error('لم يتم العثور على الموظف بهذا الكود');
            const contentContainer = document.getElementById('employee-report-content');
            if (contentContainer) contentContainer.classList.add('hidden');
            return;
        }

        // ✅ إصلاح: جمع جميع المعرفات الممكنة للموظف
        const normalizeValue = (val) => {
            if (!val) return null;
            const str = String(val).trim();
            return str ? str.toLowerCase() : null;
        };

        const employeeIdentifiers = new Set();
        [
            employee.id,
            employee.employeeNumber,
            employee.sapId,
            employee.employeeCode,
            employee.code,
            employee.cardId,
            employee.nationalId
        ].forEach(id => {
            if (id == null || id === '') return;
            const str = String(id).trim();
            if (!str) return;
            const normalized = normalizeValue(id);
            if (normalized) employeeIdentifiers.add(normalized);
            employeeIdentifiers.add(str);
            const num = Number(id);
            if (!isNaN(num) && isFinite(num)) employeeIdentifiers.add(String(num));
        });
        // إضافة كود البحث المُدخل لضمان ربط السجلات التي تحمل نفس الكود (مثل 0123 و 123)
        if (searchCodeNorm) {
            employeeIdentifiers.add(searchCodeNorm);
            employeeIdentifiers.add(searchCodeNorm.toLowerCase());
            const numSearch = Number(searchCodeNorm);
            if (!isNaN(numSearch) && isFinite(numSearch)) employeeIdentifiers.add(String(numSearch));
        }

        const matchesEmployeeIdentifier = (record) => {
            if (!record) return false;
            const recordIdentifiers = [
                record.employeeCode,
                record.employeeNumber,
                record.employeeId,
                record.id,
                record.code,
                record.sapId,
                record.cardId,
                record.nationalId,
                record.participantCode
            ];
            return recordIdentifiers.some(recordId => {
                if (recordId == null || recordId === '') return false;
                const original = String(recordId).trim();
                if (!original) return false;
                const normalized = normalizeValue(recordId);
                if (employeeIdentifiers.has(normalized) || employeeIdentifiers.has(original)) return true;
                const num = Number(recordId);
                if (!isNaN(num) && isFinite(num) && employeeIdentifiers.has(String(num))) return true;
                return false;
            });
        };

        const singleCodeMatchesEmployee = (code) => {
            if (code == null || code === '') return false;
            const s = String(code).trim();
            if (!s) return false;
            if (employeeIdentifiers.has(s) || employeeIdentifiers.has(normalizeValue(s))) return true;
            const n = Number(code);
            return !isNaN(n) && isFinite(n) && employeeIdentifiers.has(String(n));
        };

        // ضمان تحميل بيانات الموديولات قبل الفلترة لظهور الأعداد في الكروت بدقة
        await this.ensureEmployeeReportData();
        const dataForReport = AppState.appData || {};

        const getReportArray = (key, altKey) => {
            const arr = dataForReport[key] || dataForReport[altKey] || [];
            return Array.isArray(arr) ? arr : [];
        };

        // عرض السجلات المرتبطة بالموظف بالكود/المعرف فقط (بدون مطابقة بالاسم لتجنب بيانات خاطئة)
        const violations = getReportArray('violations').filter(v => {
            if (v.personType === 'contractor' || v.contractorName) return false;
            return matchesEmployeeIdentifier(v);
        });

        const sickLeave = getReportArray('sickLeave').filter(s => {
            if (s.personType === 'contractor' || s.contractorName) return false;
            return matchesEmployeeIdentifier(s);
        });

        const trainingList = getReportArray('training').concat(getReportArray('trainingRecords'));
        const trainingAttendanceList = getReportArray('trainingAttendance');
        const trainingFromAttendance = trainingAttendanceList.filter(att => matchesEmployeeIdentifier(att));
        const sessionHasEmployee = (t) => {
            if (!t || typeof t !== 'object') return false;
            const recAsRecord = { ...t, code: t.code || t.participantCode, employeeCode: t.employeeCode || t.participantCode, employeeNumber: t.employeeNumber || t.participantCode };
            if ((t.employeeCode != null && t.employeeCode !== '') || (t.employeeNumber != null && t.employeeNumber !== '') || (t.employeeId != null && t.employeeId !== '') || (t.participantCode != null && t.participantCode !== '')) {
                if (matchesEmployeeIdentifier(recAsRecord)) return true;
            }
            let participants = t.participants;
            if (typeof participants === 'string') {
                try {
                    const parsed = JSON.parse(participants);
                    participants = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.participants) ? parsed.participants : []);
                } catch (_) {
                    participants = [];
                }
            }
            if (participants && Array.isArray(participants)) {
                return participants.some(p => {
                    if (!p || typeof p !== 'object') return false;
                    if (p.personType === 'contractor' || p.type === 'contractor' || p.contractorName) return false;
                    return matchesEmployeeIdentifier(p);
                });
            }
            return false;
        };
        const trainingFromSessions = trainingList.filter(sessionHasEmployee);
        const training = [
            ...trainingFromSessions,
            ...trainingFromAttendance.map(att => ({
                id: att.id,
                name: att.topic || att.trainingType || 'تدريب',
                trainer: att.trainer || '',
                startDate: att.date || att.attendanceDate || att.createdAt,
                status: 'مكتمل'
            }))
        ];

        const ppe = getReportArray('ppe').filter(p => matchesEmployeeIdentifier(p));

        const behaviorMonitoring = getReportArray('behaviorMonitoring').filter(b => matchesEmployeeIdentifier(b));

        const clinicVisits = getReportArray('clinicVisits', 'Clinic').filter(c => {
            if (c.personType === 'contractor' || c.contractorName) return false;
            return matchesEmployeeIdentifier(c);
        });

        const incidents = getReportArray('incidents').filter(i => {
            if (i.personType === 'contractor' || i.contractorName) return false;
            if (matchesEmployeeIdentifier(i)) return true;
            if (i.affectedCode && singleCodeMatchesEmployee(i.affectedCode)) return true;
            if (i.entries && Array.isArray(i.entries)) {
                if (i.entries.some(e => matchesEmployeeIdentifier(e) || singleCodeMatchesEmployee(e?.affectedCode || e?.employeeCode))) return true;
            }
            return false;
        });

        const reportContainer = document.getElementById('employee-report-data');
        const contentContainer = document.getElementById('employee-report-content');
        const exportBtn = document.getElementById('export-employee-report-btn');
        const contractorContent = document.getElementById('contractor-report-content');
        if (contractorContent) contractorContent.classList.add('hidden');
        if (contentContainer) contentContainer.classList.add('hidden');
        if (!reportContainer) {
            Notification.error('عنصر عرض تقرير الموظف غير متوفر');
            return;
        }

        reportContainer.innerHTML = `
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-xl font-bold text-gray-800 mb-2">
                            <i class="fas fa-user ml-2"></i>
                            ${Utils.escapeHTML(employee.name || '')}
                        </h3>
                        <p class="text-gray-600">
                            <i class="fas fa-id-card ml-2"></i>
                            الكود الوظيفي: <strong>${Utils.escapeHTML(employee.employeeNumber || employee.sapId || employee.employeeCode || employeeCode)}</strong>
                        </p>
                        ${employee.department ? `<p class="text-gray-600 mt-1"><i class="fas fa-building ml-2"></i>القسم: ${Utils.escapeHTML(employee.department)}</p>` : ''}
                        ${employee.position ? `<p class="text-gray-600 mt-1"><i class="fas fa-briefcase ml-2"></i>المنصب: ${Utils.escapeHTML(employee.position)}</p>` : ''}
                    </div>
                    ${employee.photo ? (() => {
                        const disp = typeof Utils.resolveDriveAwareImgDisplay === 'function'
                            ? Utils.resolveDriveAwareImgDisplay(employee.photo)
                            : { canonical: String(employee.photo), displaySrc: String(employee.photo), needsProxy: false, proxyFileId: '' };
                        const pa = typeof Utils.driveProxyImgAttrs === 'function' ? Utils.driveProxyImgAttrs(disp) : '';
                        return `<img src="${Utils.escapeHTML(disp.displaySrc)}" alt="صورة الموظف"${pa} class="dash-emp-photo w-24 h-24 rounded-full object-cover border-2 border-blue-500">`;
                    })() : ''}
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                    <div class="text-3xl font-bold text-red-600 mb-2">${violations.length}</div>
                    <div class="text-sm text-gray-700 font-semibold">المخالفات</div>
                </div>
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                    <div class="text-3xl font-bold text-blue-600 mb-2">${sickLeave.length}</div>
                    <div class="text-sm text-gray-700 font-semibold">الإجازات المرضية</div>
                </div>
                <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <div class="text-3xl font-bold text-green-600 mb-2">${training.length}</div>
                    <div class="text-sm text-gray-700 font-semibold">برامج التدريب</div>
                </div>
                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                    <div class="text-3xl font-bold text-yellow-600 mb-2">${ppe.length}</div>
                    <div class="text-sm text-gray-700 font-semibold">مهمات الوقاية</div>
                </div>
                <div class="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
                    <div class="text-3xl font-bold text-purple-600 mb-2">${behaviorMonitoring.length}</div>
                    <div class="text-sm text-gray-700 font-semibold">مراقبة السلوكيات</div>
                </div>
                <div class="bg-pink-50 border border-pink-200 rounded-lg p-4 text-center">
                    <div class="text-3xl font-bold text-pink-600 mb-2">${clinicVisits.length}</div>
                    <div class="text-sm text-gray-700 font-semibold">التردد على العيادة</div>
                </div>
                <div class="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
                    <div class="text-3xl font-bold text-orange-600 mb-2">${incidents.length}</div>
                    <div class="text-sm text-gray-700 font-semibold">الحوادث</div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                ${violations.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-exclamation-circle ml-2"></i>المخالفات (${violations.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${violations.slice(0, 5).map(v => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">${Utils.escapeHTML(v.violationType || '')}</span>
                                            <span class="badge badge-${v.severity === 'عالية' ? 'danger' : 'warning'}">${v.severity || ''}</span>
                                        </div>
                                        <p class="text-sm text-gray-600">${Utils.escapeHTML((v.actionTaken || '').substring(0, 100))}</p>
                                        <p class="text-xs text-gray-500 mt-2">${v.violationDate ? Utils.formatDate(v.violationDate) : ''}</p>
                                    </div>
                                `).join('')}
                                ${violations.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${violations.length - 5} مخالفات أخرى...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}
                
                ${sickLeave.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-calendar-times ml-2"></i>الإجازات المرضية (${sickLeave.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${sickLeave.slice(0, 5).map(s => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">من ${s.startDate ? Utils.formatDate(s.startDate) : ''} إلى ${s.endDate ? Utils.formatDate(s.endDate) : ''}</span>
                                        </div>
                                        <p class="text-sm text-gray-600">${Utils.escapeHTML(s.reason || '')}</p>
                                        ${s.medicalNotes ? `<p class="text-xs text-gray-500 mt-2">${Utils.escapeHTML(s.medicalNotes)}</p>` : ''}
                                    </div>
                                `).join('')}
                                ${sickLeave.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${sickLeave.length - 5} إجازة أخرى...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}
                
                ${training.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-graduation-cap ml-2"></i>برامج التدريب (${training.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${training.slice(0, 5).map(t => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">${Utils.escapeHTML(t.name || '')}</span>
                                            <span class="badge badge-${t.status === 'مكتمل' ? 'success' : 'warning'}">${t.status || ''}</span>
                                        </div>
                                        <p class="text-sm text-gray-600">المدرب: ${Utils.escapeHTML(t.trainer || '')}</p>
                                        <p class="text-xs text-gray-500 mt-2">${t.startDate ? Utils.formatDate(t.startDate) : ''}</p>
                                    </div>
                                `).join('')}
                                ${training.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${training.length - 5} برنامج آخر...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}
                
                ${ppe.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-hard-hat ml-2"></i>مهمات الوقاية (${ppe.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${ppe.slice(0, 5).map(p => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">${Utils.escapeHTML(p.equipmentType || '')}</span>
                                            <span class="badge badge-success">${p.receiptNumber || p.id}</span>
                                        </div>
                                        <p class="text-sm text-gray-600">الكمية: ${p.quantity || 0}</p>
                                        <p class="text-xs text-gray-500 mt-2">تاريخ الاستلام: ${p.receiptDate ? Utils.formatDate(p.receiptDate) : ''}</p>
                                    </div>
                                `).join('')}
                                ${ppe.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${ppe.length - 5} استلام آخر...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}
                
                ${behaviorMonitoring.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-user-check ml-2"></i>مراقبة السلوكيات (${behaviorMonitoring.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${behaviorMonitoring.slice(0, 5).map(b => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">${Utils.escapeHTML(b.behaviorType || '')}</span>
                                            <span class="badge badge-${b.rating >= 4 ? 'success' : b.rating >= 3 ? 'warning' : 'danger'}">${b.rating || 0}/5</span>
                                        </div>
                                        <p class="text-sm text-gray-600">${Utils.escapeHTML((b.description || '').substring(0, 100))}</p>
                                        <p class="text-xs text-gray-500 mt-2">${b.date ? Utils.formatDate(b.date) : ''}</p>
                                    </div>
                                `).join('')}
                                ${behaviorMonitoring.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${behaviorMonitoring.length - 5} تسجيل آخر...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}
                
                ${clinicVisits.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-hospital ml-2"></i>التردد على العيادة (${clinicVisits.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${clinicVisits.slice(0, 5).map(c => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">${Utils.escapeHTML(c.reason || 'زيارة عادية')}</span>
                                        </div>
                                        ${c.diagnosis ? `<p class="text-sm text-gray-600">التشخيص: ${Utils.escapeHTML(c.diagnosis)}</p>` : ''}
                                        ${c.treatment ? `<p class="text-sm text-gray-600">العلاج: ${Utils.escapeHTML(c.treatment)}</p>` : ''}
                                        <p class="text-xs text-gray-500 mt-2">${c.visitDate ? Utils.formatDate(c.visitDate) : ''}</p>
                                    </div>
                                `).join('')}
                                ${clinicVisits.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${clinicVisits.length - 5} زيارة أخرى...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        contentContainer.classList.remove('hidden');
        if (exportBtn) exportBtn.disabled = false;

        if (typeof Utils.hydrateDriveProxyImages === 'function') {
            Utils.hydrateDriveProxyImages(reportContainer, {
                onFetchFail: (img) => {
                    try {
                        const ph = document.createElement('div');
                        ph.className = 'w-24 h-24 rounded-full bg-gray-200 border-2 border-blue-500 flex items-center justify-center';
                        ph.innerHTML = '<i class="fas fa-user text-gray-500 text-2xl"></i>';
                        img.replaceWith(ph);
                    } catch (e) { /* ignore */ }
                }
            });
        }

        // ✅ إصلاح: استخدام المعرف الأساسي للموظف (وليس مصطلح البحث)
        const primaryEmployeeCode = employee.employeeNumber || employee.sapId || employee.id || employee.employeeCode || employeeCode;

        // حفظ بيانات التقرير للتصدير
        window.currentEmployeeReport = {
            employee,
            employeeCode: primaryEmployeeCode, // ✅ استخدام المعرف الفعلي للموظف
            employeeIdentifiers: Array.from(employeeIdentifiers), // ✅ حفظ جميع المعرفات للتحقق
            violations,
            sickLeave,
            training: reportTraining,
            ppe,
            behaviorMonitoring,
            clinicVisits,
            incidents
        };
    },

    /**
     * تصدير تقرير الموظف كـ PDF
     */
    async exportEmployeeReportPDF(employeeCode) {
        if (!window.currentEmployeeReport || window.currentEmployeeReport.employeeCode !== employeeCode) {
            this.generateEmployeeReport(employeeCode);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        const report = window.currentEmployeeReport;
        if (!report) {
            Notification.error('لا توجد بيانات تقرير');
            return;
        }

        try {
            Loading.show();

            const formCode = `EMP-REPORT-${employeeCode}-${new Date().toISOString().slice(0, 10)}`;
            const formTitle = `تقرير شامل للموظ: ${report.employee.name || ''}`;

            let content = `
                <table style="margin-bottom: 30px;">
                    <tr><th>الاسم</th><td>${Utils.escapeHTML(report.employee.name || '')}</td></tr>
                    <tr><th>الكود الوظيفي</th><td>${Utils.escapeHTML(report.employee.employeeNumber || report.employee.sapId || report.employee.employeeCode || employeeCode)}</td></tr>
                    ${report.employee.department ? `<tr><th>القسم</th><td>${Utils.escapeHTML(report.employee.department)}</td></tr>` : ''}
                    ${report.employee.position ? `<tr><th>المنصب</th><td>${Utils.escapeHTML(report.employee.position)}</td></tr>` : ''}
                </table>
                
                <div class="section-title">ملخص الإحصائيات</div>
                <table>
                    <tr><th>المخالفات</th><td>${report.violations.length}</td></tr>
                    <tr><th>الإجازات المرضية</th><td>${report.sickLeave.length}</td></tr>
                    <tr><th>برامج التدريب</th><td>${report.training.length}</td></tr>
                    <tr><th>مهمات الوقاية</th><td>${report.ppe.length}</td></tr>
                    <tr><th>مراقبة السلوكيات</th><td>${report.behaviorMonitoring.length}</td></tr>
                    <tr><th>التردد على العيادة</th><td>${report.clinicVisits.length}</td></tr>
                    <tr><th>الحوادث</th><td>${report.incidents.length}</td></tr>
                </table>
            `;

            if (report.violations.length > 0) {
                content += `
                    <div class="section-title">المخالفات (${report.violations.length})</div>
                    <table>
                        <tr>
                            <th>النوع</th>
                            <th>التاريخ</th>
                            <th>الشدة</th>
                            <th>الإجراء المتخذ</th>
                            <th>الحالة</th>
                        </tr>
                        ${report.violations.map(v => `
                            <tr>
                                <td>${Utils.escapeHTML(v.violationType || '')}</td>
                                <td>${v.violationDate ? Utils.formatDate(v.violationDate) : ''}</td>
                                <td>${Utils.escapeHTML(v.severity || '')}</td>
                                <td>${Utils.escapeHTML(v.actionTaken || '')}</td>
                                <td>${Utils.escapeHTML(v.status || '')}</td>
                            </tr>
                        `).join('')}
                    </table>
                `;
            }

            if (report.sickLeave.length > 0) {
                content += `
                    <div class="section-title">الإجازات المرضية (${report.sickLeave.length})</div>
                    <table>
                        <tr>
                            <th>من تاريخ</th>
                            <th>إلى تاريخ</th>
                            <th>السبب</th>
                            <th>الملاحظات الطبية</th>
                        </tr>
                        ${report.sickLeave.map(s => `
                            <tr>
                                <td>${s.startDate ? Utils.formatDate(s.startDate) : ''}</td>
                                <td>${s.endDate ? Utils.formatDate(s.endDate) : ''}</td>
                                <td>${Utils.escapeHTML(s.reason || '')}</td>
                                <td>${Utils.escapeHTML(s.medicalNotes || '')}</td>
                            </tr>
                        `).join('')}
                    </table>
                `;
            }

            if (report.training.length > 0) {
                content += `
                    <div class="section-title">برامج التدريب (${report.training.length})</div>
                    <table>
                        <tr>
                            <th>اسم البرنامج</th>
                            <th>المدرب</th>
                            <th>تاريخ البدء</th>
                            <th>الحالة</th>
                        </tr>
                        ${report.training.map(t => `
                            <tr>
                                <td>${Utils.escapeHTML(t.name || '')}</td>
                                <td>${Utils.escapeHTML(t.trainer || '')}</td>
                                <td>${t.startDate ? Utils.formatDate(t.startDate) : ''}</td>
                                <td>${Utils.escapeHTML(t.status || '')}</td>
                            </tr>
                        `).join('')}
                    </table>
                `;
            }

            if (report.ppe.length > 0) {
                content += `
                    <div class="section-title">مهمات الوقاية (${report.ppe.length})</div>
                    <table>
                        <tr>
                            <th>رقم الإيصال</th>
                            <th>نوع المعدة</th>
                            <th>الكمية</th>
                            <th>تاريخ الاستلام</th>
                            <th>الحالة</th>
                        </tr>
                        ${report.ppe.map(p => `
                            <tr>
                                <td>${Utils.escapeHTML(p.receiptNumber || p.id || '')}</td>
                                <td>${Utils.escapeHTML(p.equipmentType || '')}</td>
                                <td>${p.quantity || 0}</td>
                                <td>${p.receiptDate ? Utils.formatDate(p.receiptDate) : ''}</td>
                                <td>${Utils.escapeHTML(p.status || '')}</td>
                            </tr>
                        `).join('')}
                    </table>
                `;
            }

            if (report.behaviorMonitoring.length > 0) {
                content += `
                    <div class="section-title">مراقبة السلوكيات (${report.behaviorMonitoring.length})</div>
                    <table>
                        <tr>
                            <th>نوع السلوك</th>
                            <th>التقييم</th>
                            <th>التاريخ</th>
                            <th>الوصف</th>
                        </tr>
                        ${report.behaviorMonitoring.map(b => `
                            <tr>
                                <td>${Utils.escapeHTML(b.behaviorType || '')}</td>
                                <td>${b.rating || 0}/5</td>
                                <td>${b.date ? Utils.formatDate(b.date) : ''}</td>
                                <td>${Utils.escapeHTML(b.description || '')}</td>
                            </tr>
                        `).join('')}
                    </table>
                `;
            }

            if (report.clinicVisits.length > 0) {
                content += `
                    <div class="section-title">التردد على العيادة (${report.clinicVisits.length})</div>
                    <table>
                        <tr>
                            <th>تاريخ الزيارة</th>
                            <th>السبب</th>
                            <th>التشخيص</th>
                            <th>العلاج</th>
                        </tr>
                        ${report.clinicVisits.map(c => `
                            <tr>
                                <td>${c.visitDate ? Utils.formatDate(c.visitDate) : ''}</td>
                                <td>${Utils.escapeHTML(c.reason || '')}</td>
                                <td>${Utils.escapeHTML(c.diagnosis || '')}</td>
                                <td>${Utils.escapeHTML(c.treatment || '')}</td>
                            </tr>
                        `).join('')}
                    </table>
                `;
            }

            const htmlContent = typeof FormHeader !== 'undefined' && FormHeader.generatePDFHTML
                ? FormHeader.generatePDFHTML(formCode, formTitle, content, false, true)
                : `<html><body>${content}</body></html>`;

            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const printWindow = window.open(url, '_blank');

            if (printWindow) {
                printWindow.onload = () => {
                    setTimeout(() => {
                        printWindow.print();
                        setTimeout(() => {
                            URL.revokeObjectURL(url);
                            Loading.hide();
                            Notification.success('تم تحضير التقرير للطباعة/الحفظ كـ PDF');
                        }, 1000);
                    }, 500);
                };
            } else {
                Loading.hide();
                Notification.error('يرجى السماح للنوافذ المنبثقة لعرض التقرير');
            }
        } catch (error) {
            Loading.hide();
            Utils.safeError('خطأ في تصدير PDF:', error);
            Notification.error('فشل تصدير PDF: ' + error.message);
        }
    },

    /**
     * توليد تقرير شامل للمقاول (البحث بكود المقاول أو اسم الشركة)
     */
    async generateContractorReport(contractorCode) {
        const data = AppState.appData;
        const approved = data.approvedContractors || [];
        const searchTerm = String(contractorCode).trim();
        const contractorSearch = typeof Utils !== 'undefined' && typeof Utils.findApprovedContractorByTerm === 'function'
            ? Utils.findApprovedContractorByTerm(searchTerm, approved)
            : { contractor: null, ambiguous: false, matches: [] };
        const contractor = contractorSearch.contractor;

        if (contractorSearch.ambiguous) {
            Notification.error('يوجد أكثر من مقاول مطابق. استخدم كود المقاول الكامل أو الاسم الكامل لتجنب أي خلط.');
            const contentContainer = document.getElementById('contractor-report-content');
            if (contentContainer) contentContainer.classList.add('hidden');
            return;
        }

        if (!contractor) {
            Notification.error('لم يتم العثور على المقاول بهذا الكود أو الاسم');
            const contentContainer = document.getElementById('contractor-report-content');
            if (contentContainer) contentContainer.classList.add('hidden');
            return;
        }

        let reportContractor = contractor;
        if (typeof Contractors !== 'undefined' && typeof Contractors.resolveContractorForAnalytics === 'function') {
            const mergedContractor = Contractors.resolveContractorForAnalytics(
                typeof Contractors.getPreferredContractorAnalyticsKey === 'function'
                    ? Contractors.getPreferredContractorAnalyticsKey(contractor, searchTerm)
                    : searchTerm,
                contractor.companyName || contractor.name || searchTerm
            );
            if (mergedContractor) {
                reportContractor = {
                    ...mergedContractor,
                    ...contractor,
                    aliasIds: Array.from(new Set([...(mergedContractor.aliasIds || []), ...(contractor.aliasIds || [])]))
                };
            }
        }
        if (typeof Contractors !== 'undefined' && typeof Contractors.prepareContractorForAnalytics === 'function') {
            reportContractor = Contractors.prepareContractorForAnalytics(reportContractor);
        }
        const contractorName = String(reportContractor.companyName || reportContractor.name || '').trim();
        const contractorLookupKey = typeof Contractors !== 'undefined' && typeof Contractors.getPreferredContractorAnalyticsKey === 'function'
            ? Contractors.getPreferredContractorAnalyticsKey(reportContractor, searchTerm)
            : (reportContractor.code || reportContractor.isoCode || reportContractor.contractorId || reportContractor.id || contractorCode);
        const contractorCodeVal = reportContractor.code || reportContractor.isoCode || contractorLookupKey || contractorCode;
        const contractorCtx = typeof Utils !== 'undefined' && typeof Utils.buildContractorIdentityMatcher === 'function'
            ? Utils.buildContractorIdentityMatcher(reportContractor, contractorLookupKey)
            : null;
        const matchesContractor = contractorCtx ? contractorCtx.matchesContractor : (() => false);
        const cacheKey = this.getContractorReportCacheKey(reportContractor, contractorLookupKey, searchTerm);
        const dataSignature = this.getContractorReportDataSignature();
        const requestKey = `${cacheKey}::${dataSignature}`;
        const cachedReport = this.contractorReportCache.get(cacheKey);
        if (cachedReport && cachedReport.__signature === dataSignature && (Date.now() - Number(cachedReport.__cachedAt || 0) < 60000)) {
            this.renderContractorReportFromData(cachedReport);
            return;
        }
        if (this.contractorReportRequests.has(requestKey)) {
            this.renderContractorReportLoading(reportContractor, contractorCodeVal);
            const inFlightReport = await this.contractorReportRequests.get(requestKey);
            if (inFlightReport) {
                this.renderContractorReportFromData(inFlightReport);
            }
            return;
        }

        let finalizeContractorReport = null;
        const contractorReportPromise = new Promise((resolve) => {
            finalizeContractorReport = resolve;
        });
        this.contractorReportRequests.set(requestKey, contractorReportPromise);
        this.renderContractorReportLoading(reportContractor, contractorCodeVal);
        let serverDetailedAnalytics = null;
        if (typeof Backend !== 'undefined' && Backend.sendRequest && Utils.hasCloudBackendSync()) {
            try {
                const analyticsRes = await Backend.sendRequest({
                    action: 'getContractorDetailedAnalytics',
                    data: { contractor: reportContractor, contractorId: contractorLookupKey }
                });
                if (analyticsRes && analyticsRes.success && analyticsRes.data) {
                    serverDetailedAnalytics = analyticsRes.data;
                }
            } catch (e) {
                if (typeof Utils !== 'undefined' && Utils.safeWarn) {
                    Utils.safeWarn('تعذر جلب تقرير المقاول من الخادم؛ سيتم استخدام البيانات المحلية:', e);
                }
            }
        }

        const dedupeContractorRecords = (records, primaryFields = [], fallbackFields = []) => {
            const unique = [];
            const primarySet = new Set();
            const fallbackSet = new Set();
            const list = Array.isArray(records) ? records : [];

            list.forEach((record) => {
                if (!record || typeof record !== 'object') return;
                const primaryKey = (Array.isArray(primaryFields) ? primaryFields : [])
                    .map((field) => String(record?.[field] || '').trim().toLowerCase())
                    .find(Boolean);
                if (primaryKey) {
                    if (primarySet.has(primaryKey)) return;
                    primarySet.add(primaryKey);
                    unique.push(record);
                    return;
                }
                const fallbackKey = (Array.isArray(fallbackFields) ? fallbackFields : [])
                    .map((field) => String(record?.[field] || '').trim().toLowerCase())
                    .join('|');
                if (!fallbackKey || fallbackSet.has(fallbackKey)) return;
                fallbackSet.add(fallbackKey);
                unique.push(record);
            });

            return unique;
        };

        const violationsRaw = Array.isArray(serverDetailedAnalytics?.violations)
            ? serverDetailedAnalytics.violations
            : (data.violations || []).filter(v => (v.personType === 'contractor' || v.contractorName) && matchesContractor(v));
        const violations = dedupeContractorRecords(
            violationsRaw,
            ['isoCode', 'id'],
            ['contractorId', 'contractorName', 'violationType', 'violationDate', 'violationTime']
        );
        const isContractorIncident = (i) => (i && (i.personType === 'contractor' || i.contractorName || i.affiliation === 'contractor' || (i.contractorId != null && i.contractorId !== '')));
        const incidents = Array.isArray(serverDetailedAnalytics?.incidents)
            ? serverDetailedAnalytics.incidents
            : (data.incidents || []).filter(i => isContractorIncident(i) && matchesContractor(i));
        const sickLeave = Array.isArray(serverDetailedAnalytics?.sickLeave)
            ? serverDetailedAnalytics.sickLeave
            : (data.sickLeave || []).filter(s => (s.personType === 'contractor' || s.contractorName) && matchesContractor(s));
        const rawClinicSources = (data.clinicVisits || []).concat(Array.isArray(data.clinicContractorVisits) ? data.clinicContractorVisits : []);
        const seenClinicIds = new Set();
        const clinicSources = rawClinicSources.filter(c => {
            if (!c) return false;
            const id = String(c.id || '').trim();
            if (!id) return true;
            if (seenClinicIds.has(id)) return false;
            seenClinicIds.add(id);
            return true;
        });
        const clinicVisits = Array.isArray(serverDetailedAnalytics?.clinicVisits)
            ? serverDetailedAnalytics.clinicVisits
            : clinicSources.filter(c => (c.personType === 'contractor' || c.personType === 'external' || c.contractorName) && matchesContractor(c));
        const contractorEvaluationRowsRaw = Array.isArray(serverDetailedAnalytics?.evaluations)
            ? serverDetailedAnalytics.evaluations
            : (data.contractorEvaluations || []).filter(e => matchesContractor(e));
        const contractorEvaluationRows = dedupeContractorRecords(
            contractorEvaluationRowsRaw,
            ['evaluationId', 'id', 'isoCode'],
            ['contractorId', 'contractorName', 'evaluationDate', 'projectName', 'finalScore']
        );
        const seenEvaluationIds = new Set();
        const contractorEvaluations = contractorEvaluationRows.filter(e => {
            const evaluationId = String(e?.evaluationId || e?.id || '').trim();
            if (!evaluationId) return true;
            if (seenEvaluationIds.has(evaluationId)) return false;
            seenEvaluationIds.add(evaluationId);
            return true;
        });

        // مصدران للتدريب: (1) data.training (برامج بمشاركين)، (2) data.contractorTrainings (سجل تدريب المقاولين)
        const contractorTrainingList = Array.isArray(data.training) ? data.training : [];
        const trainingFromMain = contractorTrainingList.filter(t => {
            if (!t) return false;
            if (t.contractorName || t.contractorId || t.contractorCode) {
                if (matchesContractor(t)) return true;
            }
            let participants = t.participants;
            if (typeof participants === 'string' && participants.trim()) {
                try { participants = JSON.parse(participants); } catch (e) { participants = null; }
            }
            if (participants && Array.isArray(participants)) {
                return participants.some(p => {
                    if (!p) return false;
                    const isContractor = p.personType === 'contractor' || p.type === 'contractor' || p.contractorName || p.companyName || p.company || p.contractorCompany;
                    return isContractor && matchesContractor(p);
                });
            }
            return false;
        });
        const contractorTrainingsList = Array.isArray(data.contractorTrainings) ? data.contractorTrainings : [];
        const trainingFromContractorTrainings = contractorTrainingsList.filter(ct => {
            if (!ct) return false;
            if (matchesContractor(ct)) return true;
            const name = String(ct.contractorName || ct.companyName || '').replace(/\s+/g, ' ').trim();
            return contractorCtx ? !contractorCtx.hasAnyRecordIds(ct) && contractorCtx.matchesNameValue(name) : false;
        });
        const seenTrainingIds = new Set();
        let training = [...trainingFromMain];
        trainingFromContractorTrainings.forEach(ct => {
            const tid = ct.id || (ct.date + (ct.topic || ct.trainingName || ''));
            if (tid && seenTrainingIds.has(tid)) return;
            if (tid) seenTrainingIds.add(tid);
            training.push({
                id: ct.id,
                name: ct.topic || ct.trainingName || ct.name || 'تدريب مقاول',
                trainer: ct.trainer || '',
                startDate: ct.date || ct.createdAt,
                status: ct.status || 'منفذ'
            });
        });

        const ptwAll = this.getUnifiedPTWDataset(data);
        const matchesPtwContractor = (p) => {
            if (!p) return false;
            if (matchesContractor(p)) return true;
            if (contractorCtx && contractorCtx.hasAnyRecordIds(p)) return false;
            const req = String(p.requestingParty || '').replace(/\s+/g, ' ').trim();
            const auth = String(p.authorizedParty || '').replace(/\s+/g, ' ').trim();
            const resp = String(p.responsible || '').replace(/\s+/g, ' ').trim();
            return contractorCtx ? contractorCtx.matchFieldsByName([req, auth, resp]) : false;
        };
        let ptwContractor = ptwAll.filter(matchesPtwContractor);
        let ptwOpen = ptwContractor.filter(p => !this.isPTWClosedStatus(p?.status)).length;
        let ptwClosed = ptwContractor.filter(p => this.isPTWClosedStatus(p?.status)).length;

        const injuriesAll = data.injuries || [];
        let injuriesContractor = injuriesAll.filter(inj => {
            if (!inj) return false;
            const pType = (inj.personType || '').toString().toLowerCase();
            if (pType !== 'contractor') return false;
            if (matchesContractor(inj)) return true;
            const name = String(inj.personName || inj.employeeName || inj.contractorName || '').trim();
            return contractorCtx ? !contractorCtx.hasAnyRecordIds(inj) && contractorCtx.matchesNameValue(name) : false;
        });
        if (Array.isArray(serverDetailedAnalytics?.trainings)) {
            training = serverDetailedAnalytics.trainings;
        }
        if (Array.isArray(serverDetailedAnalytics?.ptw)) {
            ptwContractor = serverDetailedAnalytics.ptw;
        }
        if (typeof serverDetailedAnalytics?.ptwOpenCount === 'number') {
            ptwOpen = serverDetailedAnalytics.ptwOpenCount;
        }
        if (typeof serverDetailedAnalytics?.ptwClosedCount === 'number') {
            ptwClosed = serverDetailedAnalytics.ptwClosedCount;
        }
        if (Array.isArray(serverDetailedAnalytics?.injuries)) {
            injuriesContractor = serverDetailedAnalytics.injuries;
        }
        const reportTraining = Array.isArray(serverDetailedAnalytics?.trainings)
            ? serverDetailedAnalytics.trainings
            : training;
        const reportPtwContractor = Array.isArray(serverDetailedAnalytics?.ptw)
            ? serverDetailedAnalytics.ptw
            : ptwContractor;
        const reportPtwOpen = typeof serverDetailedAnalytics?.ptwOpenCount === 'number'
            ? serverDetailedAnalytics.ptwOpenCount
            : ptwOpen;
        const reportPtwClosed = typeof serverDetailedAnalytics?.ptwClosedCount === 'number'
            ? serverDetailedAnalytics.ptwClosedCount
            : ptwClosed;
        const reportInjuriesContractor = Array.isArray(serverDetailedAnalytics?.injuries)
            ? serverDetailedAnalytics.injuries
            : injuriesContractor;

        const reportContainer = document.getElementById('contractor-report-data');
        const contentContainer = document.getElementById('contractor-report-content');
        const exportBtnEl = document.getElementById('export-contractor-report-btn');
        const employeeContent = document.getElementById('employee-report-content');
        if (employeeContent) employeeContent.classList.add('hidden');
        if (contentContainer) contentContainer.classList.add('hidden');
        if (!reportContainer) {
            Notification.error('عنصر عرض تقرير المقاول غير متوفر');
            return;
        }

        const approvalDateStr = reportContractor.approvalDate ? Utils.formatDate(reportContractor.approvalDate) : '';
        const expiryDateStr = reportContractor.expiryDate ? Utils.formatDate(reportContractor.expiryDate) : '';

        reportContainer.innerHTML = `
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-xl font-bold text-gray-800 mb-2">
                            <i class="fas fa-hard-hat ml-2"></i>
                            ${Utils.escapeHTML(contractorName || 'مقاول')}
                        </h3>
                        <p class="text-gray-600">
                            <i class="fas fa-barcode ml-2"></i>
                            كود المقاول: <strong>${Utils.escapeHTML(String(contractorCodeVal))}</strong>
                        </p>
                        ${reportContractor.entityType ? `<p class="text-gray-600 mt-1"><i class="fas fa-tag ml-2"></i>نوع الكيان: ${Utils.escapeHTML(reportContractor.entityType)}</p>` : ''}
                        ${reportContractor.serviceType ? `<p class="text-gray-600 mt-1"><i class="fas fa-tools ml-2"></i>نوع الخدمة: ${Utils.escapeHTML(reportContractor.serviceType)}</p>` : ''}
                        ${approvalDateStr ? `<p class="text-gray-600 mt-1"><i class="fas fa-calendar-check ml-2"></i>تاريخ الاعتماد: ${approvalDateStr}</p>` : ''}
                        ${expiryDateStr ? `<p class="text-gray-600 mt-1"><i class="fas fa-calendar-times ml-2"></i>تاريخ الانتهاء: ${expiryDateStr}</p>` : ''}
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="dashboard-stat-card" style="background: linear-gradient(145deg, #ccfbf1 0%, #99f6e4 100%); border: 1px solid #2dd4bf; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: 0 2px 6px rgba(13, 148, 136, 0.15);">
                    <div style="font-size: 1.5rem; font-weight: 700; color: #0d9488; margin-bottom: 0.25rem;">${reportPtwOpen}</div>
                    <div style="font-size: 0.75rem; color: #115e59; margin-bottom: 0.5rem;">مفتوح</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #0f766e; margin-bottom: 0.25rem;">${reportPtwClosed}</div>
                    <div style="font-size: 0.75rem; color: #115e59; margin-bottom: 0.5rem;">مغلق</div>
                    <div style="font-size: 1.125rem; font-weight: 700; color: #134e4a; border-top: 1px solid #2dd4bf; padding-top: 0.5rem; margin-top: 0.5rem;">${reportPtwContractor.length}</div>
                    <div style="font-size: 0.8125rem; font-weight: 600; color: #134e4a;">التصاريح (الإجمالي)</div>
                </div>
                <div class="dashboard-stat-card" style="background: linear-gradient(145deg, #ffedd5 0%, #fed7aa 100%); border: 1px solid #fb923c; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: 0 2px 6px rgba(234, 88, 12, 0.15);">
                    <div style="font-size: 1.5rem; font-weight: 700; color: #ea580c; margin-bottom: 0.25rem;">${incidents.length}</div>
                    <div style="font-size: 0.75rem; color: #9a3412; margin-bottom: 0.5rem;">حوادث</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #c2410c; margin-bottom: 0.25rem;">${reportInjuriesContractor.length}</div>
                    <div style="font-size: 0.75rem; color: #9a3412; margin-bottom: 0.5rem;">إصابات</div>
                    <div style="font-size: 0.8125rem; font-weight: 600; color: #9a3412;">الحوادث والإصابات</div>
                </div>
                <div class="dashboard-stat-card" style="background: linear-gradient(145deg, #fee2e2 0%, #fecaca 100%); border: 1px solid #f87171; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: 0 2px 6px rgba(220, 38, 38, 0.15);">
                    <div style="font-size: 1.875rem; font-weight: 700; color: #dc2626; margin-bottom: 0.25rem;">${violations.length}</div>
                    <div style="font-size: 0.8125rem; font-weight: 600; color: #991b1b;">المخالفات</div>
                </div>
                <div class="dashboard-stat-card" style="background: linear-gradient(145deg, #dbeafe 0%, #bfdbfe 100%); border: 1px solid #60a5fa; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.15);">
                    <div style="font-size: 1.875rem; font-weight: 700; color: #2563eb; margin-bottom: 0.25rem;">${sickLeave.length}</div>
                    <div style="font-size: 0.8125rem; font-weight: 600; color: #1e40af;">الإجازات المرضية</div>
                </div>
                <div class="dashboard-stat-card" style="background: linear-gradient(145deg, #d1fae5 0%, #a7f3d0 100%); border: 1px solid #34d399; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: 0 2px 6px rgba(5, 150, 105, 0.15);">
                    <div style="font-size: 1.875rem; font-weight: 700; color: #059669; margin-bottom: 0.25rem;">${reportTraining.length}</div>
                    <div style="font-size: 0.8125rem; font-weight: 600; color: #065f46;">برامج التدريب</div>
                </div>
                <div class="dashboard-stat-card" style="background: linear-gradient(145deg, #fce7f3 0%, #fbcfe8 100%); border: 1px solid #f472b6; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: 0 2px 6px rgba(219, 39, 119, 0.15);">
                    <div style="font-size: 1.875rem; font-weight: 700; color: #db2777; margin-bottom: 0.25rem;">${clinicVisits.length}</div>
                    <div style="font-size: 0.8125rem; font-weight: 600; color: #9d174d;">التردد على العيادة</div>
                </div>
                <div class="dashboard-stat-card" style="background: linear-gradient(145deg, #e0e7ff 0%, #c7d2fe 100%); border: 1px solid #818cf8; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: 0 2px 6px rgba(99, 102, 241, 0.15);">
                    <div style="font-size: 1.875rem; font-weight: 700; color: #4f46e5; margin-bottom: 0.25rem;">${contractorEvaluations.length}</div>
                    <div style="font-size: 0.8125rem; font-weight: 600; color: #3730a3;">التقييمات</div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                ${violations.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-exclamation-circle ml-2"></i>المخالفات (${violations.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${violations.slice(0, 5).map(v => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">${Utils.escapeHTML(v.violationType || '')}</span>
                                            <span class="badge badge-${v.severity === 'عالية' ? 'danger' : 'warning'}">${v.severity || ''}</span>
                                        </div>
                                        <p class="text-sm text-gray-600">${Utils.escapeHTML((v.actionTaken || '').substring(0, 100))}</p>
                                        <p class="text-xs text-gray-500 mt-2">${v.violationDate ? Utils.formatDate(v.violationDate) : ''}</p>
                                    </div>
                                `).join('')}
                                ${violations.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${violations.length - 5} مخالفات أخرى...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${incidents.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-exclamation-triangle ml-2"></i>الحوادث (${incidents.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${incidents.slice(0, 5).map(i => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">${Utils.escapeHTML(String(i.title || i.description || '').substring(0, 60))}</span>
                                            <span class="badge badge-warning">${i.severity || ''}</span>
                                        </div>
                                        <p class="text-xs text-gray-500 mt-2">${i.date ? Utils.formatDate(i.date) : ''}</p>
                                    </div>
                                `).join('')}
                                ${incidents.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${incidents.length - 5} حادث آخر...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${sickLeave.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-calendar-times ml-2"></i>الإجازات المرضية (${sickLeave.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${sickLeave.slice(0, 5).map(s => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">من ${s.startDate ? Utils.formatDate(s.startDate) : ''} إلى ${s.endDate ? Utils.formatDate(s.endDate) : ''}</span>
                                        </div>
                                        <p class="text-sm text-gray-600">${Utils.escapeHTML(s.reason || '')}</p>
                                    </div>
                                `).join('')}
                                ${sickLeave.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${sickLeave.length - 5} إجازة أخرى...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${training.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-graduation-cap ml-2"></i>برامج التدريب (${training.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${training.slice(0, 5).map(t => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">${Utils.escapeHTML(t.name || '')}</span>
                                            <span class="badge badge-success">${t.status || ''}</span>
                                        </div>
                                        <p class="text-sm text-gray-600">المدرب: ${Utils.escapeHTML(t.trainer || '')}</p>
                                        <p class="text-xs text-gray-500 mt-2">${t.startDate ? Utils.formatDate(t.startDate) : ''}</p>
                                    </div>
                                `).join('')}
                                ${training.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${training.length - 5} برنامج آخر...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${clinicVisits.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-hospital ml-2"></i>التردد على العيادة (${clinicVisits.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${clinicVisits.slice(0, 5).map(c => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">${Utils.escapeHTML(c.reason || 'زيارة عادية')}</span>
                                        </div>
                                        ${c.diagnosis ? `<p class="text-sm text-gray-600">التشخيص: ${Utils.escapeHTML(c.diagnosis)}</p>` : ''}
                                        <p class="text-xs text-gray-500 mt-2">${c.visitDate ? Utils.formatDate(c.visitDate) : ''}</p>
                                    </div>
                                `).join('')}
                                ${clinicVisits.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${clinicVisits.length - 5} زيارة أخرى...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${contractorEvaluations.length > 0 ? `
                    <div class="content-card">
                        <div class="card-header">
                            <h3 class="card-title"><i class="fas fa-clipboard-check ml-2"></i>التقييمات (${contractorEvaluations.length})</h3>
                        </div>
                        <div class="card-body">
                            <div class="space-y-3">
                                ${contractorEvaluations.slice(0, 5).map(e => `
                                    <div class="border rounded p-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-semibold">${Utils.escapeHTML(e.projectName || 'تقييم')}</span>
                                            <span class="badge badge-info">${e.finalScore != null ? e.finalScore : ''} ${e.finalRating || ''}</span>
                                        </div>
                                        <p class="text-sm text-gray-600">المقيّم: ${Utils.escapeHTML(e.evaluatorName || '')}</p>
                                        <p class="text-xs text-gray-500 mt-2">${e.evaluationDate ? Utils.formatDate(e.evaluationDate) : ''}</p>
                                    </div>
                                `).join('')}
                                ${contractorEvaluations.length > 5 ? `<p class="text-sm text-gray-500 text-center mt-2">و ${contractorEvaluations.length - 5} تقييم آخر...</p>` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        contentContainer.classList.remove('hidden');
        if (exportBtnEl) exportBtnEl.disabled = false;

        const finalizedReport = {
            __cacheKey: cacheKey,
            __signature: dataSignature,
            __cachedAt: Date.now(),
            contractor: reportContractor,
            contractorCode: contractorCodeVal,
            contractorName,
            violations,
            incidents,
            sickLeave,
            training: reportTraining,
            clinicVisits,
            contractorEvaluations,
            ptwContractor: reportPtwContractor,
            ptwOpen: reportPtwOpen,
            ptwClosed: reportPtwClosed,
            injuriesContractor: reportInjuriesContractor
        };
        window.currentContractorReport = finalizedReport;
        this.contractorReportCache.set(cacheKey, finalizedReport);
        this.contractorReportRequests.delete(requestKey);
        if (typeof finalizeContractorReport === 'function') {
            finalizeContractorReport(finalizedReport);
        }
    },

    /**
     * تصدير تقرير المقاول كـ PDF
     */
    async exportContractorReportPDF(contractorCode) {
        const codeTrimmed = String(contractorCode).trim();
        const existing = window.currentContractorReport;
        const sameContractor = existing && (existing.contractorCode === codeTrimmed || (existing.contractorName && String(existing.contractorName).trim() === codeTrimmed));
        if (!existing || !sameContractor) {
            await this.generateContractorReport(codeTrimmed);
        }

        const report = window.currentContractorReport;
        if (!report) {
            Notification.error('لا توجد بيانات تقرير للمقاول');
            return;
        }

        try {
            Loading.show();

            const formCode = `CON-REPORT-${report.contractorCode}-${new Date().toISOString().slice(0, 10)}`;
            const formTitle = `تقرير شامل للمقاول: ${report.contractorName || ''}`;

            let content = `
                <table style="margin-bottom: 30px;">
                    <tr><th>اسم المقاول</th><td>${Utils.escapeHTML(report.contractorName || '')}</td></tr>
                    <tr><th>كود المقاول</th><td>${Utils.escapeHTML(report.contractorCode || '')}</td></tr>
                    ${report.contractor.entityType ? `<tr><th>نوع الكيان</th><td>${Utils.escapeHTML(report.contractor.entityType)}</td></tr>` : ''}
                    ${report.contractor.serviceType ? `<tr><th>نوع الخدمة</th><td>${Utils.escapeHTML(report.contractor.serviceType)}</td></tr>` : ''}
                </table>

                <div class="section-title">ملخص الإحصائيات</div>
                <table>
                    <tr><th>التصاريح (مفتوح)</th><td>${report.ptwOpen != null ? report.ptwOpen : 0}</td></tr>
                    <tr><th>التصاريح (مغلق)</th><td>${report.ptwClosed != null ? report.ptwClosed : 0}</td></tr>
                    <tr><th>التصاريح (الإجمالي)</th><td>${(report.ptwContractor && report.ptwContractor.length) || 0}</td></tr>
                    <tr><th>الحوادث</th><td>${report.incidents.length}</td></tr>
                    <tr><th>الإصابات</th><td>${(report.injuriesContractor && report.injuriesContractor.length) || 0}</td></tr>
                    <tr><th>المخالفات</th><td>${report.violations.length}</td></tr>
                    <tr><th>الإجازات المرضية</th><td>${report.sickLeave.length}</td></tr>
                    <tr><th>برامج التدريب</th><td>${report.training.length}</td></tr>
                    <tr><th>التردد على العيادة</th><td>${report.clinicVisits.length}</td></tr>
                    <tr><th>التقييمات</th><td>${report.contractorEvaluations.length}</td></tr>
                </table>
            `;

            if (report.violations.length > 0) {
                content += `
                    <div class="section-title">المخالفات (${report.violations.length})</div>
                    <table>
                        <tr><th>النوع</th><th>التاريخ</th><th>الشدة</th><th>الإجراء المتخذ</th><th>الحالة</th></tr>
                        ${report.violations.map(v => `
                            <tr>
                                <td>${Utils.escapeHTML(v.violationType || '')}</td>
                                <td>${v.violationDate ? Utils.formatDate(v.violationDate) : ''}</td>
                                <td>${Utils.escapeHTML(v.severity || '')}</td>
                                <td>${Utils.escapeHTML(v.actionTaken || '')}</td>
                                <td>${Utils.escapeHTML(v.status || '')}</td>
                            </tr>
                        `).join('')}
                    </table>
                `;
            }

            if (report.incidents.length > 0) {
                content += `
                    <div class="section-title">الحوادث (${report.incidents.length})</div>
                    <table>
                        <tr><th>التاريخ</th><th>العنوان/الوصف</th><th>الشدة</th></tr>
                        ${report.incidents.map(i => `
                            <tr>
                                <td>${i.date ? Utils.formatDate(i.date) : ''}</td>
                                <td>${Utils.escapeHTML(String(i.title || i.description || '').substring(0, 100))}</td>
                                <td>${Utils.escapeHTML(i.severity || '')}</td>
                            </tr>
                        `).join('')}
                    </table>
                `;
            }

            if (report.sickLeave.length > 0) {
                content += `
                    <div class="section-title">الإجازات المرضية (${report.sickLeave.length})</div>
                    <table>
                        <tr><th>من تاريخ</th><th>إلى تاريخ</th><th>السبب</th></tr>
                        ${report.sickLeave.map(s => `
                            <tr>
                                <td>${s.startDate ? Utils.formatDate(s.startDate) : ''}</td>
                                <td>${s.endDate ? Utils.formatDate(s.endDate) : ''}</td>
                                <td>${Utils.escapeHTML(s.reason || '')}</td>
                            </tr>
                        `).join('')}
                    </table>
                `;
            }

            if (report.training.length > 0) {
                content += `
                    <div class="section-title">برامج التدريب (${report.training.length})</div>
                    <table>
                        <tr><th>اسم البرنامج</th><th>المدرب</th><th>تاريخ البدء</th><th>الحالة</th></tr>
                        ${report.training.map(t => `
                            <tr>
                                <td>${Utils.escapeHTML(t.name || '')}</td>
                                <td>${Utils.escapeHTML(t.trainer || '')}</td>
                                <td>${t.startDate ? Utils.formatDate(t.startDate) : ''}</td>
                                <td>${Utils.escapeHTML(t.status || '')}</td>
                            </tr>
                        `).join('')}
                    </table>
                `;
            }

            if (report.clinicVisits.length > 0) {
                content += `
                    <div class="section-title">التردد على العيادة (${report.clinicVisits.length})</div>
                    <table>
                        <tr><th>تاريخ الزيارة</th><th>السبب</th><th>التشخيص</th><th>العلاج</th></tr>
                        ${report.clinicVisits.map(c => `
                            <tr>
                                <td>${c.visitDate ? Utils.formatDate(c.visitDate) : ''}</td>
                                <td>${Utils.escapeHTML(c.reason || '')}</td>
                                <td>${Utils.escapeHTML(c.diagnosis || '')}</td>
                                <td>${Utils.escapeHTML(c.treatment || '')}</td>
                            </tr>
                        `).join('')}
                    </table>
                `;
            }

            if (report.contractorEvaluations.length > 0) {
                content += `
                    <div class="section-title">التقييمات (${report.contractorEvaluations.length})</div>
                    <table>
                        <tr><th>المشروع</th><th>المقيّم</th><th>التاريخ</th><th>الدرجة/التقييم</th></tr>
                        ${report.contractorEvaluations.map(e => `
                            <tr>
                                <td>${Utils.escapeHTML(e.projectName || '')}</td>
                                <td>${Utils.escapeHTML(e.evaluatorName || '')}</td>
                                <td>${e.evaluationDate ? Utils.formatDate(e.evaluationDate) : ''}</td>
                                <td>${e.finalScore != null ? e.finalScore : ''} ${Utils.escapeHTML(e.finalRating || '')}</td>
                            </tr>
                        `).join('')}
                    </table>
                `;
            }

            const htmlContent = typeof FormHeader !== 'undefined' && FormHeader.generatePDFHTML
                ? FormHeader.generatePDFHTML(formCode, formTitle, content, false, true)
                : `<html><body>${content}</body></html>`;

            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const printWindow = window.open(url, '_blank');

            if (printWindow) {
                printWindow.onload = () => {
                    setTimeout(() => {
                        printWindow.print();
                        setTimeout(() => {
                            URL.revokeObjectURL(url);
                            Loading.hide();
                            Notification.success('تم تحضير التقرير للطباعة/الحفظ كـ PDF');
                        }, 1000);
                    }, 500);
                };
            } else {
                Loading.hide();
                Notification.error('يرجى السماح للنوافذ المنبثقة لعرض التقرير');
            }
        } catch (error) {
            Loading.hide();
            Utils.safeError('خطأ في تصدير تقرير المقاول PDF:', error);
            Notification.error('فشل تصدير PDF: ' + (error && error.message ? error.message : String(error)));
        }
    },

    /**
     * تصنيف سجل حادث لعرض التفصيل في كارت إجمالي الحوادث: حالية / سابقة / بدون سنة صالحة (مثل 0000).
     */
    _classifyIncidentYearForDashboard(record, currentYear) {
        if (!record || typeof record !== 'object') return 'unknown';
        const rawYear = record.year != null ? record.year : record.incidentYear;
        const hasExplicitYear = rawYear !== undefined && rawYear !== null && String(rawYear).trim() !== '';
        if (hasExplicitYear) {
            const ys = String(rawYear).trim();
            if (/^0+$/.test(ys)) return 'unknown';
            const yn = parseInt(ys, 10);
            if (!Number.isFinite(yn) || yn <= 0) return 'unknown';
            if (yn > currentYear + 5) return 'unknown';
            if (yn === currentYear) return 'current';
            return 'prior';
        }
        const d = record.incidentDate || record.date || record.createdAt;
        if (!d) return 'unknown';
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return 'unknown';
        const gy = dt.getFullYear();
        if (gy <= 0 || gy < 1900 || gy > currentYear + 5) return 'unknown';
        if (gy > currentYear) return 'unknown';
        if (gy === currentYear) return 'current';
        return 'prior';
    },

    /**
     * هل يُضمَّن تقدير عمالة المقاولين (من حقول رقمية في سجل المقاول المعتمد) في إجمالي الساعات وTIR؟
     */
    workHoursIncludeContractors() {
        const v = typeof localStorage !== 'undefined' ? localStorage.getItem('hse_work_hours_include_contractors') : null;
        if (v === null || String(v).trim() === '') return true;
        return v !== '0' && String(v).toLowerCase() !== 'false' && String(v).toLowerCase() !== 'no';
    },

    /**
     * إجمالي ساعات العمل المعروض في لوحة التحكم ومؤشرات FA/TRIR:
     * أولوية لـ localStorage `hse_total_work_hours` إن وُجد ورقمًا صالحًا؛ وإلا تقدير من الموظفين النشطين (+ عمالة مقاولين عند التفعيل والبيانات).
     */
    getDashboardTotalWorkHours(appData) {
        const rawSaved = typeof localStorage !== 'undefined' ? localStorage.getItem('hse_total_work_hours') : null;
        if (rawSaved != null && String(rawSaved).trim() !== '') {
            const parsed = parseFloat(String(rawSaved).replace(/,/g, ''));
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
        const data = appData && typeof appData === 'object' ? appData : {};
        const employees = Array.isArray(data.employees) ? data.employees : [];
        const contractors = Array.isArray(data.approvedContractors) ? data.approvedContractors : [];
        return this._computeEstimatedAnnualWorkHoursTotal(employees, contractors);
    },

    _isLostTimeRecord(record = {}) {
        const spk = (typeof SafetyPerformanceKPIs !== 'undefined' && SafetyPerformanceKPIs) ? SafetyPerformanceKPIs : null;
        if (spk && typeof spk.isLostTimeIncident === 'function') {
            return spk.isLostTimeIncident(record);
        }
        const lostDays = parseFloat(
            record.lostDays || record.daysLost || record.lostTimeDays || record.timeOffWork || record.totalLeaveDays || 0
        ) || 0;
        return lostDays > 0 || record.lostTime === true ||
            record.severity === 'عالية' || record.severity === 'حرجة' ||
            record.severity === 'high' || record.severity === 'critical';
    },

    _getLastLtiDate(appData) {
        const data = appData && typeof appData === 'object' ? appData : {};
        const registry = Array.isArray(data.incidentsRegistry) ? data.incidentsRegistry : [];
        const incidents = Array.isArray(data.incidents) ? data.incidents : [];
        const ltiRecords = registry.length > 0
            ? registry.filter((r) => r && this._isLostTimeRecord(r))
            : incidents.filter((i) => i && this._isLostTimeRecord(i));

        if (!ltiRecords.length) return null;

        const sorted = ltiRecords
            .map((r) => new Date(r.incidentDate || r.date || r.createdAt))
            .filter((d) => !isNaN(d.getTime()))
            .sort((a, b) => b - a);

        return sorted.length ? sorted[0] : null;
    },

    /**
     * ساعات العمل الآمنة YTD: تراكم ساعات ModMetrics من الشهر التالي لآخر LTI حتى الشهر الحالي.
     * إن لم يُسجَّل LTI في العام = إجمالي ساعات YTD.
     */
    getSafeWorkHours(appData) {
        const year = new Date().getFullYear();
        const spk = (typeof SafetyPerformanceKPIs !== 'undefined' && SafetyPerformanceKPIs)
            ? SafetyPerformanceKPIs
            : null;

        if (spk && typeof spk.buildScorecardData === 'function' && typeof spk.sumYtd === 'function') {
            const model = spk.buildScorecardData(year);
            const limit = model.ytdLimit;
            const hours = model.rows.hoursWorked;
            const lti = model.rows.lti;

            let lastLtiMonth = -1;
            for (let m = limit; m >= 0; m -= 1) {
                if ((parseFloat(lti[m]) || 0) > 0) {
                    lastLtiMonth = m;
                    break;
                }
            }

            if (lastLtiMonth < 0) {
                return spk.sumYtd(hours, limit);
            }

            let safeHours = 0;
            for (let m = lastLtiMonth + 1; m <= limit; m += 1) {
                safeHours += parseFloat(hours[m] || 0) || 0;
            }
            return safeHours;
        }

        const totalHours = this.getDashboardTotalWorkHours(appData);
        const lastLtiDate = this._getLastLtiDate(appData);
        if (!lastLtiDate) return totalHours;

        const yearStart = new Date(year, 0, 1);
        yearStart.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        lastLtiDate.setHours(0, 0, 0, 0);

        const daysElapsedYtd = Math.max(1, Math.floor((today - yearStart) / 86400000) + 1);
        const start = lastLtiDate > yearStart ? lastLtiDate : yearStart;
        const daysSinceLti = Math.max(0, Math.floor((today - start) / 86400000));
        return Math.round(totalHours * Math.min(1, daysSinceLti / daysElapsedYtd));
    },

    _parseNumWorkHours(v) {
        if (v === undefined || v === null || v === '') return NaN;
        const x = parseFloat(String(v).replace(/,/g, ''));
        return Number.isFinite(x) ? x : NaN;
    },

    /** ساعات العمل السنوية الافتراضية لكل فرد (موظف أو عامل مقاول) من الإعدادات المحفوظة */
    _getDashboardDefaultAnnualHoursPerCapita() {
        const hpd = this._parseNumWorkHours(typeof localStorage !== 'undefined' ? localStorage.getItem('hse_hours_per_day') : null);
        const dpm = this._parseNumWorkHours(typeof localStorage !== 'undefined' ? localStorage.getItem('hse_work_days_per_month') : null);
        const mo = this._parseNumWorkHours(typeof localStorage !== 'undefined' ? localStorage.getItem('hse_work_months_per_year') : null);
        const hoursPerDay = !isNaN(hpd) && hpd > 0 ? hpd : 8;
        const workDaysPerMonth = !isNaN(dpm) && dpm > 0 ? dpm : 22;
        const monthsPerYear = !isNaN(mo) && mo > 0 ? mo : 12;
        return hoursPerDay * workDaysPerMonth * monthsPerYear;
    },

    /**
     * تحديد إذا كان الموظف غير نشط (مستقيل)
     * يدعم: status = 'inactive' أو 'غير نشط' أو وجود تاريخ استقالة
     */
    _isEmployeeInactive(employee) {
        if (!employee) return false;
        const status = (employee.status != null && employee.status !== '') ? String(employee.status).trim() : '';
        const resignationDate = (employee.resignationDate != null && employee.resignationDate !== '') ? String(employee.resignationDate).trim() : '';
        if (resignationDate) return true;
        if (status === 'inactive' || status.toLowerCase() === 'inactive') return true;
        if (status === 'غير نشط') return true;
        return false;
    },

    /**
     * جمع أعداد العمالة من سجلات المقاولين المعتمدين أو جدول العمالة الخارجية الشهري
     */
    _sumContractorWorkforceHeadcount(approvedContractors, appData) {
        const data = appData && typeof appData === 'object'
            ? appData
            : (typeof AppState !== 'undefined' && AppState.appData ? AppState.appData : {});

        const externalWorkforce = Array.isArray(data.externalWorkforceMonthly) ? data.externalWorkforceMonthly : [];
        const currentYear = new Date().getFullYear();
        const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

        // 1. جمع كل الأشهر المُدخلة لكل مقاول في السنة الحالية (ليس شهراً واحداً فقط)
        const activeYearRecords = externalWorkforce.filter(r => r && Number(r.year) === currentYear);
        if (activeYearRecords.length > 0) {
            let totalSum = 0;
            activeYearRecords.forEach(r => {
                // استخدام حقل total إذا كان مُحسوباً مسبقاً، وإلا جمع الأشهر يدوياً
                const savedTotal = parseFloat(r.total);
                if (Number.isFinite(savedTotal) && savedTotal > 0) {
                    totalSum += Math.round(savedTotal);
                } else {
                    monthKeys.forEach(key => {
                        const val = parseFloat(r[key]);
                        if (Number.isFinite(val) && val > 0) totalSum += Math.round(val);
                    });
                }
            });
            if (totalSum > 0) {
                return totalSum;
            }
        }

        // 2. كبديل: استخدام الأرقام الافتراضية/الثابتة من المقاولين المعتمدين
        if (!Array.isArray(approvedContractors) || approvedContractors.length === 0) return 0;
        const keys = ['workerCount', 'workersCount', 'laborCount', 'manpower', 'employeesCount', 'totalWorkers', 'averageWorkers', 'contractorWorkers', 'numberOfWorkers', 'expectedWorkers', 'workforceCount'];
        let sum = 0;
        approvedContractors.forEach((rec) => {
            if (!rec || typeof rec !== 'object') return;
            if (rec.active === false || rec.deactivated === true || rec.isActive === 'inactive' || rec.isActive === false || rec.isActive === 'false' || rec.isActive === 'FALSE') return;
            let found = NaN;
            for (let i = 0; i < keys.length; i++) {
                const x = this._parseNumWorkHours(rec[keys[i]]);
                if (!isNaN(x) && x > 0) {
                    found = x;
                    break;
                }
            }
            if (!isNaN(found)) sum += Math.round(found);
        });

        // تعديل ذكي: إذا كانت قيمة العمالة المسجلة في المقاولين صفراً لعدم وجود الحقول في الهيكل الحالي
        // نقوم بإرجاع عدد المقاولين المعتمدين والنشطين أنفسهم بدلاً من 0
        if (sum === 0) {
            const activeContractors = approvedContractors.filter(rec => 
                rec && 
                rec.active !== false && 
                rec.deactivated !== true && 
                rec.isActive !== 'inactive' && 
                rec.isActive !== false && 
                rec.isActive !== 'false' && 
                rec.isActive !== 'FALSE'
            );
            return activeContractors.length;
        }

        return sum;
    },

    /**
     * تقدير إجمالي الساعات السنوية: موظفون نشطون (+ حقول سنوية صريحة إن وُجدت) + عمالة مقاولين × نفس معادلة الساعات الافتراضية لكل فرد.
     */
    _computeEstimatedAnnualWorkHoursTotal(employees, approvedContractors) {
        const list = Array.isArray(employees) ? employees.filter((e) => e && !this._isEmployeeInactive(e)) : [];
        const n = list.length;
        const defaultAnnualPerCapita = this._getDashboardDefaultAnnualHoursPerCapita();

        const annualFromEmployee = (e) => {
            const annualKeys = ['annualWorkHours', 'yearlyWorkHours', 'workHoursYear', 'annualHours', 'estimatedAnnualHours', 'totalAnnualHours'];
            for (let i = 0; i < annualKeys.length; i++) {
                const x = this._parseNumWorkHours(e[annualKeys[i]]);
                if (!isNaN(x) && x > 0) return x;
            }
            const monthly = this._parseNumWorkHours(e.monthlyHours ?? e.monthlyWorkHours ?? e.workHoursMonth);
            if (!isNaN(monthly) && monthly > 0) return monthly * 12;
            const weekly = this._parseNumWorkHours(e.weeklyHours ?? e.hoursPerWeek ?? e.workHoursWeek);
            if (!isNaN(weekly) && weekly > 0) return weekly * 52;
            return null;
        };

        let sumExplicit = 0;
        let withExplicit = 0;
        list.forEach((e) => {
            const a = annualFromEmployee(e);
            if (a != null) {
                sumExplicit += a;
                withExplicit += 1;
            }
        });

        let employeeHoursPart = 0;
        if (n > 0) {
            if (withExplicit === 0) employeeHoursPart = n * defaultAnnualPerCapita;
            else employeeHoursPart = sumExplicit + (n - withExplicit) * defaultAnnualPerCapita;
        }

        let contractorHoursPart = 0;
        if (this.workHoursIncludeContractors()) {
            const contractorSlots = this._sumContractorWorkforceHeadcount(approvedContractors, AppState.appData);
            contractorHoursPart = contractorSlots * defaultAnnualPerCapita;
        }

        return Math.round(employeeHoursPart + contractorHoursPart);
    },

    /**
     * تحديث مؤشرات الأداء
     * جميع التحديثات بتغيير القيم (textContent) فقط؛ لا إعادة بناء DOM ولا إخفاء عناصر.
     * الكروت تظهر مرة واحدة وتبقى ثابتة (لا display:none ولا conditional rendering).
     */
    updateKPIs() {
        const data = AppState.appData;
        if (!data) {
            Utils.safeWarn('⚠️ AppState.appData غير متوفر');
            return;
        }

        /* لا نزيل kpis-values-ready أبداً؛ الكروت تظهر مرة واحدة وتبقى ثابتة. التحديث بتغيير القيم (textContent) فقط دون إخفاء أو إعادة إنشاء عناصر. */

        try {
            const incidents = Array.isArray(data.incidents) ? data.incidents : [];
            const users = Array.isArray(data.users) ? data.users : [];
            const ptwDataset = this.getUnifiedPTWDataset(data);
            const nearmiss = Array.isArray(data.nearmiss) ? data.nearmiss : [];
            const employees = Array.isArray(data.employees) ? data.employees : [];
            const registryData = Array.isArray(data.incidentsRegistry) ? data.incidentsRegistry : [];

            // حساب كل القيم دون المساس بـ DOM
            const totalIncidentsCount = (registryData && registryData.length > 0)
                ? registryData.length
                : incidents.length;
            const allIncidentRecords = (registryData && registryData.length > 0) ? registryData : incidents;
            const currentYear = new Date().getFullYear();
            let incidentsCurrentYearCount = 0;
            let incidentsPriorYearsCount = 0;
            allIncidentRecords.forEach((r) => {
                const cat = this._classifyIncidentYearForDashboard(r, currentYear);
                if (cat === 'current') incidentsCurrentYearCount += 1;
                else if (cat === 'prior') incidentsPriorYearsCount += 1;
            });
            const activeUsersCount = users.filter(u => u && u.active !== false).length;

            const openPTWCount = ptwDataset.filter(p => !this.isPTWClosedStatus(p?.status)).length;
            const closedPTWCount = ptwDataset.filter(p => this.isPTWClosedStatus(p?.status)).length;
            const totalPTWCount = ptwDataset.length;

            const canIncDash = this.dashboardCan('incidents');
            const canNearDash = this.dashboardCan('nearmiss');
            const incidentsForCompliance = canIncDash ? incidents : [];
            const nearmissForCompliance = canNearDash ? nearmiss : [];
            const totalItems = incidentsForCompliance.length + nearmissForCompliance.length;
            const resolvedIncidents = incidentsForCompliance.filter(i => i && (i.status === 'مغلق' || i.status === 'محلول')).length;
            const resolvedNearMiss = nearmissForCompliance.filter(n => n && (n.correctiveProposed === false || n.status === 'مغلق' || n.status === 'محلول')).length;
            const complianceRate = totalItems > 0 ? Math.round(((resolvedIncidents + resolvedNearMiss) / totalItems) * 100) : (canIncDash || canNearDash ? 100 : 0);
            const complianceClass = complianceRate >= 90 ? 'kpi-value text-green-600' : complianceRate >= 70 ? 'kpi-value text-yellow-600' : 'kpi-value text-red-600';

            const actualTotalHours = this.getDashboardTotalWorkHours(data);

            let daysWithoutInjuryText = 'N/A';
            if (canIncDash) {
                let allRecords = registryData && registryData.length > 0
                    ? registryData.filter(r => r && r.incidentDate)
                    : incidents.filter(i => i && (i.incidentDate || i.date || i.createdAt));
                if (allRecords.length > 0) {
                    const sortedRecords = allRecords.slice().sort((a, b) => {
                        const dateA = new Date(a.incidentDate || a.date || a.createdAt);
                        const dateB = new Date(b.incidentDate || b.date || b.createdAt);
                        return dateB - dateA;
                    });
                    const lastIncidentDate = new Date(sortedRecords[0].incidentDate || sortedRecords[0].date || sortedRecords[0].createdAt);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    lastIncidentDate.setHours(0, 0, 0, 0);
                    const daysDiff = Math.floor((today - lastIncidentDate) / (1000 * 60 * 60 * 24));
                    daysWithoutInjuryText = daysDiff >= 0 ? this.formatNumber(daysDiff) : '0';
                }
            }

            const reportsUpdates = this.getReportsStatisticsUpdates();
            const self = this;

            // تنفيذ التحديثات بشكل متزامن في نفس الـ tick لتفادي وميض: تأجيلها إلى rAF يعرض إطاراً بقيم ابتدائية ثم إطاراً محدثاً.
            (function applyAllKPIsSync() {
                try {
                    if (self.dashboardCan('incidents')) {
                        const totalIncidentsEl = document.getElementById('total-incidents');
                        if (totalIncidentsEl) {
                            totalIncidentsEl.textContent = self.formatNumber(totalIncidentsCount);
                            self.applyEnglishNumberFormat(totalIncidentsEl);
                        }
                        const lblCur = document.getElementById('dash-incidents-label-current');
                        const numCur = document.getElementById('dash-incidents-num-current');
                        const numPrior = document.getElementById('dash-incidents-num-prior');
                        if (lblCur) {
                            lblCur.textContent = `${self.t('dash.incidentsCurrentYear', 'حوادث العام الحالي')} (${currentYear}):`;
                        }
                        if (numCur) {
                            numCur.textContent = self.formatNumber(incidentsCurrentYearCount);
                            self.applyEnglishNumberFormat(numCur);
                        }
                        if (numPrior) {
                            numPrior.textContent = self.formatNumber(incidentsPriorYearsCount);
                            self.applyEnglishNumberFormat(numPrior);
                        }
                    }
                    if (self.dashboardCan('users')) {
                        const activeUsersEl = document.getElementById('active-users');
                        if (activeUsersEl) {
                            activeUsersEl.textContent = self.formatNumber(activeUsersCount);
                            self.applyEnglishNumberFormat(activeUsersEl);
                        }
                    }
                    if (self.dashboardCan('ptw')) {
                        const openPTWCountEl = document.getElementById('open-ptw-count');
                        if (openPTWCountEl) {
                            openPTWCountEl.textContent = self.formatNumber(openPTWCount);
                            self.applyEnglishNumberFormat(openPTWCountEl);
                        }
                        const closedPTWCountEl = document.getElementById('closed-ptw-count');
                        if (closedPTWCountEl) {
                            closedPTWCountEl.textContent = self.formatNumber(closedPTWCount);
                            self.applyEnglishNumberFormat(closedPTWCountEl);
                        }
                        const totalPTWCountEl = document.getElementById('total-ptw-count');
                        if (totalPTWCountEl) {
                            totalPTWCountEl.textContent = self.formatNumber(totalPTWCount);
                            self.applyEnglishNumberFormat(totalPTWCountEl);
                        }
                        const activePTWEl = document.getElementById('active-ptw');
                        if (activePTWEl) {
                            activePTWEl.textContent = self.formatNumber(openPTWCount);
                            self.applyEnglishNumberFormat(activePTWEl);
                        }
                    }
                    if (canIncDash || canNearDash) {
                        const complianceRateEl = document.getElementById('compliance-rate');
                        if (complianceRateEl) {
                            complianceRateEl.textContent = complianceRate + '%';
                            complianceRateEl.className = complianceClass;
                        }
                    }
                    if (self.dashboardCan('employees')) {
                        const totalWorkHoursEl = document.getElementById('total-work-hours');
                        if (totalWorkHoursEl) {
                            totalWorkHoursEl.textContent = self.formatNumber(actualTotalHours);
                            self.applyEnglishNumberFormat(totalWorkHoursEl);
                        }
                        const safeWorkHoursEl = document.getElementById('safe-work-hours');
                        if (safeWorkHoursEl && (self.dashboardCan('incidents') || self.dashboardCan('employees'))) {
                            const safeHours = self.getSafeWorkHours(data);
                            safeWorkHoursEl.textContent = self.formatNumber(safeHours);
                            self.applyEnglishNumberFormat(safeWorkHoursEl);
                        }
                        const safeWorkHoursSub = document.getElementById('safe-work-hours-subtitle');
                        if (safeWorkHoursSub) {
                            const subText = self.t('dash.safeWorkHoursSubtitle', 'تراكمي YTD منذ آخر إصابة LTI');
                            if (safeWorkHoursSub.textContent !== subText) safeWorkHoursSub.textContent = subText;
                        }
                        const empCountDashEl = document.getElementById('dash-kpi-employees-active-count');
                        if (empCountDashEl) {
                            const empActiveOnly = employees.filter(e => e && !self._isEmployeeInactive(e)).length;
                            empCountDashEl.textContent = self.formatNumber(empActiveOnly);
                            self.applyEnglishNumberFormat(empCountDashEl);
                        }
                        
                        // ✅ تحديث كارت العمالة الخارجية — مع جلب البيانات إن لم تكن محملة
                        const contCountDashEl = document.getElementById('dash-kpi-contractors-active-count');
                        if (contCountDashEl) {
                            const approvedContractors = Array.isArray(data.approvedContractors) ? data.approvedContractors : [];

                            // إذا كانت البيانات موجودة — احسب مباشرة
                            if (Array.isArray(data.externalWorkforceMonthly) && data.externalWorkforceMonthly.length > 0) {
                                const contractorWorkforceCount = self._sumContractorWorkforceHeadcount(approvedContractors, data);
                                contCountDashEl.textContent = self.formatNumber(contractorWorkforceCount);
                                self.applyEnglishNumberFormat(contCountDashEl);
                            } else {
                                // البيانات غير محملة — اجلبها من الخادم وحدّث الكارت
                                if (typeof Backend !== 'undefined' && typeof Backend.readFromSheets === 'function') {
                                    Backend.readFromSheets('ExternalWorkforceMonthly', 15000)
                                        .then(rows => {
                                            if (Array.isArray(rows) && rows.length > 0) {
                                                AppState.appData.externalWorkforceMonthly = rows;
                                            } else if (!Array.isArray(AppState.appData.externalWorkforceMonthly)) {
                                                AppState.appData.externalWorkforceMonthly = [];
                                            }
                                            const count = self._sumContractorWorkforceHeadcount(approvedContractors, AppState.appData);
                                            if (contCountDashEl) {
                                                contCountDashEl.textContent = self.formatNumber(count);
                                                self.applyEnglishNumberFormat(contCountDashEl);
                                            }
                                        })
                                        .catch(() => {
                                            // فشل الجلب — اعرض عدد المقاولين النشطين كبديل
                                            const fallback = approvedContractors.filter(r => r &&
                                                r.isActive !== 'inactive' && r.isActive !== false &&
                                                r.isActive !== 'false' && r.isActive !== 'FALSE').length;
                                            if (contCountDashEl) {
                                                contCountDashEl.textContent = self.formatNumber(fallback);
                                                self.applyEnglishNumberFormat(contCountDashEl);
                                            }
                                        });
                                }
                            }
                        }
                    }
                    if (self.dashboardCan('training')) {
                        const trainingProgDashEl = document.getElementById('dash-kpi-training-programs');
                        if (trainingProgDashEl) {
                            const tr = Array.isArray(data.training) ? data.training : [];
                            trainingProgDashEl.textContent = self.formatNumber(tr.length);
                            self.applyEnglishNumberFormat(trainingProgDashEl);
                        }
                    }
                    if (self.dashboardCan('clinic')) {
                        const clinicDashEl = document.getElementById('dash-kpi-clinic-visits-total');
                        if (clinicDashEl) {
                            clinicDashEl.textContent = self.formatNumber(self.getClinicVisitsTotalCount(data));
                            self.applyEnglishNumberFormat(clinicDashEl);
                        }
                    }
                    if (canIncDash) {
                        const daysWithoutInjuryEl = document.getElementById('days-without-injury');
                        if (daysWithoutInjuryEl) {
                            daysWithoutInjuryEl.textContent = daysWithoutInjuryText;
                            self.applyEnglishNumberFormat(daysWithoutInjuryEl);
                        }
                    }
                    if (self.dashboardCan('incidents')) {
                        self.calculateSafetyMetrics(incidents, employees, registryData, data);
                    }
                    if (reportsUpdates && reportsUpdates.length) {
                        self.applyReportsStatisticsUpdates(reportsUpdates);
                    }
                    document.querySelector('.safety-metrics-section')?.classList.add('kpis-values-ready');
                    document.querySelector('.reports-statistics-section')?.classList.add('kpis-values-ready');
                } catch (err) {
                    if (typeof Utils !== 'undefined' && Utils.safeWarn) Utils.safeWarn('⚠️ خطأ في تحديث KPIs:', err);
                }
            })();
        } catch (error) {
            Utils.safeWarn('⚠️ خطأ في تحديث KPIs:', error);
        }
    },

    /**
     * حساب مؤشرات السلامة المهنية (8 مؤشرات)
     * FR, FAR, AFR, TRIR, MD, IR, SR, LTI — YTD مع ModMetrics (SafetyPerformanceKPIs)
     */
    calculateSafetyMetrics(incidents, employees, registryData = null, appData = null) {
        try {
            if (!this.dashboardCan('incidents')) return;
            if (!Array.isArray(incidents)) incidents = [];
            if (!Array.isArray(employees)) employees = [];
            if (!Array.isArray(registryData)) registryData = [];

            const dataBundle = appData && typeof appData === 'object'
                ? appData
                : (typeof AppState !== 'undefined' && AppState.appData ? AppState.appData : {});

            const year = new Date().getFullYear();
            const spk = (typeof SafetyPerformanceKPIs !== 'undefined' && SafetyPerformanceKPIs)
                ? SafetyPerformanceKPIs
                : null;

            let ytdHours = 0;
            let ltiCount = 0;
            let nltiCount = 0;
            let firstAidCount = 0;
            let recordableCount = 0;
            let fatalitiesCount = 0;
            let lostDaysTotal = 0;
            let usingModMetrics = false;

            if (spk && typeof spk.buildScorecardData === 'function' && typeof spk.sumYtd === 'function') {
                usingModMetrics = true;
                const model = spk.buildScorecardData(year);
                const limit = model.ytdLimit;
                const rows = model.rows;
                ytdHours = spk.sumYtd(rows.hoursWorked, limit);
                ltiCount = spk.sumYtd(rows.lti, limit);
                nltiCount = spk.sumYtd(rows.nlti, limit);
                firstAidCount = spk.sumYtd(rows.firstAid, limit);
                recordableCount = spk.sumYtd(rows.recordable, limit);

                (dataBundle.incidents || []).forEach((record) => {
                    const monthIndex = spk.getMonthIndexForYear(
                        record?.date || record?.incidentDate || record?.createdAt,
                        year
                    );
                    if (monthIndex < 0 || monthIndex > limit) return;
                    const bag = spk.getTextBag ? spk.getTextBag(record) : '';
                    const types = Array.isArray(record?.investigation?.incidentTypes)
                        ? record.investigation.incidentTypes
                        : [];
                    if (types.includes('fatality') || bag.includes('fatality') || bag.includes('وفاة')) {
                        fatalitiesCount += 1;
                    }
                    lostDaysTotal += parseFloat(
                        record.lostDays || record.daysLost || record.lostTimeDays || record.timeOffWork || 0
                    ) || 0;
                });
            } else {
                ytdHours = this.getDashboardTotalWorkHours(dataBundle);
                const inYear = (entry) => {
                    const raw = entry?.date || entry?.incidentDate || entry?.createdAt;
                    if (!raw) return true;
                    const d = new Date(raw);
                    return !isNaN(d.getTime()) && d.getFullYear() === year;
                };
                const yearIncidents = incidents.filter((i) => i && inYear(i));
                const yearRegistry = registryData.filter((e) => e && inYear(e));

                if (yearRegistry.length > 0) {
                    ltiCount = yearRegistry.filter((entry) =>
                        entry && entry.totalLeaveDays && parseFloat(entry.totalLeaveDays) > 0
                    ).length;
                    recordableCount = yearRegistry.length;
                    nltiCount = Math.max(0, recordableCount - ltiCount);
                } else {
                    ltiCount = yearIncidents.filter((i) =>
                        i.severity === 'عالية' || i.severity === 'حرجة' ||
                        i.severity === 'high' || i.severity === 'critical' ||
                        i.lostTime === true || (parseFloat(i.lostTimeDays || i.lostDays || 0) > 0)
                    ).length;
                    recordableCount = yearIncidents.length;
                    nltiCount = Math.max(0, recordableCount - ltiCount);
                }

                yearIncidents.forEach((record) => {
                    const bag = `${record?.type || ''} ${record?.description || ''} ${record?.severity || ''}`.toLowerCase();
                    if (bag.includes('fatality') || bag.includes('وفاة')) fatalitiesCount += 1;
                    if (bag.includes('first aid') || bag.includes('إسعاف') || bag.includes('اسعاف')) firstAidCount += 1;
                    lostDaysTotal += parseFloat(
                        record.lostDays || record.daysLost || record.lostTimeDays || record.timeOffWork || 0
                    ) || 0;
                });
            }

            if (!Number.isFinite(ytdHours) || ytdHours < 0) {
                Utils.safeWarn('⚠️ إجمالي ساعات العمل غير صحيح:', ytdHours);
                return;
            }

            const hours = ytdHours > 0 ? ytdHours : 0;
            const accidentsCount = ltiCount + nltiCount;
            const totalIncidentsCount = accidentsCount + firstAidCount;

            const fr = hours > 0 ? (ltiCount * 1000000) / hours : 0;
            const far = hours > 0 ? (fatalitiesCount * 100000000) / hours : 0;
            const afr = hours > 0 ? (accidentsCount * 1000000) / hours : 0;
            const trir = hours > 0 ? (recordableCount * 200000) / hours : 0;
            const md = hours / 8;
            const ir = hours > 0 ? (totalIncidentsCount * 1000000) / hours : 0;
            const sr = hours > 0 ? (lostDaysTotal * 1000000) / hours : 0;

            const updateOneSafetyValue = (elementId, formattedValue) => {
                const el = document.getElementById(elementId);
                if (el && el.textContent !== formattedValue) {
                    el.textContent = formattedValue;
                    this.applyEnglishNumberFormat(el);
                }
            };

            updateOneSafetyValue('fr-value', this.formatNumber(fr, 2));
            updateOneSafetyValue('far-value', this.formatNumber(far, 4));
            updateOneSafetyValue('afr-value', this.formatNumber(afr, 2));
            updateOneSafetyValue('trir-value', this.formatNumber(trir, 2));
            updateOneSafetyValue('md-value', this.formatNumber(Math.round(md), 0));
            updateOneSafetyValue('ir-value', this.formatNumber(ir, 2));
            updateOneSafetyValue('sr-value', this.formatNumber(sr, 2));
            updateOneSafetyValue('lti-value', this.formatNumber(ltiCount, 0));

            const mdSub = document.getElementById('md-subtitle');
            if (mdSub) {
                const mdText = this.t('dash.mdSubtitleYtd', 'تراكمي من بداية العام ({year})').replace(/\{year\}/g, String(year));
                if (mdSub.textContent !== mdText) mdSub.textContent = mdText;
            }

            const noteEl = document.getElementById('safety-metrics-note-text');
            if (noteEl) {
                const noteText = this.t(
                    'dash.safetyMetricsNote',
                    'ملاحظة: TRIR/LTI/SR/AFR/FAR/IR وأيام العمل تحسب مع ModMetrics للعام الحالي {year} بنفس نطاق المشروع.'
                ).replace(/\{year\}/g, String(year));
                if (noteEl.textContent !== noteText) noteEl.textContent = noteText;
            }

            if (typeof Utils !== 'undefined' && Utils.safeLog) {
                Utils.safeLog('📊 مؤشرات السلامة:', {
                    year,
                    FR: fr,
                    FAR: far,
                    AFR: afr,
                    TRIR: trir,
                    MD: md,
                    IR: ir,
                    SR: sr,
                    LTI: ltiCount,
                    totalWorkHours: hours,
                    usingModMetrics
                });
            }
        } catch (error) {
            Utils.safeWarn('⚠️ خطأ في حساب مؤشرات السلامة:', error);
        }
    },

    /**
     * تحديث بيانات الحوادث في Dashboard
     * يتم استدعاؤها عند إضافة/تحديث/حذف حادث
     */
    refreshIncidents() {
        this.updateKPIs();
    },

    /**
     * تحميل الأنشطة الأخيرة
     */
    loadRecentActivities() {
        const container = document.getElementById('recent-activities');
        if (!container) return;

        try {
            // التحقق من وجود AppState
            if (!AppState || !AppState.appData) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle text-4xl text-yellow-500 mb-4"></i>
                        <p class="text-yellow-600">جاري تحميل البيانات...</p>
                    </div>
                `;
                return;
            }

            const activities = [];
            const ad = AppState.appData;

            if (this.dashboardCan('incidents')) {
                const incidents = Array.isArray(ad.incidents) ? ad.incidents : [];
                incidents.forEach((incident) => {
                    if (!incident) return;
                    try {
                        const incidentDate = incident.createdAt || incident.date;
                        if (!incidentDate) return;
                        const dateObj = new Date(incidentDate);
                        if (isNaN(dateObj.getTime())) return;
                        const incidentType = incident.incidentType || incident.title || incident.type || 'حادث';
                        activities.push({
                            type: 'incident',
                            title: `تم تسجيل حادث: ${incidentType}`,
                            date: dateObj,
                            time: this.getTimeAgo(incidentDate),
                            icon: 'fa-exclamation-triangle',
                            color: 'text-red-500'
                        });
                    } catch (e) {
                        Utils.safeWarn('⚠️ خطأ في معالجة حادث:', e);
                    }
                });
            }

            if (this.dashboardCan('nearmiss')) {
                const nearmiss = Array.isArray(ad.nearmiss) ? ad.nearmiss : [];
                nearmiss.forEach((nm) => {
                    if (!nm) return;
                    try {
                        const d = nm.createdAt || nm.date || nm.reportDate;
                        if (!d) return;
                        const dateObj = new Date(d);
                        if (isNaN(dateObj.getTime())) return;
                        const title = nm.title || nm.description || nm.type || 'حادث وشيك';
                        activities.push({
                            type: 'nearmiss',
                            title: `حادث وشيك: ${title}`,
                            date: dateObj,
                            time: this.getTimeAgo(d),
                            icon: 'fa-triangle-exclamation',
                            color: 'text-orange-500'
                        });
                    } catch (e) {
                        Utils.safeWarn('⚠️ خطأ في معالجة حادث وشيك:', e);
                    }
                });
            }

            if (this.dashboardCan('ptw')) {
                const ptwList = this.getUnifiedPTWDataset(ad);
                ptwList.forEach((p) => {
                    if (!p) return;
                    try {
                        const d = p.createdAt || p.startDate || p.issueDate;
                        if (!d) return;
                        const dateObj = new Date(d);
                        if (isNaN(dateObj.getTime())) return;
                        const label = p.permitNumber || p.workDescription || p.location || 'تصريح عمل';
                        activities.push({
                            type: 'ptw',
                            title: `تصريح عمل: ${label}`,
                            date: dateObj,
                            time: this.getTimeAgo(d),
                            icon: 'fa-id-card',
                            color: 'text-blue-500'
                        });
                    } catch (e) {
                        Utils.safeWarn('⚠️ خطأ في معالجة تصريح:', e);
                    }
                });
            }

            if (this.dashboardCan('training')) {
                const training = Array.isArray(ad.training) ? ad.training : [];
                training.forEach((t) => {
                    if (!t) return;
                    try {
                        const d = t.createdAt || t.startDate || t.date;
                        if (!d) return;
                        const dateObj = new Date(d);
                        if (isNaN(dateObj.getTime())) return;
                        const name = t.programName || t.courseName || t.title || 'برنامج تدريبي';
                        activities.push({
                            type: 'training',
                            title: `تدريب: ${name}`,
                            date: dateObj,
                            time: this.getTimeAgo(d),
                            icon: 'fa-graduation-cap',
                            color: 'text-green-500'
                        });
                    } catch (e) {
                        Utils.safeWarn('⚠️ خطأ في معالجة تدريب:', e);
                    }
                });
            }

            if (this.dashboardCan('violations')) {
                const violations = Array.isArray(ad.violations) ? ad.violations : [];
                violations.forEach((v) => {
                    if (!v) return;
                    try {
                        const d = v.createdAt || v.date || v.violationDate;
                        if (!d) return;
                        const dateObj = new Date(d);
                        if (isNaN(dateObj.getTime())) return;
                        const desc = v.description || v.type || v.category || 'مخالفة';
                        activities.push({
                            type: 'violation',
                            title: `مخالفة: ${desc}`,
                            date: dateObj,
                            time: this.getTimeAgo(d),
                            icon: 'fa-ban',
                            color: 'text-pink-500'
                        });
                    } catch (e) {
                        Utils.safeWarn('⚠️ خطأ في معالجة مخالفة:', e);
                    }
                });
            }

            // ترتيب الأنشطة حسب التاريخ الفعلي (الأحدث أولاً)
            activities.sort((a, b) => {
                if (!a.date || !b.date) return 0;
                return b.date - a.date;
            });

            if (activities.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-inbox text-4xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500">${this.t('dash.noRecentActivities', 'لا توجد أنشطة حديثة')}</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = activities.slice(0, 5).map(activity => `
                <div class="activity-item">
                    <div class="activity-icon ${activity.color} bg-gray-100">
                        <i class="fas ${activity.icon}"></i>
                    </div>
                    <div class="activity-content">
                        <div class="activity-title">${activity.title}</div>
                        <div class="activity-time">${activity.time}</div>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            Utils.safeWarn('⚠️ خطأ في تحميل الأنشطة الأخيرة:', error);
            if (container) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-4"></i>
                        <p class="text-red-600">حدث خطأ في تحميل الأنشطة</p>
                    </div>
                `;
            }
        }
    },

    /**
     * ويدجت تقويم السلامة — أحداث اليوم والقادمة خلال 14 يوماً
     */
    async loadSafetyCalendarWidget() {
        const container = document.getElementById('safety-calendar-widget');
        if (!container) return;

        if (!this.dashboardCan('safety-calendar')) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-lock text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-500">${this.t('dash.noPermissionTasks', 'لا توجد صلاحية لعرض هذا القسم.')}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-spinner fa-spin text-4xl text-gray-300 mb-4"></i>
                <p class="text-gray-500">${this.t('common.loading', 'جاري التحميل...')}</p>
            </div>
        `;

        try {
            if (typeof SafetyCalendar === 'undefined' || typeof SafetyCalendar.renderDashboardWidget !== 'function') {
                container.innerHTML = `<p class="text-gray-500">${this.t('module.safetyCalendar.noEvents', 'لا توجد أحداث')}</p>`;
                return;
            }
            await SafetyCalendar.renderDashboardWidget(container);
        } catch (err) {
            if (typeof Utils !== 'undefined' && Utils.safeWarn) Utils.safeWarn('⚠️ تعذر تحميل ويدجت تقويم السلامة:', err);
            container.innerHTML = `<p class="text-gray-500">${this.t('module.safetyCalendar.noEvents', 'لا توجد أحداث')}</p>`;
        }
    },

    /**
     * تحميل مهام المستخدم في لوحة التحكم
     */
    async loadUserTasksWidget() {
        const container = document.getElementById('user-tasks-widget');
        if (!container) return;

        if (!this.dashboardCan('user-tasks')) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-lock text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-500">${this.t('dash.noPermissionTasks', 'لا توجد صلاحية لعرض مهام المستخدمين.')}</p>
                </div>
            `;
            return;
        }

        // الحصول على المستخدم الحالي
        const currentUser = AppState.currentUser;
        if (!currentUser) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-slash text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-500">لم يتم تسجيل الدخول</p>
                </div>
            `;
            return;
        }

        // عرض حالة التحميل
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-spinner fa-spin text-4xl text-gray-300 mb-4"></i>
                <p class="text-gray-500">جاري تحميل المهام...</p>
            </div>
        `;

        try {
            // التحقق من توفر AppState
            if (typeof AppState === 'undefined' || !AppState.appData) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle text-4xl text-yellow-500 mb-4"></i>
                        <p class="text-yellow-600">جاري تحميل البيانات...</p>
                    </div>
                `;
                return;
            }

            // الحصول على معرف المستخدم
            const userId = currentUser.id || currentUser.email;

            // جلب المهام من Backend API
            let userTasks = [];

            if (typeof Backend !== 'undefined' && Backend.sendToAppsScript) {
                try {
                    const response = await Backend.sendToAppsScript('getUserTasksByUserId', {
                        userId: userId
                    });

                    if (response && response.success && response.data) {
                        userTasks = Array.isArray(response.data) ? response.data : [];
                    }
                } catch (apiError) {
                    // تجاهل أخطاء Circuit Breaker و الخادم السحابي غير المفعل
                    const errorMsg = String(apiError?.message || '').toLowerCase();
                    if (!errorMsg.includes('circuit breaker') &&
                        !errorMsg.includes('google apps script غير مفعل') &&
                        !errorMsg.includes('غير مفعل')) {
                        // تسجيل الأخطاء الأخرى فقط
                        Utils.safeWarn('⚠️ خطأ في جلب المهام من API:', apiError);
                    }
                    // المتابعة باستخدام البيانات المحلية
                }
            }

            // إذا فشل جلب البيانات من Backend، نستخدم البيانات المحلية كبديل
            if (userTasks.length === 0) {
                const allTasks = AppState.appData.userTasks || [];
                const userId = currentUser.id || currentUser.email;

                // تصفية المهام الخاصة بالمستخدم الحالي
                userTasks = allTasks.filter(task => {
                    const taskUserId = task.userId || task.assignedTo || task.assignedUserId;
                    return taskUserId === userId || taskUserId === currentUser.email;
                });
            }

            // ترتيب المهام حسب الأولوية والتاريخ
            userTasks.sort((a, b) => {
                // أولاً: المهام غير المكتملة أولاً
                if (a.status !== 'مكتمل' && b.status === 'مكتمل') return -1;
                if (a.status === 'مكتمل' && b.status !== 'مكتمل') return 1;

                // ثانياً: حسب الأولوية
                const priorityOrder = { 'عالية': 3, 'متوسطة': 2, 'منخفضة': 1 };
                const aPriority = priorityOrder[a.priority] || 0;
                const bPriority = priorityOrder[b.priority] || 0;
                if (aPriority !== bPriority) return bPriority - aPriority;

                // ثالثاً: حسب تاريخ الاستحقاق
                if (a.dueDate && b.dueDate) {
                    return new Date(a.dueDate) - new Date(b.dueDate);
                }
                if (a.dueDate) return -1;
                if (b.dueDate) return 1;

                // رابعاً: حسب تاريخ الإنشاء
                if (a.createdAt && b.createdAt) {
                    return new Date(b.createdAt) - new Date(a.createdAt);
                }
                return 0;
            });

            // عرض أول 5 مهام
            const tasksToShow = userTasks.slice(0, 5);

            if (tasksToShow.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-tasks text-4xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500">${this.t('dash.noTasks', 'لا توجد مهام')}</p>
                    </div>
                `;
                return;
            }

            // تحديد الألوان والأيقونات حسب الحالة
            const getTaskStatusInfo = (status) => {
                switch (status) {
                    case 'مكتمل':
                    case 'مكتملة':
                    case 'completed':
                        return { icon: 'fa-check-circle', color: 'text-green-500', bgColor: 'bg-green-100' };
                    case 'قيد التنفيذ':
                    case 'في العمل':
                    case 'in-progress':
                        return { icon: 'fa-spinner', color: 'text-blue-500', bgColor: 'bg-blue-100' };
                    case 'معلقة':
                    case 'pending':
                        return { icon: 'fa-pause-circle', color: 'text-yellow-500', bgColor: 'bg-yellow-100' };
                    case 'ملغاة':
                    case 'cancelled':
                        return { icon: 'fa-times-circle', color: 'text-red-500', bgColor: 'bg-red-100' };
                    default:
                        return { icon: 'fa-circle', color: 'text-gray-500', bgColor: 'bg-gray-100' };
                }
            };

            // تحديد لون الأولوية
            const getPriorityColor = (priority) => {
                switch (priority) {
                    case 'عالية':
                    case 'high':
                        return 'text-red-600';
                    case 'متوسطة':
                    case 'medium':
                        return 'text-yellow-600';
                    case 'منخفضة':
                    case 'low':
                        return 'text-green-600';
                    default:
                        return 'text-gray-600';
                }
            };

            container.innerHTML = tasksToShow.map(task => {
                const statusInfo = getTaskStatusInfo(task.status);
                const priorityColor = getPriorityColor(task.priority);
                const dueDate = task.dueDate ? new Date(task.dueDate) : null;
                const isOverdue = dueDate && dueDate < new Date() && task.status !== 'مكتمل' && task.status !== 'مكتملة';

                // حساب الوقت المتبقي
                let timeInfo = '';
                if (dueDate) {
                    const now = new Date();
                    const diff = dueDate - now;
                    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

                    if (isOverdue) {
                        timeInfo = `<span class="text-red-600 font-semibold">متأخرة ${Math.abs(days)} يوم</span>`;
                    } else if (days === 0) {
                        timeInfo = '<span class="text-orange-600 font-semibold">اليوم</span>';
                    } else if (days === 1) {
                        timeInfo = '<span class="text-yellow-600 font-semibold">غداً</span>';
                    } else if (days <= 7) {
                        timeInfo = `<span class="text-gray-600">خلال ${days} أيام</span>`;
                    } else {
                        timeInfo = `<span class="text-gray-500">${days} يوم متبقي</span>`;
                    }
                }

                return `
                    <div class="activity-item ${isOverdue ? 'border-r-4 border-red-500' : ''}" style="cursor: pointer;" onclick="UI.showSection('user-tasks')">
                        <div class="activity-icon ${statusInfo.color} ${statusInfo.bgColor}">
                            <i class="fas ${statusInfo.icon}"></i>
                        </div>
                        <div class="activity-content" style="flex: 1;">
                            <div class="activity-title" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                <span>${Utils.escapeHTML(task.title || task.taskTitle || 'مهمة بدون عنوان')}</span>
                                ${task.priority ? `<span class="text-xs px-2 py-1 rounded ${priorityColor} bg-gray-100">${Utils.escapeHTML(task.priority)}</span>` : ''}
                            </div>
                            <div class="activity-time" style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
                                ${task.status ? `<span class="text-xs ${statusInfo.color}">${Utils.escapeHTML(task.status)}</span>` : ''}
                                ${timeInfo ? `<span class="text-xs">${timeInfo}</span>` : ''}
                                ${task.description ? `<span class="text-xs text-gray-500 truncate" style="max-width: 300px;">${Utils.escapeHTML(task.description)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // إضافة رابط لعرض جميع المهام
            if (userTasks.length > 5) {
                container.innerHTML += `
                    <div class="mt-4 pt-4 border-t text-center">
                        <a href="#user-tasks" class="text-sm text-blue-600 hover:text-blue-800" style="text-decoration: none;">
                            عرض جميع المهام (${userTasks.length}) <i class="fas fa-arrow-left mr-1"></i>
                        </a>
                    </div>
                `;
            }
        } catch (error) {
            Utils.safeError('خطأ في تحميل مهام المستخدم:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-500">حدث خطأ أثناء تحميل المهام</p>
                    <p class="text-xs text-gray-400 mt-2">يرجى المحاولة مرة أخرى</p>
                </div>
            `;
        }
    },

    /**
     * تحديث الإحصائيات السريعة (Quick Stats)
     */
    updateStats() {
        const data = AppState.appData;
        if (!data) return;

        try {
            const now = new Date();
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            const incidents = Array.isArray(data.incidents) ? data.incidents : [];
            const ptwDataset = this.getUnifiedPTWDataset(data);
            const training = Array.isArray(data.training) ? data.training : [];

            // حساب الإحصائيات الأسبوعية مع معالجة الأخطاء
            const weekIncidents = this.dashboardCan('incidents')
                ? incidents.filter(i => {
                    if (!i || !i.createdAt) return false;
                    try {
                        const incidentDate = new Date(i.createdAt);
                        return !isNaN(incidentDate.getTime()) && incidentDate > weekAgo;
                    } catch (e) {
                        return false;
                    }
                }).length
                : 0;

            const openPTW = this.dashboardCan('ptw')
                ? ptwDataset.filter(p => !this.isPTWClosedStatus(p?.status)).length
                : 0;

            const completedTraining = this.dashboardCan('training')
                ? training.filter(t => {
                    if (!t || !t.status) return false;
                    const status = String(t.status).toLowerCase();
                    return status === 'مكتمل' || status === 'منتهي' || status === 'completed' || status === 'finished';
                }).length
                : 0;

            // تحديث العناصر مع التحقق من وجودها وتطبيق تنسيق الأرقام الإنجليزية
            const weekIncidentsEl = document.getElementById('week-incidents');
            const openPTWEl = document.getElementById('open-ptw');
            const completedTrainingEl = document.getElementById('completed-training');
            const daysWithoutIncidentEl = document.getElementById('days-without-incident');

            // تحديث الأرقام مع تنسيق إنجليزي
            if (this.dashboardCan('incidents') && weekIncidentsEl) {
                weekIncidentsEl.textContent = this.formatNumber(weekIncidents);
                this.applyEnglishNumberFormat(weekIncidentsEl);
            }
            if (this.dashboardCan('ptw') && openPTWEl) {
                openPTWEl.textContent = this.formatNumber(openPTW);
                this.applyEnglishNumberFormat(openPTWEl);
            }
            if (this.dashboardCan('training') && completedTrainingEl) {
                completedTrainingEl.textContent = this.formatNumber(completedTraining);
                this.applyEnglishNumberFormat(completedTrainingEl);
            }

            // تحديث أيام بدون حوادث
            if (this.dashboardCan('incidents') && daysWithoutIncidentEl) {
                const incidentsLocal = Array.isArray(data.incidents) ? data.incidents : [];
                const registryData = Array.isArray(data.incidentsRegistry) ? data.incidentsRegistry : [];
                const allIncidents = registryData.length > 0 ? registryData : incidentsLocal;
                
                if (allIncidents.length > 0) {
                    const sortedIncidents = allIncidents
                        .filter(i => i && (i.incidentDate || i.date || i.createdAt))
                        .map(i => new Date(i.incidentDate || i.date || i.createdAt))
                        .filter(d => !isNaN(d.getTime()))
                        .sort((a, b) => b - a);
                    
                    if (sortedIncidents.length > 0) {
                        const lastIncidentDate = sortedIncidents[0];
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        lastIncidentDate.setHours(0, 0, 0, 0);
                        const daysDiff = Math.floor((today - lastIncidentDate) / (1000 * 60 * 60 * 24));
                        daysWithoutIncidentEl.textContent = daysDiff >= 0 ? this.formatNumber(daysDiff) : '0';
                    } else {
                        daysWithoutIncidentEl.textContent = '0';
                    }
                } else {
                    daysWithoutIncidentEl.textContent = '0';
                }
                this.applyEnglishNumberFormat(daysWithoutIncidentEl);
            }
        } catch (error) {
            Utils.safeWarn('⚠️ خطأ في تحديث الإحصائيات السريعة:', error);
        }
    },

    /**
     * حساب مصفوفة تحديثات التقارير والإحصائيات (بدون تطبيق على DOM)
     */
    getReportsStatisticsUpdates() {
        const data = AppState.appData;
        if (!data) return null;
        try {
            const incidents = Array.isArray(data.incidents) ? data.incidents : [];
            const nearmiss = Array.isArray(data.nearmiss) ? data.nearmiss : [];
            const inspections = Array.isArray(data.inspections) ? data.inspections : [];
            const training = Array.isArray(data.training) ? data.training : [];
            const violations = Array.isArray(data.violations) ? data.violations : [];
            const ptwDataset = this.getUnifiedPTWDataset(data);
            const ptwCount = ptwDataset.length;
            const audits = Array.isArray(data.audits) ? data.audits : [];

            let totalReports = 0;
            const rows = [];

            if (this.dashboardCan('incidents')) {
                totalReports += incidents.length;
                rows.push(['incident-reports-value', incidents.length, 'report']);
            }
            if (this.dashboardCan('nearmiss')) {
                totalReports += nearmiss.length;
                rows.push(['nearmiss-reports-value', nearmiss.length, 'report']);
            }
            if (this.dashboardCan('periodic-inspections')) {
                totalReports += inspections.length;
                rows.push(['inspections-reports-value', inspections.length, 'report']);
            }
            if (this.dashboardCan('training')) {
                totalReports += training.length;
                rows.push(['training-sessions-value', training.length, 'report']);
            }
            if (this.dashboardCan('violations')) {
                totalReports += violations.length;
                rows.push(['violations-value', violations.length, 'report']);
            }
            if (this.dashboardCan('contractors')) {
                const approvedContractors = Array.isArray(data.approvedContractors) ? data.approvedContractors : [];
                rows.push(['approved-contractors-value', this.getUniqueApprovedContractorsCount(approvedContractors), 'report']);
            }
            if (this.dashboardCan('ptw')) {
                totalReports += ptwCount;
                rows.push(['ptw-reports-value', ptwCount, 'report']);
            }
            if (this.dashboardCan('iso')) {
                totalReports += audits.length;
                rows.push(['audits-value', audits.length, 'report']);
            }

            // ✅ إصابات العيادة (موظفين / مقاولين) — تُقرأ من AppState.appData.injuries
            // مع التفريق بحقل personType ('employee' vs 'contractor'/'external')
            if (this.dashboardCan('clinic')) {
                const injuries = Array.isArray(data.injuries) ? data.injuries : [];
                let employeeInjuries = 0;
                let contractorInjuries = 0;
                for (const inj of injuries) {
                    const pType = String((inj && inj.personType) || 'employee').toLowerCase().trim();
                    if (pType === 'employee') {
                        employeeInjuries++;
                    } else {
                        // أي شيء غير 'employee' يُعدّ ضمن مقاولين/عمالة خارجية
                        // (يتطابق مع منطق فلترة تبويب الإصابات في clinic.js السطر 2386-2388)
                        contractorInjuries++;
                    }
                }
                rows.push(['clinic-injuries-employee-value', employeeInjuries, 'report']);
                rows.push(['clinic-injuries-contractor-value', contractorInjuries, 'report']);
            }

            if (this.anyReportsStatisticVisibleForDashboard()) {
                rows.unshift(['total-reports-value', totalReports, 'report']);
            }

            const resourceConsumption = data.resourceConsumption || {};
            const electricityData = Array.isArray(resourceConsumption.electricity) ? resourceConsumption.electricity : [];
            const waterData = Array.isArray(resourceConsumption.water) ? resourceConsumption.water : [];
            const gasData = Array.isArray(resourceConsumption.gas) ? resourceConsumption.gas : [];

            if (this.dashboardCan('sustainability')) {
                const electricityTotal = electricityData.reduce((sum, record) => sum + (parseFloat(record.totalConsumption) || 0), 0);
                const waterTotal = waterData.reduce((sum, record) => sum + (parseFloat(record.totalConsumption) || 0), 0);
                const gasTotal = gasData.reduce((sum, record) => sum + (parseFloat(record.totalConsumption) || 0), 0);
                rows.push(
                    ['electricity-consumption-value', electricityTotal, 'consumption'],
                    ['water-consumption-value', waterTotal, 'consumption'],
                    ['gas-consumption-value', gasTotal, 'consumption']
                );
            }

            return rows;
        } catch (error) {
            Utils.safeWarn('⚠️ خطأ في حساب تحديثات التقارير والإحصائيات:', error);
            return null;
        }
    },

    getUniqueApprovedContractorsCount(approvedContractors = []) {
        if (!Array.isArray(approvedContractors) || approvedContractors.length === 0) {
            return 0;
        }

        const seen = new Set();
        approvedContractors.forEach(record => {
            if (!record) return;

            // استخدام نفس منطق الـ key المستخدم في موديول المقاولين للتوحيد
            const entityType = String(record.entityType || record.type || '').trim().toLowerCase();
            const normalizedName = String(record.companyName || record.name || '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
            const normalizedCode = String(record.code || record.isoCode || '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
            const normalizedLinkedId = String(record.contractorId || record.id || '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();

            const key = `${entityType}::${normalizedName || normalizedCode || normalizedLinkedId}`;

            if (key && key !== `${entityType}::`) {
                seen.add(key);
            }
        });

        return seen.size;
    },

    /**
     * تطبيق مصفوفة التحديثات على DOM (بدون استدعاء setupReportsStatisticsCardsClickHandlers لتجنب الوميض)
     */
    applyReportsStatisticsUpdates(updates) {
        if (!updates || !updates.length) return;
        const self = this;
        try {
            updates.forEach(function (row) {
                const id = row[0], value = row[1], kind = row[2];
                if (kind === 'consumption') {
                    self.updateConsumptionValue(id, value);
                } else {
                    self.updateReportValue(id, value);
                }
            });
        } catch (err) {
            if (typeof Utils !== 'undefined' && Utils.safeWarn) Utils.safeWarn('⚠️ خطأ في تطبيق قيم التقارير:', err);
        }
    },

    /**
     * تحديث قيم التقارير والإحصائيات مع دعم اللغة العربية والإنجليزية
     * يتم تجميع كل التحديثات في إطار رسم واحد (requestAnimationFrame) لمنع وميض الكروت
     */
    updateReportsStatistics() {
        const updates = this.getReportsStatisticsUpdates();
        if (!updates || !updates.length) return;
        requestAnimationFrame(() => this.applyReportsStatisticsUpdates(updates));
    },

    /**
     * تحديث قيمة تقرير مع تنسيق الأرقام
     * عناصر التقارير والإحصائيات منسقة في HTML/CSS فلا نغيّر class لتفادي وميض (مثل Inspections و TRIR).
     */
    updateReportValue(elementId, value) {
        if (!elementId) return;
        const element = document.getElementById(elementId);
        if (!element) {
            if (typeof Utils !== 'undefined' && Utils.safeWarn) Utils.safeWarn(`⚠️ العنصر ${elementId} غير موجود في DOM`);
            return;
        }
        try {
            const formattedValue = this.formatNumber(value);
            if (element.textContent !== formattedValue) {
                element.textContent = formattedValue;
            }
            if (element.dataset.reportFormatted !== 'true') {
                element.dataset.reportFormatted = 'true';
            }
        } catch (error) {
            Utils.safeWarn(`⚠️ خطأ في تحديث ${elementId}:`, error);
        }
    },

    /**
     * تحديث قيمة استهلاك مع تنسيق الأرقام العشرية
     * استهلاك الكهرباء/الغاز منسقان في HTML/CSS فلا نغيّر style/class لتفادي وميض.
     */
    updateConsumptionValue(elementId, value) {
        if (!elementId) return;
        const element = document.getElementById(elementId);
        if (!element) {
            if (typeof Utils !== 'undefined' && Utils.safeWarn) Utils.safeWarn(`⚠️ العنصر ${elementId} غير موجود في DOM`);
            return;
        }
        try {
            const numValue = Number(value);
            const formattedValue = isNaN(numValue) || !isFinite(numValue)
                ? '0.00'
                : numValue.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                    useGrouping: true
                });
            if (element.textContent !== formattedValue) {
                element.textContent = formattedValue;
            }
            const isReportsSectionConsumption = (elementId === 'electricity-consumption-value' || elementId === 'gas-consumption-value');
            if (element.dataset.consumptionFormatted !== 'true') {
                if (isReportsSectionConsumption) {
                    element.dataset.consumptionFormatted = 'true';
                } else {
                    element.setAttribute('dir', 'ltr');
                    element.style.direction = 'ltr';
                    element.style.textAlign = 'left';
                    element.style.unicodeBidi = 'embed';
                    element.style.fontVariantNumeric = 'tabular-nums';
                    element.style.fontFeatureSettings = '"tnum"';
                    element.classList.add('english-number');
                    element.dataset.consumptionFormatted = 'true';
                }
            }
        } catch (error) {
            Utils.safeWarn(`⚠️ خطأ في تحديث ${elementId}:`, error);
        }
    },

    /**
     * تنسيق الأرقام بالإنجليزية مع دعم الفواصل
     */
    formatNumber(number, fractionDigits = 0) {
        // التحقق من القيم الفارغة أو غير الصالحة
        if (number === null || number === undefined) {
            return fractionDigits > 0 ? Number(0).toFixed(fractionDigits) : '0';
        }
        
        // التحقق من أن القيمة رقمية
        const numValue = Number(number);
        if (isNaN(numValue) || !isFinite(numValue)) {
            return fractionDigits > 0 ? Number(0).toFixed(fractionDigits) : '0';
        }
        
        const digits = Number.isFinite(fractionDigits) && fractionDigits >= 0 ? fractionDigits : 0;
        return numValue.toLocaleString('en-US', {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
            useGrouping: true
        });
    },

    /**
     * تطبيق تنسيق الأرقام الإنجليزية على عنصر DOM
     * عناصر مؤشرات السلامة (fr/far/afr/trir/md/ir/sr/lti-value) منسقة بالكامل في CSS فلا نغيّر class/style لتفادي وميض.
     */
    applyEnglishNumberFormat(element) {
        if (!element) return;
        if (element.dataset.numberFormatted === 'true') return;
        const id = element.id || '';
        const isSafetyMetricValue = (
            id === 'fr-value' || id === 'far-value' || id === 'afr-value' ||
            id === 'trir-value' || id === 'md-value' || id === 'ir-value' ||
            id === 'sr-value' || id === 'lti-value'
        );
        try {
            if (isSafetyMetricValue) {
                element.dataset.numberFormatted = 'true';
                return;
            }
            element.classList.add('english-number');
            element.setAttribute('dir', 'ltr');
            element.style.direction = 'ltr';
            element.style.textAlign = 'left';
            element.style.fontVariantNumeric = 'tabular-nums';
            element.dataset.numberFormatted = 'true';
        } catch (error) {
            Utils.safeWarn('⚠️ خطأ في تطبيق تنسيق الأرقام الإنجليزية:', error);
        }
    },

    /**
     * حساب الوقت المنقضي
     */
    getTimeAgo(date) {
        if (!date) return 'تاريخ غير محدد';

        const now = new Date();
        const past = new Date(date);

        // التحقق من صحة التاريخ
        if (isNaN(past.getTime())) return 'تاريخ غير صحيح';

        const diff = now - past;

        // إذا كان التاريخ في المستقبل، إرجاع رسالة مناسبة
        if (diff < 0) return 'في المستقبل';

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 1) return 'الآن';
        if (minutes < 60) return `منذ ${minutes} دقيقة`;
        if (hours < 24) return `منذ ${hours} ساعة`;
        return `منذ ${days} يوم`;
    },

    /**
     * تحميل الرسوم البيانية التفاعلية
     */
    loadCharts() {
        let container = document.getElementById('dashboard-charts');
        if (!container) {
            const dashboardSection = document.getElementById('dashboard-section');
            if (dashboardSection) {
                const chartsDiv = document.createElement('div');
                chartsDiv.id = 'dashboard-charts';
                chartsDiv.className = 'mt-6';
                dashboardSection.appendChild(chartsDiv);
                container = chartsDiv;
            } else {
                return;
            }
        }

        const showIncidents = this.dashboardCan('incidents');
        const showPtw = this.dashboardCan('ptw');
        const showTraining = this.dashboardCan('training');
        if (!showIncidents && !showPtw && !showTraining) {
            container.innerHTML = '';
            container.classList.remove('dashboard-charts-root');
            return;
        }

        container.classList.add('dashboard-charts-root');

        const data = AppState.appData || {};
        const now = new Date();
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const incidentsByDate = {};
        const ptwByDate = {};
        const trainingByDate = {};

        const toLocalDateKey = (raw) => {
            const x = new Date(raw);
            if (isNaN(x.getTime())) return null;
            const y = x.getFullYear();
            const m = String(x.getMonth() + 1).padStart(2, '0');
            const d = String(x.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        // ✅ مستخرج تاريخ مرن للحوادث (يدعم date, incidentDate, createdAt, updatedAt)
        const getIncidentDate = (rec) => {
            if (!rec) return null;
            const candidates = [rec.date, rec.incidentDate, rec.createdAt, rec.updatedAt, rec.reportDate];
            for (const v of candidates) {
                if (!v) continue;
                const d = new Date(v);
                if (!isNaN(d.getTime())) return d;
            }
            return null;
        };

        // ✅ نتيجة الفلترة المُستخدَمة في كلا الكارتين (نفس النافذة الزمنية)
        const incidentsLast30 = (data.incidents || []).filter(i => {
            const d = getIncidentDate(i);
            return d && d >= last30Days;
        });

        if (showIncidents) {
            // ✅ مفاتيح بصيغة YYYY-MM-DD للتوافق مع renderTrendBarList
            incidentsLast30.forEach(i => {
                const k = toLocalDateKey(getIncidentDate(i));
                if (k) incidentsByDate[k] = (incidentsByDate[k] || 0) + 1;
            });
        }

        if (showPtw) {
            const ptwData = (data.ptw || []).filter(p => {
                const t = new Date(p.createdAt || p.startDate);
                return !isNaN(t.getTime()) && t >= last30Days;
            });
            ptwData.forEach(p => {
                const k = toLocalDateKey(p.createdAt || p.startDate);
                if (k) ptwByDate[k] = (ptwByDate[k] || 0) + 1;
            });
        }

        if (showTraining) {
            const trainingData = (data.training || []).filter(t => {
                const d = new Date(t.createdAt || t.startDate);
                return !isNaN(d.getTime()) && d >= last30Days;
            });
            trainingData.forEach(t => {
                const k = toLocalDateKey(t.createdAt || t.startDate);
                if (k) trainingByDate[k] = (trainingByDate[k] || 0) + 1;
            });
        }

        const sections = [];

        if (showIncidents) {
            sections.push(`
            <div class="dashboard-charts-grid-row">
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-chart-line ml-2"></i>
                            ${this.t('dash.chartIncidents30d', 'Incidents - آخر 30 يوم')}
                        </h2>
                    </div>
                    <div class="card-body">
                        <div class="chart-container dash-chart-container--trend">
                            ${this.renderTrendBarList(incidentsByDate, 'حادثاً مسجلاً', 'incidents')}
                        </div>
                    </div>
                </div>
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-chart-pie ml-2"></i>
                            ${this.t('dash.chartIncidentsBySeverity', 'توزيع Incidents حسب الخطورة')}
                        </h2>
                    </div>
                    <div class="card-body">
                        <div class="chart-container" style="min-height: 250px; position: relative;">
                            ${this.renderSeverityChart(incidentsLast30)}
                        </div>
                    </div>
                </div>
            </div>`);
        }

        const row2 = [];
        if (showPtw) {
            row2.push(`
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-chart-bar ml-2"></i>
                            ${this.t('dash.chartPtw30d', 'Work Permits - آخر 30 يوم')}
                        </h2>
                    </div>
                    <div class="card-body">
                        <div class="chart-container dash-chart-container--trend">
                            ${this.renderTrendBarList(ptwByDate, 'تصريحاً مسجلاً', 'ptw')}
                        </div>
                    </div>
                </div>`);
        }
        if (showTraining) {
            row2.push(`
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-chart-area ml-2"></i>
                            ${this.t('dash.chartTraining30d', 'Training - آخر 30 يوم')}
                        </h2>
                    </div>
                    <div class="card-body">
                        <div class="chart-container dash-chart-container--trend">
                            ${this.renderTrendBarList(trainingByDate, 'نشاطاً تدريبياً', 'training')}
                        </div>
                    </div>
                </div>`);
        }
        if (row2.length > 0) {
            sections.push(`<div class="dashboard-charts-grid-row">${row2.join('')}</div>`);
        }

        container.innerHTML = sections.join('');

        setTimeout(() => {
            this.renderSimpleCharts();
        }, 100);
    },

    /**
     * تطبيع قيمة الخطورة → 'high' | 'medium' | 'low' | 'unknown'
     * يدعم العربية والإنجليزية معاً ولا يفترض أن المجهول = منخفض.
     */
    _normalizeIncidentSeverity(raw) {
        const v = String(raw || '').trim().toLowerCase();
        if (!v) return 'unknown';
        if (v.includes('عالي') || v.includes('عاليه') || v.includes('حرج') || v.includes('high') || v.includes('critical')) return 'high';
        if (v.includes('متوسط') || v.includes('medium') || v.includes('moderate')) return 'medium';
        if (v.includes('منخفض') || v.includes('بسيط') || v.includes('low') || v.includes('minor')) return 'low';
        return 'unknown';
    },

    renderSeverityChart(incidents) {
        // ✅ تطبيع موحَّد للخطورة + bucket مستقل للمجهول
        const counts = { high: 0, medium: 0, low: 0, unknown: 0 };
        (incidents || []).forEach(i => {
            const k = this._normalizeIncidentSeverity(i && i.severity);
            counts[k]++;
        });

        const total = counts.high + counts.medium + counts.low + counts.unknown;
        if (total === 0) {
            return `<div class="empty-state"><p class="text-gray-500">${this.t('dash.noData30d', 'لا توجد بيانات في آخر 30 يوماً')}</p></div>`;
        }

        const pct = (n) => total > 0 ? (n / total) * 100 : 0;
        const row = (labelAr, value, percent, barClass, textClass) => `
                <div class="space-y-1.5">
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-semibold">${labelAr}</span>
                        <span class="text-sm font-bold ${textClass}" dir="ltr">${value} <span class="text-xs text-gray-400">(${percent.toFixed(1)}%)</span></span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-3">
                        <div class="${barClass} h-3 rounded-full transition-all duration-500" style="width: ${percent}%"></div>
                    </div>
                </div>`;

        // ✅ يُعرض bucket "غير محدد" فقط لو فيه قيم — لا يظهر كصف فارغ
        const unknownRow = counts.unknown > 0
            ? row('غير محدد', counts.unknown, pct(counts.unknown), 'bg-gray-400', 'text-gray-600')
            : '';

        return `
            <div class="flex flex-col gap-3">
                <div class="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">
                    <span>إجمالي الحوادث (آخر 30 يوم)</span>
                    <span class="text-gray-700" dir="ltr">${total}</span>
                </div>
                ${row('عالي / حرج', counts.high, pct(counts.high), 'bg-red-600', 'text-red-600')}
                ${row('متوسط', counts.medium, pct(counts.medium), 'bg-yellow-600', 'text-yellow-600')}
                ${row('منخفض', counts.low, pct(counts.low), 'bg-green-600', 'text-green-600')}
                ${unknownRow}
            </div>
        `;
    },

    /**
     * مخطط يومي واضح: تاريخ مقروء + شريط نسبي + الرقم الفعلي (آخر 14 يوماً ببيانات ضمن النافذة).
     * المفاتيح متوقعة بصيغة YYYY-MM-DD لفرز زمني صحيح.
     */
    renderTrendBarList(dataByDateIso, unitPhrase, variant = 'ptw') {
        const keys = Object.keys(dataByDateIso || {}).sort();
        if (keys.length === 0) {
            return `<div class="dash-trend-empty"><p class="dash-trend-empty__text">${this.t('dash.noData30d', 'لا توجد بيانات في آخر 30 يوماً')}</p></div>`;
        }

        const windowKeys = keys.slice(-14);
        const values = windowKeys.map((k) => dataByDateIso[k] || 0);
        const total = values.reduce((a, b) => a + b, 0);
        const maxValue = Math.max(...values, 1);

        const formatTrendDayLabel = (isoKey) => {
            const parts = isoKey.split('-').map(Number);
            if (parts.length !== 3 || parts.some((n) => !n)) return isoKey;
            const dt = new Date(parts[0], parts[1] - 1, parts[2]);
            return dt.toLocaleDateString('ar-SA', {
                weekday: 'short',
                month: 'numeric',
                day: 'numeric'
            });
        };

        const rows = windowKeys.map((isoKey) => {
            const value = dataByDateIso[isoKey] || 0;
            const pct = Math.round((value / maxValue) * 100);
            const label = formatTrendDayLabel(isoKey);
            return `
                <li class="dash-trend-row">
                    <span class="dash-trend-date">${label}</span>
                    <div class="dash-trend-track" role="presentation">
                        <div class="dash-trend-fill" style="width: ${pct}%"></div>
                    </div>
                    <span class="dash-trend-count" dir="ltr" title="${unitPhrase}">${value}</span>
                </li>`;
        }).join('');

        const variantClass = variant === 'training' ? ' dash-trend-chart--training' : ' dash-trend-chart--ptw';

        return `
            <div class="dash-trend-chart${variantClass}" dir="rtl">
                <div class="dash-trend-summary">
                    <span class="dash-trend-summary__label">مجموع الأيام المعروضة</span>
                    <strong class="dash-trend-summary__value" dir="ltr">${total}</strong>
                </div>
                <p class="dash-trend-hint">كل صف يمثل يوماً واحداً: الطول النسبي مقارنة بأعلى يوم في هذه الفترة، والرقم يمثل ${unitPhrase} في ذلك اليوم.</p>
                <ul class="dash-trend-rows">${rows}</ul>
            </div>`;
    },

    renderSimpleCharts() {
        // يمكن إضافة مكتبة Chart.js هنا لرسوم بيانية أكثر تفصيلاً
        if (typeof Utils !== 'undefined' && Utils.safeLog) {
            Utils.safeLog('الرسوم البيانية جاهزة');
        }
    }
};
// تصدير Dashboard للتوافق مع الكود القديم
if (typeof window !== "undefined") {
    window.Dashboard = window.Dashboard || Dashboard;
}
