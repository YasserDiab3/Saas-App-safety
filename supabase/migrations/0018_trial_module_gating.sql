-- ============================================================
-- 0018_trial_module_gating.sql
-- Enforce precise module allow-list during free / trial period.
-- Pro & Enterprise: modules [] still means ALL modules.
-- ============================================================

-- Canonical trial allow-list (nav data-section keys). Platform admin may
-- further restrict Free via api_admin_set_plan_modules (subset only).
create or replace function app.default_free_trial_modules()
returns jsonb
language sql
immutable
as $$
  select '[
    "clinic",
    "incidents",
    "nearmiss",
    "daily-observations",
    "user-tasks",
    "ptw",
    "training"
  ]'::jsonb
$$;

create or replace function app.effective_tenant_modules()
returns jsonb
language plpgsql
stable
security definer
set search_path = app, public
as $$
declare
  v_plan  text;
  v_mods  jsonb;
begin
  select t.plan_id, p.modules
    into v_plan, v_mods
    from app.tenants t
    join app.plans p on p.id = t.plan_id
   where t.id = app.current_tenant_id();

  if v_plan is null then
    return '[]'::jsonb;
  end if;

  -- Free / trial: never treat empty as "all modules"
  if v_plan = 'free' then
    if v_mods is null
       or v_mods = '[]'::jsonb
       or jsonb_array_length(v_mods) = 0 then
      return app.default_free_trial_modules();
    end if;
    return v_mods;
  end if;

  -- Paid plans: empty array = all modules (client + server convention)
  return coalesce(v_mods, '[]'::jsonb);
end;
$$;

create or replace function app.tenant_plan_modules()
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select app.effective_tenant_modules()
$$;

create or replace function app.is_module_allowed(p_module text)
returns boolean
language plpgsql
stable
security definer
set search_path = app, public
as $$
declare
  v_mods jsonb;
begin
  if p_module = any (app.core_module_keys()) then
    return true;
  end if;

  v_mods := app.effective_tenant_modules();

  if v_mods is null
     or v_mods = '[]'::jsonb
     or jsonb_array_length(v_mods) = 0 then
    return true;
  end if;

  return exists (
    select 1
      from jsonb_array_elements_text(v_mods) elem
     where elem = p_module
  );
end;
$$;

-- Persist default list on Free plan (admin may narrow, not widen past server merge)
update app.plans
   set modules = app.default_free_trial_modules()
 where id = 'free';

create or replace function public.api_billing_status()
returns jsonb
language sql stable security invoker set search_path = app, public
as $$
  select jsonb_build_object(
    'tenant', (select jsonb_build_object(
      'id', t.id, 'name', t.name, 'org_code', t.org_code,
      'plan_id', t.plan_id, 'status', t.status,
      'trial_ends_at', t.trial_ends_at, 'stripe_customer_id', t.stripe_customer_id)
      from app.tenants t where t.id = app.current_tenant_id()),
    'modules', app.effective_tenant_modules(),
    'module_gating', jsonb_build_object(
      'mode', (select case when t.plan_id = 'free' then 'trial_limited' else 'plan' end
               from app.tenants t where t.id = app.current_tenant_id()),
      'allowed_count', jsonb_array_length(app.effective_tenant_modules())
    ),
    'subscription', (select jsonb_build_object(
      'status', s.status, 'plan_id', s.plan_id,
      'current_period_end', s.current_period_end,
      'cancel_at_period_end', s.cancel_at_period_end)
      from app.subscriptions s
     where s.tenant_id = app.current_tenant_id()
     order by s.updated_at desc limit 1),
    'plans', (select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'max_users', max_users,
      'price_id', price_id, 'modules', modules) order by sort_order)
      from app.plans where is_active),
    'limits', jsonb_build_object(
      'user_count', app.tenant_active_user_count(),
      'pending_invites', app.tenant_pending_invite_count(),
      'max_users', app.tenant_max_users(),
      'storage_used_mb', round((app.tenant_storage_bytes() / 1024.0 / 1024.0)::numeric, 2),
      'storage_mb', (select p.storage_mb from app.plans p
                      join app.tenants t on t.plan_id = p.id
                     where t.id = app.current_tenant_id())
    ),
    'payment_required', app.tenant_needs_payment(),
    'writable', app.tenant_is_writable()
  )
$$;
