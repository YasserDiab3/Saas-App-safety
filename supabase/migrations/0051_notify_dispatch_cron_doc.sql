-- Document + ensure notify-dispatch cron job (idempotent).
-- Actual schedule is managed by schedule_notify_dispatch_cron.mjs + Vault.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hsehub-notify-dispatch') then
    raise notice 'hsehub-notify-dispatch already scheduled';
  else
    raise notice 'Run: node supabase/scripts/schedule_notify_dispatch_cron.mjs to schedule with Vault secret';
  end if;
end $$;
