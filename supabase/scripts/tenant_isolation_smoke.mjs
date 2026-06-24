/**
 * tenant_isolation_smoke.mjs — dual-tenant isolation checks (RLS + RPC guards).
 *
 * Creates two distinct users/tenants (or reuses .tenant-isolation-credentials.json),
 * writes a secret marker in tenant A, and verifies tenant B cannot read/patch/delete it.
 *
 * Usage:
 *   node supabase/scripts/tenant_isolation_smoke.mjs
 *   node supabase/scripts/tenant_isolation_smoke.mjs --fresh
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  loadConfig,
  auth,
  rpc,
  createSmokeTenant,
  parseSheetRows
} from './smoke-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const credPath = path.join(__dirname, '.tenant-isolation-credentials.json');
const fresh = process.argv.includes('--fresh');
const { base, anon } = loadConfig();

const tests = [];
function check(name, ok, detail = '') {
  tests.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
}

async function loadOrCreatePair() {
  if (!fresh && existsSync(credPath)) {
    const saved = JSON.parse(readFileSync(credPath, 'utf8'));
    if (saved?.tenantA?.email && saved?.tenantB?.email) {
      console.log('Reusing saved isolation tenants (use --fresh to recreate)\n');
      const tokenA = await auth(base, anon, saved.tenantA.email, saved.tenantA.password);
      const tokenB = await auth(base, anon, saved.tenantB.email, saved.tenantB.password);
      const meA = await rpc(base, anon, tokenA, 'api_me', {});
      const meB = await rpc(base, anon, tokenB, 'api_me', {});
      return {
        tenantA: { ...saved.tenantA, token: tokenA, tenant_id: meA?.tenant_id, me: meA },
        tenantB: { ...saved.tenantB, token: tokenB, tenant_id: meB?.tenant_id, me: meB }
      };
    }
  }

  console.log('Creating two isolation test tenants...\n');
  const ts = Date.now();
  const tenantA = await createSmokeTenant(base, anon, {
    email: `iso-a-${ts}@hse-saas.test`,
    orgName: `ISO Tenant A ${ts}`,
    phoneSuffix: '511111111'
  });
  const tenantB = await createSmokeTenant(base, anon, {
    email: `iso-b-${ts}@hse-saas.test`,
    orgName: `ISO Tenant B ${ts}`,
    phoneSuffix: '522222222'
  });

  const payload = {
    tenantA: {
      email: tenantA.email,
      password: tenantA.password,
      orgName: tenantA.orgName,
      tenant_id: tenantA.tenant_id
    },
    tenantB: {
      email: tenantB.email,
      password: tenantB.password,
      orgName: tenantB.orgName,
      tenant_id: tenantB.tenant_id
    },
    createdAt: new Date().toISOString()
  };
  writeFileSync(credPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log('Credentials saved:', credPath, '\n');
  return { tenantA, tenantB };
}

console.log('=== Tenant Isolation Smoke ===\n');

const { tenantA, tenantB } = await loadOrCreatePair();
const secret = `ISO-SECRET-${Date.now()}`;
const rowId = `ISO-ROW-${Date.now()}`;
const sheet = 'Incidents';

check(
  'distinct tenant_ids',
  tenantA.tenant_id && tenantB.tenant_id && tenantA.tenant_id !== tenantB.tenant_id,
  `${tenantA.tenant_id?.slice(0, 8)}… vs ${tenantB.tenant_id?.slice(0, 8)}…`
);

const markerRow = {
  id: rowId,
  title: 'Isolation marker',
  status: 'open',
  iso_secret: secret,
  _isolation: true
};

const upsertA = await rpc(base, anon, tenantA.token, 'api_upsert', {
  p_sheet: sheet,
  p_id: rowId,
  p_data: markerRow
});
check('tenant A writes marker row', upsertA?.success !== false, String(upsertA?.success));

const readB = await rpc(base, anon, tenantB.token, 'api_read_sheet', { p_sheet: sheet });
const rowsB = parseSheetRows(readB);
const leaked = rowsB.some(r => r.iso_secret === secret || String(r.id) === rowId);
check('tenant B cannot read tenant A marker', !leaked, `${rowsB.length} rows visible`);

const patchB = await rpc(base, anon, tenantB.token, 'api_patch', {
  p_sheet: sheet,
  p_id: rowId,
  p_patch: { title: 'hijacked' }
}, { raw: true });
let patchBBody;
try { patchBBody = JSON.parse(patchB.text); } catch { patchBBody = {}; }
check(
  'tenant B cannot patch tenant A row',
  patchB.status >= 400 || patchBBody.success === false,
  String(patchB.status)
);

const delB = await rpc(base, anon, tenantB.token, 'api_delete', {
  p_sheet: sheet,
  p_id: rowId
}, { raw: true });
let delBBody;
try { delBBody = JSON.parse(delB.text); } catch { delBBody = {}; }
check(
  'tenant B cannot delete tenant A row',
  delB.status >= 400 || delBBody.success === false,
  String(delB.status)
);

const readA = await rpc(base, anon, tenantA.token, 'api_read_sheet', { p_sheet: sheet });
const rowsA = parseSheetRows(readA);
const stillThere = rowsA.some(r => r.iso_secret === secret && String(r.id) === rowId);
check('tenant A still owns marker row', stillThere);

const adminA = await rpc(base, anon, tenantA.token, 'api_admin_overview', {}, { raw: true });
check(
  'tenant A blocked from platform admin RPC',
  adminA.status >= 400 || /forbidden|platform admin/i.test(adminA.text),
  String(adminA.status)
);

const adminB = await rpc(base, anon, tenantB.token, 'api_admin_overview', {}, { raw: true });
check(
  'tenant B blocked from platform admin RPC',
  adminB.status >= 400 || /forbidden|platform admin/i.test(adminB.text),
  String(adminB.status)
);

const deviceB = await rpc(base, anon, tenantB.token, 'api_upsert_device_session', {
  p_payload: { device_id: 'iso-test', user_agent: 'smoke' }
}, { raw: true });
check(
  'tenant user cannot call service-only device RPC',
  deviceB.status === 401 || deviceB.status === 403 || /permission|denied|forbidden/i.test(deviceB.text),
  String(deviceB.status)
);

await rpc(base, anon, tenantA.token, 'api_delete', { p_sheet: sheet, p_id: rowId });

const passed = tests.filter(t => t.ok).length;
console.log(`\nResult: ${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
