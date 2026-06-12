-- set_platform_admin.sql — grant platform super-admin by email.
-- Run the FULL script in Supabase SQL Editor (not single lines).

-- 1) Check if user exists first
select id, email, email_confirmed_at, created_at
  from auth.users
 where lower(email) = lower('Yasser@qhsseconsultant.onmicrosoft.com');

-- 2) Ensure profile row exists + set platform admin
insert into app.profiles (id, email, full_name, is_platform_admin)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', u.email), true
  from auth.users u
 where lower(u.email) = lower('Yasser@qhsseconsultant.onmicrosoft.com')
on conflict (id) do update
  set is_platform_admin = true;

-- 3) Remove old test admin (optional)
update app.profiles
   set is_platform_admin = false
 where id = (select id from auth.users where email = 'owner@test.com' limit 1);

-- 4) Verify
select u.email, p.is_platform_admin, p.id
  from app.profiles p
  join auth.users u on u.id = p.id
 where p.is_platform_admin = true
 order by u.email;
