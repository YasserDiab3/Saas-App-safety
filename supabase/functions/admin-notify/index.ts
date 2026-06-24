// ============================================================
// Edge Function: admin-notify
// Platform admin: send email and/or in-app notifications; send price quotes.
// Deploy: supabase functions deploy admin-notify
// Secrets: SMTP_* , APP_URL (+ auto SUPABASE_*)
// Auth: platform admin JWT required
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const APP_URL = (Deno.env.get('APP_URL') ?? 'https://saas-app-safety.vercel.app').replace(/\/$/, '');
const ALLOWED_ORIGINS = new Set([
  APP_URL, 'https://saas-app-safety.vercel.app',
  'http://localhost:3000', 'http://127.0.0.1:3000'
]);

type Contact = { user_id: string; email: string; full_name: string; role: string; status: string };

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

async function sendSmtp(to: string, subject: string, html: string) {
  const host = Deno.env.get('SMTP_HOST');
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  const port = Number(Deno.env.get('SMTP_PORT') || '587');
  const fromName = Deno.env.get('SMTP_SENDER_NAME') || 'HSEHub 360';
  if (!host || !user || !pass) throw new Error('SMTP not configured on server');

  const client = new SMTPClient({
    connection: { hostname: host, port, tls: true, auth: { username: user, password: pass } }
  });
  await client.send({
    from: `${fromName} <${user}>`,
    to,
    subject,
    content: 'auto',
    html
  });
  await client.close();
}

function wrapHtml(body: string, title: string) {
  const text = body.replace(/\n/g, '<br>');
  return `<div dir="rtl" style="font-family:Segoe UI,Tahoma,sans-serif;line-height:1.65;max-width:560px">
    <h2 style="color:#1e3a8a;font-size:1.1rem">${title}</h2>
    <div>${text}</div>
    <p style="margin-top:24px"><a href="${APP_URL}/billing" style="color:#2563eb">عرض الأسعار والاشتراك</a></p>
    <p style="color:#64748b;font-size:12px;margin-top:20px">HSEHub 360 — Safety • Health • Environment</p>
  </div>`;
}

function quoteHtml(q: Record<string, unknown>, tenantName: string) {
  const amt = q.amount_cents ? `$${(Number(q.amount_cents) / 100).toFixed(2)}` : 'حسب الخطة';
  const disc = Number(q.discount_percent || 0);
  const valid = q.valid_until ? new Date(String(q.valid_until)).toLocaleDateString('ar-EG') : '—';
  return `<div dir="rtl" style="font-family:Segoe UI,Tahoma,sans-serif;line-height:1.65;max-width:560px">
    <h2 style="color:#1e3a8a">عرض سعر — ${tenantName}</h2>
    <p><strong>${q.title}</strong></p>
    <table style="width:100%;border-collapse:collapse;font-size:.9rem">
      <tr><td style="padding:6px 0;color:#64748b">الخطة</td><td><b>${q.plan_id}</b></td></tr>
      <tr><td style="padding:6px 0;color:#64748b">السعر</td><td><b>${amt}</b></td></tr>
      ${disc ? `<tr><td style="padding:6px 0;color:#64748b">خصم</td><td><b>${disc}%</b></td></tr>` : ''}
      ${Number(q.extra_trial_days) ? `<tr><td style="padding:6px 0;color:#64748b">تجربة إضافية</td><td><b>${q.extra_trial_days} يوم</b></td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#64748b">صالح حتى</td><td><b>${valid}</b></td></tr>
    </table>
    ${q.notes ? `<p style="margin-top:12px">${String(q.notes).replace(/\n/g, '<br>')}</p>` : ''}
    <p style="margin-top:20px"><a href="${APP_URL}/billing" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">قبول العرض والاشتراك</a></p>
    <p style="color:#64748b;font-size:12px;margin-top:20px">HSEHub 360</p>
  </div>`;
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

  const sr = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const { data: adminOk, error: admErr } = await userClient.rpc('api_admin_tenant_options');
  if (admErr || adminOk === null) return json(req, { error: 'forbidden: platform admin only' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: 'invalid json' }, 400); }

  const action = String(body.action || 'notify');

  if (action === 'notify') {
    const tenantId = body.tenant_id as string | undefined;
    const userId = body.user_id as string | undefined;
    const channel = String(body.channel || 'email');
    const subject = String(body.subject || '').trim();
    const text = String(body.body || '').trim();
    if (!tenantId || !subject || !text) return json(req, { error: 'tenant_id, subject, body required' }, 400);
    if (!['email', 'in_app', 'both'].includes(channel)) return json(req, { error: 'invalid channel' }, 400);

    const { data: contactsData, error: cErr } = await userClient.rpc('api_admin_get_tenant_contacts', {
      p_tenant_id: tenantId
    });
    if (cErr) return json(req, { error: cErr.message }, 400);
    let contacts = (contactsData?.contacts || []) as Contact[];
    if (userId) contacts = contacts.filter(c => c.user_id === userId);
    if (!contacts.length) return json(req, { error: 'no active recipients' }, 400);

    const sent: string[] = [];
    const failed: { email: string; error: string }[] = [];

    for (const c of contacts) {
      try {
        if (channel === 'email' || channel === 'both') {
          if (c.email) await sendSmtp(c.email, subject, wrapHtml(text, subject));
        }
        if (channel === 'in_app' || channel === 'both') {
          await sr.rpc('api_admin_insert_user_notification', {
            p_user_id: c.user_id,
            p_tenant_id: tenantId,
            p_title: subject,
            p_body: text
          });
        }
        sent.push(c.email || c.user_id);
      } catch (e) {
        failed.push({ email: c.email || c.user_id, error: String(e) });
      }
    }

    const status = failed.length === 0 ? 'sent' : (sent.length ? 'partial' : 'failed');
    await sr.rpc('api_admin_record_notification', {
      p_tenant_id: tenantId,
      p_user_id: userId || null,
      p_channel: channel,
      p_subject: subject,
      p_body: text,
      p_recipients: sent,
      p_status: status,
      p_sent_by: user.id
    });

    return json(req, { ok: true, sent: sent.length, failed, status });
  }

  if (action === 'quote') {
    const quoteId = body.quote_id as string;
    if (!quoteId) return json(req, { error: 'quote_id required' }, 400);

    const { data: quote, error: qErr } = await userClient.rpc('api_admin_get_quote', { p_quote_id: quoteId });
    if (qErr || !quote) return json(req, { error: qErr?.message || 'quote not found' }, 404);

    const tenantId = quote.tenant_id as string;
    const { data: contactsData } = await userClient.rpc('api_admin_get_tenant_contacts', { p_tenant_id: tenantId });
    const contacts = (contactsData?.contacts || []) as Contact[];
    const owners = contacts.filter(c => c.role === 'owner' || c.role === 'admin');
    const targets = owners.length ? owners : contacts.slice(0, 1);
    if (!targets.length) return json(req, { error: 'no recipients' }, 400);

    const subject = `عرض سعر HSEHub 360 — ${quote.tenant_name}`;
    const html = quoteHtml(quote as Record<string, unknown>, String(quote.tenant_name));
    const sent: string[] = [];
    const failed: { email: string; error: string }[] = [];

    for (const c of targets) {
      try {
        if (c.email) {
          await sendSmtp(c.email, subject, html);
          sent.push(c.email);
        }
        await sr.rpc('api_admin_insert_user_notification', {
          p_user_id: c.user_id,
          p_tenant_id: tenantId,
          p_title: subject,
          p_body: `عرض سعر: ${quote.title} — خطة ${quote.plan_id}`
        });
      } catch (e) {
        failed.push({ email: c.email || c.user_id, error: String(e) });
      }
    }

    if (sent.length) await userClient.rpc('api_admin_mark_quote_sent', { p_quote_id: quoteId });

    await sr.rpc('api_admin_record_notification', {
      p_tenant_id: tenantId,
      p_user_id: null,
      p_channel: 'both',
      p_subject: subject,
      p_body: `Quote: ${quote.title}`,
      p_recipients: sent,
      p_status: failed.length ? 'partial' : 'sent',
      p_sent_by: user.id
    });

    return json(req, { ok: true, sent: sent.length, failed });
  }

  return json(req, { error: 'unknown action' }, 400);
});
