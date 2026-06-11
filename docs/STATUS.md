# حالة التقدّم — HSE SaaS

> آخر تحديث: 2026-06-12 — تطبيق الهجرات 0007–0011 + إعداد Vercel production build

## ✅ Phase 0 — النسخة المستقلة
مجلد `clinic-saas` منفصل، git على `Saas-App-safety`، الواجهة (38 مديول). الإنتاج لم يُمَس.

## ✅ Phase 1 — قاعدة البيانات
مشروع Supabase: `tbkajjarkqhsdiabufjv`
- `app.plans` = 3 · `app.sheets` = 62 · RLS على `app.records`
- **11/11 هجرة** مسجّلة في `supabase_migrations.schema_migrations` (0001–0011)

### تطبيق الهجرات (2026-06-12)
```text
0001–0006  → repair (كانت مطبّقة يدوياً سابقاً)
0007       → business_logic (api_add_clinic_visit, …) ✅
0008       → billing ✅
0009       → security_hardening (api_me, أدوار, read-only) ✅
0010       → platform_admin ✅
0011       → billing_fixes (apply_subscription public wrapper) ✅
```

**تحقق:** 
- CLI: `node supabase/scripts/verify_migrations.mjs` (RPC probe)
- SQL Editor: `supabase/scripts/verify_migrations.sql`
- P0 smoke: `SMOKE_EMAIL=... SMOKE_PASSWORD=... node supabase/scripts/p0_module_smoke.mjs`

## ✅ Phase 2 — طبقة API + الموصِّل
RPCs `public.api_*` + `frontend/js/saas/` — E2E multi-tenant ناجح.

## ✅ Phase 2b — منطق الخادم
RPCs في `0007` مطبّقة. الموصّل يربط: `addClinicVisit`, `getAllClinicVisits`, `updateTaskCompletionRate`, `getUserTasksByUserId`.

## ✅ Phase 3 — ربط الـ38 مديول
`useSupabaseBackend=true` · `app-bootstrap` → `SaaSSession.requireSession()`.

## ✅ Phase 4 — التسجيل الذاتي
`signup.html`, `login.html`, `saas-session.js`, `hydrateAppStateUser()`.

## ⏳ Phase 5 — فوترة Stripe
- الهجرات 0008 + 0011 مطبّقة على DB ✅
- Edge Functions منشورة ✅: `stripe-webhook`, `create-checkout`
- ⏳ **متبقي:** أسرار Stripe + webhook في Dashboard (انظر أدناه)

## ✅ Vercel Production Build
- `vercel.json` (الجذر): `npm ci` + `npm run build` → `dist/` + security headers
- بناء محلي ناجح: 84 ملف JS minified

## ⏭️ الخطوات المتبقية قبل الإطلاق العام

| # | المهمة | الأولوية |
|---|--------|----------|
| 1 | تشغيل checklist المديولات (`docs/SUPABASE_MODULE_TEST_CHECKLIST.md`) | حرج |
| 2 | تفعيل Confirm email في Supabase Auth | حرج |
| 3 | نشر Stripe Edge Functions + secrets | عالي |
| 4 | Redeploy على Vercel بعد push | عالي |
| 5 | Supabase Storage للمرفقات (إن لزم) | متوسط |

## ⏭️ اختبار
- Smoke: `frontend/saas-test.html`
- شامل: `docs/SUPABASE_MODULE_TEST_CHECKLIST.md`
- بوابات UI: `frontend/ACCEPTANCE_GATES.md` (Gate 5/6 — استبدل Apps Script بـ Supabase)
