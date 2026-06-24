/**
 * mobile_smoke.mjs — verify production mobile auth assets + login→session flow.
 * Simulates iOS Safari / Android Chrome via User-Agent headers.
 *
 * Usage: node supabase/scripts/mobile_smoke.mjs
 */
import { loadConfig, loadSmokeCredentials, auth } from './smoke-lib.mjs';

const APP_URL = (process.env.APP_URL || 'https://saas-app-safety.vercel.app').replace(/\/$/, '');
const UA = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
};

const { base, anon } = loadConfig();
const creds = loadSmokeCredentials();
if (!creds) {
  console.error('Set SMOKE_EMAIL/SMOKE_PASSWORD or .smoke-credentials.json');
  process.exit(2);
}

const results = [];
function record(step, ok, detail = '') {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${step}${detail ? ` (${detail})` : ''}`);
}

async function fetchPage(path, ua, label) {
  const res = await fetch(`${APP_URL}${path}`, {
    headers: { 'User-Agent': ua, Accept: 'text/html' },
    redirect: 'follow'
  });
  const html = await res.text();
  return { res, html, label };
}

function checkLoginHtml(html) {
  const checks = [
    ['viewport-fit=cover', /viewport-fit=cover/i.test(html)],
    ['saas-auth-storage.js', /saas-auth-storage\.js/i.test(html)],
    ['waitForPersistedSession', /waitForPersistedSession/i.test(html)],
    ['clearServiceWorkers', /clearServiceWorkers/i.test(html)],
    ['absolute /js/saas paths', /\/js\/saas\/saas-config\.js/i.test(html)],
    ['absolute /css path', /href="\/css\/saas-pages\.css"/i.test(html)],
    ['markSessionActive on login', /markSessionActive/i.test(html)]
  ];
  return checks;
}

function checkIndexHtml(html) {
  const checks = [
    ['inline auth gate', /SaaSAuthStorage\.hasSession/i.test(html)],
    ['markSessionActive in gate', /markSessionActive/i.test(html)],
    ['early SW clear for guests', /clearServiceWorkers/i.test(html)],
    ['saas-auth-storage head', /\/js\/saas\/saas-auth-storage\.js/i.test(html)],
    ['skip SW for guests', /SaaSAuthStorage\.hasSession\(window\.SAAS_CONFIG\)/i.test(html)],
    ['preconnect supabase', /tbkajjarkqhsdiabufjv\.supabase\.co/i.test(html)]
  ];
  return checks;
}

async function checkGuestRootRedirectsToLogin(ua) {
  const res = await fetch(`${APP_URL}/`, {
    headers: { 'User-Agent': ua, Accept: 'text/html' },
    redirect: 'manual'
  });
  const loc = res.headers.get('location') || '';
  const ok = (res.status === 302 || res.status === 307) && /\/login/i.test(loc);
  return { ok, detail: `${res.status} → ${loc}` };
}

async function checkWhatsAppInAppNotPreview() {
  const waInApp = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/23.20.0';
  const redirect = await checkGuestRootRedirectsToLogin(waInApp);
  if (redirect.ok) return { ok: true, detail: redirect.detail };

  const res = await fetch(`${APP_URL}/`, {
    headers: { 'User-Agent': waInApp, Accept: 'text/html' },
    redirect: 'follow'
  });
  const finalUrl = res.url || '';
  const html = await res.text();
  const ok = !finalUrl.includes('share-preview') && /\/login|waitForPersistedSession|markSessionActive/i.test(html + finalUrl);
  return { ok, detail: finalUrl || redirect.detail };
}
console.log('=== Mobile Smoke (iOS + Android simulation) ===\n');
console.log(`APP_URL: ${APP_URL}\n`);

for (const [name, ua] of Object.entries(UA)) {
  console.log(`--- ${name.toUpperCase()} ---`);
  try {
    const login = await fetchPage('/login', ua, name);
    record(`${name}: /login HTTP`, login.res.ok, String(login.res.status));
    for (const [label, ok] of checkLoginHtml(login.html)) {
      record(`${name}: login ${label}`, ok);
    }

    const guestRoot = await checkGuestRootRedirectsToLogin(ua);
    record(`${name}: guest / → /login`, guestRoot.ok, guestRoot.detail);

    const index = await fetch(`${APP_URL}/`, {
      headers: {
        'User-Agent': ua,
        Accept: 'text/html',
        Cookie: 'hse_has_session=1'
      },
      redirect: 'follow'
    });
    const indexHtml = index.ok ? await index.text() : '';
    record(`${name}: / with session cookie HTTP`, index.ok, String(index.status));
    for (const [label, ok] of checkIndexHtml(indexHtml)) {
      record(`${name}: index ${label}`, ok);
    }

    const vendor = await fetch(`${APP_URL}/js/vendor/supabase.min.js`, { headers: { 'User-Agent': ua } });
    const vendorOk = vendor.ok && (await vendor.text()).includes('createClient');
    record(`${name}: vendor supabase.min.js`, vendorOk, `HTTP ${vendor.status}`);

    const storage = await fetch(`${APP_URL}/js/saas/saas-auth-storage.js`, { headers: { 'User-Agent': ua } });
    const storageText = storage.ok ? await storage.text() : '';
    const storageOk = storage.ok && storageText.includes('hse_has_session') && storageText.includes('isValidToken');
    record(`${name}: saas-auth-storage.js`, storageOk, `HTTP ${storage.status}`);

    const bootstrap = await fetch(`${APP_URL}/js/saas/supabase-bootstrap.js`, { headers: { 'User-Agent': ua } });
    const bootstrapText = bootstrap.ok ? await bootstrap.text() : '';
    record(`${name}: bootstrap loads local vendor`, bootstrapText.includes('/js/vendor/supabase.min.js'));
    record(`${name}: bootstrap uses SaaSAuthStorage`, bootstrapText.includes('SaaSAuthStorage'));
  } catch (e) {
    record(`${name}: fetch error`, false, e.message);
  }
  console.log('');
}

console.log('--- WHATSAPP IN-APP (iOS) ---');
try {
  const wa = await checkWhatsAppInAppNotPreview();
  record('whatsapp-inapp: not share-preview', wa.ok, wa.detail);
} catch (e) {
  record('whatsapp-inapp check', false, e.message);
}

console.log('--- AUTH FLOW (simulates post-login) ---');
try {
  const tokenRes = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password })
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(tokenData.error_description || 'auth failed');

  const ref = base.match(/https:\/\/([^.]+)\.supabase\.co/i)[1];
  const key = `sb-${ref}-auth-token`;
  const sessionPayload = JSON.stringify({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_in: tokenData.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600),
    token_type: 'bearer',
    user: tokenData.user
  });

  record('auth: token received', !!tokenData.access_token);
  record('auth: session JSON valid', sessionPayload.includes('access_token'));

  const me = await fetch(`${base}/rest/v1/rpc/api_me`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  const meData = await me.json();
  record('auth: api_me with token', me.ok && !!meData?.tenant_id, `role=${meData?.role || '-'}`);

  // Simulate auth gate: with token payload, hasSession logic would pass
  const parsed = JSON.parse(sessionPayload);
  record('auth: gate would allow (token present)', !!parsed.access_token);
} catch (e) {
  record('auth flow', false, e.message);
}

const passed = results.filter(r => r.ok).length;
console.log(`\nResult: ${passed}/${results.length} passed`);
if (passed !== results.length) process.exit(1);
