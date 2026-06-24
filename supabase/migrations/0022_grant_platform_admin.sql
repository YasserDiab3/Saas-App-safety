-- ============================================================
-- 0022_grant_platform_admin.sql
-- Safe helper to designate platform admin (bypasses profiles guard).
-- Callable from SQL Editor (postgres) or service_role only.
-- ============================================================

create or replace function app.grant_platform_admin_by_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_uid uuid;
  v_email text;
begin
  v_email := lower(trim(p_email));
  if v_email = '' then
    raise exception 'email required';
  end if;

  select u.id into v_uid
    from auth.users u
   where lower(u.email) = v_email
   limit 1;

  if v_uid is null then
    raise exception 'user not found: %', p_email;
  end if;

  -- Bypass trg_profiles_guard (0019) for this privileged bootstrap only.
  perform set_config('session_replication_role', 'replica', true);

  insert into app.profiles (id, email, full_name, is_platform_admin)
  select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', u.email), true
    from auth.users u
   where u.id = v_uid
  on conflict (id) do update
    set is_platform_admin = true,
        email = excluded.email,
        full_name = coalesce(app.profiles.full_name, excluded.full_name);

  perform set_config('session_replication_role', 'origin', true);

  return jsonb_build_object('success', true, 'user_id', v_uid, 'email', p_email);
end;
$$;

revoke all on function app.grant_platform_admin_by_email(text) from public;
grant execute on function app.grant_platform_admin_by_email(text) to service_role;

-- Convenience wrapper for SQL Editor (runs as postgres superuser).
create or replace function public.grant_platform_admin_by_email(p_email text)
returns jsonb
language sql
security definer
set search_path = app, public
as $$
  select app.grant_platform_admin_by_email(p_email);
$$;

revoke all on function public.grant_platform_admin_by_email(text) from public;
grant execute on function public.grant_platform_admin_by_email(text) to service_role;
