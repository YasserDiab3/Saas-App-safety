-- ============================================================
-- 0032_help_center.sql — Help center (readable by all members)
-- ============================================================

insert into app.sheets (name, module_key, is_config)
values ('HelpCenter', 'help', true)
on conflict (name) do update
  set module_key = excluded.module_key,
      is_config = excluded.is_config;

-- Add help to core modules (always available on every plan)
create or replace function app.core_module_keys()
returns text[]
language sql immutable
as $$ select array['dashboard','profile','help','settings','users','apptester','core']::text[] $$;

create or replace function public.api_get_help_center()
returns jsonb
language plpgsql
stable
security invoker
set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_data   jsonb;
begin
  if v_tenant is null then
    raise exception 'no active tenant';
  end if;
  perform app.guard_sheet('HelpCenter', false);

  select data into v_data
    from app.records
   where tenant_id = v_tenant
     and sheet = 'HelpCenter'
     and id = 'default'
   limit 1;

  if v_data is null then
    return jsonb_build_object('success', true, 'data', jsonb_build_object('sections', '[]'::jsonb, 'updatedAt', null));
  end if;

  return jsonb_build_object('success', true, 'data', v_data);
end;
$$;

create or replace function public.api_save_help_center(p_data jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_role   text := app.current_user_role();
  v_payload jsonb;
begin
  if v_tenant is null then
    raise exception 'no active tenant';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'forbidden: help center requires owner or admin';
  end if;

  perform app.guard_sheet('HelpCenter', true);

  v_payload := coalesce(p_data, '{}'::jsonb) || jsonb_build_object(
    'id', 'default',
    'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  insert into app.records(tenant_id, sheet, id, data)
  values (v_tenant, 'HelpCenter', 'default', v_payload - 'id')
  on conflict (tenant_id, sheet, id)
  do update set data = excluded.data, updated_at = now();

  return jsonb_build_object('success', true, 'id', 'default');
end;
$$;

grant execute on function public.api_get_help_center() to authenticated;
grant execute on function public.api_save_help_center(jsonb) to authenticated;
