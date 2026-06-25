/**
 * Safety Calendar Module — global HSE + Egypt default seeds.
 */
const SafetyCalendar = {
    state: {
        view: 'month',
        scopeFilter: 'all',
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
        selectedDate: null
    },

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
        const map = { holiday: '#059669', occasion: '#D97706', hse_event: '#2563EB', custom: '#64748B' };
        if (ev.scope === 'country') return '#7C3AED';
        return map[ev.eventType] || '#64748B';
    },

    filteredEvents() {
        const f = this.state.scopeFilter;
        return this.events().filter(ev => {
            if (f === 'all') return true;
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
            html += `<button type="button" class="sc-day${isToday ? ' is-today' : ''}${sel ? ' is-selected' : ''}" data-date="${dateStr}" role="gridcell">`;
            html += `<span class="sc-day-num">${parseInt(dateStr.slice(8), 10)}</span>`;
            html += '<div class="sc-day-dots">';
            evs.slice(0, 3).forEach(ev => {
                html += `<span class="sc-dot" style="background:${this.esc(this.eventColor(ev))}" title="${this.esc(ev.title)}"></span>`;
            });
            if (evs.length > 3) html += `<span class="sc-more">+${evs.length - 3}</span>`;
            html += '</div></button>';
        });
        html += '</div>';
        return html;
    },

    renderList() {
        const items = this.filteredEvents().slice().sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
        if (!items.length) {
            return `<p class="text-slate-500">${this.t('module.safetyCalendar.noEvents', 'لا توجد أحداث')}</p>`;
        }
        const rows = items.map(ev => `<tr>
            <td>${this.esc(this.formatDate(ev.startDate))}</td>
            <td>${this.esc(ev.title)}</td>
            <td><span class="sc-type-badge" style="border-color:${this.esc(this.eventColor(ev))}">${this.esc(ev.eventType || '')}</span></td>
            <td>${this.esc(ev.scope || '')}</td>
            ${this.isAdmin() ? `<td><button type="button" class="btn-xs btn-secondary sc-edit" data-id="${this.esc(ev.id)}">${this.t('common.edit', 'تعديل')}</button>
            <button type="button" class="btn-xs btn-danger sc-del" data-id="${this.esc(ev.id)}">${this.t('common.delete', 'حذف')}</button></td>` : ''}
        </tr>`).join('');
        return `<table class="sc-list-table"><thead><tr>
            <th>${this.t('common.date', 'التاريخ')}</th><th>${this.t('common.title', 'العنوان')}</th>
            <th>${this.t('module.safetyCalendar.type', 'النوع')}</th><th>${this.t('module.safetyCalendar.scope', 'النطاق')}</th>
            ${this.isAdmin() ? `<th>${this.t('common.actions', 'إجراءات')}</th>` : ''}
        </tr></thead><tbody>${rows}</tbody></table>`;
    },

    renderDayPanel() {
        const d = this.state.selectedDate;
        if (!d) return '';
        const evs = this.eventsOnDate(d);
        const list = evs.length
            ? evs.map(ev => `<li class="sc-day-ev" style="border-inline-start:4px solid ${this.esc(this.eventColor(ev))}">
                <strong>${this.esc(ev.title)}</strong>
                <span class="sc-day-ev-meta">${this.esc(ev.eventType)} · ${this.esc(ev.scope || '')}</span>
                ${ev.description ? `<p>${this.esc(ev.description)}</p>` : ''}
            </li>`).join('')
            : `<li class="text-slate-500">${this.t('module.safetyCalendar.noEventsDay', 'لا أحداث في هذا اليوم')}</li>`;
        return `<aside class="sc-day-panel"><h4>${this.esc(this.formatDate(d))}</h4><ul>${list}</ul></aside>`;
    },

    async load() {
        if (!this._langListener) {
            document.addEventListener('language-changed', () => this.load());
            this._langListener = true;
        }
        const section = document.getElementById('safety-calendar-section');
        if (!section) return;
        await this.ensureData();

        const monthName = new Date(this.state.year, this.state.month).toLocaleString(
            AppState.currentLanguage === 'en' ? 'en' : 'ar',
            { month: 'long', year: 'numeric' }
        );

        section.innerHTML = `
        <div class="section-header">
            <div class="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 class="section-title"><i class="fas fa-calendar-days ml-2"></i>${this.t('module.safetyCalendar.title', 'تقويم السلامة')}</h1>
                    <p class="section-subtitle">${this.t('module.safetyCalendar.subtitle', 'مناسبات عالمية HSE وإجازات مصر — قابلة للتخصيص')}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${this.isAdmin() ? `<button type="button" id="sc-add-btn" class="btn-primary btn-sm"><i class="fas fa-plus ml-1"></i>${this.t('module.safetyCalendar.add', 'حدث جديد')}</button>
                    <button type="button" id="sc-seed-btn" class="btn-secondary btn-sm"><i class="fas fa-download ml-1"></i>${this.t('module.safetyCalendar.importSeeds', 'استيراد الافتراضي')}</button>` : ''}
                </div>
            </div>
        </div>
        <div class="sc-toolbar">
            <div class="sc-nav">
                <button type="button" id="sc-prev" class="btn-secondary btn-sm" aria-label="prev"><i class="fas fa-chevron-right"></i></button>
                <strong id="sc-month-label">${this.esc(monthName)}</strong>
                <button type="button" id="sc-next" class="btn-secondary btn-sm" aria-label="next"><i class="fas fa-chevron-left"></i></button>
            </div>
            <div class="sc-filters">
                <select id="sc-scope" class="form-input">
                    <option value="all">${this.t('module.safetyCalendar.filterAll', 'الكل')}</option>
                    <option value="global">${this.t('module.safetyCalendar.filterGlobal', 'عالمي')}</option>
                    <option value="country">${this.t('module.safetyCalendar.filterCountry', 'مصر')}</option>
                    <option value="tenant">${this.t('module.safetyCalendar.filterCustom', 'مخصص')}</option>
                </select>
                <button type="button" class="btn-secondary btn-sm sc-view-btn${this.state.view === 'month' ? ' active' : ''}" data-view="month">${this.t('module.safetyCalendar.month', 'شهر')}</button>
                <button type="button" class="btn-secondary btn-sm sc-view-btn${this.state.view === 'list' ? ' active' : ''}" data-view="list">${this.t('module.safetyCalendar.list', 'قائمة')}</button>
            </div>
        </div>
        <div class="sc-legend">
            <span><i class="sc-leg-dot" style="background:#2563EB"></i>${this.t('module.safetyCalendar.legGlobal', 'عالمي HSE')}</span>
            <span><i class="sc-leg-dot" style="background:#7C3AED"></i>${this.t('module.safetyCalendar.legEgypt', 'مصر')}</span>
            <span><i class="sc-leg-dot" style="background:#059669"></i>${this.t('module.safetyCalendar.legHoliday', 'إجازة')}</span>
            <span><i class="sc-leg-dot" style="background:#D97706"></i>${this.t('module.safetyCalendar.legOccasion', 'مناسبة')}</span>
        </div>
        <div class="sc-body">
            <div class="sc-main" id="sc-main">${this.state.view === 'list' ? this.renderList() : this.renderMonthGrid()}</div>
            ${this.state.view === 'month' ? this.renderDayPanel() : ''}
        </div>`;

        const scopeEl = section.querySelector('#sc-scope');
        if (scopeEl) scopeEl.value = this.state.scopeFilter;

        section.querySelector('#sc-prev')?.addEventListener('click', () => {
            this.state.month -= 1;
            if (this.state.month < 0) { this.state.month = 11; this.state.year -= 1; }
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
            btn.addEventListener('click', () => this.openForm(btn.getAttribute('data-id')));
        });
        section.querySelectorAll('.sc-del').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if (!confirm(this.t('module.safetyCalendar.confirmDelete', 'حذف هذا الحدث؟'))) return;
                AppState.appData.safetyCalendarEvents = this.events().filter(e => e.id !== id);
                await this.saveEvents();
                this.load();
            });
        });

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
        return this.events().filter(ev => {
            const s = ev.startDate;
            const e = ev.endDate || s;
            return s <= endStr && e >= today;
        }).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    },

    todayEvents() {
        const today = new Date().toISOString().slice(0, 10);
        return this.eventsOnDate(today);
    }
};

window.SafetyCalendar = SafetyCalendar;
