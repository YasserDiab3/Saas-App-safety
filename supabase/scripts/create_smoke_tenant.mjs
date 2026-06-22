/**
 * create_smoke_tenant.mjs — signup + provision a test tenant for QA.
 * Writes credentials to supabase/scripts/.smoke-credentials.json (gitignored).
 *
 * Usage: node supabase/scripts/create_smoke_tenant.mjs
 * Env:   SMOKE_EMAIL, SMOKE_PASSWORD (optional — auto-generated if omitted)
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfgText = readFileSync(path.resolve(__dirname, '../../frontend/js/saas/saas-config.js'), 'utf8');
const BASE = cfgText.match(/supabaseUrl:\s*'([^']+)'/)[1].replace(/\/$/, '');
const ANON = cfgText.match(/supabaseAnonKey:\s*'([^']+)'/)[1];

const ts = Date.now();
const email = process.env.SMOKE_EMAIL || `smoke-${ts}@hse-saas.test`;
const password = process.env.SMOKE_PASSWORD || `Smoke${ts}!Aa`;
const orgName = process.env.SMOKE_ORG || `Smoke Org ${ts}`;

async function auth(path, body) {
  const res = await fetch(`${BASE}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || JSON.stringify(data));
  return data;
}

async function rpc(token, fn, args) {
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

console.log('Creating smoke tenant...');
console.log('Email:', email);

try {
  try {
    await auth('signup', { email, password, data: { full_name: 'Smoke Tester' } });
    console.log('Signup: OK');
  } catch (e) {
    if (!/already|registered|exists/i.test(String(e.message))) throw e;
    console.log('Signup: user exists, continuing');
  }

  const tok = await auth('token?grant_type=password', { email, password });
  const token = tok.access_token;
  console.log('Signin: OK');

  const prov = await rpc(token, 'api_provision_tenant', {
    p_name: orgName,
    p_phone_country: '+966',
    p_phone_number: '500000000',
    p_terms_version: 'v2026.1'
  });
  console.log('Provision:', prov);

  const credPath = path.join(__dirname, '.smoke-credentials.json');
  const creds = { email, password, orgName, tenant_id: prov?.tenant_id, createdAt: new Date().toISOString() };
  writeFileSync(credPath, JSON.stringify(creds, null, 2), 'utf8');
  console.log('\nCredentials saved:', credPath);
  console.log(JSON.stringify(creds, null, 2));
} catch (e) {
  console.error('FAILED:', e.message);
  process.exit(1);
}
