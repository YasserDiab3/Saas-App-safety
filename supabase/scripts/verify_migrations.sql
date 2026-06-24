-- verify_migrations.sql — run in Supabase SQL Editor after db push
-- Expected: all checks return ok = true

-- 1) Core SaaS tables
select 'plans' as check_name, (select count(*) = 3 from app.plans) as ok
union all
select 'sheets', (select count(*) >= 60 from app.sheets)
union all
select 'records_rls', (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app' and c.relname = 'records');

-- 2) Phase 2b business RPCs (0007)
select 'api_add_clinic_visit' as fn, exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'api_add_clinic_visit'
) as ok
union all
select 'api_get_all_clinic_visits', exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'api_get_all_clinic_visits'
)
union all
select 'api_update_task_completion', exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'api_update_task_completion'
)
union all
select 'api_get_user_tasks', exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'api_get_user_tasks'
);

-- 3) Billing RPCs (0008 + 0011)
select 'api_billing_status' as fn, exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'api_billing_status'
) as ok
union all
select 'apply_subscription_public', exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'apply_subscription'
);

-- 4) Security hardening (0009)
select 'api_me' as fn, exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'api_me'
) as ok
union all
select 'current_user_role', exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app' and p.proname = 'current_user_role'
)
union all
select 'tenant_is_writable', exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app' and p.proname = 'tenant_is_writable'
);

-- 5) Platform admin (0010)
select 'is_platform_admin_col' as check_name, exists(
  select 1 from information_schema.columns
  where table_schema = 'app' and table_name = 'profiles' and column_name = 'is_platform_admin'
) as ok
union all
select 'api_admin_list_plans', exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'api_admin_list_plans'
);

-- 6) Storage bucket (0012)
select 'storage_bucket' as check_name, exists(
  select 1 from storage.buckets where id = 'tenant-attachments'
) as ok
union all
select 'storage_policies', (
  select count(*) >= 4 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'tenant_attachments_%'
);

-- 7) Platform ops dashboard (0021)
select 'api_admin_overview' as fn, exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'api_admin_overview'
) as ok
union all
select 'api_admin_list_tenants', exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'api_admin_list_tenants'
)
union all
select 'api_admin_get_tenant', exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'api_admin_get_tenant'
)
union all
select 'api_admin_list_users', exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'api_admin_list_users'
)
union all
select 'api_admin_list_billing', exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'api_admin_list_billing'
)
union all
select 'api_admin_update_tenant', exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'api_admin_update_tenant'
)
union all
select 'api_admin_set_member', exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'api_admin_set_member'
);

-- 8) Migration history (CLI tracking) — expect 25 rows after 0025
select version, name from supabase_migrations.schema_migrations order by version;
select 'migration_count' as check_name, (select count(*) = 25 from supabase_migrations.schema_migrations) as ok;
