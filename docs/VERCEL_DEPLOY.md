# النشر على Vercel

المستودع: https://github.com/YasserDiab3/Saas-App-safety

## إعداد مشروع Vercel (مرة واحدة)
1. Vercel → **Add New → Project** → استورد `Saas-App-safety`.
2. **Root Directory** = `frontend`  ← مهم (الموقع داخل مجلد frontend).
3. Framework Preset = **Other** (موقع ثابت، بلا build).
4. Build Command = (فارغ) · Output Directory = (فارغ، لأن Root = frontend).
5. Deploy.

> `vercel.json` في الجذر يضبط cleanUrls + rewrite للجذر. مع Root=frontend
> يخدم Vercel ملفات الواجهة مباشرة.

## بعد النشر
- الرابط سيفتح `index.html` → بوابة SaaS (`useSupabaseBackend=true`) →
  إن لا توجد جلسة Supabase → تحويل إلى `login.html`.
- جديد؟ افتح `/signup.html` → أنشئ حساب + مؤسسة → يفتح التطبيق على Supabase.
- صفحة اختبار الاتصال المعزولة: `/saas-test.html`.

## ملاحظات
- مفتاح anon عام (آمن في المتصفح، محميّ بـ RLS) — وجوده في الريبو طبيعي.
- لتفعيل تأكيد البريد لاحقاً: Supabase → Auth → عطّل autoconfirm.
- الفوترة (Stripe) تحتاج نشر الـ Edge Functions + الأسرار (انظر BILLING_AND_DEPLOY.md).
- CORS: استدعاءات Supabase تعمل من أي دومين عبر anon key — لا إعداد إضافي.
