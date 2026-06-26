/**
 * Data Manager Service
 * Handles local data storage, sync queue management, and configuration persistence
 */

const DataManager = {
    _pendingSyncQueue: null,
    /** حد آمن لحجم بيانات التطبيق في localStorage (المتصفحات غالباً ~5MB للمجال كاملاً) */
    SAFE_APP_DATA_BYTES: 6 * 1024 * 1024,

    _isSaasTenantMode() {
        return !!(typeof window !== 'undefined' && window.SAAS_CONFIG && window.SAAS_CONFIG.useSupabaseBackend);
    },

    _lsKey(base) {
        if (this._isSaasTenantMode() && window.SaaSTenantCache) {
            return window.SaaSTenantCache.scopedKey(base);
        }
        return base;
    },

    _lsGet(base) {
        if (this._isSaasTenantMode() && (!window.SaaSTenantCache || !window.SaaSTenantCache.getTenantId())) {
            return null;
        }
        try {
            return localStorage.getItem(this._lsKey(base));
        } catch (_e) {
            return null;
        }
    },

    _lsSet(base, value) {
        try {
            localStorage.setItem(this._lsKey(base), value);
            return true;
        } catch (_e) {
            return false;
        }
    },

    _lsRemove(base) {
        try {
            localStorage.removeItem(this._lsKey(base));
            return true;
        } catch (_e) {
            return false;
        }
    },
    /** أقصى عدد عناصر للمصفوفات الكبيرة في النسخة المخففة */
    MAX_ITEMS_PER_ARRAY_IN_LIGHT: 400,
    _lastLightSaveNotification: 0,
    _hasShownLargeDataWarning: false,

    /**
     * تقدير حجم استخدام localStorage بالبايتات (للتشخيص فقط)
     */
    getLocalStorageSize() {
        try {
            let total = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) total += (localStorage.getItem(key) || '').length * 2; // UTF-16
            }
            return total;
        } catch (e) {
            return 0;
        }
    },

    /**
     * بناء نسخة مخففة من appData (قص المصفوفات الكبيرة) لتجنب امتلاء التخزين
     * البيانات الكاملة تبقى في الذاكرة وفي Google Sheets
     */
    buildLightAppData(appData) {
        if (!appData || typeof appData !== 'object') return appData;
        const heavyKeys = [
            'training', 'trainingSessions', 'trainingCertificates', 'trainingAttendance',
            'contractorTrainings', 'violations', 'blacklistRegister', 'incidents',
            'dailyObservations', 'dailySafetyCheckList', 'ptwRegistry', 'trainingAnalysisData',
            'contractorEvaluations', 'contractorApprovalRequests', 'contractorDeletionRequests',
            'annualTrainingPlans', 'nearmiss', 'inspections', 'chemicalInventory',
            'clinicVisits', 'clinicMedications', 'clinicInventory', 'clinicInjuries', 'clinicSickLeave'
        ];
        const maxItems = this.MAX_ITEMS_PER_ARRAY_IN_LIGHT;
        const out = {};
        // تتبع الحقول التي تم بترها مع عدد العناصر الحقيقي
        const truncatedFields = {};

        /**
         * إزالة حقول base64 الكبيرة (صور، مرفقات) من سجل واحد
         * لا تُحذف البيانات من الذاكرة — فقط من النسخة المحلية المحفوظة
         */
        const stripHeavyFields = (record) => {
            if (!record || typeof record !== 'object') return record;
            const stripped = { ...record };
            // حذف الصور الكبيرة base64
            for (const field of ['photo', 'photoBase64', 'image', 'imageBase64', 'signature', 'signatureBase64']) {
                if (typeof stripped[field] === 'string' && stripped[field].startsWith('data:')) {
                    stripped[field] = '__stripped__';
                }
            }
            // تقليص المرفقات إلى أسمائها فقط (بدون محتوى base64)
            if (Array.isArray(stripped.attachments)) {
                stripped.attachments = stripped.attachments.map(a => {
                    if (!a || typeof a !== 'object') return a;
                    const { name, fileName, type, size } = a;
                    return { name, fileName, type, size, __stripped: true };
                });
            }
            return stripped;
        };

        for (const key of Object.keys(appData)) {
            const val = appData[key];
            if (heavyKeys.indexOf(key) >= 0 && Array.isArray(val)) {
                // 1. اقتطاع العناصر الزائدة
                const sliced = val.length > maxItems ? val.slice(-maxItems) : val;
                if (val.length > maxItems) truncatedFields[key] = val.length;
                // 2. إزالة base64 من كل عنصر
                out[key] = sliced.map(stripHeavyFields);
            } else if (key === 'employeeTrainingMatrix' && val && typeof val === 'object') {
                const entries = Object.entries(val);
                if (entries.length > 500) {
                    out[key] = Object.fromEntries(entries.slice(-500));
                    truncatedFields[key] = entries.length;
                } else {
                    out[key] = val;
                }
            } else {
                out[key] = val;
            }
        }

        // إضافة metadata تشير إلى أن هذه نسخة مخففة مبتورة
        out._lightDataMeta = {
            isLight: true,
            truncatedAt: Date.now(),
            fields: truncatedFields
        };

        return out;
    },

    /**
     * مسح عناصر تخزين غير ضرورية لتحرير مساحة عند امتلاء التخزين
     */
    _clearNonEssentialStorage() {
        try {
            this._lsRemove('hse_pending_sync_queue');
            if (AppState.debugMode) Utils.safeLog('ℹ️ تم مسح قائمة المزامنة المعلقة لتحرير مساحة');
        } catch (e) {
            Utils.safeWarn('⚠️ فشل مسح عناصر التخزين:', e);
        }
    },

    /**
     * تحميل قائمة المزامنة المعلقة من localStorage
     */
    loadPendingSyncQueue() {
        try {
            const saved = this._lsGet('hse_pending_sync_queue');
            if (saved) {
                const parsed = JSON.parse(saved);
                const rawQueue = Array.isArray(parsed) ? parsed : [];
                // ترحيل متوافق: تطبيع payloads القديمة عند التحميل قبل أي retry
                this._pendingSyncQueue = rawQueue.map((item) => {
                    if (!item || typeof item !== 'object') return item;
                    const sheetName = item.sheetName;
                    const normalizedData = (typeof Backend !== 'undefined' && typeof Backend.prepareSheetPayload === 'function')
                        ? Backend.prepareSheetPayload(sheetName, item.data)
                        : item.data;
                    return { ...item, data: normalizedData };
                });
                this.savePendingSyncQueue();
            } else {
                this._pendingSyncQueue = [];
            }
        } catch (error) {
            Utils.safeWarn('⚠️ خطأ في تحميل قائمة المزامنة المعلقة:', error);
            this._pendingSyncQueue = [];
        }
    },

    /**
     * حفظ قائمة المزامنة المعلقة في localStorage
     */
    savePendingSyncQueue() {
        try {
            if (this._pendingSyncQueue && this._pendingSyncQueue.length > 0) {
                this._lsSet('hse_pending_sync_queue', Utils.safeStringify(this._pendingSyncQueue));
            } else {
                this._lsRemove('hse_pending_sync_queue');
            }
        } catch (error) {
            Utils.safeWarn('⚠️ خطأ في حفظ قائمة المزامنة المعلقة:', error);
        }
    },

    /**
     * إضافة زيارة واحدة إلى قائمة المزامنة المعلقة (Supabase/SaaS).
     */
    addClinicVisitToPendingSync(visitRecord, timestamp = null) {
        if (!visitRecord || typeof visitRecord !== 'object') return;
        if (!this._pendingSyncQueue) {
            this.loadPendingSyncQueue();
        }
        const visitId = String(visitRecord.id || '').trim();
        if (!visitId) return;

        const existingIndex = this._pendingSyncQueue.findIndex(
            (item) => item.sheetName === 'ClinicVisit' && item.recordId === visitId
        );

        const pendingItem = {
            sheetName: 'ClinicVisit',
            recordId: visitId,
            data: JSON.parse(Utils.safeStringify(visitRecord)),
            timestamp: timestamp || new Date().toISOString(),
            retryCount: existingIndex >= 0 ? (this._pendingSyncQueue[existingIndex].retryCount || 0) : 0
        };

        if (existingIndex >= 0) {
            this._pendingSyncQueue[existingIndex] = pendingItem;
        } else {
            this._pendingSyncQueue.push(pendingItem);
        }

        this.savePendingSyncQueue();
        Utils.safeLog(`✅ تمت إضافة زيارة ${visitId} إلى قائمة المزامنة المعلقة`);
    },

    /**
     * إضافة عنصر جديد إلى قائمة المزامنة المعلقة
     */
    addToPendingSync(sheetName, data, timestamp = null) {
        if (!this._pendingSyncQueue) {
            this.loadPendingSyncQueue();
        }
        
        // البحث عن العنصر - إذا كان موجوداً يتم تحديثه بدلاً من إضافة نسخة جديدة
        const existingIndex = this._pendingSyncQueue.findIndex(
            item => item.sheetName === sheetName
        );

        const normalizedData = (typeof Backend !== 'undefined' && typeof Backend.prepareSheetPayload === 'function')
            ? Backend.prepareSheetPayload(sheetName, data)
            : data;

        const pendingItem = {
            sheetName,
            data: JSON.parse(Utils.safeStringify(normalizedData)), // نسخ عميق
            timestamp: timestamp || new Date().toISOString(),
            retryCount: existingIndex >= 0 ? this._pendingSyncQueue[existingIndex].retryCount || 0 : 0
        };
        
        if (existingIndex >= 0) {
            this._pendingSyncQueue[existingIndex] = pendingItem;
        } else {
            this._pendingSyncQueue.push(pendingItem);
        }
        
        this.savePendingSyncQueue();
        Utils.safeLog(`✅ تمت إضافة ${sheetName} إلى قائمة المزامنة المعلقة بنجاح`);
    },
    
    /**
     * إزالة عنصر من قائمة المزامنة المعلقة بعد نجاح المزامنة
     */
    removeFromPendingSync(sheetName, recordId = null) {
        if (!this._pendingSyncQueue) {
            this.loadPendingSyncQueue();
        }

        const index = this._pendingSyncQueue.findIndex((item) => {
            if (item.sheetName !== sheetName) return false;
            if (recordId != null && item.recordId) {
                return String(item.recordId) === String(recordId);
            }
            return !item.recordId;
        });
        if (index >= 0) {
            this._pendingSyncQueue.splice(index, 1);
            this.savePendingSyncQueue();
        }
    },

    /**
     * مزامنة زيارات العيادة المعلّقة عبر Supabase RPC.
     */
    async _retryPendingClinicVisitsSaas(queueCopy, results, maxRetries) {
        if (typeof Backend === 'undefined' || typeof Backend.sendRequest !== 'function') {
            return;
        }

        for (const item of queueCopy) {
            if (item.sheetName !== 'ClinicVisit' || !item.data) continue;
            if ((item.retryCount || 0) >= maxRetries) {
                this.removeFromPendingSync('ClinicVisit', item.recordId);
                results.failed++;
                results.errors.push(`ClinicVisit/${item.recordId || '?'}: تجاوز الحد الأقصى للمحاولات`);
                continue;
            }

            item.retryCount = (item.retryCount || 0) + 1;
            try {
                const visit = item.data;
                const vr = await Backend.sendRequest({
                    action: 'addClinicVisit',
                    data: { ...visit, __timeoutMs: 60000 }
                });
                if (!vr || vr.success !== true) {
                    throw new Error((vr && vr.message) || 'لم يُؤكد الخادم حفظ الزيارة');
                }
                this.removeFromPendingSync('ClinicVisit', item.recordId || visit.id);
                results.synced++;
                Utils.safeLog(`✅ [SaaS] تمت مزامنة زيارة ${item.recordId || visit.id}`);
            } catch (error) {
                const index = this._pendingSyncQueue.findIndex(
                    (i) => i.sheetName === 'ClinicVisit' && String(i.recordId) === String(item.recordId)
                );
                if (index >= 0) {
                    this._pendingSyncQueue[index] = item;
                }
                this.savePendingSyncQueue();
                results.failed++;
                const errorMsg = (error && error.message) || 'خطأ غير معروف';
                results.errors.push(`ClinicVisit/${item.recordId || '?'}: ${errorMsg}`);
                Utils.safeWarn(`⚠️ [SaaS] فشلت مزامنة زيارة ${item.recordId}:`, errorMsg);
            }
        }
    },
    
    /**
     * إعادة محاولة مزامنة جميع العناصر المعلقة في قائمة الانتظار
     */
    async retryPendingSync() {
        if (!this._pendingSyncQueue) {
            this.loadPendingSyncQueue();
        }
        
        if (!this._pendingSyncQueue || this._pendingSyncQueue.length === 0) {
            return { success: true, synced: 0, failed: 0 };
        }

        const maxRetries = 3;
        const results = { success: true, synced: 0, failed: 0, errors: [] };
        const queueCopy = [...this._pendingSyncQueue];

        // Supabase SaaS: مزامنة زيارات العيادة عبر RPC
        if (this._isSaasTenantMode()) {
            await this._retryPendingClinicVisitsSaas(queueCopy, results, maxRetries);
            if (results.synced > 0 && typeof window.Clinic !== 'undefined' && Clinic.refreshClinicVisitsFromServerAfterSave) {
                try { Clinic.refreshClinicVisitsFromServerAfterSave(); } catch (_e) { /* ignore */ }
            }
            return results;
        }
        
        // التحقق من تفعيل الخادم السحابي (Google Apps Script)
        if (!AppState.backendConfig || !AppState.backendConfig.server || !AppState.backendConfig.server.enabled || !AppState.backendConfig.server.scriptUrl) {
            Utils.safeLog('ℹ️ الخادم السحابي غير مفعّل، تخطي المزامنة');
            return { success: false, synced: 0, failed: 0, message: 'الخادم السحابي غير مفعّل' };
        }
        
        // التحقق من وجود معرف Google Sheets
        const spreadsheetId = AppState.backendConfig.sheets?.spreadsheetId?.trim();
        if (!spreadsheetId || spreadsheetId === '') {
            Utils.safeLog('ℹ️ معرف Google Sheets غير محدد، تخطي المزامنة');
            return { success: false, synced: 0, failed: 0, message: 'معرف Google Sheets غير محدد' };
        }
        
        for (const item of queueCopy) {
            if (item.retryCount >= maxRetries) {
                // تجاوز الحد الأقصى للمحاولات - إزالة من قائمة الانتظار
                this.removeFromPendingSync(item.sheetName);
                results.failed++;
                results.errors.push(`${item.sheetName}: تجاوز الحد الأقصى للمحاولات`);
                continue;
            }
            
            try {
                // زيادة عداد المحاولات
                item.retryCount = (item.retryCount || 0) + 1;
                const preparedData = (typeof Backend !== 'undefined' && typeof Backend.prepareSheetPayload === 'function')
                    ? Backend.prepareSheetPayload(item.sheetName, item.data)
                    : item.data;
                
                // محاولة المزامنة
                await Backend.sendToAppsScript('saveToSheet', {
                    sheetName: item.sheetName,
                    data: preparedData,
                    spreadsheetId: spreadsheetId
                });
                
                // نجحت المزامنة - إزالة من قائمة الانتظار
                this.removeFromPendingSync(item.sheetName);
                results.synced++;
                Utils.safeLog(`✅ تمت مزامنة ${item.sheetName} بنجاح`);
            } catch (error) {
                // فشلت المزامنة - الاحتفاظ في قائمة الانتظار
                const index = this._pendingSyncQueue.findIndex(i => i.sheetName === item.sheetName);
                if (index >= 0) {
                    this._pendingSyncQueue[index] = item;
                }
                this.savePendingSyncQueue();
                results.failed++;
                
                // تسجيل الخطأ فقط إذا لم يكن خطأ "معرف Google Sheets غير محدد"
                const errorMsg = error.message || 'خطأ غير معروف';
                if (!errorMsg.includes('معرف Google Sheets غير محدد') && !errorMsg.includes('Google Sheets غير مفعّل')) {
                    results.errors.push(`${item.sheetName}: ${errorMsg}`);
                    Utils.safeWarn(`⚠️ فشلت مزامنة ${item.sheetName}:`, errorMsg);
                    const rejectedFieldMatch = String(errorMsg).match(/حقل غير مسموح في البيانات:\s*([^\s(]+)/i);
                    if (rejectedFieldMatch && rejectedFieldMatch[1]) {
                        Utils.safeWarn(`⚠️ تم رفض حقل في queue (${item.sheetName}): ${rejectedFieldMatch[1]}`);
                    }
                }
            }
        }
        
        return results;
    },
    
    /**
     * تحميل البيانات المحلية من localStorage
     */
    async load() {
        try {
            // ✅ حماية: التأكد من وجود AppState.appData قبل التحميل
            if (!AppState) {
                Utils.safeError('❌ AppState غير موجود - لا يمكن تحميل البيانات');
                return false;
            }
            if (!AppState.appData) {
                AppState.appData = {};
            }
            
            const saved = this._lsGet('hse_app_data');
            if (saved) {
                const parsedData = JSON.parse(saved);
                
                // ✅ إصلاح: تحميل البيانات الأساسية أولاً بشكل فوري
                // 1. بيانات المستخدمين
                if (parsedData.users && Array.isArray(parsedData.users) && parsedData.users.length > 0) {
                    AppState.appData.users = parsedData.users;
                    if (AppState.debugMode) {
                        Utils.safeLog(`✅ تم تحميل ${parsedData.users.length} مستخدم من البيانات المحلية`);
                    }
                }
                
                // 2. قاعدة بيانات الموظفين
                if (parsedData.employees && Array.isArray(parsedData.employees) && parsedData.employees.length > 0) {
                    AppState.appData.employees = parsedData.employees;
                    if (AppState.debugMode) {
                        Utils.safeLog(`✅ تم تحميل ${parsedData.employees.length} موظف من البيانات المحلية`);
                    }
                }
                
                // 3. بيانات المقاولين (المعتمدين والعاديين)
                if (parsedData.approvedContractors && Array.isArray(parsedData.approvedContractors) && parsedData.approvedContractors.length > 0) {
                    AppState.appData.approvedContractors = parsedData.approvedContractors;
                    if (AppState.debugMode) {
                        Utils.safeLog(`✅ تم تحميل ${parsedData.approvedContractors.length} مقاول معتمد من البيانات المحلية`);
                    }
                }
                if (parsedData.contractors && Array.isArray(parsedData.contractors) && parsedData.contractors.length > 0) {
                    AppState.appData.contractors = parsedData.contractors;
                    if (AppState.debugMode) {
                        Utils.safeLog(`✅ تم تحميل ${parsedData.contractors.length} مقاول من البيانات المحلية`);
                    }
                }
                
                // 4. قاعدة بيانات المواقع (إعدادات النماذج)
                if (parsedData.observationSites && Array.isArray(parsedData.observationSites) && parsedData.observationSites.length > 0) {
                    // ✅ إصلاح: تطبيع المواقع والأماكن الفرعية عند التحميل من localStorage
                    const normalizedSites = parsedData.observationSites.map(site => {
                        const normalizedSite = {
                            id: site.id || site.siteId || Utils.generateId('SITE'),
                            name: site.name || site.title || site.label || '',
                            description: site.description || '',
                            places: []
                        };
                        
                        // تطبيع الأماكن الفرعية
                        const placesSource = Array.isArray(site.places) ? site.places : [];
                        normalizedSite.places = placesSource.map((place, idx) => {
                            if (typeof place === 'object' && place !== null) {
                                return {
                                    id: place.id || place.placeId || place.value || Utils.generateId('PLACE'),
                                    name: place.name || place.placeName || place.title || place.label || place.locationName || `مكان ${idx + 1}`,
                                    siteId: normalizedSite.id
                                };
                            }
                            if (typeof place === 'string') {
                                return {
                                    id: Utils.generateId('PLACE'),
                                    name: place,
                                    siteId: normalizedSite.id
                                };
                            }
                            return null;
                        }).filter(Boolean); // إزالة القيم null
                        
                        return normalizedSite;
                    }).filter(site => site.id && site.name); // إزالة المواقع غير الصالحة
                    
                    AppState.appData.observationSites = normalizedSites;
                    if (AppState.debugMode) {
                        Utils.safeLog(`✅ تم تحميل ${normalizedSites.length} موقع من البيانات المحلية`);
                    }
                } else {
                    // ✅ إصلاح: تهيئة observationSites كمصفوفة فارغة إذا لم تكن موجودة
                    if (!AppState.appData.observationSites) {
                        AppState.appData.observationSites = [];
                    }
                }
                
                // تحميل باقي البيانات
                Object.keys(parsedData).forEach(key => {
                    // تخطي البيانات الأساسية التي تم تحميلها بالفعل
                    if (['users', 'employees', 'approvedContractors', 'contractors', 'observationSites'].includes(key)) {
                        return;
                    }
                    if (parsedData[key] && Array.isArray(parsedData[key])) {
                        AppState.appData[key] = parsedData[key];
                    } else if (key === 'systemStatistics' && parsedData[key] && typeof parsedData[key] === 'object') {
                        // تحميل إحصائيات النظام
                        AppState.appData.systemStatistics = parsedData[key];
                    }
                });
                
                if (AppState.debugMode) {
                    const totalRecords = Object.keys(parsedData).reduce((sum, key) => {
                        if (Array.isArray(parsedData[key])) {
                            return sum + parsedData[key].length;
                        }
                        return sum;
                    }, 0);
                    Utils.safeLog(`✅ تم تحميل ${totalRecords} سجل من البيانات المحلية`);
                }

                // ✅ اكتشاف البيانات المبتورة: إذا كانت النسخة المحلية مبتورة نُعلم التطبيق
                if (parsedData._lightDataMeta && parsedData._lightDataMeta.isLight) {
                    AppState._localDataIsTruncated = true;
                    AppState._truncatedFields = parsedData._lightDataMeta.fields || {};
                    Utils.safeLog('⚠️ البيانات المحلية مبتورة - سيتم إعادة التحميل من الخادم:', AppState._truncatedFields);
                } else {
                    AppState._localDataIsTruncated = false;
                    AppState._truncatedFields = {};
                }
            }
            
            // تهيئة systemStatistics إذا لم يكن موجوداً
            if (!AppState.appData.systemStatistics) {
                AppState.appData.systemStatistics = {
                    totalLogins: 0
                };
            } else if (typeof AppState.appData.systemStatistics.totalLogins !== 'number') {
                // التأكد من أن totalLogins هو رقم
                AppState.appData.systemStatistics.totalLogins = 0;
            }

            await this.loadCompanySettings();
            this.loadCloudStorageConfig();
            this.loadPendingSyncQueue();
            
            // ✅ إضافة: تحميل syncMeta
            try {
                const syncMetaStr = this._lsGet('hse_sync_meta');
                if (syncMetaStr) {
                    const savedSyncMeta = JSON.parse(syncMetaStr);
                    // التحقق من أن syncMeta ينتمي للمستخدم الحالي
                    const currentUserEmail = AppState.currentUser?.email || null;
                    if (!currentUserEmail || savedSyncMeta.userEmail === currentUserEmail) {
                        AppState.syncMeta = {
                            ...AppState.syncMeta,
                            ...savedSyncMeta,
                            sheets: savedSyncMeta.sheets || {}
                        };
                    } else {
                        // تغيير المستخدم - نمسح syncMeta القديم
                        if (AppState.syncMeta) {
                            AppState.syncMeta.sheets = {};
                            AppState.syncMeta.userEmail = currentUserEmail;
                            AppState.syncMeta.lastSyncTime = 0;
                        }
                    }
                }
            } catch (e) {
                Utils.safeWarn('⚠️ فشل تحميل syncMeta:', e);
            }
            
            // ✅ إصلاح: تحديث جلسة المستخدم الحالي بعد تحميل البيانات
            // هذا يضمن أن الصلاحيات محدثة من قاعدة البيانات
            // فقط إذا كانت هناك بيانات مستخدمين محملة ولم يتم تحديث الجلسة مؤخراً
            if (AppState.currentUser && 
                AppState.appData.users && 
                Array.isArray(AppState.appData.users) && 
                AppState.appData.users.length > 0 &&
                typeof window.Auth !== 'undefined' && 
                typeof window.Auth.updateUserSession === 'function') {
                
                // التحقق من وجود المستخدم الحالي في البيانات المحملة
                const currentUserEmail = AppState.currentUser.email?.toLowerCase();
                const userExists = AppState.appData.users.some(u => 
                    u.email && u.email.toLowerCase() === currentUserEmail
                );
                
                if (userExists) {
                    // تأخير بسيط للتأكد من اكتمال تحميل جميع البيانات
                    setTimeout(() => {
                        window.Auth.updateUserSession();
                        if (AppState.debugMode) {
                            Utils.safeLog('✅ تم تحديث الجلسة بعد تحميل البيانات المحلية');
                        }
                    }, 200);
                } else if (AppState.debugMode) {
                    Utils.safeLog('ℹ️ المستخدم الحالي غير موجود في البيانات المحملة - تخطي تحديث الجلسة');
                }
            }
            
            return true;
        } catch (error) {
            Utils.safeError('❌ خطأ في تحميل البيانات المحلية:', error);
            Notification.error('❌ فشل تحميل البيانات المحلية');
            return false;
        }
    },

    /**
     * حفظ البيانات المحلية في localStorage (مع debounce 300ms لتجنب الكتابات المتوازية)
     */
    save() {
        if (this._saveDebounceTimer) {
            clearTimeout(this._saveDebounceTimer);
        }
        this._saveDebounceTimer = setTimeout(() => {
            this._saveDebounceTimer = null;
            this._saveImmediate();
        }, 300);
        return true;
    },

    /** حفظ فوري بدون debounce — استخدمه عند تسجيل الخروج أو العمليات الحرجة */
    saveImmediate() {
        if (this._saveDebounceTimer) {
            clearTimeout(this._saveDebounceTimer);
            this._saveDebounceTimer = null;
        }
        return this._saveImmediate();
    },

    /**
     * التنفيذ الفعلي للحفظ — لا تستدعِه مباشرة، استخدم save() أو saveImmediate()
     * ملاحظة مهمة: حفظ البيانات المحلية فقط - لا يتم المزامنة مع Google Sheets هنا
     * يتم المزامنة تلقائياً باستخدام Backend.autoSave() عند إضافة أو تعديل البيانات في Google Sheets
     */
    _saveImmediate() {
        try {
            // ✅ حماية: التأكد من وجود AppState.appData قبل الحفظ
            if (!AppState || !AppState.appData) {
                Utils.safeWarn('⚠️ AppState.appData غير موجود - لا يمكن حفظ البيانات');
                return false;
            }
            
            // استخدام safeStringify لتجنب الأخطاء في التسلسل
            const serialized = Utils.safeStringify(AppState.appData);
            if (!serialized) {
                Utils.safeWarn('⚠️ فشل تسلسل البيانات');
                return false;
            }
            const safeLimit = this.SAFE_APP_DATA_BYTES;
            // إذا تجاوز الحجم الحد الآمن، نحفظ نسخة مخففة مباشرة (بدون محاولة حفظ كاملة)
            if (serialized.length > safeLimit) {
                const light = this.buildLightAppData(AppState.appData);
                const lightSerialized = Utils.safeStringify(light);
                if (lightSerialized && lightSerialized.length <= safeLimit) {
                    try {
                        this._lsSet('hse_app_data', lightSerialized);
                        this._saveSyncMeta();
                        this.saveCompanySettings();
                        // تسجيل في الـ console فقط — لا إشعار مرئي للمستخدم (البيانات الكاملة في الذاكرة وGoogle Sheets)
                        Utils.safeLog('ℹ️ [DataManager] تم حفظ نسخة مخففة محلياً. البيانات الكاملة في الذاكرة وGoogle Sheets.');
                        return true;
                    } catch (e) {
                        Utils.safeWarn('⚠️ فشل حفظ النسخة المخففة:', e);
                    }
                }
                // الحجم كبير جداً حتى بعد التخفيف — سجّل في Console فقط بدون إزعاج المستخدم
                if (!this._hasShownLargeDataWarning) {
                    this._hasShownLargeDataWarning = true;
                    Utils.safeWarn('⚠️ [DataManager] حجم البيانات كبير جداً للـ localStorage — البيانات محفوظة في الذاكرة وGoogle Sheets');
                }
                return false;
            }
            this._lsSet('hse_app_data', serialized);
            this.saveCompanySettings();
            this._saveSyncMeta();
            // ملاحظة: _saveCacheTimestamps لا تُستدعى هنا — تُحدَّث timestamps فقط عبر recordServerFetch()
            // بعد الجلب الفعلي من الخادم، لمنع إعادة ضبط TTL عند الحفظ المحلي

            // ✅ تحديث كروت لوحة التحكم فوراً بعد كل حفظ محلي (جميع الموديولات)
            try {
                if (typeof Dashboard !== 'undefined') {
                    if (typeof Dashboard.updateStats === 'function') Dashboard.updateStats();
                    if (typeof Dashboard.updateReportsStatistics === 'function') Dashboard.updateReportsStatistics();
                }
            } catch (_) { /* تجاهل لعدم إيقاف عملية الحفظ */ }

            return true;
        } catch (error) {
            const isQuotaExceeded = (error.name === 'QuotaExceededError' || (error.code === 22)) || (error.message && (error.message.includes('QuotaExceeded') || error.message.includes('quota')));
            const isSecurityError = (error.name === 'SecurityError' || (error.code === 18)) || (error.message && error.message.toLowerCase().includes('security'));
            const isStackOverflow = error.message && (error.message.includes('Maximum call stack') || error.message.includes('stack overflow'));
            
            Utils.safeError('❌ خطأ في حفظ البيانات المحلية:', error.name || error.code, error.message);
            
            if (isStackOverflow) {
                if (!this._hasShownLargeDataWarning) {
                    this._hasShownLargeDataWarning = true;
                    Utils.safeWarn('⚠️ [DataManager] حجم البيانات كبير جداً للـ localStorage — البيانات محفوظة في الذاكرة وGoogle Sheets');
                }
                return false;
            }
            if (isQuotaExceeded) {
                // محاولة تحرير مساحة ثم حفظ نسخة مخففة
                try {
                    this._clearNonEssentialStorage();
                    const light = this.buildLightAppData(AppState.appData);
                    const lightSerialized = Utils.safeStringify(light);
                    if (lightSerialized && lightSerialized.length < this.SAFE_APP_DATA_BYTES) {
                        this._lsSet('hse_app_data', lightSerialized);
                        this._saveSyncMeta();
                        this.saveCompanySettings();
                        Utils.safeLog('ℹ️ [DataManager] تم حفظ نسخة مخففة بعد امتلاء التخزين.');
                        return true;
                    }
                } catch (e2) {
                    Utils.safeWarn('⚠️ فشل حفظ النسخة المخففة بعد امتلاء التخزين:', e2);
                }
                // عدم إظهار رسالة للمستخدم؛ البيانات في الذاكرة وGoogle Sheets
                return false;
            }
            if (isSecurityError) {
                Utils.safeWarn('⚠️ التخزين المحلي غير متاح (وضع خاص أو إعدادات المتصفح)');
                return false;
            }
            // عدم إظهار رسالة للمستخدم؛ المزامنة تتم تلقائياً عند الحاجة
            return false;
        }
    },

    _saveSyncMeta() {
        try {
            if (AppState.syncMeta) {
                this._lsSet('hse_sync_meta', Utils.safeStringify(AppState.syncMeta));
            }
        } catch (e) {
            Utils.safeWarn('⚠️ فشل حفظ syncMeta:', e);
        }
    },

    /**
     * ✅ إعادة تحميل الحقول المبتورة من الخادم في الخلفية
     * تُستدعى عند اكتشاف أن البيانات المحلية مبتورة (isLight=true)
     */
    async refreshTruncatedDataFromServer() {
        if (!AppState._localDataIsTruncated) return;
        if (typeof Backend === 'undefined' || !Backend.sendRequest) return;
        if (!AppState.backendConfig?.server?.enabled) return;

        // خريطة اسم الحقل في AppState → اسم الورقة في Google Sheets
        const fieldToSheetMap = {
            'training': 'Training',
            'trainingSessions': 'Training',
            'violations': 'Violations',
            'incidents': 'Incidents',
            'dailyObservations': 'DailyObservations',
            'dailySafetyCheckList': 'DailySafetyCheckList',
            'ptwRegistry': 'PTW',
            'contractorEvaluations': 'ContractorEvaluations',
            'contractorApprovalRequests': 'ContractorApprovalRequests',
            'contractorDeletionRequests': 'ContractorDeletionRequests',
            'blacklistRegister': 'Blacklist_Register',
            'annualTrainingPlans': 'AnnualTrainingPlans',
            'trainingCertificates': 'TrainingCertificates',
            'trainingAttendance': 'Training',
            'contractorTrainings': 'ContractorTrainings',
            'trainingAnalysisData': 'Training'
        };

        const truncatedFields = AppState._truncatedFields || {};
        const fieldsToRefresh = Object.keys(truncatedFields).filter(f => fieldToSheetMap[f]);

        if (fieldsToRefresh.length === 0) return;

        Utils.safeLog(`🔄 إعادة تحميل ${fieldsToRefresh.length} حقل مبتور من الخادم...`);

        const refreshPromises = fieldsToRefresh.map(field => {
            const sheetName = fieldToSheetMap[field];
            return Backend.sendRequest({
                action: 'readFromSheet',
                data: { sheetName }
            }).then(result => ({ field, result }))
              .catch(err => ({ field, error: err }));
        });

        const results = await Promise.all(refreshPromises);

        let refreshed = 0;
        results.forEach(({ field, result, error }) => {
            if (result && result.success && Array.isArray(result.data)) {
                AppState.appData[field] = result.data;
                refreshed++;
                Utils.safeLog(`✅ تم تحديث ${field}: ${result.data.length} سجل (كان مبتوراً على ${truncatedFields[field]})`);
            } else if (error) {
                Utils.safeWarn(`⚠️ فشل تحديث ${field}:`, error.message || error);
            }
        });

        if (refreshed > 0) {
            // مسح علامة البتر بعد التحديث الناجح
            AppState._localDataIsTruncated = false;
            AppState._truncatedFields = {};
            // حفظ البيانات الكاملة محلياً
            try { this.save(); } catch (e) {}
            Utils.safeLog(`✅ اكتمل تحديث البيانات المبتورة: ${refreshed}/${fieldsToRefresh.length} حقل`);
            // إشعار المستخدم باكتمال التحميل
            try {
                if (typeof Notification !== 'undefined' && Notification.success) {
                    Notification.success('تم تحميل البيانات الكاملة بنجاح');
                }
            } catch (e) { /* ignore */ }
            // إطلاق حدث لتحديث واجهة المستخدم
            try {
                window.dispatchEvent(new CustomEvent('hse:dataRefreshed', {
                    detail: { refreshedFields: fieldsToRefresh.slice(0, refreshed) }
                }));
            } catch (e) { /* ignore */ }
        }
    },

    /**
     * حفظ timestamps فقط للحقول التي تم جلبها حديثاً من الخادم
     * لا يُحدِّث timestamps للحقول غير المتأثرة — لمنع إعادة ضبط عداد TTL عند أي save() محلي
     * @param {string[]} [updatedKeys] - مفاتيح AppState التي تم جلبها من الخادم الآن
     */
    _saveCacheTimestamps(updatedKeys) {
        try {
            // قراءة الـ timestamps الحالية (للاحتفاظ بقيم الحقول غير المحدَّثة)
            let timestamps = {};
            try {
                const existing = this._lsGet('hse_cache_timestamps');
                if (existing) timestamps = JSON.parse(existing);
            } catch (e) { /* ignore */ }

            const now = Date.now();

            if (updatedKeys && updatedKeys.length > 0) {
                // ✅ تحديث الحقول المحدَّدة فقط (تم جلبها من الخادم)
                updatedKeys.forEach(key => {
                    timestamps[key] = now;
                });
            }
            // ملاحظة: بدون updatedKeys لا يحدث أي تحديث — يتم استدعاء الدالة فقط مع مفاتيح

            this._lsSet('hse_cache_timestamps', JSON.stringify(timestamps));
        } catch (e) {
            // فشل صامت - لا يؤثر على الوظائف الأخرى
        }
    },

    /**
     * تسجيل وقت الجلب الفعلي من الخادم لحقل واحد أو أكثر
     * يُستدعى بعد كل عملية جلب ناجحة من Google Sheets
     * @param {string|string[]} keys - مفتاح appData أو مصفوفة من المفاتيح
     */
    recordServerFetch(keys) {
        const keysArr = Array.isArray(keys) ? keys : [keys];
        this._saveCacheTimestamps(keysArr);
    },

    /**
     * التحقق من صلاحية الـ cache لحقل معين
     * يقارن وقت آخر جلب من الخادم بالعمر الأقصى المسموح به
     * @param {string} sheetKey - مفتاح الحقل في appData
     * @param {number} maxAge - العمر الأقصى بالمللي ثانية (افتراضي: 10 دقائق)
     * @returns {boolean} - true إذا كان الـ cache صالحاً لا يزال
     */
    isCacheValid(sheetKey, maxAge = 10 * 60 * 1000) {
        try {
            const timestampsStr = this._lsGet('hse_cache_timestamps');
            if (!timestampsStr) return false;
            
            const timestamps = JSON.parse(timestampsStr);
            const timestamp = timestamps[sheetKey];
            
            if (!timestamp) return false;
            
            const age = Date.now() - timestamp;
            return age < maxAge;
        } catch (e) {
            return false;
        }
    },

    async loadCompanySettings(forceReload = false) {
        try {
            // ✅ إصلاح: التحقق من وجود الشعار في localStorage أولاً (cache)
            // إذا كان موجوداً ولم نطلب إعادة تحميل قسرية، نستخدم localStorage فقط
            if (!forceReload) {
                const cachedLogo = this._lsGet('hse_company_logo') || this._lsGet('company_logo');
                const cachedSettings = this._lsGet('hse_company_settings');
                
                if (cachedLogo && cachedSettings) {
                    try {
                        const parsedSettings = JSON.parse(cachedSettings);
                        if (parsedSettings && parsedSettings.logo) {
                            // استخدام البيانات المخزنة محلياً
                            AppState.companyLogo = cachedLogo;
                            AppState.companySettings = Object.assign({}, AppState.companySettings, parsedSettings || {});
                            AppState.companySettings.logo = cachedLogo;
                            
                            // تحديث الشعار في جميع الأماكن
                            setTimeout(() => {
                                if (typeof UI !== 'undefined') {
                                    if (UI.updateCompanyLogoHeader) UI.updateCompanyLogoHeader();
                                    if (UI.updateLoginLogo) UI.updateLoginLogo();
                                    if (UI.updateDashboardLogo) UI.updateDashboardLogo();
                                    if (UI.updateCompanyBranding) UI.updateCompanyBranding();
                                }
                                window.dispatchEvent(new CustomEvent('companyLogoUpdated', { 
                                    detail: { logoUrl: cachedLogo } 
                                }));
                            }, 50);
                            
                            Utils.safeLog('✅ تم تطبيق الشعار من localStorage مؤقتاً — متابعة جلب إعدادات الشركة من الخادم لتحديث الحقول (مثل روابط الملف الشخصي)');
                            // لا نُرجع هنا: إن أُرجعنا مبكراً لن تُحدَّث profileTeamsUrl / profileWhatsAppUrl وغيرها من الشيت
                        }
                    } catch (e) {
                        Utils.safeWarn('⚠️ خطأ في قراءة البيانات المخزنة محلياً:', e);
                    }
                }
            }
            
            // ✅ محاولة تحميل الإعدادات من الخادم (Supabase أو Apps Script)
            const cloudReady = typeof Utils !== 'undefined' && typeof Utils.hasCloudBackendSync === 'function' && Utils.hasCloudBackendSync();
            if ((cloudReady || AppState.backendConfig?.server?.enabled) && typeof Backend !== 'undefined') {
                try {
                    const result = await Backend.sendToAppsScript('getCompanySettings', {});
                    if (result && result.success && result.data) {
                        // تحليل postLoginItems (سياسات/تعليمات ما بعد الدخول)
                        let postLoginItems = AppState.companySettings?.postLoginItems;
                        if (result.data.postLoginItems !== undefined) {
                            const raw = result.data.postLoginItems;
                            if (typeof raw === 'string') {
                                if (raw.trim() !== '') {
                                    try {
                                        postLoginItems = JSON.parse(raw);
                                    } catch (e) {
                                        postLoginItems = [];
                                    }
                                } else {
                                    postLoginItems = [];
                                }
                            } else if (Array.isArray(raw)) {
                                postLoginItems = raw;
                            } else {
                                postLoginItems = [];
                            }
                        }
                        if (!Array.isArray(postLoginItems)) postLoginItems = [];

                        // تحليل clinicVisitTypes (أنواع زيارة العيادة المشتركة)
                        let clinicVisitTypes = AppState.companySettings?.clinicVisitTypes;
                        if (result.data.clinicVisitTypes !== undefined) {
                            const rawVisitTypes = result.data.clinicVisitTypes;
                            if (typeof rawVisitTypes === 'string') {
                                if (rawVisitTypes.trim() !== '') {
                                    try {
                                        clinicVisitTypes = JSON.parse(rawVisitTypes);
                                    } catch (e) {
                                        clinicVisitTypes = rawVisitTypes.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
                                    }
                                } else {
                                    clinicVisitTypes = [];
                                }
                            } else if (Array.isArray(rawVisitTypes)) {
                                clinicVisitTypes = rawVisitTypes;
                            } else {
                                clinicVisitTypes = [];
                            }
                        }
                        if (!Array.isArray(clinicVisitTypes)) clinicVisitTypes = [];

                        // حقول استحقاق PPE من الشيت (لم تكن تُحدَّث في الواجهة لأغلب التحميلات)
                        let ppeEligibilityRules = '[]';
                        if (result.data.hasOwnProperty('ppeEligibilityRules') && result.data.ppeEligibilityRules != null) {
                            const pr = result.data.ppeEligibilityRules;
                            if (typeof pr === 'string') {
                                ppeEligibilityRules = pr.trim() || '[]';
                            } else if (Array.isArray(pr)) {
                                try {
                                    ppeEligibilityRules = JSON.stringify(pr);
                                } catch (e) {
                                    ppeEligibilityRules = '[]';
                                }
                            }
                        } else if (AppState.companySettings?.ppeEligibilityRules != null) {
                            ppeEligibilityRules = String(AppState.companySettings.ppeEligibilityRules);
                        }
                        const legacyMonths = 0;
                        const legacyDays = 0;

                        // تحديث AppState بالبيانات من Google Sheets
                        AppState.companySettings = Object.assign({}, AppState.companySettings, {
                            name: result.data.name || AppState.companySettings?.name,
                            secondaryName: result.data.secondaryName || AppState.companySettings?.secondaryName,
                            nameFontSize: result.data.nameFontSize || AppState.companySettings?.nameFontSize || 16,
                            secondaryNameFontSize: result.data.secondaryNameFontSize || AppState.companySettings?.secondaryNameFontSize || 14,
                            secondaryNameColor: result.data.secondaryNameColor || AppState.companySettings?.secondaryNameColor || '#6B7280',
                            formVersion: result.data.formVersion || AppState.companySettings?.formVersion || '1.0',
                            address: result.data.address || AppState.companySettings?.address,
                            phone: result.data.phone || AppState.companySettings?.phone,
                            email: result.data.email || AppState.companySettings?.email,
                            postLoginItems: postLoginItems,
                            clinicMonthlyVisitsAlertThreshold: result.data.clinicMonthlyVisitsAlertThreshold ?? AppState.companySettings?.clinicMonthlyVisitsAlertThreshold ?? 10,
                            clinicVisitTypes: clinicVisitTypes,
                            profileTeamsUrl: String(result.data.profileTeamsUrl ?? AppState.companySettings?.profileTeamsUrl ?? '').trim(),
                            profileWhatsAppUrl: String(result.data.profileWhatsAppUrl ?? AppState.companySettings?.profileWhatsAppUrl ?? '').trim(),
                            ppeEligibilityRules: ppeEligibilityRules,
                            ppeEligibilityMonths: legacyMonths,
                            ppeEligibilityDays: legacyDays
                        });
                        
                        // تحديث شعار الشركة (حتى لو كان فارغاً لمسحه)
                        if (result.data.hasOwnProperty('logo')) {
                            const logoValue = result.data.logo || '';
                            AppState.companyLogo = logoValue;
                            // تحديث الشعار في AppState.companySettings أيضاً
                            if (!AppState.companySettings) {
                                AppState.companySettings = {};
                            }
                            AppState.companySettings.logo = logoValue;
                            // ✅ إصلاح: حفظ في localStorage فقط إذا تغير الشعار
                            const currentLogo = this._lsGet('hse_company_logo') || '';
                            if (logoValue && logoValue.trim() !== '') {
                                // إذا تغير الشعار، نحدّث localStorage
                                if (currentLogo !== logoValue) {
                                    this._lsSet('hse_company_logo', logoValue);
                                    this._lsSet('company_logo', logoValue);
                                    Utils.safeLog('✅ تم تحديث الشعار من قاعدة البيانات (الطول: ' + logoValue.length + ' حرف)');
                                } else {
                                    Utils.safeLog('ℹ️ الشعار لم يتغير - استخدام النسخة المخزنة محلياً');
                                }
                            } else {
                                // إذا تم حذف الشعار من قاعدة البيانات، نمسح localStorage
                                if (currentLogo) {
                                    this._lsRemove('hse_company_logo');
                                    this._lsRemove('company_logo');
                                    Utils.safeLog('ℹ️ تم حذف الشعار من قاعدة البيانات');
                                }
                            }
                        } else {
                            // ✅ إصلاح: إذا لم يكن logo في البيانات، نتحقق من وجوده في companySettings
                            if (result.data.logo !== undefined) {
                                // logo موجود لكنه فارغ
                                AppState.companyLogo = '';
                                if (!AppState.companySettings) {
                                    AppState.companySettings = {};
                                }
                                AppState.companySettings.logo = '';
                                this._lsRemove('hse_company_logo');
                                this._lsRemove('company_logo');
                            }
                        }
                        
                        // حفظ في localStorage لاستخدامها لاحقاً
                        this._lsSet('hse_company_settings', JSON.stringify(AppState.companySettings || {}));
                        
                            // ✅ إصلاح: تحديث الشعار في جميع الأماكن المخصصة (حتى لو كان فارغاً)
                        // استخدام setTimeout لضمان تحديث الواجهة بعد تحديث AppState
                        const shouldUpdateUI = forceReload || !this._lsGet('hse_company_logo');
                        if (shouldUpdateUI) {
                            setTimeout(() => {
                                if (typeof UI !== 'undefined') {
                                    if (UI.updateCompanyLogoHeader) {
                                        UI.updateCompanyLogoHeader();
                                    }
                                    if (UI.updateLoginLogo) {
                                        UI.updateLoginLogo();
                                    }
                                    if (UI.updateDashboardLogo) {
                                        UI.updateDashboardLogo();
                                    }
                                    if (UI.updateCompanyBranding) {
                                        UI.updateCompanyBranding();
                                    }
                                }
                                
                                // إرسال حدث لتحديث الشعار (حتى لو كان فارغاً لمسحه)
                                window.dispatchEvent(new CustomEvent('companyLogoUpdated', { 
                                    detail: { logoUrl: AppState.companyLogo || '' } 
                                }));
                            }, 100);
                        }
                        
                        if (forceReload) {
                            Utils.safeLog('✅ تم تحميل إعدادات الشركة من Google Sheets بنجاح (force reload)');
                        } else {
                            Utils.safeLog('✅ تم تحديث إعدادات الشركة من Google Sheets بنجاح');
                        }
                        return;
                    }
                } catch (error) {
                    Utils.safeWarn('⚠️ فشل تحميل إعدادات الشركة من Google Sheets:', error);
                }
            }
            
            // إذا فشل التحميل من Google Sheets، تحميل من localStorage
            const savedSettings = this._lsGet('hse_company_settings');
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                AppState.companySettings = Object.assign({}, AppState.companySettings, parsedSettings || {});
                
                // ✅ إصلاح: تحميل الشعار من companySettings إذا كان موجوداً
                if (parsedSettings && parsedSettings.logo) {
                    AppState.companyLogo = parsedSettings.logo;
                }
            }
            
            // تحميل الشعار من localStorage إذا كان موجوداً (fallback)
            const savedLogo = this._lsGet('hse_company_logo') || this._lsGet('company_logo');
            if (savedLogo) {
                AppState.companyLogo = savedLogo;
                // تحديث الشعار في AppState.companySettings أيضاً
                if (!AppState.companySettings) {
                    AppState.companySettings = {};
                }
                AppState.companySettings.logo = savedLogo;
            }
            
            // ✅ إصلاح: تحديث الشعار في جميع الأماكن المخصصة بعد التحميل (سواء من companySettings أو localStorage)
            const logoToUse = AppState.companyLogo || (AppState.companySettings && AppState.companySettings.logo) || '';
            
            // استخدام setTimeout لضمان تحديث الواجهة بعد تحديث AppState
            setTimeout(() => {
                if (logoToUse || !AppState.companyLogo) {
                    if (typeof UI !== 'undefined') {
                        if (UI.updateCompanyLogoHeader) {
                            UI.updateCompanyLogoHeader();
                        }
                        if (UI.updateLoginLogo) {
                            UI.updateLoginLogo();
                        }
                        if (UI.updateDashboardLogo) {
                            UI.updateDashboardLogo();
                        }
                        if (UI.updateCompanyBranding) {
                            UI.updateCompanyBranding();
                        }
                    }
                    
                    // إرسال حدث لتحديث الشعار
                    window.dispatchEvent(new CustomEvent('companyLogoUpdated', { 
                        detail: { logoUrl: logoToUse } 
                    }));
                }
            }, 100);
        } catch (error) {
            Utils.safeWarn('⚠️ فشل تحميل إعدادات الشركة من localStorage:', error);
        }
    },

    saveCompanySettings() {
        try {
            this._lsSet('hse_company_settings', JSON.stringify(AppState.companySettings || {}));
            return true;
        } catch (error) {
            Utils.safeError('❌ خطأ في حفظ إعدادات الشركة:', error);
            return false;
        }
    },

    /**
     * تحميل إعدادات الاتصال بالخادم الخلفي (المفتاح التاريخي hse_backend_config)
     */
    loadBackendConfig() {
        try {
            const config = localStorage.getItem('hse_backend_config');
            if (config) {
                AppState.backendConfig = JSON.parse(config);
            }
        } catch (error) {
            Utils.safeError('❌ خطأ في تحميل إعدادات الاتصال بالخادم:', error);
        }
    },

    /**
     * حفظ إعدادات الاتصال بالخادم الخلفي
     */
    saveBackendConfig() {
        try {
            localStorage.setItem('hse_backend_config', JSON.stringify(AppState.backendConfig));
            return true;
        } catch (error) {
            Utils.safeError('❌ خطأ في حفظ إعدادات الاتصال بالخادم:', error);
            return false;
        }
    },

    /**
     * تحميل إعدادات التخزين السحابي
     */
    loadCloudStorageConfig() {
        try {
            const config = localStorage.getItem('hse_cloud_storage_config');
            if (config) {
                AppState.cloudStorageConfig = JSON.parse(config);
            }
        } catch (error) {
            Utils.safeError('❌ خطأ في تحميل إعدادات التخزين السحابي:', error);
        }
    },

    /**
     * حفظ إعدادات التخزين السحابي
     */
    saveCloudStorageConfig() {
        try {
            localStorage.setItem('hse_cloud_storage_config', JSON.stringify(AppState.cloudStorageConfig));
            return true;
        } catch (error) {
            Utils.safeError('❌ خطأ في حفظ إعدادات التخزين السحابي:', error);
            return false;
        }
    }
};

// Export to global window (for script tag loading)
if (typeof window !== 'undefined') {
    window.DataManager = DataManager;
}

