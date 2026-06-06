-- ============================================================
-- 0005_public_api.sql
-- Public RPC wrappers — the ONLY surface the frontend touches.
--
-- WHY: PostgREST exposes only the `public` (and graphql_public) schema.
-- We keep all data in `app` (NOT REST-exposed) and expose a tiny set of
-- SECURITY INVOKER wrappers in `public`. RLS on app.records still applies
-- (functions run as the calling user), so tenant isolation is enforced.
-- The frontend calls these via supabase.rpc('<name>', {...}).
-- ============================================================

-- read all rows of a sheet (active tenant) → array of row objects (id merged in)
create or replace function public.api_read_sheet(p_sheet text)
returns jsonb
language sql
stable
security invoker
set search_path = app, public
as $$
  select coalesce(
    jsonb_agg(data || jsonb_build_object('id', id)),
    '[]'::jsonb
  )
  from app.records
  where tenant_id = app.current_tenant_id()
    and sheet = p_sheet
$$;

-- read several sheets at once → { sheetName: [rows...] }  (mirrors batchReadSheets)
create or replace function public.api_batch_read(p_sheets text[])
returns jsonb
language sql
stable
security invoker
set search_path = app, public
as $$
  select coalesce(jsonb_object_agg(s, rows), '{}'::jsonb)
  from (
    select s,
           coalesce((
             select jsonb_agg(r.data || jsonb_build_object('id', r.id))
             from app.records r
             where r.tenant_id = app.current_tenant_id() and r.sheet = s
           ), '[]'::jsonb) as rows
    from unnest(p_sheets) as s
  ) t
$$;

-- append OR update one row by id
create or replace function public.api_upsert(p_sheet text, p_id text, p_data jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
begin
  if v_tenant is null then raise exception 'no active tenant'; end if;
  insert into app.records(tenant_id, sheet, id, data)
  values (v_tenant, p_sheet, p_id, coalesce(p_data,'{}'::jsonb) - 'id')
  on conflict (tenant_id, sheet, id)
  do update set data = excluded.data, updated_at = now();
  return jsonb_build_object('success', true, 'id', p_id);
end;
$$;

-- merge-patch one row by id
create or replace function public.api_patch(p_sheet text, p_id text, p_patch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_found  int;
begin
  if v_tenant is null then raise exception 'no active tenant'; end if;
  update app.records
     set data = data || (coalesce(p_patch,'{}'::jsonb) - 'id'), updated_at = now()
   where tenant_id = v_tenant and sheet = p_sheet and id = p_id;
  get diagnostics v_found = row_count;
  return jsonb_build_object('success', v_found > 0, 'id', p_id);
end;
$$;

-- delete one row by id
create or replace function public.api_delete(p_sheet text, p_id text)
returns jsonb
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_found int;
begin
  delete from app.records
   where tenant_id = app.current_tenant_id() and sheet = p_sheet and id = p_id;
  get diagnostics v_found = row_count;
  return jsonb_build_object('success', v_found > 0);
end;
$$;

-- replace ALL rows of a sheet (mirrors saveToSheet bulk write) — transactional
create or replace function public.api_replace_sheet(p_sheet text, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row    jsonb;
  v_id     text;
  v_count  int := 0;
begin
  if v_tenant is null then raise exception 'no active tenant'; end if;

  delete from app.records where tenant_id = v_tenant and sheet = p_sheet;

  if p_rows is not null and jsonb_typeof(p_rows) = 'array' then
    for v_row in select * from jsonb_array_elements(p_rows)
    loop
      v_id := coalesce(v_row ->> 'id', gen_random_uuid()::text);
      insert into app.records(tenant_id, sheet, id, data)
      values (v_tenant, p_sheet, v_id, v_row - 'id');
      v_count := v_count + 1;
    end loop;
  end if;

  return jsonb_build_object('success', true, 'count', v_count);
end;
$$;

-- provision a tenant for the current user (onboarding) — thin public wrapper
create or replace function public.api_provision_tenant(p_name text)
returns jsonb
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_tenant uuid;
begin
  v_tenant := app.create_tenant_for_current_user(p_name);
  return jsonb_build_object('success', true, 'tenant_id', v_tenant);
end;
$$;

-- grants
grant execute on function
  public.api_read_sheet(text),
  public.api_batch_read(text[]),
  public.api_upsert(text, text, jsonb),
  public.api_patch(text, text, jsonb),
  public.api_delete(text, text),
  public.api_replace_sheet(text, jsonb),
  public.api_provision_tenant(text)
  to authenticated;
