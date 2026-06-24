-- ============================================================
-- 0027_security_grant_hardening.sql
-- Revoke EXECUTE on service-only SECURITY DEFINER RPCs from anon/authenticated.
-- (REVOKE FROM PUBLIC alone does not remove role grants on Supabase.)
-- ============================================================

-- device-session edge function (service_role only)
revoke all on function public.api_upsert_device_session(jsonb) from public;
revoke all on function public.api_upsert_device_session(jsonb) from anon;
revoke all on function public.api_upsert_device_session(jsonb) from authenticated;
grant execute on function public.api_upsert_device_session(jsonb) to service_role;

-- admin-notify edge function helpers (service_role only)
revoke all on function public.api_admin_insert_user_notification(uuid, uuid, text, text) from public;
revoke all on function public.api_admin_insert_user_notification(uuid, uuid, text, text) from anon;
revoke all on function public.api_admin_insert_user_notification(uuid, uuid, text, text) from authenticated;
grant execute on function public.api_admin_insert_user_notification(uuid, uuid, text, text) to service_role;

revoke all on function public.api_admin_record_notification(uuid, uuid, text, text, text, jsonb, text, uuid) from public;
revoke all on function public.api_admin_record_notification(uuid, uuid, text, text, text, jsonb, text, uuid) from anon;
revoke all on function public.api_admin_record_notification(uuid, uuid, text, text, text, jsonb, text, uuid) from authenticated;
grant execute on function public.api_admin_record_notification(uuid, uuid, text, text, text, jsonb, text, uuid) to service_role;

-- Defense in depth: JWT tenant_id claim must match active membership
create or replace function app.current_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = app, public
as $$
declare
  v_claim uuid;
  v_uid   uuid;
  v_tenant uuid;
begin
  begin
    v_uid := nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid;
  exception when others then
    v_uid := null;
  end;

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

  if v_claim is not null and v_uid is not null then
    if exists (
      select 1 from app.tenant_users tu
       where tu.user_id = v_uid
         and tu.tenant_id = v_claim
         and tu.status = 'active'
    ) then
      return v_claim;
    end if;
  end if;

  if v_uid is null then
    return null;
  end if;

  select default_tenant_id into v_tenant from app.profiles where id = v_uid;
  return v_tenant;
end;
$$;

grant execute on function app.current_tenant_id() to anon, authenticated, service_role;
