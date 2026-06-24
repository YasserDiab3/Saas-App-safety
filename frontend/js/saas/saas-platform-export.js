/**
 * saas-platform-export.js — Excel / PDF export for platform admin console.
 * Loads SheetJS + html2pdf on demand (CDN).
 */
(function (global) {
    function loadScript(src, test) {
        if (test && test()) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('failed to load ' + src));
            document.head.appendChild(s);
        });
    }

    async function ensureXlsx() {
        if (global.XLSX) return;
        const cdns = [
            'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
        ];
        let err;
        for (const src of cdns) {
            try {
                await loadScript(src, () => !!global.XLSX);
                if (global.XLSX) return;
            } catch (e) { err = e; }
        }
        throw err || new Error('XLSX not available');
    }

    async function ensureHtml2Pdf() {
        if (global.html2pdf) return;
        const cdns = [
            'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
            'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js'
        ];
        let err;
        for (const src of cdns) {
            try {
                await loadScript(src, () => !!global.html2pdf);
                if (global.html2pdf) return;
            } catch (e) { err = e; }
        }
        throw err || new Error('html2pdf not available');
    }

    function dateStamp() {
        return new Date().toISOString().slice(0, 10);
    }

    function escHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeSheets(pack) {
        if (pack.sheets && pack.sheets.length) return pack.sheets;
        return [{ name: pack.title || 'Sheet1', headers: pack.headers || [], rows: pack.rows || [] }];
    }

    function buildTableHtml(sheet) {
        const ths = (sheet.headers || []).map(h => `<th style="border:1px solid #cbd5e1;padding:6px 8px;background:#eff6ff;text-align:right">${escHtml(h)}</th>`).join('');
        const trs = (sheet.rows || []).map(row => {
            const tds = row.map(cell =>
                `<td style="border:1px solid #e2e8f0;padding:5px 8px;vertical-align:top">${escHtml(cell)}</td>`
            ).join('');
            return `<tr>${tds}</tr>`;
        }).join('');
        return `<div style="margin-bottom:20px">
          ${sheet.name ? `<h3 style="font-size:14px;color:#334155;margin:0 0 8px">${escHtml(sheet.name)}</h3>` : ''}
          <table style="width:100%;border-collapse:collapse;font-size:11px">${ths ? `<thead><tr>${ths}</tr></thead>` : ''}<tbody>${trs}</tbody></table>
        </div>`;
    }

    const Export = {
        async toExcel(pack) {
            await ensureXlsx();
            const sheets = normalizeSheets(pack);
            if (!sheets.length || !sheets.some(s => (s.rows || []).length)) {
                throw new Error(pack.emptyMessage || 'No data to export');
            }
            const wb = global.XLSX.utils.book_new();
            sheets.forEach((sh, i) => {
                const rows = (sh.rows || []).map(r => r.map(c => (c == null ? '' : c)));
                const ws = global.XLSX.utils.aoa_to_sheet([sh.headers || [], ...rows]);
                const name = String(sh.name || ('Sheet' + (i + 1))).slice(0, 31);
                global.XLSX.utils.book_append_sheet(wb, ws, name);
            });
            const fname = (pack.filename || 'export') + '_' + dateStamp() + '.xlsx';
            global.XLSX.writeFile(wb, fname);
        },

        async toPdf(pack) {
            await ensureHtml2Pdf();
            const sheets = normalizeSheets(pack);
            if (!sheets.length || !sheets.some(s => (s.rows || []).length)) {
                throw new Error(pack.emptyMessage || 'No data to export');
            }
            const rtl = pack.rtl !== false;
            const el = document.createElement('div');
            el.dir = rtl ? 'rtl' : 'ltr';
            el.style.cssText = 'font-family:Segoe UI,Tahoma,Arial,sans-serif;padding:20px 24px;background:#fff;color:#0f172a;width:1100px';
            el.innerHTML =
                `<div style="margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #2563eb">
                  <div style="font-size:18px;font-weight:700;color:#1e3a8a">${escHtml(pack.title || 'Export')}</div>
                  <div style="font-size:11px;color:#64748b;margin-top:4px">${escHtml(pack.subtitle || '')} · ${dateStamp()}</div>
                </div>` +
                sheets.map(buildTableHtml).join('');
            document.body.appendChild(el);
            const fname = (pack.filename || 'export') + '_' + dateStamp() + '.pdf';
            try {
                await global.html2pdf().set({
                    margin: [8, 8, 8, 8],
                    filename: fname,
                    image: { type: 'jpeg', quality: 0.95 },
                    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
                    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
                }).from(el).save();
            } finally {
                el.remove();
            }
        }
    };

    global.SaaSPlatformExport = Export;
})(window);
