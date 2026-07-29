/**
 * live_capa_email_smoke.mjs — enqueue capa_due + dispatch + verify sent.
 * Usage: node supabase/scripts/live_capa_email_smoke.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { loadConfig, loadSmokeCredentials, auth, rpc } from './smoke-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { base, anon } = loadConfig();
const creds = loadSmokeCredentials();
if (!creds) {
  console.error('Need smoke credentials (.smoke-credentials.json or SMOKE_EMAIL/PASSWORD)');
  process.exit(2);
}

const cronFile = path.join(__dirname, '.cron-secret.local');
const cronSecret = existsSync(cronFile)
  ? readFileSync(cronFile, 'utf8').trim()
  : (process.env.CRON_SECRET || '');
if (!cronSecret) {
  console.error('Missing CRON_SECRET / supabase/scripts/.cron-secret.local');
  process.exit(2);
}

console.log('=== live CAPA email smoke ===\n');
const token = await auth(base, anon, creds.email, creds.password);
console.log('Auth: OK');

const enq = await rpc(base, anon, token, 'api_enqueue_notification', {
  p_event_key: 'capa_due',
  p_title: 'CAPA overdue — live email check',
  p_body: 'HSEHub 360 automated SMTP test for CAPA due (safe to ignore)',
  p_record_id: 'SMOKE-CAPA-EMAIL',
  p_site_id: null,
  p_channels: ['email'],
  p_payload: {
    source: 'live_capa_email_smoke',
    toEmail: creds.email
  }
});
console.log('Enqueue:', JSON.stringify(enq));

const fnUrl = `${base}/functions/v1/notify-dispatch`;
const res = await fetch(fnUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-cron-secret': cronSecret
  },
  body: JSON.stringify({ source: 'live_capa_email_smoke' })
});
const text = await res.text();
console.log('Dispatch HTTP', res.status, text.slice(0, 500));

let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = {};
}

if (!res.ok || parsed.ok !== true) {
  console.error('FAIL: dispatch');
  process.exit(1);
}

const failures = parsed.failures || [];
if (failures.length) {
  console.error('FAIL: dispatch failures:', JSON.stringify(failures));
  process.exit(1);
}

if ((parsed.sent || 0) < 1) {
  console.error(`FAIL: expected sent>=1, got claimed=${parsed.claimed} sent=${parsed.sent}`);
  process.exit(1);
}

console.log(`\nPASS — claimed=${parsed.claimed} sent=${parsed.sent} (SMTP + capa_due path OK)`);
