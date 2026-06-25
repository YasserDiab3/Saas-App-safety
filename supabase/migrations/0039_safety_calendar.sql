-- ============================================================
-- 0039_safety_calendar.sql — Safety calendar events sheet + range RPC
-- ============================================================

insert into app.sheets (name, module_key, is_config)
values ('SafetyCalendarEvents', 'safety-calendar', false)
on conflict (name) do nothing;

create index if not exists idx_records_safety_calendar_start
  on app.records (tenant_id, sheet, (data->>'startDate'))
  where sheet = 'SafetyCalendarEvents';

create or replace function app.get_calendar_events(p_start date, p_end date, p_types text[] default null)
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_items jsonb;
begin
  if v_tenant is null then
    raise exception 'no active tenant';
  end if;
  if p_start is null or p_end is null then
    raise exception 'start and end dates required';
  end if;

  select coalesce(jsonb_agg(sub.event order by sub.event->>'startDate', sub.event->>'title'), '[]'::jsonb)
  into v_items
  from (
    select r.data || jsonb_build_object('id', r.id) as event
    from app.records r
    where r.tenant_id = v_tenant
      and r.sheet = 'SafetyCalendarEvents'
      and (r.data->>'startDate')::date <= p_end
      and coalesce((r.data->>'endDate')::date, (r.data->>'startDate')::date) >= p_start
      and (
        p_types is null
        or cardinality(p_types) = 0
        or (r.data->>'eventType') = any (p_types)
      )
  ) sub;

  return jsonb_build_object('success', true, 'items', coalesce(v_items, '[]'::jsonb));
end;
$$;

create or replace function public.api_get_calendar_events(p_start date, p_end date, p_types text[] default null)
returns jsonb
language plpgsql stable security definer set search_path = app, public
as $$
begin
  return app.get_calendar_events(p_start, p_end, p_types);
end;
$$;

revoke all on function public.api_get_calendar_events(date, date, text[]) from public;
grant execute on function public.api_get_calendar_events(date, date, text[]) to authenticated, service_role;
