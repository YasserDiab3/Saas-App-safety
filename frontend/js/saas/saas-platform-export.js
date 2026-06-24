/**
 * saas-platform-export.js — Excel / PDF export for platform admin console.
 * Branded header with HSEHub 360 logo. Loads ExcelJS + html2pdf on demand.
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

    async function ensureExcelJS() {
        if (global.ExcelJS) return;
        const cdns = [
            'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'
        ];
        let err;
        for (const src of cdns) {
            try {
                await loadScript(src, () => !!global.ExcelJS);
                if (global.ExcelJS) return;
            } catch (e) { err = e; }
        }
        throw err || new Error('ExcelJS not available');
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

    function brandOf(pack) {
        const b = pack.brand || {};
        return {
            logoUrl: b.logoUrl || resolveLogoUrl(),
            company: b.company || 'HSEHub 360',
            tagline: b.tagline || 'Safety • Health • Environment',
            portal: b.portal || 'Platform Console'
        };
    }

    function resolveLogoUrl() {
        try {
            return new URL('assets/brand/logo.png', global.location.href).href;
        } catch (_e) {
            return '/assets/brand/logo.png';
        }
    }

    async function loadLogoBase64(pack) {
        if (pack._logoBase64 !== undefined) return pack._logoBase64;
        const url = brandOf(pack).logoUrl;
        try {
            const res = await fetch(url, { cache: 'force-cache' });
            if (!res.ok) { pack._logoBase64 = null; return null; }
            const blob = await res.blob();
            pack._logoBase64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const raw = reader.result;
                    if (typeof raw === 'string' && raw.includes(',')) resolve(raw.split(',')[1]);
                    else resolve(null);
                };
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch (_e) {
            pack._logoBase64 = null;
        }
        return pack._logoBase64;
    }

    function normalizeSheets(pack) {
        if (pack.sheets && pack.sheets.length) return pack.sheets;
        return [{ name: pack.title || 'Sheet1', headers: pack.headers || [], rows: pack.rows || [] }];
    }

    function colLetter(n) {
        let s = '';
        let num = n;
        while (num > 0) {
            const m = (num - 1) % 26;
            s = String.fromCharCode(65 + m) + s;
            num = Math.floor((num - 1) / 26);
        }
        return s || 'A';
    }

    function buildTableHtml(sheet, rtl) {
        const align = rtl ? 'right' : 'left';
        const ths = (sheet.headers || []).map(h =>
            `<th style="border:1px solid #cbd5e1;padding:7px 10px;background:#eff6ff;text-align:${align};font-weight:700;color:#1e3a8a">${escHtml(h)}</th>`
        ).join('');
        const trs = (sheet.rows || []).map((row, i) => {
            const bg = i % 2 ? '#f8fafc' : '#ffffff';
            const tds = row.map(cell =>
                `<td style="border:1px solid #e2e8f0;padding:6px 10px;vertical-align:top;background:${bg}">${escHtml(cell)}</td>`
            ).join('');
            return `<tr>${tds}</tr>`;
        }).join('');
        return `<div style="margin-bottom:22px">
          ${sheet.name ? `<h3 style="font-size:13px;color:#334155;margin:0 0 10px;font-weight:700;border-right:3px solid #2563eb;padding-right:8px">${escHtml(sheet.name)}</h3>` : ''}
          <table style="width:100%;border-collapse:collapse;font-size:10.5px">${ths ? `<thead><tr>${ths}</tr></thead>` : ''}<tbody>${trs}</tbody></table>
        </div>`;
    }

    function buildPdfHeaderHtml(pack, logoUrl) {
        const b = brandOf(pack);
        const rtl = pack.rtl !== false;
        const title = pack.title || 'Export';
        const meta = [pack.generatedAt || dateStamp(), b.portal].filter(Boolean).join(' · ');
        const flexDir = rtl ? 'row-reverse' : 'row';
        const textAlign = rtl ? 'right' : 'left';
        const metaAlign = rtl ? 'left' : 'right';
        return `<div style="display:flex;flex-direction:${flexDir};align-items:center;justify-content:space-between;gap:24px;padding:18px 22px;background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 55%,#1d4ed8 100%);border-radius:10px;margin-bottom:18px;color:#fff;box-shadow:0 4px 14px rgba(30,58,138,.25)">
          <div style="display:flex;flex-direction:${flexDir};align-items:center;gap:16px;min-width:0">
            <div style="background:#fff;padding:8px 12px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.12);flex-shrink:0">
              <img src="${escHtml(logoUrl)}" crossorigin="anonymous" alt="${escHtml(b.company)}" style="height:48px;width:auto;display:block;max-width:140px;object-fit:contain">
            </div>
            <div style="text-align:${textAlign}">
              <div style="font-size:20px;font-weight:800;letter-spacing:.02em;line-height:1.2">${escHtml(b.company)}</div>
              <div style="font-size:11px;opacity:.92;margin-top:4px">${escHtml(b.tagline)}</div>
            </div>
          </div>
          <div style="text-align:${metaAlign};flex-shrink:0">
            <div style="font-size:15px;font-weight:700;line-height:1.3">${escHtml(title)}</div>
            <div style="font-size:10.5px;opacity:.88;margin-top:5px">${escHtml(meta)}</div>
          </div>
        </div>`;
    }

    async function waitImages(el) {
        const imgs = [...el.querySelectorAll('img')];
        await Promise.all(imgs.map(img => {
            if (img.complete && img.naturalWidth) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(resolve, 3000);
            });
        }));
    }

    async function styleExcelSheet(ws, sh, pack, logoB64, sheetIndex) {
        const b = brandOf(pack);
        const rtl = !!pack.rtl;
        const headers = sh.headers || [];
        const rows = (sh.rows || []).map(r => r.map(c => (c == null ? '' : c)));
        const colCount = Math.max(headers.length, 4);
        const lastCol = colLetter(colCount);
        const title = sh.name || pack.title || 'Report';

        ws.views = [{ rightToLeft: rtl, showGridLines: false }];
        ws.properties.defaultRowHeight = 18;

        for (let r = 1; r <= 5; r++) ws.getRow(r).height = r <= 3 ? 22 : 18;

        ws.mergeCells(`A1:B3`);
        if (colCount >= 3) {
            ws.mergeCells(`C1:${lastCol}1`);
            ws.mergeCells(`C2:${lastCol}2`);
            ws.mergeCells(`C3:${lastCol}3`);
        }
        ws.mergeCells(`A4:${lastCol}4`);
        ws.mergeCells(`A5:${lastCol}5`);

        ['A1', 'B1', 'A2', 'B2', 'A3', 'B3'].forEach(ref => {
            ws.getCell(ref).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });
        for (let c = 1; c <= colCount; c++) {
            ws.getCell(`${colLetter(c)}4`).border = { bottom: { style: 'medium', color: { argb: 'FF2563EB' } } };
        }

        const c1 = ws.getCell(colCount >= 3 ? 'C1' : 'A1');
        c1.value = b.company;
        c1.font = { bold: true, size: 16, color: { argb: 'FF1E3A8A' }, name: 'Segoe UI' };
        c1.alignment = { vertical: 'middle', horizontal: rtl ? 'right' : 'left' };

        const c2 = ws.getCell(colCount >= 3 ? 'C2' : 'A2');
        c2.value = b.tagline;
        c2.font = { size: 10, color: { argb: 'FF64748B' }, name: 'Segoe UI' };
        c2.alignment = { vertical: 'middle', horizontal: rtl ? 'right' : 'left' };

        const c3 = ws.getCell(colCount >= 3 ? 'C3' : 'A3');
        c3.value = title;
        c3.font = { bold: true, size: 12, color: { argb: 'FF2563EB' }, name: 'Segoe UI' };
        c3.alignment = { vertical: 'middle', horizontal: rtl ? 'right' : 'left' };

        const c4 = ws.getCell('A4');
        c4.value = (pack.generatedAt || dateStamp()) + '  ·  ' + b.portal;
        c4.font = { size: 9, color: { argb: 'FF94A3B8' }, name: 'Segoe UI' };
        c4.alignment = { horizontal: rtl ? 'right' : 'left' };

        if (logoB64) {
            try {
                const imgId = pack._workbook.addImage({ base64: logoB64, extension: 'png' });
                ws.addImage(imgId, { tl: { col: 0.2, row: 0.15 }, ext: { width: 118, height: 42 } });
            } catch (_e) { /* logo optional */ }
        }

        const headerRowNum = 6;
        headers.forEach((h, i) => {
            const cell = ws.getCell(headerRowNum, i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FF1E3A8A' }, name: 'Segoe UI', size: 10 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                bottom: { style: 'thin', color: { argb: 'FF2563EB' } },
                left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
            };
            cell.alignment = { vertical: 'middle', horizontal: rtl ? 'right' : 'left', wrapText: true };
        });

        rows.forEach((row, ri) => {
            const rn = headerRowNum + 1 + ri;
            row.forEach((val, ci) => {
                const cell = ws.getCell(rn, ci + 1);
                cell.value = val;
                cell.font = { size: 10, name: 'Segoe UI' };
                cell.alignment = { vertical: 'top', horizontal: rtl ? 'right' : 'left', wrapText: true };
                if (ri % 2 === 1) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                }
                cell.border = {
                    top: { style: 'hair', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'hair', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'hair', color: { argb: 'FFE2E8F0' } }
                };
            });
        });

        headers.forEach((h, i) => {
            const maxLen = Math.max(
                String(h).length,
                ...rows.map(r => String(r[i] ?? '').length)
            );
            ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 2, 10), 42);
        });

        ws.pageSetup = {
            paperSize: 9,
            orientation: colCount > 6 ? 'landscape' : 'portrait',
            fitToPage: true,
            fitToWidth: 1,
            margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.5, header: 0.2, footer: 0.2 }
        };
        if (sheetIndex === 0) {
            ws.headerFooter.oddHeader = `&C&HSEHub 360 — ${title}`;
            ws.headerFooter.oddFooter = `&C${b.company}  ·  ${pack.generatedAt || dateStamp()}`;
        }
    }

    const Export = {
        async toExcel(pack) {
            const sheets = normalizeSheets(pack);
            if (!sheets.length || !sheets.some(s => (s.rows || []).length)) {
                throw new Error(pack.emptyMessage || 'No data to export');
            }
            const logoB64 = await loadLogoBase64(pack);

            try {
                await ensureExcelJS();
                const wb = new global.ExcelJS.Workbook();
                wb.creator = brandOf(pack).company;
                wb.created = new Date();
                pack._workbook = wb;

                for (let i = 0; i < sheets.length; i++) {
                    const sh = sheets[i];
                    if (!(sh.rows || []).length) continue;
                    const ws = wb.addWorksheet(String(sh.name || ('Sheet' + (i + 1))).slice(0, 31), {
                        properties: { tabColor: { argb: 'FF2563EB' } }
                    });
                    await styleExcelSheet(ws, sh, pack, logoB64, i);
                }

                const buf = await wb.writeBuffer();
                const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = (pack.filename || 'export') + '_' + dateStamp() + '.xlsx';
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 4000);
                delete pack._workbook;
                return;
            } catch (_excelJsErr) {
                delete pack._workbook;
            }

            await ensureXlsx();
            const wb = global.XLSX.utils.book_new();
            const b = brandOf(pack);
            sheets.forEach((sh, i) => {
                const rows = (sh.rows || []).map(r => r.map(c => (c == null ? '' : c)));
                const aoa = [
                    [b.company, '', sh.name || pack.title || ''],
                    [b.tagline],
                    [pack.generatedAt || dateStamp(), b.portal],
                    [],
                    sh.headers || [],
                    ...rows
                ];
                const ws = global.XLSX.utils.aoa_to_sheet(aoa);
                global.XLSX.utils.book_append_sheet(wb, ws, String(sh.name || ('Sheet' + (i + 1))).slice(0, 31));
            });
            global.XLSX.writeFile(wb, (pack.filename || 'export') + '_' + dateStamp() + '.xlsx');
        },

        async toPdf(pack) {
            await ensureHtml2Pdf();
            const sheets = normalizeSheets(pack);
            if (!sheets.length || !sheets.some(s => (s.rows || []).length)) {
                throw new Error(pack.emptyMessage || 'No data to export');
            }
            const b = brandOf(pack);
            const rtl = pack.rtl !== false;
            const logoUrl = b.logoUrl;
            const el = document.createElement('div');
            el.dir = rtl ? 'rtl' : 'ltr';
            el.style.cssText = 'font-family:Segoe UI,Tahoma,Arial,sans-serif;padding:20px 24px 28px;background:#fff;color:#0f172a;width:1100px';
            el.innerHTML = buildPdfHeaderHtml(pack, logoUrl) + sheets.map(s => buildTableHtml(s, rtl)).join('') +
                `<div style="margin-top:16px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;text-align:center">${escHtml(b.company)} · ${escHtml(pack.generatedAt || dateStamp())}</div>`;
            document.body.appendChild(el);
            await waitImages(el);
            const fname = (pack.filename || 'export') + '_' + dateStamp() + '.pdf';
            try {
                await global.html2pdf().set({
                    margin: [8, 8, 10, 8],
                    filename: fname,
                    image: { type: 'jpeg', quality: 0.96 },
                    html2canvas: { scale: 2, useCORS: true, allowTaint: false, letterRendering: true },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
                    pagebreak: { mode: ['css', 'legacy'] }
                }).from(el).save();
            } finally {
                el.remove();
            }
        }
    };

    global.SaaSPlatformExport = Export;
})(window);
