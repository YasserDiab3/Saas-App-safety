/**
 * Violations Module
 * ØªÙ… Ø§Ø³ØªØ®Ø±Ø§Ø¬Ù‡ Ù…Ù† app-modules.js
 */
// ===== Violations Module (مخالفات الموظفين والمقاولين) =====
const Violations = {
    currentFilters: {
        search: '',
        personType: '',
        violationType: '',
        severity: '',
        status: ''
    },

    parseFineAmount(value) {
        if (value === null || value === undefined || value === '') return 0;
        if (typeof value === 'number') {
            return Number.isFinite(value) && value >= 0 ? value : 0;
        }
        const arabicIndicDigits = '٠١٢٣٤٥٦٧٨٩';
        const easternArabicDigits = '۰۱۲۳۴۵۶۷۸۹';
        const toAsciiDigits = (input) => String(input || '').replace(/[٠-٩۰-۹]/g, (char) => {
            const idxArabicIndic = arabicIndicDigits.indexOf(char);
            if (idxArabicIndic >= 0) return String(idxArabicIndic);
            const idxEasternArabic = easternArabicDigits.indexOf(char);
            return idxEasternArabic >= 0 ? String(idxEasternArabic) : char;
        });
        const normalized = String(value)
            .trim();
        const normalizedDigits = toAsciiDigits(normalized)
            .replace(/[,\u066C]/g, '')
            .replace(/\u066B/g, '.')
            .replace(/[^\d.\-]/g, '');
        const parsed = Number(normalizedDigits);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    },

    // ═══════════════════════════════════════════════════════════════════
    // ✅ Currency Manager — تحويل العملة (EGP افتراضي + USD اختياري)
    // كل القيم في قاعدة البيانات مخزّنة بالجنيه المصري (EGP).
    // التحويل لـ USD يحدث فقط وقت العرض حسب exchange rate القابل للتعديل.
    // ═══════════════════════════════════════════════════════════════════
    _VIOL_CURRENCY_KEY: 'viol_currency',
    _VIOL_RATE_KEY: 'viol_exchange_rate',
    _VIOL_DEFAULT_RATE: 50, // 1 USD ≈ 50 EGP (افتراضي قابل للتعديل)

    getCurrentCurrency() {
        try {
            const stored = localStorage.getItem(this._VIOL_CURRENCY_KEY);
            return (stored === 'USD') ? 'USD' : 'EGP';
        } catch (e) { return 'EGP'; }
    },

    setCurrentCurrency(code) {
        const normalized = (code === 'USD') ? 'USD' : 'EGP';
        try { localStorage.setItem(this._VIOL_CURRENCY_KEY, normalized); } catch (e) {}
        return normalized;
    },

    getExchangeRate() {
        try {
            const stored = parseFloat(localStorage.getItem(this._VIOL_RATE_KEY));
            return (Number.isFinite(stored) && stored > 0) ? stored : this._VIOL_DEFAULT_RATE;
        } catch (e) { return this._VIOL_DEFAULT_RATE; }
    },

    setExchangeRate(rate) {
        const num = parseFloat(rate);
        if (!Number.isFinite(num) || num <= 0) return false;
        try { localStorage.setItem(this._VIOL_RATE_KEY, String(num)); } catch (e) {}
        return true;
    },

    /**
     * تحويل المبلغ من EGP إلى العملة المطلوبة
     * @param {number} amountEGP - المبلغ بالجنيه المصري
     * @param {string} [toCurrency] - العملة المستهدفة (افتراضي: الحالية)
     * @returns {number} المبلغ بالعملة المستهدفة
     */
    convertFineAmount(amountEGP, toCurrency) {
        const target = toCurrency || this.getCurrentCurrency();
        const num = Number(amountEGP) || 0;
        if (target === 'USD') {
            const rate = this.getExchangeRate();
            return rate > 0 ? num / rate : 0;
        }
        return num; // EGP
    },

    /**
     * تنسيق المبلغ بصورة جاهزة للعرض (مع رمز العملة الحالية)
     * مثال: 1500 → "1,500 ج.م" أو "30 $"
     */
    formatFineAmount(amountEGP, options = {}) {
        const currency = options.currency || this.getCurrentCurrency();
        const symbol = currency === 'USD' ? '$' : 'ج.م';
        const converted = this.convertFineAmount(amountEGP, currency);
        // الجنيه المصري: بدون كسور. الدولار: حتى منزلتين عشريتين
        const formatted = currency === 'USD'
            ? converted.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
            : converted.toLocaleString('ar-EG', { maximumFractionDigits: 0 });
        return currency === 'USD' ? `${formatted} $` : `${formatted} ${symbol}`;
    },

    /**
     * إرجاع رمز/اسم العملة الحالية للاستخدام في عناوين المخططات
     */
    getCurrencyLabel(form = 'short') {
        const currency = this.getCurrentCurrency();
        if (currency === 'USD') return form === 'long' ? 'دولار أمريكي' : '$';
        return form === 'long' ? 'جنيه مصري' : 'ج.م';
    },

    normalizeViolationRecord(record) {
        if (!record || typeof record !== 'object') return null;
        const fineAmountRaw =
            record.fineAmount ??
            record.defaultFineAmount ??
            record.fine_amount ??
            record.fine ??
            record.amount ??
            record['القيمة المالية'] ??
            record['قيمة مالية'] ??
            0;
        const fineAmount = this.parseFineAmount(fineAmountRaw);
        const personType = record.personType || (record.contractorName ? 'contractor' : 'employee');
        return {
            ...record,
            personType,
            fineAmount
        };
    },

    /** معرّف آمن لاستخدامه داخل onclick (يفادي كسر السلسلة عند وجود علامات اقتباس أو شرطة مائلة) */
    _escapeIdForHandler(id) {
        return JSON.stringify(id == null ? '' : String(id));
    },

    /**
     * القيمة المالية المعروضة: إن كانت 0 أو فارغة في السجل لكن نوع المخالفة له غرامة افتراضية، تُعرض غرامة النوع فوراً (بدون انتظار مزامنة الشيت).
     */
    getEffectiveFineAmount(record) {
        const norm = this.normalizeViolationRecord(record);
        if (!norm) return 0;
        const stored = this.parseFineAmount(norm.fineAmount);
        if (stored > 0) return stored;
        let types = [];
        try {
            if (typeof ViolationTypesManager !== 'undefined' && ViolationTypesManager.ensureInitialized && ViolationTypesManager.getAll) {
                ViolationTypesManager.ensureInitialized();
                types = ViolationTypesManager.getAll() || [];
            }
        } catch (e) {
            types = [];
        }
        if (!types.length && typeof AppState !== 'undefined' && Array.isArray(AppState?.appData?.violationTypes)) {
            types = AppState.appData.violationTypes;
        }
        const id = String(norm.violationTypeId || '').trim();
        const name = String(norm.violationType || '').trim().toLowerCase();
        let typeFine = 0;
        if (id) {
            const t = types.find((x) => x && String(x.id) === id);
            if (t) typeFine = this.parseFineAmount(t.fineAmount);
        }
        if (typeFine <= 0 && name) {
            const t = types.find((x) => x && String(x.name || '').trim().toLowerCase() === name);
            if (t) typeFine = this.parseFineAmount(t.fineAmount);
        }
        return typeFine > 0 ? typeFine : stored;
    },

    _normKeyStr(v) {
        if (v == null) return '';
        let str = String(v).trim().toLowerCase();
        // إزالة الحركات (التشكيل)
        str = str.replace(/[\u064B-\u065F\u0670]/g, '');
        // توحيد الألف (أ، إ، آ) إلى ألف عادية (ا)
        str = str.replace(/[أإآ]/g, 'ا');
        // توحيد التاء المربوطة (ة) إلى هاء (ه)
        str = str.replace(/ة/g, 'ه');
        // توحيد الياء والألف المقصورة (ى) إلى ياء عادية (ي)
        str = str.replace(/[ى]/g, 'ي');
        // إزالة المسافات المتعددة
        str = str.replace(/\s+/g, ' ');
        // إزالة الرموز وعلامات الترقيم التي قد تختلف
        str = str.replace(/[^\w\s\u0600-\u06FF]/g, '');
        return str.trim();
    },

    sameViolationPersonForSequence(draft, existing) {
        const pt = this._normKeyStr(draft.personType) || 'employee';
        const p2 = this._normKeyStr(existing.personType) || 'employee';
        if (pt !== p2) return false;
        if (pt === 'contractor') {
            const n1 = this._normKeyStr(draft.contractorName);
            const n2 = this._normKeyStr(existing.contractorName);
            if (!n1 || !n2 || n1 !== n2) return false;
            const w1 = this._normKeyStr(draft.contractorWorker);
            const w2 = this._normKeyStr(existing.contractorWorker);
            if (!w1 && !w2) return true;
            return w1 === w2;
        }
        const c1 = this._normKeyStr(draft.employeeCode || draft.employeeNumber);
        const c2 = this._normKeyStr(existing.employeeCode || existing.employeeNumber);
        return !!c1 && c1 === c2;
    },

    getViolationYearMonthKey(violationDate) {
        const d = new Date(violationDate);
        if (isNaN(d.getTime())) return null;
        return d.getFullYear() * 12 + d.getMonth();
    },

    // ───────── دائرة اعتماد المخالفات ─────────
    // Cache للإعدادات (يُجدَّد كل 5 دقائق)
    _violApprovalSettingsCache: null,
    _violApprovalSettingsCacheAt: 0,

    /**
     * احصل على إعدادات دائرة الاعتماد (مع cache)
     */
    async getViolationApprovalSettings() {
        const now = Date.now();
        if (this._violApprovalSettingsCache && (now - this._violApprovalSettingsCacheAt) < 5 * 60 * 1000) {
            return this._violApprovalSettingsCache;
        }
        try {
            if (typeof Backend !== 'undefined' && Backend.sendRequest) {
                const res = await Backend.sendRequest({
                    action: 'getViolationApprovalSettings',
                    data: { __timeoutMs: 20000 }
                });
                if (res && res.success && res.data) {
                    this._violApprovalSettingsCache = {
                        requireApproval: res.data.requireApproval === true,
                        defaultApprovers: Array.isArray(res.data.defaultApprovers) ? res.data.defaultApprovers : [],
                        bypassRoles: Array.isArray(res.data.bypassRoles) ? res.data.bypassRoles : ['admin', 'مدير النظام']
                    };
                    this._violApprovalSettingsCacheAt = now;
                    return this._violApprovalSettingsCache;
                }
            }
        } catch (e) {
            if (AppState.debugMode) Utils.safeWarn('getViolationApprovalSettings:', e);
        }
        // Fallback افتراضي (آمن: لا اعتماد)
        return { requireApproval: false, defaultApprovers: [], bypassRoles: ['admin', 'مدير النظام'] };
    },

    /**
     * هل المستخدم الحالي يتجاوز دائرة الاعتماد؟ (مدير النظام مثلاً)
     */
    isCurrentUserBypassApproval(bypassRoles) {
        try {
            if (typeof Permissions !== 'undefined' && typeof Permissions.isCurrentUserEffectiveAdmin === 'function') {
                if (Permissions.isCurrentUserEffectiveAdmin()) return true;
            }
            const role = AppState.currentUser?.role || '';
            if (Array.isArray(bypassRoles) && bypassRoles.length > 0) {
                const roleLower = String(role).toLowerCase();
                return bypassRoles.some(br => String(br).toLowerCase() === roleLower || String(br) === role);
            }
        } catch (e) { /* ignore */ }
        return false;
    },

    /**
     * فحص بوابة الاعتماد قبل الحفظ
     * يُرجع { requiresApproval: boolean, settings }
     */
    async checkViolationApprovalGate(formData, opts = {}) {
        const settings = await this.getViolationApprovalSettings();
        if (!settings || !settings.requireApproval) {
            return { requiresApproval: false, settings };
        }
        // المدير يتجاوز
        if (this.isCurrentUserBypassApproval(settings.bypassRoles)) {
            return { requiresApproval: false, settings, bypassed: true };
        }
        // لا توجد قائمة معتمدين → لا يمكن الاعتماد، نسمح بالحفظ المباشر
        if (!Array.isArray(settings.defaultApprovers) || settings.defaultApprovers.length === 0) {
            if (AppState.debugMode) Utils.safeWarn('approval required but no approvers configured — allowing direct save');
            return { requiresApproval: false, settings, reason: 'no_approvers' };
        }
        return { requiresApproval: true, settings };
    },

    /**
     * إرسال المخالفة لدائرة الاعتماد
     */
    async submitViolationForApproval(formData, opts = {}) {
        try {
            const settings = await this.getViolationApprovalSettings();
            const approvers = (settings.defaultApprovers || []).slice();
            const cu = AppState.currentUser || {};

            const payload = {
                requestType: opts.isEdit ? 'update' : 'add',
                violationData: formData,
                originalViolationId: opts.originalId || '',
                approvers: approvers,
                createdBy: cu.id || cu.email || '',
                createdByName: cu.name || cu.email || '',
                notes: opts.notes || ''
            };

            const res = await Backend.sendRequest({
                action: 'addViolationApprovalRequest',
                data: { ...payload, __timeoutMs: 30000 }
            });

            return res || { success: false, message: 'لا توجد استجابة من الخادم' };
        } catch (error) {
            return { success: false, message: error?.message || String(error) };
        }
    },

    /**
     * جلب طلبات اعتماد المخالفات (للوحة الإدارة)
     */
    async fetchViolationApprovalRequests(filters = {}) {
        try {
            const res = await Backend.sendRequest({
                action: 'getAllViolationApprovalRequests',
                data: { ...filters, __timeoutMs: 25000 }
            });
            return (res && res.success && Array.isArray(res.data)) ? res.data : [];
        } catch (e) {
            if (AppState.debugMode) Utils.safeWarn('fetchViolationApprovalRequests:', e);
            return [];
        }
    },

    /**
     * اعتماد طلب
     */
    async approveViolationRequest(requestId, opts = {}) {
        const cu = AppState.currentUser || {};
        const approver = {
            userId: cu.id || cu.email || '',
            userName: cu.name || '',
            userEmail: cu.email || ''
        };
        try {
            const res = await Backend.sendRequest({
                action: 'approveViolationApprovalRequest',
                data: { requestId, approver, notes: opts.notes || '', force: opts.force === true, __timeoutMs: 30000 }
            });
            // إبطال cache الإعدادات
            this._violApprovalSettingsCache = null;
            return res || { success: false, message: 'لا توجد استجابة' };
        } catch (e) {
            return { success: false, message: e?.message || String(e) };
        }
    },

    /**
     * رفض طلب
     */
    async rejectViolationRequest(requestId, reason) {
        const cu = AppState.currentUser || {};
        const approver = {
            userId: cu.id || cu.email || '',
            userName: cu.name || '',
            userEmail: cu.email || ''
        };
        try {
            const res = await Backend.sendRequest({
                action: 'rejectViolationApprovalRequest',
                data: { requestId, approver, reason: String(reason || '').trim(), __timeoutMs: 30000 }
            });
            return res || { success: false, message: 'لا توجد استجابة' };
        } catch (e) {
            return { success: false, message: e?.message || String(e) };
        }
    },

    /**
     * حفظ إعدادات دائرة الاعتماد (للمدير)
     */
    async saveViolationApprovalSettings(settings) {
        const cu = AppState.currentUser || {};
        try {
            const res = await Backend.sendRequest({
                action: 'updateViolationApprovalSettings',
                data: {
                    requireApproval: settings.requireApproval === true,
                    defaultApprovers: Array.isArray(settings.defaultApprovers) ? settings.defaultApprovers : [],
                    bypassRoles: Array.isArray(settings.bypassRoles) ? settings.bypassRoles : ['admin', 'مدير النظام'],
                    updatedBy: cu.id || cu.email || '',
                    updatedByName: cu.name || '',
                    __timeoutMs: 25000
                }
            });
            // إبطال cache
            this._violApprovalSettingsCache = null;
            return res || { success: false, message: 'لا توجد استجابة' };
        } catch (e) {
            return { success: false, message: e?.message || String(e) };
        }
    },

    /**
     * عرض شاشة إدارة طلبات الاعتماد + الإعدادات
     */
    async showViolationApprovalsManager() {
        const isAdmin = (typeof Permissions !== 'undefined' && typeof Permissions.isCurrentUserEffectiveAdmin === 'function')
            ? Permissions.isCurrentUserEffectiveAdmin()
            : false;
        const cu = AppState.currentUser || {};

        // قائمة المستخدمين من النظام لاختيار المعتمدين
        const allUsers = (AppState.appData?.users || []).filter(u => u && (u.email || u.id || u.name));

        // جلب الطلبات
        const requests = await this.fetchViolationApprovalRequests({
            // المسؤول يرى الكل، غير المسؤول يرى فقط طلباته الخاصة كمعتمد
            userEmail: isAdmin ? '' : (cu.email || ''),
            userId: isAdmin ? '' : (cu.id || '')
        });

        // جلب الإعدادات
        const settings = await this.getViolationApprovalSettings();

        const modal = document.createElement('div');
        modal.className = 'modal modal-open';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow:auto;';
        modal.innerHTML = `
            <div style="background:#fff;border-radius:14px;max-width:1100px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,0.3);">
                <div style="background:linear-gradient(135deg,#991b1b,#7f1d1d);color:#fff;padding:18px 22px;border-radius:14px 14px 0 0;display:flex;align-items:center;justify-content:space-between;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <i class="fas fa-clipboard-check" style="font-size:22px;"></i>
                        <h3 style="margin:0;font-size:1.15rem;">دائرة اعتماد المخالفات</h3>
                    </div>
                    <button type="button" id="viol-approvals-close" style="background:rgba(255,255,255,0.2);border:none;border-radius:8px;color:#fff;width:36px;height:36px;cursor:pointer;font-size:18px;">×</button>
                </div>

                <div style="padding:18px 22px;">
                    ${isAdmin ? `
                    <!-- إعدادات الإدارة -->
                    <div style="background:#fef2f2;border:2px solid #fecaca;border-radius:12px;padding:16px;margin-bottom:18px;">
                        <h4 style="margin:0 0 12px 0;color:#991b1b;font-size:1rem;display:flex;align-items:center;gap:8px;">
                            <i class="fas fa-cog"></i> إعدادات دائرة الاعتماد (للمدير)
                        </h4>
                        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:14px;">
                            <input type="checkbox" id="viol-require-approval" ${settings.requireApproval ? 'checked' : ''}
                                   style="width:18px;height:18px;cursor:pointer;">
                            <span style="font-weight:600;color:#374151;">تفعيل دائرة الاعتماد للمخالفات الجديدة</span>
                        </label>

                        <div style="margin-bottom:12px;">
                            <label style="display:block;font-weight:600;color:#374151;margin-bottom:6px;">المعتمدون المعيَّنون:</label>
                            <div id="viol-approvers-list" style="display:flex;flex-wrap:wrap;gap:8px;padding:8px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;min-height:48px;">
                                ${(settings.defaultApprovers || []).map((a, idx) => `
                                    <span data-approver-idx="${idx}" style="background:#dbeafe;color:#1e40af;padding:5px 10px;border-radius:20px;font-size:0.85rem;display:inline-flex;align-items:center;gap:6px;">
                                        <i class="fas fa-user"></i>
                                        ${Utils.escapeHTML(a.userName || a.userEmail || a.userId || '?')}
                                        <button type="button" class="viol-remove-approver" data-idx="${idx}" style="background:none;border:none;color:#dc2626;cursor:pointer;padding:0;font-size:14px;">×</button>
                                    </span>
                                `).join('') || '<span style="color:#94a3b8;font-size:0.85rem;">لم يُضَف معتمدون بعد</span>'}
                            </div>
                        </div>

                        <div style="display:flex;gap:8px;align-items:flex-end;">
                            <div style="flex:1;">
                                <label style="display:block;font-size:0.8rem;color:#6b7280;margin-bottom:4px;">إضافة معتمد من قائمة المستخدمين:</label>
                                <select id="viol-add-approver-select" class="form-input" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:8px;">
                                    <option value="">-- اختر مستخدماً --</option>
                                    ${allUsers.map(u => `
                                        <option value="${Utils.escapeHTML(String(u.id || u.email || ''))}"
                                                data-name="${Utils.escapeHTML(String(u.name || ''))}"
                                                data-email="${Utils.escapeHTML(String(u.email || ''))}"
                                                data-role="${Utils.escapeHTML(String(u.role || ''))}">
                                            ${Utils.escapeHTML(u.name || u.email || u.id)} ${u.role ? '(' + Utils.escapeHTML(u.role) + ')' : ''}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <button type="button" id="viol-add-approver-btn" style="background:#1e40af;color:#fff;border:none;padding:9px 16px;border-radius:8px;cursor:pointer;font-weight:600;">
                                <i class="fas fa-plus"></i> إضافة
                            </button>
                        </div>

                        <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px;">
                            <button type="button" id="viol-save-settings-btn" style="background:#059669;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:600;">
                                <i class="fas fa-save"></i> حفظ الإعدادات
                            </button>
                        </div>
                    </div>
                    ` : ''}

                    <!-- قائمة الطلبات -->
                    <div>
                        <h4 style="margin:0 0 12px 0;color:#374151;font-size:1rem;display:flex;align-items:center;gap:8px;">
                            <i class="fas fa-list-ul"></i> طلبات الاعتماد
                            <span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:12px;font-size:0.75rem;">${requests.filter(r => r.status === 'pending').length} معلَّقة</span>
                        </h4>
                        <div style="display:flex;gap:8px;margin-bottom:12px;">
                            <button type="button" class="viol-req-filter" data-filter="pending" style="background:#fbbf24;color:#78350f;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:0.85rem;font-weight:600;">معلَّقة</button>
                            <button type="button" class="viol-req-filter" data-filter="approved" style="background:#dcfce7;color:#166534;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:0.85rem;">معتمدة</button>
                            <button type="button" class="viol-req-filter" data-filter="rejected" style="background:#fee2e2;color:#991b1b;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:0.85rem;">مرفوضة</button>
                            <button type="button" class="viol-req-filter" data-filter="all" style="background:#e5e7eb;color:#374151;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:0.85rem;">الكل</button>
                        </div>
                        <div id="viol-approval-requests-list">
                            ${this._renderViolationApprovalRequests(requests.filter(r => r.status === 'pending'), { isAdmin })}
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // ─── إعداد الأحداث ───
        modal.querySelector('#viol-approvals-close')?.addEventListener('click', () => modal.remove());

        // إزالة معتمد من القائمة (في الإعدادات)
        modal.querySelectorAll('.viol-remove-approver').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.getAttribute('data-idx'), 10);
                if (!isNaN(idx)) {
                    settings.defaultApprovers.splice(idx, 1);
                    // إعادة فتح
                    modal.remove();
                    this.showViolationApprovalsManager();
                }
            });
        });

        // إضافة معتمد
        modal.querySelector('#viol-add-approver-btn')?.addEventListener('click', () => {
            const sel = modal.querySelector('#viol-add-approver-select');
            const val = sel?.value;
            if (!val) { Notification.warning('اختر مستخدماً'); return; }
            const opt = sel.options[sel.selectedIndex];
            const newApprover = {
                userId: val,
                userName: opt?.dataset?.name || '',
                userEmail: opt?.dataset?.email || '',
                role: opt?.dataset?.role || ''
            };
            // تجنب التكرار
            if (settings.defaultApprovers.some(a => a.userId === newApprover.userId)) {
                Notification.warning('هذا المستخدم مضاف بالفعل');
                return;
            }
            settings.defaultApprovers.push(newApprover);
            modal.remove();
            this.showViolationApprovalsManager();
        });

        // حفظ الإعدادات
        modal.querySelector('#viol-save-settings-btn')?.addEventListener('click', async () => {
            const requireApproval = modal.querySelector('#viol-require-approval')?.checked === true;
            const newSettings = {
                requireApproval,
                defaultApprovers: settings.defaultApprovers,
                bypassRoles: settings.bypassRoles
            };
            const res = await this.saveViolationApprovalSettings(newSettings);
            if (res && res.success) {
                Notification.success('تم حفظ الإعدادات بنجاح');
            } else {
                Notification.error((res && res.message) || 'فشل حفظ الإعدادات');
            }
        });

        // فلاتر الطلبات
        modal.querySelectorAll('.viol-req-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.getAttribute('data-filter');
                const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
                const listEl = modal.querySelector('#viol-approval-requests-list');
                if (listEl) listEl.innerHTML = this._renderViolationApprovalRequests(filtered, { isAdmin });
                this._wireViolationApprovalActions(modal, isAdmin);
            });
        });

        this._wireViolationApprovalActions(modal, isAdmin);
    },

    _renderViolationApprovalRequests(requests, opts = {}) {
        if (!requests || requests.length === 0) {
            return '<div style="text-align:center;padding:24px;color:#94a3b8;background:#f9fafb;border-radius:10px;">لا توجد طلبات</div>';
        }
        return requests.map(r => {
            const vd = r.violationData || {};
            const personName = vd.employeeName || vd.contractorName || '—';
            const statusBadge = {
                'pending': '<span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:12px;font-size:0.75rem;font-weight:700;">معلَّق</span>',
                'approved': '<span style="background:#dcfce7;color:#166534;padding:3px 10px;border-radius:12px;font-size:0.75rem;font-weight:700;">معتمد</span>',
                'committed': '<span style="background:#dcfce7;color:#166534;padding:3px 10px;border-radius:12px;font-size:0.75rem;font-weight:700;">مسجَّل</span>',
                'rejected': '<span style="background:#fee2e2;color:#991b1b;padding:3px 10px;border-radius:12px;font-size:0.75rem;font-weight:700;">مرفوض</span>'
            }[r.status] || `<span style="background:#e5e7eb;color:#374151;padding:3px 10px;border-radius:12px;font-size:0.75rem;">${r.status}</span>`;

            const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—';
            const approvers = Array.isArray(r.approvers) ? r.approvers : [];
            const currentIdx = parseInt(r.currentApproverIndex, 10) || 0;

            const showActions = r.status === 'pending' && opts.isAdmin; // المدير يستطيع اعتماد/رفض دائماً

            return `
                <div data-request-id="${Utils.escapeHTML(String(r.id))}" style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
                        <div>
                            <div style="font-weight:700;color:#374151;font-size:0.95rem;">${Utils.escapeHTML(personName)} — ${Utils.escapeHTML(vd.violationType || '—')}</div>
                            <div style="font-size:0.78rem;color:#6b7280;margin-top:3px;">رقم الطلب: ${Utils.escapeHTML(String(r.id))} • أُنشئ: ${dateStr} • بواسطة: ${Utils.escapeHTML(r.createdByName || r.createdBy || '—')}</div>
                        </div>
                        ${statusBadge}
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;font-size:0.82rem;color:#4b5563;background:#f9fafb;padding:10px;border-radius:8px;margin-bottom:10px;">
                        <div><strong>الموقع:</strong> ${Utils.escapeHTML(vd.violationLocation || '—')}</div>
                        <div><strong>الشدة:</strong> ${Utils.escapeHTML(vd.severity || '—')}</div>
                        <div><strong>التاريخ:</strong> ${vd.violationDate ? new Date(vd.violationDate).toLocaleDateString('ar-EG') : '—'}</div>
                        <div><strong>الغرامة:</strong> ${vd.fineAmount ? Number(vd.fineAmount).toLocaleString('ar-EG') + ' ج.م' : '—'}</div>
                    </div>
                    ${approvers.length > 0 ? `
                        <div style="font-size:0.78rem;color:#6b7280;margin-bottom:8px;">
                            <strong>المعتمدون:</strong>
                            ${approvers.map((a, i) => `
                                <span style="background:${a.approved ? '#dcfce7' : (i === currentIdx ? '#fef3c7' : '#f3f4f6')};color:${a.approved ? '#166534' : (i === currentIdx ? '#92400e' : '#6b7280')};padding:2px 8px;border-radius:10px;margin-right:4px;">
                                    ${a.approved ? '✓' : (i === currentIdx ? '⏳' : '○')} ${Utils.escapeHTML(a.userName || a.userEmail || '?')}
                                </span>
                            `).join('')}
                        </div>
                    ` : ''}
                    ${r.rejectionReason ? `<div style="background:#fef2f2;border-right:3px solid #dc2626;padding:8px 10px;border-radius:6px;font-size:0.82rem;color:#7f1d1d;margin-bottom:8px;"><strong>سبب الرفض:</strong> ${Utils.escapeHTML(r.rejectionReason)}</div>` : ''}
                    ${showActions ? `
                        <div style="display:flex;gap:8px;justify-content:flex-end;">
                            <button type="button" class="viol-req-reject-btn" data-id="${Utils.escapeHTML(String(r.id))}" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:0.85rem;font-weight:600;">
                                <i class="fas fa-times"></i> رفض
                            </button>
                            <button type="button" class="viol-req-approve-btn" data-id="${Utils.escapeHTML(String(r.id))}" style="background:#dcfce7;color:#166534;border:1px solid #86efac;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:0.85rem;font-weight:600;">
                                <i class="fas fa-check"></i> اعتماد
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    },

    _wireViolationApprovalActions(modal, isAdmin) {
        modal.querySelectorAll('.viol-req-approve-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if (!id) return;
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الاعتماد...';
                const res = await this.approveViolationRequest(id, { force: isAdmin });
                if (res && res.success) {
                    Notification.success(res.message || 'تم الاعتماد');
                    modal.remove();
                    this.showViolationApprovalsManager();
                    // تحديث قائمة المخالفات
                    try { if (this.load) this.load(); } catch (e) {}
                } else {
                    Notification.error((res && res.message) || 'فشل الاعتماد');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-check"></i> اعتماد';
                }
            });
        });
        modal.querySelectorAll('.viol-req-reject-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if (!id) return;
                const reason = (window.prompt('سبب الرفض:') || '').trim();
                if (!reason) { Notification.warning('سبب الرفض إلزامي'); return; }
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الرفض...';
                const res = await this.rejectViolationRequest(id, reason);
                if (res && res.success) {
                    Notification.success(res.message || 'تم الرفض');
                    modal.remove();
                    this.showViolationApprovalsManager();
                } else {
                    Notification.error((res && res.message) || 'فشل الرفض');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-times"></i> رفض';
                }
            });
        });
    },

    countPriorViolationsSamePersonMonth(draft, excludeId) {
        const ym = this.getViolationYearMonthKey(draft.violationDate);
        if (ym == null) return 0;
        const list = AppState.appData.violations || [];
        let n = 0;
        for (let i = 0; i < list.length; i++) {
            const v = list[i];
            if (!v || (excludeId && String(v.id) === String(excludeId))) continue;
            if (this.getViolationYearMonthKey(v.violationDate) !== ym) continue;
            if (this.sameViolationPersonForSequence(draft, v)) n++;
        }
        return n;
    },

    refreshViolationSequenceBadgeInModal(modal, excludeViolationId) {
        const info = modal && modal.querySelector ? modal.querySelector('#violation-sequence-info') : null;
        const textEl = modal && modal.querySelector ? modal.querySelector('#violation-sequence-text') : null;
        if (!info || !textEl) return;
        const personType = document.getElementById('violation-person-type')?.value;
        const violationDate = document.getElementById('violation-date')?.value;
        if (!personType || !violationDate) {
            info.classList.add('hidden');
            return;
        }
        const draft = { personType, violationDate: `${violationDate}T12:00:00` };
        if (personType === 'employee') {
            draft.employeeCode = document.getElementById('violation-employee-code')?.value.trim() || '';
            if (!draft.employeeCode) {
                info.classList.add('hidden');
                return;
            }
        } else {
            const sel = document.getElementById('violation-contractor-select');
            draft.contractorName = (sel?.value || '').trim();
            draft.contractorWorker = document.getElementById('violation-contractor-worker')?.value.trim() || '';
            if (!draft.contractorName) {
                info.classList.add('hidden');
                return;
            }
        }
        const prior = this.countPriorViolationsSamePersonMonth(draft, excludeViolationId);
        const seq = prior + 1;
        textEl.textContent = seq <= 1
            ? 'أول مخالفة في الشهر لهذا الشخص (يُحسب تلقائياً من سجل المخالفات لنفس الشخص ونفس الشهر).'
            : `المخالفة رقم ${seq} في الشهر لنفس الشخص.`;
        info.classList.remove('hidden');
    },

    _violationsImportNormalizeHeaderKey(h) {
        return String(h == null ? '' : h).trim().replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF]/g, '').toLowerCase();
    },

    _violationsImportPick(row, candidates) {
        const map = {};
        Object.keys(row || {}).forEach((k) => {
            map[this._violationsImportNormalizeHeaderKey(k)] = row[k];
        });
        for (let i = 0; i < candidates.length; i++) {
            const ck = this._violationsImportNormalizeHeaderKey(candidates[i]);
            if (map[ck] !== undefined && map[ck] !== null && String(map[ck]).trim() !== '') {
                return map[ck];
            }
        }
        return '';
    },

    downloadViolationsImportTemplate() {
        if (typeof XLSX === 'undefined') {
            Notification.error('مكتبة Excel غير محمّلة. حدّث الصفحة وحاول مرة أخرى.');
            return;
        }
        const headers = [
            'نوع_الشخص',
            'الكود_الوظيفي',
            'اسم_الموظف',
            'اسم_المقاول',
            'عامل_المقاول',
            'نوع_المخالفة',
            'تاريخ_المخالفة',
            'وقت_المخالفة',
            'الموقع',
            'مكان_المخالفة',
            'الشدة',
            'الحالة',
            'التفاصيل',
            'الاجراء_المتخذ',
            'الغرامة'
        ];
        const example = [
            'موظف',
            '12345',
            '',
            '',
            '',
            'تأخر عن العمل',
            '2026-05-01',
            '08:30',
            'المصنع الرئيسي',
            'خط الإنتاج 1',
            'متوسطة',
            'قيد المراجعة',
            'وصف مختصر',
            'إنذار شفهي',
            '100'
        ];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, example]);
        ws['!cols'] = headers.map(() => ({ wch: 18 }));
        XLSX.utils.book_append_sheet(wb, ws, 'المخالفات');
        const note = [
            ['تعليمات:'],
            ['• نوع_الشخص: اكتب "موظف" أو "مقاول".'],
            ['• للموظف: عبّئ الكود_الوظيفي ونوع_المخالفة والتاريخ والوقت والموقع ومكان_المخالفة.'],
            ['• للمقاول: عبّئ اسم_المقاول كما في القائمة ويمكن تعبئة عامل_المقاول.'],
            ['• التاريخ بصيغة YYYY-MM-DD أو تنسيق تاريخ إكسل.']
        ];
        const ws2 = XLSX.utils.aoa_to_sheet(note);
        XLSX.utils.book_append_sheet(wb, ws2, 'تعليمات');
        XLSX.writeFile(wb, `قالب_استيراد_المخالفات_${new Date().toISOString().slice(0, 10)}.xlsx`);
    },

    showViolationsImportModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 720px;">
                <div class="modal-header">
                    <h2 class="modal-title"><i class="fas fa-file-excel ml-2 text-green-600"></i>استيراد مخالفات من Excel</h2>
                    <button type="button" class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body space-y-4">
                    <div class="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-900">
                        <p class="m-0 mb-2"><i class="fas fa-download ml-2"></i>حمّل القالب الفارغ (صف عناوين + صف مثال)، عبّئ البيانات ثم ارفع الملف.</p>
                        <button type="button" id="violations-import-download-template" class="btn-secondary btn-sm">
                            <i class="fas fa-file-download ml-2"></i>تحميل قالب Excel
                        </button>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">ملف Excel (.xlsx)</label>
                        <input type="file" id="violations-import-file" accept=".xlsx,.xls" class="form-input">
                    </div>
                    <div id="violations-import-preview" class="hidden text-sm text-gray-600 max-h-48 overflow-auto border rounded p-2 bg-gray-50"></div>
                    <div class="flex justify-end gap-2 pt-2 border-t">
                        <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
                        <button type="button" id="violations-import-confirm" class="btn-primary" disabled>
                            <i class="fas fa-upload ml-2"></i>تأكيد الاستيراد
                        </button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        let parsedRows = [];
        const fileInput = modal.querySelector('#violations-import-file');
        const preview = modal.querySelector('#violations-import-preview');
        const confirmBtn = modal.querySelector('#violations-import-confirm');
        modal.querySelector('#violations-import-download-template')?.addEventListener('click', () => this.downloadViolationsImportTemplate());
        fileInput?.addEventListener('change', async (e) => {
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
                preview.innerHTML = `<p>تم قراءة <strong>${parsedRows.length}</strong> صفاً من الورقة الأولى «${Utils.escapeHTML(wb.SheetNames[0] || '')}».</p>`;
                preview.classList.remove('hidden');
                confirmBtn.disabled = parsedRows.length === 0;
            } catch (err) {
                Utils.safeError('استيراد مخالفات:', err);
                Notification.error('تعذّر قراءة الملف: ' + (err.message || ''));
            }
        });
        confirmBtn?.addEventListener('click', async () => {
            if (!parsedRows.length) return;
            confirmBtn.disabled = true;
            await this.processViolationsImportRows(parsedRows, modal);
        });
        modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.remove(); });
    },

    async processViolationsImportRows(rows, modal) {
        let ok = 0;
        let fail = 0;
        const errors = [];
        if (!Array.isArray(AppState.appData.violations)) AppState.appData.violations = [];
        let violationTypes = [];
        if (typeof ViolationTypesManager !== 'undefined' && ViolationTypesManager.ensureInitialized && ViolationTypesManager.getAll) {
            try {
                ViolationTypesManager.ensureInitialized();
                violationTypes = ViolationTypesManager.getAll();
            } catch (e) {
                violationTypes = AppState.appData.violationTypes || [];
            }
        } else {
            violationTypes = AppState.appData.violationTypes || [];
        }
        const typeByName = new Map((violationTypes || []).map(t => [String(t.name || '').trim().toLowerCase(), t]));
        const uniqueMissingTypeNames = new Set();
        for (let r = 0; r < rows.length; r++) {
            const row0 = rows[r] || {};
            const nm = String(this._violationsImportPick(row0, ['نوع_المخالفة', 'نوع المخالفة', 'violationType']) || '').trim();
            if (nm && !typeByName.has(nm.toLowerCase())) uniqueMissingTypeNames.add(nm);
        }
        if (typeof ViolationTypesManager !== 'undefined' && ViolationTypesManager.ensureInitialized && ViolationTypesManager.addType && ViolationTypesManager.getTypeByName) {
            try {
                ViolationTypesManager.ensureInitialized();
                uniqueMissingTypeNames.forEach((typeName) => {
                    const lk = typeName.toLowerCase();
                    try {
                        const nt = ViolationTypesManager.addType({ name: typeName, description: '', fineAmount: 0 });
                        typeByName.set(lk, nt);
                    } catch (addErr) {
                        const ex = ViolationTypesManager.getTypeByName(typeName);
                        if (ex) typeByName.set(lk, ex);
                    }
                });
            } catch (batchVtErr) {
                Utils.safeWarn('استيراد: تعذر إنشاء أنواع مخالفات جديدة من الملف:', batchVtErr);
            }
        }
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i] || {};
            try {
                const ptRaw = String(this._violationsImportPick(row, ['نوع_الشخص', 'نوع الشخص', 'personType', 'persontype']) || '').trim();
                const ptLower = ptRaw.toLowerCase();
                const personType = (ptLower.includes('مقاول') || ptLower === 'contractor') ? 'contractor' : 'employee';
                const empCode = String(this._violationsImportPick(row, ['الكود_الوظيفي', 'الكود الوظيفي', 'employeeCode', 'employeenumber', 'employeeNumber']) || '').trim();
                const empName = String(this._violationsImportPick(row, ['اسم_الموظف', 'اسم الموظف', 'employeeName']) || '').trim();
                const cName = String(this._violationsImportPick(row, ['اسم_المقاول', 'اسم المقاول', 'contractorName']) || '').trim();
                const cWorker = String(this._violationsImportPick(row, ['عامل_المقاول', 'عامل المقاول', 'contractorWorker']) || '').trim();
                const vTypeName = String(this._violationsImportPick(row, ['نوع_المخالفة', 'نوع المخالفة', 'violationType']) || '').trim();
                const vDateRaw = this._violationsImportPick(row, ['تاريخ_المخالفة', 'تاريخ المخالفة', 'violationDate', 'date']);
                const vTimeRaw = String(this._violationsImportPick(row, ['وقت_المخالفة', 'وقت المخالفة', 'violationTime', 'time']) || '08:00');
                const loc = String(this._violationsImportPick(row, ['الموقع', 'violationLocation', 'location']) || '').trim();
                const place = String(this._violationsImportPick(row, ['مكان_المخالفة', 'مكان المخالفة', 'violationPlace', 'place']) || '').trim();
                const sev = String(this._violationsImportPick(row, ['الشدة', 'severity']) || 'متوسطة').trim();
                const st = String(this._violationsImportPick(row, ['الحالة', 'status']) || 'قيد المراجعة').trim();
                const details = String(this._violationsImportPick(row, ['التفاصيل', 'violationDetails', 'details']) || '').trim();
                const action = String(this._violationsImportPick(row, ['الاجراء_المتخذ', 'الإجراء المتخذ', 'actionTaken', 'action']) || '').trim();
                const fineRaw = this._violationsImportPick(row, ['الغرامة', 'fineAmount', 'fine']);
                if (!vTypeName || !vDateRaw) {
                    fail++;
                    errors.push(`صف ${i + 2}: نوع المخالفة أو التاريخ ناقص`);
                    continue;
                }
                if (personType === 'employee' && !empCode) {
                    fail++;
                    errors.push(`صف ${i + 2}: الكود الوظيفي مطلوب للموظف`);
                    continue;
                }
                if (personType === 'contractor' && !cName) {
                    fail++;
                    errors.push(`صف ${i + 2}: اسم المقاول مطلوب`);
                    continue;
                }
                let violationDate = vDateRaw;
                if (typeof violationDate === 'number' && typeof XLSX !== 'undefined' && XLSX.SSF) {
                    try {
                        const d = XLSX.SSF.parse_date_code(violationDate);
                        if (d) violationDate = new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString();
                    } catch (e1) { /* keep */ }
                } else if (typeof violationDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(violationDate.trim())) {
                    violationDate = new Date(violationDate.trim().slice(0, 10) + 'T12:00:00').toISOString();
                } else {
                    const dTry = new Date(violationDate);
                    violationDate = isNaN(dTry.getTime()) ? new Date().toISOString() : dTry.toISOString();
                }
                const typeObj = typeByName.get(vTypeName.toLowerCase());
                const violationTypeId = typeObj ? String(typeObj.id || '') : '';
                const fineAmount = this.parseFineAmount(fineRaw !== '' && fineRaw !== undefined ? fineRaw : (typeObj ? typeObj.fineAmount : 0));
                const draft = {
                    personType,
                    violationDate,
                    employeeCode: empCode,
                    employeeNumber: empCode,
                    employeeName: empName,
                    contractorName: cName,
                    contractorWorker: cWorker
                };
                const seq = this.countPriorViolationsSamePersonMonth(draft, null) + 1;
                const rec = {
                    id: Utils.generateId('VIOLATION'),
                    isoCode: typeof generateISOCode === 'function' ? generateISOCode('VIOL', AppState.appData.violations) : ('VIOL-' + Date.now() + '-' + i),
                    personType,
                    employeeId: personType === 'employee' ? Utils.generateId('EMP') : '',
                    employeeName: personType === 'employee' ? empName : '',
                    employeeCode: personType === 'employee' ? empCode : '',
                    employeeNumber: personType === 'employee' ? empCode : '',
                    employeePosition: '',
                    employeeDepartment: '',
                    contractorId: '',
                    contractorName: personType === 'contractor' ? cName : '',
                    contractorWorker: personType === 'contractor' ? cWorker : '',
                    contractorPosition: '',
                    contractorDepartment: '',
                    violationTypeId,
                    violationType: vTypeName,
                    fineAmount,
                    violationDate,
                    violationTime: vTimeRaw.length >= 5 ? vTimeRaw.slice(0, 5) : '08:00',
                    violationLocation: loc,
                    violationLocationId: loc,
                    violationPlace: place,
                    violationPlaceId: place,
                    violationDetails: details,
                    severity: sev || 'متوسطة',
                    actionTaken: action,
                    status: st || 'قيد المراجعة',
                    photo: '',
                    violationSequenceInMonth: seq,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                AppState.appData.violations.push(this.normalizeViolationRecord(rec));
                ok++;
            } catch (rowErr) {
                fail++;
                errors.push(`صف ${i + 2}: ${rowErr.message || rowErr}`);
            }
        }
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            try { window.DataManager.save(); } catch (e) { /* ignore */ }
        }
        Backend.autoSave('Violations', AppState.appData.violations).catch(() => {
            Notification.warning('تم الاستيراد محلياً. راجع المزامنة مع الشيت لاحقاً.');
        });
        if (typeof ViolationTypesManager !== 'undefined' && ViolationTypesManager.ensureViolationsTypeIds) {
            try {
                ViolationTypesManager.ensureViolationsTypeIds();
            } catch (eId) { /* ignore */ }
        }
        if (modal && modal.parentNode) modal.remove();
        Notification.success(`تم استيراد ${ok} مخالفة${fail ? ` (تخطي ${fail})` : ''}.`);
        if (errors.length && errors.length <= 5) {
            errors.forEach((m) => Utils.safeWarn(m));
        } else if (errors.length) {
            Utils.safeWarn('استيراد مخالفات: ' + errors.slice(0, 5).join(' | ') + ' ...');
        }
        this.load();
    },

    async load() {
        // Add language change listener
        if (!this._languageChangeListenerAdded) {
            document.addEventListener('language-changed', () => {
                this.load();
            });
            this._languageChangeListenerAdded = true;
        }

        // التحقق من المتطلبات الأساسية
        if (typeof Utils === 'undefined') {
            console.error('❌ Utils غير متوفر - يرجى تحديث الصفحة');
            const section = document.getElementById('violations-section');
            if (section) {
                section.innerHTML = `
                    <div class="content-card">
                        <div class="card-body">
                            <div class="empty-state">
                                <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-3"></i>
                                <h3 class="text-lg font-semibold text-gray-800 mb-2">فشل تحميل الموديول</h3>
                                <p class="text-gray-500 mb-4">يرجى تحديث الصفحة</p>
                                <button onclick="location.reload()" class="btn-primary">
                                    <i class="fas fa-redo ml-2"></i>تحديث الصفحة
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }
            return;
        }

        const section = document.getElementById('violations-section');
        if (!section) {
            if (typeof Utils !== 'undefined' && Utils.safeWarn) {
                Utils.safeWarn('⚠️ قسم violations-section غير موجود');
            }
            return;
        }
        try {
            // التأكد من وجود AppState
            if (typeof AppState === 'undefined') {
                const errorMsg = '❌ AppState غير متوفر. يرجى تحديث الصفحة.';
                Utils.safeError(errorMsg);
                section.innerHTML = `
                    <div class="content-card">
                        <div class="card-body">
                            <div class="empty-state">
                                <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-3"></i>
                                <h3 class="text-lg font-semibold text-gray-800 mb-2">فشل تحميل الموديول</h3>
                                <p class="text-gray-500 mb-4">يرجى تحديث الصفحة</p>
                                <button onclick="location.reload()" class="btn-primary">
                                    <i class="fas fa-redo ml-2"></i>تحديث الصفحة
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

            // التأكد من وجود البيانات
            if (!AppState.appData) {
                AppState.appData = {};
            }
            if (!AppState.appData.violations) {
                AppState.appData.violations = [];
            }
            if (!AppState.appData.blacklistRegister) {
                AppState.appData.blacklistRegister = [];
            }

            // التحقق من وجود ViolationTypesManager قبل الاستدعاء
            if (typeof ViolationTypesManager !== 'undefined' && ViolationTypesManager.ensureInitialized) {
                try {
                    ViolationTypesManager.ensureInitialized();
                } catch (vtError) {
                    if (typeof Utils !== 'undefined' && Utils.safeWarn) {
                        Utils.safeWarn('⚠️ خطأ في تهيئة ViolationTypesManager:', vtError);
                    }
                }
            } else {
                // استخدام القيم الافتراضية إذا لم يكن ViolationTypesManager متوفراً
                if (!AppState.appData.violationTypes || !Array.isArray(AppState.appData.violationTypes)) {
                    AppState.appData.violationTypes = [];
                }
            }

            // ✅ تحميل مباشر من قاعدة البيانات/Sheets عند أول فتح (بدون تكرار طلبات متوازية)
            const hasViolationsData = Array.isArray(AppState.appData.violations) && AppState.appData.violations.length > 0;
            const lastSync = (() => {
                try { return localStorage.getItem('violations_last_sync'); } catch (e) { return null; }
            })();
            const cacheAge = lastSync ? (Date.now() - parseInt(lastSync, 10)) : Infinity;
            const CACHE_DURATION = 10 * 60 * 1000; // 10 دقائق
            const isStale = cacheAge >= CACHE_DURATION;
            const canFetch = typeof Backend !== 'undefined' && Backend.readFromSheets;
            const isEnabled = Utils.hasCloudBackendSync();
            if (!hasViolationsData && canFetch && isEnabled) {
                try {
                    await this.ensureViolationsCoreDataLoaded({ force: true });
                } catch (e) {
                    // عرض محلي ثم يكمّل التحديث في الخلفية
                }
            } else if (isStale && hasViolationsData && canFetch && isEnabled) {
                void this.ensureViolationsCoreDataLoaded({ force: true }).then(() => {
                    try {
                        const stats = document.getElementById('violations-stats-cards');
                        if (stats) stats.outerHTML = this.renderAllViolationsStats();
                        const list = document.getElementById('violations-list');
                        if (list) list.innerHTML = this.renderViolationsList();
                        const filters = document.getElementById('violations-filters-container');
                        if (filters) filters.innerHTML = this.renderFilters();
                        this.bindFilters();
                    } catch (e2) { /* ignore */ }
                });
            }

            section.innerHTML = `
            <div class="section-header" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); border-radius: 16px; padding: 24px 32px; margin-bottom: 24px; box-shadow: 0 8px 32px rgba(220, 38, 38, 0.25);">
                <div class="flex items-center justify-between flex-wrap gap-3">
                    <div class="text-center w-full" style="flex-grow: 1; min-width: 200px;">
                        <h1 class="section-title" style="color: white; font-size: 2rem; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-bottom: 8px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-exclamation-triangle ml-3" style="font-size: 1.8rem;"></i>
                            سجل المخالفات
                        </h1>
                        <p class="section-subtitle" style="color: rgba(255,255,255,0.9); font-size: 1rem; margin: 0;">تسجيل ومتابعة مخالفات الموظفين والمقاولين</p>
                    </div>
                    <div class="flex flex-shrink-0 flex-wrap gap-2 justify-center">
                        <button type="button" id="add-violation-btn" class="btn-primary" style="background: white; color: #dc2626; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: all 0.3s ease;">
                            <i class="fas fa-plus ml-2"></i>
                            تسجيل مخالفة جديدة
                        </button>
                        <button type="button" id="viol-approvals-btn" onclick="Violations.showViolationApprovalsManager()" style="background: rgba(255,255,255,0.18); color: #fff; border: 2px solid rgba(255,255,255,0.4); padding: 12px 18px; border-radius: 12px; font-weight: 600; cursor: pointer; transition: all 0.3s ease;" title="دائرة اعتماد المخالفات">
                            <i class="fas fa-clipboard-check ml-2"></i>
                            دائرة الاعتماد
                        </button>
                    </div>
                </div>
            </div>
            <div class="mt-6">
                <!-- Tabs Navigation -->
                <div class="tabs-container mb-4">
                    <div class="tabs-nav" style="flex-wrap: nowrap; overflow-x: auto; overflow-y: visible; min-width: 0; width: 100%; max-width: 100%; box-sizing: border-box;">
                        <button class="tab-btn active" data-tab="all" onclick="Violations.switchTab('all')" style="flex-shrink: 0; min-width: fit-content; white-space: nowrap; width: auto; max-width: none;">
                            <i class="fas fa-list ml-2"></i>جميع المخالفات
                        </button>
                        <button class="tab-btn" data-tab="employees" onclick="Violations.switchTab('employees')" style="flex-shrink: 0; min-width: fit-content; white-space: nowrap; width: auto; max-width: none;">
                            <i class="fas fa-user-tie ml-2"></i>مخالفات الموظفين
                        </button>
                        <button class="tab-btn" data-tab="contractors" onclick="Violations.switchTab('contractors')" style="flex-shrink: 0; min-width: fit-content; white-space: nowrap; width: auto; max-width: none;">
                            <i class="fas fa-users-cog ml-2"></i>مخالفات المقاولين
                        </button>
                        <button class="tab-btn" data-tab="analytics" onclick="Violations.switchTab('analytics')" style="flex-shrink: 0; min-width: fit-content; white-space: nowrap; width: auto; max-width: none;">
                            <i class="fas fa-chart-bar ml-2"></i>تحليل البيانات
                        </button>
                        <button class="tab-btn" data-tab="blacklist" onclick="Violations.switchTabAsync('blacklist')" style="flex-shrink: 0; min-width: fit-content; white-space: nowrap; width: auto; max-width: none;">
                            <i class="fas fa-user-slash ml-2"></i>سجل الممنوعين من الدخول – Blacklist
                        </button>
                        <button id="violations-btn-refresh" type="button" class="tab-btn" onclick="Violations.refreshModule()" title="تحديث البيانات" style="flex-shrink: 0; min-width: fit-content; white-space: nowrap; width: auto; max-width: none;">
                            <i class="fas fa-sync-alt ml-2"></i>تحديث
                        </button>
                    </div>
                </div>
                
                <!-- Tab Content -->
                <div id="violations-tab-content">
                    <div class="content-card" id="violations-list-tab">
                    <div class="card-header">
                        <h2 class="card-title"><i class="fas fa-list ml-2"></i>قائمة المخالفات</h2>
                    </div>
                    <div class="card-body">
                        ${this.renderAllViolationsStats()}
                        <div id="violations-filters-container" class="mb-4">
                            ${this.renderFilters()}
                        </div>
                        <div id="violations-list" class="violations-list-scroll">
                            ${this.renderViolationsList()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
            this.setupEventListeners();

            // ✅ تحديث خلفي بعد العرض (بدون إعادة بناء كامل إذا كانت البيانات محدثة)
            Promise.resolve(this.ensureViolationsCoreDataLoaded({ force: false }))
                .then(() => {
                    try {
                        const stats = document.getElementById('violations-stats-cards');
                        if (stats) stats.outerHTML = this.renderAllViolationsStats();
                        const list = document.getElementById('violations-list');
                        if (list) list.innerHTML = this.renderViolationsList();
                        const filters = document.getElementById('violations-filters-container');
                        if (filters) filters.innerHTML = this.renderFilters();
                    } catch (e) {}
                })
                .catch(() => {});
        } catch (error) {
            Utils.safeError('❌ خطأ في تحميل مديول المخالفات:', error);
            section.innerHTML = `
                <div class="section-header">
                    <div>
                        <h1 class="section-title">
                            <i class="fas fa-exclamation-circle ml-3"></i>
                            سجل المخالفات
                        </h1>
                    </div>
                </div>
                <div class="mt-6">
                    <div class="content-card">
                        <div class="card-body">
                            <div class="empty-state">
                                <i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>
                                <p class="text-gray-500 mb-4">حدث خطأ أثناء تحميل البيانات</p>
                                <button onclick="Violations.load()" class="btn-primary">
                                    <i class="fas fa-redo ml-2"></i>
                                    إعادة المحاولة
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    /**
     * تحميل بيانات المخالفات الأساسية من Google Sheets مرة واحدة (مع منع التكرار)
     */
    async ensureViolationsCoreDataLoaded({ force = false } = {}) {
        if (this._violationsCoreLoadPromise && !force) {
            return this._violationsCoreLoadPromise;
        }
        this._violationsCoreLoadPromise = (async () => {
            if (typeof Backend === 'undefined' || !Backend.readFromSheets) return;

            const isEnabled = Utils.hasCloudBackendSync();
            if (!isEnabled) return;

            const [violationsData, typesData] = await Promise.all([
                Backend.readFromSheets('Violations').catch(() => null),
                Backend.readFromSheets('ViolationTypes').catch(() => null),
            ]);

            if (Array.isArray(violationsData)) {
                const serverNormalized = violationsData
                    .map((item) => this.normalizeViolationRecord(item))
                    .filter(Boolean);
                // ✅ حماية من race condition: لا تستبدل مخالفات محلية حديثة لم تصلها الخادم بعد
                const localViolations = Array.isArray(AppState.appData.violations) ? AppState.appData.violations : [];
                const serverIds = new Set(serverNormalized.map(v => v && v.id).filter(Boolean));
                const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
                const localOnlyRecent = localViolations.filter(v => {
                    if (!v || !v.id || serverIds.has(v.id)) return false;
                    const created = new Date(v.createdAt || v.timestamp || 0).getTime();
                    return created >= fiveMinutesAgo;
                });
                AppState.appData.violations = localOnlyRecent.length > 0
                    ? [...localOnlyRecent, ...serverNormalized]
                    : serverNormalized;
            }
            // لا تستبدل أنواعاً محلية/مستوردة بمصفوفة فارغة من الشيت (استجابة خاطئة أو تأخر) — يمنع الرجوع للافتراضي بعد التحديث
            if (Array.isArray(typesData)) {
                const localTypes = Array.isArray(AppState.appData.violationTypes) ? AppState.appData.violationTypes : [];
                if (typesData.length > 0) {
                    AppState.appData.violationTypes = typesData;
                } else if (localTypes.length === 0) {
                    AppState.appData.violationTypes = [];
                }
                if (typesData.length > 0 || (typesData.length === 0 && localTypes.length === 0)) {
                    try {
                        if (!AppState.syncMeta) AppState.syncMeta = { sheets: {}, users: 0, lastSyncTime: 0, userEmail: null };
                        if (!AppState.syncMeta.sheets) AppState.syncMeta.sheets = {};
                        AppState.syncMeta.sheets.ViolationTypes = Date.now();
                    } catch (eMeta) { /* ignore */ }
                }
            }

            try {
                if (typeof ViolationTypesManager !== 'undefined' && ViolationTypesManager.ensureInitialized) {
                    ViolationTypesManager.ensureInitialized();
                }
            } catch (e) {}

            try { localStorage.setItem('violations_last_sync', String(Date.now())); } catch (e) {}

            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                try { window.DataManager.save(); } catch (e) {}
            }
        })().finally(() => {
            this._violationsCoreLoadPromise = null;
        });
        return this._violationsCoreLoadPromise;
    },

    renderViolationsList() {
        try {
            const violations = this.getFilteredViolations();
            if (!violations || violations.length === 0) {
                const message = this.hasActiveFilters()
                    ? 'لا توجد مخالفات مطابقة لعوامل التصفية الحالية'
                    : 'لا توجد مخالفات مسجلة';
                return `<div class="empty-state"><p class="text-gray-500">${message}</p></div>`;
            }
            return `
                <div class="table-responsive" style="border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08);">
                    <table class="data-table" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);">
                                <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">اسم الموظف/المقاول</th>
                                <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">نوع المخالفة</th>
                                <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">القيمة المالية</th>
                                <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">الموقع</th>
                                <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">التاريخ</th>
                                <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.85rem;">تسلسل الشهر</th>
                                <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">الشدة</th>
                                <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">الحالة</th>
                                <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${violations.map((violation, index) => `
                                <tr style="background: ${index % 2 === 0 ? '#ffffff' : '#fef2f2'}; transition: all 0.2s ease;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='${index % 2 === 0 ? '#ffffff' : '#fef2f2'}'">
                                    <td style="padding: 14px 12px; text-align: center; border-bottom: 1px solid #fecaca; font-weight: 500;">
                                        <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                                            <i class="fas ${violation.employeeName ? 'fa-user-tie' : 'fa-hard-hat'}" style="color: ${violation.employeeName ? '#3b82f6' : '#f59e0b'};"></i>
                                            ${Utils.escapeHTML(violation.employeeName || violation.contractorName || '-')}
                                        </div>
                                    </td>
                                    <td style="padding: 14px 12px; text-align: center; border-bottom: 1px solid #fecaca;">
                                        ${Utils.escapeHTML(violation.violationType || '-')}
                                    </td>
                                    <td style="padding: 14px 12px; text-align: center; border-bottom: 1px solid #fecaca; font-weight: 600; color: #166534;">
                                        ${this.formatFineAmount(Number(violation.fineAmount || 0))}
                                    </td>
                                    <td style="padding: 14px 12px; text-align: center; border-bottom: 1px solid #fecaca; font-size: 0.85rem; color: #6b7280;">
                                        ${Utils.escapeHTML(violation.violationLocation || '-')}
                                    </td>
                                    <td style="padding: 14px 12px; text-align: center; border-bottom: 1px solid #fecaca;">
                                        ${violation.violationDate ? Utils.formatDate(violation.violationDate) : '-'}
                                    </td>
                                    <td style="padding: 14px 12px; text-align: center; border-bottom: 1px solid #fecaca; font-size: 0.85rem; color: #92400e;">
                                        ${violation.violationSequenceInMonth != null && violation.violationSequenceInMonth !== '' ? Utils.escapeHTML(String(violation.violationSequenceInMonth)) : '—'}
                                    </td>
                                    <td style="padding: 14px 12px; text-align: center; border-bottom: 1px solid #fecaca;">
                                        <span style="display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; background: ${violation.severity === 'عالية' ? 'linear-gradient(135deg, #ef4444, #dc2626)' : violation.severity === 'متوسطة' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #3b82f6, #2563eb)'}; color: white; box-shadow: 0 2px 6px ${violation.severity === 'عالية' ? 'rgba(239,68,68,0.3)' : violation.severity === 'متوسطة' ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.3)'};">
                                            ${violation.severity || '-'}
                                        </span>
                                    </td>
                                    <td style="padding: 14px 12px; text-align: center; border-bottom: 1px solid #fecaca;">
                                        <span style="display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; background: ${violation.status === 'محلول' ? 'linear-gradient(135deg, #10b981, #059669)' : violation.status === 'قيد المراجعة' ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'linear-gradient(135deg, #f59e0b, #d97706)'}; color: white;">
                                            ${violation.status || '-'}
                                        </span>
                                    </td>
                                    <td style="padding: 14px 12px; text-align: center; border-bottom: 1px solid #fecaca;">
                                        <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                                            <button type="button" onclick='Violations.viewViolation(${this._escapeIdForHandler(violation.id)})' style="width: 36px; height: 36px; border-radius: 8px; border: none; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; box-shadow: 0 2px 6px rgba(59,130,246,0.3);" title="عرض التفاصيل">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            <button type="button" onclick='Violations.showViolationForm(${this._escapeIdForHandler(violation.id)})' style="width: 36px; height: 36px; border-radius: 8px; border: none; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; box-shadow: 0 2px 6px rgba(139,92,246,0.3);" title="تعديل">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button type="button" onclick='Violations.exportPDF(${this._escapeIdForHandler(violation.id)})' style="width: 36px; height: 36px; border-radius: 8px; border: none; background: linear-gradient(135deg, #10b981, #059669); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; box-shadow: 0 2px 6px rgba(16,185,129,0.3);" title="تصدير PDF">
                                                <i class="fas fa-file-pdf"></i>
                                            </button>
                                            <button type="button" onclick='Violations.deleteViolation(${this._escapeIdForHandler(violation.id)})' style="width: 36px; height: 36px; border-radius: 8px; border: none; background: linear-gradient(135deg, #ef4444, #dc2626); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; box-shadow: 0 2px 6px rgba(239,68,68,0.3);" title="حذف">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (error) {
            if (typeof Utils !== 'undefined' && Utils.safeError) {
                Utils.safeError('خطأ في renderViolationsList:', error);
            }
            return `<div class="empty-state"><p class="text-gray-500">حدث خطأ في عرض البيانات</p></div>`;
        }
    },

    /**
     * تحديث كروت إحصائيات "جميع المخالفات" بشكل فوري بدون إعادة تحميل
     * يستبدل DOM الكروت فقط، فيظهر التحديث مباشرة بعد أي إضافة/تعديل/حذف
     */
    updateAllViolationsStats() {
        try {
            const container = document.getElementById('violations-stats-cards');
            if (!container) return;
            // إنشاء عنصر مؤقت لاستخراج HTML الكروت الجديدة
            const wrapper = document.createElement('div');
            wrapper.innerHTML = this.renderAllViolationsStats();
            const newCards = wrapper.querySelector('#violations-stats-cards');
            if (newCards) {
                container.replaceWith(newCards);
            }
        } catch (e) {
            if (typeof Utils !== 'undefined' && Utils.safeWarn) {
                Utils.safeWarn('⚠️ فشل تحديث كروت المخالفات الفوري:', e);
            }
        }
    },

    renderAllViolationsStats() {
        const violations = this.getFilteredViolations();
        const total = violations.length;
        const employeeCount = violations.filter(v => v && (v.personType === 'employee' || (!!v.employeeName && !v.contractorName))).length;
        const contractorCount = violations.filter(v => v && (v.personType === 'contractor' || !!v.contractorName)).length;
        const totalFineAmount = violations.reduce((sum, violation) => {
            const amount = Number(violation?.fineAmount || 0);
            return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
        }, 0);

        return `
            <div id="violations-stats-cards" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
                <div class="stat-card" style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border: 1px solid #fca5a5;">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="stat-label">إجمالي المخالفات</p>
                            <p class="text-2xl font-bold text-red-700">${total}</p>
                        </div>
                        <i class="fas fa-list text-red-600 text-xl"></i>
                    </div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border: 1px solid #86efac;">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="stat-label">إجمالي القيمة المالية</p>
                            <p class="text-2xl font-bold text-green-700">${this.formatFineAmount(totalFineAmount)}</p>
                        </div>
                        <i class="fas fa-money-bill-wave text-green-600 text-xl"></i>
                    </div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); border: 1px solid #93c5fd;">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="stat-label">مخالفات الموظفين</p>
                            <p class="text-2xl font-bold text-blue-700">${employeeCount}</p>
                        </div>
                        <i class="fas fa-user-tie text-blue-600 text-xl"></i>
                    </div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%); border: 1px solid #fdba74;">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="stat-label">مخالفات المقاولين</p>
                            <p class="text-2xl font-bold text-orange-700">${contractorCount}</p>
                        </div>
                        <i class="fas fa-users-cog text-orange-600 text-xl"></i>
                    </div>
                </div>
            </div>
        `;
    },

    hasActiveFilters() {
        const filters = this.currentFilters || {};
        return !!(filters.search || filters.personType || filters.violationType || filters.severity || filters.status);
    },

    getFilteredViolations() {
        try {
            if (typeof AppState === 'undefined' || !AppState.appData) {
                return [];
            }
            const violations = (AppState.appData.violations || [])
                .map((item) => {
                    const n = this.normalizeViolationRecord(item);
                    if (!n) return null;
                    const eff = this.getEffectiveFineAmount(n);
                    return eff === n.fineAmount ? n : { ...n, fineAmount: eff };
                })
                .filter(Boolean);
            const filters = this.currentFilters || {};
            const searchFilter = String(filters.search || '').trim().toLowerCase();
            const personFilter = filters.personType || '';
            const typeFilter = (filters.violationType || '').toLowerCase();
            const severityFilter = filters.severity || '';
            const statusFilter = filters.status || '';

            return violations.filter(violation => {
                if (!violation) return false;

                if (personFilter === 'employee' && !violation.employeeName) return false;
                if (personFilter === 'contractor' && !violation.contractorName) return false;

                if (typeFilter) {
                    const violationType = (violation.violationType || '').trim().toLowerCase();
                    if (violationType !== typeFilter) return false;
                }

                if (severityFilter && (violation.severity || '') !== severityFilter) return false;
                if (statusFilter && (violation.status || '') !== statusFilter) return false;
                if (searchFilter) {
                    const searchableText = Object.values(violation || {})
                        .map((value) => String(value == null ? '' : value).toLowerCase())
                        .join(' ');
                    if (!searchableText.includes(searchFilter)) return false;
                }

                return true;
            });
        } catch (error) {
            if (typeof Utils !== 'undefined' && Utils.safeError) {
                Utils.safeError('خطأ في getFilteredViolations:', error);
            }
            return [];
        }
    },

    renderFilters(defaultPersonType = '') {
        const filters = this.currentFilters || {};
        if (defaultPersonType) {
            filters.personType = defaultPersonType;
        }

        // التحقق من وجود ViolationTypesManager
        let types = [];
        if (typeof ViolationTypesManager !== 'undefined' && ViolationTypesManager.ensureInitialized && ViolationTypesManager.getAll) {
            try {
                ViolationTypesManager.ensureInitialized();
                types = ViolationTypesManager.getAll();
            } catch (vtError) {
                if (typeof Utils !== 'undefined' && Utils.safeWarn) {
                    Utils.safeWarn('⚠️ خطأ في الحصول على أنواع المخالفات:', vtError);
                }
                types = [];
            }
        } else {
            // استخدام القيم الافتراضية
            types = (typeof AppState !== 'undefined' && AppState?.appData?.violationTypes) ? AppState.appData.violationTypes : [];
        }

        const typeOptions = types.map(type => `
            <option value="${Utils.escapeHTML(type.name)}" ${filters.violationType === type.name ? 'selected' : ''}>
                ${Utils.escapeHTML(type.name)}
            </option>
        `).join('');

        return `
            <div style="background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%); padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 12px;">
                <div style="display:grid; grid-template-columns: minmax(170px, 0.9fr) repeat(4, minmax(140px, 1fr)) minmax(150px, 0.9fr); gap: 10px; align-items:end;">
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <label for="violations-filter-search" style="font-size:12px; font-weight:700; color:#4a5568;">بحث</label>
                        <div class="relative">
                            <input type="text" id="violations-filter-search" class="form-input pr-10" style="width:100%; font-size:13px; border:1px solid #d1d5db; border-radius:8px;" placeholder="بحث..." value="${Utils.escapeHTML(filters.search || '')}">
                            <i class="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none"></i>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <label for="violations-filter-person" style="font-size:12px; font-weight:700; color:#4a5568;">نوع الشخص</label>
                        <select id="violations-filter-person" class="form-input" style="width:100%; font-size:13px; border:1px solid #d1d5db; border-radius:8px;">
                            <option value="" ${filters.personType === '' ? 'selected' : ''}>جميع الأشخاص</option>
                            <option value="employee" ${filters.personType === 'employee' ? 'selected' : ''}>الموظفون</option>
                            <option value="contractor" ${filters.personType === 'contractor' ? 'selected' : ''}>المقاولون</option>
                        </select>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <label for="violations-filter-type" style="font-size:12px; font-weight:700; color:#4a5568;">نوع المخالفة</label>
                        <select id="violations-filter-type" class="form-input" style="width:100%; font-size:13px; border:1px solid #d1d5db; border-radius:8px;">
                            <option value="" ${filters.violationType === '' ? 'selected' : ''}>جميع الأنواع</option>
                            ${typeOptions}
                        </select>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <label for="violations-filter-severity" style="font-size:12px; font-weight:700; color:#4a5568;">الشدة</label>
                        <select id="violations-filter-severity" class="form-input" style="width:100%; font-size:13px; border:1px solid #d1d5db; border-radius:8px;">
                            <option value="" ${filters.severity === '' ? 'selected' : ''}>جميع الدرجات</option>
                            <option value="عالية" ${filters.severity === 'عالية' ? 'selected' : ''}>عالية</option>
                            <option value="متوسطة" ${filters.severity === 'متوسطة' ? 'selected' : ''}>متوسطة</option>
                            <option value="منخضة" ${filters.severity === 'منخضة' ? 'selected' : ''}>منخضة</option>
                        </select>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <label for="violations-filter-status" style="font-size:12px; font-weight:700; color:#4a5568;">الحالة</label>
                        <select id="violations-filter-status" class="form-input" style="width:100%; font-size:13px; border:1px solid #d1d5db; border-radius:8px;">
                            <option value="" ${filters.status === '' ? 'selected' : ''}>جميع الحالات</option>
                            <option value="قيد المراجعة" ${filters.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
                            <option value="محلول" ${filters.status === 'محلول' ? 'selected' : ''}>محلول</option>
                            <option value="غير محلول" ${filters.status === 'غير محلول' ? 'selected' : ''}>غير محلول</option>
                        </select>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <label style="font-size:12px; font-weight:700; color:#4a5568;">&nbsp;</label>
                        <button type="button" id="violations-filter-reset" style="width:100%; height:42px; border:none; border-radius:8px; background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); color:#fff; font-size:13px; font-weight:700; cursor:pointer;">
                            <i class="fas fa-undo ml-2"></i>إعادة التعيين
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    bindFilters() {
        const searchInput = document.getElementById('violations-filter-search');
        const personSelect = document.getElementById('violations-filter-person');
        const typeSelect = document.getElementById('violations-filter-type');
        const severitySelect = document.getElementById('violations-filter-severity');
        const statusSelect = document.getElementById('violations-filter-status');
        const resetBtn = document.getElementById('violations-filter-reset');

        if (searchInput) {
            searchInput.value = this.currentFilters.search || '';
            searchInput.oninput = () => {
                this.currentFilters.search = searchInput.value || '';
                // لا نعيد رسم الفلاتر أثناء الكتابة حتى لا يفقد الحقل التركيز.
                this.refreshViolationsView({ skipFilterRerender: true });
            };
        }

        if (personSelect) {
            personSelect.value = this.currentFilters.personType || '';
            personSelect.onchange = () => {
                this.currentFilters.personType = personSelect.value;
                this.refreshViolationsView();
            };
        }

        if (typeSelect) {
            typeSelect.value = this.currentFilters.violationType || '';
            typeSelect.onchange = () => {
                this.currentFilters.violationType = typeSelect.value;
                this.refreshViolationsView();
            };
        }

        if (severitySelect) {
            severitySelect.value = this.currentFilters.severity || '';
            severitySelect.onchange = () => {
                this.currentFilters.severity = severitySelect.value;
                this.refreshViolationsView();
            };
        }

        if (statusSelect) {
            statusSelect.value = this.currentFilters.status || '';
            statusSelect.onchange = () => {
                this.currentFilters.status = statusSelect.value;
                this.refreshViolationsView();
            };
        }

        if (resetBtn) {
            resetBtn.onclick = () => {
                this.currentFilters = {
                    search: '',
                    personType: '',
                    violationType: '',
                    severity: '',
                    status: ''
                };
                this.refreshViolationsView();
            };
        }
    },

    refreshViolationsView(options = {}) {
        const skipFilterRerender = !!options.skipFilterRerender;
        const listContainer = document.getElementById('violations-list');
        if (listContainer) {
            // Check which tab is active
            const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'all';
            switch (activeTab) {
                case 'employees':
                    listContainer.innerHTML = this.renderEmployeeViolationsList();
                    break;
                case 'contractors':
                    listContainer.innerHTML = this.renderContractorViolationsList();
                    break;
                case 'analytics':
                    // Analytics tab doesn't need refresh
                    return;
                default:
                    listContainer.innerHTML = this.renderViolationsList();
            }
        }
        const statsContainer = document.getElementById('violations-stats-cards');
        if (statsContainer) {
            statsContainer.outerHTML = this.renderAllViolationsStats();
        }
        const filtersContainer = document.getElementById('violations-filters-container');
        if (filtersContainer && !skipFilterRerender) {
            const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'all';
            const defaultPersonType = activeTab === 'employees' ? 'employee' : activeTab === 'contractors' ? 'contractor' : '';
            filtersContainer.innerHTML = this.renderFilters(defaultPersonType);
        }
        if (!skipFilterRerender) {
            this.bindFilters();
        }
    },

    setupEventListeners() {
        setTimeout(() => {
            const addBtn = document.getElementById('add-violation-btn');
            if (addBtn) addBtn.addEventListener('click', () => this.showViolationForm());
            this.bindFilters();
        }, 100);
    },

    async switchTab(tabName) {
        // Update tab buttons
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            }
            // التأكد من الحفاظ على styles لمنع التكسير
            if (!btn.style.flexShrink) {
                btn.style.setProperty('flex-shrink', '0', 'important');
                btn.style.setProperty('min-width', 'fit-content', 'important');
                btn.style.setProperty('white-space', 'nowrap', 'important');
                btn.style.setProperty('width', 'auto', 'important');
                btn.style.setProperty('max-width', 'none', 'important');
            }
        });
        
        // التأكد من الحفاظ على styles للـ container
        const tabContainer = document.querySelector('.tabs-nav');
        if (tabContainer && !tabContainer.style.flexWrap) {
            tabContainer.style.setProperty('flex-wrap', 'nowrap', 'important');
            tabContainer.style.setProperty('overflow-x', 'auto', 'important');
            tabContainer.style.setProperty('overflow-y', 'visible', 'important');
        }

        // Update content
        const contentContainer = document.getElementById('violations-tab-content');
        if (!contentContainer) return;

        switch (tabName) {
            case 'all':
                contentContainer.innerHTML = `
                    <div class="content-card" id="violations-list-tab">
                        <div class="card-header">
                            <h2 class="card-title"><i class="fas fa-list ml-2"></i>قائمة المخالفات</h2>
                        </div>
                        <div class="card-body">
                            ${this.renderAllViolationsStats()}
                            <div id="violations-filters-container" class="mb-4">
                                ${this.renderFilters()}
                            </div>
                            <div id="violations-list">
                                ${this.renderViolationsList()}
                            </div>
                        </div>
                    </div>
                `;
                this.bindFilters();
                break;
            case 'employees':
                contentContainer.innerHTML = `
                    <div class="content-card">
                        <div class="card-header">
                            <h2 class="card-title"><i class="fas fa-user-tie ml-2"></i>مخالفات الموظفين</h2>
                        </div>
                        <div class="card-body">
                            <div id="violations-filters-container" class="mb-4">
                                ${this.renderFilters('employee')}
                            </div>
                            <div id="violations-list">
                                ${this.renderEmployeeViolationsList()}
                            </div>
                        </div>
                    </div>
                `;
                this.bindFilters();
                break;
            case 'contractors':
                contentContainer.innerHTML = `
                    <div class="content-card">
                        <div class="card-header">
                            <h2 class="card-title"><i class="fas fa-users-cog ml-2"></i>مخالفات المقاولين</h2>
                        </div>
                        <div class="card-body">
                            <div id="violations-filters-container" class="mb-4">
                                ${this.renderFilters('contractor')}
                            </div>
                            <div class="mb-4 flex items-center justify-end">
                                <button type="button" class="btn-primary" onclick="Violations.showContractorViolationsReportDialog()">
                                    <i class="fas fa-file-pdf ml-2"></i>تصدير تقرير مخالفة المقاولين
                                </button>
                            </div>
                            <div id="violations-list">
                                ${this.renderContractorViolationsList()}
                            </div>
                        </div>
                    </div>
                `;
                this.bindFilters();
                break;
            case 'analytics':
                contentContainer.innerHTML = this.renderAnalyticsTab();
                // تشغيل التحليل وربط الأحداث بعد رسم الـ DOM
                setTimeout(() => {
                    this.updateViolationAnalytics();
                    this._vBindAnalyticsEvents();
                }, 80);
                break;
            case 'blacklist':
                // عرض الواجهة مباشرة مع البيانات المحلية (إن وجدت)
                contentContainer.innerHTML = this.renderBlacklistTab();
                this.setupBlacklistEventListeners();
                // تحميل البيانات من Google Sheets في الخلفية وتحديث الواجهة
                this.loadBlacklistDataAsync().then(() => {
                    // تحديث الواجهة بعد تحميل البيانات
                    this.refreshBlacklistDisplay();
                }).catch(error => {
                    Utils.safeWarn('⚠️ خطأ في تحميل بيانات Blacklist:', error);
                });
                break;
        }
    },

    /**
     * Wrapper function للتعامل مع async في onclick
     */
    async switchTabAsync(tabName) {
        try {
            await this.switchTab(tabName);
        } catch (error) {
            Utils.safeError('خطأ في التبديل إلى التبويب:', error);
        }
    },

    /**
     * تحديث المديول (إعادة تحميل البيانات مع الحفاظ على التبويب الحالي)
     */
    refreshModule() {
        const btn = document.getElementById('violations-btn-refresh');
        if (btn) {
            btn.disabled = true;
            const icon = btn.querySelector('i.fa-sync-alt');
            if (icon) icon.classList.add('fa-spin');
        }
        const loadPromise = typeof this.load === 'function' ? this.load() : Promise.resolve();
        Promise.resolve(loadPromise).finally(() => {
            const refBtn = document.getElementById('violations-btn-refresh');
            if (refBtn) {
                refBtn.disabled = false;
                const refIcon = refBtn.querySelector('i.fa-sync-alt');
                if (refIcon) refIcon.classList.remove('fa-spin');
            }
        });
    },

    renderEmployeeViolationsList() {
        const violations = this.getFilteredViolations().filter(v =>
            v.employeeName || v.personType === 'employee' || (!v.contractorName && v.employeeName)
        );
        if (violations.length === 0) {
            return `<div class="empty-state"><p class="text-gray-500">لا توجد مخالفات للموظفين</p></div>`;
        }
        return `
            <div class="table-responsive" style="border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08);">
            <table class="data-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);">
                        <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">اسم الموظف</th>
                        <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">الكود الوظيفي</th>
                        <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">نوع المخالفة</th>
                        <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">التاريخ</th>
                        <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">الشدة</th>
                        <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">الإجراء المتخذ</th>
                        <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">الحالة</th>
                        <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">الإجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    ${violations.map(violation => `
                        <tr>
                            <td>${Utils.escapeHTML(violation.employeeName || '')}</td>
                            <td>${Utils.escapeHTML(violation.employeeCode || violation.employeeNumber || '-')}</td>
                            <td>${Utils.escapeHTML(violation.violationType || '')}</td>
                            <td>${violation.violationDate ? Utils.formatDate(violation.violationDate) : '-'}</td>
                            <td>
                                <span class="badge badge-${violation.severity === 'عالية' ? 'danger' : violation.severity === 'متوسطة' ? 'warning' : 'info'}">
                                    ${violation.severity || '-'}
                                </span>
                            </td>
                            <td>${Utils.escapeHTML(violation.actionTaken || '')}</td>
                            <td>
                                <span class="badge badge-${violation.status === 'محلول' ? 'success' : 'warning'}">
                                    ${violation.status || '-'}
                                </span>
                            </td>
                            <td>
                                <div class="flex items-center gap-2">
                                    <button type="button" onclick='Violations.viewViolation(${this._escapeIdForHandler(violation.id)})' class="btn-icon btn-icon-primary" title="عرض">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button type="button" onclick='Violations.showViolationForm(${this._escapeIdForHandler(violation.id)})' class="btn-icon btn-icon-warning" title="تعديل">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button type="button" onclick='Violations.deleteViolation(${this._escapeIdForHandler(violation.id)})' class="btn-icon btn-icon-danger" title="حذف">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            </div>
        `;
    },

    renderContractorViolationsList() {
        const violations = this.getFilteredViolations().filter(v =>
            v.contractorName || v.personType === 'contractor'
        );
        if (violations.length === 0) {
            return `<div class="empty-state"><p class="text-gray-500">لا توجد مخالفات للمقاولين</p></div>`;
        }
        return `
            <div class="table-responsive" style="border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08);">
            <table class="data-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);">
                        <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">اسم المقاول</th>
                        <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">نوع المخالفة</th>
                        <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">التاريخ</th>
                        <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">الشدة</th>
                        <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">الإجراء المتخذ</th>
                        <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">الحالة</th>
                        <th style="color: white; font-weight: 600; padding: 16px 12px; text-align: center; font-size: 0.9rem;">الإجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    ${violations.map(violation => `
                        <tr>
                            <td>${Utils.escapeHTML(violation.contractorName || '')}</td>
                            <td>${Utils.escapeHTML(violation.violationType || '')}</td>
                            <td>${violation.violationDate ? Utils.formatDate(violation.violationDate) : '-'}</td>
                            <td>
                                <span class="badge badge-${violation.severity === 'عالية' ? 'danger' : violation.severity === 'متوسطة' ? 'warning' : 'info'}">
                                    ${violation.severity || '-'}
                                </span>
                            </td>
                            <td>${Utils.escapeHTML(violation.actionTaken || '')}</td>
                            <td>
                                <span class="badge badge-${violation.status === 'محلول' ? 'success' : 'warning'}">
                                    ${violation.status || '-'}
                                </span>
                            </td>
                            <td>
                                <div class="flex items-center gap-2">
                                    <button type="button" onclick='Violations.viewViolation(${this._escapeIdForHandler(violation.id)})' class="btn-icon btn-icon-primary" title="عرض">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button type="button" onclick='Violations.showViolationForm(${this._escapeIdForHandler(violation.id)})' class="btn-icon btn-icon-warning" title="تعديل">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button type="button" onclick='Violations.deleteViolation(${this._escapeIdForHandler(violation.id)})' class="btn-icon btn-icon-danger" title="حذف">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            </div>
        `;
    },

    getContractorViolationsExportOptions() {
        const optionsMap = new Map();
        const addOption = (id, name) => {
            const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
            if (!cleanName) return;
            const key = String(id || cleanName).trim();
            if (!optionsMap.has(key)) {
                optionsMap.set(key, { id: key, name: cleanName });
            }
        };

        const appViolations = Array.isArray(AppState.appData?.violations) ? AppState.appData.violations : [];
        appViolations.forEach(v => {
            if (v?.contractorName) addOption(v.contractorId || v.contractorName, v.contractorName);
        });

        const approved = Array.isArray(AppState.appData?.approvedContractors) ? AppState.appData.approvedContractors : [];
        approved.forEach(c => addOption(c?.contractorId || c?.id || c?.code, c?.companyName || c?.name || c?.contractorName));

        const contractors = Array.isArray(AppState.appData?.contractors) ? AppState.appData.contractors : [];
        contractors.forEach(c => addOption(c?.id || c?.contractorId || c?.code, c?.name || c?.companyName || c?.contractorName));

        // ✅ إزالة التكرار بناءً على اسم الشركة (بعيداً عن اختلاف المعرّفات)
        // نفس الشركة قد تظهر بمعرّفات مختلفة من مصادر مختلفة (violations/approvedContractors/contractors)
        const nameDeduped = new Map();
        for (const entry of optionsMap.values()) {
            const normalizedName = entry.name.trim().toLowerCase().replace(/\s+/g, ' ');
            if (!nameDeduped.has(normalizedName)) {
                nameDeduped.set(normalizedName, entry);
            }
        }
        return Array.from(nameDeduped.values())
            .sort((a, b) => a.name.localeCompare(b.name, 'ar', { sensitivity: 'base' }));
    },

    showContractorViolationsReportDialog() {
        const contractors = this.getContractorViolationsExportOptions();
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const months = [];
        for (let i = 0; i < 24; i++) {
            const date = new Date(currentYear, currentDate.getMonth() - i, 1);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;
            const monthLabel = date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' });
            months.push({ value: monthKey, label: monthLabel });
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-file-pdf ml-2"></i>
                        تصدير تقرير مخالفات المقاولين
                    </h2>
                    <button class="modal-close" title="إغلاق">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-building ml-2"></i>
                            اختر المقاول
                        </label>
                        <select id="contractor-violations-report-select" class="form-input">
                            <option value="">جميع المقاولين</option>
                            ${contractors.map(contractor => `
                                <option value="${Utils.escapeHTML(String(contractor.id ?? '').trim())}">
                                    ${Utils.escapeHTML(contractor.name || 'بدون اسم')}
                                </option>
                            `).join('')}
                        </select>
                        <p class="text-xs text-gray-500 mt-2">
                            <i class="fas fa-info-circle ml-1"></i>
                            اختر مقاولاً محدداً لعرض تقريره فقط، أو اتركه فارغاً لعرض جميع المقاولين
                        </p>
                    </div>

                    <div style="border-top: 1px solid #E5E7EB; padding-top: 16px; margin-top: 16px;">
                        <label class="block text-sm font-semibold text-gray-700 mb-3">
                            <i class="fas fa-calendar-alt ml-2"></i>
                            فترة التصدير
                        </label>
                        <div class="space-y-3">
                            <div class="flex items-center">
                                <input type="radio" id="contractor-violations-range-all" name="contractor-violations-range-type" value="all" class="ml-2" checked>
                                <label for="contractor-violations-range-all" class="text-sm text-gray-700 cursor-pointer">جميع السجلات</label>
                            </div>
                            <div class="flex items-center">
                                <input type="radio" id="contractor-violations-range-month" name="contractor-violations-range-type" value="month" class="ml-2">
                                <label for="contractor-violations-range-month" class="text-sm text-gray-700 cursor-pointer mr-2">شهر محدد</label>
                                <select id="contractor-violations-report-month" class="form-input flex-1" disabled style="max-width: 300px;">
                                    <option value="">اختر الشهر</option>
                                    ${months.map(month => `<option value="${month.value}">${month.label}</option>`).join('')}
                                </select>
                            </div>
                            <div class="flex items-center">
                                <input type="radio" id="contractor-violations-range-custom" name="contractor-violations-range-type" value="custom" class="ml-2">
                                <label for="contractor-violations-range-custom" class="text-sm text-gray-700 cursor-pointer mr-2">فترة محددة</label>
                                <div class="flex items-center gap-2 flex-1" style="max-width: 400px;">
                                    <input type="date" id="contractor-violations-report-from-date" class="form-input flex-1" disabled>
                                    <span class="text-sm text-gray-600">إلى</span>
                                    <input type="date" id="contractor-violations-report-to-date" class="form-input flex-1" disabled>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" data-action="close">إلغاء</button>
                    <button type="button" class="btn-primary" id="generate-contractor-violations-report-btn">
                        <i class="fas fa-file-export ml-2"></i>
                        إنشاء التقرير
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.querySelector('.modal-close')?.addEventListener('click', close);
        modal.querySelector('[data-action="close"]')?.addEventListener('click', close);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) close();
        });

        const rangeInputs = modal.querySelectorAll('input[name="contractor-violations-range-type"]');
        const monthSelect = modal.querySelector('#contractor-violations-report-month');
        const fromDateInput = modal.querySelector('#contractor-violations-report-from-date');
        const toDateInput = modal.querySelector('#contractor-violations-report-to-date');

        const updateDateFields = () => {
            const selectedType = modal.querySelector('input[name="contractor-violations-range-type"]:checked')?.value || 'all';
            monthSelect.disabled = selectedType !== 'month';
            monthSelect.required = selectedType === 'month';
            fromDateInput.disabled = selectedType !== 'custom';
            fromDateInput.required = selectedType === 'custom';
            toDateInput.disabled = selectedType !== 'custom';
            toDateInput.required = selectedType === 'custom';
        };
        rangeInputs.forEach(input => input.addEventListener('change', updateDateFields));

        modal.querySelector('#generate-contractor-violations-report-btn')?.addEventListener('click', async () => {
            const contractorSelect = modal.querySelector('#contractor-violations-report-select');
            const selectedContractorId = contractorSelect?.value ? String(contractorSelect.value).trim() : '';
            const selectedContractorName = selectedContractorId
                ? String(contractorSelect?.options?.[contractorSelect.selectedIndex]?.textContent || '').replace(/\s+/g, ' ').trim()
                : '';
            const dateRangeType = modal.querySelector('input[name="contractor-violations-range-type"]:checked')?.value || 'all';
            const month = modal.querySelector('#contractor-violations-report-month')?.value || '';
            const fromDate = modal.querySelector('#contractor-violations-report-from-date')?.value || '';
            const toDate = modal.querySelector('#contractor-violations-report-to-date')?.value || '';

            if (dateRangeType === 'month' && !month) {
                Notification.warning('يرجى اختيار الشهر المطلوب');
                return;
            }
            if (dateRangeType === 'custom') {
                if (!fromDate || !toDate) {
                    Notification.warning('يرجى اختيار تاريخ البداية والنهاية للفترة');
                    return;
                }
                if (new Date(fromDate) > new Date(toDate)) {
                    Notification.warning('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
                    return;
                }
            }

            close();
            await this.generateContractorViolationsReport(selectedContractorId, {
                dateRangeType,
                month,
                fromDate,
                toDate
            }, selectedContractorName);
        });
    },

    async generateContractorViolationsReport(contractorId = '', dateFilter = {}, selectedContractorName = '') {
        const normalizedContractorId = String(contractorId || '').trim();
        const normalizedName = String(selectedContractorName || '').replace(/\s+/g, ' ').trim().toLowerCase();
        let violations = (AppState.appData.violations || []).filter(v => v.contractorName || v.personType === 'contractor');

        if (normalizedContractorId || normalizedName) {
            violations = violations.filter(v => {
                const recordId = String(v.contractorId || '').trim();
                const recordName = String(v.contractorName || '').replace(/\s+/g, ' ').trim().toLowerCase();
                if (normalizedContractorId && recordId && normalizedContractorId === recordId) return true;
                if (normalizedName && recordName && (recordName === normalizedName || recordName.includes(normalizedName) || normalizedName.includes(recordName))) return true;
                return false;
            });
        }

        const { dateRangeType = 'all', month = '', fromDate = '', toDate = '' } = dateFilter || {};
        if (dateRangeType === 'month' && month) {
            const [year, monthNum] = month.split('-');
            violations = violations.filter(v => {
                if (!v.violationDate) return false;
                const d = new Date(v.violationDate);
                return d.getFullYear() === parseInt(year, 10) && (d.getMonth() + 1) === parseInt(monthNum, 10);
            });
        } else if (dateRangeType === 'custom' && fromDate && toDate) {
            const start = new Date(fromDate); start.setHours(0, 0, 0, 0);
            const end = new Date(toDate); end.setHours(23, 59, 59, 999);
            violations = violations.filter(v => {
                if (!v.violationDate) return false;
                const d = new Date(v.violationDate);
                return d >= start && d <= end;
            });
        }

        if (!violations.length) {
            Notification.warning('لا توجد بيانات لمخالفات المقاولين وفق المحددات المختارة');
            return;
        }

        try {
            Loading.show('جاري إنشاء تقرير مخالفات المقاولين...');

            const highCount = violations.filter(v => String(v.severity || '').trim() === 'عالية').length;
            const mediumCount = violations.filter(v => String(v.severity || '').trim() === 'متوسطة').length;
            const lowCount = violations.filter(v => String(v.severity || '').trim() === 'منخضة').length;
            const resolvedCount = violations.filter(v => String(v.status || '').trim() === 'محلول').length;
            const unresolvedCount = Math.max(0, violations.length - resolvedCount);
            const resolutionRate = violations.length > 0 ? Math.round((resolvedCount / violations.length) * 100) : 0;
            const uniqueContractors = new Set(violations.map(v => String(v.contractorName || '').trim()).filter(Boolean)).size;
            const totalFineAmount = violations.reduce((sum, v) => sum + (Number(this.getEffectiveFineAmount(v)) || 0), 0);

            let periodInfo = '';
            if (dateRangeType === 'month' && month) {
                const [y, m] = month.split('-');
                const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
                periodInfo = d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' });
            } else if (dateRangeType === 'custom' && fromDate && toDate) {
                periodInfo = `من ${Utils.formatDate(fromDate)} إلى ${Utils.formatDate(toDate)}`;
            }

            const rowsHtml = violations.map((v, index) => `
                <tr>
                    <td style="padding: 10px 8px; border: 1px solid #E5E7EB; text-align: center; font-size: 11px;">${index + 1}</td>
                    <td style="padding: 10px 8px; border: 1px solid #E5E7EB; text-align: right; font-size: 11px;">${Utils.escapeHTML(v.contractorName || '-')}</td>
                    <td style="padding: 10px 8px; border: 1px solid #E5E7EB; text-align: right; font-size: 11px;">${Utils.escapeHTML(v.violationType || '-')}</td>
                    <td style="padding: 10px 8px; border: 1px solid #E5E7EB; text-align: center; font-size: 11px;">${v.violationDate ? Utils.formatDate(v.violationDate) : '-'}</td>
                    <td style="padding: 10px 8px; border: 1px solid #E5E7EB; text-align: center; font-size: 11px;">${Utils.escapeHTML(v.severity || '-')}</td>
                    <td style="padding: 10px 8px; border: 1px solid #E5E7EB; text-align: right; font-size: 11px;">${Utils.escapeHTML(v.actionTaken || '-')}</td>
                    <td style="padding: 10px 8px; border: 1px solid #E5E7EB; text-align: center; font-size: 11px;">${Utils.escapeHTML(v.status || '-')}</td>
                </tr>
            `).join('');

            const headingName = selectedContractorName ? ` - ${Utils.escapeHTML(selectedContractorName)}` : '';
            const content = `
                <div style="margin-bottom: 24px;">
                    <h2 style="font-size: 20px; margin-bottom: 12px; color: #991B1B; font-weight: 700;">تقرير مخالفات المقاولين${headingName}</h2>
                    ${periodInfo ? `<div style="margin-bottom: 16px; padding: 12px; background: #FFF7ED; border-right: 4px solid #F59E0B; border-radius: 8px;"><strong style="color: #D97706;">الفترة:</strong> <span style="color: #1F2937;">${Utils.escapeHTML(periodInfo)}</span></div>` : ''}
                    <div style="display: flex; flex-wrap: wrap; gap: 16px;">
                        <div style="flex: 1 1 180px; padding: 14px; border-radius: 10px; background: #FEF2F2; border: 1px solid #FECACA;"><div style="font-size: 12px; color: #B91C1C; margin-bottom: 6px; font-weight: 600;">إجمالي المخالفات</div><div style="font-size: 24px; font-weight: 700; color: #991B1B;">${violations.length}</div></div>
                        <div style="flex: 1 1 180px; padding: 14px; border-radius: 10px; background: #EFF6FF; border: 1px solid #BFDBFE;"><div style="font-size: 12px; color: #1D4ED8; margin-bottom: 6px; font-weight: 600;">عدد المقاولين</div><div style="font-size: 24px; font-weight: 700; color: #1E3A8A;">${uniqueContractors}</div></div>
                        <div style="flex: 1 1 180px; padding: 14px; border-radius: 10px; background: #FFFBEB; border: 1px solid #FDE68A;"><div style="font-size: 12px; color: #B45309; margin-bottom: 6px; font-weight: 600;">القيمة المالية للمخالفات</div><div style="font-size: 24px; font-weight: 700; color: #92400E;">${this.formatFineAmount(Number(totalFineAmount))}</div></div>
                        <div style="flex: 1 1 180px; padding: 14px; border-radius: 10px; background: #FFF7ED; border: 1px solid #FED7AA;"><div style="font-size: 12px; color: #C2410C; margin-bottom: 6px; font-weight: 600;">عالية / متوسطة / منخفضة</div><div style="font-size: 20px; font-weight: 700; color: #9A3412;">${highCount} / ${mediumCount} / ${lowCount}</div></div>
                        <div style="flex: 1 1 180px; padding: 14px; border-radius: 10px; background: #ECFDF5; border: 1px solid #BBF7D0;"><div style="font-size: 12px; color: #047857; margin-bottom: 6px; font-weight: 600;">معدل الحل</div><div style="font-size: 24px; font-weight: 700; color: #065F46;">${resolutionRate}%</div><div style="font-size: 11px; color: #065F46; margin-top: 4px;">محلول: ${resolvedCount} | غير محلول: ${unresolvedCount}</div></div>
                    </div>
                </div>
                <div style="margin-bottom: 16px;">
                    <h3 style="font-size: 18px; margin-bottom: 12px; color: #991B1B; font-weight: 700; border-bottom: 2px solid #DC2626; padding-bottom: 8px;">جدول المخالفات</h3>
                </div>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px; direction: rtl;">
                        <thead>
                            <tr style="background: #B91C1C; color: #FFFFFF;">
                                <th style="padding: 12px 8px; border: 1px solid #991B1B; text-align: center; font-weight: 700;">#</th>
                                <th style="padding: 12px 8px; border: 1px solid #991B1B; text-align: center; font-weight: 700;">اسم المقاول</th>
                                <th style="padding: 12px 8px; border: 1px solid #991B1B; text-align: center; font-weight: 700;">نوع المخالفة</th>
                                <th style="padding: 12px 8px; border: 1px solid #991B1B; text-align: center; font-weight: 700;">التاريخ</th>
                                <th style="padding: 12px 8px; border: 1px solid #991B1B; text-align: center; font-weight: 700;">الشدة</th>
                                <th style="padding: 12px 8px; border: 1px solid #991B1B; text-align: center; font-weight: 700;">الإجراء المتخذ</th>
                                <th style="padding: 12px 8px; border: 1px solid #991B1B; text-align: center; font-weight: 700;">الحالة</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            `;

            const formCode = `CONTRACTOR-VIOL-${new Date().toISOString().slice(0, 10)}`;
            const reportTitle = selectedContractorName ? `تقرير مخالفات المقاول: ${selectedContractorName}` : 'تقرير مخالفات المقاولين';
            const htmlContent = typeof FormHeader !== 'undefined' && typeof FormHeader.generatePDFHTML === 'function'
                ? FormHeader.generatePDFHTML(formCode, reportTitle, content, false, true, { source: 'ContractorViolationsTab', contractorId: contractorId || '', contractorName: selectedContractorName || '' }, new Date().toISOString(), new Date().toISOString())
                : `<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${reportTitle}</title></head><body>${content}</body></html>`;

            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const reportWindow = window.open(url, '_blank');
            if (reportWindow) {
                reportWindow.onload = () => {
                    try {
                        reportWindow.print();
                    } finally {
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                        Loading.hide();
                    }
                };
            } else {
                URL.revokeObjectURL(url);
                Loading.hide();
                Notification.error('يرجى السماح بالنوافذ المنبثقة للطباعة');
                return;
            }

            Notification.success('تم إنشاء تقرير مخالفات المقاولين بنجاح');
        } catch (error) {
            Loading.hide();
            Utils.safeError('خطأ في إنشاء تقرير مخالفات المقاولين:', error);
            Notification.error('تعذر إنشاء تقرير مخالفات المقاولين: ' + (error.message || 'خطأ غير معروف'));
        }
    },

    async deleteViolation(id) {
        if (!id) {
            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('معرف المخالفة غير موجود', 'error');
            }
            return;
        }

        if (!confirm('هل أنت متأكد من حذف هذه المخالفة؟ لا يمكن التراجع عن هذا الإجراء.')) {
            return;
        }

        if (typeof Loading !== 'undefined' && Loading.show) {
            Loading.show('جاري حذف المخالفة...');
        }

        try {
            // 1. الحصول على بيانات المخالفة قبل الحذف للتنظيف
            const violation = (AppState.appData?.violations || []).find(v => v.id === id);
            const contractorId = violation?.contractorId || '';
            const contractorName = violation?.contractorName || '';
            const employeeId = violation?.employeeId || '';
            const employeeCode = violation?.employeeCode || violation?.employeeNumber || '';
            const employeeName = violation?.employeeName || '';

            // 2. حذف من قاعدة البيانات (Backend)
            let result;
            if (typeof Backend !== 'undefined' && Backend.callBackend) {
                result = await Backend.callBackend('deleteViolationFromSheet', { id: id });
            } else {
                throw new Error('خدمة الاتصال بالخلفية غير متوفرة');
            }

            if (result && result.success) {
                // 3. تحديث البيانات المحلية
                if (AppState.appData && AppState.appData.violations) {
                    AppState.appData.violations = AppState.appData.violations.filter(v => v.id !== id);
                }

                // 4. تنظيف أي مراجع في بيانات المقاولين (إذا كانت موجودة)
                if (contractorId || contractorName) {
                    const contractors = AppState.appData?.contractors || [];
                    contractors.forEach(contractor => {
                        if (contractor && (
                            contractor.id === contractorId || 
                            contractor.name === contractorName ||
                            contractor.contractorName === contractorName
                        )) {
                            // إذا كان المقاول يحتوي على مصفوفة violations، نزيل المخالفة منها
                            if (Array.isArray(contractor.violations)) {
                                contractor.violations = contractor.violations.filter(v => v.id !== id);
                            }
                            // تنظيف أي مراجع أخرى
                            if (contractor.violationIds && Array.isArray(contractor.violationIds)) {
                                contractor.violationIds = contractor.violationIds.filter(vId => vId !== id);
                            }
                        }
                    });
                }

                // 5. تنظيف أي مراجع في بيانات الموظفين (إذا كانت موجودة)
                if (employeeId || employeeCode || employeeName) {
                    const employees = AppState.appData?.employees || [];
                    employees.forEach(employee => {
                        if (employee && (
                            employee.id === employeeId ||
                            employee.employeeNumber === employeeCode ||
                            employee.employeeCode === employeeCode ||
                            employee.name === employeeName
                        )) {
                            // إذا كان الموظف يحتوي على مصفوفة violations، نزيل المخالفة منها
                            if (Array.isArray(employee.violations)) {
                                employee.violations = employee.violations.filter(v => v.id !== id);
                            }
                            // تنظيف أي مراجع أخرى
                            if (employee.violationIds && Array.isArray(employee.violationIds)) {
                                employee.violationIds = employee.violationIds.filter(vId => vId !== id);
                            }
                        }
                    });
                }

                // 6. حفظ البيانات المحلية
                if (typeof DataManager !== 'undefined' && DataManager.save) {
                    DataManager.save();
                }

                // 7. تحديث الكروت فوراً (مباشر) ثم العروض
                try { this.updateAllViolationsStats(); } catch (e) { /* ignore */ }
                this.refreshViolationsView();

                // 8. تحديث عروض المقاولين والموظفين إذا كانت مفتوحة
                if (typeof Contractors !== 'undefined' && Contractors.load) {
                    try {
                        const currentSection = AppState?.currentSection || '';
                        // ✅ CRITICAL: منع استدعاء load إذا كان قيد التنفيذ
                        if (currentSection === 'contractors' && !Contractors._isLoading) {
                            Contractors.load();
                        }
                    } catch (e) {
                        console.warn('Could not refresh contractors view:', e);
                    }
                }

                if (typeof Employees !== 'undefined' && Employees.loadEmployeesList) {
                    try {
                        const currentSection = AppState?.currentSection || '';
                        if (currentSection === 'employees') {
                            Employees.loadEmployeesList();
                        }
                    } catch (e) {
                        console.warn('Could not refresh employees view:', e);
                    }
                }

                if (typeof Utils !== 'undefined' && Utils.showToast) {
                    Utils.showToast('تم حذف المخالفة بنجاح من قاعدة البيانات وجميع السجلات المرتبطة', 'success');
                }
            } else {
                throw new Error(result?.message || 'فشل حذف المخالفة من قاعدة البيانات');
            }
        } catch (error) {
            console.error('Error deleting violation:', error);
            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('حدث خطأ أثناء حذف المخالفة: ' + error.message, 'error');
            } else {
                alert('حدث خطأ أثناء حذف المخالفة: ' + error.message);
            }
        } finally {
            if (typeof Loading !== 'undefined' && Loading.hide) {
                Loading.hide();
            }
        }
    },

    // ══════════════════════════════════════════════════════════════════
    //  لوحة تحليل المخالفات الاحترافية
    // ══════════════════════════════════════════════════════════════════

    renderAnalyticsTab() {
        // بدء تحميل Chart.js مبكراً
        this._vEnsureChartJS().catch(() => {});
        return `
        <div id="viol-analytics-root" style="font-family:inherit;">

            <!-- ── شريط الأدوات الرئيسي ── -->
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px;padding:16px 20px;background:linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%);border-radius:14px;color:#fff;box-shadow:0 4px 20px rgba(220,38,38,0.35);">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:44px;height:44px;background:rgba(255,255,255,0.18);border-radius:12px;display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-chart-bar" style="font-size:20px;"></i>
                    </div>
                    <div>
                        <h2 style="margin:0;font-size:1.15rem;font-weight:700;">لوحة تحليل المخالفات</h2>
                        <p style="margin:0;font-size:0.75rem;opacity:0.85;">تحليل شامل وفوري • فلاتر تفاعلية • تصدير PDF</p>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <span style="font-size:0.72rem;opacity:0.85;margin-left:2px;">الفترة:</span>
                    <div style="display:flex;gap:3px;flex-wrap:wrap;">
                        ${['30','90','180','365','0'].map((v,i) => {
                            const labels = ['30 يوم','3 أشهر','6 أشهر','سنة','الكل'];
                            const active = (this._violPeriod || '0') === v;
                            return `<button class="viol-period-btn" data-period="${v}" style="padding:5px 10px;border-radius:8px;border:none;cursor:pointer;font-size:0.75rem;font-weight:600;transition:all .2s;background:${active?'#fff':'rgba(255,255,255,0.15)'};color:${active?'#991b1b':'#fff'};">${labels[i]}</button>`;
                        }).join('')}
                    </div>
                    <button id="viol-toggle-filters-btn" style="padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.4);cursor:pointer;background:rgba(255,255,255,0.12);color:#fff;font-size:0.78rem;font-weight:600;transition:all .2s;display:flex;align-items:center;gap:5px;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.12)'">
                        <i class="fas fa-sliders-h"></i><span>فلاتر</span><span id="viol-filter-badge" style="display:none;background:#fbbf24;color:#78350f;font-size:0.65rem;padding:1px 5px;border-radius:10px;margin-right:2px;">●</span>
                    </button>
                    <!-- ✅ تبديل العملة EGP ⇄ USD -->
                    <div style="display:inline-flex;align-items:center;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.4);border-radius:8px;overflow:hidden;">
                        <button id="viol-curr-egp" data-curr="EGP" class="viol-curr-btn" style="padding:6px 10px;border:none;cursor:pointer;background:${this.getCurrentCurrency()==='EGP'?'#fff':'transparent'};color:${this.getCurrentCurrency()==='EGP'?'#991b1b':'#fff'};font-size:0.78rem;font-weight:700;transition:all .15s;" title="جنيه مصري">ج.م</button>
                        <button id="viol-curr-usd" data-curr="USD" class="viol-curr-btn" style="padding:6px 10px;border:none;cursor:pointer;background:${this.getCurrentCurrency()==='USD'?'#fff':'transparent'};color:${this.getCurrentCurrency()==='USD'?'#991b1b':'#fff'};font-size:0.78rem;font-weight:700;transition:all .15s;" title="دولار أمريكي">$</button>
                        <button id="viol-curr-rate-btn" style="padding:6px 8px;border:none;border-right:1px solid rgba(255,255,255,0.25);cursor:pointer;background:transparent;color:#fff;font-size:0.78rem;transition:all .15s;" title="تعديل سعر الصرف" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='transparent'"><i class="fas fa-cog"></i></button>
                    </div>
                    <button id="viol-export-pdf-btn" style="padding:6px 14px;border-radius:8px;border:none;cursor:pointer;background:rgba(0,0,0,0.3);color:#fff;font-size:0.78rem;font-weight:600;transition:all .2s;display:flex;align-items:center;gap:5px;" onmouseover="this.style.background='rgba(0,0,0,0.5)'" onmouseout="this.style.background='rgba(0,0,0,0.3)'">
                        <i class="fas fa-file-pdf"></i><span>PDF</span>
                    </button>
                    <button id="viol-analytics-refresh" style="padding:6px 10px;border-radius:8px;border:none;cursor:pointer;background:rgba(255,255,255,0.15);color:#fff;font-size:0.78rem;transition:all .2s;" onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'" title="تحديث">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
            </div>

            <!-- ── لوحة الفلاتر التفاعلية ── -->
            <div id="viol-filter-panel" style="display:none;background:#fef2f2;border:1.5px solid #fecaca;border-radius:12px;padding:18px 20px;margin-bottom:16px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-sliders-h" style="color:#dc2626;font-size:14px;"></i>
                        <span style="font-weight:700;font-size:0.9rem;color:#7f1d1d;">الفلاتر التفاعلية</span>
                        <span id="viol-filter-count" style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:600;"></span>
                    </div>
                    <button id="viol-filter-reset-btn" style="padding:4px 12px;border-radius:8px;border:1px solid #fecaca;background:#fff;color:#64748b;font-size:0.75rem;cursor:pointer;" onmouseover="this.style.background='#fee2e2';this.style.color='#dc2626'" onmouseout="this.style.background='#fff';this.style.color='#64748b'">
                        <i class="fas fa-times ml-1"></i>مسح الكل
                    </button>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
                    ${[
                        {id:'viol-af-ptype',   icon:'fas fa-id-badge',          color:'#6366f1', label:'نوع الشخص'},
                        {id:'viol-af-type',    icon:'fas fa-tag',               color:'#dc2626', label:'نوع المخالفة'},
                        {id:'viol-af-sev',     icon:'fas fa-exclamation-circle', color:'#f59e0b', label:'درجة الشدة'},
                        {id:'viol-af-status',  icon:'fas fa-circle',            color:'#10b981', label:'الحالة'},
                        {id:'viol-af-loc',     icon:'fas fa-map-marker-alt',    color:'#3b82f6', label:'الموقع'},
                    ].map(f => `
                        <div>
                            <label style="font-size:0.72rem;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">
                                <i class="${f.icon}" style="color:${f.color};margin-left:4px;"></i>${f.label}
                            </label>
                            <select id="${f.id}" style="width:100%;padding:7px 10px;border:1.5px solid #fecaca;border-radius:8px;font-size:0.82rem;background:#fff;color:#374151;cursor:pointer;" onfocus="this.style.borderColor='#dc2626'" onblur="this.style.borderColor='#fecaca'">
                                <option value="">الكل</option>
                            </select>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- ── KPI Cards ── -->
            <div id="viol-kpi-strip" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-bottom:20px;">
                <div style="text-align:center;padding:16px;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i></div>
            </div>

            <!-- ── Row 1: الحالة + الشدة ── -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-bottom:16px;">
                <div class="content-card" style="padding:0;overflow:hidden;">
                    <div style="padding:13px 18px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-tasks" style="color:#3b82f6;"></i>
                        <span style="font-weight:700;font-size:0.88rem;">التوزيع حسب الحالة</span>
                    </div>
                    <div style="padding:12px;position:relative;height:240px;">
                        <canvas id="viol-chart-status"></canvas>
                        <div id="viol-chart-status-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">لا توجد بيانات</div>
                    </div>
                </div>
                <div class="content-card" style="padding:0;overflow:hidden;">
                    <div style="padding:13px 18px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-exclamation-circle" style="color:#ef4444;"></i>
                        <span style="font-weight:700;font-size:0.88rem;">التوزيع حسب درجة الشدة</span>
                    </div>
                    <div style="padding:12px;position:relative;height:240px;">
                        <canvas id="viol-chart-sev"></canvas>
                        <div id="viol-chart-sev-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">لا توجد بيانات</div>
                    </div>
                </div>
            </div>

            <!-- ── الاتجاه الزمني ── -->
            <div class="content-card" style="padding:0;overflow:hidden;margin-bottom:16px;">
                <div style="padding:13px 18px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
                    <i class="fas fa-chart-area" style="color:#8b5cf6;"></i>
                    <span style="font-weight:700;font-size:0.88rem;">الاتجاه الزمني للمخالفات (آخر 12 شهر)</span>
                </div>
                <div style="padding:12px;position:relative;height:260px;">
                    <canvas id="viol-chart-trend"></canvas>
                    <div id="viol-chart-trend-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">لا توجد بيانات</div>
                </div>
            </div>

            <!-- ── Row 2: نوع المخالفة + الموقع ── -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-bottom:16px;">
                <div class="content-card" style="padding:0;overflow:hidden;">
                    <div style="padding:13px 18px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-tag" style="color:#dc2626;"></i>
                        <span style="font-weight:700;font-size:0.88rem;">حسب نوع المخالفة (أعلى 10)</span>
                    </div>
                    <div style="padding:12px;position:relative;height:280px;">
                        <canvas id="viol-chart-type"></canvas>
                        <div id="viol-chart-type-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">لا توجد بيانات</div>
                    </div>
                </div>
                <div class="content-card" style="padding:0;overflow:hidden;">
                    <div style="padding:13px 18px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-map-marker-alt" style="color:#f59e0b;"></i>
                        <span style="font-weight:700;font-size:0.88rem;">حسب الموقع (أعلى 8)</span>
                    </div>
                    <div style="padding:12px;position:relative;height:280px;">
                        <canvas id="viol-chart-loc"></canvas>
                        <div id="viol-chart-loc-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">لا توجد بيانات</div>
                    </div>
                </div>
            </div>

            <!-- ── Row 3: أكثر الموظفين + أكثر المقاولين ── -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-bottom:16px;">
                <div class="content-card" style="padding:0;overflow:hidden;">
                    <div style="padding:13px 18px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-user-tie" style="color:#6366f1;"></i>
                        <span style="font-weight:700;font-size:0.88rem;">أكثر الموظفين مخالفةً (أعلى 10)</span>
                    </div>
                    <div style="padding:12px;position:relative;height:280px;">
                        <canvas id="viol-chart-emp"></canvas>
                        <div id="viol-chart-emp-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">لا توجد مخالفات موظفين</div>
                    </div>
                </div>
                <div class="content-card" style="padding:0;overflow:hidden;">
                    <div style="padding:13px 18px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-users-cog" style="color:#f97316;"></i>
                        <span style="font-weight:700;font-size:0.88rem;">أكثر المقاولين مخالفةً (أعلى 10)</span>
                    </div>
                    <div style="padding:12px;position:relative;height:280px;">
                        <canvas id="viol-chart-con"></canvas>
                        <div id="viol-chart-con-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">لا توجد مخالفات مقاولين</div>
                    </div>
                </div>
            </div>

            <!-- ── مخطط الغرامات حسب نوع المخالفة ── -->
            <div class="content-card" style="padding:0;overflow:hidden;margin-bottom:16px;">
                <div style="padding:13px 18px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
                    <i class="fas fa-coins" style="color:#d97706;"></i>
                    <span style="font-weight:700;font-size:0.88rem;">إجمالي الغرامات حسب نوع المخالفة (${this.getCurrencyLabel('long')})</span>
                    <span style="font-size:0.72rem;color:#94a3b8;margin-right:auto;">(أعلى 10 أنواع)</span>
                </div>
                <div style="padding:12px;position:relative;height:260px;">
                    <canvas id="viol-chart-fines"></canvas>
                    <div id="viol-chart-fines-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#94a3b8;font-size:0.85rem;">لا توجد بيانات غرامات</div>
                </div>
            </div>

            <!-- ── جدول أشد المخالفات ── -->
            <div class="content-card" style="padding:0;overflow:hidden;">
                <div style="padding:13px 18px 12px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-fire" style="color:#dc2626;"></i>
                        <span style="font-weight:700;font-size:0.88rem;">أشد المخالفات (عالية الشدة — غير محلولة)</span>
                    </div>
                    <span id="viol-critical-count" style="background:#fef2f2;color:#b91c1c;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;"></span>
                </div>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                        <thead>
                            <tr style="background:#fafafa;border-bottom:2px solid #f1f5f9;">
                                <th style="padding:10px 12px;text-align:right;font-weight:700;color:#374151;white-space:nowrap;">التاريخ</th>
                                <th style="padding:10px 12px;text-align:right;font-weight:700;color:#374151;white-space:nowrap;">الاسم</th>
                                <th style="padding:10px 12px;text-align:right;font-weight:700;color:#374151;white-space:nowrap;">نوع الشخص</th>
                                <th style="padding:10px 12px;text-align:right;font-weight:700;color:#374151;white-space:nowrap;">نوع المخالفة</th>
                                <th style="padding:10px 12px;text-align:right;font-weight:700;color:#374151;white-space:nowrap;">الموقع</th>
                                <th style="padding:10px 12px;text-align:right;font-weight:700;color:#374151;white-space:nowrap;">الشدة</th>
                                <th style="padding:10px 12px;text-align:right;font-weight:700;color:#374151;white-space:nowrap;">الحالة</th>
                                <th style="padding:10px 12px;text-align:center;font-weight:700;color:#374151;white-space:nowrap;">الغرامة (ر.س)</th>
                            </tr>
                        </thead>
                        <tbody id="viol-critical-tbody">
                            <tr><td colspan="8" style="padding:20px;text-align:center;color:#94a3b8;">جارٍ التحميل…</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
    },

    // ── تحديث لوحة تحليل المخالفات ──
    async updateViolationAnalytics() {
        const root = document.getElementById('viol-analytics-root');
        if (!root) return;

        // ── 1. جمع البيانات وتطبيع السجلات ──
        const period = parseInt(this._violPeriod || '0', 10);
        const rawAll = AppState.appData.violations || [];
        const allViol = rawAll.map(r => this.normalizeViolationRecord(r)).filter(Boolean);

        // ── 2. تصفية بالفترة الزمنية ──
        const violByPeriod = this._vFilterByPeriod(allViol, period);

        // ── 3. ملء قوائم الفلاتر من بيانات الفترة ──
        this._vPopulateFilters(violByPeriod);

        // ── 4. تطبيق الفلاتر التفاعلية ──
        const viol = this._vApplyFilters(violByPeriod);
        const total = viol.length;
        const countEl = document.getElementById('viol-filter-count');
        if (countEl) countEl.textContent = `${total} مخالفة`;

        // ── 5. حساب KPIs ──
        const empViol  = viol.filter(v => v.personType === 'employee');
        const conViol  = viol.filter(v => v.personType === 'contractor');
        const highSev  = viol.filter(v => v.severity === 'عالية').length;
        const resolved = viol.filter(v => v.status === 'محلول').length;
        const unresol  = viol.filter(v => v.status === 'غير محلول').length;
        const pending  = viol.filter(v => v.status === 'قيد المراجعة').length;
        const resolRate= total > 0 ? Math.round((resolved/total)*100) : 0;
        const totalFines = viol.reduce((s,v) => s + (Number(v.fineAmount)||0), 0);
        const thisMonth  = viol.filter(v => {
            if (!v.violationDate) return false;
            const d = new Date(v.violationDate), n = new Date();
            return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
        }).length;

        const kpiEl = document.getElementById('viol-kpi-strip');
        if (kpiEl) {
            const kpis = [
                { label:'إجمالي المخالفات',    value:total,                                              icon:'fas fa-exclamation-circle', color:'#dc2626', bg:'#fef2f2', border:'#fecaca' },
                { label:'مخالفات الموظفين',    value:empViol.length,                                     icon:'fas fa-user-tie',           color:'#6366f1', bg:'#eef2ff', border:'#c7d2fe' },
                { label:'مخالفات المقاولين',   value:conViol.length,                                     icon:'fas fa-users-cog',          color:'#f97316', bg:'#fff7ed', border:'#fed7aa' },
                { label:'عالية الشدة',          value:highSev,                                           icon:'fas fa-bomb',               color:'#b91c1c', bg:'#fef2f2', border:'#fca5a5' },
                { label:'محلولة',               value:resolved,                                          icon:'fas fa-check-circle',       color:'#10b981', bg:'#ecfdf5', border:'#a7f3d0' },
                { label:'غير محلولة',           value:unresol,                                           icon:'fas fa-times-circle',       color:'#f59e0b', bg:'#fffbeb', border:'#fde68a' },
                { label:'معدل الحل',            value:resolRate+'%',                                     icon:'fas fa-chart-pie',          color:'#0ea5e9', bg:'#f0f9ff', border:'#bae6fd' },
                { label:'إجمالي الغرامات',      value: totalFines > 0 ? this.formatFineAmount(totalFines) : '—', icon:'fas fa-coins', color:'#d97706', bg:'#fffbeb', border:'#fde68a' },
                { label:'هذا الشهر',            value:thisMonth,                                         icon:'fas fa-calendar-day',       color:'#8b5cf6', bg:'#f5f3ff', border:'#ddd6fe' },
            ];
            kpiEl.innerHTML = kpis.map(k => `
                <div style="background:${k.bg};border:1px solid ${k.border};border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;transition:all .2s;cursor:default;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,0.09)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
                    <div style="width:38px;height:38px;background:${k.color};border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="${k.icon}" style="color:#fff;font-size:15px;"></i>
                    </div>
                    <div>
                        <div style="font-size:1.2rem;font-weight:800;color:${k.color};line-height:1;">${k.value}</div>
                        <div style="font-size:0.68rem;color:#64748b;margin-top:2px;white-space:nowrap;">${k.label}</div>
                    </div>
                </div>`).join('');
        }

        // ── 6. تحميل Chart.js ──
        const loaded = await this._vEnsureChartJS();
        if (!loaded || typeof Chart === 'undefined') {
            root.insertAdjacentHTML('afterbegin', `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:10px;"><i class="fas fa-exclamation-triangle" style="color:#d97706;"></i><span style="font-size:0.85rem;color:#92400e;">تعذّر تحميل مكتبة الرسوم البيانية. البيانات الإجمالية متاحة في الأرقام أعلاه.</span></div>`);
            return;
        }

        // ── 7. الرسوم البيانية ──
        // الحالة
        const statusG = this._vGroupBy(viol, 'status');
        const statusColors = { 'محلول':'rgba(16,185,129,0.85)', 'غير محلول':'rgba(239,68,68,0.85)', 'قيد المراجعة':'rgba(245,158,11,0.85)' };
        this._vDrawDoughnut('viol-chart-status', statusG.labels, statusG.data, statusG.labels.map(l => statusColors[l] || 'rgba(148,163,184,0.8)'));

        // الشدة
        const sevG = this._vGroupBy(viol, 'severity');
        const sevColors = { 'عالية':'rgba(239,68,68,0.85)', 'متوسطة':'rgba(245,158,11,0.85)', 'منخفضة':'rgba(16,185,129,0.85)', 'منخضة':'rgba(16,185,129,0.85)' };
        this._vDrawDoughnut('viol-chart-sev', sevG.labels, sevG.data, sevG.labels.map(l => sevColors[l] || 'rgba(148,163,184,0.8)'));

        // الاتجاه الزمني
        this._vDrawTrend('viol-chart-trend', violByPeriod);

        // نوع المخالفة
        const typeG = this._vGroupBy(viol, 'violationType', 10);
        this._vDrawHBar('viol-chart-type', typeG.labels, typeG.data, 'rgba(220,38,38,0.75)');

        // الموقع
        const locG = this._vGroupBy(viol, 'violationLocation', 8);
        this._vDrawHBar('viol-chart-loc', locG.labels, locG.data, 'rgba(245,158,11,0.75)');

        // أكثر الموظفين مخالفة
        const empG = this._vGroupBy(empViol, 'employeeName', 10);
        this._vDrawHBar('viol-chart-emp', empG.labels, empG.data, 'rgba(99,102,241,0.75)');

        // أكثر المقاولين مخالفة
        const conG = this._vGroupBy(conViol, 'contractorName', 10);
        this._vDrawHBar('viol-chart-con', conG.labels, conG.data, 'rgba(249,115,22,0.75)');

        // الغرامات حسب النوع
        this._vDrawFinesByType('viol-chart-fines', viol);

        // ── 8. جدول المخالفات الحرجة ──
        const critViol = viol
            .filter(v => v.severity === 'عالية' && v.status !== 'محلول')
            .sort((a,b) => (b.fineAmount||0) - (a.fineAmount||0))
            .slice(0, 20);
        const critCountEl = document.getElementById('viol-critical-count');
        const tbody = document.getElementById('viol-critical-tbody');
        if (critCountEl) critCountEl.textContent = `${critViol.length} مخالفة`;
        if (tbody) {
            if (critViol.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" style="padding:24px;text-align:center;color:#10b981;"><i class="fas fa-check-circle ml-2"></i>لا توجد مخالفات حرجة غير محلولة</td></tr>`;
            } else {
                tbody.innerHTML = critViol.map((v,i) => {
                    const personName = Utils.escapeHTML(v.employeeName || v.contractorName || '—');
                    const personTypeLbl = v.personType === 'contractor' ? '<span style="background:#fff7ed;color:#c2410c;padding:2px 7px;border-radius:12px;font-size:0.7rem;font-weight:700;">مقاول</span>' : '<span style="background:#eef2ff;color:#4338ca;padding:2px 7px;border-radius:12px;font-size:0.7rem;font-weight:700;">موظف</span>';
                    const sevBadge = `<span style="background:#fef2f2;color:#b91c1c;padding:2px 7px;border-radius:12px;font-size:0.7rem;font-weight:700;">عالية</span>`;
                    const statusBadge = { 'غير محلول':'background:#fef3c7;color:#92400e;', 'قيد المراجعة':'background:#ede9fe;color:#5b21b6;' }[v.status] || 'background:#f1f5f9;color:#374151;';
                    const fine = Number(v.fineAmount)||0;
                    const rowBg = i%2===0 ? '#fff' : '#fafafa';
                    return `<tr style="border-bottom:1px solid #f8fafc;background:${rowBg};" onmouseover="this.style.background='#fff5f5'" onmouseout="this.style.background='${rowBg}'">
                        <td style="padding:9px 12px;white-space:nowrap;color:#374151;">${v.violationDate ? new Date(v.violationDate).toLocaleDateString('ar-SA',{year:'numeric',month:'short',day:'numeric'}) : '—'}</td>
                        <td style="padding:9px 12px;font-weight:600;color:#1e40af;">${personName}</td>
                        <td style="padding:9px 12px;">${personTypeLbl}</td>
                        <td style="padding:9px 12px;color:#374151;">${Utils.escapeHTML(v.violationType||'—')}</td>
                        <td style="padding:9px 12px;color:#374151;">${Utils.escapeHTML(v.violationLocation||'—')}</td>
                        <td style="padding:9px 12px;">${sevBadge}</td>
                        <td style="padding:9px 12px;"><span style="padding:2px 7px;border-radius:12px;font-size:0.7rem;font-weight:700;${statusBadge}">${Utils.escapeHTML(v.status||'—')}</span></td>
                        <td style="padding:9px 12px;text-align:center;font-weight:700;color:${fine>0?'#dc2626':'#94a3b8'};">${fine>0 ? this.formatFineAmount(fine) : '—'}</td>
                    </tr>`;
                }).join('');
            }
        }
    },

    // ── مساعد: تصفية بالفترة الزمنية ──
    _vFilterByPeriod(viol, days) {
        if (!days || days === 0) return viol;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        return viol.filter(v => {
            if (!v.violationDate) return true;
            const d = new Date(v.violationDate);
            return !isNaN(d.getTime()) && d >= cutoff;
        });
    },

    // ── مساعد: تجميع حسب حقل ──
    _vGroupBy(viol, field, limit = 0) {
        const map = {};
        viol.forEach(v => {
            const val = String(v[field] || 'غير محدد').trim() || 'غير محدد';
            map[val] = (map[val] || 0) + 1;
        });
        let entries = Object.entries(map).sort((a,b) => b[1]-a[1]);
        if (limit > 0) entries = entries.slice(0, limit);
        return { labels: entries.map(e=>e[0]), data: entries.map(e=>e[1]) };
    },

    // ── مساعد: تطبيق الفلاتر التفاعلية ──
    _vApplyFilters(viol) {
        const get = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
        const fPtype  = get('viol-af-ptype');
        const fType   = get('viol-af-type');
        const fSev    = get('viol-af-sev');
        const fStatus = get('viol-af-status');
        const fLoc    = get('viol-af-loc');
        const hasAny  = [fPtype,fType,fSev,fStatus,fLoc].some(v => v !== '');
        const badge = document.getElementById('viol-filter-badge');
        if (badge) badge.style.display = hasAny ? 'inline' : 'none';
        return viol.filter(v => {
            if (fPtype  && String(v.personType||'').trim()          !== fPtype)  return false;
            if (fType   && String(v.violationType||'').trim()        !== fType)   return false;
            if (fSev    && String(v.severity||'').trim()             !== fSev)    return false;
            if (fStatus && String(v.status||'').trim()               !== fStatus) return false;
            if (fLoc    && String(v.violationLocation||'').trim()    !== fLoc)    return false;
            return true;
        });
    },

    // ── مساعد: ملء قوائم الفلاتر ──
    _vPopulateFilters(viol) {
        const unique = fn => [...new Set(viol.map(fn).filter(Boolean))].sort();
        const fill = (id, values) => {
            const el = document.getElementById(id);
            if (!el) return;
            const cur = el.value;
            el.innerHTML = '<option value="">الكل</option>' + values.map(v => `<option value="${v}"${v===cur?' selected':''}>${v}</option>`).join('');
        };
        fill('viol-af-ptype',  [{ v:'employee', l:'موظف' }, { v:'contractor', l:'مقاول' }].map(x => x.v));
        // خيارات نوع الشخص بالعربية
        const ptypeEl = document.getElementById('viol-af-ptype');
        if (ptypeEl) {
            const cur = ptypeEl.value;
            ptypeEl.innerHTML = `<option value="">الكل</option><option value="employee"${cur==='employee'?' selected':''}>موظف</option><option value="contractor"${cur==='contractor'?' selected':''}>مقاول</option>`;
        }
        fill('viol-af-type',   unique(v => String(v.violationType||'').trim()));
        fill('viol-af-sev',    unique(v => String(v.severity||'').trim()));
        fill('viol-af-status', unique(v => String(v.status||'').trim()));
        fill('viol-af-loc',    unique(v => String(v.violationLocation||'').trim()));
    },

    // ── مساعد: رسم Doughnut ──
    _vDrawDoughnut(canvasId, labels, data, colors) {
        const canvas  = document.getElementById(canvasId);
        const emptyEl = document.getElementById(canvasId + '-empty');
        if (!canvas) return;
        if (!data.length || data.reduce((a,b)=>a+b,0) === 0) {
            canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';
        canvas.style.display = '';
        const total = data.reduce((a,b)=>a+b,0);
        if (!this._violCharts) this._violCharts = {};
        const prev = this._violCharts[canvasId];
        if (prev) { try { prev.destroy(); } catch(e){} }
        this._violCharts[canvasId] = new Chart(canvas, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors || this._vChartColors(data.length), borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '62%',
                plugins: {
                    legend: { position:'bottom', labels:{ padding:10, font:{size:11}, usePointStyle:true, boxWidth:9 } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} (${total>0?((ctx.parsed/total)*100).toFixed(1):0}%)` } }
                }
            }
        });
    },

    // ── مساعد: رسم HBar ──
    _vDrawHBar(canvasId, labels, data, color) {
        const canvas  = document.getElementById(canvasId);
        const emptyEl = document.getElementById(canvasId + '-empty');
        if (!canvas) return;
        if (!data.length || data.reduce((a,b)=>a+b,0) === 0) {
            canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';
        canvas.style.display = '';
        if (!this._violCharts) this._violCharts = {};
        const prev = this._violCharts[canvasId];
        if (prev) { try { prev.destroy(); } catch(e){} }
        this._violCharts[canvasId] = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [{ data, backgroundColor: color || 'rgba(220,38,38,0.75)', borderRadius: 5, borderSkipped: false }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend:{display:false}, tooltip:{ callbacks:{ label: ctx => ` ${ctx.parsed.x}` } } },
                scales: {
                    x: { beginAtZero:true, ticks:{ precision:0, font:{size:11} }, grid:{color:'#f1f5f9'} },
                    y: { ticks:{ font:{size:11}, callback: v => String(labels[v]).length>18 ? String(labels[v]).slice(0,17)+'…' : labels[v] } }
                }
            }
        });
    },

    // ── مساعد: رسم الاتجاه الزمني ──
    _vDrawTrend(canvasId, viol) {
        const canvas  = document.getElementById(canvasId);
        const emptyEl = document.getElementById(canvasId + '-empty');
        if (!canvas) return;
        const now = new Date();
        const arabicMonths = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
        const months = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ year:d.getFullYear(), month:d.getMonth(), label:`${arabicMonths[d.getMonth()]} ${d.getFullYear()}` });
        }
        const counts = months.map(m => viol.filter(v => {
            if (!v.violationDate) return false;
            const d = new Date(v.violationDate);
            return !isNaN(d.getTime()) && d.getFullYear()===m.year && d.getMonth()===m.month;
        }).length);
        if (counts.reduce((a,b)=>a+b,0) === 0) {
            canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';
        canvas.style.display = '';
        if (!this._violCharts) this._violCharts = {};
        const prev = this._violCharts[canvasId];
        if (prev) { try { prev.destroy(); } catch(e){} }
        this._violCharts[canvasId] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: months.map(m=>m.label),
                datasets: [
                    { label:'عدد المخالفات', data:counts, backgroundColor: counts.map(c => c===Math.max(...counts) ? 'rgba(220,38,38,0.85)' : 'rgba(220,38,38,0.5)'), borderRadius:6, borderSkipped:false, order:1 },
                    { label:'الاتجاه', data:counts, type:'line', borderColor:'rgba(139,92,246,0.9)', backgroundColor:'rgba(139,92,246,0.08)', borderWidth:2.5, pointRadius:4, pointBackgroundColor:'#8b5cf6', tension:0.4, fill:true, order:0 }
                ]
            },
            options: {
                responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{position:'top',labels:{usePointStyle:true,font:{size:11}}}, tooltip:{mode:'index',intersect:false} },
                scales:{ x:{grid:{display:false},ticks:{font:{size:10},maxRotation:45}}, y:{beginAtZero:true,ticks:{precision:0,font:{size:11}},grid:{color:'#f8fafc'}} }
            }
        });
    },

    // ── مساعد: رسم الغرامات حسب النوع ──
    _vDrawFinesByType(canvasId, viol) {
        const canvas  = document.getElementById(canvasId);
        const emptyEl = document.getElementById(canvasId + '-empty');
        if (!canvas) return;
        const withFines = viol.filter(v => (Number(v.fineAmount)||0) > 0);
        if (!withFines.length) {
            canvas.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';
        canvas.style.display = '';
        const map = {};
        withFines.forEach(v => {
            const t = String(v.violationType||'غير محدد').trim();
            map[t] = (map[t]||0) + (Number(v.fineAmount)||0);
        });
        const entries = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,10);
        const labels  = entries.map(e=>e[0]);
        // ✅ تحويل القيم إلى العملة المختارة (EGP افتراضي أو USD)
        const currency = this.getCurrentCurrency();
        const currencyLabel = this.getCurrencyLabel('long');
        const data = entries.map(e => {
            const converted = this.convertFineAmount(e[1], currency);
            // الجنيه: تقريب لأقرب عدد صحيح. الدولار: منزلتان عشريتان
            return currency === 'USD' ? Number(converted.toFixed(2)) : Math.round(converted);
        });
        if (!this._violCharts) this._violCharts = {};
        const prev = this._violCharts[canvasId];
        if (prev) { try { prev.destroy(); } catch(e){} }
        // ✅ تنسيق tooltip حسب العملة (بدون كسور للجنيه، حتى منزلتين للدولار)
        const fmt = (v) => currency === 'USD'
            ? v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
            : v.toLocaleString('ar-EG', { maximumFractionDigits: 0 });
        this._violCharts[canvasId] = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [{ data, backgroundColor: 'rgba(217,119,6,0.75)', borderRadius:5, borderSkipped:false }] },
            options: {
                indexAxis:'y', responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: ctx => ` ${fmt(ctx.parsed.x)} ${currencyLabel}` } } },
                scales:{
                    x:{ beginAtZero:true, ticks:{ font:{size:11}, callback: v => fmt(v) }, grid:{color:'#f1f5f9'}, title:{display:true,text:`الغرامة الإجمالية (${currencyLabel})`,font:{size:11}} },
                    y:{ ticks:{ font:{size:11}, callback: v => String(labels[v]).length>18 ? String(labels[v]).slice(0,17)+'…' : labels[v] } }
                }
            }
        });
    },

    // ── مساعد: تحميل Chart.js ──
    async _vEnsureChartJS() {
        if (typeof Chart !== 'undefined') return true;
        const ex = document.querySelector('script[src*="chart.js"],script[src*="chartjs"]');
        if (ex) {
            return new Promise(resolve => {
                const t = setInterval(() => { if (typeof Chart !== 'undefined') { clearInterval(t); resolve(true); } }, 100);
                setTimeout(() => { clearInterval(t); resolve(false); }, 5000);
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

    // ── مساعد: ألوان احترافية ──
    _vChartColors(n) {
        const palette = ['rgba(220,38,38,0.8)','rgba(245,158,11,0.8)','rgba(16,185,129,0.8)','rgba(99,102,241,0.8)','rgba(249,115,22,0.8)','rgba(139,92,246,0.8)','rgba(59,130,246,0.8)','rgba(236,72,153,0.8)','rgba(20,184,166,0.8)','rgba(168,85,247,0.8)'];
        return Array.from({length:n}, (_,i) => palette[i % palette.length]);
    },

    // ── تصدير لوحة المخالفات PDF ──
    async _vExportPDF() {
        const root = document.getElementById('viol-analytics-root');
        if (!root) return;
        const btn = document.getElementById('viol-export-pdf-btn');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
        try {
            const loadLib = (src, check) => new Promise((res,rej) => {
                if (check()) return res();
                const s = document.createElement('script');
                s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('Failed: '+src));
                document.head.appendChild(s);
            });
            await loadLib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', () => typeof html2canvas !== 'undefined');
            await loadLib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', () => typeof window.jspdf !== 'undefined');

            const filterPanel = document.getElementById('viol-filter-panel');
            const wasVisible  = filterPanel && filterPanel.style.display !== 'none';
            if (wasVisible) filterPanel.style.display = 'none';

            const canvas = await html2canvas(root, { scale:1.8, useCORS:true, backgroundColor:'#f8fafc', scrollX:0, scrollY:-window.scrollY, logging:false });
            if (wasVisible) filterPanel.style.display = '';

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
            const pdfW = pdf.internal.pageSize.getWidth();
            const pdfH = pdf.internal.pageSize.getHeight();
            const margin = 10;
            const contentW = pdfW - margin * 2;
            const ratio = contentW / canvas.width;
            const pageContentH = pdfH - 14 - margin;
            const pageHeightPx = pageContentH / ratio;
            const totalPages   = Math.ceil(canvas.height / pageHeightPx);

            for (let p = 0; p < totalPages; p++) {
                if (p > 0) pdf.addPage();
                // ترويسة
                pdf.setFillColor(127,29,29);
                pdf.rect(0,0,pdfW,14,'F');
                pdf.setTextColor(255,255,255);
                pdf.setFontSize(9);
                pdf.text('Violations Analysis Report', margin, 9, {align:'left'});
                pdf.text(`${new Date().toLocaleDateString('ar-SA')}  |  ${p+1}/${totalPages}`, pdfW-margin, 9, {align:'right'});
                pdf.setTextColor(0,0,0);
                // قص الشريحة
                const sliceCanvas = document.createElement('canvas');
                const sliceH = Math.min(pageHeightPx, canvas.height - p*pageHeightPx);
                sliceCanvas.width = canvas.width; sliceCanvas.height = sliceH;
                sliceCanvas.getContext('2d').drawImage(canvas, 0, p*pageHeightPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
                pdf.addImage(sliceCanvas.toDataURL('image/jpeg',0.90), 'JPEG', margin, 14, contentW, sliceH*ratio);
            }
            pdf.save(`تقرير-المخالفات-${new Date().toISOString().slice(0,10)}.pdf`);
            if (typeof Notification !== 'undefined' && Notification.success) Notification.success('تم تصدير تقرير المخالفات PDF بنجاح');
        } catch(err) {
            console.error('PDF export error:', err);
            if (typeof Notification !== 'undefined' && Notification.error) Notification.error('تعذّر تصدير PDF — تأكد من الاتصال بالإنترنت');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
        }
    },

    // ── ربط أحداث لوحة التحليل ──
    _vBindAnalyticsEvents() {
        const root = document.getElementById('viol-analytics-root');
        if (!root) return;

        // أزرار الفترة
        root.querySelectorAll('.viol-period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._violPeriod = btn.getAttribute('data-period');
                root.querySelectorAll('.viol-period-btn').forEach(b => {
                    const active = b === btn;
                    b.style.background = active ? '#fff' : 'rgba(255,255,255,0.15)';
                    b.style.color      = active ? '#991b1b' : '#fff';
                });
                this.updateViolationAnalytics();
            });
        });

        // زر تحديث
        const refreshBtn = document.getElementById('viol-analytics-refresh');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.updateViolationAnalytics());

        // زر تصدير PDF
        const pdfBtn = document.getElementById('viol-export-pdf-btn');
        if (pdfBtn) pdfBtn.addEventListener('click', () => this._vExportPDF());

        // زر تبديل لوحة الفلاتر
        const toggleBtn  = document.getElementById('viol-toggle-filters-btn');
        const filterPanel = document.getElementById('viol-filter-panel');
        if (toggleBtn && filterPanel) {
            toggleBtn.addEventListener('click', () => {
                const isOpen = filterPanel.style.display !== 'none';
                filterPanel.style.display = isOpen ? 'none' : 'block';
                toggleBtn.style.background = isOpen ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.35)';
            });
        }

        // زر إعادة تعيين الفلاتر
        const resetBtn = document.getElementById('viol-filter-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                ['viol-af-ptype','viol-af-type','viol-af-sev','viol-af-status','viol-af-loc'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                this.updateViolationAnalytics();
            });
        }

        // قوائم الفلاتر
        ['viol-af-ptype','viol-af-type','viol-af-sev','viol-af-status','viol-af-loc'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => this.updateViolationAnalytics());
        });

        // ✅ أزرار تبديل العملة (EGP / USD)
        root.querySelectorAll('.viol-curr-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const newCurr = btn.getAttribute('data-curr');
                this.setCurrentCurrency(newCurr);
                // تحديث الأنماط البصرية فوراً
                root.querySelectorAll('.viol-curr-btn').forEach(b => {
                    const active = b.getAttribute('data-curr') === newCurr;
                    b.style.background = active ? '#fff' : 'transparent';
                    b.style.color = active ? '#991b1b' : '#fff';
                });
                // إعادة رسم التحليلات بالعملة الجديدة
                this.updateViolationAnalytics();
            });
        });

        // ✅ زر تعديل سعر الصرف
        const rateBtn = document.getElementById('viol-curr-rate-btn');
        if (rateBtn) {
            rateBtn.addEventListener('click', () => {
                const current = this.getExchangeRate();
                const input = window.prompt(
                    `أدخل سعر صرف الدولار (كم جنيه مصري يساوي 1 دولار أمريكي):\n\nالسعر الحالي: ${current} جنيه = 1 دولار`,
                    String(current)
                );
                if (input === null) return; // إلغاء
                const newRate = parseFloat(String(input).trim());
                if (!Number.isFinite(newRate) || newRate <= 0) {
                    if (typeof Notification !== 'undefined' && Notification.error) {
                        Notification.error('سعر صرف غير صالح');
                    } else {
                        alert('سعر صرف غير صالح');
                    }
                    return;
                }
                this.setExchangeRate(newRate);
                if (typeof Notification !== 'undefined' && Notification.success) {
                    Notification.success(`تم تحديث سعر الصرف إلى ${newRate} جنيه = 1 دولار`);
                }
                this.updateViolationAnalytics();
            });
        }
    },

    /**
     * تحميل قائمة المقاولين في select element
     * @param {HTMLElement} selectElement - عنصر select المراد تحميل المقاولين فيه
     * @param {string} selectedValue - القيمة المحددة مسبقاً (اسم المقاول)
     * @param {string} selectedContractorId - معرف المقاول المحدد مسبقاً
     */
    loadContractorsIntoSelect(selectElement, selectedValue = '', selectedContractorId = '') {
        if (!selectElement || selectElement.tagName !== 'SELECT') {
            Utils.safeWarn('⚠️ loadContractorsIntoSelect: عنصر select غير صالح');
            return;
        }

        // ✅ مصدر موحّد: استخدام Contractors مباشرة (بدون الاعتماد على Clinic)
        if (typeof Contractors !== 'undefined' && typeof Contractors.populateContractorSelect === 'function') {
            Contractors.populateContractorSelect(selectElement, {
                placeholder: '-- اختر المقاول --',
                selectedValue,
                selectedContractorId,
                valueMode: 'name', // نموذج المخالفة يحفظ الاسم + contractorId في dataset
                showServiceType: true,
                includeSuppliers: true,
                approvedOnly: false // ✅ إصلاح: تضمين جميع المقاولين (بما فيهم غير المعتمدين)
            });
            return;
        }

        // بديل محسّن: تحميل جميع المقاولين من AppState
        let contractors = [];

        // محاولة استخدام الدالة المساعدة الجديدة أولاً
        if (typeof Contractors !== 'undefined' && typeof Contractors.getAllContractorsForModules === 'function') {
            try {
                const allContractors = Contractors.getAllContractorsForModules();
                if (allContractors && allContractors.length > 0) {
                    const contractorMap = new Map(); // لإزالة التكرار
                    allContractors.forEach(contractor => {
                        const name = (contractor.name || '').trim();
                        if (!name || name === 'غير معروف') return;

                        // ✅ إصلاح: إزالة التكرار بشكل صحيح (code → id → name)
                        const code = ((contractor.code || contractor.isoCode || '') + '').trim().toUpperCase();
                        const lic = ((contractor.licenseNumber || '') + '').trim();
                        const key = (/^CON-\d+$/i.test(code) ? `CODE:${code}` : (lic ? `LIC:${lic}` : (contractor.id ? `ID:${contractor.id}` : `NAME:${name.toLowerCase()}`)));

                        if (!contractorMap.has(key)) {
                            contractorMap.set(key, {
                                id: contractor.id || '',
                                name: name,
                                serviceType: (contractor.serviceType || '').trim(),
                                licenseNumber: (contractor.licenseNumber || '').trim()
                            });
                        }
                    });
                    contractors = Array.from(contractorMap.values())
                        .sort((a, b) => {
                            const nameA = a.name.toLowerCase();
                            const nameB = b.name.toLowerCase();
                            return nameA.localeCompare(nameB, 'ar', { sensitivity: 'base' });
                        });
                }
            } catch (error) {
                Utils.safeWarn('⚠️ خطأ في الحصول على المقاولين من getAllContractorsForModules:', error);
            }
        }

        // بديل: استخدام getApprovedOptions
        if (contractors.length === 0 && typeof Contractors !== 'undefined' && typeof Contractors.getApprovedOptions === 'function') {
            try {
                const approved = Contractors.getApprovedOptions(false);
                if (approved && approved.length > 0) {
                    contractors = approved.map(item => ({
                        id: item.id || item.contractorId || '',
                        name: (item.name || '').trim(),
                        serviceType: (item.serviceType || '').trim(),
                        licenseNumber: (item.licenseNumber || '').trim()
                    })).filter(c => c.name); // تصفية المقاولين بدون أسماء
                }
            } catch (error) {
                Utils.safeWarn('⚠️ خطأ في الحصول على المقاولين المعتمدة:', error);
            }
        }

        // ✅ إذا لم توجد مقاولين، استخدم المقاولين المعتمدين النشطين من AppState
        if (contractors.length === 0) {
            const allContractors = AppState.appData.approvedContractors || [];
            const contractorMap = new Map(); // لإزالة التكرار

            allContractors
                .filter(c => c && (c.companyName || c.name) && c.isActive !== 'inactive' && c.isActive !== false && c.isActive !== 'false' && c.isActive !== 'FALSE') // تصفية غير النشطين
                .forEach(contractor => {
                    const name = (contractor.companyName || contractor.name || '').trim();
                    if (!name || name === 'غير معروف') return;

                    // إزالة التكرار بناءً على الاسم
                    if (!contractorMap.has(name)) {
                        contractorMap.set(name, {
                            id: contractor.id || '',
                            name: name,
                            serviceType: (contractor.serviceType || '').trim(),
                            licenseNumber: (contractor.licenseNumber || contractor.contractNumber || '').trim()
                        });
                    }
                });

            contractors = Array.from(contractorMap.values())
                .sort((a, b) => {
                    const nameA = a.name.toLowerCase();
                    const nameB = b.name.toLowerCase();
                    return nameA.localeCompare(nameB, 'ar', { sensitivity: 'base' });
                });
        }

        // مسح الخيارات الحالية
        selectElement.innerHTML = '<option value="">-- اختر المقاول --</option>';

        // استخدام DocumentFragment لتحسين الأداء
        const fragment = document.createDocumentFragment();
        let selectedOption = null;

        // إضافة المقاولين
        contractors.forEach(contractor => {
            if (!contractor || !contractor.name) return;

            const option = document.createElement('option');
            option.value = contractor.name; // القيمة الأصلية للاستخدام في value
            option.textContent = contractor.name; // textContent آمن تلقائياً من XSS
            if (contractor.serviceType) {
                option.textContent += ` - ${contractor.serviceType}`;
            }
            option.dataset.contractorId = contractor.id || '';

            // تحديد القيمة المحددة مسبقاً
            if (selectedValue && contractor.name === selectedValue) {
                option.selected = true;
                selectedOption = option;
            } else if (selectedContractorId && contractor.id === selectedContractorId) {
                option.selected = true;
                selectedOption = option;
            }

            fragment.appendChild(option);
        });

        selectElement.appendChild(fragment);

        // إذا لم يتم العثور على القيمة المحددة، حاول تعيينها يدوياً
        if (selectedValue && !selectedOption && selectElement.value !== selectedValue) {
            try {
                selectElement.value = selectedValue;
            } catch (e) {
                // القيمة غير موجودة في القائمة
                Utils.safeWarn('⚠️ المقاول المحدد غير موجود في القائمة:', selectedValue);
            }
        }
    },

    async showViolationForm(violationDataOrId = null) {
        // دعم تمرير ID أو كائن كامل
        let violationData = null;
        if (typeof violationDataOrId === 'string') {
            // إذا تم تمرير ID، نبحث عن البيانات
            violationData = AppState.appData.violations?.find(v => v.id === violationDataOrId) || null;
        } else if (typeof violationDataOrId === 'object') {
            violationData = violationDataOrId;
        }
        violationData = this.normalizeViolationRecord(violationData);
        const effectiveFineForForm = violationData ? this.getEffectiveFineAmount(violationData) : 0;
        const isEdit = !!violationData;
        const recordPersonType = String(violationData?.personType || '').trim().toLowerCase();
        const isContractorRecord = recordPersonType === 'contractor' || (!!violationData?.contractorName && !violationData?.employeeName);
        const isEmployeeRecord = !isContractorRecord;
        const selectedLocationValue = String(violationData?.violationLocationId || violationData?.violationLocation || '').trim();
        const selectedPlaceValue = String(violationData?.violationPlaceId || violationData?.violationPlace || '').trim();

        // التحقق من وجود ViolationTypesManager
        let violationTypes = [];
        if (typeof ViolationTypesManager !== 'undefined' && ViolationTypesManager.ensureInitialized && ViolationTypesManager.getAll) {
            try {
                ViolationTypesManager.ensureInitialized();
                violationTypes = ViolationTypesManager.getAll();
            } catch (vtError) {
                Utils.safeWarn('⚠️ خطأ في الحصول على أنواع المخالفات:', vtError);
                violationTypes = AppState?.appData?.violationTypes || [];
            }
        } else {
            violationTypes = AppState?.appData?.violationTypes || [];
        }
        const selectedTypeId = violationData?.violationTypeId || '';
        const selectedTypeName = (violationData?.violationType || '').trim();
        const currentUserRole = (AppState?.currentUser?.role || '').toString().trim().toLowerCase();
        const canManagerEditFineAmount = ['admin', 'manager', 'مدير', 'مدير النظام', 'system-manager', 'system_admin'].includes(currentUserRole);
        const typeOptions = violationTypes.map(type => {
            const isSelected = selectedTypeId
                ? type.id === selectedTypeId
                : type.name === selectedTypeName;
            const typeFineAmount = Number(type?.fineAmount || 0);
            return `
                <option value="${Utils.escapeHTML(type.name)}" data-type-id="${Utils.escapeHTML(type.id)}" data-fine-amount="${typeFineAmount}" ${isSelected ? 'selected' : ''}>
                    ${Utils.escapeHTML(type.name)}
                </option>
            `;
        }).join('');
        const hasSelectedType = violationTypes.some(type => selectedTypeId
            ? type.id === selectedTypeId
            : type.name === selectedTypeName);
        const legacyTypeOption = !hasSelectedType && selectedTypeName
            ? `
                <option value="${Utils.escapeHTML(selectedTypeName)}" data-type-id="${Utils.escapeHTML(selectedTypeId)}" data-fine-amount="${Number(effectiveFineForForm)}" selected>
                    ${Utils.escapeHTML(selectedTypeName)} (غير معرف)
                </option>
            `
            : '';
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-exclamation-triangle ml-2 text-yellow-600"></i>
                        ${isEdit ? 'تعديل مخالفة' : 'تسجيل مخالفة جديدة'}
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" title="إغلاق">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <!-- ✅ شريط تنبيه داخل النموذج (يظهر أعلى الحقول) -->
                    <div id="violation-form-banner" class="hidden mb-4 rounded-lg border p-3 flex items-start gap-2.5" role="alert" style="font-size: 0.9rem;">
                        <i id="violation-form-banner-icon" class="fas fa-circle-info text-lg mt-0.5"></i>
                        <div class="flex-1 min-w-0">
                            <div id="violation-form-banner-title" class="font-bold mb-0.5"></div>
                            <div id="violation-form-banner-text" class="leading-relaxed"></div>
                        </div>
                        <button type="button" id="violation-form-banner-close" class="text-gray-400 hover:text-gray-700 ms-2" title="إخفاء">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <form id="violation-form" class="space-y-4">
                        <!-- الصف الأول: نوع المخالفة والكود الوظيفي -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-user-tag ml-2 text-blue-600"></i>
                                    نوع الشخص *
                                </label>
                                <select id="violation-person-type" required class="form-input">
                                    <option value="">اختر النوع</option>
                                    <option value="employee" ${isEmployeeRecord ? 'selected' : ''}>موظف</option>
                                    <option value="contractor" ${isContractorRecord ? 'selected' : ''}>مقاول</option>
                                </select>
                            </div>
                            <div id="violation-employee-code-container" style="display: ${isEmployeeRecord ? 'block' : 'none'};">
                                <label for="violation-employee-code" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-id-card ml-2"></i>
                                    الكود الوظيفي المخالف *
                                </label>
                                <input type="text" id="violation-employee-code" class="form-input"
                                    value="${violationData?.employeeCode || violationData?.employeeNumber || ''}" 
                                    placeholder="أدخل الكود الوظيفي (سيتم تعبئة البيانات تلقائياً)"
                                    ${isEmployeeRecord ? 'required' : ''}>
                            </div>
                        </div>
                        
                        <!-- الصف الثاني: اسم الموظف والوظيفة -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label for="violation-person-name" class="block text-sm font-semibold text-gray-700 mb-2" id="violation-person-name-label">اسم المخالف *</label>
                                <input type="text" id="violation-person-name" required class="form-input"
                                    value="${violationData?.employeeName || violationData?.contractorName || ''}" 
                                    placeholder="${isEmployeeRecord ? 'سيتم التعبئة تلقائياً' : 'اسم المقاول'}"
                                    ${isEmployeeRecord ? 'readonly' : ''}
                                    style="display: ${isContractorRecord ? 'none' : 'block'};">
                                <label for="violation-contractor-select" class="block text-sm font-semibold text-gray-700 mb-2" style="display: ${isContractorRecord ? 'block' : 'none'};">المقاول *</label>
                                <select id="violation-contractor-select" class="form-input"
                                    style="display: ${isContractorRecord ? 'block' : 'none'};"
                                    ${isContractorRecord ? 'required' : ''}>
                                    <option value="">-- اختر المقاول --</option>
                                </select>
                            </div>
                            <div id="violation-employee-position-container" style="display: ${isEmployeeRecord ? 'block' : 'none'};">
                                <label for="violation-employee-position" class="block text-sm font-semibold text-gray-700 mb-2">الوظيفة</label>
                                <input type="text" id="violation-employee-position" class="form-input"
                                    value="${violationData?.employeePosition || ''}" 
                                    placeholder="سيتم التعبئة تلقائياً" readonly>
                            </div>
                        </div>
                        
                        <!-- الصف الثالث: الإدارة وتاريخ المخالفة -->
                        <div class="grid grid-cols-2 gap-4">
                            <div id="violation-employee-department-container" style="display: ${isEmployeeRecord ? 'block' : 'none'};">
                                <label for="violation-employee-department" class="block text-sm font-semibold text-gray-700 mb-2">الإدارة</label>
                                <input type="text" id="violation-employee-department" class="form-input"
                                    value="${violationData?.employeeDepartment || ''}" 
                                    placeholder="سيتم التعبئة تلقائياً" readonly>
                            </div>
                            <div>
                                <label for="violation-date" class="block text-sm font-semibold text-gray-700 mb-2">تاريخ المخالفة *</label>
                                <input type="date" id="violation-date" required class="form-input"
                                    value="${violationData?.violationDate ? new Date(violationData.violationDate).toISOString().slice(0, 10) : ''}">
                            </div>
                        </div>
                        <div id="violation-sequence-info" class="hidden mb-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
                            <i class="fas fa-layer-group ml-2 text-amber-700"></i><span id="violation-sequence-text"></span>
                        </div>
                        
                        <!-- الصف الرابع: وقت المخالفة ونوع المخالفة -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label for="violation-time" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-clock ml-2 text-purple-600"></i>
                                    وقت المخالفة *
                                </label>
                                <input type="time" id="violation-time" required class="form-input"
                                    value="${violationData?.violationTime || ''}">
                            </div>
                            <div>
                                <label for="violation-type" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-exclamation-circle ml-2 text-red-600"></i>
                                    نوع المخالفة *
                                </label>
                                <select id="violation-type" required class="form-input">
                                    <option value="">اختر النوع</option>
                                    ${legacyTypeOption}
                                    ${typeOptions}
                                </select>
                            </div>
                            <div>
                                <label for="violation-fine-amount" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-money-bill-wave ml-2 text-green-600"></i>
                                    القيمة المالية (ج.م)
                                </label>
                                <input type="number" id="violation-fine-amount" class="form-input" min="0" step="1"
                                    value="${Number(effectiveFineForForm)}"
                                    placeholder="القيمة المالية">
                                <p class="text-xs text-gray-500 mt-1">
                                    ${canManagerEditFineAmount ? 'يتم التحديد تلقائياً ويمكنك التعديل لأنك مدير.' : 'يتم التحديد تلقائياً حسب نوع المخالفة، والتعديل متاح للمدير فقط.'}
                                </p>
                            </div>
                        </div>
                        <!-- حقول المقاول (تظهر فقط عند اختيار مقاول) -->
                        <div id="violation-contractor-fields-container" style="display: ${isContractorRecord ? 'block' : 'none'};">
                            <div class="grid grid-cols-2 gap-4">
                                <div id="violation-contractor-worker-container">
                                    <label for="violation-contractor-worker" class="block text-sm font-semibold text-gray-700 mb-2">اسم العامل التابع للمقاول</label>
                                    <input type="text" id="violation-contractor-worker" class="form-input"
                                        value="${violationData?.contractorWorker || ''}" 
                                        placeholder="اسم العامل">
                                </div>
                                <div id="violation-contractor-position-container">
                                    <label for="violation-contractor-position" class="block text-sm font-semibold text-gray-700 mb-2">الوظيفة</label>
                                    <input type="text" id="violation-contractor-position" class="form-input"
                                        value="${violationData?.contractorPosition || ''}" 
                                        placeholder="وظيفة العامل">
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-4 mt-4">
                                <div id="violation-contractor-department-container">
                                    <label for="violation-contractor-department" class="block text-sm font-semibold text-gray-700 mb-2">الإدارة</label>
                                    <input type="text" id="violation-contractor-department" class="form-input"
                                        value="${violationData?.contractorDepartment || ''}" 
                                        placeholder="الإدارة التابعة له">
                            </div>
                            <div>
                                    <label for="violation-contractor-location" class="block text-sm font-semibold text-gray-700 mb-2">الموقع *</label>
                                    <select id="violation-contractor-location" required class="form-input">
                                        <option value="">-- اختر الموقع --</option>
                                    </select>
                            </div>
                            </div>
                            <div class="grid grid-cols-2 gap-4 mt-4">
                                <div>
                                    <label for="violation-contractor-place" class="block text-sm font-semibold text-gray-700 mb-2">مكان المخالفة *</label>
                                    <select id="violation-contractor-place" required class="form-input">
                                        <option value="">-- اختر مكان المخالفة --</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <!-- حقول الموقع ومكان المخالفة (للموظف) -->
                        <div id="violation-location-fields-container" style="display: ${isEmployeeRecord ? 'block' : 'none'};">
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label for="violation-employee-location" class="block text-sm font-semibold text-gray-700 mb-2">الموقع *</label>
                                    <select id="violation-employee-location" required class="form-input">
                                        <option value="">-- اختر الموقع --</option>
                                    </select>
                                </div>
                                <div>
                                    <label for="violation-employee-place" class="block text-sm font-semibold text-gray-700 mb-2">مكان المخالفة *</label>
                                    <select id="violation-employee-place" required class="form-input">
                                        <option value="">-- اختر مكان المخالفة --</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <!-- الصف الخامس: الشدة والحالة -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-signal ml-2 text-orange-600"></i>
                                    الشدة *
                                </label>
                                <select id="violation-severity" required class="form-input">
                                    <option value="">اختر الشدة</option>
                                    <option value="عالية" ${violationData?.severity === 'عالية' ? 'selected' : ''}>عالية</option>
                                    <option value="متوسطة" ${violationData?.severity === 'متوسطة' ? 'selected' : ''}>متوسطة</option>
                                    <option value="منخضة" ${violationData?.severity === 'منخضة' ? 'selected' : ''}>منخضة</option>
                                </select>
                            </div>
                            <div>
                                <label for="violation-status" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-info-circle ml-2 text-blue-600"></i>
                                    الحالة *
                                </label>
                                <select id="violation-status" required class="form-input">
                                    <option value="">اختر الحالة</option>
                                    <option value="قيد المراجعة" ${violationData?.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
                                    <option value="محلول" ${violationData?.status === 'محلول' ? 'selected' : ''}>محلول</option>
                                    <option value="غير محلول" ${violationData?.status === 'غير محلول' ? 'selected' : ''}>غير محلول</option>
                                </select>
                            </div>
                        </div>
                        
                        <!-- الصورة وتفاصيل المخالفة والإجراء المتخذ -->
                            <div class="col-span-2">
                                <label for="violation-photo-input" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-image ml-2"></i>
                                    صورة المخالفة (غير إلزامي)
                                </label>
                                <input type="file" id="violation-photo-input" accept="image/*" class="form-input">
                                <div id="violation-photo-preview" class="mt-2 ${violationData?.photo ? '' : 'hidden'}">
                                    <img src="${violationData?.photo || ''}" alt="صورة المخالفة" class="w-48 h-48 object-cover rounded border" id="violation-photo-img">
                                <button type="button" onclick="const photoInput = document.getElementById('violation-photo-input'); if (photoInput) photoInput.value=''; const photoPreview = document.getElementById('violation-photo-preview'); if (photoPreview) photoPreview.classList.add('hidden');" class="mt-1 text-xs text-red-600">حذف الصورة</button>
                                </div>
                            </div>
                            <div class="col-span-2">
                                <label for="violation-details" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-file-alt ml-2 text-amber-600"></i>
                                    تفاصيل المخالفة
                                </label>
                                <textarea id="violation-details" class="form-input" rows="3"
                                    placeholder="اكتب تفاصيل المخالفة ووصفها الكامل...">${violationData?.violationDetails || ''}</textarea>
                            </div>
                            <div class="col-span-2">
                                <label for="violation-action" class="block text-sm font-semibold text-gray-700 mb-2">
                                    <i class="fas fa-tasks ml-2 text-indigo-600"></i>
                                    الإجراء المتخذ
                                </label>
                                <textarea id="violation-action" class="form-input" rows="3"
                                    placeholder="وصف الإجراء المتخذ بشأن المخالفة...">${violationData?.actionTaken || ''}</textarea>
                            </div>
                        </div>
                        <div class="flex items-center justify-end gap-4 pt-4 border-t">
                            <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                                <i class="fas fa-times ml-2"></i>إلغاء
                            </button>
                            <button type="submit" id="violation-submit-btn" class="btn-primary">
                                <i class="fas fa-save ml-2"></i>${isEdit ? 'حفظ التعديلات' : 'تسجيل المخالفة'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Setup employee autocomplete for employee type
        const personTypeSelect = document.getElementById('violation-person-type');
        const employeeCodeContainer = document.getElementById('violation-employee-code-container');
        const employeeCodeInput = document.getElementById('violation-employee-code');
        const personNameInput = document.getElementById('violation-person-name');
        const personNameLabel = document.getElementById('violation-person-name-label');

        const contractorSelect = document.getElementById('violation-contractor-select');

        // تحميل قائمة المقاولين في القائمة المنسدلة
        if (contractorSelect) {
            const currentValue = violationData?.contractorName || '';
            const currentContractorId = violationData?.contractorId || '';
            this.loadContractorsIntoSelect(contractorSelect, currentValue, currentContractorId);
        }

        // الحصول على عناصر الحقول
        const employeePositionContainer = document.getElementById('violation-employee-position-container');
        const employeeDepartmentContainer = document.getElementById('violation-employee-department-container');
        const employeePositionInput = document.getElementById('violation-employee-position');
        const employeeDepartmentInput = document.getElementById('violation-employee-department');

        const contractorFieldsContainer = document.getElementById('violation-contractor-fields-container');
        const contractorWorkerContainer = document.getElementById('violation-contractor-worker-container');
        const contractorPositionContainer = document.getElementById('violation-contractor-position-container');
        const contractorDepartmentContainer = document.getElementById('violation-contractor-department-container');
        const contractorWorkerInput = document.getElementById('violation-contractor-worker');
        const contractorPositionInput = document.getElementById('violation-contractor-position');
        const contractorDepartmentInput = document.getElementById('violation-contractor-department');

        const locationFieldsContainer = document.getElementById('violation-location-fields-container');
        const violationTypeSelect = document.getElementById('violation-type');
        const fineAmountInput = document.getElementById('violation-fine-amount');
        const typeById = new Map((violationTypes || []).map(type => [String(type.id || '').trim(), type]));
        const typeByName = new Map((violationTypes || []).map(type => [String(type.name || '').trim().toLowerCase(), type]));

        const getDefaultFineAmountForSelectedType = () => {
            const selectedOption = violationTypeSelect?.selectedOptions?.[0];
            const typeId = selectedOption?.getAttribute('data-type-id') || '';
            const typeName = (violationTypeSelect?.value || '').trim().toLowerCase();
            const type = (typeId && typeById.get(typeId)) || (typeName && typeByName.get(typeName)) || null;
            const optionFine = Number(selectedOption?.getAttribute('data-fine-amount') || 0);
            const mappedFine = Number(type?.fineAmount ?? optionFine ?? 0);
            return Number.isFinite(mappedFine) && mappedFine >= 0 ? mappedFine : 0;
        };

        const applyFineAmountFromType = ({ force = false } = {}) => {
            if (!fineAmountInput) return;
            const defaultFineAmount = getDefaultFineAmountForSelectedType();
            if (force || !canManagerEditFineAmount || fineAmountInput.value === '') {
                fineAmountInput.value = String(defaultFineAmount);
            }
        };

        if (fineAmountInput) {
            fineAmountInput.readOnly = !canManagerEditFineAmount;
        }
        if (violationTypeSelect) {
            violationTypeSelect.addEventListener('change', () => applyFineAmountFromType({ force: true }));
            // دعم تحديث فوري إضافي على بعض المتصفحات التي تُطلق input أثناء التنقل
            violationTypeSelect.addEventListener('input', () => applyFineAmountFromType({ force: true }));
        }
        if (fineAmountInput && canManagerEditFineAmount && violationData && violationData.fineAmount !== undefined && violationData.fineAmount !== null) {
            fineAmountInput.value = String(Number(effectiveFineForForm));
        } else {
            applyFineAmountFromType({ force: true });
        }

        personTypeSelect.addEventListener('change', (e) => {
            const personType = e.target.value;
            if (personType === 'employee') {
                // إظهار حقل الكود الوظيفي
                employeeCodeContainer.style.display = 'block';
                employeeCodeInput.required = true;
                employeeCodeInput.placeholder = 'أدخل الكود الوظيفي (سيتم تعبئة البيانات تلقائياً)';

                // إظهار حقل الاسم وإخفاء قائمة المقاولين
                personNameInput.style.display = 'block';
                personNameInput.readOnly = true;
                personNameInput.placeholder = 'سيتم التعبئة تلقائياً';
                personNameInput.value = '';
                personNameInput.required = true;
                if (contractorSelect) {
                    contractorSelect.style.display = 'none';
                    contractorSelect.required = false;
                }

                // إظهار حقول الموظف
                if (employeePositionContainer) employeePositionContainer.style.display = 'block';
                if (employeeDepartmentContainer) employeeDepartmentContainer.style.display = 'block';

                // إخفاء حقول المقاول
                if (contractorFieldsContainer) contractorFieldsContainer.style.display = 'none';

                // إظهار حقول الموقع للموظف
                if (locationFieldsContainer) locationFieldsContainer.style.display = 'block';

                // تحميل خيارات الموقع للموظف
                this.loadLocationOptions('employee').then(() => {
                    const employeeLocationSelect = document.getElementById('violation-employee-location');
                    if (employeeLocationSelect) {
                        // إزالة المعالجات القديمة إن وجدت
                        const newSelect = employeeLocationSelect.cloneNode(true);
                        employeeLocationSelect.parentNode.replaceChild(newSelect, employeeLocationSelect);
                        const updatedSelect = document.getElementById('violation-employee-location');
                        if (updatedSelect) {
                            updatedSelect.addEventListener('change', (e) => {
                                const selectedSiteId = e.target.value;
                                this.loadPlaceOptions(selectedSiteId, '', 'employee');
                            });
                        }
                    }
                });

                // تحديث التسمية
                if (personNameLabel) personNameLabel.textContent = 'اسم الموظف *';

                // تعيل البحث بالكود الوظيي
                if (typeof EmployeeHelper !== 'undefined' && employeeCodeInput && employeeCodeInput.parentNode) {
                    try {
                        // إزالة المعالجات القديمة
                        const newCodeInput = employeeCodeInput.cloneNode(true);
                        employeeCodeInput.parentNode.replaceChild(newCodeInput, employeeCodeInput);

                        // الحصول على العنصر الجديد
                        const updatedCodeInput = document.getElementById('violation-employee-code');
                        if (updatedCodeInput) {
                            EmployeeHelper.setupEmployeeCodeSearch('violation-employee-code', 'violation-person-name', (employee) => {
                                if (employee) {
                                    const nameField = document.getElementById('violation-person-name');
                                    const positionField = document.getElementById('violation-employee-position');
                                    const departmentField = document.getElementById('violation-employee-department');
                                    if (nameField) nameField.value = employee.name || '';
                                    if (positionField) positionField.value = employee.position || employee.jobTitle || '';
                                    if (departmentField) departmentField.value = employee.department || employee.section || '';
                                }
                            });
                        }
                    } catch (error) {
                        Utils.safeError('خطأ في إعداد البحث بالكود الوظيفي:', error);
                        // محاولة بدون replaceChild
                        if (employeeCodeInput) {
                            EmployeeHelper.setupEmployeeCodeSearch('violation-employee-code', 'violation-person-name', (employee) => {
                                if (employee) {
                                    const nameField = document.getElementById('violation-person-name');
                                    const positionField = document.getElementById('violation-employee-position');
                                    const departmentField = document.getElementById('violation-employee-department');
                                    if (nameField) nameField.value = employee.name || '';
                                    if (positionField) positionField.value = employee.position || employee.jobTitle || '';
                                    if (departmentField) departmentField.value = employee.department || employee.section || '';
                                }
                            });
                        }
                    }
                }
            } else {
                applyFineAmountFromType({ force: true });
                // إخاء حقل الكود الوظيي
                employeeCodeContainer.style.display = 'none';
                employeeCodeInput.required = false;
                employeeCodeInput.value = '';

                // إظهار قائمة المقاولين وإخفاء حقل الاسم
                personNameInput.style.display = 'none';
                personNameInput.required = false;
                personNameInput.value = '';
                if (contractorSelect) {
                    contractorSelect.style.display = 'block';
                    contractorSelect.required = true;

                    // إعادة تحميل قائمة المقاولين عند التبديل إلى نوع مقاول
                    this.loadContractorsIntoSelect(contractorSelect);
                }

                // إخفاء حقول الموظف
                if (employeePositionContainer) employeePositionContainer.style.display = 'none';
                if (employeeDepartmentContainer) employeeDepartmentContainer.style.display = 'none';

                // إظهار حقول المقاول
                if (contractorFieldsContainer) contractorFieldsContainer.style.display = 'block';

                // تحميل خيارات الموقع للمقاول
                this.loadLocationOptions('contractor').then(() => {
                    const contractorLocationSelect = document.getElementById('violation-contractor-location');
                    if (contractorLocationSelect) {
                        // إزالة المعالجات القديمة إن وجدت
                        const newSelect = contractorLocationSelect.cloneNode(true);
                        contractorLocationSelect.parentNode.replaceChild(newSelect, contractorLocationSelect);
                        const updatedSelect = document.getElementById('violation-contractor-location');
                        if (updatedSelect) {
                            updatedSelect.addEventListener('change', (e) => {
                                const selectedSiteId = e.target.value;
                                this.loadPlaceOptions(selectedSiteId, '', 'contractor');
                            });
                        }
                    }
                });

                // إخفاء حقول الموقع للموظف (لأن المقاول له حقول موقع خاصة به)
                if (locationFieldsContainer) locationFieldsContainer.style.display = 'none';

                // تحديث التسمية
                if (personNameLabel) personNameLabel.textContent = 'اسم المقاول *';
            }
            scheduleViolationSeqBadge();
        });

        const scheduleViolationSeqBadge = () => {
            clearTimeout(this._violationSeqBadgeTimer);
            this._violationSeqBadgeTimer = setTimeout(() => {
                this.refreshViolationSequenceBadgeInModal(modal, isEdit ? violationData?.id : null);
            }, 200);
        };
        modal.addEventListener('input', scheduleViolationSeqBadge);
        modal.addEventListener('change', scheduleViolationSeqBadge);
        setTimeout(scheduleViolationSeqBadge, 350);

        // تفعيل البحث عند تحديث النموذج إذا كان موظف
        if (typeof EmployeeHelper !== 'undefined' && violationData?.employeeName && employeeCodeInput && employeeCodeInput.parentNode) {
            try {
                // إزالة المعالجات القديمة
                const newCodeInput = employeeCodeInput.cloneNode(true);
                employeeCodeInput.parentNode.replaceChild(newCodeInput, employeeCodeInput);

                // الحصول على العنصر الجديد
                const updatedCodeInput = document.getElementById('violation-employee-code');
                if (updatedCodeInput) {
                    EmployeeHelper.setupEmployeeCodeSearch('violation-employee-code', 'violation-person-name', (employee) => {
                        if (employee) {
                            const nameField = document.getElementById('violation-person-name');
                            const positionField = document.getElementById('violation-employee-position');
                            const departmentField = document.getElementById('violation-employee-department');
                            if (nameField) nameField.value = employee.name || '';
                            if (positionField) positionField.value = employee.position || employee.jobTitle || '';
                            if (departmentField) departmentField.value = employee.department || employee.section || '';
                        }
                    });
                }
            } catch (error) {
                Utils.safeError('خطأ في إعداد البحث بالكود الوظيفي:', error);
                // محاولة بدون replaceChild
                if (employeeCodeInput) {
                    EmployeeHelper.setupEmployeeCodeSearch('violation-employee-code', 'violation-person-name', (employee) => {
                        if (employee) {
                            const nameField = document.getElementById('violation-person-name');
                            const positionField = document.getElementById('violation-employee-position');
                            const departmentField = document.getElementById('violation-employee-department');
                            if (nameField) nameField.value = employee.name || '';
                            if (positionField) positionField.value = employee.position || employee.jobTitle || '';
                            if (departmentField) departmentField.value = employee.department || employee.section || '';
                        }
                    });
                }
            }
        }

        // تحميل قائمة المواقع حسب نوع الشخص (افتراضي: موظف)
        const initialPersonType = isContractorRecord ? 'contractor' : 'employee';
        // تحميل خيارات الموقع للموظف (الافتراضي) والمقاول
        setTimeout(async () => {
            await this.loadLocationOptions('employee');
            await this.loadLocationOptions('contractor');

            // إعداد event listeners للموقع والأماكن للموظف
            const employeeLocationSelect = document.getElementById('violation-employee-location');
            const employeePlaceSelect = document.getElementById('violation-employee-place');
            if (employeeLocationSelect && employeePlaceSelect) {
                // إزالة المعالجات القديمة إن وجدت
                const newLocationSelect = employeeLocationSelect.cloneNode(true);
                employeeLocationSelect.parentNode.replaceChild(newLocationSelect, employeeLocationSelect);
                const newPlaceSelect = employeePlaceSelect.cloneNode(true);
                employeePlaceSelect.parentNode.replaceChild(newPlaceSelect, employeePlaceSelect);

                // إعادة الحصول على العناصر
                const updatedLocationSelect = document.getElementById('violation-employee-location');
                const updatedPlaceSelect = document.getElementById('violation-employee-place');
                if (updatedLocationSelect) {
                    updatedLocationSelect.addEventListener('change', (e) => {
                        const selectedSiteId = e.target.value;
                        this.loadPlaceOptions(selectedSiteId, '', 'employee');
                    });
                }
            }

            // إعداد event listeners للموقع والأماكن للمقاول
            const contractorLocationSelect = document.getElementById('violation-contractor-location');
            const contractorPlaceSelect = document.getElementById('violation-contractor-place');
            if (contractorLocationSelect && contractorPlaceSelect) {
                // إزالة المعالجات القديمة إن وجدت
                const newLocationSelect = contractorLocationSelect.cloneNode(true);
                contractorLocationSelect.parentNode.replaceChild(newLocationSelect, contractorLocationSelect);
                const newPlaceSelect = contractorPlaceSelect.cloneNode(true);
                contractorPlaceSelect.parentNode.replaceChild(newPlaceSelect, contractorPlaceSelect);

                // إعادة الحصول على العناصر
                const updatedLocationSelect = document.getElementById('violation-contractor-location');
                const updatedPlaceSelect = document.getElementById('violation-contractor-place');
                if (updatedLocationSelect) {
                    updatedLocationSelect.addEventListener('change', (e) => {
                        const selectedSiteId = e.target.value;
                        this.loadPlaceOptions(selectedSiteId, '', 'contractor');
                    });
                }
            }

            // إذا كان النوع الافتراضي هو موظف، تأكد من إعداد حقول الموظف
            if (initialPersonType === 'employee' && personTypeSelect.value === 'employee') {
                // إعداد البحث بالكود الوظيفي للموظف
                if (typeof EmployeeHelper !== 'undefined') {
                    const codeInput = document.getElementById('violation-employee-code');
                    if (codeInput) {
                        try {
                            EmployeeHelper.setupEmployeeCodeSearch('violation-employee-code', 'violation-person-name', (employee) => {
                                if (employee) {
                                    const nameField = document.getElementById('violation-person-name');
                                    const positionField = document.getElementById('violation-employee-position');
                                    const departmentField = document.getElementById('violation-employee-department');
                                    if (nameField) nameField.value = employee.name || '';
                                    if (positionField) positionField.value = employee.position || employee.jobTitle || '';
                                    if (departmentField) departmentField.value = employee.department || employee.section || '';
                                }
                            });
                        } catch (error) {
                            Utils.safeError('خطأ في إعداد البحث بالكود الوظيفي:', error);
                        }
                    }
                }
            }
        }, 100);

        // تعيين القيم إذا كان التعديل (سيتم إعداد event listeners في setTimeout)
        if (selectedLocationValue) {
            setTimeout(() => {
                if (initialPersonType === 'employee') {
                    const employeeLocationSelect = document.getElementById('violation-employee-location');
                    if (employeeLocationSelect) {
                        employeeLocationSelect.value = selectedLocationValue;
                        if (selectedLocationValue) {
                            this.loadPlaceOptions(selectedLocationValue, selectedPlaceValue, 'employee');
                        }
                    }
                } else if (initialPersonType === 'contractor') {
                    const contractorLocationSelect = document.getElementById('violation-contractor-location');
                    if (contractorLocationSelect) {
                        contractorLocationSelect.value = selectedLocationValue;
                        if (selectedLocationValue) {
                            this.loadPlaceOptions(selectedLocationValue, selectedPlaceValue, 'contractor');
                        }
                    }
                }
            }, 200);
        }

        // Setup photo preview
        const photoInput = document.getElementById('violation-photo-input');
        const photoPreview = document.getElementById('violation-photo-preview');
        const photoImg = document.getElementById('violation-photo-img');
        if (photoInput && photoPreview && photoImg) {
            photoInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    if (file.size > 2 * 1024 * 1024) {
                        Notification.error('حجم الصورة كبير جداً. الحد الأقصى 2MB');
                        photoInput.value = '';
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        photoImg.src = e.target.result;
                        photoPreview.classList.remove('hidden');
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        // الحصول على النموذج وزر الإرسال
        const form = modal.querySelector('#violation-form');
        const submitBtn = modal.querySelector('#violation-submit-btn') || form?.querySelector('button[type="submit"]');

        if (!form || !submitBtn) {
            if (AppState.debugMode) Utils.safeError('❌ النموذج أو زر الإرسال غير موجود');
            Notification.error('خطأ في تحميل النموذج. يرجى إعادة المحاولة.');
            return;
        }

        // ✅ Helper: التحكم بشريط التنبيه أعلى النموذج (يبقي النموذج مفتوحاً)
        const showFormBanner = (type, title, text) => {
            const banner = modal.querySelector('#violation-form-banner');
            const icon   = modal.querySelector('#violation-form-banner-icon');
            const titleEl= modal.querySelector('#violation-form-banner-title');
            const textEl = modal.querySelector('#violation-form-banner-text');
            if (!banner || !icon || !titleEl || !textEl) return;

            // ألوان حسب النوع
            const themes = {
                error:   { bg:'#fef2f2', border:'#fecaca', text:'#991b1b', icon:'fa-circle-xmark text-red-600' },
                warning: { bg:'#fffbeb', border:'#fde68a', text:'#92400e', icon:'fa-triangle-exclamation text-amber-600' },
                success: { bg:'#ecfdf5', border:'#a7f3d0', text:'#065f46', icon:'fa-circle-check text-emerald-600' },
                info:    { bg:'#eff6ff', border:'#bfdbfe', text:'#1e40af', icon:'fa-circle-info text-blue-600' }
            };
            const theme = themes[type] || themes.info;
            banner.style.background  = theme.bg;
            banner.style.borderColor = theme.border;
            banner.style.color       = theme.text;
            icon.className = 'fas ' + theme.icon + ' text-lg mt-0.5';
            titleEl.textContent = title || '';
            textEl.textContent  = text  || '';
            banner.classList.remove('hidden');
            // التمرير لأعلى داخل المودال حتى يرى المستخدم التنبيه
            try {
                const modalBody = modal.querySelector('.modal-body');
                if (modalBody) modalBody.scrollTo({ top: 0, behavior: 'smooth' });
            } catch (e) { /* ignore */ }
        };
        const hideFormBanner = () => {
            const banner = modal.querySelector('#violation-form-banner');
            if (banner) banner.classList.add('hidden');
        };

        // ربط زر إغلاق التنبيه
        const bannerCloseBtn = modal.querySelector('#violation-form-banner-close');
        if (bannerCloseBtn) bannerCloseBtn.addEventListener('click', hideFormBanner);

        // ========== كود جديد بسيط ونظيف ==========

        // معالج النقر على زر التسجيل
        const handleSubmit = async (e) => {
            // منع السلوك الافتراضي للنموذج
            if (e) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }

            // منع النقر المزدوج
            if (submitBtn.disabled) {
                if (AppState.debugMode) Utils.safeLog('⚠️ النموذج قيد المعالجة...');
                return;
            }

            // تعطيل الزر لمنع النقر المزدوج
            const btn = submitBtn;
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i> جاري الحفظ...';

            try {
                // جمع البيانات من النموذج
                const personType = document.getElementById('violation-person-type')?.value;
                const violationDate = document.getElementById('violation-date')?.value;
                const violationTime = document.getElementById('violation-time')?.value;
                const violationType = document.getElementById('violation-type')?.value;
                const severity = document.getElementById('violation-severity')?.value;
                const status = document.getElementById('violation-status')?.value;
                const violationDetails = document.getElementById('violation-details')?.value.trim() || '';
                const actionTaken = document.getElementById('violation-action')?.value.trim() || '';
                const fineAmountRaw = document.getElementById('violation-fine-amount')?.value;
                let fineAmount = '';
                if (fineAmountRaw !== '' && fineAmountRaw !== null && fineAmountRaw !== undefined) {
                    const fineAmountParsed = this.parseFineAmount(fineAmountRaw);
                    if (Number.isFinite(fineAmountParsed) && fineAmountParsed >= 0) {
                        fineAmount = fineAmountParsed;
                    }
                } else {
                    fineAmount = this.parseFineAmount(getDefaultFineAmountForSelectedType());
                }

                // التحقق من البيانات الإلزامية
                const missing = [];
                if (!personType) missing.push('نوع المخالفة (موظف/مقاول)');
                if (!violationDate) missing.push('تاريخ المخالفة');
                if (!violationTime) missing.push('وقت المخالفة');
                if (!violationType) missing.push('نوع المخالفة');
                if (!severity) missing.push('شدة المخالفة');
                if (!status) missing.push('حالة المخالفة');

                // التحقق من بيانات الشخص
                let personName = '';
                let contractorId = '';
                if (personType === 'employee') {
                    const code = document.getElementById('violation-employee-code')?.value.trim();
                    personName = document.getElementById('violation-person-name')?.value.trim();
                    if (!code) missing.push('الكود الوظيفي');
                    if (!personName) missing.push('اسم الموظف');
                } else if (personType === 'contractor') {
                    const contractorSelect = document.getElementById('violation-contractor-select');
                    if (!contractorSelect || !contractorSelect.value) {
                        missing.push('اسم المقاول');
                    } else {
                        personName = contractorSelect.value;
                        const selectedOption = contractorSelect.options[contractorSelect.selectedIndex];
                        contractorId = selectedOption?.dataset.contractorCode || selectedOption?.dataset.contractorId || '';
                    }
                }

                // التحقق من الموقع ومكان المخالفة
                let location = '';
                let locationName = '';
                let place = '';
                let placeName = '';
                if (personType === 'employee') {
                    const locationSelect = document.getElementById('violation-employee-location');
                    const placeSelect = document.getElementById('violation-employee-place');
                    location = locationSelect?.value || '';
                    locationName = locationSelect?.options[locationSelect?.selectedIndex]?.text || '';
                    place = placeSelect?.value || '';
                    placeName = placeSelect?.options[placeSelect?.selectedIndex]?.text || '';
                } else if (personType === 'contractor') {
                    const locationSelect = document.getElementById('violation-contractor-location');
                    const placeSelect = document.getElementById('violation-contractor-place');
                    location = locationSelect?.value || '';
                    locationName = locationSelect?.options[locationSelect?.selectedIndex]?.text || '';
                    place = placeSelect?.value || '';
                    placeName = placeSelect?.options[placeSelect?.selectedIndex]?.text || '';
                }
                if (!location) missing.push('الموقع');
                if (!place) missing.push('مكان المخالفة');

                // إذا كانت هناك حقول ناقصة
                if (missing.length > 0) {
                    // ✅ تنبيه أعلى النموذج (وليس toast سفلي) — يبقى مرئياً حتى يُكمل المستخدم
                    showFormBanner(
                        'error',
                        'بيانات إلزامية ناقصة',
                        'يرجى استكمال: ' + missing.join('، ')
                    );
                    btn.disabled = false;
                    btn.innerHTML = originalText;

                    // إبراز الحقول الناقصة
                    missing.forEach(field => {
                        let inputId = '';
                        if (field.includes('الكود الوظيفي')) inputId = 'violation-employee-code';
                        else if (field.includes('اسم الموظف')) inputId = 'violation-person-name';
                        else if (field.includes('اسم المقاول')) inputId = 'violation-contractor-select';
                        else if (field.includes('تاريخ')) inputId = 'violation-date';
                        else if (field.includes('وقت')) inputId = 'violation-time';
                        else if (field.includes('نوع المخالفة')) inputId = 'violation-type';
                        else if (field.includes('الشدة')) inputId = 'violation-severity';
                        else if (field.includes('الحالة')) inputId = 'violation-status';
                        else if (field.includes('الموقع')) inputId = personType === 'employee' ? 'violation-employee-location' : 'violation-contractor-location';
                        else if (field.includes('مكان المخالفة')) inputId = personType === 'employee' ? 'violation-employee-place' : 'violation-contractor-place';

                        if (inputId) {
                            const input = document.getElementById(inputId);
                            if (input) {
                                input.classList.add('border-red-500', 'ring-2', 'ring-red-300');
                                input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                setTimeout(() => {
                                    input.classList.remove('border-red-500', 'ring-2', 'ring-red-300');
                                }, 3000);
                            }
                        }
                    });
                    return;
                }

                // معالجة الصورة
                let photo = violationData?.photo || '';
                const photoInput = document.getElementById('violation-photo-input');
                if (photoInput?.files.length > 0) {
                    const file = photoInput.files[0];
                    if (file.size > 2 * 1024 * 1024) {
                        showFormBanner('error', 'الصورة كبيرة جداً', 'الحد الأقصى للحجم 2MB. اختر صورة أصغر.');
                        btn.disabled = false;
                        btn.innerHTML = originalText;
                        return;
                    }
                    try {
                        photo = await Violations.convertImageToBase64(file);
                    } catch (err) {
                        if (AppState.debugMode) Utils.safeWarn('خطأ في تحويل الصورة:', err);
                    }
                }

                // ✅ مسح أي تنبيه سابق قبل المتابعة
                hideFormBanner();

                // إنشاء كائن البيانات
                const violationTypeOption = violationTypeSelect?.selectedOptions?.[0];
                const violationTypeId = violationTypeOption?.getAttribute('data-type-id') || '';

                const violationDateTime = violationDate && violationTime
                    ? new Date(`${violationDate}T${violationTime}`).toISOString()
                    : new Date().toISOString();

                const formData = {
                    id: violationData?.id || Utils.generateId('VIOLATION'),
                    isoCode: violationData?.isoCode || generateISOCode('VIOL', AppState.appData.violations || []),
                    personType: personType,
                    employeeId: personType === 'employee' ? (violationData?.employeeId || Utils.generateId('EMP')) : '',
                    employeeName: personType === 'employee' ? personName : '',
                    employeeCode: personType === 'employee' ? document.getElementById('violation-employee-code')?.value.trim() || '' : '',
                    employeeNumber: personType === 'employee' ? document.getElementById('violation-employee-code')?.value.trim() || '' : '',
                    employeePosition: personType === 'employee' ? document.getElementById('violation-employee-position')?.value.trim() || '' : '',
                    employeeDepartment: personType === 'employee' ? document.getElementById('violation-employee-department')?.value.trim() || '' : '',
                    contractorId: personType === 'contractor' ? contractorId : '',
                    contractorName: personType === 'contractor' ? personName : '',
                    contractorWorker: personType === 'contractor' ? document.getElementById('violation-contractor-worker')?.value.trim() || '' : '',
                    contractorPosition: personType === 'contractor' ? document.getElementById('violation-contractor-position')?.value.trim() || '' : '',
                    contractorDepartment: personType === 'contractor' ? document.getElementById('violation-contractor-department')?.value.trim() || '' : '',
                    violationTypeId: violationTypeId,
                    violationType: violationType,
                    fineAmount: this.parseFineAmount(fineAmount),
                    violationDate: violationDateTime,
                    violationTime: violationTime,
                    // حفظ ID الموقع واسمه
                    violationLocation: locationName && locationName !== '-- اختر الموقع --' ? locationName : location,
                    violationLocationId: location ? String(location).trim() : null,
                    // حفظ ID المكان واسمه
                    violationPlace: placeName && placeName !== '-- اختر مكان المخالفة --' ? placeName : place,
                    violationPlaceId: place ? String(place).trim() : null,
                    violationDetails: violationDetails,
                    severity: severity,
                    actionTaken: actionTaken,
                    status: status,
                    photo: photo,
                    createdAt: violationData?.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                const seqDraft = {
                    personType,
                    violationDate: violationDateTime,
                    employeeCode: formData.employeeCode,
                    employeeNumber: formData.employeeNumber,
                    contractorName: formData.contractorName,
                    contractorWorker: formData.contractorWorker
                };
                const priorSeq = this.countPriorViolationsSamePersonMonth(
                    seqDraft,
                    isEdit && violationData?.id ? violationData.id : null
                );
                formData.violationSequenceInMonth = priorSeq + 1;

                // ✅ دائرة اعتماد المخالفات: إذا فُعِّلت ولم يكن المستخدم مديراً، أرسل طلب اعتماد بدل الحفظ المباشر
                try {
                    const approvalGate = await this.checkViolationApprovalGate(formData, { isEdit });
                    if (approvalGate && approvalGate.requiresApproval) {
                        // 🛡️ حماية حرجة: مسار الاعتماد يخزّن violationData كـ JSON.stringify في خلية واحدة
                        // (Google Sheets يحدّ الخلية بـ 50000 حرف). صورة base64 بحجم 2MB ≈ 2.7M حرف!
                        // نرفع الصورة لـ Drive أولاً ثم نضع الرابط فقط في الـ payload.
                        let approvalPhoto = photo;
                        if (approvalPhoto && typeof approvalPhoto === 'string' && approvalPhoto.startsWith('data:')) {
                            try {
                                btn.innerHTML = '<i class="fas fa-cloud-upload-alt fa-spin ml-2"></i> جاري رفع الصورة...';
                                const uploadRes = await Backend.uploadFileToDrive?.(
                                    approvalPhoto,
                                    `violation_${formData.id}_${Date.now()}.jpg`,
                                    'image/jpeg',
                                    'Violations'
                                );
                                if (uploadRes && uploadRes.success) {
                                    approvalPhoto = uploadRes.directLink || uploadRes.shareableLink || '';
                                } else {
                                    // 🚨 لا نُمرر base64 للخلية أبداً — نُسقط الصورة مع تنبيه واضح
                                    approvalPhoto = '';
                                    showFormBanner(
                                        'warning',
                                        'تعذّر رفع الصورة',
                                        'سيتم إرسال طلب الاعتماد بدون الصورة. تحقق من اتصال الإنترنت أو حاول مرة أخرى لاحقاً.'
                                    );
                                }
                                btn.innerHTML = originalText;
                                btn.disabled = true;
                                btn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i> جاري الحفظ...';
                            } catch (upErr) {
                                if (AppState.debugMode) Utils.safeWarn('Drive upload failed in approval path:', upErr);
                                approvalPhoto = ''; // حماية: لا نُمرر base64 أبداً
                            }
                        }
                        const safeFormData = { ...formData, photo: approvalPhoto };

                        // إرسال طلب الاعتماد للـ backend وعدم الحفظ المحلي
                        const approvalResult = await this.submitViolationForApproval(safeFormData, { isEdit, originalId: violationData?.id });
                        // استعادة الزر
                        btn.disabled = false;
                        btn.innerHTML = originalText;
                        if (approvalResult && approvalResult.success) {
                            modal.remove();
                            Notification.success(approvalResult.message || 'تم إرسال المخالفة لدائرة الاعتماد بنجاح. ستظهر بعد اعتمادها.');
                            // إطلاق حدث لتحديث قائمة طلبات الاعتماد إن كانت مفتوحة
                            try {
                                document.dispatchEvent(new CustomEvent('violation-approval-request-created', { detail: approvalResult.data || {} }));
                            } catch (e) { /* ignore */ }
                            return; // ⚠️ نخرج هنا — لا نكمل مسار الحفظ المباشر
                        } else {
                            // ✅ تنبيه أعلى النموذج (يبقي النموذج مفتوحاً ليُعيد المستخدم المحاولة)
                            const msg = (approvalResult && approvalResult.message) || 'فشل إرسال طلب الاعتماد. حاول مرة أخرى.';
                            showFormBanner('error', 'تعذّر إرسال طلب الاعتماد', msg);
                            return;
                        }
                    }
                } catch (gateErr) {
                    if (AppState.debugMode) Utils.safeWarn('approvalGate error (continuing with direct save):', gateErr);
                    // في حال خطأ في فحص الاعتماد، نُكمل المسار العادي حفاظاً على عدم تعطيل العمل
                }

                // حفظ في AppState
                if (!AppState.appData.violations) {
                    AppState.appData.violations = [];
                }

                if (isEdit && violationData?.id) {
                    const index = AppState.appData.violations.findIndex(v => v.id === violationData.id);
                    if (index !== -1) {
                        // نحافظ على البيانات المرتبطة القديمة (المرفقات/المرجعيات) أثناء التعديل
                        AppState.appData.violations[index] = {
                            ...AppState.appData.violations[index],
                            ...formData,
                            id: violationData.id,
                            isoCode: violationData.isoCode || formData.isoCode,
                            createdAt: violationData.createdAt || formData.createdAt,
                            updatedAt: new Date().toISOString()
                        };
                    } else {
                        throw new Error('تعذر العثور على سجل المخالفة الأصلي للتعديل. أعد تحميل الصفحة ثم حاول مرة أخرى.');
                    }
                } else {
                    AppState.appData.violations.push(formData);
                }

                // حفظ محلياً
                if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                    window.DataManager.save();
                }

                // 2. إغلاق النموذج بشكل مباشر وسريع جداً بدون أي تأخير
                modal.remove();

                // 3. عرض رسالة نجاح فورية (محلية أولاً مع إشارة جاري المزامنة)
                Notification.success(`تم ${isEdit ? 'تحديث' : 'تسجيل'} المخالفة بنجاح وجاري المزامنة في الخلفية...`);

                // 4. تحديث الكروت فوراً (مباشر بدون انتظار) ثم القائمة بالكامل
                try { this.updateAllViolationsStats(); } catch (e) { /* ignore */ }
                // ✅ تحديث كروت لوحة التحكم فوراً
                try {
                    if (typeof Dashboard !== 'undefined') {
                        if (typeof Dashboard.updateStats === 'function') Dashboard.updateStats();
                        if (typeof Dashboard.updateReportsStatistics === 'function') Dashboard.updateReportsStatistics();
                    }
                } catch (e) { /* ignore */ }
                // ✅ إطلاق حدث data-saved ليستجيب له أي مستمع آخر
                try {
                    document.dispatchEvent(new CustomEvent('data-saved', {
                        detail: { module: 'violations', action: isEdit ? 'تحديث' : 'إضافة', data: formData }
                    }));
                } catch (e) { /* ignore */ }
                // ✅ تحديث القائمة في المكان (بدون إعادة بناء كامل للـ DOM)
                // Violations.load() كانت تُعيد بناء كل شيء وتطلق جلب خلفي يُلغي المخالفة الجديدة
                try {
                    if (typeof Violations !== 'undefined' && typeof Violations.refreshViolationsView === 'function') {
                        Violations.refreshViolationsView();
                    } else if (typeof Violations !== 'undefined' && Violations.load) {
                        Violations.load();
                    }
                } catch (e) { /* ignore */ }

                // 5. المزامنة والرفع في الخلفية دون تعطيل واجهة المستخدم
                const performBackgroundSync = async (localPhoto) => {
                    let finalPhoto = localPhoto;
                    let hasUpdatedPhoto = false;

                    // رفع الصورة إلى Google Drive في الخلفية إذا كانت base64
                    if (localPhoto && localPhoto.startsWith('data:')) {
                        try {
                            const uploadResult = await Backend.uploadFileToDrive?.(
                                localPhoto,
                                `violation_${formData.id}_${Date.now()}.jpg`,
                                'image/jpeg',
                                'Violations'
                            );
                            if (uploadResult?.success) {
                                finalPhoto = uploadResult.directLink || uploadResult.shareableLink || localPhoto;
                                hasUpdatedPhoto = true;
                            }
                        } catch (err) {
                            if (AppState.debugMode) Utils.safeWarn('خطأ في رفع الصورة في الخلفية:', err);
                        }
                    }

                    // إذا تم تحديث الصورة البعيدة، نحدث السجل المحلي
                    if (hasUpdatedPhoto) {
                        const currentViolations = AppState.appData.violations || [];
                        const index = currentViolations.findIndex(v => v.id === formData.id);
                        if (index !== -1) {
                            currentViolations[index].photo = finalPhoto;
                            formData.photo = finalPhoto;
                            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                                window.DataManager.save();
                            }
                            // إعادة تحميل خفيفة لتحديث صورة الكارت إذا كانت معروضة
                            if (typeof Violations !== 'undefined' && Violations.load) {
                                Violations.load();
                            }
                        }
                    }

                    // المزامنة مع Google Sheets في الخلفية — استخدام addViolation/updateViolation
                    // (بدل saveToSheet الذي يستبدل الجدول كاملاً ويسبب race conditions)
                    try {
                        if (typeof Backend !== 'undefined' && Backend.sendRequest) {
                            // تحضير نسخة من البيانات مع الصورة النهائية (إن رُفعت)
                            const payload = Object.assign({}, formData, { photo: finalPhoto });
                            let saveRes;
                            if (isEdit) {
                                saveRes = await Backend.sendRequest({
                                    action: 'updateViolation',
                                    data: { violationId: formData.id, updateData: payload }
                                });
                            } else {
                                saveRes = await Backend.sendRequest({
                                    action: 'addViolation',
                                    data: payload
                                });
                            }
                            if (saveRes && saveRes.success === true) {
                                try { localStorage.setItem('violations_last_sync', String(Date.now())); } catch (eLs) { /* ignore */ }
                                if (AppState.debugMode) Utils.safeLog('✅ حفظ المخالفة في الخادم بنجاح');
                            } else {
                                if (AppState.debugMode) Utils.safeWarn('⚠️ فشل حفظ المخالفة في الخادم:', saveRes && saveRes.message);
                                // إضافة لقائمة الانتظار للمزامنة لاحقاً
                                try {
                                    if (typeof DataManager !== 'undefined' && DataManager.addToPendingSync) {
                                        DataManager.addToPendingSync('Violations', AppState.appData.violations);
                                    }
                                } catch (eP) { /* ignore */ }
                            }
                        }
                    } catch (err) {
                        if (AppState.debugMode) Utils.safeWarn('خطأ في حفظ المخالفة في الخلفية:', err);
                        // محاولة إضافة لقائمة الانتظار لإعادة المحاولة لاحقاً
                        try {
                            if (typeof DataManager !== 'undefined' && DataManager.addToPendingSync) {
                                DataManager.addToPendingSync('Violations', AppState.appData.violations);
                            }
                        } catch (eP) { /* ignore */ }
                    }
                };

                // إطلاق المهمة في الخلفية دون await
                performBackgroundSync(photo).catch(err => {
                    Utils.safeError('خطأ غير متوقع في مزامنة الخلفية للمخالفة:', err);
                });

            } catch (error) {
                Utils.safeError('❌ خطأ في حفظ المخالفة:', error);
                // ✅ تنبيه أعلى النموذج بدلاً من toast سفلي
                showFormBanner('error', 'حدث خطأ', (error && (error.message || error.toString())) || 'فشل حفظ المخالفة');
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        };

        // ربط معالج الأحداث - نستخدم submit فقط لتجنب التنفيذ المزدوج
        form.addEventListener('submit', handleSubmit, { once: false });

        // إزالة أي معالجات قديمة للزر
        const newSubmitBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        const updatedSubmitBtn = modal.querySelector('#violation-submit-btn') || modal.querySelector('button[type="submit"]');

        // ربط معالج click كنسخة احتياطية (مع منع السلوك الافتراضي)
        if (updatedSubmitBtn) {
            updatedSubmitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (updatedSubmitBtn.disabled) return;
                handleSubmit(e);
            });
        }

        // إغلاق النموذج عند النقر خارجه
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // إغلاق النموذج عند الضغط على ESC
        const handleEscape = (e) => {
            if (e.key === 'Escape' && document.body.contains(modal)) {
                modal.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    },

    getSiteOptions() {
        try {
            // محاولة الحصول من Permissions.formSettingsState
            if (typeof Permissions !== 'undefined' && Permissions.formSettingsState && Permissions.formSettingsState.sites) {
                return Permissions.formSettingsState.sites.map(site => ({
                    id: site.id,
                    name: site.name
                }));
            }

            // محاولة الحصول من AppState.appData.observationSites
            if (Array.isArray(AppState.appData?.observationSites) && AppState.appData.observationSites.length > 0) {
                return AppState.appData.observationSites.map(site => ({
                    id: site.id || site.siteId || Utils.generateId('SITE'),
                    name: site.name || site.title || site.label || 'موقع غير محدد'
                }));
            }

            // محاولة الحصول من DailyObservations
            if (typeof DailyObservations !== 'undefined' && Array.isArray(DailyObservations.DEFAULT_SITES)) {
                return DailyObservations.DEFAULT_SITES.map((site, index) => ({
                    id: site.id || site.siteId || Utils.generateId('SITE'),
                    name: site.name || site.title || site.label || `موقع ${index + 1}`
                }));
            }

            return [];
        } catch (error) {
            Utils.safeWarn('⚠️ خطأ في الحصول على قائمة المواقع:', error);
            return [];
        }
    },

    refreshSiteDropdowns() {
        try {
            var sites = this.getSiteOptions();
            var esc = (typeof Utils !== 'undefined' && Utils.escapeHTML) ? Utils.escapeHTML : function(s) { return String(s == null ? '' : s); };
            var opts = '<option value="">اختر المصنع</option>' + (sites || []).map(function(s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('');
            var el = document.getElementById('blacklist-factory');
            if (el && el.tagName === 'SELECT') { var v = el.value; el.innerHTML = opts; if (v) el.value = v; }
        } catch (e) { if (typeof Utils !== 'undefined' && Utils.safeWarn) Utils.safeWarn('⚠️ Violations.refreshSiteDropdowns:', e); }
    },

    getPlaceOptions(siteId) {
        try {
            if (!siteId) return [];

            const sites = this.getSiteOptions();
            const selectedSite = sites.find(s => s.id === siteId);
            if (!selectedSite) return [];

            // محاولة الحصول من Permissions.formSettingsState
            if (typeof Permissions !== 'undefined' && Permissions.formSettingsState && Permissions.formSettingsState.sites) {
                const site = Permissions.formSettingsState.sites.find(s => s.id === siteId);
                if (site && Array.isArray(site.places)) {
                    return site.places.map(place => ({
                        id: place.id || place.placeId || Utils.generateId('PLACE'),
                        name: place.name || place.placeName || 'مكان غير محدد'
                    }));
                }
            }

            // محاولة الحصول من AppState.appData.observationSites
            if (Array.isArray(AppState.appData?.observationSites)) {
                const site = AppState.appData.observationSites.find(s =>
                    (s.id === siteId) || (s.siteId === siteId) || (s.name === siteId)
                );
                if (site) {
                    const placesSource = Array.isArray(site.places)
                        ? site.places
                        : Array.isArray(site.locations)
                            ? site.locations
                            : Array.isArray(site.children)
                                ? site.children
                                : Array.isArray(site.areas)
                                    ? site.areas
                                    : [];
                    return placesSource.map((place, idx) => ({
                        id: place.id || place.placeId || place.value || Utils.generateId('PLACE'),
                        name: place.name || place.placeName || place.title || place.label || place.locationName || `مكان ${idx + 1}`
                    }));
                }
            }

            return [];
        } catch (error) {
            Utils.safeWarn('⚠️ خطأ في الحصول على قائمة الأماكن:', error);
            return [];
        }
    },

    async loadLocationOptions(personType = 'employee') {
        try {
            // التأكد من تحميل إعدادات النماذج
            if (typeof Permissions !== 'undefined' && typeof Permissions.ensureFormSettingsState === 'function') {
                await Permissions.ensureFormSettingsState();
            }

            const sites = this.getSiteOptions();
            const locationSelectId = personType === 'employee' ? 'violation-employee-location' : 'violation-contractor-location';
            const locationSelect = document.getElementById(locationSelectId);

            if (!locationSelect) return;

            locationSelect.innerHTML = '<option value="">-- اختر الموقع --</option>';

            if (sites && sites.length > 0) {
                sites.forEach(site => {
                    const option = document.createElement('option');
                    option.value = site.id;
                    option.textContent = site.name;
                    locationSelect.appendChild(option);
                });
            }
        } catch (error) {
            Utils.safeError('❌ خطأ في تحميل المواقع:', error);
        }
    },

    loadPlaceOptions(siteId, selectedPlaceId = '', personType = 'employee') {
        try {
            const placeSelectId = personType === 'employee' ? 'violation-employee-place' : 'violation-contractor-place';
            const placeSelect = document.getElementById(placeSelectId);
            if (!placeSelect) return;

            placeSelect.innerHTML = '<option value="">-- اختر مكان المخالفة --</option>';

            if (!siteId) {
                return;
            }

            const places = this.getPlaceOptions(siteId);
            if (places && places.length > 0) {
                places.forEach(place => {
                    const option = document.createElement('option');
                    option.value = place.id;
                    option.textContent = place.name;
                    if (selectedPlaceId && (place.id === selectedPlaceId || place.name === selectedPlaceId)) {
                        option.selected = true;
                    }
                    placeSelect.appendChild(option);
                });
            }
        } catch (error) {
            Utils.safeError('❌ خطأ في تحميل الأماكن:', error);
        }
    },

    async convertImageToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    async viewViolation(id) {
        const raw = AppState.appData?.violations?.find(v => v.id === id);
        if (!raw) {
            if (typeof Notification !== 'undefined') Notification.error('المخالفة غير موجودة');
            return;
        }
        const violation = this.normalizeViolationRecord(raw) || raw;
        const qSev = String(violation.severity || '').trim();
        const qStat = String(violation.status || '').trim();

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 750px; border-radius: 16px; overflow: hidden;">
                <div class="modal-header" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 20px 24px;">
                    <h2 class="modal-title" style="color: white; display: flex; align-items: center; gap: 12px; font-size: 1.3rem;">
                        <i class="fas fa-exclamation-triangle"></i>
                        تفاصيل المخالفة
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" style="color: white; background: rgba(255,255,255,0.2); border-radius: 8px; width: 36px; height: 36px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" style="padding: 24px;">
                    <div class="space-y-4">
                        <!-- معلومات المخالف (نفس التصميم للموظفين والمقاولين) -->
                        <div style="background: #fef2f2; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                            <h3 style="font-weight: 600; color: #991b1b; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-user"></i> معلومات المخالف
                            </h3>
                            <div class="grid grid-cols-2 gap-4">
                                ${(violation.contractorName || violation.personType === 'contractor') ? `
                                <!-- مقاول: اسم المخالف (العامل) + الوظيفة + اسم المقاول + الإدارة -->
                                <div>
                                    <label class="text-sm font-semibold text-gray-600">اسم المخالف:</label>
                                    <p class="text-gray-800 font-medium">${Utils.escapeHTML(violation.contractorWorker || violation.employeeName || violation.contractorName || '-')}</p>
                                </div>
                                <div>
                                    <label class="text-sm font-semibold text-gray-600">الوظيفة:</label>
                                    <p class="text-gray-800">${Utils.escapeHTML(violation.contractorPosition || '-')}</p>
                                </div>
                                <div>
                                    <label class="text-sm font-semibold text-gray-600">اسم المقاول:</label>
                                    <p class="text-gray-800 font-medium">${Utils.escapeHTML(violation.contractorName || '-')}</p>
                                </div>
                                ${violation.contractorDepartment ? `
                                <div>
                                    <label class="text-sm font-semibold text-gray-600">الإدارة:</label>
                                    <p class="text-gray-800">${Utils.escapeHTML(violation.contractorDepartment || '-')}</p>
                                </div>
                                ` : ''}
                                ` : `
                                <!-- موظف: اسم المخالف + الكود الوظيفي + الوظيفة + الإدارة -->
                                <div>
                                    <label class="text-sm font-semibold text-gray-600">اسم المخالف:</label>
                                    <p class="text-gray-800 font-medium">${Utils.escapeHTML(violation.employeeName || '-')}</p>
                                </div>
                                ${violation.employeeCode ? `
                                <div>
                                    <label class="text-sm font-semibold text-gray-600">الكود الوظيفي:</label>
                                    <p class="text-gray-800">${Utils.escapeHTML(violation.employeeCode || violation.employeeNumber || '-')}</p>
                                </div>
                                ` : ''}
                                ${violation.employeePosition ? `
                                <div>
                                    <label class="text-sm font-semibold text-gray-600">الوظيفة:</label>
                                    <p class="text-gray-800">${Utils.escapeHTML(violation.employeePosition || '-')}</p>
                                </div>
                                ` : ''}
                                ${violation.employeeDepartment ? `
                                <div>
                                    <label class="text-sm font-semibold text-gray-600">الإدارة:</label>
                                    <p class="text-gray-800">${Utils.escapeHTML(violation.employeeDepartment || '-')}</p>
                                </div>
                                ` : ''}
                                `}
                            </div>
                        </div>

                        <!-- تفاصيل المخالفة -->
                        <div style="background: #fff7ed; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                            <h3 style="font-weight: 600; color: #c2410c; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-info-circle"></i> تفاصيل المخالفة
                            </h3>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="text-sm font-semibold text-gray-600">نوع المخالفة:</label>
                                    <p class="text-gray-800">${Utils.escapeHTML(violation.violationType || '-')}</p>
                                </div>
                                <div>
                                    <label class="text-sm font-semibold text-gray-600">تاريخ المخالفة:</label>
                                    <p class="text-gray-800">${violation.violationDate ? Utils.formatDate(violation.violationDate) : '-'}</p>
                                </div>
                                <div>
                                    <label class="text-sm font-semibold text-gray-600">الموقع:</label>
                                    <p class="text-gray-800">${Utils.escapeHTML(violation.violationLocation || '-')}</p>
                                </div>
                                <div>
                                    <label class="text-sm font-semibold text-gray-600">المكان:</label>
                                    <p class="text-gray-800">${Utils.escapeHTML(violation.violationPlace || '-')}</p>
                                </div>
                                <div>
                                    <label class="text-sm font-semibold text-gray-600">الشدة:</label>
                                    <span style="display: inline-block; padding: 4px 12px; border-radius: 16px; font-size: 0.85rem; font-weight: 600; background: ${violation.severity === 'عالية' ? '#fef2f2' : violation.severity === 'متوسطة' ? '#fffbeb' : '#eff6ff'}; color: ${violation.severity === 'عالية' ? '#dc2626' : violation.severity === 'متوسطة' ? '#d97706' : '#2563eb'}; border: 1px solid ${violation.severity === 'عالية' ? '#fecaca' : violation.severity === 'متوسطة' ? '#fde68a' : '#bfdbfe'};">
                                        ${violation.severity || '-'}
                                    </span>
                                </div>
                                <div>
                                    <label class="text-sm font-semibold text-gray-600">الحالة:</label>
                                    <span style="display: inline-block; padding: 4px 12px; border-radius: 16px; font-size: 0.85rem; font-weight: 600; background: ${violation.status === 'محلول' ? '#ecfdf5' : '#fef3c7'}; color: ${violation.status === 'محلول' ? '#059669' : '#d97706'}; border: 1px solid ${violation.status === 'محلول' ? '#a7f3d0' : '#fde68a'};">
                                        ${violation.status || '-'}
                                    </span>
                                </div>
                                <div>
                                    <label class="text-sm font-semibold text-gray-600">القيمة المالية:</label>
                                    <p class="text-gray-800 font-semibold">${this.formatFineAmount(Number(this.getEffectiveFineAmount(violation)))}</p>
                                </div>
                            </div>
                            ${violation.violationDetails ? `
                            <div class="mt-4">
                                <label class="text-sm font-semibold text-gray-600">تفاصيل المخالفة:</label>
                                <p class="text-gray-800 mt-1 p-3 bg-white rounded-lg border">${Utils.escapeHTML(violation.violationDetails)}</p>
                            </div>
                            ` : ''}
                        </div>

                        <!-- الإجراء المتخذ -->
                        ${violation.actionTaken ? `
                        <div style="background: #f0fdf4; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                            <h3 style="font-weight: 600; color: #166534; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-tasks"></i> الإجراء المتخذ
                            </h3>
                            <p class="text-gray-800 p-3 bg-white rounded-lg border">${Utils.escapeHTML(violation.actionTaken)}</p>
                        </div>
                        ` : ''}

                        <!-- صورة المخالفة -->
                        ${(() => {
                            const photoUrl = this.processPhoto(violation.photo);
                            if (!photoUrl) return '';
                            const disp = typeof Utils.resolveDriveAwareImgDisplay === 'function'
                                ? Utils.resolveDriveAwareImgDisplay(photoUrl)
                                : { canonical: photoUrl, displaySrc: photoUrl, needsProxy: false, proxyFileId: '' };
                            const proxyAttr = typeof Utils.driveProxyImgAttrs === 'function' ? Utils.driveProxyImgAttrs(disp) : '';
                            return `
                        <div style="background: #f8fafc; border-radius: 12px; padding: 16px;">
                            <h3 style="font-weight: 600; color: #475569; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-image"></i> صورة المخالفة
                            </h3>
                            <img src="${Utils.escapeHTML(disp.displaySrc)}" alt="صورة المخالفة"${proxyAttr} class="violation-detail-photo w-full max-w-md h-64 object-cover rounded-lg border-2 border-gray-200 shadow-sm"
                                 onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22400%22 height=%22200%22/%3E%3Ctext fill=%22%23999%22 font-family=%22sans-serif%22 font-size=%2216%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3Eلا توجد صورة%3C/text%3E%3C/svg%3E';">
                        </div>
                        `;})()}

                        <div class="violation-view-quick-edit" style="border: 2px dashed #cbd5e1; border-radius: 12px; padding: 16px; margin-top: 8px; background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);">
                            <h4 style="font-weight: 700; color: #334155; margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px; font-size: 1rem;">
                                <i class="fas fa-pen-to-square text-indigo-600"></i>
                                تعديل من هذه الشاشة
                            </h4>
                            <p style="font-size: 0.8rem; color: #64748b; margin: 0 0 12px 0;">يمكنك تحديث الشدة والحالة والنصوص أدناه ثم الحفظ دون فتح النموذج الكامل.</p>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                <div>
                                    <label for="violation-view-q-severity" class="block text-sm font-semibold text-gray-700 mb-1">الشدة</label>
                                    <select id="violation-view-q-severity" class="form-input" style="width:100%;">
                                        <option value="عالية" ${qSev === 'عالية' ? 'selected' : ''}>عالية</option>
                                        <option value="متوسطة" ${qSev === 'متوسطة' ? 'selected' : ''}>متوسطة</option>
                                        <option value="منخضة" ${qSev === 'منخضة' || qSev === 'منخفضة' ? 'selected' : ''}>منخضة</option>
                                    </select>
                                </div>
                                <div>
                                    <label for="violation-view-q-status" class="block text-sm font-semibold text-gray-700 mb-1">الحالة</label>
                                    <select id="violation-view-q-status" class="form-input" style="width:100%;">
                                        <option value="قيد المراجعة" ${qStat === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
                                        <option value="محلول" ${qStat === 'محلول' ? 'selected' : ''}>محلول</option>
                                        <option value="غير محلول" ${qStat === 'غير محلول' ? 'selected' : ''}>غير محلول</option>
                                    </select>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label for="violation-view-q-details" class="block text-sm font-semibold text-gray-700 mb-1">تفاصيل المخالفة</label>
                                <textarea id="violation-view-q-details" class="form-input" rows="3" style="width:100%; resize: vertical;">${Utils.escapeHTML(violation.violationDetails || '')}</textarea>
                            </div>
                            <div class="mb-3">
                                <label for="violation-view-q-action" class="block text-sm font-semibold text-gray-700 mb-1">الإجراء المتخذ</label>
                                <textarea id="violation-view-q-action" class="form-input" rows="3" style="width:100%; resize: vertical;">${Utils.escapeHTML(violation.actionTaken || '')}</textarea>
                            </div>
                            <button type="button" id="violation-view-quick-save" class="btn-primary" style="width: 100%; justify-content: center; display: inline-flex; align-items: center; gap: 8px;">
                                <i class="fas fa-save"></i>
                                حفظ التعديلات السريعة
                            </button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer violation-view-actions-footer" style="background: #f8fafc; padding: 16px 24px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end;">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()" style="padding: 10px 18px; border-radius: 10px;">إغلاق</button>
                    <button type="button" class="btn-primary" onclick='Violations.printViolationProfessional(${this._escapeIdForHandler(violation.id)})' style="background: linear-gradient(135deg, #0f766e, #0d9488); padding: 10px 18px; border-radius: 10px;">
                        <i class="fas fa-print ml-2"></i>طباعة منسّقة
                    </button>
                    <button type="button" class="btn-primary" onclick='Violations.exportPDF(${this._escapeIdForHandler(violation.id)})' style="background: linear-gradient(135deg, #10b981, #059669); padding: 10px 18px; border-radius: 10px;">
                        <i class="fas fa-file-pdf ml-2"></i>تصدير PDF
                    </button>
                    <button type="button" class="btn-primary" onclick='Violations.showViolationForm(${this._escapeIdForHandler(violation.id)}); this.closest(".modal-overlay").remove();' style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); padding: 10px 18px; border-radius: 10px;">
                        <i class="fas fa-sliders-h ml-2"></i>تعديل كامل (جميع الحقول)
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#violation-view-quick-save')?.addEventListener('click', async () => {
            await this.saveViolationQuickEditsFromView(violation.id, modal);
        });
        if (typeof Utils.hydrateDriveProxyImages === 'function') {
            Utils.hydrateDriveProxyImages(modal, {
                onFetchFail: (img) => {
                    try {
                        img.onerror = null;
                        img.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22400%22 height=%22200%22/%3E%3Ctext fill=%22%23999%22 font-family=%22sans-serif%22 font-size=%2216%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3Eلا توجد صورة%3C/text%3E%3C/svg%3E';
                    } catch (e) { /* ignore */ }
                }
            });
        }
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async saveViolationQuickEditsFromView(id, viewModal) {
        const severity = viewModal.querySelector('#violation-view-q-severity')?.value?.trim() || '';
        const status = viewModal.querySelector('#violation-view-q-status')?.value?.trim() || '';
        const violationDetails = viewModal.querySelector('#violation-view-q-details')?.value?.trim() || '';
        const actionTaken = viewModal.querySelector('#violation-view-q-action')?.value?.trim() || '';
        const saveBtn = viewModal.querySelector('#violation-view-quick-save');
        if (!AppState.appData?.violations) {
            Notification.error('لا توجد بيانات مخالفات.');
            return;
        }
        const idx = AppState.appData.violations.findIndex(v => v.id === id);
        if (idx === -1) {
            Notification.error('تعذّر العثور على المخالفة.');
            return;
        }
        const prevHtml = saveBtn?.innerHTML;
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i> جاري الحفظ...';
        }
        try {
            AppState.appData.violations[idx] = {
                ...AppState.appData.violations[idx],
                severity,
                status,
                violationDetails,
                actionTaken,
                updatedAt: new Date().toISOString()
            };
            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }
            let remoteOk = true;
            try {
                if (typeof Backend !== 'undefined' && Backend.autoSave) {
                    const saveRes = await Backend.autoSave('Violations', AppState.appData.violations);
                    if (saveRes && saveRes.success === false) remoteOk = false;
                }
            } catch (err) {
                remoteOk = false;
                if (AppState.debugMode) Utils.safeWarn('خطأ في حفظ Google Sheets:', err);
            }
            if (!remoteOk) {
                Notification.warning('تم الحفظ محلياً لكن فشل الحفظ في Google Sheets');
            } else {
                try { localStorage.setItem('violations_last_sync', String(Date.now())); } catch (eLs) { /* ignore */ }
            }
            Notification.success('تم حفظ التعديلات السريعة بنجاح');
            viewModal.remove();
            await this.viewViolation(id);
            try {
                const activeTab = document.querySelector('#violations-section .tabs-container .tab-btn.active')?.dataset?.tab || 'all';
                const listEl = document.getElementById('violations-list');
                if (listEl) {
                    if (activeTab === 'all') listEl.innerHTML = this.renderViolationsList();
                    else if (activeTab === 'employees') listEl.innerHTML = this.renderEmployeeViolationsList();
                    else if (activeTab === 'contractors') listEl.innerHTML = this.renderContractorViolationsList();
                }
                if (activeTab === 'all') {
                    const statsEl = document.getElementById('violations-stats-cards');
                    if (statsEl) statsEl.outerHTML = this.renderAllViolationsStats();
                }
            } catch (re) {
                if (typeof Utils !== 'undefined' && Utils.safeWarn) Utils.safeWarn('تحديث قائمة المخالفات بعد الحفظ السريع:', re);
            }
        } catch (error) {
            Utils.safeError('خطأ في الحفظ السريع للمخالفة:', error);
            Notification.error('فشل الحفظ: ' + (error.message || String(error)));
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = prevHtml || '<i class="fas fa-save ml-2"></i> حفظ التعديلات السريعة';
            }
        }
    },

    _buildViolationReportTableHtml(violation) {
        const v = this.normalizeViolationRecord(violation) || violation;
        return `
                <table>
                    <tr><th>كود ISO</th><td>${Utils.escapeHTML(v.isoCode || '')}</td></tr>
                    <tr><th>اسم المخالف</th><td>${Utils.escapeHTML((v.contractorName || v.personType === 'contractor') ? (v.contractorWorker || v.employeeName || v.contractorName || '') : (v.employeeName || ''))}</td></tr>
                    ${(v.contractorName || v.personType === 'contractor') ? `
                    ${v.contractorPosition ? `<tr><th>الوظيفة</th><td>${Utils.escapeHTML(v.contractorPosition || '')}</td></tr>` : ''}
                    <tr><th>اسم المقاول</th><td>${Utils.escapeHTML(v.contractorName || '')}</td></tr>
                    ${v.contractorDepartment ? `<tr><th>الإدارة</th><td>${Utils.escapeHTML(v.contractorDepartment || '')}</td></tr>` : ''}
                    ` : `
                    ${v.employeeCode ? `<tr><th>الكود الوظيفي</th><td>${Utils.escapeHTML(v.employeeCode || v.employeeNumber || '')}</td></tr>` : ''}
                    ${v.employeePosition ? `<tr><th>الوظيفة</th><td>${Utils.escapeHTML(v.employeePosition || '')}</td></tr>` : ''}
                    ${v.employeeDepartment ? `<tr><th>الإدارة</th><td>${Utils.escapeHTML(v.employeeDepartment || '')}</td></tr>` : ''}
                    `}
                    <tr><th>نوع المخالفة</th><td>${Utils.escapeHTML(v.violationType || '')}</td></tr>
                    <tr><th>تاريخ المخالفة</th><td>${v.violationDate ? Utils.formatDate(v.violationDate) : '-'}</td></tr>
                    <tr><th>الموقع</th><td>${Utils.escapeHTML(v.violationLocation || '')}</td></tr>
                    <tr><th>المكان</th><td>${Utils.escapeHTML(v.violationPlace || '')}</td></tr>
                    <tr><th>الشدة</th><td>${Utils.escapeHTML(v.severity || '')}</td></tr>
                    <tr><th>الحالة</th><td>${Utils.escapeHTML(v.status || '')}</td></tr>
                    <tr><th>القيمة المالية</th><td>${this.formatFineAmount(Number(this.getEffectiveFineAmount(v)))}</td></tr>
                    ${v.violationDetails ? `<tr><th>تفاصيل المخالفة</th><td>${Utils.escapeHTML(v.violationDetails || '')}</td></tr>` : ''}
                    <tr><th>الإجراء المتخذ</th><td>${Utils.escapeHTML(v.actionTaken || '')}</td></tr>
                </table>
                ${(() => {
                    const photoUrl = this.processPhoto(v.photo);
                    return photoUrl ? `
                    <div class="section-title">صورة المخالفة:</div>
                    <div style="text-align: center; margin: 20px 0;">
                        <img src="${Utils.escapeHTML(photoUrl)}" alt="صورة المخالفة" style="max-width: 100%; max-height: 400px; border: 1px solid #ddd; border-radius: 8px;"
                             onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22400%22 height=%22300%22/%3E%3Ctext fill=%22%23999%22 font-family=%22sans-serif%22 font-size=%2216%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3Eلا توجد صورة%3C/text%3E%3C/svg%3E';">
                    </div>
                ` : '';})()}
                `;
    },

    _generateViolationPrintDocumentHtml(violation, documentTitle) {
        const v = this.normalizeViolationRecord(violation) || violation;
        const inner = this._buildViolationReportTableHtml(v);
        const formCode = v.isoCode || `VIOL-${v.id?.substring(0, 8) || 'UNKNOWN'}`;
        if (typeof FormHeader !== 'undefined' && typeof FormHeader.generatePDFHTML === 'function') {
            return FormHeader.generatePDFHTML(
                formCode,
                documentTitle,
                inner,
                false,
                true,
                { version: '1.0' },
                v.createdAt,
                v.updatedAt
            );
        }
        const companyName = (typeof AppState !== 'undefined' && AppState.companySettings?.name)
            ? Utils.escapeHTML(AppState.companySettings.name)
            : '';
        return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${Utils.escapeHTML(documentTitle)}</title>
<style>
body{font-family:'Segoe UI',Tahoma,sans-serif;padding:24px;color:#111;} h1{font-size:1.25rem;margin:0 0 8px;} .co{color:#475569;font-size:0.9rem;margin-bottom:20px;}
table{border-collapse:collapse;width:100%;} th,td{border:1px solid #e2e8f0;padding:10px 12px;text-align:right;font-size:0.95rem;} th{background:#f1f5f9;width:30%;color:#334155;}
</style></head><body>
<h1>${Utils.escapeHTML(documentTitle)}</h1>
${companyName ? `<div class="co">${companyName}</div>` : ''}
${inner}
</body></html>`;
    },

    async _completeViolationReportPrint(htmlContent) {
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');
        if (!printWindow) {
            URL.revokeObjectURL(url);
            throw new Error('popup_blocked');
        }
        await new Promise((resolve, reject) => {
            printWindow.onload = () => {
                try {
                    const images = printWindow.document.querySelectorAll('img');
                    let imagesLoaded = 0;
                    const totalImages = images.length;
                    let done = false;
                    const finish = () => {
                        if (done) return;
                        done = true;
                        setTimeout(() => {
                            printWindow.print();
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                            resolve();
                        }, 300);
                    };
                    if (totalImages === 0) {
                        finish();
                        return;
                    }
                    const checkAllImagesLoaded = () => {
                        if (imagesLoaded >= totalImages) finish();
                    };
                    images.forEach(img => {
                        if (img.complete) {
                            imagesLoaded++;
                            checkAllImagesLoaded();
                        } else {
                            img.onload = () => { imagesLoaded++; checkAllImagesLoaded(); };
                            img.onerror = () => { imagesLoaded++; checkAllImagesLoaded(); };
                        }
                    });
                    setTimeout(() => finish(), 3500);
                } catch (e) {
                    reject(e);
                }
            };
        });
    },

    async printViolationProfessional(id) {
        const violation = AppState.appData?.violations?.find(v => v.id === id);
        if (!violation) {
            Notification.error('المخالفة غير موجودة');
            return;
        }
        try {
            Loading.show();
            const htmlContent = this._generateViolationPrintDocumentHtml(violation, 'بطاقة مخالفة — نسخة طباعة');
            await this._completeViolationReportPrint(htmlContent);
        } catch (error) {
            if (error && error.message === 'popup_blocked') {
                Notification.error('يرجى السماح بنوافذ منبثقة للطباعة');
            } else {
                Utils.safeError('خطأ في الطباعة:', error);
                Notification.error('فشل فتح نافذة الطباعة: ' + (error.message || ''));
            }
        } finally {
            Loading.hide();
        }
    },

    async exportPDF(id) {
        const violation = AppState.appData?.violations?.find(v => v.id === id);
        if (!violation) {
            Notification.error('المخالفة غير موجودة');
            return;
        }

        try {
            Loading.show();
            const htmlContent = this._generateViolationPrintDocumentHtml(violation, 'تقرير مخالفة');
            await this._completeViolationReportPrint(htmlContent);
        } catch (error) {
            if (error && error.message === 'popup_blocked') {
                Notification.error('يرجى السماح بنوافذ منبثقة للطباعة');
            } else {
                Utils.safeError('خطأ في تصدير PDF:', error);
                Notification.error('فشل في تصدير PDF: ' + (error.message || ''));
            }
        } finally {
            Loading.hide();
        }
    },

    // ===== Blacklist Register Functions =====
    /**
     * تحميل بيانات Blacklist من Google Sheets
     */
    async loadBlacklistDataAsync() {
        try {
            // التأكد من وجود AppState و Backend
            if (typeof AppState === 'undefined' || !AppState.appData) {
                AppState.appData = {};
            }
            if (!AppState.appData.blacklistRegister) {
                AppState.appData.blacklistRegister = [];
            }

            // التحقق من تفعيل Google Integration
            const isGoogleEnabled = Utils.hasCloudBackendSync();
            const isBackendAvailable = typeof Backend !== 'undefined' && typeof Backend.sendRequest === 'function';

            if (!isGoogleEnabled || !isBackendAvailable) {
                // إذا لم يكن Google Integration متاحاً، استخدام البيانات المحلية
                if (AppState.debugMode) {
                    Utils.safeLog('⚠️ Google Integration غير متاح - استخدام البيانات المحلية فقط');
                }
                return;
            }

            // تحميل البيانات من Google Sheets (بدون عرض مؤشر تحميل - الواجهة تُعرض أولاً)
            const result = await Backend.sendRequest({
                action: 'readFromSheet',
                data: {
                    sheetName: 'Blacklist_Register',
                    spreadsheetId: AppState.backendConfig?.sheets?.spreadsheetId
                }
            }).catch(error => {
                Utils.safeWarn('⚠️ تعذر تحميل بيانات Blacklist من Google Sheets:', error);
                return { success: false, data: [] };
            });

            let dataUpdated = false;
            if (result && result.success && Array.isArray(result.data)) {
                AppState.appData.blacklistRegister = result.data;
                dataUpdated = true;
                if (AppState.debugMode) {
                    Utils.safeLog(`✅ تم تحميل ${result.data.length} سجل Blacklist من Google Sheets`);
                }
            } else {
                // التأكد من وجود مصفوفة فارغة إذا لم يتم تحميل البيانات
                if (!AppState.appData.blacklistRegister) {
                    AppState.appData.blacklistRegister = [];
                }
            }

            // حفظ البيانات محلياً بعد التحميل
            if (dataUpdated && typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                try {
                    window.DataManager.save();
                } catch (saveError) {
                    if (AppState.debugMode) {
                        Utils.safeWarn('⚠️ خطأ في حفظ البيانات محلياً:', saveError);
                    }
                }
            }
        } catch (error) {
            Utils.safeError('❌ خطأ في تحميل بيانات Blacklist:', error);
            // التأكد من وجود مصفوفة فارغة في حالة الخطأ
            if (!AppState.appData.blacklistRegister) {
                AppState.appData.blacklistRegister = [];
            }
        }
    },

    /**
     * تحديث عرض Blacklist بعد تحميل البيانات
     */
    refreshBlacklistDisplay() {
        const contentContainer = document.getElementById('violations-tab-content');
        if (!contentContainer) return;

        // التحقق من أن التبويب النشط هو blacklist
        const activeTab = document.querySelector('.tab-btn.active[data-tab="blacklist"]');
        if (!activeTab) return;

        try {
            // تحديث الإحصائيات - البحث عن container الإحصائيات
            const cardBody = contentContainer.querySelector('.card-body');
            if (cardBody) {
                // البحث عن grid container للإحصائيات (قد يكون بأي من الصيغ)
                const statsContainer = cardBody.querySelector('.grid.grid-cols-1') || 
                                      cardBody.querySelector('.grid') ||
                                      cardBody.querySelector('[class*="grid-cols"]');
                if (statsContainer && statsContainer.parentElement) {
                    statsContainer.outerHTML = this.renderBlacklistStats();
                } else {
                    // إذا لم نجد container، نبحث عن أول div في card-body ونستبدله
                    const firstGrid = cardBody.querySelector('div > div.grid');
                    if (firstGrid) {
                        firstGrid.outerHTML = this.renderBlacklistStats();
                    }
                }
            }

            // تحديث الكروت
            const cardsContainer = document.getElementById('blacklist-cards-container');
            if (cardsContainer) {
                cardsContainer.innerHTML = this.renderBlacklistCards();
            }

            // تحديث الجدول
            const tableContainer = document.getElementById('blacklist-table-container');
            if (tableContainer) {
                tableContainer.innerHTML = this.renderBlacklistTable();
            }

            // إعادة إعداد Event Listeners
            this.setupBlacklistEventListeners();
        } catch (error) {
            Utils.safeWarn('⚠️ خطأ في تحديث عرض Blacklist:', error);
        }
    },

    renderBlacklistTab() {
        return `
            <div class="content-card">
                <div class="card-header">
                    <div class="flex items-center justify-between flex-wrap gap-4">
                        <h2 class="card-title">
                            <i class="fas fa-user-slash ml-2"></i>
                            سجل الممنوعين من الدخول – Blacklist
                        </h2>
                        <button id="blacklist-add-btn" class="btn-primary">
                            <i class="fas fa-plus ml-2"></i>
                            تسجيل ممنوع من الدخول جديد
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <!-- إحصائيات سريعة -->
                    ${this.renderBlacklistStats()}
                    
                    <!-- كروت عرض البيانات -->
                    <div id="blacklist-cards-container" class="mb-6">
                        ${this.renderBlacklistCards()}
                    </div>
                    
                    <!-- جدول عرض البيانات -->
                    <div id="blacklist-table-container">
                        ${this.renderBlacklistTable()}
                    </div>
                </div>
            </div>
        `;
    },

    renderBlacklistStats() {
        const blacklistRecords = AppState.appData?.blacklistRegister || [];
        const totalCount = blacklistRecords.length;
        const thisMonth = new Date().getMonth();
        const thisYear = new Date().getFullYear();
        const thisMonthCount = blacklistRecords.filter(r => {
            if (!r.banDate) return false;
            const date = new Date(r.banDate);
            return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
        }).length;

        // حساب عدد المصانع/المواقع الفريدة
        const uniqueFactoryLocation = new Set();
        blacklistRecords.forEach(r => {
            if (r.factory && r.location) {
                uniqueFactoryLocation.add(`${r.factory} - ${r.location}`);
            } else if (r.factory) {
                uniqueFactoryLocation.add(r.factory);
            } else if (r.location) {
                uniqueFactoryLocation.add(r.location);
            }
        });
        const factoryLocationCount = uniqueFactoryLocation.size;

        return `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div class="stat-card blacklist-stat-card blacklist-stat-total" style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); border: none; box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.3), 0 2px 4px -1px rgba(220, 38, 38, 0.2); transition: all 0.3s ease; cursor: pointer;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 10px 15px -3px rgba(220, 38, 38, 0.4), 0 4px 6px -2px rgba(220, 38, 38, 0.3)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 6px -1px rgba(220, 38, 38, 0.3), 0 2px 4px -1px rgba(220, 38, 38, 0.2)';">
                    <div class="stat-icon" style="background: rgba(255, 255, 255, 0.25); backdrop-filter: blur(10px); width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                        <i class="fas fa-user-slash"></i>
                    </div>
                    <div class="stat-content" style="flex: 1;">
                        <h3 class="stat-value" style="font-size: 2.5rem; font-weight: 700; color: #ffffff; margin: 0 0 8px 0; line-height: 1.2; letter-spacing: -0.5px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">${typeof totalCount === 'number' ? totalCount.toLocaleString('en-US') : totalCount}</h3>
                        <p class="stat-label" style="font-size: 1rem; font-weight: 600; color: rgba(255, 255, 255, 0.95); margin: 0; letter-spacing: 0.3px;">إجمالي الممنوعين</p>
                    </div>
                </div>
                <div class="stat-card blacklist-stat-card blacklist-stat-month" style="background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); border: none; box-shadow: 0 4px 6px -1px rgba(234, 88, 12, 0.3), 0 2px 4px -1px rgba(234, 88, 12, 0.2); transition: all 0.3s ease; cursor: pointer;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 10px 15px -3px rgba(234, 88, 12, 0.4), 0 4px 6px -2px rgba(234, 88, 12, 0.3)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 6px -1px rgba(234, 88, 12, 0.3), 0 2px 4px -1px rgba(234, 88, 12, 0.2)';">
                    <div class="stat-icon" style="background: rgba(255, 255, 255, 0.25); backdrop-filter: blur(10px); width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                        <i class="fas fa-calendar-alt"></i>
                    </div>
                    <div class="stat-content" style="flex: 1;">
                        <h3 class="stat-value" style="font-size: 2.5rem; font-weight: 700; color: #ffffff; margin: 0 0 8px 0; line-height: 1.2; letter-spacing: -0.5px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">${typeof thisMonthCount === 'number' ? thisMonthCount.toLocaleString('en-US') : thisMonthCount}</h3>
                        <p class="stat-label" style="font-size: 1rem; font-weight: 600; color: rgba(255, 255, 255, 0.95); margin: 0; letter-spacing: 0.3px;">هذا الشهر</p>
                    </div>
                </div>
                <div class="stat-card blacklist-stat-card blacklist-stat-details" style="background: linear-gradient(135deg, #d97706 0%, #b45309 100%); border: none; box-shadow: 0 4px 6px -1px rgba(217, 119, 6, 0.3), 0 2px 4px -1px rgba(217, 119, 6, 0.2); transition: all 0.3s ease; cursor: pointer;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 10px 15px -3px rgba(217, 119, 6, 0.4), 0 4px 6px -2px rgba(217, 119, 6, 0.3)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 6px -1px rgba(217, 119, 6, 0.3), 0 2px 4px -1px rgba(217, 119, 6, 0.2)';">
                    <div class="stat-icon" style="background: rgba(255, 255, 255, 0.25); backdrop-filter: blur(10px); width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="stat-content" style="flex: 1;">
                        <h3 class="stat-value" style="font-size: 2.5rem; font-weight: 700; color: #ffffff; margin: 0 0 8px 0; line-height: 1.2; letter-spacing: -0.5px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">${blacklistRecords.filter(r => r.banReason && r.banReason.length > 50).length.toLocaleString('en-US')}</h3>
                        <p class="stat-label" style="font-size: 1rem; font-weight: 600; color: rgba(255, 255, 255, 0.95); margin: 0; letter-spacing: 0.3px;">ممنوعين مع تفاصيل</p>
                    </div>
                </div>
                <div class="stat-card blacklist-stat-card blacklist-stat-factory-location" style="background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); border: none; box-shadow: 0 4px 6px -1px rgba(124, 58, 237, 0.3), 0 2px 4px -1px rgba(124, 58, 237, 0.2); transition: all 0.3s ease; cursor: pointer;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 10px 15px -3px rgba(124, 58, 237, 0.4), 0 4px 6px -2px rgba(124, 58, 237, 0.3)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 6px -1px rgba(124, 58, 237, 0.3), 0 2px 4px -1px rgba(124, 58, 237, 0.2)';">
                    <div class="stat-icon" style="background: rgba(255, 255, 255, 0.25); backdrop-filter: blur(10px); width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                        <i class="fas fa-industry"></i>
                    </div>
                    <div class="stat-content" style="flex: 1;">
                        <h3 class="stat-value" style="font-size: 2.5rem; font-weight: 700; color: #ffffff; margin: 0 0 8px 0; line-height: 1.2; letter-spacing: -0.5px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">${typeof factoryLocationCount === 'number' ? factoryLocationCount.toLocaleString('en-US') : factoryLocationCount}</h3>
                        <p class="stat-label" style="font-size: 1rem; font-weight: 600; color: rgba(255, 255, 255, 0.95); margin: 0; letter-spacing: 0.3px;">المصنع - الموقع</p>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * معالجة وعرض الصور بشكل صحيح (Base64 أو URL)
     * @param {string} photoData - بيانات الصورة (Base64 أو URL)
     * @returns {string|null} - رابط صالح للاستخدام في img src
     */
    getPhotoSource(photoData) {
        if (typeof Utils !== 'undefined' && typeof Utils.extractImageSourceCandidate === 'function') {
            return Utils.extractImageSourceCandidate(photoData);
        }
        if (!photoData) {
            return '';
        }
        return typeof photoData === 'string' ? photoData : '';
    },

    normalizeGoogleDrivePhotoUrl(url) {
        if (typeof Utils !== 'undefined' && typeof Utils.normalizeGoogleDriveImageUrl === 'function') {
            return Utils.normalizeGoogleDriveImageUrl(url);
        }
        return String(url || '').trim();
    },

    processPhoto(photoData) {
        if (typeof Utils !== 'undefined' && typeof Utils.normalizeImageSource === 'function') {
            const normalized = Utils.normalizeImageSource(photoData);
            if (normalized) {
                return normalized;
            }
        }

        const rawPhoto = this.getPhotoSource(photoData);
        if (!rawPhoto) {
            return null;
        }

        let trimmed = String(rawPhoto).trim().replace(/^['"`]+|['"`]+$/g, '');
        if (!trimmed) {
            return null;
        }

        if (trimmed.startsWith('blob:')) {
            return trimmed;
        }

        if (/^data:image\//i.test(trimmed)) {
            const commaIndex = trimmed.indexOf(',');
            if (commaIndex === -1) {
                return trimmed.replace(/\s+/g, '');
            }

            const header = trimmed.slice(0, commaIndex).replace(/\s+/g, '');
            const payload = trimmed.slice(commaIndex + 1).replace(/\s+/g, '');
            return payload ? `${header},${payload}` : null;
        }

        if (/^https?:\/\//i.test(trimmed)) {
            return this.normalizeGoogleDrivePhotoUrl(trimmed);
        }

        const compactBase64 = trimmed.replace(/\s+/g, '');
        if (compactBase64.length > 100 && /^[A-Za-z0-9+/=]+$/.test(compactBase64.substring(0, Math.min(120, compactBase64.length)))) {
            return 'data:image/jpeg;base64,' + compactBase64;
        }

        if (AppState.debugMode) {
            console.warn('⚠️ صورة غير صالحة:', trimmed.substring(0, 100));
        }
        return null;
    },

    _onBlacklistCardPhotoError(img) {
        try {
            if (!img) return;
            img.onerror = null;
            const d = document.createElement('div');
            d.className = 'w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center border-2 border-red-200 dark:border-red-800';
            d.innerHTML = '<i class="fas fa-user text-red-500 dark:text-red-400 text-2xl"></i>';
            img.replaceWith(d);
        } catch (e) { /* ignore */ }
    },

    _onBlacklistTablePhotoError(img) {
        try {
            if (!img) return;
            img.onerror = null;
            img.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22100%22 height=%22100%22/%3E%3Ctext fill=%22%23999%22 font-family=%22sans-serif%22 font-size=%2212%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3Eلا توجد صورة%3C/text%3E%3C/svg%3E';
        } catch (e) { /* ignore */ }
    },

    _hydrateBlacklistDrivePhotos() {
        try {
            if (typeof Utils.hydrateDriveProxyImages !== 'function') return;
            const fail = (img) => {
                if (!img) return;
                const cls = img.className || '';
                if (cls.indexOf('blacklist-table-photo') !== -1) {
                    this._onBlacklistTablePhotoError(img);
                } else if (cls.indexOf('blacklist-detail-photo') !== -1) {
                    this._onBlacklistTablePhotoError(img);
                } else if (cls.indexOf('blacklist-form-photo') !== -1) {
                    this._onBlacklistTablePhotoError(img);
                } else {
                    this._onBlacklistCardPhotoError(img);
                }
            };
            const cards = document.getElementById('blacklist-cards-container');
            const table = document.getElementById('blacklist-table');
            if (cards) Utils.hydrateDriveProxyImages(cards, { onFetchFail: fail });
            if (table) Utils.hydrateDriveProxyImages(table, { onFetchFail: fail });
        } catch (e) { /* ignore */ }
    },

    renderBlacklistCards() {
        const blacklistRecords = AppState.appData?.blacklistRegister || [];
        if (blacklistRecords.length === 0) {
            return `
                <div class="empty-state py-8">
                    <i class="fas fa-user-slash text-gray-400 text-5xl mb-4"></i>
                    <p class="text-gray-500 text-lg">لا توجد سجلات ممنوعين من الدخول</p>
                    <p class="text-gray-400 text-sm mt-2">انقر على "تسجيل ممنوع من الدخول جديد" لإضافة سجل جديد</p>
                </div>
            `;
        }

        const sortedRecords = [...blacklistRecords].sort((a, b) => {
            const dateA = new Date(a.banDate || a.createdAt || 0);
            const dateB = new Date(b.banDate || b.createdAt || 0);
            return dateB - dateA;
        });

        return `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${sortedRecords.map(record => {
                    const photoUrl = this.processPhoto(record);
                    const disp = photoUrl && typeof Utils.resolveDriveAwareImgDisplay === 'function'
                        ? Utils.resolveDriveAwareImgDisplay(photoUrl)
                        : { canonical: photoUrl || '', displaySrc: photoUrl || '', needsProxy: false, proxyFileId: '' };
                    const imgSrc = disp.canonical ? disp.displaySrc : '';
                    const proxyAttr = typeof Utils.driveProxyImgAttrs === 'function' ? Utils.driveProxyImgAttrs(disp) : '';
                    return `
                    <div class="content-card blacklist-card" style="position: relative; overflow: hidden;">
                        <div class="absolute top-0 right-0 w-20 h-20 bg-red-100 dark:bg-red-900/20 opacity-10 rounded-bl-full"></div>
                        <div class="relative z-10">
                            <div class="p-4">
                                <div class="flex items-start justify-between mb-3">
                                    <div class="flex items-center gap-3">
                                        ${photoUrl ? `
                                            <img src="${Utils.escapeHTML(imgSrc)}" alt="صورة"${proxyAttr}
                                                data-photo-url="${Utils.escapeHTML(photoUrl)}"
                                                class="blacklist-card-photo w-16 h-16 rounded-full object-cover border-2 border-red-200 dark:border-red-800 cursor-pointer shadow-sm"
                                                onclick="Violations.viewBlacklistPhoto(this.dataset.photoUrl)"
                                                title="انقر لعرض الصورة"
                                                onerror="Violations._onBlacklistCardPhotoError(this)">
                                        ` : `
                                            <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center border-2 border-red-200 dark:border-red-800">
                                                <i class="fas fa-user text-red-500 dark:text-red-400 text-2xl"></i>
                                            </div>
                                        `}
                                        <div>
                                            <h3 class="font-bold text-gray-800 dark:text-gray-100 text-lg">${Utils.escapeHTML(record.fullName || 'غير محدد')}</h3>
                                            <p class="text-sm text-gray-600 dark:text-gray-400">#${record.serialNumber || '-'}</p>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-1">
                                        <button onclick="Violations.editBlacklistRecord('${record.id}')" 
                                            class="btn-icon btn-icon-warning text-xs" title="تعديل">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button onclick="Violations.deleteBlacklistRecord('${record.id}')" 
                                            class="btn-icon btn-icon-danger text-xs" title="حذف">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                                
                                <div class="space-y-2 text-sm">
                                    <div class="flex items-center gap-2">
                                        <i class="fas fa-id-card text-red-500 dark:text-red-400 w-4"></i>
                                        <span class="text-gray-600 dark:text-gray-400">رقم البطاقة:</span>
                                        <span class="font-semibold text-gray-800 dark:text-gray-200">${Utils.escapeHTML(record.idNumber || '-')}</span>
                                    </div>
                                    ${record.job ? `
                                    <div class="flex items-center gap-2">
                                        <i class="fas fa-briefcase text-red-500 dark:text-red-400 w-4"></i>
                                        <span class="text-gray-600 dark:text-gray-400">الوظيفة:</span>
                                        <span class="font-semibold text-gray-800 dark:text-gray-200">${Utils.escapeHTML(record.job)}</span>
                                    </div>
                                    ` : ''}
                                    ${record.contractor ? `
                                    <div class="flex items-center gap-2">
                                        <i class="fas fa-building text-cyan-500 dark:text-cyan-400 w-4"></i>
                                        <span class="text-gray-600 dark:text-gray-400">الشركة - المقاول:</span>
                                        <span class="font-semibold text-gray-800 dark:text-gray-200">${Utils.escapeHTML(record.contractor)}</span>
                                    </div>
                                    ` : ''}
                                    <div class="flex items-center gap-2">
                                        <i class="fas fa-industry text-red-500 dark:text-red-400 w-4"></i>
                                        <span class="text-gray-600 dark:text-gray-400">المصنع:</span>
                                        <span class="font-semibold text-gray-800 dark:text-gray-200">${Utils.escapeHTML(record.factory || '-')}</span>
                                    </div>
                                    ${record.location ? `
                                    <div class="flex items-center gap-2">
                                        <i class="fas fa-map-marker-alt text-red-500 dark:text-red-400 w-4"></i>
                                        <span class="text-gray-600 dark:text-gray-400">الموقع:</span>
                                        <span class="font-semibold text-gray-800 dark:text-gray-200">${Utils.escapeHTML(record.location)}</span>
                                    </div>
                                    ` : ''}
                                    <div class="flex items-center gap-2">
                                        <i class="fas fa-calendar text-red-500 dark:text-red-400 w-4"></i>
                                        <span class="text-gray-600 dark:text-gray-400">تاريخ المنع:</span>
                                        <span class="font-semibold text-red-600 dark:text-red-400">${record.banDate ? Utils.formatDate(record.banDate) : '-'}</span>
                                    </div>
                                    ${record.banReason ? `
                                    <div class="pt-2 border-t border-red-100 dark:border-red-900/50">
                                        <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">سبب المنع:</p>
                                        <p class="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">${Utils.escapeHTML(record.banReason)}</p>
                                    </div>
                                    ` : ''}
                                </div>
                            </div>
                            <div class="bg-red-50 dark:bg-red-900/20 px-4 py-2 border-t border-red-100 dark:border-red-900/30 flex items-center justify-between text-xs">
                                <span class="text-gray-600 dark:text-gray-400">
                                    <i class="fas fa-user-edit ml-1 text-red-500 dark:text-red-400"></i>
                                    ${Utils.escapeHTML(record.editor || 'غير محدد')}
                                </span>
                                ${record.bannedBy ? `
                                <span class="text-gray-600 dark:text-gray-400">
                                    <i class="fas fa-user-shield ml-1 text-red-500 dark:text-red-400"></i>
                                    ${Utils.escapeHTML(record.bannedBy)}
                                </span>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;}).join('')}
            </div>
        `;
    },

    async showBlacklistForm(blacklistData = null) {
        const isEdit = !!blacklistData;

        // التأكد من تحميل إعدادات النماذج
        if (typeof Permissions !== 'undefined' && typeof Permissions.ensureFormSettingsState === 'function') {
            try {
                await Permissions.ensureFormSettingsState();
            } catch (error) {
                Utils.safeWarn('⚠️ خطأ في تحميل إعدادات النماذج:', error);
            }
        }

        const blacklistRecords = AppState.appData?.blacklistRegister || [];
        const nextSerial = blacklistRecords.length > 0
            ? Math.max(...blacklistRecords.map(r => parseInt(r.serialNumber) || 0)) + 1
            : 1;

        // استخدام نفس نظام تحميل المواقع والأماكن المستخدم في violations
        const sites = this.getSiteOptions();
        const siteOptions = sites.map(site =>
            `<option value="${Utils.escapeHTML(site.name)}" data-site-id="${site.id}" ${blacklistData?.factory === site.name || blacklistData?.factoryId === site.id ? 'selected' : ''}>${Utils.escapeHTML(site.name)}</option>`
        ).join('');

        // تحميل الإدارات
        const settings = AppState.appData?.formSettings || {};
        const departments = settings.departments || [];
        // تحويل الإدارات إلى قائمة للـ datalist (اسم فقط)
        const departmentList = departments.map(dept => {
            // إذا كان dept كائن، نأخذ name، وإذا كان نصًا، نستخدمه مباشرة
            return typeof dept === 'object' ? dept.name : dept;
        }).filter(Boolean);
        const departmentOptions = departmentList.map(dept =>
            `<option value="${Utils.escapeHTML(dept)}"></option>`
        ).join('');

        // الحصول على الأماكن حسب المصنع المحدد
        const selectedSiteId = blacklistData?.factoryId || sites.find(s => s.name === blacklistData?.factory)?.id || '';
        const placeOptions = selectedSiteId ? this.getPlaceOptions(selectedSiteId).map(place =>
            `<option value="${Utils.escapeHTML(place.name)}" data-place-id="${place.id}" ${blacklistData?.location === place.name || blacklistData?.locationId === place.id ? 'selected' : ''}>${Utils.escapeHTML(place.name)}</option>`
        ).join('') : '<option value="">-- اختر الموقع أولاً --</option>';

        // الحصول على المستخدم الحالي
        const currentUser = AppState.currentUser || { name: 'غير محدد', email: '' };

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-user-slash ml-2 text-red-600"></i>
                        ${isEdit ? 'تعديل بيانات الممنوع من الدخول' : 'تسجيل ممنوع من الدخول جديد'}
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" title="إغلاق">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    ${this.renderBlacklistFormContent(blacklistData, nextSerial, siteOptions, placeOptions, departmentOptions, currentUser)}
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Setup form event listeners (async)
        this.setupBlacklistFormInModal(modal, blacklistData).catch(error => {
            Utils.safeWarn('⚠️ خطأ في إعداد نموذج Blacklist:', error);
        });

        if (typeof Utils.hydrateDriveProxyImages === 'function') {
            Utils.hydrateDriveProxyImages(modal, {
                onFetchFail: (img) => this._onBlacklistTablePhotoError(img)
            });
        }

        // إغلاق النموذج عند النقر خارجه
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // إغلاق النموذج عند الضغط على ESC
        const handleEscape = (e) => {
            if (e.key === 'Escape' && document.body.contains(modal)) {
                modal.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    },

    renderBlacklistFormContent(blacklistData, nextSerial, siteOptions, placeOptions, departmentOptions, currentUser) {
        const isEdit = !!blacklistData;
        const previewPhotoUrl = this.processPhoto(blacklistData);
        const previewDisp = previewPhotoUrl && typeof Utils.resolveDriveAwareImgDisplay === 'function'
            ? Utils.resolveDriveAwareImgDisplay(previewPhotoUrl)
            : { canonical: previewPhotoUrl || '', displaySrc: previewPhotoUrl || '', needsProxy: false, proxyFileId: '' };
        const previewImgSrc = previewDisp.canonical ? previewDisp.displaySrc : '';
        const previewProxyAttr = typeof Utils.driveProxyImgAttrs === 'function' ? Utils.driveProxyImgAttrs(previewDisp) : '';
        return `
            <form id="blacklist-form" class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <!-- م (رقم مسلسل) -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-hashtag ml-2 text-blue-600"></i>
                            م (رقم مسلسل)
                        </label>
                        <input type="text" id="blacklist-serial" class="form-input" 
                            value="${isEdit ? (blacklistData.serialNumber || nextSerial) : nextSerial}" 
                            readonly>
                    </div>

                    <!-- تاريخ المنع * -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-calendar ml-2 text-red-600"></i>
                            تاريخ المنع *
                        </label>
                        <input type="date" id="blacklist-ban-date" required class="form-input" 
                            value="${blacklistData?.banDate ? new Date(blacklistData.banDate).toISOString().slice(0, 10) : ''}">
                    </div>

                    <!-- المصنع * -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-industry ml-2 text-gray-600"></i>
                            المصنع *
                        </label>
                        <select id="blacklist-factory" required class="form-input">
                            <option value="">-- اختر المصنع --</option>
                            ${siteOptions}
                        </select>
                    </div>

                    <!-- الموقع * -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-map-marker-alt ml-2 text-green-600"></i>
                            الموقع *
                        </label>
                        <select id="blacklist-location" required class="form-input">
                            <option value="">-- اختر الموقع --</option>
                            ${placeOptions}
                        </select>
                    </div>

                    <!-- الاسم رباعي * -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-user ml-2 text-purple-600"></i>
                            الاسم رباعي *
                        </label>
                        <input type="text" id="blacklist-name" required class="form-input" 
                            value="${Utils.escapeHTML(blacklistData?.fullName || '')}" 
                            placeholder="الاسم الكامل">
                    </div>

                    <!-- رقم البطاقة الشخصية * -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-id-card ml-2 text-orange-600"></i>
                            رقم البطاقة الشخصية *
                        </label>
                        <input type="text" id="blacklist-id-number" required class="form-input" 
                            value="${Utils.escapeHTML(blacklistData?.idNumber || '')}" 
                            placeholder="رقم البطاقة">
                    </div>

                    <!-- الوظيفة -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-briefcase ml-2 text-indigo-600"></i>
                            الوظيفة
                        </label>
                        <input type="text" id="blacklist-job" class="form-input" 
                            value="${Utils.escapeHTML(blacklistData?.job || '')}" 
                            placeholder="الوظيفة">
                    </div>

                    <!-- الشركة - المقاول -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-building ml-2 text-cyan-600"></i>
                            الشركة - المقاول
                        </label>
                        <input type="text" id="blacklist-contractor" class="form-input" 
                            list="blacklist-contractors-list" 
                            value="${Utils.escapeHTML(blacklistData?.contractor || '')}" 
                            placeholder="اختر أو اكتب اسم الشركة/المقاول">
                        <datalist id="blacklist-contractors-list">
                            <!-- سيتم تحميل المقاولين ديناميكياً -->
                        </datalist>
                    </div>

                    <!-- الإدارة التابع لها -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-building ml-2 text-teal-600"></i>
                            الإدارة التابع لها
                        </label>
                        <input type="text" id="blacklist-department" class="form-input" 
                            list="blacklist-departments-list" 
                            value="${Utils.escapeHTML(blacklistData?.department || '')}" 
                            placeholder="اختر أو اكتب الإدارة">
                        <datalist id="blacklist-departments-list">
                            ${departmentOptions}
                        </datalist>
                    </div>

                    <!-- القائم بالمنع -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-user-shield ml-2 text-yellow-600"></i>
                            القائم بالمنع
                        </label>
                        <input type="text" id="blacklist-banned-by" class="form-input" 
                            value="${Utils.escapeHTML(blacklistData?.bannedBy || '')}" 
                            placeholder="اسم القائم بالمنع">
                    </div>

                    <!-- محرر البيانات -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-user-edit ml-2 text-gray-600"></i>
                            محرر البيانات
                        </label>
                        <input type="text" id="blacklist-editor" class="form-input" 
                            value="${Utils.escapeHTML(blacklistData?.editor || currentUser.name)}" 
                            readonly>
                    </div>

                    <!-- الصورة الشخصية -->
                    <div class="md:col-span-2 lg:col-span-3">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-image ml-2"></i>
                            الصورة الشخصية
                        </label>
                        <input type="file" id="blacklist-photo-input" accept="image/*" class="form-input">
                        <div id="blacklist-photo-preview" class="mt-2 ${previewPhotoUrl ? '' : 'hidden'}">
                            <img src="${previewImgSrc ? Utils.escapeHTML(previewImgSrc) : ''}" alt="صورة شخصية"${previewProxyAttr}
                                class="blacklist-form-photo w-32 h-32 object-cover rounded border" id="blacklist-photo-img">
                            <button type="button" onclick="const blPhotoInput = document.getElementById('blacklist-photo-input'); if (blPhotoInput) blPhotoInput.value=''; const blPhotoPreview = document.getElementById('blacklist-photo-preview'); if (blPhotoPreview) blPhotoPreview.classList.add('hidden');" 
                                class="mt-2 text-sm text-red-600 hover:text-red-800">
                                <i class="fas fa-trash ml-1"></i>حذف الصورة
                            </button>
                        </div>
                    </div>

                    <!-- سبب المنع * -->
                    <div class="md:col-span-2 lg:col-span-3">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-exclamation-triangle ml-2 text-red-600"></i>
                            سبب المنع *
                        </label>
                        <textarea id="blacklist-ban-reason" required class="form-input" rows="3" 
                            placeholder="سبب منع الدخول">${Utils.escapeHTML(blacklistData?.banReason || '')}</textarea>
                    </div>

                    <!-- ملاحظات عامة -->
                    <div class="md:col-span-2 lg:col-span-3">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-sticky-note ml-2 text-gray-600"></i>
                            ملاحظات عامة
                        </label>
                        <textarea id="blacklist-notes" class="form-input" rows="3" 
                            placeholder="ملاحظات إضافية">${Utils.escapeHTML(blacklistData?.notes || '')}</textarea>
                    </div>
                </div>

                <div class="flex items-center justify-end gap-4 pt-4 border-t">
                    <button type="button" id="blacklist-cancel-btn" class="btn-secondary">
                        <i class="fas fa-times ml-2"></i>إلغاء
                    </button>
                    <button type="submit" id="blacklist-submit-btn" class="btn-primary">
                        <i class="fas fa-save ml-2"></i>${isEdit ? 'حفظ التعديلات' : 'تسجيل'}
                    </button>
                </div>
            </form>
        `;
    },

    async setupBlacklistFormInModal(modal, blacklistData) {
        const isEdit = !!blacklistData;
        const form = modal.querySelector('#blacklist-form');
        if (form) {
            form.dataset.editId = isEdit ? blacklistData.id : '';
        }

        // معالج النموذج
        if (form) {
            form.addEventListener('submit', (e) => this.handleBlacklistSubmit(e));
        }

        // معالج إلغاء النموذج
        const cancelBtn = modal.querySelector('#blacklist-cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                modal.remove();
            });
        }

        // معالج رفع الصورة
        const photoInput = modal.querySelector('#blacklist-photo-input');
        if (photoInput) {
            photoInput.addEventListener('change', (e) => this.handleBlacklistPhotoUpload(e));
        }

        // تحميل قائمة المقاولين في datalist
        const contractorInput = modal.querySelector('#blacklist-contractor');
        const contractorsDatalist = modal.querySelector('#blacklist-contractors-list');
        if (contractorInput && contractorsDatalist) {
            try {
                // الحصول على قائمة المقاولين
                let contractors = [];
                
                // محاولة استخدام getAllContractorsForModules
                if (typeof Contractors !== 'undefined' && typeof Contractors.getAllContractorsForModules === 'function') {
                    contractors = Contractors.getAllContractorsForModules() || [];
                }
                
                // ✅ تحسين: بديل: استخدام AppState (بما في ذلك المعتمدين) - مباشرة بدون تأخير
                if (contractors.length === 0) {
                    // دمج المقاولين النشطين فقط من مصادر مختلفة
                    const allContractors = [
                        ...(AppState.appData?.approvedContractors || []),
                        ...(AppState.appData?.contractors || [])
                    ].filter(c => c && c.isActive !== 'inactive' && c.isActive !== false && c.isActive !== 'false' && c.isActive !== 'FALSE');
                    // إزالة التكرار بناءً على ID
                    const uniqueContractors = Array.from(
                        new Map(allContractors.map(c => [c.id || c.contractorId, c])).values()
                    );
                    contractors = uniqueContractors
                        .filter(c => c && (c.name || c.companyName || c.contractorName))
                        .map(c => ({
                            id: c.id || c.contractorId || '',
                            name: (c.name || c.companyName || c.contractorName || '').trim()
                        }))
                        .filter(c => c.name && c.name !== 'غير معروف')
                        .sort((a, b) => a.name.localeCompare(b.name, 'ar', { sensitivity: 'base' }));
                }

                // إضافة المقاولين إلى datalist (اسم المقاول فقط بدون الإدارة)
                contractorsDatalist.innerHTML = contractors.map(c => 
                    `<option value="${Utils.escapeHTML(c.name)}" data-contractor-id="${c.id || ''}"></option>`
                ).join('');

                // التأكد من أن قيمة المقاول في الحقل هي اسم المقاول فقط (بدون الإدارة)
                if (blacklistData?.contractor) {
                    // إذا كانت القيمة تحتوي على " - " (فاصل بين المقاول والإدارة)، نأخذ الجزء الأول فقط
                    const contractorValue = blacklistData.contractor.split(' - ')[0].trim();
                    contractorInput.value = contractorValue;
                }
            } catch (error) {
                Utils.safeWarn('⚠️ خطأ في تحميل قائمة المقاولين:', error);
            }
        }

        // معالج تغيير المصنع (لتحميل الأماكن)
        const factorySelect = modal.querySelector('#blacklist-factory');
        if (factorySelect) {
            factorySelect.addEventListener('change', async (e) => {
                const selectedOption = e.target.selectedOptions[0];
                const siteId = selectedOption?.dataset.siteId || selectedOption?.value;
                await this.loadBlacklistPlaces(siteId);
            });

            // تحميل الأماكن عند فتح النموذج للتعديل
            if (isEdit && blacklistData?.factoryId) {
                const siteId = blacklistData.factoryId;
                try {
                    await this.loadBlacklistPlaces(siteId);
                    // تحديد الموقع بعد تحميله
                    setTimeout(() => {
                        const locationSelect = modal.querySelector('#blacklist-location');
                        if (locationSelect && blacklistData?.location) {
                            locationSelect.value = blacklistData.location;
                        }
                    }, 100);
                } catch (error) {
                    Utils.safeWarn('⚠️ خطأ في تحميل الأماكن:', error);
                }
            }
        }
    },


    renderBlacklistTable() {
        const blacklistRecords = AppState.appData?.blacklistRegister || [];
        const sortedRecords = [...blacklistRecords].sort((a, b) => {
            const dateA = new Date(a.banDate || a.createdAt || 0);
            const dateB = new Date(b.banDate || b.createdAt || 0);
            return dateB - dateA;
        });

        if (sortedRecords.length === 0) {
            return `
                <div class="mt-6">
                    <div class="empty-state">
                        <i class="fas fa-user-slash text-gray-400 text-4xl mb-4"></i>
                        <p class="text-gray-500">لا توجد سجلات ممنوعين من الدخول</p>
                    </div>
                </div>
            `;
        }

        return `
            <div class="mt-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-bold text-gray-800">
                        <i class="fas fa-list ml-2"></i>قائمة الممنوعين من الدخول
                    </h3>
                    <div class="flex items-center gap-2">
                        <input type="text" id="blacklist-search" class="form-input" 
                            placeholder="بحث..." style="width: 250px;">
                        <button id="blacklist-export-pdf" class="btn-secondary">
                            <i class="fas fa-file-pdf ml-2"></i>PDF
                        </button>
                        <button id="blacklist-export-excel" class="btn-secondary">
                            <i class="fas fa-file-excel ml-2"></i>Excel
                        </button>
                    </div>
                </div>
                <div class="table-wrapper" style="overflow-x: auto;">
                    <table class="data-table" id="blacklist-table">
                        <thead>
                            <tr>
                        <th>م</th>
                        <th>تاريخ المنع</th>
                        <th>المصنع</th>
                        <th>الموقع</th>
                        <th>الاسم رباعي</th>
                        <th>رقم البطاقة</th>
                        <th>الوظيفة</th>
                        <th>الشركة - المقاول</th>
                        <th>الإدارة</th>
                        <th>القائم بالمنع</th>
                        <th>محرر البيانات</th>
                        <th>الصورة</th>
                        <th>سبب المنع</th>
                        <th>ملاحظات</th>
                        <th>الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody id="blacklist-table-body">
                            ${sortedRecords.map(record => {
                                const photoUrl = this.processPhoto(record);
                                const disp = photoUrl && typeof Utils.resolveDriveAwareImgDisplay === 'function'
                                    ? Utils.resolveDriveAwareImgDisplay(photoUrl)
                                    : { canonical: photoUrl || '', displaySrc: photoUrl || '', needsProxy: false, proxyFileId: '' };
                                const imgSrc = disp.canonical ? disp.displaySrc : '';
                                const proxyAttr = typeof Utils.driveProxyImgAttrs === 'function' ? Utils.driveProxyImgAttrs(disp) : '';
                                return `
                                <tr>
                                    <td>${record.serialNumber || '-'}</td>
                                    <td>${record.banDate ? Utils.formatDate(record.banDate) : '-'}</td>
                                    <td>${Utils.escapeHTML(record.factory || '-')}</td>
                                    <td>${Utils.escapeHTML(record.location || '-')}</td>
                                    <td>${Utils.escapeHTML(record.fullName || '-')}</td>
                                    <td>${Utils.escapeHTML(record.idNumber || '-')}</td>
                                    <td>${Utils.escapeHTML(record.job || '-')}</td>
                                    <td>${Utils.escapeHTML(record.contractor || '-')}</td>
                                    <td>${Utils.escapeHTML(record.department || '-')}</td>
                                    <td>${Utils.escapeHTML(record.bannedBy || '-')}</td>
                                    <td>${Utils.escapeHTML(record.editor || '-')}</td>
                                    <td>
                                        ${photoUrl ? 
                `<img src="${Utils.escapeHTML(imgSrc)}" alt="صورة"${proxyAttr} class="blacklist-table-photo w-12 h-12 object-cover rounded cursor-pointer"
                                                data-photo-url="${Utils.escapeHTML(photoUrl)}"
                                                onclick="Violations.viewBlacklistPhoto(this.dataset.photoUrl)" title="انقر لعرض الصورة"
                                                onerror="Violations._onBlacklistTablePhotoError(this)">` 
                : '-'}
                                    </td>
                                    <td class="max-w-xs truncate" title="${Utils.escapeHTML(record.banReason || '')}">
                                        ${Utils.escapeHTML((record.banReason || '-').substring(0, 50))}${(record.banReason || '').length > 50 ? '...' : ''}
                                    </td>
                                    <td class="max-w-xs truncate" title="${Utils.escapeHTML(record.notes || '')}">
                                        ${Utils.escapeHTML((record.notes || '-').substring(0, 30))}${(record.notes || '').length > 30 ? '...' : ''}
                                    </td>
                                    <td>
                                        <div class="flex items-center gap-2">
                                            <button onclick="Violations.viewBlacklistDetails('${record.id}')" 
                                                class="btn-icon btn-icon-info" title="عرض التفاصيل">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            <button onclick="Violations.editBlacklistRecord('${record.id}')" 
                                                class="btn-icon btn-icon-warning" title="تعديل">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button onclick="Violations.deleteBlacklistRecord('${record.id}')" 
                                                class="btn-icon btn-icon-danger" title="حذف">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;}).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async setupBlacklistEventListeners() {
        setTimeout(async () => {
            // التأكد من تحميل البيانات
            if (!AppState.appData.blacklistRegister) {
                AppState.appData.blacklistRegister = [];
            }

            // التأكد من تحميل إعدادات النماذج
            if (typeof Permissions !== 'undefined' && typeof Permissions.ensureFormSettingsState === 'function') {
                try {
                    await Permissions.ensureFormSettingsState();
                } catch (error) {
                    Utils.safeWarn('⚠️ خطأ في تحميل إعدادات النماذج:', error);
                }
            }

            // معالج نموذج التسجيل (فقط للنموذج الموجود في الصفحة الرئيسية، ليس modal)
            const form = document.getElementById('blacklist-form');
            if (form && !form.closest('.modal-overlay')) {
                // إزالة event listener القديم إن وجد
                const newForm = form.cloneNode(true);
                form.parentNode.replaceChild(newForm, form);
                newForm.addEventListener('submit', (e) => this.handleBlacklistSubmit(e));
            }

            // معالج رفع الصورة (فقط إذا كان موجوداً في الصفحة الرئيسية)
            const photoInput = document.getElementById('blacklist-photo-input');
            if (photoInput && !photoInput.closest('.modal-overlay')) {
                photoInput.addEventListener('change', (e) => this.handleBlacklistPhotoUpload(e));
            }

            // معالج البحث
            const searchInput = document.getElementById('blacklist-search');
            if (searchInput) {
                // إزالة event listeners القديمة
                const newSearchInput = searchInput.cloneNode(true);
                searchInput.parentNode.replaceChild(newSearchInput, searchInput);
                newSearchInput.addEventListener('input', (e) => this.filterBlacklistTable(e.target.value));
            }

            // ✅ إضافة معالج زر التسجيل (مهم جداً)
            const addBtn = document.getElementById('blacklist-add-btn');
            if (addBtn) {
                // التحقق من أن listener لم يتم إضافته مسبقاً
                if (!addBtn.dataset.listenerAttached) {
                    addBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                            this.showBlacklistForm();
                        } catch (error) {
                            Utils.safeError('خطأ في فتح نموذج Blacklist:', error);
                            Notification.error('حدث خطأ أثناء فتح النموذج. يرجى المحاولة مرة أخرى.');
                        }
                    });
                    addBtn.dataset.listenerAttached = 'true';
                    if (AppState.debugMode) {
                        Utils.safeLog('✅ تم ربط زر "تسجيل ممنوع من الدخول جديد" بنجاح');
                    }
                } else {
                    if (AppState.debugMode) {
                        Utils.safeLog('ℹ️ زر "تسجيل ممنوع من الدخول جديد" مربوط مسبقاً');
                    }
                }
            } else {
                if (AppState.debugMode) {
                    Utils.safeWarn('⚠️ زر "blacklist-add-btn" غير موجود في DOM');
                }
            }

            // معالج تغيير المصنع (فقط إذا كان موجوداً في الصفحة الرئيسية)
            const factorySelect = document.getElementById('blacklist-factory');
            if (factorySelect && !factorySelect.closest('.modal-overlay')) {
                factorySelect.addEventListener('change', async (e) => {
                    const selectedOption = e.target.selectedOptions[0];
                    const siteId = selectedOption?.dataset.siteId || selectedOption?.value;
                    await this.loadBlacklistPlaces(siteId);
                });
            }

            // معالجات التصدير
            const exportPdfBtn = document.getElementById('blacklist-export-pdf');
            if (exportPdfBtn) {
                const newExportPdfBtn = exportPdfBtn.cloneNode(true);
                exportPdfBtn.parentNode.replaceChild(newExportPdfBtn, exportPdfBtn);
                newExportPdfBtn.addEventListener('click', () => this.exportBlacklistToPDF());
            }

            const exportExcelBtn = document.getElementById('blacklist-export-excel');
            if (exportExcelBtn) {
                const newExportExcelBtn = exportExcelBtn.cloneNode(true);
                exportExcelBtn.parentNode.replaceChild(newExportExcelBtn, exportExcelBtn);
                newExportExcelBtn.addEventListener('click', () => this.exportBlacklistToExcel());
            }

            this._hydrateBlacklistDrivePhotos();
        }, 100);
    },

    async handleBlacklistSubmit(e) {
        e.preventDefault();

        const form = e.target;
        const isEdit = !!form.dataset.editId;

        // معالجة الصورة
        let photo = isEdit ?
            (AppState.appData?.blacklistRegister?.find(r => r.id === form.dataset.editId)?.photo || '') : '';

        // البحث عن photoInput داخل modal
        const modal = form.closest('.modal-overlay');
        const photoInput = modal ? modal.querySelector('#blacklist-photo-input') : document.getElementById('blacklist-photo-input');
        if (photoInput?.files?.[0]) {
            const file = photoInput.files[0];
            if (file.size > 2 * 1024 * 1024) {
                Notification.error('حجم الصورة كبير جداً. الحد الأقصى 2MB');
                return;
            }
            try {
                photo = await this.convertImageToBase64(file);
            } catch (err) {
                if (AppState.debugMode) Utils.safeWarn('خطأ في تحويل الصورة:', err);
            }
        }

        // الحصول على IDs للمواقع (من داخل modal)
        const factorySelect = modal ? modal.querySelector('#blacklist-factory') : document.getElementById('blacklist-factory');
        const locationSelect = modal ? modal.querySelector('#blacklist-location') : document.getElementById('blacklist-location');

        const factoryOption = factorySelect?.selectedOptions[0];
        const locationOption = locationSelect?.selectedOptions[0];

        // الحصول على باقي الحقول
        const getFieldValue = (id) => {
            const field = modal ? modal.querySelector(`#${id}`) : document.getElementById(id);
            return field?.value || '';
        };

        const formData = {
            id: form.dataset.editId || Utils.generateId('BLACKLIST'),
            serialNumber: getFieldValue('blacklist-serial'),
            factory: factorySelect?.value || '',
            factoryId: factoryOption?.dataset.siteId || '',
            location: locationSelect?.value || '',
            locationId: locationOption?.dataset.placeId || '',
            fullName: getFieldValue('blacklist-name'),
            idNumber: getFieldValue('blacklist-id-number'),
            photo: photo,
            job: getFieldValue('blacklist-job'),
            contractor: (getFieldValue('blacklist-contractor') || '').trim().split(' - ')[0], // اسم المقاول فقط (بدون الإدارة)
            department: getFieldValue('blacklist-department'),
            banReason: getFieldValue('blacklist-ban-reason'),
            banDate: getFieldValue('blacklist-ban-date'),
            bannedBy: getFieldValue('blacklist-banned-by'),
            editor: getFieldValue('blacklist-editor'),
            notes: getFieldValue('blacklist-notes'),
            createdAt: isEdit ?
                (AppState.appData?.blacklistRegister?.find(r => r.id === form.dataset.editId)?.createdAt || new Date().toISOString()) :
                new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // رفع الصورة إذا كانت Base64
        if (photo && photo.startsWith('data:')) {
            try {
                const uploadResult = await Backend.uploadFileToDrive?.(
                    photo,
                    `blacklist_${formData.id}_${Date.now()}.jpg`,
                    'image/jpeg',
                    'Blacklist_Register'
                );
                if (uploadResult?.success && (uploadResult.directLink || uploadResult.shareableLink)) {
                    formData.photo = uploadResult.directLink || uploadResult.shareableLink;
                    if (AppState.debugMode) console.log('✅ تم رفع الصورة بنجاح:', formData.photo);
                } else {
                    // إذا فشل الرفع، نحتفظ بـ Base64 كحل مؤقت
                    if (AppState.debugMode) console.warn('⚠️ فشل في رفع الصورة، سيتم الاحتفاظ بـ Base64');
                    Notification.warning('فشل في رفع الصورة إلى Drive. سيتم حفظ الصورة مؤقتاً.');
                }
            } catch (err) {
                if (AppState.debugMode) Utils.safeWarn('❌ خطأ في رفع الصورة:', err);
                Notification.error('خطأ في رفع الصورة: ' + err.message);
                // نحتفظ بـ Base64 في حالة الفشل
            }
        }

        await this.saveBlacklistRecord(formData, isEdit);
    },

    async saveBlacklistRecord(recordData, isEdit) {
        Loading.show();
        try {
            if (!AppState.appData.blacklistRegister) {
                AppState.appData.blacklistRegister = [];
            }

            if (isEdit) {
                const index = AppState.appData.blacklistRegister.findIndex(r => r.id === recordData.id);
                if (index !== -1) {
                    AppState.appData.blacklistRegister[index] = recordData;
                } else {
                    AppState.appData.blacklistRegister.push(recordData);
                }
            } else {
                AppState.appData.blacklistRegister.push(recordData);
            }

            // حفظ محلياً
            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }

            // حفظ في Google Sheets
            try {
                await Backend.autoSave('Blacklist_Register', AppState.appData.blacklistRegister);
            } catch (err) {
                if (AppState.debugMode) Utils.safeWarn('خطأ في حفظ Google Sheets:', err);
                Notification.warning('تم الحفظ محلياً لكن فشل الحفظ في Google Sheets');
            }

            Loading.hide();
            Notification.success(`تم ${isEdit ? 'تحديث' : 'تسجيل'} السجل بنجاح`);

            // إغلاق النموذج إذا كان مفتوحاً
            const existingModal = document.querySelector('.modal-overlay');
            if (existingModal && existingModal.querySelector('#blacklist-form')) {
                existingModal.remove();
            }

            // تحديث الكروت والجدول
            const cardsContainer = document.getElementById('blacklist-cards-container');
            if (cardsContainer) {
                cardsContainer.innerHTML = this.renderBlacklistCards();
                this.setupBlacklistEventListeners();
            }

            const tableContainer = document.getElementById('blacklist-table-container');
            if (tableContainer) {
                tableContainer.innerHTML = this.renderBlacklistTable();
                this.setupBlacklistEventListeners();
            }

            // تحديث الإحصائيات
            const cardBody = document.querySelector('#violations-tab-content .card-body');
            if (cardBody) {
                const existingStats = cardBody.querySelector('.grid.grid-cols-1.md\\:grid-cols-3');
                if (existingStats) {
                    existingStats.outerHTML = this.renderBlacklistStats();
                }
            }
        } catch (error) {
            Loading.hide();
            Utils.safeError('خطأ في حفظ السجل:', error);
            Notification.error('فشل في حفظ السجل: ' + error.message);
        }
    },

    handleBlacklistPhotoUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            // البحث داخل modal أولاً
            const modal = document.querySelector('.modal-overlay');
            const preview = modal ? modal.querySelector('#blacklist-photo-preview') : document.getElementById('blacklist-photo-preview');
            const img = modal ? modal.querySelector('#blacklist-photo-img') : document.getElementById('blacklist-photo-img');
            if (preview && img) {
                img.src = event.target.result;
                preview.classList.remove('hidden');
            }
        };
        reader.readAsDataURL(file);
    },

    async loadBlacklistPlaces(siteId) {
        try {
            // التأكد من تحميل إعدادات النماذج
            if (typeof Permissions !== 'undefined' && typeof Permissions.ensureFormSettingsState === 'function') {
                await Permissions.ensureFormSettingsState();
            }

            // البحث عن locationSelect داخل modal أولاً، ثم في document
            const modal = document.querySelector('.modal-overlay');
            const locationSelect = modal ? modal.querySelector('#blacklist-location') : document.getElementById('blacklist-location');
            if (!locationSelect) return;

            locationSelect.innerHTML = '<option value="">-- اختر الموقع --</option>';

            const places = this.getPlaceOptions(siteId);

            places.forEach(place => {
                const option = document.createElement('option');
                option.value = place.name;
                option.dataset.placeId = place.id;
                option.textContent = place.name;
                locationSelect.appendChild(option);
            });
        } catch (error) {
            Utils.safeWarn('⚠️ خطأ في تحميل الأماكن:', error);
        }
    },


    filterBlacklistTable(searchTerm) {
        const tbody = document.getElementById('blacklist-table-body');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');
        const term = searchTerm.toLowerCase();

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    },

    editBlacklistRecord(recordId) {
        const record = AppState.appData?.blacklistRegister?.find(r => r.id === recordId);
        if (!record) {
            Notification.error('السجل غير موجود');
            return;
        }

        this.showBlacklistForm(record);
    },

    async deleteBlacklistRecord(recordId) {
        if (!confirm('هل أنت متأكد من حذف هذا السجل؟')) return;

        Loading.show();
        try {
            if (AppState.appData?.blacklistRegister) {
                AppState.appData.blacklistRegister = AppState.appData.blacklistRegister.filter(r => r.id !== recordId);
            }

            // حفظ محلياً
            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }

            // حفظ في Google Sheets
            try {
                await Backend.autoSave('Blacklist_Register', AppState.appData.blacklistRegister);
            } catch (err) {
                if (AppState.debugMode) Utils.safeWarn('خطأ في حفظ Google Sheets:', err);
                Notification.warning('تم الحذف محلياً لكن فشل الحفظ في Google Sheets');
            }

            Loading.hide();
            Notification.success('تم حذف السجل بنجاح');

            // إعادة تحميل التبويب
            const activeTabBtn = document.querySelector('.tab-btn.active[data-tab="blacklist"]');
            if (activeTabBtn) {
                await this.switchTab('blacklist');
            }
        } catch (error) {
            Loading.hide();
            Utils.safeError('خطأ في حذف السجل:', error);
            Notification.error('فشل في حذف السجل: ' + error.message);
        }
    },

    viewBlacklistPhoto(photoUrl) {
        if (!photoUrl) {
            Notification.error('لا توجد صورة');
            return;
        }

        // ✅ معالجة الصورة بشكل صحيح (تحويل الروابط القديمة إذا لزم)
        const processedUrl = this.processPhoto(photoUrl);
        if (!processedUrl) {
            Notification.error('رابط الصورة غير صالح');
            return;
        }

        const openPhotoModal = (src) => {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">الصورة الشخصية</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <img src="${Utils.escapeHTML(src)}" alt="صورة شخصية" style="width: 100%; max-height: 70vh; object-fit: contain;"
                         onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23ddd%22 width=%22400%22 height=%22300%22/%3E%3Ctext fill=%22%23666%22 font-family=%22sans-serif%22 font-size=%2220%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3Eفشل تحميل الصورة%3C/text%3E%3C/svg%3E';">
                </div>
            </div>
        `;
            document.body.appendChild(modal);
        };

        const disp = typeof Utils.resolveDriveAwareImgDisplay === 'function'
            ? Utils.resolveDriveAwareImgDisplay(processedUrl)
            : { needsProxy: false, proxyFileId: '' };
        if (disp.needsProxy && typeof Utils.fetchDriveImageDataUri === 'function') {
            Utils.fetchDriveImageDataUri(disp.proxyFileId).then((dataUri) => {
                if (dataUri) openPhotoModal(dataUri);
                else Notification.error('تعذر تحميل الصورة من Google Drive');
            }).catch(() => Notification.error('تعذر تحميل الصورة'));
            return;
        }

        openPhotoModal(processedUrl);
    },

    viewBlacklistDetails(recordId) {
        const record = AppState.appData?.blacklistRegister?.find(r => r.id === recordId);
        if (!record) {
            Notification.error('السجل غير موجود');
            return;
        }

        // ✅ معالجة الصورة بشكل صحيح
        const photoUrl = this.processPhoto(record);
        const photoDisp = photoUrl && typeof Utils.resolveDriveAwareImgDisplay === 'function'
            ? Utils.resolveDriveAwareImgDisplay(photoUrl)
            : { canonical: photoUrl || '', displaySrc: photoUrl || '', needsProxy: false, proxyFileId: '' };
        const photoImgSrc = photoDisp.canonical ? photoDisp.displaySrc : '';
        const photoProxyAttr = typeof Utils.driveProxyImgAttrs === 'function' ? Utils.driveProxyImgAttrs(photoDisp) : '';

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-user-slash ml-2"></i>
                        تفاصيل سجل الممنوع من الدخول
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" id="blacklist-details-content">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="text-sm font-semibold text-gray-600">الرقم التسلسلي</label>
                            <p class="text-gray-800">${Utils.escapeHTML(record.serialNumber || '-')}</p>
                        </div>
                        <div>
                            <label class="text-sm font-semibold text-gray-600">تاريخ المنع</label>
                            <p class="text-gray-800">${record.banDate ? Utils.formatDate(record.banDate) : '-'}</p>
                        </div>
                        <div>
                            <label class="text-sm font-semibold text-gray-600">المصنع</label>
                            <p class="text-gray-800">${Utils.escapeHTML(record.factory || '-')}</p>
                        </div>
                        <div>
                            <label class="text-sm font-semibold text-gray-600">الموقع</label>
                            <p class="text-gray-800">${Utils.escapeHTML(record.location || '-')}</p>
                        </div>
                        <div>
                            <label class="text-sm font-semibold text-gray-600">الاسم رباعي</label>
                            <p class="text-gray-800">${Utils.escapeHTML(record.fullName || '-')}</p>
                        </div>
                        <div>
                            <label class="text-sm font-semibold text-gray-600">رقم البطاقة</label>
                            <p class="text-gray-800">${Utils.escapeHTML(record.idNumber || '-')}</p>
                        </div>
                        <div>
                            <label class="text-sm font-semibold text-gray-600">الوظيفة</label>
                            <p class="text-gray-800">${Utils.escapeHTML(record.job || '-')}</p>
                        </div>
                        <div>
                            <label class="text-sm font-semibold text-gray-600">الشركة - المقاول</label>
                            <p class="text-gray-800">${Utils.escapeHTML(record.contractor || '-')}</p>
                        </div>
                        <div>
                            <label class="text-sm font-semibold text-gray-600">الإدارة</label>
                            <p class="text-gray-800">${Utils.escapeHTML(record.department || '-')}</p>
                        </div>
                        <div>
                            <label class="text-sm font-semibold text-gray-600">القائم بالمنع</label>
                            <p class="text-gray-800">${Utils.escapeHTML(record.bannedBy || '-')}</p>
                        </div>
                        <div>
                            <label class="text-sm font-semibold text-gray-600">محرر البيانات</label>
                            <p class="text-gray-800">${Utils.escapeHTML(record.editor || '-')}</p>
                        </div>
                        ${record.createdAt ? `
                        <div>
                            <label class="text-sm font-semibold text-gray-600">تاريخ الإنشاء</label>
                            <p class="text-gray-800">${Utils.formatDateTime(record.createdAt)}</p>
                        </div>
                        ` : ''}
                        ${record.updatedAt ? `
                        <div>
                            <label class="text-sm font-semibold text-gray-600">تاريخ آخر تحديث</label>
                            <p class="text-gray-800">${Utils.formatDateTime(record.updatedAt)}</p>
                        </div>
                        ` : ''}
                    </div>
                    ${photoUrl ? `
                    <div class="mt-4">
                        <label class="text-sm font-semibold text-gray-600 mb-2 block">الصورة الشخصية</label>
                        <div class="flex justify-center">
                            <img src="${Utils.escapeHTML(photoImgSrc)}" alt="صورة شخصية"${photoProxyAttr}
                                class="blacklist-detail-photo max-w-xs max-h-64 object-cover rounded-lg cursor-pointer border-2 border-gray-200"
                                data-photo-url="${Utils.escapeHTML(photoUrl)}"
                                onclick="Violations.viewBlacklistPhoto(this.dataset.photoUrl)"
                                title="انقر لعرض الصورة بحجم كامل"
                                onerror="Violations._onBlacklistTablePhotoError(this)">
                        </div>
                    </div>
                    ` : ''}
                    <div class="mt-4">
                        <label class="text-sm font-semibold text-gray-600 mb-2 block">سبب المنع</label>
                        <p class="text-gray-800 bg-gray-50 p-3 rounded-lg border border-gray-200 whitespace-pre-wrap">${Utils.escapeHTML(record.banReason || '-')}</p>
                    </div>
                    ${record.notes ? `
                    <div class="mt-4">
                        <label class="text-sm font-semibold text-gray-600 mb-2 block">ملاحظات</label>
                        <p class="text-gray-800 bg-gray-50 p-3 rounded-lg border border-gray-200 whitespace-pre-wrap">${Utils.escapeHTML(record.notes)}</p>
                    </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="Violations.printBlacklistDetails('${recordId}')">
                        <i class="fas fa-print ml-2"></i>طباعة
                    </button>
                    <button type="button" class="btn-warning" onclick="Violations.editBlacklistRecord('${recordId}'); this.closest('.modal-overlay').remove();">
                        <i class="fas fa-edit ml-2"></i>تعديل
                    </button>
                    <button type="button" class="btn-danger" onclick="if(confirm('هل أنت متأكد من حذف هذا السجل؟')) { Violations.deleteBlacklistRecord('${recordId}'); this.closest('.modal-overlay').remove(); }">
                        <i class="fas fa-trash ml-2"></i>حذف
                    </button>
                    <button type="button" class="btn-primary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (typeof Utils.hydrateDriveProxyImages === 'function') {
            Utils.hydrateDriveProxyImages(modal, {
                onFetchFail: (img) => this._onBlacklistTablePhotoError(img)
            });
        }
    },

    printBlacklistDetails(recordId) {
        const record = AppState.appData?.blacklistRegister?.find(r => r.id === recordId);
        if (!record) {
            Notification.error('السجل غير موجود');
            return;
        }

        // ✅ معالجة الصورة بشكل صحيح
        const photoUrl = this.processPhoto(record);

        try {
            Loading.show('جاري إعداد الطباعة...');

            const formCode = `BLACKLIST-${(record.id || record.serialNumber || 'UNKNOWN').substring(0, 12)}`;
            const title = 'تفاصيل الممنوع من الدخول - Blacklist Details';

            // بناء محتوى التقرير
            const content = `
                <div class="summary-grid">
                    <div class="summary-card">
                        <span class="summary-label">الرقم التسلسلي</span>
                        <span class="summary-value">${Utils.escapeHTML(record.serialNumber || '-')}</span>
                    </div>
                    <div class="summary-card">
                        <span class="summary-label">تاريخ المنع</span>
                        <span class="summary-value">${record.banDate ? Utils.formatDate(record.banDate) : '-'}</span>
                    </div>
                    <div class="summary-card">
                        <span class="summary-label">المصنع</span>
                        <span class="summary-value">${Utils.escapeHTML(record.factory || '-')}</span>
                    </div>
                    <div class="summary-card">
                        <span class="summary-label">الموقع</span>
                        <span class="summary-value">${Utils.escapeHTML(record.location || '-')}</span>
                    </div>
                </div>

                <div class="section-title">معلومات الشخص الممنوع</div>
                <table class="report-table">
                    <tr>
                        <th style="width: 30%;">الاسم رباعي</th>
                        <td>${Utils.escapeHTML(record.fullName || '-')}</td>
                    </tr>
                    <tr>
                        <th>رقم البطاقة</th>
                        <td>${Utils.escapeHTML(record.idNumber || '-')}</td>
                    </tr>
                    <tr>
                        <th>الوظيفة</th>
                        <td>${Utils.escapeHTML(record.job || '-')}</td>
                    </tr>
                    <tr>
                        <th>الشركة - المقاول</th>
                        <td>${Utils.escapeHTML(record.contractor || '-')}</td>
                    </tr>
                    <tr>
                        <th>الإدارة</th>
                        <td>${Utils.escapeHTML(record.department || '-')}</td>
                    </tr>
                </table>

                ${photoUrl ? `
                <div class="section-title">الصورة الشخصية</div>
                <div style="text-align: center; margin: 20px 0;">
                    <img src="${Utils.escapeHTML(photoUrl)}" alt="صورة شخصية" style="max-width: 300px; max-height: 400px; border: 2px solid #ddd; border-radius: 8px; object-fit: contain;" 
                         onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22400%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22300%22 height=%22400%22/%3E%3Ctext fill=%22%23999%22 font-family=%22sans-serif%22 font-size=%2216%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3Eفشل تحميل الصورة%3C/text%3E%3C/svg%3E';">
                </div>
                ` : ''}

                <div class="section-title">تفاصيل المنع</div>
                <table class="report-table">
                    <tr>
                        <th style="width: 30%;">سبب المنع</th>
                        <td style="white-space: pre-wrap;">${Utils.escapeHTML(record.banReason || '-')}</td>
                    </tr>
                    ${record.notes ? `
                    <tr>
                        <th>ملاحظات</th>
                        <td style="white-space: pre-wrap;">${Utils.escapeHTML(record.notes)}</td>
                    </tr>
                    ` : ''}
                    <tr>
                        <th>القائم بالمنع</th>
                        <td>${Utils.escapeHTML(record.bannedBy || '-')}</td>
                    </tr>
                    <tr>
                        <th>محرر البيانات</th>
                        <td>${Utils.escapeHTML(record.editor || '-')}</td>
                    </tr>
                    ${record.createdAt ? `
                    <tr>
                        <th>تاريخ الإنشاء</th>
                        <td>${Utils.formatDateTime(record.createdAt)}</td>
                    </tr>
                    ` : ''}
                    ${record.updatedAt ? `
                    <tr>
                        <th>تاريخ آخر تحديث</th>
                        <td>${Utils.formatDateTime(record.updatedAt)}</td>
                    </tr>
                    ` : ''}
                </table>
            `;

            // استخدام FormHeader.generatePDFHTML لإضافة الهيدر
            const htmlContent = typeof FormHeader !== 'undefined' && typeof FormHeader.generatePDFHTML === 'function'
                ? FormHeader.generatePDFHTML(
                    formCode,
                    title,
                    content,
                    false,  // includeQrInHeader = false
                    true,   // includeQrInFooter = true
                    {
                        version: '1.0',
                        releaseDate: record.createdAt || new Date().toISOString(),
                        revisionDate: record.updatedAt || record.createdAt || new Date().toISOString(),
                        'الرقم التسلسلي': record.serialNumber || record.id || '',
                        qrData: {
                            type: 'Blacklist',
                            id: record.id,
                            serialNumber: record.serialNumber
                        }
                    },
                    record.createdAt || new Date().toISOString(),
                    record.updatedAt || record.createdAt || new Date().toISOString()
                )
                : `<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${title}</title></head><body>${content}</body></html>`;

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
                Notification.error('يرجى السماح للنوافذ المنبثقة لعرض التقرير');
            }
        } catch (error) {
            Loading.hide();
            Utils.safeError('خطأ في طباعة التفاصيل:', error);
            Notification.error('فشل في الطباعة: ' + error.message);
        }
    },

    async exportBlacklistToPDF() {
        try {
            const blacklistRecords = AppState.appData?.blacklistRegister || [];
            if (blacklistRecords.length === 0) {
                Notification.warning('لا توجد بيانات للتصدير');
                return;
            }

            Loading.show('جاري إنشاء PDF...');

            // محاولة استخدام jsPDF أولاً
            if (typeof window.jsPDF !== 'undefined') {
                try {
                    const { jsPDF } = window.jsPDF;
                    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation

                    // العنوان
                    doc.setFontSize(18);
                    doc.text('قائمة الممنوعين من الدخول - Blacklist Register', 150, 15, { align: 'center' });

                    // المعلومات
                    doc.setFontSize(10);
                    doc.text(`تاريخ التصدير: ${Utils.formatDateTime(new Date().toISOString())}`, 14, 22);
                    doc.text(`عدد السجلات: ${blacklistRecords.length}`, 14, 27);

                    // البيانات
                    const tableData = blacklistRecords.map(record => [
                        record.serialNumber || '-',
                        record.banDate ? Utils.formatDate(record.banDate) : '-',
                        Utils.escapeHTML(record.factory || '-'),
                        Utils.escapeHTML(record.location || '-'),
                        Utils.escapeHTML(record.fullName || '-'),
                        Utils.escapeHTML(record.idNumber || '-'),
                        Utils.escapeHTML(record.job || '-'),
                        Utils.escapeHTML(record.contractor || '-'),
                        Utils.escapeHTML(record.department || '-'),
                        Utils.escapeHTML(record.bannedBy || '-'),
                        Utils.escapeHTML(record.banReason || '-').substring(0, 50)
                    ]);

                    if (typeof doc.autoTable !== 'undefined') {
                        doc.autoTable({
                            head: [['م', 'تاريخ المنع', 'المصنع', 'الموقع', 'الاسم رباعي', 'رقم البطاقة', 'الوظيفة', 'الشركة', 'الإدارة', 'القائم بالمنع', 'سبب المنع']],
                            body: tableData,
                            startY: 35,
                            styles: { fontSize: 7, font: 'Arial', cellPadding: 2 },
                            headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 8 },
                            alternateRowStyles: { fillColor: [245, 247, 250] },
                            margin: { left: 14, right: 14 },
                            overflow: 'linebreak'
                        });
                    } else {
                        // Fallback if autoTable is not available
                        let y = 35;
                        tableData.forEach((row, index) => {
                            if (y > 180) {
                                doc.addPage();
                                y = 20;
                            }
                            doc.setFontSize(8);
                            doc.text(`${index + 1}. ${row[4]} - ${row[3]}`, 14, y);
                            y += 7;
                        });
                    }

                    // حفظ الملف
                    const fileName = `قائمة_الممنوعين_من_الدخول_${new Date().toISOString().slice(0, 10)}.pdf`;
                    doc.save(fileName);
                    Loading.hide();
                    Notification.success('تم تصدير البيانات إلى PDF بنجاح');
                    return;
                } catch (pdfError) {
                    Utils.safeWarn('فشل استخدام jsPDF، سيتم استخدام طريقة HTML:', pdfError);
                }
            }

            // Fallback: استخدام HTML للطباعة
            const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <title>قائمة الممنوعين من الدخول</title>
    <style>
        @media print {
            @page { margin: 1cm; size: A4 landscape; }
            body { margin: 0; }
            .no-print { display: none !important; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif;
            padding: 20px;
        }
        .header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 3px solid #003865;
            padding-bottom: 15px;
        }
        .header h1 {
            color: #003865;
            font-size: 24px;
            margin-bottom: 5px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 6px;
            text-align: right;
        }
        th {
            background: #3b82f6;
            color: white;
            font-weight: bold;
        }
        tr:nth-child(even) {
            background: #f5f7fa;
        }
        .print-btn {
            position: fixed;
            top: 20px;
            left: 20px;
            padding: 12px 24px;
            background: #003865;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
        }
    </style>
</head>
<body>
    <button class="print-btn no-print" onclick="window.print()">
        <i class="fas fa-print"></i> طباعة
    </button>
    <div class="header">
        <h1>قائمة الممنوعين من الدخول - Blacklist Register</h1>
        <p>تاريخ التصدير: ${Utils.formatDateTime(new Date().toISOString())} | عدد السجلات: ${blacklistRecords.length}</p>
    </div>
    <table>
        <thead>
            <tr>
                <th>م</th>
                <th>تاريخ المنع</th>
                <th>المصنع</th>
                <th>الموقع</th>
                <th>الاسم رباعي</th>
                <th>رقم البطاقة</th>
                <th>الوظيفة</th>
                <th>الشركة - المقاول</th>
                <th>الإدارة</th>
                <th>القائم بالمنع</th>
                <th>محرر البيانات</th>
                <th>سبب المنع</th>
                <th>ملاحظات</th>
            </tr>
        </thead>
        <tbody>
            ${blacklistRecords.map(record => `
                <tr>
                    <td>${Utils.escapeHTML(record.serialNumber || '-')}</td>
                    <td>${record.banDate ? Utils.formatDate(record.banDate) : '-'}</td>
                    <td>${Utils.escapeHTML(record.factory || '-')}</td>
                    <td>${Utils.escapeHTML(record.location || '-')}</td>
                    <td>${Utils.escapeHTML(record.fullName || '-')}</td>
                    <td>${Utils.escapeHTML(record.idNumber || '-')}</td>
                    <td>${Utils.escapeHTML(record.job || '-')}</td>
                    <td>${Utils.escapeHTML(record.contractor || '-')}</td>
                    <td>${Utils.escapeHTML(record.department || '-')}</td>
                    <td>${Utils.escapeHTML(record.bannedBy || '-')}</td>
                    <td>${Utils.escapeHTML(record.editor || '-')}</td>
                    <td>${Utils.escapeHTML((record.banReason || '-').substring(0, 100))}</td>
                    <td>${Utils.escapeHTML((record.notes || '-').substring(0, 50))}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
</body>
</html>`;

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
                Notification.error('يرجى السماح للنوافذ المنبثقة لعرض التقرير');
            }
        } catch (error) {
            Loading.hide();
            Utils.safeError('خطأ في تصدير PDF:', error);
            Notification.error('فشل في تصدير PDF: ' + error.message);
        }
    },

    exportBlacklistToExcel() {
        try {
            const blacklistRecords = AppState.appData?.blacklistRegister || [];
            if (blacklistRecords.length === 0) {
                Notification.warning('لا توجد بيانات للتصدير');
                return;
            }

            Loading.show('جاري إنشاء ملف Excel...');

            if (typeof XLSX === 'undefined') {
                Loading.hide();
                Notification.error('مكتبة Excel غير متاحة. يرجى التأكد من تحميل مكتبة SheetJS');
                return;
            }

            // تحضير البيانات
            const excelData = blacklistRecords.map(record => ({
                'م': record.serialNumber || '',
                'تاريخ المنع': record.banDate ? Utils.formatDate(record.banDate) : '',
                'المصنع': record.factory || '',
                'الموقع': record.location || '',
                'الاسم رباعي': record.fullName || '',
                'رقم البطاقة': record.idNumber || '',
                'الوظيفة': record.job || '',
                'الشركة - المقاول': record.contractor || '',
                'الإدارة': record.department || '',
                'القائم بالمنع': record.bannedBy || '',
                'محرر البيانات': record.editor || '',
                'سبب المنع': record.banReason || '',
                'ملاحظات': record.notes || '',
                'تاريخ الإنشاء': record.createdAt ? Utils.formatDateTime(record.createdAt) : '',
                'تاريخ آخر تحديث': record.updatedAt ? Utils.formatDateTime(record.updatedAt) : ''
            }));

            // إنشاء workbook
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(excelData);

            // تحديد عرض الأعمدة
            const columnWidths = [
                { wch: 8 },   // م
                { wch: 12 },  // تاريخ المنع
                { wch: 15 },  // المصنع
                { wch: 15 },  // الموقع
                { wch: 25 },  // الاسم رباعي
                { wch: 15 },  // رقم البطاقة
                { wch: 20 },  // الوظيفة
                { wch: 20 },  // الشركة - المقاول
                { wch: 15 },  // الإدارة
                { wch: 20 },  // القائم بالمنع
                { wch: 20 },  // محرر البيانات
                { wch: 40 },  // سبب المنع
                { wch: 40 },  // ملاحظات
                { wch: 18 },  // تاريخ الإنشاء
                { wch: 18 }   // تاريخ آخر تحديث
            ];
            worksheet['!cols'] = columnWidths;

            // إضافة ورقة العمل إلى الكتاب
            XLSX.utils.book_append_sheet(workbook, worksheet, 'قائمة الممنوعين');

            // حفظ الملف
            const date = new Date().toISOString().slice(0, 10);
            const fileName = `قائمة_الممنوعين_من_الدخول_${date}.xlsx`;
            XLSX.writeFile(workbook, fileName);

            Loading.hide();
            Notification.success('تم تصدير البيانات إلى Excel بنجاح');
        } catch (error) {
            Loading.hide();
            Utils.safeError('خطأ في تصدير Excel:', error);
            Notification.error('فشل في تصدير Excel: ' + error.message);
        }
    }
};

// ===== Export module to global scope =====
// تصدير الموديول إلى window فوراً لضمان توافره
(function () {
    'use strict';
    try {
        if (typeof window !== 'undefined' && typeof Violations !== 'undefined') {
            window.Violations = Violations;

            // إشعار عند تحميل الموديول بنجاح
            if (typeof AppState !== 'undefined' && AppState.debugMode && typeof Utils !== 'undefined' && Utils.safeLog) {
                Utils.safeLog('✅ Violations module loaded and available on window.Violations');
            }
        }
    } catch (error) {
        console.error('❌ خطأ في تصدير Violations:', error);
        // محاولة التصدير مرة أخرى حتى في حالة الخطأ
        if (typeof window !== 'undefined' && typeof Violations !== 'undefined') {
            try {
                window.Violations = Violations;
            } catch (e) {
                console.error('❌ فشل تصدير Violations:', e);
            }
        }
    }
})();

// استخدام الثوابت من contractors.js لتجنب التكرار
// CONTRACTOR_EVALUATION_DEFAULT_ITEMS موجود في contractors.js
// CONTRACTOR_APPROVAL_REQUIREMENTS_DEFAULT موجود في contractors.js
// جميع الثوابت المتعلقة بالمقاولين موجودة في contractors.js
