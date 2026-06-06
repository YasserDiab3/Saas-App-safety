-- ============================================================
-- 0006_tenant_resolution.sql
-- Resolve the active tenant WITHOUT requiring a service-role step.
--
-- Problem: setting app_metadata.tenant_id as a JWT claim needs the
-- service_role key (admin) — i.e. an Edge Function at onboarding.
-- For a fully client-side pilot (anon key only), resolve the tenant from
-- the DB using auth.uid() → profiles.default_tenant_id.
--
-- We keep JWT-claim support too (coalesce): once claim-based tenant
-- switching is added later, it takes priority. SECURITY DEFINER lets the
-- internal profiles lookup bypass RLS safely (it only reads the caller's
-- own row, keyed by auth.uid()).
-- ============================================================

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
  -- 1) explicit JWT claim (future: tenant switching)
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
    return v_claim;
  end if;

  -- 2) fallback: the user's default tenant from their profile
  begin
    v_uid := nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid;
  exception when others then
    v_uid := null;
  end;
  if v_uid is null then
    return null;
  end if;

  select default_tenant_id into v_tenant from app.profiles where id = v_uid;
  return v_tenant;
end;
$$;

-- ensure callers can execute it
grant execute on function app.current_tenant_id() to anon, authenticated, service_role;
