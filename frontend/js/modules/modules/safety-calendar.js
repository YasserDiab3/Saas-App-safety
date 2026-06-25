/**
 * Safety Calendar Module — global HSE + Egypt default seeds.
 */
const SafetyCalendar = {
    state: {
        view: 'month',
        scopeFilter: 'all',
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
        selectedDate: new Date().toISOString().slice(0, 10)
    },
    _feedCache: null,
    _feedCacheAt: 0,

    t(key, fallback) {
        if (typeof I18n !== 'undefined' && I18n.t) {
            const v = I18n.t(key);
            if (v && v !== key) return v;
        }
        return fallback || key;
    },

    esc(v) {
        return (typeof Utils !== 'undefined' && Utils.escapeHTML)
            ? Utils.escapeHTML(String(v ?? ''))
            : String(v ?? '');
    },

    events() {
        const list = AppState.appData?.safetyCalendarEvents;
        return Array.isArray(list) ? list : [];
    },

    feedEvents() {
        const now = Date.now();
        if (!this._feedCache || now - this._feedCacheAt > 15000) {
            this._feedCache = (typeof window.SafetyCalendarFeed !== 'undefined' && SafetyCalendarFeed.buildEvents)
                ? SafetyCalendarFeed.buildEvents()
                : [];
            this._feedCacheAt = now;
        }
        return this._feedCache;
    },

    invalidateFeedCache() {
        this._feedCache = null;
        this._feedCacheAt = 0;
    },

    allEvents() {
        return this.events().concat(this.feedEvents());
    },

    displayTitle(ev) {
        const en = AppState.currentLanguage === 'en';
        return (en && ev.titleEn) ? ev.titleEn : (ev.title || ev.titleEn || '—');
    },

    isModuleEvent(ev) {
        return ev && (ev.source === 'feed' || ev.scope === 'module');
    },

    isOccasionEvent(ev) {
        return ev && !this.isModuleEvent(ev);
    },

    isAdmin() {
        return typeof Permissions !== 'undefined' && Permissions.isCurrentUserAdmin && Permissions.isCurrentUserAdmin();
    },

    formatDate(iso) {
        if (!iso) return '—';
        try {
            if (typeof Utils !== 'undefined' && Utils.formatDate) return Utils.formatDate(iso);
        } catch (_e) { /* ignore */ }
        return iso;
    },

    eventColor(ev) {
        if (ev.color) return ev.color;
        const map = {
            holiday: '#059669',
            occasion: '#D97706',
            hse_event: '#2563EB',
            custom: '#64748B',
            module_ptw: '#EA580C',
            module_training: '#2563EB',
            module_incident: '#DC2626',
            module_nearmiss: '#D97706',
            module_violation: '#9333EA',
            module_observation: '#0D9488',
            module_task: '#4F46E5',
            module_inspection: '#0891B2',
            module_behavior: '#CA8A04',
            module_emergency: '#EF4444',
            module_clinic: '#DB2777',
            module_risk: '#B45309'
        };
        if (ev.scope === 'country') return '#7C3AED';
        return map[ev.eventType] || '#64748B';
    },

    eventIcon(ev) {
        if (ev.icon) return ev.icon;
        const map = {
            holiday: 'fa-umbrella-beach',
            occasion: 'fa-star',
            hse_event: 'fa-globe',
            custom: 'fa-calendar-plus'
        };
        return map[ev.eventType] || 'fa-circle';
    },

    typeLabel(ev) {
        if (ev.moduleLabel) return ev.moduleLabel;
        const key = `module.safetyCalendar.type_${ev.eventType || 'custom'}`;
        const fallbacks = {
            holiday: this.t('module.safetyCalendar.legHoliday', 'إجازة'),
            occasion: this.t('module.safetyCalendar.legOccasion', 'مناسبة'),
            hse_event: this.t('module.safetyCalendar.legGlobal', 'عالمي HSE'),
            custom: this.t('module.safetyCalendar.filterCustom', 'مخصص')
        };
        const v = this.t(key, fallbacks[ev.eventType] || ev.eventType || '');
        return v === key ? (fallbacks[ev.eventType] || ev.eventType || '') : v;
    },

    eventDetailRows(ev) {
        const rows = [];
        const type = this.typeLabel(ev);
        if (type) rows.push({ icon: 'fa-tag', label: this.t('module.safetyCalendar.type', 'النوع'), value: type });
        if (ev.status) rows.push({ icon: 'fa-circle-info', label: this.t('module.safetyCalendar.status', 'الحالة'), value: ev.status });
        if (ev.priority) rows.push({ icon: 'fa-flag', label: this.t('module.safetyCalendar.priority', 'الأولوية'), value: ev.priority });
        if (ev.location) rows.push({ icon: 'fa-location-dot', label: this.t('module.safetyCalendar.location', 'الموقع'), value: ev.location });
        if (ev.assignee) rows.push({ icon: 'fa-user', label: this.t('module.safetyCalendar.assignee', 'المسؤول'), value: ev.assignee });
        if (!this.isModuleEvent(ev) && ev.scope) {
            rows.push({ icon: 'fa-globe', label: this.t('module.safetyCalendar.scope', 'النطاق'), value: ev.scope });
        }
        const dateLine = ev.endDate && ev.endDate !== ev.startDate
            ? `${this.formatDate(ev.startDate)} — ${this.formatDate(ev.endDate)}`
            : this.formatDate(ev.startDate);
        rows.push({ icon: 'fa-calendar-day', label: this.t('common.date', 'التاريخ'), value: dateLine });
        if (ev.description) rows.push({ icon: 'fa-align-right', label: this.t('common.description', 'الوصف'), value: ev.description });
        return rows;
    },

    renderEventDetailsHtml(ev, compact) {
        const rows = this.eventDetailRows(ev);
        if (!rows.length) return '';
        const cls = compact ? 'sc-ev-details sc-ev-details--compact' : 'sc-ev-details';
        return `<ul class="${cls}">${rows.map(r =>
            `<li><i class="fas ${r.icon}"></i><span class="sc-ev-detail-label">${this.esc(r.label)}:</span> <span class="sc-ev-detail-val">${this.esc(r.value)}</span></li>`
        ).join('')}</ul>`;
    },

    renderEventCard(ev, opts = {}) {
        const compact = !!opts.compact;
        const clickable = ev.link ? ` data-link="${this.esc(ev.link)}" role="link" tabindex="0"` : '';
        const tag = compact ? 'div' : 'article';
        const cls = `sc-event-card${this.isModuleEvent(ev) ? ' sc-event-card--module' : ''}${compact ? ' sc-event-card--compact' : ''}`;
        return `<${tag} class="${cls}"${clickable} style="--ev-color:${this.esc(this.eventColor(ev))}">
            <div class="sc-event-card-icon"><i class="fas ${this.esc(this.eventIcon(ev))}"></i></div>
            <div class="sc-event-card-body">
                <div class="sc-event-card-top">
                    <strong>${this.esc(this.displayTitle(ev))}</strong>
                    <span class="sc-type-badge">${this.esc(this.typeLabel(ev))}</span>
                </div>
                ${this.renderEventDetailsHtml(ev, compact)}
            </div>
            ${!compact && this.isAdmin() && !this.isModuleEvent(ev) ? `<div class="sc-list-card-actions">
                <button type="button" class="btn-xs btn-secondary sc-edit" data-id="${this.esc(ev.id)}">${this.t('common.edit', 'تعديل')}</button>
                <button type="button" class="btn-xs btn-danger sc-del" data-id="${this.esc(ev.id)}">${this.t('common.delete', 'حذف')}</button>
            </div>` : (ev.link ? `<span class="sc-list-go"><i class="fas fa-arrow-left"></i></span>` : '')}
        </${tag}>`;
    },

    renderMiniMonth(year, month, selectedDate) {
        const cells = this.monthMatrix(year, month);
        const today = new Date().toISOString().slice(0, 10);
        const weekDays = [
            this.t('module.safetyCalendar.sun', 'أحد'),
            this.t('module.safetyCalendar.mon', 'إثن'),
            this.t('module.safetyCalendar.tue', 'ثل'),
            this.t('module.safetyCalendar.wed', 'أرب'),
            this.t('module.safetyCalendar.thu', 'خم'),
            this.t('module.safetyCalendar.fri', 'جم'),
            this.t('module.safetyCalendar.sat', 'سب')
        ];
        let html = '<div class="sc-mini-grid" role="grid">';
        weekDays.forEach(w => { html += `<div class="sc-mini-weekday">${this.esc(w.slice(0, 1))}</div>`; });
        cells.forEach(dateStr => {
            if (!dateStr) {
                html += '<div class="sc-mini-day sc-mini-day--empty"></div>';
                return;
            }
            const n = this.eventsOnDate(dateStr).length;
            const isToday = dateStr === today;
            const sel = dateStr === selectedDate;
            html += `<button type="button" class="sc-mini-day${isToday ? ' is-today' : ''}${sel ? ' is-selected' : ''}${n ? ' has-events' : ''}" data-dash-date="${dateStr}" aria-label="${dateStr}">`;
            html += `<span>${parseInt(dateStr.slice(8), 10)}</span>`;
            if (n) html += `<i class="sc-mini-dot" aria-hidden="true"></i>`;
            html += '</button>';
        });
        html += '</div>';
        return html;
    },

    async renderDashboardWidget(container) {
        if (!container) return;
        await this.ensureData();
        this.invalidateFeedCache();

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const today = now.toISOString().slice(0, 10);
        const monthName = now.toLocaleString(AppState.currentLanguage === 'en' ? 'en' : 'ar', { month: 'long', year: 'numeric' });

        const todayList = this.todayEvents();
        const upcoming = this.upcomingEvents(14).filter(ev => {
            const s = ev.startDate;
            return s && s > today;
        }).slice(0, 6);
        const weekEnd = new Date();
        weekEnd.setDate(weekEnd.getDate() + 7);
        const weekEndStr = weekEnd.toISOString().slice(0, 10);
        const weekCount = this.allEvents().filter(ev => {
            const s = ev.startDate;
            const e = ev.endDate || s;
            return s && e && s <= weekEndStr && e >= today;
        }).length;

        container.innerHTML = `
        <div class="sc-dash-widget">
            <div class="sc-dash-top">
                <div class="sc-dash-mini">
                    <div class="sc-dash-mini-head">
                        <strong>${this.esc(monthName)}</strong>
                        <a href="#safety-calendar" class="sc-dash-open">${this.t('dash.viewAll', 'عرض الكل')}</a>
                    </div>
                    ${this.renderMiniMonth(year, month, today)}
                </div>
                <div class="sc-dash-summary">
                    <div class="sc-dash-pill"><span>${todayList.length}</span>${this.t('dash.safetyCalendarToday', 'اليوم')}</div>
                    <div class="sc-dash-pill"><span>${weekCount}</span>${this.t('module.safetyCalendar.thisWeek', 'هذا الأسبوع')}</div>
                    <div class="sc-dash-pill sc-dash-pill--accent"><span>${this.allEvents().length}</span>${this.t('module.safetyCalendar.totalEvents', 'إجمالي')}</div>
                </div>
            </div>
            <div class="sc-dash-events">
                ${todayList.length ? `<p class="sc-widget-label">${this.t('dash.safetyCalendarToday', 'اليوم')}</p>
                <div class="sc-dash-event-list">${todayList.map(ev => this.renderEventCard(ev, { compact: true })).join('')}</div>` : ''}
                ${upcoming.length ? `<p class="sc-widget-label">${this.t('dash.safetyCalendarUpcoming', 'الأحداث القادمة (14 يوم)')}</p>
                <div class="sc-dash-event-list">${upcoming.map(ev => this.renderEventCard(ev, { compact: true })).join('')}</div>` : ''}
                ${!todayList.length && !upcoming.length ? `<div class="sc-empty sc-empty--dash"><i class="fas fa-calendar-check"></i><p>${this.t('dash.safetyCalendarNoUpcoming', 'لا توجد أحداث قادمة خلال أسبوعين')}</p></div>` : ''}
            </div>
        </div>`;

        container.querySelectorAll('[data-dash-date]').forEach(btn => {
            btn.addEventListener('click', () => {
                const d = btn.getAttribute('data-dash-date');
                try { sessionStorage.setItem('safetyCalendarSelectedDate', d); } catch (_e) { /* ignore */ }
                if (typeof UI !== 'undefined' && UI.showSection) UI.showSection('safety-calendar');
                else window.location.hash = '#safety-calendar';
            });
        });
        this.bindEventLinks(container);
    },

    filteredEvents() {
        const f = this.state.scopeFilter;
        const all = this.allEvents();
        return all.filter(ev => {
            if (f === 'all') return true;
            if (f === 'modules') return this.isModuleEvent(ev);
            if (f === 'occasions') return this.isOccasionEvent(ev);
            if (f === 'global') return ev.scope === 'global';
            if (f === 'country') return ev.scope === 'country';
            if (f === 'tenant') return ev.scope === 'tenant' || ev.source === 'tenant';
            return true;
        });
    },

    eventsOnDate(dateStr) {
        const d = dateStr;
        return this.filteredEvents().filter(ev => {
            const s = ev.startDate;
            const e = ev.endDate || ev.startDate;
            return s && e && d >= s && d <= e;
        });
    },

    async ensureData() {
        if (!AppState.appData) AppState.appData = {};
        if (!Array.isArray(AppState.appData.safetyCalendarEvents)) {
            AppState.appData.safetyCalendarEvents = [];
        }
        // عرض فوري: بذور محلية قبل انتظار الشبكة
        if (this.events().length === 0 && typeof window.SafetyCalendarSeeds !== 'undefined') {
            await this.seedDefaults(false, { persist: false });
        }
        if (typeof Backend !== 'undefined' && Backend.readFromSheet) {
            try {
                const rows = await Backend.readFromSheet('SafetyCalendarEvents');
                if (Array.isArray(rows) && rows.length > 0) {
                    AppState.appData.safetyCalendarEvents = rows;
                } else if (this.events().length > 0) {
                    void this.saveEvents();
                }
            } catch (_e) { /* ignore — الإبقاء على البذور المحلية */ }
        }
    },

    async seedDefaults(force, opts = {}) {
        const persist = opts.persist !== false;
        if (!this.isAdmin() && force) return;
        const existing = this.events();
        const hasSeed = existing.some(e => e.source === 'seed');
        if (hasSeed && !force) return;
        if (typeof window.SafetyCalendarSeeds === 'undefined') return;
        const seeds = SafetyCalendarSeeds.allDefaults(SafetyCalendarSeeds.defaultCountry);
        const now = new Date().toISOString();
        const userId = AppState.currentUser?.id || AppState.currentUser?.email || '';
        const toAdd = seeds.filter(s => !existing.some(e =>
            e.source === 'seed' && e.title === s.title && e.startDate === s.startDate
        ));
        toAdd.forEach(s => {
            const row = Object.assign({}, s, {
                id: Utils.generateId('SCE'),
                createdBy: userId,
                createdAt: now,
                updatedAt: now
            });
            AppState.appData.safetyCalendarEvents.push(row);
        });
        if (toAdd.length && persist && typeof window.DataManager !== 'undefined' && DataManager.save) {
            await DataManager.save();
        }
    },

    async saveEvents() {
        if (typeof window.DataManager !== 'undefined' && DataManager.save) {
            await DataManager.save();
        }
    },

    monthMatrix(year, month) {
        const first = new Date(year, month, 1);
        const startDay = first.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < startDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) {
            const m = String(month + 1).padStart(2, '0');
            const dd = String(d).padStart(2, '0');
            cells.push(`${year}-${m}-${dd}`);
        }
        while (cells.length % 7 !== 0) cells.push(null);
        return cells;
    },

    renderMonthGrid() {
        const { year, month } = this.state;
        const cells = this.monthMatrix(year, month);
        const today = new Date().toISOString().slice(0, 10);
        const weekDays = [
            this.t('module.safetyCalendar.sun', 'أحد'),
            this.t('module.safetyCalendar.mon', 'إثن'),
            this.t('module.safetyCalendar.tue', 'ثل'),
            this.t('module.safetyCalendar.wed', 'أرب'),
            this.t('module.safetyCalendar.thu', 'خم'),
            this.t('module.safetyCalendar.fri', 'جم'),
            this.t('module.safetyCalendar.sat', 'سب')
        ];
        let html = '<div class="sc-month-grid" role="grid">';
        weekDays.forEach(w => { html += `<div class="sc-weekday" role="columnheader">${this.esc(w)}</div>`; });
        cells.forEach(dateStr => {
            if (!dateStr) {
                html += '<div class="sc-day sc-day--empty"></div>';
                return;
            }
            const evs = this.eventsOnDate(dateStr);
            const isToday = dateStr === today;
            const sel = dateStr === this.state.selectedDate;
            html += `<button type="button" class="sc-day${isToday ? ' is-today' : ''}${sel ? ' is-selected' : ''}${evs.length ? ' has-events' : ''}" data-date="${dateStr}" role="gridcell">`;
            html += `<span class="sc-day-num">${parseInt(dateStr.slice(8), 10)}</span>`;
            html += '<div class="sc-day-chips">';
            evs.slice(0, 2).forEach(ev => {
                const short = this.displayTitle(ev).slice(0, 18) + (this.displayTitle(ev).length > 18 ? '…' : '');
                html += `<span class="sc-day-chip${this.isModuleEvent(ev) ? ' sc-day-chip--module' : ''}" style="--chip-color:${this.esc(this.eventColor(ev))}" title="${this.esc(this.displayTitle(ev))}">${this.esc(short)}</span>`;
            });
            if (evs.length > 2) html += `<span class="sc-more">+${evs.length - 2}</span>`;
            html += '</div></button>';
        });
        html += '</div>';
        return html;
    },

    renderList() {
        const items = this.filteredEvents().slice().sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
        if (!items.length) {
            return `<div class="sc-empty"><i class="fas fa-calendar-xmark"></i><p>${this.t('module.safetyCalendar.noEvents', 'لا توجد أحداث')}</p></div>`;
        }
        const cards = items.map(ev => this.renderEventCard(ev)).join('');
        return `<div class="sc-list-cards">${cards}</div>`;
    },

    renderDayPanel() {
        const d = this.state.selectedDate;
        if (!d) return '';
        const evs = this.eventsOnDate(d);
        const list = evs.length
            ? evs.map(ev => `<li class="sc-day-ev-wrap">${this.renderEventCard(ev, { compact: true })}</li>`).join('')
            : `<li class="sc-day-ev sc-day-ev--empty">${this.t('module.safetyCalendar.noEventsDay', 'لا أحداث في هذا اليوم')}</li>`;
        return `<aside class="sc-day-panel">
            <div class="sc-day-panel-head">
                <h4>${this.esc(this.formatDate(d))}</h4>
                <span class="sc-day-count">${evs.length} ${this.t('module.safetyCalendar.eventsCount', 'حدث')}</span>
            </div>
            <ul>${list}</ul>
        </aside>`;
    },

    renderStats() {
        const monthStart = `${this.state.year}-${String(this.state.month + 1).padStart(2, '0')}-01`;
        const monthEnd = new Date(this.state.year, this.state.month + 1, 0).toISOString().slice(0, 10);
        const inMonth = this.filteredEvents().filter(ev => {
            const s = ev.startDate;
            const e = ev.endDate || s;
            return s && e && s <= monthEnd && e >= monthStart;
        });
        const modules = inMonth.filter(ev => this.isModuleEvent(ev)).length;
        const occasions = inMonth.filter(ev => this.isOccasionEvent(ev)).length;
        const today = new Date().toISOString().slice(0, 10);
        const todayN = this.eventsOnDate(today).length;
        return `<div class="sc-stats">
            <div class="sc-stat"><span class="sc-stat-num">${todayN}</span><span class="sc-stat-label">${this.t('dash.safetyCalendarToday', 'اليوم')}</span></div>
            <div class="sc-stat"><span class="sc-stat-num">${inMonth.length}</span><span class="sc-stat-label">${this.t('module.safetyCalendar.thisMonth', 'هذا الشهر')}</span></div>
            <div class="sc-stat sc-stat--module"><span class="sc-stat-num">${modules}</span><span class="sc-stat-label">${this.t('module.safetyCalendar.filterModules', 'عمليات HSE')}</span></div>
            <div class="sc-stat sc-stat--occasion"><span class="sc-stat-num">${occasions}</span><span class="sc-stat-label">${this.t('module.safetyCalendar.filterOccasions', 'مناسبات')}</span></div>
        </div>`;
    },

    bindEventLinks(root) {
        if (!root) return;
        root.querySelectorAll('[data-link]').forEach(el => {
            const go = () => {
                const link = el.getAttribute('data-link');
                if (!link) return;
                if (typeof UI !== 'undefined' && UI.showSection) {
                    const section = link.replace(/^#/, '');
                    UI.showSection(section);
                } else {
                    window.location.hash = link;
                }
            };
            el.addEventListener('click', go);
            el.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
            });
        });
    },

    async load() {
        if (!this._langListener) {
            document.addEventListener('language-changed', () => this.load());
            this._langListener = true;
        }
        const section = document.getElementById('safety-calendar-section');
        if (!section) return;
        try {
            const saved = sessionStorage.getItem('safetyCalendarSelectedDate');
            if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) {
                this.state.selectedDate = saved;
                const p = saved.split('-').map(Number);
                this.state.year = p[0];
                this.state.month = p[1] - 1;
                sessionStorage.removeItem('safetyCalendarSelectedDate');
            }
        } catch (_e) { /* ignore */ }
        this.invalidateFeedCache();
        await this.ensureData();

        const monthName = new Date(this.state.year, this.state.month).toLocaleString(
            AppState.currentLanguage === 'en' ? 'en' : 'ar',
            { month: 'long', year: 'numeric' }
        );

        section.innerHTML = `
        <div class="sc-shell">
        <div class="section-header sc-hero">
            <div class="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 class="section-title"><i class="fas fa-calendar-days ml-2"></i>${this.t('module.safetyCalendar.title', 'تقويم السلامة')}</h1>
                    <p class="section-subtitle">${this.t('module.safetyCalendar.subtitle', 'مناسبات HSE وعمليات التصاريح والتدريب والحوادث — في مكان واحد')}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${this.isAdmin() ? `<button type="button" id="sc-add-btn" class="btn-primary btn-sm"><i class="fas fa-plus ml-1"></i>${this.t('module.safetyCalendar.add', 'حدث جديد')}</button>
                    <button type="button" id="sc-seed-btn" class="btn-secondary btn-sm"><i class="fas fa-download ml-1"></i>${this.t('module.safetyCalendar.importSeeds', 'استيراد الافتراضي')}</button>` : ''}
                </div>
            </div>
            ${this.renderStats()}
        </div>
        <div class="sc-toolbar card-style">
            <div class="sc-nav">
                <button type="button" id="sc-prev" class="btn-secondary btn-sm sc-nav-btn" aria-label="prev"><i class="fas fa-chevron-right"></i></button>
                <button type="button" id="sc-today" class="btn-secondary btn-sm">${this.t('module.safetyCalendar.today', 'اليوم')}</button>
                <strong id="sc-month-label" class="sc-month-label">${this.esc(monthName)}</strong>
                <button type="button" id="sc-next" class="btn-secondary btn-sm sc-nav-btn" aria-label="next"><i class="fas fa-chevron-left"></i></button>
            </div>
            <div class="sc-filters">
                <select id="sc-scope" class="form-input sc-scope-select">
                    <option value="all">${this.t('module.safetyCalendar.filterAll', 'الكل')}</option>
                    <option value="modules">${this.t('module.safetyCalendar.filterModules', 'عمليات HSE')}</option>
                    <option value="occasions">${this.t('module.safetyCalendar.filterOccasions', 'مناسبات')}</option>
                    <option value="global">${this.t('module.safetyCalendar.filterGlobal', 'عالمي')}</option>
                    <option value="country">${this.t('module.safetyCalendar.filterCountry', 'مصر')}</option>
                    <option value="tenant">${this.t('module.safetyCalendar.filterCustom', 'مخصص')}</option>
                </select>
                <button type="button" class="btn-secondary btn-sm sc-view-btn${this.state.view === 'month' ? ' active' : ''}" data-view="month"><i class="fas fa-calendar ml-1"></i>${this.t('module.safetyCalendar.month', 'شهر')}</button>
                <button type="button" class="btn-secondary btn-sm sc-view-btn${this.state.view === 'list' ? ' active' : ''}" data-view="list"><i class="fas fa-list ml-1"></i>${this.t('module.safetyCalendar.list', 'قائمة')}</button>
            </div>
        </div>
        <div class="sc-legend card-style">
            <span class="sc-legend-title">${this.t('module.safetyCalendar.legend', 'دليل الألوان')}</span>
            <span><i class="sc-leg-dot" style="background:#2563EB"></i>${this.t('module.safetyCalendar.legGlobal', 'عالمي HSE')}</span>
            <span><i class="sc-leg-dot" style="background:#7C3AED"></i>${this.t('module.safetyCalendar.legEgypt', 'مصر')}</span>
            <span><i class="sc-leg-dot" style="background:#EA580C"></i>${this.t('module.safetyCalendar.legPtw', 'تصاريح')}</span>
            <span><i class="sc-leg-dot" style="background:#2563EB"></i>${this.t('module.safetyCalendar.legTraining', 'تدريب')}</span>
            <span><i class="sc-leg-dot" style="background:#DC2626"></i>${this.t('module.safetyCalendar.legIncident', 'حوادث')}</span>
            <span><i class="sc-leg-dot" style="background:#9333EA"></i>${this.t('module.safetyCalendar.legViolation', 'مخالفات')}</span>
            <span><i class="sc-leg-dot" style="background:#0D9488"></i>${this.t('module.safetyCalendar.legObservation', 'ملاحظات')}</span>
            <span><i class="sc-leg-dot" style="background:#B45309"></i>${this.t('module.safetyCalendar.legRisk', 'تقييم مخاطر')}</span>
        </div>
        <div class="sc-body">
            <div class="sc-main card-style" id="sc-main">${this.state.view === 'list' ? this.renderList() : this.renderMonthGrid()}</div>
            ${this.state.view === 'month' ? this.renderDayPanel() : ''}
        </div>
        </div>`;

        const scopeEl = section.querySelector('#sc-scope');
        if (scopeEl) scopeEl.value = this.state.scopeFilter;

        section.querySelector('#sc-prev')?.addEventListener('click', () => {
            this.state.month -= 1;
            if (this.state.month < 0) { this.state.month = 11; this.state.year -= 1; }
            this.load();
        });
        section.querySelector('#sc-today')?.addEventListener('click', () => {
            const now = new Date();
            this.state.year = now.getFullYear();
            this.state.month = now.getMonth();
            this.state.selectedDate = now.toISOString().slice(0, 10);
            this.load();
        });
        section.querySelector('#sc-next')?.addEventListener('click', () => {
            this.state.month += 1;
            if (this.state.month > 11) { this.state.month = 0; this.state.year += 1; }
            this.load();
        });
        scopeEl?.addEventListener('change', e => {
            this.state.scopeFilter = e.target.value;
            this.load();
        });
        section.querySelectorAll('.sc-view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.state.view = btn.getAttribute('data-view');
                this.load();
            });
        });
        section.querySelectorAll('.sc-day[data-date]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.state.selectedDate = btn.getAttribute('data-date');
                this.load();
            });
        });
        section.querySelector('#sc-add-btn')?.addEventListener('click', () => this.openForm());
        section.querySelector('#sc-seed-btn')?.addEventListener('click', async () => {
            await this.seedDefaults(true);
            if (typeof Notification !== 'undefined') Notification.success(this.t('module.safetyCalendar.seedsOk', 'تم استيراد المناسبات الافتراضية'));
            this.load();
        });
        section.querySelectorAll('.sc-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openForm(btn.getAttribute('data-id'));
            });
        });
        section.querySelectorAll('.sc-del').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                if (!confirm(this.t('module.safetyCalendar.confirmDelete', 'حذف هذا الحدث؟'))) return;
                AppState.appData.safetyCalendarEvents = this.events().filter(ev => ev.id !== id);
                await this.saveEvents();
                this.load();
            });
        });

        this.bindEventLinks(section);

        if (typeof I18n !== 'undefined' && I18n.applyModuleI18n) I18n.applyModuleI18n(section);
    },

    openForm(editId) {
        const existing = editId ? this.events().find(e => e.id === editId) : null;
        const title = existing?.title || '';
        const titleEn = existing?.titleEn || '';
        const startDate = existing?.startDate || new Date().toISOString().slice(0, 10);
        const endDate = existing?.endDate || startDate;
        const eventType = existing?.eventType || 'custom';
        const description = existing?.description || '';

        const html = `<div class="modal-overlay sc-form-modal" role="dialog">
            <div class="modal-content" style="max-width:520px">
                <div class="modal-header"><h3>${existing ? this.t('common.edit', 'تعديل') : this.t('module.safetyCalendar.add', 'حدث جديد')}</h3>
                <button type="button" class="modal-close sc-close">&times;</button></div>
                <div class="modal-body">
                    <label>${this.t('common.title', 'العنوان')}<input class="form-input" id="sc-f-title" value="${this.esc(title)}"></label>
                    <label>${this.t('module.safetyCalendar.titleEn', 'العنوان (إنجليزي)')}<input class="form-input" id="sc-f-title-en" value="${this.esc(titleEn)}"></label>
                    <label>${this.t('module.safetyCalendar.type', 'النوع')}
                    <select class="form-input" id="sc-f-type">
                        <option value="holiday" ${eventType === 'holiday' ? 'selected' : ''}>${this.t('module.safetyCalendar.legHoliday', 'إجازة')}</option>
                        <option value="occasion" ${eventType === 'occasion' ? 'selected' : ''}>${this.t('module.safetyCalendar.legOccasion', 'مناسبة')}</option>
                        <option value="hse_event" ${eventType === 'hse_event' ? 'selected' : ''}>HSE</option>
                        <option value="custom" ${eventType === 'custom' ? 'selected' : ''}>${this.t('module.safetyCalendar.filterCustom', 'مخصص')}</option>
                    </select></label>
                    <div class="grid grid-cols-2 gap-2">
                        <label>${this.t('module.safetyCalendar.start', 'من')}<input type="date" class="form-input" id="sc-f-start" value="${this.esc(startDate)}"></label>
                        <label>${this.t('module.safetyCalendar.end', 'إلى')}<input type="date" class="form-input" id="sc-f-end" value="${this.esc(endDate)}"></label>
                    </div>
                    <label>${this.t('common.description', 'الوصف')}<textarea class="form-input" id="sc-f-desc" rows="3">${this.esc(description)}</textarea></label>
                </div>
                <div class="modal-footer flex gap-2 justify-end p-3">
                    <button type="button" class="btn-secondary sc-close">${this.t('common.cancel', 'إلغاء')}</button>
                    <button type="button" class="btn-primary" id="sc-f-save">${this.t('common.save', 'حفظ')}</button>
                </div>
            </div></div>`;
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        document.body.appendChild(wrap.firstElementChild);
        const modal = document.body.querySelector('.sc-form-modal');
        const close = () => modal?.remove();
        modal.querySelectorAll('.sc-close').forEach(b => b.addEventListener('click', close));
        modal.querySelector('#sc-f-save').addEventListener('click', async () => {
            const row = {
                id: existing?.id || Utils.generateId('SCE'),
                title: modal.querySelector('#sc-f-title').value.trim(),
                titleEn: modal.querySelector('#sc-f-title-en').value.trim(),
                eventType: modal.querySelector('#sc-f-type').value,
                startDate: modal.querySelector('#sc-f-start').value,
                endDate: modal.querySelector('#sc-f-end').value,
                scope: 'tenant',
                countryCode: null,
                source: 'tenant',
                allDay: true,
                color: '#64748B',
                description: modal.querySelector('#sc-f-desc').value.trim(),
                createdBy: AppState.currentUser?.id || '',
                createdAt: existing?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            if (!row.title || !row.startDate) return;
            const arr = this.events().filter(e => e.id !== row.id);
            arr.push(row);
            AppState.appData.safetyCalendarEvents = arr;
            await this.saveEvents();
            close();
            this.load();
        });
    },

    /** Events from today through +days for dashboard widget */
    upcomingEvents(days) {
        const today = new Date().toISOString().slice(0, 10);
        const end = new Date();
        end.setDate(end.getDate() + (days || 7));
        const endStr = end.toISOString().slice(0, 10);
        return this.allEvents().filter(ev => {
            const s = ev.startDate;
            const e = ev.endDate || s;
            return s <= endStr && e >= today;
        }).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    },

    todayEvents() {
        const today = new Date().toISOString().slice(0, 10);
        return this.allEvents().filter(ev => {
            const s = ev.startDate;
            const e = ev.endDate || ev.startDate;
            return s && e && today >= s && today <= e;
        });
    }
};

window.SafetyCalendar = SafetyCalendar;
