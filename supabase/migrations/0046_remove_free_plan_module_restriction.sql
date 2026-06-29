-- Remove the "free plan modules must be subset of trial set" restriction.
-- Platform admin can now assign any module to the free plan.

create or replace function public.api_admin_set_plan_modules(p_plan_id text, p_modules jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_cnt int;
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;
  if p_modules is null or jsonb_typeof(p_modules) <> 'array' then
    raise exception 'p_modules must be a json array';
  end if;

  update app.plans set modules = p_modules where id = p_plan_id;
  get diagnostics v_cnt = row_count;
  if v_cnt = 0 then raise exception 'plan % not found', p_plan_id; end if;

  insert into app.audit_log (tenant_id, user_id, action, entity, entity_id, detail)
  values (null, app.current_user_id(), 'plan.modules_updated', 'plan', p_plan_id,
          jsonb_build_object('modules', p_modules));
  return jsonb_build_object('success', true, 'plan_id', p_plan_id, 'modules', p_modules);
end;
$$;

revoke all on function public.api_admin_set_plan_modules(text, jsonb) from public;
grant execute on function public.api_admin_set_plan_modules(text, jsonb) to authenticated;
