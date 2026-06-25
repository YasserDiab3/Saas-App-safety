-- Fix help_center_global access: read via SECURITY DEFINER (table has deny-all RLS).

create or replace function public.api_get_help_center()
returns jsonb
language plpgsql
stable
security definer
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

grant execute on function public.api_get_help_center() to authenticated;
