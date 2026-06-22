import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = {};
if (existsSync(path.join(root, '.env'))) {
  for (const line of readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
    const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
const token = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN;
const res = await fetch('https://api.supabase.com/v1/projects/tbkajjarkqhsdiabufjv/config/auth', {
  headers: { Authorization: `Bearer ${token}` }
});
const j = await res.json();
for (const k of Object.keys(j).sort()) {
  if (/mail|smtp|email|signup|confirm|provider/i.test(k)) {
    const v = j[k];
    console.log(k + ':', typeof v === 'string' && k.includes('pass') ? '(set)' : v);
  }
}
