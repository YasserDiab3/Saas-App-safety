-- Platform admin: update sales inquiry status.

create or replace function public.api_admin_update_sales_inquiry_status(
  p_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;

  if p_id is null then
    raise exception 'id required';
  end if;

  if v_status not in ('new', 'contacted', 'closed') then
    raise exception 'invalid status';
  end if;

  update app.sales_inquiries
     set status = v_status
   where id = p_id;

  if not found then
    raise exception 'inquiry not found';
  end if;

  return jsonb_build_object('success', true, 'id', p_id, 'status', v_status);
end;
$$;

revoke all on function public.api_admin_update_sales_inquiry_status(uuid, text) from public;
grant execute on function public.api_admin_update_sales_inquiry_status(uuid, text) to authenticated;
