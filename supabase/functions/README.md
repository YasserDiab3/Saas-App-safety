# Supabase Edge Functions

| الدالة | الغرض |
|--------|-------|
| `api/` | موجّه الـ actions — يحاكي عقد `{action,data} → {success,data,message}` الحالي. يتحقق من الـ JWT، يستخرج `tenant_id`، يحوّل الـ action إلى SQL. (Phase 2) |
| `stripe-webhook/` | استقبال أحداث Stripe وتحديث `subscriptions` / `tenants.plan`. (Phase 5) |
| `trial-reminders/` | إيميلات تذكير التجربة (يومان / يوم / انتهاء) — تجربة 3 أيام — جدولة يومية عبر `x-cron-secret`. |

> الواجهة لا تتغير وظيفياً — فقط `frontend/js/modules/services/google-integration.js`
> يُعاد توجيهه إلى `api/` بدل scriptUrl (Phase 3).
