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
            host.className = 'hse-exec-panel';
            const afterHeader = container.querySelector('.section-header');
            if (afterHeader && afterHeader.nextSibling) {
                container.insertBefore(host, afterHeader.nextSibling);
            } else {
                container.insertBefore(host, container.firstChild);
            }
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
            bySite,
            overdueCount: overdue.length,
            hours
        };
    },

    _tone(key, value) {
        if (key === 'trainingLate') return Number(value) > 0 ? 'warn' : 'ok';
        if (key === 'capaOnTimePct') return Number(value) < 70 ? 'warn' : Number(value) >= 90 ? 'ok' : 'neutral';
        if (key === 'capaClosedPct') return Number(value) >= 80 ? 'ok' : Number(value) < 50 ? 'warn' : 'neutral';
        if (key === 'incidents') return Number(value) > 0 ? 'alert' : 'ok';
        return 'neutral';
    },

    render(host) {
        const m = this.compute();
        const brand = (window.SaaSBrand && SaaSBrand.getAppName && SaaSBrand.getAppName()) || 'HSEHub 360';
        const logo = (window.SaaSBrand && SaaSBrand.getDefaultLogoUrl && SaaSBrand.getDefaultLogoUrl()) || 'assets/brand/logo.png';
        const siteBits = Object.keys(m.bySite)
            .slice(0, 8)
            .map((sid) => {
                const site = window.SaaSOrgSites && SaaSOrgSites.getSite(sid);
                const label = site ? site.name : sid === 'unassigned' ? 'غير معيّن' : sid;
                return `<span class="hse-site-chip"><i class="fas fa-map-marker-alt" aria-hidden="true"></i>${label}<strong>${m.bySite[sid]}</strong></span>`;
            })
            .join('');

        const cards = [
            { key: 'incidents', icon: 'fa-exclamation-triangle', label: 'إجمالي الحوادث', hint: 'ضمن نطاق الموقع الحالي', value: m.incidents, suffix: '' },
            { key: 'trir', icon: 'fa-chart-area', label: 'TRIR تقريبي', hint: 'لكل 200 ألف ساعة عمل', value: m.trir, suffix: '' },
            { key: 'capaClosedPct', icon: 'fa-clipboard-check', label: 'إغلاق CAPA', hint: 'من إجمالي الإجراءات', value: m.capaClosedPct, suffix: '%' },
            { key: 'capaOnTimePct', icon: 'fa-clock', label: 'CAPA في الموعد', hint: m.overdueCount ? `${m.overdueCount} متأخر` : 'بدون تأخير ظاهر', value: m.capaOnTimePct, suffix: '%' },
            { key: 'trainingLate', icon: 'fa-user-graduate', label: 'تدريب متأخر', hint: 'انتهت صلاحيته', value: m.trainingLate, suffix: '' }
        ];

        host.className = 'hse-exec-panel';
        host.innerHTML = `
          <div class="hse-exec-panel__head">
            <div class="hse-exec-panel__brand">
              <img class="hse-exec-panel__logo" src="${logo}" alt="" width="40" height="40" />
              <div class="hse-exec-panel__titles">
                <span class="hse-exec-panel__eyebrow"><i class="fas fa-shield-alt" aria-hidden="true"></i> ${brand}</span>
                <h3 class="hse-exec-panel__title">لوحة الأداء التنفيذية</h3>
                <p class="hse-exec-panel__sub">مؤشرات سلامة مركّزة حسب نطاق الموقع — TRIR وCAPA والتدريب</p>
              </div>
            </div>
            <button type="button" class="hse-exec-panel__refresh" id="hse-exec-refresh" title="تحديث">
              <i class="fas fa-sync-alt" aria-hidden="true"></i>
              <span>تحديث</span>
            </button>
          </div>
          <div class="hse-exec-board hse-exec-board--dashboard" role="list">
            ${cards.map((c) => {
                const tone = this._tone(c.key, c.value);
                const display = c.suffix && c.value !== '—' ? `${c.value}${c.suffix}` : c.value;
                return `<article class="hse-exec-card hse-exec-card--${tone}" role="listitem" data-metric="${c.key}">
                  <div class="hse-exec-card__top">
                    <span class="hse-exec-card__icon" aria-hidden="true"><i class="fas ${c.icon}"></i></span>
                    <span class="hse-exec-card__label">${c.label}</span>
                  </div>
                  <div class="hse-exec-card__value" dir="ltr">${display}</div>
                  <div class="hse-exec-card__hint">${c.hint}</div>
                </article>`;
            }).join('')}
          </div>
          <div class="hse-exec-panel__sites">
            <div class="hse-exec-panel__sites-label"><i class="fas fa-building" aria-hidden="true"></i> الحوادث حسب الموقع</div>
            <div class="hse-exec-panel__sites-row">${siteBits || '<span class="hse-exec-panel__empty">لا تفصيل مواقع بعد</span>'}</div>
          </div>`;
        host.querySelector('#hse-exec-refresh')?.addEventListener('click', () => this.render(host));
    }
};

if (typeof window !== 'undefined') window.ExecutiveKPI = ExecutiveKPI;
