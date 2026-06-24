/**
 * admin_reset_user_mfa.mjs — remove all TOTP factors for a user (platform admin / recovery).
 *
 * Usage:
 *   node supabase/scripts/admin_reset_user_mfa.mjs user@example.com
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env (never commit).
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const envPath = path.join(root, '.env');
const env = {};

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

const email = process.argv[2] || process.env.MFA_RESET_EMAIL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const cfgText = readFileSync(path.resolve(root, 'frontend/js/saas/saas-config.js'), 'utf8');
const base = cfgText.match(/supabaseUrl:\s*'([^']+)'/)[1].replace(/\/$/, '');

if (!email) {
  console.error('Usage: node supabase/scripts/admin_reset_user_mfa.mjs user@example.com');
  process.exit(1);
}
if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${serviceKey}`,
  apikey: serviceKey,
  'Content-Type': 'application/json'
};

async function adminFetch(pathSuffix, opts = {}) {
  const res = await fetch(`${base}/auth/v1/admin/${pathSuffix}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return data;
}

console.log('=== Admin MFA reset ===');
console.log('Email:', email);

const users = await adminFetch(`users?email=${encodeURIComponent(email)}`);
const user = users?.users?.[0];
if (!user?.id) {
  console.error('User not found');
  process.exit(1);
}

console.log('User ID:', user.id);

const factorsResp = await adminFetch(`users/${user.id}/factors`);
const list = factorsResp?.factors || factorsResp || [];
console.log('Factors found:', list.length);

if (!list.length) {
  console.log('No MFA factors — nothing to reset.');
  process.exit(0);
}

for (const f of list) {
  await adminFetch(`users/${user.id}/factors/${f.id}`, { method: 'DELETE' });
  console.log(`Removed factor ${f.id} (${f.factor_type || f.type}, ${f.status})`);
}

console.log('\nMFA reset complete. User can enroll again at /mfa-setup');
