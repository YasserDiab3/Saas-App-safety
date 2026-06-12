-- verify_platform_setup.sql — auth + platform admin + core data checks
-- Run in Supabase SQL Editor after signup / set_platform_admin.sql

-- Users matching QHSSE domain
select id, email, email_confirmed_at is not null as email_confirmed, created_at
  from auth.users
 where email ilike '%qhsseconsultant%' or email ilike '%yasser%'
 order by created_at desc;

-- Platform admins
select u.email, p.is_platform_admin, t.name as default_tenant
  from app.profiles p
  join auth.users u on u.id = p.id
  left join app.tenants t on t.id = p.default_tenant_id
 where p.is_platform_admin = true;

-- Core counts
select 'plans' as item, count(*)::text as val from app.plans
union all select 'sheets', count(*)::text from app.sheets
union all select 'tenants', count(*)::text from app.tenants
union all select 'migrations', count(*)::text from supabase_migrations.schema_migrations;

-- Storage bucket (0012)
select id, name, public from storage.buckets where id = 'tenant-attachments';
