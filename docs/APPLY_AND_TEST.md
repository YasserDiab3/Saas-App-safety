# تطبيق الهجرات واختبار الاتصال (Phase 1 + 2)

مشروع Supabase: `https://tbkajjarkqhsdiabufjv.supabase.co`

## 1) تطبيق الهجرات (خطوة يدوية مرة واحدة)

افتح **Supabase Dashboard → SQL Editor → New query**، ثم انسخ والصق محتوى كل
ملف بالترتيب واضغط Run:

1. `supabase/migrations/0001_saas_core.sql`
2. `supabase/migrations/0002_records_store.sql`
3. `supabase/migrations/0003_seed.sql`
4. `supabase/migrations/0004_provisioning.sql`
5. `supabase/migrations/0005_public_api.sql`
6. `supabase/migrations/0006_tenant_resolution.sql`

> أو عبر CLI: `supabase link --project-ref tbkajjarkqhsdiabufjv` ثم `supabase db push`.

### تحقق سريع (في SQL Editor)
```sql
select count(*) from app.plans;    -- المتوقع: 3
select count(*) from app.sheets;   -- المتوقع: ~62
```

## 2) إعداد Auth

Dashboard → **Authentication → Providers → Email**: فعّل Email signup.
للاختبار السريع: Dashboard → Authentication → **Settings** → عطّل
"Confirm email" مؤقتاً (حتى يعمل تسجيل الدخول فوراً بلا بريد تأكيد).

## 3) اختبار الاتصال (دون لمس التطبيق الرئيسي)

افتح `frontend/saas-test.html` في المتصفح (أو عبر `npx serve frontend`)، ثم:

1. **تسجيل حساب** (يُنشئ مستخدم Auth + profile تلقائياً عبر trigger).
2. **دخول**.
3. **إنشاء مؤسسة** → ينشئ tenant + عضوية owner + يضبط `default_tenant_id`.
   (بعدها يعمل عزل RLS مباشرة عبر `app.current_tenant_id()` — بلا service role.)
4. **إدراج صف تجريبي** ثم **قراءة الورقة** → يجب أن يظهر الصف.

### النتيجة المتوقعة
- القراءة قبل الإنشاء/الدخول: مصفوفة فارغة (RLS يمنع بلا tenant).
- بعد الإنشاء + الإدراج: يظهر الصف المُدرَج فقط لهذا المستأجر.
- إنشاء مستخدم/مؤسسة ثانية والتأكد أنه لا يرى صفوف الأول = **عزل صحيح**.

## ما الذي يعمل الآن (Phase 2)

عبر `SaaSAdapter.sendRequest({action,data})`:
- `login`, `readFromSheet`, `batchReadSheets`, `saveToSheet`, `appendToSheet`,
  `updateSingleRowInSheet` — جاهزة.
- أفعال CRUD المسماة الشائعة (`getAllMedications`, `addUserTask`, …) عبر خريطة
  `ACTION_MAP` + اصطلاح `getAllX`.

## ما لم يُنقل بعد (Phase 2b — يحتاج Edge Function بمنطق خادم)

مُدرجة في `BUSINESS_ACTIONS` داخل `saas-adapter.js` (تُرجِع خطأً واضحاً، لا فشل صامت):
- `addClinicVisit` / `updateClinicVisit` — خصم الأدوية الذرّي (+ LockService).
- `updateTaskCompletionRate` — دمج تقدّم كل مستخدم.
- `getUserTasksByUserId` — قراءة مُفلترة بالصلاحية.
- `getAllClinicVisits` — دمج جدولَي زيارات الموظفين والمقاولين.

تُنقَل هذه على دفعات في Phase 2b.

## ملاحظة عزل

`useSupabaseBackend` في `saas-config.js` = **false** الآن — التطبيق الرئيسي لم
يُحوَّل بعد. صفحة الاختبار مستقلة. يُقلب إلى true في Phase 3 بعد نجاح الاختبار.
الإنتاج (`clinic-repo`) لا يُمَس إطلاقاً.
