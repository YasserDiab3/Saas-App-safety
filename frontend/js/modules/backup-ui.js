/* ========================================
   إدارة النسخ الاحتياطي المشفّر + البيانات التجريبية
   ======================================== */

const backupUiLog = (...args) => {
    try {
        if (typeof Utils !== 'undefined' && typeof Utils.safeLog === 'function') {
            Utils.safeLog(...args);
        }
    } catch (_e) { /* ignore */ }
};

const BackupUI = {
    eventsBound: false,
    lastMeta: null,

    async init() {
        try {
            if (!this.isAdmin()) {
                backupUiLog('ℹ️ المستخدم ليس مديراً، لن يتم عرض قسم النسخ الاحتياطية');
                return;
            }
            const backupSection = document.getElementById('backup-management-section');
            if (backupSection) backupSection.style.display = 'block';
            else console.warn('⚠️ قسم النسخ الاحتياطية غير موجود في DOM');

            // Always re-bind: Settings may re-render and replace the buttons.
            this.setupEventListeners();
            this.eventsBound = true;
            await this.refreshStatus();
            backupUiLog('✅ تم تهيئة واجهة النسخ الاحتياطية المشفرة');
        } catch (error) {
            console.error('❌ خطأ في تهيئة واجهة النسخ الاحتياطية:', error);
        }
    },

    isAdmin() {
        try {
            if (typeof Permissions !== 'undefined') {
                if (typeof Permissions.isCurrentUserEffectiveAdmin === 'function') {
                    return Permissions.isCurrentUserEffectiveAdmin();
                }
                if (typeof Permissions.isCurrentUserAdmin === 'function') {
                    return Permissions.isCurrentUserAdmin();
                }
                if (typeof Permissions.isAdmin === 'function') {
                    return Permissions.isAdmin();
                }
            }
            const user = (typeof AppState !== 'undefined' && AppState.currentUser) || null;
            if (!user) return false;
            const role = String(user.role || '').toLowerCase();
            return role === 'admin' || role === 'owner' || role === 'administrator';
        } catch (_e) {
            return false;
        }
    },

    setupEventListeners() {
        const on = (id, fn) => {
            const el = document.getElementById(id);
            if (el && !el.dataset.backupBound) {
                el.dataset.backupBound = '1';
                el.addEventListener('click', fn);
            }
        };
        on('hse-backup-export-btn', () => this.exportEncryptedBackup());
        on('hse-backup-import-btn', () => this.importEncryptedBackup());
        on('hse-demo-inject-btn', () => this.injectDemoData());
        on('hse-demo-wipe-btn', () => this.wipeDemoData());
        on('hse-ops-wipe-btn', () => this.wipeOpsData());
        on('hse-backup-refresh-btn', () => this.refreshStatus());
    },

    setStatus(text, cls) {
        const el = document.getElementById('hse-backup-status');
        if (!el) return;
        el.className = 'pf-msg' + (cls ? ' ' + cls : '');
        el.textContent = text || '';
    },

    async refreshStatus() {
        const box = document.getElementById('hse-backup-meta');
        try {
            if (!window.SaaSAdapter) {
                if (box) box.textContent = 'محوّل SaaS غير جاهز';
                return;
            }
            const list = await Backend.sendToAppsScript('listTenantSheets', {});
            if (!list || list.success === false) {
                if (box) box.textContent = (list && list.message) || 'تعذّر قراءة قائمة الأوراق';
                return;
            }
            const sheets = Array.isArray(list.data) ? list.data : (Array.isArray(list) ? list : []);
            this.lastMeta = { sheets, at: new Date().toISOString() };
            if (box) {
                box.textContent = `أوراق مسجّلة: ${sheets.length} — جاهز للتصدير/الاستيراد المشفر (مدير المؤسسة فقط).`;
            }
        } catch (e) {
            if (box) box.textContent = e.message || String(e);
        }
    },

    promptPassphrase(title, confirmRequired) {
        const p1 = window.prompt(title || 'أدخل عبارة مرور النسخة (≥ 8 أحرف):', '');
        if (p1 == null) return null;
        if (String(p1).length < 8) {
            this.showNotification('عبارة المرور يجب ألا تقل عن 8 أحرف', 'error');
            return null;
        }
        if (confirmRequired) {
            const p2 = window.prompt('أعد إدخال عبارة المرور للتأكيد:', '');
            if (p2 == null) return null;
            if (String(p1) !== String(p2)) {
                this.showNotification('عبارتا المرور غير متطابقتين', 'error');
                return null;
            }
        }
        return String(p1);
    },

    async exportEncryptedBackup() {
        if (!this.isAdmin()) {
            this.showNotification('هذه العملية متاحة لمدير المؤسسة فقط', 'error');
            return;
        }
        if (!window.SaaSBackupCrypto) {
            this.showNotification('وحدة التشفير غير محمّلة', 'error');
            return;
        }
        const passphrase = this.promptPassphrase('أدخل عبارة مرور لتأمين ملف النسخة (≥ 8):', true);
        if (!passphrase) return;

        const btn = document.getElementById('hse-backup-export-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i>جاري التصدير…'; }
        this.setStatus('جاري قراءة بيانات المؤسسة…', '');

        try {
            const result = await Backend.sendToAppsScript('exportTenantBackupBundle', {});
            if (!result || result.success !== true || !result.data) {
                throw new Error((result && result.message) || 'فشل بناء حزمة النسخة');
            }
            const bundle = result.data;
            this.setStatus('جاري التشفير…', '');
            const envelope = await SaaSBackupCrypto.encryptJson(bundle, passphrase);
            const org = bundle.orgCode || bundle.tenantId || 'tenant';
            const fname = `hsehub-backup-${String(org).replace(/[^\w\-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.hsebackup`;
            SaaSBackupCrypto.downloadJsonFile(envelope, fname);
            this.setStatus('تم تنزيل النسخة المشفّرة بنجاح. احتفظ بعبارة المرور.', 'ok');
            this.showNotification('تم تصدير النسخة الاحتياطية المشفّرة', 'success');
        } catch (e) {
            this.setStatus(e.message || String(e), 'err');
            this.showNotification('فشل التصدير: ' + (e.message || e), 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-file-export ml-2"></i>تصدير نسخة مشفّرة';
            }
        }
    },

    async importEncryptedBackup() {
        if (!this.isAdmin()) {
            this.showNotification('هذه العملية متاحة لمدير المؤسسة فقط', 'error');
            return;
        }
        if (!window.SaaSBackupCrypto) {
            this.showNotification('وحدة التشفير غير محمّلة', 'error');
            return;
        }

        const input = document.getElementById('hse-backup-file-input');
        if (!input) return;
        input.value = '';
        input.onchange = async () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const passphrase = this.promptPassphrase('أدخل عبارة مرور ملف النسخة:', false);
            if (!passphrase) return;

            const btn = document.getElementById('hse-backup-import-btn');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i>جاري الاستيراد…'; }
            this.setStatus('جاري فك التشفير…', '');

            try {
                const envelope = await SaaSBackupCrypto.readJsonFile(file);
                const bundle = await SaaSBackupCrypto.decryptToJson(envelope, passphrase);
                if (!bundle.sheets || typeof bundle.sheets !== 'object') {
                    throw new Error('الحزمة لا تحتوي على بيانات أوراق');
                }

                let force = false;
                const me = await Backend.sendToAppsScript('getTenantBackupIdentity', {});
                const currentTenant = (me && me.data && (me.data.tenantId || me.data.tenant_id)) || '';
                if (bundle.tenantId && currentTenant && String(bundle.tenantId) !== String(currentTenant)) {
                    const ok = window.confirm(
                        'تحذير: النسخة تنتمي لمؤسسة أخرى.\n\n' +
                        'استيرادها سيستبدل بيانات التشغيل في المؤسسة الحالية.\n' +
                        'المستخدمون لن يُستبدلوا.\n\nهل تريد المتابعة رغم ذلك؟'
                    );
                    if (!ok) {
                        this.setStatus('تم إلغاء الاستيراد', '');
                        return;
                    }
                    force = true;
                } else {
                    const ok = window.confirm(
                        'سيتم استبدال بيانات الأوراق المستوردة (ما عدا المستخدمين).\n' +
                        'يُفضّل أخذ نسخة مشفّرة أولاً.\n\nهل تريد المتابعة؟'
                    );
                    if (!ok) {
                        this.setStatus('تم إلغاء الاستيراد', '');
                        return;
                    }
                }

                this.setStatus('جاري استعادة الأوراق…', '');
                const result = await Backend.sendToAppsScript('importTenantBackupBundle', {
                    bundle,
                    forceTenantMismatch: force
                });
                if (!result || result.success !== true) {
                    throw new Error((result && result.message) || 'فشل الاستيراد');
                }
                this.setStatus(
                    `تم الاستيراد: ${result.imported || 0} ورقة` +
                    (result.skippedUsers ? ' (تم تخطي Users)' : ''),
                    'ok'
                );
                this.showNotification('تم استيراد النسخة بنجاح — سيتم تحديث الصفحة', 'success');
                setTimeout(() => location.reload(), 1200);
            } catch (e) {
                this.setStatus(e.message || String(e), 'err');
                this.showNotification('فشل الاستيراد: ' + (e.message || e), 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-file-import ml-2"></i>استيراد نسخة مشفّرة';
                }
            }
        };
        input.click();
    },

    async injectDemoData() {
        if (!this.isAdmin()) {
            this.showNotification('هذه العملية متاحة لمدير المؤسسة فقط', 'error');
            return;
        }
        const ok = window.confirm(
            'سيتم إضافة بيانات تجريبية موسومة (source=demo) للمعاينة دون حذف بياناتك الحالية.\n\nهل تريد المتابعة؟'
        );
        if (!ok) return;

        const btn = document.getElementById('hse-demo-inject-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i>جاري التعبئة…'; }
        this.setStatus('جاري حقن البيانات التجريبية…', '');
        try {
            const result = await Backend.sendToAppsScript('injectDemoData', {});
            if (!result || result.success !== true) {
                throw new Error((result && result.message) || 'فشل حقن البيانات التجريبية');
            }
            this.setStatus(`تم إضافة بيانات تجريبية في ${result.sheets || 0} ورقة (${result.rows || 0} سجل).`, 'ok');
            this.showNotification('تم تعبئة البيانات التجريبية', 'success');
            setTimeout(() => location.reload(), 1000);
        } catch (e) {
            this.setStatus(e.message || String(e), 'err');
            this.showNotification('فشل التعبئة: ' + (e.message || e), 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-flask ml-2"></i>تعبئة بيانات تجريبية';
            }
        }
    },

    async wipeDemoData() {
        if (!this.isAdmin()) {
            this.showNotification('هذه العملية متاحة لمدير المؤسسة فقط', 'error');
            return;
        }
        const ok = window.confirm(
            'حذف البيانات التجريبية فقط؟\n\n' +
            'يُحذف ما وُسِم بـ source=demo أثناء «تعبئة بيانات تجريبية».\n' +
            'لا تُطلب كلمة مرور — تأكيد فقط.\n' +
            'البيانات الحقيقية لن تُمس.'
        );
        if (!ok) return;

        const btn = document.getElementById('hse-demo-wipe-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i>جاري الحذف…'; }
        this.setStatus('جاري حذف البيانات التجريبية…', '');
        try {
            const result = await Backend.sendToAppsScript('wipeDemoData', {});
            if (!result || result.success !== true) {
                throw new Error((result && result.message) || 'فشل حذف البيانات التجريبية');
            }
            this.setStatus(`تم حذف ${result.deleted || 0} سجل تجريبي.`, 'ok');
            this.showNotification('تم حذف البيانات التجريبية', 'success');
            setTimeout(() => location.reload(), 1000);
        } catch (e) {
            this.setStatus(e.message || String(e), 'err');
            this.showNotification('فشل الحذف: ' + (e.message || e), 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-trash-alt ml-2"></i>حذف البيانات التجريبية';
            }
        }
    },

    async wipeOpsData() {
        if (!this.isAdmin()) {
            this.showNotification('هذه العملية متاحة لمدير المؤسسة فقط', 'error');
            return;
        }
        const ok1 = window.confirm(
            'تحذير شديد: مسح بيانات التشغيل لجميع المديولات.\n\n' +
            'يُحتفظ بـ: المستخدمين، إعدادات الشركة، إعدادات النماذج، مركز المساعدة.\n' +
            'لا توجد كلمة مرور سرية — الخطوة التالية تطلب كتابة كلمة تأكيد فقط.\n\n' +
            'هل تريد المتابعة؟'
        );
        if (!ok1) return;

        const typed = window.prompt(
            'للتأكيد النهائي اكتب بالضبط هذه الكلمة (بدون مسافات أو علامات):\n\nمسح\n\n' +
            'ليست كلمة مرور النظام — مجرد عبارة تأكيد لمنع المسح بالخطأ.',
            ''
        );
        if (typed == null) {
            this.showNotification('تم إلغاء المسح', 'error');
            return;
        }
        const normalized = String(typed).trim().replace(/\u200f|\u200e/g, '');
        if (normalized !== 'مسح') {
            this.showNotification('تم الإلغاء — يجب كتابة كلمة «مسح» حرفياً (بدون كلمة مرور أخرى)', 'error');
            this.setStatus('عبارة التأكيد غير مطابقة. اكتب: مسح', 'err');
            return;
        }

        const btn = document.getElementById('hse-ops-wipe-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i>جاري المسح…'; }
        this.setStatus('جاري مسح بيانات التشغيل…', '');
        try {
            const result = await Backend.sendToAppsScript('wipeOpsData', {});
            if (!result || result.success !== true) {
                throw new Error((result && result.message) || 'فشل مسح بيانات التشغيل');
            }
            this.setStatus(`تم مسح بيانات التشغيل (${result.deleted || 0} سجل).`, 'ok');
            this.showNotification('تم مسح بيانات التشغيل', 'success');
            try {
                if (typeof AuditLog !== 'undefined' && AuditLog.log) {
                    AuditLog.log('ops_wipe', 'settings', 'ops', { deleted: result.deleted || 0 });
                }
            } catch (_e) { /* ignore */ }
            setTimeout(() => location.reload(), 1200);
        } catch (e) {
            this.setStatus(e.message || String(e), 'err');
            this.showNotification('فشل المسح: ' + (e.message || e), 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-bomb ml-2"></i>مسح بيانات التشغيل';
            }
        }
    },

    showNotification(message, type) {
        try {
            if (typeof Notification !== 'undefined') {
                if (type === 'success' && typeof Notification.success === 'function') {
                    Notification.success(message);
                    return;
                }
                if (type === 'error' && typeof Notification.error === 'function') {
                    Notification.error(message);
                    return;
                }
                if (typeof Notification.show === 'function') {
                    Notification.show(message, type);
                    return;
                }
            }
        } catch (_e) { /* fallthrough */ }
        alert(message);
    }
};

if (typeof window !== 'undefined') {
    window.BackupUI = BackupUI;
}
