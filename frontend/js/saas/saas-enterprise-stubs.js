/**
 * saas-enterprise-stubs.js — post-month-6 readiness stubs: SSO placeholder + outbound webhooks.
 * Not full enterprise IAM; persists config in CompanySettings / WebhookEndpoints sheet.
 */
(function (global) {
    function getWebhookRows() {
        if (!global.AppState || !AppState.appData) return [];
        if (!Array.isArray(AppState.appData.webhookEndpoints)) AppState.appData.webhookEndpoints = [];
        return AppState.appData.webhookEndpoints;
    }

    async function saveWebhooks(rows) {
        AppState.appData.webhookEndpoints = Array.isArray(rows) ? rows : [];
        if (global.Backend && Backend.autoSave) {
            await Backend.autoSave('WebhookEndpoints', AppState.appData.webhookEndpoints);
        } else if (global.DataManager) DataManager.save();
    }

    /**
     * Fan-out best-effort POST of a JSON event to enabled webhook URLs (browser-side).
     * Enterprise gateways should prefer Edge Functions later.
     */
    async function emitWebhook(eventKey, payload) {
        const rows = getWebhookRows().filter((r) => r && r.enabled !== false && r.url);
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const events = Array.isArray(row.events) ? row.events : [];
            if (events.length && !events.includes(eventKey) && !events.includes('*')) continue;
            try {
                await fetch(String(row.url), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(row.secret ? { 'X-HSEHub-Secret': String(row.secret) } : {})
                    },
                    body: JSON.stringify({
                        event: eventKey,
                        at: new Date().toISOString(),
                        app: 'HSEHub 360',
                        data: payload || {}
                    }),
                    mode: 'cors',
                    keepalive: true
                });
            } catch (_e) { /* best-effort */ }
        }
    }

    function renderEnterprisePanel(container) {
        if (!container) return;
        const hooks = getWebhookRows();
        const sso = (global.AppState && AppState.companySettings && AppState.companySettings.ssoStub) || {};
        container.innerHTML = `
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-4">
            <h4 class="text-lg font-semibold mb-2"><i class="fas fa-building-lock ml-2 text-slate-700"></i>Enterprise — جاهزية قادمة</h4>
            <p class="text-sm text-gray-600 mb-3">SSO/SAML وWebhooks: إعدادات تجهيزية. التفعيل المؤسسي الكامل يتطلب تكوين IdP على المنصة.</p>
            <div class="grid gap-2 text-sm mb-4">
              <label class="flex items-center gap-2"><input type="checkbox" id="sso-enabled" ${sso.enabled ? 'checked' : ''} disabled /> تفعيل SSO (قريباً — معطّل)</label>
              <input id="sso-entity" class="form-input" placeholder="Entity ID / Issuer (اختياري)" value="${String(sso.entityId || '').replace(/"/g, '&quot;')}" />
              <input id="sso-metadata" class="form-input" placeholder="Metadata URL (اختياري)" value="${String(sso.metadataUrl || '').replace(/"/g, '&quot;')}" />
              <button type="button" id="sso-save" class="btn-secondary">حفظ مسودة SSO</button>
            </div>
            <hr class="my-3"/>
            <h5 class="font-semibold mb-2">Webhooks صادرة</h5>
            <div class="flex flex-wrap gap-2 mb-2">
              <input id="wh-url" class="form-input" placeholder="https://hooks.example.com/hse" style="min-width:220px" />
              <input id="wh-secret" class="form-input" placeholder="سر توقيع (اختياري)" style="min-width:140px" />
              <button type="button" id="wh-add" class="btn-primary">إضافة</button>
            </div>
            <ul class="text-sm space-y-1" id="wh-list">
              ${hooks.map((h, i) => `<li class="flex justify-between gap-2 border rounded p-2">
                <span dir="ltr">${String(h.url || '').replace(/</g, '&lt;')}</span>
                <button type="button" class="btn-secondary wh-del" data-i="${i}">حذف</button>
              </li>`).join('') || '<li class="text-gray-500">لا webhooks بعد</li>'}
            </ul>
            <p class="text-xs text-gray-500 mt-2">الأحداث: capa_created، capa_due، ptw_approval، backup_reminder — تُرسل من المتصفح (CORS) ومن Edge <code>notify-dispatch</code> بدون CORS عند جدولة الـ cron.</p>
          </div>`;

        container.querySelector('#sso-save')?.addEventListener('click', async () => {
            if (!AppState.companySettings) AppState.companySettings = {};
            AppState.companySettings.ssoStub = {
                enabled: false,
                entityId: container.querySelector('#sso-entity')?.value || '',
                metadataUrl: container.querySelector('#sso-metadata')?.value || '',
                updatedAt: new Date().toISOString()
            };
            try {
                if (Backend && Backend.sendToAppsScript) {
                    await Backend.sendToAppsScript('saveCompanySettings', Object.assign({ id: 'default' }, AppState.companySettings));
                }
            } catch (_e) { /* ignore */ }
            if (typeof Notification !== 'undefined' && Notification.success) Notification.success('تم حفظ مسودة SSO');
        });

        container.querySelector('#wh-add')?.addEventListener('click', async () => {
            const url = container.querySelector('#wh-url')?.value?.trim();
            if (!url) return;
            const secret = container.querySelector('#wh-secret')?.value?.trim() || '';
            const rows = getWebhookRows();
            rows.push({ id: 'WH-' + Date.now(), url, secret, enabled: true, events: ['*'], createdAt: new Date().toISOString() });
            await saveWebhooks(rows);
            renderEnterprisePanel(container);
        });
        container.querySelectorAll('.wh-del').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const i = Number(btn.getAttribute('data-i'));
                const rows = getWebhookRows();
                rows.splice(i, 1);
                await saveWebhooks(rows);
                renderEnterprisePanel(container);
            });
        });
    }

    global.SaaSEnterpriseStubs = {
        getWebhookRows,
        saveWebhooks,
        emitWebhook,
        renderEnterprisePanel
    };

    // Hook CAPA/notify enqueue to also emit webhooks when available
    function wrapNotifyEnqueue() {
        const notify = global.SaaSNotify;
        if (!notify || typeof notify.enqueue !== 'function' || notify.__webhookWrapped) return;
        const prevEnqueue = notify.enqueue.bind(notify);
        notify.enqueue = async function (eventKey, payload) {
            const res = await prevEnqueue(eventKey, payload);
            try { await emitWebhook(eventKey, payload); } catch (_e) { /* ignore */ }
            return res;
        };
        notify.__webhookWrapped = true;
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(wrapNotifyEnqueue, 500));
    } else {
        setTimeout(wrapNotifyEnqueue, 500);
    }
})(window);
