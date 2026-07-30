// ============================================================
// Edge Function: bi-export — JSON/CSV snapshots for Power BI / ERP middleware
// Deploy: supabase functions deploy bi-export --no-verify-jwt
// Auth:   header x-cron-secret OR Authorization: Bearer <CRON_SECRET|BI_EXPORT_SECRET>
// Query:  tenant_id (uuid), sheets (comma list), format=json|csv, limit (default 500, max 2000)
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEFAULT_SHEETS = ['Incidents', 'HSECorrectiveActions', 'Training', 'PTW', 'NearMiss'];
const MAX_LIMIT = 2000;

function cors(extra: Record<string, string> = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    ...extra
  };
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json' }
  });
}

function authorized(req: Request): boolean {
  const cron = Deno.env.get('CRON_SECRET') || '';
  const bi = Deno.env.get('BI_EXPORT_SECRET') || '';
  const headerCron = req.headers.get('x-cron-secret') || '';
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (cron && (headerCron === cron || auth === cron)) return true;
  if (bi && (headerCron === bi || auth === bi)) return true;
  return false;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const keys = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r || {}).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );
  const esc = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [keys.join(',')];
  for (const row of rows) {
    lines.push(keys.map((k) => esc(row[k])).join(','));
  }
  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
  if (!authorized(req)) return json({ error: 'Unauthorized' }, 401);

  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch (_e) {
      body = {};
    }
  }

  const tenantId = String(body.tenant_id || url.searchParams.get('tenant_id') || '').trim();
  if (!tenantId) return json({ error: 'tenant_id required' }, 400);

  const sheetsRaw = String(body.sheets || url.searchParams.get('sheets') || DEFAULT_SHEETS.join(','));
  const sheets = sheetsRaw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const format = String(body.format || url.searchParams.get('format') || 'json').toLowerCase();
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(body.limit || url.searchParams.get('limit') || 500) || 500)
  );

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const out: Record<string, unknown[]> = {};
  for (const sheet of sheets) {
    const { data, error } = await supa.rpc('api_bi_export_sheet', {
      p_tenant: tenantId,
      p_sheet: sheet,
      p_limit: limit
    });
    if (error) {
      out[sheet] = [{ __error: error.message }];
    } else {
      out[sheet] = Array.isArray(data) ? data : [];
    }
  }

  if (format === 'csv') {
    const sheet = sheets[0];
    const rows = (out[sheet] || []) as Record<string, unknown>[];
    const csv = toCsv(rows.filter((r) => !r.__error));
    return new Response(csv, {
      status: 200,
      headers: {
        ...cors(),
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${sheet || 'export'}.csv"`
      }
    });
  }

  return json({
    app: 'HSEHub 360',
    exportedAt: new Date().toISOString(),
    tenant_id: tenantId,
    limit,
    sheets: out
  });
});
