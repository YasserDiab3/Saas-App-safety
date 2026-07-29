// ============================================================
// Edge Function: notify-dispatch
// Claims pending app.notification_outbox rows and sends Email (SMTP)
// and optional WhatsApp (Meta Cloud API) messages.
//
// Deploy:  supabase functions deploy notify-dispatch --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMTP_*, CRON_SECRET
// Optional WhatsApp: WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN
// Invoke:  POST + header x-cron-secret: <CRON_SECRET>
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

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

async function sendSmtp(to: string, subject: string, html: string) {
  const host = Deno.env.get('SMTP_HOST');
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  const port = Number(Deno.env.get('SMTP_PORT') || '587');
  const fromName = Deno.env.get('SMTP_SENDER_NAME') || 'HSEHub 360';
  if (!host || !user || !pass) throw new Error('SMTP not configured');

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

async function resolveOwnerEmail(supa: ReturnType<typeof createClient>, tenantId: string) {
  const { data } = await supa
    .from('tenants')
    .select('id, name')
    .eq('id', tenantId)
    .maybeSingle();
  const { data: members } = await supa
    .from('tenant_members')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .in('role', ['owner', 'admin'])
    .limit(5);
  let email = '';
  if (members && members.length) {
    const ids = members.map((m: { user_id: string }) => m.user_id);
    const { data: profiles } = await supa.from('profiles').select('id, email').in('id', ids);
    const owner = members.find((m: { role: string }) => m.role === 'owner') || members[0];
    const prof = (profiles || []).find((p: { id: string }) => p.id === owner.user_id) || (profiles || [])[0];
    email = (prof && prof.email) || '';
  }
  return { email, tenantName: (data && (data as { name?: string }).name) || tenantId };
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
  const failures: { id: string; error: string }[] = [];

  for (const row of list) {
    try {
      const channels = Array.isArray(row.channels)
        ? row.channels.map(String)
        : [];
      const { email, tenantName } = await resolveOwnerEmail(supa, row.tenant_id);
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

      await supa.rpc('api_complete_notification_outbox', {
        p_id: row.id,
        p_ok: true,
        p_error: null
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
    JSON.stringify({ ok: true, claimed: list.length, sent, failures }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
