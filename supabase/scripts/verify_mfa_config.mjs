/**
 * verify_mfa_config.mjs — confirm Supabase Auth MFA (TOTP) is enabled for the project.
 * Requires SUPABASE_ACCESS_TOKEN in .env (Management API).
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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

const token = env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN in .env');
  process.exit(1);
}

const ref = 'tbkajjarkqhsdiabufjv';
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  headers: { Authorization: `Bearer ${token}` }
});
const cfg = await res.json();
if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(cfg)}`);

console.log('=== MFA config verification ===\n');

const mfaKeys = Object.keys(cfg).filter(k => /mfa|totp|aal/i.test(k));
for (const k of mfaKeys.sort()) {
  console.log(`  ${k}: ${JSON.stringify(cfg[k])}`);
}

const verifyDisabled = cfg.mfa_max_enrolled_factors === 0
  || cfg.mfa_totp_verify_disabled === true
  || cfg.mfa_phone_verify_disabled === true && cfg.mfa_totp_verify_disabled === true;

if (verifyDisabled) {
  console.error('\nMFA appears disabled or verification blocked — enable TOTP in Supabase Dashboard → Authentication → MFA.');
  process.exit(1);
}

console.log('\nMFA checks passed (TOTP available; enroll users via /mfa-setup.html after login).');
