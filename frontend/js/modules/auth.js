/**
 * Auth Module - موديول المصادقة
 * تم استخراجه من app-modules.js لتحسين الأداء
 */

// تعريف Auth كمتغير عام (global) ليكون متاحاً لجميع الملفات
window.Auth = {
    // ملاحظة: المستخدمون يجب أن يكونوا من قاعدة البيانات فقط
    // لا يتم تخزين كلمات المرور في الكود لأسباب أمنية
    validUsers: {
        // تم إزالة كلمات المرور من الكود لأسباب أمنية
        // المستخدمون الآن يحملون من قاعدة البيانات فقط
    },

    // ===== Bootstrap Admin (First-time setup only) =====
    // يسمح بالدخول لأول مرة فقط لتجهيز المزامنة/إضافة المستخدمين، ثم يتم تعطيله تلقائياً بعد نجاح مزامنة Users.
    // ⚠️ لا يتم تخزين كلمة المرور نصياً هنا. يتم استخدام SHA-256 hash فقط.
    bootstrap: {
        email: 'admin@hse.local',
        // SHA-256("admin123") - لا يوجد تخزين لكلمة المرور النصية داخل الكود
        passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
        disabledKey: 'hse_bootstrap_disabled',
        disabledAtKey: 'hse_bootstrap_disabled_at'
    },

    isBootstrapEmail(email) {
        try {
            return String(email || '').toLowerCase().trim() === this.bootstrap.email;
        } catch (e) {
            return false;
        }
    },

    isBootstrapDisabled() {
        try {
            return localStorage.getItem(this.bootstrap.disabledKey) === 'true';
        } catch (e) {
            return false;
        }
    },

    disableBootstrap(reason = '') {
        try {
            localStorage.setItem(this.bootstrap.disabledKey, 'true');
            localStorage.setItem(this.bootstrap.disabledAtKey, new Date().toISOString());
            if (reason) {
                localStorage.setItem('hse_bootstrap_disabled_reason', String(reason).slice(0, 200));
            }
        } catch (e) { /* ignore */ }
    },

    /** أقصى عمر للجلسة منذ loginTime */
    SESSION_ABSOLUTE_MS: 24 * 60 * 60 * 1000,
    /** انتهاء عند الخمول بناءً على آخر نشاط */
    SESSION_IDLE_MS: 12 * 60 * 60 * 1000,

    _touchSessionActivity() {
        try {
            sessionStorage.setItem('hse_session_last_activity_ms', String(Date.now()));
        } catch (e) { /* ignore */ }
    },

    _isSessionExpiredForRestore(sessionUser) {
        if (!sessionUser || !sessionUser.loginTime) return false;
        const t = new Date(sessionUser.loginTime).getTime();
        if (Number.isNaN(t)) return false;
        if (Date.now() - t > this.SESSION_ABSOLUTE_MS) return true;
        const last = parseInt(sessionStorage.getItem('hse_session_last_activity_ms') || '0', 10);
        if (last > 0 && (Date.now() - last) > this.SESSION_IDLE_MS) return true;
        return false;
    },

    _clearStoredSession() {
        try {
            sessionStorage.removeItem('hse_current_session');
            sessionStorage.removeItem('hse_session_id');
            sessionStorage.removeItem('hse_session_last_activity_ms');
            localStorage.removeItem('hse_remember_user');
        } catch (e) { /* ignore */ }
        try { AppState.isPageRefresh = false; } catch (e2) { /* ignore */ }
    },

    /** إزالة passwordHash من كائن المستخدم في الذاكرة بعد المصادقة */
    _sanitizeCurrentUserSecrets() {
        try {
            if (AppState.currentUser && typeof AppState.currentUser === 'object') {
                delete AppState.currentUser.passwordHash;
                AppState.currentUser.password = '***';
            }
        } catch (e) { /* ignore */ }
    },

    /**
     * رسالة خطأ تسجيل الدخول: إن كان الخادم غير متاح (503 / بدون اتصال) نعرض رسالة اتصال، وإلا رسالة بيانات خاطئة.
     */
    _getLoginErrorMessage() {
        try {
            if (typeof AppState !== 'undefined' && AppState.runningWithoutBackend === true) {
                return 'تعذر الاتصال بالخادم (الخادم غير متاح أو خطأ 503). يرجى التحقق من الاتصال بالإنترنت ونشر التطبيق، ثم المحاولة لاحقاً.';
            }
        } catch (e) { /* ignore */ }
        return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
    },

    /**
     * تطبيع passwordHash القادم من الشيت (قد يكون نصاً أو كائناً من Google Sheets).
     */
    _normalizeStoredPasswordHash(raw) {
        if (raw == null || raw === '') return '';
        if (typeof raw === 'object' && raw !== null) {
            if (raw.value != null) return String(raw.value).trim();
            const values = Object.values(raw);
            if (values.length === 1 && typeof values[0] === 'string') return String(values[0]).trim();
            return String(raw).trim();
        }
        return String(raw).trim();
    },

    /**
     * التحقق من تفعيل الحساب وجلسة المتزامن وبناء كائن المستخدم للجلسة (قبل التحقق من كلمة المرور).
     * @returns {{ success: true, user: object } | { success: false, message: string }}
     */
    _prepareLoginSessionUser(foundUser, email) {
        try {
            if (!foundUser || !email) {
                return { success: false, message: 'بيانات المستخدم غير كاملة' };
            }

            if (foundUser.active === false || foundUser.active === 'false' || foundUser.active === 'inactive') {
                return { success: false, message: 'هذا الحساب غير مفعّل. يرجى الاتصال بالمدير' };
            }

            const hashNorm = this._normalizeStoredPasswordHash(foundUser.passwordHash);
            if (!hashNorm || hashNorm === '***') {
                Utils.safeError('❌ [AUTH] passwordHash مفقود أو غير صالح للمستخدم:', foundUser.email);
                return { success: false, message: 'كلمة المرور غير مضبوطة لهذا الحساب. يرجى التواصل مع مدير النظام لإعادة تعيينها.' };
            }
            foundUser.passwordHash = hashNorm;

            const generateSessionId = () => {
                const timestamp = Date.now().toString(36);
                const arr = new Uint8Array(16);
                crypto.getRandomValues(arr);
                const random = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
                return `SESS_${timestamp}_${random}`;
            };

            let currentSessionId = sessionStorage.getItem('hse_session_id');
            if (!currentSessionId) {
                currentSessionId = generateSessionId();
                sessionStorage.setItem('hse_session_id', currentSessionId);
            }

            let hasActiveSession = false;
            try {
                const currentSession = sessionStorage.getItem('hse_current_session');
                if (currentSession) {
                    const currentSessionData = JSON.parse(currentSession);
                    if (currentSessionData && currentSessionData.email && currentSessionData.email.toLowerCase() === email) {
                        if (currentSessionData.loginTime) {
                            const loginTime = new Date(currentSessionData.loginTime);
                            const now = new Date();
                            const sessionAge = now - loginTime;
                            const maxSessionAge = 24 * 60 * 60 * 1000;
                            if (sessionAge < maxSessionAge && currentSessionData.sessionId === currentSessionId) {
                                hasActiveSession = true;
                            }
                        } else if (currentSessionData.sessionId === currentSessionId) {
                            hasActiveSession = true;
                        }
                    }
                }
            } catch (e) {
                Utils.safeWarn('⚠️ خطأ في التحقق من الجلسة الحالية:', e);
            }

            if (foundUser.isOnline === true && foundUser.activeSessionId) {
                if (foundUser.activeSessionId !== currentSessionId && !hasActiveSession) {
                    // التحقق من عمر الجلسة المخزنة — إذا مضى أكثر من 24 ساعة نتجاوز الحجب
                    // (يحدث هذا بعد انهيار المتصفح أو انقطاع الشبكة بدون logout صريح)
                    const lastActivity = parseInt(sessionStorage.getItem('hse_session_last_activity_ms') || '0', 10);
                    const staleThresholdMs = 24 * 60 * 60 * 1000;
                    const sessionIsStale = lastActivity === 0 || (Date.now() - lastActivity > staleThresholdMs);
                    if (!sessionIsStale) {
                        return {
                            success: false,
                            message: '⚠️ هذا الحساب متصل بالفعل من جهاز آخر.\n\nيرجى تسجيل الخروج من الجهاز الآخر أولاً، أو انتظار انتهاء الجلسة تلقائياً.\n\nلا يمكن تسجيل الدخول من أكثر من جهاز في نفس الوقت.'
                        };
                    }
                    // الجلسة القديمة منتهية الصلاحية — نتجاوز الحجب ونسمح بالدخول
                    Utils.safeWarn('⚠️ جلسة قديمة منتهية الصلاحية — السماح بالدخول وإعادة تعيين isOnline');
                }
            }

            let extractedName = foundUser.name;
            if (typeof foundUser.name === 'object' && foundUser.name !== null) {
                if (foundUser.name.value) {
                    extractedName = String(foundUser.name.value).trim();
                } else {
                    const values = Object.values(foundUser.name);
                    if (values.length === 1 && typeof values[0] === 'string') {
                        extractedName = String(values[0]).trim();
                    } else {
                        extractedName = String(foundUser.name).trim();
                    }
                }
            } else if (typeof foundUser.name === 'string') {
                extractedName = foundUser.name.trim();
            }

            const user = {
                name: extractedName || 'مستخدم',
                password: foundUser.password || '***',
                passwordHash: foundUser.passwordHash || '',
                role: foundUser.role || 'user',
                department: foundUser.department || '',
                factory: foundUser.factory || foundUser.factoryId || foundUser.plant || foundUser.siteId || foundUser.site || foundUser.location || '',
                factoryId: foundUser.factoryId || foundUser.factory || foundUser.plantId || foundUser.siteId || '',
                factoryName: foundUser.factoryName || foundUser.plantName || foundUser.siteName || foundUser.locationName || '',
                subLocation: foundUser.subLocation || foundUser.subLocationId || foundUser.subSite || foundUser.subsite || foundUser.placeId || foundUser.place || foundUser.branch || '',
                subLocationId: foundUser.subLocationId || foundUser.placeId || foundUser.subLocation || '',
                subLocationName: foundUser.subLocationName || foundUser.placeName || foundUser.subSiteName || foundUser.subsiteName || '',
                branch: foundUser.branch || foundUser.branchName || '',
                permissions: foundUser.permissions || {},
                id: foundUser.id,
                email: foundUser.email,
                photo: foundUser.photo || ''
            };

            Utils.safeLog('📋 بيانات المستخدم المحضرة:', {
                email: user.email,
                name: user.name,
                role: user.role,
                hasPasswordHash: !!user.passwordHash && user.passwordHash !== '***',
                passwordHashLength: user.passwordHash?.length || 0
            });

            return { success: true, user };
        } catch (err) {
            Utils.safeError('❌ _prepareLoginSessionUser:', err);
            return { success: false, message: 'حدث خطأ أثناء تجهيز الجلسة. يرجى المحاولة لاحقاً أو التواصل مع الدعم.' };
        }
    },

    /**
     * يتم استدعاؤها بعد نجاح مزامنة Users.
     * إذا تم جلب مستخدمين حقيقيين (غير @hse.local)، نعطّل حساب الـ bootstrap نهائياً.
     */
    handleUsersSyncSuccess() {
        try {
            if (this.isBootstrapDisabled()) return false;
            const users = AppState?.appData?.users;
            if (!Array.isArray(users) || users.length === 0) return false;

            const nonLegacyUsers = users.filter(u => {
                const em = String(u?.email || '').toLowerCase().trim();
                return em && !em.endsWith('@hse.local');
            });
            if (nonLegacyUsers.length === 0) return false;

            // تعطيل نهائي
            this.disableBootstrap('Users sync completed with real users');

            // إذا كان المستخدم الحالي هو bootstrap → تسجيل خروج إجباري
            if (AppState?.currentUser?.isBootstrap === true) {
                try {
                    if (typeof Notification !== 'undefined' && Notification.success) {
                        Notification.success('✅ تم تعطيل حساب مدير النظام الافتراضي بعد نجاح المزامنة. يرجى تسجيل الدخول بحسابك من قاعدة البيانات.');
                    }
                } catch (e) { /* ignore */ }

                try {
                    this.logout();
                } catch (e) { /* ignore */ }

                try {
                    if (typeof UI !== 'undefined' && typeof UI.showLoginScreen === 'function') {
                        UI.showLoginScreen();
                    }
                } catch (e) { /* ignore */ }
            }

            return true;
        } catch (e) {
            return false;
        }
    },

    /**
     * تسجيل الدخول
     */
    async login(email, password, remember = false) {
        let foundUser = null; // ✅ تعريفه في النطاق الخارجي لتجنب ReferenceError
        // التحقق من وجود DataManager قبل البدء
        if (typeof window.DataManager === 'undefined') {
            Utils.safeError('❌ خطأ فادح: DataManager غير محمل');
            const errorMessage = 'نظام إدارة البيانات غير جاهز. يرجى تحديث الصفحة والمحاولة مرة أخرى.';
            if (typeof window.Notification !== 'undefined') {
                window.Notification.error(errorMessage);
            }
            return { success: false, message: errorMessage };
        }
        
        // إزالة تسجيل المعلومات الحساسة في الإنتاج
        const isProduction = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');
        if (!isProduction) {
            Utils.safeLog(' بدء تسجيل الدخول:', { email, passwordLength: password?.length, remember });
        }

        if (!email || !password) {
            if (!isProduction) {
                Utils.safeWarn('⚠️ بيانات ناقصة:', { email: !!email, password: !!password });
            }
            const errorMessage = 'يرجى إدخال البريد الإلكتروني وكلمة المرور';
            Notification.error(errorMessage);
            return { success: false, message: errorMessage };
        }

        email = email.trim().toLowerCase();

        // التحقق من Rate Limiting
        try {
            await Utils.RateLimiter.checkLockout(email);
        } catch (error) {
            Notification.error(error.message);
            return { success: false, message: error.message };
        }

        if (!isProduction) {
            Utils.safeLog('✅ البريد بعد التنظيف:', email);
        }

        if (!Utils.isValidEmail(email)) {
            Utils.safeWarn('⚠️ بريد إلكتروني غير صحيح:', email);
            const errorMessage = 'يرجى إدخال بريد إلكتروني صحيح';
            Notification.error(errorMessage);
            return { success: false, message: errorMessage };
        }

        // ✅ تحسين الأداء: لا نقوم بمزامنة Users قبل تسجيل الدخول.
        // الخادم هو مصدر الحقيقة للمصادقة — تجنّب cold-start مزدوج.
        // البيانات المحلية تُستخدم كـ fallback فقط إذا فشل الخادم.
        let localUsersCount = Array.isArray(AppState.appData.users) ? AppState.appData.users.length : 0;
        const canSyncUsers = !!(typeof Utils !== 'undefined' && typeof Utils.hasCloudBackendSync === 'function' && Utils.hasCloudBackendSync() &&
            typeof Backend !== 'undefined' &&
            typeof Backend.syncUsers === 'function');

        // تحميل سريع للبيانات المحلية فقط (بدون شبكة) لضمان توفّر fallback إذا فشل الخادم
        if (localUsersCount === 0 && typeof window.DataManager !== 'undefined' && window.DataManager.load) {
            try {
                await Promise.race([
                    window.DataManager.load(),
                    new Promise(resolve => setTimeout(resolve, 400))
                ]);
                localUsersCount = Array.isArray(AppState.appData.users) ? AppState.appData.users.length : 0;
            } catch (_e) { /* تجاهل: سنعتمد على الخادم */ }
        }

        // ملاحظة: تم إزالة المستخدمين الثابتين لأسباب أمنية
        // جميع المستخدمين يجب أن يكونوا من قاعدة البيانات قط
        let user = null; // تم إزالة validUsers لأسباب أمنية

        // 🔒 التحقق عبر الخادم (Server-side Authentication)
        let loginResult = null;
        let loginMethod = 'local';

        // SaaS: Supabase Auth (لا يعتمد على scriptUrl القديم)
        if (!user && window.SAAS_CONFIG && window.SAAS_CONFIG.useSupabaseBackend && window.SaaS && typeof window.SaaS.signIn === 'function') {
            try {
                await window.SaaS.ready;
                const saasResult = await window.SaaS.signIn(email, password);
                if (saasResult.error) {
                    const errMsg = saasResult.error.message || this._getLoginErrorMessage();
                    Notification.error(errMsg);
                    return { success: false, message: errMsg };
                }
                const su = (saasResult.data && saasResult.data.user) || {};
                const role = (window.SaaSSession && typeof window.SaaSSession.resolveRole === 'function')
                    ? await window.SaaSSession.resolveRole()
                    : 'user';
                const isAdmin = (role === 'admin');
                user = {
                    id: su.id,
                    email: su.email,
                    name: (su.user_metadata && su.user_metadata.full_name) || su.email,
                    role: role,
                    department: '',
                    permissions: isAdmin ? { admin: true, 'manage-modules': true } : {},
                    active: true,
                    passwordChanged: true
                };
                loginMethod = 'server';
            } catch (saasErr) {
                Utils.safeError('⚠️ فشل تسجيل الدخول عبر Supabase:', saasErr);
                const errMsg = (saasErr && saasErr.message) || 'فشل الاتصال بخادم تسجيل الدخول. تحقق من الإنترنت وحاول مرة أخرى.';
                Notification.error(errMsg);
                return { success: false, message: errMsg };
            }
        }

        if (!user && canSyncUsers && typeof Backend !== 'undefined') {
            try {
                Utils.safeLog('🔒 محاولة تسجيل الدخول عبر الخادم...');
                loginResult = await Backend.sendRequest({
                    action: 'login',
                    data: { email, password }
                });

                if (loginResult && loginResult.success) {
                    Utils.safeLog('✅ نجح تسجيل الدخول عبر الخادم');
                    user = loginResult.user;
                    loginMethod = 'server';
                } else if (loginResult && loginResult.message) {
                    Utils.safeWarn('❌ فشل تسجيل الدخول عبر الخادم:', loginResult.message);
                    // إذا كان الخطأ صريحاً من الخادم (معطل أو خطأ إداري) نوقف فوراً
                    // لكن "غير صحيحة" وحدها لا تكفي لمنع الـ Fallback المحلي في حال عدم التزامن
                    const isHardServerError = loginResult.message.includes('معطل') ||
                        loginResult.message.includes('disabled') ||
                        loginResult.errorCode === 'ACCOUNT_DISABLED';
                    if (isHardServerError) {
                        let hardErrMsg = loginResult.message;
                        try {
                            await Utils.RateLimiter.recordFailedAttempt(email);
                        } catch (rateLimitErr) {
                            hardErrMsg = rateLimitErr.message || hardErrMsg;
                        }
                        Notification.error(hardErrMsg);
                        return { success: false, message: hardErrMsg };
                    }
                    // أخطاء "غير صحيحة" تسمح بالمحاولة المحلية كـ Fallback
                }
            } catch (serverError) {
                Utils.safeError('⚠️ خطأ في الاتصال بالخادم أثناء تسجيل الدخول:', serverError);
                // المتابعة للمحاولة المحلية كبديل (Offline support)
            }
        }

        // 🏠 محاولة تسجيل الدخول محلياً (Fallback / Offline)
        if (!user) {
            Utils.safeLog('🏠 محاولة التحقق من الحساب محلياً...');
            let users = AppState.appData.users || [];
            // إعادة تعيين isOnline في الكاش المحلي قبل الفحص لتجنب الحجب بسبب جلسة سابقة منتهية
            const localUserIdx = users.findIndex(u => u && u.email && u.email.toLowerCase().trim() === email);
            if (localUserIdx !== -1 && users[localUserIdx].isOnline === true) {
                const lastActivity = parseInt(sessionStorage.getItem('hse_session_last_activity_ms') || '0', 10);
                if (lastActivity === 0 || Date.now() - lastActivity > 24 * 60 * 60 * 1000) {
                    users[localUserIdx].isOnline = false;
                    users[localUserIdx].activeSessionId = null;
                }
            }
            foundUser = users.find(u => u && u.email && u.email.toLowerCase().trim() === email);

            // ✅ Bootstrap Support — حساب الطوارئ للدخول الأول أو عند تعذر الاتصال
            // يُتاح دائماً لـ admin@hse.local إذا لم يكن مُعطَّلاً (أو عند انعدام الإنترنت والبيانات)
            const isOfflineWithNoUsers = !canSyncUsers && users.length === 0;
            const bootstrapAllowed = !this.isBootstrapDisabled() || isOfflineWithNoUsers;
            // Bootstrap Admin يعمل حتى لو فيه مستخدمون آخرون في الـ cache
            // (لأن admin@hse.local هو حساب طوارئ وليس حساباً عادياً)
            if (!foundUser && bootstrapAllowed && this.isBootstrapEmail(email)) {
                foundUser = {
                    id: 'BOOTSTRAP_ADMIN',
                    name: 'مدير النظام',
                    email: this.bootstrap.email,
                    role: 'admin',
                    passwordHash: this.bootstrap.passwordHash,
                    active: true,
                    permissions: {}
                };
            }

            if (!foundUser) {
                // رسالة واضحة عند انعدام الإنترنت وغياب البيانات المحلية
                const isOffline = !navigator.onLine || (!canSyncUsers && users.length === 0);
                const errorMessage = isOffline
                    ? 'لا يوجد اتصال بالخادم ولا بيانات محلية محفوظة. يُرجى الاتصال بالإنترنت والمحاولة مرة أخرى.'
                    : this._getLoginErrorMessage();
                Notification.error(errorMessage);
                return { success: false, message: errorMessage };
            }

            // التحقق من كلمة المرور محلياً
            const inputPasswordRaw = (password || '').trim();
            const storedHash = (foundUser.passwordHash || '').trim();
            let passwordMatch = false;

            if (Utils.isSha256Hex(storedHash)) {
                const normalizedInput = await Utils.normalizePasswordForComparison(inputPasswordRaw, storedHash);
                passwordMatch = (storedHash.toLowerCase() === normalizedInput.toLowerCase());
            } else if (storedHash === inputPasswordRaw) {
                passwordMatch = true;
            }

            if (!passwordMatch) {
                let errorMessage = this._getLoginErrorMessage();
                try {
                    await Utils.RateLimiter.recordFailedAttempt(email);
                } catch (rateLimitErr) {
                    errorMessage = rateLimitErr.message || errorMessage;
                }
                Notification.error(errorMessage);
                return { success: false, message: errorMessage };
            }

            const prep = this._prepareLoginSessionUser(foundUser, email);
            if (!prep.success) {
                Notification.error(prep.message);
                return { success: false, message: prep.message };
            }
            user = prep.user;
        }

        // 🔓 نجاح تسجيل الدخول
        await Utils.RateLimiter.clearAttempts(email);
        const loginTime = new Date().toISOString();

        // تجهيز الصلاحيات
        let userPermissions = user.permissions || {};
        if (typeof userPermissions === 'string') {
            try { userPermissions = JSON.parse(userPermissions); } catch (e) { userPermissions = {}; }
        }
        if (typeof Permissions !== 'undefined' && typeof Permissions.normalizePermissions === 'function') {
            userPermissions = Permissions.normalizePermissions(userPermissions);
        }

        const isBootstrap = this.isBootstrapEmail(email) && !this.isBootstrapDisabled();
        
        const allUsersList = AppState.appData.users || [];
        const fullUserData = allUsersList.find(u => u && u.email && u.email.toLowerCase() === email) || user || {};

        // ✅ الحل الجذري: التأكد من وجود name صحيح
        // إذا كان user.name فارغًا، نستخدم email كبديل
        // ✅ إصلاح جذري: التأكد من أن userName ليس "النظام" أو فارغ
        let userName = (user.name || user.displayName || '').trim();
        
        if (!userName || userName === 'النظام' || userName === '') {
            userName = email;
        }

        if (!userName || userName === 'النظام' || userName === '') {
            userName = (fullUserData?.id || user.id || '').toString().trim();
        }

        if (!userName || userName === 'النظام' || userName === '') {
            userName = 'مستخدم';
        }
        
        const resolvedRole = (typeof Utils !== 'undefined' && typeof Utils.canonicalizeUserRole === 'function')
            ? Utils.canonicalizeUserRole(user.role || 'user')
            : (user.role || 'user');

        AppState.currentUser = {
            email,
            name: userName, // ✅ استخدام userName بدلاً من user.name مباشرة
            role: resolvedRole,
            department: user.department || '',
            permissions: userPermissions,
            id: fullUserData?.id || user.id,
            passwordChanged: fullUserData?.passwordChanged ?? false,
            forcePasswordChange: fullUserData?.forcePasswordChange === true,
            isBootstrap: isBootstrap,
            loginTime: loginTime,
            photo: fullUserData?.photo || user?.photo || '' // ✅ إظهار صورة المستخدم بعد الدخول مباشرة
        };
        this._sanitizeCurrentUserSecrets();

        Utils.safeLog('✅ تسجيل الدخول ناجح');
        Utils.safeLog('📋 الصلاحيات:', Object.keys(AppState.currentUser.permissions || {}).length, 'صلاحية');


        // معرف الجلسة قبل تسجيل «login» في السجل لربط كل الأحداث بنفس الجلسة
        let currentSessionId = sessionStorage.getItem('hse_session_id');
        if (!currentSessionId) {
            const _arr = new Uint8Array(16);
            crypto.getRandomValues(_arr);
            currentSessionId = `SESS_${Date.now().toString(36)}_${Array.from(_arr).map(b => b.toString(16).padStart(2,'0')).join('')}`;
            sessionStorage.setItem('hse_session_id', currentSessionId);
        }
        AppState.currentUser.sessionId = currentSessionId;
        this._touchSessionActivity();

        if (typeof UserActivityLog !== 'undefined') {
            UserActivityLog.log('login', 'Authentication', null, {
                description: `تسجيل دخول المستخدم ${AppState.currentUser.name || AppState.currentUser.email}`
            }).catch(() => { });
        }

        // تحديث بيانات تسجيل الدخول للمستخدم في قاعدة البيانات
        const usersList = AppState.appData.users || [];
        const userIndex = usersList.findIndex(u => u.email && u.email.toLowerCase() === email);
        if (userIndex !== -1) {
            usersList[userIndex].lastLogin = loginTime;
            usersList[userIndex].isOnline = true;
            usersList[userIndex].activeSessionId = currentSessionId; // حفظ معرف الجلسة
            let history = usersList[userIndex].loginHistory;
            if (typeof history === 'string') {
                try {
                    history = JSON.parse(history);
                } catch (e) {
                    history = [];
                }
            }
            if (!Array.isArray(history)) {
                history = [];
            }
            usersList[userIndex].loginHistory = history;
            usersList[userIndex].loginHistory.push({
                time: loginTime,
                ip: 'N/A',
                userAgent: navigator.userAgent.substring(0, 100),
                sessionId: currentSessionId
            });
            // الاحتفاظ بآخر 10 عمليات تسجيل دخول فقط
            if (usersList[userIndex].loginHistory.length > 10) {
                usersList[userIndex].loginHistory = usersList[userIndex].loginHistory.slice(-10);
            }
            AppState.appData.users = usersList;
            
            // تحديث عدد تسجيلات الدخول الإجمالي للنظام
            if (!AppState.appData.systemStatistics) {
                AppState.appData.systemStatistics = {};
            }
            if (typeof AppState.appData.systemStatistics.totalLogins !== 'number') {
                AppState.appData.systemStatistics.totalLogins = 0;
            }
            AppState.appData.systemStatistics.totalLogins += 1;
            
            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }

            // ✅ ملاحظة أداء: الخادم (loginUser) يحدّث lastLogin/isOnline مباشرةً عبر
            // مسار سريع (_fastTouchUserLoginFields_)، لذا لا نحتاج لطلب updateUser ثانٍ من العميل.

            // تحديث جدول المستخدمين فوراً إذا كان مفتوحاً
            if (typeof Users !== 'undefined' && typeof Users.updateUserStatus === 'function') {
                setTimeout(() => {
                    Users.updateUserStatus(usersList[userIndex].id);
                }, 100);
            }
            
            // تحديث زر حالة الاتصال في الشريط الجانبي
            if (typeof UI !== 'undefined' && typeof UI.updateUserConnectionStatus === 'function') {
                setTimeout(() => {
                    UI.updateUserConnectionStatus();
                    // بدء التحديث التلقائي لحالة الاتصال
                    if (typeof UI.startAutoRefreshConnectionStatus === 'function') {
                        UI.startAutoRefreshConnectionStatus();
                    }
                }, 200);
            }
        } else if (!foundUser && user) {
            // إضافة المستخدم إلى قاعدة البيانات (إذا كان جديداً)
            const newUser = {
                id: Utils.generateId('USER'),
                email: email,
                name: user.name,
                password: user.password,
                role: user.role || 'user',
                department: user.department || '',
                active: true,
                permissions: user.permissions || {},
                lastLogin: loginTime,
                isOnline: true,
                activeSessionId: currentSessionId,
                loginHistory: [{
                    time: loginTime,
                    ip: 'N/A',
                    userAgent: navigator.userAgent.substring(0, 100),
                    sessionId: currentSessionId
                }],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            AppState.appData.users.push(newUser);
            
            // تحديث عدد تسجيلات الدخول الإجمالي للنظام
            if (!AppState.appData.systemStatistics) {
                AppState.appData.systemStatistics = {};
            }
            if (typeof AppState.appData.systemStatistics.totalLogins !== 'number') {
                AppState.appData.systemStatistics.totalLogins = 0;
            }
            AppState.appData.systemStatistics.totalLogins += 1;
            
            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            }
            // لا يتم تحديث Google Sheets تلقائياً بعد تسجيل الدخول للحفاظ على السجلات الأصلية
        }

        // حفظ الجلسة بشكل آمن (بدون passwordHash)
        const safeUserData = {
            email: AppState.currentUser.email,
            name: AppState.currentUser.name,
            role: AppState.currentUser.role,
            department: AppState.currentUser.department,
            permissions: AppState.currentUser.permissions,
            id: AppState.currentUser.id,
            loginTime: AppState.currentUser.loginTime,
            sessionId: currentSessionId, // حفظ معرف الجلسة في الجلسة
            photo: AppState.currentUser.photo || '' // ✅ حفظ الصورة لاستعادتها عند فتح الصفحة
            // تم إزالة passwordHash لأسباب أمنية
        };

        sessionStorage.setItem('hse_current_session', JSON.stringify(safeUserData));
        this._touchSessionActivity();
        Utils.safeLog('💾 تم حفظ الجلسة في sessionStorage');

        // إذا اختار "تذكرني"، نحفظ في localStorage أيضاً
        if (remember) {
            localStorage.setItem('hse_remember_user', JSON.stringify(safeUserData));
            Utils.safeLog('💾 تم حفظ الجلسة في localStorage (تذكرني)');
        } else {
            // إذا لم يختر "تذكرني"، نحذف من localStorage
            localStorage.removeItem('hse_remember_user');
            Utils.safeLog('🗑 تم حذف localStorage (لم يختر تذكرني)');
        }

        // التحقق من التسجيل الأول أو عدم تغيير كلمة المرور
        const requiresPasswordChange = fullUserData?.forcePasswordChange === true;
        const isFirstLogin = !fullUserData?.passwordChanged;

        if (!requiresPasswordChange) {
            Notification.success(`مرحباً ${user.name}`);
        }

        // تحميل إعدادات Google بشكل دائم بعد تسجيل الدخول (يجب أن تكون متاحة لجميع المستخدمين)
        if (typeof window.DataManager !== 'undefined' && window.DataManager.loadBackendConfig) {
            try {
                window.DataManager.loadBackendConfig();
                Utils.safeLog('✅ تم تحميل إعدادات Google بعد تسجيل الدخول');
            } catch (configError) {
                Utils.safeWarn('⚠️ خطأ في تحميل إعدادات Google بعد تسجيل الدخول:', configError);
            }
        }

        // بدء نظام مراقبة الاتصال بعد تسجيل الدخول
        if (typeof ConnectionMonitor !== 'undefined' && ConnectionMonitor.start) {
            setTimeout(() => {
                try {
                    ConnectionMonitor.start();
                    Utils.safeLog('✅ تم بدء نظام مراقبة الاتصال بعد تسجيل الدخول');
                } catch (monitorError) {
                    Utils.safeWarn('⚠️ فشل بدء نظام مراقبة الاتصال:', monitorError);
                }
            }, 500);
        }

        // ✅ إصلاح: تحميل البيانات الأساسية أولاً بشكل مباشر ومتسلسل بدون تأخير
        // بدء تحميل البيانات مباشرة بعد تسجيل الدخول (بدون requestAnimationFrame)
        // ⚠️ مهم: لا نستخدم await هنا حتى لا نبطئ عملية تسجيل الدخول
        // لكن نبدأ التحميل فوراً في الخلفية
        AppState._initialDataLoadOwner = 'auth';
        AppState._initialDataLoadInProgress = true;
        AppState._initialDataLoadCompleted = false;
        AppState._initialDataLoadStartedAt = Date.now();
        (async () => {
            try {
                Utils.safeLog('🚀 بدء تحميل البيانات بعد تسجيل الدخول...');
                
                // ✅ الخطوة 1: تحميل البيانات المحلية أولاً كـ fallback فوري
                if (typeof DataManager !== 'undefined' && DataManager.load) {
                    try {
                        await DataManager.load();
                        Utils.safeLog('✅ تم تحميل البيانات المحلية');
                    } catch (loadError) {
                        Utils.safeWarn('⚠️ فشل تحميل البيانات المحلية:', loadError);
                    }
                }

                // ✅ المواقع والمصانع والأماكن الفرعية — فوراً لجميع المستخدمين (قبل جلب الجداول الثقيلة) لتقليل السباق والتأخير
                if (typeof Permissions !== 'undefined' && typeof Permissions.initFormSettingsState === 'function') {
                    try {
                        await Permissions.initFormSettingsState();
                        if (AppState.debugMode) {
                            Utils.safeLog('✅ تم تهيئة مواقع النماذج مبكراً بعد الدخول');
                        }
                    } catch (formEarlyErr) {
                        Utils.safeWarn('⚠️ فشل تهيئة مواقع النماذج المبكرة بعد الدخول:', formEarlyErr);
                    }
                }

                // ✅ الخطوة 2: تحميل البيانات الأساسية بشكل متسلسل (مهم جداً)
                if (typeof Utils !== 'undefined' && typeof Utils.hasCloudBackendSync === 'function' && Utils.hasCloudBackendSync() && typeof Backend !== 'undefined') {
                    const prioritySheets = ['Users', 'Employees', 'ExternalWorkforceMonthly', 'Contractors', 'ApprovedContractors'];
                    const sheetMapping = {
                        'Users': 'users',
                        'Employees': 'employees',
                        'ExternalWorkforceMonthly': 'externalWorkforceMonthly',
                        'Contractors': 'contractors',
                        'ApprovedContractors': 'approvedContractors'
                    };

                    // ✅ تحميل متوازٍ كامل للبيانات الأساسية لتقليل زمن الانتظار
                    // (5 عمّال = طلب موازٍ واحد لكل شيت — Apps Script يتعامل مع طلبات متوازية).
                    const workerCount = prioritySheets.length;
                    let cursor = 0;
                    const loadPrioritySheet = async (sheetName) => {
                        try {
                            const data = await Backend.readFromSheets(sheetName, 8000);
                            const key = sheetMapping[sheetName];

                            if (key && Array.isArray(data) && data.length > 0) {
                                AppState.appData[key] = data;
                                Utils.safeLog(`✅ تم تحميل ${sheetName}: ${data.length} سجل`);
                            } else if (key && Array.isArray(AppState.appData[key]) && AppState.appData[key].length > 0) {
                                Utils.safeLog(`⚠️ ${sheetName}: فشل التحميل من Google Sheets - استخدام ${AppState.appData[key].length} سجل محلي`);
                            }
                        } catch (error) {
                            const key = sheetMapping[sheetName];
                            const errorMsg = error?.message || String(error);

                            if (key && Array.isArray(AppState.appData[key]) && AppState.appData[key].length > 0) {
                                Utils.safeLog(`⚠️ ${sheetName}: فشل التحميل (${errorMsg}) - استخدام ${AppState.appData[key].length} سجل محلي`);
                            } else {
                                Utils.safeWarn(`⚠️ ${sheetName}: فشل التحميل ولا توجد بيانات محلية احتياطية`);
                                if (sheetName === 'Users' && typeof Notification !== 'undefined') {
                                    Notification.warning('تعذر تحميل بيانات المستخدمين. قد تحتاج إلى تحديث الصفحة.', 5000);
                                }
                            }
                        }
                    };
                    const workers = Array.from({ length: Math.min(workerCount, prioritySheets.length) }, async () => {
                        while (cursor < prioritySheets.length) {
                            const index = cursor++;
                            const sheetName = prioritySheets[index];
                            await loadPrioritySheet(sheetName);
                        }
                    });

                    // ✅ تحميل إعدادات الشركة بالتوازي مع شيتات الأولوية (بدلاً من بعدها)
                    const companySettingsPromise = (typeof DataManager !== 'undefined' && DataManager.loadCompanySettings)
                        ? DataManager.loadCompanySettings(true).catch(settingsErr => {
                            Utils.safeWarn('⚠️ فشل تحميل إعدادات الشركة:', settingsErr);
                        })
                        : Promise.resolve();

                    await Promise.allSettled([...workers, companySettingsPromise]);

                    // ✅ الخطوة 3: تحديث الجلسة والقائمة بعد تحميل بيانات المستخدمين
                    // هذا مهم جداً لضمان تحديث الصلاحيات والقائمة الجانبية
                    try {
                        if (typeof window.Auth !== 'undefined' && typeof window.Auth.updateUserSession === 'function') {
                            window.Auth.updateUserSession();
                        }

                        if (typeof Permissions !== 'undefined' && typeof Permissions.updateNavigation === 'function') {
                            Permissions.updateNavigation();
                        }
                    } catch (updateError) {
                        Utils.safeWarn('⚠️ فشل تحديث الجلسة أو القائمة:', updateError);
                    }

                    Utils.safeLog('✅ اكتمل تحميل البيانات الأساسية');
                    AppState._initialDataLoadCompleted = true;
                    AppState._initialDataLoadCompletedAt = Date.now();

                    // ✅ الخطوة 4: تحميل بيانات الموديولات في الخلفية (مواقع النماذج سبق تهيئتها بعد البيانات المحلية)
                    this.loadModulesDataSequentially().catch(err => {
                        Utils.safeWarn('⚠️ فشل تحميل بيانات الموديولات:', err);
                    });
                } else {
                    Utils.safeLog('ℹ️ الخادم الخلفي غير مُهيأ للمزامنة - استخدام البيانات المحلية فقط');
                    AppState._initialDataLoadCompleted = true;
                    AppState._initialDataLoadCompletedAt = Date.now();
                }
            } catch (err) {
                Utils.safeError('❌ خطأ عام في تحميل البيانات:', err);
                AppState._initialDataLoadCompleted = true;
                AppState._initialDataLoadCompletedAt = Date.now();
                
                // ✅ معالجة الأخطاء الشاملة: التأكد من استخدام البيانات المحلية عند الفشل الكامل
                if (typeof DataManager !== 'undefined' && DataManager.load) {
                    try {
                        await DataManager.load();
                        Utils.safeLog('✅ تم تحميل البيانات المحلية كـ fallback بعد الخطأ');
                    } catch (loadError) {
                        Utils.safeError('❌ فشل تحميل البيانات المحلية أيضاً:', loadError);
                        
                        // إظهار رسالة للمستخدم في حالة الفشل الكامل
                        if (typeof Notification !== 'undefined') {
                            Notification.error('تعذر تحميل البيانات. يرجى تحديث الصفحة والمحاولة مرة أخرى.', 8000);
                        }
                    }
                }
                try {
                    if (typeof Permissions !== 'undefined' && typeof Permissions.initFormSettingsState === 'function') {
                        await Permissions.initFormSettingsState();
                    }
                } catch (formCatchErr) {
                    Utils.safeWarn('⚠️ فشل تهيئة مواقع النماذج بعد الخطأ العام:', formCatchErr);
                }
            } finally {
                AppState._initialDataLoadInProgress = false;
            }
        })();

        // إرسال حدث نجاح تسجيل الدخول لتحديث عدد تسجيلات الدخول في الفوتر
        try {
            const loginSuccessEvent = new CustomEvent('loginSuccess', {
                detail: {
                    user: AppState.currentUser,
                    loginTime: loginTime
                }
            });
            document.dispatchEvent(loginSuccessEvent);
        } catch (e) {
            // تجاهل الأخطاء في حالة عدم دعم CustomEvent
        }

        // إرجاع معلومات عن حالة تغيير كلمة المرور
        return {
            success: true,
            requiresPasswordChange: requiresPasswordChange,
            isFirstLogin: isFirstLogin
        };
    },
    logout() {
        // ✅ إيقاف المزامنة التلقائية الدورية عند تسجيل الخروج
        if (typeof window.UI !== 'undefined' && typeof window.UI.stopBackgroundSync === 'function') {
            window.UI.stopBackgroundSync();
        }

        // ✅ تنظيف كامل لـ RealtimeSyncManager (intervals + BroadcastChannel + polling)
        if (typeof window.RealtimeSyncManager !== 'undefined' && typeof window.RealtimeSyncManager.cleanup === 'function') {
            try { window.RealtimeSyncManager.cleanup(); } catch (_e) { /* ignore */ }
        }

        // إيقاف نظام عدم النشاط
        if (typeof InactivityManager !== 'undefined') {
            InactivityManager.stop();
        }

        // إيقاف نظام مراقبة الاتصال
        if (typeof ConnectionMonitor !== 'undefined' && ConnectionMonitor.stop) {
            try {
                ConnectionMonitor.stop();
                Utils.safeLog('✅ تم إيقاف نظام مراقبة الاتصال');
            } catch (monitorError) {
                Utils.safeWarn('⚠️ فشل إيقاف نظام مراقبة الاتصال:', monitorError);
            }
        }

        // تسجيل حركة تسجيل الخروج قبل حذف بيانات المستخدم
        if (AppState.currentUser && typeof UserActivityLog !== 'undefined') {
            const userName = AppState.currentUser.name || AppState.currentUser.email || 'مستخدم غير معروف';
            UserActivityLog.log('logout', 'Authentication', null, {
                description: `تسجيل خروج المستخدم ${userName}`
            }).catch(() => { }); // لا ننتظر حتى لا نبطئ عملية تسجيل الخروج
        }

        // تحديث حالة المستخدم إلى غير متصل
        if (AppState.currentUser && AppState.currentUser.email) {
            const users = AppState.appData.users || [];
            const userIndex = users.findIndex(u => u.email && u.email.toLowerCase() === AppState.currentUser.email.toLowerCase());
            if (userIndex !== -1) {
                users[userIndex].isOnline = false;
                users[userIndex].lastLogout = new Date().toISOString();
                users[userIndex].activeSessionId = null; // مسح معرف الجلسة عند تسجيل الخروج
                AppState.appData.users = users;
                
                if (typeof window.DataManager !== 'undefined' && window.DataManager.saveImmediate) {
                    window.DataManager.saveImmediate();
                }

                if (typeof Backend !== 'undefined' && Backend.sendToAppsScript &&
                    typeof Utils !== 'undefined' && typeof Utils.hasCloudBackendSync === 'function' && Utils.hasCloudBackendSync()) {
                    const userId = users[userIndex].id;
                    const updateData = {
                        lastLogout: users[userIndex].lastLogout,
                        isOnline: false,
                        activeSessionId: null // مسح معرف الجلسة في Google Sheets
                    };
                    
                    Backend.sendToAppsScript('updateUser', {
                        userId: userId,
                        updateData: updateData
                    }).then(updateResult => {
                        if (updateResult && updateResult.success) {
                            Utils.safeLog('✅ تم مزامنة lastLogout و activeSessionId مع الخادم بنجاح');
                        } else {
                            Utils.safeWarn('⚠️ فشل مزامنة lastLogout مع الخادم:', updateResult?.message);
                        }
                    }).catch(updateError => {
                        Utils.safeWarn('⚠️ خطأ في مزامنة lastLogout مع الخادم:', updateError);
                        // لا نوقف تسجيل الخروج حتى لو فشلت المزامنة
                    });
                }
            
            // تحديث جدول المستخدمين فوراً إذا كان مفتوحاً
                if (typeof Users !== 'undefined' && typeof Users.updateUserStatus === 'function') {
                    setTimeout(() => {
                        Users.updateUserStatus(users[userIndex].id);
                    }, 100);
                }
                
                // تحديث زر حالة الاتصال في الشريط الجانبي
                if (typeof UI !== 'undefined' && typeof UI.updateUserConnectionStatus === 'function') {
                    UI.updateUserConnectionStatus();
                }
                
                // إيقاف التحديث التلقائي لحالة الاتصال
                if (typeof UI !== 'undefined' && typeof UI.stopAutoRefreshConnectionStatus === 'function') {
                    UI.stopAutoRefreshConnectionStatus();
                }
            }
        }

        AppState.currentUser = null;

        // إعادة تعيين حالة جلب سجل التردد الكامل في العيادة (جلسة جديدة = جلب من الخادم مرة أخرى عند الحاجة)
        if (typeof window !== 'undefined' && window.Clinic && typeof window.Clinic === 'object') {
            try { window.Clinic._visitsBackendFetchOk = false; } catch (e) {}
        }
        if (typeof window !== 'undefined' && window.Training && typeof window.Training === 'object') {
            try {
                window.Training._trainingBackendFetchOk = false;
                window.Training._trainingDataLoadPromise = null;
            } catch (e) {}
        }
        if (typeof window !== 'undefined' && window.ChemicalSafety && typeof window.ChemicalSafety === 'object') {
            try {
                window.ChemicalSafety._chemicalBackendFetchOk = false;
                window.ChemicalSafety._chemicalDataLoadPromise = null;
            } catch (e) {}
        }
        if (typeof window !== 'undefined' && window.DailyObservations && typeof window.DailyObservations === 'object') {
            try {
                window.DailyObservations._dailyObsBackendFetchOk = false;
                window.DailyObservations._dailyObsLoadPromise = null;
            } catch (e) {}
        }
        
        // مسح جميع بيانات الجلسة
        try {
            localStorage.removeItem('hse_remember_user');
            sessionStorage.removeItem('hse_current_session');
            sessionStorage.removeItem('hse_current_section');
            sessionStorage.removeItem('hse_session_id'); // مسح معرف الجلسة
            if (window.SaaSTenantCache && typeof window.SaaSTenantCache.clearAllTenantData === 'function') {
                window.SaaSTenantCache.clearAllTenantData();
            }
            if (window.SAAS_CONFIG && window.SAAS_CONFIG.useSupabaseBackend && window.SaaS && typeof window.SaaS.signOut === 'function') {
                window.SaaS.signOut().catch(() => {});
            }
            Utils.safeLog('✅ تم مسح جميع بيانات الجلسة بما في ذلك معرف الجلسة');
        } catch (e) {
            Utils.safeWarn('⚠️ فشل مسح بعض بيانات الجلسة:', e);
        }
        
        if (typeof Notification !== 'undefined') {
            Notification.info('تم تسجيل الخروج بنجاح');
        }
        
        if (typeof UI !== 'undefined') {
            UI.toggleSidebar(false);
            UI.updateUserProfile();
            UI.showLoginScreen();
        }
    },

    /**
     * التحقق من المستخدم المحوظ
     */
    checkRememberedUser() {
        try {
            // أولاً: التحقق من sessionStorage (للمتصح الحالي)
            let sessionData = sessionStorage.getItem('hse_current_session');
            if (sessionData) {
                try {
                    const user = JSON.parse(sessionData);
                    // التحقق من أن البيانات صحيحة وأن المستخدم ما زال موجوداً
                    if (user && user.email) {
                        if (this._isSessionExpiredForRestore(user)) {
                            Utils.safeWarn('⚠️ انتهت صلاحية الجلسة (الحد الأقصى أو الخمول)');
                            this._clearStoredSession();
                            return false;
                        }
                        // استعادة hse_session_id من بيانات الجلسة إن فُقد (بعد إعادة تحميل في نفس التبويب)
                        let currentSessionId = sessionStorage.getItem('hse_session_id');
                        if (!currentSessionId && user.sessionId) {
                            try {
                                sessionStorage.setItem('hse_session_id', user.sessionId);
                                currentSessionId = user.sessionId;
                            } catch (e) { /* ignore */ }
                        }

                        // التحقق من وجود المستخدم ي قاعدة البيانات
                        const email = user.email.toLowerCase();
                        const users = AppState.appData.users || [];
                        let foundUser = users.find(u => u.email && u.email.toLowerCase() === email);

                        // فقط إذا وُجد المستخدم وكان غير مفعّل، نمسح الجلسة
                        if (foundUser && foundUser.active === false) {
                            // المستخدم غير معّل
                            sessionStorage.removeItem('hse_current_session');
                            localStorage.removeItem('hse_remember_user');
                            sessionStorage.removeItem('hse_session_id');
                            AppState.isPageRefresh = false;
                            return false;
                        }

                        // التحقق من معرف الجلسة: عند إعادة التحميل (نفس التبويب) لا نرفض الجلسة بسبب كاش قديم
                        if (!currentSessionId) currentSessionId = sessionStorage.getItem('hse_session_id');
                        if (foundUser && foundUser.isOnline === true && foundUser.activeSessionId && !AppState.isPageRefresh) {
                            if (foundUser.activeSessionId !== currentSessionId) {
                                Utils.safeWarn('⚠️ المستخدم متصل من جهاز آخر - لا يمكن استعادة الجلسة');
                                sessionStorage.removeItem('hse_current_session');
                                localStorage.removeItem('hse_remember_user');
                                sessionStorage.removeItem('hse_session_id');
                                AppState.isPageRefresh = false;
                                return false;
                            }
                        }

                        // التحقق من أن معرف الجلسة في بيانات الجلسة يطابق المعرف الحالي
                        if (user.sessionId && currentSessionId && user.sessionId !== currentSessionId) {
                            Utils.safeWarn('⚠️ معرف الجلسة غير متطابق - مسح الجلسة القديمة');
                            sessionStorage.removeItem('hse_current_session');
                            localStorage.removeItem('hse_remember_user');
                            AppState.isPageRefresh = false;
                            return false;
                        }

                        // نقبل المستخدم حتى لو لم نجده في قاعدة البيانات
                        // لأنه قد يكون هناك تأخير في تحميل البيانات من Google Sheets
                        if (foundUser) {
                            // استخدام بيانات المستخدم الكاملة من قاعدة البيانات
                            // ✅ ضمان name صحيح حتى في الاستعادة
                            const mergedName = (foundUser.name || foundUser.displayName || '').trim() || user.email || user.name || '';
                            
                            AppState.currentUser = {
                                ...user,
                                ...foundUser,
                                name: mergedName,
                                password: '***', // إخفاء كلمة المرور
                                loginTime: user.loginTime || AppState.currentUser?.loginTime // الحفاظ على وقت تسجيل الدخول
                            };
                            this._sanitizeCurrentUserSecrets();
                            
                            Utils.safeLog('✅ [AUTH] تم استعادة الجلسة من sessionStorage');
                            
                            // ✅ إصلاح: تحديث الجلسة بالبيانات الجديدة من قاعدة البيانات
                            this.updateUserSession();
                        } else {
                            // استخدام بيانات المستخدم من الجلسة المحفوظة
                            AppState.currentUser = {
                                ...user,
                                name: (user.name || user.displayName || '').trim() || user.email || user.id || ''
                            };
                            Utils.safeLog('⚠️ استخدام بيانات المستخدم من الجلسة (لم يُعثر عليه في قاعدة البيانات بعد)');
                            
                            // ✅ إصلاح: محاولة تحديث الجلسة بعد تحميل البيانات (إذا لم تكن محملة بعد)
                            // نضيف مستمع لتحديث الجلسة عندما يتم تحميل بيانات المستخدمين
                            if (!AppState._sessionUpdateScheduled) {
                                AppState._sessionUpdateScheduled = true;
                                let retryCount = 0;
                                const maxRetries = 5; // الحد الأقصى للمحاولات
                                
                                const checkAndUpdateSession = () => {
                                    retryCount++;
                                    
                                    // ✅ إصلاح: التحقق من عدم تجاوز الحد الأقصى للمحاولات
                                    if (retryCount > maxRetries) {
                                        AppState._sessionUpdateScheduled = false;
                                        Utils.safeWarn('⚠️ تم تجاوز الحد الأقصى لمحاولات تحديث الجلسة');
                                        return;
                                    }
                                    
                                    const users = AppState.appData.users || [];
                                    const dbUser = users.find(u => u.email && u.email.toLowerCase() === user.email.toLowerCase());
                                    
                                    if (dbUser) {
                                        // تم العثور على المستخدم - تحديث الجلسة
                                        // ✅ إصلاح: الحفاظ على جميع البيانات المهمة من الجلسة الحالية
                                        const mergedName = (dbUser.name || dbUser.displayName || '').trim() || user.email || user.name || '';
                                        
                                        AppState.currentUser = {
                                            ...user, // الحفاظ على بيانات الجلسة الأصلية
                                            ...dbUser, // دمج بيانات قاعدة البيانات
                                            name: mergedName,
                                            password: '***',
                                            loginTime: user.loginTime || AppState.currentUser?.loginTime, // الحفاظ على وقت تسجيل الدخول
                                            id: dbUser.id || user.id || AppState.currentUser?.id // الحفاظ على ID
                                        };
                                        this._sanitizeCurrentUserSecrets();
                                        
                                        Utils.safeLog('✅ [AUTH] تم تحديث الجلسة تلقائياً');
                                        
                                        // تحديث الجلسة فقط إذا كانت هناك تغييرات فعلية
                                        this.updateUserSession();
                                        AppState._sessionUpdateScheduled = false;
                                        Utils.safeLog(`✅ تم تحديث الجلسة بعد تحميل بيانات المستخدمين (محاولة ${retryCount})`);
                                    } else {
                                        // لم يتم العثور بعد - إعادة المحاولة بعد قليل
                                        if (retryCount < maxRetries) {
                                            const delay = Math.min(500 * retryCount, 1500); // تقليل التأخير التدريجي
                                            setTimeout(checkAndUpdateSession, delay);
                                        } else {
                                            AppState._sessionUpdateScheduled = false;
                                            Utils.safeWarn('⚠️ لم يتم العثور على المستخدم في قاعدة البيانات بعد عدة محاولات');
                                        }
                                    }
                                };
                                
                                // محاولة فورية أولاً
                                setTimeout(checkAndUpdateSession, 250);
                            }
                        }
                        
                        // حفظ الجلسة مرة أخرى للتأكد من استمراريتها
                        const safeUserData = {
                            email: AppState.currentUser.email,
                            name: AppState.currentUser.name,
                            role: AppState.currentUser.role,
                            department: AppState.currentUser.department,
                            factory: AppState.currentUser.factory || AppState.currentUser.factoryId || '',
                            factoryId: AppState.currentUser.factoryId || AppState.currentUser.factory || '',
                            factoryName: AppState.currentUser.factoryName || '',
                            subLocation: AppState.currentUser.subLocation || AppState.currentUser.subLocationId || '',
                            subLocationId: AppState.currentUser.subLocationId || AppState.currentUser.subLocation || '',
                            subLocationName: AppState.currentUser.subLocationName || '',
                            branch: AppState.currentUser.branch || '',
                            permissions: AppState.currentUser.permissions,
                            id: AppState.currentUser.id,
                            loginTime: AppState.currentUser.loginTime,
                            photo: AppState.currentUser.photo || ''
                        };
                        sessionStorage.setItem('hse_current_session', JSON.stringify(safeUserData));
                        this._touchSessionActivity();
                        Utils.safeLog('✅ تم استعادة الجلسة من sessionStorage - المستخدم مسجل دخول');
                        return true;
                    }
                } catch (e) {
                    Utils.safeWarn('⚠️ خطأ في تحليل بيانات sessionStorage:', e);
                    // في حالة الخطأ، نحاول مسح الجلسة التالفة
                    try {
                        sessionStorage.removeItem('hse_current_session');
                        sessionStorage.removeItem('hse_session_id');
                    } catch (clearError) {
                        Utils.safeWarn('⚠️ فشل مسح الجلسة التالفة:', clearError);
                    }
                }
            }

            // ثانياً: التحقق من localStorage (إذا كان اختار "تذكرني")
            const remembered = localStorage.getItem('hse_remember_user');
            if (remembered) {
                try {
                    const user = JSON.parse(remembered);
                    // التحقق من صحة البيانات وأن المستخدم ما زال موجوداً
                    if (user && user.email) {
                        if (this._isSessionExpiredForRestore(user)) {
                            Utils.safeWarn('⚠️ انتهت صلاحية الجلسة المحفوظة (تذكرني)');
                            this._clearStoredSession();
                            return false;
                        }
                        let currentSessionId = sessionStorage.getItem('hse_session_id');
                        if (!currentSessionId && user.sessionId) {
                            try {
                                sessionStorage.setItem('hse_session_id', user.sessionId);
                                currentSessionId = user.sessionId;
                            } catch (e) { /* ignore */ }
                        }

                        const email = user.email.toLowerCase();
                        const users = AppState.appData.users || [];
                        let foundUser = users.find(u => u.email && u.email.toLowerCase() === email);

                        if (foundUser && foundUser.active === false) {
                            localStorage.removeItem('hse_remember_user');
                            sessionStorage.removeItem('hse_session_id');
                            AppState.isPageRefresh = false;
                            return false;
                        }

                        if (foundUser && foundUser.isOnline === true && foundUser.activeSessionId && !AppState.isPageRefresh) {
                            if (foundUser.activeSessionId !== currentSessionId) {
                                Utils.safeWarn('⚠️ المستخدم متصل من جهاز آخر - لا يمكن استعادة الجلسة من localStorage');
                                localStorage.removeItem('hse_remember_user');
                                sessionStorage.removeItem('hse_session_id');
                                AppState.isPageRefresh = false;
                                return false;
                            }
                        }

                        if (user.sessionId && currentSessionId && user.sessionId !== currentSessionId) {
                            Utils.safeWarn('⚠️ معرف الجلسة في localStorage غير متطابق - مسح الجلسة القديمة');
                            localStorage.removeItem('hse_remember_user');
                            AppState.isPageRefresh = false;
                            return false;
                        }

                        // نقبل المستخدم حتى لو لم نجده في قاعدة البيانات
                        if (foundUser) {
                            // استخدام بيانات المستخدم الكاملة من قاعدة البيانات
                            // ✅ الحل الجذري: التأكد من وجود name صحيح
                            // ✅ إصلاح: استخدام الاسم فقط (وليس email)
                            let mergedName = (foundUser.name || foundUser.displayName || '').trim();
                            
                            // ✅ إذا كان mergedName فارغ أو "النظام"، نستخدم "مستخدم" كبديل
                            if (!mergedName || mergedName === 'النظام' || mergedName === '') {
                                mergedName = 'مستخدم';
                            }
                            
                            AppState.currentUser = {
                                ...user,
                                ...foundUser,
                                name: mergedName, // ✅ استخدام mergedName
                                password: '***', // إخفاء كلمة المرور
                                loginTime: user.loginTime || AppState.currentUser?.loginTime // الحفاظ على وقت تسجيل الدخول
                            };
                            this._sanitizeCurrentUserSecrets();
                            
                            Utils.safeLog('✅ [AUTH] تم استعادة الجلسة من localStorage');
                            
                            // ✅ إصلاح: تحديث الجلسة بالبيانات الجديدة من قاعدة البيانات
                            this.updateUserSession();
                        } else {
                            // استخدام بيانات المستخدم من localStorage
                            AppState.currentUser = {
                                ...user,
                                name: (user.name || user.displayName || '').trim() || user.email || user.id || ''
                            };
                            Utils.safeLog('⚠️ استخدام بيانات المستخدم من localStorage (لم يُعثر عليه في قاعدة البيانات بعد)');
                            
                            // ✅ إصلاح: محاولة تحديث الجلسة بعد تحميل البيانات (إذا لم تكن محملة بعد)
                            // استخدام نفس آلية retry المحسّنة
                            if (!AppState._sessionUpdateScheduled) {
                                AppState._sessionUpdateScheduled = true;
                                let retryCount = 0;
                                const maxRetries = 5; // الحد الأقصى للمحاولات
                                
                                const checkAndUpdateSession = () => {
                                    retryCount++;
                                    
                                    // ✅ إصلاح: التحقق من عدم تجاوز الحد الأقصى للمحاولات
                                    if (retryCount > maxRetries) {
                                        AppState._sessionUpdateScheduled = false;
                                        Utils.safeWarn('⚠️ تم تجاوز الحد الأقصى لمحاولات تحديث الجلسة');
                                        return;
                                    }
                                    
                                    const users = AppState.appData.users || [];
                                    const dbUser = users.find(u => u.email && u.email.toLowerCase() === user.email.toLowerCase());
                                    
                                    if (dbUser) {
                                        // تم العثور على المستخدم - تحديث الجلسة
                                        // ✅ إصلاح: الحفاظ على جميع البيانات المهمة من الجلسة الحالية
                                        const mergedName = (dbUser.name || dbUser.displayName || '').trim() || user.email || user.name || '';
                                        
                                        AppState.currentUser = {
                                            ...user, // الحفاظ على بيانات الجلسة الأصلية
                                            ...dbUser, // دمج بيانات قاعدة البيانات
                                            name: mergedName,
                                            password: '***',
                                            loginTime: user.loginTime || AppState.currentUser?.loginTime, // الحفاظ على وقت تسجيل الدخول
                                            id: dbUser.id || user.id || AppState.currentUser?.id // الحفاظ على ID
                                        };
                                        this._sanitizeCurrentUserSecrets();
                                        
                                        Utils.safeLog('✅ [AUTH] تم تحديث الجلسة تلقائياً من localStorage');
                                        
                                        // تحديث الجلسة فقط إذا كانت هناك تغييرات فعلية
                                        this.updateUserSession();
                                        AppState._sessionUpdateScheduled = false;
                                        Utils.safeLog(`✅ تم تحديث الجلسة بعد تحميل بيانات المستخدمين (محاولة ${retryCount})`);
                                    } else {
                                        // لم يتم العثور بعد - إعادة المحاولة بعد قليل
                                        if (retryCount < maxRetries) {
                                            const delay = Math.min(500 * retryCount, 1500); // تقليل التأخير التدريجي
                                            setTimeout(checkAndUpdateSession, delay);
                                        } else {
                                            AppState._sessionUpdateScheduled = false;
                                            Utils.safeWarn('⚠️ لم يتم العثور على المستخدم في قاعدة البيانات بعد عدة محاولات');
                                        }
                                    }
                                };
                                
                                // محاولة فورية أولاً
                                setTimeout(checkAndUpdateSession, 250);
                            }
                        }
                        
                        // حفظ في sessionStorage أيضاً
                        const safeUserData = {
                            email: AppState.currentUser.email,
                            name: AppState.currentUser.name,
                            role: AppState.currentUser.role,
                            department: AppState.currentUser.department,
                            permissions: AppState.currentUser.permissions,
                            id: AppState.currentUser.id,
                            loginTime: AppState.currentUser.loginTime,
                            photo: AppState.currentUser.photo || ''
                        };
                        sessionStorage.setItem('hse_current_session', JSON.stringify(safeUserData));
                        this._touchSessionActivity();
                        Utils.safeLog('✅ تم استعادة الجلسة من localStorage - المستخدم مسجل دخول');
                        return true;
                    }
                } catch (e) {
                    Utils.safeWarn('⚠️ خطأ في تحليل بيانات localStorage:', e);
                    // لا نمسح الجلسة هنا - قد تكون مشكلة مؤقتة
                }
            }
        } catch (error) {
            Utils.safeError('خطأ في التحقق من المستخدم:', error);
        }
        AppState.isPageRefresh = false;
        return false;
    },

    /**
     * تحديث جلسة المستخدم الحالي (مفيد عند تحديث الصلاحيات)
     * يقوم بتحديث sessionStorage و localStorage بالبيانات الجديدة من قاعدة البيانات
     * ✅ إصلاح: منع الاستدعاءات المتكررة غير الضرورية
     */
    updateUserSession() {
        if (!AppState.currentUser || !AppState.currentUser.email) {
            Utils.safeWarn('⚠️ لا يوجد مستخدم حالي لتحديث الجلسة');
            return false;
        }

        // ✅ إصلاح: منع الاستدعاءات المتكررة غير الضرورية
        const now = Date.now();
        const lastUpdate = AppState._lastSessionUpdate || 0;
        const UPDATE_THROTTLE = 500; // 500ms - الحد الأدنى بين التحديثات
        
        if (now - lastUpdate < UPDATE_THROTTLE) {
            if (AppState.debugMode) {
                Utils.safeLog('ℹ️ تم تخطي تحديث الجلسة (throttle)');
            }
            return false;
        }
        
        // إذا كان هناك تحديث قيد التنفيذ، ننتظر
        if (AppState._sessionUpdateInProgress) {
            if (AppState.debugMode) {
                Utils.safeLog('ℹ️ تحديث الجلسة قيد التنفيذ - انتظار...');
            }
            return false;
        }
        
        AppState._sessionUpdateInProgress = true;
        AppState._lastSessionUpdate = now;

        try {
            // البحث عن المستخدم في قاعدة البيانات للحصول على أحدث البيانات
            const email = AppState.currentUser.email.toLowerCase();
            const users = AppState.appData.users || [];
            const dbUser = users.find(u => u.email && u.email.toLowerCase() === email);

            if (!dbUser) {
                Utils.safeWarn('⚠️ المستخدم غير موجود في قاعدة البيانات');
                return false;
            }

            // ✅ إصلاح: تطبيع الصلاحيات قبل التحديث
            // ✅ حماية من فقد الصلاحيات: إذا كانت permissions غير موجودة/فارغة في قاعدة البيانات نحتفظ بصلاحيات الجلسة الحالية
            const rawDbPerms = dbUser.permissions;
            const dbPermsIsMissing =
                rawDbPerms == null ||
                (typeof rawDbPerms === 'string' && rawDbPerms.trim() === '');

            const normalizedPermissions = !dbPermsIsMissing
                ? (typeof Permissions !== 'undefined' && typeof Permissions.normalizePermissions === 'function'
                    ? Permissions.normalizePermissions(rawDbPerms)
                    : (rawDbPerms || {}))
                : (AppState.currentUser.permissions || {});
            
            // ✅ إصلاح: التأكد من أن الصلاحيات المطبعة هي كائن صالح
            const finalPermissions = (normalizedPermissions && typeof normalizedPermissions === 'object' && !Array.isArray(normalizedPermissions))
                ? normalizedPermissions
                : (!dbPermsIsMissing && rawDbPerms && typeof rawDbPerms === 'object' && !Array.isArray(rawDbPerms))
                    ? rawDbPerms
                    : (AppState.currentUser.permissions && typeof AppState.currentUser.permissions === 'object' && !Array.isArray(AppState.currentUser.permissions))
                        ? AppState.currentUser.permissions
                        : {};
            
            // تحديث AppState.currentUser بالبيانات الجديدة من قاعدة البيانات
            // ✅ الحل الجذري: التأكد من وجود name صحيح عند التحديث
            // ✅ إصلاح: استخدام الاسم فقط من قاعدة البيانات (وليس email)
            let updatedName = (dbUser.name || dbUser.displayName || '').trim();
            
            // ✅ إذا كان updatedName فارغ أو "النظام"، نستخدم AppState.currentUser.name
            if (!updatedName || updatedName === 'النظام' || updatedName === '') {
                updatedName = (AppState.currentUser.name || '').toString().trim();
            }
            
            // ✅ إذا كان updatedName لا يزال فارغ، نستخدم "مستخدم" كبديل
            if (!updatedName || updatedName === 'النظام' || updatedName === '') {
                updatedName = 'مستخدم';
            }
            
            AppState.currentUser = {
                ...AppState.currentUser,
                name: updatedName, // ✅ استخدام updatedName بدلاً من dbUser.name مباشرة
                role: dbUser.role || AppState.currentUser.role,
                department: dbUser.department || AppState.currentUser.department,
                // ✅ الحفاظ/تحديث حقول المصنع/الموقع الفرعي من قاعدة البيانات إن وُجدت
                factory: dbUser.factory || dbUser.factoryId || dbUser.plant || dbUser.siteId || dbUser.site || dbUser.location || AppState.currentUser.factory || '',
                factoryId: dbUser.factoryId || dbUser.factory || dbUser.plantId || dbUser.siteId || AppState.currentUser.factoryId || '',
                factoryName: dbUser.factoryName || dbUser.plantName || dbUser.siteName || dbUser.locationName || AppState.currentUser.factoryName || '',
                subLocation: dbUser.subLocation || dbUser.subLocationId || dbUser.subSite || dbUser.subsite || dbUser.placeId || dbUser.place || dbUser.branch || AppState.currentUser.subLocation || '',
                subLocationId: dbUser.subLocationId || dbUser.placeId || dbUser.subLocation || AppState.currentUser.subLocationId || '',
                subLocationName: dbUser.subLocationName || dbUser.placeName || dbUser.subSiteName || dbUser.subsiteName || AppState.currentUser.subLocationName || '',
                branch: dbUser.branch || dbUser.branchName || AppState.currentUser.branch || '',
                permissions: finalPermissions, // استخدام الصلاحيات المطبعة والمدققة
                active: dbUser.active !== undefined ? dbUser.active : AppState.currentUser.active,
                photo: dbUser.photo || AppState.currentUser.photo,
                id: dbUser.id || AppState.currentUser.id, // الحفاظ على ID
                loginTime: AppState.currentUser.loginTime // الحفاظ على وقت تسجيل الدخول
            };
            this._sanitizeCurrentUserSecrets();
            
            Utils.safeLog('✅ [AUTH] تم تحديث بيانات المستخدم');

            // ✅ إصلاح: حفظ الجلسة بشكل آمن (بدون passwordHash)
            // التأكد من أن الصلاحيات هي كائن صالح قبل الحفظ
            const permissionsToSave = (AppState.currentUser.permissions && 
                                       typeof AppState.currentUser.permissions === 'object' && 
                                       !Array.isArray(AppState.currentUser.permissions))
                ? AppState.currentUser.permissions
                : {};
            
            const safeUserData = {
                email: AppState.currentUser.email,
                name: AppState.currentUser.name,
                role: AppState.currentUser.role,
                department: AppState.currentUser.department,
                factory: AppState.currentUser.factory || AppState.currentUser.factoryId || '',
                factoryId: AppState.currentUser.factoryId || AppState.currentUser.factory || '',
                factoryName: AppState.currentUser.factoryName || '',
                subLocation: AppState.currentUser.subLocation || AppState.currentUser.subLocationId || '',
                subLocationId: AppState.currentUser.subLocationId || AppState.currentUser.subLocation || '',
                subLocationName: AppState.currentUser.subLocationName || '',
                branch: AppState.currentUser.branch || '',
                permissions: permissionsToSave, // استخدام الصلاحيات المدققة
                id: AppState.currentUser.id,
                loginTime: AppState.currentUser.loginTime,
                photo: AppState.currentUser.photo || '' // ✅ حفظ الصورة لاستعادتها عند فتح الصفحة
            };

            // تحديث sessionStorage
            sessionStorage.setItem('hse_current_session', JSON.stringify(safeUserData));
            Utils.safeLog('✅ تم تحديث الجلسة في sessionStorage');

            // تحديث localStorage إذا كان موجوداً (تذكرني)
            const remembered = localStorage.getItem('hse_remember_user');
            if (remembered) {
                localStorage.setItem('hse_remember_user', JSON.stringify(safeUserData));
                Utils.safeLog('✅ تم تحديث الجلسة في localStorage');
            }

            // تحديث صورة المستخدم في الواجهة
            if (typeof UI !== 'undefined' && typeof UI.updateUserProfilePhoto === 'function') {
                UI.updateUserProfilePhoto();
            }

            // تحديث القائمة الجانبية حسب الصلاحيات الجديدة
            if (typeof Permissions !== 'undefined' && typeof Permissions.updateNavigation === 'function') {
                Permissions.updateNavigation();
                Utils.safeLog('✅ تم تحديث القائمة الجانبية حسب الصلاحيات الجديدة');
            }

            this._touchSessionActivity();
            AppState._sessionUpdateInProgress = false;
            return true;
        } catch (error) {
            Utils.safeError('❌ خطأ في تحديث الجلسة:', error);
            AppState._sessionUpdateInProgress = false;
            return false;
        }
    },

    /**
     * تغيير كلمة المرور
     */
    async changePassword(email, currentPassword, newPassword) {
        Utils.safeLog('🔑 بدء تغيير كلمة المرور:', { email, currentPasswordLength: currentPassword?.length, newPasswordLength: newPassword?.length });

        if (!email || !currentPassword || !newPassword) {
            Utils.safeWarn(' بيانات ناقصة');
            return false;
        }

        email = email.trim().toLowerCase();

        // البحث عن المستخدم في قاعدة البيانات
        const user = AppState.appData.users.find(u => {
            if (!u || !u.email) return false;
            return u.email.toLowerCase().trim() === email;
        });

        if (!user) {
            Utils.safeWarn(' المستخدم غير موجود:', email);
            return false;
        }

        // إزالة دعم كلمات المرور النصية - الأمان يتطلب التشفير فقط
        const storedHash = (user.passwordHash || '').trim();

        if (!storedHash || storedHash === '***' || !Utils.isSha256Hex(storedHash)) {
            Utils.safeWarn('⚠️ المستخدم لديه كلمة مرور غير مشفرة - يجب إعادة تعيينها');
            Notification.error('يجب إعادة تعيين كلمة المرور. يرجى الاتصال بالمدير.');
            return false;
        }

        // التحقق من كلمة المرور المشفرة فقط
        const currentHash = await Utils.hashPassword(currentPassword);
        const isValidPassword = currentHash.toLowerCase() === storedHash.toLowerCase();

        if (!isValidPassword) {
            Utils.safeWarn(' كلمة المرور الحالية غير صحيحة');
            return false;
        }

        // تحديث كلمة المرور
        const newHash = await Utils.hashPassword(newPassword);
        user.password = '***';
        user.passwordHash = newHash;
        user.passwordChanged = true;
        user.forcePasswordChange = false;
        user.updatedAt = new Date().toISOString();

        if (AppState.currentUser && AppState.currentUser.email === email) {
            AppState.currentUser.passwordChanged = true;
            AppState.currentUser.forcePasswordChange = false;
            this._sanitizeCurrentUserSecrets();
        }

        // حظ ي قاعدة البيانات
        // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            await window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }

        // حفظ في Google Sheets إذا كان معّلاً
        if (AppState.backendConfig && AppState.backendConfig.server && AppState.backendConfig.server.enabled && AppState.backendConfig.sheets && AppState.backendConfig.sheets.spreadsheetId) {
            try {
                await Backend.autoSave('Users', AppState.appData.users);
                Utils.safeLog('✅ تم حفظ كلمة المرور الجديدة في Google Sheets');
            } catch (error) {
                Utils.safeWarn('⚠ فشل حظ كلمة المرور ي Google Sheets:', error);
            }
        }

        Utils.safeLog('✅ تم تغيير كلمة المرور بنجاح');
        return true;
    },

    /**
     * تحميل بيانات الموديولات بشكل متسلسل حسب الصلاحيات
     * يتم تحميل البيانات بشكل متتالي لضمان عدم فقدان أي بيانات
     */
    async loadModulesDataSequentially() {
        if (!AppState.backendConfig?.server?.enabled || typeof Backend === 'undefined') {
            return;
        }

        try {
            Utils.safeLog('🔄 بدء تحميل بيانات الموديولات حسب الصلاحيات...');

            // الحصول على الموديولات المسموح بها للمستخدم
            const accessibleModules = typeof Permissions !== 'undefined' && typeof Permissions.getAccessibleModules === 'function'
                ? Permissions.getAccessibleModules(true)
                : [];

            // إذا كان المستخدم admin، نحمّل جميع الموديولات
            const isAdmin = AppState.currentUser?.role === 'admin';
            const modulesToLoad = isAdmin ? [
                'incidents', 'nearmiss', 'ptw', 'training', 'clinic', 'fire-equipment',
                'ppe', 'violations', 'behavior-monitoring', 'chemical-safety',
                'daily-observations', 'iso', 'emergency', 'safety-budget',
                'action-tracking', 'change-management', 'hse', 'safety-performance-kpis', 'sustainability',
                'risk-assessment', 'legal-documents', 'safety-health-management',
                'sop-jha', 'periodic-inspections'
            ] : accessibleModules;

            if (modulesToLoad.length === 0) {
                Utils.safeLog('ℹ️ لا توجد موديولات مسموح بها للمستخدم');
                return;
            }

            // خريطة الموديولات وأوراق Google Sheets الخاصة بها
            const moduleSheetsMap = {
                'incidents': ['Incidents'],
                'nearmiss': ['NearMiss'],
                'ptw': ['PTW', 'PTWRegistry'],
                'training': ['Training'],
                'clinic': ['ClinicVisits', 'Medications', 'SickLeave', 'Injuries', 'ClinicInventory'],
                'fire-equipment': ['FireEquipment', 'FireEquipmentAssets', 'FireEquipmentInspections'],
                'ppe': ['PPE'],
                'violations': ['Violations', 'ViolationTypes', 'Blacklist_Register'],
                'behavior-monitoring': ['BehaviorMonitoring'],
                'chemical-safety': ['ChemicalSafety', 'Chemical_Register'],
                'daily-observations': ['DailyObservations'],
                'iso': ['ISODocuments', 'ISOProcedures', 'ISOForms', 'HSEAudits'],
                'emergency': ['EmergencyAlerts', 'EmergencyPlans', 'EmergencyPlansUpdates'],
                'safety-budget': ['SafetyBudgets', 'SafetyBudgetTransactions'],
                'action-tracking': ['ActionTrackingRegister', 'HSECorrectiveActions', 'HSENonConformities', 'HSEObjectives'],
                'change-management': ['ChangeRequests'],
                'hse': ['HSENonConformities', 'HSECorrectiveActions'],
                'safety-performance-kpis': ['SafetyPerformanceKPIs', 'SafetyTeamKPIs'],
                'sustainability': ['Sustainability', 'EnvironmentalAspects', 'EnvironmentalMonitoring', 'CarbonFootprint', 'WasteManagement', 'EnergyEfficiency', 'WaterManagement', 'RecyclingPrograms'],
                'risk-assessment': ['RiskAssessments', 'HSERiskAssessments'],
                'legal-documents': ['LegalDocuments'],
                'safety-health-management': ['SafetyTeamMembers', 'SafetyOrganizationalStructure', 'SafetyJobDescriptions', 'SafetyTeamKPIs', 'SafetyTeamAttendance', 'SafetyTeamLeaves', 'SafetyTeamTasks'],
                'sop-jha': ['SOPJHA'],
                'periodic-inspections': ['PeriodicInspectionCategories', 'PeriodicInspectionRecords', 'PeriodicInspectionSchedules', 'PeriodicInspectionChecklists']
            };

            // خريطة مفاتيح المزامنة في localStorage لكل موديول (لمنع إعادة التحميل عند فتح الموديول)
            const moduleSyncKeyMap = {
                'clinic': 'clinic_last_sync',
                'violations': 'violations_last_sync',
                'periodic-inspections': 'periodic_inspections_last_sync',
                'training': 'training_last_sync',
                'chemical-safety': 'chemical_safety_last_sync',
                'daily-observations': 'daily_observations_last_sync',
            };

            // خريطة أوراق Google Sheets إلى مفاتيح AppState
            const sheetToKeyMap = {
                'Incidents': 'incidents',
                // key in AppState is `nearmiss` (not `nearMiss`)
                'NearMiss': 'nearmiss',
                'PTW': 'ptw',
                'PTWRegistry': 'ptwRegistry',
                'Training': 'training',
                'ClinicVisits': 'clinicVisits',
                'Medications': 'medications',
                'SickLeave': 'sickLeave',
                'Injuries': 'injuries',
                'ClinicInventory': 'clinicInventory',
                'FireEquipment': 'fireEquipment',
                'FireEquipmentAssets': 'fireEquipmentAssets',
                'FireEquipmentInspections': 'fireEquipmentInspections',
                'PPE': 'ppe',
                'Violations': 'violations',
                'ViolationTypes': 'violationTypes',
                'Blacklist_Register': 'blacklistRegister',
                'BehaviorMonitoring': 'behaviorMonitoring',
                'ContractorBehaviorMonitoring': 'contractorBehaviorMonitoring',
                'ChemicalSafety': 'chemicalSafety',
                'Chemical_Register': 'chemicalRegister',
                'DailyObservations': 'dailyObservations',
                'ISODocuments': 'isoDocuments',
                'ISOProcedures': 'isoProcedures',
                'ISOForms': 'isoForms',
                'HSEAudits': 'hseAudits',
                'EmergencyAlerts': 'emergencyAlerts',
                'EmergencyPlans': 'emergencyPlans',
                'EmergencyPlansUpdates': 'emergencyPlansUpdates',
                'SafetyBudgets': 'safetyBudgets',
                'SafetyBudgetTransactions': 'safetyBudgetTransactions',
                'ActionTrackingRegister': 'actionTrackingRegister',
                'ChangeRequests': 'changeRequests',
                'HSECorrectiveActions': 'hseCorrectiveActions',
                'HSENonConformities': 'hseNonConformities',
                'HSEObjectives': 'hseObjectives',
                'SafetyPerformanceKPIs': 'safetyPerformanceKPIs',
                'SafetyTeamKPIs': 'safetyTeamKPIs',
                'Sustainability': 'sustainability',
                'EnvironmentalAspects': 'environmentalAspects',
                'EnvironmentalMonitoring': 'environmentalMonitoring',
                'CarbonFootprint': 'carbonFootprint',
                'WasteManagement': 'wasteManagement',
                'EnergyEfficiency': 'energyEfficiency',
                'WaterManagement': 'waterManagement',
                'RecyclingPrograms': 'recyclingPrograms',
                'RiskAssessments': 'riskAssessments',
                'HSERiskAssessments': 'hseRiskAssessments',
                'LegalDocuments': 'legalDocuments',
                'SafetyTeamMembers': 'safetyTeamMembers',
                'SafetyOrganizationalStructure': 'safetyOrganizationalStructure',
                'SafetyJobDescriptions': 'safetyJobDescriptions',
                'SafetyTeamAttendance': 'safetyTeamAttendance',
                'SafetyTeamLeaves': 'safetyTeamLeaves',
                'SafetyTeamTasks': 'safetyTeamTasks',
                'SOPJHA': 'sopjha',
                'PeriodicInspectionCategories': 'periodicInspectionCategories',
                'PeriodicInspectionRecords': 'periodicInspectionRecords',
                'PeriodicInspectionSchedules': 'periodicInspectionSchedules',
                'PeriodicInspectionChecklists': 'periodicInspectionChecklists'
            };

            const PRELOAD_CACHE_TTL_MS = 10 * 60 * 1000;
            const PER_SHEET_TIMEOUT_MS = 7000;
            const GLOBAL_PRELOAD_BUDGET_MS = 55000;
            const preloadStartedAt = Date.now();

            const isModuleFreshInCache = (moduleName, sheets) => {
                const syncKey = moduleSyncKeyMap[moduleName];
                if (!syncKey || !Array.isArray(sheets) || sheets.length === 0) return false;
                const lastSyncRaw = localStorage.getItem(syncKey);
                const lastSync = Number(lastSyncRaw || 0);
                if (!lastSync || (Date.now() - lastSync) > PRELOAD_CACHE_TTL_MS) return false;

                // نتجاوز التحميل فقط لو عندنا بيانات محلية حقيقية لجميع الأوراق
                return sheets.every((sheetName) => {
                    const key = sheetToKeyMap[sheetName];
                    const arr = key ? AppState.appData[key] : null;
                    return Array.isArray(arr) && arr.length > 0;
                });
            };

            const processModule = async (moduleName) => {
                try {
                    const sheets = moduleSheetsMap[moduleName] || [];

                    if (sheets.length === 0) {
                        Utils.safeLog(`⚠️ لا توجد أوراق Google Sheets للموديول: ${moduleName}`);
                        return;
                    }
                    if (isModuleFreshInCache(moduleName, sheets)) {
                        if (AppState.debugMode) {
                            Utils.safeLog(`⚡ تخطي تحميل ${moduleName}: البيانات محلية ومحدثة`);
                        }
                        return;
                    }

                    // ✅ تحسين: تحميل جميع أوراق الموديول بشكل متوازي لتسريع العملية
                    const sheetPromises = sheets.map(async (sheetName) => {
                        try {
                            const data = await Backend.readFromSheets(sheetName, PER_SHEET_TIMEOUT_MS);
                            const key = sheetToKeyMap[sheetName];
                            
                            if (key && Array.isArray(data)) {
                                // ✅ تحسين: التحقق من أن البيانات الجديدة صالحة قبل الاستبدال
                                const oldData = AppState.appData[key] || [];
                                
                                // إذا كانت البيانات الجديدة فارغة والبيانات القديمة تحتوي على بيانات، نستخدم القديمة
                                if (data.length === 0 && oldData.length > 0) {
                                    Utils.safeLog(`⚠️ ${sheetName} (${moduleName}): البيانات الجديدة فارغة - الاحتفاظ بالبيانات الحالية (${oldData.length} سجل)`);
                                    return { sheetName, key, success: true, data: oldData, kept: true };
                                }
                                
                                AppState.appData[key] = data;
                                Utils.safeLog(`✅ تم تحميل ${sheetName} (${moduleName}): ${data.length} سجل`);
                                return { sheetName, key, success: true, data, kept: false };
                            } else if (key) {
                                // ✅ تحسين: إذا لم تكن البيانات مصفوفة، نستخدم البيانات القديمة
                                const oldData = AppState.appData[key] || [];
                                if (oldData.length > 0) {
                                    Utils.safeWarn(`⚠️ ${sheetName} (${moduleName}): البيانات المستلمة ليست مصفوفة - الاحتفاظ بالبيانات الحالية (${oldData.length} سجل)`);
                                    return { sheetName, key, success: false, error: 'البيانات ليست مصفوفة', kept: true };
                                } else {
                                    AppState.appData[key] = [];
                                    Utils.safeWarn(`⚠️ ${sheetName} (${moduleName}): البيانات ليست مصفوفة ولا توجد بيانات قديمة`);
                                    return { sheetName, key, success: false, error: 'البيانات ليست مصفوفة', kept: false };
                                }
                            }
                            return { sheetName, key, success: false, error: 'لا يوجد key للورقة' };
                        } catch (error) {
                            const key = sheetToKeyMap[sheetName];
                            const errorMsg = error?.message || String(error);
                            
                            // استخدام البيانات المحلية إذا فشل التحميل
                            if (key && Array.isArray(AppState.appData[key]) && AppState.appData[key].length > 0) {
                                Utils.safeLog(`⚠️ ${sheetName} (${moduleName}): فشل التحميل (${errorMsg}) - استخدام ${AppState.appData[key].length} سجل محلي`);
                                return { sheetName, key, success: false, error: errorMsg, kept: true };
                            } else {
                                Utils.safeWarn(`⚠️ ${sheetName} (${moduleName}): فشل التحميل ولا توجد بيانات محلية`);
                                return { sheetName, key, success: false, error: errorMsg, kept: false };
                            }
                        }
                    });
                    
                    // انتظار اكتمال تحميل جميع الأوراق
                    const sheetResults = await Promise.allSettled(sheetPromises);
                    
                    // ✅ تحسين: تسجيل النتائج والتحقق من الموديولات الفارغة
                    let emptySheets = [];
                    sheetResults.forEach((result, index) => {
                        if (result.status === 'fulfilled') {
                            const res = result.value;
                            if (res && res.key) {
                                const data = AppState.appData[res.key] || [];
                                if (data.length === 0 && !res.kept) {
                                    emptySheets.push(res.sheetName);
                                }
                            }
                        }
                    });
                    
                    // ✅ إصلاح: إزالة المرجع للمتغير غير المعرّف silent - تسجيل التحذير دائماً إذا كانت هناك أوراق فارغة
                    if (emptySheets.length > 0) {
                        Utils.safeWarn(`⚠️ الموديول ${moduleName} يحتوي على ${emptySheets.length} ورقة فارغة: ${emptySheets.join(', ')}`);
                    }

                    // ✅ تعيين وقت آخر مزامنة للموديول في localStorage لمنع إعادة التحميل عند فتح الموديول
                    const syncKey = moduleSyncKeyMap[moduleName];
                    if (syncKey) {
                        try { localStorage.setItem(syncKey, String(Date.now())); } catch (lsErr) {}
                    }
                } catch (error) {
                    Utils.safeWarn(`⚠️ فشل تحميل بيانات الموديول ${moduleName}:`, error);
                }
            };

            // تحميل الموديولات على دفعات متوازية لتقليل زمن التحميل الكلي
            const moduleConcurrency = 8;
            for (let i = 0; i < modulesToLoad.length; i += moduleConcurrency) {
                if ((Date.now() - preloadStartedAt) >= GLOBAL_PRELOAD_BUDGET_MS) {
                    Utils.safeWarn('⏱️ تم الوصول للحد الزمني للتحميل الخلفي (55s) - استكمال التحميل عند فتح الموديول');
                    break;
                }
                const chunk = modulesToLoad.slice(i, i + moduleConcurrency);
                await Promise.allSettled(chunk.map(processModule));
            }

            // حفظ جميع البيانات بعد اكتمال التحميل
            if (typeof DataManager !== 'undefined' && DataManager.save) {
                DataManager.save();
            }

            Utils.safeLog('✅ اكتمل تحميل بيانات جميع الموديولات المسموح بها');
            
            // تحديث الواجهة مباشرة بعد اكتمال تحميل بيانات الموديولات
            // لضمان ظهور البيانات في الموديولات بدون انتظار الضغط اليدوي على زر التحميل.
            try {
                if (typeof window !== 'undefined' &&
                    window.UI &&
                    typeof window.UI.refreshCurrentSection === 'function') {
                    window.UI.refreshCurrentSection(true); // silent = true
                }
            } catch (uiError) {
                Utils.safeWarn('⚠️ فشل تحديث الواجهة بعد تحميل الموديولات:', uiError);
            }
        } catch (error) {
            Utils.safeError('❌ خطأ في تحميل بيانات الموديولات:', error);
        }
    },

    async resetPassword(email, newPassword = null) {
        if (!email || !Utils.isValidEmail(email)) {
            Notification.error('يرجى إدخال بريد إلكتروني صحيح');
            return { success: false, message: 'يرجى إدخال بريد إلكتروني صحيح' };
        }

        email = email.trim().toLowerCase();

        // البحث في قاعدة بيانات المستخدمين
        const user = AppState.appData.users.find(u => {
            if (!u || !u.email) return false;
            return u.email.toLowerCase().trim() === email;
        });

        if (!user) {
            Notification.error('البريد الإلكتروني غير مسجل في النظام');
            return { success: false, message: 'البريد الإلكتروني غير مسجل في النظام' };
        }

        // إنشاء كلمة مرور مؤقتة إذا لم يتم تحديد واحدة
        let tempPassword = newPassword;
        if (!tempPassword) {
            // إنشاء كلمة مرور مؤقتة قوية
            const _tArr = new Uint8Array(6);
            crypto.getRandomValues(_tArr);
            const randomPart = Array.from(_tArr).map(b => b.toString(16).padStart(2,'0')).join('');
            tempPassword = 'Tmp@' + randomPart + '!';
        }

        // تحديث كلمة المرور
        const hashedTemp = await Utils.hashPassword(tempPassword);
        user.password = '***';
        user.passwordHash = hashedTemp;
        user.passwordChanged = false;
        user.forcePasswordChange = true;
        user.updatedAt = new Date().toISOString();

        // حفظ التغييرات محلياً
        // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            await window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }

        // تحديث المستخدم الحالي إذا كان هو نفسه
        if (AppState.currentUser && AppState.currentUser.email && AppState.currentUser.email.toLowerCase().trim() === email) {
            AppState.currentUser.passwordChanged = false;
            AppState.currentUser.forcePasswordChange = true;
            this._sanitizeCurrentUserSecrets();
        }

        // حفظ تلقائياً في Google Sheets
        try {
            if (AppState.backendConfig.server.enabled && AppState.backendConfig.server.scriptUrl) {
                // استخدام resetUserPassword في Backend أولاً
                let result = await Backend.sendToAppsScript('resetUserPassword', {
                    userId: user.id,
                    email: user.email,
                    newPassword: tempPassword
                });

                if (result && result.success) {
                    Utils.safeLog('✅ تم تحديث كلمة المرور في Google Sheets بنجاح');
                    // استخدام كلمة المرور المؤقتة من Backend إذا كانت متاحة
                    if (result.tempPassword) {
                        tempPassword = result.tempPassword;
                    }
                } else {
                    // إذا فشل، نحاول updateUser
                    result = await Backend.sendToAppsScript('updateUser', {
                        userId: user.id,
                        updateData: {
                            passwordHash: hashedTemp,
                            passwordChanged: false,
                            forcePasswordChange: true,
                            updatedAt: user.updatedAt
                        }
                    });

                    if (result && result.success) {
                        Utils.safeLog('✅ تم تحديث كلمة المرور في Google Sheets بنجاح (عبر updateUser)');
                    } else {
                        // إذا فشل، نحاول autoSave
                        await Backend.autoSave('Users', AppState.appData.users);
                    }
                }
            }
        } catch (error) {
            Utils.safeWarn('⚠ فشل تحديث كلمة المرور في Google Sheets:', error);
            // نحاول autoSave كبديل
            try {
                await Backend.autoSave('Users', AppState.appData.users);
            } catch (autoSaveError) {
                Utils.safeWarn('⚠ فشل autoSave أيضاً:', autoSaveError);
            }
        }

        Utils.safeLog(`✅ تم إعادة تعيين كلمة المرور للمستخدم: ${email}`);
        return {
            success: true,
            message: 'تم إعادة تعيين كلمة المرور بنجاح',
            tempPassword: tempPassword // إرجاع كلمة المرور المؤقتة للمدير
        };
    }
};

// تصدير Auth للتوافق مع الكود القديم
if (typeof window !== 'undefined') {
    window.Auth = window.Auth || Auth;
}
