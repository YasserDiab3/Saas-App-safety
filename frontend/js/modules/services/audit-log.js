/**
 * Audit Log Service
 * Handles system audit logging
 */

const AuditLog = {
    log(action, module, recordId, details = {}) {
        if (!AppState.appData.auditLog) {
            AppState.appData.auditLog = [];
        }

        const entry = {
            id: Utils.generateId('AUDIT'),
            timestamp: new Date().toISOString(),
            action,
            module,
            recordId,
            details,
            user: this._extractUser(AppState.currentUser)
        };

        AppState.appData.auditLog.push(entry);

        try {
            DataManager.save();
            if (typeof Backend !== 'undefined' && Backend.autoSave) {
                Backend.autoSave('AuditLog', AppState.appData.auditLog).catch(() => {});
            }
        } catch (error) {
            Utils.safeWarn('⚠️ خطأ في حفظ سجل التدقيق:', error);
        }

        return entry;
    },

    getAll(filter = {}) {
        const logs = AppState.appData.auditLog || [];
        if (Object.keys(filter).length === 0) {
            return logs;
        }
        return logs.filter(entry => {
            return Object.entries(filter).every(([key, value]) => {
                if (value === undefined || value === null || value === '') return true;
                return entry[key] === value;
            });
        });
    },

    getByRecord(module, recordId) {
        return this.getAll({ module, recordId });
    },

    /**
     * Evidence pack export (CSV) for org admins — sensitive audit events in a date range.
     */
    exportEvidencePack(fromIso, toIso) {
        const from = fromIso || '';
        const to = toIso || '';
        const rows = this.getAll({}).filter((e) => {
            const ts = String(e.timestamp || '');
            if (from && ts < from) return false;
            if (to && ts > to) return false;
            return true;
        });
        const brand = (typeof window !== 'undefined' && window.SaaSReportBrand) ? window.SaaSReportBrand : null;
        const banner = brand ? brand.spreadsheetBannerRows('Evidence Audit Pack') : [['HSEHub 360 Evidence Audit']];
        const header = ['timestamp', 'action', 'module', 'recordId', 'userEmail', 'userName', 'details'];
        const lines = banner.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
        lines.push(header.join(','));
        rows.forEach((e) => {
            const u = e.user || {};
            const details = typeof e.details === 'object' ? JSON.stringify(e.details) : String(e.details || '');
            lines.push([
                e.timestamp || '',
                e.action || '',
                e.module || '',
                e.recordId || '',
                u.email || '',
                u.name || '',
                details.replace(/"/g, '""')
            ].map((c) => `"${String(c)}"`).join(','));
        });
        const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `hsehub-audit-evidence-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        this.log('audit_evidence_export', 'settings', 'evidence', { from, to, count: rows.length });
        return rows.length;
    },

    _extractUser(user) {
        if (!user) return null;
        return {
            id: user.id || null,
            name: user.name || user.fullName || user.displayName || '',
            email: user.email || '',
            role: user.role || ''
        };
    }
};

// Export to global window (for script tag loading)
if (typeof window !== 'undefined') {
    window.AuditLog = AuditLog;
}

