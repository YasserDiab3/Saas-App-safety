/**
 * verify_migrations.mjs — remote DB/RPC checks without SQL Editor.
 * Uses PostgREST RPC probe (404 = missing, non-404 = exists) + migration list via CLI hint.
 *
 * Usage: node supabase/scripts/verify_migrations.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, '../../frontend/js/saas/saas-config.js');
const cfgText = readFileSync(configPath, 'utf8');
const urlMatch = cfgText.match(/supabaseUrl:\s*'([^']+)'/);
const keyMatch = cfgText.match(/supabaseAnonKey:\s*'([^']+)'/);
if (!urlMatch || !keyMatch) {
  console.error('Could not read SAAS_CONFIG from saas-config.js');
  process.exit(1);
}
const BASE = urlMatch[1].replace(/\/$/, '');
const ANON = keyMatch[1];

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
  { name: 'api_provision_tenant', body: { p_name: '__probe__' } }
];

async function probeRpc(name, body) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  // 404 = function absent; 401/403/400/500 = function exists (auth/validation/runtime)
  return { name, status: res.status, ok: res.status !== 404 };
}

async function probeRest(table) {
  const res = await fetch(`${BASE}/rest/v1/${table}?select=count&limit=0`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }
  });
  return { table, status: res.status, ok: res.status !== 404 };
}

console.log('=== HSE SaaS migration verification ===');
console.log('Project:', BASE);
console.log('');

let failed = 0;
console.log('RPC existence (PostgREST probe):');
for (const rpc of RPCS) {
  const r = await probeRpc(rpc.name, rpc.body);
  const mark = r.ok ? 'OK' : 'MISSING';
  if (!r.ok) failed++;
  console.log(`  [${mark}] ${rpc.name} (HTTP ${r.status})`);
}

console.log('');
console.log('Note: apply_subscription returns OK if exposed (service_role only at runtime).');
console.log('For full SQL checks run supabase/scripts/verify_migrations.sql in SQL Editor.');
console.log('For migration history run: supabase migration list');
console.log('');
if (failed) {
  console.error(`FAILED: ${failed} RPC(s) missing.`);
  process.exit(1);
}
console.log('All probed RPCs exist on the remote project.');
