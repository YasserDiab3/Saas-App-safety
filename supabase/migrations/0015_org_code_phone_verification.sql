-- ============================================================
-- 0015_org_code_phone_verification.sql
-- Unique organization code, owner phone, email verification gate
-- ============================================================

-- ---- Tenant org code -----------------------------------------
alter table app.tenants
  add column if not exists org_code text;

create or replace function app.generate_org_code()
returns text
language plpgsql
set search_path = app, public
as $$
declare
  v_code text;
  v_try  integer := 0;
begin
  loop
    v_code := 'QHS-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));
    exit when not exists (select 1 from app.tenants t where t.org_code = v_code);
    v_try := v_try + 1;
    if v_try > 30 then
      raise exception 'could not generate unique org code';
    end if;
  end loop;
  return v_code;
end;
$$;

update app.tenants
   set org_code = app.generate_org_code()
 where org_code is null;

alter table app.tenants
  alter column org_code set not null;

create unique index if not exists idx_tenants_org_code on app.tenants (org_code);

-- ---- Profile phone -------------------------------------------
alter table app.profiles
  add column if not exists phone_country_code text,
  add column if not exists phone_number text;

-- ---- Provisioning: email verified + org code + phone ---------
create or replace function app.create_tenant_for_current_user(
  p_name text,
  p_phone_country text default null,
  p_phone_number text default null
)
returns uuid
language plpgsql security definer set search_path = app, public
as $$
declare
  v_uid      uuid := app.current_user_id();
  v_tenant   uuid;
  v_trial    integer := 7;
  v_org_code text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'tenant name required';
  end if;
  if coalesce(trim(p_phone_country), '') = '' or coalesce(trim(p_phone_number), '') = '' then
    raise exception 'phone number with country code required';
  end if;
  if not exists (
    select 1 from auth.users u
     where u.id = v_uid
       and u.email_confirmed_at is not null
  ) then
    raise exception 'email not verified — confirm OTP first';
  end if;
  if exists (
    select 1 from app.tenant_users tu
     where tu.user_id = v_uid and tu.role = 'owner' and tu.status = 'active'
  ) then
    raise exception 'user already owns an organization';
  end if;

  v_org_code := app.generate_org_code();

  insert into app.tenants (name, status, plan_id, trial_ends_at, org_code)
  values (p_name, 'trialing', 'free', now() + (v_trial || ' days')::interval, v_org_code)
  returning id into v_tenant;

  insert into app.tenant_users (tenant_id, user_id, role, status)
  values (v_tenant, v_uid, 'owner', 'active');

  update app.profiles
     set default_tenant_id = v_tenant,
         phone_country_code = trim(p_phone_country),
         phone_number = regexp_replace(trim(p_phone_number), '[^0-9]', '', 'g')
   where id = v_uid;

  insert into app.audit_log (tenant_id, user_id, action, entity, entity_id, detail)
  values (v_tenant, v_uid, 'tenant.provisioned', 'tenant', v_tenant::text,
          jsonb_build_object(
            'name', p_name,
            'org_code', v_org_code,
            'trial_days', v_trial,
            'phone_country', trim(p_phone_country)
          ));

  return v_tenant;
end;
$$;

drop function if exists public.api_provision_tenant(text);

create or replace function public.api_provision_tenant(
  p_name text,
  p_phone_country text default null,
  p_phone_number text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_tenant uuid;
  v_code   text;
begin
  v_tenant := app.create_tenant_for_current_user(p_name, p_phone_country, p_phone_number);
  select t.org_code into v_code from app.tenants t where t.id = v_tenant;
  return jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant,
    'org_code', v_code
  );
end;
$$;

grant execute on function public.api_provision_tenant(text, text, text) to authenticated;

-- ---- api_me / billing: expose org_code -----------------------
create or replace function public.api_me()
returns jsonb
language sql stable security invoker set search_path = app, public
as $$
  select jsonb_build_object(
    'user_id',   app.current_user_id(),
    'tenant_id', app.current_tenant_id(),
    'role',      app.current_user_role(),
    'phone_country_code', (select p.phone_country_code from app.profiles p where p.id = app.current_user_id()),
    'phone_number', (select p.phone_number from app.profiles p where p.id = app.current_user_id()),
    'tenant', (select jsonb_build_object(
                 'id', id,
                 'name', name,
                 'org_code', org_code,
                 'plan_id', plan_id,
                 'status', status,
                 'trial_ends_at', trial_ends_at
               )
               from app.tenants where id = app.current_tenant_id())
  )
$$;

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
    'modules', (select p.modules from app.plans p
                 join app.tenants t on t.plan_id = p.id
                where t.id = app.current_tenant_id()),
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
