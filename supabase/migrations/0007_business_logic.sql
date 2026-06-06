-- ============================================================
-- 0007_business_logic.sql
-- Server-side business actions ported from Apps Script as ATOMIC
-- Postgres RPCs. A function body = one transaction; SELECT ... FOR UPDATE
-- gives true row-level locking → replaces the old LockService, no races,
-- no double-deduction. All run SECURITY INVOKER so RLS scopes them to the
-- caller's tenant.
-- ============================================================

-- ------------------------------------------------------------
-- Clinic visit + atomic medication deduction.
-- p_sheet     : 'ClinicVisits' | 'ClinicContractorVisits'
-- p_visit     : the visit row (object; may include id)
-- p_adjustments: [{ medicationId, delta }]  (delta>0 = dispense/reduce)
-- ------------------------------------------------------------
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
begin
  if v_tenant is null then raise exception 'no active tenant'; end if;

  -- upsert the visit row
  insert into app.records(tenant_id, sheet, id, data)
  values (v_tenant, p_sheet, v_visit_id, (p_visit - 'id') - 'medicationAdjustments' - '__timeoutMs')
  on conflict (tenant_id, sheet, id)
  do update set data = excluded.data, updated_at = now();

  -- apply medication adjustments atomically
  if p_adjustments is not null and jsonb_typeof(p_adjustments) = 'array' then
    for v_adj in select * from jsonb_array_elements(p_adjustments) loop
      v_delta := coalesce(nullif(v_adj->>'delta','')::numeric, 0);
      v_medid := v_adj->>'medicationId';
      if v_delta = 0 or v_medid is null then continue; end if;

      -- lock the medication row for this tenant
      select data into v_data from app.records
       where tenant_id = v_tenant and sheet = 'Medications' and id = v_medid
       for update;
      if not found then v_failed := v_failed + 1; continue; end if;

      -- empty-string-safe numeric parsing (mirrors production fix)
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

-- ------------------------------------------------------------
-- Merge employee + contractor clinic visits (mirrors getAllClinicVisits)
-- ------------------------------------------------------------
create or replace function public.api_get_all_clinic_visits()
returns jsonb
language sql stable security invoker set search_path = app, public
as $$
  select coalesce(jsonb_agg(data || jsonb_build_object('id', id)), '[]'::jsonb)
  from app.records
  where tenant_id = app.current_tenant_id()
    and sheet in ('ClinicVisits', 'ClinicContractorVisits')
$$;

-- ------------------------------------------------------------
-- Per-user task completion (mirrors updateTaskCompletionRate)
-- ------------------------------------------------------------
create or replace function public.api_update_task_completion(p_task_id text, p_rate numeric)
returns jsonb
language plpgsql security invoker set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_uid    text := app.current_user_id()::text;
  v_status text;
  v_cnt    int;
begin
  if p_rate is null or p_rate < 0 or p_rate > 100 then
    raise exception 'completion rate must be 0..100';
  end if;
  v_status := case when p_rate >= 100 then 'مكتمل'
                   when p_rate > 0   then 'قيد التنفيذ'
                   else 'جديدة' end;

  update app.records
     set data = data
        || jsonb_build_object('completionRate', p_rate, 'status', v_status)
        || jsonb_build_object('userProgress',
             coalesce(data->'userProgress','{}'::jsonb)
             || jsonb_build_object(v_uid, jsonb_build_object('completionRate', p_rate, 'updatedAt', now()))),
         updated_at = now()
   where tenant_id = v_tenant and sheet = 'UserTasks' and id = p_task_id;
  get diagnostics v_cnt = row_count;
  return jsonb_build_object('success', v_cnt > 0, 'id', p_task_id);
end;
$$;

-- ------------------------------------------------------------
-- Access-filtered user tasks (mirrors getUserTasksByUserId).
-- Covers: assigned to all / direct / array membership.
-- (Department matching can be added later from profiles metadata.)
-- ------------------------------------------------------------
create or replace function public.api_get_user_tasks(p_user_id text)
returns jsonb
language sql stable security invoker set search_path = app, public
as $$
  select coalesce(jsonb_agg(data || jsonb_build_object('id', id)), '[]'::jsonb)
  from app.records r
  where r.tenant_id = app.current_tenant_id()
    and r.sheet = 'UserTasks'
    and (
      (r.data->>'assignedTo') in ('all','جميع المستخدمين')
      or (r.data->>'assignedTo') = p_user_id
      or (jsonb_typeof(r.data->'assignedTo') = 'array' and (r.data->'assignedTo') ? p_user_id)
    )
$$;

grant execute on function
  public.api_add_clinic_visit(text, jsonb, jsonb),
  public.api_get_all_clinic_visits(),
  public.api_update_task_completion(text, numeric),
  public.api_get_user_tasks(text)
  to authenticated;
