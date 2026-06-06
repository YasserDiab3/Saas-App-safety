# نموذج البيانات + تطبيق الهجرات

## الملفات (بالترتيب)

| الملف | المحتوى |
|------|---------|
| `0001_saas_core.sql` | schema `app`، دوال مساعدة (`current_tenant_id`, `current_user_id`, `set_updated_at`)، جداول SaaS (`plans`, `tenants`, `profiles`, `tenant_users`, `subscriptions`, `invitations`, `audit_log`) + RLS |
| `0002_records_store.sql` | المخزن العام المتوافق مع الأوراق: `app.records (tenant_id, sheet, id, data jsonb)` + `app.sheets` (سجل الأوراق) + RLS + RPCs (`read_sheet`, `upsert_record`, `patch_record`, `delete_record`) |
| `0003_seed.sql` | بذر الخطط (free/pro/enterprise) + سجل الأوراق الكامل (~62 ورقة) |
| `0004_provisioning.sql` | إنشاء profile تلقائياً عند التسجيل + RPC `create_tenant_for_current_user` + الصلاحيات |

## لماذا مخزن عام (`app.records`) بدل 40 جدول؟

الواجهة تتعامل مع الـ backend عبر **عقد شبيه بالأوراق** فقط:
`readFromSheet / saveToSheet / appendToSheet / updateSingleRowInSheet`
تتبادل **كائنات صفوف كاملة**. لذا:
- مخزن `(tenant_id, sheet, id, data jsonb)` يُعيد إنتاج العقد **حرفياً**.
- عزل المستأجر بسياسة RLS **واحدة**.
- **بلا انجراف مخطّط**: أي ورقة/عمود جديد لا يحتاج migration.
- لاحقاً: يمكن إسقاط الكيانات التحليلية المهمة في **VIEWS** مكتوبة دون لمس مسار الكتابة.

## تعدد المستأجرين (RLS)

كل صف في `app.records` (وكل جداول الأعمال) مربوط بـ `tenant_id`. السياسة:
```sql
using (tenant_id = app.current_tenant_id())
with check (tenant_id = app.current_tenant_id())
```
حيث `app.current_tenant_id()` تقرأ `tenant_id` من **JWT** (app_metadata).
الـ Edge Function (`/api`) لا يثق بأي `tenant_id` من جسم الطلب — فقط من الـ JWT.

## ربط الـ JWT بالمستأجر

عند إنشاء/اختيار مؤسسة، يضبط الـ backend (service role) المطالبة
`app_metadata.tenant_id` للمستخدم → تظهر في كل JWT تالٍ → RLS يعمل تلقائياً.
(يُنفَّذ في Edge Function للـ onboarding — Phase 4.)

## التطبيق (عند إنشاء مشروع Supabase)

```bash
# مرة واحدة
supabase link --project-ref <YOUR_REF>
# تطبيق كل الهجرات بالترتيب
supabase db push
```
أو لصق محتوى الملفات بالترتيب في SQL Editor داخل لوحة Supabase.

## التحقق السريع بعد التطبيق

```sql
select count(*) from app.plans;    -- = 3
select count(*) from app.sheets;   -- ~62
-- اختبار العزل: عيّن claim tenant_id لمستأجرين مختلفين وتأكد أن كلاً يرى صفوفه فقط
```
