/**
 * schedule_notify_dispatch_cron.mjs
 * Stores CRON_SECRET in Vault and schedules pg_cron → notify-dispatch every 5 min.
 */
import { execSync, spawnSync } from 'child_process';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { randomBytes } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const PROJECT_REF = 'tbkajjarkqhsdiabufjv';
const FN = `https://${PROJECT_REF}.supabase.co/functions/v1/notify-dispatch`;
const secretFile = path.join(__dirname, '.cron-secret.local');

function loadDotEnv() {
  const envPath = path.join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]]) continue;
    process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

loadDotEnv();

let cronSecret = process.env.CRON_SECRET || '';
if (!cronSecret && existsSync(secretFile)) cronSecret = readFileSync(secretFile, 'utf8').trim();
if (!cronSecret) {
  cronSecret = randomBytes(32).toString('hex');
  writeFileSync(secretFile, cronSecret + '\n', { mode: 0o600 });
}

// Escape for SQL dollar-quoting
const tag = 'hse' + randomBytes(4).toString('hex');
const sql = `
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Upsert vault secret for cron header
do $${tag}$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'hsehub_notify_cron_secret' limit 1;
  if v_id is null then
    perform vault.create_secret('${cronSecret.replace(/'/g, "''")}', 'hsehub_notify_cron_secret', 'x-cron-secret for notify-dispatch');
  else
    perform vault.update_secret(v_id, '${cronSecret.replace(/'/g, "''")}');
  end if;
end $${tag}$;

select vault.create_secret(
  'https://${PROJECT_REF}.supabase.co',
  'hsehub_project_url',
  'Project URL for edge cron'
) where not exists (select 1 from vault.secrets where name = 'hsehub_project_url');

-- Unschedule previous job if any
do $${tag}$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'hsehub-notify-dispatch';
exception when others then
  null;
end $${tag}$;

select cron.schedule(
  'hsehub-notify-dispatch',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'hsehub_project_url' limit 1)
           || '/functions/v1/notify-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'hsehub_notify_cron_secret' limit 1)
    ),
    body := jsonb_build_object('source', 'pg_cron', 'at', now()::text),
    timeout_milliseconds := 55000
  ) as request_id;
  $cron$
);

select jobid, jobname, schedule, active from cron.job where jobname = 'hsehub-notify-dispatch';
`;

const tmp = path.join(__dirname, '.schedule-cron.sql.tmp');
writeFileSync(tmp, sql, { mode: 0o600 });
try {
  const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', tmp], {
    cwd: root,
    encoding: 'utf8',
    shell: true
  });
  console.log(r.stdout || '');
  if (r.status !== 0) {
    console.error(r.stderr || '');
    // fallback: pipe via stdin
    const r2 = spawnSync('npx', ['supabase', 'db', 'query', '--linked'], {
      cwd: root,
      encoding: 'utf8',
      shell: true,
      input: sql
    });
    console.log(r2.stdout || '');
    if (r2.status !== 0) {
      console.error(r2.stderr || '');
      process.exit(1);
    }
  }
  console.log('Cron scheduled: hsehub-notify-dispatch every 5 minutes');
} finally {
  try { unlinkSync(tmp); } catch (_e) { /* ignore */ }
}
