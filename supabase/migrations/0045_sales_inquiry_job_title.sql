-- Add job title to guest sales inquiries (login page quote request form).

alter table app.sales_inquiries
  add column if not exists job_title text;

create or replace function public.api_submit_sales_inquiry(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id      uuid;
  v_name    text;
  v_job     text;
  v_org     text;
  v_email   text;
  v_phone   text;
  v_msg     text;
  v_locale  text;
  v_source  text;
  v_users   integer;
  v_recent  integer;
  v_raw_users text;
  v_domain  text;
begin
  v_name := nullif(trim(coalesce(p_payload->>'full_name', '')), '');
  v_job := nullif(trim(coalesce(p_payload->>'job_title', '')), '');
  v_org := nullif(trim(coalesce(p_payload->>'org_name', '')), '');
  v_email := lower(nullif(trim(coalesce(p_payload->>'email', '')), ''));
  v_phone := nullif(trim(coalesce(p_payload->>'phone', '')), '');
  v_msg := nullif(trim(coalesce(p_payload->>'message', '')), '');
  v_locale := coalesce(nullif(trim(coalesce(p_payload->>'locale', '')), ''), 'ar');
  v_source := coalesce(nullif(trim(coalesce(p_payload->>'source', '')), ''), 'login');

  if v_name is null or length(v_name) < 2 then
    raise exception 'full_name required';
  end if;
  if v_job is null or length(v_job) < 2 then
    raise exception 'job_title required';
  end if;
  if v_org is null or length(v_org) < 2 then
    raise exception 'org_name required';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'valid email required';
  end if;

  v_domain := split_part(v_email, '@', 2);
  if app.is_consumer_email_domain(v_domain) then
    raise exception 'organization work email required';
  end if;

  v_raw_users := nullif(trim(coalesce(p_payload->>'expected_users', '')), '');
  if v_raw_users is not null then
    begin
      v_users := v_raw_users::integer;
    exception when others then
      raise exception 'expected_users must be a number';
    end;
    if v_users is not null and (v_users < 1 or v_users > 100000) then
      raise exception 'expected_users out of range';
    end if;
  end if;

  select count(*)::integer into v_recent
    from app.sales_inquiries
   where lower(email) = v_email
     and created_at > now() - interval '24 hours';

  if v_recent >= 5 then
    raise exception 'too many requests — try again later';
  end if;

  insert into app.sales_inquiries (
    full_name, job_title, org_name, email, phone, expected_users, message, locale, source
  ) values (
    v_name, v_job, v_org, v_email, v_phone, v_users, v_msg, v_locale, v_source
  )
  returning id into v_id;

  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;

create or replace function public.api_admin_list_sales_inquiries(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = app, public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if not app.is_platform_admin() then
    raise exception 'forbidden: platform admin only';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'full_name', s.full_name,
        'job_title', s.job_title,
        'org_name', s.org_name,
        'email', s.email,
        'phone', s.phone,
        'expected_users', s.expected_users,
        'message', s.message,
        'locale', s.locale,
        'source', s.source,
        'status', s.status,
        'created_at', s.created_at
      )
      order by s.created_at desc
    )
    from (
      select *
        from app.sales_inquiries
       order by created_at desc
       limit v_limit
    ) s
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.api_submit_sales_inquiry(jsonb) from public;
grant execute on function public.api_submit_sales_inquiry(jsonb) to anon, authenticated;

revoke all on function public.api_admin_list_sales_inquiries(integer) from public;
grant execute on function public.api_admin_list_sales_inquiries(integer) to authenticated;
