# إشعارات HSEHub 360 — outbox + notify-dispatch

## المكوّنات

| جزء | دور |
|-----|-----|
| `app.notification_outbox` | صفوف معلّقة (email / WhatsApp) |
| `public.api_enqueue_notification` | يضيف الحدث من المتصفح (authenticated) |
| Edge `notify-dispatch` | يلتقط الصفوف ويرسل SMTP / WhatsApp / Webhooks |
| ورقة `WebhookEndpoints` | عناوين webhook لكل مستأجر في `app.records` |

## الأسرار (Supabase Edge Secrets)

مطلوب:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` — قيمة عشوائية قوية
- `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_PORT` (اختياري `SMTP_SENDER_NAME`)
- `APP_URL` (افتراضي الإنتاج)

اختياري WhatsApp:

- `WA_PHONE_NUMBER_ID`
- `WA_ACCESS_TOKEN`
- `WA_DEFAULT_TO`

## النشر

```bash
npx supabase functions deploy notify-dispatch --no-verify-jwt --project-ref tbkajjarkqhsdiabufjv
```

## جدولة Cron (إلزامي للإنتاج)

Dashboard → Edge Functions → `notify-dispatch` → Schedules:

- كل **5 أو 15 دقيقة**
- Method: `POST`
- Header: `x-cron-secret: <CRON_SECRET>`

أو cron خارجي:

```bash
curl -X POST "https://tbkajjarkqhsdiabufjv.supabase.co/functions/v1/notify-dispatch" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json"
```

الاستجابة المتوقعة: `{ "ok": true, "claimed": N, "sent": M, "webhooks": W, "failures": [] }`

## ملاحظات

- بدون SMTP تبقى الإشعارات داخل التطبيق فقط (toast / in-app).
- فشل webhook لا يفشل إرسال البريد إذا نجح؛ يُسجَّل في `error` مع `status=sent`.
- SSO/SAML الكامل خارج نطاق الستة أشهر — مسودة إعدادات فقط في الواجهة.
