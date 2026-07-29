/**
 * saas-report-brand.js — unified branded PDF/Excel/print headers for HSEHub 360.
 */
(function (global) {
    function brandName() {
        try {
            return (global.SaaSBrand && SaaSBrand.getAppName()) || (global.SAAS_CONFIG && SAAS_CONFIG.appName) || 'HSEHub 360';
        } catch (_e) {
            return 'HSEHub 360';
        }
    }

    function tenantName() {
        try {
            if (global.AppState && AppState.companySettings && (AppState.companySettings.companyName || AppState.companySettings.name)) {
                return AppState.companySettings.companyName || AppState.companySettings.name;
            }
            const rows = (global.AppState && AppState.appData && AppState.appData.companySettings) || [];
            const row = Array.isArray(rows) ? (rows.find((r) => String(r.id) === 'default') || rows[0]) : rows;
            return (row && (row.companyName || row.name || row.organizationName)) || '';
        } catch (_e) {
            return '';
        }
    }

    function appVersion() {
        try {
            return (global.AppState && AppState.appVersion) || '';
        } catch (_e) {
            return '';
        }
    }

    function formatStamp(d) {
        const dt = d instanceof Date ? d : new Date();
        try {
            return dt.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
        } catch (_e) {
            return dt.toISOString();
        }
    }

    function metaLines(reportTitle) {
        const lines = [
            brandName(),
            reportTitle || 'تقرير',
            tenantName() ? `المؤسسة: ${tenantName()}` : null,
            `تاريخ التصدير: ${formatStamp()}`,
            appVersion() ? `إصدار النظام: ${appVersion()}` : null
        ].filter(Boolean);
        return lines;
    }

    /** HTML block for print / html2pdf */
    function htmlHeader(reportTitle) {
        const lines = metaLines(reportTitle)
            .map((l) => `<div style="margin:2px 0">${escapeHtml(l)}</div>`)
            .join('');
        return `<div dir="rtl" style="font-family:Segoe UI,Tahoma,sans-serif;border-bottom:2px solid #13315c;padding:8px 0 12px;margin-bottom:16px;color:#0b2a4a">
            <div style="font-size:18px;font-weight:700">${escapeHtml(brandName())}</div>
            ${lines}
          </div>`;
    }

    function htmlFooter() {
        return `<div dir="rtl" style="margin-top:24px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;font-family:Segoe UI,Tahoma,sans-serif">
            ${escapeHtml(brandName())} — سري / للاستخدام الداخلي · ${escapeHtml(formatStamp())}
          </div>`;
    }

    /** First rows for SheetJS / CSV exports */
    function spreadsheetBannerRows(reportTitle) {
        return metaLines(reportTitle).map((line) => [line]);
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function wrapPrintHtml(reportTitle, bodyHtml) {
        return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(reportTitle || brandName())}</title></head>
          <body style="margin:24px;font-family:Segoe UI,Tahoma,sans-serif;color:#0f172a">
            ${htmlHeader(reportTitle)}
            ${bodyHtml || ''}
            ${htmlFooter()}
          </body></html>`;
    }

    global.SaaSReportBrand = {
        brandName,
        tenantName,
        appVersion,
        metaLines,
        htmlHeader,
        htmlFooter,
        spreadsheetBannerRows,
        wrapPrintHtml,
        formatStamp
    };
})(window);
