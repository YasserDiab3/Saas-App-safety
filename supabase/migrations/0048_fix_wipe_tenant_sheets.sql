-- Fix wipe ops/demo: admin wipe must not fail on plan module gating,
-- and demo tag matching must tolerate non-boolean JSON text.

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
  v_skipped text[] := array[]::text[];
begin
  perform app.require_tenant_admin();
  if v_tenant is null then raise exception 'no active tenant'; end if;

  if not app.tenant_is_writable() then
    raise exception 'tenant is read-only: cannot wipe while frozen/past_due/unpaid';
  end if;

  if v_mode = 'demo' then
    delete from app.records r
     where r.tenant_id = v_tenant
       and r.sheet <> 'Users'
       and (
         lower(coalesce(r.data->>'source', '')) = 'demo'
         or lower(coalesce(r.data->>'_demo', '')) in ('true', 't', '1', 'yes')
         or r.id like 'demo-%'
       );
    get diagnostics v_deleted = row_count;
    return jsonb_build_object('success', true, 'mode', 'demo', 'deleted', v_deleted);
  end if;

  if v_mode = 'ops' then
    -- Owner/admin wipe of own operational data: skip per-sheet plan module gating
    -- so restricted trial modules do not abort the whole wipe.
    select coalesce(array_agg(s.name order by s.name), array[]::text[])
      into v_sheets
      from app.sheets s
     where s.name <> all (app.backup_protected_sheets());

    foreach v_sheet in array v_sheets loop
      begin
        delete from app.records
         where tenant_id = v_tenant and sheet = v_sheet;
        get diagnostics v_count = row_count;
        v_deleted := v_deleted + v_count;
      exception when others then
        v_skipped := array_append(v_skipped, v_sheet || ': ' || SQLERRM);
      end;
    end loop;

    return jsonb_build_object(
      'success', true,
      'mode', 'ops',
      'deleted', v_deleted,
      'sheets', to_jsonb(v_sheets),
      'skipped', to_jsonb(v_skipped)
    );
  end if;

  raise exception 'invalid wipe mode (use demo or ops)';
end;
$$;

revoke all on function public.api_wipe_tenant_sheets(text) from public;
grant execute on function public.api_wipe_tenant_sheets(text) to authenticated;
