/**
 * p0_module_smoke.mjs — CRUD smoke for trial-allowed modules only (0018).
 * Requires SMOKE_EMAIL/SMOKE_PASSWORD or .smoke-credentials.json.
 *
 * Usage: node supabase/scripts/p0_module_smoke.mjs
 */
import {
  loadConfig,
  loadSmokeCredentials,
  auth,
  rpc,
  TRIAL_P0_SHEETS,
  rowFor
} from './smoke-lib.mjs';

const { base, anon } = loadConfig();
const creds = loadSmokeCredentials();

if (!creds) {
  console.error('Set SMOKE_EMAIL and SMOKE_PASSWORD (or .smoke-credentials.json).');
  process.exit(2);
}

console.log('=== P0 Module Smoke (trial allow-list) ===\n');

let token;
try {
  token = await auth(base, anon, creds.email, creds.password);
  console.log('Auth: OK\n');
} catch (e) {
  console.error('Auth: FAIL —', e.message);
  process.exit(1);
}

let passed = 0;
let failed = 0;

for (const { module, sheet, id } of TRIAL_P0_SHEETS) {
  process.stdout.write(`${module} (${sheet}) ... `);
  try {
    const row = rowFor(sheet, id);
    const upsert = await rpc(base, anon, token, 'api_upsert', { p_sheet: sheet, p_id: id, p_data: row });
    if (upsert && upsert.success === false) throw new Error(upsert.message || 'upsert failed');
    const rows = await rpc(base, anon, token, 'api_read_sheet', { p_sheet: sheet });
    const arr = Array.isArray(rows) ? rows : (rows?.data || []);
    const found = arr.some(r => String(r.id || r.ID) === id);
    if (!found) throw new Error('row not found after upsert');
    await rpc(base, anon, token, 'api_delete', { p_sheet: sheet, p_id: id });
    console.log('PASS');
    passed++;
  } catch (e) {
    console.log('FAIL —', e.message);
    failed++;
  }
}

// Blocked module must stay blocked on free/trial plan
process.stdout.write('Employees (blocked on trial) ... ');
try {
  await rpc(base, anon, token, 'api_upsert', {
    p_sheet: 'Employees',
    p_id: 'SMOKE-EMP-BLOCK',
    p_data: { id: 'SMOKE-EMP-BLOCK', name: 'Blocked', _smoke: true }
  });
  console.log('FAIL — upsert should be rejected');
  failed++;
} catch (e) {
  if (/module not allowed/i.test(String(e.message))) {
    console.log('PASS (correctly blocked)');
    passed++;
  } else {
    console.log('FAIL —', e.message);
    failed++;
  }
}

console.log(`\nResult: ${passed}/${TRIAL_P0_SHEETS.length + 1} passed`);
if (failed) process.exit(1);
