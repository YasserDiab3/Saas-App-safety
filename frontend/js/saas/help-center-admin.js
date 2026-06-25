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
            await global.SaaS.ready;
            const client = global.SaaS.client();
            if (!client) throw new Error('Supabase client not ready');
            const { data, error } = await client.rpc('api_get_help_center', {});
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
            await global.SaaS.ready;
            const client = global.SaaS.client();
            if (!client) throw new Error('Supabase client not ready');
            const payload = {
                id: 'default',
                sections: sections || [],
                updatedAt: new Date().toISOString()
            };
            const { data, error } = await client.rpc('api_save_help_center', { p_data: payload });
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
            listEl.innerHTML = sorted.map((item, sortedIdx) => {
                const title = this.esc((item.titleAr || item.titleEn || item.id || '').slice(0, 80)) || '(بدون عنوان)';
                const realIndex = items.indexOf(item);
                const idx = realIndex >= 0 ? realIndex : sortedIdx;
                const isFaq = item.category === 'faq';
                return `<div class="pf-hc-row" data-help-index="${idx}">
                    <div class="pf-hc-row__title">
                        <strong>${title}</strong>
                        ${isFaq ? '<span class="pf-hc-badge">Q&A</span>' : ''}
                        <span class="muted-s">${this.esc(item.moduleKey || '—')}</span>
                        ${item.active !== false ? '<span class="pf-hc-on">مفعّل</span>' : '<span class="pf-hc-off">معطّل</span>'}
                    </div>
                    <div class="pf-hc-row__actions">
                        <button type="button" class="saas-btn sm ghost help-center-edit-btn" data-index="${idx}">تعديل</button>
                        <button type="button" class="saas-btn sm ghost help-center-delete-btn" data-index="${idx}">حذف</button>
                        <button type="button" class="saas-btn sm ghost help-center-up-btn" data-index="${idx}">↑</button>
                        <button type="button" class="saas-btn sm ghost help-center-down-btn" data-index="${idx}">↓</button>
                    </div>
                </div>`;
            }).join('');
        },

        showForm(index, preset) {
            const form = document.getElementById('help-center-item-form');
            const titleEl = document.getElementById('help-center-form-title');
            if (!form) return;
            this.editIndex = index === null || index === undefined ? null : Number(index);
            const items = this.sections;
            const item = this.editIndex !== null && !Number.isNaN(this.editIndex) ? items[this.editIndex] : null;
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
            form.removeAttribute('hidden');
            form.classList.remove('hidden');
            requestAnimationFrame(() => {
                form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        },

        hideForm() {
            const form = document.getElementById('help-center-item-form');
            if (form) {
                form.setAttribute('hidden', '');
                form.classList.add('hidden');
            }
            this.editIndex = null;
        },

        bindEvents() {
            const root = document.getElementById('pane-help-center');
            if (!root || root.dataset.bound === '1') return;
            root.dataset.bound = '1';
            const admin = this;

            root.addEventListener('click', async (e) => {
                const editBtn = e.target.closest('.help-center-edit-btn');
                const deleteBtn = e.target.closest('.help-center-delete-btn');
                const upBtn = e.target.closest('.help-center-up-btn');
                const downBtn = e.target.closest('.help-center-down-btn');
                if (editBtn || deleteBtn || upBtn || downBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                const items = admin.sections;
                const idx = parseInt((editBtn || deleteBtn || upBtn || downBtn)?.dataset?.index, 10);
                if (editBtn && !Number.isNaN(idx)) {
                    admin.showForm(idx);
                    return;
                }
                if (deleteBtn && !Number.isNaN(idx)) {
                    if (!confirm('حذف هذا القسم؟')) return;
                    items.splice(idx, 1);
                    try {
                        admin.msg('جاري الحفظ…');
                        await admin.saveSections(items);
                        admin.renderList();
                        admin.msg('تم الحذف', 'ok');
                    } catch (err) {
                        admin.msg(err.message || 'فشل', 'err');
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
                if (upBtn && !Number.isNaN(idx)) {
                    swap(idx, idx - 1);
                    try {
                        await admin.saveSections(items);
                        admin.renderList();
                    } catch (err) {
                        admin.msg(err.message || 'فشل', 'err');
                    }
                    return;
                }
                if (downBtn && !Number.isNaN(idx)) {
                    swap(idx, idx + 1);
                    try {
                        await admin.saveSections(items);
                        admin.renderList();
                    } catch (err) {
                        admin.msg(err.message || 'فشل', 'err');
                    }
                }
            });

            document.getElementById('help-center-add-btn')?.addEventListener('click', (e) => {
                e.preventDefault();
                admin.showForm(null);
            });
            document.getElementById('help-center-add-faq-btn')?.addEventListener('click', (e) => {
                e.preventDefault();
                admin.showForm(null, 'faq');
            });
            document.getElementById('help-center-item-cancel-btn')?.addEventListener('click', () => admin.hideForm());
            document.getElementById('help-center-preview-btn')?.addEventListener('click', () => {
                window.open('/#help', '_blank', 'noopener');
            });
            document.getElementById('help-center-reset-btn')?.addEventListener('click', async () => {
                if (!confirm('استعادة المحتوى الافتراضي؟')) return;
                try {
                    admin.msg('جاري الحفظ…');
                    const defaults = (global.HelpDefaultContent && global.HelpDefaultContent.getDefaultHelpSections)
                        ? global.HelpDefaultContent.getDefaultHelpSections() : [];
                    await admin.saveSections(defaults);
                    admin.renderList();
                    admin.msg('تم استعادة المحتوى الافتراضي', 'ok');
                } catch (e) {
                    admin.msg(e.message || 'فشل', 'err');
                }
            });
            document.getElementById('help-center-save-all-btn')?.addEventListener('click', async () => {
                try {
                    admin.msg('جاري الحفظ…');
                    await admin.saveSections(admin.sections);
                    admin.msg('تم الحفظ', 'ok');
                } catch (e) {
                    admin.msg(e.message || 'فشل', 'err');
                }
            });
            document.getElementById('help-center-item-save-btn')?.addEventListener('click', async () => {
                const titleAr = document.getElementById('help-center-item-title-ar')?.value?.trim();
                const titleEn = document.getElementById('help-center-item-title-en')?.value?.trim();
                if (!titleAr && !titleEn) {
                    admin.msg('أدخل عنواناً بالعربية أو الإنجليزية', 'err');
                    return;
                }
                const items = admin.sections;
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
                if (admin.editIndex !== null && items[admin.editIndex]) {
                    items[admin.editIndex] = { ...items[admin.editIndex], ...entry };
                } else {
                    items.push(entry);
                }
                try {
                    admin.msg('جاري الحفظ…');
                    await admin.saveSections(items);
                    admin.hideForm();
                    admin.renderList();
                    admin.msg('تم حفظ القسم', 'ok');
                } catch (e) {
                    admin.msg(e.message || 'فشل', 'err');
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
