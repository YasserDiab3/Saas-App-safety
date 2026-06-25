/**
 * cookie_consent_smoke.mjs — verify cookie policy RPC + edge function paths.
 * Usage: node supabase/scripts/cookie_consent_smoke.mjs
 */
import { loadConfig } from './smoke-lib.mjs';

const APP_URL = (process.env.APP_URL || 'https://saas-app-safety.vercel.app').replace(/\/$/, '');
const { base, anon } = loadConfig();
const FN = `${base}/functions/v1/cookie-consent`;

const visitorId = 'smoke-' + crypto.randomUUID();

function record(step, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${step}${detail ? ` (${detail})` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const policyRes = await fetch(`${base}/rest/v1/rpc/api_get_cookie_policy`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: '{}'
  });
  const policy = await policyRes.json();
  record('RPC api_get_cookie_policy', policyRes.ok && policy?.success === true, policy?.version || policyRes.status);

  const getPolicy = await fetch(`${FN}/cookie-policy?lang=ar`, {
    headers: { apikey: anon }
  });
  const gp = await getPolicy.json();
  record('GET /cookie-policy', getPolicy.ok && gp?.success === true, gp?.version || getPolicy.status);

  const post = await fetch(`${FN}/cookie-consent`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visitor_id: visitorId,
      action: 'reject_non_essential',
      categories: { essential: true, functional: false, analytics: false, marketing: false }
    })
  });
  const postBody = await post.json();
  record('POST /cookie-consent (anon)', post.ok && postBody?.success === true, String(postBody?.id || post.status));

  const hist = await fetch(`${FN}/cookie-consent/history?visitor_id=${encodeURIComponent(visitorId)}&limit=5`, {
    headers: { apikey: anon }
  });
  const histBody = await hist.json();
  record('GET /cookie-consent/history (visitor)', hist.ok && Array.isArray(histBody?.items), String(histBody?.items?.length || 0));

  const loginHtml = await fetch(`${APP_URL}/login`, { headers: { Accept: 'text/html' } });
  const html = await loginHtml.text();
  record('login.html loads cookie-consent.js', /saas-cookie-consent\.js/i.test(html));
  record('login.html loads cookie CSS', /saas-cookie-consent\.css/i.test(html));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
