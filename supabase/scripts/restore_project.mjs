/**
 * restore_project.mjs — restore a paused/inactive Supabase project via Management API.
 *
 * Usage: node supabase/scripts/restore_project.mjs
 * Requires: SUPABASE_ACCESS_TOKEN in .env
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './smoke-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envPath = path.join(root, '.env');
const env = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

const token = env.SUPABASE_ACCESS_TOKEN;
const ref = 'tbkajjarkqhsdiabufjv';
if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN in .env');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const info = await fetch(`https://api.supabase.com/v1/projects/${ref}`, { headers });
const project = await info.json();
if (!info.ok) {
  console.error('Could not read project:', project);
  process.exit(1);
}

console.log(`Project ${ref} status: ${project.status}`);
if (project.status === 'ACTIVE_HEALTHY') {
  console.log('Already active.');
  process.exit(0);
}

const restore = await fetch(`https://api.supabase.com/v1/projects/${ref}/restore`, {
  method: 'POST', headers, body: '{}'
});
const body = await restore.text();
console.log('Restore:', restore.status, body || '(ok)');

const { base, anon } = loadConfig();
for (let i = 1; i <= 18; i++) {
  try {
    const h = await fetch(`${base}/auth/v1/health`, { headers: { apikey: anon } });
    console.log(`Health check ${i}: HTTP ${h.status}`);
    if (h.ok) {
      console.log('Supabase is ready.');
      process.exit(0);
    }
  } catch (e) {
    console.log(`Health check ${i}: ${e.cause?.code || e.message}`);
  }
  await new Promise(r => setTimeout(r, 10000));
}
console.error('Timed out waiting for Supabase to become healthy.');
process.exit(1);
