-- ============================================================
-- 0025_platform_admin_comms.sql
-- Platform admin: in-app notifications, message log, price quotes.
-- ============================================================

-- In-app notifications (shown in tenant app later; stored now)
create table if not exists app.user_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app.profiles(id) on delete cascade,
  tenant_id   uuid references app.tenants(id) on delete set null,
  title       text not null,
  body        text not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_user_notifications_user on app.user_notifications(user_id, created_at desc);
alter table app.user_notifications enable row level security;
create policy user_notifications_own on app.user_notifications for select
  using (user_id = app.current_user_id());
create policy user_notifications_mark_read on app.user_notifications for update
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

-- Admin message / email log
create table if not exists app.admin_notifications (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references app.tenants(id) on delete set null,
  user_id     uuid references app.profiles(id) on delete set null,
  channel     text not null check (channel in ('email', 'in_app', 'both')),
  subject     text not null,
  body        text not null,
  recipients  jsonb not null default '[]'::jsonb,
  status      text not null default 'sent' check (status in ('sent', 'failed', 'partial')),
  sent_by     uuid not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_admin_notifications_tenant on app.admin_notifications(tenant_id, created_at desc);
alter table app.admin_notifications enable row level security;
create policy admin_notifications_deny on app.admin_notifications for all using (false);

-- Price quotes / offers
create table if not exists app.price_quotes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references app.tenants(id) on delete cascade,
  plan_id          text not null references app.plans(id),
  title            text not null,
  amount_cents     integer,
  currency         text not null default 'USD',
  discount_percent integer not null default 0 check (discount_percent between 0 and 100),
  extra_trial_days integer not null default 0 check (extra_trial_days between 0 and 365),
  notes            text,
  status           text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'expired', 'canceled')),
  valid_until      timestamptz,
  created_by       uuid not null,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger trg_price_quotes_updated before update on app.price_quotes
  for each row execute function app.set_updated_at();
create index if not exists idx_price_quotes_tenant on app.price_quotes(tenant_id, created_at desc);
alter table app.price_quotes enable row level security;
create policy price_quotes_deny on app.price_quotes for all using (false);

-- Resolve recipient emails for a tenant (owner first, then active members)
create or replace function public.api_admin_get_tenant_contacts(p_tenant_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = app, public, auth
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;
  if p_tenant_id is null then raise exception 'p_tenant_id required'; end if;

  return coalesce((
    select jsonb_build_object(
      'tenant', (select jsonb_build_object('id', t.id, 'name', t.name, 'org_code', t.org_code)
                   from app.tenants t where t.id = p_tenant_id),
      'contacts', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', tu.user_id, 'email', p.email, 'full_name', p.full_name,
          'role', tu.role, 'status', tu.status
        ) order by case tu.role when 'owner' then 0 when 'admin' then 1 else 2 end, p.email), '[]'::jsonb)
        from app.tenant_users tu
        join app.profiles p on p.id = tu.user_id
        where tu.tenant_id = p_tenant_id and tu.status = 'active'
      )
    )
  ), jsonb_build_object('tenant', null, 'contacts', '[]'::jsonb));
end;
$$;

-- Lightweight tenant list for dropdowns
create or replace function public.api_admin_tenant_options()
returns jsonb
language sql stable security definer set search_path = app, public
as $$
  select case when app.is_platform_admin() then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'org_code', t.org_code, 'plan_id', t.plan_id
    ) order by t.name)
    from app.tenants t
  ), '[]'::jsonb) else null end;
$$;

-- Record sent notification (called from edge function via service role)
create or replace function public.api_admin_record_notification(
  p_tenant_id uuid,
  p_user_id uuid,
  p_channel text,
  p_subject text,
  p_body text,
  p_recipients jsonb,
  p_status text,
  p_sent_by uuid
)
returns uuid
language plpgsql security definer set search_path = app, public
as $$
declare v_id uuid;
begin
  insert into app.admin_notifications (
    tenant_id, user_id, channel, subject, body, recipients, status, sent_by
  ) values (
    p_tenant_id, p_user_id, p_channel, p_subject, p_body,
    coalesce(p_recipients, '[]'::jsonb), coalesce(p_status, 'sent'), p_sent_by
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.api_admin_list_notifications(p_limit int default 30, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
declare v_limit int := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if not app.is_platform_admin() then raise exception 'forbidden: platform admin only'; end if;
  return jsonb_build_object(
    'total', (select count(*)::int from app.admin_notifications),
    'items', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
      from (
        select n.id, n.channel, n.subject, n.status, n.created_at,
               t.name as tenant_name, n.recipients
          from app.admin_notifications n
          left join app.tenants t on t.id = n.tenant_id
         order by n.created_at desc
         limit v_limit offset greatest(coalesce(p_offset, 0), 0)
      ) x
    )
  );
end;
$$;

create or replace function public.api_admin_create_quote(
  p_tenant_id uuid,
  p_plan_id text,
  p_title text,
  p_amount_cents int default null,
  p_discount_percent int default 0,
  p_extra_trial_days int default 0,
  p_notes text default null,
  p_valid_days int default 30
)
returns jsonb
language plpgsql security definer set search_path = app, public
as $$
declare v_id uuid;
begin
  if not app.is_platform_admin() then raise exception 'forbidden: platform admin only'; end if;
  if p_tenant_id is null or p_plan_id is null or nullif(trim(p_title), '') is null then
    raise exception 'tenant_id, plan_id, and title required';
  end if;
  if not exists (select 1 from app.tenants where id = p_tenant_id) then
    raise exception 'tenant not found';
  end if;
  if not exists (select 1 from app.plans where id = p_plan_id) then
    raise exception 'unknown plan';
  end if;

  insert into app.price_quotes (
    tenant_id, plan_id, title, amount_cents, discount_percent,
    extra_trial_days, notes, valid_until, created_by, status
  ) values (
    p_tenant_id, p_plan_id, trim(p_title), p_amount_cents,
    coalesce(p_discount_percent, 0), coalesce(p_extra_trial_days, 0),
    p_notes,
    now() + make_interval(days => greatest(coalesce(p_valid_days, 30), 1)),
    app.current_user_id(), 'draft'
  ) returning id into v_id;

  insert into app.audit_log (tenant_id, user_id, action, entity, entity_id, detail)
  values (p_tenant_id, app.current_user_id(), 'admin.quote_created', 'price_quote', v_id::text,
          jsonb_build_object('plan_id', p_plan_id, 'title', p_title));

  return (select row_to_json(q)::jsonb from app.price_quotes q where q.id = v_id);
end;
$$;

create or replace function public.api_admin_list_quotes(p_limit int default 30, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
declare v_limit int := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if not app.is_platform_admin() then raise exception 'forbidden: platform admin only'; end if;
  return jsonb_build_object(
    'total', (select count(*)::int from app.price_quotes),
    'items', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
      from (
        select q.id, q.title, q.plan_id, q.amount_cents, q.discount_percent,
               q.extra_trial_days, q.status, q.valid_until, q.sent_at, q.created_at,
               t.name as tenant_name, t.org_code
          from app.price_quotes q
          join app.tenants t on t.id = q.tenant_id
         order by q.created_at desc
         limit v_limit offset greatest(coalesce(p_offset, 0), 0)
      ) x
    )
  );
end;
$$;

create or replace function public.api_admin_mark_quote_sent(p_quote_id uuid)
returns jsonb
language plpgsql security definer set search_path = app, public
as $$
begin
  if not app.is_platform_admin() then raise exception 'forbidden: platform admin only'; end if;
  update app.price_quotes
     set status = 'sent', sent_at = now(), updated_at = now()
   where id = p_quote_id;
  if not found then raise exception 'quote not found'; end if;
  return jsonb_build_object('success', true, 'quote_id', p_quote_id);
end;
$$;

create or replace function public.api_admin_get_quote(p_quote_id uuid)
returns jsonb
language sql stable security definer set search_path = app, public
as $$
  select case when app.is_platform_admin() then (
    select row_to_json(x)::jsonb from (
      select q.*, t.name as tenant_name, t.org_code, t.plan_id as current_plan_id
        from app.price_quotes q
        join app.tenants t on t.id = q.tenant_id
       where q.id = p_quote_id
    ) x
  ) else null end;
$$;

revoke all on function public.api_admin_get_tenant_contacts(uuid) from public;
revoke all on function public.api_admin_tenant_options() from public;
revoke all on function public.api_admin_record_notification(uuid, uuid, text, text, text, jsonb, text, uuid) from public;
revoke all on function public.api_admin_list_notifications(int, int) from public;
revoke all on function public.api_admin_create_quote(uuid, text, text, int, int, int, text, int) from public;
revoke all on function public.api_admin_list_quotes(int, int) from public;
revoke all on function public.api_admin_mark_quote_sent(uuid) from public;
revoke all on function public.api_admin_get_quote(uuid) from public;

grant execute on function public.api_admin_get_tenant_contacts(uuid) to authenticated;
grant execute on function public.api_admin_tenant_options() to authenticated;
grant execute on function public.api_admin_record_notification(uuid, uuid, text, text, text, jsonb, text, uuid) to service_role;
grant execute on function public.api_admin_list_notifications(int, int) to authenticated;
grant execute on function public.api_admin_create_quote(uuid, text, text, int, int, int, text, int) to authenticated;
grant execute on function public.api_admin_list_quotes(int, int) to authenticated;
grant execute on function public.api_admin_mark_quote_sent(uuid) to authenticated;
grant execute on function public.api_admin_get_quote(uuid) to authenticated;

-- Service-role helpers for edge function (admin-notify)
create or replace function public.api_admin_insert_user_notification(
  p_user_id uuid, p_tenant_id uuid, p_title text, p_body text
)
returns void
language sql security definer set search_path = app, public
as $$
  insert into app.user_notifications (user_id, tenant_id, title, body)
  values (p_user_id, p_tenant_id, p_title, p_body);
$$;

revoke all on function public.api_admin_insert_user_notification(uuid, uuid, text, text) from public;
grant execute on function public.api_admin_insert_user_notification(uuid, uuid, text, text) to service_role;
