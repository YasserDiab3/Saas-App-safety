-- Enterprise foundations: compliance sheet + BI export RPC (service_role only).

insert into app.sheets (name, module_key, is_config) values
  ('ComplianceProgram', 'settings', true)
on conflict (name) do nothing;

create or replace function public.api_bi_export_sheet(
  p_tenant uuid,
  p_sheet text,
  p_limit int default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = app, public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 500), 2000));
  v_rows jsonb;
begin
  if p_tenant is null then
    raise exception 'tenant required';
  end if;
  if p_sheet is null or length(trim(p_sheet)) = 0 then
    raise exception 'sheet required';
  end if;

  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
    into v_rows
    from (
      select (r.data || jsonb_build_object('id', r.id, 'updated_at', r.updated_at)) as row_data
        from app.records r
       where r.tenant_id = p_tenant
         and r.sheet = p_sheet
       order by r.updated_at desc nulls last
       limit v_limit
    ) q;

  return v_rows;
end;
$$;

revoke all on function public.api_bi_export_sheet(uuid, text, int) from public;
grant execute on function public.api_bi_export_sheet(uuid, text, int) to service_role;

comment on function public.api_bi_export_sheet(uuid, text, int) is
  'Service-role BI/ERP snapshot export; called by Edge bi-export only';
