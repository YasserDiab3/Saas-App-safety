/**
 * Help center admin — platform console only (global content).
 */
(function (global) {
    const HelpCenterAdmin = {
        sections: [],
        editIndex: null,

        esc(s) {
            if (global.SaaSEscape && typeof global.SaaSEscape.html === 'function') {
                return global.SaaSEscape.html(s);
            }
            return String(s ?? '').replace(/[&<>"']/g, (c) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        },

        msg(text, cls) {
            const el = document.getElementById('help-center-status');
            if (!el) return;
            el.textContent = text || '';
            el.className = 'pf-msg' + (cls ? ' ' + cls : '');
        },

        async loadSections() {
            const { data, error } = await global.SaaS.client().rpc('api_get_help_center', {});
            if (error) throw new Error(error.message);
            const payload = (data && data.data) || data || {};
            let sections = Array.isArray(payload.sections) ? payload.sections : [];
            if (!sections.length && global.HelpDefaultContent && typeof global.HelpDefaultContent.getDefaultHelpSections === 'function') {
                sections = global.HelpDefaultContent.getDefaultHelpSections();
            }
            this.sections = sections.slice();
            return this.sections;
        },

        getSections() {
            return Array.isArray(this.sections) ? this.sections.slice() : [];
        },

        async saveSections(sections) {
            const payload = {
                id: 'default',
                sections: sections || [],
                updatedAt: new Date().toISOString()
            };
            const { data, error } = await global.SaaS.client().rpc('api_save_help_center', { p_data: payload });
            if (error) throw new Error(error.message);
            if (data && data.success === false) throw new Error(data.message || 'save failed');
            this.sections = (sections || []).slice();
            if (global.Help && typeof global.Help.invalidateCache === 'function') {
                global.Help.invalidateCache();
            }
            return data;
        },

        renderList() {
            const listEl = document.getElementById('help-center-items-list');
            if (!listEl) return;
            const items = this.getSections();
            if (!items.length) {
                listEl.innerHTML = '<p class="muted-s">لا توجد أقسام. اضغط «إضافة قسم» أو «استعادة الافتراضي».</p>';
                return;
            }
            const sorted = items.slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
            listEl.innerHTML = sorted.map((item) => {
                const title = this.esc((item.titleAr || item.titleEn || item.id || '').slice(0, 80)) || '(بدون عنوان)';
                const realIndex = items.indexOf(item);
                const isFaq = item.category === 'faq';
                return `<div class="pf-hc-row" data-help-index="${realIndex}">
                    <div class="pf-hc-row__title">
                        <strong>${title}</strong>
                        ${isFaq ? '<span class="pf-hc-badge">Q&A</span>' : ''}
                        <span class="muted-s">${this.esc(item.moduleKey || '—')}</span>
                        ${item.active !== false ? '<span class="pf-hc-on">مفعّل</span>' : '<span class="pf-hc-off">معطّل</span>'}
                    </div>
                    <div class="pf-hc-row__actions">
                        <button type="button" class="saas-btn sm ghost help-center-edit-btn" data-index="${realIndex}">تعديل</button>
                        <button type="button" class="saas-btn sm ghost help-center-delete-btn" data-index="${realIndex}">حذف</button>
                        <button type="button" class="saas-btn sm ghost help-center-up-btn" data-index="${realIndex}">↑</button>
                        <button type="button" class="saas-btn sm ghost help-center-down-btn" data-index="${realIndex}">↓</button>
                    </div>
                </div>`;
            }).join('');
        },

        showForm(index, preset) {
            const form = document.getElementById('help-center-item-form');
            const titleEl = document.getElementById('help-center-form-title');
            if (!form) return;
            this.editIndex = index === null || index === undefined ? null : index;
            const items = this.getSections();
            const item = this.editIndex !== null ? items[this.editIndex] : null;
            if (titleEl) {
                titleEl.textContent = item ? 'تعديل قسم' : (preset === 'faq' ? 'إضافة سؤال شائع' : 'إضافة قسم');
            }
            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
            setVal('help-center-item-id', item?.id || '');
            setVal('help-center-item-title-ar', item?.titleAr || '');
            setVal('help-center-item-title-en', item?.titleEn || '');
            setVal('help-center-item-body-ar', item?.bodyAr || '');
            setVal('help-center-item-body-en', item?.bodyEn || '');
            setVal('help-center-item-module', item?.moduleKey || '');
            setVal('help-center-item-icon', item?.icon || (preset === 'faq' ? 'fa-circle-question' : 'fa-circle-info'));
            setVal('help-center-item-category', item?.category || preset || 'modules');
            setVal('help-center-item-order', item?.order ?? items.length + 1);
            const activeEl = document.getElementById('help-center-item-active');
            if (activeEl) activeEl.checked = item ? item.active !== false : true;
            form.hidden = false;
        },

        hideForm() {
            const form = document.getElementById('help-center-item-form');
            if (form) form.hidden = true;
            this.editIndex = null;
        },

        bindEvents() {
            const root = document.getElementById('pane-help-center');
            if (!root || root.dataset.bound === '1') return;
            root.dataset.bound = '1';

            document.getElementById('help-center-add-btn')?.addEventListener('click', () => this.showForm(null));
            document.getElementById('help-center-add-faq-btn')?.addEventListener('click', () => this.showForm(null, 'faq'));
            document.getElementById('help-center-item-cancel-btn')?.addEventListener('click', () => this.hideForm());
            document.getElementById('help-center-preview-btn')?.addEventListener('click', () => {
                window.open('/#help', '_blank', 'noopener');
            });
            document.getElementById('help-center-reset-btn')?.addEventListener('click', async () => {
                if (!confirm('استعادة المحتوى الافتراضي؟')) return;
                try {
                    this.msg('جاري الحفظ…');
                    const defaults = (global.HelpDefaultContent && global.HelpDefaultContent.getDefaultHelpSections)
                        ? global.HelpDefaultContent.getDefaultHelpSections() : [];
                    await this.saveSections(defaults);
                    this.renderList();
                    this.msg('تم استعادة المحتوى الافتراضي', 'ok');
                } catch (e) {
                    this.msg(e.message || 'فشل', 'err');
                }
            });
            document.getElementById('help-center-save-all-btn')?.addEventListener('click', async () => {
                try {
                    this.msg('جاري الحفظ…');
                    await this.saveSections(this.getSections());
                    this.msg('تم الحفظ', 'ok');
                } catch (e) {
                    this.msg(e.message || 'فشل', 'err');
                }
            });
            document.getElementById('help-center-item-save-btn')?.addEventListener('click', async () => {
                const titleAr = document.getElementById('help-center-item-title-ar')?.value?.trim();
                const titleEn = document.getElementById('help-center-item-title-en')?.value?.trim();
                if (!titleAr && !titleEn) {
                    this.msg('أدخل عنواناً بالعربية أو الإنجليزية', 'err');
                    return;
                }
                const items = this.getSections();
                const entry = {
                    id: document.getElementById('help-center-item-id')?.value?.trim() || `help-${Date.now()}`,
                    titleAr: titleAr || titleEn,
                    titleEn: titleEn || titleAr,
                    bodyAr: document.getElementById('help-center-item-body-ar')?.value?.trim() || '',
                    bodyEn: document.getElementById('help-center-item-body-en')?.value?.trim() || '',
                    moduleKey: document.getElementById('help-center-item-module')?.value?.trim() || '',
                    icon: document.getElementById('help-center-item-icon')?.value?.trim() || 'fa-circle-info',
                    category: document.getElementById('help-center-item-category')?.value || 'modules',
                    order: parseInt(document.getElementById('help-center-item-order')?.value, 10) || items.length + 1,
                    active: document.getElementById('help-center-item-active')?.checked !== false
                };
                if (this.editIndex !== null && items[this.editIndex]) {
                    items[this.editIndex] = { ...items[this.editIndex], ...entry };
                } else {
                    items.push(entry);
                }
                try {
                    this.msg('جاري الحفظ…');
                    await this.saveSections(items);
                    this.hideForm();
                    this.renderList();
                    this.msg('تم حفظ القسم', 'ok');
                } catch (e) {
                    this.msg(e.message || 'فشل', 'err');
                }
            });

            document.getElementById('help-center-items-list')?.addEventListener('click', async (e) => {
                const editBtn = e.target.closest('.help-center-edit-btn');
                const deleteBtn = e.target.closest('.help-center-delete-btn');
                const upBtn = e.target.closest('.help-center-up-btn');
                const downBtn = e.target.closest('.help-center-down-btn');
                const items = this.getSections();
                const idx = parseInt((editBtn || deleteBtn || upBtn || downBtn)?.dataset?.index, 10);
                if (editBtn && !isNaN(idx)) {
                    this.showForm(idx);
                    return;
                }
                if (deleteBtn && !isNaN(idx)) {
                    if (!confirm('حذف هذا القسم؟')) return;
                    items.splice(idx, 1);
                    try {
                        this.msg('جاري الحفظ…');
                        await this.saveSections(items);
                        this.renderList();
                        this.msg('تم الحذف', 'ok');
                    } catch (err) {
                        this.msg(err.message || 'فشل', 'err');
                    }
                    return;
                }
                const swap = (a, b) => {
                    if (a < 0 || b < 0 || a >= items.length || b >= items.length) return;
                    const tmp = items[a].order ?? a;
                    items[a].order = items[b].order ?? b;
                    items[b].order = tmp;
                    [items[a], items[b]] = [items[b], items[a]];
                };
                if (upBtn && !isNaN(idx)) {
                    swap(idx, idx - 1);
                    try {
                        await this.saveSections(items);
                        this.renderList();
                    } catch (err) {
                        this.msg(err.message || 'فشل', 'err');
                    }
                }
                if (downBtn && !isNaN(idx)) {
                    swap(idx, idx + 1);
                    try {
                        await this.saveSections(items);
                        this.renderList();
                    } catch (err) {
                        this.msg(err.message || 'فشل', 'err');
                    }
                }
            });
        },

        async loadPane() {
            this.bindEvents();
            this.msg('جاري التحميل…');
            try {
                await this.loadSections();
                this.renderList();
                this.msg('');
            } catch (e) {
                this.msg(e.message || 'فشل التحميل', 'err');
            }
        }
    };

    global.HelpCenterAdmin = HelpCenterAdmin;
})(window);
