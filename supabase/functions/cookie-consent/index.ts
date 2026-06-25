// ============================================================
// Edge Function: cookie-consent
// GET  /cookie-policy
// POST /cookie-consent
// PUT  /cookie-consent/update
// GET  /cookie-consent/history
// Deploy: supabase functions deploy cookie-consent
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP_URL = (Deno.env.get('APP_URL') ?? 'https://saas-app-safety.vercel.app').replace(/\/$/, '');
const ALLOWED_ORIGINS = new Set([
  APP_URL, 'https://saas-app-safety.vercel.app',
  'http://localhost:3000', 'http://127.0.0.1:3000'
]);

const VALID_ACTIONS = new Set(['accept_all', 'reject_non_essential', 'customize', 'update']);
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const rateMap = new Map<string, { count: number; resetAt: number }>();

function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : APP_URL;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Vary': 'Origin'
  };
}

const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } });

function clientIp(req: Request): string {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return req.headers.get('x-real-ip')
    || req.headers.get('cf-connecting-ip')
    || req.headers.get('x-client-ip')
    || '';
}

function routePath(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const fnIdx = parts.indexOf('cookie-consent');
  if (fnIdx >= 0) return '/' + parts.slice(fnIdx + 1).join('/');
  return url.pathname;
}

function checkRate(key: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now >= entry.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count += 1;
  return true;
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );
}

async function verifyUser(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace('Bearer ', '').trim();
  if (!jwt) return null;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false }
  });
  const { data } = await userClient.auth.getUser();
  return data?.user ?? null;
}

function normalizeCategories(raw: unknown) {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  return {
    essential: true,
    functional: !!o.functional,
    analytics: !!o.analytics,
    marketing: !!o.marketing
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });

  const path = routePath(req);
  const sr = serviceClient();

  if (req.method === 'GET' && (path === '/cookie-policy' || path === 'cookie-policy')) {
    const url = new URL(req.url);
    const { data, error } = await sr.rpc('api_get_cookie_policy');
    if (error) return json(req, { error: error.message }, 400);
    const lang = (url.searchParams.get('lang') || 'ar').toLowerCase().startsWith('en') ? 'en' : 'ar';
    const content = data?.content?.[lang] || data?.content?.ar || {};
    return json(req, { ...data, localized: content, lang });
  }

  if (req.method === 'GET' && (path === '/cookie-consent/history' || path === 'cookie-consent/history')) {
    const url = new URL(req.url);
    const user = await verifyUser(req);
    const visitorId = (url.searchParams.get('visitor_id') || '').trim();
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 100);

    const payload: Record<string, unknown> = { limit };
    if (user) payload.user_id = user.id;
    else if (visitorId) payload.visitor_id = visitorId;
    else return json(req, { error: 'unauthorized' }, 401);

    const { data, error } = await sr.rpc('api_get_cookie_consent_history', { p_payload: payload });
    if (error) return json(req, { error: error.message }, 400);
    return json(req, data);
  }

  if (req.method === 'POST' && (path === '/cookie-consent' || path === 'cookie-consent')) {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json(req, { error: 'invalid json' }, 400); }

    const visitorId = String(body.visitor_id || '').trim();
    const action = String(body.action || '').trim();
    if (!visitorId) return json(req, { error: 'visitor_id required' }, 400);
    if (!VALID_ACTIONS.has(action)) return json(req, { error: 'invalid action' }, 400);

    const ip = clientIp(req);
    const rateKey = `${visitorId}:${ip}`;
    if (!checkRate(rateKey)) return json(req, { error: 'rate limit exceeded' }, 429);

    const user = await verifyUser(req);
    let tenantId: string | null = user?.app_metadata?.tenant_id || null;
    if (user && !tenantId) {
      const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
      const uc = createClient(Deno.env.get('SUPABASE_URL')!, anon, {
        global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
        auth: { persistSession: false }
      });
      const { data: me } = await uc.rpc('api_me');
      tenantId = me?.tenant_id || null;
    }

    const payload = {
      visitor_id: visitorId,
      user_id: user?.id || null,
      tenant_id: tenantId,
      action,
      policy_version: body.policy_version ? String(body.policy_version) : null,
      categories: normalizeCategories(body.categories),
      ip_address: ip || null,
      user_agent: (req.headers.get('user-agent') || '').slice(0, 512)
    };

    const { data, error } = await sr.rpc('api_record_cookie_consent', { p_payload: payload });
    if (error) return json(req, { error: error.message }, 400);
    return json(req, data);
  }

  if (req.method === 'PUT' && (path === '/cookie-consent/update' || path === 'cookie-consent/update')) {
    const user = await verifyUser(req);
    if (!user) return json(req, { error: 'unauthorized' }, 401);

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json(req, { error: 'invalid json' }, 400); }

    const visitorId = String(body.visitor_id || '').trim();
    if (!visitorId) return json(req, { error: 'visitor_id required' }, 400);

    const ip = clientIp(req);
    if (!checkRate(`${visitorId}:${ip}`)) return json(req, { error: 'rate limit exceeded' }, 429);

    let tenantId: string | null = user.app_metadata?.tenant_id || null;
    if (!tenantId) {
      const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
      const uc = createClient(Deno.env.get('SUPABASE_URL')!, anon, {
        global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
        auth: { persistSession: false }
      });
      const { data: me } = await uc.rpc('api_me');
      tenantId = me?.tenant_id || null;
    }

    const payload: Record<string, unknown> = {
      visitor_id: visitorId,
      user_id: user.id,
      tenant_id: tenantId,
      action: 'update',
      policy_version: body.policy_version ? String(body.policy_version) : null,
      categories: normalizeCategories(body.categories),
      ip_address: ip || null,
      user_agent: (req.headers.get('user-agent') || '').slice(0, 512)
    };

    const { data: hist } = await sr.rpc('api_get_cookie_consent_history', {
      p_payload: { user_id: user.id, limit: 1 }
    });
    const items = Array.isArray(hist?.items) ? hist.items : [];
    if (items[0]?.id) payload.supersedes_id = items[0].id;

    const { data, error } = await sr.rpc('api_record_cookie_consent', { p_payload: payload });
    if (error) return json(req, { error: error.message }, 400);
    return json(req, data);
  }

  return json(req, { error: 'not found' }, 404);
});
