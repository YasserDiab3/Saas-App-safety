/**
 * setup_production_remaining.mjs — platform admin, auth URLs, SMTP, Stripe.
 *
 * Usage:
 *   node supabase/scripts/setup_production_remaining.mjs
 *
 * Optional env (or .env in repo root):
 *   PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD, PLATFORM_ORG_NAME
 *   SUPABASE_ACCESS_TOKEN — Management API (dashboard account token)
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SENDER_NAME
 *   STRIPE_* — see .env.example
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const PROJECT_REF = 'tbkajjarkqhsdiabufjv';

function loadDotEnv() {
  const envPath = path.join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined && process.env[m[1]] !== '') continue;
    process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

loadDotEnv();

const cfgText = readFileSync(path.resolve(root, 'frontend/js/saas/saas-config.js'), 'utf8');
const BASE = cfgText.match(/supabaseUrl:\s*'([^']+)'/)[1].replace(/\/$/, '');
const ANON = cfgText.match(/supabaseAnonKey:\s*'([^']+)'/)[1];
const APP_URL = (process.env.APP_URL || 'https://saas-app-safety.vercel.app').replace(/\/$/, '');

const ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL || 'Yasser@qhsseconsultant.onmicrosoft.com';
const ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD || 'QhsseAdmin2026!Aa9';
const ORG_NAME = process.env.PLATFORM_ORG_NAME || 'QHSSE Consultant';

function serviceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const out = execSync(`supabase projects api-keys --project-ref ${PROJECT_REF} -o json`, {
    cwd: root,
    encoding: 'utf8'
  });
  const keys = JSON.parse(out);
  const row = keys.find((k) => k.id === 'service_role' || k.name === 'service_role');
  if (!row?.api_key) throw new Error('Could not load service_role key from Supabase CLI');
  return row.api_key;
}

async function adminFetch(sr, pathSuffix, options = {}) {
  const res = await fetch(`${BASE}/auth/v1/admin/${pathSuffix}`, {
    ...options,
    headers: {
      apikey: sr,
      Authorization: `Bearer ${sr}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { res, data };
}

async function findUserByEmail(sr, email) {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 200;
  while (page <= 20) {
    const { res, data } = await adminFetch(sr, `users?page=${page}&per_page=${perPage}`);
    if (!res.ok) throw new Error(`List users failed: ${res.status} ${JSON.stringify(data)}`);
    const users = data?.users || [];
    const hit = users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function ensurePlatformAdminUser(sr) {
  console.log('\n=== 1) Platform admin user ===');
  console.log('Email:', ADMIN_EMAIL);

  let user = await findUserByEmail(sr, ADMIN_EMAIL);

  if (!user) {
    const created = await adminFetch(sr, 'users', {
      method: 'POST',
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: 'Yasser Diab' }
      })
    });
    if (!created.res.ok && !/already|registered|exists/i.test(JSON.stringify(created.data))) {
      throw new Error(`Create user failed: ${created.res.status} ${JSON.stringify(created.data)}`);
    }
    user = created.res.ok ? created.data : await findUserByEmail(sr, ADMIN_EMAIL);
    if (!user) throw new Error('User not found after create attempt');
    console.log('Created auth user:', user.id);
  } else {
    console.log('User exists:', user.id);
    const updated = await adminFetch(sr, `users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify({ email_confirm: true, password: ADMIN_PASSWORD })
    });
    if (!updated.res.ok) {
      throw new Error(`Update user failed: ${updated.res.status} ${JSON.stringify(updated.data)}`);
    }
    console.log('Updated password + confirmed email');
  }

  const credPath = path.join(__dirname, '.platform-admin-credentials.json');
  writeFileSync(credPath, JSON.stringify({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    user_id: user.id,
    updatedAt: new Date().toISOString()
  }, null, 2), 'utf8');
  console.log('Credentials saved:', credPath);

  const signIn = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  const tok = await signIn.json();
  if (!signIn.ok) throw new Error(`Sign-in failed: ${JSON.stringify(tok)}`);

  const meRes = await fetch(`${BASE}/rest/v1/rpc/api_me`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${tok.access_token}`,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  const me = await meRes.json();
  if (!me?.tenant_id) {
    const prov = await fetch(`${BASE}/rest/v1/rpc/api_provision_tenant`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${tok.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_name: ORG_NAME })
    });
    const provBody = await prov.text();
    console.log('Provision tenant:', prov.status, provBody);
  } else {
    console.log('Tenant already linked:', me.tenant_id);
  }

  return user.id;
}

async function setPlatformAdminFlag() {
  console.log('\n=== 2) Verify platform admin RPC ===');
  const signIn = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  const tok = await signIn.json();
  const plans = await fetch(`${BASE}/rest/v1/rpc/api_admin_list_plans`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${tok.access_token}`,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  const plansText = await plans.text();
  if (plans.status !== 200) {
    throw new Error(`Platform admin check failed (${plans.status}): ${plansText}`);
  }
  console.log('api_admin_list_plans: OK');
}

async function configureAuthUrlsAndSmtp() {
  console.log('\n=== 3) Auth URLs + SMTP + confirm email ===');
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.log('SKIP — set SUPABASE_ACCESS_TOKEN in .env (https://supabase.com/dashboard/account/tokens)');
    return false;
  }

  const payload = {
    site_url: APP_URL,
    uri_allow_list: `${APP_URL}/**,${APP_URL}/login,${APP_URL}/signup,http://localhost:3000/**`,
    mailer_autoconfirm: false,
    external_email_enabled: true
  };

  const smtpHost = process.env.SMTP_HOST || 'smtp.office365.com';
  const smtpUser = process.env.SMTP_USER || ADMIN_EMAIL;
  const smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  if (smtpPass) {
    Object.assign(payload, {
      smtp_host: smtpHost,
      smtp_port: String(process.env.SMTP_PORT || 587),
      smtp_user: smtpUser,
      smtp_pass: smtpPass,
      smtp_admin_email: process.env.SMTP_ADMIN_EMAIL || ADMIN_EMAIL,
      smtp_sender_name: process.env.SMTP_SENDER_NAME || 'Safety App'
    });
  } else {
    console.log('SKIP SMTP — set SMTP_PASS in .env (M365 app password)');
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Auth config PATCH failed: ${res.status} ${body}`);
  console.log('Auth config updated (site_url, redirects' + (smtpPass ? ', SMTP' : '') + ')');
  return true;
}

async function configureStripe() {
  console.log('\n=== 4) Stripe secrets + plan price IDs ===');
  const required = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_PRO', 'STRIPE_PRICE_ENTERPRISE'];
  const missing = required.filter((k) => !process.env[k] || /XXXX|REPLACE|YOUR_/.test(process.env[k]));
  if (missing.length) {
    console.log('SKIP — missing in .env:', missing.join(', '));
    return false;
  }

  execSync(
    [
      'supabase', 'secrets', 'set',
      `STRIPE_SECRET_KEY=${process.env.STRIPE_SECRET_KEY}`,
      `STRIPE_WEBHOOK_SECRET=${process.env.STRIPE_WEBHOOK_SECRET}`,
      `STRIPE_PRICE_PRO=${process.env.STRIPE_PRICE_PRO}`,
      `STRIPE_PRICE_ENTERPRISE=${process.env.STRIPE_PRICE_ENTERPRISE}`,
      `APP_URL=${APP_URL}`
    ].join(' '),
    { cwd: root, stdio: 'inherit', shell: true }
  );

  execSync('node supabase/scripts/sync_stripe_prices_from_env.mjs', { cwd: root, stdio: 'inherit' });
  console.log('Stripe secrets + app.plans price_id updated');
  return true;
}

async function main() {
  console.log('=== HSE SaaS — remaining production setup ===');
  const sr = serviceRoleKey();
  await ensurePlatformAdminUser(sr);
  await setPlatformAdminFlag();
  await configureAuthUrlsAndSmtp();
  await configureStripe();
  console.log('\nDone. Run: node supabase/scripts/production_launch.mjs');
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
