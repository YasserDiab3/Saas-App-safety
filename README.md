# HSE SaaS — Multi-Tenant Safety Management Platform

نسخة **SaaS مستقلة** من نظام إدارة السلامة (HSE)، معزولة تماماً عن نسخة الإنتاج
(`clinic-repo`). تُبنى على **Supabase (Postgres + Auth + RLS + Storage)** مع فوترة
**Stripe**، وتُعيد استخدام واجهة المستخدم الحالية (SPA عربي RTL، 38 مديول).

> ⚠️ **عزل صارم:** هذا المستودع لا يشارك أي مورد مع الإنتاج — لا Git remote،
> لا Apps Script، لا spreadsheet، لا Vercel/Stripe مشترك. الإنتاج مرجع للقراءة فقط.

---

## البنية

```
clinic-saas/
├── frontend/              # SPA (منسوخ من الإنتاج، يُعاد استخدامه)
│   └── js/modules/services/google-integration.js  ← نقطة تبديل النقل
├── supabase/
│   ├── migrations/        # مخطّط Postgres + سياسات RLS
│   └── functions/
│       ├── api/           # موجّه actions متوافق مع عقد {action,data}
│       └── stripe-webhook/# تكامل الفوترة
└── docs/                  # المعمارية + دليل النشر
```

## المعمارية (مختصر)

| الطبقة | التقنية |
|--------|---------|
| قاعدة البيانات | Supabase / Postgres + `tenant_id` + RLS |
| المصادقة | Supabase Auth (JWT يحمل `tenant_id`) |
| التخزين | Supabase Storage (مرفقات) |
| طبقة API | Edge Functions — موجّه actions (Strangler-Fig) |
| الفوترة | Stripe Billing |
| الواجهة | SPA حالي على Vercel جديد |

**الركيزة:** الواجهة تمر عبر `GoogleIntegration.sendRequest({action,data})`.
ببناء backend يحترم نفس العقد ثم تبديل طبقة النقل → تعمل المديولات الـ38 دون إعادة كتابة.

## تعدد المستأجرين

Postgres مشترك + عمود `tenant_id` على كل جدول + سياسات **RLS**:
`tenant_id = auth.jwt() ->> 'tenant_id'`. عزل كامل على مستوى قاعدة البيانات.

## الإعداد المحلي (لاحقاً)

1. مشروع Supabase جديد → نسخ `URL` و `anon key` إلى `.env` (انظر `.env.example`).
2. تشغيل migrations: `supabase db push`.
3. نشر الـ functions: `supabase functions deploy`.
4. الواجهة: نشر `frontend/` على مشروع Vercel جديد.

## خطة التنفيذ

انظر `docs/ARCHITECTURE.md` و ملف الخطة المعتمد.
