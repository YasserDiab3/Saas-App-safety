// ============================================================
// Edge Function: device-session
// Records device/session metadata (IP + geo) for signed-in users.
// Deploy: supabase functions deploy device-session
// Auth: any authenticated user JWT
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP_URL = (Deno.env.get('APP_URL') ?? 'https://saas-app-safety.vercel.app').replace(/\/$/, '');
const ALLOWED_ORIGINS = new Set([
  APP_URL, 'https://saas-app-safety.vercel.app',
  'http://localhost:3000', 'http://127.0.0.1:3000'
]);

function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : APP_URL;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) return true;
  return false;
}

type Geo = {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  source: 'ip' | 'none';
};

async function lookupGeoIp(ip: string): Promise<Geo> {
  if (!ip || isPrivateIp(ip)) return { source: 'none' };
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return { source: 'none' };
    const data = await res.json();
    if (!data?.success) return { source: 'none' };
    return {
      country: data.country || undefined,
      region: data.region || undefined,
      city: data.city || undefined,
      latitude: typeof data.latitude === 'number' ? data.latitude : undefined,
      longitude: typeof data.longitude === 'number' ? data.longitude : undefined,
      source: 'ip'
    };
  } catch {
    return { source: 'none' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return json(req, { error: 'unauthorized' }, 401);

  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false }
  });

  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json(req, { error: 'unauthorized' }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: 'invalid json' }, 400); }

  const deviceId = String(body.device_id || '').trim();
  if (!deviceId) return json(req, { error: 'device_id required' }, 400);

  const ip = clientIp(req);
  let geo = await lookupGeoIp(ip);

  const clientLat = body.latitude != null ? Number(body.latitude) : null;
  const clientLng = body.longitude != null ? Number(body.longitude) : null;
  const clientGeoSource = String(body.geo_source || '');
  if (clientGeoSource === 'gps' && Number.isFinite(clientLat) && Number.isFinite(clientLng)) {
    geo = {
      country: geo.country,
      region: geo.region,
      city: geo.city,
      latitude: clientLat!,
      longitude: clientLng!,
      source: 'gps'
    };
  }

  let tenantId: string | null = user.app_metadata?.tenant_id || null;
  if (!tenantId) {
    const { data: me } = await userClient.rpc('api_me');
    tenantId = me?.tenant_id || null;
  }

  const sr = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const { data: sessionId, error } = await sr.rpc('api_upsert_device_session', {
    p_payload: {
      user_id: user.id,
      tenant_id: tenantId,
      device_id: deviceId,
      device_label: body.device_label ? String(body.device_label) : null,
      user_agent: body.user_agent ? String(body.user_agent) : null,
      platform: body.platform ? String(body.platform) : null,
      browser: body.browser ? String(body.browser) : null,
      device_type: body.device_type ? String(body.device_type) : null,
      screen_size: body.screen_size ? String(body.screen_size) : null,
      language: body.language ? String(body.language) : null,
      timezone: body.timezone ? String(body.timezone) : null,
      ip_address: ip || null,
      country: geo.country || null,
      region: geo.region || null,
      city: geo.city || null,
      latitude: geo.latitude ?? null,
      longitude: geo.longitude ?? null,
      geo_source: geo.source,
      page_url: body.page_url ? String(body.page_url) : null
    }
  });

  if (error) return json(req, { error: error.message }, 400);
  return json(req, { ok: true, id: sessionId, ip: ip || null });
});
