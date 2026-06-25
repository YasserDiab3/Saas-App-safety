-- Tenant admins can request a price quote (Enterprise / custom plans).
create or replace function public.api_request_price_quote(
  p_plan_id text default 'enterprise',
  p_notes text default null
)
returns jsonb
language plpgsql security definer set search_path = app, public
as $$
declare
  v_id uuid;
  v_tenant uuid;
  v_name text;
begin
  v_tenant := app.current_tenant_id();
  if v_tenant is null then
    raise exception 'no tenant context';
  end if;
  if app.current_user_role() not in ('owner', 'admin') then
    raise exception 'forbidden: owner or admin required';
  end if;
  if p_plan_id is null or not exists (select 1 from app.plans where id = p_plan_id and is_active) then
    raise exception 'unknown plan';
  end if;

  select name into v_name from app.tenants where id = v_tenant;

  insert into app.price_quotes (
    tenant_id, plan_id, title, notes, valid_until, created_by, status
  ) values (
    v_tenant,
    p_plan_id,
    'طلب عرض سعر — ' || coalesce(nullif(trim(v_name), ''), 'مؤسسة'),
    nullif(trim(p_notes), ''),
    now() + make_interval(days => 30),
    app.current_user_id(),
    'draft'
  )
  returning id into v_id;

  insert into app.audit_log (tenant_id, user_id, action, entity, entity_id, detail)
  values (
    v_tenant,
    app.current_user_id(),
    'tenant.quote_requested',
    'price_quote',
    v_id::text,
    jsonb_build_object('plan_id', p_plan_id)
  );

  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;

revoke all on function public.api_request_price_quote(text, text) from public;
grant execute on function public.api_request_price_quote(text, text) to authenticated;
