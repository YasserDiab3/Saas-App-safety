/**
 * saas-compliance-center.js — SOC2 / ISO27001 readiness UI (not a certificate).
 */
(function (global) {
    const SHEET = 'ComplianceProgram';
    const ROW_ID = 'compliance-default';

    const CONTROLS = [
        { key: 'rls', title: 'عزل المستأجرين (RLS)', hint: 'مضمّن في المنصة', live: true },
        { key: 'mfa', title: 'MFA (TOTP)', hint: 'يُفعَّل لكل مستخدم', live: 'mfa' },
        { key: 'audit', title: 'سجل تدقيق + Evidence', hint: 'تصدير CSV من الإعدادات', live: 'audit' },
        { key: 'backup', title: 'نسخ احتياطي مشفّر', hint: 'تذكير شهري + تصدير يدوي', live: 'backup' },
        { key: 'sso', title: 'SSO / SAML readiness', hint: 'يتطلب تسجيل IdP', live: 'sso' },
        { key: 'notify', title: 'إشعارات تشغيلية', hint: 'outbox + Email/WA', live: 'notify' },
        { key: 'policies', title: 'سياسات مكتوبة (AUP / IR)', hint: 'مسؤولية المؤسسة — خارج التطبيق', live: false },
        { key: 'external_audit', title: 'تدقيق خارجي / شهادة', hint: 'مقيّم مستقل — خارج المنتج', live: false }
    ];

    function defaultRow() {
        return {
            id: ROW_ID,
            notes: '',
            checklist: {
                policiesReviewed: false,
                accessReviewDone: false,
                backupTestDone: false,
                incidentRunbook: false
            },
            updatedAt: new Date().toISOString()
        };
    }

    function getRow() {
        try {
            const rows = (global.AppState && AppState.appData && AppState.appData.complianceProgram) || [];
            const arr = Array.isArray(rows) ? rows : [];
            const row = arr.find((r) => String(r.id) === ROW_ID) || arr[0];
            return Object.assign(defaultRow(), row || {});
        } catch (_e) {
            return defaultRow();
        }
    }

    async function saveRow(partial) {
        if (!global.AppState) throw new Error('AppState missing');
        if (!AppState.appData) AppState.appData = {};
        if (!Array.isArray(AppState.appData.complianceProgram)) AppState.appData.complianceProgram = [];
        const next = Object.assign(getRow(), partial || {}, {
            id: ROW_ID,
            updatedAt: new Date().toISOString()
        });
        const idx = AppState.appData.complianceProgram.findIndex((r) => String(r.id) === ROW_ID);
        if (idx >= 0) AppState.appData.complianceProgram[idx] = next;
        else AppState.appData.complianceProgram.push(next);
        if (global.Backend && Backend.autoSave) {
            await Backend.autoSave(SHEET, AppState.appData.complianceProgram);
        }
        if (global.DataManager) DataManager.save();
        return next;
    }

    function liveStatus(kind) {
        if (kind === true) return { ok: true, label: 'مفعّل على المنصة' };
        if (kind === false) return { ok: false, label: 'خارج المنتج' };
        if (kind === 'mfa') {
            const on = !!(global.SaaSMFA && typeof SaaSMFA.isEnabled === 'function'
                ? false
                : (global.localStorage && localStorage.getItem('hse_mfa_hint')));
            // Best-effort: presence of MFA module + settings link
            const hasModule = !!(global.SaaSMFA || document.querySelector('a[href*="mfa"]'));
            return { ok: hasModule, label: hasModule ? 'متاح (تفعيل لكل مستخدم)' : 'غير محمّل' };
        }
        if (kind === 'audit') {
            const ok = !!(global.AuditLog && AuditLog.exportEvidencePack);
            return { ok, label: ok ? 'تصدير Evidence جاهز' : 'غير متاح' };
        }
        if (kind === 'backup') {
            const ok = !!(global.BackupUI || global.SaaSBackupCrypto);
            return { ok, label: ok ? 'نسخ مشفّر متاح' : 'غير متاح' };
        }
        if (kind === 'sso') {
            const sso = global.SaaSEnterpriseStubs && SaaSEnterpriseStubs.getSsoConfig
                ? SaaSEnterpriseStubs.getSsoConfig()
                : null;
            const ok = !!(sso && (sso.enabled || sso.providerId));
            return { ok, label: ok ? 'إعدادات SSO محفوظة' : 'لم يُضبط بعد' };
        }
        if (kind === 'notify') {
            const ok = !!(global.SaaSNotify && SaaSNotify.enqueue);
            return { ok, label: ok ? 'محرك إشعارات جاهز' : 'غير متاح' };
        }
        return { ok: false, label: '—' };
    }

    function render(container) {
        if (!container) return;
        const row = getRow();
        const cl = row.checklist || {};
        container.innerHTML = `
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-4 border border-slate-200">
            <h4 class="text-lg font-semibold mb-1"><i class="fas fa-shield-halved ml-2 text-slate-700"></i>Security &amp; Compliance readiness</h4>
            <p class="text-sm text-gray-600 mb-3">
              مركز جاهزية لـ SOC 2 / ISO 27001 — <strong>ليس شهادة رسمية</strong>.
              يربط الضوابط التقنية الموجودة ويوثّق ما يلزم للتدقيق الخارجي.
              الدليل: <code>docs/COMPLIANCE_SOC2_ISO27001.md</code>
            </p>
            <div class="grid gap-2 mb-4">
              ${CONTROLS.map((c) => {
                  const st = liveStatus(c.live);
                  const color = st.ok ? 'text-emerald-700' : 'text-amber-700';
                  return `<div class="flex justify-between gap-2 border rounded p-2 text-sm">
                    <div>
                      <div class="font-semibold">${c.title}</div>
                      <div class="text-xs text-gray-500">${c.hint}</div>
                    </div>
                    <span class="${color} whitespace-nowrap text-xs font-semibold">${st.label}</span>
                  </div>`;
              }).join('')}
            </div>
            <h5 class="font-semibold mb-2">قائمة جاهزية المؤسسة</h5>
            <div class="grid gap-2 text-sm mb-3">
              <label class="flex items-center gap-2"><input type="checkbox" id="cmp-policies" ${cl.policiesReviewed ? 'checked' : ''}/> مراجعة السياسات المكتوبة</label>
              <label class="flex items-center gap-2"><input type="checkbox" id="cmp-access" ${cl.accessReviewDone ? 'checked' : ''}/> مراجعة صلاحيات الوصول الدورية</label>
              <label class="flex items-center gap-2"><input type="checkbox" id="cmp-backup" ${cl.backupTestDone ? 'checked' : ''}/> اختبار استعادة نسخة احتياطية</label>
              <label class="flex items-center gap-2"><input type="checkbox" id="cmp-ir" ${cl.incidentRunbook ? 'checked' : ''}/> وجود runbook لحوادث الأمن</label>
            </div>
            <label class="block text-sm font-semibold mb-1">ملاحظات للمدقق</label>
            <textarea id="cmp-notes" class="form-input mb-2" rows="2" placeholder="روابط سياسات، تاريخ آخر مراجعة…">${String(row.notes || '').replace(/</g, '&lt;')}</textarea>
            <div class="flex flex-wrap gap-2">
              <button type="button" id="cmp-save" class="btn-primary"><i class="fas fa-save ml-2"></i>حفظ الجاهزية</button>
              <button type="button" id="cmp-evidence" class="btn-secondary"><i class="fas fa-download ml-2"></i>تصدير Evidence (90 يوماً)</button>
            </div>
          </div>`;

        container.querySelector('#cmp-save')?.addEventListener('click', async () => {
            try {
                await saveRow({
                    notes: container.querySelector('#cmp-notes')?.value || '',
                    checklist: {
                        policiesReviewed: !!container.querySelector('#cmp-policies')?.checked,
                        accessReviewDone: !!container.querySelector('#cmp-access')?.checked,
                        backupTestDone: !!container.querySelector('#cmp-backup')?.checked,
                        incidentRunbook: !!container.querySelector('#cmp-ir')?.checked
                    }
                });
                if (global.Notification && Notification.success) Notification.success('تم حفظ جاهزية الامتثال');
            } catch (e) {
                if (global.Notification && Notification.error) Notification.error(e.message || String(e));
            }
        });

        container.querySelector('#cmp-evidence')?.addEventListener('click', () => {
            const to = new Date();
            const from = new Date(to.getTime() - 90 * 24 * 3600 * 1000);
            if (global.AuditLog && AuditLog.exportEvidencePack) {
                const n = AuditLog.exportEvidencePack(from.toISOString(), to.toISOString());
                if (global.Notification && Notification.success) Notification.success(`تم تصدير ${n} حدث`);
            } else if (global.Notification && Notification.error) {
                Notification.error('AuditLog غير متاح');
            }
        });
    }

    global.SaaSComplianceCenter = { getRow, saveRow, render, CONTROLS };
})(window);
