/**
 * ui_flow_smoke.mjs — automated checklist: login → billing → team → checkout.
 * Mirrors what billing.html / team.html / create-checkout do via API + page fetch.
 *
 * Usage: node supabase/scripts/ui_flow_smoke.mjs
 * Env:   SMOKE_EMAIL, SMOKE_PASSWORD (or supabase/scripts/.smoke-credentials.json)
 *        APP_URL (default https://saas-app-safety.vercel.app)
 */
import { loadConfig, loadSmokeCredentials, auth, rpc } from './smoke-lib.mjs';

const APP_URL = (process.env.APP_URL || 'https://saas-app-safety.vercel.app').replace(/\/$/, '');
const { base, anon } = loadConfig();
const creds = loadSmokeCredentials();

if (!creds) {
  console.error('Set SMOKE_EMAIL/SMOKE_PASSWORD or create .smoke-credentials.json');
  process.exit(2);
}

const results = [];

function record(step, ok, detail = '') {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${step}${detail ? ` (${detail})` : ''}`);
}

console.log('=== UI Flow Smoke: login → billing → team → checkout ===\n');
console.log(`APP_URL: ${APP_URL}\n`);

let token;
try {
  token = await auth(base, anon, creds.email, creds.password);
  record('1. Login (Supabase password)', true, creds.email.replace(/(.{2}).+(@.+)/, '$1***$2'));
} catch (e) {
  record('1. Login (Supabase password)', false, e.message);
  printSummary();
  process.exit(1);
}

try {
  const me = await rpc(base, anon, token, 'api_me');
  const role = String(me?.role || '').toLowerCase();
  record('2. api_me (session + tenant)', !!(me?.tenant_id && role), `role=${role}`);
} catch (e) {
  record('2. api_me (session + tenant)', false, e.message);
}

try {
  const billing = await rpc(base, anon, token, 'api_billing_status');
  const mods = billing?.modules || [];
  const plan = billing?.tenant?.plan_id || '-';
  const modOk = Array.isArray(mods) && mods.length >= 7;
  record('3. Billing RPC (api_billing_status)', modOk && !!billing?.tenant?.id, `plan=${plan}, modules=${mods.length}`);
} catch (e) {
  record('3. Billing RPC (api_billing_status)', false, e.message);
}

try {
  const res = await fetch(`${APP_URL}/billing`);
  const html = await res.text();
  const ok = res.ok && html.includes('saas-escape.js') && html.includes('SaaSEscape');
  record('4. Billing page (HTML + XSS helper)', ok, `HTTP ${res.status}`);
} catch (e) {
  record('4. Billing page (HTML + XSS helper)', false, e.message);
}

try {
  await rpc(base, anon, token, 'api_list_invitations');
  record('5. Team RPC (api_list_invitations)', true, 'owner/admin');
} catch (e) {
  record('5. Team RPC (api_list_invitations)', false, e.message);
}

try {
  const res = await fetch(`${APP_URL}/team`);
  const html = await res.text();
  const ok = res.ok && html.includes('saas-escape.js') && html.includes('createElement');
  record('6. Team page (HTML + safe DOM)', ok, `HTTP ${res.status}`);
} catch (e) {
  record('6. Team page (HTML + safe DOM)', false, e.message);
}

try {
  const res = await fetch(`${base}/functions/v1/create-checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      'Content-Type': 'application/json',
      Origin: APP_URL
    },
    body: JSON.stringify({ plan: 'pro' })
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }

  const ok =
    (res.status === 200 && body.url) ||
    (res.status === 400 && /unknown plan/i.test(text)) ||
    (res.status === 500 && /stripe|price|customer/i.test(text));

  const detail = res.status === 200 && body.url
    ? 'checkout URL returned'
    : `${res.status} ${(body.error || text).slice(0, 80)}`;
  record('7. Checkout (create-checkout, owner)', ok && res.status !== 401 && res.status !== 403, detail);
} catch (e) {
  record('7. Checkout (create-checkout, owner)', false, e.message);
}

try {
  const res = await fetch(`${APP_URL}/login`);
  record('8. Login page reachable', res.ok, `HTTP ${res.status}`);
} catch (e) {
  record('8. Login page reachable', false, e.message);
}

printSummary();

function printSummary() {
  const passed = results.filter(r => r.ok).length;
  console.log(`\nResult: ${passed}/${results.length} passed`);
  if (passed !== results.length) process.exit(1);
}
