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

## ⏭️ التالي
- **Phase 2b**: نقل أفعال منطق الخادم (BUSINESS_ACTIONS) عبر Edge Function:
  addClinicVisit/updateClinicVisit (خصم الأدوية الذرّي)، updateTaskCompletionRate،
  getUserTasksByUserId، getAllClinicVisits.
- **Phase 3**: قلب `useSupabaseBackend=true` وربط `google-integration.js` →
  تشغيل الـ38 مديول على Supabase.
- **Phase 4**: التسجيل الذاتي وواجهة الـ onboarding/الأدوار.
- **Phase 5**: فوترة Stripe + plan-gating.
