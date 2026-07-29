/**
 * compliance-reports.js — light compliance report studio + ISO 45001 checklist seed.
 */
const ComplianceReports = {
    SECTION_ID: 'hse-compliance-section',

    ensureChecklists() {
        if (!AppState.appData.complianceChecklists) AppState.appData.complianceChecklists = [];
        if (AppState.appData.complianceChecklists.length) return;
        const seed = [
            { id: 'ISO45001-4.1', clause: '4.1', titleAr: 'فهم المنظمة وسياقها', titleEn: 'Context of the organization', status: 'open' },
            { id: 'ISO45001-5.1', clause: '5.1', titleAr: 'القيادة والالتزام', titleEn: 'Leadership and commitment', status: 'open' },
            { id: 'ISO45001-6.1', clause: '6.1', titleAr: 'إجراءات معالجة المخاطر والفرص', titleEn: 'Actions to address risks and opportunities', status: 'open' },
            { id: 'ISO45001-8.1', clause: '8.1', titleAr: 'التخطيط والتحكم التشغيلي', titleEn: 'Operational planning and control', status: 'open' },
            { id: 'ISO45001-9.1', clause: '9.1', titleAr: 'المراقبة والقياس والتحليل', titleEn: 'Monitoring, measurement, analysis', status: 'open' },
            { id: 'ISO45001-10.2', clause: '10.2', titleAr: 'عدم المطابقة والإجراء التصحيحي', titleEn: 'Nonconformity and corrective action', status: 'open' }
        ].map((r) => Object.assign({ framework: 'ISO45001', updatedAt: new Date().toISOString() }, r));
        AppState.appData.complianceChecklists = seed;
    },

    filterSite(rows) {
        if (window.SaaSOrgSites && SaaSOrgSites.filterBySite) return SaaSOrgSites.filterBySite(rows);
        return rows || [];
    },

    summary() {
        const incidents = this.filterSite(AppState.appData.incidents || []);
        const capa = window.SaaSCAPA ? SaaSCAPA.list({}) : this.filterSite(AppState.appData.actionTrackingRegister || []);
        const training = this.filterSite(AppState.appData.training || []);
        const ptw = this.filterSite(AppState.appData.ptw || AppState.appData.ptwRegistry || []);
        const now = new Date();
        const month = now.toISOString().slice(0, 7);
        const incidentsMonth = incidents.filter((i) => String(i.date || i.incidentDate || i.createdAt || '').startsWith(month));
        const capaOpen = capa.filter((c) => !['Closed', 'مغلق'].includes(String(c.status || '')));
        const capaOverdue = window.SaaSCAPA ? SaaSCAPA.list({ overdueOnly: true }) : [];
        const trainingDue = training.filter((t) => {
            const exp = String(t.expiryDate || t.expiry || '').slice(0, 10);
            return exp && exp <= now.toISOString().slice(0, 10);
        });
        const ptwOpen = ptw.filter((p) => {
            const st = String(p.status || p.permitStatus || '').toLowerCase();
            return st.includes('open') || st.includes('مفتوح') || st.includes('active') || st.includes('pending');
        });
        return {
            incidentsMonth: incidentsMonth.length,
            capaOpen: capaOpen.length,
            capaOverdue: capaOverdue.length,
            trainingExpired: trainingDue.length,
            ptwOpen: ptwOpen.length
        };
    },

    renderInto(container) {
        if (!container) return;
        this.ensureChecklists();
        const s = this.summary();
        const checks = AppState.appData.complianceChecklists || [];
        container.innerHTML = `
          <div id="${this.SECTION_ID}" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-4">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h4 class="text-lg font-semibold flex items-center"><i class="fas fa-file-shield ml-2 text-indigo-700"></i>استوديو تقارير الامتثال</h4>
              <button type="button" id="hse-compliance-export" class="btn-primary"><i class="fas fa-file-export ml-2"></i>تصدير تقرير شهري</button>
            </div>
            <div class="hse-exec-board mb-4">
              <div class="hse-exec-card"><div class="hse-exec-card__label">حوادث هذا الشهر</div><div class="hse-exec-card__value">${s.incidentsMonth}</div></div>
              <div class="hse-exec-card"><div class="hse-exec-card__label">CAPA مفتوح</div><div class="hse-exec-card__value">${s.capaOpen}</div></div>
              <div class="hse-exec-card"><div class="hse-exec-card__label">CAPA متأخر</div><div class="hse-exec-card__value">${s.capaOverdue}</div></div>
              <div class="hse-exec-card"><div class="hse-exec-card__label">تدريب منتهٍ</div><div class="hse-exec-card__value">${s.trainingExpired}</div></div>
              <div class="hse-exec-card"><div class="hse-exec-card__label">PTW مفتوح</div><div class="hse-exec-card__value">${s.ptwOpen}</div></div>
            </div>
            <h5 class="font-semibold mb-2">قائمة تحقق ISO 45001 (مختصرة)</h5>
            <ul class="text-sm space-y-1 mb-3">
              ${checks.map((c) => `<li><span class="hse-site-chip">${c.clause}</span> ${this.esc(c.titleAr)} — <em>${this.esc(c.status)}</em></li>`).join('')}
            </ul>
            <div id="hse-capa-overdue-widget"></div>
          </div>`;
        container.querySelector('#hse-compliance-export')?.addEventListener('click', () => this.exportMonthly());
        if (window.SaaSCAPA) SaaSCAPA.renderOverdueWidget(container.querySelector('#hse-capa-overdue-widget'));
    },

    esc(s) {
        return String(s || '').replace(/</g, '&lt;');
    },

    exportMonthly() {
        const s = this.summary();
        const brand = window.SaaSReportBrand;
        const title = 'تقرير امتثال شهري';
        const body = `
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%">
            <tr><th>المؤشر</th><th>القيمة</th></tr>
            <tr><td>حوادث هذا الشهر</td><td>${s.incidentsMonth}</td></tr>
            <tr><td>CAPA مفتوح</td><td>${s.capaOpen}</td></tr>
            <tr><td>CAPA متأخر</td><td>${s.capaOverdue}</td></tr>
            <tr><td>تدريب منتهٍ</td><td>${s.trainingExpired}</td></tr>
            <tr><td>PTW مفتوح</td><td>${s.ptwOpen}</td></tr>
          </table>`;
        const html = brand ? brand.wrapPrintHtml(title, body) : body;
        const w = window.open('', '_blank');
        if (w) {
            w.document.write(html);
            w.document.close();
            w.focus();
            setTimeout(() => w.print(), 400);
        }
        if (window.AuditLog) AuditLog.log('compliance_export', 'compliance', 'monthly', s);
    }
};

if (typeof window !== 'undefined') window.ComplianceReports = ComplianceReports;
