---
name: clinic-saas-qa
description: >-
  QHSSE clinic-saas Supabase SaaS QA: smoke scripts, mobile auth checks, security
  verification, and concise Arabic user replies. Use when testing deployments,
  verifying fixes, running smoke tests, db push, or mobile/login/billing flows
  on saas-app-safety.vercel.app.
---

# clinic-saas QA

## متى تُستخدم

- بعد `db push` أو تغيير auth/mobile/security
- قبل commit/push للإنتاج
- عند طلب «اختبار دخان» أو «تحقق من الموبايل»

## أوامر smoke (من جذر المستودع)

```powershell
Set-Location "d:\App\Cluda Ai\clinic-saas"
node supabase/scripts/mobile_smoke.mjs
node supabase/scripts/ui_flow_smoke.mjs
node supabase/scripts/p0_module_smoke.mjs
node supabase/scripts/security_smoke.mjs
node supabase/scripts/tenant_isolation_smoke.mjs
node supabase/scripts/verify_mfa_config.mjs
```

**بيانات الاختبار:** `supabase/scripts/.smoke-credentials.json` (gitignored) أو:

```powershell
$env:SMOKE_EMAIL="..."; $env:SMOKE_PASSWORD="..."
```

**إنشاء tenant اختبار:** `node supabase/scripts/create_smoke_tenant.mjs`

**عزل مؤسستين:** `tenant_isolation_smoke.mjs` ينشئ `.tenant-isolation-credentials.json` — أعد `--fresh` لإنشاء زوج جديد.

**MFA:** بعد الدخول → `/mfa-setup.html` لتفعيل TOTP؛ الدخول يطلب الرمز تلقائياً عند التفعيل.

## SQL تحقق

```powershell
Get-Content supabase/scripts/verify_security.sql -Raw | npx supabase db query --linked
Get-Content supabase/scripts/verify_migrations.sql -Raw | npx supabase db query --linked
```

## بيئة

| عنصر | قيمة |
|------|------|
| Production | https://saas-app-safety.vercel.app |
| Supabase ref | tbkajjarkqhsdiabufjv |
| Login entry | `/login` (للموبايل والروابط المشاركة) |
| SaaS flag | `SAAS_CONFIG.useSupabaseBackend: true` |

## mobile / auth — تحقق سريع

1. `/login` — يحمّل `saas-auth-storage.js` + `waitForPersistedSession`
2. `/` بدون جلسة — توجيه فوري إلى `/login?next=...`
3. `/js/vendor/supabase.min.js` — HTTP 200
4. Service Worker لا يُسجَّل للزوار (guests)
5. بعد login — `api_me` + فتح التطبيق

## قواعد الرد للمستخدم (عربي)

- جمل كاملة وواضحة — **ليس** caveman style للمستخدم
- اذكر النتيجة: `PASS/FAIL` + الأرقام (`36/36`)
- لا تُلتزم `.env` أو `sbp_*.txt` أو `.smoke-credentials.json`
- لا commit إلا بطلب صريح
- لا `git push --force` على main

## checklist يدوي

راجع `docs/SUPABASE_MODULE_TEST_CHECKLIST.md` للمديولات.

## migrations حرجة (مرجع)

- `0018` — trial module gating (7 modules)
- `0019` — security hardening (apply_subscription, RLS, XSS fixes deployed separately)
