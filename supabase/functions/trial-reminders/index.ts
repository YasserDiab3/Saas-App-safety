// ============================================================
// Edge Function: trial-reminders
// Sends trial expiry emails (3 days / 1 day / expiry day) to org owners.
// Schedule daily (e.g. 08:00 UTC) via Supabase Cron or external ping.
//
// Deploy:  supabase functions deploy trial-reminders --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMTP_* , APP_URL, CRON_SECRET
// Invoke:  POST + header x-cron-secret: <CRON_SECRET>
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const APP_URL = Deno.env.get('APP_URL') ?? 'https://saas-app-safety.vercel.app';

type Row = {
  tenant_id: string;
  tenant_name: string;
  owner_email: string;
  owner_name: string;
  reminder_type: 'd3' | 'd1' | 'd0';
  trial_ends_at: string;
  days_left: number;
};

function emailContent(row: Row) {
  const end = new Date(row.trial_ends_at).toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  const billing = `${APP_URL}/billing`;
  const signup = `${APP_URL}/`;

  if (row.reminder_type === 'd3') {
    return {
      subject: `QHSSE Consultant — تبقى 3 أيام على انتهاء التجربة | ${row.tenant_name}`,
      html: `<div dir="rtl" style="font-family:Segoe UI,Tahoma,sans-serif;line-height:1.6">
        <p>مرحباً ${row.owner_name}،</p>
        <p>تنتهي التجربة المجانية لمؤسسة <strong>${row.tenant_name}</strong> خلال <strong>3 أيام</strong> (${end}).</p>
        <p>اشترك في <strong>Pro</strong> أو <strong>Enterprise</strong> للاستفادة بالمنصّة الكاملة:</p>
        <p><a href="${billing}">عرض الخطط والاشتراك</a></p>
        <p><a href="${signup}">الدخول للنظام</a></p>
        <p style="color:#64748b;font-size:12px">QHSSE Consultant — HSE SaaS</p>
      </div>`
    };
  }
  if (row.reminder_type === 'd1') {
    return {
      subject: `QHSSE Consultant — غداً انتهاء التجربة | ${row.tenant_name}`,
      html: `<div dir="rtl" style="font-family:Segoe UI,Tahoma,sans-serif;line-height:1.6">
        <p>مرحباً ${row.owner_name}،</p>
        <p>تنتهي تجربتك المجانية <strong>غداً</strong> (${end}) لمؤسسة <strong>${row.tenant_name}</strong>.</p>
        <p>لا تفقد الوصول — فعّل الاشتراك الآن:</p>
        <p><a href="${billing}">الاشتراك والفوترة</a></p>
      </div>`
    };
  }
  return {
    subject: `QHSSE Consultant — انتهت التجربة اليوم | ${row.tenant_name}`,
    html: `<div dir="rtl" style="font-family:Segoe UI,Tahoma,sans-serif;line-height:1.6">
      <p>مرحباً ${row.owner_name}،</p>
      <p>انتهت اليوم التجربة المجانية لمؤسسة <strong>${row.tenant_name}</strong>.</p>
      <p>الحساب أصبح للقراءة فقط حتى إضافة بيانات الدفع.</p>
      <p><a href="${billing}">اشترك واستعد الوصول الكامل</a></p>
    </div>`
  };
}

async function sendSmtp(to: string, subject: string, html: string) {
  const host = Deno.env.get('SMTP_HOST');
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  const port = Number(Deno.env.get('SMTP_PORT') || '587');
  const fromName = Deno.env.get('SMTP_SENDER_NAME') || 'QHSSE Consultant';
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

  const { data: rows, error } = await supa.rpc('pending_trial_reminders');
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const list = (rows || []) as Row[];
  let sent = 0;
  const failures: { email: string; error: string }[] = [];

  for (const row of list) {
    try {
      const { subject, html } = emailContent(row);
      await sendSmtp(row.owner_email, subject, html);
      const { error: markErr } = await supa.rpc('mark_trial_reminder_sent', {
        p_tenant_id: row.tenant_id,
        p_type: row.reminder_type
      });
      if (markErr) throw new Error(markErr.message);
      sent++;
    } catch (e) {
      failures.push({ email: row.owner_email, error: String(e) });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    pending: list.length,
    sent,
    failures
  }), { headers: { 'Content-Type': 'application/json' } });
});
