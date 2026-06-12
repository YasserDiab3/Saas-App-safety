/**
 * sync_stripe_prices_from_env.mjs — updates app.plans.price_id from .env via Management API.
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envPath = path.join(root, '.env');
const env = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

const token = env.SUPABASE_ACCESS_TOKEN;
const pro = env.STRIPE_PRICE_PRO;
const ent = env.STRIPE_PRICE_ENTERPRISE;
if (!token) throw new Error('Missing SUPABASE_ACCESS_TOKEN in .env');
if (!pro || !ent) throw new Error('Missing STRIPE_PRICE_PRO or STRIPE_PRICE_ENTERPRISE in .env');

const esc = (s) => s.replace(/'/g, "''");
const sql = `
update app.plans set price_id = '${esc(pro)}' where id = 'pro';
update app.plans set price_id = '${esc(ent)}' where id = 'enterprise';
select id, name, price_id from app.plans where id in ('pro','enterprise') order by id;
`;

const res = await fetch('https://api.supabase.com/v1/projects/tbkajjarkqhsdiabufjv/database/query', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query: sql })
});
const body = await res.text();
if (!res.ok) throw new Error(`Database query failed: ${res.status} ${body}`);
const rows = JSON.parse(body);
console.log('app.plans price_id synced:');
for (const row of rows) {
  const ok = row.price_id && !String(row.price_id).includes('REPLACE');
  console.log(`  [${ok ? 'OK' : 'WARN'}] ${row.id}: ${row.price_id}`);
}
