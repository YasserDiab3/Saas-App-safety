# الفوترة والنشر (Phase 4 + 5)

## Phase 4 — التسجيل الذاتي (جاهز)

- `frontend/signup.html` : إنشاء حساب + مؤسسة → `api_provision_tenant` → `index.html`.
- `frontend/login.html`  : تسجيل دخول → `index.html`.
- `frontend/js/saas/saas-session.js` : حماية الجلسة + `hydrateAppStateUser()`.

> **الربط المتبقي مع SPA:** التطبيق الرئيسي (`index.html`) ما زال يستخدم بوابة
> الدخول القديمة (`auth.js`). خطوة الإنهاء: عند `useSupabaseBackend=true`، اجعل
> `app-bootstrap` يستدعي `SaaSSession.requireSession()` + `hydrateAppStateUser()`
> بدل مسار الدخول القديم. (تعديل صغير في bootstrap — يُنفَّذ عند تفعيل التحويل.)

## Phase 5 — Stripe (جاهز للنشر)

### المكوّنات
- `supabase/migrations/0008_billing.sql` : ربط tenant↔Stripe + `apply_subscription`
  (service-role) + `api_billing_status` + `api_set_stripe_customer`.
- `supabase/functions/stripe-webhook/`  : استقبال أحداث Stripe → `apply_subscription`.
- `supabase/functions/create-checkout/` : إنشاء جلسة Checkout للمستأجر.
- `frontend/billing.html`               : عرض الخطط + بدء الاشتراك.
- `frontend/js/saas/plan-gating.js`     : إخفاء المديولات غير المسموحة بالخطة.

### خطوات الإعداد (يدوية — تحتاج حساب Stripe)
1. **Stripe Dashboard** → أنشئ منتجين (Pro, Enterprise) بأسعار اشتراك شهري → انسخ
   `price_...` لكل منهما.
2. طبّق الهجرة الجديدة:
   - أضِف `0007_business_logic.sql` و `0008_billing.sql` (عبر SQL Editor أو
     `supabase db push`).
3. **أسرار الـ Functions:**
   ```bash
   supabase secrets set \
     STRIPE_SECRET_KEY=sk_test_... \
     STRIPE_WEBHOOK_SECRET=whsec_... \
     STRIPE_PRICE_PRO=price_... \
     STRIPE_PRICE_ENTERPRISE=price_... \
     APP_URL=https://app.example.com \
     SUPABASE_URL=https://tbkajjarkqhsdiabufjv.supabase.co \
     SUPABASE_ANON_KEY=<anon> \
     SUPABASE_SERVICE_ROLE_KEY=<service_role>
   ```
4. **نشر الـ Functions:**
   ```bash
   supabase functions deploy stripe-webhook --no-verify-jwt
   supabase functions deploy create-checkout
   ```
5. **Webhook في Stripe** → أضف endpoint:
   `https://tbkajjarkqhsdiabufjv.supabase.co/functions/v1/stripe-webhook`
   فعّل الأحداث: `customer.subscription.*`, `checkout.session.completed`,
   `invoice.payment_failed`. انسخ الـ signing secret إلى `STRIPE_WEBHOOK_SECRET`.
6. حدّث `app.plans.price_id` ليطابق أسعار Stripe (لعرضها في billing.html).

### التدفّق
`billing.html` → `create-checkout` (يُنشئ/يربط Stripe customer) → Checkout →
`checkout.session.completed`/`subscription.*` → webhook → `apply_subscription`
→ تحديث `tenants.plan_id/status` + `subscriptions`. ثم `plan-gating.js` يفتح/يقيّد
المديولات حسب الخطة.

## ملاحظة عزل
كل ما سبق في `clinic-saas` فقط. الإنتاج (`clinic-repo`) لا يُمَس.
`useSupabaseBackend` يبقى false حتى اكتمال ربط الجلسة + اختبار شامل.
