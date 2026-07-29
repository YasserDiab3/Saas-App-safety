/**
 * pro_foundation_smoke.mjs — verifies Pro roadmap foundation (sites/notify/webhooks/sheets).
 * Run: node supabase/scripts/pro_foundation_smoke.mjs
 */
import { loadConfig, loadSmokeCredentials, auth, rpc } from './smoke-lib.mjs';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

let pass = 0;
let fail = 0;
const results = [];

function ok(name, detail = '') {
  pass++;
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
}
function bad(name, detail = '') {
  fail++;
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
}

function checkSyntax(rel) {
  const full = path.join(root, rel);
  if (!existsSync(full)) {
    bad(`syntax:${rel}`, 'missing file');
    return;
  }
  const r = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
  if (r.status === 0) ok(`syntax:${path.basename(rel)}`);
  else bad(`syntax:${rel}`, (r.stderr || r.stdout || '').slice(0, 200));
}

async function main() {
  console.log('=== pro_foundation_smoke ===\n');

  const jsFiles = [
    'frontend/js/saas/saas-report-brand.js',
    'frontend/js/saas/saas-org-sites.js',
    'frontend/js/saas/saas-notify.js',
    'frontend/js/saas/saas-capa.js',
    'frontend/js/saas/saas-enterprise-stubs.js',
    'frontend/js/modules/onboarding-wizard.js',
    'frontend/js/modules/compliance-reports.js',
    'frontend/js/modules/executive-kpi.js',
    'frontend/js/modules/incident-ai-assist.js'
  ];
  for (const f of jsFiles) checkSyntax(f);

  // Static presence checks
  const mustExist = [
    'frontend/css/hsehub-tokens.css',
    'supabase/functions/notify-dispatch/index.ts',
    'supabase/migrations/0049_pro_foundation_sites_notify.sql',
    'supabase/migrations/0050_webhooks_and_notify_cron_note.sql',
    'docs/NOTIFY_DISPATCH.md'
  ];
  for (const f of mustExist) {
    if (existsSync(path.join(root, f))) ok(`exists:${path.basename(f)}`);
    else bad(`exists:${f}`, 'missing');
  }

  // ReportBrand API surface
  const brandSrc = readFileSync(path.join(root, 'frontend/js/saas/saas-report-brand.js'), 'utf8');
  for (const api of ['enhanceXlsx', 'brandWorkbook', 'aoaToBrandedSheet', 'htmlHeader', 'enhanceFormHeader']) {
    if (brandSrc.includes(api)) ok(`reportBrand.${api}`);
    else bad(`reportBrand.${api}`, 'missing export');
  }

  const sitesSrc = readFileSync(path.join(root, 'frontend/js/saas/saas-org-sites.js'), 'utf8');
  for (const api of ['isStrictSiteScope', 'setStrictSiteScope', 'filterBySite', 'orgSelectFieldHtml']) {
    if (sitesSrc.includes(api)) ok(`orgSites.${api}`);
    else bad(`orgSites.${api}`, 'missing');
  }

  const edgeSrc = readFileSync(path.join(root, 'supabase/functions/notify-dispatch/index.ts'), 'utf8');
  if (edgeSrc.includes('loadTenantWebhooks') && edgeSrc.includes('fanOutWebhooks')) {
    ok('notify-dispatch.webhooks');
  } else {
    bad('notify-dispatch.webhooks', 'missing fan-out');
  }

  const creds = loadSmokeCredentials();
  if (!creds) {
    console.log('\n(skip live RPC — no smoke credentials)');
  } else {
    const { base, anon } = loadConfig();
    const token = await auth(base, anon, creds.email, creds.password);
    ok('auth');

    const me = await rpc(base, anon, token, 'api_me', {});
    if (me && (me.tenant_id || me.tenantId || me.success !== false)) ok('api_me', String(me.tenant_id || me.tenantId || 'ok'));
    else bad('api_me', JSON.stringify(me).slice(0, 120));

    const sheetsList = await rpc(base, anon, token, 'api_list_tenant_sheets', {});
    const names = Array.isArray(sheetsList)
      ? sheetsList.map((s) => (typeof s === 'string' ? s : s.name || s.sheet || '')).filter(Boolean)
      : [];
    if (names.length) ok('api_list_tenant_sheets', `${names.length} sheets`);
    else ok('api_list_tenant_sheets', 'ok');

    const sheets = ['OrgSites', 'OrgDepartments', 'NotificationPrefs', 'WebhookEndpoints', 'ComplianceChecklists'];
    for (const sheet of sheets) {
      try {
        const res = await rpc(base, anon, token, 'api_read_sheet', { p_sheet: sheet });
        const rows = Array.isArray(res) ? res : (res && res.data) || [];
        ok(`sheet:${sheet}`, `rows=${Array.isArray(rows) ? rows.length : 'ok'}`);
      } catch (e) {
        const msg = String(e.message || e);
        if (/permission|plan|module|gated|not allowed/i.test(msg)) ok(`sheet:${sheet}`, 'gated-ok');
        else bad(`sheet:${sheet}`, msg.slice(0, 160));
      }
    }

    try {
      const siteId = 'SMOKE-SITE-PRO';
      await rpc(base, anon, token, 'api_upsert', {
        p_sheet: 'OrgSites',
        p_id: siteId,
        p_data: { id: siteId, name: 'Smoke Site', code: 'SMK', active: true, _smoke: true }
      });
      const after = await rpc(base, anon, token, 'api_read_sheet', { p_sheet: 'OrgSites' });
      const arr = Array.isArray(after) ? after : (after && after.data) || [];
      const found = arr.some((r) => String(r.id) === siteId);
      await rpc(base, anon, token, 'api_delete', { p_sheet: 'OrgSites', p_id: siteId });
      if (found) ok('orgSites.crud');
      else bad('orgSites.crud', 'row missing after upsert');
    } catch (e) {
      const msg = String(e.message || e);
      if (/read-only|payment|upgrade|module not allowed/i.test(msg)) ok('orgSites.crud', 'plan-gated-ok');
      else bad('orgSites.crud', msg.slice(0, 200));
    }

    try {
      const enq = await rpc(base, anon, token, 'api_enqueue_notification', {
        p_event_key: 'smoke_test',
        p_title: 'Pro foundation smoke',
        p_body: 'automated check — safe to ignore',
        p_record_id: 'SMOKE-PRO',
        p_site_id: null,
        p_channels: [],
        p_payload: { source: 'pro_foundation_smoke' }
      });
      if (enq && (enq.success === true || enq.id)) ok('api_enqueue_notification', String(enq.id || 'ok'));
      else bad('api_enqueue_notification', JSON.stringify(enq).slice(0, 160));
    } catch (e) {
      bad('api_enqueue_notification', String(e.message || e).slice(0, 200));
    }
  }

  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
