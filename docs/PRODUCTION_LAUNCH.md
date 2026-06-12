# دليل الإطلاق للإنتاج — HSE SaaS

> **الموقع:** https://saas-app-safety.vercel.app  
> **Supabase:** `tbkajjarkqhsdiabufjv`  
> **تشغيل آلي:** `node supabase/scripts/production_launch.mjs`

---

## ما تم تنفيذه تلقائياً

| البند | الحالة |
|-------|--------|
| الهجرات 0001–0012 (DB + RLS + Storage) | ✅ |
| Edge Functions (Stripe) | ✅ منشورة |
| Vercel (frontend static) | ✅ |
| RPC verification | ✅ |
| حساب اختبار + P0 smoke (5/5) | ✅ |

---

## تشغيل التحقق الآلي

```powershell
cd "d:\App\Cluda Ai\clinic-saas"
node supabase/scripts/production_launch.mjs
```

| سكربت | الغرض |
|--------|--------|
| `verify_migrations.mjs` | فحص RPCs |
| `create_smoke_tenant.mjs` | إنشاء tenant اختبار |
| `p0_module_smoke.mjs` | Clinic, PTW, Incidents, Employees, Training |
| `verify_stripe_setup.mjs` | فحص أسرار Stripe |
| `set-stripe-secrets.ps1` | رفع `.env` → Supabase |

---

## خطوات يدوية متبقية (تحتاجك)

### 1) تأكيد البريد (حرج للإطلاق العام)

Supabase Dashboard → **Authentication → Settings**:
- فعّل **Confirm email**
- اضبط **SMTP** (أو استخدم مزود البريد)

### 2) مدير المنصّة

عدّل البريد في `supabase/scripts/set_platform_admin.sql` ثم Run في SQL Editor.

### 3) Stripe (للفوترة)

```powershell
copy .env.example .env
# املأ مفاتيح Stripe + APP_URL
.\supabase\scripts\set-stripe-secrets.ps1
node supabase/scripts/verify_stripe_setup.mjs
# ثم sync_stripe_prices.sql في SQL Editor
```

### 4) اختبار شامل

`docs/SUPABASE_MODULE_TEST_CHECKLIST.md` — املأ عمود الحالة لكل مديول.

### 5) نطاق مخصص (اختياري)

Vercel → Domains → `app.yourcompany.com`

---

## مسارات الإنتاج

| المسار | الاستخدام |
|--------|-----------|
| `/login` | تسجيل الدخول |
| `/signup` | مؤسسة جديدة |
| `/` | التطبيق |
| `/billing` | الاشتراك |
| `/health` | فحص صحة النشر |
| `/saas-test` | اختبار Supabase معزول |

---

## Go / No-Go

**Beta:** production_launch يمر (بدون Stripe) + Confirm email  
**عام:** + Stripe live + checklist P1 ≥90%
