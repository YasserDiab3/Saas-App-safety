-- ============================================================
-- 0011_billing_fixes.sql — make the Stripe Edge Functions actually work
--   (a) api_billing_status returns tenant.stripe_customer_id so
--       create-checkout reuses the customer instead of creating a new one.
--   (b) public.apply_subscription wrapper: the webhook (service role) calls
--       RPCs via PostgREST which only exposes `public`; app.apply_subscription
--       was unreachable. Thin public wrapper fixes it.
-- Apply after 0010.
-- ============================================================

-- (a) include stripe_customer_id in the billing tenant object
create or replace function public.api_billing_status()
returns jsonb
language sql stable security invoker set search_path = app, public
as $$
  select jsonb_build_object(
    'tenant', (select jsonb_build_object('id',id,'name',name,'plan_id',plan_id,'status',status,
                                         'trial_ends_at',trial_ends_at,'stripe_customer_id',stripe_customer_id)
               from app.tenants where id = app.current_tenant_id()),
    'modules', (select p.modules from app.plans p
                 where p.id = (select plan_id from app.tenants where id = app.current_tenant_id())),
    'subscription', (select jsonb_build_object('status',status,'plan_id',plan_id,'current_period_end',current_period_end,'cancel_at_period_end',cancel_at_period_end)
               from app.subscriptions where tenant_id = app.current_tenant_id()
               order by updated_at desc limit 1),
    'plans', (select jsonb_agg(jsonb_build_object('id',id,'name',name,'max_users',max_users,'price_id',price_id,'modules',modules) order by sort_order)
               from app.plans where is_active)
  )
$$;
grant execute on function public.api_billing_status() to authenticated;

-- (b) public wrapper so the webhook (service role) can apply subscription state
create or replace function public.apply_subscription(
  p_customer_id text, p_subscription_id text, p_plan_id text,
  p_status text, p_period_end timestamptz, p_cancel_at_period_end boolean
) returns void
language sql security definer set search_path = app, public
as $$
  select app.apply_subscription(p_customer_id, p_subscription_id, p_plan_id,
                                p_status, p_period_end, p_cancel_at_period_end);
$$;
grant execute on function public.apply_subscription(text, text, text, text, timestamptz, boolean) to service_role;
