-- Pro foundation: OrgSites, NotificationPrefs, notification_outbox, compliance sheets.

insert into app.sheets (name, module_key, is_config) values
  ('OrgSites', 'settings', true),
  ('OrgDepartments', 'settings', true),
  ('NotificationPrefs', 'settings', true),
  ('ComplianceChecklists', 'iso', false),
  ('AuditLog', 'core', true)
on conflict (name) do nothing;

create table if not exists app.notification_outbox (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references app.tenants(id) on delete cascade,
  event_key     text not null,
  title         text not null default '',
  body          text not null default '',
  record_id     text,
  site_id       text,
  channels      jsonb not null default '[]'::jsonb,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'pending'
                check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  error         text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create index if not exists idx_notification_outbox_pending
  on app.notification_outbox (status, created_at)
  where status = 'pending';

create index if not exists idx_notification_outbox_tenant
  on app.notification_outbox (tenant_id, created_at desc);

alter table app.notification_outbox enable row level security;

drop policy if exists notification_outbox_tenant_select on app.notification_outbox;
create policy notification_outbox_tenant_select on app.notification_outbox
  for select to authenticated
  using (tenant_id = app.current_tenant_id());

create or replace function public.api_enqueue_notification(
  p_event_key text,
  p_title text,
  p_body text,
  p_record_id text default null,
  p_site_id text default null,
  p_channels jsonb default '[]'::jsonb,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_id uuid;
begin
  if v_tenant is null then
    raise exception 'no active tenant';
  end if;
  if coalesce(trim(p_event_key), '') = '' then
    raise exception 'event_key required';
  end if;

  insert into app.notification_outbox (
    tenant_id, event_key, title, body, record_id, site_id, channels, payload
  ) values (
    v_tenant,
    lower(trim(p_event_key)),
    coalesce(p_title, ''),
    coalesce(p_body, ''),
    nullif(p_record_id, ''),
    nullif(p_site_id, ''),
    coalesce(p_channels, '[]'::jsonb),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;

revoke all on function public.api_enqueue_notification(text, text, text, text, text, jsonb, jsonb) from public;
grant execute on function public.api_enqueue_notification(text, text, text, text, text, jsonb, jsonb) to authenticated;

create or replace function public.api_claim_notification_outbox(p_limit int default 50)
returns setof app.notification_outbox
language plpgsql
security definer
set search_path = app, public
as $$
begin
  return query
  with cte as (
    select id
      from app.notification_outbox
     where status = 'pending'
     order by created_at
     limit greatest(1, least(coalesce(p_limit, 50), 200))
     for update skip locked
  )
  update app.notification_outbox o
     set status = 'processing'
    from cte
   where o.id = cte.id
  returning o.*;
end;
$$;

revoke all on function public.api_claim_notification_outbox(int) from public;
grant execute on function public.api_claim_notification_outbox(int) to service_role;

create or replace function public.api_complete_notification_outbox(
  p_id uuid,
  p_ok boolean,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
begin
  update app.notification_outbox
     set status = case when p_ok then 'sent' else 'failed' end,
         error = nullif(p_error, ''),
         processed_at = now()
   where id = p_id;
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.api_complete_notification_outbox(uuid, boolean, text) from public;
grant execute on function public.api_complete_notification_outbox(uuid, boolean, text) to service_role;

create or replace function public.api_enqueue_in_app_notification(
  p_user_id uuid,
  p_title text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
begin
  if v_tenant is null then raise exception 'no active tenant'; end if;
  if p_user_id is null then raise exception 'user required'; end if;

  insert into app.user_notifications (user_id, tenant_id, title, body)
  values (p_user_id, v_tenant, coalesce(p_title, ''), coalesce(p_body, ''));

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.api_enqueue_in_app_notification(uuid, text, text) from public;
grant execute on function public.api_enqueue_in_app_notification(uuid, text, text) to authenticated;

-- Keep org config sheets when wiping operational data.
create or replace function app.backup_protected_sheets()
returns text[]
language sql immutable
as $$
  select array[
    'Users',
    'CompanySettings',
    'FormSettings',
    'ModuleManagement',
    'HelpCenter',
    'OrgSites',
    'OrgDepartments',
    'NotificationPrefs'
  ]::text[]
$$;
