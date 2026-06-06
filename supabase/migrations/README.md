# Supabase Migrations

تُوضع هنا ملفات الهجرة (SQL) بترتيب زمني، تُنشئ:

1. جداول الـ SaaS: `tenants`, `tenant_users`, `plans`, `subscriptions`, `invitations`, `audit_log`.
2. جداول الأعمال (~40) المُحوّلة من أوراق Google Sheets — كلها بعمود `tenant_id`.
3. سياسات **RLS** على كل جدول (`tenant_id = auth.jwt()->>'tenant_id'`).
4. الفهارس `(tenant_id, …)` + الـ triggers (`updated_at`).

> يُبدأ التنفيذ في Phase 1. التسمية المقترحة: `0001_saas_core.sql`, `0002_business_tables.sql`, `0003_rls_policies.sql`.
