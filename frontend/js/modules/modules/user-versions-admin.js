/**
 * UserVersionsAdmin — لوحة إدارة متابعة إصدارات المستخدمين
 *
 * يعرض لمدير النظام:
 *   - كروت ملخّصة: إجمالي / على الإصدار الأحدث / على إصدار قديم / نشطين 24h و 7d
 *   - توزيع المستخدمين على الإصدارات
 *   - جدول تفصيلي بكل المستخدمين: الإصدار، آخر مشاهدة، عدد الجلسات، المنصة، حالة (محدّث/قديم)
 *   - زر تحديث + تصدير Excel
 *
 * يُفتح من خلال زر داخل إعدادات / Dashboard للأدمن فقط.
 */
const UserVersionsAdmin = {
    _data: [],
    _stats: null,
    _loading: false,

    /** فتح اللوحة (modal) */
    async open() {
        // التحقق من الصلاحية
        const isAdmin = (() => {
            try {
                if (typeof Permissions !== 'undefined' && Permissions.isCurrentUserAdmin) {
                    return Permissions.isCurrentUserAdmin();
                }
            } catch (e) {}
            return (AppState.currentUser?.role || '').toLowerCase() === 'admin';
        })();

        if (!isAdmin) {
            Notification.error('هذه الصفحة متاحة لمدير النظام فقط');
            return;
        }

        // إنشاء modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'user-versions-admin-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 1200px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header" style="background: linear-gradient(135deg, #0F766E, #1E3A8A); color: #fff;">
                    <h2 class="modal-title" style="color: #fff;">
                        <i class="fas fa-code-branch ml-2"></i>
                        متابعة إصدارات المستخدمين
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" title="إغلاق" style="color: #fff;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <!-- شريط الأدوات -->
                    <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
                        <div class="text-sm text-slate-600">
                            <i class="fas fa-info-circle text-blue-600 ml-1"></i>
                            الإصدار الأحدث المتاح: <strong dir="ltr">${Utils.escapeHTML(AppState.appVersion || '-')}</strong>
                        </div>
                        <div class="flex gap-2 flex-wrap">
                            <button id="uva-refresh-btn" class="btn-secondary">
                                <i class="fas fa-sync-alt ml-2"></i>تحديث
                            </button>
                            <button id="uva-export-btn" class="btn-success">
                                <i class="fas fa-file-excel ml-2"></i>تصدير Excel
                            </button>
                        </div>
                    </div>

                    <!-- كروت الإحصائيات (6 كروت) -->
                    <div id="uva-stats-container" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
                        <div class="text-center text-slate-400 col-span-full py-6">
                            <i class="fas fa-spinner fa-spin text-2xl"></i>
                            <p class="mt-2 text-sm">جاري التحميل...</p>
                        </div>
                    </div>

                    <!-- توزيع الإصدارات -->
                    <div id="uva-version-distribution" class="mb-5"></div>

                    <!-- الجدول التفصيلي -->
                    <div id="uva-table-container">
                        <div class="text-center text-slate-400 py-6">
                            <i class="fas fa-spinner fa-spin text-xl"></i>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // ربط الأحداث
        modal.querySelector('#uva-refresh-btn')?.addEventListener('click', () => this.refresh());
        modal.querySelector('#uva-export-btn')?.addEventListener('click', () => this.exportToExcel());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // تحميل البيانات
        await this.refresh();
    },

    async refresh() {
        if (this._loading) return;
        this._loading = true;

        try {
            const latestVersion = AppState.appVersion || '';

            // جلب البيانات بالتوازي
            const [versionsRes, statsRes] = await Promise.all([
                GoogleIntegration.sendToAppsScript('getAllUserVersions', { latestVersion }),
                GoogleIntegration.sendToAppsScript('getUserVersionStats', { latestVersion })
            ]);

            this._data = (versionsRes && versionsRes.success && Array.isArray(versionsRes.data)) ? versionsRes.data : [];
            this._stats = (statsRes && statsRes.success) ? statsRes : null;

            this._renderStats();
            this._renderVersionDistribution();
            this._renderTable();
        } catch (error) {
            Utils.safeError('❌ خطأ في تحميل بيانات الإصدارات:', error);
            Notification.error('فشل تحميل البيانات: ' + (error.message || error));
        } finally {
            this._loading = false;
        }
    },

    _renderStats() {
        const container = document.getElementById('uva-stats-container');
        if (!container) return;
        const stats = this._stats || {};
        const totalUsers = stats.totalUsers || 0;
        const latestUsers = stats.latestUsers || 0;
        const outdatedUsers = stats.outdatedUsers || 0;
        const notReportedUsers = stats.notReportedUsers || 0;
        const activeLast24h = stats.activeLast24h || 0;
        const activeLast7d = stats.activeLast7d || 0;

        // ✅ 6 كروت: إجمالي + 3 حالات (محدّث/قديم/لم يُسجَّل) + 2 نشاط
        const cards = [
            { label: 'إجمالي المستخدمين', value: totalUsers,        icon: 'fa-users',                color: '#0F766E', bg: '#f0fdfa', border: '#99f6e4' },
            { label: 'على الإصدار الأحدث', value: latestUsers,      icon: 'fa-circle-check',         color: '#047857', bg: '#ecfdf5', border: '#a7f3d0' },
            { label: 'على إصدار قديم',     value: outdatedUsers,    icon: 'fa-triangle-exclamation', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
            { label: 'لم يُسجَّل بعد',       value: notReportedUsers, icon: 'fa-user-clock',           color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
            { label: 'نشط آخر 24 ساعة',   value: activeLast24h,    icon: 'fa-bolt',                 color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
            { label: 'نشط آخر 7 أيام',    value: activeLast7d,     icon: 'fa-calendar-week',        color: '#1E3A8A', bg: '#eef2ff', border: '#c7d2fe' },
        ];

        container.innerHTML = cards.map(c => `
            <div style="background:${c.bg};border:1px solid ${c.border};border-radius:12px;padding:14px;display:flex;align-items:center;gap:10px;">
                <div style="width:42px;height:42px;background:${c.color};border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fas ${c.icon}" style="color:#fff;font-size:16px;"></i>
                </div>
                <div>
                    <div style="font-size:1.5rem;font-weight:800;color:${c.color};line-height:1;" dir="ltr">${c.value}</div>
                    <div style="font-size:0.72rem;color:#64748b;margin-top:3px;white-space:nowrap;">${c.label}</div>
                </div>
            </div>
        `).join('');
    },

    _renderVersionDistribution() {
        const container = document.getElementById('uva-version-distribution');
        if (!container) return;
        const byVersion = (this._stats && Array.isArray(this._stats.byVersion)) ? this._stats.byVersion : [];

        if (byVersion.length === 0) {
            container.innerHTML = '';
            return;
        }

        const total = byVersion.reduce((s, v) => s + (v.count || 0), 0) || 1;
        const latestVersion = AppState.appVersion || '';

        const rows = byVersion.map(v => {
            const pct = Math.round((v.count / total) * 100);
            const isLatest = v.version === latestVersion;
            const isNotReported = v.version === 'لم يُسجَّل بعد';

            let barColor, bg, badge, versionLabel;
            if (isNotReported) {
                barColor = '#b45309';
                bg = '#fffbeb';
                badge = '<span style="background:#b45309;color:#fff;padding:2px 8px;border-radius:10px;font-size:0.65rem;font-weight:700;">لم يفتح التطبيق بعد</span>';
                versionLabel = `<span style="font-weight:700;color:#1e293b;">⏳ ${Utils.escapeHTML(v.version)}</span>`;
            } else if (isLatest) {
                barColor = '#047857';
                bg = '#ecfdf5';
                badge = '<span style="background:#047857;color:#fff;padding:2px 8px;border-radius:10px;font-size:0.65rem;font-weight:700;">الأحدث</span>';
                versionLabel = `<span style="font-family:monospace;font-weight:700;color:#1e293b;" dir="ltr">v${Utils.escapeHTML(v.version)}</span>`;
            } else {
                barColor = '#dc2626';
                bg = '#fef2f2';
                badge = '<span style="background:#b91c1c;color:#fff;padding:2px 8px;border-radius:10px;font-size:0.65rem;font-weight:700;">قديم</span>';
                versionLabel = `<span style="font-family:monospace;font-weight:700;color:#1e293b;" dir="ltr">v${Utils.escapeHTML(v.version)}</span>`;
            }
            return `
                <div style="background:${bg};border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;margin-bottom:6px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            ${versionLabel}
                            ${badge}
                        </div>
                        <div style="font-size:0.85rem;color:#64748b;">
                            <strong style="color:#1e293b;" dir="ltr">${v.count}</strong> مستخدم
                            <span style="color:#94a3b8;" dir="ltr">(${pct}%)</span>
                        </div>
                    </div>
                    <div style="width:100%;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
                        <div style="height:100%;background:${barColor};width:${pct}%;transition:width 0.5s;"></div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="content-card" style="padding:14px 18px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                    <i class="fas fa-chart-bar" style="color:#0F766E;"></i>
                    <strong style="font-size:0.95rem;">توزيع المستخدمين على الإصدارات</strong>
                </div>
                ${rows}
            </div>
        `;
    },

    _renderTable() {
        const container = document.getElementById('uva-table-container');
        if (!container) return;
        if (!this._data || this._data.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding:30px;">
                    <i class="fas fa-inbox text-4xl text-gray-300 mb-2"></i>
                    <p class="text-gray-500">لا توجد بيانات إصدارات بعد. ستظهر هنا بمجرد فتح المستخدمين للتطبيق.</p>
                </div>
            `;
            return;
        }

        const fmtDate = (iso) => {
            if (!iso) return '—';
            try {
                const d = new Date(iso);
                if (isNaN(d.getTime())) return '—';
                // تنسيق نسبي إذا كان قريباً، وإلا تاريخ كامل
                const diff = Date.now() - d.getTime();
                const min = Math.floor(diff / 60000);
                const hour = Math.floor(diff / 3600000);
                const day = Math.floor(diff / 86400000);
                if (min < 1) return 'الآن';
                if (min < 60) return `قبل ${min} د`;
                if (hour < 24) return `قبل ${hour} س`;
                if (day < 7) return `قبل ${day} يوم`;
                return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
            } catch (e) { return '—'; }
        };

        const rows = this._data.map((r, i) => {
            const rowBg = i % 2 === 0 ? '#fff' : '#fafafa';
            const hasReport = r.hasReport !== false; // default true for compatibility

            // ✅ 3 حالات: محدّث / قديم / لم يُسجَّل بعد
            let statusBadge, versionCell;
            if (!hasReport) {
                statusBadge = '<span style="background:#fffbeb;color:#b45309;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:700;">⏳ لم يُسجَّل</span>';
                versionCell = '<span style="color:#94a3b8;font-size:0.85rem;">—</span>';
            } else if (r.isOutdated) {
                statusBadge = '<span style="background:#fef2f2;color:#b91c1c;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:700;">قديم</span>';
                versionCell = `<span style="font-family:monospace;font-weight:700;color:#b91c1c;" dir="ltr">v${Utils.escapeHTML(r.currentVersion || '—')}</span>`;
            } else {
                statusBadge = '<span style="background:#ecfdf5;color:#047857;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:700;">محدّث</span>';
                versionCell = `<span style="font-family:monospace;font-weight:700;color:#047857;" dir="ltr">v${Utils.escapeHTML(r.currentVersion || '—')}</span>`;
            }

            const platformIcon = r.isMobile ? 'fa-mobile-screen' : (r.platform ? 'fa-desktop' : 'fa-question-circle');
            const platformText = r.platform || (hasReport ? '—' : 'غير معروف');
            const lastSeenText = hasReport ? fmtDate(r.lastSeenAt) : '<span style="color:#94a3b8;">لم يفتح بعد</span>';
            const sessionText = hasReport ? String(r.sessionCount || 0) : '<span style="color:#94a3b8;">0</span>';

            return `
                <tr style="border-bottom:1px solid #f1f5f9;background:${rowBg};${!hasReport ? 'opacity:0.85;' : ''}">
                    <td style="padding:10px 12px;">
                        <div style="font-weight:700;color:#1e293b;font-size:0.88rem;">${Utils.escapeHTML(r.userName || '—')}</div>
                        <div style="font-size:0.72rem;color:#94a3b8;" dir="ltr">${Utils.escapeHTML(r.userEmail || '')}</div>
                    </td>
                    <td style="padding:10px 12px;font-size:0.82rem;color:#475569;">${Utils.escapeHTML(r.userRole || '—')}</td>
                    <td style="padding:10px 12px;font-size:0.82rem;color:#475569;">${Utils.escapeHTML(r.userDepartment || '—')}</td>
                    <td style="padding:10px 12px;text-align:center;">${versionCell}</td>
                    <td style="padding:10px 12px;text-align:center;">${statusBadge}</td>
                    <td style="padding:10px 12px;text-align:center;font-size:0.82rem;color:#475569;" dir="ltr">${lastSeenText}</td>
                    <td style="padding:10px 12px;text-align:center;font-size:0.82rem;color:#475569;" dir="ltr">${sessionText}</td>
                    <td style="padding:10px 12px;text-align:center;color:#64748b;font-size:0.78rem;">
                        <i class="fas ${platformIcon}" title="${Utils.escapeHTML(r.platform || '')}"></i>
                        <span style="margin-inline-start:4px;">${Utils.escapeHTML(platformText)}</span>
                    </td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <div class="content-card" style="padding:0;overflow:hidden;">
                <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;">
                    <strong style="font-size:0.95rem;">
                        <i class="fas fa-list-ul" style="color:#0F766E;margin-inline-end:6px;"></i>
                        تفاصيل المستخدمين
                    </strong>
                    <span style="background:#f0fdfa;color:#0F766E;padding:3px 10px;border-radius:12px;font-size:0.75rem;font-weight:700;" dir="ltr">${this._data.length}</span>
                </div>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                        <thead>
                            <tr style="background:#f8fafc;">
                                <th style="padding:10px 12px;text-align:start;font-weight:700;color:#475569;white-space:nowrap;">المستخدم</th>
                                <th style="padding:10px 12px;text-align:start;font-weight:700;color:#475569;">الدور</th>
                                <th style="padding:10px 12px;text-align:start;font-weight:700;color:#475569;">القسم</th>
                                <th style="padding:10px 12px;text-align:center;font-weight:700;color:#475569;">الإصدار</th>
                                <th style="padding:10px 12px;text-align:center;font-weight:700;color:#475569;">الحالة</th>
                                <th style="padding:10px 12px;text-align:center;font-weight:700;color:#475569;">آخر مشاهدة</th>
                                <th style="padding:10px 12px;text-align:center;font-weight:700;color:#475569;">جلسات</th>
                                <th style="padding:10px 12px;text-align:center;font-weight:700;color:#475569;">المنصة</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    },

    /** تصدير الجدول إلى Excel (CSV بسيط) */
    exportToExcel() {
        if (!this._data || this._data.length === 0) {
            Notification.warning('لا توجد بيانات للتصدير');
            return;
        }

        const headers = ['الاسم', 'الإيميل', 'الدور', 'القسم', 'الإصدار الحالي', 'الإصدار الأول', 'الإصدار السابق', 'الحالة', 'آخر مشاهدة', 'أول مشاهدة', 'عدد الجلسات', 'عدد التقارير', 'المنصة', 'جوال؟', 'الحجم', 'اللغة'];
        const rows = this._data.map(r => {
            const hasReport = r.hasReport !== false;
            const status = !hasReport ? 'لم يُسجَّل' : (r.isOutdated ? 'قديم' : 'محدّث');
            return [
                r.userName || '',
                r.userEmail || '',
                r.userRole || '',
                r.userDepartment || '',
                r.currentVersion || '',
                r.firstSeenVersion || '',
                r.previousVersion || '',
                status,
                r.lastSeenAt || '',
                r.firstSeenAt || '',
                r.sessionCount || 0,
                r.reportCount || 0,
                r.platform || '',
                r.isMobile ? 'نعم' : 'لا',
                r.screenSize || '',
                r.language || ''
            ];
        });

        const csv = '﻿' + // BOM للعربية
            [headers, ...rows].map(row => row.map(cell => {
                const s = String(cell == null ? '' : cell).replace(/"/g, '""');
                return /[,;"\n]/.test(s) ? `"${s}"` : s;
            }).join(',')).join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        a.href = url;
        a.download = `user-versions-${ts}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Notification.success('تم تصدير البيانات بنجاح');
    }
};

// تسجيل في window للوصول من زر الإدارة
if (typeof window !== 'undefined') {
    window.UserVersionsAdmin = UserVersionsAdmin;
}
