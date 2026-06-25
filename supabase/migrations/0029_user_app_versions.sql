-- 0029_user_app_versions.sql — track client app versions per tenant user

create table if not exists app.user_app_versions (
  tenant_id       uuid not null references app.tenants(id) on delete cascade,
  user_id         uuid not null references app.profiles(id) on delete cascade,
  email           text,
  user_name       text,
  user_role       text,
  user_department text,
  version         text not null,
  platform        text,
  is_mobile       boolean not null default false,
  user_agent      text,
  last_seen_at    timestamptz not null default now(),
  session_count   int not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index if not exists idx_user_app_versions_tenant
  on app.user_app_versions(tenant_id);
create index if not exists idx_user_app_versions_last_seen
  on app.user_app_versions(tenant_id, last_seen_at desc);

drop trigger if exists trg_user_app_versions_updated on app.user_app_versions;
create trigger trg_user_app_versions_updated before update on app.user_app_versions
  for each row execute function app.set_updated_at();

alter table app.user_app_versions enable row level security;

drop policy if exists user_app_versions_self on app.user_app_versions;
create policy user_app_versions_self on app.user_app_versions
  for all
  using (tenant_id = app.current_tenant_id() and user_id = app.current_user_id())
  with check (tenant_id = app.current_tenant_id() and user_id = app.current_user_id());

drop policy if exists user_app_versions_admin_read on app.user_app_versions;
create policy user_app_versions_admin_read on app.user_app_versions
  for select
  using (
    tenant_id = app.current_tenant_id()
    and app.current_user_role() in ('owner', 'admin')
  );

grant select, insert, update on app.user_app_versions to authenticated;

create or replace function app.semver_compare(a text, b text)
returns int
language plpgsql immutable
as $$
declare
  pa text[];
  pb text[];
  i int;
  len int;
  na int;
  nb int;
begin
  pa := string_to_array(regexp_replace(trim(coalesce(a, '')), '^[vV]', ''), '.');
  pb := string_to_array(regexp_replace(trim(coalesce(b, '')), '^[vV]', ''), '.');
  len := greatest(coalesce(array_length(pa, 1), 0), coalesce(array_length(pb, 1), 0));
  for i in 1..len loop
    na := coalesce(nullif(pa[i], '')::int, 0);
    nb := coalesce(nullif(pb[i], '')::int, 0);
    if na > nb then return 1; end if;
    if na < nb then return -1; end if;
  end loop;
  return 0;
end;
$$;

create or replace function public.api_report_user_version(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_tid uuid;
  v_uid uuid;
  v_version text;
  v_is_new boolean;
begin
  v_tid := app.current_tenant_id();
  v_uid := app.current_user_id();
  if v_tid is null or v_uid is null then
    raise exception 'auth required';
  end if;

  v_version := trim(coalesce(p_payload->>'version', ''));
  if v_version = '' then
    raise exception 'version required';
  end if;

  v_is_new := coalesce((p_payload->>'isNewSession')::boolean, false);

  insert into app.user_app_versions (
    tenant_id, user_id, email, user_name, user_role, user_department,
    version, platform, is_mobile, user_agent, last_seen_at, session_count
  ) values (
    v_tid,
    v_uid,
    lower(trim(coalesce(p_payload->>'userEmail', ''))),
    trim(coalesce(p_payload->>'userName', '')),
    trim(coalesce(p_payload->>'userRole', '')),
    trim(coalesce(p_payload->>'userDepartment', '')),
    v_version,
    nullif(trim(coalesce(p_payload->>'platform', '')), ''),
    coalesce((p_payload->>'isMobile')::boolean, false),
    left(nullif(trim(coalesce(p_payload->>'userAgent', '')), ''), 500),
    now(),
    case when v_is_new then 1 else 0 end
  )
  on conflict (tenant_id, user_id) do update set
    email = excluded.email,
    user_name = coalesce(nullif(excluded.user_name, ''), app.user_app_versions.user_name),
    user_role = coalesce(nullif(excluded.user_role, ''), app.user_app_versions.user_role),
    user_department = coalesce(nullif(excluded.user_department, ''), app.user_app_versions.user_department),
    version = excluded.version,
    platform = excluded.platform,
    is_mobile = excluded.is_mobile,
    user_agent = excluded.user_agent,
    last_seen_at = now(),
    session_count = app.user_app_versions.session_count + case when v_is_new then 1 else 0 end,
    updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.api_list_user_versions(p_latest_version text default '')
returns jsonb
language plpgsql stable
security definer
set search_path = app, public
as $$
declare
  v_tid uuid;
  v_latest text;
  v_rows jsonb;
begin
  v_tid := app.current_tenant_id();
  if v_tid is null then
    raise exception 'no active tenant';
  end if;
  if app.current_user_role() not in ('owner', 'admin') then
    raise exception 'forbidden: owner or admin only';
  end if;

  v_latest := nullif(trim(coalesce(p_latest_version, '')), '');

  select coalesce(jsonb_agg(row_data order by (row_data->>'userName')), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'userName', coalesce(nullif(uav.user_name, ''), p.full_name, ''),
      'userEmail', coalesce(nullif(uav.email, ''), p.email, ''),
      'userRole', coalesce(nullif(uav.user_role, ''), tu.role, ''),
      'userDepartment', coalesce(uav.user_department, ''),
      'currentVersion', uav.version,
      'isOutdated',
        case
          when uav.user_id is null then false
          when v_latest is null then false
          else app.semver_compare(uav.version, v_latest) < 0
        end,
      'hasReport', (uav.user_id is not null),
      'lastSeenAt', uav.last_seen_at,
      'sessionCount', coalesce(uav.session_count, 0),
      'platform', coalesce(uav.platform, ''),
      'isMobile', coalesce(uav.is_mobile, false)
    ) as row_data
    from app.tenant_users tu
    join app.profiles p on p.id = tu.user_id
    left join app.user_app_versions uav
      on uav.tenant_id = tu.tenant_id and uav.user_id = tu.user_id
    where tu.tenant_id = v_tid
      and tu.status = 'active'
  ) s;

  return jsonb_build_object('success', true, 'data', coalesce(v_rows, '[]'::jsonb));
end;
$$;

create or replace function public.api_user_version_stats(p_latest_version text default '')
returns jsonb
language plpgsql stable
security definer
set search_path = app, public
as $$
declare
  v_tid uuid;
  v_latest text;
  v_total int;
  v_latest_users int;
  v_outdated int;
  v_not_reported int;
  v_active_24h int;
  v_active_7d int;
  v_by_version jsonb;
begin
  v_tid := app.current_tenant_id();
  if v_tid is null then
    raise exception 'no active tenant';
  end if;
  if app.current_user_role() not in ('owner', 'admin') then
    raise exception 'forbidden: owner or admin only';
  end if;

  v_latest := nullif(trim(coalesce(p_latest_version, '')), '');

  select count(*)::int into v_total
  from app.tenant_users tu
  where tu.tenant_id = v_tid and tu.status = 'active';

  select count(*)::int into v_not_reported
  from app.tenant_users tu
  left join app.user_app_versions uav
    on uav.tenant_id = tu.tenant_id and uav.user_id = tu.user_id
  where tu.tenant_id = v_tid
    and tu.status = 'active'
    and uav.user_id is null;

  if v_latest is not null then
    select count(*)::int into v_latest_users
    from app.user_app_versions uav
    where uav.tenant_id = v_tid
      and app.semver_compare(uav.version, v_latest) >= 0;

    select count(*)::int into v_outdated
    from app.user_app_versions uav
    where uav.tenant_id = v_tid
      and app.semver_compare(uav.version, v_latest) < 0;
  else
    v_latest_users := 0;
    v_outdated := 0;
  end if;

  select count(*)::int into v_active_24h
  from app.user_app_versions uav
  where uav.tenant_id = v_tid
    and uav.last_seen_at >= now() - interval '24 hours';

  select count(*)::int into v_active_7d
  from app.user_app_versions uav
  where uav.tenant_id = v_tid
    and uav.last_seen_at >= now() - interval '7 days';

  select coalesce(jsonb_agg(jsonb_build_object('version', version_label, 'count', cnt) order by cnt desc), '[]'::jsonb)
  into v_by_version
  from (
    select uav.version as version_label, count(*)::int as cnt
    from app.user_app_versions uav
    where uav.tenant_id = v_tid
    group by uav.version
    union all
    select 'لم يُسجَّل بعد' as version_label, v_not_reported as cnt
    where v_not_reported > 0
  ) dist;

  return jsonb_build_object(
    'success', true,
    'totalUsers', v_total,
    'latestUsers', v_latest_users,
    'outdatedUsers', v_outdated,
    'notReportedUsers', v_not_reported,
    'activeLast24h', v_active_24h,
    'activeLast7d', v_active_7d,
    'byVersion', coalesce(v_by_version, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.api_report_user_version(jsonb) to authenticated;
grant execute on function public.api_list_user_versions(text) to authenticated;
grant execute on function public.api_user_version_stats(text) to authenticated;
