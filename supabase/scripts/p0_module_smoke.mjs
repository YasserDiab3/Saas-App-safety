/**
 * p0_module_smoke.mjs — automated P0 sheet read/write smoke via Supabase RPCs.
 * Requires env: SMOKE_EMAIL, SMOKE_PASSWORD (test tenant owner account).
 *
 * Usage:
 *   $env:SMOKE_EMAIL="test@example.com"; $env:SMOKE_PASSWORD="..." ; node supabase/scripts/p0_module_smoke.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfgText = readFileSync(path.resolve(__dirname, '../../frontend/js/saas/saas-config.js'), 'utf8');
const BASE = cfgText.match(/supabaseUrl:\s*'([^']+)'/)[1].replace(/\/$/, '');
const ANON = cfgText.match(/supabaseAnonKey:\s*'([^']+)'/)[1];

const EMAIL = process.env.SMOKE_EMAIL || '';
const PASSWORD = process.env.SMOKE_PASSWORD || '';

/** P0 modules → primary sheet for CRUD smoke */
const P0_SHEETS = [
  { module: 'Clinic', sheet: 'Medications', id: 'SMOKE-MED-1' },
  { module: 'PTW', sheet: 'PTW', id: 'SMOKE-PTW-1' },
  { module: 'Incidents', sheet: 'Incidents', id: 'SMOKE-INC-1' },
  { module: 'Employees', sheet: 'Employees', id: 'SMOKE-EMP-1' },
  { module: 'Training', sheet: 'Training', id: 'SMOKE-TRN-1' }
];

async function auth() {
  if (!EMAIL || !PASSWORD) {
    console.error('Set SMOKE_EMAIL and SMOKE_PASSWORD environment variables.');
    process.exit(2);
  }
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'auth failed');
  return data.access_token;
}

async function rpc(token, fn, args = {}) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${text}`);
  return data;
}

function rowFor(sheet, id) {
  const ts = new Date().toISOString();
  const base = { id, _smoke: true, createdAt: ts };
  switch (sheet) {
    case 'Medications': return { ...base, name: 'Smoke Test Med', quantity: 10, unit: 'box' };
    case 'PTW': return { ...base, permitNumber: id, status: 'draft', workDescription: 'smoke' };
    case 'Incidents': return { ...base, title: 'Smoke incident', status: 'open' };
    case 'Employees': return { ...base, name: 'Smoke Employee', department: 'QA' };
    case 'Training': return { ...base, title: 'Smoke Training', status: 'planned' };
    default: return base;
  }
}

console.log('=== P0 Module Smoke (Supabase RPC) ===\n');

let token;
try {
  token = await auth();
  console.log('Auth: OK\n');
} catch (e) {
  console.error('Auth: FAIL —', e.message);
  process.exit(1);
}

let passed = 0;
let failed = 0;

for (const { module, sheet, id } of P0_SHEETS) {
  process.stdout.write(`${module} (${sheet}) ... `);
  try {
    const row = rowFor(sheet, id);
    const upsert = await rpc(token, 'api_upsert', { p_sheet: sheet, p_id: id, p_data: row });
    if (upsert && upsert.success === false) throw new Error(upsert.message || 'upsert failed');
    const rows = await rpc(token, 'api_read_sheet', { p_sheet: sheet });
    const arr = Array.isArray(rows) ? rows : (rows?.data || []);
    const found = arr.some(r => String(r.id || r.ID) === id);
    if (!found) throw new Error('row not found after upsert');
    await rpc(token, 'api_delete', { p_sheet: sheet, p_id: id });
    console.log('PASS');
    passed++;
  } catch (e) {
    console.log('FAIL —', e.message);
    failed++;
  }
}

console.log(`\nResult: ${passed}/${P0_SHEETS.length} passed`);
if (failed) process.exit(1);
