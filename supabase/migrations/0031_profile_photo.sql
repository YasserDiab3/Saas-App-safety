-- ============================================================
-- 0031_profile_photo.sql — user profile photo (self-service)
-- ============================================================

alter table app.profiles
  add column if not exists photo_url text;

-- Self-service profile patch (photo + display name only)
create or replace function public.api_update_my_profile(p_patch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_uid uuid := app.current_user_id();
  v_photo text;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  v_photo := nullif(trim(coalesce(p_patch->>'photo_url', p_patch->>'photo', '')), '');
  v_name := nullif(trim(coalesce(p_patch->>'full_name', p_patch->>'name', '')), '');

  update app.profiles
     set photo_url = coalesce(v_photo, photo_url),
         full_name = coalesce(v_name, full_name),
         updated_at = now()
   where id = v_uid;

  return jsonb_build_object(
    'success', true,
    'photo_url', (select p.photo_url from app.profiles p where p.id = v_uid),
    'full_name', (select p.full_name from app.profiles p where p.id = v_uid)
  );
end;
$$;

grant execute on function public.api_update_my_profile(jsonb) to authenticated;

-- Expose profile photo in api_me for sidebar / profile UI
create or replace function public.api_me()
returns jsonb
language sql stable security invoker set search_path = app, public
as $$
  select jsonb_build_object(
    'user_id',   app.current_user_id(),
    'tenant_id', app.current_tenant_id(),
    'role',      app.current_user_role(),
    'email',     (select p.email from app.profiles p where p.id = app.current_user_id()),
    'full_name', (select p.full_name from app.profiles p where p.id = app.current_user_id()),
    'photo_url', (select p.photo_url from app.profiles p where p.id = app.current_user_id()),
    'phone_country_code', (select p.phone_country_code from app.profiles p where p.id = app.current_user_id()),
    'phone_number', (select p.phone_number from app.profiles p where p.id = app.current_user_id()),
    'tenant', (select jsonb_build_object(
                 'id', id,
                 'name', name,
                 'org_code', org_code,
                 'plan_id', plan_id,
                 'status', status,
                 'trial_ends_at', trial_ends_at
               )
               from app.tenants where id = app.current_tenant_id())
  )
$$;
