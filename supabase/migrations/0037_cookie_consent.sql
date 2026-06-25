-- ============================================================
-- 0037_cookie_consent.sql — GDPR cookie consent (platform-wide)
-- ============================================================

create table if not exists app.cookie_categories (
  id              text primary key,
  name_ar         text not null,
  name_en         text not null,
  description_ar  text not null default '',
  description_en  text not null default '',
  is_essential    boolean not null default false,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists app.cookie_policy_versions (
  id            uuid primary key default gen_random_uuid(),
  version       text not null unique,
  effective_at  timestamptz not null default now(),
  content       jsonb not null default '{}'::jsonb,
  is_active     boolean not null default false,
  created_by    uuid references app.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create unique index if not exists idx_cookie_policy_one_active
  on app.cookie_policy_versions ((true))
  where is_active;

create table if not exists app.cookie_consents (
  id              bigint generated always as identity primary key,
  visitor_id      text not null,
  user_id         uuid references app.profiles(id) on delete set null,
  tenant_id       uuid references app.tenants(id) on delete set null,
  policy_version  text not null,
  categories      jsonb not null,
  action          text not null check (action in ('accept_all', 'reject_non_essential', 'customize', 'update')),
  ip_address      text,
  user_agent      text,
  consent_at      timestamptz not null default now(),
  supersedes_id   bigint references app.cookie_consents(id) on delete set null
);

create index if not exists idx_cookie_consents_visitor on app.cookie_consents(visitor_id, consent_at desc);
create index if not exists idx_cookie_consents_user on app.cookie_consents(user_id, consent_at desc);
create index if not exists idx_cookie_consents_tenant on app.cookie_consents(tenant_id, consent_at desc);
create index if not exists idx_cookie_consents_policy on app.cookie_consents(policy_version);

alter table app.cookie_categories enable row level security;
alter table app.cookie_policy_versions enable row level security;
alter table app.cookie_consents enable row level security;

drop policy if exists cookie_categories_deny on app.cookie_categories;
create policy cookie_categories_deny on app.cookie_categories for all using (false);

drop policy if exists cookie_policy_versions_deny on app.cookie_policy_versions;
create policy cookie_policy_versions_deny on app.cookie_policy_versions for all using (false);

drop policy if exists cookie_consents_deny on app.cookie_consents;
create policy cookie_consents_deny on app.cookie_consents for all using (false);

insert into app.cookie_categories (id, name_ar, name_en, description_ar, description_en, is_essential, sort_order)
values
  ('essential', 'أساسية', 'Essential', 'مطلوبة لتشغيل المنصة والمصادقة والأمان.', 'Required for platform operation, authentication, and security.', true, 1),
  ('functional', 'وظيفية', 'Functional', 'تحسّن تجربة الاستخدام مثل اللغة والتفضيلات.', 'Improve usability such as language and preferences.', false, 2),
  ('analytics', 'تحليلية', 'Analytics', 'تساعدنا على فهم استخدام المنصة لتحسينها.', 'Help us understand platform usage to improve it.', false, 3),
  ('marketing', 'تسويقية', 'Marketing', 'تُستخدم للرسائل والعروض ذات الصلة (إن وُجدت).', 'Used for relevant messages and offers (if applicable).', false, 4)
on conflict (id) do nothing;

insert into app.cookie_policy_versions (version, effective_at, content, is_active)
values (
  '1.0.0',
  now(),
  jsonb_build_object(
    'ar', jsonb_build_object(
      'title', 'سياسة الكوكيز',
      'body', 'نستخدم الكوكيز والتخزين المحلي لتشغيل HSEHub 360 بأمان. يمكنك قبول الكل أو رفض غير الأساسية أو تخصيص التفضيلات.',
      'learnMoreUrl', '/login'
    ),
    'en', jsonb_build_object(
      'title', 'Cookie Policy',
      'body', 'We use cookies and local storage to run HSEHub 360 securely. You can accept all, reject non-essential, or customize preferences.',
      'learnMoreUrl', '/login'
    )
  ),
  true
)
on conflict (version) do nothing;

create or replace function app.normalize_cookie_categories(p_categories jsonb)
returns jsonb
language plpgsql immutable
as $$
declare
  v_out jsonb := jsonb_build_object(
    'essential', true,
    'functional', coalesce((p_categories->>'functional')::boolean, false),
    'analytics', coalesce((p_categories->>'analytics')::boolean, false),
    'marketing', coalesce((p_categories->>'marketing')::boolean, false)
  );
  v_key text;
begin
  if p_categories is null or jsonb_typeof(p_categories) <> 'object' then
    raise exception 'categories object required';
  end if;
  for v_key in select jsonb_object_keys(p_categories)
  loop
    if v_key not in ('essential', 'functional', 'analytics', 'marketing') then
      raise exception 'unknown category: %', v_key;
    end if;
  end loop;
  if coalesce((p_categories->>'essential')::boolean, true) is distinct from true then
    raise exception 'essential cookies cannot be disabled';
  end if;
  return v_out;
end;
$$;

create or replace function app.get_active_cookie_policy_version()
returns text
language sql stable security definer set search_path = app, public
as $$
  select version from app.cookie_policy_versions where is_active limit 1;
$$;

create or replace function app.get_active_cookie_policy()
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
declare
  v_policy app.cookie_policy_versions%rowtype;
  v_categories jsonb;
begin
  select * into v_policy from app.cookie_policy_versions where is_active limit 1;
  if v_policy.id is null then
    return jsonb_build_object('success', false, 'message', 'no active cookie policy');
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name_ar', c.name_ar,
      'name_en', c.name_en,
      'description_ar', c.description_ar,
      'description_en', c.description_en,
      'is_essential', c.is_essential,
      'sort_order', c.sort_order
    ) order by c.sort_order
  ), '[]'::jsonb)
  into v_categories
  from app.cookie_categories c;

  return jsonb_build_object(
    'success', true,
    'version', v_policy.version,
    'effective_at', v_policy.effective_at,
    'content', v_policy.content,
    'categories', v_categories
  );
end;
$$;

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

  v_categories := app.normalize_cookie_categories(p_payload->'categories');

  if v_action = 'accept_all' then
    v_categories := jsonb_build_object('essential', true, 'functional', true, 'analytics', true, 'marketing', true);
  elsif v_action = 'reject_non_essential' then
    v_categories := jsonb_build_object('essential', true, 'functional', false, 'analytics', false, 'marketing', false);
  end if;

  insert into app.cookie_consents (
    visitor_id, user_id, tenant_id, policy_version, categories, action,
    ip_address, user_agent, supersedes_id
  ) values (
    v_visitor_id, v_user_id, v_tenant_id, v_policy_version, v_categories, v_action,
    v_ip, v_ua, v_supersedes
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
      'ip_address', v_ip
    )
  );

  return jsonb_build_object('success', true, 'id', v_id, 'categories', v_categories, 'policy_version', v_policy_version);
end;
$$;

create or replace function app.link_visitor_cookie_consents(p_visitor_id text)
returns jsonb
language plpgsql security definer set search_path = app, public
as $$
declare
  v_uid uuid := app.current_user_id();
  v_tenant uuid := app.current_tenant_id();
  v_visitor text := nullif(trim(p_visitor_id), '');
  v_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if v_visitor is null then
    raise exception 'visitor_id required';
  end if;

  update app.cookie_consents
     set user_id = v_uid,
         tenant_id = coalesce(tenant_id, v_tenant)
   where visitor_id = v_visitor
     and user_id is null;

  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into app.audit_log (tenant_id, user_id, action, entity, entity_id, detail)
    values (v_tenant, v_uid, 'cookie.visitor_linked', 'cookie_consent', v_visitor,
            jsonb_build_object('linked_rows', v_count));
  end if;

  return jsonb_build_object('success', true, 'linked', v_count);
end;
$$;

create or replace function app.get_cookie_consent_history(p_payload jsonb)
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
declare
  v_limit int := least(greatest(coalesce((p_payload->>'limit')::int, 20), 1), 100);
  v_visitor_id text := nullif(trim(p_payload->>'visitor_id'), '');
  v_user_id uuid := nullif(p_payload->>'user_id', '')::uuid;
  v_items jsonb;
begin
  if v_user_id is null and v_visitor_id is null then
    raise exception 'user_id or visitor_id required';
  end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.consent_at desc), '[]'::jsonb)
  into v_items
  from (
    select id, visitor_id, user_id, tenant_id, policy_version, categories, action,
           ip_address, left(user_agent, 120) as user_agent_short, consent_at, supersedes_id
      from app.cookie_consents
     where (v_user_id is not null and user_id = v_user_id)
        or (v_visitor_id is not null and visitor_id = v_visitor_id)
     order by consent_at desc
     limit v_limit
  ) x;

  return jsonb_build_object('success', true, 'items', v_items);
end;
$$;

create or replace function app.save_cookie_policy(p_data jsonb)
returns jsonb
language plpgsql security definer set search_path = app, public
as $$
declare
  v_version text := nullif(trim(p_data->>'version'), '');
  v_content jsonb := p_data->'content';
  v_uid uuid := app.current_user_id();
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;
  if v_version is null then
    raise exception 'version required';
  end if;
  if v_content is null or jsonb_typeof(v_content) <> 'object' then
    raise exception 'content object required';
  end if;

  update app.cookie_policy_versions set is_active = false where is_active;

  insert into app.cookie_policy_versions (version, effective_at, content, is_active, created_by)
  values (v_version, now(), v_content, true, v_uid)
  on conflict (version) do update set
    content = excluded.content,
    effective_at = excluded.effective_at,
    is_active = true,
    created_by = excluded.created_by;

  insert into app.audit_log (user_id, action, entity, entity_id, detail)
  values (v_uid, 'cookie.policy_published', 'cookie_policy', v_version, jsonb_build_object('version', v_version));

  return jsonb_build_object('success', true, 'version', v_version);
end;
$$;

create or replace function public.api_get_cookie_policy()
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
begin
  return app.get_active_cookie_policy();
end;
$$;

create or replace function public.api_record_cookie_consent(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = app, public
as $$
begin
  return app.record_cookie_consent(p_payload);
end;
$$;

create or replace function public.api_update_cookie_consent(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = app, public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_uid uuid := app.current_user_id();
  v_tenant uuid := app.current_tenant_id();
  v_latest_id bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select id into v_latest_id
    from app.cookie_consents
   where user_id = v_uid
   order by consent_at desc
   limit 1;

  v_payload := v_payload || jsonb_build_object(
    'user_id', v_uid,
    'tenant_id', v_tenant,
    'action', 'update',
    'supersedes_id', v_latest_id
  );

  return app.record_cookie_consent(v_payload);
end;
$$;

create or replace function public.api_get_cookie_consent_history(p_payload jsonb)
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
begin
  return app.get_cookie_consent_history(p_payload);
end;
$$;

create or replace function public.api_link_visitor_cookie_consents(p_visitor_id text)
returns jsonb
language plpgsql security definer set search_path = app, public
as $$
begin
  return app.link_visitor_cookie_consents(p_visitor_id);
end;
$$;

create or replace function public.api_save_cookie_policy(p_data jsonb)
returns jsonb
language plpgsql security definer set search_path = app, public
as $$
begin
  return app.save_cookie_policy(p_data);
end;
$$;

revoke all on function public.api_get_cookie_policy() from public;
revoke all on function public.api_record_cookie_consent(jsonb) from public;
revoke all on function public.api_update_cookie_consent(jsonb) from public;
revoke all on function public.api_get_cookie_consent_history(jsonb) from public;
revoke all on function public.api_link_visitor_cookie_consents(text) from public;
revoke all on function public.api_save_cookie_policy(jsonb) from public;

grant execute on function public.api_get_cookie_policy() to anon, authenticated, service_role;
grant execute on function public.api_record_cookie_consent(jsonb) to service_role;
grant execute on function public.api_update_cookie_consent(jsonb) to service_role;
grant execute on function public.api_get_cookie_consent_history(jsonb) to service_role;
grant execute on function public.api_link_visitor_cookie_consents(text) to authenticated, service_role;
grant execute on function public.api_save_cookie_policy(jsonb) to authenticated, service_role;
