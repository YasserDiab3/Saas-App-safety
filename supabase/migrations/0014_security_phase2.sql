-- ============================================================
-- 0014_security_phase2.sql
-- Server-side module gating, Users sheet protection, past_due,
-- plan limits (users/storage), invitations, 7-day free trial + payment.
-- ============================================================

-- ---- Registry: Users sheet -----------------------------------
insert into app.sheets (name, module_key, is_config)
values ('Users', 'users', true)
on conflict (name) do update set module_key = excluded.module_key, is_config = excluded.is_config;

-- ---- Helpers -------------------------------------------------
create or replace function app.core_module_keys()
returns text[]
language sql immutable
as $$ select array['dashboard','profile','settings','users','apptester','core']::text[] $$;

create or replace function app.admin_only_sheets()
returns text[]
language sql immutable
as $$ select array['Users','ModuleManagement','SafetyTeamMembers']::text[] $$;

create or replace function app.sheet_module_key(p_sheet text)
returns text
language sql stable security definer set search_path = app, public
as $$
  select coalesce(
    (select s.module_key from app.sheets s where s.name = p_sheet limit 1),
    'core'
  )
$$;

create or replace function app.tenant_plan_modules()
returns jsonb
language sql stable security definer set search_path = app, public
as $$
  select p.modules
    from app.tenants t
    join app.plans p on p.id = t.plan_id
   where t.id = app.current_tenant_id()
$$;

create or replace function app.is_module_allowed(p_module text)
returns boolean
language plpgsql stable security definer set search_path = app, public
as $$
declare
  v_mods jsonb;
begin
  if p_module = any (app.core_module_keys()) then
    return true;
  end if;
  v_mods := app.tenant_plan_modules();
  if v_mods is null or v_mods = '[]'::jsonb or jsonb_array_length(v_mods) = 0 then
    return true;
  end if;
  return exists (
    select 1 from jsonb_array_elements_text(v_mods) elem where elem = p_module
  );
end;
$$;

create or replace function app.tenant_needs_payment()
returns boolean
language sql stable security definer set search_path = app, public
as $$
  select coalesce(
    (select t.plan_id = 'free'
        and t.trial_ends_at is not null
        and t.trial_ends_at <= now()
        and coalesce(t.stripe_customer_id, '') = ''
       from app.tenants t where t.id = app.current_tenant_id()),
    false)
$$;

create or replace function app.tenant_is_writable()
returns boolean
language sql stable security definer set search_path = app, public
as $$
  select coalesce(
    (select t.status not in ('frozen', 'canceled', 'past_due')
        and not (
          t.plan_id = 'free'
          and t.trial_ends_at is not null
          and t.trial_ends_at <= now()
          and coalesce(t.stripe_customer_id, '') = ''
        )
       from app.tenants t where t.id = app.current_tenant_id()),
    false)
$$;

create or replace function app.guard_sheet(p_sheet text, p_write boolean default false)
returns void
language plpgsql security definer set search_path = app, public
as $$
declare
  v_mod text;
begin
  if app.current_tenant_id() is null then
    raise exception 'no active tenant';
  end if;
  if p_write and not app.tenant_is_writable() then
    raise exception 'tenant is read-only: add payment method or upgrade plan';
  end if;
  if p_write and p_sheet = any (app.admin_only_sheets())
     and app.current_user_role() not in ('owner', 'admin') then
    raise exception 'forbidden: sheet % requires owner or admin', p_sheet;
  end if;
  v_mod := app.sheet_module_key(p_sheet);
  if not app.is_module_allowed(v_mod) then
    raise exception 'module not allowed on current plan: %', v_mod;
  end if;
end;
$$;

create or replace function app.tenant_active_user_count()
returns integer
language sql stable security definer set search_path = app, public
as $$
  select count(*)::integer
    from app.tenant_users
   where tenant_id = app.current_tenant_id()
     and status = 'active'
$$;

create or replace function app.tenant_pending_invite_count()
returns integer
language sql stable security definer set search_path = app, public
as $$
  select count(*)::integer
    from app.invitations
   where tenant_id = app.current_tenant_id()
     and accepted_at is null
     and expires_at > now()
$$;

create or replace function app.tenant_max_users()
returns integer
language sql stable security definer set search_path = app, public
as $$
  select p.max_users
    from app.tenants t
    join app.plans p on p.id = t.plan_id
   where t.id = app.current_tenant_id()
$$;

create or replace function app.tenant_seats_used()
returns integer
language sql stable security definer set search_path = app, public
as $$
  select app.tenant_active_user_count() + app.tenant_pending_invite_count()
$$;

create or replace function app.guard_user_limit()
returns void
language plpgsql security definer set search_path = app, public
as $$
begin
  if app.tenant_seats_used() >= app.tenant_max_users() then
    raise exception 'user seat limit reached (max %)', app.tenant_max_users();
  end if;
end;
$$;

create or replace function app.tenant_storage_bytes()
returns bigint
language sql stable security definer set search_path = app, public
as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
    from storage.objects o
   where o.bucket_id = 'tenant-attachments'
     and app.storage_tenant_id(o.name) = app.current_tenant_id()
$$;

create or replace function app.tenant_storage_limit_bytes()
returns bigint
language sql stable security definer set search_path = app, public
as $$
  select (p.storage_mb::bigint * 1024 * 1024)
    from app.tenants t
    join app.plans p on p.id = t.plan_id
   where t.id = app.current_tenant_id()
$$;

create or replace function app.tenant_storage_has_room(p_add_bytes bigint default 0)
returns boolean
language sql stable security definer set search_path = app, public
as $$
  select app.tenant_storage_bytes() + coalesce(p_add_bytes, 0) <= app.tenant_storage_limit_bytes()
$$;

-- ---- Tenant resolution: require active membership ------------
create or replace function app.current_tenant_id()
returns uuid
language plpgsql stable security definer set search_path = app, public
as $$
declare
  v_claim uuid;
  v_uid   uuid;
  v_tenant uuid;
begin
  begin
    v_claim := nullif(
      coalesce(
        (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id'),
        (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')
      ), ''
    )::uuid;
  exception when others then
    v_claim := null;
  end;
  if v_claim is not null then
    if exists (
      select 1 from app.tenant_users tu
       where tu.tenant_id = v_claim
         and tu.user_id = app.current_user_id()
         and tu.status = 'active'
    ) then
      return v_claim;
    end if;
    return null;
  end if;

  begin
    v_uid := nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid;
  exception when others then
    v_uid := null;
  end;
  if v_uid is null then
    return null;
  end if;

  select p.default_tenant_id into v_tenant
    from app.profiles p where p.id = v_uid;

  if v_tenant is null then
    return null;
  end if;

  if not exists (
    select 1 from app.tenant_users tu
     where tu.tenant_id = v_tenant
       and tu.user_id = v_uid
       and tu.status = 'active'
  ) then
    return null;
  end if;

  return v_tenant;
end;
$$;

-- ---- Profiles: block privilege escalation --------------------
create or replace function app.profiles_guard_privilege()
returns trigger
language plpgsql security definer set search_path = app, public
as $$
begin
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
  before update on app.profiles
  for each row execute function app.profiles_guard_privilege();

-- ---- Provisioning: 7-day trial, one org per owner -------------
create or replace function app.create_tenant_for_current_user(p_name text)
returns uuid
language plpgsql security definer set search_path = app, public
as $$
declare
  v_uid    uuid := app.current_user_id();
  v_tenant uuid;
  v_trial  integer := 7;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'tenant name required';
  end if;
  if exists (
    select 1 from app.tenant_users tu
     where tu.user_id = v_uid and tu.role = 'owner' and tu.status = 'active'
  ) then
    raise exception 'user already owns an organization';
  end if;

  insert into app.tenants (name, status, plan_id, trial_ends_at)
  values (p_name, 'trialing', 'free', now() + (v_trial || ' days')::interval)
  returning id into v_tenant;

  insert into app.tenant_users (tenant_id, user_id, role, status)
  values (v_tenant, v_uid, 'owner', 'active');

  update app.profiles set default_tenant_id = v_tenant where id = v_uid;

  insert into app.audit_log (tenant_id, user_id, action, entity, entity_id, detail)
  values (v_tenant, v_uid, 'tenant.provisioned', 'tenant', v_tenant::text,
          jsonb_build_object('name', p_name, 'trial_days', v_trial));

  return v_tenant;
end;
$$;

-- ---- RLS: subscriptions read-only; invitations admin-only ---
drop policy if exists subscriptions_tenant on app.subscriptions;
create policy subscriptions_select on app.subscriptions for select
  using (tenant_id = app.current_tenant_id());

drop policy if exists invitations_tenant on app.invitations;
create policy invitations_select on app.invitations for select
  using (tenant_id = app.current_tenant_id());
create policy invitations_admin_write on app.invitations for all
  using (
    tenant_id = app.current_tenant_id()
    and app.current_user_role() in ('owner', 'admin')
  )
  with check (
    tenant_id = app.current_tenant_id()
    and app.current_user_role() in ('owner', 'admin')
  );

-- ---- Storage: enforce plan storage_mb ------------------------
drop policy if exists tenant_attachments_insert on storage.objects;
create policy tenant_attachments_insert on storage.objects for insert
  with check (
    bucket_id = 'tenant-attachments'
    and app.storage_tenant_id(name) = app.current_tenant_id()
    and app.tenant_is_writable()
    and app.tenant_storage_has_room(coalesce((metadata->>'size')::bigint, 0))
  );

-- ---- Public RPCs with sheet guards ---------------------------
create or replace function public.api_read_sheet(p_sheet text)
returns jsonb
language plpgsql stable security invoker set search_path = app, public
as $$
begin
  perform app.guard_sheet(p_sheet, false);
  return (
    select coalesce(jsonb_agg(r.data || jsonb_build_object('id', r.id)), '[]'::jsonb)
      from app.records r
     where r.tenant_id = app.current_tenant_id() and r.sheet = p_sheet
  );
end;
$$;

create or replace function public.api_batch_read(p_sheets text[])
returns jsonb
language plpgsql stable security invoker set search_path = app, public
as $$
declare
  v_sheet text;
  v_result jsonb := '{}'::jsonb;
  v_rows jsonb;
begin
  if p_sheets is null then
    return '{}'::jsonb;
  end if;
  foreach v_sheet in array p_sheets loop
    perform app.guard_sheet(v_sheet, false);
    select coalesce(jsonb_agg(r.data || jsonb_build_object('id', r.id)), '[]'::jsonb)
      into v_rows
      from app.records r
     where r.tenant_id = app.current_tenant_id() and r.sheet = v_sheet;
    v_result := v_result || jsonb_build_object(v_sheet, v_rows);
  end loop;
  return v_result;
end;
$$;

create or replace function public.api_upsert(p_sheet text, p_id text, p_data jsonb)
returns jsonb
language plpgsql security invoker set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
begin
  perform app.guard_sheet(p_sheet, true);
  if v_tenant is null then raise exception 'no active tenant'; end if;
  insert into app.records(tenant_id, sheet, id, data)
  values (v_tenant, p_sheet, p_id, coalesce(p_data,'{}'::jsonb) - 'id')
  on conflict (tenant_id, sheet, id)
  do update set data = excluded.data, updated_at = now();
  return jsonb_build_object('success', true, 'id', p_id);
end;
$$;

create or replace function public.api_patch(p_sheet text, p_id text, p_patch jsonb)
returns jsonb
language plpgsql security invoker set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_found  int;
begin
  perform app.guard_sheet(p_sheet, true);
  if v_tenant is null then raise exception 'no active tenant'; end if;
  update app.records
     set data = data || (coalesce(p_patch,'{}'::jsonb) - 'id'), updated_at = now()
   where tenant_id = v_tenant and sheet = p_sheet and id = p_id;
  get diagnostics v_found = row_count;
  return jsonb_build_object('success', v_found > 0, 'id', p_id);
end;
$$;

create or replace function public.api_delete(p_sheet text, p_id text)
returns jsonb
language plpgsql security invoker set search_path = app, public
as $$
declare
  v_found int;
begin
  perform app.guard_sheet(p_sheet, true);
  delete from app.records
   where tenant_id = app.current_tenant_id() and sheet = p_sheet and id = p_id;
  get diagnostics v_found = row_count;
  return jsonb_build_object('success', v_found > 0);
end;
$$;

create or replace function public.api_replace_sheet(p_sheet text, p_rows jsonb)
returns jsonb
language plpgsql security invoker set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row    jsonb;
  v_id     text;
  v_count  int := 0;
begin
  perform app.guard_sheet(p_sheet, true);
  if v_tenant is null then raise exception 'no active tenant'; end if;

  delete from app.records where tenant_id = v_tenant and sheet = p_sheet;

  if p_rows is not null and jsonb_typeof(p_rows) = 'array' then
    for v_row in select * from jsonb_array_elements(p_rows) loop
      v_id := coalesce(v_row ->> 'id', gen_random_uuid()::text);
      insert into app.records(tenant_id, sheet, id, data)
      values (v_tenant, p_sheet, v_id, v_row - 'id');
      v_count := v_count + 1;
    end loop;
  end if;

  return jsonb_build_object('success', true, 'count', v_count);
end;
$$;

-- Business logic RPCs (guards added; bodies unchanged from 0007)
create or replace function public.api_add_clinic_visit(
  p_sheet text, p_visit jsonb, p_adjustments jsonb
) returns jsonb
language plpgsql security invoker set search_path = app, public
as $$
declare
  v_tenant   uuid := app.current_tenant_id();
  v_visit_id text := coalesce(nullif(p_visit->>'id',''), gen_random_uuid()::text);
  v_adj   jsonb;
  v_medid text;
  v_data  jsonb;
  v_cur   numeric; v_cap numeric; v_delta numeric; v_new numeric;
  v_applied int := 0; v_failed int := 0;
begin
  perform app.guard_sheet(p_sheet, true);
  perform app.guard_sheet('Medications', true);
  if v_tenant is null then raise exception 'no active tenant'; end if;

  insert into app.records(tenant_id, sheet, id, data)
  values (v_tenant, p_sheet, v_visit_id, (p_visit - 'id') - 'medicationAdjustments' - '__timeoutMs')
  on conflict (tenant_id, sheet, id)
  do update set data = excluded.data, updated_at = now();

  if p_adjustments is not null and jsonb_typeof(p_adjustments) = 'array' then
    for v_adj in select * from jsonb_array_elements(p_adjustments) loop
      v_delta := coalesce(nullif(v_adj->>'delta','')::numeric, 0);
      v_medid := v_adj->>'medicationId';
      if v_delta = 0 or v_medid is null then continue; end if;

      select data into v_data from app.records
       where tenant_id = v_tenant and sheet = 'Medications' and id = v_medid
       for update;
      if not found then v_failed := v_failed + 1; continue; end if;

      v_cur := nullif(v_data->>'remainingQuantity','')::numeric;
      if v_cur is null then v_cur := coalesce(nullif(v_data->>'quantity','')::numeric, 0); end if;
      v_cap := nullif(v_data->>'quantityAdded','')::numeric;
      if v_cap is null then v_cap := coalesce(nullif(v_data->>'quantity','')::numeric, 0); end if;
      if v_cap <= 0 then v_cap := greatest(v_cur, abs(v_delta)); end if;

      v_new := v_cur - v_delta;
      if v_new < 0 then v_new := 0; end if;
      if v_new > v_cap then v_new := v_cap; end if;

      update app.records
         set data = data || jsonb_build_object(
               'remainingQuantity', v_new,
               'quantityAdded', v_cap,
               'status', case when v_new = 0 then 'منتهي'
                              when v_new <= 10 then 'منخفض'
                              else coalesce(v_data->>'status','ساري') end),
             updated_at = now()
       where tenant_id = v_tenant and sheet = 'Medications' and id = v_medid;
      v_applied := v_applied + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'success', true, 'visitId', v_visit_id,
    'medicationAdjustmentsResult', jsonb_build_object('applied', v_applied, 'failed', v_failed)
  );
end;
$$;

create or replace function public.api_get_all_clinic_visits()
returns jsonb
language plpgsql stable security invoker set search_path = app, public
as $$
begin
  perform app.guard_sheet('ClinicVisits', false);
  perform app.guard_sheet('ClinicContractorVisits', false);
  return (
    select coalesce(jsonb_agg(data || jsonb_build_object('id', id)), '[]'::jsonb)
      from app.records
     where tenant_id = app.current_tenant_id()
       and sheet in ('ClinicVisits', 'ClinicContractorVisits')
  );
end;
$$;

create or replace function public.api_update_task_completion(p_task_id text, p_rate numeric)
returns jsonb
language plpgsql security invoker set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_uid    text := app.current_user_id()::text;
  v_status text;
  v_cnt    int;
begin
  perform app.guard_sheet('UserTasks', true);
  if p_rate is null or p_rate < 0 or p_rate > 100 then
    raise exception 'completion rate must be 0..100';
  end if;
  v_status := case when p_rate >= 100 then 'مكتمل'
                   when p_rate > 0   then 'قيد التنفيذ'
                   else 'جديدة' end;

  update app.records
     set data = data
        || jsonb_build_object('completionRate', p_rate, 'status', v_status)
        || jsonb_build_object('userProgress',
             coalesce(data->'userProgress','{}'::jsonb)
             || jsonb_build_object(v_uid, jsonb_build_object('completionRate', p_rate, 'updatedAt', now()))),
         updated_at = now()
   where tenant_id = v_tenant and sheet = 'UserTasks' and id = p_task_id;
  get diagnostics v_cnt = row_count;
  return jsonb_build_object('success', v_cnt > 0, 'id', p_task_id);
end;
$$;

create or replace function public.api_get_user_tasks(p_user_id text)
returns jsonb
language plpgsql stable security invoker set search_path = app, public
as $$
begin
  perform app.guard_sheet('UserTasks', false);
  return (
    select coalesce(jsonb_agg(data || jsonb_build_object('id', id)), '[]'::jsonb)
      from app.records r
     where r.tenant_id = app.current_tenant_id()
       and r.sheet = 'UserTasks'
       and (
         (r.data->>'assignedTo') in ('all','جميع المستخدمين')
         or (r.data->>'assignedTo') = p_user_id
         or (jsonb_typeof(r.data->'assignedTo') = 'array' and (r.data->'assignedTo') ? p_user_id)
       )
  );
end;
$$;

-- ---- Billing status: limits + payment flag -------------------
create or replace function public.api_billing_status()
returns jsonb
language sql stable security invoker set search_path = app, public
as $$
  select jsonb_build_object(
    'tenant', (select jsonb_build_object(
      'id', t.id, 'name', t.name, 'plan_id', t.plan_id, 'status', t.status,
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

-- ---- Invitations ---------------------------------------------
create or replace function public.api_invite_member(p_email text, p_role text default 'user')
returns jsonb
language plpgsql security invoker set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_id uuid;
  v_role text := coalesce(nullif(trim(p_role), ''), 'user');
begin
  if app.current_user_role() not in ('owner', 'admin') then
    raise exception 'forbidden: owner or admin only';
  end if;
  if v_tenant is null then raise exception 'no active tenant'; end if;
  if coalesce(trim(p_email), '') = '' then raise exception 'email required'; end if;
  if v_role not in ('user', 'safety_officer', 'admin') then
    raise exception 'invalid role';
  end if;
  perform app.guard_user_limit();

  insert into app.invitations (tenant_id, email, role, token, invited_by, expires_at)
  values (v_tenant, lower(trim(p_email)), v_role, v_token, app.current_user_id(),
          now() + interval '14 days')
  returning id into v_id;

  insert into app.audit_log (tenant_id, user_id, action, entity, entity_id, detail)
  values (v_tenant, app.current_user_id(), 'member.invited', 'invitation', v_id::text,
          jsonb_build_object('email', lower(trim(p_email)), 'role', v_role));

  return jsonb_build_object(
    'success', true,
    'invitation_id', v_id,
    'token', v_token,
    'accept_url', '/accept-invite?token=' || v_token
  );
end;
$$;

create or replace function public.api_list_invitations()
returns jsonb
language sql stable security invoker set search_path = app, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'email', i.email, 'role', i.role,
    'expires_at', i.expires_at, 'accepted_at', i.accepted_at,
    'created_at', i.created_at) order by i.created_at desc), '[]'::jsonb)
    from app.invitations i
   where i.tenant_id = app.current_tenant_id()
     and app.current_user_role() in ('owner', 'admin')
$$;

create or replace function public.api_revoke_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql security invoker set search_path = app, public
as $$
declare v_found int;
begin
  if app.current_user_role() not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;
  delete from app.invitations
   where id = p_invitation_id
     and tenant_id = app.current_tenant_id()
     and accepted_at is null;
  get diagnostics v_found = row_count;
  return jsonb_build_object('success', v_found > 0);
end;
$$;

create or replace function public.api_accept_invitation(p_token text)
returns jsonb
language plpgsql security definer set search_path = app, public
as $$
declare
  v_uid uuid := app.current_user_id();
  v_email text;
  v_inv app.invitations%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select email into v_email from app.profiles where id = v_uid;

  select * into v_inv from app.invitations
   where token = p_token and accepted_at is null and expires_at > now()
   limit 1;
  if not found then raise exception 'invitation not found or expired'; end if;
  if lower(v_email) <> lower(v_inv.email) then
    raise exception 'invitation email does not match your account';
  end if;
  if exists (
    select 1 from app.tenant_users tu
     where tu.tenant_id = v_inv.tenant_id and tu.user_id = v_uid
  ) then
    update app.invitations set accepted_at = now() where id = v_inv.id;
    return jsonb_build_object('success', true, 'tenant_id', v_inv.tenant_id, 'already_member', true);
  end if;

  if (select count(*) from app.tenant_users where tenant_id = v_inv.tenant_id and status = 'active')
       + (select count(*) from app.invitations where tenant_id = v_inv.tenant_id
            and accepted_at is null and expires_at > now() and id <> v_inv.id)
     >= (select p.max_users from app.tenants t join app.plans p on p.id = t.plan_id
          where t.id = v_inv.tenant_id) then
    raise exception 'organization seat limit reached';
  end if;

  insert into app.tenant_users (tenant_id, user_id, role, status)
  values (v_inv.tenant_id, v_uid, v_inv.role, 'active');

  update app.invitations set accepted_at = now() where id = v_inv.id;

  update app.profiles
     set default_tenant_id = coalesce(default_tenant_id, v_inv.tenant_id)
   where id = v_uid;

  return jsonb_build_object('success', true, 'tenant_id', v_inv.tenant_id, 'role', v_inv.role);
end;
$$;

grant execute on function public.api_invite_member(text, text) to authenticated;
grant execute on function public.api_list_invitations() to authenticated;
grant execute on function public.api_revoke_invitation(uuid) to authenticated;
grant execute on function public.api_accept_invitation(text) to authenticated;

grant execute on function app.guard_sheet(text, boolean) to authenticated;
grant execute on function app.is_module_allowed(text) to authenticated;
