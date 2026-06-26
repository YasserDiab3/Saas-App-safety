-- Require organization work email (reject common consumer mail domains).

create or replace function app.is_consumer_email_domain(p_domain text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(p_domain, ''))) = any(array[
    'gmail.com', 'googlemail.com',
    'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.com.br', 'yahoo.co.in', 'yahoo.es', 'yahoo.it',
    'ymail.com', 'rocketmail.com',
    'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.es', 'hotmail.it',
    'outlook.com', 'outlook.sa', 'outlook.fr', 'outlook.de', 'outlook.es', 'outlook.it',
    'live.com', 'live.fr', 'live.nl', 'msn.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'aim.com',
    'protonmail.com', 'proton.me', 'pm.me', 'tutanota.com', 'tuta.io',
    'mail.com', 'email.com', 'usa.com', 'inbox.com',
    'gmx.com', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch',
    'yandex.com', 'yandex.ru', 'ya.ru',
    'mail.ru', 'inbox.ru', 'list.ru', 'bk.ru',
    'zoho.com', 'fastmail.com', 'hey.com',
    'rediffmail.com', 'qq.com', '163.com', '126.com', 'sina.com', 'sohu.com',
    'web.de', 't-online.de', 'freenet.de',
    'laposte.net', 'orange.fr', 'free.fr', 'sfr.fr', 'wanadoo.fr',
    'libero.it', 'virgilio.it', 'alice.it',
    'bol.com.br', 'uol.com.br', 'terra.com.br',
    'wp.pl', 'o2.pl', 'interia.pl', 'onet.pl',
    'seznam.cz', 'naver.com', 'daum.net', 'hanmail.net'
  ]);
$$;

create or replace function public.api_submit_sales_inquiry(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id      uuid;
  v_name    text;
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
  v_org := nullif(trim(coalesce(p_payload->>'org_name', '')), '');
  v_email := lower(nullif(trim(coalesce(p_payload->>'email', '')), ''));
  v_phone := nullif(trim(coalesce(p_payload->>'phone', '')), '');
  v_msg := nullif(trim(coalesce(p_payload->>'message', '')), '');
  v_locale := coalesce(nullif(trim(coalesce(p_payload->>'locale', '')), ''), 'ar');
  v_source := coalesce(nullif(trim(coalesce(p_payload->>'source', '')), ''), 'login');

  if v_name is null or length(v_name) < 2 then
    raise exception 'full_name required';
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
    full_name, org_name, email, phone, expected_users, message, locale, source
  ) values (
    v_name, v_org, v_email, v_phone, v_users, v_msg, v_locale, v_source
  )
  returning id into v_id;

  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;

revoke all on function public.api_submit_sales_inquiry(jsonb) from public;
grant execute on function public.api_submit_sales_inquiry(jsonb) to anon, authenticated;
