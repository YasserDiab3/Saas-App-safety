/**
 * verify_stripe_setup.mjs — checks Stripe-related Supabase secrets and functions.
 * Usage: node supabase/scripts/verify_stripe_setup.mjs
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfgText = readFileSync(path.resolve(__dirname, '../../frontend/js/saas/saas-config.js'), 'utf8');
const BASE = cfgText.match(/supabaseUrl:\s*'([^']+)'/)[1].replace(/\/$/, '');
const ANON = cfgText.match(/supabaseAnonKey:\s*'([^']+)'/)[1];

const REQUIRED_SECRETS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_PRO',
  'STRIPE_PRICE_ENTERPRISE',
  'APP_URL'
];

function listSecrets() {
  try {
    const out = execSync('supabase secrets list', { encoding: 'utf8', cwd: path.resolve(__dirname, '../..') });
    return out;
  } catch (e) {
    console.error('Run from linked project: supabase link --project-ref tbkajjarkqhsdiabufjv');
    process.exit(1);
  }
}

console.log('=== Stripe setup verification ===\n');

const secretList = listSecrets();
let missing = 0;
console.log('Supabase secrets:');
for (const name of REQUIRED_SECRETS) {
  const ok = secretList.includes(name);
  console.log(`  [${ok ? 'OK' : 'MISSING'}] ${name}`);
  if (!ok) missing++;
}

console.log('\nEdge Functions (HTTP probe):');
for (const fn of ['create-checkout', 'stripe-webhook']) {
  const res = await fetch(`${BASE}/functions/v1/${fn}`, { method: 'OPTIONS' });
  const ok = res.status !== 404;
  console.log(`  [${ok ? 'OK' : 'MISSING'}] ${fn} (HTTP ${res.status})`);
  if (!ok) missing++;
}

console.log('\nWebhook URL (add in Stripe Dashboard if not done):');
console.log(`  ${BASE}/functions/v1/stripe-webhook`);

console.log('\nBilling page:');
console.log(`  ${process.env.APP_URL || '(set APP_URL in .env)'}/billing.html`);

if (missing) {
  console.error(`\n${missing} check(s) failed. See docs/STRIPE_SETUP.md`);
  process.exit(1);
}
console.log('\nAll Stripe secrets present and functions reachable.');
console.log('Run sync_stripe_prices.sql then test checkout on billing.html.');
