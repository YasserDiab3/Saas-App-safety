/**
 * smoke-lib.mjs — shared helpers for Supabase smoke scripts.
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadConfig() {
  const cfgText = readFileSync(path.resolve(__dirname, '../../frontend/js/saas/saas-config.js'), 'utf8');
  const base = cfgText.match(/supabaseUrl:\s*'([^']+)'/)[1].replace(/\/$/, '');
  const anon = cfgText.match(/supabaseAnonKey:\s*'([^']+)'/)[1];
  return { base, anon };
}

export function loadSmokeCredentials() {
  const email = process.env.SMOKE_EMAIL || '';
  const password = process.env.SMOKE_PASSWORD || '';
  if (email && password) return { email, password };

  const credPath = path.resolve(__dirname, '.smoke-credentials.json');
  if (existsSync(credPath)) {
    const j = JSON.parse(readFileSync(credPath, 'utf8'));
    if (j.email && j.password) return { email: j.email, password: j.password };
  }
  return null;
}

export async function auth(base, anon, email, password) {
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'auth failed');
  return data.access_token;
}

export async function rpc(base, anon, token, fn, args = {}, { raw = false } = {}) {
  const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: anon,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  const text = await res.text();
  if (raw) return { status: res.status, text };
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${text}`);
  return data;
}

/** Trial allow-list (0018) — module_key → sheet smoke targets */
export const TRIAL_P0_SHEETS = [
  { module: 'Clinic', moduleKey: 'clinic', sheet: 'Medications', id: 'SMOKE-MED-1' },
  { module: 'PTW', moduleKey: 'ptw', sheet: 'PTW', id: 'SMOKE-PTW-1' },
  { module: 'Incidents', moduleKey: 'incidents', sheet: 'Incidents', id: 'SMOKE-INC-1' },
  { module: 'Training', moduleKey: 'training', sheet: 'Training', id: 'SMOKE-TRN-1' },
  { module: 'NearMiss', moduleKey: 'nearmiss', sheet: 'NearMiss', id: 'SMOKE-NM-1' },
  { module: 'DailyObservations', moduleKey: 'daily-observations', sheet: 'DailyObservations', id: 'SMOKE-DO-1' },
  { module: 'UserTasks', moduleKey: 'user-tasks', sheet: 'UserTasks', id: 'SMOKE-UT-1' }
];

export function rowFor(sheet, id) {
  const ts = new Date().toISOString();
  const base = { id, _smoke: true, createdAt: ts };
  switch (sheet) {
    case 'Medications': return { ...base, name: 'Smoke Test Med', quantity: 10, unit: 'box' };
    case 'PTW': return { ...base, permitNumber: id, status: 'draft', workDescription: 'smoke' };
    case 'Incidents': return { ...base, title: 'Smoke incident', status: 'open' };
    case 'Training': return { ...base, title: 'Smoke Training', status: 'planned' };
    case 'NearMiss': return { ...base, title: 'Smoke near miss', status: 'open' };
    case 'DailyObservations': return { ...base, observation: 'Smoke observation', status: 'open' };
    case 'UserTasks': return { ...base, title: 'Smoke task', assignedTo: 'all', status: 'pending' };
    default: return base;
  }
}
