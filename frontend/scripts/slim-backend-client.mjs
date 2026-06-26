import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '../js/modules/services/backend-client.js');
const lines = fs.readFileSync(target, 'utf8').split(/\r?\n/);

const bridge = `
    async sendToAppsScript(action, data) {
        if (!window.SaaSAdapter) {
            throw new Error('SaaS backend (Supabase) غير جاهز');
        }
        return window.SaaSAdapter.sendRequest({ action, data: data || {} });
    },

    async sendRequest(requestData) {
        const { action, data } = requestData || {};
        if (!action) throw new Error('يجب إدخال action في الطلب');
        if (!window.SaaSAdapter) {
            throw new Error('SaaS backend (Supabase) غير جاهز');
        }
        return window.SaaSAdapter.sendRequest({ action, data });
    },

    async readFromSheet(sheetName, timeoutOrOptions) {
        return this.readFromSheets(sheetName, timeoutOrOptions);
    },

    async callAppsScript(action, data) {
        return this.sendToAppsScript(action, data);
    },

    clearCache() { /* no-op */ },
`;

let head = lines.slice(0, 241).join('\n');
head = head.replace(
    /\/\*\*[\s\S]*?\*\/\s*\nconst Backend/,
    '/**\n * Backend facade — routes RPC to Supabase via SaaSAdapter (SaaS-only).\n */\nconst Backend'
);
head = head.replace(
    /_isBackendRpcConfigured\(\) \{[\s\S]*?\n    \},/,
    `_isBackendRpcConfigured() {
        return !!(typeof window !== 'undefined' && window.SAAS_CONFIG && window.SAAS_CONFIG.useSupabaseBackend && window.SaaSAdapter);
    },`
);

const mid1 = lines.slice(1448, 2527).join('\n');
const mid2 = lines.slice(2682, 3629).join('\n');
const tail = lines.slice(3638, 3746).join('\n');

let body = [head, bridge.trimEnd(), mid1, mid2, tail, '};', '', 'if (typeof window !== \'undefined\') {', '    window.Backend = Backend;', '}'].join('\n');

body = body
    .replace(/\n\s*if \(AppState\.backendConfig\.sheets\?\.spreadsheetId\) \{\n\s*payload\.data\.spreadsheetId = AppState\.backendConfig\.sheets\.spreadsheetId;\n\s*\}/g, '')
    .replace(/\n\s*if \(AppState\.backendConfig\.sheets\?\.spreadsheetId\) \{\n\s*payload\.data\.spreadsheetId = AppState\.backendConfig\.sheets\.spreadsheetId;\n\s*\}/g, '')
    .replace(/const spreadsheetId = AppState\.backendConfig\.sheets\?\.spreadsheetId\?\.trim\(\);\n\s*const hasLocalSpreadsheetId = spreadsheetId && spreadsheetId !== '' && spreadsheetId !== 'YOUR_SPREADSHEET_ID_HERE';\n\n/g, '')
    .replace(/\n\s*if \(hasLocalSpreadsheetId\) \{\n\s*requestData\.spreadsheetId = spreadsheetId;\n\s*\}/g, '');

fs.writeFileSync(target, body);
console.log('Wrote', target, 'lines:', body.split(/\r?\n/).length);
