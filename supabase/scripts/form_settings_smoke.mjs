/**
 * Smoke test: FormSettings read/write via Supabase (getFormSettings / saveFormSettings).
 */
import { loadConfig, loadSmokeCredentials, auth, rpc } from './smoke-lib.mjs';

const { base, anon } = loadConfig();
const creds = loadSmokeCredentials();
if (!creds) {
    console.error('SKIP: set SMOKE_EMAIL / SMOKE_PASSWORD or .smoke-credentials.json');
    process.exit(1);
}

const token = await auth(base, anon, creds.email, creds.password);
let passed = 0;
let failed = 0;

function pass(label) { passed++; console.log('PASS —', label); }
function fail(label, err) { failed++; console.log('FAIL —', label, err || ''); }

const testSite = {
    id: 'SMOKE-SITE-' + Date.now(),
    name: 'موقع اختبار دخان',
    places: [{ id: 'SMOKE-PLACE-1', name: 'مكان اختبار', siteId: '' }]
};
testSite.places[0].siteId = testSite.id;

const payload = {
    id: 'FORM-SETTINGS-1',
    sites: [testSite],
    departments: ['إدارة اختبار'],
    safetyTeam: ['عضو سلامة اختبار'],
    updatedAt: new Date().toISOString()
};

try {
    const saveRes = await rpc(base, anon, token, 'api_upsert', {
        p_sheet: 'FormSettings',
        p_id: payload.id,
        p_data: payload
    });
    if (saveRes && saveRes.success !== false) pass('api_upsert FormSettings');
    else fail('api_upsert FormSettings', JSON.stringify(saveRes));
} catch (e) {
    fail('api_upsert FormSettings', e.message);
}

try {
    const rows = await rpc(base, anon, token, 'api_read_sheet', { p_sheet: 'FormSettings' });
    const arr = Array.isArray(rows) ? rows : [];
    const row = arr.find(r => String(r.id) === 'FORM-SETTINGS-1') || arr[0];
    if (row && Array.isArray(row.sites) && row.sites.length > 0) {
        pass('api_read_sheet FormSettings has sites');
    } else {
        fail('api_read_sheet FormSettings has sites', JSON.stringify(row));
    }
} catch (e) {
    fail('api_read_sheet FormSettings', e.message);
}

console.log(`\nResult: ${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
