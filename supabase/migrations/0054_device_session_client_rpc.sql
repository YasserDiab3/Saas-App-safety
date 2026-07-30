-- Direct client device-session reporting (bypasses Edge CORS issues).
-- Authenticated users report their own session; user_id always = auth.uid().

create or replace function public.api_report_my_device_session(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_device_id text := nullif(trim(p_payload->>'device_id'), '');
  v_tenant uuid;
  v_ip text;
  v_headers jsonb;
  v_geo text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if v_device_id is null then
    raise exception 'device_id required';
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;

  if v_headers is not null then
    v_ip := nullif(trim(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1)), '');
    if v_ip is null then
      v_ip := nullif(trim(coalesce(v_headers->>'x-real-ip', v_headers->>'cf-connecting-ip', '')), '');
    end if;
  end if;
  if v_ip is null then
    v_ip := nullif(trim(p_payload->>'ip_address'), '');
  end if;

  v_tenant := nullif(p_payload->>'tenant_id', '')::uuid;
  if v_tenant is null then
    select tu.tenant_id into v_tenant
      from app.tenant_users tu
     where tu.user_id = v_user
       and tu.status = 'active'
     order by tu.created_at asc nulls last
     limit 1;
  end if;

  v_geo := lower(coalesce(nullif(trim(p_payload->>'geo_source'), ''), 'none'));
  if v_geo not in ('ip', 'gps', 'none') then
    v_geo := case when v_geo like 'ip%' then 'ip' else 'none' end;
  end if;

  insert into app.user_device_sessions (
    user_id, tenant_id, device_id, device_label, user_agent, platform, browser,
    device_type, screen_size, language, timezone, ip_address, country, region,
    city, latitude, longitude, geo_source, page_url, last_seen_at
  ) values (
    v_user,
    v_tenant,
    v_device_id,
    nullif(trim(p_payload->>'device_label'), ''),
    left(nullif(trim(p_payload->>'user_agent'), ''), 500),
    nullif(trim(p_payload->>'platform'), ''),
    nullif(trim(p_payload->>'browser'), ''),
    nullif(trim(p_payload->>'device_type'), ''),
    nullif(trim(p_payload->>'screen_size'), ''),
    nullif(trim(p_payload->>'language'), ''),
    nullif(trim(p_payload->>'timezone'), ''),
    v_ip,
    nullif(trim(p_payload->>'country'), ''),
    nullif(trim(p_payload->>'region'), ''),
    nullif(trim(p_payload->>'city'), ''),
    nullif(p_payload->>'latitude', '')::numeric,
    nullif(p_payload->>'longitude', '')::numeric,
    v_geo,
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

revoke all on function public.api_report_my_device_session(jsonb) from public;
revoke all on function public.api_report_my_device_session(jsonb) from anon;
grant execute on function public.api_report_my_device_session(jsonb) to authenticated;

comment on function public.api_report_my_device_session(jsonb) is
  'Authenticated device heartbeat for platform console; bypasses Edge CORS';
