-- 0041: api_add_clinic_visit — guard Medications sheet only when dispensing meds.
-- Previously every visit write required Medications write guard, which could block
-- clinic staff from recording visits without inventory changes.

create or replace function public.api_add_clinic_visit(
  p_sheet text, p_visit jsonb, p_adjustments jsonb
) returns jsonb
language plpgsql security invoker set search_path = app, public
as $$
declare
  v_tenant   uuid := app.current_tenant_id();
  v_visit_id text := coalesce(nullif(p_visit->>'id',''), gen_random_uuid()::text);
  v_adj   jsonb;
  v_medid text;
  v_data  jsonb;
  v_cur   numeric; v_cap numeric; v_delta numeric; v_new numeric;
  v_applied int := 0; v_failed int := 0;
  v_has_med_adj boolean := false;
begin
  perform app.guard_sheet(p_sheet, true);
  if v_tenant is null then raise exception 'no active tenant'; end if;

  if p_adjustments is not null and jsonb_typeof(p_adjustments) = 'array' then
    select exists (
      select 1
        from jsonb_array_elements(p_adjustments) el
       where coalesce(nullif(el->>'delta','')::numeric, 0) <> 0
         and nullif(el->>'medicationId','') is not null
    ) into v_has_med_adj;
  end if;

  if v_has_med_adj then
    perform app.guard_sheet('Medications', true);
  end if;

  insert into app.records(tenant_id, sheet, id, data)
  values (v_tenant, p_sheet, v_visit_id, (p_visit - 'id') - 'medicationAdjustments' - '__timeoutMs')
  on conflict (tenant_id, sheet, id)
  do update set data = excluded.data, updated_at = now();

  if p_adjustments is not null and jsonb_typeof(p_adjustments) = 'array' then
    for v_adj in select * from jsonb_array_elements(p_adjustments) loop
      v_delta := coalesce(nullif(v_adj->>'delta','')::numeric, 0);
      v_medid := v_adj->>'medicationId';
      if v_delta = 0 or v_medid is null then continue; end if;

      select data into v_data from app.records
       where tenant_id = v_tenant and sheet = 'Medications' and id = v_medid
       for update;
      if not found then v_failed := v_failed + 1; continue; end if;

      v_cur := nullif(v_data->>'remainingQuantity','')::numeric;
      if v_cur is null then v_cur := coalesce(nullif(v_data->>'quantity','')::numeric, 0); end if;
      v_cap := nullif(v_data->>'quantityAdded','')::numeric;
      if v_cap is null then v_cap := coalesce(nullif(v_data->>'quantity','')::numeric, 0); end if;
      if v_cap <= 0 then v_cap := greatest(v_cur, abs(v_delta)); end if;

      v_new := v_cur - v_delta;
      if v_new < 0 then v_new := 0; end if;
      if v_new > v_cap then v_new := v_cap; end if;

      update app.records
         set data = data || jsonb_build_object(
               'remainingQuantity', v_new,
               'quantityAdded', v_cap,
               'status', case when v_new = 0 then 'منتهي'
                              when v_new <= 10 then 'منخفض'
                              else coalesce(v_data->>'status','ساري') end),
             updated_at = now()
       where tenant_id = v_tenant and sheet = 'Medications' and id = v_medid;
      v_applied := v_applied + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'success', true, 'visitId', v_visit_id,
    'medicationAdjustmentsResult', jsonb_build_object('applied', v_applied, 'failed', v_failed)
  );
end;
$$;
