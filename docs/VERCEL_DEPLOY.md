# النشر على Vercel

المستودع: https://github.com/YasserDiab3/Saas-App-safety

## إعداد مشروع Vercel (مرة واحدة)
الطريقة الأبسط (لا تحتاج أي إعداد في اللوحة — `vercel.json` يتكفّل بكل شيء):
1. Vercel → **Add New → Project** → استورد `Saas-App-safety`.
2. Root Directory = **اتركه على الجذر** (`./`).
3. Framework Preset = **Other** · Build Command = (فارغ) · Output Directory = (فارغ).
4. Deploy → ثم **Redeploy** بعد آخر push.

> `vercel.json` في الجذر يعيد توجيه كل المسارات إلى `/frontend/...`
> (`/` → `/frontend/index.html` و `/(.*)` → `/frontend/$1`)، فيُخدَم الموقع
> من داخل مجلد frontend دون ضبط Root Directory.

> بديل: يمكن بدلاً من ذلك ضبط **Root Directory = `frontend`** في اللوحة
> (حينها يُتجاهل rewrite الجذر ويُخدَم index.html مباشرة). أي الطريقتين تعمل.

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
