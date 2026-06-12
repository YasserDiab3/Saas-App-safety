/**
 * security_smoke.mjs — post-0019 RPC security checks.
 * Usage: node supabase/scripts/security_smoke.mjs
 */
import { loadConfig, loadSmokeCredentials, auth, rpc } from './smoke-lib.mjs';

const { base, anon } = loadConfig();
const creds = loadSmokeCredentials();

if (!creds) {
  console.error('Set SMOKE_EMAIL/SMOKE_PASSWORD or create .smoke-credentials.json');
  process.exit(2);
}

console.log('=== Security Smoke (0019) ===\n');

const token = await auth(base, anon, creds.email, creds.password);
console.log('Auth: OK\n');

const tests = [];

const bill = await rpc(base, anon, token, 'api_billing_status', {}, { raw: true });
tests.push({
  name: 'api_billing_status (owner)',
  ok: bill.status === 200,
  detail: String(bill.status)
});

const apply = await rpc(base, anon, token, 'apply_subscription', {
  p_customer_id: 'cus_test',
  p_subscription_id: 'sub_test',
  p_plan_id: 'pro',
  p_status: 'active',
  p_period_end: new Date().toISOString(),
  p_cancel_at_period_end: false
}, { raw: true });
tests.push({
  name: 'apply_subscription blocked (authenticated)',
  ok: apply.status === 401 || apply.status === 403 || /permission|denied|forbidden/i.test(apply.text),
  detail: `${apply.status} ${apply.text.slice(0, 80)}`
});

const stripe = await rpc(base, anon, token, 'api_set_stripe_customer', { p_customer_id: 'bad-id' }, { raw: true });
tests.push({
  name: 'api_set_stripe_customer rejects invalid id',
  ok: stripe.status >= 400,
  detail: String(stripe.status)
});

const anonApply = await rpc(base, anon, null, 'apply_subscription', {
  p_customer_id: 'cus_x',
  p_subscription_id: 'sub_x',
  p_plan_id: 'pro',
  p_status: 'active',
  p_period_end: new Date().toISOString(),
  p_cancel_at_period_end: false
}, { raw: true });
tests.push({
  name: 'apply_subscription blocked (anon)',
  ok: anonApply.status === 401 || anonApply.status === 403 || /permission|denied/i.test(anonApply.text),
  detail: String(anonApply.status)
});

let passed = 0;
for (const t of tests) {
  console.log(`${t.ok ? 'PASS' : 'FAIL'} — ${t.name} (${t.detail})`);
  if (t.ok) passed++;
}
console.log(`\nResult: ${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
