-- ============================================================
-- 0019_security_hardening.sql
-- Critical billing RPC lockdown, admin sheet reads, invitation tokens,
-- user-tasks IDOR fix, profiles insert guard, admin RPC revokes.
-- ============================================================

-- ---- Service-role-only billing apply -----------------------------
create or replace function app.apply_subscription(
  p_customer_id text,
  p_subscription_id text,
  p_plan_id text,
  p_status text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
) returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_tenant uuid;
  v_tenant_status text;
  v_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if v_role is distinct from 'service_role' then
    raise exception 'forbidden: apply_subscription requires service role';
  end if;

  select id into v_tenant from app.tenants where stripe_customer_id = p_customer_id;
  if v_tenant is null then
    raise notice 'apply_subscription: no tenant for customer %', p_customer_id;
    return;
  end if;

  insert into app.subscriptions(tenant_id, stripe_customer_id, stripe_subscription_id,
                                plan_id, status, current_period_end, cancel_at_period_end)
  values (v_tenant, p_customer_id, p_subscription_id, p_plan_id, p_status,
          p_period_end, coalesce(p_cancel_at_period_end,false))
  on conflict (stripe_subscription_id) do update
    set status = excluded.status,
        plan_id = excluded.plan_id,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        updated_at = now();

  v_tenant_status := case
    when p_status in ('active','trialing') then 'active'
    when p_status in ('past_due','unpaid') then 'past_due'
    when p_status in ('canceled','incomplete_expired') then 'frozen'
    else 'active' end;

  update app.tenants
     set plan_id = coalesce(p_plan_id, plan_id),
         status  = v_tenant_status,
         updated_at = now()
   where id = v_tenant;
end;
$$;

create or replace function public.apply_subscription(
  p_customer_id text,
  p_subscription_id text,
  p_plan_id text,
  p_status text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
) returns void
language sql
security definer
set search_path = app, public
as $$
  select app.apply_subscription(
    p_customer_id, p_subscription_id, p_plan_id,
    p_status, p_period_end, p_cancel_at_period_end
  );
$$;

revoke all on function public.apply_subscription(text, text, text, text, timestamptz, boolean) from public;
revoke all on function public.apply_subscription(text, text, text, text, timestamptz, boolean) from anon, authenticated;
grant execute on function public.apply_subscription(text, text, text, text, timestamptz, boolean) to service_role;

-- ---- Stripe customer: owner/admin only + format validation ----
create or replace function public.api_set_stripe_customer(p_customer_id text)
returns jsonb
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_role   text := app.current_user_role();
  v_cid    text := trim(coalesce(p_customer_id, ''));
begin
  if v_tenant is null then
    raise exception 'no active tenant';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'forbidden: owner or admin required';
  end if;
  if v_cid = '' or v_cid !~ '^cus_[A-Za-z0-9]+$' then
    raise exception 'invalid stripe customer id';
  end if;

  update app.tenants
     set stripe_customer_id = v_cid,
         updated_at = now()
   where id = v_tenant
     and (stripe_customer_id is null or stripe_customer_id = v_cid);

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.api_set_stripe_customer(text) from public;
grant execute on function public.api_set_stripe_customer(text) to authenticated;

-- ---- Sheet guard: admin-only reads for sensitive sheets ---------
create or replace function app.guard_sheet(p_sheet text, p_write boolean default false)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_mod text;
  v_role text := app.current_user_role();
begin
  if app.current_tenant_id() is null then
    raise exception 'no active tenant';
  end if;
  if p_write and not app.tenant_is_writable() then
    raise exception 'tenant is read-only: add payment method or upgrade plan';
  end if;
  if p_sheet = any (app.admin_only_sheets())
     and v_role not in ('owner', 'admin') then
    raise exception 'forbidden: sheet % requires owner or admin', p_sheet;
  end if;
  v_mod := app.sheet_module_key(p_sheet);
  if not app.is_module_allowed(v_mod) then
    raise exception 'module not allowed on current plan: %', v_mod;
  end if;
end;
$$;

-- ---- Invitations: hide tokens from regular members --------------
drop policy if exists invitations_select on app.invitations;
create policy invitations_select on app.invitations
  for select
  using (
    tenant_id = app.current_tenant_id()
    and app.current_user_role() in ('owner', 'admin')
  );

-- ---- User tasks: no cross-user IDOR -----------------------------
create or replace function public.api_get_user_tasks(p_user_id text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = app, public
as $$
declare
  v_uid  uuid := app.current_user_id();
  v_role text := app.current_user_role();
  v_target text := trim(coalesce(p_user_id, ''));
begin
  perform app.guard_sheet('UserTasks', false);

  if v_target = '' then
    v_target := v_uid::text;
  elsif v_role not in ('owner', 'admin') and v_target <> v_uid::text then
    raise exception 'forbidden: cannot read tasks for another user';
  end if;

  return (
    select coalesce(jsonb_agg(data || jsonb_build_object('id', id)), '[]'::jsonb)
      from app.records r
     where r.tenant_id = app.current_tenant_id()
       and r.sheet = 'UserTasks'
       and (
         (r.data->>'assignedTo') in ('all','جميع المستخدمين')
         or (r.data->>'assignedTo') = v_target
         or (jsonb_typeof(r.data->'assignedTo') = 'array' and (r.data->'assignedTo') ? v_target)
       )
  );
end;
$$;

-- ---- Profiles: block privilege on INSERT too --------------------
create or replace function app.profiles_guard_privilege()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_platform_admin, false) then
      raise exception 'cannot set platform admin flag on insert';
    end if;
    return new;
  end if;

  if new.is_platform_admin is distinct from old.is_platform_admin then
    raise exception 'cannot change platform admin flag';
  end if;
  if new.default_tenant_id is distinct from old.default_tenant_id then
    if new.default_tenant_id is not null and not exists (
      select 1 from app.tenant_users tu
       where tu.user_id = new.id
         and tu.tenant_id = new.default_tenant_id
         and tu.status = 'active'
    ) then
      raise exception 'cannot set default_tenant_id without membership';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard on app.profiles;
create trigger trg_profiles_guard
  before insert or update on app.profiles
  for each row execute function app.profiles_guard_privilege();

-- ---- Platform admin: Free plan modules cannot exceed trial set ----
create or replace function public.api_admin_set_plan_modules(p_plan_id text, p_modules jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_cnt int;
  v_allowed jsonb;
  v_elem text;
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;
  if p_modules is null or jsonb_typeof(p_modules) <> 'array' then
    raise exception 'p_modules must be a json array';
  end if;

  if p_plan_id = 'free' and jsonb_array_length(p_modules) > 0 then
    v_allowed := app.default_free_trial_modules();
    for v_elem in select jsonb_array_elements_text(p_modules)
    loop
      if not exists (
        select 1 from jsonb_array_elements_text(v_allowed) a where a = v_elem
      ) then
        raise exception 'free plan module % not in allowed trial set', v_elem;
      end if;
    end loop;
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
revoke all on function public.api_admin_set_plan_limits(text, int, int) from public;
revoke all on function public.api_admin_list_plans() from public;
grant execute on function public.api_admin_set_plan_modules(text, jsonb) to authenticated;
grant execute on function public.api_admin_set_plan_limits(text, int, int) to authenticated;
grant execute on function public.api_admin_list_plans() to authenticated;

-- ---- Tenants: prevent client plan/status tampering via UPDATE ----
create or replace function app.tenants_guard_billing()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if new.plan_id is distinct from old.plan_id
     or new.status is distinct from old.status
     or new.trial_ends_at is distinct from old.trial_ends_at then
    if coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
      raise exception 'forbidden: plan/status changes require billing system';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tenants_guard_billing on app.tenants;
create trigger trg_tenants_guard_billing
  before update on app.tenants
  for each row execute function app.tenants_guard_billing();
