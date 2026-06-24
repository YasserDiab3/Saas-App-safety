-- ============================================================
-- 0024_platform_admin_actions.sql
-- Platform admin write actions: tenant status/plan/trial, member role/status.
-- ============================================================

-- ------------------------------------------------------------
-- Update tenant: status, plan, trial (bypasses tenants_guard_billing).
-- p_extend_trial_days: add N days from max(now(), current trial_ends_at).
-- ------------------------------------------------------------
create or replace function public.api_admin_update_tenant(
  p_tenant_id uuid,
  p_status text default null,
  p_plan_id text default null,
  p_trial_ends_at timestamptz default null,
  p_extend_trial_days int default null
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_tenant app.tenants%rowtype;
  v_new_trial timestamptz;
  v_detail jsonb := '{}'::jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;
  if p_tenant_id is null then
    raise exception 'p_tenant_id required';
  end if;

  select * into v_tenant from app.tenants where id = p_tenant_id;
  if not found then
    raise exception 'tenant not found';
  end if;

  if p_status is not null then
    if p_status not in ('trialing', 'active', 'past_due', 'frozen', 'canceled') then
      raise exception 'invalid status: %', p_status;
    end if;
  end if;

  if p_plan_id is not null and not exists (select 1 from app.plans where id = p_plan_id) then
    raise exception 'unknown plan: %', p_plan_id;
  end if;

  if p_extend_trial_days is not null then
    if p_extend_trial_days < 1 or p_extend_trial_days > 365 then
      raise exception 'p_extend_trial_days must be between 1 and 365';
    end if;
    v_new_trial := greatest(coalesce(v_tenant.trial_ends_at, now()), now())
                   + make_interval(days => p_extend_trial_days);
  elsif p_trial_ends_at is not null then
    v_new_trial := p_trial_ends_at;
  end if;

  alter table app.tenants disable trigger trg_tenants_guard_billing;
  begin
    update app.tenants t
       set status = coalesce(p_status, t.status),
           plan_id = coalesce(p_plan_id, t.plan_id),
           trial_ends_at = coalesce(v_new_trial, t.trial_ends_at),
           updated_at = now()
     where t.id = p_tenant_id;
  exception when others then
    alter table app.tenants enable trigger trg_tenants_guard_billing;
    raise;
  end;
  alter table app.tenants enable trigger trg_tenants_guard_billing;

  if p_status is not null then
    v_detail := v_detail || jsonb_build_object('status', p_status);
  end if;
  if p_plan_id is not null then
    v_detail := v_detail || jsonb_build_object('plan_id', p_plan_id);
  end if;
  if v_new_trial is not null then
    v_detail := v_detail || jsonb_build_object('trial_ends_at', v_new_trial);
  end if;

  insert into app.audit_log (tenant_id, user_id, action, entity, entity_id, detail)
  values (p_tenant_id, app.current_user_id(), 'admin.tenant_updated', 'tenant', p_tenant_id::text, v_detail);

  return public.api_admin_get_tenant(p_tenant_id);
end;
$$;

-- ------------------------------------------------------------
-- Update member role and/or status within a tenant.
-- ------------------------------------------------------------
create or replace function public.api_admin_set_member(
  p_tenant_id uuid,
  p_user_id uuid,
  p_role text default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_cnt int;
  v_detail jsonb := '{}'::jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;
  if p_tenant_id is null or p_user_id is null then
    raise exception 'p_tenant_id and p_user_id required';
  end if;
  if p_role is null and p_status is null then
    raise exception 'p_role or p_status required';
  end if;

  if p_role is not null and p_role not in ('owner', 'admin', 'safety_officer', 'user') then
    raise exception 'invalid role: %', p_role;
  end if;

  if p_status is not null and p_status not in ('active', 'invited', 'disabled') then
    raise exception 'invalid status: %', p_status;
  end if;

  if not exists (select 1 from app.tenants where id = p_tenant_id) then
    raise exception 'tenant not found';
  end if;

  update app.tenant_users tu
     set role = coalesce(p_role, tu.role),
         status = coalesce(p_status, tu.status),
         updated_at = now()
   where tu.tenant_id = p_tenant_id
     and tu.user_id = p_user_id;

  get diagnostics v_cnt = row_count;
  if v_cnt = 0 then
    raise exception 'membership not found';
  end if;

  if p_role is not null then v_detail := v_detail || jsonb_build_object('role', p_role); end if;
  if p_status is not null then v_detail := v_detail || jsonb_build_object('status', p_status); end if;

  insert into app.audit_log (tenant_id, user_id, action, entity, entity_id, detail)
  values (p_tenant_id, app.current_user_id(), 'admin.member_updated', 'tenant_user',
          p_user_id::text, v_detail || jsonb_build_object('target_user_id', p_user_id));

  return jsonb_build_object('success', true, 'tenant_id', p_tenant_id, 'user_id', p_user_id);
end;
$$;

revoke all on function public.api_admin_update_tenant(uuid, text, text, timestamptz, int) from public;
revoke all on function public.api_admin_set_member(uuid, uuid, text, text) from public;
grant execute on function public.api_admin_update_tenant(uuid, text, text, timestamptz, int) to authenticated;
grant execute on function public.api_admin_set_member(uuid, uuid, text, text) to authenticated;
