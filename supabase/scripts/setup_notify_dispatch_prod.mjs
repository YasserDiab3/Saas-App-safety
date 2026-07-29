/**
 * setup_notify_dispatch_prod.mjs
 * Sets Edge secrets (SMTP/CRON) from .env and verifies notify-dispatch.
 *
 * Usage: node supabase/scripts/setup_notify_dispatch_prod.mjs
 * Never prints secret values.
 */
import { execSync } from 'child_process';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const PROJECT_REF = 'tbkajjarkqhsdiabufjv';
const FN_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/notify-dispatch`;

function loadDotEnv() {
  const envPath = path.join(root, '.env');
  if (!existsSync(envPath)) return false;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined && process.env[m[1]] !== '') continue;
    process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return true;
}

function mask(v) {
  if (!v) return 'MISSING';
  return `SET(len=${String(v).length})`;
}

function run(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

loadDotEnv();

const smtpHost = process.env.SMTP_HOST || 'smtp.office365.com';
const smtpPort = process.env.SMTP_PORT || '587';
const smtpUser = process.env.SMTP_USER || process.env.SMTP_ADMIN_EMAIL || '';
const smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '';
const smtpSender = process.env.SMTP_SENDER_NAME || 'HSEHub 360';
const appUrl = process.env.APP_URL || 'https://saas-app-safety.vercel.app';

let cronSecret = process.env.CRON_SECRET || '';
const cronFile = path.join(__dirname, '.cron-secret.local');
if (!cronSecret && existsSync(cronFile)) {
  cronSecret = readFileSync(cronFile, 'utf8').trim();
}
if (!cronSecret) {
  cronSecret = randomBytes(32).toString('hex');
  writeFileSync(cronFile, cronSecret + '\n', { mode: 0o600 });
  console.log('Generated CRON_SECRET → supabase/scripts/.cron-secret.local (gitignored)');
}

console.log('=== notify-dispatch production setup ===');
console.log('SMTP_HOST:', mask(smtpHost), smtpHost ? `(${smtpHost})` : '');
console.log('SMTP_USER:', mask(smtpUser));
console.log('SMTP_PASS:', mask(smtpPass));
console.log('SMTP_PORT:', smtpPort);
console.log('CRON_SECRET:', mask(cronSecret));
console.log('APP_URL:', appUrl);

if (!smtpUser || !smtpPass) {
  console.error('\nFAIL: SMTP_USER / SMTP_PASS missing in .env — cannot enable live email.');
  console.error('Add M365 app password to .env then re-run.');
  process.exit(2);
}

const pairs = [
  `SMTP_HOST=${smtpHost}`,
  `SMTP_PORT=${smtpPort}`,
  `SMTP_USER=${smtpUser}`,
  `SMTP_PASS=${smtpPass}`,
  `SMTP_SENDER_NAME=${smtpSender}`,
  `CRON_SECRET=${cronSecret}`,
  `APP_URL=${appUrl}`
];

// Optional WhatsApp
if (process.env.WA_PHONE_NUMBER_ID && process.env.WA_ACCESS_TOKEN) {
  pairs.push(`WA_PHONE_NUMBER_ID=${process.env.WA_PHONE_NUMBER_ID}`);
  pairs.push(`WA_ACCESS_TOKEN=${process.env.WA_ACCESS_TOKEN}`);
  if (process.env.WA_DEFAULT_TO) pairs.push(`WA_DEFAULT_TO=${process.env.WA_DEFAULT_TO}`);
  console.log('WhatsApp secrets: will set');
} else {
  console.log('WhatsApp secrets: skip (optional)');
}

console.log('\nSetting Edge Function secrets…');
const envFile = path.join(__dirname, '.notify-secrets.env.tmp');
writeFileSync(envFile, pairs.join('\n') + '\n', { mode: 0o600 });
try {
  run(`npx supabase secrets set --env-file "${envFile}" --project-ref ${PROJECT_REF}`);
  console.log('Secrets set: OK');
} finally {
  try { writeFileSync(envFile, ''); } catch (_e) { /* ignore */ }
  try { execSync(`del /f /q "${envFile}"`, { shell: 'cmd.exe', stdio: 'ignore' }); } catch (_e) {
    try { execSync(`rm -f "${envFile}"`, { stdio: 'ignore' }); } catch (_e2) { /* ignore */ }
  }
}

// Persist cron secret for migration helper (name only in vault via SQL later)
writeFileSync(path.join(__dirname, '.cron-secret.local'), cronSecret + '\n', { mode: 0o600 });

console.log('\nSmoke invoke notify-dispatch…');
const res = await fetch(FN_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-cron-secret': cronSecret
  },
  body: '{}'
});
const text = await res.text();
console.log('HTTP', res.status, text.slice(0, 400));
if (!res.ok) {
  console.error('FAIL: notify-dispatch invoke failed');
  process.exit(1);
}
console.log('\nOK — secrets live. Next: apply migration 0051 for pg_cron schedule.');
console.log('CRON_SECRET is in supabase/scripts/.cron-secret.local (do not commit).');
