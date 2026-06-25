-- Cookie consent: admin analytics + UX context metadata

alter table app.cookie_consents
  add column if not exists context jsonb not null default '{}'::jsonb;

create index if not exists idx_cookie_consents_consent_at
  on app.cookie_consents (consent_at desc);

create or replace function app.record_cookie_consent(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = app, public
as $$
declare
  v_visitor_id text := nullif(trim(p_payload->>'visitor_id'), '');
  v_user_id uuid := nullif(p_payload->>'user_id', '')::uuid;
  v_tenant_id uuid := nullif(p_payload->>'tenant_id', '')::uuid;
  v_action text := nullif(trim(p_payload->>'action'), '');
  v_policy_version text := nullif(trim(p_payload->>'policy_version'), '');
  v_active_version text := app.get_active_cookie_policy_version();
  v_categories jsonb;
  v_ip text := left(nullif(trim(p_payload->>'ip_address'), ''), 64);
  v_ua text := left(nullif(trim(p_payload->>'user_agent'), ''), 512);
  v_supersedes bigint := nullif(p_payload->>'supersedes_id', '')::bigint;
  v_context jsonb := coalesce(p_payload->'context', '{}'::jsonb);
  v_id bigint;
begin
  if v_visitor_id is null then
    raise exception 'visitor_id required';
  end if;
  if v_action is null or v_action not in ('accept_all', 'reject_non_essential', 'customize', 'update') then
    raise exception 'invalid action';
  end if;
  if v_policy_version is null then
    v_policy_version := v_active_version;
  end if;
  if v_active_version is null or v_policy_version <> v_active_version then
    raise exception 'policy version mismatch';
  end if;
  if jsonb_typeof(v_context) <> 'object' then
    v_context := '{}'::jsonb;
  end if;

  v_categories := app.normalize_cookie_categories(p_payload->'categories');

  if v_action = 'accept_all' then
    v_categories := jsonb_build_object('essential', true, 'functional', true, 'analytics', true, 'marketing', true);
  elsif v_action = 'reject_non_essential' then
    v_categories := jsonb_build_object('essential', true, 'functional', false, 'analytics', false, 'marketing', false);
  end if;

  insert into app.cookie_consents (
    visitor_id, user_id, tenant_id, policy_version, categories, action,
    ip_address, user_agent, supersedes_id, context
  ) values (
    v_visitor_id, v_user_id, v_tenant_id, v_policy_version, v_categories, v_action,
    v_ip, v_ua, v_supersedes, v_context
  )
  returning id into v_id;

  insert into app.audit_log (tenant_id, user_id, action, entity, entity_id, detail)
  values (
    v_tenant_id, v_user_id, 'cookie.consent_recorded', 'cookie_consent', v_id::text,
    jsonb_build_object(
      'visitor_id', v_visitor_id,
      'policy_version', v_policy_version,
      'categories', v_categories,
      'consent_action', v_action,
      'ip_address', v_ip,
      'context', v_context
    )
  );

  return jsonb_build_object('success', true, 'id', v_id, 'categories', v_categories, 'policy_version', v_policy_version);
end;
$$;

-- ------------------------------------------------------------
-- Platform admin: cookie / privacy analytics overview
-- ------------------------------------------------------------
create or replace function public.api_admin_cookie_overview(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 7), 365);
  v_since timestamptz := now() - make_interval(days => v_days);
  v_policy text;
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;

  v_policy := app.get_active_cookie_policy_version();

  return jsonb_build_object(
    'days', v_days,
    'active_policy_version', v_policy,
    'total_all_time', (select count(*)::int from app.cookie_consents),
    'events_in_period', (
      select count(*)::int from app.cookie_consents where consent_at >= v_since
    ),
    'unique_visitors_period', (
      select count(distinct visitor_id)::int from app.cookie_consents where consent_at >= v_since
    ),
    'unique_users_period', (
      select count(distinct user_id)::int from app.cookie_consents
       where consent_at >= v_since and user_id is not null
    ),
    'actions', (
      select coalesce(jsonb_object_agg(action, cnt), '{}'::jsonb)
        from (
          select action, count(*)::int as cnt
            from app.cookie_consents
           where consent_at >= v_since
           group by action
        ) a
    ),
    'category_rates', (
      select jsonb_build_object(
        'sample_size', count(*)::int,
        'functional_pct', round(100.0 * count(*) filter (where (categories->>'functional')::boolean) / nullif(count(*), 0), 1),
        'analytics_pct', round(100.0 * count(*) filter (where (categories->>'analytics')::boolean) / nullif(count(*), 0), 1),
        'marketing_pct', round(100.0 * count(*) filter (where (categories->>'marketing')::boolean) / nullif(count(*), 0), 1)
      )
      from (
        select distinct on (visitor_id) categories
          from app.cookie_consents
         where consent_at >= v_since
         order by visitor_id, consent_at desc
      ) latest
    ),
    'top_pages', (
      select coalesce(jsonb_agg(jsonb_build_object('page', page, 'count', cnt) order by cnt desc), '[]'::jsonb)
        from (
          select nullif(trim(context->>'page_path'), '') as page, count(*)::int as cnt
            from app.cookie_consents
           where consent_at >= v_since
             and nullif(trim(context->>'page_path'), '') is not null
           group by 1
           order by cnt desc
           limit 8
        ) p
    ),
    'daily_trend', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', day,
        'total', total,
        'accept_all', accept_all,
        'reject_non_essential', reject_non_essential,
        'customize', customize,
        'update', updates
      ) order by day), '[]'::jsonb)
        from (
          select
            (consent_at at time zone 'utc')::date as day,
            count(*)::int as total,
            count(*) filter (where action = 'accept_all')::int as accept_all,
            count(*) filter (where action = 'reject_non_essential')::int as reject_non_essential,
            count(*) filter (where action = 'customize')::int as customize,
            count(*) filter (where action = 'update')::int as updates
            from app.cookie_consents
           where consent_at >= v_since
           group by 1
        ) d
    )
  );
end;
$$;

create or replace function public.api_admin_list_cookie_consents(
  p_limit int default 50,
  p_offset int default 0,
  p_search text default null,
  p_action text default null,
  p_tenant_id uuid default null,
  p_days int default 90
)
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(p_search), '');
  v_action text := nullif(trim(p_action), '');
  v_days int := least(greatest(coalesce(p_days, 90), 1), 365);
  v_since timestamptz := now() - make_interval(days => v_days);
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;

  return jsonb_build_object(
    'total', (
      select count(*)::int
        from app.cookie_consents c
        left join app.profiles p on p.id = c.user_id
        left join app.tenants t on t.id = c.tenant_id
       where c.consent_at >= v_since
         and (p_tenant_id is null or c.tenant_id = p_tenant_id)
         and (v_action is null or c.action = v_action)
         and (
           v_search is null
           or c.visitor_id ilike '%' || v_search || '%'
           or p.email ilike '%' || v_search || '%'
           or coalesce(p.full_name, '') ilike '%' || v_search || '%'
           or coalesce(t.name, '') ilike '%' || v_search || '%'
         )
    ),
    'limit', v_limit,
    'offset', v_offset,
    'items', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.consent_at desc), '[]'::jsonb)
        from (
          select
            c.id,
            c.visitor_id,
            c.user_id,
            p.email,
            p.full_name,
            c.tenant_id,
            t.name as tenant_name,
            t.org_code,
            c.policy_version,
            c.action,
            c.categories,
            c.context,
            c.ip_address,
            left(c.user_agent, 100) as user_agent_short,
            c.consent_at
            from app.cookie_consents c
            left join app.profiles p on p.id = c.user_id
            left join app.tenants t on t.id = c.tenant_id
           where c.consent_at >= v_since
             and (p_tenant_id is null or c.tenant_id = p_tenant_id)
             and (v_action is null or c.action = v_action)
             and (
               v_search is null
               or c.visitor_id ilike '%' || v_search || '%'
               or p.email ilike '%' || v_search || '%'
               or coalesce(p.full_name, '') ilike '%' || v_search || '%'
               or coalesce(t.name, '') ilike '%' || v_search || '%'
             )
           order by c.consent_at desc
           limit v_limit offset v_offset
        ) x
    )
  );
end;
$$;

revoke all on function public.api_admin_cookie_overview(int) from public;
revoke all on function public.api_admin_list_cookie_consents(int, int, text, text, uuid, int) from public;

grant execute on function public.api_admin_cookie_overview(int) to authenticated;
grant execute on function public.api_admin_list_cookie_consents(int, int, text, text, uuid, int) to authenticated;
