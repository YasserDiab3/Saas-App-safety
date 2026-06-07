-- ============================================================
-- 0010_platform_admin.sql
-- Platform (super) admin: controls which modules each PLAN includes.
-- This is a PLATFORM-level capability (affects every tenant), distinct
-- from a tenant's own admin/owner. Guarded by profiles.is_platform_admin.
-- ============================================================

-- Flag a profile as platform super-admin (manages plans globally).
alter table app.profiles
  add column if not exists is_platform_admin boolean not null default false;

-- Helper: is the current user a platform super-admin?
create or replace function app.is_platform_admin()
returns boolean
language sql stable security definer set search_path = app, public
as $$
  select coalesce(
    (select is_platform_admin from app.profiles where id = app.current_user_id()),
    false)
$$;
grant execute on function app.is_platform_admin() to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- Admin RPC: list all plans (with module allow-lists + limits).
-- ------------------------------------------------------------
create or replace function public.api_admin_list_plans()
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'max_users', max_users,
      'storage_mb', storage_mb, 'modules', modules,
      'is_active', is_active, 'sort_order', sort_order
    ) order by sort_order), '[]'::jsonb)
    from app.plans
  );
end;
$$;
grant execute on function public.api_admin_list_plans() to authenticated;

-- ------------------------------------------------------------
-- Admin RPC: set a plan's module allow-list.
-- p_modules: jsonb array of module keys (nav data-section keys).
-- An EMPTY array [] means "all modules" (matches gating convention).
-- ------------------------------------------------------------
create or replace function public.api_admin_set_plan_modules(p_plan_id text, p_modules jsonb)
returns jsonb
language plpgsql security definer set search_path = app, public
as $$
declare v_cnt int;
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;
  if p_modules is null or jsonb_typeof(p_modules) <> 'array' then
    raise exception 'p_modules must be a json array';
  end if;
  update app.plans set modules = p_modules where id = p_plan_id;
  get diagnostics v_cnt = row_count;
  if v_cnt = 0 then raise exception 'plan % not found', p_plan_id; end if;

  insert into app.audit_log (tenant_id, user_id, action, entity, entity_id, detail)
  values (null, app.current_user_id(), 'plan.modules_updated', 'plan', p_plan_id,
          jsonb_build_object('modules', p_modules));
  return jsonb_build_object('success', true, 'plan_id', p_plan_id, 'modules', p_modules);
end;
$$;
grant execute on function public.api_admin_set_plan_modules(text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- Optional: set plan limits (users / storage) too.
-- ------------------------------------------------------------
create or replace function public.api_admin_set_plan_limits(p_plan_id text, p_max_users int, p_storage_mb int)
returns jsonb
language plpgsql security definer set search_path = app, public
as $$
declare v_cnt int;
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;
  update app.plans
     set max_users  = coalesce(p_max_users, max_users),
         storage_mb = coalesce(p_storage_mb, storage_mb)
   where id = p_plan_id;
  get diagnostics v_cnt = row_count;
  if v_cnt = 0 then raise exception 'plan % not found', p_plan_id; end if;
  return jsonb_build_object('success', true, 'plan_id', p_plan_id);
end;
$$;
grant execute on function public.api_admin_set_plan_limits(text, int, int) to authenticated;

-- ------------------------------------------------------------
-- Designate the initial platform admin + a STARTER module set for Free.
-- (You will adjust Free's modules from the admin panel.)
-- Free starter: clinic + incidents + near-miss + daily observations + user tasks.
-- Pro / Enterprise stay [] (all modules).
-- ------------------------------------------------------------
update app.profiles set is_platform_admin = true where email = 'owner@test.com';

update app.plans
   set modules = '["clinic","incidents","nearmiss","daily-observations","user-tasks"]'::jsonb
 where id = 'free';
