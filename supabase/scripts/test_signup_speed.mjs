/**
 * test_signup_speed.mjs — diagnose auth signup 504 / SMTP timeout
 */
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const cfg = readFileSync(path.join(root, 'frontend/js/saas/saas-config.js'), 'utf8');
const BASE = cfg.match(/supabaseUrl:\s*'([^']+)'/)[1].replace(/\/$/, '');
const ANON = cfg.match(/supabaseAnonKey:\s*'([^']+)'/)[1];

const keys = JSON.parse(
  execSync('supabase projects api-keys --project-ref tbkajjarkqhsdiabufjv -o json', { encoding: 'utf8' })
);
const SR = keys.find((k) => k.name === 'service_role')?.api_key;

async function timed(label, fn) {
  const t = Date.now();
  try {
    const out = await fn();
    console.log(`OK  ${label} — ${Date.now() - t}ms`, typeof out === 'string' ? out.slice(0, 120) : JSON.stringify(out).slice(0, 120));
    return out;
  } catch (e) {
    console.log(`FAIL ${label} — ${Date.now() - t}ms`, e.message);
    throw e;
  }
}

const email = `diag-${Date.now()}@hse-saas.test`;

await timed('public signup', async () => {
  const res = await fetch(`${BASE}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass123!', data: { full_name: 'Diag' } })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text;
}).catch(() => console.log('(signup failed — likely SMTP timeout)\n'));

await timed('admin create (no signup email)', async () => {
  const email2 = `adm-${Date.now()}@hse-saas.test`;
  const res = await fetch(`${BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email2,
      password: 'TestPass123!',
      email_confirm: true,
      user_metadata: { full_name: 'Admin Diag' }
    })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text;
});
