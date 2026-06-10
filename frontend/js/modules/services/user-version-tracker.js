/**
 * UserVersionTracker — صامت + خلفي
 *
 * يبلغ السيرفر بإصدار التطبيق الحالي للمستخدم. تساعد المدير على معرفة:
 *   - أي مستخدم يعمل على إصدار قديم (لم يُجبر تحديث Service Worker بعد)
 *   - متى آخر مرة فتح كل مستخدم التطبيق
 *   - توزيع المستخدمين على الإصدارات
 *
 * متى يُرسل التقرير:
 *   1) عند نجاح تسجيل الدخول (loginSuccess event) — مع isNewSession: true
 *   2) عند فتح التطبيق وكان المستخدم مسجلاً مسبقاً (page reload) — isNewSession: false
 *   3) Heartbeat كل 30 دقيقة عند نشاط المستخدم — isNewSession: false
 *
 * كل الاستدعاءات صامتة: لا تُعطّل واجهة المستخدم، لا تُظهر إشعارات في حال الفشل.
 * تستخدم throttle/dedup لمنع الاستدعاءات الزائدة.
 */
const UserVersionTracker = {
    _lastReportTime: 0,
    _minReportInterval: 5 * 60 * 1000, // 5 دقائق بين أي تقريرين عاديين
    _heartbeatInterval: 30 * 60 * 1000, // 30 دقيقة بين heartbeats
    _heartbeatTimer: null,
    _initialized: false,

    /**
     * بدء التتبع — يُستدعى مرة واحدة عند تحميل التطبيق.
     * يربط loginSuccess listener + يبدأ heartbeat للجلسات الموجودة.
     */
    init() {
        if (this._initialized) return;
        this._initialized = true;

        // 1) عند نجاح تسجيل الدخول
        try {
            document.addEventListener('loginSuccess', () => {
                this.reportNow({ isNewSession: true }).catch(() => {});
            });
        } catch (e) { /* ignore */ }

        // 2) عند فتح التطبيق وكان المستخدم مسجلاً (page reload أو session مستمرة)
        // ننتظر قليلاً حتى تكتمل عمليات التحميل ولا نحجب الواجهة
        setTimeout(() => {
            try {
                if (this._hasLoggedInUser()) {
                    this.reportNow({ isNewSession: false }).catch(() => {});
                }
            } catch (e) { /* ignore */ }
        }, 3000); // 3 ثوان بعد التحميل

        // 3) Heartbeat كل 30 دقيقة (فقط إذا كان المستخدم نشطاً)
        this._heartbeatTimer = setInterval(() => {
            try {
                if (this._hasLoggedInUser() && document.visibilityState === 'visible') {
                    this.reportNow({ isNewSession: false }).catch(() => {});
                }
            } catch (e) { /* ignore */ }
        }, this._heartbeatInterval);

        // عند العودة للتطبيق بعد فترة (visibility change) — تقرير سريع
        try {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && this._hasLoggedInUser()) {
                    const sinceLast = Date.now() - this._lastReportTime;
                    if (sinceLast > this._minReportInterval) {
                        this.reportNow({ isNewSession: false }).catch(() => {});
                    }
                }
            });
        } catch (e) { /* ignore */ }
    },

    /**
     * إرسال تقرير الإصدار للسيرفر.
     * صامت: في حال الفشل، يُسجل في الـ console فقط (إن كان debugMode مفعّل).
     */
    async reportNow(opts = {}) {
        // throttle: لا نُرسل أكثر من مرة كل 5 دقائق إلا لو isNewSession: true
        if (!opts.isNewSession) {
            const sinceLast = Date.now() - this._lastReportTime;
            if (sinceLast < this._minReportInterval) return;
        }

        try {
            const user = AppState && AppState.currentUser;
            if (!user) return; // غير مُسجَّل دخول

            const userId = String(user.id || user.userId || '').trim();
            const userEmail = String(user.email || '').trim().toLowerCase();
            if (!userId && !userEmail) return; // لا يوجد معرّف صالح

            const version = String(AppState.appVersion || '').trim();
            if (!version) return; // لا يوجد إصدار محدّد (شيء غير طبيعي)

            const payload = {
                userId: userId,
                userEmail: userEmail,
                userName: String(user.name || user.displayName || '').trim(),
                userRole: String(user.role || '').trim(),
                userDepartment: String(user.department || '').trim(),
                version: version,
                userAgent: (navigator && navigator.userAgent) ? String(navigator.userAgent).substring(0, 500) : '',
                platform: this._detectPlatform(),
                isMobile: this._isMobile(),
                screenSize: (window.screen ? (window.screen.width + 'x' + window.screen.height) : ''),
                language: (navigator && navigator.language) ? String(navigator.language) : '',
                isNewSession: !!opts.isNewSession
            };

            if (typeof Backend === 'undefined' || !Backend.sendToAppsScript) return;

            const result = await Backend.sendToAppsScript('reportUserVersion', payload);
            this._lastReportTime = Date.now();

            if (result && result.success) {
                if (AppState && AppState.debugMode) {
                    try { Utils.safeLog(`📊 [UserVersion] تم تسجيل الإصدار ${version} للمستخدم ${userEmail || userId}`); } catch (e) {}
                }
            } else {
                if (AppState && AppState.debugMode) {
                    try { Utils.safeWarn('⚠️ [UserVersion] فشل تسجيل الإصدار:', result && result.message); } catch (e) {}
                }
            }
        } catch (error) {
            // صامت — لا نُزعج المستخدم بأخطاء التتبع
            if (AppState && AppState.debugMode) {
                try { Utils.safeWarn('⚠️ [UserVersion] خطأ في reportNow:', error); } catch (e) {}
            }
        }
    },

    /** هل المستخدم مسجّل دخول حالياً؟ */
    _hasLoggedInUser() {
        try {
            const u = AppState && AppState.currentUser;
            return !!(u && (u.id || u.userId || u.email));
        } catch (e) { return false; }
    },

    /** يكتشف المنصة (Windows/macOS/Linux/Android/iOS) */
    _detectPlatform() {
        try {
            const ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
            const platform = (navigator && navigator.platform) ? navigator.platform : '';
            if (/Android/i.test(ua)) return 'Android';
            if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
            if (/Win/i.test(platform)) return 'Windows';
            if (/Mac/i.test(platform)) return 'macOS';
            if (/Linux/i.test(platform)) return 'Linux';
            return platform || 'Unknown';
        } catch (e) { return 'Unknown'; }
    },

    /** يكتشف الـ mobile vs desktop */
    _isMobile() {
        try {
            const ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
            return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry/i.test(ua);
        } catch (e) { return false; }
    },

    /** إيقاف heartbeat (يُستدعى عند logout) */
    stop() {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }
};

// تهيئة تلقائية عند تحميل السكربت
if (typeof window !== 'undefined') {
    window.UserVersionTracker = UserVersionTracker;
    // بدء التتبع عند جاهزية الـ DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => UserVersionTracker.init());
    } else {
        // الـ DOM جاهز بالفعل — ابدأ فوراً
        try { UserVersionTracker.init(); } catch (e) { /* ignore */ }
    }
}
