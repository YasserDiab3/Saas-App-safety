/**
 * sync_billing_from_stripe.mjs — repair tenant plan from Stripe after successful checkout.
 * Usage: node supabase/scripts/sync_billing_from_stripe.mjs [stripe_customer_id]
 */
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = {};
if (existsSync(path.join(root, '.env'))) {
  for (const line of readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

const customerId = process.argv[2] || 'cus_UgsWGqZjjlADEN';
const stripeKey = env.STRIPE_SECRET_KEY;
const token = env.SUPABASE_ACCESS_TOKEN;
if (!stripeKey?.startsWith('sk_') && !stripeKey?.startsWith('rk_')) {
  console.error('Missing STRIPE_SECRET_KEY in .env');
  process.exit(1);
}
if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN in .env');
  process.exit(1);
}

const priceMap = {
  [env.STRIPE_PRICE_PRO]: 'pro',
  [env.STRIPE_PRICE_ENTERPRISE]: 'enterprise'
};

const subsRes = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=all&limit=3`, {
  headers: { Authorization: `Bearer ${stripeKey}` }
});
const subsBody = await subsRes.json();
if (!subsRes.ok) {
  console.error('Stripe error:', subsBody);
  process.exit(1);
}

const sub = subsBody.data?.[0];
if (!sub) {
  console.error('No Stripe subscription found for', customerId);
  process.exit(1);
}

const priceId = sub.items?.data?.[0]?.price?.id;
const planId = priceMap[priceId] || 'free';
const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

console.log('Stripe subscription:', sub.id, 'status:', sub.status, 'price:', priceId, '=> plan:', planId);

const sql = `
select app.apply_subscription(
  '${customer}',
  '${sub.id}',
  '${planId}',
  '${sub.status}',
  ${sub.current_period_end ? `'${new Date(sub.current_period_end * 1000).toISOString()}'` : 'null'},
  ${sub.cancel_at_period_end ? 'true' : 'false'}
);
select t.name, t.plan_id, t.status, t.stripe_customer_id
  from app.tenants t where t.stripe_customer_id = '${customer}';
`;

const dbRes = await fetch('https://api.supabase.com/v1/projects/tbkajjarkqhsdiabufjv/database/query', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql })
});
const dbBody = await dbRes.text();
console.log('DB apply:', dbRes.status, dbBody);
