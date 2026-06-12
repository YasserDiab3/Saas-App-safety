-- ============================================================
-- 0016_trial_email_reminders.sql
-- Log trial reminder emails (3d / 1d / expiry day) for cron edge fn
-- ============================================================

create table if not exists app.trial_email_log (
  id             bigserial primary key,
  tenant_id      uuid not null references app.tenants(id) on delete cascade,
  reminder_type  text not null check (reminder_type in ('d3', 'd1', 'd0')),
  sent_at        timestamptz not null default now(),
  unique (tenant_id, reminder_type)
);

create index if not exists idx_trial_email_log_tenant on app.trial_email_log (tenant_id);

alter table app.trial_email_log enable row level security;

-- service role / migrations only — no tenant user access
create policy trial_email_log_deny on app.trial_email_log
  for all using (false);

-- Returns owners needing a reminder today (idempotent via trial_email_log).
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
        when date_trunc('day', t.trial_ends_at) = date_trunc('day', now() + interval '3 days') then 'd3'
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
  if p_type not in ('d3', 'd1', 'd0') then
    raise exception 'invalid reminder type';
  end if;
  insert into app.trial_email_log (tenant_id, reminder_type)
  values (p_tenant_id, p_type)
  on conflict (tenant_id, reminder_type) do nothing;
end;
$$;

-- Public wrappers for edge function (service_role only)
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

create or replace function public.mark_trial_reminder_sent(p_tenant_id uuid, p_type text)
returns void
language sql
security definer
set search_path = app, public
as $$ select app.mark_trial_reminder_sent(p_tenant_id, p_type); $$;

revoke all on function public.pending_trial_reminders() from public, anon, authenticated;
revoke all on function public.mark_trial_reminder_sent(uuid, text) from public, anon, authenticated;
grant execute on function public.pending_trial_reminders() to service_role;
grant execute on function public.mark_trial_reminder_sent(uuid, text) to service_role;
