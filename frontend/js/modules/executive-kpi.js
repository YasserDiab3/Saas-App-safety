/**
 * executive-kpi.js — executive KPI board for dashboard (site-aware).
 */
const ExecutiveKPI = {
    mount(container) {
        if (!container) return;
        let host = container.querySelector('#hse-executive-board');
        if (!host) {
            host = document.createElement('div');
            host.id = 'hse-executive-board';
            container.insertBefore(host, container.firstChild);
        }
        this.render(host);
    },

    compute() {
        const filter = (rows) => (window.SaaSOrgSites ? SaaSOrgSites.filterBySite(rows || []) : rows || []);
        const incidents = filter(AppState.appData.incidents || []);
        const capa = window.SaaSCAPA ? SaaSCAPA.list({}) : filter(AppState.appData.actionTrackingRegister || []);
        const closed = capa.filter((c) => ['Closed', 'مغلق'].includes(String(c.status || '')));
        const overdue = window.SaaSCAPA ? SaaSCAPA.list({ overdueOnly: true }) : [];
        const training = filter(AppState.appData.training || []);
        const now = new Date().toISOString().slice(0, 10);
        const trainingLate = training.filter((t) => {
            const exp = String(t.expiryDate || t.expiry || '').slice(0, 10);
            return exp && exp < now;
        });
        const hours = Number(
            (AppState.appData.companySettings &&
                (Array.isArray(AppState.appData.companySettings)
                    ? AppState.appData.companySettings[0]
                    : AppState.appData.companySettings)?.workedHoursYtd) || 0
        );
        const recordables = incidents.filter((i) => {
            const sev = String(i.severity || i.classification || '').toLowerCase();
            return sev.includes('recordable') || sev.includes('lost') || sev.includes('lt i') || sev.includes('إصابة');
        });
        const trir = hours > 0 ? ((recordables.length * 200000) / hours).toFixed(2) : '—';
        const capaOnTimePct =
            capa.length === 0 ? 100 : Math.round(((capa.length - overdue.length) / capa.length) * 100);
        const bySite = {};
        incidents.forEach((i) => {
            const sid = (window.SaaSOrgSites && SaaSOrgSites.recordSiteId(i)) || 'unassigned';
            bySite[sid] = (bySite[sid] || 0) + 1;
        });
        return {
            incidents: incidents.length,
            trir,
            capaClosedPct: capa.length ? Math.round((closed.length / capa.length) * 100) : 0,
            capaOnTimePct,
            trainingLate: trainingLate.length,
            bySite
        };
    },

    render(host) {
        const m = this.compute();
        const siteBits = Object.keys(m.bySite)
            .slice(0, 6)
            .map((sid) => {
                const site = window.SaaSOrgSites && SaaSOrgSites.getSite(sid);
                const label = site ? site.name : sid === 'unassigned' ? 'غير معيّن' : sid;
                return `<span class="hse-site-chip">${label}: ${m.bySite[sid]}</span>`;
            })
            .join(' ');
        host.innerHTML = `
          <div class="mb-2 flex items-center justify-between flex-wrap gap-2">
            <h3 class="text-base font-bold text-slate-800 m-0"><i class="fas fa-chart-line ml-2"></i>لوحة الأداء التنفيذية</h3>
            <button type="button" class="btn-secondary text-sm" id="hse-exec-refresh">تحديث</button>
          </div>
          <div class="hse-exec-board">
            <div class="hse-exec-card"><div class="hse-exec-card__label">إجمالي الحوادث (النطاق)</div><div class="hse-exec-card__value">${m.incidents}</div></div>
            <div class="hse-exec-card"><div class="hse-exec-card__label">TRIR تقريبي</div><div class="hse-exec-card__value">${m.trir}</div></div>
            <div class="hse-exec-card"><div class="hse-exec-card__label">إغلاق CAPA %</div><div class="hse-exec-card__value">${m.capaClosedPct}%</div></div>
            <div class="hse-exec-card"><div class="hse-exec-card__label">CAPA في الموعد %</div><div class="hse-exec-card__value">${m.capaOnTimePct}%</div></div>
            <div class="hse-exec-card"><div class="hse-exec-card__label">تدريب متأخر</div><div class="hse-exec-card__value">${m.trainingLate}</div></div>
          </div>
          <div class="text-sm text-slate-600 mb-3 flex flex-wrap gap-2">${siteBits || '<span class="text-slate-400">لا تفصيل مواقع بعد</span>'}</div>`;
        host.querySelector('#hse-exec-refresh')?.addEventListener('click', () => this.render(host));
    }
};

if (typeof window !== 'undefined') window.ExecutiveKPI = ExecutiveKPI;
