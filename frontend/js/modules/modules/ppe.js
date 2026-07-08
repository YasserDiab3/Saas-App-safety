/**
 * PPE Module
 * ØªÙ… Ø§Ø³ØªØ®Ø±Ø§Ø¬Ù‡ Ù…Ù† app-modules.js
 */
const PPE = {
    state: {
        activeTab: 'receipts', // receipts, stock-control, analysis
        isSwitchingTab: false, // منع التبديل المتزامن
        eventListeners: new Map(), // تتبع مستمعي الأحداث للتنظيف
        stockItemsCache: null, // Cache لبيانات المخزون
        stockItemsCacheTime: null, // وقت التخزين المؤقت
        stockCacheExpiry: 5 * 60 * 1000, // انتهاء صلاحية Cache بعد 5 دقائق
        ppeItemsListCache: null, // Cache لقائمة الأصناف في المنسدلة
        ppeItemsListCacheTime: null, // وقت تحديث قائمة الأصناف
        ppeItemsListCacheExpiry: 2 * 60 * 1000, // انتهاء صلاحية القائمة بعد دقيقتين
        ppeItemsBalanceMap: null, // خريطة اسم الصنف → الرصيد
        ppeItemsOptionsHTML: '', // HTML options معاد استخدامه عند إضافة صفوف
        /** رسالة مختصرة عند تعذّر الجلب وبقاء المعروض من الكاش */
        stockStaleWarningMsg: '',
        /** رسالة خطأ صريحة عند عدم وجود أي بيانات مخزونة بعد الفشل (timeout/شبكة) */
        stockLoadHardErrorMsg: '',
        lastSyncTime: null, // وقت آخر مزامنة
        /** فلاتر سجل الاستلامات (نفس نمط سجل التردد / المستندات القانونية) */
        filters: {
            receipts: {
                search: '',
                equipmentType: '',
                status: '',
                dateFrom: '',
                dateTo: ''
            },
            // فلاتر جدول المخزون (نفس نمط فلاتر سجل الاستلامات)
            stock: {
                search: '',
                category: '',
                supplier: '',
                status: '', // '', 'available', 'low'
                dateFrom: '',
                dateTo: ''
            }
        }
    },

    _t(key, fallback) {
        if (window.AppI18n && typeof window.AppI18n.t === 'function') {
            return window.AppI18n.t(key, fallback);
        }
        if (window.I18n && typeof window.I18n.t === 'function') {
            return window.I18n.t(key, fallback);
        }
        return fallback;
    },

    applyModuleI18n(root) {
        const el = root && root.nodeType ? root : document.getElementById('ppe-section');
        if (!el) return;
        const i18n = (window.AppI18n && typeof window.AppI18n.applyModuleI18n === 'function')
            ? window.AppI18n
            : ((window.I18n && typeof window.I18n.applyModuleI18n === 'function') ? window.I18n : null);
        if (i18n) i18n.applyModuleI18n(el);
    },

    ensurePpeFilterStyles() {
        if (document.getElementById('ppe-module-filter-styles')) return;
        const style = document.createElement('style');
        style.id = 'ppe-module-filter-styles';
        style.textContent = `
            .ppe-visits-filters-row { position: relative; }
            .ppe-visits-filters-row .filters-grid { width: 100%; }
            .ppe-visits-filters-row .filter-field { display: flex; flex-direction: column; gap: 6px; }
            .ppe-visits-filters-row .filter-label {
                font-size: 12px; font-weight: 600; color: #4a5568; text-transform: uppercase;
                letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;
            }
            .ppe-visits-filters-row .filter-label i { font-size: 11px; color: #667eea; }
            .ppe-visits-filters-row .filter-input {
                width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px;
                background: white; font-size: 14px; color: #2d3748; transition: all 0.2s ease;
                box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            }
            .ppe-visits-filters-row .filter-input:focus {
                outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            .ppe-visits-filters-row .filter-reset-btn {
                width: 100%; padding: 10px 16px; min-height: 42px; border-radius: 12px;
                border: 1px solid #cbd5e1; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
                color: #0f172a; font-weight: 700; font-size: 13px; cursor: pointer; transition: all 0.2s ease;
                display: flex; align-items: center; justify-content: center; gap: 4px;
            }
            .ppe-visits-filters-row .filter-reset-btn:hover {
                transform: translateY(-1px); box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12);
            }
            .ppe-visits-filters-row .filter-count-badge {
                display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 20px;
                padding: 2px 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white; border-radius: 12px; font-size: 11px; font-weight: 700; margin-inline-start: 4px;
            }
        `;
        document.head.appendChild(style);
    },

    getDisplayStatus(status) {
        const s = String(status || '').trim();
        if (s === 'مستلم') return this._t('module.ppe.status.received', 'مستلم');
        if (s === 'قيد التسليم') return this._t('module.ppe.status.pending', 'قيد التسليم');
        return s || '—';
    },

    isStatusReceived(status) {
        return String(status || '').trim() === 'مستلم';
    },

    getFilteredPpeReceipts(ppeList) {
        const list = Array.isArray(ppeList) ? ppeList : [];
        const f = this.state.filters?.receipts || {};
        const search = (f.search || '').trim().toLowerCase();
        const type = f.equipmentType || '';
        const status = f.status || '';
        const from = f.dateFrom ? new Date(f.dateFrom + 'T00:00:00') : null;
        const to = f.dateTo ? new Date(f.dateTo + 'T23:59:59.999') : null;
        if (from && isNaN(from.getTime())) return list;
        if (to && isNaN(to.getTime())) return list;

        return list.filter((item) => {
            if (type && String(item.equipmentType || '') !== type) return false;
            if (status && String(item.status || '') !== status) return false;
            if (from || to) {
                if (!item.receiptDate) return false;
                const rd = new Date(item.receiptDate);
                if (isNaN(rd.getTime())) return false;
                if (from && rd < from) return false;
                if (to && rd > to) return false;
            }
            if (search) {
                const hay = [
                    item.receiptNumber, item.id, item.employeeName, item.employeeCode, item.employeeNumber,
                    item.equipmentType, item.status, item.employeeDepartment
                ].map((x) => String(x || '').toLowerCase()).join(' | ');
                if (!hay.includes(search)) return false;
            }
            return true;
        });
    },

    hasActiveReceiptFilters() {
        const f = this.state.filters?.receipts || {};
        return !!(f.search || f.equipmentType || f.status || f.dateFrom || f.dateTo);
    },

    resetReceiptFilters() {
        if (!this.state.filters) this.state.filters = {};
        this.state.filters.receipts = {
            search: '',
            equipmentType: '',
            status: '',
            dateFrom: '',
            dateTo: ''
        };
    },

    // ====== فلاتر جدول المخزون (نفس نمط فلاتر الاستلامات) ======

    /** تطبيق الفلاتر على قائمة الأصناف */
    getFilteredStockItems(stockItems) {
        const list = Array.isArray(stockItems) ? stockItems : [];
        const f = (this.state.filters && this.state.filters.stock) || {};
        const search = (f.search || '').trim().toLowerCase();
        const category = f.category || '';
        const supplier = f.supplier || '';
        const status = f.status || '';
        const from = f.dateFrom ? new Date(f.dateFrom + 'T00:00:00') : null;
        const to = f.dateTo ? new Date(f.dateTo + 'T23:59:59.999') : null;
        if (from && isNaN(from.getTime())) return list;
        if (to && isNaN(to.getTime())) return list;

        return list.filter((item) => {
            if (!item) return false;
            if (category && String(item.category || '') !== category) return false;
            if (supplier && String(item.supplier || '') !== supplier) return false;
            if (status) {
                const balance = parseFloat(item.balance || 0);
                const minThreshold = parseFloat(item.minThreshold || 0);
                const isLow = balance < minThreshold;
                if (status === 'low' && !isLow) return false;
                if (status === 'available' && isLow) return false;
            }
            if (from || to) {
                if (!item.lastUpdate) return false;
                const rd = new Date(item.lastUpdate);
                if (isNaN(rd.getTime())) return false;
                if (from && rd < from) return false;
                if (to && rd > to) return false;
            }
            if (search) {
                const hay = [
                    item.itemCode, item.itemName, item.category, item.supplier
                ].map((x) => String(x || '').toLowerCase()).join(' | ');
                if (!hay.includes(search)) return false;
            }
            return true;
        });
    },

    hasActiveStockFilters() {
        const f = (this.state.filters && this.state.filters.stock) || {};
        return !!(f.search || f.category || f.supplier || f.status || f.dateFrom || f.dateTo);
    },

    resetStockFilters() {
        if (!this.state.filters) this.state.filters = {};
        this.state.filters.stock = {
            search: '',
            category: '',
            supplier: '',
            status: '',
            dateFrom: '',
            dateTo: ''
        };
    },

    /** بناء صف فلاتر جدول المخزون (نفس نمط ppe-visits-filters-row) */
    buildStockFilterRow(stockItems) {
        const t = (k, f) => this._t(k, f);
        const esc = (v) => Utils.escapeHTML(v);
        this.ensurePpeFilterStyles();
        const items = Array.isArray(stockItems) ? stockItems : [];
        const filters = (this.state.filters && this.state.filters.stock) || {};
        const filtered = this.getFilteredStockItems(items);
        const isRTL = typeof document !== 'undefined'
            && (document.documentElement.getAttribute('dir') === 'rtl'
                || (window.AppI18n && window.AppI18n.getCurrentLang && window.AppI18n.getCurrentLang() === 'ar'));

        const uniqueCategories = [...new Set(items.map(it => it && it.category).filter(Boolean))].sort();
        const uniqueSuppliers = [...new Set(items.map(it => it && it.supplier).filter(Boolean))].sort();

        return `
            <div class="ppe-visits-filters-row visits-filters-row" style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 16px 20px; margin: 0 0 14px 0; width: 100%; direction: ${isRTL ? 'rtl' : 'ltr'}; border-radius: 10px;">
                <div class="filters-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; align-items: end;">
                    <div class="filter-field" style="min-width: 180px;">
                        <label class="filter-label" for="ppe-stock-search">
                            <i class="fas fa-search ml-1"></i>${esc(t('module.ppe.filter.search', 'بحث'))}
                        </label>
                        <input type="text" id="ppe-stock-search" class="form-input pr-10 filter-input" placeholder="${esc(t('module.ppe.stock.filter.searchPlaceholder', 'كود/اسم/فئة/مورد'))}" value="${esc(filters.search || '')}">
                    </div>
                    <div class="filter-field" style="min-width: 160px;">
                        <label class="filter-label" for="ppe-stock-filter-category">
                            <i class="fas fa-tags ml-1"></i>${esc(t('module.ppe.stock.category', 'الفئة'))}
                            ${filters.category ? `<span class="filter-count-badge" title="${esc(t('module.ppe.filter.badgeCount', ''))}">${filtered.length}</span>` : ''}
                        </label>
                        <select id="ppe-stock-filter-category" class="form-input filter-input">
                            <option value="">${esc(t('module.common.all', 'الكل'))}</option>
                            ${uniqueCategories.map((c) => `<option value="${esc(c)}" ${filters.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="filter-field" style="min-width: 160px;">
                        <label class="filter-label" for="ppe-stock-filter-supplier">
                            <i class="fas fa-truck ml-1"></i>${esc(t('module.ppe.stock.supplier', 'المورد'))}
                            ${filters.supplier ? `<span class="filter-count-badge" title="${esc(t('module.ppe.filter.badgeCount', ''))}">${filtered.length}</span>` : ''}
                        </label>
                        <select id="ppe-stock-filter-supplier" class="form-input filter-input">
                            <option value="">${esc(t('module.common.all', 'الكل'))}</option>
                            ${uniqueSuppliers.map((s) => `<option value="${esc(s)}" ${filters.supplier === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="filter-field" style="min-width: 160px;">
                        <label class="filter-label" for="ppe-stock-filter-status">
                            <i class="fas fa-signal ml-1"></i>${esc(t('module.ppe.table.status', 'الحالة'))}
                            ${filters.status ? `<span class="filter-count-badge" title="${esc(t('module.ppe.filter.badgeCount', ''))}">${filtered.length}</span>` : ''}
                        </label>
                        <select id="ppe-stock-filter-status" class="form-input filter-input">
                            <option value="">${esc(t('module.common.all', 'الكل'))}</option>
                            <option value="available" ${filters.status === 'available' ? 'selected' : ''}>${esc(t('module.ppe.status.available', 'متوفر'))}</option>
                            <option value="low" ${filters.status === 'low' ? 'selected' : ''}>${esc(t('module.ppe.status.lowStock', 'مخزون منخفض'))}</option>
                        </select>
                    </div>
                    <div class="filter-field">
                        <label class="filter-label" for="ppe-stock-date-from"><i class="fas fa-calendar-alt ml-1"></i>${esc(t('module.ppe.stock.filter.dateFrom', 'من تاريخ آخر تحديث'))}</label>
                        <input type="date" id="ppe-stock-date-from" class="form-input filter-input" value="${esc(filters.dateFrom || '')}">
                    </div>
                    <div class="filter-field">
                        <label class="filter-label" for="ppe-stock-date-to"><i class="fas fa-calendar-check ml-1"></i>${esc(t('module.ppe.stock.filter.dateTo', 'إلى تاريخ آخر تحديث'))}</label>
                        <input type="date" id="ppe-stock-date-to" class="form-input filter-input" value="${esc(filters.dateTo || '')}">
                    </div>
                    <div class="filter-field" style="min-width: 170px;">
                        <button type="button" id="ppe-stock-reset-filters" class="filter-reset-btn" title="${esc(t('module.ppe.filter.resetTitle', ''))}">
                            <i class="fas fa-rotate-left ml-1"></i>${esc(t('module.ppe.filter.reset', 'إعادة تعيين الفلاتر'))}
                        </button>
                    </div>
                </div>
            </div>`;
    },

    /**
     * محتوى سجل الاستلامات: فلاتر ديناميكية + جدول (نفس نمط visits-filters-row)
     */
    buildPPEListHtml() {
        const t = (k, f) => this._t(k, f);
        this.ensurePpeFilterStyles();
        const ppeList = AppState.appData.ppe || [];
        const filters = this.state.filters?.receipts || {};
        const filtered = this.getFilteredPpeReceipts(ppeList);
        const hasFilters = this.hasActiveReceiptFilters();
        const isRTL = typeof document !== 'undefined'
            && (document.documentElement.getAttribute('dir') === 'rtl'
                || (window.AppI18n && window.AppI18n.getCurrentLang && window.AppI18n.getCurrentLang() === 'ar'));
        const esc = (v) => Utils.escapeHTML(v);

        if (ppeList.length === 0) {
            return `<div class="empty-state"><p class="text-gray-500">${esc(t('module.ppe.empty.noReceipts', 'لا توجد استلامات مسجلة'))}</p></div>`;
        }

        const uniqueTypes = [...new Set(ppeList.map(p => p.equipmentType).filter(Boolean))].sort();
        const uniqueStatuses = ['مستلم', 'قيد التسليم'];

        const filterRow = `
            <div class="ppe-visits-filters-row visits-filters-row" style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 16px 20px; margin: 0 0 14px 0; width: 100%; direction: ${isRTL ? 'rtl' : 'ltr'};">
                <div class="filters-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; align-items: end;">
                    <div class="filter-field" style="min-width: 180px;">
                        <label class="filter-label" for="ppe-receipts-search">
                            <i class="fas fa-search ml-1"></i>${esc(t('module.ppe.filter.search', 'بحث'))}
                        </label>
                        <input type="text" id="ppe-receipts-search" class="form-input pr-10 filter-input" placeholder="${esc(t('module.ppe.filter.searchPlaceholder', ''))}" value="${esc(filters.search || '')}">
                    </div>
                    <div class="filter-field" style="min-width: 160px;">
                        <label class="filter-label" for="ppe-receipts-filter-type">
                            <i class="fas fa-hard-hat ml-1"></i>${esc(t('module.ppe.filter.equipmentType', 'نوع المعدة'))}
                            ${filters.equipmentType ? `<span class="filter-count-badge" title="${esc(t('module.ppe.filter.badgeCount', ''))}">${filtered.length}</span>` : ''}
                        </label>
                        <select id="ppe-receipts-filter-type" class="form-input filter-input">
                            <option value="">${esc(t('module.common.all', 'الكل'))}</option>
                            ${uniqueTypes.map((typ) => `<option value="${esc(typ)}" ${filters.equipmentType === typ ? 'selected' : ''}>${esc(typ)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="filter-field" style="min-width: 160px;">
                        <label class="filter-label" for="ppe-receipts-filter-status">
                            <i class="fas fa-signal ml-1"></i>${esc(t('module.ppe.filter.status', 'الحالة'))}
                            ${filters.status ? `<span class="filter-count-badge" title="${esc(t('module.ppe.filter.badgeCount', ''))}">${filtered.length}</span>` : ''}
                        </label>
                        <select id="ppe-receipts-filter-status" class="form-input filter-input">
                            <option value="">${esc(t('module.common.all', 'الكل'))}</option>
                            ${uniqueStatuses.map((st) => `<option value="${esc(st)}" ${filters.status === st ? 'selected' : ''}>${esc(this.getDisplayStatus(st))}</option>`).join('')}
                        </select>
                    </div>
                    <div class="filter-field">
                        <label class="filter-label" for="ppe-receipts-date-from"><i class="fas fa-calendar-alt ml-1"></i>${esc(t('module.ppe.filter.dateFrom', 'من تاريخ الاستلام'))}</label>
                        <input type="date" id="ppe-receipts-date-from" class="form-input filter-input" value="${esc(filters.dateFrom || '')}">
                    </div>
                    <div class="filter-field">
                        <label class="filter-label" for="ppe-receipts-date-to"><i class="fas fa-calendar-check ml-1"></i>${esc(t('module.ppe.filter.dateTo', 'إلى تاريخ الاستلام'))}</label>
                        <input type="date" id="ppe-receipts-date-to" class="form-input filter-input" value="${esc(filters.dateTo || '')}">
                    </div>
                    <div class="filter-field" style="min-width: 170px;">
                        <button type="button" id="ppe-receipts-reset-filters" class="filter-reset-btn" title="${esc(t('module.ppe.filter.resetTitle', ''))}">
                            <i class="fas fa-rotate-left ml-1"></i>${esc(t('module.ppe.filter.reset', 'إعادة تعيين الفلاتر'))}
                        </button>
                    </div>
                </div>
            </div>`;

        const noMatchBlock = (hasFilters && filtered.length === 0) ? `
            <div class="empty-state">
                <i class="fas fa-filter text-4xl text-gray-300 mb-4"></i>
                <p class="text-gray-500 mb-2">${esc(t('module.ppe.filter.noMatch', 'لا توجد نتائج مطابقة'))}</p>
                <button type="button" id="ppe-receipts-clear-empty-filters" class="btn-secondary mt-2">
                    <i class="fas fa-undo-alt ml-2"></i>${esc(t('module.ppe.filter.clearEmpty', 'مسح الفلاتر'))}
                </button>
            </div>
        ` : '';

        if (filtered.length === 0) {
            return this._buildExcelToolbarHtml('receipts') + filterRow + noMatchBlock;
        }

        const viewTitle = t('module.common.view', 'عرض');
        const pdfT = t('module.kpi.exportPDF', 'تصدير PDF');
        const editTitle = t('module.common.edit', 'تعديل');
        const delTitle = t('module.ppe.btn.deleteReceipt', 'حذف');
        const table = `
            <table class="data-table table-header-blue">
                <thead>
                    <tr>
                        <th>${esc(t('module.ppe.table.receiptNo', 'رقم الإيصال'))}</th>
                        <th>${esc(t('module.ppe.table.employeeName', 'اسم الموظف'))}</th>
                        <th>${esc(t('module.ppe.table.employeeCode', 'الكود الوظيفي'))}</th>
                        <th>${esc(t('module.ppe.table.equipmentType', 'نوع المعدة'))}</th>
                        <th>${esc(t('module.ppe.table.quantity', 'الكمية'))}</th>
                        <th>${esc(t('module.ppe.table.receiptDate', 'تاريخ الاستلام'))}</th>
                        <th>${esc(t('module.ppe.table.status', 'الحالة'))}</th>
                        <th>${esc(t('module.ppe.table.actions', 'الإجراءات'))}</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map((item) => {
            const stDisp = this.getDisplayStatus(item.status);
            const idJs = String(item.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `
                        <tr>
                            <td class="font-mono font-semibold">${esc(item.receiptNumber || item.id || '')}</td>
                            <td>${esc(item.employeeName || '')}</td>
                            <td>${esc(item.employeeCode || item.employeeNumber || '')}</td>
                            <td>
                                ${esc(item.equipmentType || '')}
                                ${item.shoeSize ? `<span class="block text-[11px] text-blue-600 font-semibold mt-0.5"><i class="fas fa-shoe-prints ml-1 text-[10px]"></i>مقاس: ${esc(item.shoeSize)}</span>` : ''}
                            </td>
                            <td>${item.quantity || 0}</td>
                            <td>${item.receiptDate ? Utils.formatDate(item.receiptDate) : '-'}</td>
                            <td>
                                <span class="badge badge-${this.isStatusReceived(item.status) ? 'success' : 'warning'}">
                                    ${esc(stDisp)}
                                </span>
                            </td>
                            <td>
                                <div class="flex items-center gap-2">
                                    <button onclick="PPE.viewPPE('${idJs}')" class="btn-icon btn-icon-info" title="${esc(viewTitle)}">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button onclick="PPE.exportPDF('${idJs}')" class="btn-icon btn-icon-success" title="${esc(pdfT)}">
                                        <i class="fas fa-file-pdf"></i>
                                    </button>
                                    <button onclick="PPE.showPPEForm(${JSON.stringify(item).replace(/"/g, '&quot;')});" class="btn-icon btn-icon-primary" title="${esc(editTitle)}">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button onclick="PPE.deletePPE('${idJs}')" class="btn-icon btn-icon-danger" title="${esc(delTitle)}">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>`;
        }).join('')}
                </tbody>
            </table>
        `;

        return this._buildExcelToolbarHtml('receipts') + filterRow + table;
    },

    _receiptsFilterTimer: null,

    refreshReceiptsListUI() {
        const container = document.getElementById('ppe-list');
        if (!container) return;
        container.innerHTML = this.buildPPEListHtml();
        this.applyModuleI18n(container);
        this.bindReceiptsFilters();
    },

    bindReceiptsFilters() {
        if (this.state.activeTab !== 'receipts') return;
        const run = (fn) => {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(fn);
            } else {
                setTimeout(fn, 0);
            }
        };
        const search = document.getElementById('ppe-receipts-search');
        if (search) {
            const h = (e) => {
                this.state.filters.receipts.search = (e.target && e.target.value) || '';
                clearTimeout(this._receiptsFilterTimer);
                this._receiptsFilterTimer = setTimeout(() => run(() => this.refreshReceiptsListUI()), 220);
            };
            search.addEventListener('input', h);
        }
        const typeEl = document.getElementById('ppe-receipts-filter-type');
        if (typeEl) {
            typeEl.addEventListener('change', (e) => {
                this.state.filters.receipts.equipmentType = (e.target && e.target.value) || '';
                this.refreshReceiptsListUI();
            });
        }
        const statusEl = document.getElementById('ppe-receipts-filter-status');
        if (statusEl) {
            statusEl.addEventListener('change', (e) => {
                this.state.filters.receipts.status = (e.target && e.target.value) || '';
                this.refreshReceiptsListUI();
            });
        }
        const fromEl = document.getElementById('ppe-receipts-date-from');
        if (fromEl) {
            fromEl.addEventListener('change', (e) => {
                this.state.filters.receipts.dateFrom = (e.target && e.target.value) || '';
                this.refreshReceiptsListUI();
            });
        }
        const toEl = document.getElementById('ppe-receipts-date-to');
        if (toEl) {
            toEl.addEventListener('change', (e) => {
                this.state.filters.receipts.dateTo = (e.target && e.target.value) || '';
                this.refreshReceiptsListUI();
            });
        }
        const resetEl = document.getElementById('ppe-receipts-reset-filters');
        if (resetEl) {
            resetEl.addEventListener('click', () => {
                this.resetReceiptFilters();
                this.refreshReceiptsListUI();
            });
        }
        const clearEmpty = document.getElementById('ppe-receipts-clear-empty-filters');
        if (clearEmpty) {
            clearEmpty.addEventListener('click', () => {
                this.resetReceiptFilters();
                this.refreshReceiptsListUI();
            });
        }
    },

    /**
     * ✅ مسح Cache لتحديث البيانات بعد المزامنة
     * يتم استدعاؤها من RealtimeSyncManager عند تحديث البيانات
     */
    clearCache() {
        // ✅ حفظ البيانات الحالية في AppState قبل مسح Cache
        if (this.state.stockItemsCache) {
            AppState.appData.ppeStock = this.state.stockItemsCache;
            // ✅ حفظ في localStorage أيضاً
            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }
        }
        
        this.state.stockItemsCache = null;
        this.state.stockItemsCacheTime = null;
        this._stockLoadInflightPromise = null;
        this.state.lastSyncTime = Date.now();
        Utils.safeLog('🔄 PPE: تم مسح Cache لتحديث البيانات');
    },

    /**
     * ✅ تحميل البيانات مسبقاً في الخلفية
     * يتم استدعاؤها عند تحميل المديول لضمان توفر البيانات
     */
    async preloadData() {
        try {
            // تحميل بيانات الاستلامات
            if (typeof Backend !== 'undefined' && Backend.sendToAppsScript) {
                try {
                    const ppeResult = await Backend.sendToAppsScript('getAllPPE', {});
                    if (ppeResult && ppeResult.success && Array.isArray(ppeResult.data)) {
                        AppState.appData.ppe = ppeResult.data;
                        // ✅ حفظ البيانات في localStorage للاستخدام لاحقاً
                        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                            window.DataManager.save();
                        }
                    }
                } catch (error) {
                    Utils.safeWarn('⚠️ خطأ في تحميل بيانات الاستلامات:', error);
                }
            }

            // تحميل بيانات المخزون (فقط إذا كان التبويب النشط هو stock-control)
            if (this.state.activeTab === 'stock-control') {
                await this.loadStockItems(true); // forceRefresh = true
            }
        } catch (error) {
            Utils.safeError('❌ خطأ في preloadData:', error);
        }
    },

    /**
     * ✅ عرض محتوى التبويب مع البيانات المتوفرة (fallback)
     * يُستخدم في حالة timeout أو خطأ في التحميل
     */
    renderActiveTabContentWithFallback() {
        try {
            switch (this.state.activeTab) {
                case 'stock-control':
                    const stockItems = AppState.appData.ppeStock || [];
                    if (stockItems.length === 0) {
                        return `
                            <div class="empty-state">
                                <div style="width: 300px; margin: 0 auto 16px;">
                                    <div style="width: 100%; height: 6px; background: rgba(59, 130, 246, 0.2); border-radius: 3px; overflow: hidden;">
                                        <div style="height: 100%; background: linear-gradient(90deg, #3b82f6, #2563eb, #3b82f6); background-size: 200% 100%; border-radius: 3px; animation: loadingProgress 1.5s ease-in-out infinite;"></div>
                                    </div>
                                </div>
                                <p class="text-gray-500 mb-4">${this._t('module.ppe.loading.stockData', 'جاري تحميل بيانات المخزون...')}</p>
                            </div>
                        `;
                    }
                    // عرض البيانات المتوفرة
                    return `
                        <div class="space-y-6">
                            ${this.renderStockTableSync(stockItems)}
                        </div>
                    `;
                case 'receipts':
                default:
                    return this.renderPPEListSync();
            }
        } catch (error) {
            Utils.safeError('❌ خطأ في renderActiveTabContentWithFallback:', error);
            return `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>
                    <p class="text-gray-500 mb-4">${Utils.escapeHTML(this._t('module.ppe.empty.loadContentError', 'حدث خطأ أثناء تحميل المحتوى'))}</p>
                    <button onclick="PPE.load()" class="btn-primary">
                        <i class="fas fa-redo ml-2"></i>${Utils.escapeHTML(this._t('module.common.retry', 'إعادة المحاولة'))}
                    </button>
                </div>
            `;
        }
    },

    /**
     * ✅ عرض قائمة الاستلامات بشكل متزامن (بدون await)
     */
    renderPPEListSync() {
        return this.buildPPEListHtml();
    },

    /**
     * ✅ عرض جدول المخزون بشكل متزامن (بدون await)
     */
    renderStockTableSync(stockItems) {
        const t = (k, f) => this._t(k, f);
        const ut = (s) => Utils.escapeHTML(s);
        if (!stockItems || stockItems.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-box-open text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-500">${ut(t('module.ppe.empty.noStock', 'لا توجد أصناف في المخزون'))}</p>
                </div>
            `;
        }
        return `
            <div class="overflow-x-auto">
                <table class="data-table table-header-blue">
                    <thead>
                        <tr>
                            <th>${ut(t('module.ppe.stock.itemCode', 'كود الصنف'))}</th>
                            <th>${ut(t('module.ppe.stock.itemName', 'اسم الصنف'))}</th>
                            <th>${ut(t('module.ppe.stock.category', 'الفئة'))}</th>
                            <th>${ut(t('module.ppe.stock.in', 'الوارد'))}</th>
                            <th>${ut(t('module.ppe.stock.out', 'المنصرف'))}</th>
                            <th>${ut(t('module.ppe.stock.balance', 'الرصيد'))}</th>
                            <th>${ut(t('module.ppe.stock.reorder', 'حد إعادة الطلب'))}</th>
                            <th>${ut(t('module.ppe.stock.supplier', 'المورد'))}</th>
                            <th>${ut(t('module.ppe.table.actions', 'الإجراءات'))}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stockItems.map(item => {
                            const balance = parseFloat(item.balance || 0);
                            const minThreshold = parseFloat(item.minThreshold || 0);
                            const isLowStock = balance < minThreshold;
                            return `
                                <tr class="${isLowStock ? 'bg-red-50' : ''}">
                                    <td class="font-mono font-semibold">${Utils.escapeHTML(item.itemCode || '')}</td>
                                    <td>${Utils.escapeHTML(item.itemName || '')}</td>
                                    <td>${Utils.escapeHTML(item.category || '')}</td>
                                    <td class="text-green-600 font-semibold">${parseFloat(item.stock_IN || 0).toFixed(0)}</td>
                                    <td class="text-red-600 font-semibold">${parseFloat(item.stock_OUT || 0).toFixed(0)}</td>
                                    <td class="font-bold ${isLowStock ? 'text-red-600' : 'text-blue-600'}">${balance.toFixed(0)}</td>
                                    <td>${minThreshold.toFixed(0)}</td>
                                    <td>${Utils.escapeHTML(item.supplier || '')}</td>
                                    <td>
                                        <div class="flex items-center gap-2">
                                            <button onclick="PPE.editStockItem('${item.itemId}')" class="btn-icon btn-icon-warning" title="${ut(t('module.common.edit', 'تعديل'))}">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button onclick="PPE.deleteStockItem('${item.itemId}')" class="btn-icon btn-icon-danger" title="${ut(t('module.ppe.btn.deleteItem', 'حذف'))}">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    /**
     * ✅ تحديث التبويب النشط فقط دون إعادة تحميل الموديول بالكامل
     * يُستخدم بعد المزامنة لتحديث البيانات مباشرة
     */
    async refreshActiveTab(options = {}) {
        try {
            const skipRemote = !!options.skipRemote;
            console.log('[PPE DEBUG] refreshActiveTab called, activeTab:', this.state.activeTab);
            // ✅ مسح Cache لضمان تحميل البيانات الجديدة
            this.clearCache();
            
            const tabContentContainer = document.getElementById('ppe-tab-content');
            if (!tabContentContainer) {
                Utils.safeWarn('⚠️ PPE: لم يتم العثور على حاوية محتوى التبويب');
                return;
            }
            
            // ✅ تحميل البيانات الجديدة أولاً
            try {
                if (this.state.activeTab === 'stock-control') {
                    await this.loadStockItems(true); // forceRefresh = true
                } else {
                    if (skipRemote) {
                        // تحديث محلي فقط (يُستخدم مباشرة بعد الحفظ المحلي لتجنب فقدان السجل الجديد مؤقتاً)
                    } else {
                    // تحميل بيانات الاستلامات
                    if (typeof Backend !== 'undefined' && Backend.sendToAppsScript) {
                        try {
                            const ppeResult = await Backend.sendToAppsScript('getAllPPE', {});
                            if (ppeResult && ppeResult.success && Array.isArray(ppeResult.data)) {
                                AppState.appData.ppe = ppeResult.data;
                                // ✅ حفظ البيانات في localStorage
                                if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                                    window.DataManager.save();
                                }
                            }
                        } catch (error) {
                            Utils.safeWarn('⚠️ خطأ في تحميل بيانات الاستلامات:', error);
                        }
                    }
                    }
                }
            } catch (error) {
                Utils.safeWarn('⚠️ خطأ في تحميل البيانات أثناء refreshActiveTab:', error);
            }
            
            // عرض مؤشر تحميل خفيف (بدون overlay كامل)
            const originalContent = tabContentContainer.innerHTML;
            tabContentContainer.style.opacity = '0.6';
            tabContentContainer.style.pointerEvents = 'none';
            
            try {
                // ✅ تحميل محتوى التبويب الجديد بدون Loading overlay
                const newContent = await this.renderActiveTabContent(false);
                tabContentContainer.innerHTML = newContent;
                this.applyModuleI18n(tabContentContainer);
                if (this.state.activeTab === 'receipts') {
                    this.ensurePpeFilterStyles();
                    this.bindReceiptsFilters();
                    this._bindPpeReceiptExcelToolbar();
                } else if (this.state.activeTab === 'stock-control') {
                    this.ensurePpeFilterStyles();
                    this.bindStockFilters();
                    this._bindPpeStockExcelToolbar();
                }
                Utils.safeLog('✅ PPE: تم تحديث التبويب النشط بنجاح');
            } catch (error) {
                Utils.safeError('❌ PPE: خطأ في تحديث التبويب:', error);
                // استعادة المحتوى الأصلي في حالة الخطأ
                tabContentContainer.innerHTML = originalContent;
            } finally {
                tabContentContainer.style.opacity = '1';
                tabContentContainer.style.pointerEvents = 'auto';
            }
        } catch (error) {
            Utils.safeError('❌ PPE: خطأ في refreshActiveTab:', error);
        }
    },

    async load() {
        // Add language change listener
        if (!this._languageChangeListenerAdded) {
            document.addEventListener('language-changed', () => {
                this.load();
            });
            this._languageChangeListenerAdded = true;
        }

        const section = document.getElementById('ppe-section');
        if (!section) {
            if (typeof Utils !== 'undefined' && Utils.safeWarn) {
                Utils.safeWarn('⚠️ قسم ppe-section غير موجود');
            } else {
                console.warn('⚠️ قسم ppe-section غير موجود');
            }
            return;
        }

        // ✅ تحسين: التأكد من وجود البيانات الأساسية بشكل أسرع
        try {
            if (!AppState || !AppState.appData) {
                if (typeof Utils !== 'undefined' && Utils.safeWarn) {
                    Utils.safeWarn('⚠️ AppState غير جاهز - جاري الانتظار...');
                } else {
                    console.warn('⚠️ AppState غير جاهز - جاري الانتظار...');
                }
                await new Promise(resolve => {
                    let attempts = 0;
                    const maxAttempts = 50; // ✅ تقليل من 100 إلى 50 (2.5 ثانية بدلاً من 5)
                    const checkInterval = setInterval(() => {
                        attempts++;
                        if (AppState && AppState.appData) {
                            clearInterval(checkInterval);
                            resolve();
                        } else if (attempts >= maxAttempts) {
                            clearInterval(checkInterval);
                            if (!AppState) AppState = {};
                            if (!AppState.appData) AppState.appData = {};
                            resolve();
                        }
                    }, 50);
                });
            }
        } catch (error) {
            if (typeof Utils !== 'undefined' && Utils.safeWarn) {
                Utils.safeWarn('⚠️ خطأ في التحقق من AppState:', error);
            } else {
                console.warn('⚠️ خطأ في التحقق من AppState:', error);
            }
            if (!AppState) AppState = {};
            if (!AppState.appData) AppState.appData = {};
        }

        try {
            // ✅ تحسين: التأكد من وجود جميع البيانات المطلوبة
            if (!AppState.appData.ppe) {
                AppState.appData.ppe = [];
            }
            if (!AppState.appData.ppeStock) {
                AppState.appData.ppeStock = [];
            }

            // ✅ تحسين: تحميل البيانات مباشرة في الخلفية قبل عرض الواجهة
            const dataLoadPromise = this.preloadData();

            // ✅ تحسين: عرض الواجهة فوراً بالبيانات المتوفرة (إن وجدت)
            // هذا يضمن عدم وجود واجهة فارغة حتى لو فشل تحميل البيانات
            let tabContent = '';
            try {
                // محاولة تحميل المحتوى مع البيانات المتوفرة أولاً
                const tabContentPromise = this.renderActiveTabContent(false); // false = بدون Loading overlay
                tabContent = await Utils.promiseWithTimeout(
                    tabContentPromise,
                    3000, // ✅ تقليل timeout من 5 ثوان إلى 3 ثوان
                    this._t('module.ppe.timeout.content', 'انتهت مهلة تحميل المحتوى')
                );
            } catch (error) {
                if (typeof Utils !== 'undefined' && Utils.safeWarn) {
                    Utils.safeWarn('⚠️ خطأ في تحميل محتوى التبويب:', error);
                } else {
                    console.warn('⚠️ خطأ في تحميل محتوى التبويب:', error);
                }
                tabContent = this.renderActiveTabContentWithFallback();
            }

            // ✅ انتظار تحميل البيانات في الخلفية (بدون حجب الواجهة)
            dataLoadPromise.catch(error => {
                Utils.safeWarn('⚠️ خطأ في تحميل البيانات في الخلفية:', error);
            });

            const t = (k, f) => this._t(k, f);
            const ut = (s) => Utils.escapeHTML(s);
        section.innerHTML = `
            <div class="section-header">
                <div class="flex items-center justify-between">
                    <div>
                        <h1 class="section-title">
                            <i class="fas fa-hard-hat ml-3"></i>
                            ${ut(t('module.ppe.title', 'إدارة مهمات الوقاية الشخصية'))}
                        </h1>
                        <p class="section-subtitle">${ut(t('module.ppe.subtitle', 'تسجيل ومتابعة استلام مهمات الوقاية الشخصية'))}</p>
                    </div>
                    <div class="flex gap-2">
                        ${this.state.activeTab === 'receipts' ? `
                            <button id="view-ppe-matrix-btn" class="btn-secondary">
                                <i class="fas fa-table ml-2"></i>
                                ${ut(t('module.ppe.btn.matrix', 'مصفوفة مهمات الوقاية'))}
                            </button>
                            <button id="add-ppe-btn" class="btn-primary">
                                <i class="fas fa-plus ml-2"></i>
                                ${ut(t('module.ppe.btn.newReceipt', 'تسجيل استلام جديد'))}
                            </button>
                            <button id="ppe-refresh-btn" type="button" class="btn-secondary border-2 border-green-500 text-green-600 hover:bg-green-50" title="${ut(t('module.ppe.btn.refreshTitle', 'تحديث المحتوى الحالي'))}">
                                <i class="fas fa-sync-alt ml-2"></i>
                                ${ut(t('module.ppe.btn.refresh', 'تحديث'))}
                            </button>
                        ` : this.state.activeTab === 'stock-control' ? `
                            <button id="add-stock-item-btn" class="btn-primary">
                                <i class="fas fa-plus ml-2"></i>
                                ${ut(t('module.ppe.btn.addStockItem', 'إضافة صنف جديد'))}
                            </button>
                            <button id="add-transaction-btn" class="btn-secondary">
                                <i class="fas fa-exchange-alt ml-2"></i>
                                ${ut(t('module.ppe.btn.addTransaction', 'إضافة حركة'))}
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
            <div class="mt-6">
                <div class="content-card">
                    <div class="card-header" style="padding: 0; border-bottom: none;">
                        <div class="ppe-tabs-container">
                            <button type="button" class="ppe-tab-btn ${this.state.activeTab === 'receipts' ? 'active' : ''}" data-tab="receipts">
                                <i class="fas fa-receipt"></i>
                                ${ut(t('module.ppe.tab.receipts', 'سجل الاستلامات'))}
                            </button>
                            <button type="button" class="ppe-tab-btn ${this.state.activeTab === 'stock-control' ? 'active' : ''}" data-tab="stock-control">
                                <i class="fas fa-boxes"></i>
                                ${ut(t('module.ppe.tab.stock', 'إدارة مخزون مهمات الوقاية'))}
                            </button>
                            <button type="button" class="ppe-tab-btn ${this.state.activeTab === 'analysis' ? 'active' : ''}" data-tab="analysis">
                                <i class="fas fa-chart-pie"></i>
                                ${ut(t('module.ppe.tab.analysis', 'التحليل'))}
                            </button>
                        </div>
                    </div>
                    <div class="card-body" style="padding-top: 1.5rem;">
                        <div id="ppe-tab-content">
                            ${tabContent}
                        </div>
                    </div>
                </div>
            </div>
        `;
            // تهيئة الأحداث بعد عرض الواجهة
            try {
                this.ensurePpeFilterStyles();
                this.setupEventListeners();
                this.applyModuleI18n(section);
                if (this.state.activeTab === 'receipts') {
                    this.bindReceiptsFilters();
                    this._bindPpeReceiptExcelToolbar();
                } else if (this.state.activeTab === 'stock-control') {
                    this.bindStockFilters();
                    this._bindPpeStockExcelToolbar();
                } else if (this.state.activeTab === 'analysis') {
                    // ✅ تهيئة لوحة التحليل
                    this._ppeBindAnalyticsEvents();
                    this.updatePpeAnalyticsDashboard();
                }
            } catch (error) {
                Utils.safeWarn('⚠️ خطأ في setupEventListeners:', error);
            }
        } catch (error) {
            Utils.safeError('❌ خطأ في تحميل مديول معدات الحماية الشخصية:', error);
            const te = (k, f) => this._t(k, f);
            const ut = (s) => Utils.escapeHTML(s);
            section.innerHTML = `
                <div class="section-header">
                    <div>
                        <h1 class="section-title">
                            <i class="fas fa-hard-hat ml-3"></i>
                            ${ut(te('module.ppe.title', 'إدارة مهمات الوقاية الشخصية'))}
                        </h1>
                    </div>
                </div>
                <div class="mt-6">
                    <div class="content-card">
                        <div class="card-body">
                            <div class="empty-state">
                                <i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>
                                <p class="text-gray-500 mb-4">${ut(te('module.ppe.empty.loadError', 'حدث خطأ أثناء تحميل البيانات'))}</p>
                                <button onclick="PPE.load()" class="btn-primary">
                                    <i class="fas fa-redo ml-2"></i>
                                    ${ut(te('module.common.retry', 'إعادة المحاولة'))}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    /**
     * تحميل محتوى التبويب النشط
     * @param {boolean} showLoadingOverlay - عرض Loading overlay (افتراضي: true)
     */
    async renderActiveTabContent(showLoadingOverlay = true) {
        try {
            switch (this.state.activeTab) {
                case 'analysis':
                    // ✅ تبويب التحليل — لا يحتاج تحميل بيانات إضافية (يستخدم AppState مباشرة)
                    return await this.renderPpeAnalysisTab();
                case 'stock-control':
                    // ✅ تحميل البيانات مباشرة عند الدخول للتبويب
                    if (showLoadingOverlay) {
                        Loading.show(this._t('module.ppe.loading.stock', 'جاري تحميل بيانات المخزون...'));
                    }
                    try {
                        const content = await this.renderStockControlTab();
                        if (showLoadingOverlay) {
                            Loading.hide();
                        }
                        return content;
                    } catch (error) {
                        if (showLoadingOverlay) {
                            Loading.hide();
                        }
                        Utils.safeError('❌ خطأ في تحميل تبويب المخزون:', error);
                        return `
                            <div class="empty-state">
                                <i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>
                                <p class="text-gray-500 mb-4">${Utils.escapeHTML(this._t('module.ppe.empty.loadStockError', 'حدث خطأ أثناء تحميل بيانات المخزون'))}</p>
                                <button onclick="PPE.switchTab('stock-control')" class="btn-primary">
                                    <i class="fas fa-redo ml-2"></i>${Utils.escapeHTML(this._t('module.common.retry', 'إعادة المحاولة'))}
                                </button>
                            </div>
                        `;
                    }
                case 'receipts':
                default:
                    return await this.renderReceiptsTab();
            }
        } catch (error) {
            Utils.safeError('❌ خطأ في renderActiveTabContent:', error);
            if (showLoadingOverlay) {
                Loading.hide();
            }
            return `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>
                    <p class="text-gray-500 mb-4">${Utils.escapeHTML(this._t('module.ppe.empty.loadContentError', 'حدث خطأ أثناء تحميل المحتوى'))}</p>
                    <button onclick="PPE.load()" class="btn-primary">
                        <i class="fas fa-redo ml-2"></i>${Utils.escapeHTML(this._t('module.common.retry', 'إعادة المحاولة'))}
                    </button>
                </div>
            `;
        }
    },

    async renderReceiptsTab() {
        return `
            <div id="ppe-list">
                ${this.buildPPEListHtml()}
            </div>
        `;
    },

    /**
     * تنظيف مستمعي الأحداث السابقين
     */
    cleanupEventListeners() {
        this.state.eventListeners.forEach((listener, element) => {
            if (element && element.removeEventListener) {
                element.removeEventListener(listener.event, listener.handler);
            }
        });
        this.state.eventListeners.clear();
    },

    setupEventListeners() {
        // تنظيف المستمعين السابقين أولاً
        this.cleanupEventListeners();

        setTimeout(() => {
            // Tab switching
            const tabButtons = document.querySelectorAll('.ppe-tab-btn');
            tabButtons.forEach(btn => {
                const handler = () => {
                    const tab = btn.getAttribute('data-tab');
                    if (tab && !this.state.isSwitchingTab) {
                        this.switchTab(tab);
                    }
                };
                btn.addEventListener('click', handler);
                // حفظ المستمع للتنظيف لاحقاً
                this.state.eventListeners.set(btn, { event: 'click', handler });
            });

            // Receipts tab buttons
            const addBtn = document.getElementById('add-ppe-btn');
            const viewMatrixBtn = document.getElementById('view-ppe-matrix-btn');
            if (addBtn) {
                const handler = () => this.showPPEForm();
                addBtn.addEventListener('click', handler);
                this.state.eventListeners.set(addBtn, { event: 'click', handler });
            }
            if (viewMatrixBtn) {
                const handler = () => this.showPPEMatrix();
                viewMatrixBtn.addEventListener('click', handler);
                this.state.eventListeners.set(viewMatrixBtn, { event: 'click', handler });
            }
            const refreshBtn = document.getElementById('ppe-refresh-btn');
            if (refreshBtn) {
                const handler = () => this.refreshActiveTab();
                refreshBtn.addEventListener('click', handler);
                this.state.eventListeners.set(refreshBtn, { event: 'click', handler });
            }

            // Stock control tab buttons
            const addStockItemBtn = document.getElementById('add-stock-item-btn');
            const addTransactionBtn = document.getElementById('add-transaction-btn');
            if (addStockItemBtn) {
                const handler = () => this.showStockItemForm();
                addStockItemBtn.addEventListener('click', handler);
                this.state.eventListeners.set(addStockItemBtn, { event: 'click', handler });
            }
            if (addTransactionBtn) {
                const handler = () => this.showTransactionForm();
                addTransactionBtn.addEventListener('click', handler);
                this.state.eventListeners.set(addTransactionBtn, { event: 'click', handler });
            }

            this._bindPpeReceiptExcelToolbar();
            this._bindPpeStockExcelToolbar();
        }, 100);
    },

    /**
     * تحديث أزرار الهيدر حسب التبويب النشط
     */
    updateHeaderButtons() {
        const headerButtonsContainer = document.querySelector('#ppe-section .section-header .flex.gap-2');
        if (!headerButtonsContainer) return;

        // تنظيف مستمعي الأحداث للأزرار القديمة قبل استبدالها
        const oldButtons = [
            document.getElementById('add-ppe-btn'),
            document.getElementById('view-ppe-matrix-btn'),
            document.getElementById('ppe-refresh-btn'),
            document.getElementById('add-stock-item-btn'),
            document.getElementById('add-transaction-btn')
        ].filter(Boolean);

        oldButtons.forEach(btn => {
            if (this.state.eventListeners.has(btn)) {
                const listener = this.state.eventListeners.get(btn);
                btn.removeEventListener(listener.event, listener.handler);
                this.state.eventListeners.delete(btn);
            }
        });

        const t = (k, f) => this._t(k, f);
        const ut = (s) => Utils.escapeHTML(s);
        // استبدال الأزرار
        if (this.state.activeTab === 'receipts') {
            headerButtonsContainer.innerHTML = `
                <button id="view-ppe-matrix-btn" class="btn-secondary">
                    <i class="fas fa-table ml-2"></i>
                    ${ut(t('module.ppe.btn.matrix', 'مصفوفة مهمات الوقاية'))}
                </button>
                <button id="add-ppe-btn" class="btn-primary">
                    <i class="fas fa-plus ml-2"></i>
                    ${ut(t('module.ppe.btn.newReceipt', 'تسجيل استلام جديد'))}
                </button>
                <button id="ppe-refresh-btn" type="button" class="btn-secondary border-2 border-green-500 text-green-600 hover:bg-green-50" title="${ut(t('module.ppe.btn.refreshTitle', 'تحديث المحتوى الحالي'))}">
                    <i class="fas fa-sync-alt ml-2"></i>
                    ${ut(t('module.ppe.btn.refresh', 'تحديث'))}
                </button>
            `;
        } else {
            headerButtonsContainer.innerHTML = `
                <button id="add-stock-item-btn" class="btn-primary">
                    <i class="fas fa-plus ml-2"></i>
                    ${ut(t('module.ppe.btn.addStockItem', 'إضافة صنف جديد'))}
                </button>
                <button id="add-transaction-btn" class="btn-secondary">
                    <i class="fas fa-exchange-alt ml-2"></i>
                    ${ut(t('module.ppe.btn.addTransaction', 'إضافة حركة'))}
                </button>
            `;
        }
        this.applyModuleI18n(headerButtonsContainer);

        // إعادة إعداد مستمعي الأحداث للأزرار الجديدة
        const addBtn = document.getElementById('add-ppe-btn');
        const viewMatrixBtn = document.getElementById('view-ppe-matrix-btn');
        const addStockItemBtn = document.getElementById('add-stock-item-btn');
        const addTransactionBtn = document.getElementById('add-transaction-btn');

        if (addBtn) {
            const handler = () => this.showPPEForm();
            addBtn.addEventListener('click', handler);
            this.state.eventListeners.set(addBtn, { event: 'click', handler });
        }
        if (viewMatrixBtn) {
            const handler = () => this.showPPEMatrix();
            viewMatrixBtn.addEventListener('click', handler);
            this.state.eventListeners.set(viewMatrixBtn, { event: 'click', handler });
        }
        const refreshBtn = document.getElementById('ppe-refresh-btn');
        if (refreshBtn) {
            const handler = () => this.refreshActiveTab();
            refreshBtn.addEventListener('click', handler);
            this.state.eventListeners.set(refreshBtn, { event: 'click', handler });
        }
        if (addStockItemBtn) {
            const handler = () => this.showStockItemForm();
            addStockItemBtn.addEventListener('click', handler);
            this.state.eventListeners.set(addStockItemBtn, { event: 'click', handler });
        }
        if (addTransactionBtn) {
            const handler = () => this.showTransactionForm();
            addTransactionBtn.addEventListener('click', handler);
            this.state.eventListeners.set(addTransactionBtn, { event: 'click', handler });
        }

        this._bindPpeReceiptExcelToolbar();
        this._bindPpeStockExcelToolbar();
    },

    async switchTab(tabName) {
        // منع التبديل المتزامن
        if (this.state.isSwitchingTab) {
            Utils.safeWarn('⚠️ التبديل بين التبويبات قيد التنفيذ بالفعل');
            return;
        }

        // التحقق من أن التبويب مختلف
        if (this.state.activeTab === tabName) {
            return;
        }

        try {
            this.state.isSwitchingTab = true;
            this.state.activeTab = tabName;
            
            // تحديث حالة التبويبات (إزالة active من الكل وإضافتها للتبويب المحدد)
            const tabBtns = document.querySelectorAll('.ppe-tab-btn');
            tabBtns.forEach(btn => {
                btn.classList.remove('active');
                const btnTab = btn.getAttribute('data-tab');
                if (btnTab === tabName) {
                    btn.classList.add('active');
                }
            });
            
            // تحديث محتوى التبويب فقط (بدلاً من إعادة تحميل الموديول بالكامل)
            const tabContentContainer = document.getElementById('ppe-tab-content');
            if (tabContentContainer) {
                try {
                    // عدم إخفاء المحتوى بالكامل عند فتح المخزون — عرض الكاش فوراً ثم التحديث
                    if (tabName === 'stock-control') {
                        const cached = (this.state.stockItemsCache && this.state.stockItemsCache.length)
                            ? this.state.stockItemsCache
                            : (Array.isArray(AppState.appData.ppeStock) && AppState.appData.ppeStock.length
                                ? AppState.appData.ppeStock
                                : []);
                        const syncHint = `<div role="status" class="rounded-lg border border-blue-100 bg-blue-50/90 px-4 py-2 text-sm text-blue-900 flex items-center gap-2">
                            <i class="fas fa-sync-alt fa-spin text-blue-600"></i>
                            <span>${Utils.escapeHTML(this._t('module.ppe.stock.syncingHint', 'جاري مزامنة أحدث بيانات المخزون…'))}</span>
                        </div>`;
                        tabContentContainer.innerHTML = cached.length > 0
                            ? this.buildStockControlTabHtmlSync(cached, syncHint)
                            : `<div class="space-y-4" id="ppe-stock-tab-root">${syncHint}<div class="empty-state py-8"><p class="text-gray-600">${Utils.escapeHTML(this._t('module.ppe.loading.stockData', 'جاري تحميل بيانات المخزون…'))}</p></div></div>`;
                        tabContentContainer.style.opacity = '1';
                        tabContentContainer.style.pointerEvents = 'auto';
                        if (cached.length > 0) {
                            this.ensurePpeFilterStyles();
                            this.bindStockFilters();
                            this._bindPpeStockExcelToolbar();
                        }
                    } else {
                        tabContentContainer.style.opacity = '0.92';
                        tabContentContainer.style.pointerEvents = 'none';
                    }

                    const newContent = await this.renderActiveTabContent(tabName !== 'stock-control' && tabName !== 'analysis');
                    tabContentContainer.innerHTML = newContent;
                    this.applyModuleI18n(tabContentContainer);
                    if (tabName === 'receipts') {
                        this.ensurePpeFilterStyles();
                        this.bindReceiptsFilters();
                        this._bindPpeReceiptExcelToolbar();
                    } else if (tabName === 'stock-control') {
                        this.ensurePpeFilterStyles();
                        this.bindStockFilters();
                        this._bindPpeStockExcelToolbar();
                    } else if (tabName === 'analysis') {
                        // ✅ تهيئة لوحة التحليل بعد التبديل
                        this._ppeBindAnalyticsEvents();
                        this.updatePpeAnalyticsDashboard();
                    }
                    Utils.safeLog(`✅ PPE: تم التبديل إلى تبويب ${tabName}`);
                } catch (error) {
                    Utils.safeError('❌ خطأ في تحميل محتوى التبويب:', error);
                    tabContentContainer.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>
                            <p class="text-gray-500 mb-4">${Utils.escapeHTML(this._t('module.ppe.empty.loadError', 'حدث خطأ أثناء تحميل البيانات'))}</p>
                            <button onclick="PPE.switchTab('${tabName}')" class="btn-primary">
                                <i class="fas fa-redo ml-2"></i>
                                ${Utils.escapeHTML(this._t('module.common.retry', 'إعادة المحاولة'))}
                            </button>
                        </div>
                    `;
                } finally {
                    // ✅ استعادة الشفافية دائماً
                    tabContentContainer.style.opacity = '1';
                    tabContentContainer.style.pointerEvents = 'auto';
                }
            }
            
            // تحديث أزرار الهيدر
            this.updateHeaderButtons();
            
        } catch (error) {
            Utils.safeError('❌ خطأ في التبديل بين التبويبات:', error);
        } finally {
            this.state.isSwitchingTab = false;
        }
    },

    // ====== استحقاق استلام مهمات الوقاية ======
    /**
     * تحليل قائمة قواعد الاستحقاق المخزنة في إعدادات الشركة.
     * تدعم الصيغة الجديدة (JSON list per equipment type) وتتجاهل الصيغ غير الصالحة.
     */
    parseEligibilityRules(raw) {
        if (!raw) return [];
        try {
            if (Array.isArray(raw)) return raw;
            if (typeof raw === 'string') {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            }
        } catch (e) {
            return [];
        }
        return [];
    },

    /**
     * قراءة قاعدة الاستحقاق الخاصة بنوع معدة محدد من قائمة القواعد لكل صنف.
     * إن لم يُمرَّر equipmentType ولم تُحدد قاعدة لأي صنف، تُرجَع قاعدة فارغة (لا تحقق).
     */
    getEligibilityRule(equipmentType) {
        const settings = (typeof AppState !== 'undefined' && AppState.companySettings) ? AppState.companySettings : {};
        const rules = this.parseEligibilityRules(settings.ppeEligibilityRules);
        const norm = (v) => (v || '').toString().trim().toLowerCase();
        const target = norm(equipmentType);
        if (target) {
            const match = rules.find(r => r && norm(r.equipmentType || r.itemName) === target);
            if (match) {
                let months = parseInt(match.months, 10);
                let days = parseInt(match.days, 10);
                if (isNaN(months) || months < 0) months = 0;
                if (isNaN(days) || days < 0) days = 0;
                months = Math.min(120, months);
                days = Math.min(3650, days);
                return { months, days, hasRule: (months + days) > 0, equipmentType: match.equipmentType || match.itemName };
            }
        }
        return { months: 0, days: 0, hasRule: false, equipmentType: equipmentType || null };
    },

    /**
     * البحث عن آخر استلام لنفس الموظف ونفس نوع المعدة.
     */
    findLastReceiptForEmployeeItem(employeeCode, equipmentType, options = {}) {
        const code = (employeeCode || '').toString().trim().toLowerCase();
        const type = (equipmentType || '').toString().trim().toLowerCase();
        if (!code || !type) return null;
        const excludeId = options.excludeId || null;
        const list = (typeof AppState !== 'undefined' && Array.isArray(AppState.appData?.ppe)) ? AppState.appData.ppe : [];
        let candidate = null;
        let candidateDate = null;
        for (const rec of list) {
            if (!rec) continue;
            if (excludeId && rec.id === excludeId) continue;
            const recCode = (rec.employeeCode || rec.employeeNumber || '').toString().trim().toLowerCase();
            const recType = (rec.equipmentType || '').toString().trim().toLowerCase();
            if (recCode !== code || recType !== type) continue;
            const rd = rec.receiptDate ? new Date(rec.receiptDate) : null;
            if (!rd || isNaN(rd.getTime())) continue;
            if (!candidateDate || rd > candidateDate) {
                candidate = rec;
                candidateDate = rd;
            }
        }
        return candidate;
    },

    /**
     * حساب الفرق بالأشهر والأيام بين تاريخين.
     * يستخدم خوارزمية تقويمية: نحسب الأشهر بطرح الأشهر مع تعديل اليوم،
     * ثم الأيام المتبقية تُحسب بناءً على التقويم.
     */
    diffMonthsAndDays(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
            return { months: 0, days: 0, totalDays: 0, isNegative: end < start };
        }
        let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        let days = end.getDate() - start.getDate();
        if (days < 0) {
            months -= 1;
            const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
            days += prevMonth.getDate();
        }
        if (months < 0) months = 0;
        const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
        return { months, days, totalDays, isNegative: false };
    },

    /**
     * إضافة (أشهر + أيام) إلى تاريخ.
     */
    addMonthsAndDays(date, months, days) {
        const d = new Date(date);
        if (isNaN(d.getTime())) return null;
        const target = new Date(d.getFullYear(), d.getMonth() + (months || 0), d.getDate());
        target.setDate(target.getDate() + (days || 0));
        target.setHours(d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
        return target;
    },

    /**
     * حساب نتيجة التحقق من الاستحقاق لاستلام جديد.
     * ترجع كائناً يصف: هل يوجد استلام سابق، تاريخه، المدة المنقضية،
     * المدة المطلوبة، تاريخ الاستحقاق، الحالة (مستحق/غير مستحق)، والمتبقي.
     */
    computeEligibility(employeeCode, equipmentType, currentDateValue, options = {}) {
        const rule = this.getEligibilityRule(equipmentType);
        const result = {
            hasInputs: false,
            hasPrevious: false,
            hasRule: rule.hasRule,
            ruleMonths: rule.months,
            ruleDays: rule.days,
            lastReceiptDate: null,
            currentDate: null,
            elapsed: null,
            dueDate: null,
            isEligible: true,
            remaining: null
        };
        if (!employeeCode || !equipmentType) {
            return result;
        }
        result.hasInputs = true;
        const last = this.findLastReceiptForEmployeeItem(employeeCode, equipmentType, options);
        if (!last || !last.receiptDate) {
            return result;
        }
        const lastDate = new Date(last.receiptDate);
        if (isNaN(lastDate.getTime())) return result;
        result.hasPrevious = true;
        result.lastReceiptDate = lastDate;
        const current = currentDateValue ? new Date(currentDateValue) : new Date();
        if (isNaN(current.getTime())) {
            result.currentDate = new Date();
        } else {
            result.currentDate = current;
        }
        result.elapsed = this.diffMonthsAndDays(lastDate, result.currentDate);
        if (rule.hasRule) {
            const due = this.addMonthsAndDays(lastDate, rule.months, rule.days);
            result.dueDate = due;
            if (due && result.currentDate < due) {
                result.isEligible = false;
                result.remaining = this.diffMonthsAndDays(result.currentDate, due);
            }
        }
        return result;
    },

    /**
     * تحويل (شهور/أيام) إلى نص عربي مفهوم.
     */
    formatMonthsDays(months, days) {
        const m = parseInt(months, 10) || 0;
        const d = parseInt(days, 10) || 0;
        const parts = [];
        if (m > 0) parts.push(`${m} شهر`);
        if (d > 0 || (m === 0 && d === 0)) parts.push(`${d} يوم`);
        return parts.join(' و ');
    },

    /**
     * عرض حالة الاستحقاق داخل صف الصنف.
     */
    renderEligibilityInfo(infoEl, result) {
        if (!infoEl) return;
        const fmt = (d) => d ? (typeof Utils !== 'undefined' && Utils.formatDate ? Utils.formatDate(d) : new Date(d).toLocaleDateString('ar')) : '-';

        const card = (variant, headerIconSolid, title, statValueRows, footerHtml) => {
            const themes = {
                gray: {
                    outer: 'ring-1 ring-slate-200/80 shadow-xl shadow-slate-900/5',
                    headerBar: 'from-slate-700 via-slate-600 to-slate-700',
                    headerIconBg: 'bg-white/15 text-white ring-2 ring-white/30 shadow-md',
                    tileSurface: 'rounded-2xl border border-slate-200/75 bg-gradient-to-br from-white via-slate-50/30 to-white p-[1.1rem] sm:p-5 min-w-0 shadow-sm hover:shadow-md hover:border-slate-300/60 transition-all duration-200',
                    iconBox: 'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200/80 text-slate-700 text-[15px] shadow-inner ring-1 ring-slate-300/35',
                    labelClass: 'text-[11px] font-bold tracking-wide text-slate-500',
                    valueClass: 'text-[1.05rem] sm:text-lg font-extrabold text-slate-900 tracking-tight tabular-nums',
                    footerWrap: 'bg-gradient-to-b from-slate-50 to-slate-100/80 border-t border-slate-200/90'
                },
                blue: {
                    outer: 'ring-1 ring-sky-200/85 shadow-xl shadow-sky-900/[0.06]',
                    headerBar: 'from-sky-700 via-sky-500 to-cyan-500',
                    headerIconBg: 'bg-white/15 text-white ring-2 ring-white/30 shadow-md',
                    tileSurface: 'rounded-2xl border border-sky-100/90 bg-gradient-to-br from-white via-sky-50/25 to-white p-[1.1rem] sm:p-5 min-w-0 shadow-sm hover:shadow-md hover:border-sky-200/80 transition-all duration-200',
                    iconBox: 'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-cyan-100/70 text-sky-700 text-[15px] shadow-inner ring-1 ring-sky-200/55',
                    labelClass: 'text-[11px] font-bold tracking-wide text-sky-700/70',
                    valueClass: 'text-[1.05rem] sm:text-lg font-extrabold text-slate-900 tracking-tight tabular-nums',
                    footerWrap: 'bg-gradient-to-b from-sky-50/90 to-sky-100/50 border-t border-sky-100'
                },
                green: {
                    outer: 'ring-1 ring-emerald-200/85 shadow-xl shadow-emerald-900/[0.05]',
                    headerBar: 'from-emerald-700 via-teal-600 to-emerald-500',
                    headerIconBg: 'bg-white/15 text-white ring-2 ring-white/30 shadow-md',
                    tileSurface: 'rounded-2xl border border-emerald-100/90 bg-gradient-to-br from-white via-emerald-50/20 to-white p-[1.1rem] sm:p-5 min-w-0 shadow-sm hover:shadow-md hover:border-emerald-200/70 transition-all duration-200',
                    iconBox: 'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100/80 text-emerald-700 text-[15px] shadow-inner ring-1 ring-emerald-200/55',
                    labelClass: 'text-[11px] font-bold tracking-wide text-emerald-800/70',
                    valueClass: 'text-[1.05rem] sm:text-lg font-extrabold text-slate-900 tracking-tight tabular-nums',
                    footerWrap: 'bg-gradient-to-b from-emerald-50/95 to-teal-50/40 border-t border-emerald-100'
                },
                red: {
                    outer: 'ring-1 ring-rose-200/85 shadow-xl shadow-rose-900/[0.06]',
                    headerBar: 'from-rose-700 via-rose-500 to-red-500',
                    headerIconBg: 'bg-white/15 text-white ring-2 ring-white/30 shadow-md',
                    tileSurface: 'rounded-2xl border border-rose-100/90 bg-gradient-to-br from-white via-rose-50/25 to-white p-[1.1rem] sm:p-5 min-w-0 shadow-sm hover:shadow-md hover:border-rose-200/75 transition-all duration-200',
                    iconBox: 'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-100 to-orange-50 text-rose-700 text-[15px] shadow-inner ring-1 ring-rose-200/55',
                    labelClass: 'text-[11px] font-bold tracking-wide text-rose-800/75',
                    valueClass: 'text-[1.05rem] sm:text-lg font-extrabold text-slate-900 tracking-tight tabular-nums',
                    footerWrap: 'bg-gradient-to-b from-rose-50/95 to-rose-100/35 border-t border-rose-100'
                }
            };
            const t = themes[variant] || themes.gray;

            const statCount = statValueRows.length;
            let metricsGridCls = 'grid gap-3 md:gap-4 w-full ';
            if (statCount <= 1) metricsGridCls += 'grid-cols-1';
            else if (statCount === 2) metricsGridCls += 'grid-cols-1 sm:grid-cols-2';
            else if (statCount === 3) metricsGridCls += 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
            else metricsGridCls += 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4';

            const statsHtml = statCount
                ? `<div class="px-3 py-4 sm:px-6 sm:py-5 bg-gradient-to-br from-slate-50/90 via-white to-white">
                    <div class="${metricsGridCls}">
                    ${statValueRows.map((s) => {
                        const mutedValue = typeof s.value === 'string' && s.value.includes('بدون قاعدة');
                        const valueCls = mutedValue
                            ? 'text-base sm:text-[1.0625rem] font-semibold text-slate-600 tracking-tight leading-snug'
                            : t.valueClass;
                        return `
                        <div class="${t.tileSurface}">
                            <div class="flex items-center gap-3 sm:gap-4 text-start h-full">
                                <span class="${t.iconBox} shrink-0">
                                    <i class="${s.icon}"></i>
                                </span>
                                <div class="flex-1 min-w-0 flex flex-col gap-1.5 justify-center">
                                    <div class="${t.labelClass} text-xs sm:text-[11px] leading-snug">${s.label}</div>
                                    <p class="${valueCls} leading-snug break-words hyphens-none">${s.value}</p>
                                </div>
                            </div>
                        </div>`;
                    }).join('')}
                    </div>
                </div>`
                : '';

            return `
                <div class="mt-1 w-full min-w-0 overflow-hidden rounded-2xl bg-white ${t.outer}">
                    <div class="flex items-center gap-4 bg-gradient-to-l ${t.headerBar} px-5 py-4 sm:px-6 text-white shadow-inner">
                        <span class="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl ${t.headerIconBg} text-lg sm:text-xl">
                            <i class="${headerIconSolid}"></i>
                        </span>
                        <div class="min-w-0 flex-1">
                            <p class="text-[11px] font-semibold tracking-wide text-white/85 mb-1">استحقاق الاستلام</p>
                            <h4 class="text-base sm:text-lg font-extrabold leading-snug text-white break-words">${title}</h4>
                        </div>
                    </div>
                    ${statsHtml}
                    ${footerHtml ? `<div class="${t.footerWrap} px-5 py-4 sm:px-6 text-sm sm:text-[0.9375rem] font-medium text-slate-700 leading-relaxed flex flex-wrap items-center gap-3 w-full">${footerHtml}</div>` : ''}
                </div>
            `;
        };

        if (!result || !result.hasInputs) {
            infoEl.innerHTML = card(
                'gray',
                'fas fa-info-circle',
                'اختر الموظف ونوع المعدة',
                [],
                '<span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-xs"><i class="fas fa-lightbulb"></i></span><span>بعد اختيار الكود والصنف تظهر تفاصيل آخر استلام والمدة والاستحقاق.</span>'
            );
            infoEl.classList.remove('hidden');
            infoEl.setAttribute('data-eligible', 'pending');
            return;
        }

        if (!result.hasPrevious) {
            const stats = [];
            if (result.hasRule) {
                stats.push({ icon: 'fas fa-shield-alt', label: 'الحد الأدنى للصنف', value: this.formatMonthsDays(result.ruleMonths, result.ruleDays) });
            }
            infoEl.innerHTML = card(
                'blue',
                'fas fa-box-open',
                'أول استلام لهذا الصنف',
                stats,
                '<span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-200 text-sky-800 text-xs"><i class="fas fa-check"></i></span><span>لا يوجد استلام سابق لهذا الصنف لهذا الموظف؛ يمكن تسجيل الاستلام.</span>'
            );
            infoEl.setAttribute('data-eligible', '1');
            infoEl.classList.remove('hidden');
            return;
        }

        const elapsedText = this.formatMonthsDays(result.elapsed?.months || 0, result.elapsed?.days || 0);
        const requiredText = result.hasRule ? this.formatMonthsDays(result.ruleMonths, result.ruleDays) : 'بدون قاعدة محددة';
        const stats = [
            { icon: 'fas fa-history', label: 'تاريخ آخر استلام', value: fmt(result.lastReceiptDate) },
            { icon: 'fas fa-hourglass-half', label: 'المدة المنقضية', value: elapsedText },
            { icon: 'fas fa-shield-alt', label: 'الحد الأدنى للصنف', value: requiredText }
        ];
        if (result.dueDate) {
            stats.push({ icon: 'fas fa-calendar-check', label: 'تاريخ الاستحقاق', value: fmt(result.dueDate) });
        }

        if (result.isEligible) {
            const eligibleFooter = result.hasRule
                ? '<span class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-200/95 text-emerald-900 text-xs shadow-sm"><i class="fas fa-check-double"></i></span><span class="font-semibold text-emerald-950">يمكن تسجيل استلام جديد؛ تم استيفاء المدة الدنيا المعتمدة لهذا الصنف.</span>'
                : '<span class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 text-xs shadow-sm"><i class="fas fa-unlock-alt"></i></span><span class="font-semibold text-slate-800">يمكن تسجيل استلام جديد؛ لم تُضف مدة دنيا لهذا الصنف في إعدادات الشركة فيُسمح دون قيد زمني لهذا النوع.</span>';
            infoEl.innerHTML = card(
                'green',
                'fas fa-check-circle',
                'الموظف مستحق للاستلام',
                stats,
                eligibleFooter
            );
            infoEl.setAttribute('data-eligible', '1');
        } else {
            const remainingText = this.formatMonthsDays(result.remaining?.months || 0, result.remaining?.days || 0);
            infoEl.innerHTML = card(
                'red',
                'fas fa-ban',
                'الموظف غير مستحق حالياً',
                stats,
                `<span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-200 text-rose-800 text-xs"><i class="fas fa-clock"></i></span><span class="font-semibold text-rose-900">المدة المتبقية حتى يصبح الاستلام مسموحاً: <strong class="text-rose-950">${remainingText}</strong>.</span>`
            );
            infoEl.setAttribute('data-eligible', '0');
        }
        infoEl.classList.remove('hidden');
    },

    async showPPEForm(ppeData = null) {
        const isEdit = !!ppeData;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: flex; align-items: center; justify-content: center;';
        const employeesList = AppState.appData.employees || [];
        const initialCodeRaw = (ppeData?.employeeCode || ppeData?.employeeNumber || '').toString().trim();
        const initialCode = initialCodeRaw.length ? initialCodeRaw : '';
        const initialEmployee = initialCode
            ? employeesList.find(emp => {
                const codes = [
                    emp.employeeNumber,
                    emp.employeeCode,
                    emp.sapId,
                    emp.id,
                    emp.nationalId,
                    emp.cardId
                ].map(value => (value || '').toString().trim().toLowerCase());
                return codes.includes(initialCode.toLowerCase());
            })
            : null;
        const employeeInfo = {
            name: initialEmployee?.name || ppeData?.employeeName || '',
            department: initialEmployee?.department || ppeData?.employeeDepartment || '',
            position: initialEmployee?.position || ppeData?.employeePosition || '',
            branch: initialEmployee?.branch || ppeData?.employeeBranch || '',
            location: initialEmployee?.location || ppeData?.employeeLocation || ''
        };
        const formatInfo = (value) => value ? Utils.escapeHTML(value) : '—';
        const t = (k, f) => this._t(k, f);
        const ut = (s) => Utils.escapeHTML(s);
        const stReceived = t('module.ppe.status.received', 'مستلم');
        const stPending = t('module.ppe.status.pending', 'قيد التسليم');
        modal.innerHTML = `
            <div class="modal-content" style="width: 900px; max-width: 95vw; height: 1300px; max-height: 95vh; border-radius: 0.875rem; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.06);">
                <div class="modal-header" style="background: linear-gradient(135deg, #0f172a 0%, #1a2744 50%, #1e293b 100%); color: #ffffff; text-align: center; position: relative; padding: 1.25rem 1.5rem; border-bottom: 3px solid #d4af37; box-shadow: 0 2px 12px rgba(212,175,55,0.15);">
                    <h2 class="modal-title" style="margin: 0 auto; font-weight: 700; letter-spacing: 0.04em; font-size: 1.15rem; text-shadow: 0 1px 3px rgba(0,0,0,0.3); color: #f8f4e3;">
                        <i class="fas fa-shield-alt ml-2" style="color: #d4af37;"></i>${isEdit ? ut(t('module.ppe.title.editReceipt', 'تعديل استلام')) : ut(t('module.ppe.title.newReceipt', 'تسجيل استلام جديد'))}
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #c8c8d0; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); width: 2.25rem; height: 2.25rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s; cursor: pointer;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" style="background: #ffffff; height: calc(100% - 3.5rem); overflow-y: auto; overflow-x: hidden;">
                    <form id="ppe-form" class="space-y-4">
                        <section style="background: #ffffff; border: 1px solid #dde4f0; border-left: 4px solid #4f46e5; border-radius: 0.75rem; padding: 1rem; box-shadow: 0 2px 8px rgba(79,70,229,0.06);">
                            <div class="flex items-center gap-2 mb-3" style="border-bottom: 1px solid #eef2ff; padding-bottom: 0.5rem;">
                                <span style="display: inline-flex; width: 1.75rem; height: 1.75rem; align-items: center; justify-content: center; border-radius: 50%; background: linear-gradient(135deg, #4338ca, #6366f1); color: #fff; font-size: 0.75rem; box-shadow: 0 2px 6px rgba(79,70,229,0.3);"><i class="fas fa-user"></i></span>
                                <h3 class="text-sm font-bold" style="color: #1e293b; margin: 0;">بيانات الموظف</h3>
                            </div>
                        <div class="grid grid-cols-1 md:grid-cols-6 gap-4">
                            <div class="md:col-span-1">
                                <label class="block text-sm font-semibold text-gray-700 mb-2">${ut(t('module.ppe.label.employeeCode', 'الكود الوظيفي *'))}</label>
                                <div class="relative">
                                    <input type="text" id="ppe-employee-code" required class="form-input pr-12"
                                        value="${Utils.escapeHTML(ppeData?.employeeCode || ppeData?.employeeNumber || '')}"
                                        placeholder="${ut(t('module.ppe.searchEmployeeTitle', 'أدخل الكود الوظيفي'))}" autocomplete="off">
                                    <button type="button" id="ppe-search-code-btn"
                                        class="absolute inset-y-0 left-0 flex items-center justify-center w-10 text-gray-500 hover:text-gray-700"
                                        title="${ut(t('module.ppe.searchEmployeeTitle', 'بحث عن الموظف'))}">
                                        <i class="fas fa-search"></i>
                                    </button>
                                    </div>
                                </div>
                            <div class="md:col-span-5">
                                <label class="block text-sm font-semibold text-gray-700 mb-2">${ut(t('module.ppe.label.employeeName', 'اسم الموظف'))}</label>
                                <div class="relative">
                                    <input type="text" id="ppe-employee-name" class="form-input"
                                        value="${Utils.escapeHTML(ppeData?.employeeName || '')}"
                                        placeholder="${ut(t('module.ppe.placeholder.employeeName', ''))}" autocomplete="off"
                                        style="font-size: 0.95rem; letter-spacing: 0.03em;">
                                    <div id="ppe-employee-dropdown" class="hse-lookup-dropdown absolute z-50 hidden w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto" style="width: auto; min-width: 100%;"></div>
                            </div>
                            </div>
                        </div>
                        </section>

                        <input type="hidden" id="ppe-employee-department" value="${Utils.escapeHTML(employeeInfo.department)}">
                        <input type="hidden" id="ppe-employee-position" value="${Utils.escapeHTML(employeeInfo.position)}">
                        <input type="hidden" id="ppe-employee-branch" value="${Utils.escapeHTML(employeeInfo.branch)}">
                        <input type="hidden" id="ppe-employee-location" value="${Utils.escapeHTML(employeeInfo.location)}">

                        <div style="background: #ffffff; border: 1px solid #dde4f0; border-left: 4px solid #4f46e5; border-radius: 0.75rem; padding: 1rem; box-shadow: 0 2px 8px rgba(79,70,229,0.06);">
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                <div style="background: linear-gradient(135deg, #f8faff, #f0f4ff); padding: 0.875rem; border-radius: 0.5rem; border: 1px solid #e8edf8; display: flex; align-items: center; gap: 0.75rem; box-shadow: 0 1px 3px rgba(79,70,229,0.04);">
                                    <span style="display: inline-flex; width: 2.25rem; height: 2.25rem; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 0.5rem; background: linear-gradient(135deg, #4f46e5, #818cf8); color: #fff; box-shadow: 0 2px 6px rgba(79,70,229,0.25);"><i class="fas fa-signature" style="font-size: 0.8rem;"></i></span>
                                    <div class="min-w-0">
                                        <p class="text-[11px] font-bold" style="color: #4f46e5; margin: 0 0 0.125rem 0;">${ut(t('module.ppe.label.name', 'الاسم'))}</p>
                                        <p id="ppe-employee-info-name" class="font-extrabold text-slate-800 truncate" style="margin: 0;">${formatInfo(employeeInfo.name)}</p>
                                    </div>
                                </div>
                                <div style="background: linear-gradient(135deg, #f8faff, #f0f4ff); padding: 0.875rem; border-radius: 0.5rem; border: 1px solid #e8edf8; display: flex; align-items: center; gap: 0.75rem; box-shadow: 0 1px 3px rgba(79,70,229,0.04);">
                                    <span style="display: inline-flex; width: 2.25rem; height: 2.25rem; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 0.5rem; background: linear-gradient(135deg, #4f46e5, #818cf8); color: #fff; box-shadow: 0 2px 6px rgba(79,70,229,0.25);"><i class="fas fa-building" style="font-size: 0.8rem;"></i></span>
                                    <div class="min-w-0">
                                        <p class="text-[11px] font-bold" style="color: #4f46e5; margin: 0 0 0.125rem 0;">${ut(t('module.ppe.label.department', 'القسم'))}</p>
                                        <p id="ppe-employee-info-department" class="font-extrabold text-slate-800 truncate" style="margin: 0;">${formatInfo(employeeInfo.department)}</p>
                                    </div>
                                </div>
                                <div style="background: linear-gradient(135deg, #f8faff, #f0f4ff); padding: 0.875rem; border-radius: 0.5rem; border: 1px solid #e8edf8; display: flex; align-items: center; gap: 0.75rem; box-shadow: 0 1px 3px rgba(79,70,229,0.04);">
                                    <span style="display: inline-flex; width: 2.25rem; height: 2.25rem; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 0.5rem; background: linear-gradient(135deg, #4f46e5, #818cf8); color: #fff; box-shadow: 0 2px 6px rgba(79,70,229,0.25);"><i class="fas fa-briefcase" style="font-size: 0.8rem;"></i></span>
                                    <div class="min-w-0">
                                        <p class="text-[11px] font-bold" style="color: #4f46e5; margin: 0 0 0.125rem 0;">${ut(t('module.ppe.label.position', 'المنصب'))}</p>
                                        <p id="ppe-employee-info-position" class="font-extrabold text-slate-800 truncate" style="margin: 0;">${formatInfo(employeeInfo.position)}</p>
                                    </div>
                                </div>
                            </div>
                            <div class="text-xs text-slate-500 flex flex-wrap gap-4 mt-3 px-1">
                                <span id="ppe-employee-info-branch" class="${employeeInfo.branch ? '' : 'hidden'} bg-indigo-50 px-2 py-1 rounded-md font-medium" style="border: 1px solid #e0e7ff;">
                                    ${employeeInfo.branch ? `<i class="fas fa-code-branch text-indigo-400 ml-1"></i>${ut(t('module.ppe.label.branch', 'الفرع'))}: ${Utils.escapeHTML(employeeInfo.branch)}` : ''}
                                </span>
                                <span id="ppe-employee-info-location" class="${employeeInfo.location ? '' : 'hidden'} bg-indigo-50 px-2 py-1 rounded-md font-medium" style="border: 1px solid #e0e7ff;">
                                    ${employeeInfo.location ? `<i class="fas fa-map-marker-alt text-indigo-400 ml-1"></i>${ut(t('module.ppe.label.location', 'الموقع'))}: ${Utils.escapeHTML(employeeInfo.location)}` : ''}
                                </span>
                            </div>
                        </div>

                        <section style="background: #ffffff; border: 1px solid #d1e8dd; border-left: 4px solid #059669; border-radius: 0.75rem; padding: 1rem; box-shadow: 0 2px 8px rgba(5,150,105,0.06);">
                            <div class="flex items-center gap-2 mb-3" style="border-bottom: 1px solid #ecfdf5; padding-bottom: 0.5rem;">
                                <span style="display: inline-flex; width: 1.75rem; height: 1.75rem; align-items: center; justify-content: center; border-radius: 50%; background: linear-gradient(135deg, #047857, #10b981); color: #fff; font-size: 0.75rem; box-shadow: 0 2px 6px rgba(5,150,105,0.3);"><i class="fas fa-boxes"></i></span>
                                <h3 class="text-sm font-bold" style="color: #064e3b; margin: 0;">الأصناف المستلمة</h3>
                            </div>
                        <div class="space-y-4">
                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <h3 class="text-sm font-semibold text-gray-800">${ut(t('module.ppe.items.title', 'الأصناف المستلمة *'))}</h3>
                                    <button type="button" id="ppe-add-item-btn" class="btn-secondary text-xs px-3 py-1">
                                        <i class="fas fa-plus ml-1"></i>${ut(t('module.ppe.items.addRow', 'إضافة صنف آخر'))}
                                    </button>
                                </div>
                                <div id="ppe-items-container" class="space-y-4">
                                    <div class="ppe-item-row w-full border border-slate-200 rounded-lg bg-white overflow-hidden" style="box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                                        <div class="grid grid-cols-1 md:grid-cols-7 gap-3 p-3 items-end" style="background: linear-gradient(135deg, #fafcff, #f8fafc);">
                                            <div class="min-w-0 md:col-span-3">
                                                <label class="block text-xs font-semibold text-gray-700 mb-1">
                                                    <i class="fas fa-shield-alt text-emerald-600 ml-1"></i>${ut(t('module.ppe.label.equipmentType', 'نوع المعدة *'))}
                                                </label>
                                                <select id="ppe-equipment-type" required class="form-input ppe-equipment-type w-full border-slate-200 focus:border-emerald-500 focus:ring-emerald-500 rounded-lg">
                                                    <option value="">${ut(t('module.ppe.equip.loading', 'جاري التحميل...'))}</option>
                                                </select>
                                                <div class="ppe-balance-display flex items-center gap-1 mt-1 text-[11px]" style="display: none;">
                                                    <i class="fas fa-boxes text-slate-400"></i>
                                                    <span class="text-slate-500">${ut(t('module.ppe.stock.balance', 'الرصيد'))}: </span>
                                                    <span class="ppe-balance-value font-bold text-slate-700">0</span>
                                                </div>
                                            </div>
                                            <div class="min-w-0 md:col-span-2">
                                                <label class="block text-xs font-semibold text-gray-700 mb-1">
                                                    <i class="fas fa-shoe-prints text-emerald-600 ml-1"></i>مقاس الحذاء (اختياري)
                                                </label>
                                                <select class="form-input ppe-shoe-size w-full border-slate-200 focus:border-emerald-500 focus:ring-emerald-500 rounded-lg">
                                                    <option value="">اختر المقاس...</option>
                                                    <option value="38" ${ppeData?.shoeSize === '38' || ppeData?.shoeSize === 38 ? 'selected' : ''}>38</option>
                                                    <option value="39" ${ppeData?.shoeSize === '39' || ppeData?.shoeSize === 39 ? 'selected' : ''}>39</option>
                                                    <option value="40" ${ppeData?.shoeSize === '40' || ppeData?.shoeSize === 40 ? 'selected' : ''}>40</option>
                                                    <option value="41" ${ppeData?.shoeSize === '41' || ppeData?.shoeSize === 41 ? 'selected' : ''}>41</option>
                                                    <option value="42" ${ppeData?.shoeSize === '42' || ppeData?.shoeSize === 42 ? 'selected' : ''}>42</option>
                                                    <option value="43" ${ppeData?.shoeSize === '43' || ppeData?.shoeSize === 43 ? 'selected' : ''}>43</option>
                                                    <option value="44" ${ppeData?.shoeSize === '44' || ppeData?.shoeSize === 44 ? 'selected' : ''}>44</option>
                                                    <option value="45" ${ppeData?.shoeSize === '45' || ppeData?.shoeSize === 45 ? 'selected' : ''}>45</option>
                                                    <option value="46" ${ppeData?.shoeSize === '46' || ppeData?.shoeSize === 46 ? 'selected' : ''}>46</option>
                                                    <option value="47" ${ppeData?.shoeSize === '47' || ppeData?.shoeSize === 47 ? 'selected' : ''}>47</option>
                                                    <option value="48" ${ppeData?.shoeSize === '48' || ppeData?.shoeSize === 48 ? 'selected' : ''}>48</option>
                                                </select>
                                            </div>
                                            <div class="min-w-0 md:col-span-2">
                                                <label class="block text-xs font-semibold text-gray-700 mb-1">
                                                    <i class="fas fa-sort-numeric-up text-amber-600 ml-1"></i>${ut(t('module.ppe.label.qty', 'الكمية *'))}
                                                </label>
                                                <div class="flex items-center gap-2">
                                                    <input type="number" id="ppe-quantity" required class="form-input ppe-quantity w-full border-slate-200 focus:border-amber-500 focus:ring-amber-500 rounded-lg min-w-0" min="1"
                                                        value="${ppeData?.quantity || 1}" placeholder="${ut(t('module.ppe.table.quantity', 'الكمية'))}">
                                                    <button type="button" class="btn-secondary ppe-remove-item hidden text-xs px-3 py-2 whitespace-nowrap shrink-0 rounded-lg border-rose-200 text-rose-600 hover:bg-rose-50">
                                                        <i class="fas fa-trash-alt"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="ppe-eligibility-info hidden border-t border-slate-100 p-4 pt-4 bg-white w-full min-w-0"></div>
                                    </div>
                                </div>
                                <p class="text-xs text-gray-500 mt-1">
                                    ${ut(t('module.ppe.items.hint', ''))}
                                </p>
                            </div>

                            <div style="border-top: 1px solid #e2e8f0; padding-top: 1rem;">
                            <div class="flex items-center gap-2 mb-2" style="border-bottom: 1px solid #fffbeb; padding-bottom: 0.5rem;">
                                <span style="display: inline-flex; width: 1.75rem; height: 1.75rem; align-items: center; justify-content: center; border-radius: 50%; background: linear-gradient(135deg, #b45309, #f59e0b); color: #fff; font-size: 0.75rem; box-shadow: 0 2px 6px rgba(217,119,6,0.3);"><i class="fas fa-calendar-check"></i></span>
                                <h3 class="text-sm font-bold" style="color: #78350f; margin: 0;">تفاصيل الاستلام</h3>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">${ut(t('module.ppe.label.receiptDate', 'تاريخ الاستلام *'))}</label>
                                    <input type="date" id="ppe-receipt-date" required class="form-input"
                                        value="${ppeData?.receiptDate ? new Date(ppeData.receiptDate).toISOString().slice(0, 10) : ''}">
                                </div>
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">${ut(t('module.ppe.label.status', 'الحالة *'))}</label>
                                    <select id="ppe-status" required class="form-input">
                                        <option value="مستلم" ${ppeData?.status === 'مستلم' ? 'selected' : ''}>${ut(stReceived)}</option>
                                        <option value="قيد التسليم" ${ppeData?.status === 'قيد التسليم' ? 'selected' : ''}>${ut(stPending)}</option>
                                    </select>
                                </div>
                            </div>

                            <div class="mt-4">
                                <label class="block text-sm font-semibold text-gray-700 mb-2">${ut(t('module.ppe.label.notes', 'ملاحظات'))}</label>
                                <textarea id="ppe-notes" class="form-input" rows="3"
                                    placeholder="${ut(t('module.ppe.placeholder.notes', ''))}">${Utils.escapeHTML(ppeData?.notes || '')}</textarea>
                            </div>
                        </div>
                        </section>
                        <div class="flex items-center justify-center gap-3 pt-3 border-t border-slate-200" style="position: sticky; bottom: 0; background: #ffffff;">
                            <button type="button" class="btn-secondary px-6 py-2" onclick="this.closest('.modal-overlay').remove()">${ut(t('module.common.cancel', 'إلغاء'))}</button>
                            <button type="submit" class="btn-primary px-6 py-2">
                                <i class="fas fa-save ml-2"></i>${isEdit ? ut(t('module.common.saveChanges', 'حفظ التعديلات')) : ut(t('module.ppe.btn.saveReceipt', 'تسجيل الاستلام'))}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.applyModuleI18n(modal);

        // Setup employee code search and autocomplete for PPE form
        setTimeout(() => {
            const codeInput = document.getElementById('ppe-employee-code');
            const nameInput = document.getElementById('ppe-employee-name');
            const dropdown = document.getElementById('ppe-employee-dropdown');
            const searchBtn = document.getElementById('ppe-search-code-btn');
            const departmentInput = document.getElementById('ppe-employee-department');
            const positionInput = document.getElementById('ppe-employee-position');
            const branchInput = document.getElementById('ppe-employee-branch');
            const locationInput = document.getElementById('ppe-employee-location');
            const infoName = document.getElementById('ppe-employee-info-name');
            const infoDepartment = document.getElementById('ppe-employee-info-department');
            const infoPosition = document.getElementById('ppe-employee-info-position');
            const infoBranch = document.getElementById('ppe-employee-info-branch');
            const infoLocation = document.getElementById('ppe-employee-info-location');
            const employees = AppState.appData.employees || [];

            const Lb = (k, f) => PPE._t(k, f);
            const updateInfoDisplay = (info = {}) => {
                if (infoName) infoName.textContent = info.name || '—';
                if (infoDepartment) infoDepartment.textContent = info.department || '—';
                if (infoPosition) infoPosition.textContent = info.position || '—';
                if (infoBranch) {
                    if (info.branch) {
                        infoBranch.innerHTML = `<i class="fas fa-code-branch text-slate-400 ml-1"></i>${Lb('module.ppe.label.branch', 'الفرع')}: ${Utils.escapeHTML(info.branch)}`;
                        infoBranch.classList.remove('hidden');
                    } else {
                        infoBranch.innerHTML = '';
                        infoBranch.classList.add('hidden');
                    }
                }
                if (infoLocation) {
                    if (info.location) {
                        infoLocation.innerHTML = `<i class="fas fa-map-marker-alt text-slate-400 ml-1"></i>${Lb('module.ppe.label.location', 'الموقع')}: ${Utils.escapeHTML(info.location)}`;
                        infoLocation.classList.remove('hidden');
                    } else {
                        infoLocation.innerHTML = '';
                        infoLocation.classList.add('hidden');
                    }
                }
            };

            const applyEmployee = (employee, { notifySuccess = false, notifyFail = false } = {}) => {
                if (!employee) {
                    if (notifyFail) {
                        Notification.warning(Lb('module.ppe.notify.employeeNotFound', 'لم يتم العثور على موظف بهذا الكود'));
                    }
                    updateInfoDisplay({
                        name: nameInput?.value?.trim() || '—',
                        department: departmentInput?.value || '',
                        position: positionInput?.value || '',
                        branch: branchInput?.value || '',
                        location: locationInput?.value || ''
                    });
                    return false;
                }

                const codeValue = employee.employeeNumber || employee.employeeCode || employee.sapId || employee.id || '';
                if (codeInput && codeValue) {
                    codeInput.value = codeValue;
                }
                if (nameInput) nameInput.value = employee.name || '';
                if (departmentInput) departmentInput.value = employee.department || '';
                if (positionInput) positionInput.value = employee.position || '';
                if (branchInput) branchInput.value = employee.branch || '';
                if (locationInput) locationInput.value = employee.location || '';

                updateInfoDisplay({
                    name: employee.name || '—',
                    department: employee.department || '',
                    position: employee.position || '',
                    branch: employee.branch || '',
                    location: employee.location || ''
                });

                if (notifySuccess) {
                    Notification.success(Lb('module.ppe.notify.employeeLoaded', 'تم جلب بيانات الموظف بنجاح'));
                }
                return true;
            };

            const findEmployeeByCode = (code) => {
                if (!code) return null;
                const normalized = code.trim().toLowerCase();
                if (!normalized) return null;

                let result = null;
                if (typeof EmployeeHelper !== 'undefined' && typeof EmployeeHelper.findByCode === 'function') {
                    result = EmployeeHelper.findByCode(code) || EmployeeHelper.findByCode(normalized);
                }
                if (result) return result;

                return employees.find(emp => (
                    [
                        emp.employeeNumber,
                        emp.employeeCode,
                        emp.sapId,
                        emp.id,
                        emp.nationalId,
                        emp.cardId
                    ].some(value => String(value || '').trim().toLowerCase() === normalized)
                )) || null;
            };

            const handleCodeSearch = ({ notify = true } = {}) => {
                const codeValue = codeInput?.value?.trim();
                if (!codeValue) return;
                const employee = findEmployeeByCode(codeValue);
                applyEmployee(employee, { notifySuccess: notify, notifyFail: notify });
            };

            if (codeInput) {
                codeInput.addEventListener('blur', () => handleCodeSearch({ notify: false }));
                codeInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        handleCodeSearch({ notify: true });
                    }
                });
            }

            if (searchBtn) {
                searchBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    handleCodeSearch({ notify: true });
                });
            }

            if (nameInput && dropdown) {
                nameInput.addEventListener('input', (event) => {
                    const searchTerm = event.target.value.trim();
                    dropdown.innerHTML = '';
                    dropdown.classList.add('hidden');

                    if (searchTerm.length < 2) return;

                    const lower = searchTerm.toLowerCase();
                    const matches = employees.filter(emp => {
                        const values = [emp.name, emp.employeeNumber, emp.employeeCode, emp.sapId];
                        return values.some(value => String(value || '').toLowerCase().includes(lower));
                    }).slice(0, 12);

                    if (!matches.length) return;

                    matches.forEach(emp => {
                        const option = document.createElement('button');
                        option.type = 'button';
                        option.className = 'w-full text-right p-3 hover:bg-blue-50 focus:bg-blue-100 focus:outline-none border-b border-gray-100 last:border-b-0';

                        const title = document.createElement('div');
                        title.className = 'font-semibold text-gray-800';
                        title.textContent = emp.name || 'بدون اسم';

                        const subtitle = document.createElement('div');
                        subtitle.className = 'text-xs text-gray-500 mt-1';
                        subtitle.textContent = [emp.employeeNumber || emp.employeeCode || emp.sapId || '', emp.department || '', emp.position || '']
                            .filter(Boolean)
                            .join(' • ');

                        option.appendChild(title);
                        option.appendChild(subtitle);
                        option.addEventListener('click', () => {
                            applyEmployee(emp, { notifySuccess: false, notifyFail: false });
                            dropdown.classList.add('hidden');
                        });

                        dropdown.appendChild(option);
                    });

                    dropdown.classList.remove('hidden');
                });
            }

            const modalClickHandler = (event) => {
                if (dropdown && !dropdown.contains(event.target) && nameInput && !nameInput.contains(event.target)) {
                    dropdown.classList.add('hidden');
                }
                if (event.target === modal) {
                    modal.remove();
                }
            };
            modal.addEventListener('click', modalClickHandler);

            updateInfoDisplay({
                name: employeeInfo.name || nameInput?.value?.trim() || '—',
                department: employeeInfo.department || departmentInput?.value || '',
                position: employeeInfo.position || positionInput?.value || '',
                branch: employeeInfo.branch || branchInput?.value || '',
                location: employeeInfo.location || locationInput?.value || ''
            });

            // إعداد إدارة صفوف الأصناف (إمكانية إضافة أكثر من صنف لنفس الموظف)
            const itemsContainer = document.getElementById('ppe-items-container');
            const addItemBtn = document.getElementById('ppe-add-item-btn');

            const refreshRemoveButtonsVisibility = () => {
                if (!itemsContainer) return;
                const rows = Array.from(itemsContainer.querySelectorAll('.ppe-item-row'));
                rows.forEach(row => {
                    const removeBtn = row.querySelector('.ppe-remove-item');
                    if (!removeBtn) return;
                    const shouldHide = rows.length === 1 || isEdit;
                    if (shouldHide) {
                        removeBtn.classList.add('hidden');
                    } else {
                        removeBtn.classList.remove('hidden');
                    }
                });
            };

            const attachRemoveHandler = (row) => {
                if (!itemsContainer || !row) return;
                const removeBtn = row.querySelector('.ppe-remove-item');
                if (!removeBtn) return;

                removeBtn.addEventListener('click', () => {
                    const rows = Array.from(itemsContainer.querySelectorAll('.ppe-item-row'));
                    if (rows.length <= 1) return;
                    row.remove();
                    refreshRemoveButtonsVisibility();
                });
            };

            const createItemRow = () => {
                if (!itemsContainer) return null;
                const baseRow = itemsContainer.querySelector('.ppe-item-row');
                if (!baseRow) return null;

                const newRow = baseRow.cloneNode(true);

                const selectEl = newRow.querySelector('.ppe-equipment-type');
                if (selectEl) {
                    selectEl.value = '';
                    if (selectEl.id === 'ppe-equipment-type') {
                        selectEl.removeAttribute('id');
                    }
                }

                const quantityEl = newRow.querySelector('.ppe-quantity');
                if (quantityEl) {
                    quantityEl.value = '1';
                    if (quantityEl.id === 'ppe-quantity') {
                        quantityEl.removeAttribute('id');
                    }
                }

                const shoeSizeEl = newRow.querySelector('.ppe-shoe-size');
                if (shoeSizeEl) {
                    shoeSizeEl.value = '';
                }

                const eligibilityEl = newRow.querySelector('.ppe-eligibility-info');
                if (eligibilityEl) {
                    eligibilityEl.innerHTML = '';
                    eligibilityEl.classList.add('hidden');
                    eligibilityEl.removeAttribute('data-eligible');
                }

                itemsContainer.appendChild(newRow);
                attachRemoveHandler(newRow);
                refreshRemoveButtonsVisibility();

                // تحسين الأداء: استخدام HTML الخيارات المخزن بدل طلب Backend جديد
                const newSelect = newRow.querySelector('.ppe-equipment-type');
                if (newSelect && this.state.ppeItemsOptionsHTML) {
                    newSelect.innerHTML = this.state.ppeItemsOptionsHTML;
                } else {
                    this.loadPPEItemsForDropdown();
                }

                this._updateAllBalanceDisplays();

                return newRow;
            };

            if (itemsContainer) {
                const initialRows = Array.from(itemsContainer.querySelectorAll('.ppe-item-row'));
                initialRows.forEach(row => attachRemoveHandler(row));
                refreshRemoveButtonsVisibility();
            }

            if (addItemBtn) {
                if (isEdit) {
                    addItemBtn.classList.add('hidden');
                } else {
                    addItemBtn.addEventListener('click', (event) => {
                        event.preventDefault();
                        createItemRow();
                    });
                }
            }

            // Load PPE items list from stock and populate equipment type dropdown
            this.loadPPEItemsForDropdown(ppeData?.equipmentType);

            // ===== استحقاق الاستلام: عرض آخر استلام والمدة وحالة الاستحقاق =====
            const receiptDateInput = document.getElementById('ppe-receipt-date');
            const employeeCodeInput = document.getElementById('ppe-employee-code');
            const excludeEditId = isEdit && ppeData?.id ? ppeData.id : null;

            const refreshAllEligibilityRows = () => {
                if (!itemsContainer) return;
                const rows = Array.from(itemsContainer.querySelectorAll('.ppe-item-row'));
                const employeeCode = (employeeCodeInput?.value || '').trim();
                const receiptDateValue = (receiptDateInput?.value || '').trim();
                rows.forEach(row => {
                    const typeSelect = row.querySelector('.ppe-equipment-type');
                    const equipmentType = (typeSelect?.value || '').trim();
                    const infoEl = row.querySelector('.ppe-eligibility-info');
                    if (!infoEl) return;
                    const result = PPE.computeEligibility(employeeCode, equipmentType, receiptDateValue, { excludeId: excludeEditId });
                    PPE.renderEligibilityInfo(infoEl, result);
                });
            };

            if (receiptDateInput) {
                receiptDateInput.addEventListener('change', refreshAllEligibilityRows);
                receiptDateInput.addEventListener('input', refreshAllEligibilityRows);
            }
            if (employeeCodeInput) {
                employeeCodeInput.addEventListener('change', refreshAllEligibilityRows);
                employeeCodeInput.addEventListener('blur', refreshAllEligibilityRows);
            }
            if (itemsContainer) {
                itemsContainer.addEventListener('change', (event) => {
                    if (event.target && event.target.classList && event.target.classList.contains('ppe-equipment-type')) {
                        refreshAllEligibilityRows();
                        PPE._updateAllBalanceDisplays();
                    }
                });
            }

            modal._refreshPPEEligibility = refreshAllEligibilityRows;

            if (codeInput) {
                codeInput.addEventListener('input', refreshAllEligibilityRows);
                codeInput.addEventListener('change', refreshAllEligibilityRows);
            }

            // عند اختيار موظف من قائمة البحث، يتم تحديث قيمة الكود برمجياً ولا تُطلق
            // أحداث input/change تلقائياً، لذا نراقب التغييرات على قيمة الحقل.
            if (codeInput) {
                let lastSeenCode = codeInput.value;
                const codeWatcher = setInterval(() => {
                    if (!document.body.contains(codeInput)) {
                        clearInterval(codeWatcher);
                        return;
                    }
                    if (codeInput.value !== lastSeenCode) {
                        lastSeenCode = codeInput.value;
                        refreshAllEligibilityRows();
                    }
                }, 300);
            }

            // عرض البطاقة الإرشادية فوراً، ثم تحديثها بعد تحميل قوائم الأصناف
            refreshAllEligibilityRows();
            setTimeout(refreshAllEligibilityRows, 300);
            setTimeout(refreshAllEligibilityRows, 1500);

            // Setup form submit handler
            const form = modal.querySelector('#ppe-form');
            if (form) {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();

                    // منع النقر المتكرر
                    const submitBtn = form?.querySelector('button[type="submit"]') || 
                                     e.target?.querySelector('button[type="submit"]');
                    
                    if (submitBtn && submitBtn.disabled) {
                        return; // النموذج قيد المعالجة
                    }

                    // تعطيل الزر لمنع النقر المتكرر
                    let originalText = '';
                    if (submitBtn) {
                        originalText = submitBtn.innerHTML;
                        submitBtn.disabled = true;
                        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i> جاري الحفظ...';
                    }

                    // توليد رقم إيصال مسلسل
                    const existingPPE = AppState.appData.ppe || [];
                    const currentYear = new Date().getFullYear();
                    const existingNumbers = existingPPE
                        .filter(p => p.receiptNumber && p.receiptNumber.startsWith(`PPE-${currentYear}-`))
                        .map(p => {
                            const match = p.receiptNumber.match(/\d+$/);
                            return match ? parseInt(match[0]) : 0;
                        });
                    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
                    const receiptNumber = isEdit && ppeData?.receiptNumber
                        ? ppeData.receiptNumber
                        : `PPE-${currentYear}-${String(nextNumber).padStart(4, '0')}`;

                    // فحص العناصر قبل الاستخدام
                    const employeeNameEl = document.getElementById('ppe-employee-name');
                    const employeeCodeEl = document.getElementById('ppe-employee-code');
                    const employeeDepartmentEl = document.getElementById('ppe-employee-department');
                    const employeePositionEl = document.getElementById('ppe-employee-position');
                    const employeeBranchEl = document.getElementById('ppe-employee-branch');
                    const employeeLocationEl = document.getElementById('ppe-employee-location');
                    const itemsContainerEl = document.getElementById('ppe-items-container');
                    const receiptDateEl = document.getElementById('ppe-receipt-date');
                    const statusEl = document.getElementById('ppe-status');
                    const notesEl = document.getElementById('ppe-notes');
                    
                    if (!employeeNameEl || !employeeCodeEl || !employeeDepartmentEl || !employeePositionEl || 
                        !employeeBranchEl || !employeeLocationEl || !itemsContainerEl || 
                        !receiptDateEl || !statusEl) {
                        Notification.error(PPE._t('module.ppe.notify.fieldsMissing', 'بعض الحقول المطلوبة غير موجودة. يرجى تحديث الصفحة والمحاولة مرة أخرى.'));
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalText;
                        }
                        return;
                    }

                    if (!receiptDateEl.value) {
                        Notification.error(PPE._t('module.ppe.notify.dateRequired', 'يرجى تحديد تاريخ الاستلام.'));
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalText;
                        }
                        return;
                    }

                    const itemRows = Array.from(itemsContainerEl.querySelectorAll('.ppe-item-row'));
                    if (!itemRows.length) {
                        Notification.error(PPE._t('module.ppe.notify.itemsRequired', 'يجب إضافة صنف واحد على الأقل قبل حفظ الاستلام.'));
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalText;
                        }
                        return;
                    }

                    const equipmentItems = [];
                    for (const row of itemRows) {
                        const typeSelect = row.querySelector('.ppe-equipment-type');
                        const quantityInput = row.querySelector('.ppe-quantity');
                        const shoeSizeSelect = row.querySelector('.ppe-shoe-size');

                        if (!typeSelect || !quantityInput) {
                            Notification.error(PPE._t('module.ppe.notify.rowsIncomplete', 'بعض صفوف الأصناف غير مكتملة. يرجى التأكد من أن كل صف يحتوي على نوع وكمية.'));
                            if (submitBtn) {
                                submitBtn.disabled = false;
                                submitBtn.innerHTML = originalText;
                            }
                            return;
                        }

                        const typeValue = (typeSelect.value || '').trim();
                        const quantityValue = parseInt(quantityInput.value, 10) || 0;
                        const shoeSizeValue = shoeSizeSelect ? (shoeSizeSelect.value || '').trim() : '';

                        if (!typeValue) {
                            Notification.error(PPE._t('module.ppe.notify.selectEquipmentEachRow', 'يرجى اختيار نوع المعدة لكل صف قبل الحفظ.'));
                            if (submitBtn) {
                                submitBtn.disabled = false;
                                submitBtn.innerHTML = originalText;
                            }
                            return;
                        }

                        if (quantityValue <= 0) {
                            Notification.error(PPE._t('module.ppe.notify.qtyPositive', 'الكمية لكل صنف يجب أن تكون رقمًا أكبر من صفر.'));
                            if (submitBtn) {
                                submitBtn.disabled = false;
                                submitBtn.innerHTML = originalText;
                            }
                            return;
                        }

                        equipmentItems.push({
                            equipmentType: typeValue,
                            quantity: quantityValue,
                            shoeSize: shoeSizeValue
                        });
                    }

                    // ===== التحقق من استحقاق الاستلام لكل صنف قبل الحفظ =====
                    {
                        const employeeCodeForCheck = employeeCodeEl.value.trim();
                        const receiptDateForCheck = receiptDateEl.value;
                        const excludeIdForCheck = isEdit && ppeData?.id ? ppeData.id : null;
                        const blockingItems = [];
                        equipmentItems.forEach((item, idx) => {
                            const r = PPE.computeEligibility(employeeCodeForCheck, item.equipmentType, receiptDateForCheck, { excludeId: excludeIdForCheck });
                            if (r.hasRule && r.hasPrevious && !r.isEligible) {
                                blockingItems.push({ index: idx, item, result: r });
                                const row = itemRows[idx];
                                if (row) {
                                    const infoEl = row.querySelector('.ppe-eligibility-info');
                                    PPE.renderEligibilityInfo(infoEl, r);
                                }
                            }
                        });
                        if (blockingItems.length > 0) {
                            const first = blockingItems[0];
                            const remainingText = PPE.formatMonthsDays(first.result.remaining?.months || 0, first.result.remaining?.days || 0);
                            const dueText = first.result.dueDate ? (typeof Utils !== 'undefined' && Utils.formatDate ? Utils.formatDate(first.result.dueDate) : new Date(first.result.dueDate).toLocaleDateString('ar')) : '';
                            const itemNames = blockingItems.map(b => b.item.equipmentType).join('، ');
                            const message = blockingItems.length === 1
                                ? PPE._t('module.ppe.notify.notEligible', `لا يمكن تسجيل الاستلام: الموظف غير مستحق لصنف «${first.item.equipmentType}» حالياً. تاريخ الاستحقاق: ${dueText}، المتبقي: ${remainingText}.`)
                                : PPE._t('module.ppe.notify.notEligibleMulti', `لا يمكن تسجيل الاستلام: الموظف غير مستحق للأصناف التالية حالياً (${itemNames}). أقرب استحقاق بعد: ${remainingText}.`);
                            Notification.error(message);
                            if (submitBtn) {
                                submitBtn.disabled = false;
                                submitBtn.innerHTML = originalText;
                            }
                            return;
                        }
                    }

                    const commonData = {
                        receiptNumber: receiptNumber,
                        employeeName: employeeNameEl.value.trim(),
                        employeeCode: employeeCodeEl.value.trim(),
                        employeeNumber: employeeCodeEl.value.trim(),
                        employeeDepartment: employeeDepartmentEl.value.trim(),
                        employeePosition: employeePositionEl.value.trim(),
                        employeeBranch: employeeBranchEl.value.trim(),
                        employeeLocation: employeeLocationEl.value.trim(),
                        receiptDate: new Date(receiptDateEl.value).toISOString(),
                        status: statusEl.value,
                        notes: (notesEl?.value || '').trim()
                    };

                    try {
                        const previousPpeSnapshot = Array.isArray(AppState.appData.ppe) ? [...AppState.appData.ppe] : [];
                        let recordsForServer = [];
                        let updatedRecordForServer = null;

                        // 1. حفظ البيانات فوراً في الذاكرة
                        if (isEdit) {
                            const index = AppState.appData.ppe.findIndex(p => p.id === ppeData.id);
                            if (index !== -1) {
                                const firstItem = equipmentItems[0] || { equipmentType: '', quantity: 0, shoeSize: '' };
                                const existing = AppState.appData.ppe[index] || {};
                                const updatedRecord = {
                                    ...existing,
                                    ...commonData,
                                    equipmentType: firstItem.equipmentType,
                                    quantity: firstItem.quantity,
                                    shoeSize: firstItem.shoeSize,
                                    createdAt: existing.createdAt || ppeData?.createdAt || new Date().toISOString(),
                                    updatedAt: new Date().toISOString()
                                };
                                AppState.appData.ppe[index] = updatedRecord;
                                updatedRecordForServer = updatedRecord;
                            }
                        } else {
                            const existingPPEData = AppState.appData.ppe || [];
                            const newItems = [];

                            equipmentItems.forEach(item => {
                                const allExisting = existingPPEData.concat(newItems);
                                const id = Utils.generateSequentialId('PPE', allExisting);
                                const record = {
                                    id,
                                    ...commonData,
                                    equipmentType: item.equipmentType,
                                    quantity: item.quantity,
                                    shoeSize: item.shoeSize,
                                    createdAt: new Date().toISOString(),
                                    updatedAt: new Date().toISOString()
                                };
                                newItems.push(record);
                                AppState.appData.ppe.push(record);
                            });
                            recordsForServer = newItems;
                        }

                        // 1.1 حفظ إلزامي في الخادم قبل إعلان النجاح
                        if (Utils.hasCloudBackendSync() && typeof Backend !== 'undefined' && Backend.sendToAppsScript) {
                            if (isEdit) {
                                if (!updatedRecordForServer) {
                                    throw new Error('تعذر تجهيز بيانات التعديل للحفظ في الخادم.');
                                }
                                const serverResult = await Backend.sendToAppsScript('updatePPE', {
                                    ppeId: updatedRecordForServer.id,
                                    updateData: updatedRecordForServer
                                });
                                if (!serverResult || serverResult.success !== true) {
                                    throw new Error(serverResult?.message || 'فشل حفظ تعديل الاستلام في قاعدة البيانات.');
                                }
                            } else {
                                for (const rec of recordsForServer) {
                                    const serverResult = await Backend.sendToAppsScript('addPPE', rec);
                                    if (!serverResult || serverResult.success !== true) {
                                        throw new Error(serverResult?.message || 'فشل حفظ الاستلام في قاعدة البيانات.');
                                    }
                                }
                            }
                        }
                        
                        // حفظ البيانات باستخدام window.DataManager
                        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                            window.DataManager.save();
                        } else {
                            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
                        }
                        
                        // 2. إغلاق النموذج فوراً بعد الحفظ في الذاكرة
                        modal.remove();
                        
                        // 3. عرض رسالة نجاح فورية
                        Notification.success(isEdit
                            ? PPE._t('module.ppe.notify.updateSuccess', 'تم تحديث الاستلام بنجاح')
                            : PPE._t('module.ppe.notify.saveSuccess', 'تم تسجيل الاستلام بنجاح'));
                        
                        // 4. استعادة الزر بعد النجاح
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalText;
                        }
                        
                        // 5. ✅ تحديث التبويب النشط فقط (أسرع من إعادة تحميل كامل)
                        this.refreshActiveTab({ skipRemote: true });
                        
                        // 6. معالجة المهام الخلفية (Google Sheets) في الخلفية
                        Backend.autoSave('PPE', AppState.appData.ppe).catch(error => {
                            Utils.safeError('خطأ في حفظ Google Sheets:', error);
                        });
                    } catch (error) {
                        // rollback عند فشل الحفظ بالخادم لمنع نجاح وهمي في الواجهة
                        if (typeof previousPpeSnapshot !== 'undefined') {
                            AppState.appData.ppe = previousPpeSnapshot;
                            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                                window.DataManager.save();
                            }
                        }
                        Notification.error(PPE._t('module.ppe.notify.saveRuntimeError', 'حدث خطأ أثناء الحفظ') + ': ' + (error.message || error));
                        
                        // استعادة الزر في حالة الخطأ
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = originalText;
                        }
                    }
                });
            }
        }, 200);
    },

    async loadPPEItemsForDropdown(selectedValue = null) {
        const equipmentTypeSelect = document.getElementById('ppe-equipment-type') 
            || document.querySelector('.ppe-equipment-type');
        if (!equipmentTypeSelect) return;

        try {
            const now = Date.now();
            const cacheValid = this.state.ppeItemsListCache &&
                this.state.ppeItemsListCacheTime &&
                (now - this.state.ppeItemsListCacheTime) < this.state.ppeItemsListCacheExpiry;

            // Load items from backend (with short TTL cache)
            let items = [];
            if (cacheValid) {
                items = Array.isArray(this.state.ppeItemsListCache) ? this.state.ppeItemsListCache : [];
            } else if (typeof Backend !== 'undefined' && Backend.sendToAppsScript) {
                const result = await Backend.sendToAppsScript('getPPEItemsList', {});
                if (result && result.success && result.data) {
                    items = result.data;
                    this.state.ppeItemsListCache = items;
                    this.state.ppeItemsListCacheTime = now;
                }
            }

            // Fallback: collect from existing PPE data
            if (items.length === 0) {
                const ppeList = AppState.appData.ppe || [];
                const uniqueTypes = [...new Set(ppeList.map(p => p.equipmentType).filter(Boolean))];
                items = uniqueTypes.map(type => ({ itemName: type, itemCode: '' }));
            }

            // Clear and populate dropdown
            equipmentTypeSelect.innerHTML = '<option value="">اختر النوع</option>';
            
            items.forEach(item => {
                const itemName = (item.itemName || '').trim();
                if (!itemName) return;
                
                const option = document.createElement('option');
                option.value = itemName;
                option.textContent = item.itemCode ? `${item.itemCode} - ${itemName}` : itemName;
                
                if (selectedValue && (itemName === selectedValue || item.itemCode === selectedValue)) {
                    option.selected = true;
                }
                
                equipmentTypeSelect.appendChild(option);
            });

            const optionsHTML = equipmentTypeSelect.innerHTML;
            this.state.ppeItemsOptionsHTML = optionsHTML;

            // حفظ خريطة الرصيد لكل صنف
            this.state.ppeItemsBalanceMap = {};
            items.forEach(item => {
                const name = (item.itemName || '').trim();
                if (name) {
                    this.state.ppeItemsBalanceMap[name] = parseFloat(item.balance || 0);
                }
            });

            // تحديث عرض الرصيد لجميع الصفوف
            this._updateAllBalanceDisplays();

            // مزامنة نفس الخيارات مع جميع قوائم الأنواع في صفوف الأصناف
            const allSelects = document.querySelectorAll('.ppe-equipment-type');
            allSelects.forEach(select => {
                if (select === equipmentTypeSelect) return;
                const previousValue = select.value;
                select.innerHTML = optionsHTML;
                if (previousValue) {
                    select.value = previousValue;
                }
            });
        } catch (error) {
            Utils.safeError('خطأ في تحميل قائمة مهمات الوقاية:', error);
            // بدون بنود افتراضية: إن توفر لدينا HTML سابق استخدمه، وإلا أبقِ خيار "اختر النوع" فقط
            equipmentTypeSelect.innerHTML = this.state.ppeItemsOptionsHTML || '<option value="">اختر النوع</option>';

            this._updateAllBalanceDisplays();

            const optionsHTML = equipmentTypeSelect.innerHTML;
            const allSelects = document.querySelectorAll('.ppe-equipment-type');
            allSelects.forEach(select => {
                if (select === equipmentTypeSelect) return;
                const previousValue = select.value;
                select.innerHTML = optionsHTML;
                if (previousValue) {
                    select.value = previousValue;
                }
            });
        }
    },

    _updateAllBalanceDisplays() {
        const map = this.state.ppeItemsBalanceMap || {};
        document.querySelectorAll('.ppe-item-row').forEach(row => {
            const select = row.querySelector('.ppe-equipment-type');
            const display = row.querySelector('.ppe-balance-display');
            const valueEl = row.querySelector('.ppe-balance-value');
            if (!select || !display || !valueEl) return;
            const selected = (select.value || '').trim();
            if (selected && map[selected] !== undefined) {
                valueEl.textContent = map[selected].toFixed(0);
                display.style.display = 'flex';
            } else {
                display.style.display = 'none';
            }
        });
    },

    async viewPPE(id) {
        const item = AppState.appData.ppe.find(p => p.id === id);
        if (!item) return;

        const t = (k, f) => this._t(k, f);
        const ut = (s) => Utils.escapeHTML(s);
        const stLabel = this.getDisplayStatus(item.status);
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        const idJs = String(item.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header" style="text-align: center; position: relative;">
                    <h2 class="modal-title" style="margin: 0 auto; text-align: center;">${ut(t('module.ppe.title.viewReceipt', 'تفاصيل الاستلام'))}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" style="position: absolute; left: 0; top: 50%; transform: translateY(-50%);">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="text-sm font-semibold text-gray-600">${ut(t('module.ppe.table.receiptNo', 'رقم الإيصال'))}:</label>
                                <p class="text-gray-800 font-mono font-semibold text-lg">${Utils.escapeHTML(item.receiptNumber || item.id || '')}</p>
                            </div>
                            <div>
                                <label class="text-sm font-semibold text-gray-600">${ut(t('module.ppe.table.employeeName', 'اسم الموظف'))}:</label>
                                <p class="text-gray-800">${Utils.escapeHTML(item.employeeName || '')}</p>
                            </div>
                            <div>
                                <label class="text-sm font-semibold text-gray-600">${ut(t('module.ppe.table.employeeCode', 'الكود الوظيفي'))}:</label>
                                <p class="text-gray-800">${Utils.escapeHTML(item.employeeCode || item.employeeNumber || '')}</p>
                            </div>
                            <div>
                                <label class="text-sm font-semibold text-gray-600">${ut(t('module.ppe.label.department', 'القسم'))}:</label>
                                <p class="text-gray-800">${Utils.escapeHTML(item.employeeDepartment || '')}</p>
                            </div>
                            <div>
                                <label class="text-sm font-semibold text-gray-600">${ut(t('module.ppe.label.position', 'المنصب'))}:</label>
                                <p class="text-gray-800">${Utils.escapeHTML(item.employeePosition || '')}</p>
                            </div>
                            <div>
                                <label class="text-sm font-semibold text-gray-600">${ut(t('module.ppe.label.branch', 'الفرع'))}:</label>
                                <p class="text-gray-800">${Utils.escapeHTML(item.employeeBranch || '')}</p>
                            </div>
                            <div>
                                <label class="text-sm font-semibold text-gray-600">${ut(t('module.ppe.label.location', 'الموقع'))}:</label>
                                <p class="text-gray-800">${Utils.escapeHTML(item.employeeLocation || '')}</p>
                            </div>
                            <div>
                                <label class="text-sm font-semibold text-gray-600">${ut(t('module.ppe.table.equipmentType', 'نوع المعدة'))}:</label>
                                <p class="text-gray-800">${Utils.escapeHTML(item.equipmentType || '')}</p>
                            </div>
                            <div>
                                <label class="text-sm font-semibold text-gray-600">${ut(t('module.ppe.table.quantity', 'الكمية'))}:</label>
                                <p class="text-gray-800">${item.quantity || 0}</p>
                            </div>
                            ${item.shoeSize ? `
                            <div>
                                <label class="text-sm font-semibold text-gray-600">مقاس الحذاء:</label>
                                <p class="text-gray-800 font-bold"><i class="fas fa-shoe-prints text-blue-600 ml-1"></i>${Utils.escapeHTML(item.shoeSize)}</p>
                            </div>
                            ` : ''}
                            <div>
                                <label class="text-sm font-semibold text-gray-600">${ut(t('module.ppe.table.receiptDate', 'تاريخ الاستلام'))}:</label>
                                <p class="text-gray-800">${item.receiptDate ? Utils.formatDate(item.receiptDate) : '-'}</p>
                            </div>
                            <div>
                                <label class="text-sm font-semibold text-gray-600">${ut(t('module.ppe.table.status', 'الحالة'))}:</label>
                                <span class="badge badge-${this.isStatusReceived(item.status) ? 'success' : 'warning'}">
                                    ${ut(stLabel)}
                                </span>
                            </div>
                        </div>
                        <div class="mt-4">
                            <label class="text-sm font-semibold text-gray-600">${ut(t('module.ppe.label.notes', 'ملاحظات'))}:</label>
                            <p class="text-gray-800 whitespace-pre-wrap">${Utils.escapeHTML(item.notes || t('module.ppe.notes.none', 'لا توجد ملاحظات'))}</p>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="display: flex; justify-content: center; gap: 10px;">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">${ut(t('module.common.close', 'إغلاق'))}</button>
                    <button class="btn-success" onclick="PPE.exportPDF('${idJs}');">
                        <i class="fas fa-file-pdf ml-2"></i>${ut(t('module.kpi.exportPDF', 'تصدير PDF'))}
                    </button>
                    <button class="btn-primary" onclick="PPE.showPPEForm(${JSON.stringify(item).replace(/"/g, '&quot;')}); this.closest('.modal-overlay').remove();">
                        <i class="fas fa-edit ml-2"></i>${ut(t('module.common.edit', 'تعديل'))}
                    </button>
                    <button class="btn-danger" onclick="PPE.deletePPE('${idJs}'); this.closest('.modal-overlay').remove();">
                        <i class="fas fa-trash ml-2"></i>${ut(t('module.ppe.btn.deleteReceipt', 'حذف'))}
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.applyModuleI18n(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async deletePPE(id) {
        if (!id) {
            Notification.error(this._t('module.ppe.notify.idMissing', 'معرف الاستلام غير موجود'));
            return;
        }

        const item = AppState.appData.ppe.find(p => p.id === id);
        if (!item) {
            Notification.error(this._t('module.ppe.notify.receiptNotFound', 'الاستلام غير موجود'));
            return;
        }

        const confirmMessage = `${this._t('module.ppe.confirm.delete', 'هل أنت متأكد من حذف هذا الاستلام؟')}\n\n${item.receiptNumber || item.id} — ${item.employeeName || ''}`;

        if (!confirm(confirmMessage)) {
            return;
        }

        Loading.show();

        try {
            if (typeof Backend !== 'undefined' && Backend.sendToAppsScript) {
                const result = await Backend.sendToAppsScript('deletePPE', { ppeId: id });
                
                if (result && result.success) {
                    // حذف من AppState
                    if (AppState.appData.ppe) {
                        AppState.appData.ppe = AppState.appData.ppe.filter(p => p.id !== id);
                    }
                    
                    Notification.success(this._t('module.ppe.notify.deleteSuccess', 'تم حذف الاستلام بنجاح'));
                    await this.load(); // إعادة تحميل البيانات
                } else {
                    Notification.error(result?.message || this._t('module.ppe.notify.deleteError', 'حدث خطأ أثناء حذف الاستلام'));
                }
            } else {
                // Fallback to local storage
                if (AppState.appData.ppe) {
                    AppState.appData.ppe = AppState.appData.ppe.filter(p => p.id !== id);
                    Notification.success(this._t('module.ppe.notify.deleteSuccess', 'تم حذف الاستلام بنجاح'));
                    await this.load();
                } else {
                    Notification.error(this._t('module.ppe.empty.noReceipts', 'لا توجد بيانات'));
                }
            }
        } catch (error) {
            Utils.safeError('❌ خطأ في حذف الاستلام:', error);
            Notification.error(this._t('module.ppe.notify.deleteError', 'حدث خطأ أثناء حذف الاستلام') + ': ' + (error.message || error));
        } finally {
            Loading.hide();
        }
    },

    async exportPDF(id) {
        const item = AppState.appData.ppe.find(p => p.id === id);
        if (!item) {
            Notification.error(this._t('module.ppe.notify.receiptNotFound', 'الاستلام غير موجود'));
            return;
        }

        try {
            Loading.show();

            const formCode = item.receiptNumber || `PPE-${item.id?.substring(0, 8) || 'UNKNOWN'}`;
            const escape = (value) => Utils.escapeHTML(value || '');
            const formatDate = (value) => value ? Utils.formatDate(value) : '-';
            const content = `
                <table>
                    <tr><th>رقم الإيصال</th><td>${escape(item.receiptNumber || item.id)}</td></tr>
                    <tr><th>اسم الموظف</th><td>${escape(item.employeeName)}</td></tr>
                    <tr><th>الكود الوظيفي</th><td>${escape(item.employeeCode || item.employeeNumber)}</td></tr>
                    <tr><th>القسم</th><td>${escape(item.employeeDepartment)}</td></tr>
                    <tr><th>المنصب</th><td>${escape(item.employeePosition)}</td></tr>
                    <tr><th>الفرع</th><td>${escape(item.employeeBranch)}</td></tr>
                    <tr><th>الموقع</th><td>${escape(item.employeeLocation)}</td></tr>
                    <tr><th>نوع المعدة</th><td>${escape(item.equipmentType)}</td></tr>
                    <tr><th>الكمية</th><td>${item.quantity || 0}</td></tr>
                    <tr><th>تاريخ الاستلام</th><td>${formatDate(item.receiptDate)}</td></tr>
                    <tr><th>الحالة</th><td>${escape(item.status)}</td></tr>
                </table>
            `;

            const qrPayload = {
                type: 'PPE',
                id: item.id,
                code: formCode,
                url: `${window.location.origin}/ppe/${item.id}`
            };

            const htmlContent = (typeof FormHeader !== 'undefined' && typeof FormHeader.generatePDFHTML === 'function')
                ? FormHeader.generatePDFHTML(
                    formCode,
                    this._t('module.ppe.pdf.receiptTitle', 'إيصال استلام مهمات الوقاية الشخصية'),
                    content,
                    false,
                    true,
                    {
                        version: '1.0',
                        releaseDate: item.receiptDate || item.createdAt,
                        revisionDate: item.updatedAt || item.receiptDate || item.createdAt,
                        qrData: qrPayload
                    },
                    item.createdAt,
                    item.updatedAt || item.receiptDate || item.createdAt
                )
                : `<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><style>@page { size: A4 portrait; margin: 1cm; } @media print { @page { size: A4 portrait; margin: 1cm; } body { padding: 0; } }</style><title>${Utils.escapeHTML(this._t('module.ppe.pdf.pageTitle', 'إيصال مهمات الوقاية الشخصية'))}</title></head><body>${content}</body></html>`;

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
                        }, 800);
                    }, 500);
                };
            } else {
                Loading.hide();
                Notification.error(this._t('module.ppe.notify.pdfBlocked', 'يرجى السماح للنوافذ المنبثقة لعرض التقرير'));
            }
        } catch (error) {
            Loading.hide();
            Utils.safeError('خطأ في تصدير PDF للاستلام:', error);
            Notification.error(this._t('module.ppe.notify.pdfError', 'فشل في تصدير PDF') + ': ' + error.message);
        }
    },

    /**
     * عرض مصوة مهمات الوقاية لكل موظ حسب الوظية
     */
    async showPPEMatrix() {
        const t = (k, f) => this._t(k, f);
        const ut = (s) => Utils.escapeHTML(s);
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 1400px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-table ml-2"></i>
                        ${ut(t('module.ppe.title.matrix', 'مصفوفة مهمات الوقاية الشخصية لكل موظف'))}
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="mb-4">
                        <div class="flex gap-2 items-center">
                            <input type="text" id="ppe-matrix-search" class="form-input" style="max-width: 400px;" 
                                placeholder="${ut(t('module.ppe.matrix.searchPlaceholder', ''))}">
                            <button id="add-ppe-matrix-btn" class="btn-primary">
                                <i class="fas fa-plus ml-2"></i>
                                ${ut(t('module.ppe.matrix.addEdit', 'إضافة/تعديل مصفوفة لوظيفة'))}
                            </button>
                        </div>
                    </div>
                    <div id="ppe-matrix-content">
                        ${await this.renderPPEMatrix()}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">${ut(t('module.common.close', 'إغلاق'))}</button>
                    <button class="btn-primary" onclick="PPE.exportPPEMatrix()">
                        <i class="fas fa-file-excel ml-2"></i>${ut(t('module.ppe.matrix.exportExcel', 'تصدير Excel'))}
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.applyModuleI18n(modal);

        // Setup search
        const searchInput = document.getElementById('ppe-matrix-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterPPEMatrix(e.target.value.trim());
            });
        }

        // Setup add matrix button
        const addMatrixBtn = document.getElementById('add-ppe-matrix-btn');
        if (addMatrixBtn) {
            addMatrixBtn.addEventListener('click', () => {
                this.showAddPPEMatrixForm();
            });
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async renderPPEMatrix() {
        const t = (k, f) => this._t(k, f);
        const ut = (s) => Utils.escapeHTML(s);
        const employees = AppState.appData.employees || [];
        const matrixByCode = AppState.appData.employeePPEMatrixByCode || {};
        const ppeList = AppState.appData.ppe || [];

        // ✅ إرجاع التصميم السابق: عرض مصفوفة لكل موظف بشكل فردي
        if (employees.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-table text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-500">${ut(t('module.ppe.empty.matrixNoEmployees', 'لا توجد بيانات موظفين'))}</p>
                </div>
            `;
        }

        // إنشاء مصفوفة لكل موظف
        const matrixRows = employees.map(emp => {
            const code = emp.employeeNumber || emp.sapId || '';
            const name = emp.name || emp.employeeName || '-';
            const position = emp.position || t('module.ppe.label.undefinedDept', 'غير محدد');
            const department = emp.department || '-';
            
            // الحصول على مهمات الوقاية المطلوبة من المصفوفة
            const requiredPPE = matrixByCode[code] || [];
            
            // الحصول على مهمات الوقاية المستلمة من جدول PPE
            const employeePPE = ppeList.filter(p => 
                (p.employeeCode === code || p.employeeNumber === code)
            );
            const receivedPPE = [...new Set(employeePPE.map(p => p.equipmentType).filter(Boolean))];

            return {
                code,
                name,
                position,
                department,
                requiredPPE,
                receivedPPE
            };
        });

        return `
            <div class="table-wrapper" style="overflow-x: auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>${ut(t('module.ppe.table.matrix.code', 'الكود الوظيفي'))}</th>
                            <th>${ut(t('module.ppe.table.matrix.name', 'اسم الموظف'))}</th>
                            <th>${ut(t('module.ppe.table.matrix.job', 'الوظيفة'))}</th>
                            <th>${ut(t('module.ppe.table.matrix.dept', 'القسم/الإدارة'))}</th>
                            <th>${ut(t('module.ppe.table.matrix.required', 'مهمات الوقاية المطلوبة'))}</th>
                            <th>${ut(t('module.ppe.table.matrix.received', 'مهمات الوقاية المستلمة'))}</th>
                            <th>${ut(t('module.ppe.table.actions', 'الإجراءات'))}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${matrixRows.map(emp => {
            const requiredPPEHtml = emp.requiredPPE.length > 0 
                ? emp.requiredPPE.map(ppe => `<span class="badge badge-success mr-1 mb-1">${Utils.escapeHTML(ppe)}</span>`).join('')
                : `<span class="text-gray-500 text-sm">${ut(t('module.ppe.matrix.notSet', 'لم يتم تحديد'))}</span>`;
            
            const receivedPPEHtml = emp.receivedPPE.length > 0
                ? emp.receivedPPE.map(ppe => `<span class="badge badge-info mr-1 mb-1">${Utils.escapeHTML(ppe)}</span>`).join('')
                : `<span class="text-gray-500 text-sm">${ut(t('module.ppe.matrix.noneReceived', 'لا توجد'))}</span>`;

            return `
                                <tr data-employee-code="${Utils.escapeHTML(emp.code)}" data-employee-name="${Utils.escapeHTML(emp.name)}" data-position="${Utils.escapeHTML(emp.position)}">
                                    <td><strong class="font-mono">${Utils.escapeHTML(emp.code || '-')}</strong></td>
                                    <td>${Utils.escapeHTML(emp.name)}</td>
                                    <td>${Utils.escapeHTML(emp.position)}</td>
                                    <td>${Utils.escapeHTML(emp.department)}</td>
                                    <td>
                                        <div class="flex flex-wrap gap-1">
                                            ${requiredPPEHtml}
                                        </div>
                                    </td>
                                    <td>
                                        <div class="flex flex-wrap gap-1">
                                            ${receivedPPEHtml}
                                        </div>
                                    </td>
                                    <td>
                                        <button onclick="PPE.editEmployeePPEMatrix('${Utils.escapeHTML(emp.code)}')" class="btn-icon btn-icon-primary" title="${ut(t('module.common.edit', 'تعديل'))}">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                    </td>
                                </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    filterPPEMatrix(searchTerm) {
        const tbody = document.querySelector('#ppe-matrix-content tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr[data-employee-code]');
        rows.forEach(row => {
            const code = row.getAttribute('data-employee-code') || '';
            const name = row.getAttribute('data-employee-name') || '';
            const position = row.getAttribute('data-position') || '';
            const searchLower = searchTerm.toLowerCase();

            if (!searchTerm || 
                code.toLowerCase().includes(searchLower) ||
                name.toLowerCase().includes(searchLower) ||
                position.toLowerCase().includes(searchLower)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    },

    async showAddPPEMatrixForm(position = null) {
        const isEdit = !!position;
        const matrix = AppState.appData.employeePPEMatrix || {};
        const ppeList = AppState.appData.ppe || [];
        const ppeTypes = [...new Set(ppeList.map(p => p.equipmentType).filter(Boolean))];
        const employees = AppState.appData.employees || [];
        const positions = [...new Set(employees.map(e => e.position).filter(Boolean))];
        const matrixData = position ? matrix[position] : null;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-plus-circle ml-2"></i>
                        ${isEdit ? 'تعديل مصفوفة مهمات الوقاية' : 'إضاءة مصفوفة مهمات الوقاية لوظية'}
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="ppe-matrix-form" class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">الوظيفة *</label>
                                ${isEdit ? `
                                    <input type="text" id="ppe-matrix-position" value="${Utils.escapeHTML(position)}" class="form-input" readonly>
                                ` : `
                                    <select id="ppe-matrix-position" required class="form-input">
                                        <option value="">اختر الوظيفة</option>
                                        ${positions.map(p => `
                                            <option value="${Utils.escapeHTML(p)}" ${matrix[p] ? 'disabled' : ''}>${Utils.escapeHTML(p)}${matrix[p] ? ' (موجودة بالفعل)' : ''}</option>
                                        `).join('')}
                                        <option value="__custom__">إضافة وظيفة جديدة</option>
                                    </select>
                                    <input type="text" id="ppe-matrix-position-custom" class="form-input mt-2" style="display: none;" placeholder="أدخل اسم الوظيفة">
                                `}
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">مهمات الوقاية المطلوبة لهذه الوظيفة *</label>
                            <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    ${ppeTypes.map((type, index) => `
                                        <label class="flex items-center p-2 border rounded cursor-pointer hover:bg-blue-50 transition-colors">
                                            <input type="checkbox" name="ppe-type" value="${Utils.escapeHTML(type)}" 
                                                ${matrixData && matrixData.requiredPPE && matrixData.requiredPPE.includes(type) ? 'checked' : ''}
                                                class="ml-2 rounded border-gray-300 text-blue-600">
                                            <span class="text-sm font-medium">${Utils.escapeHTML(type)}</span>
                                        </label>
                                    `).join('')}
                                    ${ppeTypes.length === 0 ? `
                                        <div class="col-span-3 text-center text-gray-500 py-4">
                                            لا توجد أنواع مهمات وقاية مسجلة. يرجى إضافة استلامات مهمات وقاية أولاً.
                                        </div>
                                    ` : ''}
                                </div>
                                <div class="mt-4">
                                    <input type="text" id="ppe-matrix-custom-type" class="form-input" placeholder="أو أدخل نوع مهمة وقاية مخصصة">
                                    <button type="button" onclick="
                                        const customType = document.getElementById('ppe-matrix-custom-type');
                                        if(customType && customType.value.trim()) {
                                            const container = document.querySelector('#ppe-matrix-form .grid');
                                            const newLabel = document.createElement('label');
                                            newLabel.className = 'flex items-center p-2 border rounded cursor-pointer hover:bg-blue-50 transition-colors';
                                            const typeValue = customType.value.trim();
                                            newLabel.innerHTML = '<input type=\\'checkbox\\' name=\\'ppe-type\\' value=\\'' + typeValue + '\\' checked class=\\'ml-2 rounded border-gray-300 text-blue-600\\'><span class=\\'text-sm font-medium\\'>' + typeValue + '</span>';
                                            container.appendChild(newLabel);
                                            customType.value = '';
                                        }
                                    " class="btn-secondary mt-2">
                                        <i class="fas fa-plus ml-2"></i>إضافة
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p class="text-sm text-blue-800">
                                <i class="fas fa-info-circle ml-1"></i>
                                <strong>ملاحظة:</strong> سيتم تطبيق هذه المصفوفة على جميع الموظفين الذين لديهم هذه الوظيفة.
                            </p>
                        </div>
                        
                        <div class="flex items-center justify-end gap-4 pt-4 border-t">
                            <button type="button" class="btn-secondary" data-action="close">إلغاء</button>
                            <button type="submit" class="btn-primary">
                                <i class="fas fa-save ml-2"></i>${isEdit ? 'حفظ التعديلات' : 'إضافة المصفوفة'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // معالج زر الإغلاق مع التحقق من التغييرات غير المحفوظة
        let hasUnsavedChanges = false;
        const closeBtn = modal.querySelector('[data-action="close"]');
        const modalCloseBtn = modal.querySelector('.modal-close');
        
        const closeModal = () => {
            if (hasUnsavedChanges && !isSaving) {
                const ok = confirm('تنبيه: لديك تغييرات غير محفوظة.\n\nهل تريد الإغلاق دون حفظ؟');
                if (!ok) return;
            }
            modal.remove();
        };

        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }
        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', closeModal);
        }

        // Handle custom position input
        const positionSelect = document.getElementById('ppe-matrix-position');
        const customPositionInput = document.getElementById('ppe-matrix-position-custom');
        if (positionSelect && customPositionInput) {
            positionSelect.addEventListener('change', () => {
                if (positionSelect.value === '__custom__') {
                    customPositionInput.style.display = 'block';
                    customPositionInput.required = true;
                } else {
                    customPositionInput.style.display = 'none';
                    customPositionInput.required = false;
                }
            });
        }

        const form = modal.querySelector('#ppe-matrix-form');
        let isSaving = false;

        // تتبع التغييرات في النموذج
        form.addEventListener('change', () => {
            hasUnsavedChanges = true;
        });
        form.addEventListener('input', () => {
            hasUnsavedChanges = true;
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (isSaving) return; // منع الإرسال المتكرر

            const selectedPosition = isEdit ? position : (positionSelect?.value === '__custom__' ? customPositionInput?.value.trim() : positionSelect?.value);
            if (!selectedPosition) {
                Notification.error('يرجى تحديد الوظيفة');
                return;
            }

            const checkedPPE = Array.from(form.querySelectorAll('input[name="ppe-type"]:checked')).map(cb => cb.value);
            if (checkedPPE.length === 0) {
                Notification.error('يرجى تحديد مهمات وقاية واحدة على الأقل');
                return;
            }

            isSaving = true;
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn?.innerHTML;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i> جاري الحفظ...';
            }

            try {
                // الحصول على جميع الموظفين بهذه الوظيفة (بناءً على الكود الوظيفي من جدول قاعدة بيانات الموظفين)
                const employeesWithPosition = employees.filter(e => e.position === selectedPosition).map(e => e.employeeNumber || e.sapId || '');

                if (!AppState.appData.employeePPEMatrix) {
                    AppState.appData.employeePPEMatrix = {};
                }

                const matrixData = AppState.appData.employeePPEMatrix[selectedPosition] || {};

                // تحديث مصفوفة مهمات الوقاية للوظيفة (مرتبطة بقاعدة بيانات الموظفين عبر الكود الوظيفي)
                AppState.appData.employeePPEMatrix[selectedPosition] = {
                    requiredPPE: checkedPPE,
                    employees: employeesWithPosition, // قائمة الكود الوظيفي للموظفين بهذه الوظيفة
                    updatedAt: new Date().toISOString(),
                    createdAt: matrixData?.createdAt || new Date().toISOString()
                };

                // تحديث مصفوفة مهمات الوقاية لكل موظف بناءً على الكود الوظيفي
                if (!AppState.appData.employeePPEMatrixByCode) {
                    AppState.appData.employeePPEMatrixByCode = {};
                }

                employeesWithPosition.forEach(code => {
                    if (code) {
                        if (!AppState.appData.employeePPEMatrixByCode[code]) {
                            AppState.appData.employeePPEMatrixByCode[code] = [];
                        }
                        // إضافة مهمات الوقاية المطلوبة لهذا الموظف (إذا لم تكن موجودة)
                        checkedPPE.forEach(ppe => {
                            if (!AppState.appData.employeePPEMatrixByCode[code].includes(ppe)) {
                                AppState.appData.employeePPEMatrixByCode[code].push(ppe);
                            }
                        });
                    }
                });

                // ✅ 1. حفظ البيانات في الذاكرة فوراً
                if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                    window.DataManager.save();
                } else {
                    Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
                }

                // ✅ 2. إغلاق النموذج فوراً بعد الحفظ في الذاكرة
                hasUnsavedChanges = false;
                Notification.success('تم ' + (isEdit ? 'تحديث' : 'إضافة') + ' مصفوفة مهمات الوقاية للوظيفة "' + selectedPosition + '" بنجاح');
                modal.remove();
                this.showPPEMatrix();

                // ✅ 3. معالجة المهام الخلفية في الخلفية (بدون انتظار)
                Promise.allSettled([
                    // حفظ في Google Sheets
                    Backend.autoSave('PPEMatrix', AppState.appData.employeePPEMatrix).catch(error => {
                        Utils.safeError('خطأ في حفظ Google Sheets:', error);
                        return { success: false, error };
                    }),
                    // حفظ مصفوفة الموظفين أيضاً
                    Backend.autoSave('EmployeePPEMatrixByCode', AppState.appData.employeePPEMatrixByCode).catch(error => {
                        Utils.safeError('خطأ في حفظ مصفوفة الموظفين في Google Sheets:', error);
                        return { success: false, error };
                    })
                ]).then((results) => {
                    // التحقق من نجاح المهام الخلفية (اختياري - فقط للتسجيل)
                    const allSucceeded = results.every(r => r.status === 'fulfilled');
                    if (!allSucceeded) {
                        Utils.safeWarn('⚠️ بعض المهام الخلفية لم تكتمل بنجاح، لكن البيانات محفوظة محلياً');
                    }
                }).catch(error => {
                    Utils.safeError('خطأ في معالجة المهام الخلفية:', error);
                });

            } catch (error) {
                Notification.error(PPE._t('module.ppe.notify.saveRuntimeError', 'حدث خطأ') + ': ' + error.message);
                Utils.safeError('خطأ في حفظ مصفوفة مهمات الوقاية:', error);
                
                // استعادة الزر في حالة الخطأ
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
                isSaving = false;
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (hasUnsavedChanges && !isSaving) {
                    const ok = confirm('تنبيه: لديك تغييرات غير محفوظة.\n\nهل تريد الإغلاق دون حفظ؟');
                    if (!ok) return;
                }
                modal.remove();
            }
        });
    },

    async editPPEMatrix(position) {
        this.showAddPPEMatrixForm(position);
    },

    /**
     * ✅ تعديل مصفوفة مهمات الوقاية لموظف فردي (التصميم السابق)
     */
    async editEmployeePPEMatrix(employeeCode) {
        const employees = AppState.appData.employees || [];
        const employee = employees.find(e => (e.employeeNumber || e.sapId) === employeeCode);
        
        if (!employee) {
            Notification.error('الموظف غير موجود');
            return;
        }

        const matrixByCode = AppState.appData.employeePPEMatrixByCode || {};
        const currentPPE = matrixByCode[employeeCode] || [];
        const ppeList = AppState.appData.ppe || [];
        const ppeTypes = [...new Set(ppeList.map(p => p.equipmentType).filter(Boolean))];

        // إضافة أنواع مهمات الوقاية المحددة مسبقاً
        const predefinedPPE = [
            'خوذة أمان', 'نظارات وقاية', 'قفازات', 'أحذية أمان',
            'سترة عاكسة', 'سدادات أذن', 'كمامة', 'بدلة واقية',
            'حزام أمان', 'معدات حماية تنفسية'
        ];
        const allPPETypes = [...new Set([...predefinedPPE, ...ppeTypes])];

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-edit ml-2"></i>
                        تعديل مصفوفة مهمات الوقاية - ${Utils.escapeHTML(employee.name || employeeCode)}
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="mb-4 p-3 bg-gray-50 rounded">
                        <p><strong>الكود الوظيفي:</strong> ${Utils.escapeHTML(employeeCode)}</p>
                        <p><strong>اسم الموظف:</strong> ${Utils.escapeHTML(employee.name || '-')}</p>
                        <p><strong>الوظيفة:</strong> ${Utils.escapeHTML(employee.position || '-')}</p>
                        <p><strong>القسم:</strong> ${Utils.escapeHTML(employee.department || '-')}</p>
                    </div>
                    <form id="employee-ppe-matrix-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">مهمات الوقاية المطلوبة *</label>
                            <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    ${allPPETypes.map((type, index) => `
                                        <label class="flex items-center p-2 border rounded cursor-pointer hover:bg-blue-50 transition-colors">
                                            <input type="checkbox" name="ppe-type" value="${Utils.escapeHTML(type)}" 
                                                ${currentPPE.includes(type) ? 'checked' : ''}
                                                class="ml-2 rounded border-gray-300 text-blue-600">
                                            <span class="text-sm font-medium">${Utils.escapeHTML(type)}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center justify-end gap-4 pt-4 border-t">
                            <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
                            <button type="submit" class="btn-primary">
                                <i class="fas fa-save ml-2"></i>حفظ
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const form = modal.querySelector('#employee-ppe-matrix-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const checkboxes = form.querySelectorAll('input[name="ppe-type"]:checked');
            const selectedPPE = Array.from(checkboxes).map(cb => cb.value);

            try {
                if (!AppState.appData.employeePPEMatrixByCode) {
                    AppState.appData.employeePPEMatrixByCode = {};
                }
                
                AppState.appData.employeePPEMatrixByCode[employeeCode] = selectedPPE;

                // حفظ البيانات
                if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                    window.DataManager.save();
                }

                Notification.success('تم تحديث مصفوفة مهمات الوقاية للموظف بنجاح');
                modal.remove();
                
                // تحديث عرض المصفوفة
                const contentContainer = document.getElementById('ppe-matrix-content');
                if (contentContainer) {
                    contentContainer.innerHTML = await this.renderPPEMatrix();
                }

                // حفظ في Google Sheets في الخلفية
                if (typeof Backend !== 'undefined' && Backend.autoSave) {
                    Backend.autoSave('EmployeePPEMatrixByCode', AppState.appData.employeePPEMatrixByCode).catch(error => {
                        Utils.safeError('خطأ في حفظ Google Sheets:', error);
                    });
                }
            } catch (error) {
                Notification.error(PPE._t('module.ppe.notify.saveRuntimeError', 'حدث خطأ') + ': ' + error.message);
                Utils.safeError('خطأ في حفظ مصفوفة مهمات الوقاية:', error);
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async viewPositionEmployees(position) {
        const matrix = AppState.appData.employeePPEMatrix || {};
        const matrixData = matrix[position];
        const employees = AppState.appData.employees || [];
        const positionEmployees = employees.filter(e => e.position === position);

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';

        // بناء HTML للجدول
        const requiredPPEHtml = matrixData && matrixData.requiredPPE ?
            matrixData.requiredPPE.map(ppe => `<span class="badge badge-success mr-2">${Utils.escapeHTML(ppe)}</span>`).join('') :
            'لم يتم تحديد';

        let employeesTableHtml = '';
        if (positionEmployees.length > 0) {
            employeesTableHtml = `
                <div class="table-wrapper" style="overflow-x: auto;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>الكود الوظيفي</th>
                                <th>اسم الموظف</th>
                                <th>القسم/الإدارة</th>
                                <th>مهمات الوقاية المستلمة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${positionEmployees.map(emp => {
                const code = emp.employeeNumber || emp.sapId || '';
                // الحصول على مهمات الوقاية المستلمة من جدول PPE
                const employeePPE = (AppState.appData.ppe || []).filter(p =>
                    (p.employeeCode === code || p.employeeNumber === code)
                );
                // الحصول على مهمات الوقاية المطلوبة من المصفوفة (مرتبطة بالكود الوظيفي)
                const matrixByCode = AppState.appData.employeePPEMatrixByCode || {};
                const requiredPPE = matrixByCode[code] || [];

                const receivedPPEHtml = employeePPE.length > 0 ?
                    employeePPE.map(p => `<span class="badge badge-info">${Utils.escapeHTML(p.equipmentType || '')}</span>`).join('') :
                    '<span class="text-gray-500 text-sm">لا توجد</span>';

                const requiredPPEHtml = requiredPPE.length > 0 ?
                    requiredPPE.map(ppe => `<span class="badge badge-success">${Utils.escapeHTML(ppe)}</span>`).join('') :
                    '<span class="text-gray-500 text-sm">لم يتم تحديد</span>';

                return `
                                    <tr>
                                        <td><strong>${Utils.escapeHTML(code || '-')}</strong></td>
                                        <td>${Utils.escapeHTML(emp.name || '-')}</td>
                                        <td>${Utils.escapeHTML(emp.department || '-')}</td>
                                        <td>
                                            <div class="mb-2">
                                                <strong class="text-sm text-gray-600">المطلوبة:</strong>
                                                <div class="flex flex-wrap gap-2 mt-1">
                                                    ${requiredPPEHtml}
                                                </div>
                                            </div>
                                            <div>
                                                <strong class="text-sm text-gray-600">المستلمة:</strong>
                                                <div class="flex flex-wrap gap-2 mt-1">
                                                    ${receivedPPEHtml}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                `;
            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            employeesTableHtml = `
                <div class="empty-state">
                    <i class="fas fa-users text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-500">لا يوجد موظفين بهذه الوظيفة</p>
                </div>
            `;
        }

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-users ml-2"></i>
                        الموظفين في الوظيفة: ${Utils.escapeHTML(position)}
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="mb-4">
                        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p class="text-sm text-blue-800">
                                <strong>مهمات الوقاية المطلوبة:</strong>
                                ${requiredPPEHtml}
                            </p>
                        </div>
                    </div>
                    ${employeesTableHtml}
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    /** رؤوس قالب/تصدير سجل الاستلامات (عربي ↔ مفتاح الحقل) */
    _ppeReceiptExcelFieldDefs() {
        return [
            { key: 'id', ar: 'معرف السجل', en: 'id' },
            { key: 'receiptNumber', ar: 'رقم الإيصال', en: 'receiptNumber' },
            { key: 'employeeName', ar: 'اسم الموظف', en: 'employeeName' },
            { key: 'employeeCode', ar: 'الكود الوظيفي', en: 'employeeCode' },
            { key: 'employeeDepartment', ar: 'القسم', en: 'employeeDepartment' },
            { key: 'equipmentType', ar: 'نوع المعدة', en: 'equipmentType' },
            { key: 'quantity', ar: 'الكمية', en: 'quantity' },
            { key: 'receiptDate', ar: 'تاريخ الاستلام', en: 'receiptDate' },
            { key: 'status', ar: 'الحالة', en: 'status' }
        ];
    },

    /** رؤوس قالب/تصدير المخزون */
    _ppeStockExcelFieldDefs() {
        return [
            { key: 'itemId', ar: 'معرف الصنف', en: 'itemId' },
            { key: 'itemCode', ar: 'كود الصنف', en: 'itemCode' },
            { key: 'itemName', ar: 'اسم الصنف', en: 'itemName' },
            { key: 'category', ar: 'الفئة', en: 'category' },
            { key: 'stock_IN', ar: 'الوارد', en: 'stock_IN' },
            { key: 'stock_OUT', ar: 'المنصرف', en: 'stock_OUT' },
            { key: 'balance', ar: 'الرصيد', en: 'balance' },
            { key: 'minThreshold', ar: 'حد إعادة الطلب', en: 'minThreshold' },
            { key: 'supplier', ar: 'المورد', en: 'supplier' }
        ];
    },

    _ppeBuildHeaderAliasMap(defs) {
        const m = {};
        defs.forEach((d) => {
            m[String(d.ar || '').trim()] = d.key;
            m[String(d.en || '').trim().toLowerCase()] = d.key;
        });
        return m;
    },

    _ppeFormatCellForExcel(val) {
        if (val === null || val === undefined) return '';
        if (val instanceof Date) {
            const y = val.getFullYear();
            const mo = String(val.getMonth() + 1).padStart(2, '0');
            const da = String(val.getDate()).padStart(2, '0');
            return `${y}-${mo}-${da}`;
        }
        if (typeof val === 'object' && val !== null && typeof val.toISOString === 'function') {
            try {
                const d = new Date(val);
                if (!isNaN(d.getTime())) return this._ppeFormatCellForExcel(d);
            } catch (e) { /* ignore */ }
        }
        return val;
    },

    async exportReceiptsExcel() {
        try {
            if (typeof XLSX === 'undefined') {
                Notification.error(this._t('module.ppe.notify.xlsxMissing', 'مكتبة SheetJS غير محمّلة. يرجى تحديث الصفحة'));
                return;
            }
            Loading.show(this._t('module.ppe.excel.exportingReceipts', 'جاري تصدير سجل الاستلامات…'));
            const defs = this._ppeReceiptExcelFieldDefs();
            const list = this.getFilteredPpeReceipts(AppState.appData.ppe || []);
            const rows = list.map((item) => {
                const o = {};
                defs.forEach((d) => {
                    let v = item[d.key];
                    if (d.key === 'receiptDate') v = this._ppeFormatCellForExcel(v || item.receiptDate);
                    else if (d.key === 'quantity') v = v !== undefined && v !== null ? Number(v) : '';
                    o[d.ar] = v !== undefined && v !== null ? v : '';
                });
                return o;
            });
            const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [defs.reduce((acc, d) => { acc[d.ar] = ''; return acc; }, {})]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, this._t('module.ppe.excel.sheetReceipts', 'سجل الاستلامات'));
            const dateStr = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `PPE_استلامات_${dateStr}.xlsx`);
            Loading.hide();
            Notification.success(this._t('module.ppe.excel.exportReceiptsOk', 'تم تصدير Excel لسجل الاستلامات'));
        } catch (error) {
            Loading.hide();
            Utils.safeError('exportReceiptsExcel', error);
            Notification.error(this._t('module.ppe.excel.exportErr', 'فشل التصدير') + ': ' + (error.message || error));
        }
    },

    downloadReceiptsExcelTemplate() {
        try {
            if (typeof XLSX === 'undefined') {
                Notification.error(this._t('module.ppe.notify.xlsxMissing', 'مكتبة SheetJS غير محمّلة. يرجى تحديث الصفحة'));
                return;
            }
            const defs = this._ppeReceiptExcelFieldDefs();
            const headerRow = defs.map((d) => d.ar);
            const ws = XLSX.utils.aoa_to_sheet([headerRow]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, this._t('module.ppe.excel.sheetReceipts', 'سجل الاستلامات'));
            XLSX.writeFile(wb, `PPE_قالب_استلامات_${new Date().toISOString().slice(0, 10)}.xlsx`);
            Notification.success(this._t('module.ppe.excel.templateDownloadOk', 'تم تنزيل القالب'));
        } catch (error) {
            Notification.error(this._t('module.ppe.excel.templateErr', 'فشل تنزيل القالب') + ': ' + error.message);
        }
    },

    async importReceiptsExcel(file) {
        if (!file) return;
        if (typeof XLSX === 'undefined') {
            Notification.error(this._t('module.ppe.notify.xlsxMissing', 'مكتبة SheetJS غير محمّلة. يرجى تحديث الصفحة'));
            return;
        }
        const defs = this._ppeReceiptExcelFieldDefs();
        const alias = this._ppeBuildHeaderAliasMap(defs);
        try {
            Loading.show(this._t('module.ppe.excel.importingReceipts', 'جاري استيراد الاستلامات…'));
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array', cellDates: true });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
            if (!aoa || aoa.length < 2) {
                Loading.hide();
                Notification.warning(this._t('module.ppe.excel.importEmpty', 'الملف فارغ أو لا يحتوي صف بيانات بعد الرؤوس'));
                return;
            }
            const headerRow = (aoa[0] || []).map((c) => String(c || '').trim());
            const colToKey = headerRow.map((h) => alias[h] || alias[String(h || '').trim().toLowerCase()] || '');

            // ✅ تحميل البيانات الحالية لاكتشاف التكرار قبل الإرسال
            const existingList = Array.isArray(AppState.appData.ppe) ? AppState.appData.ppe : [];
            const existingIds = new Set(existingList
                .map((r) => String((r && (r.id || r.receiptNumber)) || '').trim())
                .filter(Boolean));

            let ok = 0;
            let fail = 0;
            const duplicates = []; // {row, id, label}
            for (let r = 1; r < aoa.length; r++) {
                const row = aoa[r];
                if (!row || !row.some((c) => String(c || '').trim() !== '')) continue;
                const obj = {};
                colToKey.forEach((key, i) => {
                    if (!key) return;
                    let v = row[i];
                    if (v instanceof Date) {
                        obj[key] = v.toISOString();
                    } else if (key === 'quantity') {
                        obj[key] = parseFloat(String(v).replace(/,/g, '')) || 0;
                    } else if (key === 'receiptDate' && v !== '' && v !== null && v !== undefined) {
                        const d = v instanceof Date ? v : new Date(v);
                        obj[key] = !isNaN(d.getTime()) ? d.toISOString() : String(v);
                    } else {
                        obj[key] = v !== undefined && v !== null ? String(v).trim() : '';
                    }
                });
                if (!obj.equipmentType || !obj.employeeName) {
                    fail++;
                    continue;
                }
                if (!obj.quantity && obj.quantity !== 0) obj.quantity = 1;
                if (!obj.status) obj.status = 'مستلم';

                // ✅ منع التحديث: إذا كان معرف السجل أو رقم الإيصال موجوداً، اعتبره مكرراً وتجاهله
                const candidateId = String(obj.id || obj.receiptNumber || '').trim();
                if (candidateId && existingIds.has(candidateId)) {
                    duplicates.push({
                        row: r + 1,
                        id: candidateId,
                        label: `${obj.employeeName} — ${obj.equipmentType}`
                    });
                    continue;
                }

                try {
                    const payload = { ...obj };
                    delete payload.id; // الإضافة فقط
                    const res = await Backend.sendToAppsScript('addPPE', payload);
                    if (res && res.success) {
                        ok++;
                        if (candidateId) existingIds.add(candidateId);
                    } else {
                        fail++;
                    }
                } catch (e) {
                    fail++;
                    Utils.safeWarn('صف استلام فشل:', e);
                }
            }
            Loading.hide();
            this.clearCache();
            await this.refreshActiveTab();
            this._reportImportSummary({
                scope: 'receipts',
                ok,
                fail,
                duplicates
            });
        } catch (error) {
            Loading.hide();
            Utils.safeError('importReceiptsExcel', error);
            Notification.error(this._t('module.ppe.excel.importErr', 'فشل الاستيراد') + ': ' + (error.message || error));
        }
    },

    async exportStockExcel() {
        try {
            if (typeof XLSX === 'undefined') {
                Notification.error(this._t('module.ppe.notify.xlsxMissing', 'مكتبة SheetJS غير محمّلة. يرجى تحديث الصفحة'));
                return;
            }
            Loading.show(this._t('module.ppe.excel.exportingStock', 'جاري تصدير المخزون…'));
            const defs = this._ppeStockExcelFieldDefs();
            const list = this.getFilteredStockItems(this._getCurrentStockItems());
            const rows = list.map((item) => {
                const o = {};
                defs.forEach((d) => {
                    let v = item[d.key];
                    if (d.key === 'lastUpdate') v = this._ppeFormatCellForExcel(v);
                    else if (['stock_IN', 'stock_OUT', 'balance', 'minThreshold'].includes(d.key)) {
                        v = v !== undefined && v !== null && v !== '' ? Number(v) : '';
                    }
                    o[d.ar] = v !== undefined && v !== null ? v : '';
                });
                return o;
            });
            const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [defs.reduce((acc, d) => { acc[d.ar] = ''; return acc; }, {})]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, this._t('module.ppe.excel.sheetStock', 'مخزون مهمات الوقاية'));
            XLSX.writeFile(wb, `PPE_مخزون_${new Date().toISOString().slice(0, 10)}.xlsx`);
            Loading.hide();
            Notification.success(this._t('module.ppe.excel.exportStockOk', 'تم تصدير Excel للمخزون'));
        } catch (error) {
            Loading.hide();
            Utils.safeError('exportStockExcel', error);
            Notification.error(this._t('module.ppe.excel.exportErr', 'فشل التصدير') + ': ' + (error.message || error));
        }
    },

    downloadStockExcelTemplate() {
        try {
            if (typeof XLSX === 'undefined') {
                Notification.error(this._t('module.ppe.notify.xlsxMissing', 'مكتبة SheetJS غير محمّلة. يرجى تحديث الصفحة'));
                return;
            }
            const defs = this._ppeStockExcelFieldDefs().filter((d) =>
                !['stock_IN', 'stock_OUT', 'balance'].includes(d.key)
            );
            const headerRow = defs.map((d) => d.ar);
            const ws = XLSX.utils.aoa_to_sheet([headerRow]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, this._t('module.ppe.excel.sheetStock', 'مخزون مهمات الوقاية'));
            XLSX.writeFile(wb, `PPE_قالب_مخزون_${new Date().toISOString().slice(0, 10)}.xlsx`);
            Notification.success(this._t('module.ppe.excel.templateDownloadOk', 'تم تنزيل القالب'));
        } catch (error) {
            Notification.error(this._t('module.ppe.excel.templateErr', 'فشل تنزيل القالب') + ': ' + error.message);
        }
    },

    async importStockExcel(file) {
        if (!file) return;
        if (typeof XLSX === 'undefined') {
            Notification.error(this._t('module.ppe.notify.xlsxMissing', 'مكتبة SheetJS غير محمّلة. يرجى تحديث الصفحة'));
            return;
        }
        const defs = this._ppeStockExcelFieldDefs();
        const alias = this._ppeBuildHeaderAliasMap(defs);
        try {
            Loading.show(this._t('module.ppe.excel.importingStock', 'جاري استيراد المخزون…'));
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array', cellDates: true });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
            if (!aoa || aoa.length < 2) {
                Loading.hide();
                Notification.warning(this._t('module.ppe.excel.importEmpty', 'الملف فارغ أو لا يحتوي صف بيانات بعد الرؤوس'));
                return;
            }
            const headerRow = (aoa[0] || []).map((c) => String(c || '').trim());
            const colToKey = headerRow.map((h) => alias[h] || alias[String(h || '').trim().toLowerCase()] || '');

            // ✅ تحميل البيانات الحالية لاكتشاف التكرار قبل الإرسال — حتى لا تُكتب الأصناف الموجودة
            let existingItems = this._getCurrentStockItems();
            if (!Array.isArray(existingItems) || existingItems.length === 0) {
                try {
                    existingItems = await this.loadStockItems(true);
                } catch (e) {
                    existingItems = this._getCurrentStockItems() || [];
                }
            }
            const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();
            const existingByCode = new Set();
            const existingByName = new Set();
            const existingByItemId = new Set();
            (existingItems || []).forEach((it) => {
                if (!it) return;
                if (it.itemCode) existingByCode.add(norm(it.itemCode));
                if (it.itemName) existingByName.add(norm(it.itemName));
                if (it.itemId) existingByItemId.add(String(it.itemId).trim());
            });

            let ok = 0;
            let fail = 0;
            const duplicates = []; // {row, code, name, reason}
            for (let r = 1; r < aoa.length; r++) {
                const row = aoa[r];
                if (!row || !row.some((c) => String(c || '').trim() !== '')) continue;
                const obj = {};
                colToKey.forEach((key, i) => {
                    if (!key) return;
                    let v = row[i];
                    if (['stock_IN', 'stock_OUT', 'balance', 'minThreshold'].includes(key)) {
                        obj[key] = parseFloat(String(v).replace(/,/g, '')) || 0;
                    } else {
                        obj[key] = v !== undefined && v !== null ? String(v).trim() : '';
                    }
                });
                if (!obj.itemCode || !obj.itemName) {
                    fail++;
                    continue;
                }

                // ✅ منع التحديث: يُتخطّى الصنف إذا تطابق itemId أو itemCode أو itemName مع موجود
                const codeKey = norm(obj.itemCode);
                const nameKey = norm(obj.itemName);
                const iidRaw = obj.itemId && String(obj.itemId).trim();
                let dupReason = '';
                if (iidRaw && existingByItemId.has(iidRaw)) dupReason = 'itemId';
                else if (existingByCode.has(codeKey)) dupReason = 'itemCode';
                else if (existingByName.has(nameKey)) dupReason = 'itemName';
                if (dupReason) {
                    duplicates.push({
                        row: r + 1,
                        code: obj.itemCode,
                        name: obj.itemName,
                        reason: dupReason
                    });
                    continue;
                }

                const stockData = {
                    itemCode: obj.itemCode,
                    itemName: obj.itemName,
                    category: obj.category || '',
                    minThreshold: obj.minThreshold !== undefined ? obj.minThreshold : 0,
                    supplier: obj.supplier || ''
                };
                // لا نمرّر itemId قادماً من الملف لتجنّب أي تطابق غير مقصود؛ يولِّده الباك‑إند للسجل الجديد.
                if (obj.stock_IN !== undefined) stockData.stock_IN = obj.stock_IN;
                if (obj.stock_OUT !== undefined) stockData.stock_OUT = obj.stock_OUT;
                if (obj.balance !== undefined) stockData.balance = obj.balance;
                try {
                    const res = await Backend.sendToAppsScript('addOrUpdatePPEStockItem', stockData);
                    if (res && res.success) {
                        ok++;
                        existingByCode.add(codeKey);
                        existingByName.add(nameKey);
                    } else {
                        // الباك‑إند يرفض المكرّر برسالة «كود الصنف موجود بالفعل…» — اعدّه ضمن المكررات
                        const msg = res && res.message ? String(res.message) : '';
                        if (/موجود|exists/i.test(msg)) {
                            duplicates.push({
                                row: r + 1,
                                code: obj.itemCode,
                                name: obj.itemName,
                                reason: 'backend'
                            });
                        } else {
                            fail++;
                        }
                    }
                } catch (e) {
                    fail++;
                    Utils.safeWarn('صف مخزون فشل:', e);
                }
            }
            Loading.hide();
            this.clearCache();
            await this.refreshActiveTab();
            this._reportImportSummary({
                scope: 'stock',
                ok,
                fail,
                duplicates
            });
        } catch (error) {
            Loading.hide();
            Utils.safeError('importStockExcel', error);
            Notification.error(this._t('module.ppe.excel.importErr', 'فشل الاستيراد') + ': ' + (error.message || error));
        }
    },

    /** تنبيه ملخّص بعد الاستيراد + Modal بقائمة المكررات */
    _reportImportSummary({ scope, ok, fail, duplicates }) {
        const t = (k, f) => this._t(k, f);
        const dupCount = (duplicates && duplicates.length) || 0;
        const baseMsg = scope === 'receipts'
            ? this._t('module.ppe.excel.importReceiptsSummary', 'اكتمل الاستيراد')
            : this._t('module.ppe.excel.importStockSummary', 'اكتمل استيراد المخزون');
        const summary = `${baseMsg}: ${ok} ${this._t('module.ppe.excel.ok', 'نجاح')}، ${dupCount} ${this._t('module.ppe.excel.duplicates', 'مكرّر (تم تجاوزه)')}، ${fail} ${this._t('module.ppe.excel.fail', 'تخطي/فشل')}.`;

        if (dupCount > 0) {
            try { Notification.warning(summary); } catch (e) { /* ignore */ }
            this._showDuplicatesModal(scope, duplicates);
        } else if (ok > 0) {
            try { Notification.success(summary); } catch (e) { /* ignore */ }
        } else {
            try { Notification.warning(summary); } catch (e) { /* ignore */ }
        }
    },

    _showDuplicatesModal(scope, duplicates) {
        const t = (k, f) => this._t(k, f);
        const ut = (s) => Utils.escapeHTML(s);
        const isReceipts = scope === 'receipts';
        const title = isReceipts
            ? t('module.ppe.excel.duplicatesReceiptsTitle', 'بنود مكرّرة في سجل الاستلامات (لم تُستورد)')
            : t('module.ppe.excel.duplicatesStockTitle', 'أصناف مكرّرة في المخزون (لم تُستورد)');
        const reasonText = (reason) => {
            if (reason === 'itemCode') return t('module.ppe.excel.dupReasonCode', 'كود الصنف موجود بالفعل');
            if (reason === 'itemName') return t('module.ppe.excel.dupReasonName', 'اسم الصنف موجود بالفعل');
            if (reason === 'itemId') return t('module.ppe.excel.dupReasonId', 'معرف الصنف موجود بالفعل');
            if (reason === 'backend') return t('module.ppe.excel.dupReasonBackend', 'موجود بالفعل (تم رفضه من الخادم)');
            return t('module.ppe.excel.dupReasonGeneric', 'موجود بالفعل');
        };

        const rowsHtml = (duplicates || []).map((d) => {
            if (isReceipts) {
                return `<tr>
                    <td>${ut(d.row)}</td>
                    <td>${ut(d.id || '')}</td>
                    <td>${ut(d.label || '')}</td>
                </tr>`;
            }
            return `<tr>
                <td>${ut(d.row)}</td>
                <td class="font-mono font-semibold">${ut(d.code || '')}</td>
                <td>${ut(d.name || '')}</td>
                <td>${ut(reasonText(d.reason))}</td>
            </tr>`;
        }).join('');

        const headHtml = isReceipts
            ? `<tr><th>${ut(t('module.ppe.excel.dupCol.row', 'الصف'))}</th><th>${ut(t('module.ppe.excel.dupCol.idOrReceipt', 'المعرف/رقم الإيصال'))}</th><th>${ut(t('module.ppe.excel.dupCol.summary', 'الموظف — نوع المعدة'))}</th></tr>`
            : `<tr><th>${ut(t('module.ppe.excel.dupCol.row', 'الصف'))}</th><th>${ut(t('module.ppe.excel.dupCol.code', 'الكود'))}</th><th>${ut(t('module.ppe.excel.dupCol.name', 'اسم الصنف'))}</th><th>${ut(t('module.ppe.excel.dupCol.reason', 'السبب'))}</th></tr>`;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 760px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-exclamation-triangle text-amber-500 ml-2"></i>${ut(title)}
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p class="text-sm text-gray-600 mb-3">
                        ${ut(t('module.ppe.excel.dupHint', 'لم يتم تعديل أي صنف موجود؛ تم تجاوز البنود التالية فقط.'))}
                    </p>
                    <div class="table-wrapper" style="max-height: 380px; overflow:auto;">
                        <table class="data-table">
                            <thead>${headHtml}</thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                        ${ut(t('module.common.close', 'إغلاق'))}
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    /** التحقق من أن المستخدم الحالي مدير نظام (لإظهار أدوات Excel) */
    _isPpeAdminUser() {
        try {
            if (typeof Permissions !== 'undefined' && typeof Permissions.isCurrentUserEffectiveAdmin === 'function') {
                return !!Permissions.isCurrentUserEffectiveAdmin();
            }
        } catch (e) { /* ignore */ }
        const user = (typeof AppState !== 'undefined' && AppState) ? AppState.currentUser : null;
        if (!user) return false;
        const role = String(user.role || '').toLowerCase();
        if (role === 'admin' || role === 'system_admin') return true;
        if (user.role === 'مدير النظام') return true;
        const perms = user.permissions || {};
        return !!(perms.admin === true || perms['manage-modules'] === true);
    },

    /** بناء شريط أزرار Excel (تصدير/قالب/استيراد) — يظهر فقط لمدير النظام */
    _buildExcelToolbarHtml(scope) {
        if (!this._isPpeAdminUser()) return '';
        const t = (k, f) => this._t(k, f);
        const ut = (s) => Utils.escapeHTML(s);
        const isReceipts = scope === 'receipts';
        const ids = isReceipts
            ? {
                exportBtn: 'ppe-receipts-export-excel-btn',
                tplBtn: 'ppe-receipts-template-btn',
                importBtn: 'ppe-receipts-import-btn',
                exportTitleKey: 'module.ppe.excel.exportReceiptsTitle',
                exportTitleFb: 'تصدير سجل الاستلامات إلى Excel',
                tplTitleKey: 'module.ppe.excel.downloadTemplateReceiptsTitle',
                tplTitleFb: 'تنزيل قالب Excel فارغ',
                importTitleKey: 'module.ppe.excel.importReceiptsTitle',
                importTitleFb: 'استيراد صفوف من ملف يطابق القالب'
            }
            : {
                exportBtn: 'ppe-stock-export-excel-btn',
                tplBtn: 'ppe-stock-template-btn',
                importBtn: 'ppe-stock-import-btn',
                exportTitleKey: 'module.ppe.excel.exportStockTitle',
                exportTitleFb: 'تصدير المخزون إلى Excel',
                tplTitleKey: 'module.ppe.excel.downloadTemplateStockTitle',
                tplTitleFb: 'تنزيل قالب Excel للأصناف',
                importTitleKey: 'module.ppe.excel.importStockTitle',
                importTitleFb: 'استيراد أصناف من ملف يطابق القالب'
            };
        return `
            <div class="ppe-excel-toolbar flex flex-wrap items-center justify-end gap-2 mb-3">
                <button id="${ids.exportBtn}" type="button" class="btn-secondary" title="${ut(t(ids.exportTitleKey, ids.exportTitleFb))}">
                    <i class="fas fa-file-excel ml-2"></i>${ut(t('module.ppe.excel.exportBtn', 'تصدير Excel'))}
                </button>
                <button id="${ids.tplBtn}" type="button" class="btn-secondary" title="${ut(t(ids.tplTitleKey, ids.tplTitleFb))}">
                    <i class="fas fa-download ml-2"></i>${ut(t('module.ppe.excel.downloadTemplateBtn', 'تحميل القالب'))}
                </button>
                <button id="${ids.importBtn}" type="button" class="btn-secondary" title="${ut(t(ids.importTitleKey, ids.importTitleFb))}">
                    <i class="fas fa-file-import ml-2"></i>${ut(t('module.ppe.excel.importBtn', 'استيراد من القالب'))}
                </button>
            </div>
        `;
    },

    /** نموذج استيراد سجل الاستلامات (مثل قاعدة بيانات الموظفين): قالب + ملف + معاينة + تأكيد */
    showPpeReceiptsImportModal() {
        if (!this._isPpeAdminUser()) return;
        if (typeof XLSX === 'undefined') {
            Notification.error(this._t('module.ppe.notify.xlsxMissing', 'مكتبة SheetJS غير محمّلة. يرجى تحديث الصفحة'));
            return;
        }
        try {
            document.getElementById('ppe-receipts-import-modal')?.remove();
        } catch (e) { /* ignore */ }

        const t = (k, f) => this._t(k, f);
        const ut = (s) => Utils.escapeHTML(s);
        const defs = this._ppeReceiptExcelFieldDefs();
        const colsList = defs.map((d) => `<li><strong>${ut(d.ar)}</strong> — <span class="font-mono text-xs">${ut(d.en)}</span></li>`).join('');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'ppe-receipts-import-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h2 class="modal-title"><i class="fas fa-file-excel ml-2 text-green-600"></i>${ut(t('module.ppe.excel.importModalReceiptsTitle', 'استيراد سجل الاستلامات من Excel'))}</h2>
                    <button type="button" class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="${ut(t('module.common.close', 'إغلاق'))}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body space-y-4">
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p class="text-sm text-blue-900 font-semibold mb-2"><i class="fas fa-info-circle ml-2"></i>${ut(t('module.ppe.excel.importModalIntro', 'حمّل القالب أو اتبع الأعمدة التالية ثم ارفع الملف. السجلات المكررة تُتجاوَز مع تنبيه.'))}</p>
                        <button type="button" id="ppe-receipts-modal-download-template" class="btn-secondary btn-sm mb-3">
                            <i class="fas fa-file-download ml-2"></i>${ut(t('module.ppe.excel.downloadTemplateBtn', 'تحميل القالب'))}
                        </button>
                        <p class="text-sm text-blue-800 mb-2">${ut(t('module.ppe.excel.importModalColumns', 'الأعمدة المتوقعة في الصف الأول:'))}</p>
                        <ul class="text-sm text-blue-800 list-disc mr-6 space-y-1">${colsList}</ul>
                    </div>
                    <div>
                        <label for="ppe-receipts-modal-file" class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-file-excel ml-2"></i>${ut(t('module.ppe.excel.chooseExcelFile', 'اختر ملف Excel (.xlsx أو .xls)'))}
                        </label>
                        <input type="file" id="ppe-receipts-modal-file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" class="form-input">
                    </div>
                    <div id="ppe-receipts-import-preview" class="hidden">
                        <h3 class="text-sm font-semibold text-gray-800 mb-2">${ut(t('module.ppe.excel.previewTitle', 'معاينة (أول 5 صفوف بيانات):'))}</h3>
                        <div class="max-h-60 overflow-auto border rounded bg-white">
                            <table class="data-table text-xs">
                                <thead id="ppe-receipts-preview-head"></thead>
                                <tbody id="ppe-receipts-preview-body"></tbody>
                            </table>
                        </div>
                        <p id="ppe-receipts-preview-count" class="text-sm text-gray-600 mt-2"></p>
                    </div>
                </div>
                <div class="modal-footer flex justify-end gap-2">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">${ut(t('module.common.cancel', 'إلغاء'))}</button>
                    <button type="button" id="ppe-receipts-import-confirm" class="btn-primary" disabled>
                        <i class="fas fa-check ml-2"></i>${ut(t('module.ppe.excel.confirmImport', 'تأكيد الاستيراد'))}
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        this.applyModuleI18n(modal);

        const fileInput = modal.querySelector('#ppe-receipts-modal-file');
        const dlTpl = modal.querySelector('#ppe-receipts-modal-download-template');
        const previewWrap = modal.querySelector('#ppe-receipts-import-preview');
        const previewHead = modal.querySelector('#ppe-receipts-preview-head');
        const previewBody = modal.querySelector('#ppe-receipts-preview-body');
        const previewCount = modal.querySelector('#ppe-receipts-preview-count');
        const confirmBtn = modal.querySelector('#ppe-receipts-import-confirm');
        let selectedFile = null;

        if (dlTpl) {
            dlTpl.onclick = () => this.downloadReceiptsExcelTemplate();
        }

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            selectedFile = file || null;
            confirmBtn.disabled = !selectedFile;
            if (!file) {
                previewWrap.classList.add('hidden');
                return;
            }
            try {
                const buf = await file.arrayBuffer();
                const wb = XLSX.read(buf, { type: 'array', cellDates: true });
                const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
                if (!aoa || aoa.length < 2) {
                    previewWrap.classList.add('hidden');
                    Notification.warning(this._t('module.ppe.excel.importEmpty', 'الملف فارغ أو لا يحتوي صف بيانات بعد الرؤوس'));
                    return;
                }
                const headers = (aoa[0] || []).map((h) => String(h || '').trim());
                previewHead.innerHTML = `<tr>${headers.map((h) => `<th>${ut(h)}</th>`).join('')}</tr>`;
                previewBody.innerHTML = aoa.slice(1, 6).map((row) =>
                    `<tr>${headers.map((_, i) => `<td>${ut(String(row[i] ?? ''))}</td>`).join('')}</tr>`
                ).join('');
                const dataRows = Math.max(0, aoa.length - 1);
                previewCount.textContent = `${this._t('module.ppe.excel.previewRowCount', 'عدد صفوف البيانات')}: ${dataRows}`;
                previewWrap.classList.remove('hidden');
            } catch (err) {
                Utils.safeError('ppe receipts import preview', err);
                previewWrap.classList.add('hidden');
                Notification.error(this._t('module.ppe.excel.previewErr', 'تعذّر قراءة الملف للمعاينة'));
            }
        });

        confirmBtn.addEventListener('click', async () => {
            if (!selectedFile) return;
            modal.remove();
            await this.importReceiptsExcel(selectedFile);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    /** نموذج استيراد أصناف المخزون */
    showPpeStockImportModal() {
        if (!this._isPpeAdminUser()) return;
        if (typeof XLSX === 'undefined') {
            Notification.error(this._t('module.ppe.notify.xlsxMissing', 'مكتبة SheetJS غير محمّلة. يرجى تحديث الصفحة'));
            return;
        }
        try {
            document.getElementById('ppe-stock-import-modal')?.remove();
        } catch (e) { /* ignore */ }

        const t = (k, f) => this._t(k, f);
        const ut = (s) => Utils.escapeHTML(s);
        const defs = this._ppeStockExcelFieldDefs().filter((d) => !['stock_IN', 'stock_OUT', 'balance'].includes(d.key));
        const colsList = defs.map((d) => `<li><strong>${ut(d.ar)}</strong> — <span class="font-mono text-xs">${ut(d.en)}</span></li>`).join('');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'ppe-stock-import-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h2 class="modal-title"><i class="fas fa-file-excel ml-2 text-green-600"></i>${ut(t('module.ppe.excel.importModalStockTitle', 'استيراد أصناف المخزون من Excel'))}</h2>
                    <button type="button" class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="${ut(t('module.common.close', 'إغلاق'))}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body space-y-4">
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p class="text-sm text-blue-900 font-semibold mb-2"><i class="fas fa-info-circle ml-2"></i>${ut(t('module.ppe.excel.importStockIntro', 'حمّل القالب ثم عبّئ الأصناف الجديدة فقط. الأصناف الموجودة (كود أو اسم أو معرف) لن تُستبدل وتُعرَض في قائمة المكررات.'))}</p>
                        <button type="button" id="ppe-stock-modal-download-template" class="btn-secondary btn-sm mb-3">
                            <i class="fas fa-file-download ml-2"></i>${ut(t('module.ppe.excel.downloadTemplateBtn', 'تحميل القالب'))}
                        </button>
                        <p class="text-sm text-blue-800 mb-2">${ut(t('module.ppe.excel.importModalColumnsStock', 'أعمدة القالب (صف الرؤوس):'))}</p>
                        <ul class="text-sm text-blue-800 list-disc mr-6 space-y-1">${colsList}</ul>
                    </div>
                    <div>
                        <label for="ppe-stock-modal-file" class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-file-excel ml-2"></i>${ut(t('module.ppe.excel.chooseExcelFile', 'اختر ملف Excel (.xlsx أو .xls)'))}
                        </label>
                        <input type="file" id="ppe-stock-modal-file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" class="form-input">
                    </div>
                    <div id="ppe-stock-import-preview" class="hidden">
                        <h3 class="text-sm font-semibold text-gray-800 mb-2">${ut(t('module.ppe.excel.previewTitle', 'معاينة (أول 5 صفوف بيانات):'))}</h3>
                        <div class="max-h-60 overflow-auto border rounded bg-white">
                            <table class="data-table text-xs">
                                <thead id="ppe-stock-preview-head"></thead>
                                <tbody id="ppe-stock-preview-body"></tbody>
                            </table>
                        </div>
                        <p id="ppe-stock-preview-count" class="text-sm text-gray-600 mt-2"></p>
                    </div>
                </div>
                <div class="modal-footer flex justify-end gap-2">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">${ut(t('module.common.cancel', 'إلغاء'))}</button>
                    <button type="button" id="ppe-stock-import-confirm" class="btn-primary" disabled>
                        <i class="fas fa-check ml-2"></i>${ut(t('module.ppe.excel.confirmImport', 'تأكيد الاستيراد'))}
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        this.applyModuleI18n(modal);

        const fileInput = modal.querySelector('#ppe-stock-modal-file');
        const dlTpl = modal.querySelector('#ppe-stock-modal-download-template');
        const previewWrap = modal.querySelector('#ppe-stock-import-preview');
        const previewHead = modal.querySelector('#ppe-stock-preview-head');
        const previewBody = modal.querySelector('#ppe-stock-preview-body');
        const previewCount = modal.querySelector('#ppe-stock-preview-count');
        const confirmBtn = modal.querySelector('#ppe-stock-import-confirm');
        let selectedFile = null;

        if (dlTpl) {
            dlTpl.onclick = () => this.downloadStockExcelTemplate();
        }

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            selectedFile = file || null;
            confirmBtn.disabled = !selectedFile;
            if (!file) {
                previewWrap.classList.add('hidden');
                return;
            }
            try {
                const buf = await file.arrayBuffer();
                const wb = XLSX.read(buf, { type: 'array', cellDates: true });
                const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
                if (!aoa || aoa.length < 2) {
                    previewWrap.classList.add('hidden');
                    Notification.warning(this._t('module.ppe.excel.importEmpty', 'الملف فارغ أو لا يحتوي صف بيانات بعد الرؤوس'));
                    return;
                }
                const headers = (aoa[0] || []).map((h) => String(h || '').trim());
                previewHead.innerHTML = `<tr>${headers.map((h) => `<th>${ut(h)}</th>`).join('')}</tr>`;
                previewBody.innerHTML = aoa.slice(1, 6).map((row) =>
                    `<tr>${headers.map((_, i) => `<td>${ut(String(row[i] ?? ''))}</td>`).join('')}</tr>`
                ).join('');
                const dataRows = Math.max(0, aoa.length - 1);
                previewCount.textContent = `${this._t('module.ppe.excel.previewRowCount', 'عدد صفوف البيانات')}: ${dataRows}`;
                previewWrap.classList.remove('hidden');
            } catch (err) {
                Utils.safeError('ppe stock import preview', err);
                previewWrap.classList.add('hidden');
                Notification.error(this._t('module.ppe.excel.previewErr', 'تعذّر قراءة الملف للمعاينة'));
            }
        });

        confirmBtn.addEventListener('click', async () => {
            if (!selectedFile) return;
            modal.remove();
            await this.importStockExcel(selectedFile);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    _bindPpeReceiptExcelToolbar() {
        const exportBtn = document.getElementById('ppe-receipts-export-excel-btn');
        const tplBtn = document.getElementById('ppe-receipts-template-btn');
        const importBtn = document.getElementById('ppe-receipts-import-btn');
        if (exportBtn) {
            exportBtn.onclick = () => this.exportReceiptsExcel();
        }
        if (tplBtn) {
            tplBtn.onclick = () => this.downloadReceiptsExcelTemplate();
        }
        if (importBtn) {
            importBtn.onclick = () => this.showPpeReceiptsImportModal();
        }
    },

    _bindPpeStockExcelToolbar() {
        const exportBtn = document.getElementById('ppe-stock-export-excel-btn');
        const tplBtn = document.getElementById('ppe-stock-template-btn');
        const importBtn = document.getElementById('ppe-stock-import-btn');
        if (exportBtn) {
            exportBtn.onclick = () => this.exportStockExcel();
        }
        if (tplBtn) {
            tplBtn.onclick = () => this.downloadStockExcelTemplate();
        }
        if (importBtn) {
            importBtn.onclick = () => this.showPpeStockImportModal();
        }
    },

    async exportPPEMatrix() {
        try {
            Loading.show();

            if (typeof XLSX === 'undefined') {
                Loading.hide();
                Notification.error(this._t('module.ppe.notify.xlsxMissing', 'مكتبة SheetJS غير محمّلة. يرجى تحديث الصفحة'));
                return;
            }

            const matrix = AppState.appData.employeePPEMatrix || {};
            const employees = AppState.appData.employees || [];

            const excelData = Object.keys(matrix).map(position => {
                const matrixData = matrix[position];
                const positionEmployees = employees.filter(e => e.position === position);

                return {
                    'الوظية': position,
                    'عدد الموظين': positionEmployees.length,
                    'مهمات الوقاية المطلوبة': matrixData.requiredPPE ? matrixData.requiredPPE.join(', ') : ''
                };
            });

            const ws = XLSX.utils.json_to_sheet(excelData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'مصفوفة مهمات الوقاية');

            XLSX.writeFile(wb, 'مصوة_مهمات_الوقاية_' + new Date().toISOString().slice(0, 10) + '.xlsx');

            Loading.hide();
            Notification.success(this._t('module.ppe.notify.matrixExportOk', 'تم تصدير مصفوفة مهمات الوقاية بنجاح'));
        } catch (error) {
            Loading.hide();
            Notification.error(this._t('module.ppe.notify.matrixExportErr', 'حدث خطأ') + ': ' + error.message);
        }
    },

    // ===== PPE Stock Control Functions =====

    /**
     * بناء محتوى تبويب المخزون بشكل متزامن (للعرض الفوري من الكاش قبل اكتمال الجلب من الخلفية).
     * @param {string} [hintHtml] رسالة تنبيه اختيارية (مثل مزامنة خلفية)
     */
    buildStockControlTabHtmlSync(stockItems, hintHtml = '') {
        const items = Array.isArray(stockItems) ? stockItems : [];
        const lowStockItems = items.filter((item) => {
            if (!item) return false;
            const balance = parseFloat(item.balance || 0);
            const minThreshold = parseFloat(item.minThreshold || 0);
            return balance < minThreshold;
        });
        const hintBlock = hintHtml ? `<div id="ppe-stock-hint-slot" class="mb-4">${hintHtml}</div>` : '';
        return `
            <div class="space-y-6" id="ppe-stock-tab-root">
                ${hintBlock}
                ${this.renderStockDashboard(items, lowStockItems)}
                ${this.renderStockTable(items)}
            </div>
        `;
    },

    async renderStockControlTab() {
        try {
            const stockItems = await this.loadStockItems();
            console.log('[PPE DEBUG] renderStockControlTab got', stockItems.length, 'items');

            const staleBanner = this.state.stockStaleWarningMsg
                ? `<div role="status" class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
                    <i class="fas fa-info-circle mt-0.5 text-amber-600"></i>
                    <span>${Utils.escapeHTML(this.state.stockStaleWarningMsg)}</span>
                   </div>`
                : '';
            this.state.stockStaleWarningMsg = '';

            const hardErr = this.state.stockLoadHardErrorMsg;
            this.state.stockLoadHardErrorMsg = '';

            if (!Array.isArray(stockItems)) {
                Utils.safeWarn('⚠️ stockItems ليست مصفوفة:', stockItems);
                return `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>
                        <p class="text-gray-500 mb-4">${Utils.escapeHTML(this._t('module.ppe.empty.loadStockError', 'خطأ في تحميل بيانات المخزون'))}</p>
                        <button onclick="PPE.switchTab('stock-control')" class="btn-primary">
                            <i class="fas fa-redo ml-2"></i>${Utils.escapeHTML(this._t('module.common.retry', 'إعادة المحاولة'))}
                        </button>
                    </div>
                `;
            }

            if (stockItems.length === 0 && hardErr) {
                return `
                    <div class="empty-state">
                        <i class="fas fa-plug text-amber-600 text-4xl mb-4"></i>
                        <p class="text-gray-700 mb-2 font-semibold">${Utils.escapeHTML(hardErr)}</p>
                        <p class="text-gray-500 text-sm mb-4">${Utils.escapeHTML(this._t('module.ppe.stock.hardErrorHint', 'تحقق من الاتصال ثم اضغط إعادة المحاولة.'))}</p>
                        <button onclick="PPE.switchTab('stock-control')" class="btn-primary">
                            <i class="fas fa-redo ml-2"></i>${Utils.escapeHTML(this._t('module.common.retry', 'إعادة المحاولة'))}
                        </button>
                    </div>
                `;
            }

            const lowStockItems = stockItems.filter(item => {
                if (!item) return false;
                const balance = parseFloat(item.balance || 0);
                const minThreshold = parseFloat(item.minThreshold || 0);
                return balance < minThreshold;
            });

            return `
            <div class="space-y-6">
                ${staleBanner}
                ${this.renderStockDashboard(stockItems, lowStockItems)}
                ${this.renderStockTable(stockItems)}
            </div>
        `;
        } catch (error) {
            Utils.safeError('❌ خطأ في renderStockControlTab:', error);
            return `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>
                    <p class="text-gray-500 mb-4">${Utils.escapeHTML(this._t('module.ppe.empty.stockErrorTab', 'حدث خطأ أثناء تحميل تبويب المخزون'))}: ${Utils.escapeHTML(String(error.message || error))}</p>
                    <button onclick="PPE.switchTab('stock-control')" class="btn-primary">
                        <i class="fas fa-redo ml-2"></i>${Utils.escapeHTML(this._t('module.common.retry', 'إعادة المحاولة'))}
                    </button>
                </div>
            `;
        }
    },

    renderStockDashboard(stockItems, lowStockItems) {
        const t = (k, f) => this._t(k, f);
        const ut = (s) => Utils.escapeHTML(s);
        const totalItems = stockItems.length;
        const totalBalance = stockItems.reduce((sum, item) => sum + parseFloat(item.balance || 0), 0);
        const totalIn = stockItems.reduce((sum, item) => sum + parseFloat(item.stock_IN || 0), 0);
        const totalOut = stockItems.reduce((sum, item) => sum + parseFloat(item.stock_OUT || 0), 0);

        return `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div class="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-gray-600">${ut(t('module.ppe.stock.dashboard.totalItems', 'إجمالي الأصناف'))}</p>
                            <p class="text-2xl font-bold text-gray-800">${totalItems}</p>
                        </div>
                        <div class="text-3xl text-blue-500">
                            <i class="fas fa-boxes"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-gray-600">${ut(t('module.ppe.stock.dashboard.totalBalance', 'إجمالي الرصيد'))}</p>
                            <p class="text-2xl font-bold text-gray-800">${totalBalance.toFixed(0)}</p>
                        </div>
                        <div class="text-3xl text-green-500">
                            <i class="fas fa-check-circle"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-gray-600">${ut(t('module.ppe.stock.dashboard.totalIn', 'إجمالي الوارد'))}</p>
                            <p class="text-2xl font-bold text-gray-800">${totalIn.toFixed(0)}</p>
                        </div>
                        <div class="text-3xl text-yellow-500">
                            <i class="fas fa-arrow-down"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-gray-600">${ut(t('module.ppe.stock.dashboard.totalOut', 'إجمالي المنصرف'))}</p>
                            <p class="text-2xl font-bold text-gray-800">${totalOut.toFixed(0)}</p>
                        </div>
                        <div class="text-3xl text-red-500">
                            <i class="fas fa-arrow-up"></i>
                        </div>
                    </div>
                </div>
            </div>
            ${lowStockItems.length > 0 ? `
                <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-6">
                    <div class="flex items-center">
                        <i class="fas fa-exclamation-triangle text-red-500 text-2xl ml-3"></i>
                        <div>
                            <h3 class="font-bold text-red-800">${ut(t('module.ppe.stock.lowTitle', 'تحذير: مخزون منخفض'))}</h3>
                            <p class="text-sm text-red-700 mt-1">${lowStockItems.length} ${ut(t('module.ppe.stock.lowDesc', 'صنف/أصناف تحت حد إعادة الطلب'))}</p>
                        </div>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2">
                        ${lowStockItems.slice(0, 5).map(item => `
                            <span class="badge badge-warning">
                                ${Utils.escapeHTML(item.itemName || item.itemCode)} (${parseFloat(item.balance || 0).toFixed(0)})
                            </span>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    },

    renderStockTable(stockItems) {
        const t = (k, f) => this._t(k, f);
        const ut = (s) => Utils.escapeHTML(s);
        const items = Array.isArray(stockItems) ? stockItems : [];
        const excelToolbar = this._buildExcelToolbarHtml('stock');
        if (items.length === 0) {
            return `
                <div id="ppe-stock-table-card" class="content-card">
                    <div class="card-body">
                        ${excelToolbar}
                        <div class="empty-state">
                            <i class="fas fa-box-open text-4xl text-gray-300 mb-4"></i>
                            <p class="text-gray-500">${ut(t('module.ppe.empty.noStock', 'لا توجد أصناف في المخزون'))}</p>
                            <button onclick="PPE.showStockItemForm()" class="btn-primary mt-4">
                                <i class="fas fa-plus ml-2"></i>${ut(t('module.ppe.btn.addStockItem', 'إضافة صنف جديد'))}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        const filterRow = this.buildStockFilterRow(items);
        const filtered = this.getFilteredStockItems(items);
        const hasFilters = this.hasActiveStockFilters();

        if (filtered.length === 0 && hasFilters) {
            return `
                <div id="ppe-stock-table-card" class="content-card">
                    <div class="card-header">
                        <h3 class="card-title"><i class="fas fa-list ml-2"></i>${ut(t('module.ppe.stock.tableTitle', 'جدول المخزون'))}</h3>
                    </div>
                    <div class="card-body">
                        ${excelToolbar}
                        ${filterRow}
                        <div class="empty-state">
                            <i class="fas fa-filter text-4xl text-gray-300 mb-4"></i>
                            <p class="text-gray-500 mb-2">${ut(t('module.ppe.filter.noMatch', 'لا توجد نتائج مطابقة'))}</p>
                            <button type="button" id="ppe-stock-clear-empty-filters" class="btn-secondary mt-2">
                                <i class="fas fa-undo-alt ml-2"></i>${ut(t('module.ppe.filter.clearEmpty', 'مسح الفلاتر'))}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div id="ppe-stock-table-card" class="content-card">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-list ml-2"></i>${ut(t('module.ppe.stock.tableTitle', 'جدول المخزون'))}</h3>
                </div>
                <div class="card-body">
                    ${excelToolbar}
                    ${filterRow}
                    <div class="table-wrapper" style="overflow-x: auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>${ut(t('module.ppe.stock.itemCode', 'كود الصنف'))}</th>
                                    <th>${ut(t('module.ppe.stock.itemName', 'اسم الصنف'))}</th>
                                    <th>${ut(t('module.ppe.stock.category', 'الفئة'))}</th>
                                    <th>${ut(t('module.ppe.stock.in', 'الوارد'))}</th>
                                    <th>${ut(t('module.ppe.stock.out', 'المنصرف'))}</th>
                                    <th>${ut(t('module.ppe.stock.balance', 'الرصيد'))}</th>
                                    <th>${ut(t('module.ppe.stock.reorder', 'حد إعادة الطلب'))}</th>
                                    <th>${ut(t('module.ppe.stock.supplier', 'المورد'))}</th>
                                    <th>${ut(t('module.ppe.table.lastUpdate', 'آخر تحديث'))}</th>
                                    <th>${ut(t('module.ppe.table.status', 'الحالة'))}</th>
                                    <th>${ut(t('module.ppe.table.actions', 'الإجراءات'))}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filtered.map(item => {
                                    const balance = parseFloat(item.balance || 0);
                                    const minThreshold = parseFloat(item.minThreshold || 0);
                                    const isLowStock = balance < minThreshold;
                                    const rowClass = isLowStock ? 'bg-red-50' : '';
                                    
                                    return `
                                        <tr class="${rowClass}" data-item-id="${item.itemId || ''}">
                                            <td class="font-mono font-semibold">${Utils.escapeHTML(item.itemCode || '')}</td>
                                            <td>${Utils.escapeHTML(item.itemName || '')}</td>
                                            <td>${Utils.escapeHTML(item.category || '')}</td>
                                            <td>${parseFloat(item.stock_IN || 0).toFixed(0)}</td>
                                            <td>${parseFloat(item.stock_OUT || 0).toFixed(0)}</td>
                                            <td class="font-bold ${isLowStock ? 'text-red-600' : 'text-green-600'}">
                                                ${balance.toFixed(0)}
                                            </td>
                                            <td>${minThreshold.toFixed(0)}</td>
                                            <td>${Utils.escapeHTML(item.supplier || '')}</td>
                                            <td>${item.lastUpdate ? Utils.formatDate(item.lastUpdate) : '-'}</td>
                                            <td>
                                                ${isLowStock ? `
                                                    <span class="badge badge-warning">
                                                        <i class="fas fa-exclamation-triangle ml-1"></i>
                                                        ${ut(t('module.ppe.status.lowStock', 'مخزون منخفض'))}
                                                    </span>
                                                ` : `
                                                    <span class="badge badge-success">${ut(t('module.ppe.status.available', 'متوفر'))}</span>
                                                `}
                                            </td>
                                            <td>
                                                <div class="flex items-center gap-2">
                                                    <button onclick="PPE.showStockItemForm('${item.itemId}')" class="btn-icon btn-icon-primary" title="${ut(t('module.common.edit', 'تعديل'))}">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button onclick="PPE.showStockTransactions('${item.itemId}')" class="btn-icon btn-icon-info" title="${ut(t('module.ppe.btn.transactions', 'الحركات'))}">
                                                        <i class="fas fa-list"></i>
                                                    </button>
                                                    <button onclick="PPE.showTransactionForm('${item.itemId}')" class="btn-icon btn-icon-success" title="${ut(t('module.ppe.btn.addMovement', 'إضافة حركة'))}">
                                                        <i class="fas fa-plus"></i>
                                                    </button>
                                                    <button onclick="PPE.deleteStockItem('${item.itemId}')" class="btn-icon btn-icon-danger" title="${ut(t('module.ppe.btn.deleteItem', 'حذف الصنف'))}">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    /** الحصول على بيانات المخزون الحالية للعرض الجزئي (cache → AppState) */
    _getCurrentStockItems() {
        if (this.state.stockItemsCache && Array.isArray(this.state.stockItemsCache) && this.state.stockItemsCache.length) {
            return this.state.stockItemsCache;
        }
        if (Array.isArray(AppState.appData.ppeStock)) {
            return AppState.appData.ppeStock;
        }
        return [];
    },

    /** إعادة رسم بطاقة جدول المخزون فقط (دون لمس لوحة الإحصائيات) */
    refreshStockListUI() {
        const card = document.getElementById('ppe-stock-table-card');
        if (!card) return;
        const items = this._getCurrentStockItems();
        const html = this.renderStockTable(items);
        const wrap = document.createElement('div');
        wrap.innerHTML = html.trim();
        const newCard = wrap.firstElementChild;
        if (!newCard) return;
        card.replaceWith(newCard);
        this.applyModuleI18n(newCard);
        this.bindStockFilters();
    },

    _stockFilterTimer: null,

    bindStockFilters() {
        if (this.state.activeTab !== 'stock-control') return;
        if (!this.state.filters) this.state.filters = {};
        if (!this.state.filters.stock) this.resetStockFilters();

        const run = (fn) => {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(fn);
            } else {
                setTimeout(fn, 0);
            }
        };

        const search = document.getElementById('ppe-stock-search');
        if (search) {
            search.addEventListener('input', (e) => {
                this.state.filters.stock.search = (e.target && e.target.value) || '';
                clearTimeout(this._stockFilterTimer);
                this._stockFilterTimer = setTimeout(() => run(() => this.refreshStockListUI()), 220);
            });
        }
        const categoryEl = document.getElementById('ppe-stock-filter-category');
        if (categoryEl) {
            categoryEl.addEventListener('change', (e) => {
                this.state.filters.stock.category = (e.target && e.target.value) || '';
                this.refreshStockListUI();
            });
        }
        const supplierEl = document.getElementById('ppe-stock-filter-supplier');
        if (supplierEl) {
            supplierEl.addEventListener('change', (e) => {
                this.state.filters.stock.supplier = (e.target && e.target.value) || '';
                this.refreshStockListUI();
            });
        }
        const statusEl = document.getElementById('ppe-stock-filter-status');
        if (statusEl) {
            statusEl.addEventListener('change', (e) => {
                this.state.filters.stock.status = (e.target && e.target.value) || '';
                this.refreshStockListUI();
            });
        }
        const fromEl = document.getElementById('ppe-stock-date-from');
        if (fromEl) {
            fromEl.addEventListener('change', (e) => {
                this.state.filters.stock.dateFrom = (e.target && e.target.value) || '';
                this.refreshStockListUI();
            });
        }
        const toEl = document.getElementById('ppe-stock-date-to');
        if (toEl) {
            toEl.addEventListener('change', (e) => {
                this.state.filters.stock.dateTo = (e.target && e.target.value) || '';
                this.refreshStockListUI();
            });
        }
        const resetEl = document.getElementById('ppe-stock-reset-filters');
        if (resetEl) {
            resetEl.addEventListener('click', () => {
                this.resetStockFilters();
                this.refreshStockListUI();
            });
        }
        const clearEmpty = document.getElementById('ppe-stock-clear-empty-filters');
        if (clearEmpty) {
            clearEmpty.addEventListener('click', () => {
                this.resetStockFilters();
                this.refreshStockListUI();
            });
        }
    },

    /** طلب واحد لقائمة المخزون مع مهلة بالمللي ثوانٍ */
    async _fetchPPEStockRpcOnce(timeoutMs) {
        const loadPromise = Backend.sendToAppsScript('getAllPPEStockItems', { filters: {} });
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(this._t('module.ppe.stock.timeoutRpc', 'انتهت مهلة الخادم عند قراءة المخزون.'))), timeoutMs)
        );
        return Promise.race([loadPromise, timeoutPromise]);
    },

    _localStockFallbackArrays() {
        const fromCache = this.state.stockItemsCache;
        const fromApp = Array.isArray(AppState.appData.ppeStock) ? AppState.appData.ppeStock : [];
        if (fromCache && fromCache.length > 0) return fromCache;
        if (fromApp.length > 0) return fromApp;
        return [];
    },

    async loadStockItems(forceRefresh = false) {
        try {
            const now = Date.now();
            const cacheValid = this.state.stockItemsCache &&
                this.state.stockItemsCacheTime &&
                (now - this.state.stockItemsCacheTime) < this.state.stockCacheExpiry;

            if (!forceRefresh && cacheValid) {
                Utils.safeLog('✅ استخدام بيانات المخزون من Cache');
                if (this.state.stockItemsCache && !AppState.appData.ppeStock) {
                    AppState.appData.ppeStock = this.state.stockItemsCache;
                }
                return this.state.stockItemsCache;
            }

            // ✅ Inflight deduplication — يمنع تشغيل طلبات متوازية متعددة لنفس العملية
            // (المشكلة: preloadData + renderStockControlTab كانا يستدعيان loadStockItems
            //  بالتوازي → استدعاءان للخادم → ضغط على الحد المسموح + فتح Circuit Breaker.)
            if (this._stockLoadInflightPromise) {
                Utils.safeLog('⏳ طلب تحميل المخزون قيد التنفيذ — مشاركة الـ Promise');
                return this._stockLoadInflightPromise;
            }

            // غلاف الـ Promise مع تنظيف تلقائي عند الإكتمال (success أو failure)
            this._stockLoadInflightPromise = (async () => {
                try {
                    return await this._loadStockItemsInternal(forceRefresh);
                } finally {
                    this._stockLoadInflightPromise = null;
                }
            })();
            return this._stockLoadInflightPromise;
        } catch (error) {
            this._stockLoadInflightPromise = null;
            Utils.safeError('❌ خطأ في loadStockItems wrapper:', error);
            return [];
        }
    },

    /**
     * المنطق الأصلي لتحميل المخزون (مُغلَّف بـ inflight dedup في loadStockItems).
     */
    async _loadStockItemsInternal(forceRefresh = false) {
        try {
            const RPC_MS = 30000;
            const RETRY_PAUSE_MS = 700;

            if (typeof Backend !== 'undefined' && Backend.sendToAppsScript) {
                this.state.stockLoadHardErrorMsg = '';
                try {
                    let result = null;
                    let networkOrTimeoutErr = null;
                    for (let attempt = 0; attempt < 2; attempt++) {
                        try {
                            if (attempt > 0) {
                                await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
                            }
                            result = await this._fetchPPEStockRpcOnce(RPC_MS);
                            networkOrTimeoutErr = null;
                            break;
                        } catch (e) {
                            networkOrTimeoutErr = e;
                            result = null;
                        }
                    }

                    if (result && result.success) {
                        const stockItems = Array.isArray(result.data) ? result.data : [];
                        console.log('[PPE DEBUG] _loadStockItemsInternal got', stockItems.length, 'items from server');
                        if (stockItems.length > 0) {
                            console.log('[PPE DEBUG] first item:', stockItems[0]);
                        }
                        if (!AppState.appData.ppeStock) {
                            AppState.appData.ppeStock = [];
                        }
                        AppState.appData.ppeStock = stockItems;
                        this.state.stockItemsCache = stockItems;
                        this.state.stockItemsCacheTime = Date.now();
                        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                            window.DataManager.save();
                        }
                        return stockItems;
                    }

                    const backendMsg = (result && result.message) ? String(result.message) : '';
                    const local = this._localStockFallbackArrays();
                    if (local.length > 0) {
                        this.state.stockStaleWarningMsg = backendMsg || this._t(
                            'module.ppe.stock.staleDataNotice',
                            'تعذّر تحديث المخزون من الخادم؛ يُعرض آخر مخزّن محلياً. يُستحسن إعادة المحاولة بعد قليل.'
                        );
                        if (networkOrTimeoutErr) {
                            Utils.safeWarn('⚠️ فشل مزامنة المخزون بعد إعادة محاولة، عرض الكاش:', networkOrTimeoutErr);
                        } else if (backendMsg) {
                            Utils.safeWarn('⚠️ الخادم رفض قراءة المخزون، عرض الكاش:', backendMsg);
                        }
                        return local;
                    }

                    let hard = backendMsg ||
                        (networkOrTimeoutErr && networkOrTimeoutErr.message) ||
                        this._t('module.ppe.stock.loadFailedUnknown', 'تعذّر تحميل بيانات المخزون.');
                    if (/Timeout|مهلة/i.test(hard || '')) {
                        hard = this._t('module.ppe.stock.loadFailedTimeout', 'انتهت مهلة الاتصال عند تحميل المخزون. تحقق من الشبكة وحاول مجدداً.');
                    }
                    this.state.stockLoadHardErrorMsg = hard;
                    Utils.safeWarn('⚠️ لا توجد أصناف مخزونة محلياً وفشل الجلب من الخادم:', hard);
                    return [];
                } catch (outer) {
                    const local = this._localStockFallbackArrays();
                    if (local.length > 0) {
                        this.state.stockStaleWarningMsg = this._t(
                            'module.ppe.stock.staleDataNotice',
                            'تعذّر تحديث المخزون من الخادم؛ يُعرض آخر مخزّن محلياً. يُستحسن إعادة المحاولة بعد قليل.'
                        );
                        Utils.safeWarn('⚠️ خطأ تحميل المخزون، عرض الكاش:', outer);
                        return local;
                    }
                    this.state.stockLoadHardErrorMsg = String(outer && outer.message ? outer.message : outer);
                    return [];
                }
            }

            if (this.state.stockItemsCache) {
                if (!AppState.appData.ppeStock) {
                    AppState.appData.ppeStock = this.state.stockItemsCache;
                }
                return this.state.stockItemsCache;
            }
            return AppState.appData.ppeStock || [];
        } catch (error) {
            Utils.safeError('❌ خطأ في تحميل أصناف المخزون:', error);
            const fb = this._localStockFallbackArrays();
            if (fb.length > 0) {
                this.state.stockStaleWarningMsg = this._t(
                    'module.ppe.stock.staleDataNotice',
                    'تعذّر تحديث المخزون من الخادم؛ يُعرض آخر مخزّن محلياً. يُستحسن إعادة المحاولة بعد قليل.'
                );
                return fb;
            }
            this.state.stockLoadHardErrorMsg = String(error && error.message ? error.message : error);
            return [];
        }
    },

    async showStockItemForm(itemId = null) {
        const isEdit = !!itemId;
        let stockItem = null;
        
        if (isEdit) {
            const stockItems = await this.loadStockItems();
            stockItem = stockItems.find(item => item.itemId === itemId);
        }

        const t = (k, f) => this._t(k, f);
        const ut = (s) => Utils.escapeHTML(s);
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2 class="modal-title">${isEdit ? ut(t('module.ppe.title.stockItemEdit', 'تعديل صنف')) : ut(t('module.ppe.title.stockItemAdd', 'إضافة صنف جديد'))}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="stock-item-form" class="space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">${ut(t('module.ppe.stock.itemCode', 'كود الصنف'))} *</label>
                                <input type="text" id="stock-item-code" required class="form-input"
                                    value="${Utils.escapeHTML(stockItem?.itemCode || '')}"
                                    placeholder="${ut(t('module.ppe.placeholder.itemCode', ''))}">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">${ut(t('module.ppe.stock.itemName', 'اسم الصنف'))} *</label>
                                <input type="text" id="stock-item-name" required class="form-input"
                                    value="${Utils.escapeHTML(stockItem?.itemName || '')}"
                                    placeholder="${ut(t('module.ppe.placeholder.itemName', ''))}">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">${ut(t('module.ppe.label.category', 'الفئة'))}</label>
                                <input type="text" id="stock-item-category" class="form-input"
                                    value="${Utils.escapeHTML(stockItem?.category || '')}"
                                    placeholder="${ut(t('module.ppe.stock.category', 'الفئة'))}">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">${ut(t('module.ppe.label.minThreshold', 'حد إعادة الطلب *'))}</label>
                                <input type="number" id="stock-item-min-threshold" required class="form-input" min="0"
                                    value="${stockItem?.minThreshold || 0}"
                                    placeholder="${ut(t('module.ppe.stock.reorder', ''))}">
                            </div>
                            <div class="md:col-span-2">
                                <label class="block text-sm font-semibold text-gray-700 mb-2">${ut(t('module.ppe.label.supplier', 'المورد'))}</label>
                                <input type="text" id="stock-item-supplier" class="form-input"
                                    value="${Utils.escapeHTML(stockItem?.supplier || '')}"
                                    placeholder="${ut(t('module.ppe.label.supplier', ''))}">
                            </div>
                        </div>
                        <div class="flex items-center justify-end gap-4 pt-4 border-t">
                            <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">${ut(t('module.common.cancel', 'إلغاء'))}</button>
                            <button type="submit" class="btn-primary">
                                <i class="fas fa-save ml-2"></i>${isEdit ? ut(t('module.common.saveChanges', 'حفظ التعديلات')) : ut(t('module.ppe.btn.addItem', 'إضافة الصنف'))}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.applyModuleI18n(modal);

        const form = modal.querySelector('#stock-item-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            Loading.show();

            try {
                // فحص العناصر قبل الاستخدام
                const itemCodeEl = document.getElementById('stock-item-code');
                const itemNameEl = document.getElementById('stock-item-name');
                const categoryEl = document.getElementById('stock-item-category');
                const minThresholdEl = document.getElementById('stock-item-min-threshold');
                const supplierEl = document.getElementById('stock-item-supplier');
                
                if (!itemCodeEl || !itemNameEl || !categoryEl || !minThresholdEl || !supplierEl) {
                    Loading.hide();
                    Notification.error(PPE._t('module.ppe.notify.fieldsMissing', 'بعض الحقول المطلوبة غير موجودة. يرجى تحديث الصفحة والمحاولة مرة أخرى.'));
                    return;
                }

                const itemCode = itemCodeEl.value.trim();
                const itemName = itemNameEl.value.trim();
                
                // ✅ التحقق من تكرار كود الصنف في Frontend (عند الإضافة والتحديث)
                if (itemCode) {
                    const stockItems = await this.loadStockItems();
                    const existingItem = stockItems.find(item => 
                        (isEdit ? item.itemId !== stockItem.itemId : true) && // استثناء الصنف الحالي عند التحديث
                        item.itemCode && 
                        String(item.itemCode).trim().toLowerCase() === itemCode.toLowerCase()
                    );
                    if (existingItem) {
                        Loading.hide();
                        Notification.error(PPE._t('module.ppe.notify.duplicateCode', 'كود الصنف موجود بالفعل. يرجى استخدام كود آخر.'));
                        itemCodeEl.focus();
                        itemCodeEl.style.borderColor = '#ef4444';
                        return;
                    }
                }
                
                // ✅ التحقق من تكرار اسم الصنف في Frontend (عند الإضافة والتحديث)
                if (itemName) {
                    const stockItems = await this.loadStockItems();
                    const existingItemByName = stockItems.find(item => 
                        (isEdit ? item.itemId !== stockItem.itemId : true) && // استثناء الصنف الحالي عند التحديث
                        item.itemName && 
                        String(item.itemName).trim().toLowerCase() === itemName.toLowerCase()
                    );
                    if (existingItemByName) {
                        Loading.hide();
                        Notification.error(PPE._t('module.ppe.notify.duplicateName', 'اسم الصنف موجود بالفعل. يرجى استخدام اسم آخر.'));
                        itemNameEl.focus();
                        itemNameEl.style.borderColor = '#ef4444';
                        return;
                    }
                }

                const stockData = {
                    itemId: stockItem?.itemId || Utils.generateId('STOCK'),
                    itemCode: itemCode,
                    itemName: itemNameEl.value.trim(),
                    category: categoryEl.value.trim(),
                    minThreshold: parseFloat(minThresholdEl.value) || 0,
                    supplier: supplierEl.value.trim(),
                    stock_IN: stockItem?.stock_IN || 0,
                    stock_OUT: stockItem?.stock_OUT || 0,
                    balance: stockItem?.balance || 0,
                    lastUpdate: new Date().toISOString(),
                    createdAt: stockItem?.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                if (typeof Backend !== 'undefined' && Backend.sendToAppsScript) {
                    const result = await Backend.sendToAppsScript('addOrUpdatePPEStockItem', stockData);
                    console.log('[PPE DEBUG] addOrUpdatePPEStockItem result:', result);
                    if (result && result.success) {
                        // ✅ مسح Cache لتحديث البيانات في المرة القادمة
                        this.clearCache();
                        
                        // ✅ إغلاق النموذج فوراً
                        modal.remove();
                        Loading.hide();
                        
                        Notification.success(`تم ${isEdit ? 'تحديث' : 'إضافة'} الصنف بنجاح`);
                        
                        // ✅ إعادة تحميل المخزون فوراً ثم تحديث الواجهة
                        await this.loadStockItems(true);
                        this.refreshStockListUI();
                        return; // منع Loading.hide() في finally
                    } else {
                        // ✅ عرض رسالة الخطأ من Backend (مثل "كود الصنف موجود")
                        const errorMessage = result?.message || 'حدث خطأ أثناء حفظ الصنف';
                        Notification.error(errorMessage);
                        
                        // إذا كان الخطأ متعلقاً بكود الصنف أو اسم الصنف، إبراز الحقل المناسب
                        if (errorMessage.includes('كود الصنف موجود')) {
                            itemCodeEl.style.borderColor = '#ef4444';
                            itemCodeEl.focus();
                        } else if (errorMessage.includes('اسم الصنف موجود')) {
                            itemNameEl.style.borderColor = '#ef4444';
                            itemNameEl.focus();
                        }
                    }
                } else {
                    // Fallback to local storage
                    if (!AppState.appData.ppeStock) {
                        AppState.appData.ppeStock = [];
                    }
                    if (isEdit) {
                        const index = AppState.appData.ppeStock.findIndex(item => item.itemId === stockItem.itemId);
                        if (index !== -1) {
                            // ✅ التحقق من عدم تكرار كود الصنف عند التحديث (في local storage)
                            if (itemCode) {
                                const duplicateCode = AppState.appData.ppeStock.find((item, idx) => 
                                    idx !== index && 
                                    item.itemCode && 
                                    String(item.itemCode).trim().toLowerCase() === itemCode.toLowerCase()
                                );
                                if (duplicateCode) {
                                    Loading.hide();
                                    Notification.error(PPE._t('module.ppe.notify.duplicateCode', 'كود الصنف موجود بالفعل. يرجى استخدام كود آخر.'));
                                    itemCodeEl.focus();
                                    itemCodeEl.style.borderColor = '#ef4444';
                                    return;
                                }
                            }
                            // ✅ التحقق من عدم تكرار اسم الصنف عند التحديث (في local storage)
                            if (itemName) {
                                const duplicateName = AppState.appData.ppeStock.find((item, idx) => 
                                    idx !== index && 
                                    item.itemName && 
                                    String(item.itemName).trim().toLowerCase() === itemName.toLowerCase()
                                );
                                if (duplicateName) {
                                    Loading.hide();
                                    Notification.error(PPE._t('module.ppe.notify.duplicateName', 'اسم الصنف موجود بالفعل. يرجى استخدام اسم آخر.'));
                                    itemNameEl.focus();
                                    itemNameEl.style.borderColor = '#ef4444';
                                    return;
                                }
                            }
                            AppState.appData.ppeStock[index] = stockData;
                        }
                    } else {
                        // ✅ التحقق من عدم تكرار كود الصنف عند الإضافة (في local storage)
                        if (itemCode) {
                            const duplicateCode = AppState.appData.ppeStock.find(item => 
                                item.itemCode && 
                                String(item.itemCode).trim().toLowerCase() === itemCode.toLowerCase()
                            );
                            if (duplicateCode) {
                                Loading.hide();
                                Notification.error(PPE._t('module.ppe.notify.duplicateCode', 'كود الصنف موجود بالفعل. يرجى استخدام كود آخر.'));
                                itemCodeEl.focus();
                                itemCodeEl.style.borderColor = '#ef4444';
                                return;
                            }
                        }
                        // ✅ التحقق من عدم تكرار اسم الصنف عند الإضافة (في local storage)
                        if (itemName) {
                            const duplicateName = AppState.appData.ppeStock.find(item => 
                                item.itemName && 
                                String(item.itemName).trim().toLowerCase() === itemName.toLowerCase()
                            );
                            if (duplicateName) {
                                Loading.hide();
                                Notification.error(PPE._t('module.ppe.notify.duplicateName', 'اسم الصنف موجود بالفعل. يرجى استخدام اسم آخر.'));
                                itemNameEl.focus();
                                itemNameEl.style.borderColor = '#ef4444';
                                return;
                            }
                        }
                        AppState.appData.ppeStock.push(stockData);
                    }
                    if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                        window.DataManager.save();
                    }
                    
                    // ✅ مسح Cache
                    this.clearCache();
                    
                    // ✅ إغلاق النموذج فوراً
                    modal.remove();
                    Loading.hide();
                    
                    Notification.success(`تم ${isEdit ? 'تحديث' : 'إضافة'} الصنف بنجاح`);
                    
                    // ✅ إعادة تحميل المخزون فوراً ثم تحديث الواجهة
                    await this.loadStockItems(true);
                    this.refreshStockListUI();
                    return; // منع Loading.hide() في finally
                }
            } catch (error) {
                Notification.error(PPE._t('module.ppe.notify.saveRuntimeError', 'حدث خطأ') + ': ' + error.message);
            } finally {
                Loading.hide();
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async showTransactionForm(itemId = null) {
        const stockItems = await this.loadStockItems();
        const selectedItem = itemId ? stockItems.find(item => item.itemId === itemId) : null;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">إضافة حركة (وارد/منصرف)</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="transaction-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">الصنف *</label>
                            <select id="transaction-item-id" required class="form-input">
                                <option value="">اختر الصنف</option>
                                ${stockItems.map(item => `
                                    <option value="${item.itemId}" ${selectedItem && selectedItem.itemId === item.itemId ? 'selected' : ''}>
                                        ${Utils.escapeHTML(item.itemCode || '')} - ${Utils.escapeHTML(item.itemName || '')}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">نوع الحركة *</label>
                                <select id="transaction-action" required class="form-input">
                                    <option value="">اختر النوع</option>
                                    <option value="IN">وارد</option>
                                    <option value="OUT">منصرف</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">الكمية *</label>
                                <input type="number" id="transaction-quantity" required class="form-input" min="1"
                                    placeholder="الكمية">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">التاريخ *</label>
                                <input type="date" id="transaction-date" required class="form-input"
                                    value="${new Date().toISOString().slice(0, 10)}">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">صرف إلى</label>
                                <input type="text" id="transaction-issued-to" class="form-input"
                                    placeholder="اسم المستلم (للمنصرف)">
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">ملاحظات</label>
                            <textarea id="transaction-remarks" class="form-input" rows="3"
                                placeholder="ملاحظات إضافية"></textarea>
                        </div>
                        <div class="flex items-center justify-end gap-4 pt-4 border-t">
                            <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
                            <button type="submit" class="btn-primary">
                                <i class="fas fa-save ml-2"></i>حفظ الحركة
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const form = modal.querySelector('#transaction-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            Loading.show();

            try {
                // فحص العناصر قبل الاستخدام
                const itemIdEl = document.getElementById('transaction-item-id');
                const actionEl = document.getElementById('transaction-action');
                const quantityEl = document.getElementById('transaction-quantity');
                const dateEl = document.getElementById('transaction-date');
                const issuedToEl = document.getElementById('transaction-issued-to');
                const remarksEl = document.getElementById('transaction-remarks');
                
                if (!itemIdEl || !actionEl || !quantityEl || !dateEl || !issuedToEl || !remarksEl) {
                    Loading.hide();
                    Notification.error('بعض الحقول المطلوبة غير موجودة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
                    return;
                }

                const transactionData = {
                    itemId: itemIdEl.value,
                    action: actionEl.value,
                    quantity: parseFloat(quantityEl.value) || 0,
                    date: new Date(dateEl.value).toISOString(),
                    issuedTo: issuedToEl.value.trim(),
                    remarks: remarksEl.value.trim(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                if (typeof Backend !== 'undefined' && Backend.sendToAppsScript) {
                    const result = await Backend.sendToAppsScript('addPPETransaction', transactionData);
                    if (result && result.success) {
                        // ✅ مسح Cache لتحديث البيانات في المرة القادمة (لأن الحركات تؤثر على الرصيد)
                        this.clearCache();
                        
                        // ✅ إغلاق النموذج فوراً
                        modal.remove();
                        Loading.hide();
                        
                        Notification.success('تم إضافة الحركة بنجاح');
                        
                        // ✅ إعادة تحميل المخزون فوراً ثم تحديث الواجهة
                        await this.loadStockItems(true);
                        this.refreshStockListUI();
                        return; // منع Loading.hide() في finally
                    } else {
                        Notification.error(result?.message || 'حدث خطأ أثناء إضافة الحركة');
                    }
                } else {
                    // Fallback to local storage
                    transactionData.id = Utils.generateId('TRANS');
                    if (!AppState.appData.ppeTransactions) {
                        AppState.appData.ppeTransactions = [];
                    }
                    AppState.appData.ppeTransactions.push(transactionData);
                    
                    // Update stock balance locally
                    if (!AppState.appData.ppeStock) {
                        AppState.appData.ppeStock = [];
                    }
                    const stockItem = AppState.appData.ppeStock.find(item => item.itemId === transactionData.itemId);
                    if (stockItem) {
                        if (transactionData.action === 'IN') {
                            stockItem.stock_IN = (parseFloat(stockItem.stock_IN || 0) + transactionData.quantity);
                        } else {
                            stockItem.stock_OUT = (parseFloat(stockItem.stock_OUT || 0) + transactionData.quantity);
                        }
                        stockItem.balance = parseFloat(stockItem.stock_IN || 0) - parseFloat(stockItem.stock_OUT || 0);
                        stockItem.lastUpdate = new Date().toISOString();
                    }
                    
                    // ✅ مسح Cache
                    this.clearCache();
                    
                    if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                        window.DataManager.save();
                    }
                    
                    // ✅ إغلاق النموذج فوراً
                    modal.remove();
                    Loading.hide();
                    
                    Notification.success('تم إضافة الحركة بنجاح');
                    
                    // ✅ تحديث التبويب النشط فقط
                    this.refreshActiveTab();
                    return; // منع Loading.hide() في finally
                }
            } catch (error) {
                Notification.error(PPE._t('module.ppe.notify.saveRuntimeError', 'حدث خطأ') + ': ' + error.message);
            } finally {
                Loading.hide();
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async showStockTransactions(itemId) {
        if (!itemId) {
            Notification.error('معرف الصنف غير موجود');
            return;
        }

        Loading.show();

        try {
            // الحصول على بيانات الصنف
            let stockItems = [];
            try {
                stockItems = await this.loadStockItems();
                if (!Array.isArray(stockItems)) {
                    stockItems = [];
                }
            } catch (loadError) {
                Utils.safeWarn('⚠️ خطأ في تحميل أصناف المخزون:', loadError);
                stockItems = AppState.appData.ppeStock || [];
            }
            
            const stockItem = stockItems.find(item => item && item.itemId === itemId);
            
            if (!stockItem) {
                Loading.hide();
                Notification.error('الصنف غير موجود أو لم يتم تحميله');
                return;
            }

            // الحصول على الحركات من Backend
            let transactions = [];
            if (typeof Backend !== 'undefined' && Backend.sendToAppsScript) {
                try {
                    const result = await Backend.sendToAppsScript('getAllPPETransactions', { filters: { itemId: itemId } });
                    if (result && result.success) {
                        transactions = Array.isArray(result.data) ? result.data : [];
                    } else {
                        // في حالة فشل الطلب، استخدام البيانات المحلية
                        Utils.safeWarn('⚠️ فشل جلب الحركات من Backend، استخدام البيانات المحلية:', result?.message || 'خطأ غير معروف');
                        transactions = (AppState.appData.ppeTransactions || []).filter(t => t && t.itemId === itemId);
                    }
                } catch (backendError) {
                    // في حالة خطأ في الاتصال، استخدام البيانات المحلية
                    Utils.safeWarn('⚠️ خطأ في الاتصال بـ Backend، استخدام البيانات المحلية:', backendError);
                    transactions = (AppState.appData.ppeTransactions || []).filter(t => t && t.itemId === itemId);
                }
            } else {
                // Fallback to local storage
                transactions = (AppState.appData.ppeTransactions || []).filter(t => t && t.itemId === itemId);
            }
            
            // التأكد من أن transactions هي مصفوفة
            if (!Array.isArray(transactions)) {
                transactions = [];
            }

            Loading.hide();

            // إنشاء النافذة المنبثقة
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: flex; align-items: center; justify-content: center;';
            
            // ترتيب الحركات حسب التاريخ (الأحدث أولاً)
            transactions.sort((a, b) => {
                const dateA = new Date(a.date || a.createdAt || 0);
                const dateB = new Date(b.date || b.createdAt || 0);
                return dateB - dateA;
            });

            // حساب الإجماليات
            const totalIn = transactions
                .filter(t => t.action === 'IN')
                .reduce((sum, t) => sum + parseFloat(t.quantity || 0), 0);
            const totalOut = transactions
                .filter(t => t.action === 'OUT')
                .reduce((sum, t) => sum + parseFloat(t.quantity || 0), 0);
            const currentBalance = totalIn - totalOut;

            // بناء جدول الحركات
            let transactionsTableHtml = '';
            if (transactions.length === 0) {
                transactionsTableHtml = `
                    <div class="empty-state py-8">
                        <i class="fas fa-inbox text-4xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500">لا توجد حركات مسجلة لهذا الصنف</p>
                    </div>
                `;
            } else {
                transactionsTableHtml = `
                    <div class="table-wrapper" style="overflow-x: auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>التاريخ</th>
                                    <th>نوع الحركة</th>
                                    <th>الكمية</th>
                                    <th>صادر إلى</th>
                                    <th>ملاحظات</th>
                                    <th>تاريخ الإنشاء</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${transactions.map(transaction => {
                                    const actionType = transaction.action === 'IN' ? 'وارد' : 'منصرف';
                                    const actionClass = transaction.action === 'IN' ? 'badge-success' : 'badge-warning';
                                    const actionIcon = transaction.action === 'IN' ? 'fa-arrow-down' : 'fa-arrow-up';
                                    
                                    return `
                                        <tr>
                                            <td>${transaction.date ? Utils.formatDate(transaction.date) : '-'}</td>
                                            <td>
                                                <span class="badge ${actionClass}">
                                                    <i class="fas ${actionIcon} ml-1"></i>
                                                    ${actionType}
                                                </span>
                                            </td>
                                            <td class="font-semibold">${parseFloat(transaction.quantity || 0).toFixed(0)}</td>
                                            <td>${Utils.escapeHTML(transaction.issuedTo || '-')}</td>
                                            <td>${Utils.escapeHTML(transaction.remarks || '-')}</td>
                                            <td class="text-sm text-gray-500">${transaction.createdAt ? Utils.formatDate(transaction.createdAt) : '-'}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }

            modal.innerHTML = `
                <div class="modal-content" style="max-width: 1000px;">
                    <div class="modal-header">
                        <h2 class="modal-title">
                            <i class="fas fa-list-alt ml-2"></i>
                            سجل الحركات - ${Utils.escapeHTML(stockItem.itemName || stockItem.itemCode || 'صنف')}
                        </h2>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <!-- معلومات الصنف -->
                        <div class="bg-gray-50 rounded-lg p-4 mb-6">
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <p class="text-xs text-gray-500 mb-1">كود الصنف</p>
                                    <p class="font-semibold text-gray-800">${Utils.escapeHTML(stockItem.itemCode || '-')}</p>
                                </div>
                                <div>
                                    <p class="text-xs text-gray-500 mb-1">اسم الصنف</p>
                                    <p class="font-semibold text-gray-800">${Utils.escapeHTML(stockItem.itemName || '-')}</p>
                                </div>
                                <div>
                                    <p class="text-xs text-gray-500 mb-1">الرصيد الحالي</p>
                                    <p class="font-semibold text-green-600">${parseFloat(stockItem.balance || 0).toFixed(0)}</p>
                                </div>
                                <div>
                                    <p class="text-xs text-gray-500 mb-1">عدد الحركات</p>
                                    <p class="font-semibold text-gray-800">${transactions.length}</p>
                                </div>
                            </div>
                        </div>

                        <!-- ملخص الحركات -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <p class="text-sm text-green-700 mb-1">إجمالي الوارد</p>
                                        <p class="text-2xl font-bold text-green-600">${totalIn.toFixed(0)}</p>
                                    </div>
                                    <i class="fas fa-arrow-down text-green-500 text-2xl"></i>
                                </div>
                            </div>
                            <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <p class="text-sm text-orange-700 mb-1">إجمالي المنصرف</p>
                                        <p class="text-2xl font-bold text-orange-600">${totalOut.toFixed(0)}</p>
                                    </div>
                                    <i class="fas fa-arrow-up text-orange-500 text-2xl"></i>
                                </div>
                            </div>
                            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <p class="text-sm text-blue-700 mb-1">الرصيد المحسوب</p>
                                        <p class="text-2xl font-bold text-blue-600">${currentBalance.toFixed(0)}</p>
                                    </div>
                                    <i class="fas fa-calculator text-blue-500 text-2xl"></i>
                                </div>
                            </div>
                        </div>

                        <!-- جدول الحركات -->
                        <div class="mb-4">
                            <h3 class="text-lg font-semibold text-gray-800 mb-3">
                                <i class="fas fa-table ml-2"></i>
                                تفاصيل الحركات
                            </h3>
                            ${transactionsTableHtml}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                            <i class="fas fa-times ml-2"></i>
                            إغلاق
                        </button>
                        <button class="btn-primary" onclick="PPE.showTransactionForm('${itemId}'); this.closest('.modal-overlay').remove();">
                            <i class="fas fa-plus ml-2"></i>
                            إضافة حركة جديدة
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // إغلاق النافذة عند النقر خارجها
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });

        } catch (error) {
            Loading.hide();
            Utils.safeError('❌ خطأ في عرض سجل الحركات:', error);
            Notification.error('حدث خطأ أثناء عرض سجل الحركات: ' + (error.message || error));
        }
    },

    async deleteStockItem(itemId) {
        if (!itemId) {
            Notification.error('معرف الصنف غير موجود');
            return;
        }

        // الحصول على بيانات الصنف لعرض اسمه في رسالة التأكيد
        const stockItems = await this.loadStockItems();
        const stockItem = stockItems.find(item => item && item.itemId === itemId);
        
        if (!stockItem) {
            Notification.error('الصنف غير موجود');
            return;
        }

        // رسالة تأكيد الحذف
        const confirmMessage = `هل أنت متأكد من حذف الصنف "${stockItem.itemName || stockItem.itemCode}"؟\n\n` +
                              `⚠️ تحذير: لا يمكن حذف الصنف إذا كان يحتوي على حركات مسجلة.`;

        if (!confirm(confirmMessage)) {
            return;
        }

        Loading.show();

        try {
            if (typeof Backend !== 'undefined' && Backend.sendToAppsScript) {
                const result = await Backend.sendToAppsScript('deletePPEStockItem', { itemId: itemId });
                
                if (result && result.success) {
                    // ✅ مسح Cache لتحديث البيانات
                    this.state.stockItemsCache = null;
                    this.state.stockItemsCacheTime = null;
                    
                    Notification.success('تم حذف الصنف بنجاح');
                    await this.load(); // إعادة تحميل البيانات
                } else {
                    Notification.error(result?.message || 'حدث خطأ أثناء حذف الصنف');
                }
            } else {
                // Fallback to local storage
                if (AppState.appData.ppeStock) {
                    AppState.appData.ppeStock = AppState.appData.ppeStock.filter(item => item.itemId !== itemId);
                    // ✅ مسح Cache
                    this.state.stockItemsCache = null;
                    this.state.stockItemsCacheTime = null;
                    
                    Notification.success('تم حذف الصنف بنجاح');
                    await this.load();
                } else {
                    Notification.error('لا توجد بيانات محلية للحذف');
                }
            }
        } catch (error) {
            Utils.safeError('❌ خطأ في حذف الصنف:', error);
            Notification.error('حدث خطأ أثناء حذف الصنف: ' + (error.message || error));
        } finally {
            Loading.hide();
        }
    },

    // ═══════════════════════════════════════════════════════════════════
    // ✅ تبويب التحليل — PPE Analytics Dashboard
    // (نفس نمط الحوادث/العيادة/الملاحظات — Chart.js + KPIs + فلاتر + PDF)
    // ═══════════════════════════════════════════════════════════════════

    _ppeAnalyticsPeriod: '0', // الفترة الافتراضية: الكل
    _ppeAnalyticsCharts: {},   // ذاكرة Chart instances

    /** قالب لوحة التحليل (HTML) */
    async renderPpeAnalysisTab() {
        // تحميل Chart.js مبكراً (لا نُعطّل العرض)
        this._ppeEnsureChartJS().catch(() => {});

        return `
        <div id="ppe-analytics-root" style="font-family:inherit;">

            <!-- ═══ شريط الأدوات ═══ -->
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px;padding:16px 20px;background:linear-gradient(135deg,#0F766E 0%,#0E7490 50%,#1E3A8A 100%);border-radius:14px;color:#fff;box-shadow:0 8px 28px rgba(15,118,110,0.32);">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:44px;height:44px;background:rgba(255,255,255,0.18);border-radius:12px;display:flex;align-items:center;justify-content:center;backdrop-filter: blur(8px);">
                        <i class="fas fa-hard-hat" style="font-size:20px;"></i>
                    </div>
                    <div>
                        <h2 style="margin:0;font-size:1.15rem;font-weight:700;">لوحة تحليل مهمات الوقاية</h2>
                        <p style="margin:0;font-size:0.75rem;opacity:0.9;">تحليل شامل • الاستلامات • المخزون • الفئات • الإدارات • تصدير PDF</p>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <span style="font-size:0.72rem;opacity:0.85;margin-inline-end:2px;">الفترة:</span>
                    <div style="display:flex;gap:3px;flex-wrap:wrap;">
                        ${['30','90','180','365','0'].map((v,i) => {
                            const labels=['30 يوم','3 أشهر','6 أشهر','سنة','الكل'];
                            const active=(this._ppeAnalyticsPeriod||'0')===v;
                            return `<button class="ppe-period-btn" data-period="${v}" style="padding:5px 10px;border-radius:8px;border:none;cursor:pointer;font-size:0.75rem;font-weight:600;transition:all .2s;background:${active?'#fff':'rgba(255,255,255,0.15)'};color:${active?'#0F766E':'#fff'};">${labels[i]}</button>`;
                        }).join('')}
                    </div>
                    <button id="ppe-toggle-filters-btn" style="padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.4);cursor:pointer;background:rgba(255,255,255,0.12);color:#fff;font-size:0.78rem;font-weight:600;transition:all .2s;display:flex;align-items:center;gap:5px;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.12)'">
                        <i class="fas fa-sliders-h"></i><span>فلاتر</span><span id="ppe-filter-badge" style="display:none;background:#fbbf24;color:#78350f;font-size:0.65rem;padding:1px 5px;border-radius:10px;margin-inline-start:2px;">●</span>
                    </button>
                    <button id="ppe-export-pdf-btn" style="padding:6px 14px;border-radius:8px;border:none;cursor:pointer;background:rgba(0,0,0,0.25);color:#fff;font-size:0.78rem;font-weight:600;transition:all .2s;display:flex;align-items:center;gap:5px;" onmouseover="this.style.background='rgba(0,0,0,0.4)'" onmouseout="this.style.background='rgba(0,0,0,0.25)'">
                        <i class="fas fa-file-pdf"></i><span>PDF</span>
                    </button>
                    <button id="ppe-analytics-refresh" style="padding:6px 10px;border-radius:8px;border:none;cursor:pointer;background:rgba(255,255,255,0.15);color:#fff;font-size:0.78rem;transition:all .2s;" onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'" title="تحديث">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
            </div>

            <!-- ═══ لوحة الفلاتر ═══ -->
            <div id="ppe-filter-panel" style="display:none;background:#f0fdfa;border:1.5px solid #99f6e4;border-radius:12px;padding:18px 20px;margin-bottom:16px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-sliders-h" style="color:#0F766E;font-size:14px;"></i>
                        <span style="font-weight:700;font-size:0.9rem;color:#0F766E;">الفلاتر التفاعلية</span>
                        <span id="ppe-filter-count" style="background:#ccfbf1;color:#115E59;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:600;"></span>
                    </div>
                    <button id="ppe-filter-reset-btn" style="padding:4px 12px;border-radius:8px;border:1px solid #99f6e4;background:#fff;color:#64748b;font-size:0.75rem;cursor:pointer;" onmouseover="this.style.background='#f0fdfa';this.style.color='#0F766E'" onmouseout="this.style.background='#fff';this.style.color='#64748b'">
                        <i class="fas fa-times me-1"></i>مسح الكل
                    </button>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
                    ${[
                        {id:'ppe-af-type',     icon:'fas fa-hard-hat',   color:'#0F766E', label:'نوع المعدة'},
                        {id:'ppe-af-dept',     icon:'fas fa-building',   color:'#f59e0b', label:'الإدارة'},
                        {id:'ppe-af-category', icon:'fas fa-tags',       color:'#6366f1', label:'الفئة'},
                        {id:'ppe-af-status',   icon:'fas fa-flag',       color:'#0891b2', label:'الحالة'},
                        {id:'ppe-af-supplier', icon:'fas fa-truck',      color:'#8b5cf6', label:'المورد'},
                    ].map(f=>`
                        <div>
                            <label style="font-size:0.72rem;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">
                                <i class="${f.icon}" style="color:${f.color};margin-inline-end:4px;"></i>${f.label}
                            </label>
                            <select id="${f.id}" style="width:100%;padding:7px 10px;border:1.5px solid #99f6e4;border-radius:8px;font-size:0.82rem;background:#fff;color:#374151;cursor:pointer;" onfocus="this.style.borderColor='#0F766E'" onblur="this.style.borderColor='#99f6e4'">
                                <option value="">الكل</option>
                            </select>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- ═══ KPI Cards ═══ -->
            <div id="ppe-kpi-strip" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-bottom:20px;">
                <div style="text-align:center;padding:16px;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i></div>
            </div>

            <!-- ═══ Row 1: نوع المعدة + الاتجاه الزمني ═══ -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-bottom:16px;">
                <div class="content-card" style="padding:0;overflow:hidden;">
                    <div style="padding:13px 18px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-hard-hat" style="color:#0F766E;"></i>
                        <span style="font-weight:700;font-size:0.88rem;">حسب نوع المعدة (أعلى 10)</span>
                    </div>
                    <div style="padding:12px;position:relative;height:280px;">
                        <canvas id="ppe-chart-type"></canvas>
                        <div id="ppe-chart-type-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">لا توجد بيانات</div>
                    </div>
                </div>
                <div class="content-card" style="padding:0;overflow:hidden;">
                    <div style="padding:13px 18px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-chart-area" style="color:#8b5cf6;"></i>
                        <span style="font-weight:700;font-size:0.88rem;">الاتجاه الزمني للاستلامات (آخر 12 شهر)</span>
                    </div>
                    <div style="padding:12px;position:relative;height:280px;">
                        <canvas id="ppe-chart-trend"></canvas>
                        <div id="ppe-chart-trend-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">لا توجد بيانات</div>
                    </div>
                </div>
            </div>

            <!-- ═══ Row 2: الإدارة + الحالة ═══ -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-bottom:16px;">
                <div class="content-card" style="padding:0;overflow:hidden;">
                    <div style="padding:13px 18px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-building" style="color:#f59e0b;"></i>
                        <span style="font-weight:700;font-size:0.88rem;">حسب الإدارة (أعلى 8)</span>
                    </div>
                    <div style="padding:12px;position:relative;height:260px;">
                        <canvas id="ppe-chart-dept"></canvas>
                        <div id="ppe-chart-dept-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">لا توجد بيانات</div>
                    </div>
                </div>
                <div class="content-card" style="padding:0;overflow:hidden;">
                    <div style="padding:13px 18px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-flag" style="color:#0891b2;"></i>
                        <span style="font-weight:700;font-size:0.88rem;">حسب الحالة</span>
                    </div>
                    <div style="padding:12px;position:relative;height:260px;">
                        <canvas id="ppe-chart-status"></canvas>
                        <div id="ppe-chart-status-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">لا توجد بيانات</div>
                    </div>
                </div>
            </div>

            <!-- ═══ Row 3: المخزون - فئة + مورد ═══ -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-bottom:16px;">
                <div class="content-card" style="padding:0;overflow:hidden;">
                    <div style="padding:13px 18px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-tags" style="color:#6366f1;"></i>
                        <span style="font-weight:700;font-size:0.88rem;">المخزون حسب الفئة</span>
                    </div>
                    <div style="padding:12px;position:relative;height:260px;">
                        <canvas id="ppe-chart-category"></canvas>
                        <div id="ppe-chart-category-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">لا توجد بيانات مخزون</div>
                    </div>
                </div>
                <div class="content-card" style="padding:0;overflow:hidden;">
                    <div style="padding:13px 18px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-truck" style="color:#8b5cf6;"></i>
                        <span style="font-weight:700;font-size:0.88rem;">المخزون حسب المورد (أعلى 8)</span>
                    </div>
                    <div style="padding:12px;position:relative;height:260px;">
                        <canvas id="ppe-chart-supplier"></canvas>
                        <div id="ppe-chart-supplier-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">لا توجد بيانات مخزون</div>
                    </div>
                </div>
            </div>

            <!-- ═══ Row 4: المقارنة السنوية ═══ -->
            <div class="content-card" style="padding:0;overflow:hidden;margin-bottom:16px;">
                <div style="padding:13px 18px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
                    <i class="fas fa-chart-column" style="color:#0F766E;"></i>
                    <span style="font-weight:700;font-size:0.88rem;">المقارنة السنوية للاستلامات (آخر 3 سنوات)</span>
                </div>
                <div style="padding:12px;position:relative;height:260px;">
                    <canvas id="ppe-chart-yearly"></canvas>
                    <div id="ppe-chart-yearly-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">لا توجد بيانات</div>
                </div>
            </div>

            <!-- ═══ جدول أحدث الاستلامات ═══ -->
            <div class="content-card" style="padding:0;overflow:hidden;">
                <div style="padding:13px 18px 12px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-list-ul" style="color:#0F766E;"></i>
                        <span style="font-weight:700;font-size:0.88rem;">أحدث الاستلامات</span>
                    </div>
                    <span id="ppe-recent-count" style="background:#f0fdfa;color:#0F766E;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;"></span>
                </div>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                        <thead>
                            <tr style="background:#f0fdfa;">
                                <th style="padding:9px 12px;text-align:start;font-weight:700;color:#0F766E;white-space:nowrap;">التاريخ</th>
                                <th style="padding:9px 12px;text-align:start;font-weight:700;color:#0F766E;">اسم الموظف</th>
                                <th style="padding:9px 12px;text-align:start;font-weight:700;color:#0F766E;">الكود</th>
                                <th style="padding:9px 12px;text-align:start;font-weight:700;color:#0F766E;">نوع المعدة</th>
                                <th style="padding:9px 12px;text-align:center;font-weight:700;color:#0F766E;">الكمية</th>
                                <th style="padding:9px 12px;text-align:start;font-weight:700;color:#0F766E;">الإدارة</th>
                                <th style="padding:9px 12px;text-align:center;font-weight:700;color:#0F766E;">الحالة</th>
                            </tr>
                        </thead>
                        <tbody id="ppe-recent-tbody">
                            <tr><td colspan="7" style="padding:24px;text-align:center;color:#94a3b8;">جاري التحميل...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    },

    /** تحميل Chart.js عند الحاجة */
    async _ppeEnsureChartJS() {
        if (typeof Chart !== 'undefined') return true;
        const existing = document.querySelector('script[src*="chart.js"],script[src*="chartjs"]');
        if (existing) {
            return new Promise(resolve => {
                let tries = 0;
                const t = setInterval(() => {
                    if (typeof Chart !== 'undefined') { clearInterval(t); resolve(true); }
                    else if (++tries > 50) { clearInterval(t); resolve(false); }
                }, 100);
            });
        }
        return new Promise(resolve => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            s.onload = () => resolve(true);
            s.onerror = () => {
                const s2 = document.createElement('script');
                s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js';
                s2.onload = () => resolve(true);
                s2.onerror = () => resolve(false);
                document.head.appendChild(s2);
            };
            document.head.appendChild(s);
        });
    },

    /** المصدر الموحَّد لبيانات الاستلامات */
    _getPpeReceiptsData() {
        return Array.isArray(AppState?.appData?.ppe) ? AppState.appData.ppe : [];
    },

    /** المصدر الموحَّد لبيانات المخزون */
    _getPpeStockData() {
        return Array.isArray(AppState?.appData?.ppeStock) ? AppState.appData.ppeStock : [];
    },

    /** استخراج تاريخ الاستلام كـ Date object (مع fallback ذكي) */
    _getPpeReceiptDate(record) {
        if (!record) return null;
        const raw = record.receiptDate || record.date || record.createdAt || record.timestamp || null;
        if (!raw) return null;
        try {
            const d = new Date(raw);
            return isNaN(d.getTime()) ? null : d;
        } catch (e) { return null; }
    },

    /** تطبيع الحالة */
    _normalizePpeStatus(s) {
        const v = String(s || '').trim().toLowerCase();
        if (v === 'مستلم' || v === 'received' || v === 'مكتمل') return 'received';
        if (v === 'قيد التسليم' || v === 'pending' || v === 'بانتظار') return 'pending';
        return 'other';
    },

    /** الدالة الرئيسية: تحديث لوحة التحليل */
    async updatePpeAnalyticsDashboard() {
        const root = document.getElementById('ppe-analytics-root');
        if (!root) return;

        // ── 1. جمع البيانات ──
        const allReceipts = this._getPpeReceiptsData();
        const allStock = this._getPpeStockData();
        const period = parseInt(this._ppeAnalyticsPeriod || '0', 10);

        // ── 2. تصفية بالفترة ──
        const cutoff = period > 0 ? (() => { const d = new Date(); d.setDate(d.getDate() - period); return d; })() : null;
        const inPeriod = cutoff
            ? allReceipts.filter(r => { const d = this._getPpeReceiptDate(r); return d && d >= cutoff; })
            : allReceipts.slice();

        // ── 3. ملء قوائم الفلاتر ──
        this._ppePopulateAnalyticsFilters(inPeriod, allStock);

        // ── 4. تطبيق الفلاتر التفاعلية ──
        const { receipts: filtered, stock: filteredStock } = this._ppeApplyAnalyticsFilters(inPeriod, allStock);
        const total = filtered.length;
        const countEl = document.getElementById('ppe-filter-count');
        if (countEl) countEl.textContent = `${total} استلام`;

        // ── 5. حساب KPIs ──
        const totalQty = filtered.reduce((sum, r) => sum + (parseFloat(r.quantity) || 0), 0);
        const receivedCount = filtered.filter(r => this._normalizePpeStatus(r.status) === 'received').length;
        const pendingCount = filtered.filter(r => this._normalizePpeStatus(r.status) === 'pending').length;

        const lowStockItems = filteredStock.filter(item => {
            const bal = parseFloat(item.balance || 0);
            const min = parseFloat(item.minThreshold || 0);
            return min > 0 && bal < min;
        });
        const stockItemsCount = filteredStock.length;
        const lowStockCount = lowStockItems.length;
        const uniqueEmployees = new Set(filtered.map(r => r.employeeCode || r.employeeName).filter(Boolean)).size;

        const now = new Date();
        const thisMonth = filtered.filter(r => {
            const d = this._getPpeReceiptDate(r);
            return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        }).length;
        const monthsSet = new Set(filtered.map(r => {
            const d = this._getPpeReceiptDate(r);
            return d ? `${d.getFullYear()}-${d.getMonth()}` : null;
        }).filter(Boolean));
        const avgPerMonth = monthsSet.size > 0 ? (total / monthsSet.size).toFixed(1) : '0';

        const kpiEl = document.getElementById('ppe-kpi-strip');
        if (kpiEl) {
            const kpis = [
                { label:'إجمالي الاستلامات', value:total,             icon:'fas fa-receipt',         color:'#0F766E', bg:'#f0fdfa', border:'#99f6e4' },
                { label:'الكميات المُستلَمة',  value:totalQty.toFixed(0),icon:'fas fa-cubes',           color:'#0E7490', bg:'#ecfeff', border:'#a5f3fc' },
                { label:'مكتملة الاستلام',  value:receivedCount,        icon:'fas fa-circle-check',    color:'#047857', bg:'#ecfdf5', border:'#a7f3d0' },
                { label:'قيد التسليم',      value:pendingCount,         icon:'fas fa-hourglass-half',  color:'#b45309', bg:'#fffbeb', border:'#fde68a' },
                { label:'أصناف المخزون',    value:stockItemsCount,      icon:'fas fa-boxes',           color:'#6366f1', bg:'#eef2ff', border:'#c7d2fe' },
                { label:'منخفض المخزون',    value:lowStockCount,        icon:'fas fa-triangle-exclamation', color:'#dc2626', bg:'#fef2f2', border:'#fecaca' },
                { label:'الموظفون',         value:uniqueEmployees,      icon:'fas fa-users',           color:'#7c3aed', bg:'#f5f3ff', border:'#ddd6fe' },
                { label:'هذا الشهر',        value:thisMonth,            icon:'fas fa-calendar-day',    color:'#db2777', bg:'#fdf2f8', border:'#fbcfe8' },
                { label:'متوسط شهري',       value:avgPerMonth,          icon:'fas fa-calendar-check',  color:'#1E3A8A', bg:'#eef2ff', border:'#c7d2fe' },
            ];
            kpiEl.innerHTML = kpis.map(k => `
                <div style="background:${k.bg};border:1px solid ${k.border};border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;transition:all .2s;cursor:default;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,0.09)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
                    <div style="width:38px;height:38px;background:${k.color};border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="${k.icon}" style="color:#fff;font-size:15px;"></i>
                    </div>
                    <div>
                        <div style="font-size:1.3rem;font-weight:800;color:${k.color};line-height:1;" dir="ltr">${k.value}</div>
                        <div style="font-size:0.68rem;color:#64748b;margin-top:2px;white-space:nowrap;">${k.label}</div>
                    </div>
                </div>`).join('');
        }

        // ── 6. تحميل Chart.js ──
        const loaded = await this._ppeEnsureChartJS();
        if (!loaded || typeof Chart === 'undefined') {
            const exist = root.querySelector('.ppe-chart-load-warning');
            if (!exist) {
                root.insertAdjacentHTML('afterbegin', '<div class="ppe-chart-load-warning" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:10px;"><i class="fas fa-exclamation-triangle" style="color:#d97706;"></i><span style="font-size:0.85rem;color:#92400e;">تعذّر تحميل مكتبة الرسوم البيانية. الأرقام أعلاه متاحة.</span></div>');
            }
            return;
        }

        // ── 7. الرسوم البيانية ──
        // نوع المعدة (HBar أعلى 10)
        const typeMap = this._ppeGroupBy(filtered, r => String(r.equipmentType || r.type || 'غير محدد').trim(), 10);
        this._ppeHBar('ppe-chart-type', typeMap.labels, typeMap.data, 'rgba(15,118,110,0.78)');

        // الاتجاه الزمني (12 شهر)
        this._ppeTrend('ppe-chart-trend', allReceipts);

        // الإدارة (HBar أعلى 8)
        const deptMap = this._ppeGroupBy(filtered, r => String(r.department || r.dept || 'غير محدد').trim(), 8);
        this._ppeHBar('ppe-chart-dept', deptMap.labels, deptMap.data, 'rgba(245,158,11,0.78)');

        // الحالة (Doughnut)
        const statusLabels = { received:'مستلم', pending:'قيد التسليم', other:'غير محدد' };
        const statusMap = {};
        filtered.forEach(r => { const k = statusLabels[this._normalizePpeStatus(r?.status)] || 'غير محدد'; statusMap[k] = (statusMap[k]||0)+1; });
        const statusColors = { 'مستلم':'rgba(5,150,105,0.85)', 'قيد التسليم':'rgba(245,158,11,0.85)', 'غير محدد':'rgba(148,163,184,0.8)' };
        this._ppeDoughnut('ppe-chart-status', Object.keys(statusMap), Object.values(statusMap), Object.keys(statusMap).map(l=>statusColors[l]||'rgba(148,163,184,0.8)'));

        // الفئة (Doughnut)
        const categoryMap = this._ppeGroupBy(filteredStock, item => String(item.category || 'بدون فئة').trim(), 8);
        const categoryPalette = ['rgba(99,102,241,0.85)','rgba(15,118,110,0.85)','rgba(245,158,11,0.85)','rgba(244,63,94,0.85)','rgba(139,92,246,0.85)','rgba(8,145,178,0.85)','rgba(5,150,105,0.85)','rgba(217,119,6,0.85)'];
        this._ppeDoughnut('ppe-chart-category', categoryMap.labels, categoryMap.data, categoryMap.labels.map((_,i)=>categoryPalette[i % categoryPalette.length]));

        // المورد (HBar أعلى 8)
        const supplierMap = this._ppeGroupBy(filteredStock, item => String(item.supplier || 'غير محدد').trim(), 8);
        this._ppeHBar('ppe-chart-supplier', supplierMap.labels, supplierMap.data, 'rgba(139,92,246,0.78)');

        // المقارنة السنوية
        this._ppeYearly('ppe-chart-yearly', allReceipts);

        // ── 8. جدول أحدث الاستلامات ──
        const recent = filtered.slice().sort((a, b) => {
            const da = this._getPpeReceiptDate(a), db = this._getPpeReceiptDate(b);
            return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
        }).slice(0, 20);
        const recentCountEl = document.getElementById('ppe-recent-count');
        if (recentCountEl) recentCountEl.textContent = `${recent.length} استلام`;
        const tbody = document.getElementById('ppe-recent-tbody');
        if (tbody) {
            const statusBadge = (st) => {
                const k = this._normalizePpeStatus(st);
                const map = {
                    received: ['مستلم','#ecfdf5','#047857'],
                    pending:  ['قيد التسليم','#fffbeb','#b45309'],
                    other:    ['غير محدد','#f1f5f9','#475569']
                };
                const [text,bg,c] = map[k] || map.other;
                return `<span style="background:${bg};color:${c};padding:2px 9px;border-radius:12px;font-size:0.72rem;font-weight:700;">${text}</span>`;
            };
            tbody.innerHTML = recent.length === 0
                ? '<tr><td colspan="7" style="padding:24px;text-align:center;color:#94a3b8;">لا توجد استلامات في هذه الفترة</td></tr>'
                : recent.map((r, i) => {
                    const d = this._getPpeReceiptDate(r);
                    const dateStr = d ? d.toLocaleDateString('ar-EG', { year:'numeric', month:'short', day:'numeric' }) : '—';
                    const rowBg = i%2===0 ? '#fff' : '#fafafa';
                    return `<tr style="border-bottom:1px solid #f8fafc;background:${rowBg};" onmouseover="this.style.background='#f0fdfa'" onmouseout="this.style.background='${rowBg}'">
                        <td style="padding:9px 12px;white-space:nowrap;color:#374151;" dir="ltr">${dateStr}</td>
                        <td style="padding:9px 12px;color:#374151;">${Utils.escapeHTML(r.employeeName || '—')}</td>
                        <td style="padding:9px 12px;color:#374151;font-family:monospace;" dir="ltr">${Utils.escapeHTML(r.employeeCode || '—')}</td>
                        <td style="padding:9px 12px;color:#374151;">${Utils.escapeHTML(r.equipmentType || r.type || '—')}</td>
                        <td style="padding:9px 12px;text-align:center;color:#374151;font-weight:700;" dir="ltr">${parseFloat(r.quantity || 0).toFixed(0)}</td>
                        <td style="padding:9px 12px;color:#374151;">${Utils.escapeHTML(r.department || '—')}</td>
                        <td style="padding:9px 12px;text-align:center;">${statusBadge(r.status)}</td>
                    </tr>`;
                }).join('');
        }
    },

    /** ملء قوائم الفلاتر */
    _ppePopulateAnalyticsFilters(receipts, stock) {
        const unique = (arr, fn) => [...new Set(arr.map(fn).filter(Boolean))].sort();
        const fill = (id, values) => {
            const el = document.getElementById(id); if (!el) return;
            const cur = el.value;
            el.innerHTML = '<option value="">الكل</option>' + values.map(v => `<option value="${Utils.escapeHTML(String(v))}"${v===cur?' selected':''}>${Utils.escapeHTML(String(v))}</option>`).join('');
        };
        // الحالة ثابتة (canonical)
        const statusEl = document.getElementById('ppe-af-status');
        if (statusEl) {
            const cur = statusEl.value;
            statusEl.innerHTML = `<option value="">الكل</option>
                <option value="received"${cur==='received'?' selected':''}>مستلم</option>
                <option value="pending"${cur==='pending'?' selected':''}>قيد التسليم</option>`;
        }
        fill('ppe-af-type',     unique(receipts, r => String(r.equipmentType || r.type || '').trim()));
        fill('ppe-af-dept',     unique(receipts, r => String(r.department || r.dept || '').trim()));
        fill('ppe-af-category', unique(stock,    item => String(item.category || '').trim()));
        fill('ppe-af-supplier', unique(stock,    item => String(item.supplier || '').trim()));
    },

    /** تطبيق الفلاتر التفاعلية على الاستلامات والمخزون */
    _ppeApplyAnalyticsFilters(receipts, stock) {
        const get = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
        const fType     = get('ppe-af-type');
        const fDept     = get('ppe-af-dept');
        const fCategory = get('ppe-af-category');
        const fStatus   = get('ppe-af-status');
        const fSupplier = get('ppe-af-supplier');
        const hasAny    = [fType, fDept, fCategory, fStatus, fSupplier].some(v => v !== '');
        const badge     = document.getElementById('ppe-filter-badge');
        if (badge) badge.style.display = hasAny ? 'inline' : 'none';

        const filteredReceipts = receipts.filter(r => {
            if (fType   && String(r.equipmentType || r.type || '').trim() !== fType) return false;
            if (fDept   && String(r.department || r.dept || '').trim() !== fDept) return false;
            if (fStatus && this._normalizePpeStatus(r?.status) !== fStatus) return false;
            return true;
        });
        const filteredStock = stock.filter(item => {
            if (fCategory && String(item.category || '').trim() !== fCategory) return false;
            if (fSupplier && String(item.supplier || '').trim() !== fSupplier) return false;
            return true;
        });
        return { receipts: filteredReceipts, stock: filteredStock };
    },

    /** مساعد: تجميع حسب دالة */
    _ppeGroupBy(arr, fn, limit = 0) {
        const map = {};
        arr.forEach(item => { const k = fn(item) || 'غير محدد'; map[k] = (map[k] || 0) + 1; });
        let entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
        if (limit > 0) entries = entries.slice(0, limit);
        return { labels: entries.map(e => e[0]), data: entries.map(e => e[1]) };
    },

    /** مساعد: Doughnut */
    _ppeDoughnut(canvasId, labels, data, colors) {
        const canvas = document.getElementById(canvasId), emptyEl = document.getElementById(canvasId + '-empty');
        if (!canvas) return;
        if (!data.length || data.reduce((a, b) => a + b, 0) === 0) { canvas.style.display = 'none'; if (emptyEl) emptyEl.style.display = 'flex'; return; }
        if (emptyEl) emptyEl.style.display = 'none'; canvas.style.display = '';
        try { if (this._ppeAnalyticsCharts[canvasId]) this._ppeAnalyticsCharts[canvasId].destroy(); } catch (e) {}
        const total = data.reduce((a, b) => a + b, 0);
        this._ppeAnalyticsCharts[canvasId] = new Chart(canvas, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '60%',
                plugins: { legend: { position: 'bottom', labels: { padding: 10, font: { size: 11 }, usePointStyle: true, boxWidth: 9 } },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} (${total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0}%)` } } } }
        });
    },

    /** مساعد: HBar */
    _ppeHBar(canvasId, labels, data, color) {
        const canvas = document.getElementById(canvasId), emptyEl = document.getElementById(canvasId + '-empty');
        if (!canvas) return;
        if (!data.length || data.reduce((a, b) => a + b, 0) === 0) { canvas.style.display = 'none'; if (emptyEl) emptyEl.style.display = 'flex'; return; }
        if (emptyEl) emptyEl.style.display = 'none'; canvas.style.display = '';
        try { if (this._ppeAnalyticsCharts[canvasId]) this._ppeAnalyticsCharts[canvasId].destroy(); } catch (e) {}
        this._ppeAnalyticsCharts[canvasId] = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [{ data, backgroundColor: color || 'rgba(15,118,110,0.78)', borderRadius: 5, borderSkipped: false }] },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x}` } } },
                scales: { x: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } }, grid: { color: '#f1f5f9' } },
                    y: { ticks: { font: { size: 11 }, callback: v => String(labels[v]).length > 18 ? String(labels[v]).slice(0, 17) + '…' : labels[v] } } } }
        });
    },

    /** مساعد: الاتجاه الزمني (12 شهر) */
    _ppeTrend(canvasId, arr) {
        const canvas = document.getElementById(canvasId), emptyEl = document.getElementById(canvasId + '-empty');
        if (!canvas) return;
        const now = new Date();
        const arabicMonths = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
        const months = [];
        for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ y: d.getFullYear(), m: d.getMonth(), label: `${arabicMonths[d.getMonth()]} ${d.getFullYear()}` }); }
        const counts = months.map(mo => arr.filter(r => { const d = this._getPpeReceiptDate(r); return d && d.getFullYear() === mo.y && d.getMonth() === mo.m; }).length);
        if (counts.reduce((a, b) => a + b, 0) === 0) { canvas.style.display = 'none'; if (emptyEl) emptyEl.style.display = 'flex'; return; }
        if (emptyEl) emptyEl.style.display = 'none'; canvas.style.display = '';
        try { if (this._ppeAnalyticsCharts[canvasId]) this._ppeAnalyticsCharts[canvasId].destroy(); } catch (e) {}
        const maxC = Math.max(...counts);
        this._ppeAnalyticsCharts[canvasId] = new Chart(canvas, {
            type: 'bar',
            data: { labels: months.map(m => m.label), datasets: [
                { label: 'الاستلامات', data: counts, backgroundColor: counts.map(c => c === maxC ? 'rgba(15,118,110,0.9)' : 'rgba(15,118,110,0.5)'), borderRadius: 5, borderSkipped: false, order: 1 },
                { label: 'الاتجاه', data: counts, type: 'line', borderColor: 'rgba(30,58,138,0.9)', backgroundColor: 'rgba(30,58,138,0.08)', borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#1E3A8A', tension: 0.4, fill: true, order: 0 }
            ] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true, font: { size: 11 } } }, tooltip: { mode: 'index', intersect: false } },
                scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } }, y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } }, grid: { color: '#f8fafc' } } } }
        });
    },

    /** مساعد: المقارنة السنوية (3 سنوات — إجمالي + كميات) */
    _ppeYearly(canvasId, arr) {
        const canvas = document.getElementById(canvasId), emptyEl = document.getElementById(canvasId + '-empty');
        if (!canvas) return;
        const currentYear = new Date().getFullYear();
        const years = [currentYear - 2, currentYear - 1, currentYear];
        const totalByYear = years.map(y => arr.filter(r => { const d = this._getPpeReceiptDate(r); return d && d.getFullYear() === y; }).length);
        const qtyByYear = years.map(y => arr.filter(r => { const d = this._getPpeReceiptDate(r); return d && d.getFullYear() === y; }).reduce((sum, r) => sum + (parseFloat(r.quantity) || 0), 0));
        if (totalByYear.reduce((a, b) => a + b, 0) === 0) { canvas.style.display = 'none'; if (emptyEl) emptyEl.style.display = 'flex'; return; }
        if (emptyEl) emptyEl.style.display = 'none'; canvas.style.display = '';
        try { if (this._ppeAnalyticsCharts[canvasId]) this._ppeAnalyticsCharts[canvasId].destroy(); } catch (e) {}
        this._ppeAnalyticsCharts[canvasId] = new Chart(canvas, {
            type: 'bar',
            data: { labels: years.map(String), datasets: [
                { label: 'عدد الاستلامات', data: totalByYear, backgroundColor: 'rgba(15,118,110,0.78)', borderRadius: 5, borderSkipped: false, yAxisID: 'y' },
                { label: 'الكميات', data: qtyByYear, backgroundColor: 'rgba(30,58,138,0.78)', borderRadius: 5, borderSkipped: false, yAxisID: 'y1' }
            ] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true, font: { size: 11 } } }, tooltip: { mode: 'index', intersect: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 12 } } },
                    y:  { beginAtZero: true, position: 'right', ticks: { precision: 0, font: { size: 11 } }, grid: { color: '#f8fafc' }, title: { display: true, text: 'عدد', font: { size: 10 } } },
                    y1: { beginAtZero: true, position: 'left', ticks: { precision: 0, font: { size: 11 } }, grid: { display: false }, title: { display: true, text: 'كمية', font: { size: 10 } } }
                }
            }
        });
    },

    /** ربط أحداث لوحة التحليل */
    _ppeBindAnalyticsEvents() {
        const root = document.getElementById('ppe-analytics-root');
        if (!root) return;

        // أزرار الفترة
        root.querySelectorAll('.ppe-period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._ppeAnalyticsPeriod = btn.getAttribute('data-period');
                root.querySelectorAll('.ppe-period-btn').forEach(b => {
                    const active = b === btn;
                    b.style.background = active ? '#fff' : 'rgba(255,255,255,0.15)';
                    b.style.color = active ? '#0F766E' : '#fff';
                });
                this.updatePpeAnalyticsDashboard();
            });
        });

        // زر تحديث
        const refreshBtn = document.getElementById('ppe-analytics-refresh');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.updatePpeAnalyticsDashboard());

        // زر PDF
        const pdfBtn = document.getElementById('ppe-export-pdf-btn');
        if (pdfBtn) pdfBtn.addEventListener('click', () => this._ppeExportAnalyticsPDF());

        // زر تبديل الفلاتر
        const toggleBtn = document.getElementById('ppe-toggle-filters-btn');
        const filterPanel = document.getElementById('ppe-filter-panel');
        if (toggleBtn && filterPanel) {
            toggleBtn.addEventListener('click', () => {
                const isOpen = filterPanel.style.display !== 'none';
                filterPanel.style.display = isOpen ? 'none' : 'block';
                toggleBtn.style.background = isOpen ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.35)';
            });
        }

        // الفلاتر التفاعلية
        ['ppe-af-type','ppe-af-dept','ppe-af-category','ppe-af-status','ppe-af-supplier'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => this.updatePpeAnalyticsDashboard());
        });

        // زر إعادة تعيين الفلاتر
        const resetBtn = document.getElementById('ppe-filter-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                ['ppe-af-type','ppe-af-dept','ppe-af-category','ppe-af-status','ppe-af-supplier'].forEach(id => {
                    const el = document.getElementById(id); if (el) el.value = '';
                });
                this.updatePpeAnalyticsDashboard();
            });
        }
    },

    /** تصدير لوحة التحليل كـ PDF (نفس نمط incidents._incidentExportPDF) */
    async _ppeExportAnalyticsPDF() {
        try {
            const root = document.getElementById('ppe-analytics-root');
            if (!root) {
                Notification.error('لا يمكن العثور على لوحة التحليل');
                return;
            }

            // تحميل html2canvas و jsPDF عند الحاجة
            if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
                Loading.show('جاري تحميل أدوات التصدير…');
                await Promise.all([
                    new Promise(resolve => {
                        if (typeof html2canvas !== 'undefined') return resolve();
                        const s = document.createElement('script');
                        s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
                        s.onload = resolve; s.onerror = resolve; document.head.appendChild(s);
                    }),
                    new Promise(resolve => {
                        if (typeof window.jspdf !== 'undefined') return resolve();
                        const s = document.createElement('script');
                        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                        s.onload = resolve; s.onerror = resolve; document.head.appendChild(s);
                    })
                ]);
                Loading.hide();
            }

            if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
                Notification.error('تعذّر تحميل أدوات التصدير');
                return;
            }

            Loading.show('جاري تجهيز التقرير…');

            // بناء هيدر برانديد (يُضاف فوق المحتوى مؤقتاً)
            const companyName = String(AppState?.companySettings?.name || 'HSEHub 360').trim();
            const secondaryName = String(AppState?.companySettings?.secondaryName || 'إدارة السلامة والصحة المهنية والبيئة').trim();
            const exportDateTime = (typeof Utils !== 'undefined' && typeof Utils.formatDateTime === 'function')
                ? Utils.formatDateTime(new Date())
                : new Date().toLocaleString('ar-EG');

            const header = document.createElement('div');
            header.id = 'ppe-pdf-header-temp';
            header.style.cssText = 'background:linear-gradient(135deg,#0F766E 0%,#0E7490 50%,#1E3A8A 100%);color:#fff;padding:18px 24px;border-radius:14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;font-family:Arial,sans-serif;';
            header.innerHTML = `
                <div>
                    <div style="font-size:18px;font-weight:800;margin-bottom:4px;">${Utils.escapeHTML(companyName)}</div>
                    <div style="font-size:13px;opacity:0.95;">${Utils.escapeHTML(secondaryName)}</div>
                </div>
                <div style="text-align:end;">
                    <div style="font-size:16px;font-weight:700;margin-bottom:4px;">تقرير تحليل مهمات الوقاية</div>
                    <div style="font-size:12px;opacity:0.95;" dir="ltr">${Utils.escapeHTML(exportDateTime)}</div>
                </div>
            `;
            root.insertBefore(header, root.firstChild);

            const canvas = await html2canvas(root, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });

            // إزالة الهيدر المؤقت
            header.remove();

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            // قص الصورة إذا كانت أطول من صفحة واحدة
            let heightLeft = imgHeight, position = 0;
            const imgData = canvas.toDataURL('image/png');
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;
            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pdfHeight;
            }

            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            pdf.save(`PPE-Analytics-${ts}.pdf`);
            Loading.hide();
            Notification.success('تم تصدير تقرير التحليل بنجاح');
        } catch (error) {
            Loading.hide();
            Utils.safeError('❌ خطأ في تصدير PDF:', error);
            Notification.error('حدث خطأ أثناء التصدير: ' + (error.message || error));
            // محاولة إزالة الهيدر المؤقت في حال فشل
            const stuck = document.getElementById('ppe-pdf-header-temp');
            if (stuck) stuck.remove();
        }
    }
};

// ===== Export module to global scope =====
// تصدير الموديول إلى window فوراً لضمان توافره
(function () {
    'use strict';
    try {
        if (typeof window !== 'undefined' && typeof PPE !== 'undefined') {
            window.PPE = PPE;
            
            // إشعار عند تحميل الموديول بنجاح
            if (typeof AppState !== 'undefined' && AppState.debugMode && typeof Utils !== 'undefined' && Utils.safeLog) {
                Utils.safeLog('✅ PPE module loaded and available on window.PPE');
            }
        }
    } catch (error) {
        console.error('❌ خطأ في تصدير PPE:', error);
        // محاولة التصدير مرة أخرى حتى في حالة الخطأ
        if (typeof window !== 'undefined' && typeof PPE !== 'undefined') {
            try {
                window.PPE = PPE;
            } catch (e) {
                console.error('❌ فشل تصدير PPE:', e);
            }
        }
    }
})();