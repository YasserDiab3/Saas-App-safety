# النشر على Vercel

المستودع: https://github.com/YasserDiab3/Saas-App-safety

## الإعداد الموصى به (Static — مستقر)

`vercel.json` يخدم مجلد **`frontend/`** مباشرة (بدون build على Vercel) لتجنب **HTTP 503** عند فشل البناء.

| الإعداد | القيمة |
|---------|--------|
| Root Directory | `./` (جذر المستودع) |
| Build | **لا شيء** (فارغ في اللوحة) |
| Output | **فارغ** — الملفات من `frontend/` عبر rewrite |
| Security headers | HSTS, X-Frame-Options, COOP, … |

**بناء إنتاجي اختياري (محلي):** `npm run build` من الجذر → `dist/` للاختبار المحلي فقط.

### خطوات Vercel (مرة واحدة)

1. Vercel → **Add New → Project** → استورد `Saas-App-safety`.
2. **Root Directory** = `./` (جذر المستودع — **مهم**).
3. Framework Preset = **Other**.
4. في **Project Settings → Build & Development**:
   - Build Command = **فارغ**
   - Output Directory = **فارغ**
   - **احذف** أي Override قديم (`dist` أو `frontend` كـ output).
5. Deploy → **Redeploy** بعد كل push على `main`.

> إذا ظهر **503**: غالباً فشل البناء أو Output Directory خاطئ. افتح Deployments → آخر build → Build Logs.

### بناء محلي (تحقق قبل النشر)

```bash
cd frontend
npm ci
npm run build
# الناتج: frontend/dist/ + dist/ عند جذر المستودع
npx serve ../dist
```

### بديل: Root Directory = frontend

إذا فضّلت ضبط **Root Directory = `frontend`** في لوحة Vercel، يُستخدم `frontend/vercel.json`
(نفس build + headers، Output = `dist` داخل frontend).

## بعد النشر

- `/` → `index.html` (SPA + `useSupabaseBackend=true`).
- لا جلسة → تحويل إلى `/login.html`.
- تسجيل جديد → `/signup.html`.
- اختبار معزول → `/saas-test.html`.
- فوترة → `/billing.html`.

## ملاحظات

- مفتاح anon عام — آمن مع RLS.
- قبل الإطلاق العام: فعّل **Confirm email** في Supabase Auth.
- Stripe: انشر Edge Functions + الأسرار (انظر `BILLING_AND_DEPLOY.md`).
- مجلد `dist/` في `.gitignore` — Vercel يبنيه عند كل deploy.
