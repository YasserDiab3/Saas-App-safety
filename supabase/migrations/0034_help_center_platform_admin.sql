-- Help center: global content, read by all tenants; edit by platform admin only.

create table if not exists app.help_center_global (
  id text primary key default 'default',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table app.help_center_global enable row level security;
drop policy if exists help_center_global_deny on app.help_center_global;
create policy help_center_global_deny on app.help_center_global for all using (false);

-- Best-effort migrate first tenant HelpCenter record to global store
insert into app.help_center_global (id, data, updated_at)
select 'default', r.data, r.updated_at
  from app.records r
 where r.sheet = 'HelpCenter' and r.id = 'default'
 order by r.updated_at desc nulls last
 limit 1
on conflict (id) do nothing;

create or replace function public.api_get_help_center()
returns jsonb
language plpgsql
stable
security invoker
set search_path = app, public
as $$
declare
  v_data jsonb;
begin
  if app.current_tenant_id() is null and not app.is_platform_admin() then
    raise exception 'no active tenant';
  end if;

  select data into v_data from app.help_center_global where id = 'default';

  if v_data is null then
    return jsonb_build_object(
      'success', true,
      'data', jsonb_build_object('id', 'default', 'sections', '[]'::jsonb, 'updatedAt', null)
    );
  end if;

  return jsonb_build_object('success', true, 'data', v_data);
end;
$$;

create or replace function public.api_save_help_center(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_payload jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;

  v_payload := coalesce(p_data, '{}'::jsonb) || jsonb_build_object(
    'id', 'default',
    'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  insert into app.help_center_global (id, data, updated_by, updated_at)
  values ('default', v_payload, app.current_user_id(), now())
  on conflict (id) do update
    set data = excluded.data,
        updated_by = excluded.updated_by,
        updated_at = now();

  return jsonb_build_object('success', true, 'id', 'default');
end;
$$;

grant execute on function public.api_get_help_center() to authenticated;
grant execute on function public.api_save_help_center(jsonb) to authenticated;
