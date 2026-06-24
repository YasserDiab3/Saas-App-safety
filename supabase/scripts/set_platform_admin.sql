-- set_platform_admin.sql — grant platform super-admin by email.
-- Run the FULL script in Supabase SQL Editor (not single lines).
--
-- Uses grant_platform_admin_by_email() (migration 0022+0023).
-- The profiles guard trigger (0019) blocks direct INSERT/UPDATE of is_platform_admin.

-- 1) Check if user exists first
select id, email, email_confirmed_at, created_at
  from auth.users
 where lower(email) = lower('Yasser@qhsseconsultant.onmicrosoft.com');

-- 2) Grant platform admin
select public.grant_platform_admin_by_email('Yasser@qhsseconsultant.onmicrosoft.com');

-- 3) Remove old test admin (optional)
select public.revoke_platform_admin_by_email('owner@test.com');

-- 4) Verify
select u.email, p.is_platform_admin, p.id
  from app.profiles p
  join auth.users u on u.id = p.id
 where p.is_platform_admin = true
 order by u.email;
