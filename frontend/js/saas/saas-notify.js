/**
 * saas-notify.js — tenant notification prefs + outbox enqueue (in-app + email/WhatsApp via edge).
 */
(function (global) {
    const PREFS_ID = 'notify-prefs';

    function defaultPrefs() {
        return {
            id: PREFS_ID,
            emailEnabled: true,
            whatsappEnabled: false,
            inAppEnabled: true,
            events: {
                capa_created: true,
                capa_due: true,
                ptw_approval: true,
                training_reminder: true,
                backup_reminder: true
            },
            whatsappNumber: '',
            updatedAt: new Date().toISOString()
        };
    }

    function getPrefs() {
        try {
            const rows = (global.AppState && AppState.appData && AppState.appData.notificationPrefs) || [];
            const arr = Array.isArray(rows) ? rows : [];
            const row = arr.find((r) => String(r.id) === PREFS_ID) || arr[0];
            return Object.assign(defaultPrefs(), row || {});
        } catch (_e) {
            return defaultPrefs();
        }
    }

    async function savePrefs(partial) {
        if (!global.AppState) throw new Error('AppState missing');
        if (!AppState.appData) AppState.appData = {};
        if (!Array.isArray(AppState.appData.notificationPrefs)) AppState.appData.notificationPrefs = [];
        const next = Object.assign(getPrefs(), partial || {}, { id: PREFS_ID, updatedAt: new Date().toISOString() });
        const idx = AppState.appData.notificationPrefs.findIndex((r) => String(r.id) === PREFS_ID);
        if (idx >= 0) AppState.appData.notificationPrefs[idx] = next;
        else AppState.appData.notificationPrefs.push(next);
        if (global.Backend && Backend.autoSave) {
            await Backend.autoSave('NotificationPrefs', AppState.appData.notificationPrefs);
        } else if (global.DataManager) DataManager.save();
        return next;
    }

    async function pushInApp(userId, title, body, meta) {
        if (!global.SaaSAdapter || !window.supabaseClient) return;
        try {
            if (global.Backend && Backend.sendToAppsScript) {
                await Backend.sendToAppsScript('enqueueInAppNotification', {
                    userId,
                    title,
                    body
                });
            }
        } catch (_e) { /* best-effort */ }
    }

    /**
     * Enqueue a notification event. Persists to outbox via RPC when available,
     * always mirrors to in-app toast path for the current user.
     */
    async function enqueue(eventKey, payload) {
        const prefs = getPrefs();
        const events = prefs.events || {};
        if (events[eventKey] === false) return { skipped: true };

        const title = (payload && payload.title) || eventKey;
        const body = (payload && payload.body) || '';
        const recordId = (payload && payload.recordId) || '';

        if (prefs.inAppEnabled !== false) {
            try {
                if (typeof Notification !== 'undefined') {
                    if (Notification.info) Notification.info(title + (body ? ': ' + body : ''));
                    else if (Notification.success) Notification.success(title);
                }
            } catch (_e) { /* ignore */ }

            const uid = global.AppState && AppState.currentUser && (AppState.currentUser.authUserId || AppState.currentUser.id);
            if (uid) await pushInApp(uid, title, body, { eventKey, recordId });
        }

        const channels = [];
        if (prefs.emailEnabled) channels.push('email');
        if (prefs.whatsappEnabled) channels.push('whatsapp');

        if (channels.length && global.Backend && Backend.sendToAppsScript) {
            try {
                await Backend.sendToAppsScript('enqueueNotification', {
                    eventKey,
                    title,
                    body,
                    recordId,
                    siteId: (payload && payload.siteId) || '',
                    channels,
                    whatsappNumber: prefs.whatsappNumber || '',
                    meta: Object.assign({}, payload || {}, {
                        toEmail:
                            (payload && (payload.toEmail || payload.notifyEmail)) ||
                            (global.AppState &&
                                AppState.currentUser &&
                                (AppState.currentUser.email || AppState.currentUser.userEmail)) ||
                            ''
                    })
                });
            } catch (_e) { /* offline / RPC missing */ }
        }

        try {
            if (global.SaaSEnterpriseStubs && typeof SaaSEnterpriseStubs.emitWebhook === 'function') {
                await SaaSEnterpriseStubs.emitWebhook(eventKey, {
                    title,
                    body,
                    recordId,
                    siteId: (payload && payload.siteId) || '',
                    channels,
                    meta: payload || {}
                });
            }
        } catch (_e) { /* best-effort */ }

        return { ok: true, channels };
    }

    function renderPrefsPanel(container) {
        if (!container) return;
        const p = getPrefs();
        const ev = p.events || {};
        container.innerHTML = `
          <div id="hse-notify-prefs-panel" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-4">
            <h4 class="text-lg font-semibold mb-2"><i class="fas fa-bell ml-2 text-amber-600"></i>تفضيلات الإشعارات</h4>
            <p class="text-sm text-gray-600 mb-4">القناة الأساسية داخل التطبيق. البريد وWhatsApp اختياريان عبر منصة الإرسال.</p>
            <div class="grid gap-2 text-sm">
              <label><input type="checkbox" id="np-inapp" ${p.inAppEnabled !== false ? 'checked' : ''}/> داخل التطبيق</label>
              <label><input type="checkbox" id="np-email" ${p.emailEnabled ? 'checked' : ''}/> البريد الإلكتروني</label>
              <label><input type="checkbox" id="np-wa" ${p.whatsappEnabled ? 'checked' : ''}/> WhatsApp (اختياري)</label>
              <input id="np-wa-num" class="form-input" placeholder="رقم واتساب للتنبيهات (مع رمز الدولة)" value="${String(p.whatsappNumber || '').replace(/"/g, '&quot;')}" />
              <hr/>
              <label><input type="checkbox" id="np-capa" ${ev.capa_due !== false ? 'checked' : ''}/> استحقاق CAPA</label>
              <label><input type="checkbox" id="np-ptw" ${ev.ptw_approval !== false ? 'checked' : ''}/> موافقات PTW</label>
              <label><input type="checkbox" id="np-train" ${ev.training_reminder !== false ? 'checked' : ''}/> تذكير تدريب</label>
              <label><input type="checkbox" id="np-backup" ${ev.backup_reminder !== false ? 'checked' : ''}/> تذكير النسخة المشفّرة الشهرية</label>
            </div>
            <button type="button" id="np-save" class="btn-primary mt-3"><i class="fas fa-save ml-2"></i>حفظ التفضيلات</button>
            <p class="text-xs text-gray-500 mt-2">SSO / IdP: جاهز في الإعدادات → Enterprise. سجّل IdP عبر <code dir="ltr">node supabase/scripts/sso-activate.mjs --register</code> ثم احفظ النطاق وProvider ID.</p>
          </div>`;
        const save = container.querySelector('#np-save');
        if (save) {
            save.addEventListener('click', async () => {
                await savePrefs({
                    inAppEnabled: !!container.querySelector('#np-inapp')?.checked,
                    emailEnabled: !!container.querySelector('#np-email')?.checked,
                    whatsappEnabled: !!container.querySelector('#np-wa')?.checked,
                    whatsappNumber: container.querySelector('#np-wa-num')?.value || '',
                    events: {
                        capa_created: true,
                        capa_due: !!container.querySelector('#np-capa')?.checked,
                        ptw_approval: !!container.querySelector('#np-ptw')?.checked,
                        training_reminder: !!container.querySelector('#np-train')?.checked,
                        backup_reminder: !!container.querySelector('#np-backup')?.checked
                    }
                });
                if (typeof Notification !== 'undefined' && Notification.success) Notification.success('تم حفظ تفضيلات الإشعارات');
            });
        }
    }

    /** Monthly encrypted backup reminder (local check). */
    function maybeBackupReminder() {
        try {
            const prefs = getPrefs();
            if (!prefs.events || prefs.events.backup_reminder === false) return;
            const key = 'hse_last_backup_reminder';
            const last = localStorage.getItem(key) || '';
            const month = new Date().toISOString().slice(0, 7);
            if (last === month) return;
            localStorage.setItem(key, month);
            enqueue('backup_reminder', {
                title: 'تذكير النسخة الاحتياطية',
                body: 'صدّر نسخة مشفّرة شهرية من الإعدادات → النسخ الاحتياطي. للاستيراد: نفس عبارة المرور التي استخدمتها عند التصدير.'
            });
        } catch (_e) { /* ignore */ }
    }

    /**
     * Daily scan: CAPA overdue + training expired → outbox/in-app (deduped per day).
     */
    async function scanOperationalDue() {
        try {
            const day = new Date().toISOString().slice(0, 10);
            const key = 'hse_notify_due_scan_' + day;
            if (localStorage.getItem(key) === '1') return;
            localStorage.setItem(key, '1');

            const prefs = getPrefs();
            const events = prefs.events || {};

            if (events.capa_due !== false && global.SaaSCAPA && typeof SaaSCAPA.list === 'function') {
                const overdue = SaaSCAPA.list({ overdueOnly: true }).slice(0, 20);
                for (let i = 0; i < overdue.length; i++) {
                    const row = overdue[i];
                    await enqueue('capa_due', {
                        title: 'CAPA متأخر',
                        body: (row.observationIssueHazard || row.id || '').toString().slice(0, 180),
                        recordId: row.id,
                        siteId: row.siteId || ''
                    });
                }
            }

            if (events.training_reminder !== false && global.AppState && AppState.appData) {
                const today = day;
                const training = (AppState.appData.training || []).filter((t) => {
                    const exp = String(t.expiryDate || t.expiry || '').slice(0, 10);
                    return exp && exp <= today;
                }).slice(0, 15);
                for (let i = 0; i < training.length; i++) {
                    const t = training[i];
                    await enqueue('training_reminder', {
                        title: 'تدريب منتهٍ / مستحق',
                        body: (t.programName || t.name || t.id || '').toString().slice(0, 180),
                        recordId: t.id || '',
                        siteId: t.siteId || ''
                    });
                }
            }
        } catch (_e) { /* best-effort */ }
    }

    global.SaaSNotify = {
        getPrefs,
        savePrefs,
        enqueue,
        renderPrefsPanel,
        maybeBackupReminder,
        scanOperationalDue,
        defaultPrefs
    };
})(window);
