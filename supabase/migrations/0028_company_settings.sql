-- 0028_company_settings.sql — tenant branding / company settings sheet (core, survives plan upgrade)

insert into app.sheets (name, module_key, is_config)
values ('CompanySettings', 'core', true)
on conflict (name) do update
  set module_key = excluded.module_key,
      is_config = excluded.is_config;

-- Branding changes: owner/admin only (same as Users sheet policy)
create or replace function app.admin_only_sheets()
returns text[]
language sql immutable
as $$ select array['Users','ModuleManagement','SafetyTeamMembers','CompanySettings']::text[] $$;
