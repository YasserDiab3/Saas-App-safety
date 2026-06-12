/**
 * production_launch.mjs — automated production readiness runner.
 * Usage: node supabase/scripts/production_launch.mjs
 */
import { execSync, spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const APP_URL = process.env.APP_URL || 'https://saas-app-safety.vercel.app';

function sh(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8' });
}

async function main() {
  console.log('=== HSE SaaS Production Launch ===\n');
  const report = [];

  async function check(name, fn, optional = false) {
    process.stdout.write(`▶ ${name}... `);
    try {
      const detail = await fn();
      report.push({ name, ok: true, optional });
      console.log('OK', detail != null ? `(${detail})` : '');
    } catch (e) {
      report.push({ name, ok: false, optional, error: e.message });
      console.log(optional ? 'SKIP —' : 'FAIL —', e.message);
    }
  }

  await check('Supabase migrations 0001–0012', () => {
    const out = sh('supabase migration list');
    if (!/0011\s+\|\s+0011/.test(out)) throw new Error('run: supabase db push');
    if (!/0012\s+\|\s+0012/.test(out)) throw new Error('run: supabase db push (0012 storage)');
    return 'synced';
  });

  await check('RPC verification', () => {
    sh('node supabase/scripts/verify_migrations.mjs');
    return '11 RPCs';
  });

  await check('Vercel /health', async () => {
    const res = await fetch(`${APP_URL}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.status;
  });

  await check('Vercel /login', async () => {
    const res = await fetch(`${APP_URL}/login`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.status;
  });

  await check('Edge Functions', () => {
    const out = sh('supabase functions list');
    if (!out.includes('create-checkout') || !out.includes('stripe-webhook')) {
      throw new Error('deploy stripe functions');
    }
    return '2 active';
  });

  await check('Stripe secrets', () => {
    const out = sh('supabase secrets list');
    const missing = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_PRO', 'APP_URL']
      .filter(k => !out.includes(k));
    if (missing.length) throw new Error(`missing: ${missing.join(', ')}`);
    return 'configured';
  }, true);

  await check('Smoke tenant + P0 modules', () => {
    const credPath = path.join(__dirname, '.smoke-credentials.json');
    if (!existsSync(credPath)) sh('node supabase/scripts/create_smoke_tenant.mjs');
    const creds = JSON.parse(readFileSync(credPath, 'utf8'));
    const r = spawnSync('node', ['supabase/scripts/p0_module_smoke.mjs'], {
      cwd: root,
      env: { ...process.env, SMOKE_EMAIL: creds.email, SMOKE_PASSWORD: creds.password },
      encoding: 'utf8'
    });
    if (r.status !== 0) throw new Error((r.stdout || '') + (r.stderr || 'p0 failed'));
    return creds.email;
  });

  const required = report.filter(r => !r.optional);
  const passed = required.filter(r => r.ok).length;
  console.log(`\n=== ${passed}/${required.length} required checks passed ===`);

  console.log('\nManual steps (Dashboard):');
  [
    'Supabase → Auth → enable Confirm email + SMTP',
    'Run set_platform_admin.sql with your email',
    'Stripe: .env + set-stripe-secrets.ps1 + sync_stripe_prices.sql',
    'docs/SUPABASE_MODULE_TEST_CHECKLIST.md — full QA'
  ].forEach((m, i) => console.log(`  ${i + 1}. ${m}`));

  const failed = required.filter(r => !r.ok);
  process.exit(failed.length ? 1 : 0);
}

main();
