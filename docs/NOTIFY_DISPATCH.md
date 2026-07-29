# إشعارات HSEHub 360 — outbox + notify-dispatch

## الحالة التشغيلية (مشروع `tbkajjarkqhsdiabufjv`)

| عنصر | حالة |
|------|------|
| Edge `notify-dispatch` | منشور (`--no-verify-jwt`) |
| أسرار SMTP + `CRON_SECRET` | مضبوطة على Edge Secrets |
| Vault `hsehub_notify_cron_secret` + `hsehub_project_url` | موجودة |
| pg_cron `hsehub-notify-dispatch` | نشط كل **5 دقائق** (`*/5 * * * *`) |
| مسار الكود enqueue → claim → SMTP | مُتحقق |
| وصول البريد الفعلي | يتطلب تفعيل **SMTP AUTH** في Microsoft 365 للمستأجر |

إذا ظهر الخطأ:
`535 5.7.139 … SmtpClientAuthentication is disabled for the Tenant`
فعّل من مركز إدارة Microsoft 365:

1. [Enable SMTP AUTH](https://aka.ms/smtp_auth_disabled)
2. للمستأجر: Exchange admin → Settings → Mail flow → *Turn on SMTP AUTH*
3. ولصندوق المرسل: User → Email apps → *Authenticated SMTP* = On
4. أعد الاختبار: `node supabase/scripts/live_capa_email_smoke.mjs`

## المكوّنات

| جزء | دور |
|-----|-----|
| `app.notification_outbox` | صفوف معلّقة (email / WhatsApp) |
| `public.api_enqueue_notification` | يضيف الحدث من المتصفح (authenticated) |
| Edge `notify-dispatch` | يلتقط الصفوف ويرسل SMTP (nodemailer STARTTLS) / WhatsApp / Webhooks |
| ورقة `WebhookEndpoints` | عناوين webhook لكل مستأجر في `app.records` |

## الأسرار (Supabase Edge Secrets)

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (تلقائية غالباً)
- `CRON_SECRET`
- `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_PORT` / `SMTP_SENDER_NAME`
- `APP_URL`
- اختياري: `WA_PHONE_NUMBER_ID` / `WA_ACCESS_TOKEN` / `WA_DEFAULT_TO`

## أوامر الإعداد

```powershell
# من جذر المستودع — يقرأ .env ويضبط الأسرار ثم يختبر الاستدعاء
node supabase/scripts/setup_notify_dispatch_prod.mjs

# جدولة pg_cron (مرة واحدة)
node supabase/scripts/schedule_notify_dispatch_cron.mjs

# تحقق حي: enqueue capa_due + dispatch
node supabase/scripts/live_capa_email_smoke.mjs
```

`supabase/scripts/.cron-secret.local` محلي ومُتجاهل من git — لا ترفعه.

## النشر

```bash
npx supabase functions deploy notify-dispatch --no-verify-jwt --project-ref tbkajjarkqhsdiabufjv
```

## ملاحظات

- بدون SMTP تبقى الإشعارات داخل التطبيق فقط.
- فشل webhook لا يفشل إرسال البريد إذا نجح؛ يُسجَّل في `error`.
- المستلم: `payload.toEmail` أو بريد owner/admin من `app.profiles` / Auth Admin.
