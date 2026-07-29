-- Encrypted backup support + demo/ops wipe for org owner/admin.
-- Export is built client-side via api_list_tenant_sheets + api_batch_read.
-- Import/wipe are owner|admin only and never replace Users.

create or replace function app.require_tenant_admin()
returns void
language plpgsql stable security definer
set search_path = app, public
as $$
begin
  if app.current_tenant_id() is null then
    raise exception 'no active tenant';
  end if;
  if app.current_user_role() not in ('owner', 'admin') then
    raise exception 'forbidden: owner or admin only';
  end if;
end;
$$;

create or replace function app.backup_protected_sheets()
returns text[]
language sql immutable
as $$
  select array[
    'Users',
    'CompanySettings',
    'FormSettings',
    'ModuleManagement',
    'HelpCenter'
  ]::text[]
$$;

-- List registered sheets (admin metadata for export bundling).
create or replace function public.api_list_tenant_sheets()
returns jsonb
language plpgsql stable security definer
set search_path = app, public
as $$
begin
  perform app.require_tenant_admin();
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'name', s.name,
        'module_key', s.module_key,
        'is_config', coalesce(s.is_config, false),
        'protected', (s.name = any (app.backup_protected_sheets()))
      )
      order by s.name
    )
    from app.sheets s
  ), '[]'::jsonb);
end;
$$;

-- Import / replace one sheet (Users always rejected).
create or replace function public.api_import_tenant_sheet(
  p_sheet text,
  p_rows jsonb
)
returns jsonb
language plpgsql security definer
set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row jsonb;
  v_id text;
  v_count int := 0;
  v_exists boolean;
begin
  perform app.require_tenant_admin();
  if v_tenant is null then raise exception 'no active tenant'; end if;
  if p_sheet is null or length(trim(p_sheet)) = 0 then
    raise exception 'sheet required';
  end if;
  if p_sheet = 'Users' then
    return jsonb_build_object(
      'success', true,
      'skipped', true,
      'sheet', p_sheet,
      'message', 'Users sheet is excluded from restore'
    );
  end if;

  select exists(select 1 from app.sheets s where s.name = p_sheet) into v_exists;
  if not v_exists then
    raise exception 'unknown sheet: %', p_sheet;
  end if;

  perform app.guard_sheet(p_sheet, true);

  delete from app.records where tenant_id = v_tenant and sheet = p_sheet;

  if p_rows is not null and jsonb_typeof(p_rows) = 'array' then
    for v_row in select * from jsonb_array_elements(p_rows) loop
      v_id := coalesce(nullif(v_row->>'id', ''), gen_random_uuid()::text);
      insert into app.records(tenant_id, sheet, id, data)
      values (v_tenant, p_sheet, v_id, coalesce(v_row, '{}'::jsonb) - 'id');
      v_count := v_count + 1;
    end loop;
  end if;

  return jsonb_build_object('success', true, 'sheet', p_sheet, 'count', v_count);
end;
$$;

-- Upsert demo rows without wiping existing real data.
create or replace function public.api_upsert_demo_rows(
  p_sheet text,
  p_rows jsonb
)
returns jsonb
language plpgsql security definer
set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row jsonb;
  v_id text;
  v_data jsonb;
  v_count int := 0;
  v_exists boolean;
begin
  perform app.require_tenant_admin();
  if v_tenant is null then raise exception 'no active tenant'; end if;
  if p_sheet is null or length(trim(p_sheet)) = 0 then
    raise exception 'sheet required';
  end if;
  if p_sheet = 'Users' then
    raise exception 'cannot inject demo into Users';
  end if;

  select exists(select 1 from app.sheets s where s.name = p_sheet) into v_exists;
  if not v_exists then
    raise exception 'unknown sheet: %', p_sheet;
  end if;

  perform app.guard_sheet(p_sheet, true);

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('success', true, 'sheet', p_sheet, 'count', 0);
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_id := coalesce(nullif(v_row->>'id', ''), 'demo-' || gen_random_uuid()::text);
    v_data := (coalesce(v_row, '{}'::jsonb) - 'id')
      || jsonb_build_object('source', 'demo', '_demo', true);
    insert into app.records(tenant_id, sheet, id, data)
    values (v_tenant, p_sheet, v_id, v_data)
    on conflict (tenant_id, sheet, id)
    do update set data = excluded.data, updated_at = now();
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('success', true, 'sheet', p_sheet, 'count', v_count);
end;
$$;

-- Wipe demo-tagged rows, or wipe operational sheets (keeping protected ones).
create or replace function public.api_wipe_tenant_sheets(p_mode text)
returns jsonb
language plpgsql security definer
set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_mode text := lower(trim(coalesce(p_mode, '')));
  v_deleted int := 0;
  v_sheet text;
  v_count int;
  v_sheets text[] := array[]::text[];
begin
  perform app.require_tenant_admin();
  if v_tenant is null then raise exception 'no active tenant'; end if;

  if v_mode = 'demo' then
    delete from app.records r
     where r.tenant_id = v_tenant
       and r.sheet <> 'Users'
       and (
         coalesce(r.data->>'source', '') = 'demo'
         or coalesce((r.data->>'_demo')::boolean, false) = true
         or r.id like 'demo-%'
       );
    get diagnostics v_deleted = row_count;
    return jsonb_build_object('success', true, 'mode', 'demo', 'deleted', v_deleted);
  end if;

  if v_mode = 'ops' then
    select coalesce(array_agg(s.name order by s.name), array[]::text[])
      into v_sheets
      from app.sheets s
     where s.name <> all (app.backup_protected_sheets());

    foreach v_sheet in array v_sheets loop
      perform app.guard_sheet(v_sheet, true);
      delete from app.records
       where tenant_id = v_tenant and sheet = v_sheet;
      get diagnostics v_count = row_count;
      v_deleted := v_deleted + v_count;
    end loop;

    return jsonb_build_object(
      'success', true,
      'mode', 'ops',
      'deleted', v_deleted,
      'sheets', to_jsonb(v_sheets)
    );
  end if;

  raise exception 'invalid wipe mode (use demo or ops)';
end;
$$;

revoke all on function public.api_list_tenant_sheets() from public;
grant execute on function public.api_list_tenant_sheets() to authenticated;

revoke all on function public.api_import_tenant_sheet(text, jsonb) from public;
grant execute on function public.api_import_tenant_sheet(text, jsonb) to authenticated;

revoke all on function public.api_upsert_demo_rows(text, jsonb) from public;
grant execute on function public.api_upsert_demo_rows(text, jsonb) to authenticated;

revoke all on function public.api_wipe_tenant_sheets(text) from public;
grant execute on function public.api_wipe_tenant_sheets(text) to authenticated;
