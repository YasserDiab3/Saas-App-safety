# النشر على Vercel

المستودع: https://github.com/YasserDiab3/Saas-App-safety

## الإعداد الموصى به (Production Build)

`vercel.json` في **جذر المستودع** يضبط تلقائياً:

| الإعداد | القيمة |
|---------|--------|
| Install | `cd frontend && npm ci` |
| Build | `cd frontend && npm run build` |
| Output | `dist/` (نسخة minified بدون console/debugger) |
| Security headers | HSTS, X-Frame-Options, COOP, … |

### خطوات Vercel (مرة واحدة)

1. Vercel → **Add New → Project** → استورد `Saas-App-safety`.
2. **Root Directory** = `./` (الجذر — لا تغيّره).
3. Framework Preset = **Other** — اترك Build/Output فارغين في اللوحة (يُقرأ من `vercel.json`).
4. Deploy → **Redeploy** بعد كل push على `main`.

> **لا تستخدم** Root Directory = `frontend` مع إعداد الجذر الحالي — اختر طريقة واحدة فقط.

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
