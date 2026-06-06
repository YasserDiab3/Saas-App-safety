# حالة التقدّم — HSE SaaS

## ✅ Phase 0 — النسخة المستقلة
مجلد `clinic-saas` منفصل، git خاص (بلا remote)، الواجهة منسوخة (38 مديول). الإنتاج لم يُمَس.

## ✅ Phase 1 — قاعدة البيانات (مطبَّقة ومُتحقَّق منها)
طُبِّقت 6 هجرات على مشروع Supabase `tbkajjarkqhsdiabufjv`:
- `app.plans` = 3 · `app.sheets` = 62 · جداول `app` = 9 · RLS مفعّل على `app.records`.

## ✅ Phase 2 — طبقة API + الموصِّل (مُختبَرة E2E)
غلافات `public.api_*` (7 دوال) + موصِّل الواجهة (`frontend/js/saas/`).

### نتيجة اختبار E2E متعدد المستأجرين (ناجح)
```
A: signin → token ✅
A: api_provision_tenant → tenant 31dd02b6… ✅
A: api_upsert UserTasks(T-A1) → success ✅
A: api_read_sheet UserTasks → [{T-A1,"مهمة أ"}] ✅
B: api_provision_tenant → tenant 98a628d3… ✅
B: api_read_sheet UserTasks → []  ← عزل RLS مؤكَّد ✅
A: api_read_sheet → ما زال يرى صفه فقط ✅
```
**الخلاصة:** Auth + Postgres + RLS + عقد الأوراق تعمل بمفتاح anon فقط. عزل المستأجرين سليم.

### ملاحظات تشغيلية
- `mailer_autoconfirm = true` مُفعّل على المشروع (تسجيل فوري بلا تأكيد بريد) — مناسب
  للتجربة؛ يُعاد تفعيل تأكيد البريد قبل الإطلاق العام.
- التسلسل الصحيح: signup ثم signin (signInWithPassword) للحصول على جلسة.

## ✅ Phase 2b — أفعال منطق الخادم (كود مكتمل)
RPCs ذرّية في `0007_business_logic.sql`: api_add_clinic_visit (خصم أدوية
atomic عبر SELECT FOR UPDATE — بديل LockService)، api_get_all_clinic_visits،
api_update_task_completion، api_get_user_tasks. الموصِّل يربطها.
⏳ يتطلب تطبيق الهجرة 0007 على Supabase.

## ✅ Phase 3 — ربط الـ38 مديول (كود مكتمل)
`GoogleIntegration.sendRequest` يفوّض إلى `SaaSAdapter` عند
`useSupabaseBackend=true`. سكربتات saas مُحمّلة في index.html قبل المديولات.
العلم يبقى false حتى ربط الجلسة + اختبار.

## ✅ Phase 4 — التسجيل الذاتي (كود مكتمل)
`signup.html` (حساب + مؤسسة → provision)، `login.html`، `saas-session.js`.
⏳ المتبقي: ربط جلسة Supabase بـ AppState في app-bootstrap عند التفعيل.

## ✅ Phase 5 — فوترة Stripe (كود مكتمل، يحتاج نشر + مفاتيح)
`0008_billing.sql` + Edge Functions (stripe-webhook, create-checkout) +
`billing.html` + `plan-gating.js`. خطوات النشر في `BILLING_AND_DEPLOY.md`.
⏳ يتطلب: حساب Stripe + أسعار + نشر functions + تطبيق 0008.

## ⏭️ الخطوات اليدوية المتبقية
1. تطبيق الهجرتين 0007 + 0008 (SQL Editor أو db push).
2. حساب Stripe + price ids + نشر الـ functions + ضبط الأسرار + webhook.
3. ربط جلسة Supabase بـ app-bootstrap ثم قلب useSupabaseBackend=true.
4. اختبار شامل للمديولات على Supabase ثم النشر على Vercel جديد.
