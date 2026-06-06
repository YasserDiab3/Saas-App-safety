-- ============================================================
-- 0008_billing.sql — Stripe billing support
-- Adds tenant↔Stripe link + a service-role function the webhook calls
-- to apply subscription state. Plus a read RPC for the billing UI.
-- ============================================================

alter table app.tenants
  add column if not exists stripe_customer_id text;

create unique index if not exists uq_tenants_stripe_customer
  on app.tenants(stripe_customer_id) where stripe_customer_id is not null;

-- Apply subscription state coming from a Stripe webhook.
-- Called by the Edge Function using the SERVICE ROLE (bypasses RLS), so it
-- locates the tenant by stripe_customer_id (no JWT tenant context here).
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
begin
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

  -- map Stripe status → tenant status
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

-- Billing summary for the current tenant (UI).
create or replace function public.api_billing_status()
returns jsonb
language sql stable security invoker set search_path = app, public
as $$
  select jsonb_build_object(
    'tenant', (select jsonb_build_object('id',id,'name',name,'plan_id',plan_id,'status',status,'trial_ends_at',trial_ends_at)
               from app.tenants where id = app.current_tenant_id()),
    'subscription', (select jsonb_build_object('status',status,'plan_id',plan_id,'current_period_end',current_period_end,'cancel_at_period_end',cancel_at_period_end)
               from app.subscriptions where tenant_id = app.current_tenant_id()
               order by updated_at desc limit 1),
    'plans', (select jsonb_agg(jsonb_build_object('id',id,'name',name,'max_users',max_users,'price_id',price_id) order by sort_order)
               from app.plans where is_active)
  )
$$;

-- set the tenant's Stripe customer id (called right before checkout)
create or replace function public.api_set_stripe_customer(p_customer_id text)
returns jsonb
language plpgsql security invoker set search_path = app, public
as $$
declare v_tenant uuid := app.current_tenant_id();
begin
  if v_tenant is null then raise exception 'no active tenant'; end if;
  update app.tenants set stripe_customer_id = p_customer_id, updated_at = now()
   where id = v_tenant and (stripe_customer_id is null or stripe_customer_id = p_customer_id);
  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.api_billing_status() to authenticated;
grant execute on function public.api_set_stripe_customer(text) to authenticated;
