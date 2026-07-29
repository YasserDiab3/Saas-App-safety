// ============================================================
// Edge Function: notify-dispatch
// Claims pending app.notification_outbox rows and sends Email (SMTP),
// optional WhatsApp (Meta Cloud API), and tenant WebhookEndpoints.
//
// Deploy:  supabase functions deploy notify-dispatch --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMTP_*, CRON_SECRET
// Optional WhatsApp: WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, WA_DEFAULT_TO
// Invoke:  POST + header x-cron-secret: <CRON_SECRET>
// Cron:    Supabase Dashboard → Edge Functions → notify-dispatch → Schedules
//          (every 5–15 min) OR external cron hitting the function URL.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const APP_URL = Deno.env.get('APP_URL') ?? 'https://saas-app-safety.vercel.app';

type OutboxRow = {
  id: string;
  tenant_id: string;
  event_key: string;
  title: string;
  body: string;
  record_id: string | null;
  site_id: string | null;
  channels: string[] | unknown;
  payload: Record<string, unknown>;
};

type WebhookRow = {
  id?: string;
  url?: string;
  secret?: string;
  enabled?: boolean;
  events?: string[];
};

async function sendSmtp(to: string, subject: string, html: string) {
  const host = Deno.env.get('SMTP_HOST');
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  const port = Number(Deno.env.get('SMTP_PORT') || '587');
  const fromName = Deno.env.get('SMTP_SENDER_NAME') || 'HSEHub 360';
  if (!host || !user || !pass) throw new Error('SMTP not configured');

  // Office 365 / most providers: port 587 = STARTTLS (secure:false + requireTLS)
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { minVersion: 'TLSv1.2' }
  });

  await transporter.sendMail({
    from: `${fromName} <${user}>`,
    to,
    subject,
    html
  });
}

async function sendWhatsApp(toE164: string, text: string) {
  const phoneId = Deno.env.get('WA_PHONE_NUMBER_ID');
  const token = Deno.env.get('WA_ACCESS_TOKEN');
  if (!phoneId || !token) throw new Error('WhatsApp not configured');
  const to = String(toE164 || '').replace(/\D/g, '');
  if (!to) throw new Error('invalid WhatsApp number');
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text.slice(0, 4000) }
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp API: ${err}`);
  }
}

async function resolveOwnerEmail(
  supa: ReturnType<typeof createClient>,
  tenantId: string,
  payload: Record<string, unknown> = {}
) {
  const explicit =
    String(payload.toEmail || payload.notifyEmail || payload.email || '').trim();
  if (explicit && explicit.includes('@')) {
    const { data: t } = await supa.schema('app').from('tenants').select('name').eq('id', tenantId).maybeSingle();
    return { email: explicit, tenantName: (t && (t as { name?: string }).name) || tenantId };
  }

  const { data } = await supa
    .schema('app')
    .from('tenants')
    .select('id, name')
    .eq('id', tenantId)
    .maybeSingle();

  const { data: members } = await supa
    .schema('app')
    .from('tenant_members')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .in('role', ['owner', 'admin'])
    .limit(8);

  let email = '';
  if (members && members.length) {
    const ids = members.map((m: { user_id: string }) => m.user_id);
    const { data: profiles } = await supa
      .schema('app')
      .from('profiles')
      .select('id, email')
      .in('id', ids);
    const owner = members.find((m: { role: string }) => m.role === 'owner') || members[0];
    const prof =
      (profiles || []).find((p: { id: string }) => p.id === owner.user_id) || (profiles || [])[0];
    email = (prof && prof.email) || '';

    // Fallback: Auth Admin API if profile email empty
    if (!email) {
      for (const id of [owner.user_id, ...ids]) {
        try {
          const { data: userData } = await supa.auth.admin.getUserById(id);
          const ue = userData?.user?.email || '';
          if (ue) {
            email = ue;
            break;
          }
        } catch (_e) {
          /* continue */
        }
      }
    }
  }

  return { email, tenantName: (data && (data as { name?: string }).name) || tenantId };
}

async function loadTenantWebhooks(supa: ReturnType<typeof createClient>, tenantId: string): Promise<WebhookRow[]> {
  const { data, error } = await supa
    .schema('app')
    .from('records')
    .select('id, data')
    .eq('tenant_id', tenantId)
    .eq('sheet', 'WebhookEndpoints');
  if (error || !data) return [];
  return data
    .map((r: { data?: WebhookRow }) => (r && r.data) || {})
    .filter((w: WebhookRow) => w && w.enabled !== false && w.url);
}

async function fanOutWebhooks(hooks: WebhookRow[], row: OutboxRow) {
  const eventKey = row.event_key || '';
  const body = JSON.stringify({
    event: eventKey,
    at: new Date().toISOString(),
    app: 'HSEHub 360',
    tenantId: row.tenant_id,
    recordId: row.record_id,
    siteId: row.site_id,
    title: row.title,
    body: row.body,
    data: row.payload || {}
  });
  for (const hook of hooks) {
    const events = Array.isArray(hook.events) ? hook.events.map(String) : [];
    if (events.length && !events.includes(eventKey) && !events.includes('*')) continue;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (hook.secret) headers['X-HSEHub-Secret'] = String(hook.secret);
    const res = await fetch(String(hook.url), {
      method: 'POST',
      headers,
      body
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`webhook ${hook.url}: ${res.status} ${err.slice(0, 200)}`);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-cron-secret'
      }
    });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  const cronSecret = Deno.env.get('CRON_SECRET');
  const hdr = req.headers.get('x-cron-secret');
  if (!cronSecret || hdr !== cronSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const { data: rows, error } = await supa.rpc('api_claim_notification_outbox', { p_limit: 40 });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const list = (rows || []) as OutboxRow[];
  let sent = 0;
  let webhooks = 0;
  const failures: { id: string; error: string }[] = [];

  for (const row of list) {
    try {
      const channels = Array.isArray(row.channels)
        ? row.channels.map(String)
        : [];
      const { email, tenantName } = await resolveOwnerEmail(supa, row.tenant_id, row.payload || {});
      const html = `<div dir="rtl" style="font-family:Segoe UI,Tahoma,sans-serif;line-height:1.6">
        <p><strong>${row.title || row.event_key}</strong></p>
        <p>${row.body || ''}</p>
        <p style="color:#64748b;font-size:12px">${tenantName} · <a href="${APP_URL}">${APP_URL}</a></p>
        <p style="color:#64748b;font-size:12px">HSEHub 360</p>
      </div>`;

      if (channels.includes('email')) {
        if (!email) throw new Error('no owner email');
        await sendSmtp(email, `HSEHub 360 — ${row.title || row.event_key}`, html);
      }
      if (channels.includes('whatsapp')) {
        const wa =
          (row.payload && (row.payload as { whatsappNumber?: string }).whatsappNumber) ||
          Deno.env.get('WA_DEFAULT_TO') ||
          '';
        if (wa) {
          await sendWhatsApp(String(wa), `${row.title}\n${row.body}\n${APP_URL}`);
        }
      }

      // Always attempt tenant webhooks (server-side; no CORS)
      const hooks = await loadTenantWebhooks(supa, row.tenant_id);
      const webhookErrors: string[] = [];
      for (const hook of hooks) {
        try {
          await fanOutWebhooks([hook], row);
          webhooks++;
        } catch (we) {
          webhookErrors.push(String(we).slice(0, 200));
        }
      }

      await supa.rpc('api_complete_notification_outbox', {
        p_id: row.id,
        p_ok: true,
        p_error: webhookErrors.length ? webhookErrors.join('; ').slice(0, 500) : null
      });
      sent++;
    } catch (e) {
      const msg = String(e);
      failures.push({ id: row.id, error: msg });
      await supa.rpc('api_complete_notification_outbox', {
        p_id: row.id,
        p_ok: false,
        p_error: msg.slice(0, 500)
      });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, claimed: list.length, sent, webhooks, failures }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
