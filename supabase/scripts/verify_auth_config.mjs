/**
 * verify_auth_config.mjs — read Auth/SMTP config via Management API (no secrets printed).
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
  console.error('Missing SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const res = await fetch('https://api.supabase.com/v1/projects/tbkajjarkqhsdiabufjv/config/auth', {
  headers: { Authorization: `Bearer ${token}` }
});
const cfg = await res.json();
if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(cfg)}`);

const smtpOk = Boolean(cfg.smtp_host && cfg.smtp_user && cfg.smtp_admin_email);
console.log('=== Auth config verification ===\n');
console.log(`  [${cfg.site_url ? 'OK' : 'MISSING'}] site_url: ${cfg.site_url || '(none)'}`);
console.log(`  [${cfg.mailer_autoconfirm === false ? 'OK' : 'WARN'}] mailer_autoconfirm: ${cfg.mailer_autoconfirm}`);
console.log(`  [${cfg.external_email_enabled ? 'OK' : 'WARN'}] external_email_enabled: ${cfg.external_email_enabled}`);
console.log(`  [${smtpOk ? 'OK' : 'MISSING'}] SMTP host: ${cfg.smtp_host || '(none)'}`);
console.log(`  [${cfg.smtp_user ? 'OK' : 'MISSING'}] SMTP user: ${cfg.smtp_user || '(none)'}`);
console.log(`  [${cfg.smtp_admin_email ? 'OK' : 'MISSING'}] sender: ${cfg.smtp_admin_email || '(none)'}`);
console.log(`  [${cfg.smtp_pass ? 'OK' : 'MISSING'}] smtp_pass configured on server`);

const localSmtp = Boolean(env.SMTP_PASS);
console.log(`  [${localSmtp ? 'OK' : 'EMPTY'}] SMTP_PASS in .env`);

if (!cfg.smtp_pass || !smtpOk) {
  console.error('\nSMTP not active on Supabase — run: node supabase/scripts/setup_production_remaining.mjs');
  process.exit(1);
}
console.log('\nAuth/SMTP checks passed.');
