-- ============================================================
-- 0020_terms_acceptance.sql — record ToS acceptance at signup
-- ============================================================

alter table app.tenants
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

create or replace function app.create_tenant_for_current_user(
  p_name text,
  p_phone_country text default null,
  p_phone_number text default null,
  p_terms_version text default null
)
returns uuid
language plpgsql security definer set search_path = app, public
as $$
declare
  v_uid      uuid := app.current_user_id();
  v_tenant   uuid;
  v_trial    integer := 14;
  v_org_code text;
  v_terms    text := nullif(trim(p_terms_version), '');
  v_email    text;
  v_domain   text;
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
  if v_terms is null then
    raise exception 'terms acceptance required';
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
  -- Require organization work email (reject Gmail, Hotmail, etc.)
  select email into v_email from auth.users where id = v_uid;
  v_domain := split_part(coalesce(v_email, ''), '@', 2);
  if v_domain = '' or app.is_consumer_email_domain(v_domain) then
    raise exception 'organization work email required';
  end if;

  v_org_code := app.generate_org_code();

  insert into app.tenants (
    name, status, plan_id, trial_ends_at, org_code,
    terms_accepted_at, terms_version
  )
  values (
    p_name, 'trialing', 'free', now() + (v_trial || ' days')::interval, v_org_code,
    now(), v_terms
  )
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
            'phone_country', trim(p_phone_country),
            'terms_version', v_terms,
            'terms_accepted_at', now()
          ));

  return v_tenant;
end;
$$;

drop function if exists public.api_provision_tenant(text, text, text);

create or replace function public.api_provision_tenant(
  p_name text,
  p_phone_country text default null,
  p_phone_number text default null,
  p_terms_version text default null
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
  v_tenant := app.create_tenant_for_current_user(
    p_name, p_phone_country, p_phone_number, p_terms_version
  );
  select t.org_code into v_code from app.tenants t where t.id = v_tenant;
  return jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant,
    'org_code', v_code,
    'terms_version', nullif(trim(p_terms_version), '')
  );
end;
$$;

grant execute on function public.api_provision_tenant(text, text, text, text) to authenticated;
