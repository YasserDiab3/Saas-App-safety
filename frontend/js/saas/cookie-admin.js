/**
 * cookie-admin.js — platform console: cookie consent analytics & policy editor.
 */
(function (global) {
    const CookieAdmin = {
        days: 30,
        listOffset: 0,
        listSearch: '',
        listAction: '',
        policy: null,

        esc(s) {
            if (global.SaaSEscape && typeof global.SaaSEscape.html === 'function') {
                return global.SaaSEscape.html(s);
            }
            return String(s ?? '').replace(/[&<>"']/g, (c) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        },

        t(k, fb) {
            if (global.SaaSI18n && typeof SaaSI18n.t === 'function') {
                const v = SaaSI18n.t(k);
                if (v && v !== k) return v;
            }
            return fb || k;
        },

        msg(text, cls) {
            const el = document.getElementById('cookie-admin-status');
            if (!el) return;
            el.textContent = text || '';
            el.className = 'pf-msg' + (cls ? ' ' + cls : '');
        },

        async rpc(fn, args) {
            await global.SaaS.ready;
            const client = global.SaaS.client();
            if (!client) throw new Error('Supabase client not ready');
            return client.rpc(fn, args || {});
        },

        actionLabel(a) {
            const map = {
                accept_all: this.t('pf_ck_action_accept', 'قبول الكل'),
                reject_non_essential: this.t('pf_ck_action_reject', 'رفض غير الأساسية'),
                customize: this.t('pf_ck_action_custom', 'تخصيص'),
                update: this.t('pf_ck_action_update', 'تحديث')
            };
            return map[a] || a || '—';
        },

        catsSummary(cats) {
            if (!cats || typeof cats !== 'object') return '—';
            const keys = ['functional', 'analytics', 'marketing'];
            return keys.map((k) => `${k[0].toUpperCase()}:${cats[k] ? '✓' : '×'}`).join(' ');
        },

        renderTrend(daily) {
            const el = document.getElementById('cookie-trend-chart');
            if (!el) return;
            const rows = Array.isArray(daily) ? daily : [];
            if (!rows.length) {
                el.innerHTML = `<p class="muted-s">${this.esc(this.t('pf_no_rows', 'لا توجد بيانات'))}</p>`;
                return;
            }
            const max = Math.max(...rows.map((r) => r.total || 0), 1);
            el.innerHTML = `<div class="pf-ck-trend">${rows.map((r) => {
                const h = Math.round(((r.total || 0) / max) * 100);
                const day = String(r.day || '').slice(5);
                return `<div class="pf-ck-trend-bar" title="${this.esc(r.day)}: ${r.total}">
                    <div class="pf-ck-trend-fill" style="height:${h}%"></div>
                    <span class="pf-ck-trend-lbl">${this.esc(day)}</span>
                </div>`;
            }).join('')}</div>`;
        },

        renderKpis(data) {
            const el = document.getElementById('cookie-kpis');
            if (!el || !data) return;
            const rates = data.category_rates || {};
            const actions = data.actions || {};
            const kpis = [
                [this.t('pf_ck_kpi_events', 'أحداث الموافقة'), data.events_in_period ?? 0],
                [this.t('pf_ck_kpi_visitors', 'زوار فريدون'), data.unique_visitors_period ?? 0],
                [this.t('pf_ck_kpi_users', 'مستخدمون مسجلون'), data.unique_users_period ?? 0],
                [this.t('pf_ck_kpi_accept', 'قبول الكل'), actions.accept_all ?? 0],
                [this.t('pf_ck_kpi_reject', 'رفض غير الأساسية'), actions.reject_non_essential ?? 0],
                [this.t('pf_ck_kpi_analytics', 'تحليلية مفعّلة %'), (rates.analytics_pct ?? 0) + '%'],
                [this.t('pf_ck_kpi_marketing', 'تسويقية مفعّلة %'), (rates.marketing_pct ?? 0) + '%'],
                [this.t('pf_ck_kpi_policy', 'إصدار السياسة'), data.active_policy_version || '—']
            ];
            el.innerHTML = kpis.map(([l, n]) =>
                `<div class="pf-kpi"><div class="n">${this.esc(String(n))}</div><div class="l">${this.esc(l)}</div></div>`
            ).join('');
            this.renderTrend(data.daily_trend);

            const pagesEl = document.getElementById('cookie-top-pages');
            if (pagesEl) {
                const pages = data.top_pages || [];
                pagesEl.innerHTML = pages.length
                    ? `<ul class="pf-ck-pages">${pages.map((p) =>
                        `<li><code>${this.esc(p.page)}</code> <span class="muted-s">(${p.count})</span></li>`
                    ).join('')}</ul>`
                    : `<p class="muted-s">${this.esc(this.t('pf_ck_no_pages', 'لا توجد صفحات مسجّلة بعد'))}</p>`;
            }
        },

        async loadOverview() {
            const { data, error } = await this.rpc('api_admin_cookie_overview', { p_days: this.days });
            if (error) throw new Error(error.message);
            this.renderKpis(data);
        },

        async loadList() {
            const table = document.getElementById('cookie-consents-table');
            if (!table) return;
            table.innerHTML = `<p class="muted-s">${this.esc(this.t('pf_loading', 'جاري التحميل…'))}</p>`;
            const tenantEl = document.getElementById('cookie-filter-tenant');
            const tenantId = tenantEl && tenantEl.value ? tenantEl.value : null;
            const { data, error } = await this.rpc('api_admin_list_cookie_consents', {
                p_limit: 50,
                p_offset: this.listOffset,
                p_search: this.listSearch || null,
                p_action: this.listAction || null,
                p_tenant_id: tenantId,
                p_days: this.days
            });
            if (error) {
                table.innerHTML = `<p class="err">${this.esc(error.message)}</p>`;
                return;
            }
            const items = data.items || [];
            const fmt = (v) => {
                if (!v) return '—';
                try { return new Date(v).toLocaleString(global.SaaSI18n?.lang === 'en' ? 'en' : 'ar'); }
                catch (_e) { return String(v); }
            };
            table.innerHTML = items.length
                ? `<table class="pf-table"><thead><tr>
                    <th>${this.esc(this.t('pf_col_created', 'التاريخ'))}</th>
                    <th>${this.esc(this.t('pf_ck_col_action', 'الإجراء'))}</th>
                    <th>${this.esc(this.t('pf_col_email', 'البريد'))}</th>
                    <th>${this.esc(this.t('pf_msg_tenant', 'المؤسسة'))}</th>
                    <th>${this.esc(this.t('pf_ck_col_cats', 'الفئات'))}</th>
                    <th>${this.esc(this.t('pf_ck_col_page', 'الصفحة'))}</th>
                    <th>${this.esc(this.t('pf_dev_id', 'المعرّف'))}</th>
                  </tr></thead><tbody>${items.map((r) => `<tr>
                    <td>${this.esc(fmt(r.consent_at))}</td>
                    <td>${this.esc(this.actionLabel(r.action))}</td>
                    <td>${this.esc(r.email || '—')}</td>
                    <td>${this.esc(r.tenant_name || '—')}</td>
                    <td dir="ltr" style="font-size:.75rem">${this.esc(this.catsSummary(r.categories))}</td>
                    <td><code class="pf-code">${this.esc((r.context && r.context.page_path) || '—')}</code></td>
                    <td dir="ltr" style="font-size:.72rem"><code class="pf-code">${this.esc(String(r.visitor_id || '').slice(0, 10))}…</code></td>
                  </tr>`).join('')}</tbody></table>`
                : `<p class="muted-s">${this.esc(this.t('pf_no_rows', 'لا توجد سجلات'))}</p>`;

            const pager = document.getElementById('cookie-consents-pager');
            if (pager && typeof global.renderPager === 'function') {
                global.renderPager('cookie-consents-pager', data.total, this.listOffset, (dir) => {
                    this.listOffset = Math.max(0, this.listOffset + dir * 50);
                    this.loadList();
                });
            } else if (pager) {
                const total = data.total || 0;
                pager.innerHTML = `<span class="muted-s">${this.listOffset + 1}–${Math.min(this.listOffset + 50, total)} / ${total}</span>`;
            }
        },

        async loadPolicy() {
            const { data, error } = await this.rpc('api_get_cookie_policy', {});
            if (error) throw new Error(error.message);
            if (!data || data.success === false) return;
            this.policy = data;
            const ar = (data.content && data.content.ar) || {};
            const en = (data.content && data.content.en) || {};
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
            set('cookie-policy-version', data.version || '1.0.0');
            set('cookie-policy-title-ar', ar.title || '');
            set('cookie-policy-body-ar', ar.body || '');
            set('cookie-policy-title-en', en.title || '');
            set('cookie-policy-body-en', en.body || '');
        },

        async savePolicy() {
            const version = document.getElementById('cookie-policy-version')?.value?.trim();
            const content = {
                ar: {
                    title: document.getElementById('cookie-policy-title-ar')?.value?.trim() || 'سياسة الكوكيز',
                    body: document.getElementById('cookie-policy-body-ar')?.value?.trim() || '',
                    learnMoreUrl: '/login'
                },
                en: {
                    title: document.getElementById('cookie-policy-title-en')?.value?.trim() || 'Cookie Policy',
                    body: document.getElementById('cookie-policy-body-en')?.value?.trim() || '',
                    learnMoreUrl: '/login'
                }
            };
            if (!version) {
                this.msg(this.t('pf_ck_policy_ver_req', 'أدخل رقم الإصدار'), 'err');
                return;
            }
            this.msg(this.t('pf_saving', 'جاري الحفظ…'));
            const { data, error } = await this.rpc('api_save_cookie_policy', {
                p_data: { version, content }
            });
            if (error) throw new Error(error.message);
            if (data && data.success === false) throw new Error(data.message || 'save failed');
            this.msg(this.t('pf_ck_policy_saved', 'تم نشر السياسة'), 'ok');
            await this.loadOverview();
            await this.loadPolicy();
        },

        bindEvents() {
            const root = document.getElementById('pane-cookies');
            if (!root || root.dataset.bound === '1') return;
            root.dataset.bound = '1';
            const admin = this;

            document.getElementById('cookie-days-filter')?.addEventListener('change', (e) => {
                admin.days = parseInt(e.target.value, 10) || 30;
                admin.listOffset = 0;
                admin.loadOverview().catch((err) => admin.msg(err.message, 'err'));
                admin.loadList().catch((err) => admin.msg(err.message, 'err'));
            });
            document.getElementById('cookie-search-btn')?.addEventListener('click', () => {
                admin.listSearch = document.getElementById('cookie-search')?.value?.trim() || '';
                admin.listOffset = 0;
                admin.loadList().catch((err) => admin.msg(err.message, 'err'));
            });
            document.getElementById('cookie-search')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') document.getElementById('cookie-search-btn')?.click();
            });
            document.getElementById('cookie-action-filter')?.addEventListener('change', (e) => {
                admin.listAction = e.target.value || '';
                admin.listOffset = 0;
                admin.loadList().catch((err) => admin.msg(err.message, 'err'));
            });
            document.getElementById('cookie-filter-tenant')?.addEventListener('change', () => {
                admin.listOffset = 0;
                admin.loadList().catch((err) => admin.msg(err.message, 'err'));
            });
            document.getElementById('cookie-policy-save')?.addEventListener('click', () => {
                admin.savePolicy().catch((err) => admin.msg(err.message, 'err'));
            });
            document.getElementById('cookie-refresh-btn')?.addEventListener('click', () => {
                admin.loadPane().catch((err) => admin.msg(err.message, 'err'));
            });
        },

        async fillTenants() {
            const sel = document.getElementById('cookie-filter-tenant');
            if (!sel || sel.dataset.filled === '1') return;
            const { data, error } = await this.rpc('api_admin_tenant_options', {});
            if (error || !Array.isArray(data)) return;
            sel.dataset.filled = '1';
            const cur = sel.value;
            sel.innerHTML = `<option value="">${this.esc(this.t('pf_filter_all', 'الكل'))}</option>` +
                data.map((t) => `<option value="${this.esc(t.id)}">${this.esc(t.name)}</option>`).join('');
            if (cur) sel.value = cur;
        },

        async loadPane() {
            this.bindEvents();
            const df = document.getElementById('cookie-days-filter');
            if (df) this.days = parseInt(df.value, 10) || 30;
            this.msg(this.t('pf_loading', 'جاري التحميل…'));
            try {
                await this.fillTenants();
                await Promise.all([this.loadOverview(), this.loadList(), this.loadPolicy()]);
                this.msg('');
            } catch (e) {
                this.msg(e.message || 'فشل التحميل', 'err');
            }
        }
    };

    global.CookieAdmin = CookieAdmin;
})(window);
