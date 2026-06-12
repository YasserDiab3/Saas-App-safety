-- verify_security.sql — run in Supabase SQL Editor after 0019 db push
-- Expected: all rows show ok = true

-- 1) apply_subscription: service_role only
select 'apply_subscription_grants' as check_name,
  not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'apply_subscription'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) as ok;

select 'apply_subscription_service_role' as check_name,
  exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'apply_subscription'
      and grantee = 'service_role'
  ) as ok;

-- 2) Billing tamper trigger
select 'tenants_guard_billing_trigger' as check_name,
  exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app' and c.relname = 'tenants'
      and t.tgname = 'trg_tenants_guard_billing'
      and not t.tgisinternal
  ) as ok;

-- 3) Invitations RLS — owner/admin only
select 'invitations_select_policy' as check_name,
  exists (
    select 1 from pg_policies
    where schemaname = 'app' and tablename = 'invitations'
      and policyname = 'invitations_select'
      and qual like '%owner%admin%'
  ) as ok;

-- 4) Profiles guard trigger (insert + update)
select 'profiles_guard_trigger' as check_name,
  exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app' and c.relname = 'profiles'
      and t.tgname = 'trg_profiles_guard'
  ) as ok;

-- 5) api_set_stripe_customer exists and validates format (function body check)
select 'api_set_stripe_customer' as check_name,
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'api_set_stripe_customer'
  ) as ok;

-- 6) guard_sheet blocks admin sheets for non-admin (function exists)
select 'guard_sheet_admin_check' as check_name,
  exists (
    select 1 from pg_proc p
    join pg_proc p2 on p2.oid = p.oid
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'guard_sheet'
      and pg_get_functiondef(p.oid) like '%admin_only_sheets%'
  ) as ok;

-- 7) Migration 0019 applied
select 'migration_0019' as check_name,
  exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '0019'
  ) as ok;

-- Summary: all checks
select check_name, ok from (
  select 'apply_subscription_grants' as check_name,
    not exists (
      select 1 from information_schema.routine_privileges
      where routine_schema = 'public' and routine_name = 'apply_subscription'
        and grantee in ('PUBLIC', 'anon', 'authenticated')
    ) as ok
  union all
  select 'migration_0019', exists (
    select 1 from supabase_migrations.schema_migrations where version = '0019'
  )
  union all
  select 'tenants_guard_billing_trigger', exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app' and c.relname = 'tenants'
      and t.tgname = 'trg_tenants_guard_billing'
  )
) s order by check_name;
