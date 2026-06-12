-- ============================================================
-- 0017_trial_3_days.sql — 3-day free trial + email reminder tuning
-- ============================================================

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
  v_trial    integer := 3;
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

-- Reminders: 2 days / 1 day / expiry day (fits 3-day trial)
create or replace function app.pending_trial_reminders()
returns table (
  tenant_id      uuid,
  tenant_name    text,
  owner_email    text,
  owner_name     text,
  reminder_type  text,
  trial_ends_at  timestamptz,
  days_left      integer
)
language sql
security definer
set search_path = app, public
as $$
  with candidates as (
    select
      t.id,
      t.name,
      u.email,
      coalesce(p.full_name, u.email) as full_name,
      t.trial_ends_at,
      (date_trunc('day', t.trial_ends_at)::date - date_trunc('day', now())::date) as days_left,
      case
        when date_trunc('day', t.trial_ends_at) = date_trunc('day', now() + interval '2 days') then 'd2'
        when date_trunc('day', t.trial_ends_at) = date_trunc('day', now() + interval '1 day') then 'd1'
        when date_trunc('day', t.trial_ends_at) = date_trunc('day', now()) then 'd0'
      end as rtype
    from app.tenants t
    join app.tenant_users tu
      on tu.tenant_id = t.id and tu.role = 'owner' and tu.status = 'active'
    join auth.users u on u.id = tu.user_id
    left join app.profiles p on p.id = tu.user_id
    where t.plan_id = 'free'
      and coalesce(t.stripe_customer_id, '') = ''
      and t.trial_ends_at is not null
      and u.email is not null
  )
  select
    c.id,
    c.name,
    c.email,
    c.full_name,
    c.rtype,
    c.trial_ends_at,
    c.days_left::integer
  from candidates c
  where c.rtype is not null
    and not exists (
      select 1 from app.trial_email_log l
       where l.tenant_id = c.id and l.reminder_type = c.rtype
    );
$$;

create or replace function app.mark_trial_reminder_sent(p_tenant_id uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if p_type not in ('d2', 'd1', 'd0', 'd3') then
    raise exception 'invalid reminder type';
  end if;
  insert into app.trial_email_log (tenant_id, reminder_type)
  values (p_tenant_id, p_type)
  on conflict (tenant_id, reminder_type) do nothing;
end;
$$;

alter table app.trial_email_log drop constraint if exists trial_email_log_reminder_type_check;
alter table app.trial_email_log add constraint trial_email_log_reminder_type_check
  check (reminder_type in ('d2', 'd1', 'd0', 'd3'));

create or replace function public.pending_trial_reminders()
returns table (
  tenant_id      uuid,
  tenant_name    text,
  owner_email    text,
  owner_name     text,
  reminder_type  text,
  trial_ends_at  timestamptz,
  days_left      integer
)
language sql
security definer
set search_path = app, public
as $$ select * from app.pending_trial_reminders(); $$;
