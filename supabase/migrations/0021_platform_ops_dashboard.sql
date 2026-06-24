-- ============================================================
-- 0021_platform_ops_dashboard.sql
-- Platform admin ops dashboard: cross-tenant read RPCs.
-- Guarded by app.is_platform_admin() — security definer.
-- ============================================================

-- ------------------------------------------------------------
-- Overview KPIs + last 10 tenants
-- ------------------------------------------------------------
create or replace function public.api_admin_overview()
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;

  return jsonb_build_object(
    'tenants_total', (select count(*)::int from app.tenants),
    'users_total', (select count(*)::int from app.profiles),
    'active_subscriptions', (
      select count(distinct s.tenant_id)::int
        from app.subscriptions s
       where s.status in ('active', 'trialing')
    ),
    'trialing', (select count(*)::int from app.tenants where status = 'trialing'),
    'past_due', (select count(*)::int from app.tenants where status = 'past_due'),
    'frozen', (select count(*)::int from app.tenants where status in ('frozen', 'canceled')),
    'recent_tenants', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'org_code', t.org_code,
        'plan_id', t.plan_id, 'status', t.status, 'created_at', t.created_at
      ) order by t.created_at desc), '[]'::jsonb)
      from (
        select id, name, org_code, plan_id, status, created_at
          from app.tenants
         order by created_at desc
         limit 10
      ) t
    )
  );
end;
$$;

-- ------------------------------------------------------------
-- Paginated tenant list with member counts
-- ------------------------------------------------------------
create or replace function public.api_admin_list_tenants(
  p_limit int default 50,
  p_offset int default 0,
  p_search text default null
)
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(p_search), '');
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;

  return jsonb_build_object(
    'total', (
      select count(*)::int
        from app.tenants t
       where v_search is null
          or t.name ilike '%' || v_search || '%'
          or t.org_code ilike '%' || v_search || '%'
    ),
    'limit', v_limit,
    'offset', v_offset,
    'items', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
        from (
          select
            t.id,
            t.name,
            t.org_code,
            t.plan_id,
            t.status,
            t.trial_ends_at,
            t.stripe_customer_id,
            t.created_at,
            (select count(*)::int
               from app.tenant_users tu
              where tu.tenant_id = t.id and tu.status = 'active') as member_count
            from app.tenants t
           where v_search is null
              or t.name ilike '%' || v_search || '%'
              or t.org_code ilike '%' || v_search || '%'
           order by t.created_at desc
           limit v_limit offset v_offset
        ) x
    )
  );
end;
$$;

-- ------------------------------------------------------------
-- Single tenant detail: members, subscription, limits
-- ------------------------------------------------------------
create or replace function public.api_admin_get_tenant(p_tenant_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
declare
  v_tenant jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;
  if p_tenant_id is null then
    raise exception 'p_tenant_id required';
  end if;

  select jsonb_build_object(
    'id', t.id, 'name', t.name, 'org_code', t.org_code,
    'plan_id', t.plan_id, 'status', t.status,
    'trial_ends_at', t.trial_ends_at,
    'stripe_customer_id', t.stripe_customer_id,
    'default_lang', t.default_lang,
    'created_at', t.created_at, 'updated_at', t.updated_at
  ) into v_tenant
  from app.tenants t
  where t.id = p_tenant_id;

  if v_tenant is null then
    raise exception 'tenant not found';
  end if;

  return jsonb_build_object(
    'tenant', v_tenant,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', tu.user_id,
        'email', p.email,
        'full_name', p.full_name,
        'role', tu.role,
        'status', tu.status,
        'created_at', tu.created_at
      ) order by tu.created_at), '[]'::jsonb)
      from app.tenant_users tu
      join app.profiles p on p.id = tu.user_id
      where tu.tenant_id = p_tenant_id
    ),
    'subscription', (
      select jsonb_build_object(
        'status', s.status,
        'plan_id', s.plan_id,
        'current_period_end', s.current_period_end,
        'cancel_at_period_end', s.cancel_at_period_end,
        'stripe_subscription_id', s.stripe_subscription_id,
        'updated_at', s.updated_at
      )
      from app.subscriptions s
      where s.tenant_id = p_tenant_id
      order by s.updated_at desc
      limit 1
    ),
    'limits', jsonb_build_object(
      'user_count', (
        select count(*)::int from app.tenant_users
         where tenant_id = p_tenant_id and status = 'active'
      ),
      'pending_invites', (
        select count(*)::int from app.invitations
         where tenant_id = p_tenant_id
           and accepted_at is null and expires_at > now()
      ),
      'max_users', (
        select p.max_users from app.plans p
          join app.tenants t on t.plan_id = p.id
         where t.id = p_tenant_id
      ),
      'storage_used_mb', round((
        select coalesce(sum((o.metadata->>'size')::bigint), 0)::numeric
          from storage.objects o
         where o.bucket_id = 'tenant-attachments'
           and app.storage_tenant_id(o.name) = p_tenant_id
      ) / 1024.0 / 1024.0, 2),
      'storage_mb', (
        select p.storage_mb from app.plans p
          join app.tenants t on t.plan_id = p.id
         where t.id = p_tenant_id
      )
    )
  );
end;
$$;

-- ------------------------------------------------------------
-- Paginated user list with tenant memberships
-- ------------------------------------------------------------
create or replace function public.api_admin_list_users(
  p_limit int default 50,
  p_offset int default 0,
  p_search text default null
)
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(p_search), '');
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;

  return jsonb_build_object(
    'total', (
      select count(*)::int
        from app.profiles p
        left join auth.users u on u.id = p.id
       where v_search is null
          or p.email ilike '%' || v_search || '%'
          or p.full_name ilike '%' || v_search || '%'
    ),
    'limit', v_limit,
    'offset', v_offset,
    'items', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
        from (
          select
            p.id,
            p.email,
            p.full_name,
            p.phone_country_code,
            p.phone_number,
            p.is_platform_admin,
            p.created_at,
            (u.email_confirmed_at is not null) as email_confirmed,
            (
              select coalesce(jsonb_agg(jsonb_build_object(
                'tenant_id', tu.tenant_id,
                'tenant_name', t.name,
                'org_code', t.org_code,
                'role', tu.role,
                'status', tu.status
              ) order by t.name), '[]'::jsonb)
              from app.tenant_users tu
              join app.tenants t on t.id = tu.tenant_id
              where tu.user_id = p.id
            ) as memberships
            from app.profiles p
            left join auth.users u on u.id = p.id
           where v_search is null
              or p.email ilike '%' || v_search || '%'
              or p.full_name ilike '%' || v_search || '%'
           order by p.created_at desc
           limit v_limit offset v_offset
        ) x
    )
  );
end;
$$;

-- ------------------------------------------------------------
-- Cross-tenant billing / subscription list
-- ------------------------------------------------------------
create or replace function public.api_admin_list_billing(
  p_limit int default 50,
  p_offset int default 0,
  p_status text default null
)
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_status text := nullif(trim(lower(p_status)), '');
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;

  return jsonb_build_object(
    'total', (
      select count(*)::int
        from app.tenants t
        left join lateral (
          select s.status as sub_status
            from app.subscriptions s
           where s.tenant_id = t.id
           order by s.updated_at desc
           limit 1
        ) sub on true
       where v_status is null
          or t.status = v_status
          or sub.sub_status = v_status
    ),
    'limit', v_limit,
    'offset', v_offset,
    'items', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.tenant_created_at desc), '[]'::jsonb)
        from (
          select
            t.id as tenant_id,
            t.name as tenant_name,
            t.org_code,
            t.plan_id,
            t.status as tenant_status,
            t.trial_ends_at,
            t.stripe_customer_id,
            t.created_at as tenant_created_at,
            sub.sub_status,
            sub.current_period_end,
            sub.cancel_at_period_end,
            sub.stripe_subscription_id
            from app.tenants t
            left join lateral (
              select s.status as sub_status,
                     s.current_period_end,
                     s.cancel_at_period_end,
                     s.stripe_subscription_id
                from app.subscriptions s
               where s.tenant_id = t.id
               order by s.updated_at desc
               limit 1
            ) sub on true
           where v_status is null
              or t.status = v_status
              or sub.sub_status = v_status
           order by t.created_at desc
           limit v_limit offset v_offset
        ) x
    )
  );
end;
$$;

-- Grants (authenticated only)
revoke all on function public.api_admin_overview() from public;
revoke all on function public.api_admin_list_tenants(int, int, text) from public;
revoke all on function public.api_admin_get_tenant(uuid) from public;
revoke all on function public.api_admin_list_users(int, int, text) from public;
revoke all on function public.api_admin_list_billing(int, int, text) from public;

grant execute on function public.api_admin_overview() to authenticated;
grant execute on function public.api_admin_list_tenants(int, int, text) to authenticated;
grant execute on function public.api_admin_get_tenant(uuid) to authenticated;
grant execute on function public.api_admin_list_users(int, int, text) to authenticated;
grant execute on function public.api_admin_list_billing(int, int, text) to authenticated;
