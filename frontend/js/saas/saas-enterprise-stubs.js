/**
 * saas-enterprise-stubs.js — Enterprise IAM + webhooks.
 * SSO: tenant config + SP-initiated login via Supabase signInWithSSO.
 * SCIM: pilot token + documented Edge endpoint (full SCIM = separate IdP project).
 */
(function (global) {
    const SSO_SHEET = 'SsoConfig';
    const SSO_ID = 'sso-default';

    function escapeAttr(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

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

    function defaultSsoConfig() {
        return {
            id: SSO_ID,
            enabled: false,
            domains: '',
            providerId: '',
            metadataUrl: '',
            entityId: '',
            enforceSso: false,
            scimEnabled: false,
            scimTokenHint: '',
            updatedAt: new Date().toISOString()
        };
    }

    function getSsoConfig() {
        try {
            const rows = (global.AppState && AppState.appData && AppState.appData.ssoConfig) || [];
            const arr = Array.isArray(rows) ? rows : [];
            const row = arr.find((r) => String(r.id) === SSO_ID) || arr[0];
            const fromCompany = (global.AppState && AppState.companySettings && AppState.companySettings.ssoStub) || {};
            return Object.assign(defaultSsoConfig(), fromCompany, row || {});
        } catch (_e) {
            return defaultSsoConfig();
        }
    }

    async function saveSsoConfig(partial) {
        if (!global.AppState) throw new Error('AppState missing');
        if (!AppState.appData) AppState.appData = {};
        if (!Array.isArray(AppState.appData.ssoConfig)) AppState.appData.ssoConfig = [];
        const next = Object.assign(getSsoConfig(), partial || {}, {
            id: SSO_ID,
            updatedAt: new Date().toISOString()
        });
        const idx = AppState.appData.ssoConfig.findIndex((r) => String(r.id) === SSO_ID);
        if (idx >= 0) AppState.appData.ssoConfig[idx] = next;
        else AppState.appData.ssoConfig.push(next);
        if (!AppState.companySettings) AppState.companySettings = {};
        AppState.companySettings.ssoStub = next;
        if (global.Backend && Backend.autoSave) {
            await Backend.autoSave(SSO_SHEET, AppState.appData.ssoConfig);
        }
        try {
            if (Backend && Backend.sendToAppsScript) {
                await Backend.sendToAppsScript('saveCompanySettings', Object.assign({ id: 'default' }, AppState.companySettings));
            }
        } catch (_e) { /* ignore */ }
        if (global.DataManager) DataManager.save();
        return next;
    }

    function domainFromEmail(email) {
        const m = String(email || '').trim().toLowerCase().match(/@([^@\s]+)$/);
        return m ? m[1] : '';
    }

    function scimBaseUrl() {
        try {
            const base = (global.SAAS_CONFIG && SAAS_CONFIG.supabaseUrl) || '';
            return String(base).replace(/\/$/, '') + '/functions/v1/scim-v2';
        } catch (_e) {
            return 'https://tbkajjarkqhsdiabufjv.supabase.co/functions/v1/scim-v2';
        }
    }

    function acsUrl() {
        try {
            const base = (global.SAAS_CONFIG && SAAS_CONFIG.supabaseUrl) || '';
            return String(base).replace(/\/$/, '') + '/auth/v1/sso/saml/acs';
        } catch (_e) {
            return 'https://tbkajjarkqhsdiabufjv.supabase.co/auth/v1/sso/saml/acs';
        }
    }

    function renderEnterprisePanel(container) {
        if (!container) return;
        const hooks = getWebhookRows();
        const sso = getSsoConfig();
        const domains = String(sso.domains || '').trim();
        container.innerHTML = `
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-4 border border-slate-200">
            <h4 class="text-lg font-semibold mb-1"><i class="fas fa-building-lock ml-2 text-teal-700"></i>Enterprise SSO (SAML)</h4>
            <p class="text-sm text-gray-600 mb-3">
              تسجيل الدخول عبر هوية مؤسستك (Azure AD / Okta / Google Workspace).
              يجب تسجيل الـ IdP على مشروع Supabase (<code dir="ltr">supabase sso add</code>) ثم حفظ النطاق هنا.
            </p>
            <div class="grid gap-2 text-sm mb-3">
              <label class="flex items-center gap-2">
                <input type="checkbox" id="sso-enabled" ${sso.enabled ? 'checked' : ''} />
                إظهار زر «دخول عبر SSO» في صفحة تسجيل الدخول
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" id="sso-enforce" ${sso.enforceSso ? 'checked' : ''} />
                تفضيل SSO للمستخدمين على النطاقات أدناه (كلمة المرور تبقى للطوارئ)
              </label>
              <label class="block font-semibold">نطاقات البريد (مفصولة بفاصلة)</label>
              <input id="sso-domains" class="form-input" dir="ltr" placeholder="company.com, corp.example" value="${escapeAttr(domains)}" />
              <label class="block font-semibold">Provider ID (من Supabase بعد تسجيل IdP)</label>
              <input id="sso-provider" class="form-input" dir="ltr" placeholder="uuid من supabase sso list" value="${escapeAttr(sso.providerId || '')}" />
              <label class="block font-semibold">Metadata URL (مرجع للإدارة)</label>
              <input id="sso-metadata" class="form-input" dir="ltr" placeholder="https://login.microsoftonline.com/.../federationmetadata/..." value="${escapeAttr(sso.metadataUrl || '')}" />
              <label class="block font-semibold">Entity ID / Issuer (اختياري)</label>
              <input id="sso-entity" class="form-input" dir="ltr" value="${escapeAttr(sso.entityId || '')}" />
              <p class="text-xs text-gray-500" dir="ltr">ACS URL (للـ IdP): ${escapeAttr(acsUrl())}</p>
              <button type="button" id="sso-save" class="btn-primary mt-1"><i class="fas fa-save ml-2"></i>حفظ إعدادات SSO</button>
            </div>
            <hr class="my-4"/>
            <h5 class="font-semibold mb-2"><i class="fas fa-users-cog ml-2 text-slate-600"></i>SCIM 2.0 (تجريبي)</h5>
            <p class="text-sm text-gray-600 mb-2">مزامنة مستخدمين من IdP. نقطة النهاية التجريبية على Edge — ليست بديلاً كاملاً عن SCIM المؤسسي بعد.</p>
            <label class="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" id="scim-enabled" ${sso.scimEnabled ? 'checked' : ''} />
              تفعيل مسار SCIM التجريبي لهذا المستأجر
            </label>
            <p class="text-xs text-gray-500 mb-2" dir="ltr">Base URL: ${escapeAttr(scimBaseUrl())}</p>
            <p class="text-xs text-gray-500 mb-2">Bearer token: يُضبط كسر Edge <code>SCIM_BEARER_TOKEN</code> على المنصة (لا يُعرض هنا).</p>
            <p class="text-xs text-amber-700 mb-3">الدليل الكامل: docs/SSO_SAML_SCIM.md</p>
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
          </div>`;

        container.querySelector('#sso-save')?.addEventListener('click', async () => {
            try {
                await saveSsoConfig({
                    enabled: !!container.querySelector('#sso-enabled')?.checked,
                    enforceSso: !!container.querySelector('#sso-enforce')?.checked,
                    domains: container.querySelector('#sso-domains')?.value || '',
                    providerId: container.querySelector('#sso-provider')?.value || '',
                    metadataUrl: container.querySelector('#sso-metadata')?.value || '',
                    entityId: container.querySelector('#sso-entity')?.value || '',
                    scimEnabled: !!container.querySelector('#scim-enabled')?.checked
                });
                if (typeof Notification !== 'undefined' && Notification.success) {
                    Notification.success('تم حفظ إعدادات SSO/SCIM');
                }
            } catch (e) {
                if (typeof Notification !== 'undefined' && Notification.error) Notification.error(e.message || String(e));
            }
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
        getSsoConfig,
        saveSsoConfig,
        domainFromEmail,
        acsUrl,
        scimBaseUrl,
        renderEnterprisePanel
    };

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
