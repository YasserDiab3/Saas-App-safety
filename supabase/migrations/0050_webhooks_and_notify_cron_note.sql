-- Register webhook endpoints sheet + optional pg_cron for notify-dispatch (if extensions exist).

insert into app.sheets (name, module_key, is_config) values
  ('WebhookEndpoints', 'settings', true)
on conflict (name) do nothing;

-- Best-effort: schedule hourly dispatch when pg_cron + pg_net are available.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule('hsehub-notify-dispatch') where exists (
      select 1 from cron.job where jobname = 'hsehub-notify-dispatch'
    );
    -- Placeholder schedule: platform should set CRON_SECRET via vault / edge gateway.
    -- Left as a documented job name; operators can enable via Dashboard cron on the Edge Function.
    raise notice 'pg_cron available: configure Edge Function notify-dispatch schedule in Dashboard';
  else
    raise notice 'pg_cron/pg_net not available — use Supabase Dashboard cron on notify-dispatch';
  end if;
exception when others then
  raise notice 'notify cron setup skipped: %', SQLERRM;
end $$;
