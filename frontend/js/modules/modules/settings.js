/**
 * Settings Module
 * ØªÙ… Ø§Ø³ØªØ®Ø±Ø§Ø¬Ù‡ Ù…Ù† app-modules.js
 */
// ===== Settings Module =====
const Settings = {
    currentApprovalCircuitOwner: '__default__',
    
    /**
     * ضغط الصورة لتقليل الحجم (للتأكد من أن base64 string أقل من 50,000 حرف)
     * @param {string} imageDataUrl - base64 image data URL
     * @param {number} maxWidth - الحد الأقصى للعرض (افتراضي: 800px)
     * @param {number} maxHeight - الحد الأقصى للارتفاع (افتراضي: 800px)
     * @param {number} quality - جودة JPEG (افتراضي: 0.8 = 80%)
     * @returns {Promise<string>} - compressed base64 image data URL
     */
    async compressLogo(imageDataUrl, maxWidth = 800, maxHeight = 800, quality = 0.8) {
        return new Promise((resolve, reject) => {
            try {
                const img = new Image();
                img.onload = function() {
                    try {
                        // حساب الأبعاد الجديدة مع الحفاظ على النسبة
                        let width = img.width;
                        let height = img.height;
                        
                        if (width > maxWidth || height > maxHeight) {
                            const ratio = Math.min(maxWidth / width, maxHeight / height);
                            width = Math.round(width * ratio);
                            height = Math.round(height * ratio);
                        }
                        
                        // إنشاء canvas
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        
                        // رسم الصورة على canvas
                        ctx.drawImage(img, 0, 0, width, height);
                        
                        // تحويل إلى JPEG بجودة معينة (أصغر من PNG)
                        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                        
                        // التحقق من الحجم (base64 string length)
                        // حد طول الحقل (قد يفرضه الخادم)
                        // نهدف إلى أقل من 45,000 حرف (لترك هامش أمان)
                        if (compressedDataUrl.length > 45000) {
                            // إذا كان الحجم لا يزال كبيراً، نضغط أكثر
                            if (quality > 0.5) {
                                // تقليل الجودة أكثر
                                const moreCompressed = canvas.toDataURL('image/jpeg', 0.5);
                                if (moreCompressed.length <= 45000) {
                                    resolve(moreCompressed);
                                    return;
                                }
                            }
                            // إذا كان لا يزال كبيراً، نقلل الحجم أكثر
                            if (width > 600 || height > 600) {
                                const smallerRatio = Math.min(600 / width, 600 / height);
                                const smallerWidth = Math.round(width * smallerRatio);
                                const smallerHeight = Math.round(height * smallerRatio);
                                canvas.width = smallerWidth;
                                canvas.height = smallerHeight;
                                ctx.clearRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(img, 0, 0, smallerWidth, smallerHeight);
                                const finalCompressed = canvas.toDataURL('image/jpeg', 0.5);
                                resolve(finalCompressed);
                                return;
                            }
                        }
                        
                        resolve(compressedDataUrl);
                    } catch (error) {
                        reject(error);
                    }
                };
                img.onerror = function() {
                    reject(new Error('فشل تحميل الصورة'));
                };
                img.src = imageDataUrl;
            } catch (error) {
                reject(error);
            }
        });
    },
    currentApprovalCircuitId: null,
    currentApprovalCircuitSteps: [],
    formSettingsState: null,
    formSettingsEventsBound: false,
    helpCenterSections: [],
    helpCenterEditIndex: null,

    async loadHelpCenterSections() {
        let sections = [];
        try {
            if (typeof Backend !== 'undefined' && typeof Backend.sendToAppsScript === 'function') {
                const res = await Backend.sendToAppsScript('getHelpCenter', {});
                const data = (res && res.data) || res || {};
                sections = Array.isArray(data.sections) ? data.sections : [];
            }
        } catch (e) {
            Utils.safeWarn?.('⚠️ تعذر تحميل مركز المساعدة:', e);
        }
        if (!sections.length && typeof HelpDefaultContent !== 'undefined' && typeof HelpDefaultContent.getDefaultHelpSections === 'function') {
            sections = HelpDefaultContent.getDefaultHelpSections();
        }
        this.helpCenterSections = sections.slice();
        return this.helpCenterSections;
    },

    getHelpCenterSections() {
        return Array.isArray(this.helpCenterSections) ? this.helpCenterSections.slice() : [];
    },

    renderHelpCenterList() {
        const listEl = document.getElementById('help-center-items-list');
        if (!listEl) return;
        const items = this.getHelpCenterSections();
        if (!items.length) {
            listEl.innerHTML = '<p class="text-sm text-gray-500">لا توجد أقسام. اضغط «إضافة قسم» أو «استعادة المحتوى الافتراضي».</p>';
            return;
        }
        const sorted = items.slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        listEl.innerHTML = sorted.map((item, idx) => {
            const title = Utils.escapeHTML((item.titleAr || item.titleEn || item.id || '').slice(0, 80)) || '(بدون عنوان)';
            const active = item.active !== false;
            const order = item.order ?? idx;
            const realIndex = items.indexOf(item);
            return `
                <div class="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-white" data-help-index="${realIndex}">
                    <div class="flex-1 min-w-0">
                        <span class="font-medium text-gray-800">${title}</span>
                        <span class="text-xs text-gray-500 mr-2">${Utils.escapeHTML(item.moduleKey || '—')}</span>
                        ${active ? '<span class="text-xs text-green-600">مفعّل</span>' : '<span class="text-xs text-gray-400">معطّل</span>'}
                    </div>
                    <div class="flex items-center gap-1">
                        <button type="button" class="help-center-edit-btn btn-icon btn-icon-secondary p-2" title="تعديل" data-index="${realIndex}"><i class="fas fa-edit"></i></button>
                        <button type="button" class="help-center-delete-btn btn-icon btn-icon-secondary p-2 text-red-600" title="حذف" data-index="${realIndex}"><i class="fas fa-trash"></i></button>
                        <button type="button" class="help-center-up-btn btn-icon btn-icon-secondary p-2" title="أعلى" data-index="${realIndex}"><i class="fas fa-arrow-up"></i></button>
                        <button type="button" class="help-center-down-btn btn-icon btn-icon-secondary p-2" title="أسفل" data-index="${realIndex}"><i class="fas fa-arrow-down"></i></button>
                    </div>
                </div>`;
        }).join('');
    },

    showHelpCenterForm(index) {
        const form = document.getElementById('help-center-item-form');
        const titleEl = document.getElementById('help-center-form-title');
        if (!form) return;
        this.helpCenterEditIndex = index === null || index === undefined ? null : index;
        const items = this.getHelpCenterSections();
        const item = this.helpCenterEditIndex !== null ? items[this.helpCenterEditIndex] : null;
        if (titleEl) titleEl.textContent = item ? 'تعديل قسم المساعدة' : 'إضافة قسم جديد';
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
        setVal('help-center-item-id', item?.id || '');
        setVal('help-center-item-title-ar', item?.titleAr || '');
        setVal('help-center-item-title-en', item?.titleEn || '');
        setVal('help-center-item-body-ar', item?.bodyAr || '');
        setVal('help-center-item-body-en', item?.bodyEn || '');
        setVal('help-center-item-module', item?.moduleKey || '');
        setVal('help-center-item-icon', item?.icon || 'fa-circle-info');
        setVal('help-center-item-category', item?.category || 'modules');
        setVal('help-center-item-order', item?.order ?? items.length + 1);
        const activeEl = document.getElementById('help-center-item-active');
        if (activeEl) activeEl.checked = item ? item.active !== false : true;
        form.classList.remove('hidden');
    },

    hideHelpCenterForm() {
        document.getElementById('help-center-item-form')?.classList.add('hidden');
        this.helpCenterEditIndex = null;
    },

    async saveHelpCenterToServer(sections) {
        const payload = {
            id: 'default',
            sections: sections || [],
            updatedAt: new Date().toISOString()
        };
        const res = await Backend.sendToAppsScript('saveHelpCenter', payload);
        if (!res || res.success === false) {
            throw new Error(res?.message || 'فشل حفظ مركز المساعدة');
        }
        this.helpCenterSections = (sections || []).slice();
        if (typeof Help !== 'undefined' && typeof Help.invalidateCache === 'function') {
            Help.invalidateCache();
        }
        return res;
    },

    setupHelpCenterEvents() {
        if (!this.isCurrentUserAdmin()) return;
        const listEl = document.getElementById('help-center-items-list');
        if (!listEl || listEl.dataset.bound === 'true') return;
        listEl.dataset.bound = 'true';

        this.loadHelpCenterSections().then(() => this.renderHelpCenterList()).catch(() => this.renderHelpCenterList());

        document.getElementById('help-center-add-btn')?.addEventListener('click', () => this.showHelpCenterForm(null));
        document.getElementById('help-center-item-cancel-btn')?.addEventListener('click', () => this.hideHelpCenterForm());
        document.getElementById('help-center-preview-btn')?.addEventListener('click', () => {
            if (typeof UI !== 'undefined' && typeof UI.showSection === 'function') UI.showSection('help');
        });
        document.getElementById('help-center-reset-btn')?.addEventListener('click', async () => {
            if (!confirm('استعادة المحتوى الافتراضي؟ سيتم استبدال جميع أقسام المساعدة الحالية.')) return;
            try {
                Loading.show();
                const defaults = (typeof HelpDefaultContent !== 'undefined' && HelpDefaultContent.getDefaultHelpSections)
                    ? HelpDefaultContent.getDefaultHelpSections() : [];
                await this.saveHelpCenterToServer(defaults);
                this.renderHelpCenterList();
                Notification.success('تم استعادة المحتوى الافتراضي');
            } catch (e) {
                Notification.error(e?.message || 'فشل الاستعادة');
            } finally {
                Loading.hide();
            }
        });
        document.getElementById('help-center-save-all-btn')?.addEventListener('click', async () => {
            try {
                Loading.show();
                await this.saveHelpCenterToServer(this.getHelpCenterSections());
                Notification.success('تم حفظ مركز المساعدة');
            } catch (e) {
                Notification.error(e?.message || 'فشل الحفظ');
            } finally {
                Loading.hide();
            }
        });
        document.getElementById('help-center-item-save-btn')?.addEventListener('click', async () => {
            const idRaw = document.getElementById('help-center-item-id')?.value?.trim();
            const titleAr = document.getElementById('help-center-item-title-ar')?.value?.trim();
            const titleEn = document.getElementById('help-center-item-title-en')?.value?.trim();
            if (!titleAr && !titleEn) {
                Notification.error('أدخل عنواناً بالعربية أو الإنجليزية');
                return;
            }
            const items = this.getHelpCenterSections();
            const entry = {
                id: idRaw || `help-${Date.now()}`,
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
            if (this.helpCenterEditIndex !== null && items[this.helpCenterEditIndex]) {
                items[this.helpCenterEditIndex] = { ...items[this.helpCenterEditIndex], ...entry };
            } else {
                items.push(entry);
            }
            try {
                Loading.show();
                await this.saveHelpCenterToServer(items);
                this.hideHelpCenterForm();
                this.renderHelpCenterList();
                Notification.success('تم حفظ القسم');
            } catch (e) {
                Notification.error(e?.message || 'فشل الحفظ');
            } finally {
                Loading.hide();
            }
        });

        listEl.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.help-center-edit-btn');
            const deleteBtn = e.target.closest('.help-center-delete-btn');
            const upBtn = e.target.closest('.help-center-up-btn');
            const downBtn = e.target.closest('.help-center-down-btn');
            const items = this.getHelpCenterSections();
            const idx = parseInt((editBtn || deleteBtn || upBtn || downBtn)?.dataset?.index, 10);
            if (editBtn && !isNaN(idx)) {
                this.showHelpCenterForm(idx);
                return;
            }
            if (deleteBtn && !isNaN(idx)) {
                if (!confirm('حذف هذا القسم؟')) return;
                items.splice(idx, 1);
                try {
                    Loading.show();
                    await this.saveHelpCenterToServer(items);
                    this.renderHelpCenterList();
                    Notification.success('تم الحذف');
                } catch (err) {
                    Notification.error(err?.message || 'فشل الحذف');
                } finally {
                    Loading.hide();
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
                    await this.saveHelpCenterToServer(items);
                    this.renderHelpCenterList();
                } catch (err) {
                    Notification.error(err?.message || 'فشل الترتيب');
                }
            }
            if (downBtn && !isNaN(idx)) {
                swap(idx, idx + 1);
                try {
                    await this.saveHelpCenterToServer(items);
                    this.renderHelpCenterList();
                } catch (err) {
                    Notification.error(err?.message || 'فشل الترتيب');
                }
            }
        });
    },

    /** ترجيع مصفوفة تعليمات ما بعد الدخول من إعدادات الشركة (مع تطبيع) */
    getPostLoginItems() {
        const raw = AppState?.companySettings?.postLoginItems;
        if (Array.isArray(raw)) return raw.slice();
        if (typeof raw === 'string' && raw.trim() !== '') {
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) { return []; }
        }
        return [];
    },

    /** عرض قائمة تعليمات ما بعد الدخول في واجهة الإعدادات */
    renderPostLoginItemsList() {
        const listEl = document.getElementById('post-login-items-list');
        if (!listEl) return;
        const items = this.getPostLoginItems();
        if (items.length === 0) {
            listEl.innerHTML = '<p class="text-sm text-gray-500">لا توجد عناصر. اضغط «إضافة عنصر» لبدء الإضافة.</p>';
            return;
        }
        const sorted = items.slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        listEl.innerHTML = sorted.map((item, idx) => {
            const title = Utils.escapeHTML((item.title || '').slice(0, 60)) || '(بدون عنوان)';
            const duration = item.durationSeconds !== undefined ? item.durationSeconds : 10;
            const active = item.active !== false;
            const order = item.order ?? idx;
            return `
                <div class="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-white" data-post-login-index="${idx}" data-post-login-order="${order}">
                    <div class="flex-1 min-w-0">
                        <span class="font-medium text-gray-800">${title}</span>
                        <span class="text-xs text-gray-500 mr-2">${duration} ث</span>
                        ${active ? '<span class="text-xs text-green-600">مفعّل</span>' : '<span class="text-xs text-gray-400">معطّل</span>'}
                    </div>
                    <div class="flex items-center gap-1">
                        <button type="button" class="post-login-edit-btn btn-icon btn-icon-secondary p-2" title="تعديل" data-index="${idx}"><i class="fas fa-edit"></i></button>
                        <button type="button" class="post-login-delete-btn btn-icon btn-icon-secondary p-2 text-red-600" title="حذف" data-index="${idx}"><i class="fas fa-trash"></i></button>
                        <button type="button" class="post-login-up-btn btn-icon btn-icon-secondary p-2" title="أعلى" data-index="${idx}"><i class="fas fa-arrow-up"></i></button>
                        <button type="button" class="post-login-down-btn btn-icon btn-icon-secondary p-2" title="أسفل" data-index="${idx}"><i class="fas fa-arrow-down"></i></button>
                    </div>
                </div>`;
        }).join('');
    },

    async load() {
        // إضافة مستمع لتغيير اللغة
        if (!this._languageChangeListenerAdded) {
            document.addEventListener('language-changed', () => {
                this.load();
            });
            this._languageChangeListenerAdded = true;
        }

        const section = document.getElementById('settings-section');
        if (!section) return;

        // التحقق من وجود Utils
        if (typeof Utils === 'undefined') {
            console.error('Utils غير متوفر!');
            return;
        }

        // التحقق من وجود AppState
        if (typeof AppState === 'undefined') {
            if (typeof Utils !== 'undefined' && Utils.safeError) {
                Utils.safeError('AppState غير متوفر!');
            } else {
                console.error('AppState غير متوفر!');
            }
            return;
        }

        try {
            if (typeof ViolationTypesManager !== 'undefined' && ViolationTypesManager.ensureInitialized) {
                ViolationTypesManager.ensureInitialized();
            }
            const isAdmin = this.isCurrentUserAdmin();

            if (typeof Permissions !== 'undefined') {
                // إعادة ربط أحداث إعدادات النماذج فقط — لا نُصفّر المواقع قبل اكتمال إعادة التحميل (تجنّب فراغ مؤقت)
                Permissions.formSettingsEventsBound = false;
            }
            // ✅ لا ننتظر تهيئة إعدادات النماذج — الواجهة تُرسم فوراً
            // (المواقع/الإعدادات تُحمَّل في الخلفية ويُعاد رسم كارت إعدادات النماذج عند الجاهزية)

        section.innerHTML = `
            <div class="section-header">
                <h1 class="section-title">
                    <i class="fas fa-cog ml-3"></i>
                    ${I18n.t('settings.title')}
                </h1>
                <p class="section-subtitle">${I18n.t('settings.subtitle')}</p>
            </div>

            <!-- Tabs Navigation -->
            <div class="tabs-container mt-6">
                <div class="tabs-nav">
                    <button class="tab-btn active" data-tab="company-data">
                        <i class="fas fa-building ml-2"></i>
                        ${I18n.t('settings.tabs.company')}
                    </button>
                    <button class="tab-btn" data-tab="integration">
                        <i class="fas fa-cloud ml-2"></i>
                        ${I18n.t('settings.tabs.integration')}
                    </button>
                    <button class="tab-btn" data-tab="cloud-storage">
                        <i class="fas fa-cloud-upload-alt ml-2"></i>
                        ${I18n.t('settings.tabs.cloud')}
                    </button>
                    <button class="tab-btn" data-tab="google-drive">
                        <i class="fab fa-google-drive ml-2"></i>
                        ${I18n.t('settings.tabs.drive')}
                    </button>
                    <button class="tab-btn" data-tab="sharepoint">
                        <i class="fab fa-microsoft ml-2"></i>
                        ${I18n.t('settings.tabs.sharepoint')}
                    </button>
                    <button class="tab-btn" data-tab="system-settings">
                        <i class="fas fa-sliders-h ml-2"></i>
                        ${I18n.t('settings.tabs.system')}
                    </button>
                    <button class="tab-btn" data-tab="form-settings">
                        <i class="fas fa-file-alt ml-2"></i>
                        ${I18n.t('settings.tabs.forms')}
                    </button>
                    <button class="tab-btn" data-tab="violation-types">
                        <i class="fas fa-tags ml-2"></i>
                        ${I18n.t('settings.tabs.violations')}
                    </button>
                    <button class="tab-btn" data-tab="reports">
                        <i class="fas fa-file-pdf ml-2"></i>
                        ${I18n.t('settings.tabs.reports')}
                    </button>
                    <button class="tab-btn" data-tab="notifications">
                        <i class="fas fa-envelope ml-2"></i>
                        ${I18n.t('settings.tabs.email')}
                    </button>
                    <button class="tab-btn" data-tab="permissions">
                        <i class="fas fa-shield-alt ml-2"></i>
                        ${I18n.t('settings.tabs.permissions')}
                    </button>
                    <button class="tab-btn" data-tab="approval-circuit">
                        <i class="fas fa-project-diagram ml-2"></i>
                        ${I18n.t('settings.tabs.circuit')}
                    </button>
                    <button class="tab-btn" data-tab="help-center" ${!isAdmin ? 'style="display:none;"' : ''}>
                        <i class="fas fa-circle-question ml-2"></i>
                        ${I18n.t('settings.tabs.help')}
                    </button>
                    <button class="tab-btn" data-tab="logs" ${!isAdmin ? 'style="display:none;"' : ''}>
                        <i class="fas fa-history ml-2"></i>
                        ${I18n.t('settings.tabs.logs')}
                    </button>
                </div>
            </div>

            <!-- Tab Content: Company Data -->
            <div class="tab-content active" id="tab-company-data">
                <div class="settings-group mt-6">
                <div class="settings-group-header">
                    <h2 class="settings-group-title">
                        <i class="fas fa-building text-blue-600 ml-2"></i>
                        ${I18n.t('settings.company.title')}
                    </h2>
                    <p class="settings-group-subtitle">${I18n.t('settings.company.subtitle')}</p>
                </div>
                <div class="settings-group-content">
                    <div class="content-card">
                        <div class="card-header">
                            <h2 class="card-title"><i class="fas fa-building ml-2"></i>${I18n.t('settings.company.title')}</h2>
                        </div>
                        <div class="card-body space-y-4">
                            <div>
                                <label for="company-name-input" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-pen ml-2"></i>
                                    ${I18n.t('settings.company.name')}
                                </label>
                                <input type="text" id="company-name-input" class="form-input"
                                    placeholder="${I18n.isRTL() ? 'أدخل اسم الشركة' : 'Enter company name'}" value="${Utils.escapeHTML(AppState.companySettings?.name || '')}">
                                <p class="text-xs text-gray-500 mt-1">
                                    <i class="fas fa-info-circle ml-1"></i>
                                    ${I18n.t('settings.company.nameHint')}
                                </p>
                            </div>
                            <div>
                                <label for="company-name-font-size-input" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-text-height ml-2"></i>
                                    ${I18n.t('settings.company.fontSize')}
                                </label>
                                <div class="flex items-center gap-3">
                                    <input type="number" id="company-name-font-size-input" class="form-input" min="8" max="72" step="1"
                                        placeholder="${I18n.isRTL() ? 'مثال: 16' : 'e.g., 16'}" value="${AppState.companySettings?.nameFontSize || '16'}">
                                    <span class="text-xs text-gray-500">${I18n.isRTL() ? 'بكسل' : 'px'}</span>
                                </div>
                                <p class="text-xs text-gray-500 mt-1">
                                    <i class="fas fa-info-circle ml-1"></i>
                                    ${I18n.t('settings.company.fontSizeHint')}
                                </p>
                            </div>
                            <div>
                                <label for="company-secondary-name-input" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-pen-nib ml-2"></i>
                                    ${I18n.t('settings.company.secondaryName')}
                                </label>
                                <input type="text" id="company-secondary-name-input" class="form-input"
                                    placeholder="${I18n.isRTL() ? 'أدخل الاسم الإضافي للشركة' : 'Enter secondary company name'}" value="${Utils.escapeHTML(AppState.companySettings?.secondaryName || '')}">
                                <p class="text-xs text-gray-500 mt-1">
                                    <i class="fas fa-info-circle ml-1"></i>
                                    ${I18n.t('settings.company.secondaryNameHint')}
                                </p>
                            </div>
                            <div>
                                <label for="company-secondary-name-font-size-input" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-text-height ml-2"></i>
                                    حجم خط الاسم الإضافي (بالبكسل)
                                </label>
                                <div class="flex items-center gap-3">
                                    <input type="number" id="company-secondary-name-font-size-input" class="form-input" min="8" max="72" step="1"
                                        placeholder="مثال: 14" value="${AppState.companySettings?.secondaryNameFontSize || '14'}">
                                    <span class="text-xs text-gray-500">بكسل</span>
                                </div>
                                <p class="text-xs text-gray-500 mt-1">
                                    <i class="fas fa-info-circle ml-1"></i>
                                    حجم الخط الافتراضي: 14 بكسل. يمكنك تغييره من 8 إلى 72 بكسل.
                                </p>
                            </div>
                            <div>
                                <span id="company-secondary-name-color-label" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-palette ml-2"></i>
                                    لون الاسم الإضافي
                                </span>
                                <div class="flex items-center gap-3" role="group" aria-labelledby="company-secondary-name-color-label">
                                    <label for="company-secondary-name-color-input" class="sr-only">لون الاسم الإضافي (منتقي)</label>
                                    <input type="color" id="company-secondary-name-color-input" class="form-input" style="width: 80px; height: 40px; cursor: pointer;"
                                        value="${AppState.companySettings?.secondaryNameColor || '#6B7280'}">
                                    <label for="company-secondary-name-color-text-input" class="sr-only">لون الاسم الإضافي (كود)</label>
                                    <input type="text" id="company-secondary-name-color-text-input" class="form-input flex-1"
                                        placeholder="#6B7280" value="${AppState.companySettings?.secondaryNameColor || '#6B7280'}">
                                </div>
                                <p class="text-xs text-gray-500 mt-1">
                                    <i class="fas fa-info-circle ml-1"></i>
                                    يمكنك اختيار اللون باستخدام منتقي الألوان أو إدخال كود اللون مباشرة (مثل: #6B7280 أو rgb(107, 112, 128)).
                                </p>
                            </div>
                            <div>
                                <label for="form-version-input" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-code-branch ml-2"></i>
                                    رقم الإصدار (يظهر في الهيدر والفوتر)
                                </label>
                                <input type="text" id="form-version-input" class="form-input"
                                    placeholder="مثال: 1.0" value="${Utils.escapeHTML(AppState.companySettings?.formVersion || '1.0')}">
                                <p class="text-xs text-gray-500 mt-1">
                                    <i class="fas fa-info-circle ml-1"></i>
                                    سيتم عرض رقم الإصدار في الهيدر والفوتر لجميع النماذج والتقارير.
                                </p>
                            </div>
                            <div>
                                <label for="clinic-monthly-visits-threshold-input" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-hospital ml-2"></i>
                                    حد تنبيه زيارات العيادة الشهرية
                                </label>
                                <div class="flex items-center gap-3">
                                    <input type="number" id="clinic-monthly-visits-threshold-input" class="form-input" min="1" max="1000" step="1"
                                        placeholder="10" value="${Math.max(1, Math.min(1000, parseInt(AppState.companySettings?.clinicMonthlyVisitsAlertThreshold, 10) || 10))}">
                                    <span class="text-xs text-gray-500">زيارة/شهر</span>
                                </div>
                                <p class="text-xs text-gray-500 mt-1">
                                    <i class="fas fa-info-circle ml-1"></i>
                                    عند وصول أو تجاوز عدد زيارات موظف/مقاول لهذا الحد في الشهر، يظهر تنبيه للمستخدم ويُرسل إشعار لمدير النظام.
                                </p>
                            </div>
                            <div>
                                <label for="profile-teams-url-input" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fab fa-microsoft ml-2"></i>
                                    رابط Microsoft Teams (يظهر في الملف الشخصي)
                                </label>
                                <input type="url" id="profile-teams-url-input" class="form-input" dir="ltr"
                                    placeholder="https://teams.microsoft.com/..."
                                    value="${Utils.escapeHTML(AppState.companySettings?.profileTeamsUrl || '')}">
                                <p class="text-xs text-gray-500 mt-1">
                                    <i class="fas fa-info-circle ml-1"></i>
                                    رابط قناة أو فريق أو اجتماع Teams. يُعرض كأيقونة بجانب «تغيير كلمة المرور».
                                </p>
                            </div>
                            <div>
                                <label for="profile-whatsapp-url-input" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fab fa-whatsapp ml-2"></i>
                                    رابط واتساب (يظهر في الملف الشخصي)
                                </label>
                                <input type="url" id="profile-whatsapp-url-input" class="form-input" dir="ltr"
                                    placeholder="https://wa.me/9665xxxxxxxx أو رابط مجموعة"
                                    value="${Utils.escapeHTML(AppState.companySettings?.profileWhatsAppUrl || '')}">
                                <p class="text-xs text-gray-500 mt-1">
                                    <i class="fas fa-info-circle ml-1"></i>
                                    إذا تُرك فارغاً، يُستخدم رقم الهاتف من بيانات الموظف لرابط wa.me عندما يكون الرقم صالحاً.
                                </p>
                            </div>
                            <div class="md:col-span-2 border-t pt-4">
                                <div class="flex flex-wrap items-start justify-between gap-3 mb-4 p-4 rounded-xl bg-gradient-to-br from-blue-50 via-indigo-50/50 to-cyan-50/40 border border-blue-200/70 shadow-sm">
                                    <div class="flex-1 min-w-0">
                                        <h3 class="text-sm font-bold text-blue-900 mb-2 flex flex-wrap items-center gap-2">
                                            <span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-md">
                                                <i class="fas fa-shield-alt text-sm"></i>
                                            </span>
                                            قواعد الحدّ الأدنى بين استلامَين بنفس الموظف (مهمات الوقاية)
                                        </h3>
                                        <p class="text-xs text-blue-800/85 leading-relaxed max-w-3xl">
                                            جدّد الجدول لكل <strong class="font-semibold">صنف</strong> عدد <strong class="font-semibold">الشهور</strong> كحدّ أدنى بين استلام واحد والذي بعده. ثم احفظ بـ<strong>«حفظ بيانات الشركة»</strong> لمزامنة الشيت والتطبيق.
                                        </p>
                                        <p class="text-[11px] text-slate-600 mt-2">
                                            <i class="fas fa-database ml-1 text-blue-600"></i>
                                            البيانات تُزاد هنا؛ التخزين مع الخادم عند ضغط «حفظ بيانات الشركة» أسفل البطاقة.
                                        </p>
                                    </div>
                                    <div class="flex flex-wrap items-center gap-2.5">
                                        <button type="button" id="ppe-download-template-btn" style="font-size:1rem;font-weight:800;" class="btn-primary shrink-0 inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500 text-base font-extrabold px-6 py-3 min-h-[50px] shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300">
                                            <i class="fas fa-file-download"></i> تحميل قالب
                                        </button>
                                        <button type="button" id="ppe-import-rules-btn" style="font-size:1rem;font-weight:800;" class="btn-primary shrink-0 inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500 text-base font-extrabold px-6 py-3 min-h-[50px] shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300">
                                            <i class="fas fa-file-import"></i> استيراد
                                        </button>
                                        <button type="button" id="ppe-add-rule-btn" style="font-size:1rem;font-weight:800;" class="btn-primary inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500 text-base font-extrabold px-6 py-3 min-h-[50px] shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300">
                                            <i class="fas fa-plus"></i> إضافة صف
                                        </button>
                                    </div>
                                </div>
                                <div id="ppe-eligibility-rules-container" class="w-full min-w-0"></div>
                                <input type="file" id="ppe-rules-import-file" accept=".csv,.txt,.xlsx,.xls" class="hidden">
                            </div>
                            <div class="flex flex-wrap items-center gap-3 pt-3 mt-1 border-t border-slate-200">
                                <button type="button" id="save-company-settings-btn" style="font-size:1rem;font-weight:800;" class="btn-primary inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500 text-base font-extrabold px-6 py-3 min-h-[50px] shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300">
                                    <i class="fas fa-save ml-2"></i>حفظ بيانات الشركة
                                </button>
                                <button type="button" id="reset-company-name-btn" style="font-size:1rem;font-weight:800;" class="btn-primary inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500 text-base font-extrabold px-6 py-3 min-h-[50px] shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300">
                                    <i class="fas fa-undo ml-2"></i>استعادة الاسم الافتراضي
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="content-card mt-6">
                        <div class="card-header">
                            <h2 class="card-title"><i class="fas fa-image ml-2"></i>شعار الشركة</h2>
                        </div>
                        <div class="card-body space-y-4">
                            <div>
<label for="company-logo-input" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-upload ml-2"></i>
                                    رفع شعار الشركة
                                </label>
                                <div class="flex items-center gap-4">
                                    ${AppState.companyLogo ? `
                                        <div class="flex-shrink-0">
                                            <img src="${AppState.companyLogo}" alt="شعار الشركة" id="company-logo-preview"
                                                class="w-32 h-32 object-contain border border-gray-300 rounded p-2 bg-white">
                                        </div>
                                    ` : ''}
                                    <div class="flex-1">
                                        <input type="file" id="company-logo-input" accept="image/*" class="form-input text-sm">
                                        <p class="text-xs text-gray-500 mt-1">
                                            <i class="fas fa-info-circle ml-1"></i>
                                            سيتم عرض الشعار في يسار جميع النماذج والصفحات. الحد الأقصى لحجم الصورة: 2MB
                                        </p>
                                        <div class="flex items-center gap-2 mt-2">
                                            <button type="button" id="upload-logo-btn" style="font-size:1rem;font-weight:800;" class="btn-primary inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500 text-base font-extrabold px-6 py-3 min-h-[50px] shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300">
                                                <i class="fas fa-upload ml-2"></i>رفع الشعار
                                            </button>
                                            ${AppState.companyLogo ? `
                                                <button type="button" id="remove-logo-btn" class="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-600 hover:bg-red-700 text-white text-base font-extrabold px-5 py-3 min-h-[48px] shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-300">
                                                    <i class="fas fa-trash ml-2"></i>إزالة الشعار
                                                </button>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="content-card mt-6" id="post-login-items-card">
                        <div class="card-header">
                            <h2 class="card-title"><i class="fas fa-clipboard-list ml-2"></i>تعليمات وعروض ما بعد تسجيل الدخول</h2>
                        </div>
                        <div class="card-body space-y-4">
                            <p class="text-sm text-gray-600">
                                <i class="fas fa-info-circle ml-1"></i>
                                تظهر هذه النصوص أو السياسات للمستخدم بعد تسجيل الدخول لمدة محددة (مثل سياسة السلامة والصحة المهنية). يمكنك إضافة أكثر من عنصر وترتيبها.
                            </p>
                            <div id="post-login-items-list" class="space-y-3"></div>
                            <div class="flex items-center gap-2 pt-2 border-t">
                                <button type="button" id="post-login-add-item-btn" style="font-size:1rem;font-weight:800;" class="btn-primary inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500 text-base font-extrabold px-6 py-3 min-h-[50px] shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300">
                                    <i class="fas fa-plus ml-2"></i>إضافة عنصر
                                </button>
                            </div>
                            <div id="post-login-item-form" class="hidden mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
                                <h3 class="font-semibold text-gray-800" id="post-login-form-title">إضافة عنصر جديد</h3>
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-1">العنوان</label>
                                    <input type="text" id="post-login-item-title" class="form-input" placeholder="مثال: سياسة السلامة والصحة المهنية" maxlength="200">
                                </div>
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-1">النص</label>
                                    <textarea id="post-login-item-body" class="form-input" rows="4" placeholder="أدخل النص أو السياسة..." maxlength="2000"></textarea>
                                    <p class="text-xs text-gray-500 mt-1">الحد الأقصى 2000 حرف</p>
                                </div>
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-1">مدة العرض (ثانية)</label>
                                    <input type="number" id="post-login-item-duration" class="form-input" min="0" max="120" value="10" placeholder="10">
                                    <p class="text-xs text-gray-500 mt-1">0 = حتى يضغط المستخدم تخطي فقط</p>
                                </div>
                                <div class="flex items-center gap-2">
                                    <input type="checkbox" id="post-login-item-active" class="rounded border-gray-300 text-blue-600" checked>
                                    <label for="post-login-item-active" class="text-sm text-gray-700">مفعّل (يُعرض للمستخدمين)</label>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button type="button" id="post-login-item-save-btn" class="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-base font-extrabold px-5 py-2.5 min-h-[44px] shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300"><i class="fas fa-save ml-2"></i>حفظ</button>
                                    <button type="button" id="post-login-item-cancel-btn" class="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-400 bg-blue-600 hover:bg-blue-700 text-white text-base font-bold px-5 py-2.5 min-h-[44px] shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300"><i class="fas fa-times ml-2"></i>إلغاء</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            </div>

            <!-- Tab Content: التكامل والمزامنة -->
            <div class="tab-content" id="tab-integration">
                <div class="settings-group mt-6">
                    <div class="settings-group-header">
                        <h2 class="settings-group-title">
                            <i class="fas fa-cloud text-green-600 ml-2"></i>
                            التكامل والمزامنة
                        </h2>
                        <p class="settings-group-subtitle">إعدادات الاتصال بـ الخادم السحابي والمزامنة مع Google Sheets</p>
                    </div>
                    <div class="settings-group-content">
                        <div class="content-card">
                            <div class="card-header">
                                <h2 class="card-title"><i class="fas fa-cloud ml-2"></i>الخادم والمزامنة</h2>
                            </div>
                            <div class="card-body">
                                <form id="google-settings-form" class="space-y-6">
                                    <div>
                                        <label class="flex items-center mb-4">
                                            <input type="checkbox" id="google-apps-script-enabled" class="rounded border-gray-300 text-blue-600"
                                                ${AppState.backendConfig.server.enabled ? 'checked' : ''}>
                                            <span class="mr-2 text-sm text-gray-700">تفعيل الاتصال بالخادم الخلفي</span>
                                        </label>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                                            <i class="fas fa-link ml-2"></i>
                                            رابط Web App لـ الخادم السحابي (مطلوب للمزامنة)
                                        </label>
                                        <input type="url" id="google-apps-script-url" class="form-input"
                                            value="${AppState.backendConfig.server.scriptUrl || ''}"
                                            placeholder="https://script.google.com/macros/s/…/exec">
                                    </div>
                                    <div>
                                        <label class="flex items-center mb-4">
                                            <input type="checkbox" id="google-sheets-enabled" class="rounded border-gray-300 text-blue-600"
                                                ${AppState.backendConfig.sheets.enabled ? 'checked' : ''}>
                                            <span class="mr-2 text-sm text-gray-700">تفعيل مزامنة الجداول (إن يطلبها الخادم)</span>
                                        </label>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                                            <i class="fas fa-table ml-2"></i>
                                            معرف الجدول / المشروع (اختياري)
                                        </label>
                                        <input type="text" id="google-sheets-id" class="form-input"
                                            value="${AppState.backendConfig.sheets.spreadsheetId || ''}"
                                            placeholder="إن وُجد في إعدادات الخادم">
                                    </div>
                                    <div class="flex items-center justify-end gap-4 pt-4 border-t">
                                        <button type="button" id="test-connection-btn" class="btn-secondary">
                                            <i class="fas fa-plug ml-2"></i>
                                            اختبار الاتصال
                                        </button>
                                        <button type="submit" class="btn-primary">
                                            <i class="fas fa-save ml-2"></i>
                                            حفظ الإعدادات
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                        
                        <!-- المزامنة والإعداد -->
                        <div class="content-card mt-6">
                            <div class="card-header">
                                <h2 class="card-title"><i class="fas fa-sync ml-2"></i>المزامنة والإعداد</h2>
                            </div>
                            <div class="card-body space-y-4">
                                <div>
                                    <p class="text-sm text-gray-600 mb-4">
                                        <i class="fas fa-info-circle ml-2"></i>
                                        سيتم إنشاء جميع الأوراق المطلوبة (Users, Incidents, NearMiss, PTW, Training, Clinic, Fire Equipment, PPE, ViolationTypes, Violations, Contractors) تلقائياً مع الرؤوس الافتراضية
                                    </p>
                                    <button id="initialize-sheets-btn" class="btn-primary w-full">
                                        <i class="fas fa-magic ml-2"></i>
                                        إنشاء جميع الأوراق تلقائياً
                                    </button>
                                </div>
                                <div class="border-t pt-4">
                                    <button id="sync-data-btn" class="btn-primary w-full">
                                        <i class="fas fa-sync ml-2"></i>
                                        مزامنة البيانات من الخادم (قراءة)
                                    </button>
                                </div>
                                <div class="border-t pt-4">
                                    <button id="save-all-data-btn" class="btn-success w-full">
                                        <i class="fas fa-cloud-upload-alt ml-2"></i>
                                        حفظ جميع البيانات في الخادم (كتابة)
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tab Content: تكامل التخزين السحابي -->
            <div class="tab-content" id="tab-cloud-storage">
                ${isAdmin ? this.renderCloudStorageSettings() : '<div class="settings-group mt-6"><p class="text-gray-600">هذا القسم متاح للمديرين فقط</p></div>'}
            </div>

            <!-- Tab Content: Google Drive -->
            <div class="tab-content" id="tab-google-drive">
                ${isAdmin ? this.renderGoogleDriveSettings() : '<div class="settings-group mt-6"><p class="text-gray-600">هذا القسم متاح للمديرين فقط</p></div>'}
            </div>

            <!-- Tab Content: Microsoft SharePoint -->
            <div class="tab-content" id="tab-sharepoint">
                ${isAdmin ? this.renderSharePointSettings() : '<div class="settings-group mt-6"><p class="text-gray-600">هذا القسم متاح للمديرين فقط</p></div>'}
            </div>

            <!-- Tab Content: إعدادات النظام -->
            <div class="tab-content" id="tab-system-settings">
                <div class="settings-group mt-6">
                    <div class="settings-group-header">
                        <h2 class="settings-group-title">
                            <i class="fas fa-sliders-h text-purple-600 ml-2"></i>
                            إعدادات النظام
                        </h2>
                        <p class="settings-group-subtitle">إعدادات التاريخ والنماذج والأنواع</p>
                    </div>
                    <div class="settings-group-content">
                        <div class="content-card">
                            <div class="card-header">
                                <h2 class="card-title"><i class="fas fa-calendar-alt ml-2"></i>إعدادات التاريخ</h2>
                            </div>
                            <div class="card-body space-y-4">
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">
                                        <i class="fas fa-calendar-check ml-2"></i>
                                        نوع التقويم
                                    </label>
                                    <select id="date-format-select" class="form-input">
                                        <option value="gregorian" ${AppState.dateFormat === 'gregorian' ? 'selected' : ''}>الميلادي (Gregorian)</option>
                                        <option value="hijri" ${AppState.dateFormat === 'hijri' ? 'selected' : ''}>الهجري (Hijri)</option>
                                    </select>
                                    <p class="text-xs text-gray-500 mt-1">
                                        <i class="fas fa-info-circle ml-1"></i>
                                        سيتم تطبيق نوع التقويم على جميع التواريخ في النظام
                                    </p>
                                    <button type="button" id="save-date-format-btn" class="btn-primary mt-2">
                                        <i class="fas fa-save ml-2"></i>حفظ إعدادات التاريخ
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="content-card mt-6">
                            <div class="card-header">
                                <h2 class="card-title"><i class="fas fa-clock ml-2"></i>حساب إجمالي ساعات العمل — لوحة التحكم</h2>
                            </div>
                            <div class="card-body space-y-4">
                                <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                                    يُستخدم لكارت <strong>عدد ساعات العمل</strong> ومؤشّري <strong>FA</strong> و<strong>TRIR</strong>، وحقل <strong>TIR</strong> (لكل 100 عامل/workforce).
                                    إن لم يُملأ «إجمالي الساعات اليدوي» يُقدَّر الإجمالي من: موظفون نشطون × (ساعات/يوم × أيام/شهر × أشهر/سنة) مع إضافة عمالة المقاولين إن فُعّل الخيار ووُجدت أعداد في سجل المقاول المعتمد.
                                </p>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div class="md:col-span-2">
                                        <label class="block text-sm font-semibold text-gray-700 mb-2" for="wh-total-override">إجمالي ساعات العمل (يدوي — يتجاوز التقدير)</label>
                                        <input type="text" id="wh-total-override" class="form-input" placeholder="اتركه فارغاً لاستخدام التقدير التلقائي" inputmode="decimal" autocomplete="off" />
                                        <p class="text-xs text-gray-500 mt-1">يُحفظ في التخزين المحلي تحت المفتاح <code class="text-xs">hse_total_work_hours</code>. فارغ = حذف اليدوي.</p>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2" for="wh-hours-per-day">ساعات العمل يومياً</label>
                                        <input type="number" id="wh-hours-per-day" class="form-input" min="1" max="24" step="0.25" placeholder="8" />
                                    </div>
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2" for="wh-days-per-month">أيام العمل في الشهر</label>
                                        <input type="number" id="wh-days-per-month" class="form-input" min="1" max="31" step="1" placeholder="22" />
                                    </div>
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2" for="wh-months-per-year">عدد الأشهر في السنة (للتقدير)</label>
                                        <input type="number" id="wh-months-per-year" class="form-input" min="1" max="12" step="1" placeholder="12" />
                                    </div>
                                    <div class="flex items-center pt-6">
                                        <input type="checkbox" id="wh-include-contractors" class="form-checkbox h-5 w-5" />
                                        <label for="wh-include-contractors" class="mr-2 text-sm font-medium text-gray-800">إضافة عمالة المقاولين المعتمدين (من حقول رقمية في السجل إن وُجدت)</label>
                                    </div>
                                </div>
                                <p class="text-xs text-gray-500">
                                    المفاتيح: <code>hse_hours_per_day</code>، <code>hse_work_days_per_month</code>، <code>hse_work_months_per_year</code>، <code>hse_work_hours_include_contractors</code>.
                                </p>
                                <button type="button" id="save-work-hours-settings-btn" class="btn-primary">
                                    <i class="fas fa-save ml-2"></i>حفظ إعدادات ساعات العمل
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Backup Management Section (Admin Only) -->
                <div id="backup-management-section" class="settings-group mt-6" style="display: none;">
                    <div class="settings-group-header">
                        <h3 class="settings-group-title">
                            <i class="fas fa-database ml-2"></i>
                            إدارة النسخ الاحتياطية
                        </h3>
                        <p class="settings-group-subtitle">
                            إدارة النسخ الاحتياطية للبيانات وإنشاء نسخ يدوية
                        </p>
                    </div>
                    <div class="settings-group-content">
                        <!-- Backup Statistics Card -->
                        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
                            <h4 class="text-lg font-semibold mb-4 flex items-center">
                                <i class="fas fa-chart-bar ml-2 text-blue-600"></i>
                                إحصائيات النسخ الاحتياطية
                            </h4>
                            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div class="bg-gray-50 dark:bg-gray-700 rounded p-4">
                                    <p class="text-sm text-gray-600 dark:text-gray-400">إجمالي النسخ</p>
                                    <p class="text-xl font-bold" id="total-backups-count">0</p>
                                </div>
                                <div class="bg-gray-50 dark:bg-gray-700 rounded p-4">
                                    <p class="text-sm text-gray-600 dark:text-gray-400">النسخ الناجحة</p>
                                    <p class="text-xl font-bold text-green-600" id="successful-backups-count">0</p>
                                </div>
                                <div class="bg-gray-50 dark:bg-gray-700 rounded p-4">
                                    <p class="text-sm text-gray-600 dark:text-gray-400">النسخ الفاشلة</p>
                                    <p class="text-xl font-bold text-red-600" id="failed-backups-count">0</p>
                                </div>
                                <div class="bg-gray-50 dark:bg-gray-700 rounded p-4">
                                    <p class="text-sm text-gray-600 dark:text-gray-400">معدل النجاح</p>
                                    <p class="text-xl font-bold" id="backup-success-rate">0%</p>
                                </div>
                                <div class="bg-gray-50 dark:bg-gray-700 rounded p-4">
                                    <p class="text-sm text-gray-600 dark:text-gray-400">آخر نسخة</p>
                                    <p class="text-sm" id="last-backup-time">-</p>
                                </div>
                                <div class="bg-gray-50 dark:bg-gray-700 rounded p-4">
                                    <p class="text-sm text-gray-600 dark:text-gray-400">المساحة المستخدمة</p>
                                    <p class="text-sm font-bold" id="backup-storage-used">0 Bytes</p>
                                </div>
                            </div>
                            <div class="mt-4 flex gap-2">
                                <button id="create-manual-backup-btn" class="btn btn-primary">
                                    <i class="fas fa-database ml-2"></i>
                                    إنشاء نسخة احتياطية يدوية
                                </button>
                                <button id="refresh-backups-btn" class="btn btn-secondary">
                                    <i class="fas fa-sync-alt ml-2"></i>
                                    تحديث
                                </button>
                            </div>
                        </div>
                        
                        <!-- Backup Settings Card -->
                        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
                            <h4 class="text-lg font-semibold mb-4 flex items-center">
                                <i class="fas fa-cog ml-2 text-green-600"></i>
                                إعدادات النسخ الاحتياطية
                            </h4>
                            <div class="space-y-4">
                                <div class="flex items-center">
                                    <input type="checkbox" id="auto-backup-enabled" class="form-checkbox">
                                    <label for="auto-backup-enabled" class="mr-2">تفعيل النسخ الاحتياطي التلقائي</label>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-sm font-medium mb-2">الحد الأقصى للنسخ</label>
                                        <input type="number" id="max-backup-files" class="form-input" value="30" min="1" max="100">
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium mb-2">مدة الاحتفاظ (بالأيام)</label>
                                        <input type="number" id="retention-days" class="form-input" value="30" min="1" max="365">
                                    </div>
                                </div>
                                <div class="flex items-center gap-4">
                                    <label class="flex items-center">
                                        <input type="checkbox" id="notify-on-backup" class="form-checkbox" checked>
                                        <span class="mr-2">إشعار عند إنشاء نسخة احتياطية</span>
                                    </label>
                                    <label class="flex items-center">
                                        <input type="checkbox" id="notify-on-failure" class="form-checkbox" checked>
                                        <span class="mr-2">إشعار عند فشل النسخ</span>
                                    </label>
                                </div>
                                <div class="flex gap-2">
                                    <button id="save-backup-settings-btn" class="btn btn-primary">
                                        <i class="fas fa-save ml-2"></i>
                                        حفظ الإعدادات
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Backups List -->
                        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                            <h4 class="text-lg font-semibold mb-4 flex items-center">
                                <i class="fas fa-list ml-2 text-purple-600"></i>
                                قائمة النسخ الاحتياطية
                            </h4>
                            <div id="backups-list" class="space-y-3 max-h-96 overflow-y-auto">
                                <p class="text-gray-500 text-center py-4">جاري التحميل...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tab Content: إعدادات النماذج -->
            <div class="tab-content" id="tab-form-settings">
                ${isAdmin && typeof Permissions?.renderFormSettingsCard === 'function' ? Permissions.renderFormSettingsCard() : '<div class="settings-group mt-6"><p class="text-gray-600">هذا القسم متاح للمديرين فقط</p></div>'}
            </div>

            <!-- Tab Content: إدارة أنواع المخالفات -->
            <div class="tab-content" id="tab-violation-types">
                <div class="settings-group mt-6">
                    <div class="settings-group-header">
                        <h2 class="settings-group-title">
                            <i class="fas fa-tags text-purple-600 ml-2"></i>
                            إدارة أنواع المخالفات
                        </h2>
                        <p class="settings-group-subtitle">إدارة أنواع المخالفات في النظام</p>
                    </div>
                    <div class="settings-group-content">
                        <div class="content-card">
                            <div class="card-header flex items-center justify-between flex-wrap gap-2">
                                <h2 class="card-title"><i class="fas fa-tags ml-2"></i>إدارة أنواع المخالفات</h2>
                                <div class="flex flex-wrap gap-2 items-center">
                                    <button type="button" id="export-violation-types-btn" class="btn-secondary" title="تصدير القائمة إلى ملف Excel">
                                        <i class="fas fa-file-export ml-2 text-green-700"></i>
                                        تصدير إلى Excel
                                    </button>
                                    <button type="button" id="import-violation-types-btn" class="btn-secondary">
                                        <i class="fas fa-file-excel ml-2 text-green-700"></i>
                                        استيراد من Excel
                                    </button>
                                    <button type="button" id="add-violation-type-btn" class="btn-primary">
                                        <i class="fas fa-plus ml-2"></i>
                                        إضافة نوع مخالفة
                                    </button>
                                </div>
                            </div>
                            <div class="card-body">
                                <div id="violation-types-management">
                                    ${this.renderViolationTypesList()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tab Content: التقارير والإشعارات -->
            <div class="tab-content" id="tab-reports">
                <div class="settings-group mt-6">
                    <div class="settings-group-header">
                        <h2 class="settings-group-title">
                            <i class="fas fa-file-pdf text-red-600 ml-2"></i>
                            التقارير والإشعارات
                        </h2>
                        <p class="settings-group-subtitle">إنشاء تقارير PDF لجميع البيانات</p>
                    </div>
                    <div class="settings-group-content">
                        <div class="content-card">
                            <div class="card-header">
                                <h2 class="card-title"><i class="fas fa-file-pdf ml-2"></i>إنشاء التقارير</h2>
                            </div>
                            <div class="card-body space-y-4">
                                <p class="text-sm text-gray-600 mb-4">
                                    <i class="fas fa-info-circle ml-2"></i>
                                    إنشاء تقارير PDF لجميع البيانات
                                </p>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button id="generate-incidents-report-btn" class="btn-secondary w-full">
                                        <i class="fas fa-file-pdf ml-2"></i>
                                        تقرير الحوادث
                                    </button>
                                    <button id="generate-training-report-btn" class="btn-secondary w-full">
                                        <i class="fas fa-file-pdf ml-2"></i>
                                        تقرير التدريب
                                    </button>
                                    <button id="generate-ptw-report-btn" class="btn-secondary w-full">
                                        <i class="fas fa-file-pdf ml-2"></i>
                                        تقرير تصاريح العمل
                                    </button>
                                    <button id="generate-full-report-btn" class="btn-primary w-full">
                                        <i class="fas fa-file-pdf ml-2"></i>
                                        تقرير شامل (جميع البيانات)
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tab Content: إدارة الإشعارات الإلكترونية -->
            <div class="tab-content" id="tab-notifications">
                <div class="settings-group mt-6">
                    <div class="settings-group-header">
                        <h2 class="settings-group-title">
                            <i class="fas fa-envelope text-red-600 ml-2"></i>
                            إدارة الإشعارات الإلكترونية
                        </h2>
                        <p class="settings-group-subtitle">إدارة قائمة الإيميلات للإشعارات</p>
                    </div>
                    <div class="settings-group-content">
                        <div class="content-card">
                            <div class="card-header">
                                <h2 class="card-title"><i class="fas fa-envelope ml-2"></i>إدارة الإشعارات الإلكترونية</h2>
                            </div>
                            <div class="card-body space-y-4">
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">
                                        <i class="fas fa-envelope-open-text ml-2"></i>
                                        قائمة الإيميلات للإشعارات
                                    </label>
                                    <p class="text-xs text-gray-500 mb-2">
                                        <i class="fas fa-info-circle ml-1"></i>
                                        سيتم إرسال الإشعارات إلى جميع الإيميلات المسجلة عند تسجيل ملاحظة أو تنبيه
                                    </p>
                                    <div id="notification-emails-list" class="space-y-2 mb-3">
                                        ${(AppState.notificationEmails || []).map((email, index) => `
                                            <div class="flex items-center gap-2 p-2 border rounded bg-gray-50">
                                                <span class="flex-1">${Utils.escapeHTML(email)}</span>
                                                <button type="button" onclick="Settings.removeNotificationEmail(${index})" class="text-red-600 hover:text-red-800">
                                                    <i class="fas fa-times"></i>
                                                </button>
                                            </div>
                                        `).join('')}
                                    </div>
                                    <div class="flex gap-2">
                                        <input type="email" id="notification-email-input" class="form-input flex-1" 
                                            placeholder="أدخل الإيميل للإشعارات">
                                        <button type="button" id="add-notification-email-btn" class="btn-primary">
                                            <i class="fas fa-plus ml-2"></i>إضافة إيميل
                                        </button>
                                    </div>
                                    <button type="button" id="save-notification-emails-btn" class="btn-primary mt-2">
                                        <i class="fas fa-save ml-2"></i>حفظ قائمة الإيميلات
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tab Content: الصلاحيات والاعتمادات -->
            <div class="tab-content" id="tab-permissions">
                <div class="settings-group mt-6">
                    <div class="settings-group-header">
                        <h2 class="settings-group-title">
                            <i class="fas fa-shield-alt text-orange-600 ml-2"></i>
                            الصلاحيات والاعتمادات
                        </h2>
                        <p class="settings-group-subtitle">إدارة الصلاحيات ودوائر الاعتماد</p>
                    </div>
                    <div class="settings-group-content">
                        <div class="content-card">
                            <div class="card-header">
                                <h2 class="card-title"><i class="fas fa-shield-alt ml-2"></i>إدارة الصلاحيات</h2>
                            </div>
                            <div class="card-body space-y-4">
                                <div class="bg-blue-50 border border-blue-200 rounded p-4 mb-4">
                                    <p class="text-sm text-blue-800 mb-2">
                                        <i class="fas fa-info-circle ml-2"></i>
                                        <strong>ملاحظة مهمة:</strong>
                                    </p>
                                    <ul class="text-sm text-blue-700 list-disc mr-6 space-y-1">
                                        <li>الوصول إلى قسم الإعدادات محظور على المستخدمين العاديين</li>
                                        <li>فقط المديرون والمسؤولون المصرح لهم يمكنهم الوصول إلى الإعدادات</li>
                                        <li>يمكن إدارة صلاحيات الوصول من قسم "المستخدمين" عند إضافة أو تعديل مستخدم</li>
                                        <li>الصلاحيات الافتراضية: المديرون فقط يمكنهم الوصول إلى الإعدادات</li>
                                    </ul>
                                </div>
                                
                                <div class="border rounded p-4">
                                    <h3 class="text-lg font-semibold mb-4">
                                        <i class="fas fa-users-cog ml-2"></i>
                                        من يمكنه الوصول إلى الإعدادات
                                    </h3>
                                    <div class="space-y-3">
                                        <div class="flex items-center justify-between p-3 bg-gray-50 rounded">
                                            <div class="flex items-center">
                                                <i class="fas fa-user-shield text-blue-600 ml-3"></i>
                                                <span class="font-semibold">مدير النظام (Admin)</span>
                                            </div>
                                            <span class="badge badge-success">صلاحية كاملة</span>
                                        </div>
                                        <div class="flex items-center justify-between p-3 bg-gray-50 rounded">
                                            <div class="flex items-center">
                                                <i class="fas fa-user-check text-green-600 ml-3"></i>
                                                <span class="font-semibold">المستخدمون المصرح لهم</span>
                                            </div>
                                            <span class="badge badge-info">حسب الصلاحيات</span>
                                        </div>
                                        <div class="flex items-center justify-between p-3 bg-gray-50 rounded">
                                            <div class="flex items-center">
                                                <i class="fas fa-user-times text-red-600 ml-3"></i>
                                                <span class="font-semibold">المستخدمون العاديون</span>
                                            </div>
                                            <span class="badge badge-warning">غير مصرح</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="border-t pt-4 mt-4">
                                    <h3 class="text-lg font-semibold mb-4">
                                        <i class="fas fa-key ml-2"></i>
                                        كيفية إدارة الصلاحيات
                                    </h3>
                                    <div class="space-y-2 text-sm text-gray-700">
                                        <p class="flex items-start">
                                            <i class="fas fa-check-circle text-green-600 ml-2 mt-1"></i>
                                            <span>اذهب إلى قسم "المستخدمين" من القائمة الجانبية</span>
                                        </p>
                                        <p class="flex items-start">
                                            <i class="fas fa-check-circle text-green-600 ml-2 mt-1"></i>
                                            <span>اضغط على "إضافة مستخدم جديد" أو اختر مستخدم موجود للتحرير</span>
                                        </p>
                                        <p class="flex items-start">
                                            <i class="fas fa-check-circle text-green-600 ml-2 mt-1"></i>
                                            <span>في قسم "صلاحيات الوصول للوحدات"، حدد "الإعدادات" لإعطاء المستخدم صلاحية الوصول</span>
                                        </p>
                                        <p class="flex items-start">
                                            <i class="fas fa-check-circle text-green-600 ml-2 mt-1"></i>
                                            <span>احفظ التغييرات لتطبيق الصلاحيات الجديدة</span>
                                        </p>
                                    </div>
                                </div>
                                
                                <div class="border-t pt-4 mt-4">
                                    <h3 class="text-lg font-semibold mb-4">
                                        <i class="fas fa-list-check ml-2"></i>
                                        الصلاحيات الحالية للمستخدمين
                                    </h3>
                                    <div id="users-permissions-list" class="space-y-2">
                                        ${this.renderUsersPermissionsList()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tab Content: دائرة الاعتمادات والصلاحيات -->
            <div class="tab-content" id="tab-approval-circuit">
                <div class="settings-group mt-6">
                    <div class="settings-group-header">
                        <h2 class="settings-group-title">
                            <i class="fas fa-project-diagram text-orange-600 ml-2"></i>
                            دائرة الاعتمادات والصلاحيات
                        </h2>
                        <p class="settings-group-subtitle">إدارة دوائر الاعتماد والصلاحيات</p>
                    </div>
                    <div class="settings-group-content">
                        <div class="content-card">
                            <div class="card-header flex items-center justify-between">
                                <h2 class="card-title">
                                    <i class="fas fa-project-diagram ml-2"></i>
                                    دائرة الاعتمادات والصلاحيات
                                </h2>
                                <span class="badge badge-info" id="approval-circuit-active-label" style="display:none;"></span>
                            </div>
                            <div class="card-body space-y-6">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                                            <i class="fas fa-user-circle ml-2"></i>
                                            مسار الاعتماد الخاص بالمستخدم
                                        </label>
                                        <select id="approval-owner-select" class="form-input">
                                            ${this.renderApprovalOwnerOptions()}
                                        </select>
                                        <p class="text-xs text-gray-500 mt-1">
                                            <i class="fas fa-info-circle ml-1"></i>
                                            في حال عدم تحديد مسار خاص بالمستخدم سيتم استخدام المسار الافتراضي.
                                        </p>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                                            <i class="fas fa-signature ml-2"></i>
                                            اسم مسار الاعتماد
                                        </label>
                                        <input type="text" id="approval-circuit-name" class="form-input" placeholder="اسم المسار (اختياري)">
                                        <p class="text-xs text-gray-500 mt-1">
                                            يظهر اسم المسار للتسهيل عند إدارة أكثر من مسار اعتماد.
                                        </p>
                                    </div>
                                </div>

                                <div id="approval-steps-container" class="space-y-4">
                                    ${this.renderApprovalStepsPlaceholder()}
                                </div>

                                <div class="flex flex-wrap items-center gap-3">
                                    <button type="button" id="add-approval-step-btn" class="btn-secondary">
                                        <i class="fas fa-plus ml-2"></i>
                                        إضافة مستوى اعتماد
                                    </button>
                                    <span class="text-xs text-gray-500">
                                        يمكن إضافة أكثر من مستوى اعتماد وتحديد المسؤولين عن كل مستوى.
                                    </span>
                                </div>

                                <div class="flex items-center justify-end gap-3 border-t pt-4">
                                    <button type="button" id="delete-approval-circuit-btn" class="btn-secondary">
                                        <i class="fas fa-trash ml-2"></i>
                                        حذف المسار
                                    </button>
                                    <button type="button" id="save-approval-circuit-btn" class="btn-primary">
                                        <i class="fas fa-save ml-2"></i>
                                        حفظ مسار الاعتماد
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tab Content: Help Center -->
            <div class="tab-content" id="tab-help-center">
                ${isAdmin ? `
                <div class="settings-group mt-6">
                    <div class="settings-group-header">
                        <h2 class="settings-group-title">
                            <i class="fas fa-circle-question text-teal-600 ml-2"></i>
                            مركز المساعدة
                        </h2>
                        <p class="settings-group-subtitle">إدارة محتوى دليل النظام الذي يراه جميع المستخدمين من القائمة الجانبية</p>
                    </div>
                    <div class="settings-group-content">
                        <div class="content-card">
                            <div class="card-body space-y-4">
                                <div id="help-center-items-list" class="space-y-3"></div>
                                <div class="flex flex-wrap gap-2">
                                    <button type="button" id="help-center-add-btn" class="btn-primary">
                                        <i class="fas fa-plus ml-2"></i>إضافة قسم
                                    </button>
                                    <button type="button" id="help-center-save-all-btn" class="btn-secondary">
                                        <i class="fas fa-save ml-2"></i>حفظ الكل
                                    </button>
                                    <button type="button" id="help-center-preview-btn" class="btn-secondary">
                                        <i class="fas fa-eye ml-2"></i>معاينة
                                    </button>
                                    <button type="button" id="help-center-reset-btn" class="btn-secondary text-amber-700">
                                        <i class="fas fa-rotate-left ml-2"></i>استعادة الافتراضي
                                    </button>
                                </div>
                                <div id="help-center-item-form" class="hidden mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
                                    <h3 class="font-semibold text-gray-800" id="help-center-form-title">إضافة قسم جديد</h3>
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label class="block text-sm font-semibold mb-1">المعرّف (id)</label>
                                            <input type="text" id="help-center-item-id" class="form-input" placeholder="dashboard">
                                        </div>
                                        <div>
                                            <label class="block text-sm font-semibold mb-1">موديول مرتبط</label>
                                            <input type="text" id="help-center-item-module" class="form-input" placeholder="dashboard أو فارغ">
                                        </div>
                                        <div>
                                            <label class="block text-sm font-semibold mb-1">العنوان (عربي)</label>
                                            <input type="text" id="help-center-item-title-ar" class="form-input">
                                        </div>
                                        <div>
                                            <label class="block text-sm font-semibold mb-1">العنوان (English)</label>
                                            <input type="text" id="help-center-item-title-en" class="form-input">
                                        </div>
                                        <div>
                                            <label class="block text-sm font-semibold mb-1">أيقونة FontAwesome</label>
                                            <input type="text" id="help-center-item-icon" class="form-input" value="fa-circle-info">
                                        </div>
                                        <div>
                                            <label class="block text-sm font-semibold mb-1">الفئة</label>
                                            <select id="help-center-item-category" class="form-input">
                                                <option value="getting-started">البدء السريع</option>
                                                <option value="modules">المديولات</option>
                                                <option value="admin">الإدارة</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label class="block text-sm font-semibold mb-1">الترتيب</label>
                                            <input type="number" id="help-center-item-order" class="form-input" min="1" value="1">
                                        </div>
                                        <div class="flex items-center gap-2 pt-6">
                                            <input type="checkbox" id="help-center-item-active" class="rounded border-gray-300" checked>
                                            <label for="help-center-item-active" class="text-sm">مفعّل</label>
                                        </div>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-semibold mb-1">المحتوى (عربي) — HTML بسيط مسموح</label>
                                        <textarea id="help-center-item-body-ar" class="form-input" rows="5"></textarea>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-semibold mb-1">المحتوى (English)</label>
                                        <textarea id="help-center-item-body-en" class="form-input" rows="5"></textarea>
                                    </div>
                                    <div class="flex gap-2">
                                        <button type="button" id="help-center-item-save-btn" class="btn-primary"><i class="fas fa-save ml-2"></i>حفظ القسم</button>
                                        <button type="button" id="help-center-item-cancel-btn" class="btn-secondary">إلغاء</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                ` : '<div class="settings-group mt-6"><p class="text-gray-600">هذا القسم متاح للمديرين فقط</p></div>'}
            </div>

            <!-- Tab Content: السجلات والمراقبة -->
            <div class="tab-content" id="tab-logs">
                ${isAdmin ? `
                <div class="settings-group mt-6">
                    <div class="settings-group-header">
                        <h2 class="settings-group-title">
                            <i class="fas fa-history text-indigo-600 ml-2"></i>
                            السجلات والمراقبة
                        </h2>
                        <p class="settings-group-subtitle">عرض سجلات النشاطات وحركات المستخدمين</p>
                    </div>
                    <div class="settings-group-content">
                        <div class="content-card">
                            <div class="card-header">
                                <h2 class="card-title">
                                    <i class="fas fa-history ml-2"></i>
                                    سجل حركات المستخدمين
                                </h2>
                            </div>
                            <div class="card-body">
                                <p class="text-sm text-gray-600 mb-4">
                                    <i class="fas fa-info-circle ml-2"></i>
                                    عرض سجل كامل لجميع حركات المستخدمين داخل النظام. يمكنك الفلترة والبحث والتصدير.
                                </p>
                                <button type="button" id="view-activity-log-btn" class="btn-primary w-full">
                                    <i class="fas fa-history ml-2"></i>
                                    عرض سجل النشاط
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- ✅ متابعة إصدارات المستخدمين -->
                    <div class="settings-group-content mt-4">
                        <div class="content-card" style="border: 1px solid rgba(15,118,110,0.18);">
                            <div class="card-header" style="background: linear-gradient(135deg, rgba(15,118,110,0.08), rgba(30,58,138,0.06)); border-bottom: 1px solid rgba(15,118,110,0.18);">
                                <h2 class="card-title" style="color: #0F766E;">
                                    <i class="fas fa-code-branch ml-2"></i>
                                    متابعة إصدارات المستخدمين
                                </h2>
                            </div>
                            <div class="card-body">
                                <p class="text-sm text-gray-600 mb-4">
                                    <i class="fas fa-info-circle ml-2 text-teal-600"></i>
                                    معرفة أي إصدار من التطبيق يعمل عليه كل مستخدم، آخر مرة فتح فيها التطبيق،
                                    والتأكد من أن الجميع يعمل على الإصدار الأحدث.
                                </p>
                                <button type="button" id="view-user-versions-btn" class="btn-primary w-full" style="background: linear-gradient(135deg, #0F766E, #1E3A8A);">
                                    <i class="fas fa-code-branch ml-2"></i>
                                    فتح لوحة متابعة الإصدارات
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                ` : '<div class="settings-group mt-6"><p class="text-gray-600">هذا القسم متاح للمديرين فقط</p></div>'}
            </div>
        `;
        this.setupEventListeners();
        // تأخير بسيط لضمان تحميل DOM قبل تهيئة التبويبات
        setTimeout(() => {
            this.setupTabsNavigation();
            const permList = document.getElementById('users-permissions-list');
            if (permList && typeof Utils.hydrateDriveProxyImages === 'function') {
                Utils.hydrateDriveProxyImages(permList, {
                    onFetchFail: (img) => {
                        try {
                            const i = document.createElement('i');
                            i.className = 'fas fa-user text-gray-600';
                            img.replaceWith(i);
                        } catch (e) { /* ignore */ }
                    }
                });
            }
        }, 0);

        // ✅ تحميل بيانات إعدادات النماذج (المواقع) في الخلفية — لا تحجب الواجهة
        // الواجهة معروضة بالكامل أعلاه؛ هذا يحدّث كارت form-settings فقط عند جاهزية البيانات
        if (typeof Permissions !== 'undefined' && typeof Permissions.initFormSettingsState === 'function') {
            Promise.resolve().then(async () => {
                try {
                    await Permissions.initFormSettingsState();
                    // بعد تحميل المواقع/الإعدادات، نُعيد رسم كارت إعدادات النماذج فقط
                    if (isAdmin && typeof Permissions.renderFormSettingsCard === 'function') {
                        const oldCard = document.getElementById('form-settings-card');
                        if (oldCard) {
                            const wrapper = document.createElement('div');
                            wrapper.innerHTML = Permissions.renderFormSettingsCard();
                            const newCard = wrapper.firstElementChild;
                            if (newCard) {
                                oldCard.replaceWith(newCard);
                                if (typeof Permissions.bindFormSettingsEvents === 'function') {
                                    Permissions.bindFormSettingsEvents();
                                }
                            }
                        }
                    }
                } catch (e) {
                    if (typeof Utils !== 'undefined' && Utils.safeWarn) {
                        Utils.safeWarn('⚠️ تعذر تهيئة إعدادات النماذج في الخلفية:', e);
                    }
                }
            });
        }

        // تهيئة إعدادات النماذج بعد تحميل الإعدادات
        if (isAdmin && typeof Permissions !== 'undefined') {
            // محاولة متعددة لضمان تحميل الكارد
            let attempts = 0;
            const maxAttempts = 15; // زيادة عدد المحاولات
            const checkInterval = setInterval(() => {
                attempts++;
                const card = document.getElementById('form-settings-card');
                if (card || attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    if (card) {
                        try {
                            if (typeof Permissions.bindFormSettingsEvents === 'function') {
                                Permissions.bindFormSettingsEvents();
                                Utils.safeLog('✅ تم تهيئة أحداث إعدادات النماذج');
                            } else {
                                Utils.safeWarn('⚠️ bindFormSettingsEvents غير موجودة');
                            }
                        } catch (error) {
                            Utils.safeError('❌ خطأ في تهيئة أحداث إعدادات النماذج:', error);
                        }
                    } else {
                        Utils.safeWarn('⚠️ لم يتم العثور على form-settings-card بعد ' + maxAttempts + ' محاولة');
                    }
                }
            }, 100);
            
            // محاولة إضافية بعد تأخير أطول للتأكد
            setTimeout(() => {
                const card = document.getElementById('form-settings-card');
                if (card && typeof Permissions !== 'undefined' && typeof Permissions.bindFormSettingsEvents === 'function') {
                    try {
                        Permissions.bindFormSettingsEvents();
                        Utils.safeLog('✅ تم إعادة تهيئة أحداث إعدادات النماذج (محاولة إضافية)');
                    } catch (error) {
                        Utils.safeWarn('⚠️ خطأ في إعادة تهيئة أحداث إعدادات النماذج:', error);
                    }
                }
            }, 2000);
        }
        } catch (error) {
            if (typeof Utils !== 'undefined' && Utils.safeError) {
                Utils.safeError('❌ خطأ في تحميل مديول الإعدادات:', error);
            } else {
                console.error('❌ خطأ في تحميل مديول الإعدادات:', error);
            }
            if (section) {
                section.innerHTML = `
                    <div class="content-card">
                        <div class="card-body">
                            <div class="empty-state">
                                <i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>
                                <p class="text-gray-500 mb-4">حدث خطأ أثناء تحميل البيانات</p>
                                <button onclick="Settings.load()" class="btn-primary">
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

    isCurrentUserAdmin() {
        if (typeof Permissions?.isCurrentUserAdmin === 'function') {
            try {
                return Permissions.isCurrentUserAdmin();
            } catch (error) {
                Utils.safeWarn('⚠️ تعذر تحديد صلاحيات المستخدم عبر Permissions.isCurrentUserAdmin:', error);
            }
        }
        return (AppState.currentUser?.role || '').toLowerCase() === 'admin';
    },

    setupTabsNavigation() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');

                // Remove active class from all buttons and contents
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));

                // Add active class to clicked button and corresponding content
                button.classList.add('active');
                const targetContent = document.getElementById(`tab-${targetTab}`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
                
                // ✅ إصلاح: تحميل بيانات إعدادات النماذج فوراً عند فتح التبويب
                if (targetTab === 'form-settings' && this.isCurrentUserAdmin()) {
                    // تحميل البيانات فوراً بدون تأخير
                    if (typeof Permissions !== 'undefined' && typeof Permissions.bindFormSettingsEvents === 'function') {
                        // ✅ إصلاح: استدعاء مباشر بدون setTimeout لضمان التحميل الفوري
                        Permissions.bindFormSettingsEvents().catch(error => {
                            Utils.safeError('❌ خطأ في تحميل إعدادات النماذج:', error);
                        });
                    }
                }
            });
        });

        // Activate first tab by default if no tab content is active
        const activeContent = document.querySelector('.tab-content.active');
        if (!activeContent) {
            const firstTab = tabButtons[0];
            if (firstTab) {
                firstTab.click();
            }
        } else {
            // Ensure the corresponding button is also active
            const activeTabId = activeContent.id.replace('tab-', '');
            const correspondingButton = document.querySelector(`.tab-btn[data-tab="${activeTabId}"]`);
            if (correspondingButton) {
                tabButtons.forEach(btn => btn.classList.remove('active'));
                correspondingButton.classList.add('active');
            }
        }
    },

    setupEventListeners() {
        // تهيئة واجهة النسخ الاحتياطية (للمديرين فقط)
        if (this.isCurrentUserAdmin() && typeof BackupUI !== 'undefined') {
            setTimeout(() => {
                BackupUI.init();
            }, 500);
        }
        setTimeout(() => {
            this.setupHelpCenterEvents();
        }, 100);
        setTimeout(() => {
            const form = document.getElementById('google-settings-form');
            if (form) {
                form.addEventListener('submit', (e) => this.handleSubmit(e));
            }
            const testBtn = document.getElementById('test-connection-btn');
            if (testBtn) {
                testBtn.addEventListener('click', () => this.testConnection());
            }
            const syncBtn = document.getElementById('sync-data-btn');
            if (syncBtn) {
                syncBtn.addEventListener('click', () => Backend.syncData({
                    silent: false,
                    showLoader: true,
                    notifyOnSuccess: true,
                    notifyOnError: true,
                    includeUsersSheet: true
                }));
            }
            const initializeBtn = document.getElementById('initialize-sheets-btn');
            if (initializeBtn) {
                initializeBtn.addEventListener('click', () => Settings.initializeSheets());
            }
            const saveAllBtn = document.getElementById('save-all-data-btn');
            if (saveAllBtn) {
                saveAllBtn.addEventListener('click', async () => {
                    if (confirm('هل تريد حفظ جميع البيانات في الخادم؟\nسيتم استبدال البيانات الموجودة هناك.')) {
                        await Backend.saveAllToSheets();
                    }
                });
            }
            // أزرار التقارير
            const generateIncidentsBtn = document.getElementById('generate-incidents-report-btn');
            if (generateIncidentsBtn) {
                generateIncidentsBtn.addEventListener('click', () => Settings.generateReport('incidents'));
            }
            const generateTrainingBtn = document.getElementById('generate-training-report-btn');
            if (generateTrainingBtn) {
                generateTrainingBtn.addEventListener('click', () => Settings.generateReport('training'));
            }
            const generatePTWBtn = document.getElementById('generate-ptw-report-btn');
            if (generatePTWBtn) {
                generatePTWBtn.addEventListener('click', () => Settings.generateReport('ptw'));
            }
            const generateFullBtn = document.getElementById('generate-full-report-btn');
            if (generateFullBtn) {
                generateFullBtn.addEventListener('click', () => Settings.generateReport('full'));
            }

            // Logo upload
            const uploadLogoBtn = document.getElementById('upload-logo-btn');
            const logoInput = document.getElementById('company-logo-input');
            const removeLogoBtn = document.getElementById('remove-logo-btn');

            if (uploadLogoBtn && logoInput) {
                uploadLogoBtn.addEventListener('click', () => {
                    logoInput.click();
                });

                logoInput.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    if (file.size > 2 * 1024 * 1024) {
                        Notification.error('حجم الصورة كبير جداً. الحد الأقصى 2MB');
                        return;
                    }

                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        let logoDataUrl = event.target.result;
                        
                        // ✅ ضغط الصورة لتقليل الحجم (للتأكد من أن base64 string أقل من 50,000 حرف)
                        try {
                            logoDataUrl = await Settings.compressLogo(logoDataUrl);
                            Utils.safeLog('✅ تم ضغط الشعار (الحجم النهائي: ' + logoDataUrl.length + ' حرف)');
                        } catch (compressError) {
                            Utils.safeWarn('⚠️ فشل ضغط الشعار، سيتم استخدام الصورة الأصلية:', compressError);
                            // في حالة الفشل، نستخدم الصورة الأصلية
                        }
                        
                        AppState.companyLogo = logoDataUrl;
                        // تحديث الشعار في AppState.companySettings أيضاً
                        if (!AppState.companySettings) {
                            AppState.companySettings = {};
                        }
                        AppState.companySettings.logo = logoDataUrl;
                        // حفظ الشعار في localStorage للمزامنة مع favicon
                        localStorage.setItem('company_logo', logoDataUrl);
                        localStorage.setItem('hse_company_logo', logoDataUrl);
                        // حفظ إعدادات الشركة (بما في ذلك الشعار) في localStorage
                        if (typeof window.DataManager !== 'undefined' && window.DataManager.saveCompanySettings) {
                            window.DataManager.saveCompanySettings();
                        }
                        // حفظ البيانات باستخدام window.DataManager
                        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                            window.DataManager.save();
                        } else {
                            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
                        }
                        
                        // حفظ الشعار في قاعدة البيانات عند التحميل الأول
                        if (typeof Utils !== 'undefined' && typeof Utils.hasCloudBackendSync === 'function' && Utils.hasCloudBackendSync() && typeof Backend !== 'undefined') {
                            try {
                                const userData = AppState.currentUser || {};
                                const result = await Backend.sendToAppsScript('saveCompanySettings', {
                                    name: AppState.companySettings?.name || '',
                                    secondaryName: AppState.companySettings?.secondaryName || '',
                                    formVersion: AppState.companySettings?.formVersion || '1.0',
                                    nameFontSize: AppState.companySettings?.nameFontSize || 16,
                                    secondaryNameFontSize: AppState.companySettings?.secondaryNameFontSize || 14,
                                    secondaryNameColor: AppState.companySettings?.secondaryNameColor || '#6B7280',
                                    clinicMonthlyVisitsAlertThreshold: AppState.companySettings?.clinicMonthlyVisitsAlertThreshold ?? 10,
                                    address: AppState.companySettings?.address || '',
                                    phone: AppState.companySettings?.phone || '',
                                    email: AppState.companySettings?.email || '',
                                    logo: logoDataUrl,
                                    postLoginItems: typeof AppState.companySettings?.postLoginItems === 'string' ? AppState.companySettings.postLoginItems : JSON.stringify(AppState.companySettings?.postLoginItems || []),
                                    userData: {
                                        email: userData.email,
                                        name: userData.name,
                                        role: userData.role,
                                        permissions: userData.permissions
                                    }
                                });

                                if (result && result.success) {
                                    Utils.safeLog('✅ تم حفظ الشعار في قاعدة البيانات بنجاح');
                                    Notification.success('تم حفظ الشعار في قاعدة البيانات بنجاح');
                                    
                                    // ✅ إصلاح: إعادة تحميل إعدادات الشركة بعد الحفظ لضمان التحديث
                                    // استخدام forceReload=true لإجبار التحميل من قاعدة البيانات
                                    if (typeof DataManager !== 'undefined' && DataManager.loadCompanySettings) {
                                        setTimeout(async () => {
                                            try {
                                                await DataManager.loadCompanySettings(true); // forceReload = true
                                                Utils.safeLog('✅ تم إعادة تحميل إعدادات الشركة بعد حفظ الشعار');
                                            } catch (reloadError) {
                                                Utils.safeWarn('⚠️ فشل إعادة تحميل إعدادات الشركة:', reloadError);
                                            }
                                        }, 100);
                                    }
                                } else {
                                    const errorMsg = result?.message || 'فشل حفظ الشعار في قاعدة البيانات';
                                    Utils.safeWarn('⚠️ فشل حفظ الشعار في قاعدة البيانات:', errorMsg);
                                    Notification.error('فشل حفظ الشعار في قاعدة البيانات: ' + errorMsg);
                                }
                            } catch (error) {
                                const errorMsg = error?.message || error?.toString() || 'خطأ غير معروف';
                                Utils.safeWarn('⚠️ خطأ أثناء حفظ الشعار في قاعدة البيانات:', error);
                                Notification.error('خطأ أثناء حفظ الشعار في قاعدة البيانات: ' + errorMsg);
                            }
                        }
                        
                        // تحديث شعار تسجيل الدخول
                        if (typeof UI !== 'undefined' && UI.updateLoginLogo) {
                            UI.updateLoginLogo();
                        }
                        
                        // تحديث الهيدر
                        if (typeof UI !== 'undefined' && UI.updateCompanyLogoHeader) {
                            UI.updateCompanyLogoHeader();
                        }
                        
                        // تحديث لوحة التحكم
                        if (typeof UI !== 'undefined' && UI.updateDashboardLogo) {
                            UI.updateDashboardLogo();
                        }
                        
                        // إرسال حدث لتحديث favicon
                        window.dispatchEvent(new CustomEvent('companyLogoUpdated', { detail: { logoUrl: logoDataUrl } }));
                        Notification.success('تم رفع الشعار بنجاح');
                        Settings.load();
                    };
                    reader.onerror = () => {
                        Notification.error('فشل قراءة الصورة');
                    };
                    reader.readAsDataURL(file);
                });
            }

            if (removeLogoBtn) {
                removeLogoBtn.addEventListener('click', async () => {
                    if (confirm('هل تريد إزالة شعار الشركة؟')) {
                        AppState.companyLogo = '';
                        // إزالة الشعار من AppState.companySettings أيضاً
                        if (AppState.companySettings) {
                            AppState.companySettings.logo = '';
                        }
                        // إزالة الشعار من localStorage
                        localStorage.removeItem('company_logo');
                        localStorage.removeItem('hse_company_logo');
                        // حفظ إعدادات الشركة (بما في ذلك الشعار) في localStorage
                        if (typeof window.DataManager !== 'undefined' && window.DataManager.saveCompanySettings) {
                            window.DataManager.saveCompanySettings();
                        }
                        // حفظ البيانات باستخدام window.DataManager
                        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                            window.DataManager.save();
                        } else {
                            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
                        }
                        
                        // حفظ إزالة الشعار في قاعدة البيانات
                        if (typeof Utils !== 'undefined' && typeof Utils.hasCloudBackendSync === 'function' && Utils.hasCloudBackendSync() && typeof Backend !== 'undefined') {
                            try {
                                const userData = AppState.currentUser || {};
                                const result = await Backend.sendToAppsScript('saveCompanySettings', {
                                    name: AppState.companySettings?.name || '',
                                    secondaryName: AppState.companySettings?.secondaryName || '',
                                    formVersion: AppState.companySettings?.formVersion || '1.0',
                                    nameFontSize: AppState.companySettings?.nameFontSize || 16,
                                    secondaryNameFontSize: AppState.companySettings?.secondaryNameFontSize || 14,
                                    secondaryNameColor: AppState.companySettings?.secondaryNameColor || '#6B7280',
                                    clinicMonthlyVisitsAlertThreshold: AppState.companySettings?.clinicMonthlyVisitsAlertThreshold ?? 10,
                                    address: AppState.companySettings?.address || '',
                                    phone: AppState.companySettings?.phone || '',
                                    email: AppState.companySettings?.email || '',
                                    logo: '',
                                    postLoginItems: typeof AppState.companySettings?.postLoginItems === 'string' ? AppState.companySettings.postLoginItems : JSON.stringify(AppState.companySettings?.postLoginItems || []),
                                    userData: {
                                        email: userData.email,
                                        name: userData.name,
                                        role: userData.role,
                                        permissions: userData.permissions
                                    }
                                });

                                if (result && result.success) {
                                    Utils.safeLog('✅ تم حذف الشعار من قاعدة البيانات بنجاح');
                                } else {
                                    Utils.safeWarn('⚠️ فشل حذف الشعار من قاعدة البيانات:', result?.message);
                                }
                            } catch (error) {
                                Utils.safeWarn('⚠️ خطأ أثناء حذف الشعار من قاعدة البيانات:', error);
                            }
                        }
                        
                        // تحديث شعار تسجيل الدخول
                        if (typeof UI !== 'undefined' && UI.updateLoginLogo) {
                            UI.updateLoginLogo();
                        }
                        
                        // تحديث الهيدر
                        if (typeof UI !== 'undefined' && UI.updateCompanyLogoHeader) {
                            UI.updateCompanyLogoHeader();
                        }
                        
                        // تحديث لوحة التحكم
                        if (typeof UI !== 'undefined' && UI.updateDashboardLogo) {
                            UI.updateDashboardLogo();
                        }
                        
                        // إرسال حدث لتحديث favicon
                        window.dispatchEvent(new CustomEvent('companyLogoUpdated', { detail: { logoUrl: '' } }));
                        Notification.success('تم إزالة الشعار');
                        Settings.load();
                    }
                });
            }

            // Date format
            const dateFormatSelect = document.getElementById('date-format-select');
            const saveDateFormatBtn = document.getElementById('save-date-format-btn');

            if (saveDateFormatBtn && dateFormatSelect) {
                saveDateFormatBtn.addEventListener('click', () => {
                    AppState.dateFormat = dateFormatSelect.value;
                    // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }
                    Notification.success('تم حفظ إعدادات التاريخ بنجاح');
                });
            }

            // إعدادات ساعات العمل — لوحة التحكم (تُخزَّن في localStorage)
            const whTotalEl = document.getElementById('wh-total-override');
            const whDayEl = document.getElementById('wh-hours-per-day');
            const whDpmEl = document.getElementById('wh-days-per-month');
            const whMoEl = document.getElementById('wh-months-per-year');
            const whIncEl = document.getElementById('wh-include-contractors');
            const saveWorkHoursBtn = document.getElementById('save-work-hours-settings-btn');

            const fillWorkHoursSettingsInputs = () => {
                try {
                    if (whTotalEl) whTotalEl.value = localStorage.getItem('hse_total_work_hours') || '';
                    if (whDayEl) whDayEl.value = localStorage.getItem('hse_hours_per_day') || '';
                    if (whDpmEl) whDpmEl.value = localStorage.getItem('hse_work_days_per_month') || '';
                    if (whMoEl) whMoEl.value = localStorage.getItem('hse_work_months_per_year') || '';
                    if (whIncEl) {
                        const v = localStorage.getItem('hse_work_hours_include_contractors');
                        if (v === null || String(v).trim() === '') {
                            whIncEl.checked = true;
                        } else {
                            whIncEl.checked = v !== '0' && String(v).toLowerCase() !== 'false' && String(v).toLowerCase() !== 'no';
                        }
                    }
                } catch (e) {
                    if (typeof Utils !== 'undefined' && Utils.safeWarn) Utils.safeWarn('⚠️ تعبئة حقول ساعات العمل:', e);
                }
            };
            fillWorkHoursSettingsInputs();

            if (saveWorkHoursBtn) {
                saveWorkHoursBtn.addEventListener('click', () => {
                    try {
                        const totRaw = whTotalEl && String(whTotalEl.value).trim();
                        if (!totRaw) {
                            localStorage.removeItem('hse_total_work_hours');
                        } else {
                            const n = parseFloat(totRaw.replace(/,/g, ''));
                            if (Number.isFinite(n) && n > 0) {
                                localStorage.setItem('hse_total_work_hours', String(n));
                            } else {
                                localStorage.removeItem('hse_total_work_hours');
                            }
                        }

                        const savePositiveOpt = (key, el) => {
                            if (!el) return;
                            const raw = String(el.value).trim();
                            if (raw === '') {
                                localStorage.removeItem(key);
                                return;
                            }
                            const num = parseFloat(raw.replace(/,/g, ''));
                            if (Number.isFinite(num) && num > 0) {
                                localStorage.setItem(key, String(num));
                            } else {
                                localStorage.removeItem(key);
                            }
                        };

                        savePositiveOpt('hse_hours_per_day', whDayEl);
                        savePositiveOpt('hse_work_days_per_month', whDpmEl);
                        savePositiveOpt('hse_work_months_per_year', whMoEl);

                        localStorage.setItem('hse_work_hours_include_contractors', whIncEl && whIncEl.checked ? '1' : '0');

                        if (typeof Dashboard !== 'undefined' && typeof Dashboard.updateKPIs === 'function') {
                            Dashboard.updateKPIs();
                        }
                        Notification.success('تم حفظ إعدادات ساعات العمل وتحديث لوحة التحكم');
                    } catch (err) {
                        if (typeof Utils !== 'undefined' && Utils.safeWarn) Utils.safeWarn('⚠️ حفظ إعدادات ساعات العمل:', err);
                        Notification.error('تعذر حفظ إعدادات ساعات العمل');
                    }
                });
            }

            const companyNameInput = document.getElementById('company-name-input');
            const companyNameFontSizeInput = document.getElementById('company-name-font-size-input');
            const companySecondaryNameInput = document.getElementById('company-secondary-name-input');
            const companySecondaryNameFontSizeInput = document.getElementById('company-secondary-name-font-size-input');
            const companySecondaryNameColorInput = document.getElementById('company-secondary-name-color-input');
            const companySecondaryNameColorTextInput = document.getElementById('company-secondary-name-color-text-input');
            const formVersionInput = document.getElementById('form-version-input');
            const clinicMonthlyVisitsThresholdInput = document.getElementById('clinic-monthly-visits-threshold-input');
            const profileTeamsUrlInput = document.getElementById('profile-teams-url-input');
            const profileWhatsAppUrlInput = document.getElementById('profile-whatsapp-url-input');
            const ppeEligibilityRulesContainer = document.getElementById('ppe-eligibility-rules-container');
            const ppeAddRuleBtn = document.getElementById('ppe-add-rule-btn');
            const ppeDownloadTemplateBtn = document.getElementById('ppe-download-template-btn');
            const ppeImportRulesBtn = document.getElementById('ppe-import-rules-btn');
            const ppeRulesImportFileInput = document.getElementById('ppe-rules-import-file');
            const saveCompanySettingsBtn = document.getElementById('save-company-settings-btn');

            // ====== إدارة قواعد استحقاق PPE لكل صنف ======
            const ppeRulesState = {
                items: [],
                rules: []
            };

            const parsePpeRules = (raw) => {
                let parsed = [];
                if (!raw) return [];
                try {
                    let arr = raw;
                    if (typeof raw === 'string') {
                        arr = raw.trim() ? JSON.parse(raw) : [];
                    }
                    if (!Array.isArray(arr)) return [];
                    parsed = arr.filter(Boolean);
                } catch (e) {
                    return [];
                }
                return parsed.map(function (rule) {
                    if (!rule || typeof rule !== 'object') return null;
                    const equipmentType = String(rule.equipmentType || rule.itemName || '').trim();
                    let months = parseInt(rule.months, 10);
                    const legacyDays = parseInt(rule.days, 10) || 0;
                    if (isNaN(months) || months < 0) months = 0;
                    months = Math.min(120, months);
                    if (months < 1 && legacyDays > 0) {
                        months = Math.min(120, Math.max(1, Math.ceil(legacyDays / 30)));
                    }
                    if (!equipmentType) return null;
                    return { equipmentType: equipmentType, months: months, days: 0 };
                }).filter(Boolean);
            };

            const buildPpeItemSelectOptions = (selectedValue) => {
                const sel = (selectedValue || '').trim();
                const parts = ['<option value="">— اختر الصنف —</option>'];
                ppeRulesState.items.forEach((item) => {
                    const v = (item || '').toString();
                    const esc = Utils.escapeHTML(v);
                    const isSel = v.trim() === sel ? ' selected' : '';
                    parts.push(`<option value="${esc}"${isSel}>${esc}</option>`);
                });
                return parts.join('');
            };

            const renderPpeRulesRows = () => {
                if (!ppeEligibilityRulesContainer) return;
                const prevScrollTop = ppeEligibilityRulesContainer.scrollTop || 0;
                const prevPageY = window.scrollY || window.pageYOffset || 0;
                const tableShell = (bodyRowsHtml) => `
                    <div class="rounded-xl overflow-hidden border border-blue-200/70 shadow-md ring-1 ring-blue-900/5 bg-white min-h-[8rem]">
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm ppe-eligibility-rules-table table-fixed">
                                <thead>
                                    <tr class="bg-gradient-to-l from-blue-700 via-blue-600 to-indigo-600 text-white">
                                        <th class="px-3 py-3 text-center font-bold w-12 border-b border-white/20">#</th>
                                        <th class="px-3 py-3 text-right font-bold min-w-[12rem] border-b border-white/20">نوع الصنف</th>
                                        <th class="px-3 py-3 text-center font-bold w-40 border-b border-white/20">الحد الأدنى (شهور)</th>
                                        <th class="px-3 py-3 text-center font-bold w-52 border-b border-white/20">إجراءات</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    ${bodyRowsHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;

                if (!ppeRulesState.rules.length) {
                    ppeEligibilityRulesContainer.innerHTML = tableShell(`
                        <tr>
                            <td colspan="4" class="px-4 py-10 text-center text-sm text-slate-500 bg-gradient-to-b from-slate-50 to-white">
                                <i class="fas fa-table text-2xl text-teal-300 mb-2 block"></i>
                                لا توجد صفوف بعد. اضغط <strong class="text-teal-700">«إضافة صف»</strong> ثم اختر الصنف وعدد الشهور، وبعدها <strong class="text-teal-700">«حفظ بيانات الشركة»</strong>.
                            </td>
                        </tr>
                    `);
                    ppeEligibilityRulesContainer.scrollTop = prevScrollTop;
                    window.scrollTo({ top: prevPageY });
                    return;
                }

                const rowsHtml = ppeRulesState.rules.map((rule, idx) => {
                    const optionsHtml = buildPpeItemSelectOptions(rule.equipmentType);
                    const monthsVal = Math.max(0, Math.min(120, parseInt(rule.months, 10) || 0));
                    return `
                    <tr class="ppe-rule-row hover:bg-blue-50/50 transition-colors" data-index="${idx}">
                        <td class="px-3 py-3 text-center text-slate-500 font-semibold">${idx + 1}</td>
                        <td class="px-3 py-3 align-middle min-w-[10rem]">
                            <select class="form-input ppe-rule-item w-full text-sm border-blue-200/80 focus:ring-blue-500">${optionsHtml}</select>
                        </td>
                        <td class="px-3 py-3 align-middle text-center">
                            <div class="inline-flex items-center justify-center gap-1">
                                <input type="number" class="form-input ppe-rule-months w-24 text-center text-sm border-blue-200/80 font-bold tabular-nums"
                                    min="1" max="120" step="1" inputmode="numeric" value="${monthsVal || ''}" placeholder="1">
                                <span class="text-xs text-slate-500 whitespace-nowrap">شهرًا</span>
                            </div>
                        </td>
                        <td class="px-3 py-3 text-center align-middle">
                            <div class="inline-flex items-center justify-center gap-2 flex-wrap">
                                <button type="button" class="ppe-rule-edit inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-300 bg-blue-600 text-white hover:bg-blue-700 text-sm font-extrabold px-4 py-2.5 min-h-[42px] shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    title="تعديل هذا الصف">
                                    <i class="fas fa-pen"></i> تعديل
                                </button>
                                <button type="button" class="ppe-rule-remove inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-300 bg-red-600 text-white hover:bg-red-700 text-sm font-extrabold px-4 py-2.5 min-h-[42px] shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-300"
                                    title="حذف هذا الصف">
                                    <i class="fas fa-trash-alt"></i> حذف
                                </button>
                            </div>
                        </td>
                    </tr>`;
                }).join('');

                ppeEligibilityRulesContainer.innerHTML = tableShell(rowsHtml);
                ppeEligibilityRulesContainer.scrollTop = prevScrollTop;
                window.scrollTo({ top: prevPageY });

                ppeEligibilityRulesContainer.querySelectorAll('.ppe-rule-remove').forEach((btn, idx) => {
                    btn.addEventListener('click', () => {
                        ppeRulesState.rules.splice(idx, 1);
                        renderPpeRulesRows();
                    });
                });

                ppeEligibilityRulesContainer.querySelectorAll('.ppe-rule-edit').forEach((btn, idx) => {
                    btn.addEventListener('click', () => {
                        const row = ppeEligibilityRulesContainer.querySelector(`.ppe-rule-row[data-index="${idx}"]`);
                        if (!row) return;
                        row.classList.add('bg-blue-100', 'ring-1', 'ring-blue-300');
                        const itemSelect = row.querySelector('.ppe-rule-item');
                        const monthsInput = row.querySelector('.ppe-rule-months');
                        if (itemSelect) {
                            itemSelect.focus();
                        } else if (monthsInput) {
                            monthsInput.focus();
                        }
                        setTimeout(() => row.classList.remove('bg-blue-100', 'ring-1', 'ring-blue-300'), 1200);
                    });
                });
            };

            const collectPpeRulesFromUI = () => {
                if (!ppeEligibilityRulesContainer) return [];
                const rows = Array.from(ppeEligibilityRulesContainer.querySelectorAll('.ppe-rule-row'));
                const seen = new Set();
                const out = [];
                rows.forEach((row) => {
                    const itemSel = row.querySelector('.ppe-rule-item');
                    const monthsEl = row.querySelector('.ppe-rule-months');
                    const equipmentType = (itemSel?.value || '').trim();
                    if (!equipmentType || seen.has(equipmentType)) return;
                    let months = parseInt(monthsEl?.value, 10);
                    if (isNaN(months) || months < 1) return;
                    months = Math.min(120, months);
                    seen.add(equipmentType);
                    out.push({ equipmentType: equipmentType, months: months, days: 0 });
                });
                return out;
            };

            // قراءة جميع الصفوف من الواجهة كما هي (حتى الصفوف غير المكتملة)
            // لاستخدامها قبل إعادة الرسم حتى لا تضيع القيم المدخلة حديثاً.
            const collectPpeRulesDraftFromUI = () => {
                if (!ppeEligibilityRulesContainer) return Array.isArray(ppeRulesState.rules) ? [...ppeRulesState.rules] : [];
                const rows = Array.from(ppeEligibilityRulesContainer.querySelectorAll('.ppe-rule-row'));
                if (!rows.length) return Array.isArray(ppeRulesState.rules) ? [...ppeRulesState.rules] : [];
                return rows.map((row) => {
                    const itemSel = row.querySelector('.ppe-rule-item');
                    const monthsEl = row.querySelector('.ppe-rule-months');
                    const equipmentType = (itemSel?.value || '').trim();
                    let months = parseInt(monthsEl?.value, 10);
                    if (isNaN(months) || months < 1) months = 12;
                    months = Math.min(120, months);
                    return { equipmentType, months, days: 0 };
                });
            };

            const normalizeImportedRules = (input) => {
                const out = [];
                const seen = new Set();
                (Array.isArray(input) ? input : []).forEach((row) => {
                    if (!row || typeof row !== 'object') return;
                    const equipmentType = String(row.equipmentType || row.itemName || row['نوع الصنف'] || row['الصنف'] || '').trim();
                    let months = parseInt(row.months ?? row['الشهور'] ?? row['months'], 10);
                    if (!equipmentType || seen.has(equipmentType)) return;
                    if (isNaN(months) || months < 1) return;
                    months = Math.min(120, months);
                    seen.add(equipmentType);
                    out.push({ equipmentType, months, days: 0 });
                });
                return out;
            };

            const parseRulesFromText = (text) => {
                const rows = String(text || '').split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
                if (!rows.length) return [];
                const dataRows = rows.filter((line, idx) => idx !== 0 || !/الصنف|نوع|months|month|الشهور/i.test(line));
                const parsed = dataRows.map((line) => {
                    const sep = line.includes('\t') ? '\t' : ',';
                    const parts = line.split(sep).map((p) => p.trim()).filter(Boolean);
                    if (parts.length < 2) return null;
                    return { equipmentType: parts[0], months: parts[1] };
                }).filter(Boolean);
                return normalizeImportedRules(parsed);
            };

            const importPpeRulesFromFile = async (file) => {
                if (!file) return;
                const name = (file.name || '').toLowerCase();
                let importedRules = [];
                if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
                    if (typeof XLSX === 'undefined') {
                        Notification.error('لا يمكن قراءة Excel حالياً. استخدم CSV أو فعّل مكتبة XLSX.');
                        return;
                    }
                    const buffer = await file.arrayBuffer();
                    const wb = XLSX.read(buffer, { type: 'array' });
                    const firstSheet = wb.SheetNames && wb.SheetNames[0];
                    if (!firstSheet) {
                        Notification.error('ملف الاستيراد لا يحتوي أوراق بيانات.');
                        return;
                    }
                    const ws = wb.Sheets[firstSheet];
                    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                    importedRules = normalizeImportedRules(rows);
                } else {
                    const text = await file.text();
                    importedRules = parseRulesFromText(text);
                }
                if (!importedRules.length) {
                    Notification.warning('لم يتم العثور على صفوف صالحة للاستيراد. تأكد من القالب: الصنف,الشهور');
                    return;
                }
                ppeRulesState.rules = importedRules;
                renderPpeRulesRows();
                Notification.success(`تم استيراد ${importedRules.length} قاعدة بنجاح.`);
            };

            const loadPpeItemsForRules = async () => {
                let items = [];
                try {
                    if (typeof Backend !== 'undefined' && Backend.sendToAppsScript) {
                        const result = await Backend.sendToAppsScript('getPPEItemsList', {});
                        if (result && result.success && Array.isArray(result.data)) {
                            items = result.data
                                .map(it => (it && (it.itemName || it.name) || '').toString().trim())
                                .filter(Boolean);
                        }
                    }
                } catch (e) {
                    items = [];
                }
                if (!items.length) {
                    const ppeList = (AppState.appData && AppState.appData.ppe) || [];
                    items = [...new Set(ppeList.map(p => (p.equipmentType || '').toString().trim()).filter(Boolean))];
                }
                if (!items.length) {
                    items = ['خوذة أمان', 'نظارات وقاية', 'قفازات', 'أحذية أمان', 'سترة عاكسة', 'سدادات أذن', 'كمامة', 'بدلة واقية', 'حزام أمان', 'معدات حماية تنفسية'];
                }
                ppeRulesState.items = Array.from(new Set(items)).sort((a, b) => a.localeCompare(b, 'ar'));
            };

            (async () => {
                ppeRulesState.rules = parsePpeRules(AppState.companySettings?.ppeEligibilityRules);
                await loadPpeItemsForRules();
                renderPpeRulesRows();
            })();

            if (ppeAddRuleBtn) {
                ppeAddRuleBtn.addEventListener('click', () => {
                    // مزامنة الحالة من واجهة المستخدم قبل إضافة صف جديد لتجنب تفريغ الصف السابق.
                    ppeRulesState.rules = collectPpeRulesDraftFromUI();
                    ppeRulesState.rules.push({ equipmentType: '', months: 12, days: 0 });
                    renderPpeRulesRows();
                    // تثبيت تجربة الاستخدام: تركيز مباشر على آخر صف دون قفز بصري.
                    const rows = Array.from(ppeEligibilityRulesContainer?.querySelectorAll('.ppe-rule-row') || []);
                    const lastRow = rows[rows.length - 1];
                    const lastItem = lastRow ? lastRow.querySelector('.ppe-rule-item') : null;
                    if (lastItem && typeof lastItem.focus === 'function') {
                        setTimeout(() => lastItem.focus(), 0);
                    }
                });
            }
            if (ppeDownloadTemplateBtn) {
                ppeDownloadTemplateBtn.addEventListener('click', () => {
                    const sampleRows = [
                        ['الصنف', 'الشهور'],
                        ['خوذة أمان', '12'],
                        ['نظارات وقاية', '6']
                    ];
                    const csv = '\uFEFF' + sampleRows.map((r) => r.join(',')).join('\n');
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'ppe-eligibility-template.csv';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                });
            }
            if (ppeImportRulesBtn && ppeRulesImportFileInput) {
                ppeImportRulesBtn.addEventListener('click', () => ppeRulesImportFileInput.click());
                ppeRulesImportFileInput.addEventListener('change', async () => {
                    const file = ppeRulesImportFileInput.files && ppeRulesImportFileInput.files[0];
                    try {
                        await importPpeRulesFromFile(file);
                    } catch (e) {
                        Notification.error('فشل الاستيراد: ' + (e?.message || 'خطأ غير معروف'));
                    } finally {
                        ppeRulesImportFileInput.value = '';
                    }
                });
            }
            const resetCompanyNameBtn = document.getElementById('reset-company-name-btn');

            // مزامنة منتقي الألوان مع حقل النص
            if (companySecondaryNameColorInput && companySecondaryNameColorTextInput) {
                companySecondaryNameColorInput.addEventListener('input', () => {
                    companySecondaryNameColorTextInput.value = companySecondaryNameColorInput.value;
                });
                companySecondaryNameColorTextInput.addEventListener('input', () => {
                    const colorValue = companySecondaryNameColorTextInput.value.trim();
                    if (/^#[0-9A-Fa-f]{6}$/.test(colorValue)) {
                        companySecondaryNameColorInput.value = colorValue;
                    }
                });
            }

            if (saveCompanySettingsBtn && companyNameInput) {
                saveCompanySettingsBtn.addEventListener('click', async () => {
                    const newName = companyNameInput.value.trim();
                    if (!newName) {
                        Notification.error('يرجى إدخال اسم الشركة.');
                        return;
                    }

                    const secondaryName = companySecondaryNameInput ? companySecondaryNameInput.value.trim() : '';
                    const formVersion = formVersionInput ? formVersionInput.value.trim() || '1.0' : '1.0';

                    // الحصول على حجم الخط للاسم الأساسي
                    let nameFontSize = 16;
                    if (companyNameFontSizeInput) {
                        const fontSizeValue = parseInt(companyNameFontSizeInput.value, 10);
                        if (!isNaN(fontSizeValue) && fontSizeValue >= 8 && fontSizeValue <= 72) {
                            nameFontSize = fontSizeValue;
                        }
                    }

                    // الحصول على حجم الخط للاسم الإضافي
                    let secondaryNameFontSize = 14;
                    if (companySecondaryNameFontSizeInput) {
                        const fontSizeValue = parseInt(companySecondaryNameFontSizeInput.value, 10);
                        if (!isNaN(fontSizeValue) && fontSizeValue >= 8 && fontSizeValue <= 72) {
                            secondaryNameFontSize = fontSizeValue;
                        }
                    }

                    // الحصول على لون الاسم الإضافي
                    let secondaryNameColor = '#6B7280';
                    if (companySecondaryNameColorTextInput && companySecondaryNameColorTextInput.value.trim()) {
                        secondaryNameColor = companySecondaryNameColorTextInput.value.trim();
                    } else if (companySecondaryNameColorInput) {
                        secondaryNameColor = companySecondaryNameColorInput.value;
                    }

                    let clinicMonthlyVisitsAlertThreshold = 10;
                    if (clinicMonthlyVisitsThresholdInput) {
                        const v = parseInt(clinicMonthlyVisitsThresholdInput.value, 10);
                        if (!isNaN(v) && v >= 1 && v <= 1000) clinicMonthlyVisitsAlertThreshold = v;
                    }

                    const profileTeamsUrl = profileTeamsUrlInput ? profileTeamsUrlInput.value.trim() : '';
                    const profileWhatsAppUrl = profileWhatsAppUrlInput ? profileWhatsAppUrlInput.value.trim() : '';

                    if (ppeEligibilityRulesContainer) {
                        const ruleRows = Array.from(ppeEligibilityRulesContainer.querySelectorAll('.ppe-rule-row'));
                        for (const row of ruleRows) {
                            const eq = (row.querySelector('.ppe-rule-item')?.value || '').trim();
                            const moRaw = row.querySelector('.ppe-rule-months')?.value;
                            const mo = parseInt(moRaw, 10);
                            if (eq && (isNaN(mo) || mo < 1)) {
                                Notification.error('يُرجى إدخال عدد شهور صالح (من 1 إلى 120) لكل صنف محدد في جدول استحقاق مهمات الوقاية.');
                                return;
                            }
                            if (!eq && moRaw !== '' && moRaw !== undefined && !isNaN(mo) && mo >= 1) {
                                Notification.error('يُرجى اختيار نوع الصنف لكل صف فيه عدد شهور في جدول الاستحقاق.');
                                return;
                            }
                        }
                    }

                    const ppeEligibilityRulesArray = collectPpeRulesFromUI();
                    const ppeEligibilityRules = JSON.stringify(ppeEligibilityRulesArray);

                    AppState.companySettings = Object.assign({}, AppState.companySettings, {
                        name: newName,
                        secondaryName,
                        formVersion,
                        nameFontSize,
                        secondaryNameFontSize,
                        secondaryNameColor,
                        clinicMonthlyVisitsAlertThreshold,
                        profileTeamsUrl,
                        profileWhatsAppUrl,
                        ppeEligibilityRules
                    });
                    DataManager.saveCompanySettings();
                    
                    // حفظ في الخادم إذا كان متاحاً
                    let backendSyncSucceeded = true;
                    if (typeof Utils !== 'undefined' && typeof Utils.hasCloudBackendSync === 'function' && Utils.hasCloudBackendSync() && typeof Backend !== 'undefined') {
                        try {
                            const userData = AppState.currentUser || {};
                            const result = await Backend.sendToAppsScript('saveCompanySettings', {
                                name: newName,
                                secondaryName,
                                formVersion,
                                nameFontSize,
                                secondaryNameFontSize,
                                secondaryNameColor,
                                clinicMonthlyVisitsAlertThreshold,
                                profileTeamsUrl,
                                profileWhatsAppUrl,
                                ppeEligibilityRules,
                                address: AppState.companySettings?.address || '',
                                phone: AppState.companySettings?.phone || '',
                                email: AppState.companySettings?.email || '',
                                logo: AppState.companySettings?.logo || AppState.companyLogo || '',
                                postLoginItems: typeof AppState.companySettings?.postLoginItems === 'string' ? AppState.companySettings.postLoginItems : JSON.stringify(AppState.companySettings?.postLoginItems || []),
                                userData: {
                                    email: userData.email,
                                    name: userData.name,
                                    role: userData.role,
                                    permissions: userData.permissions
                                }
                            });

                            if (result && result.success) {
                                Utils.safeLog('✅ تم حفظ إعدادات الشركة في الخادم بنجاح');
                            } else {
                                Utils.safeWarn('⚠️ فشل حفظ إعدادات الشركة في الخادم:', result?.message);
                                backendSyncSucceeded = false;
                                Notification.error('تعذر حفظ قواعد الاستحقاق في قاعدة البيانات: ' + (result?.message || 'خطأ غير معروف'));
                            }
                        } catch (error) {
                            Utils.safeWarn('⚠️ خطأ أثناء مزامنة إعدادات الشركة مع الخادم:', error);
                            backendSyncSucceeded = false;
                            Notification.error('تعذر حفظ قواعد الاستحقاق في قاعدة البيانات (اتصال/خادم): ' + (error?.message || 'يرجى المحاولة مرة أخرى.'));
                        }
                    }
                    if (!backendSyncSucceeded) return;
                    
                    if (typeof UI !== 'undefined' && typeof UI.updateCompanyBranding === 'function') {
                        UI.updateCompanyBranding();
                    }
                    // إعادة تحميل إعدادات الشركة من المصدر بعد الحفظ لضمان تحميل اسم الشركة (نفس زمن تحميل الشعار)
                    if (typeof DataManager !== 'undefined' && DataManager.loadCompanySettings) {
                        setTimeout(async () => {
                            try {
                                await DataManager.loadCompanySettings(true);
                                Utils.safeLog('✅ تم تحميل إعدادات الشركة بعد الحفظ');
                            } catch (reloadError) {
                                Utils.safeWarn('⚠️ فشل إعادة تحميل إعدادات الشركة:', reloadError);
                            }
                        }, 100);
                    }
                    Notification.success('تم تحديث بيانات الشركة بنجاح');
                    Settings.load();
                });
            }

            // تعليمات ما بعد الدخول: عرض القائمة وربط الأحداث
            if (!AppState.companySettings) AppState.companySettings = {};
            if (!Array.isArray(AppState.companySettings.postLoginItems)) {
                AppState.companySettings.postLoginItems = Settings.getPostLoginItems();
            }
            Settings.renderPostLoginItemsList();

            const postLoginList = document.getElementById('post-login-items-list');
            const postLoginAddBtn = document.getElementById('post-login-add-item-btn');
            const postLoginForm = document.getElementById('post-login-item-form');
            const postLoginFormTitle = document.getElementById('post-login-form-title');
            const postLoginItemTitle = document.getElementById('post-login-item-title');
            const postLoginItemBody = document.getElementById('post-login-item-body');
            const postLoginItemDuration = document.getElementById('post-login-item-duration');
            const postLoginItemActive = document.getElementById('post-login-item-active');
            const postLoginItemSaveBtn = document.getElementById('post-login-item-save-btn');
            const postLoginItemCancelBtn = document.getElementById('post-login-item-cancel-btn');

            let postLoginEditingIndex = -1;

            const hidePostLoginForm = () => {
                if (postLoginForm) postLoginForm.classList.add('hidden');
                postLoginEditingIndex = -1;
                if (postLoginFormTitle) postLoginFormTitle.textContent = 'إضافة عنصر جديد';
                if (postLoginItemTitle) postLoginItemTitle.value = '';
                if (postLoginItemBody) postLoginItemBody.value = '';
                if (postLoginItemDuration) postLoginItemDuration.value = '10';
                if (postLoginItemActive) postLoginItemActive.checked = true;
            };

            const savePostLoginToStateAndBackend = async () => {
                if (!AppState.companySettings) AppState.companySettings = {};
                AppState.companySettings.postLoginItems = Settings.getPostLoginItems();
                if (typeof DataManager !== 'undefined' && DataManager.saveCompanySettings) {
                    DataManager.saveCompanySettings();
                }
                if (typeof Utils !== 'undefined' && typeof Utils.hasCloudBackendSync === 'function' && Utils.hasCloudBackendSync() && typeof Backend !== 'undefined') {
                    try {
                        const userData = AppState.currentUser || {};
                        const payload = {
                            name: AppState.companySettings.name || '',
                            secondaryName: AppState.companySettings.secondaryName || '',
                            formVersion: AppState.companySettings.formVersion || '1.0',
                            nameFontSize: AppState.companySettings.nameFontSize || 16,
                            secondaryNameFontSize: AppState.companySettings.secondaryNameFontSize || 14,
                            secondaryNameColor: AppState.companySettings.secondaryNameColor || '#6B7280',
                            clinicMonthlyVisitsAlertThreshold: AppState.companySettings.clinicMonthlyVisitsAlertThreshold ?? 10,
                            address: AppState.companySettings.address || '',
                            phone: AppState.companySettings.phone || '',
                            email: AppState.companySettings.email || '',
                            logo: AppState.companySettings.logo || AppState.companyLogo || '',
                            postLoginItems: typeof AppState.companySettings.postLoginItems === 'string' ? AppState.companySettings.postLoginItems : JSON.stringify(AppState.companySettings.postLoginItems || []),
                            userData: { email: userData.email, name: userData.name, role: userData.role, permissions: userData.permissions }
                        };
                        await Backend.sendToAppsScript('saveCompanySettings', payload);
                    } catch (e) { Utils.safeWarn('⚠️ فشل مزامنة تعليمات ما بعد الدخول:', e); }
                }
            };

            if (postLoginAddBtn) {
                postLoginAddBtn.addEventListener('click', () => {
                    postLoginEditingIndex = -1;
                    if (postLoginFormTitle) postLoginFormTitle.textContent = 'إضافة عنصر جديد';
                    if (postLoginItemTitle) postLoginItemTitle.value = '';
                    if (postLoginItemBody) postLoginItemBody.value = '';
                    if (postLoginItemDuration) postLoginItemDuration.value = '10';
                    if (postLoginItemActive) postLoginItemActive.checked = true;
                    if (postLoginForm) postLoginForm.classList.remove('hidden');
                });
            }
            if (postLoginItemCancelBtn) {
                postLoginItemCancelBtn.addEventListener('click', hidePostLoginForm);
            }
            if (postLoginItemSaveBtn && postLoginItemTitle && postLoginItemBody) {
                postLoginItemSaveBtn.addEventListener('click', async () => {
                    const title = postLoginItemTitle.value.trim();
                    const body = postLoginItemBody.value.trim();
                    const duration = parseInt(postLoginItemDuration?.value, 10);
                    const active = postLoginItemActive ? postLoginItemActive.checked : true;
                    if (!title) {
                        Notification.error('يرجى إدخال العنوان.');
                        return;
                    }
                    const items = Settings.getPostLoginItems();
                    const sorted = items.slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
                    const maxOrder = sorted.length ? Math.max(...sorted.map(i => i.order ?? 0)) : 0;
                    if (postLoginEditingIndex >= 0 && postLoginEditingIndex < sorted.length) {
                        sorted[postLoginEditingIndex] = { title, body, durationSeconds: isNaN(duration) ? 10 : Math.min(120, Math.max(0, duration)), order: sorted[postLoginEditingIndex].order ?? postLoginEditingIndex, active };
                    } else {
                        sorted.push({ title, body, durationSeconds: isNaN(duration) ? 10 : Math.min(120, Math.max(0, duration)), order: maxOrder + 1, active });
                    }
                    if (!AppState.companySettings) AppState.companySettings = {};
                    AppState.companySettings.postLoginItems = sorted;
                    await savePostLoginToStateAndBackend();
                    hidePostLoginForm();
                    Settings.renderPostLoginItemsList();
                    Notification.success('تم حفظ العنصر.');
                });
            }

            if (postLoginList) {
                postLoginList.addEventListener('click', async (e) => {
                    const editBtn = e.target.closest('.post-login-edit-btn');
                    const deleteBtn = e.target.closest('.post-login-delete-btn');
                    const upBtn = e.target.closest('.post-login-up-btn');
                    const downBtn = e.target.closest('.post-login-down-btn');
                    const index = editBtn?.dataset?.index ?? deleteBtn?.dataset?.index ?? upBtn?.dataset?.index ?? downBtn?.dataset?.index;
                    if (index === undefined) return;
                    const idx = parseInt(index, 10);
                    const items = Settings.getPostLoginItems();
                    const sorted = items.slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
                    const item = sorted[idx];
                    if (!item) return;

                    if (editBtn) {
                        postLoginEditingIndex = idx;
                        if (postLoginFormTitle) postLoginFormTitle.textContent = 'تعديل عنصر';
                        if (postLoginItemTitle) postLoginItemTitle.value = item.title || '';
                        if (postLoginItemBody) postLoginItemBody.value = item.body || '';
                        if (postLoginItemDuration) postLoginItemDuration.value = String(item.durationSeconds ?? 10);
                        if (postLoginItemActive) postLoginItemActive.checked = item.active !== false;
                        if (postLoginForm) postLoginForm.classList.remove('hidden');
                        return;
                    }
                    if (deleteBtn) {
                        if (!confirm('حذف هذا العنصر؟')) return;
                        sorted.splice(idx, 1);
                        if (!AppState.companySettings) AppState.companySettings = {};
                        AppState.companySettings.postLoginItems = sorted;
                        await savePostLoginToStateAndBackend();
                        Settings.renderPostLoginItemsList();
                        Notification.success('تم حذف العنصر.');
                        return;
                    }
                    if (upBtn && idx > 0) {
                        [sorted[idx - 1].order, sorted[idx].order] = [sorted[idx].order, sorted[idx - 1].order];
                        if (!AppState.companySettings) AppState.companySettings = {};
                        AppState.companySettings.postLoginItems = sorted;
                        await savePostLoginToStateAndBackend();
                        Settings.renderPostLoginItemsList();
                        return;
                    }
                    if (downBtn && idx < sorted.length - 1) {
                        [sorted[idx].order, sorted[idx + 1].order] = [sorted[idx + 1].order, sorted[idx].order];
                        if (!AppState.companySettings) AppState.companySettings = {};
                        AppState.companySettings.postLoginItems = sorted;
                        await savePostLoginToStateAndBackend();
                        Settings.renderPostLoginItemsList();
                    }
                });
            }

            if (resetCompanyNameBtn && companyNameInput) {
                resetCompanyNameBtn.addEventListener('click', async () => {
                    if (!confirm('هل تريد استعادة الاسم الافتراضي للشركة؟')) {
                        return;
                    }

                    AppState.companySettings = Object.assign({}, AppState.companySettings, {
                        name: DEFAULT_COMPANY_NAME,
                        nameFontSize: 16,
                        secondaryNameFontSize: 14,
                        secondaryNameColor: '#6B7280'
                    });
                    companyNameInput.value = DEFAULT_COMPANY_NAME;
                    if (companySecondaryNameInput) {
                        AppState.companySettings.secondaryName = '';
                        companySecondaryNameInput.value = '';
                    }
                    if (companyNameFontSizeInput) {
                        companyNameFontSizeInput.value = '16';
                    }
                    if (companySecondaryNameFontSizeInput) {
                        companySecondaryNameFontSizeInput.value = '14';
                    }
                    if (companySecondaryNameColorInput) {
                        companySecondaryNameColorInput.value = '#6B7280';
                    }
                    if (companySecondaryNameColorTextInput) {
                        companySecondaryNameColorTextInput.value = '#6B7280';
                    }
                    DataManager.saveCompanySettings();
                    
                    // حفظ في الخادم إذا كان متاحاً
                    if (typeof Utils !== 'undefined' && typeof Utils.hasCloudBackendSync === 'function' && Utils.hasCloudBackendSync() && typeof Backend !== 'undefined') {
                        try {
                            const userData = AppState.currentUser || {};
                            const result = await Backend.sendToAppsScript('saveCompanySettings', {
                                name: DEFAULT_COMPANY_NAME,
                                secondaryName: '',
                                formVersion: '1.0',
                                nameFontSize: 16,
                                secondaryNameFontSize: 14,
                                secondaryNameColor: '#6B7280',
                                clinicMonthlyVisitsAlertThreshold: AppState.companySettings?.clinicMonthlyVisitsAlertThreshold ?? 10,
                                address: AppState.companySettings?.address || '',
                                phone: AppState.companySettings?.phone || '',
                                email: AppState.companySettings?.email || '',
                                logo: AppState.companySettings?.logo || AppState.companyLogo || '',
                                postLoginItems: typeof AppState.companySettings?.postLoginItems === 'string' ? AppState.companySettings.postLoginItems : JSON.stringify(AppState.companySettings?.postLoginItems || []),
                                userData: {
                                    email: userData.email,
                                    name: userData.name,
                                    role: userData.role,
                                    permissions: userData.permissions
                                }
                            });

                            if (result && result.success) {
                                Utils.safeLog('✅ تم حفظ إعدادات الشركة الافتراضية في الخادم بنجاح');
                            } else {
                                Utils.safeWarn('⚠️ فشل حفظ إعدادات الشركة في الخادم:', result?.message);
                            }
                        } catch (error) {
                            Utils.safeWarn('⚠️ خطأ أثناء مزامنة إعدادات الشركة مع الخادم:', error);
                        }
                    }
                    
                    if (typeof UI !== 'undefined' && typeof UI.updateCompanyBranding === 'function') {
                        UI.updateCompanyBranding();
                    }
                    // إعادة تحميل إعدادات الشركة من المصدر بعد الاستعادة (نفس زمن تحميل الشعار)
                    if (typeof DataManager !== 'undefined' && DataManager.loadCompanySettings) {
                        setTimeout(async () => {
                            try {
                                await DataManager.loadCompanySettings(true);
                                Utils.safeLog('✅ تم تحميل إعدادات الشركة بعد الاستعادة');
                            } catch (reloadError) {
                                Utils.safeWarn('⚠️ فشل إعادة تحميل إعدادات الشركة:', reloadError);
                            }
                        }, 100);
                    }
                    Notification.success('تمت استعادة بيانات الشركة الافتراضية');
                    Settings.load();
                });
            }

            // Activity Log Button
            const viewActivityLogBtn = document.getElementById('view-activity-log-btn');
            if (viewActivityLogBtn) {
                viewActivityLogBtn.addEventListener('click', () => {
                    UserActivityLog.showModal();
                });
            }

            // ✅ User Versions Admin Button
            const viewUserVersionsBtn = document.getElementById('view-user-versions-btn');
            if (viewUserVersionsBtn) {
                viewUserVersionsBtn.addEventListener('click', () => {
                    if (typeof UserVersionsAdmin !== 'undefined' && UserVersionsAdmin.open) {
                        UserVersionsAdmin.open();
                    } else {
                        Notification.error('لوحة متابعة الإصدارات غير متاحة. حاول تحديث الصفحة.');
                    }
                });
            }

            // إعدادات النماذج - ربط الأحداث لمرة واحدة
            if (this.isCurrentUserAdmin() && typeof Permissions?.bindFormSettingsEvents === 'function') {
                Permissions.bindFormSettingsEvents();
            }

            // إضافة إيميل للإشعارات
            const addEmailBtn = document.getElementById('add-notification-email-btn');
            const emailInput = document.getElementById('notification-email-input');
            if (addEmailBtn && emailInput) {
                addEmailBtn.addEventListener('click', () => {
                    const email = emailInput.value.trim().toLowerCase();
                    if (!email || !Utils.isValidEmail(email)) {
                        Notification.error('يرجى إدخال إيميل صحيح');
                        return;
                    }

                    if (!AppState.notificationEmails) {
                        AppState.notificationEmails = [];
                    }

                    if (AppState.notificationEmails.includes(email)) {
                        Notification.warning('الإيميل مسجل مسبقاً');
                        return;
                    }

                    AppState.notificationEmails.push(email);
                    emailInput.value = '';
                    // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }

                    const list = document.getElementById('notification-emails-list');
                    if (list) {
                        const emailDiv = document.createElement('div');
                        emailDiv.className = 'flex items-center gap-2 p-2 border rounded bg-gray-50';
                        emailDiv.innerHTML = `
                            <span class="flex-1">${Utils.escapeHTML(email)}</span>
                            <button type="button" onclick="Settings.removeNotificationEmail(${AppState.notificationEmails.length - 1})" class="text-red-600 hover:text-red-800">
                                <i class="fas fa-times"></i>
                            </button>
                        `;
                        list.appendChild(emailDiv);
                    }

                    Notification.success('تم إضافة الإيميل بنجاح');
                });
            }

            // حفظ قائمة الإيميلات
            const saveEmailsBtn = document.getElementById('save-notification-emails-btn');
            if (saveEmailsBtn) {
                saveEmailsBtn.addEventListener('click', () => {
                    // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }
                    Notification.success('تم حفظ قائمة الإيميلات بنجاح');
                });
            }

            this.bindViolationTypesEvents();
            this.initializeApprovalCircuitsUI();
            this.bindCloudStorageSettingsEvents();
        }, 100);
    },

    bindCloudStorageSettingsEvents() {
        // OneDrive Settings
        const onedriveForm = document.getElementById('onedrive-settings-form');
        if (onedriveForm) {
            onedriveForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const enabled = document.getElementById('onedrive-enabled')?.checked || false;
                const clientId = document.getElementById('onedrive-client-id')?.value.trim() || '';
                const clientSecret = document.getElementById('onedrive-client-secret')?.value.trim() || '';

                AppState.cloudStorageConfig.onedrive.enabled = enabled;
                AppState.cloudStorageConfig.onedrive.clientId = clientId;
                if (clientSecret) {
                    AppState.cloudStorageConfig.onedrive.clientSecret = clientSecret;
                }

                DataManager.saveCloudStorageConfig();
                Notification.success('تم حفظ إعدادات OneDrive بنجاح');
                this.load();
            });
        }

        const onedriveAuthorizeBtn = document.getElementById('onedrive-authorize-btn');
        if (onedriveAuthorizeBtn) {
            onedriveAuthorizeBtn.addEventListener('click', async () => {
                try {
                    await CloudStorageIntegration.authorize('onedrive');
                    this.load();
                } catch (error) {
                    Notification.error(error.message || 'فشل ربط OneDrive');
                }
            });
        }

        // Google Drive Settings
        const googledriveForm = document.getElementById('googledrive-settings-form');
        if (googledriveForm) {
            googledriveForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const enabled = document.getElementById('googledrive-enabled')?.checked || false;
                const clientId = document.getElementById('googledrive-client-id')?.value.trim() || '';
                const clientSecret = document.getElementById('googledrive-client-secret')?.value.trim() || '';

                AppState.cloudStorageConfig.googleDrive.enabled = enabled;
                AppState.cloudStorageConfig.googleDrive.clientId = clientId;
                if (clientSecret) {
                    AppState.cloudStorageConfig.googleDrive.clientSecret = clientSecret;
                }

                DataManager.saveCloudStorageConfig();
                Notification.success('تم حفظ إعدادات Google Drive بنجاح');
                this.load();
            });
        }

        const googledriveAuthorizeBtn = document.getElementById('googledrive-authorize-btn');
        if (googledriveAuthorizeBtn) {
            googledriveAuthorizeBtn.addEventListener('click', async () => {
                try {
                    await CloudStorageIntegration.authorize('googleDrive');
                    this.load();
                } catch (error) {
                    Notification.error(error.message || 'فشل ربط Google Drive');
                }
            });
        }

        // SharePoint Settings
        const sharepointForm = document.getElementById('sharepoint-settings-form');
        if (sharepointForm) {
            sharepointForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const enabled = document.getElementById('sharepoint-enabled')?.checked || false;
                const clientId = document.getElementById('sharepoint-client-id')?.value.trim() || '';
                const clientSecret = document.getElementById('sharepoint-client-secret')?.value.trim() || '';
                const tenantId = document.getElementById('sharepoint-tenant-id')?.value.trim() || '';
                const siteUrl = document.getElementById('sharepoint-site-url')?.value.trim() || '';

                AppState.cloudStorageConfig.sharepoint.enabled = enabled;
                AppState.cloudStorageConfig.sharepoint.clientId = clientId;
                if (clientSecret) {
                    AppState.cloudStorageConfig.sharepoint.clientSecret = clientSecret;
                }
                AppState.cloudStorageConfig.sharepoint.tenantId = tenantId;
                AppState.cloudStorageConfig.sharepoint.siteUrl = siteUrl;

                DataManager.saveCloudStorageConfig();
                Notification.success('تم حفظ إعدادات SharePoint بنجاح');
                this.load();
            });
        }

        const sharepointAuthorizeBtn = document.getElementById('sharepoint-authorize-btn');
        if (sharepointAuthorizeBtn) {
            sharepointAuthorizeBtn.addEventListener('click', async () => {
                try {
                    await CloudStorageIntegration.authorize('sharepoint');
                    this.load();
                } catch (error) {
                    Notification.error(error.message || 'فشل ربط SharePoint');
                }
            });
        }
    },

    renderCloudStorageSettings() {
        const onedriveConfig = AppState.cloudStorageConfig.onedrive;
        const googleDriveConfig = AppState.cloudStorageConfig.googleDrive;
        const sharepointConfig = AppState.cloudStorageConfig.sharepoint;

        const onedriveStatus = onedriveConfig.enabled && onedriveConfig.clientId && onedriveConfig.accessToken ? 'success' : 'warning';
        const googleDriveStatus = googleDriveConfig.enabled && googleDriveConfig.clientId && googleDriveConfig.accessToken ? 'success' : 'warning';
        const sharepointStatus = sharepointConfig.enabled && sharepointConfig.clientId && sharepointConfig.accessToken ? 'success' : 'warning';

        return `
            <div class="content-card mt-6">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-cloud ml-2"></i>
                        تكامل التخزين السحابي
                    </h2>
                </div>
                <div class="card-body space-y-6">
                    <!-- Microsoft OneDrive -->
                    <div class="border border-gray-200 rounded-lg p-4">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-base font-semibold text-gray-700">
                                <i class="fab fa-microsoft ml-2"></i>
                                Microsoft OneDrive
                            </h3>
                            <span class="badge badge-${onedriveStatus}">
                                ${onedriveStatus === 'success' ? 'مفعل' : 'غير مفعل'}
                            </span>
                        </div>
                        <form id="onedrive-settings-form" class="space-y-4">
                            <div>
                                <label class="flex items-center mb-2">
                                    <input type="checkbox" id="onedrive-enabled" class="rounded border-gray-300 text-blue-600"
                                        ${onedriveConfig.enabled ? 'checked' : ''}>
                                    <span class="mr-2 text-sm text-gray-700">تفعيل OneDrive</span>
                                </label>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">
                                    Client ID (معرف التطبيق)
                                </label>
                                <input type="text" id="onedrive-client-id" class="form-input"
                                    value="${onedriveConfig.clientId || ''}"
                                    placeholder="أدخل Client ID من Azure Portal"
                                    autocomplete="username">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">
                                    Client Secret (الرمز السري)
                                </label>
                                <input type="password" id="onedrive-client-secret" class="form-input"
                                    value="${onedriveConfig.clientSecret || ''}"
                                    placeholder="أدخل Client Secret"
                                    autocomplete="new-password">
                            </div>
                            <div class="flex items-center justify-end gap-4 pt-4 border-t">
                                ${onedriveConfig.clientId && !onedriveConfig.accessToken ? `
                                    <button type="button" id="onedrive-authorize-btn" class="btn-secondary">
                                        <i class="fas fa-key ml-2"></i>
                                        ربط الحساب
                                    </button>
                                ` : ''}
                                <button type="submit" class="btn-primary">
                                    <i class="fas fa-save ml-2"></i>
                                    حفظ
                                </button>
                            </div>
                        </form>
                    </div>

                    <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p class="text-xs text-gray-600">
                            <i class="fas fa-info-circle ml-1 text-blue-600"></i>
                            <strong>ملاحظة:</strong> يجب إعداد التطبيقات في Azure Portal (لـ OneDrive و SharePoint) أو Google Cloud Console (لـ Google Drive) أولاً.
                            المدير فقط يملك صلاحية ربط حساب النظام بالخدمات السحابية. المستخدمون العاديون يمكنهم استخدام التكامل بعد تفعيله.
                        </p>
                    </div>
                </div>
            </div>
        `;
    },

    renderGoogleDriveSettings() {
        const googleDriveConfig = AppState.cloudStorageConfig.googleDrive;
        const googleDriveStatus = googleDriveConfig.enabled && googleDriveConfig.clientId && googleDriveConfig.accessToken ? 'success' : 'warning';

        return `
            <div class="content-card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fab fa-google ml-2"></i>
                        Google Drive
                    </h2>
                </div>
                <div class="card-body space-y-4">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-base font-semibold text-gray-700">
                            <i class="fab fa-google ml-2"></i>
                            إعدادات Google Drive
                        </h3>
                        <span class="badge badge-${googleDriveStatus}">
                            ${googleDriveStatus === 'success' ? 'مفعل' : 'غير مفعل'}
                        </span>
                    </div>
                    <form id="googledrive-settings-form" class="space-y-4">
                        <div>
                            <label class="flex items-center mb-2">
                                <input type="checkbox" id="googledrive-enabled" class="rounded border-gray-300 text-blue-600"
                                    ${googleDriveConfig.enabled ? 'checked' : ''}>
                                <span class="mr-2 text-sm text-gray-700">تفعيل Google Drive</span>
                            </label>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">
                                Client ID (معرف التطبيق)
                            </label>
                            <input type="text" id="googledrive-client-id" class="form-input"
                                value="${googleDriveConfig.clientId || ''}"
                                placeholder="أدخل Client ID من Google Cloud Console"
                                autocomplete="username">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">
                                Client Secret (الرمز السري)
                            </label>
                            <input type="password" id="googledrive-client-secret" class="form-input"
                                value="${googleDriveConfig.clientSecret || ''}"
                                placeholder="أدخل Client Secret"
                                autocomplete="new-password">
                        </div>
                        <div class="flex items-center justify-end gap-4 pt-4 border-t">
                            ${googleDriveConfig.clientId && !googleDriveConfig.accessToken ? `
                                <button type="button" id="googledrive-authorize-btn" class="btn-secondary">
                                    <i class="fas fa-key ml-2"></i>
                                    ربط الحساب
                                </button>
                            ` : ''}
                            <button type="submit" class="btn-primary">
                                <i class="fas fa-save ml-2"></i>
                                حفظ
                            </button>
                        </div>
                    </form>
                    <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p class="text-xs text-gray-600">
                            <i class="fas fa-info-circle ml-1 text-blue-600"></i>
                            <strong>ملاحظة:</strong> يجب إعداد التطبيق في Google Cloud Console أولاً. المدير فقط يملك صلاحية ربط حساب النظام بـ Google Drive.
                        </p>
                    </div>
                </div>
            </div>
        `;
    },

    renderSharePointSettings() {
        const sharepointConfig = AppState.cloudStorageConfig.sharepoint;
        const sharepointStatus = sharepointConfig.enabled && sharepointConfig.clientId && sharepointConfig.accessToken ? 'success' : 'warning';

        return `
            <div class="content-card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fab fa-microsoft ml-2"></i>
                        Microsoft SharePoint
                    </h2>
                </div>
                <div class="card-body space-y-4">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-base font-semibold text-gray-700">
                            <i class="fab fa-microsoft ml-2"></i>
                            إعدادات Microsoft SharePoint
                        </h3>
                        <span class="badge badge-${sharepointStatus}">
                            ${sharepointStatus === 'success' ? 'مفعل' : 'غير مفعل'}
                        </span>
                    </div>
                    <form id="sharepoint-settings-form" class="space-y-4">
                        <div>
                            <label class="flex items-center mb-2">
                                <input type="checkbox" id="sharepoint-enabled" class="rounded border-gray-300 text-blue-600"
                                    ${sharepointConfig.enabled ? 'checked' : ''}>
                                <span class="mr-2 text-sm text-gray-700">تفعيل SharePoint</span>
                            </label>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">
                                Client ID (معرف التطبيق)
                            </label>
                            <input type="text" id="sharepoint-client-id" class="form-input"
                                value="${sharepointConfig.clientId || ''}"
                                placeholder="أدخل Client ID من Azure Portal"
                                autocomplete="username">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">
                                Client Secret (الرمز السري)
                            </label>
                            <input type="password" id="sharepoint-client-secret" class="form-input"
                                value="${sharepointConfig.clientSecret || ''}"
                                placeholder="أدخل Client Secret"
                                autocomplete="new-password">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">
                                Tenant ID (معرف المستأجر)
                            </label>
                            <input type="text" id="sharepoint-tenant-id" class="form-input"
                                value="${sharepointConfig.tenantId || ''}"
                                placeholder="أدخل Tenant ID (اختياري)">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">
                                Site URL (رابط الموقع)
                            </label>
                            <input type="url" id="sharepoint-site-url" class="form-input"
                                value="${sharepointConfig.siteUrl || ''}"
                                placeholder="https://yourcompany.sharepoint.com/sites/yoursite">
                        </div>
                        <div class="flex items-center justify-end gap-4 pt-4 border-t">
                            ${sharepointConfig.clientId && !sharepointConfig.accessToken ? `
                                <button type="button" id="sharepoint-authorize-btn" class="btn-secondary">
                                    <i class="fas fa-key ml-2"></i>
                                    ربط الحساب
                                </button>
                            ` : ''}
                            <button type="submit" class="btn-primary">
                                <i class="fas fa-save ml-2"></i>
                                حفظ
                            </button>
                        </div>
                    </form>
                    <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p class="text-xs text-gray-600">
                            <i class="fas fa-info-circle ml-1 text-blue-600"></i>
                            <strong>ملاحظة:</strong> يجب إعداد التطبيق في Azure Portal أولاً. المدير فقط يملك صلاحية ربط حساب النظام بـ SharePoint.
                        </p>
                    </div>
                </div>
            </div>
        `;
    },

    _violationTypesImportNormalizeKey(h) {
        return String(h == null ? '' : h).trim().replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF]/g, '').toLowerCase();
    },

    _violationTypesImportPick(row, candidates) {
        const map = {};
        Object.keys(row || {}).forEach((k) => {
            map[this._violationTypesImportNormalizeKey(k)] = row[k];
        });
        for (let i = 0; i < candidates.length; i++) {
            const ck = this._violationTypesImportNormalizeKey(candidates[i]);
            if (map[ck] !== undefined && map[ck] !== null && String(map[ck]).trim() !== '') {
                return map[ck];
            }
        }
        return '';
    },

    _parseViolationTypeFineForImport(raw) {
        if (raw === null || raw === undefined || raw === '') return 0;
        if (typeof Violations !== 'undefined' && typeof Violations.parseFineAmount === 'function') {
            return Violations.parseFineAmount(raw);
        }
        const n = Number(String(raw).replace(/[^\d.\-]/g, ''));
        return Number.isFinite(n) && n >= 0 ? n : 0;
    },

    downloadViolationTypesImportTemplate() {
        if (typeof XLSX === 'undefined') {
            Notification.error('مكتبة Excel غير محمّلة. حدّث الصفحة وحاول مرة أخرى.');
            return;
        }
        const headers = ['اسم_النوع', 'الوصف', 'القيمة_المالية'];
        const example = ['مثال: عدم ارتداء خوذة', 'وصف اختياري', '500'];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, example]);
        ws['!cols'] = [{ wch: 40 }, { wch: 50 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, 'أنواع_المخالفات');
        const note = [
            ['تعليمات:'],
            ['• عمود «اسم_النوع» إلزامي.'],
            ['• إذا وُجد نوع بنفس الاسم مسبقاً، يُحدَّث الوصف والقيمة المالية من الملف.'],
            ['• «القيمة_المالية» رقم بالجنيه (يمكن استخدام أرقام عربية حسب إعدادات المتصفح).']
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(note), 'تعليمات');
        XLSX.writeFile(wb, `قالب_استيراد_أنواع_المخالفات_${new Date().toISOString().slice(0, 10)}.xlsx`);
    },

    exportViolationTypesToExcel() {
        if (typeof XLSX === 'undefined') {
            Notification.error('مكتبة Excel غير محمّلة. حدّث الصفحة وحاول مرة أخرى.');
            return;
        }
        if (typeof ViolationTypesManager === 'undefined') {
            Notification.error('إدارة أنواع المخالفات غير متاحة حالياً.');
            return;
        }
        ViolationTypesManager.ensureInitialized();
        const types = ViolationTypesManager.getAll();
        if (!types.length) {
            Notification.info('لا توجد أنواع مخالفات لتصديرها.');
            return;
        }
        const headers = ['اسم_النوع', 'الوصف', 'القيمة_المالية', 'الحالة', 'عدد_السجلات'];
        const rows = types.map((type) => {
            const usage = ViolationTypesManager.countUsage(type);
            const fine = Number(type.fineAmount || 0);
            return [
                type.name || '',
                type.description || '',
                Number.isFinite(fine) ? fine : 0,
                type.isDefault ? 'افتراضي' : 'مخصص',
                usage
            ];
        });
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws['!cols'] = [{ wch: 42 }, { wch: 55 }, { wch: 16 }, { wch: 12 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, 'أنواع_المخالفات');
        const stamp = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `أنواع_المخالفات_${stamp}.xlsx`);
        Notification.success(`تم تصدير ${types.length} نوعاً إلى Excel.`);
    },

    showViolationTypesImportModal() {
        if (typeof ViolationTypesManager === 'undefined') {
            Notification.error('إدارة أنواع المخالفات غير متاحة حالياً.');
            return;
        }
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 640px;">
                <div class="modal-header">
                    <h2 class="modal-title"><i class="fas fa-file-excel ml-2 text-green-600"></i>استيراد أنواع مخالفات من Excel</h2>
                    <button type="button" class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body space-y-4">
                    <div class="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-900">
                        <p class="m-0 mb-2"><i class="fas fa-download ml-2"></i>حمّل القالب (عناوين + صف مثال)، عبّئ الأنواع ثم ارفع الملف.</p>
                        <button type="button" id="violation-types-import-download-template" class="btn-secondary btn-sm">
                            <i class="fas fa-file-download ml-2"></i>تحميل قالب Excel
                        </button>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">ملف Excel (.xlsx)</label>
                        <input type="file" id="violation-types-import-file" accept=".xlsx,.xls" class="form-input">
                    </div>
                    <div id="violation-types-import-preview" class="hidden text-sm text-gray-600 max-h-40 overflow-auto border rounded p-2 bg-gray-50"></div>
                    <div class="flex justify-end gap-2 pt-2 border-t">
                        <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
                        <button type="button" id="violation-types-import-confirm" class="btn-primary" disabled>
                            <i class="fas fa-upload ml-2"></i>تأكيد الاستيراد
                        </button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        let parsedRows = [];
        const preview = modal.querySelector('#violation-types-import-preview');
        const confirmBtn = modal.querySelector('#violation-types-import-confirm');
        modal.querySelector('#violation-types-import-download-template')?.addEventListener('click', () => this.downloadViolationTypesImportTemplate());
        modal.querySelector('#violation-types-import-file')?.addEventListener('change', async (e) => {
            const f = e.target.files && e.target.files[0];
            parsedRows = [];
            confirmBtn.disabled = true;
            preview.classList.add('hidden');
            if (!f) return;
            if (typeof XLSX === 'undefined') {
                Notification.error('مكتبة Excel غير محمّلة.');
                return;
            }
            try {
                const buf = await f.arrayBuffer();
                const wb = XLSX.read(buf, { type: 'array' });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                parsedRows = Array.isArray(json) ? json : [];
                preview.innerHTML = `<p>تم قراءة <strong>${parsedRows.length}</strong> صفاً من الورقة «${Utils.escapeHTML(wb.SheetNames[0] || '')}».</p>`;
                preview.classList.remove('hidden');
                confirmBtn.disabled = parsedRows.length === 0;
            } catch (err) {
                Utils.safeError('استيراد أنواع مخالفات:', err);
                Notification.error('تعذّر قراءة الملف: ' + (err.message || ''));
            }
        });
        confirmBtn?.addEventListener('click', async () => {
            if (!parsedRows.length) return;
            confirmBtn.disabled = true;
            await this.processViolationTypesImportRows(parsedRows, modal);
        });
        modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.remove(); });
    },

    async processViolationTypesImportRows(rows, modal) {
        if (typeof ViolationTypesManager === 'undefined') {
            Notification.error('إدارة الأنواع غير متاحة.');
            return;
        }
        ViolationTypesManager.ensureInitialized();
        if (!Array.isArray(AppState.appData.violationTypes)) {
            AppState.appData.violationTypes = [];
        }
        const now = new Date().toISOString();
        let added = 0;
        let merged = 0;
        let skipped = 0;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i] || {};
            const name = String(this._violationTypesImportPick(row, ['اسم_النوع', 'اسم النوع', 'name', 'typename', 'نوع_المخالفة']) || '').trim();
            if (!name) {
                skipped++;
                continue;
            }
            const description = String(this._violationTypesImportPick(row, ['الوصف', 'description', 'notes']) || '').trim();
            const fineRaw = this._violationTypesImportPick(row, ['القيمة_المالية', 'القيمة المالية', 'fineamount', 'fine', 'defaultfine']);
            const fineAmount = this._parseViolationTypeFineForImport(fineRaw !== '' && fineRaw !== undefined ? fineRaw : 0);
            const existing = ViolationTypesManager.getTypeByName(name);
            if (existing) {
                existing.description = description;
                existing.fineAmount = fineAmount;
                existing.updatedAt = now;
                merged++;
            } else {
                AppState.appData.violationTypes.push({
                    id: Utils.generateId('VTYPE'),
                    name,
                    description,
                    fineAmount,
                    isDefault: false,
                    createdAt: now,
                    updatedAt: now
                });
                added++;
            }
        }
        ViolationTypesManager.sortTypes();
        ViolationTypesManager.ensureViolationsTypeIds();
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            try { window.DataManager.save(); } catch (e) { /* ignore */ }
        }
        ViolationTypesManager.persist(true);
        if (modal && modal.parentNode) modal.remove();
        Notification.success(`تم الاستيراد: ${added} نوع جديد، ${merged} محدّث بالاسم، ${skipped} صف بدون اسم.`);
        this.refreshViolationTypesList();
    },

    renderViolationTypesList() {
        const types = ViolationTypesManager.getAll();
        if (!types.length) {
            return `
                <div class="empty-state">
                    <i class="fas fa-tags text-4xl text-gray-300 mb-3"></i>
                    <p class="text-gray-500">لم يتم تعريف أنواع مخالفات حتى الآن</p>
                </div>
            `;
        }

        return `
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>نوع المخالفة</th>
                            <th>الوصف</th>
                            <th>القيمة المالية</th>
                            <th>الحالة</th>
                            <th>عدد السجلات</th>
                            <th>الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${types.map(type => {
            const usage = ViolationTypesManager.countUsage(type);
            return `
                                    <tr data-violation-type-id="${type.id}">
                                        <td class="align-top">
                                            <span class="font-semibold">${Utils.escapeHTML(type.name)}</span>
                                        </td>
                                        <td class="align-top">
                                            ${type.description ? `<span class="text-sm text-gray-600">${Utils.escapeHTML(type.description)}</span>` : '<span class="text-sm text-gray-400">—</span>'}
                                        </td>
                                        <td class="align-top font-semibold text-red-700">
                                            ${Number(type.fineAmount || 0).toLocaleString('ar-EG')} ج.م
                                        </td>
                                        <td class="align-top">
                                            <span class="badge ${type.isDefault ? 'badge-info' : 'badge-primary'}">
                                                ${type.isDefault ? 'افتراضي' : 'مخصص'}
                                            </span>
                                        </td>
                                        <td class="align-top">${usage}</td>
                                        <td class="align-top">
                                            <div class="flex items-center gap-2">
                                                <button class="btn-icon btn-icon-primary" data-action="view-violation-type" data-type-id="${type.id}" title="عرض">
                                                    <i class="fas fa-eye"></i>
                                                </button>
                                                <button class="btn-icon btn-icon-info" data-action="edit-violation-type" data-type-id="${type.id}" title="تعديل">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn-icon btn-icon-danger" data-action="delete-violation-type" data-type-id="${type.id}" title="حذف">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `;
        }).join('')
            }
                    </tbody>
                </table>
            </div>
        `;
    },

    bindViolationTypesEvents() {
        const addBtn = document.getElementById('add-violation-type-btn');
        if (addBtn) {
            addBtn.onclick = () => this.openViolationTypeModal();
        }
        const importBtn = document.getElementById('import-violation-types-btn');
        if (importBtn) {
            importBtn.onclick = () => this.showViolationTypesImportModal();
        }
        const exportBtn = document.getElementById('export-violation-types-btn');
        if (exportBtn) {
            exportBtn.onclick = () => this.exportViolationTypesToExcel();
        }

        document.querySelectorAll('[data-action="view-violation-type"]').forEach(btn => {
            btn.onclick = (event) => {
                const typeId = event.currentTarget.getAttribute('data-type-id');
                this.viewViolationType(typeId);
            };
        });

        document.querySelectorAll('[data-action="edit-violation-type"]').forEach(btn => {
            btn.onclick = (event) => {
                const typeId = event.currentTarget.getAttribute('data-type-id');
                this.openViolationTypeModal(typeId);
            };
        });

        document.querySelectorAll('[data-action="delete-violation-type"]').forEach(btn => {
            btn.onclick = (event) => {
                const typeId = event.currentTarget.getAttribute('data-type-id');
                this.deleteViolationType(typeId);
            };
        });
    },

    refreshViolationTypesList() {
        const container = document.getElementById('violation-types-management');
        if (!container) return;
        container.innerHTML = this.renderViolationTypesList();
        this.bindViolationTypesEvents();
    },

    viewViolationType(typeId) {
        try {
            if (!typeId || typeof ViolationTypesManager === 'undefined') return;
            ViolationTypesManager.ensureInitialized?.();
            const type = ViolationTypesManager.getTypeById(typeId);
            if (!type || !type.name) {
                Notification.error('تعذر العثور على نوع المخالفة المحدد');
                return;
            }

            if (typeof UI !== 'undefined' && typeof UI.showSection === 'function') {
                UI.showSection('violations');
            }

            const applyFilter = () => {
                if (typeof Violations === 'undefined') return false;
                if (!Violations.currentFilters) {
                    Violations.currentFilters = { search: '', personType: '', violationType: '', severity: '', status: '' };
                }
                Violations.currentFilters.violationType = type.name;

                // نضمن الدخول على تبويب "الكل" حتى تظهر الفلاتر والقائمة
                if (typeof Violations.switchTab === 'function') {
                    Violations.switchTab('all');
                } else if (typeof Violations.refreshViolationsView === 'function') {
                    Violations.refreshViolationsView();
                } else if (typeof Violations.refreshModule === 'function') {
                    Violations.refreshModule();
                }
                return true;
            };

            // محاولة سريعة، ثم إعادة محاولة قصيرة لو لسه القسم/الموديول ما اتجهزش
            if (!applyFilter()) {
                setTimeout(() => {
                    if (!applyFilter()) {
                        setTimeout(() => applyFilter(), 600);
                    }
                }, 250);
            }
        } catch (e) {
            Notification.error('حدث خطأ أثناء فتح قائمة المخالفات');
        }
    },

    openViolationTypeModal(typeId = null) {
        const existing = typeId ? ViolationTypesManager.getTypeById(typeId) : null;
        if (typeId && !existing) {
            Notification.error('تعذر العثور على نوع المخالفة المحدد');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 480px;">
                <div class="modal-header">
                    <h2 class="modal-title">${existing ? 'تعديل نوع المخالفة' : 'إضافة نوع مخالفة جديد'}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="violation-type-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">اسم النوع *</label>
                            <input type="text" id="violation-type-name" class="form-input" required maxlength="150"
                                value="${existing ? Utils.escapeHTML(existing.name) : ''}"
                                placeholder="مثال: عدم ارتداء خوذة السلامة">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">الوصف (اختياري)</label>
                            <textarea id="violation-type-description" class="form-input" rows="3"
                                placeholder="وصف مختصر لهذا النوع">${existing ? Utils.escapeHTML(existing.description || '') : ''}</textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">القيمة المالية الافتراضية</label>
                            <input type="number" id="violation-type-fine-amount" class="form-input" min="0" step="1"
                                value="${existing ? Number(existing.fineAmount || 0) : 0}"
                                placeholder="مثال: 500">
                            <p class="text-xs text-gray-500 mt-1">تُستخدم هذه القيمة تلقائياً عند اختيار نوع المخالفة في التسجيل.</p>
                        </div>
                        <div class="flex items-center justify-end gap-3 pt-4 border-t">
                            <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
                            <button type="submit" class="btn-primary">
                                <i class="fas fa-save ml-2"></i>${existing ? 'حفظ التعديلات' : 'إضافة النوع'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const form = modal.querySelector('#violation-type-form');
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const nameInput = modal.querySelector('#violation-type-name');
            const descriptionInput = modal.querySelector('#violation-type-description');
            const fineAmountInput = modal.querySelector('#violation-type-fine-amount');
            const name = nameInput?.value.trim() || '';
            const description = descriptionInput?.value.trim() || '';
            const fineAmountRaw = fineAmountInput?.value ?? '0';
            const parsedFineAmount = Number(fineAmountRaw);
            const fineAmount = Number.isFinite(parsedFineAmount) && parsedFineAmount >= 0 ? parsedFineAmount : 0;

            if (!name) {
                Notification.error('يرجى إدخال اسم النوع');
                nameInput?.focus();
                return;
            }

            try {
                if (existing) {
                    ViolationTypesManager.updateType(existing.id, { name, description, fineAmount });
                    await ViolationTypesManager.persist();
                    Notification.success('تم تحديث نوع المخالفة بنجاح');
                } else {
                    ViolationTypesManager.addType({ name, description, fineAmount });
                    await ViolationTypesManager.persist();
                    Notification.success('تم إضافة نوع المخالفة بنجاح');
                }
                modal.remove();
                this.refreshViolationTypesList();
            } catch (error) {
                Notification.error(error.message);
            }
        });

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.remove();
            }
        });
    },

    deleteViolationType(typeId) {
        if (!typeId) return;

        const type = ViolationTypesManager.getTypeById(typeId);
        if (!type) {
            Notification.error('نوع المخالفة غير موجود');
            return;
        }

        const usage = ViolationTypesManager.countUsage(type);
        const message = usage > 0
            ? `هناك ${usage} سجل مخالفة مرتبط بهذا النوع.\nلن يتم حذف السجلات الموجودة، لكن لن يكون النوع متاحاً للاستخدام الجديد.\nهل ترغب بالمتابعة لحذف "${type.name}"؟`
            : `هل تريد بالتأكيد حذف نوع المخالفة "${type.name}"؟`;

        if (!confirm(message)) {
            return;
        }

        (async () => {
            try {
                ViolationTypesManager.deleteType(typeId);
                await ViolationTypesManager.persist();
                Notification.success('تم حذف نوع المخالفة بنجاح');
                this.refreshViolationTypesList();
            } catch (error) {
                Notification.error(error.message);
            }
        })();
    },

    normalizeOwner(ownerId) {
        return !ownerId || ownerId === '__default__' ? '__default__' : String(ownerId);
    },

    renderApprovalOwnerOptions(selectedOwner = '__default__') {
        const normalized = this.normalizeOwner(selectedOwner);
        const users = ApprovalCircuits.getUsersList();
        const configuredOwners = ApprovalCircuits.listOwners();
        const optionItems = [];

        optionItems.push(`
            <option value="__default__" ${normalized === '__default__' ? 'selected' : ''}>
                المسار الافتراضي (يطبق على جميع المستخدمين)
            </option>
        `);

        users.forEach(user => {
            const value = user.id || user.email;
            const label = `${Utils.escapeHTML(user.name || user.email || '')}${user.email ? ` - ${Utils.escapeHTML(user.email)}` : ''}`;
            optionItems.push(`
                <option value="${Utils.escapeHTML(value)}" ${normalized === value ? 'selected' : ''}>
                    ${label}
                </option>
            `);
        });

        configuredOwners
            .filter(ownerId => ownerId && ownerId !== '__default__' && !users.some(user => user.id === ownerId))
            .forEach(ownerId => {
                const circuit = ApprovalCircuits.getCircuit(ownerId);
                optionItems.push(`
                    <option value="${Utils.escapeHTML(ownerId)}" ${normalized === ownerId ? 'selected' : ''}>
                        مستخدم غير موجود (${Utils.escapeHTML(circuit?.name || ownerId)})
                    </option>
                `);
            });

        return optionItems.join('');
    },

    renderApprovalStepsPlaceholder() {
        return `
            <div class="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-6 text-center text-sm text-gray-600">
                <i class="fas fa-layer-group text-2xl text-gray-400 mb-3"></i>
                <p>اختر مستخدماً من القائمة أعلاه ثم قم بإضافة مستويات الاعتماد الخاصة به. يمكن إضافة أكثر من مستوى مع تحديد المعتمدين في كل مستوى.</p>
            </div>
        `;
    },

    updateApprovalCircuitStatusLabel() {
        const label = document.getElementById('approval-circuit-active-label');
        if (!label) return;

        const ownerId = this.normalizeOwner(this.currentApprovalCircuitOwner);
        const circuit = ApprovalCircuits.getCircuit(ownerId);
        if (!circuit || !Array.isArray(circuit.steps) || circuit.steps.length === 0) {
            label.style.display = 'none';
            return;
        }

        const user = ownerId === '__default__' ? null : ApprovalCircuits.getUserById(ownerId);
        const ownerLabel = ownerId === '__default__'
            ? 'المسار الافتراضي'
            : (user?.name || user?.email || `مستخدم ${ownerId}`);
        const stepsCount = circuit.steps.length;
        label.textContent = `${ownerLabel} • ${stepsCount} مستوى${stepsCount > 1 ? 'ات' : ''}`;
        label.style.display = 'inline-flex';
    },

    renderApprovalSteps() {
        const container = document.getElementById('approval-steps-container');
        if (!container) return;

        if (!this.currentApprovalCircuitSteps || this.currentApprovalCircuitSteps.length === 0) {
            container.innerHTML = this.renderApprovalStepsPlaceholder();
            this.updateApprovalCircuitStatusLabel();
            return;
        }

        const users = ApprovalCircuits.getUsersList();
        container.innerHTML = this.currentApprovalCircuitSteps
            .map((step, index) => this.renderApprovalStepCard(step, index, users))
            .join('');

        this.updateApprovalCircuitStatusLabel();
    },

    renderApprovalStepCard(step, index, users) {
        const title = this.getStepTitle(index);
        const selectedIds = Array.isArray(step.userIds) ? step.userIds : [];
        const options = users.map(user => {
            const value = user.id || user.email;
            const label = `${Utils.escapeHTML(user.name || user.email || '')}${user.email ? ` (${Utils.escapeHTML(user.email)})` : ''}`;
            const selected = selectedIds.includes(value) ? 'selected' : '';
            return `<option value="${Utils.escapeHTML(value)}" ${selected}>${label}</option>`;
        }).join('');

        return `
            <div class="approval-step-card border border-gray-200 rounded-lg bg-gray-50 p-4" data-step-index="${index}" data-step-id="${Utils.escapeHTML(step.id || '')}">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h4 class="text-sm font-semibold text-gray-700">${title}</h4>
                        <p class="text-xs text-gray-500">حدد دور المعتمد والمستخدمين المخولين بالاعتماد في هذا المستوى.</p>
                    </div>
                    <button type="button" class="btn-icon btn-icon-danger" data-remove-step-index="${index}" title="حذف المستوى">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-2">اسم المستوى / الدور</label>
                        <input type="text" class="form-input approval-step-name" value="${Utils.escapeHTML(step.name || step.role || '')}" placeholder="مثال: مسؤول الجهة الطالبة" required>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-2">المعتمدون المحتملون</label>
                        <select class="form-input approval-step-users" multiple size="4">
                            ${options}
                        </select>
                        <p class="text-xs text-gray-500 mt-1">يمكن اختيار أكثر من مستخدم ليكون مسؤولاً عن هذا المستوى.</p>
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-4 mt-4">
                    <label class="flex items-center text-sm text-gray-700 gap-2">
                        <input type="checkbox" class="approval-step-required" ${step.required !== false ? 'checked' : ''}>
                        <span>اعتماد إلزامي</span>
                    </label>
                    <label class="flex items-center text-sm text-gray-700 gap-2">
                        <input type="checkbox" class="approval-step-safety" ${step.isSafetyOfficer === true ? 'checked' : ''}>
                        <span>مسؤول السلامة والصحة المهنية</span>
                    </label>
                </div>
            </div>
        `;
    },

    getStepTitle(index) {
        const labels = ['المستوى الأول', 'المستوى الثاني', 'المستوى الثالث', 'المستوى الرابع', 'المستوى الخامس'];
        return labels[index] || `المستوى ${index + 1}`;
    },

    refreshApprovalOwnerOptions(selectedOwner = '__default__') {
        const ownerSelect = document.getElementById('approval-owner-select');
        if (!ownerSelect) return;
        ownerSelect.innerHTML = this.renderApprovalOwnerOptions(selectedOwner);
        ownerSelect.value = this.normalizeOwner(selectedOwner);
    },

    initializeApprovalCircuitsUI() {
        const ownerSelect = document.getElementById('approval-owner-select');
        if (!ownerSelect) return;

        const addStepBtn = document.getElementById('add-approval-step-btn');
        const saveBtn = document.getElementById('save-approval-circuit-btn');
        const deleteBtn = document.getElementById('delete-approval-circuit-btn');
        const stepsContainer = document.getElementById('approval-steps-container');

        const initialOwner = this.normalizeOwner(ownerSelect.value || '__default__');
        this.currentApprovalCircuitOwner = initialOwner;
        this.loadApprovalCircuitEditor(initialOwner);

        ownerSelect.addEventListener('change', (event) => {
            const ownerId = this.normalizeOwner(event.target.value);
            this.currentApprovalCircuitOwner = ownerId;
            this.loadApprovalCircuitEditor(ownerId);
        });

        if (addStepBtn) {
            addStepBtn.addEventListener('click', () => this.addApprovalCircuitStep());
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveApprovalCircuit());
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteApprovalCircuit());
        }

        if (stepsContainer) {
            stepsContainer.addEventListener('click', (event) => {
                const removeBtn = event.target.closest('[data-remove-step-index]');
                if (removeBtn) {
                    const index = parseInt(removeBtn.getAttribute('data-remove-step-index'), 10);
                    if (!Number.isNaN(index)) {
                        this.removeApprovalCircuitStep(index);
                    }
                }
            });
        }
    },

    loadApprovalCircuitEditor(ownerId) {
        const normalized = this.normalizeOwner(ownerId);
        const circuit = ApprovalCircuits.getCircuit(normalized);
        const nameInput = document.getElementById('approval-circuit-name');
        const deleteBtn = document.getElementById('delete-approval-circuit-btn');

        if (circuit) {
            this.currentApprovalCircuitId = circuit.id || null;
            this.currentApprovalCircuitSteps = Array.isArray(circuit.steps)
                ? circuit.steps.map((step, index) => ({
                    id: step.id || Utils.generateId('CSTEP'),
                    name: step.name || step.role || '',
                    userIds: Array.isArray(step.userIds) ? step.userIds.filter(Boolean) : [],
                    required: step.required !== false,
                    isSafetyOfficer: step.isSafetyOfficer === true,
                    order: typeof step.order === 'number' ? step.order : index
                }))
                : [];
            if (nameInput) {
                nameInput.value = circuit.name || (normalized === '__default__' ? 'المسار الافتراضي' : '');
            }
        } else {
            this.currentApprovalCircuitId = null;
            this.currentApprovalCircuitSteps = [];
            if (nameInput) {
                nameInput.value = normalized === '__default__' ? 'المسار الافتراضي' : '';
            }
        }

        this.currentApprovalCircuitOwner = normalized;
        this.currentApprovalCircuitSteps = this.currentApprovalCircuitSteps.map((step, index) => Object.assign({}, step, { order: index }));

        if (deleteBtn) {
            deleteBtn.disabled = !circuit;
        }

        this.renderApprovalSteps();
    },

    addApprovalCircuitStep() {
        if (!Array.isArray(this.currentApprovalCircuitSteps)) {
            this.currentApprovalCircuitSteps = [];
        }
        this.currentApprovalCircuitSteps.push({
            id: Utils.generateId('CSTEP'),
            name: '',
            userIds: [],
            required: true,
            isSafetyOfficer: false,
            order: this.currentApprovalCircuitSteps.length
        });
        this.renderApprovalSteps();
    },

    removeApprovalCircuitStep(index) {
        if (!Array.isArray(this.currentApprovalCircuitSteps)) return;
        this.currentApprovalCircuitSteps.splice(index, 1);
        this.currentApprovalCircuitSteps = this.currentApprovalCircuitSteps.map((step, idx) => Object.assign({}, step, { order: idx }));
        this.renderApprovalSteps();
    },

    collectApprovalCircuitData() {
        const ownerId = this.normalizeOwner(this.currentApprovalCircuitOwner);
        const nameInput = document.getElementById('approval-circuit-name');
        const name = nameInput ? nameInput.value.trim() : '';
        const stepCards = document.querySelectorAll('.approval-step-card');

        const steps = Array.from(stepCards).map((card, index) => {
            const id = card.getAttribute('data-step-id') || Utils.generateId('CSTEP');
            const nameField = card.querySelector('.approval-step-name');
            const usersSelect = card.querySelector('.approval-step-users');
            const requiredCheckbox = card.querySelector('.approval-step-required');
            const safetyCheckbox = card.querySelector('.approval-step-safety');

            const stepName = nameField ? nameField.value.trim() : '';
            const userIds = usersSelect
                ? Array.from(usersSelect.options)
                    .filter(opt => opt.selected)
                    .map(opt => opt.value)
                : [];

            return {
                id,
                name: stepName,
                userIds,
                required: requiredCheckbox ? requiredCheckbox.checked : true,
                isSafetyOfficer: safetyCheckbox ? safetyCheckbox.checked : false,
                order: index
            };
        });

        return {
            id: this.currentApprovalCircuitId || Utils.generateId('CIR'),
            ownerId,
            name: name || (ownerId === '__default__' ? 'المسار الافتراضي' : ''),
            steps,
            updatedAt: new Date().toISOString()
        };
    },

    saveApprovalCircuit() {
        const circuit = this.collectApprovalCircuitData();
        if (!circuit.steps || circuit.steps.length === 0) {
            Notification.error('يرجى إضافة مستوى واحد على الأقل قبل الحفظ.');
            return;
        }

        const missingNames = circuit.steps.some(step => !step.name);
        if (missingNames) {
            Notification.error('يجب تحديد اسم لكل مستوى اعتماد.');
            return;
        }

        const missingUsers = circuit.steps.some(step => !Array.isArray(step.userIds) || step.userIds.length === 0);
        if (missingUsers) {
            Notification.error('يجب تحديد مستخدم واحد على الأقل لكل مستوى اعتماد.');
            return;
        }

        ApprovalCircuits.saveCircuit(circuit);
        this.currentApprovalCircuitId = circuit.id;
        this.currentApprovalCircuitSteps = circuit.steps.map((step, index) => Object.assign({}, step, { order: index }));
        this.refreshApprovalOwnerOptions(circuit.ownerId);
        this.renderApprovalSteps();
        Notification.success('تم حفظ مسار الاعتماد بنجاح');
    },

    deleteApprovalCircuit() {
        const ownerId = this.normalizeOwner(this.currentApprovalCircuitOwner);
        const circuit = ApprovalCircuits.getCircuit(ownerId);
        if (!circuit) {
            Notification.info('لا يوجد مسار لحذفه.');
            return;
        }

        const ownerLabel = ownerId === '__default__' ? 'المسار الافتراضي' : circuit.name || ownerId;
        if (!confirm(`هل تريد حذف "${ownerLabel}"؟\nلن يتم حذف التصاريح السابقة، لكن سيتم استخدام المسار الافتراضي مستقبلاً.`)) {
            return;
        }

        ApprovalCircuits.deleteCircuit(ownerId);
        this.currentApprovalCircuitId = null;
        this.currentApprovalCircuitSteps = [];
        this.refreshApprovalOwnerOptions(ownerId);
        this.loadApprovalCircuitEditor(ownerId);
        Notification.success('تم حذف مسار الاعتماد.');
    },

    renderUsersPermissionsList() {
        const users = AppState.appData.users || [];
        if (users.length === 0) {
            return `
                <div class="text-center text-gray-500 py-4">
                    <i class="fas fa-users text-3xl mb-2"></i>
                    <p>لا يوجد مستخدمين حالياً</p>
                </div>
            `;
        }

        return users.map(user => {
            const hasSettingsAccess = this.hasAccessForUser(user, 'settings');
            const roleBadge = user.role === 'admin' ? 'badge-danger' :
                user.role === 'safety_officer' ? 'badge-warning' : 'badge-info';
            const roleText = user.role === 'admin' ? 'مدير' :
                user.role === 'safety_officer' ? 'مسؤول السلامة' : 'مستخدم';

            return `
                <div class="flex items-center justify-between p-3 border rounded hover:bg-gray-50">
                    <div class="flex items-center flex-1">
                        <div class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center ml-3">
                            ${user.photo ? (() => {
                    const disp = typeof Utils.resolveDriveAwareImgDisplay === 'function'
                        ? Utils.resolveDriveAwareImgDisplay(user.photo)
                        : { canonical: String(user.photo), displaySrc: String(user.photo), needsProxy: false, proxyFileId: '' };
                    const pa = typeof Utils.driveProxyImgAttrs === 'function' ? Utils.driveProxyImgAttrs(disp) : '';
                    return `<img src="${Utils.escapeHTML(disp.displaySrc)}" alt="${Utils.escapeHTML(user.name)}"${pa} class="settings-perm-user-photo w-full h-full rounded-full object-cover">`;
                })() :
                    `<i class="fas fa-user text-gray-600"></i>`
                }
                        </div>
                        <div class="flex-1">
                            <div class="font-semibold">${Utils.escapeHTML(user.name || '')}</div>
                            <div class="text-sm text-gray-600">${Utils.escapeHTML(user.email || '')}</div>
                        </div>
                        <div class="mr-4">
                            <span class="badge ${roleBadge}">${roleText}</span>
                        </div>
                    </div>
                    <div class="flex items-center">
                        <span class="badge ${hasSettingsAccess ? 'badge-success' : 'badge-warning'} mr-3">
                            ${hasSettingsAccess ?
                    '<i class="fas fa-check-circle ml-1"></i> لديه صلاحية' :
                    '<i class="fas fa-times-circle ml-1"></i> لا يملك صلاحية'
                }
                        </span>
                        <button onclick="Settings.viewUserPermissions('${user.id}')" 
                                class="btn-icon btn-icon-primary" 
                                title="عرض التاصيل">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    viewUserPermissions(userId) {
        const user = AppState.appData.users.find(u => u.id === userId);
        if (!user) {
            Notification.error('المستخدم غير موجود');
            return;
        }

        const hasSettingsAccess = this.hasAccessForUser(user, 'settings');
        const permissions = user.permissions || {};
        const allModules = [
            { key: 'dashboard', label: 'لوحة التحكم' },
            { key: 'incidents', label: 'الحوادث' },
            { key: 'nearmiss', label: 'الحوادث الوشيكة' },
            { key: 'ptw', label: 'تصاريح العمل' },
            { key: 'training', label: 'التدريب' },
            { key: 'clinic', label: 'العيادة' },
            { key: 'fire-equipment', label: 'معدات الإطفاء' },
            { key: 'ppe', label: 'مهمات الوقاية' },
            { key: 'violations', label: 'المخالفات' },
            { key: 'contractors', label: 'المقاولين' },
            { key: 'employees', label: 'قاعدة بيانات الموظفين' },
            { key: 'behavior-monitoring', label: 'مراقبة التصرات' },
            { key: 'chemical-safety', label: 'السلامة الكيميائية' },
            { key: 'daily-observations', label: 'الملاحظات اليومية' },
            { key: 'iso', label: 'نظام ISO' },
            { key: 'emergency', label: 'تنبيهات الطوارئ' },
            { key: 'users', label: 'المستخدمين' },
            { key: 'settings', label: 'الإعدادات' }
        ];

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-shield-alt ml-2"></i>
                        صلاحيات المستخدم: ${Utils.escapeHTML(user.name)}
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="space-y-4">
                        <div class="bg-blue-50 border border-blue-200 rounded p-4">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="font-semibold text-blue-800">${Utils.escapeHTML(user.name)}</p>
                                    <p class="text-sm text-blue-600">${Utils.escapeHTML(user.email)}</p>
                                </div>
                                <div class="text-left">
                                    <span class="badge ${user.role === 'admin' ? 'badge-danger' : user.role === 'safety_officer' ? 'badge-warning' : 'badge-info'}">
                                        ${user.role === 'admin' ? 'مدير' : user.role === 'safety_officer' ? 'مسؤول السلامة' : 'مستخدم'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        
                        <div>
                            <h3 class="font-semibold mb-3">صلاحيات الوصول للوحدات:</h3>
                            <div class="grid grid-cols-2 gap-2">
                                ${allModules.map(module => {
            const hasPermission = this.hasAccessForUser(user, module.key);
            return `
                                        <div class="flex items-center justify-between p-2 border rounded ${hasPermission ? 'bg-green-50' : 'bg-gray-50'}">
                                            <span class="text-sm">${module.label}</span>
                                            ${hasPermission ?
                    '<i class="fas fa-check-circle text-green-600"></i>' :
                    '<i class="fas fa-times-circle text-gray-400"></i>'
                }
                                        </div>
                                    `;
        }).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
                    <button type="button" class="btn-primary" onclick="UI.showSection('users'); this.closest('.modal-overlay').remove(); setTimeout(() => Users.editUser('${user.id}'), 500);">
                        <i class="fas fa-edit ml-2"></i>
                        تعديل الصلاحيات
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    hasAccessForUser(user, moduleName) {
        // محاكاة نفس منطق Permissions.hasAccess لكن لمستخدم محدد
        if (user.role === 'admin') return true;

        // التحقق من الصلاحيات المخصصة للمستخدم (الممنوحة من قبل مدير النظام)
        const normalizedPermissions = typeof Permissions !== 'undefined' && typeof Permissions.normalizePermissions === 'function'
            ? Permissions.normalizePermissions(user.permissions)
            : (user.permissions || {});
        
        if (normalizedPermissions && normalizedPermissions.hasOwnProperty(moduleName)) {
            return normalizedPermissions[moduleName] === true;
        }

        // لا توجد صلاحيات افتراضية - يجب منحها من قبل مدير النظام فقط
        return false;
    },

    async handleSubmit(e) {
        e.preventDefault();
        try {
            const serverEnabled = document.getElementById('google-apps-script-enabled');
            const serverUrl = document.getElementById('google-apps-script-url');
            const sheetsEnabled = document.getElementById('google-sheets-enabled');
            const sheetsId = document.getElementById('google-sheets-id');

            if (!serverEnabled || !serverUrl || !sheetsEnabled || !sheetsId) {
                Notification.error('خطأ: لم يتم العثور على حقول النموذج');
                return;
            }

            AppState.backendConfig.server.enabled = serverEnabled.checked;
            AppState.backendConfig.server.scriptUrl = serverUrl.value.trim();
            AppState.backendConfig.sheets.enabled = sheetsEnabled.checked;
            AppState.backendConfig.sheets.spreadsheetId = sheetsId.value.trim();

            // حفظ الإعدادات باستخدام window.DataManager
            let saveSuccess = false;
            if (typeof window.DataManager !== 'undefined' && window.DataManager.saveBackendConfig) {
                const saved = window.DataManager.saveBackendConfig();
                if (saved) {
                    saveSuccess = true;
                    Notification.success('تم حفظ الإعدادات بنجاح');
                } else {
                    Notification.error('فشل حفظ الإعدادات');
                }
            } else if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                // إذا لم تكن saveBackendConfig موجودة، استخدم save() العامة
                try {
                    await window.DataManager.save();
                    saveSuccess = true;
                    Notification.success('تم حفظ الإعدادات بنجاح');
                } catch (saveError) {
                    Utils.safeError('خطأ في حفظ الإعدادات:', saveError);
                    Notification.error('فشل حفظ الإعدادات: ' + (saveError.message || 'خطأ غير معروف'));
                }
            } else {
                // حفظ مباشر في localStorage كحل بديل
                try {
                    localStorage.setItem('hse_backend_config', JSON.stringify(AppState.backendConfig));
                    saveSuccess = true;
                    Notification.success('تم حفظ الإعدادات بنجاح (حفظ محلي)');
                } catch (storageError) {
                    Utils.safeError('خطأ في حفظ الإعدادات:', storageError);
                    Notification.error('فشل حفظ الإعدادات: ' + storageError.message);
                }
            }

            // اختبار الاتصال بعد حفظ الإعدادات للتأكد من نجاح الاتصال
            if (saveSuccess && AppState.backendConfig.server.enabled && AppState.backendConfig.server.scriptUrl) {
                try {
                    Loading.show();
                    // انتظار قصير للتأكد من حفظ الإعدادات
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // اختبار الاتصال
                    const testResult = await Backend.readFromSheets('Users');
                    Loading.hide();
                    
                    if (testResult && Array.isArray(testResult)) {
                        Notification.success(`✅ تم حفظ الإعدادات واختبار الاتصال بنجاح! تم العثور على ${testResult.length} سجل`);
                    } else {
                        Notification.warning('تم حفظ الإعدادات، لكن فشل اختبار الاتصال. يرجى التحقق من الإعدادات.');
                    }
                } catch (testError) {
                    Loading.hide();
                    Utils.safeWarn('⚠️ فشل اختبار الاتصال بعد حفظ الإعدادات:', testError);
                    Notification.warning('تم حفظ الإعدادات، لكن فشل اختبار الاتصال: ' + (testError.message || 'خطأ غير معروف'));
                }
            }
        } catch (error) {
            Utils.safeError('خطأ في حفظ إعدادات الاتصال بالخادم:', error);
            Notification.error('فشل حفظ الإعدادات: ' + (error.message || 'خطأ غير معروف'));
        }
    },

    async testConnection() {
        Loading.show();
        try {
            if (AppState.backendConfig.server.enabled && AppState.backendConfig.server.scriptUrl) {
                // استخدام timeout محسّن (30 ثانية)
                const timeout = 30000;
                const result = await Utils.promiseWithTimeout(
                    Backend.readFromSheets('Users'),
                    timeout,
                    'انتهت مهلة الاتصال بالخادم\n\nتحقق من:\n1. اتصال الإنترنت\n2. صحة رابط نقطة النهاية (RPC)\n3. عدم وجود قيود على الشبكة'
                );
                Loading.hide();
                Notification.success('الاتصال نجح! تم العثور على ' + result.length + ' سجل');
            } else {
                Loading.hide();
                Notification.error('يرجى تفعيل الاتصال بالخادم وإدخال رابط نقطة النهاية');
            }
        } catch (error) {
            Loading.hide();
            const errorMsg = error.message || 'خطأ غير معروف';
            Notification.error('فشل الاتصال: ' + errorMsg);
            Utils.safeError('خطأ في اختبار الاتصال:', error);
        }
    },

    async initializeSheets() {
        if (!AppState.backendConfig.server.enabled) {
            Notification.error('يرجى تفعيل الاتصال بالخادم أولاً');
            return;
        }

        if (!AppState.backendConfig.sheets.spreadsheetId) {
            Notification.error('يرجى إدخال معرف الجدول أولاً إذا كان مطلوباً');
            return;
        }

        const sheetsList = 'Users, Incidents, NearMiss, PTW, Training, ClinicVisits, Medications, SickLeave, ClinicInventory, FireEquipment, FireEquipmentAssets, FireEquipmentInspections, PPE, Violations, Contractors, Employees, BehaviorMonitoring, ChemicalSafety, DailyObservations, ISODocuments, ISOProcedures, ISOForms, EmergencyAlerts, EmergencyPlans';

        if (!confirm(`هل تريد إنشاء جميع الأوراق المطلوبة تلقائياً؟\n\nسيتم إنشاء:\n${sheetsList.split(', ').map(s => `- ${s}`).join('\n')}`)) {
            return;
        }

        try {
            Loading.show();
            await Backend.initializeSheets();
            Loading.hide();
            Notification.success('تم إنشاء جميع الأوراق بنجاح');
        } catch (error) {
            Loading.hide();
            Utils.safeError('فشل إنشاء الأوراق:', error);
            Notification.error('فشل إنشاء الأوراق: ' + error.message);
        }
    },

    async generateReport(type) {
        Loading.show();
        try {
            await Reports.generateAndExport(type);
            Loading.hide();
            Notification.success('تم إنشاء التقرير بنجاح');
        } catch (error) {
            Loading.hide();
            Notification.error('فشل إنشاء التقرير: ' + error.message);
        }
    },

    removeNotificationEmail(index) {
        if (AppState.notificationEmails && AppState.notificationEmails[index]) {
            AppState.notificationEmails.splice(index, 1);
            // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }
            this.load(); // إعادة تحميل الإعدادات لعرض القائمة المحدثة
        }
    },

    setupSettingsListeners() {
        setTimeout(() => {
            // حفظ إعدادات التاريخ      
            const saveDateBtn = document.getElementById('save-date-format-btn');
            if (saveDateBtn) {
                saveDateBtn.addEventListener('click', () => {
                    const dateFormat = document.getElementById('date-format-select').value;
                    AppState.dateFormat = dateFormat;
                    // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }
                    Notification.success('تم حفظ إعدادات التاريخ بنجاح');
                });
            }

            // إضافة إيميل للإشعارات
            const addEmailBtn = document.getElementById('add-notification-email-btn');
            const emailInput = document.getElementById('notification-email-input');
            if (addEmailBtn && emailInput) {
                addEmailBtn.addEventListener('click', () => {
                    const email = emailInput.value.trim().toLowerCase();
                    if (!email || !Utils.isValidEmail(email)) {
                        Notification.error('يرجى إدخال إيميل صحيح');
                        return;
                    }

                    if (!AppState.notificationEmails) {
                        AppState.notificationEmails = [];
                    }

                    if (AppState.notificationEmails.includes(email)) {
                        Notification.warning('الإيميل مسجل مسبقاً');
                        return;
                    }

                    AppState.notificationEmails.push(email);
                    emailInput.value = '';

                    const list = document.getElementById('notification-emails-list');
                    if (list) {
                        const emailDiv = document.createElement('div');
                        emailDiv.className = 'flex items-center gap-2 p-2 border rounded bg-gray-50';
                        emailDiv.innerHTML = `
                            <span class="flex-1">${Utils.escapeHTML(email)}</span>
                            <button type="button" onclick="Settings.removeNotificationEmail(${AppState.notificationEmails.length - 1})" class="text-red-600 hover:text-red-800">
                                <i class="fas fa-times"></i>
                            </button>
                        `;
                        list.appendChild(emailDiv);
                    }
                });
            }

            // حفظ قائمة الإيميلات
            const saveEmailsBtn = document.getElementById('save-notification-emails-btn');
            if (saveEmailsBtn) {
                saveEmailsBtn.addEventListener('click', () => {
                    // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }
                    Notification.success('تم حفظ قائمة الإيميلات بنجاح');
                });
            }

            // رفع شعار الشركة
            const uploadLogoBtn = document.getElementById('upload-logo-btn');
            const logoInput = document.getElementById('company-logo-input');
            if (uploadLogoBtn && logoInput) {
                uploadLogoBtn.addEventListener('click', () => {
                    const file = logoInput.files[0];
                    if (!file) {
                        Notification.error('يرجى اختيار صورة');
                        return;
                    }

                    if (file.size > 2 * 1024 * 1024) {
                        Notification.error('حجم الصورة يجب ألا يتجاوز 2MB');
                        return;
                    }

                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        let logoDataUrl = e.target.result;
                        
                        // ✅ ضغط الصورة لتقليل الحجم (للتأكد من أن base64 string أقل من 50,000 حرف)
                        try {
                            logoDataUrl = await Settings.compressLogo(logoDataUrl);
                            Utils.safeLog('✅ تم ضغط الشعار (الحجم النهائي: ' + logoDataUrl.length + ' حرف)');
                        } catch (compressError) {
                            Utils.safeWarn('⚠️ فشل ضغط الشعار، سيتم استخدام الصورة الأصلية:', compressError);
                            // في حالة الفشل، نستخدم الصورة الأصلية
                        }
                        
                        AppState.companyLogo = logoDataUrl;
                        // تحديث الشعار في AppState.companySettings أيضاً
                        if (!AppState.companySettings) {
                            AppState.companySettings = {};
                        }
                        AppState.companySettings.logo = logoDataUrl;
                        // حفظ الشعار في localStorage للمزامنة مع favicon
                        localStorage.setItem('company_logo', logoDataUrl);
                        localStorage.setItem('hse_company_logo', logoDataUrl);
                        // حفظ إعدادات الشركة (بما في ذلك الشعار) في localStorage
                        if (typeof window.DataManager !== 'undefined' && window.DataManager.saveCompanySettings) {
                            window.DataManager.saveCompanySettings();
                        }
                        // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }

                        // حفظ الشعار في قاعدة البيانات
                        if (typeof Utils !== 'undefined' && typeof Utils.hasCloudBackendSync === 'function' && Utils.hasCloudBackendSync() && typeof Backend !== 'undefined') {
                            try {
                                const userData = AppState.currentUser || {};
                                const result = await Backend.sendToAppsScript('saveCompanySettings', {
                                    name: AppState.companySettings?.name || '',
                                    secondaryName: AppState.companySettings?.secondaryName || '',
                                    formVersion: AppState.companySettings?.formVersion || '1.0',
                                    nameFontSize: AppState.companySettings?.nameFontSize || 16,
                                    secondaryNameFontSize: AppState.companySettings?.secondaryNameFontSize || 14,
                                    secondaryNameColor: AppState.companySettings?.secondaryNameColor || '#6B7280',
                                    clinicMonthlyVisitsAlertThreshold: AppState.companySettings?.clinicMonthlyVisitsAlertThreshold ?? 10,
                                    address: AppState.companySettings?.address || '',
                                    phone: AppState.companySettings?.phone || '',
                                    email: AppState.companySettings?.email || '',
                                    logo: logoDataUrl,
                                    postLoginItems: typeof AppState.companySettings?.postLoginItems === 'string' ? AppState.companySettings.postLoginItems : JSON.stringify(AppState.companySettings?.postLoginItems || []),
                                    userData: {
                                        email: userData.email,
                                        name: userData.name,
                                        role: userData.role,
                                        permissions: userData.permissions
                                    }
                                });

                                if (result && result.success) {
                                    Utils.safeLog('✅ تم حفظ الشعار في قاعدة البيانات بنجاح');
                                } else {
                                    Utils.safeWarn('⚠️ فشل حفظ الشعار في قاعدة البيانات:', result?.message);
                                }
                            } catch (error) {
                                Utils.safeWarn('⚠️ خطأ أثناء حفظ الشعار في قاعدة البيانات:', error);
                            }
                        }

                        // تحديث العرض
                        const preview = document.getElementById('company-logo-preview');
                        if (preview) {
                            preview.src = AppState.companyLogo;
                            preview.style.display = 'block';
                        }

                        // تحديث الهيدر
                        if (typeof UI !== 'undefined' && UI.updateCompanyLogoHeader) {
                            UI.updateCompanyLogoHeader();
                        }
                        if (typeof UI !== 'undefined' && UI.updateDashboardLogo) {
                            UI.updateDashboardLogo();
                        }
                        if (typeof UI !== 'undefined' && UI.updateLoginLogo) {
                            UI.updateLoginLogo();
                        }

                        // إرسال حدث لتحديث favicon
                        window.dispatchEvent(new CustomEvent('companyLogoUpdated', { detail: { logoUrl: logoDataUrl } }));

                        Notification.success('تم رفع الشعار بنجاح');
                    };
                    reader.readAsDataURL(file);
                });
            }

            // إزالة شعار الشركة
            const removeLogoBtn = document.getElementById('remove-logo-btn');
            if (removeLogoBtn) {
                removeLogoBtn.addEventListener('click', async () => {
                    AppState.companyLogo = '';
                    // إزالة الشعار من AppState.companySettings أيضاً
                    if (AppState.companySettings) {
                        AppState.companySettings.logo = '';
                    }
                    // إزالة الشعار من localStorage
                    localStorage.removeItem('company_logo');
                    localStorage.removeItem('hse_company_logo');
                    // حفظ إعدادات الشركة (بما في ذلك الشعار) في localStorage
                    if (typeof window.DataManager !== 'undefined' && window.DataManager.saveCompanySettings) {
                        window.DataManager.saveCompanySettings();
                    }
                    // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }

                    // حفظ إزالة الشعار في قاعدة البيانات
                    if (typeof Utils !== 'undefined' && typeof Utils.hasCloudBackendSync === 'function' && Utils.hasCloudBackendSync() && typeof Backend !== 'undefined') {
                        try {
                            const userData = AppState.currentUser || {};
                            const result = await Backend.sendToAppsScript('saveCompanySettings', {
                                name: AppState.companySettings?.name || '',
                                secondaryName: AppState.companySettings?.secondaryName || '',
                                formVersion: AppState.companySettings?.formVersion || '1.0',
                                nameFontSize: AppState.companySettings?.nameFontSize || 16,
                                secondaryNameFontSize: AppState.companySettings?.secondaryNameFontSize || 14,
                                secondaryNameColor: AppState.companySettings?.secondaryNameColor || '#6B7280',
                                clinicMonthlyVisitsAlertThreshold: AppState.companySettings?.clinicMonthlyVisitsAlertThreshold ?? 10,
                                address: AppState.companySettings?.address || '',
                                phone: AppState.companySettings?.phone || '',
                                email: AppState.companySettings?.email || '',
                                logo: '',
                                postLoginItems: typeof AppState.companySettings?.postLoginItems === 'string' ? AppState.companySettings.postLoginItems : JSON.stringify(AppState.companySettings?.postLoginItems || []),
                                userData: {
                                    email: userData.email,
                                    name: userData.name,
                                    role: userData.role,
                                    permissions: userData.permissions
                                }
                            });

                            if (result && result.success) {
                                Utils.safeLog('✅ تم حذف الشعار من قاعدة البيانات بنجاح');
                            } else {
                                Utils.safeWarn('⚠️ فشل حذف الشعار من قاعدة البيانات:', result?.message);
                            }
                        } catch (error) {
                            Utils.safeWarn('⚠️ خطأ أثناء حذف الشعار من قاعدة البيانات:', error);
                        }
                    }

                    const preview = document.getElementById('company-logo-preview');
                    if (preview) {
                        preview.style.display = 'none';
                    }

                    if (typeof UI !== 'undefined' && UI.updateCompanyLogoHeader) {
                        UI.updateCompanyLogoHeader();
                    }
                    if (typeof UI !== 'undefined' && UI.updateLoginLogo) {
                        UI.updateLoginLogo();
                    }

                    // إرسال حدث لتحديث favicon
                    window.dispatchEvent(new CustomEvent('companyLogoUpdated', { detail: { logoUrl: '' } }));

                    Notification.success('تم إزالة الشعار بنجاح');
                    this.load();
                });
            }
        }, 100);
    }
};
// ===== Export module to global scope =====
// تصدير الموديول إلى window فوراً لضمان توافره
(function () {
    'use strict';
    try {
        if (typeof window !== 'undefined' && typeof Settings !== 'undefined') {
            window.Settings = Settings;
            
            // إشعار عند تحميل الموديول بنجاح
            if (typeof AppState !== 'undefined' && AppState.debugMode && typeof Utils !== 'undefined' && Utils.safeLog) {
                Utils.safeLog('✅ Settings module loaded and available on window.Settings');
            }
        }
    } catch (error) {
        console.error('❌ خطأ في تصدير Settings:', error);
        // محاولة التصدير مرة أخرى حتى في حالة الخطأ
        if (typeof window !== 'undefined' && typeof Settings !== 'undefined') {
            try {
                window.Settings = Settings;
            } catch (e) {
                console.error('❌ فشل تصدير Settings:', e);
            }
        }
    }
})();