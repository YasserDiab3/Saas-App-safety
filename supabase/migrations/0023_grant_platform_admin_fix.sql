-- ============================================================
-- 0023_grant_platform_admin_fix.sql
-- Fix: use DISABLE TRIGGER (session_replication_role denied on Supabase).
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

  alter table app.profiles disable trigger trg_profiles_guard;

  begin
    insert into app.profiles (id, email, full_name, is_platform_admin)
    select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', u.email), true
      from auth.users u
     where u.id = v_uid
    on conflict (id) do update
      set is_platform_admin = true,
          email = excluded.email,
          full_name = coalesce(app.profiles.full_name, excluded.full_name);
  exception when others then
    alter table app.profiles enable trigger trg_profiles_guard;
    raise;
  end;

  alter table app.profiles enable trigger trg_profiles_guard;

  return jsonb_build_object('success', true, 'user_id', v_uid, 'email', p_email);
end;
$$;

create or replace function app.revoke_platform_admin_by_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = app, public, auth
as $$
declare
  v_uid uuid;
begin
  select u.id into v_uid
    from auth.users u
   where lower(u.email) = lower(trim(p_email))
   limit 1;

  if v_uid is null then
    return jsonb_build_object('success', false, 'reason', 'user not found');
  end if;

  alter table app.profiles disable trigger trg_profiles_guard;
  begin
    update app.profiles set is_platform_admin = false where id = v_uid;
  exception when others then
    alter table app.profiles enable trigger trg_profiles_guard;
    raise;
  end;
  alter table app.profiles enable trigger trg_profiles_guard;

  return jsonb_build_object('success', true, 'user_id', v_uid);
end;
$$;

revoke all on function app.revoke_platform_admin_by_email(text) from public;
grant execute on function app.revoke_platform_admin_by_email(text) to service_role;

create or replace function public.revoke_platform_admin_by_email(p_email text)
returns jsonb
language sql
security definer
set search_path = app, public
as $$
  select app.revoke_platform_admin_by_email(p_email);
$$;

revoke all on function public.revoke_platform_admin_by_email(text) from public;
grant execute on function public.revoke_platform_admin_by_email(text) to service_role;
