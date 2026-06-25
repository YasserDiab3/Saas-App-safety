-- 0030_form_settings.sql — tenant form settings (sites, places, departments, safety team)

insert into app.sheets (name, module_key, is_config)
values ('FormSettings', 'core', true)
on conflict (name) do update
  set module_key = excluded.module_key,
      is_config = excluded.is_config;

create or replace function app.admin_only_sheets()
returns text[]
language sql immutable
as $$ select array['Users','ModuleManagement','SafetyTeamMembers','CompanySettings','FormSettings']::text[] $$;
