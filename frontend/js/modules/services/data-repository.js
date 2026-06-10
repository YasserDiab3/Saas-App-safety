/**
 * DataRepository — طبقة عزل تخزين رقيقة للانتقال المستقبلي عن Google Sheets فقط.
 * حاليًا تفوّض إلى الخادم السحابي عبر Backend.
 *
 * عند الهجرة إلى Firebase أو Supabase، يُستبدل التنفيذ هنا مع الإبقاء على نفس الأسماء قدر الإمكان.
 */
(function (global) {
    'use strict';

    const DataRepository = {
        name: 'SheetsViaAppsScript',

        isConfigured() {
            try {
                return !!(typeof Utils !== 'undefined' &&
                    typeof Utils.hasCloudBackendSync === 'function' &&
                    Utils.hasCloudBackendSync());
            } catch (e) {
                return false;
            }
        },

        /**
         * قراءة ورقة عبر الإجراء المعياري readFromSheet
         */
        async readSheet(sheetName, extraPayload) {
            if (!sheetName) {
                return { success: false, message: 'sheetName مطلوب' };
            }
            if (typeof Backend === 'undefined' || typeof Backend.sendToAppsScript !== 'function') {
                return { success: false, message: 'Backend غير متاح' };
            }
            const payload = Object.assign({}, extraPayload || {}, { sheetName: sheetName });
            return Backend.sendToAppsScript('readFromSheet', payload);
        }
    };

    global.DataRepository = DataRepository;
})(typeof window !== 'undefined' ? window : this);
