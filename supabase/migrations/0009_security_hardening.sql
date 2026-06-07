-- ============================================================
-- 0009_security_hardening.sql
-- Closes the review findings #1–#4:
--   #1 real per-tenant roles (no more "everyone is admin")
--   #2 block tenant_users self-escalation (writes = owner/admin only)
--   #3 make plan-gating actually work (return plan modules to the UI)
--   #4 enforce read-only for frozen / past_due tenants at the DB level
-- Idempotent. Apply after 0008.
-- ============================================================

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------

-- Role of the current user within the active tenant ('owner'|'admin'|...|null).
-- SECURITY DEFINER so it can read tenant_users regardless of that table's RLS;
-- it only ever returns the caller's OWN membership row.
create or replace function app.current_user_role()
returns text
language sql stable security definer set search_path = app, public
as $$
  select role from app.tenant_users
   where tenant_id = app.current_tenant_id()
     and user_id   = app.current_user_id()
   limit 1
$$;
grant execute on function app.current_user_role() to anon, authenticated, service_role;

-- Is the active tenant allowed to WRITE? (frozen/canceled ⇒ read-only)
create or replace function app.tenant_is_writable()
returns boolean
language sql stable security definer set search_path = app, public
as $$
  select coalesce(
    (select status not in ('frozen','canceled')
       from app.tenants where id = app.current_tenant_id()),
    false)
$$;
grant execute on function app.tenant_is_writable() to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- #4  app.records: read stays tenant-scoped; writes also require a
--     writable (non-frozen) tenant. Command-specific policies replace
--     the single permissive policy.
-- ------------------------------------------------------------
drop policy if exists records_tenant  on app.records;
drop policy if exists records_select  on app.records;
drop policy if exists records_insert  on app.records;
drop policy if exists records_update  on app.records;
drop policy if exists records_delete  on app.records;

create policy records_select on app.records for select
  using (tenant_id = app.current_tenant_id());

create policy records_insert on app.records for insert
  with check (tenant_id = app.current_tenant_id() and app.tenant_is_writable());

create policy records_update on app.records for update
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id() and app.tenant_is_writable());

create policy records_delete on app.records for delete
  using (tenant_id = app.current_tenant_id() and app.tenant_is_writable());

-- ------------------------------------------------------------
-- #2  app.tenant_users: any member may READ memberships of their tenant,
--     but only owner/admin may INSERT/UPDATE/DELETE (kills self-escalation
--     of role to 'owner'). Provisioning still works because
--     create_tenant_for_current_user is SECURITY DEFINER (bypasses RLS).
-- ------------------------------------------------------------
drop policy if exists tenant_users_member      on app.tenant_users;
drop policy if exists tenant_users_select       on app.tenant_users;
drop policy if exists tenant_users_admin_write  on app.tenant_users;

create policy tenant_users_select on app.tenant_users for select
  using (tenant_id = app.current_tenant_id());

create policy tenant_users_admin_write on app.tenant_users for all
  using      (tenant_id = app.current_tenant_id() and app.current_user_role() in ('owner','admin'))
  with check (tenant_id = app.current_tenant_id() and app.current_user_role() in ('owner','admin'));

-- Likewise: only owner/admin may UPDATE the tenant itself (name/settings/plan).
drop policy if exists tenants_member       on app.tenants;
drop policy if exists tenants_select       on app.tenants;
drop policy if exists tenants_admin_write  on app.tenants;

create policy tenants_select on app.tenants for select
  using (id = app.current_tenant_id());

create policy tenants_admin_write on app.tenants for update
  using      (id = app.current_tenant_id() and app.current_user_role() in ('owner','admin'))
  with check (id = app.current_tenant_id() and app.current_user_role() in ('owner','admin'));

-- ------------------------------------------------------------
-- #1  api_me(): authoritative identity + role for the frontend.
--     The UI must derive the role from THIS, not assume admin.
-- ------------------------------------------------------------
create or replace function public.api_me()
returns jsonb
language sql stable security invoker set search_path = app, public
as $$
  select jsonb_build_object(
    'user_id',   app.current_user_id(),
    'tenant_id', app.current_tenant_id(),
    'role',      app.current_user_role(),
    'tenant', (select jsonb_build_object('id',id,'name',name,'plan_id',plan_id,
                                         'status',status,'trial_ends_at',trial_ends_at)
               from app.tenants where id = app.current_tenant_id())
  )
$$;
grant execute on function public.api_me() to authenticated;

-- ------------------------------------------------------------
-- #3  api_billing_status(): also return the active plan's module allow-list
--     so plan-gating can work (it previously queried a non-exposed table).
-- ------------------------------------------------------------
create or replace function public.api_billing_status()
returns jsonb
language sql stable security invoker set search_path = app, public
as $$
  select jsonb_build_object(
    'tenant', (select jsonb_build_object('id',id,'name',name,'plan_id',plan_id,'status',status,'trial_ends_at',trial_ends_at)
               from app.tenants where id = app.current_tenant_id()),
    'modules', (select p.modules from app.plans p
                 where p.id = (select plan_id from app.tenants where id = app.current_tenant_id())),
    'subscription', (select jsonb_build_object('status',status,'plan_id',plan_id,'current_period_end',current_period_end,'cancel_at_period_end',cancel_at_period_end)
               from app.subscriptions where tenant_id = app.current_tenant_id()
               order by updated_at desc limit 1),
    'plans', (select jsonb_agg(jsonb_build_object('id',id,'name',name,'max_users',max_users,'price_id',price_id,'modules',modules) order by sort_order)
               from app.plans where is_active)
  )
$$;
grant execute on function public.api_billing_status() to authenticated;
