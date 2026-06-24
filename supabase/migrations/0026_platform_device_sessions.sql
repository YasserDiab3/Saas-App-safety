-- ============================================================
-- 0026_platform_device_sessions.sql
-- Track user device/session metadata for platform admin (IP, geo, UA).
-- Note: web browsers cannot expose MAC addresses; device_id is a stable client UUID.
-- ============================================================

create table if not exists app.user_device_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references app.profiles(id) on delete cascade,
  tenant_id      uuid references app.tenants(id) on delete set null,
  device_id      text not null,
  device_label   text,
  user_agent     text,
  platform       text,
  browser        text,
  device_type    text check (device_type is null or device_type in ('desktop', 'mobile', 'tablet', 'unknown')),
  screen_size    text,
  language       text,
  timezone       text,
  ip_address     text,
  country        text,
  region         text,
  city           text,
  latitude       numeric(10, 7),
  longitude      numeric(10, 7),
  geo_source     text check (geo_source is null or geo_source in ('ip', 'gps', 'none')),
  page_url       text,
  last_seen_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (user_id, device_id)
);

create index if not exists idx_user_device_sessions_user on app.user_device_sessions(user_id, last_seen_at desc);
create index if not exists idx_user_device_sessions_tenant on app.user_device_sessions(tenant_id, last_seen_at desc);
create index if not exists idx_user_device_sessions_last_seen on app.user_device_sessions(last_seen_at desc);

alter table app.user_device_sessions enable row level security;
create policy user_device_sessions_deny on app.user_device_sessions for all using (false);

-- Called by edge function (service_role) after JWT validation
create or replace function public.api_upsert_device_session(p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = app, public
as $$
declare
  v_id uuid;
  v_user_id uuid := (p_payload->>'user_id')::uuid;
  v_device_id text := nullif(trim(p_payload->>'device_id'), '');
begin
  if v_user_id is null or v_device_id is null then
    raise exception 'user_id and device_id required';
  end if;

  insert into app.user_device_sessions (
    user_id, tenant_id, device_id, device_label, user_agent, platform, browser,
    device_type, screen_size, language, timezone, ip_address, country, region,
    city, latitude, longitude, geo_source, page_url, last_seen_at
  ) values (
    v_user_id,
    nullif(p_payload->>'tenant_id', '')::uuid,
    v_device_id,
    nullif(trim(p_payload->>'device_label'), ''),
    left(nullif(trim(p_payload->>'user_agent'), ''), 500),
    nullif(trim(p_payload->>'platform'), ''),
    nullif(trim(p_payload->>'browser'), ''),
    nullif(trim(p_payload->>'device_type'), ''),
    nullif(trim(p_payload->>'screen_size'), ''),
    nullif(trim(p_payload->>'language'), ''),
    nullif(trim(p_payload->>'timezone'), ''),
    nullif(trim(p_payload->>'ip_address'), ''),
    nullif(trim(p_payload->>'country'), ''),
    nullif(trim(p_payload->>'region'), ''),
    nullif(trim(p_payload->>'city'), ''),
    nullif(p_payload->>'latitude', '')::numeric,
    nullif(p_payload->>'longitude', '')::numeric,
    nullif(trim(p_payload->>'geo_source'), ''),
    left(nullif(trim(p_payload->>'page_url'), ''), 500),
    now()
  )
  on conflict (user_id, device_id) do update set
    tenant_id = coalesce(excluded.tenant_id, app.user_device_sessions.tenant_id),
    device_label = coalesce(excluded.device_label, app.user_device_sessions.device_label),
    user_agent = coalesce(excluded.user_agent, app.user_device_sessions.user_agent),
    platform = coalesce(excluded.platform, app.user_device_sessions.platform),
    browser = coalesce(excluded.browser, app.user_device_sessions.browser),
    device_type = coalesce(excluded.device_type, app.user_device_sessions.device_type),
    screen_size = coalesce(excluded.screen_size, app.user_device_sessions.screen_size),
    language = coalesce(excluded.language, app.user_device_sessions.language),
    timezone = coalesce(excluded.timezone, app.user_device_sessions.timezone),
    ip_address = coalesce(excluded.ip_address, app.user_device_sessions.ip_address),
    country = coalesce(excluded.country, app.user_device_sessions.country),
    region = coalesce(excluded.region, app.user_device_sessions.region),
    city = coalesce(excluded.city, app.user_device_sessions.city),
    latitude = coalesce(excluded.latitude, app.user_device_sessions.latitude),
    longitude = coalesce(excluded.longitude, app.user_device_sessions.longitude),
    geo_source = coalesce(excluded.geo_source, app.user_device_sessions.geo_source),
    page_url = coalesce(excluded.page_url, app.user_device_sessions.page_url),
    last_seen_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.api_admin_list_device_sessions(
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
        from app.user_device_sessions ds
        join app.profiles p on p.id = ds.user_id
        left join app.tenants t on t.id = ds.tenant_id
       where v_search is null
          or p.email ilike '%' || v_search || '%'
          or p.full_name ilike '%' || v_search || '%'
          or ds.device_label ilike '%' || v_search || '%'
          or ds.device_id ilike '%' || v_search || '%'
          or ds.ip_address ilike '%' || v_search || '%'
          or ds.city ilike '%' || v_search || '%'
          or t.name ilike '%' || v_search || '%'
    ),
    'limit', v_limit,
    'offset', v_offset,
    'items', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.last_seen_at desc), '[]'::jsonb)
        from (
          select
            ds.id,
            ds.user_id,
            p.email,
            p.full_name,
            ds.tenant_id,
            t.name as tenant_name,
            t.org_code,
            ds.device_id,
            ds.device_label,
            ds.platform,
            ds.browser,
            ds.device_type,
            ds.screen_size,
            ds.language,
            ds.timezone,
            ds.ip_address,
            ds.country,
            ds.region,
            ds.city,
            ds.latitude,
            ds.longitude,
            ds.geo_source,
            left(ds.user_agent, 120) as user_agent_short,
            ds.page_url,
            ds.last_seen_at,
            ds.created_at
          from app.user_device_sessions ds
          join app.profiles p on p.id = ds.user_id
          left join app.tenants t on t.id = ds.tenant_id
         where v_search is null
            or p.email ilike '%' || v_search || '%'
            or p.full_name ilike '%' || v_search || '%'
            or ds.device_label ilike '%' || v_search || '%'
            or ds.device_id ilike '%' || v_search || '%'
            or ds.ip_address ilike '%' || v_search || '%'
            or ds.city ilike '%' || v_search || '%'
            or t.name ilike '%' || v_search || '%'
         order by ds.last_seen_at desc
         limit v_limit offset v_offset
        ) x
    )
  );
end;
$$;

revoke all on function public.api_upsert_device_session(jsonb) from public;
revoke all on function public.api_admin_list_device_sessions(int, int, text) from public;

grant execute on function public.api_upsert_device_session(jsonb) to service_role;
grant execute on function public.api_admin_list_device_sessions(int, int, text) to authenticated;
