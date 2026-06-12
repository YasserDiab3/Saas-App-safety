-- set_platform_admin.sql — grant platform super-admin to a user by email.
-- Run in Supabase SQL Editor. Replace the email below.

update app.profiles
   set is_platform_admin = true
 where id = (
   select id from auth.users
   where email = 'YOUR_EMAIL@example.com'
   limit 1
 );

select id, email, is_platform_admin
  from app.profiles
 where is_platform_admin = true;
