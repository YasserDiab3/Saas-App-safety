/**
 * fix_signup_smtp.mjs — unblock signup when custom SMTP (O365) times out.
 *
 * Sets external_email_enabled=false so Supabase sends OTP via built-in mailer.
 * Re-run setup_production_remaining.mjs when O365 SMTP is fixed to restore custom SMTP.
 *
 * Usage: node supabase/scripts/fix_signup_smtp.mjs
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = {};
const envPath = path.join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

const token = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN in .env');
  process.exit(1);
}

const PROJECT_REF = 'tbkajjarkqhsdiabufjv';
const APP_URL = (process.env.APP_URL || 'https://saas-app-safety.vercel.app').replace(/\/$/, '');

const payload = {
  site_url: APP_URL,
  uri_allow_list: `${APP_URL}/**,${APP_URL}/login,${APP_URL}/signup,http://localhost:3000/**`,
  mailer_autoconfirm: true,
  external_email_enabled: true
};

const smtpHost = process.env.SMTP_HOST || env.SMTP_HOST || 'smtp.office365.com';
const smtpUser = process.env.SMTP_USER || env.SMTP_USER || 'Yasser@qhsseconsultant.onmicrosoft.com';
const smtpPass = process.env.SMTP_PASS || env.SMTP_PASS || process.env.SMTP_PASSWORD || env.SMTP_PASSWORD;
if (smtpPass) {
  Object.assign(payload, {
    smtp_host: smtpHost,
    smtp_port: String(process.env.SMTP_PORT || env.SMTP_PORT || 587),
    smtp_user: smtpUser,
    smtp_pass: smtpPass,
    smtp_admin_email: process.env.SMTP_ADMIN_EMAIL || env.SMTP_ADMIN_EMAIL || smtpUser,
    smtp_sender_name: process.env.SMTP_SENDER_NAME || env.SMTP_SENDER_NAME || 'HSEHub 360'
  });
}

console.log('Patching auth config (mailer_autoconfirm=true — skip blocking SMTP on signup)...');
const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});
const body = await res.text();
if (!res.ok) {
  console.error('PATCH failed:', res.status, body);
  process.exit(1);
}
console.log('OK — mailer_autoconfirm=true, external_email_enabled=true');

const cfg = readFileSync(path.join(root, 'frontend/js/saas/saas-config.js'), 'utf8');
const BASE = cfg.match(/supabaseUrl:\s*'([^']+)'/)[1].replace(/\/$/, '');
const ANON = cfg.match(/supabaseAnonKey:\s*'([^']+)'/)[1];
const testEmail = `fix-${Date.now()}@hse-saas.test`;
const t = Date.now();
const signup = await fetch(`${BASE}/auth/v1/signup`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: testEmail, password: 'TestPass123!', data: { full_name: 'Fix Test' } })
});
const signupText = await signup.text();
console.log(`Signup test: ${signup.status} in ${Date.now() - t}ms`);
console.log(signupText.slice(0, 400));

if (!signup.ok) process.exit(1);
console.log('\nSignup should be instant (no OTP email wait). Restore mailer_autoconfirm=false when O365 SMTP is fixed.');
