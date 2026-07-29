/**
 * saas-org-sites.js — Company → Site → Department helpers + site-scope filters.
 */
(function (global) {
    const SHEET = 'OrgSites';
    const DEPT_SHEET = 'OrgDepartments';

    function ensureArrays() {
        if (!global.AppState) return;
        if (!AppState.appData) AppState.appData = {};
        if (!Array.isArray(AppState.appData.orgSites)) AppState.appData.orgSites = [];
        if (!Array.isArray(AppState.appData.orgDepartments)) AppState.appData.orgDepartments = [];
    }

    function listSites() {
        ensureArrays();
        return (AppState.appData.orgSites || []).filter(Boolean).slice().sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), 'ar')
        );
    }

    function listDepartments(siteId) {
        ensureArrays();
        return (AppState.appData.orgDepartments || [])
            .filter((d) => d && (!siteId || d.siteId === siteId))
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
    }

    function getSite(id) {
        if (!id) return null;
        return listSites().find((s) => String(s.id) === String(id)) || null;
    }

    function isAdmin() {
        try {
            return typeof Permissions !== 'undefined' && Permissions.isCurrentUserEffectiveAdmin
                ? Permissions.isCurrentUserEffectiveAdmin()
                : false;
        } catch (_e) {
            return false;
        }
    }

    /** Site IDs the current user may see. Empty array + admin = all; empty + non-admin = unrestricted legacy. */
    function allowedSiteIds(user) {
        const u = user || (global.AppState && AppState.currentUser) || null;
        if (!u) return null;
        if (isAdmin() || String(u.role || '').toLowerCase() === 'owner') return null; // all
        const raw = u.allowedSites || u.siteIds || u.sites || [];
        if (!Array.isArray(raw) || raw.length === 0) return null; // legacy: no restriction
        return raw.map(String);
    }

    function recordSiteId(rec) {
        if (!rec || typeof rec !== 'object') return '';
        return String(rec.siteId || rec.site_id || rec.locationSiteId || '').trim();
    }

    function filterBySite(records, siteIdOverride) {
        const list = Array.isArray(records) ? records : [];
        const forced = siteIdOverride != null && siteIdOverride !== '' ? String(siteIdOverride) : '';
        if (forced) {
            return list.filter((r) => {
                const sid = recordSiteId(r);
                return !sid || sid === forced;
            });
        }
        const allowed = allowedSiteIds();
        if (!allowed) return list;
        return list.filter((r) => {
            const sid = recordSiteId(r);
            if (!sid) return true; // records without site remain visible
            return allowed.includes(sid);
        });
    }

    function canAccessRecord(rec) {
        const allowed = allowedSiteIds();
        if (!allowed) return true;
        const sid = recordSiteId(rec);
        if (!sid) return true;
        return allowed.includes(sid);
    }

    async function upsertSite(data) {
        ensureArrays();
        const id = data.id || ('SITE-' + Date.now().toString(36).toUpperCase());
        const row = {
            id,
            name: String(data.name || '').trim(),
            code: String(data.code || '').trim(),
            city: String(data.city || '').trim(),
            active: data.active !== false,
            updatedAt: new Date().toISOString()
        };
        if (!row.name) throw new Error('اسم الموقع مطلوب');
        const idx = AppState.appData.orgSites.findIndex((s) => String(s.id) === String(id));
        if (idx >= 0) AppState.appData.orgSites[idx] = Object.assign({}, AppState.appData.orgSites[idx], row);
        else AppState.appData.orgSites.push(Object.assign({ createdAt: new Date().toISOString() }, row));

        if (global.Backend && Backend.autoSave) {
            await Backend.autoSave(SHEET, AppState.appData.orgSites);
        } else if (global.DataManager && DataManager.save) {
            DataManager.save();
        }
        return row;
    }

    async function deleteSite(id) {
        ensureArrays();
        AppState.appData.orgSites = AppState.appData.orgSites.filter((s) => String(s.id) !== String(id));
        if (global.Backend && Backend.autoSave) await Backend.autoSave(SHEET, AppState.appData.orgSites);
        else if (global.DataManager) DataManager.save();
    }

    function optionsHtml(selectedId) {
        const opts = ['<option value=\"\">— كل المواقع / بدون —</option>'];
        listSites().forEach((s) => {
            if (s.active === false) return;
            const sel = String(selectedId || '') === String(s.id) ? ' selected' : '';
            const label = s.code ? `${s.name} (${s.code})` : s.name;
            opts.push(`<option value="${escapeAttr(s.id)}"${sel}>${escapeHtml(label)}</option>`);
        });
        return opts.join('');
    }

    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function escapeAttr(s) {
        return escapeHtml(s).replace(/'/g, '&#39;');
    }

    function renderSettingsPanel(container) {
        if (!container) return;
        const sites = listSites();
        container.innerHTML = `
          <div id="hse-org-sites-panel" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-4">
            <h4 class="text-lg font-semibold mb-2 flex items-center">
              <i class="fas fa-sitemap ml-2 text-teal-700"></i>
              المواقع التنظيمية
            </h4>
            <p class="text-sm text-gray-600 mb-4">نموذج Company → Site لفصل البيانات والتقارير والصلاحيات حسب الموقع.</p>
            <div class="flex flex-wrap gap-2 mb-3">
              <input id="hse-site-name" class="form-input" placeholder="اسم الموقع" style="min-width:180px" />
              <input id="hse-site-code" class="form-input" placeholder="رمز (اختياري)" style="min-width:100px" />
              <input id="hse-site-city" class="form-input" placeholder="المدينة" style="min-width:120px" />
              <button type="button" id="hse-site-add-btn" class="btn-primary"><i class="fas fa-plus ml-2"></i>إضافة موقع</button>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead><tr><th class="text-right p-2">الاسم</th><th class="text-right p-2">الرمز</th><th class="text-right p-2">المدينة</th><th class="text-right p-2"></th></tr></thead>
                <tbody>
                  ${sites.length ? sites.map((s) => `
                    <tr>
                      <td class="p-2">${escapeHtml(s.name)}</td>
                      <td class="p-2">${escapeHtml(s.code || '—')}</td>
                      <td class="p-2">${escapeHtml(s.city || '—')}</td>
                      <td class="p-2"><button type="button" class="btn-secondary hse-site-del" data-id="${escapeAttr(s.id)}">حذف</button></td>
                    </tr>`).join('') : `<tr><td colspan="4" class="p-4"><div class="hse-empty-state"><p class="hse-empty-state__title">لا مواقع بعد</p><p class="hse-empty-state__hint">أضف موقع العمل الأول للبدء</p></div></td></tr>`}
                </tbody>
              </table>
            </div>
          </div>`;
        const addBtn = container.querySelector('#hse-site-add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', async () => {
                try {
                    await upsertSite({
                        name: container.querySelector('#hse-site-name')?.value,
                        code: container.querySelector('#hse-site-code')?.value,
                        city: container.querySelector('#hse-site-city')?.value
                    });
                    if (typeof Notification !== 'undefined' && Notification.success) Notification.success('تم حفظ الموقع');
                    renderSettingsPanel(container);
                } catch (e) {
                    if (typeof Notification !== 'undefined' && Notification.error) Notification.error(e.message || String(e));
                    else alert(e.message || e);
                }
            });
        }
        container.querySelectorAll('.hse-site-del').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!confirm('حذف هذا الموقع؟')) return;
                await deleteSite(btn.getAttribute('data-id'));
                renderSettingsPanel(container);
            });
        });
    }

    global.SaaSOrgSites = {
        SHEET,
        DEPT_SHEET,
        listSites,
        listDepartments,
        getSite,
        allowedSiteIds,
        filterBySite,
        canAccessRecord,
        recordSiteId,
        upsertSite,
        deleteSite,
        optionsHtml,
        renderSettingsPanel
    };
})(window);
