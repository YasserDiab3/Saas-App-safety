# Supabase Edge Functions

| الدالة | الغرض |
|--------|-------|
| `cookie-consent/` | موافقة الكوكيز (GDPR): `GET /cookie-policy`, `POST /cookie-consent`, `PUT /cookie-consent/update`, `GET /cookie-consent/history`. **نشر:** `supabase functions deploy cookie-consent --no-verify-jwt` (زوار مجهولون + JWT اختياري داخل الدالة) |
| `api/` | موجّه الـ actions — يحاكي عقد `{action,data} → {success,data,message}` الحالي. يتحقق من الـ JWT، يستخرج `tenant_id`، يحوّل الـ action إلى SQL. (Phase 2) |
| `stripe-webhook/` | استقبال أحداث Stripe وتحديث `subscriptions` / `tenants.plan`. (Phase 5) |
| `trial-reminders/` | إيميلات تذكير التجربة (يومان / يوم / انتهاء) — تجربة 3 أيام — جدولة يومية عبر `x-cron-secret`. |

> الواجهة لا تتغير وظيفياً — `Backend.sendRequest` يُوجَّه عبر
> `frontend/js/saas/saas-adapter.js` إلى Supabase RPC (Strangler-Fig).
