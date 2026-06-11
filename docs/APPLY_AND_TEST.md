# تطبيق الهجرات واختبار الاتصال (Phase 1 + 2)

مشروع Supabase: `https://tbkajjarkqhsdiabufjv.supabase.co`

## 1) تطبيق الهجرات (خطوة يدوية مرة واحدة)

افتح **Supabase Dashboard → SQL Editor → New query**، ثم انسخ والصق محتوى كل
ملف بالترتيب واضغط Run:

1. `0001_saas_core.sql` … `0011_billing_fixes.sql` (11 ملفاً بالترتيب)

> **CLI (موصى به):**
> ```bash
> supabase link --project-ref tbkajjarkqhsdiabufjv
> supabase db push --yes
> supabase migration list   # Local = Remote لكل 0001–0011
> ```
> إن كانت 0001–0006 مطبّقة يدوياً سابقاً: `supabase migration repair 0001 --status applied` … حتى 0006، ثم `db push`.

**تحقق بعد التطبيق:** `supabase/scripts/verify_migrations.sql` في SQL Editor.

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

## Phase 2b — منطق الأعمال (0007 — مطبّق)

RPCs ذرّية + ربط في `saas-adapter.js`:
- `addClinicVisit` / `updateClinicVisit` → `api_add_clinic_visit`
- `getAllClinicVisits` → `api_get_all_clinic_visits`
- `updateTaskCompletionRate` → `api_update_task_completion`
- `getUserTasksByUserId` → `api_get_user_tasks`

اختبار تفصيلي: `docs/SUPABASE_MODULE_TEST_CHECKLIST.md` §4.

## ملاحظة عزل

`useSupabaseBackend` في `saas-config.js` = **true** — التطبيق يستخدم Supabase.
Checklist شامل: `docs/SUPABASE_MODULE_TEST_CHECKLIST.md`.
الإنتاج (`clinic-repo`) لا يُمَس إطلاقاً.
