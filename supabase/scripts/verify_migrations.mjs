/**
 * verify_migrations.mjs — full remote verification without SQL Editor.
 * Usage: node supabase/scripts/verify_migrations.mjs
 */
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const cfgText = readFileSync(path.resolve(root, 'frontend/js/saas/saas-config.js'), 'utf8');
const BASE = cfgText.match(/supabaseUrl:\s*'([^']+)'/)[1].replace(/\/$/, '');
const ANON = cfgText.match(/supabaseAnonKey:\s*'([^']+)'/)[1];

const RPCS = [
  { name: 'api_read_sheet', body: { p_sheet: 'UserTasks' } },
  { name: 'api_batch_read', body: { p_sheets: ['UserTasks'] } },
  { name: 'api_upsert', body: { p_sheet: 'UserTasks', p_id: '__probe__', p_data: {} } },
  { name: 'api_add_clinic_visit', body: { p_sheet: 'ClinicVisits', p_visit: { id: 'x' }, p_adjustments: [] } },
  { name: 'api_get_all_clinic_visits', body: {} },
  { name: 'api_update_task_completion', body: { p_task_id: 'x', p_rate: 0 } },
  { name: 'api_get_user_tasks', body: { p_user_id: '00000000-0000-0000-0000-000000000000' } },
  { name: 'api_billing_status', body: {} },
  { name: 'api_me', body: {} },
  { name: 'api_admin_list_plans', body: {} },
  { name: 'api_admin_overview', body: {} },
  { name: 'api_admin_list_tenants', body: { p_limit: 1, p_offset: 0 } },
  { name: 'api_admin_list_users', body: { p_limit: 1, p_offset: 0 } },
  { name: 'api_admin_list_billing', body: { p_limit: 1, p_offset: 0 } },
  { name: 'api_admin_update_tenant', body: { p_tenant_id: '00000000-0000-0000-0000-000000000000' } },
  { name: 'api_admin_set_member', body: { p_tenant_id: '00000000-0000-0000-0000-000000000000', p_user_id: '00000000-0000-0000-0000-000000000000', p_role: 'user' } },
  { name: 'api_provision_tenant', body: { p_name: '__probe__' } }
];

const EXPECTED_MIGRATIONS = ['0001','0002','0003','0004','0005','0006','0007','0008','0009','0010','0011','0012','0013','0014','0015','0016','0017','0018','0019','0020','0021','0022','0023','0024','0025','0026','0027'];

async function probeRpc(name, body, token = ANON) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { name, status: res.status, ok: res.status !== 404 };
}

async function getSmokeToken() {
  const credPath = path.join(__dirname, '.smoke-credentials.json');
  if (existsSync(credPath)) {
    const { email, password } = JSON.parse(readFileSync(credPath, 'utf8'));
    const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      const data = await res.json();
      return data.access_token;
    }
  }
  const adminPath = path.join(__dirname, '.platform-admin-credentials.json');
  if (existsSync(adminPath)) {
    const { email, password } = JSON.parse(readFileSync(adminPath, 'utf8'));
    const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      const data = await res.json();
      return data.access_token;
    }
  }
  return null;
}

function checkMigrationList() {
  const out = execSync('supabase migration list', { cwd: root, encoding: 'utf8' });
  const missing = EXPECTED_MIGRATIONS.filter(v => !new RegExp(`${v}\\s+\\|\\s+${v}`).test(out));
  if (missing.length) throw new Error(`not synced: ${missing.join(', ')} — run: supabase db push`);
  return `${EXPECTED_MIGRATIONS.length}/${EXPECTED_MIGRATIONS.length}`;
}

async function checkStorageBucket() {
  const res = await fetch(`${BASE}/storage/v1/bucket/tenant-attachments`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }
  });
  if (res.status === 404) return { ok: false, status: res.status };
  return { ok: res.status === 200 || res.status === 400, status: res.status };
}

let failed = 0;
function report(label, ok, detail = '') {
  console.log(`  [${ok ? 'OK' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

console.log('=== HSE SaaS Migration Verification ===');
console.log('Project:', BASE);
console.log('');

console.log('1) CLI migration sync:');
try {
  const n = checkMigrationList();
  report('Local = Remote', true, n);
} catch (e) {
  report('Local = Remote', false, e.message);
}

console.log('\n2) RPC existence:');
for (const rpc of RPCS) {
  const r = await probeRpc(rpc.name, rpc.body);
  report(rpc.name, r.ok, `HTTP ${r.status}`);
}

console.log('\n3) Storage bucket (0012):');
const bucket = await checkStorageBucket();
report('tenant-attachments', bucket.ok, `HTTP ${bucket.status}`);

console.log('\n4) Authenticated smoke (RLS + read):');
const token = await getSmokeToken();
if (!token) {
  report('smoke session', false, 'run create_smoke_tenant.mjs first');
} else {
  const read = await probeRpc('api_read_sheet', { p_sheet: 'UserTasks' }, token);
  report('api_read_sheet (auth)', read.ok && read.status !== 401, `HTTP ${read.status}`);
  const me = await probeRpc('api_me', {}, token);
  report('api_me (auth)', me.ok && me.status === 200, `HTTP ${me.status}`);
  const overview = await probeRpc('api_admin_overview', {}, token);
  const overviewAdmin = overview.status === 200;
  report('api_admin_overview (auth)', overviewAdmin || overview.status === 400,
    overviewAdmin ? 'HTTP 200' : `HTTP ${overview.status} (expected if not platform admin)`);

  const adminPath = path.join(__dirname, '.platform-admin-credentials.json');
  if (existsSync(adminPath)) {
    const { email, password } = JSON.parse(readFileSync(adminPath, 'utf8'));
    const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      const adminTok = (await res.json()).access_token;
      const ov = await probeRpc('api_admin_overview', {}, adminTok);
      report('api_admin_overview (platform admin)', ov.status === 200, `HTTP ${ov.status}`);
      const tenants = await probeRpc('api_admin_list_tenants', { p_limit: 1, p_offset: 0 }, adminTok);
      report('api_admin_list_tenants (platform admin)', tenants.status === 200, `HTTP ${tenants.status}`);
    } else {
      report('platform admin session', false, 'sign-in failed');
    }
  } else {
    report('platform admin session', false, 'run setup_production_remaining.mjs first');
  }
}

console.log('\n5) db push status:');
try {
  const push = execSync('supabase db push --yes', { cwd: root, encoding: 'utf8' });
  const upToDate = /up to date/i.test(push);
  report('supabase db push', upToDate, upToDate ? 'remote up to date' : 'check output');
} catch (e) {
  const msg = (e.stdout || e.message || '').toString();
  report('supabase db push', /up to date/i.test(msg), msg.split('\n')[0]);
}

console.log('');
if (failed) {
  console.error(`FAILED: ${failed} check(s). See supabase/scripts/verify_migrations.sql for SQL Editor fallback.`);
  process.exit(1);
}
console.log('All migration checks passed (' + EXPECTED_MIGRATIONS.length + '/' + EXPECTED_MIGRATIONS.length + ').');
