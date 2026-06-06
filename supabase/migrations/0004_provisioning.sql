-- ============================================================
-- 0004_provisioning.sql — signup → profile + tenant provisioning
-- Powers the self-serve onboarding flow (Phase 4).
-- ============================================================

-- ------------------------------------------------------------
-- Auto-create a profile row whenever a new auth user signs up.
-- ------------------------------------------------------------
create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  insert into app.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- ------------------------------------------------------------
-- Provision a new tenant for the current (just-signed-up) user.
-- Creates: tenant (trialing) + owner membership + sets default tenant.
-- Returns the new tenant id.
--
-- NOTE: after this, the backend (service role) must set the user's
--   app_metadata.tenant_id claim so subsequent JWTs carry it (RLS).
--   That call lives in the onboarding Edge Function (Phase 4).
-- ------------------------------------------------------------
create or replace function app.create_tenant_for_current_user(p_name text)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid    uuid := app.current_user_id();
  v_tenant uuid;
  v_trial  integer := 14;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'tenant name required';
  end if;

  insert into app.tenants (name, status, plan_id, trial_ends_at)
  values (p_name, 'trialing', 'free', now() + (v_trial || ' days')::interval)
  returning id into v_tenant;

  insert into app.tenant_users (tenant_id, user_id, role, status)
  values (v_tenant, v_uid, 'owner', 'active');

  update app.profiles set default_tenant_id = v_tenant where id = v_uid;

  insert into app.audit_log (tenant_id, user_id, action, entity, entity_id, detail)
  values (v_tenant, v_uid, 'tenant.provisioned', 'tenant', v_tenant::text,
          jsonb_build_object('name', p_name));

  return v_tenant;
end;
$$;

-- Allow authenticated users to call the provisioning RPC
grant execute on function app.create_tenant_for_current_user(text) to authenticated;
grant execute on function app.read_sheet(text)              to authenticated;
grant execute on function app.upsert_record(text, text, jsonb) to authenticated;
grant execute on function app.patch_record(text, text, jsonb)  to authenticated;
grant execute on function app.delete_record(text, text)        to authenticated;

-- Expose the app schema to the API roles (PostgREST / Supabase client)
grant usage on schema app to anon, authenticated, service_role;
grant select on app.plans  to anon, authenticated;
grant select on app.sheets to anon, authenticated;
grant select, insert, update, delete on app.records to authenticated;
grant select, insert, update, delete on app.tenants, app.profiles,
      app.tenant_users, app.subscriptions, app.invitations, app.audit_log
      to authenticated;
