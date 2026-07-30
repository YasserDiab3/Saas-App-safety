/**
 * sso-activate.mjs — Activate / verify enterprise SSO (SAML) on Supabase.
 *
 * Confirms plan support, enables SAML when allowed (Pro+), lists providers,
 * optionally registers IdP.
 *
 * Usage:
 *   node supabase/scripts/sso-activate.mjs              # verify + print SP endpoints
 *   node supabase/scripts/sso-activate.mjs --smoke       # + Auth SSO probe
 *
 * Register IdP (Microsoft Entra / Okta / Google) when ready (requires Pro+ + SAML enabled):
 *   set SSO_METADATA_URL=https://login.microsoftonline.com/<tenant>/federationmetadata/2007-06/federationmetadata.xml
 *   set SSO_DOMAINS=company.com
 *   node supabase/scripts/sso-activate.mjs --register
 *
 * Preferred IdP for HSEHub ops: Microsoft Entra ID.
 */
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './smoke-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'tbkajjarkqhsdiabufjv';
const args = new Set(process.argv.slice(2));

function loadAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  const env = {};
  for (const f of ['.env', '.env.local']) {
    const p = path.join(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return env.SUPABASE_ACCESS_TOKEN || '';
}

function runSupabase(argv) {
  const r = spawnSync('npx', ['supabase', ...argv, '--project-ref', PROJECT_REF], {
    encoding: 'utf8',
    shell: true
  });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  if (r.status !== 0) {
    throw new Error(out || `supabase ${argv.join(' ')} failed (${r.status})`);
  }
  try {
    return JSON.parse(out);
  } catch {
    return { raw: out };
  }
}

function print(title, obj) {
  console.log('\n=== ' + title + ' ===');
  console.log(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

async function getAuthSamlFlags(token) {
  if (!token) return null;
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return { error: await res.text() };
  const j = await res.json();
  return {
    saml_enabled: !!j.saml_enabled,
    saml_external_url: j.saml_external_url || null,
    saml_allow_encrypted_assertions: !!j.saml_allow_encrypted_assertions
  };
}

async function enableSaml(token) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ saml_enabled: true })
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: j };
}

async function smokeAuthSso(base, anon) {
  const res = await fetch(`${base}/auth/v1/sso`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      domain: 'sso-smoke-no-idp.example',
      redirect_to: 'https://saas-app-safety.vercel.app/'
    })
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log('SSO activate — project', PROJECT_REF);
  const token = loadAccessToken();

  const info = runSupabase(['sso', 'info']);
  print('SAML SP endpoints (paste into IdP)', info);
  if (!info.acs_url || !info.entity_id) {
    throw new Error('SAML SSO endpoints missing from sso info');
  }

  const flags = await getAuthSamlFlags(token);
  print('Auth SAML flags', flags || '(no SUPABASE_ACCESS_TOKEN — skip)');

  let planAllowsSaml = null;
  let enableAttempt = null;
  if (flags && flags.saml_enabled === false && token) {
    enableAttempt = await enableSaml(token);
    print('Enable SAML attempt', enableAttempt);
    if (enableAttempt.ok) {
      planAllowsSaml = true;
      console.log('SAML enabled on Auth.');
    } else if (enableAttempt.status === 402) {
      planAllowsSaml = false;
      console.log('BLOCKER: upgrade project to Pro (or higher) to enable SAML 2.0.');
    }
  } else if (flags && flags.saml_enabled) {
    planAllowsSaml = true;
    console.log('SAML already enabled on Auth.');
  }

  const listed = runSupabase(['sso', 'list']);
  const providers = Array.isArray(listed.providers) ? listed.providers : [];
  print('Registered IdP providers', providers.length ? providers : '(none yet)');

  if (args.has('--register')) {
    if (planAllowsSaml === false) {
      throw new Error('Cannot register IdP until project is on Pro+ and SAML is enabled');
    }
    const metadataUrl = process.env.SSO_METADATA_URL || '';
    const domains = (process.env.SSO_DOMAINS || '').split(',').map((d) => d.trim()).filter(Boolean);
    if (!metadataUrl || !domains.length) {
      throw new Error('SSO_METADATA_URL and SSO_DOMAINS required for --register');
    }
    const addArgs = ['sso', 'add', '--type', 'saml', '--metadata-url', metadataUrl];
    for (const d of domains) addArgs.push('--domains', d);
    const added = runSupabase(addArgs);
    print('Registered IdP', added);
  } else if (!providers.length) {
    console.log('\nPreferred IdP: Microsoft Entra ID');
    console.log('Next after Pro upgrade + SAML enabled:');
    console.log('  set SSO_METADATA_URL=... SSO_DOMAINS=company.com');
    console.log('  node supabase/scripts/sso-activate.mjs --register');
  }

  const statusPath = path.resolve(root, 'docs/SSO_ACTIVATION_STATUS.json');
  const status = {
    checkedAt: new Date().toISOString(),
    projectRef: PROJECT_REF,
    preferredIdp: 'microsoft_entra_id',
    acsUrl: info.acs_url,
    entityId: info.entity_id,
    relayState: info.relay_state || null,
    samlEnabledOnAuth: flags ? !!flags.saml_enabled : null,
    planAllowsSaml,
    enableAttempt: enableAttempt
      ? { status: enableAttempt.status, message: enableAttempt.body && enableAttempt.body.message }
      : null,
    providerCount: providers.length,
    providers: providers.map((p) => ({
      id: p.id || p.provider_id || null,
      domains: p.domains || p.sso_domains || null
    })),
    blocker:
      planAllowsSaml === false
        ? 'Upgrade Supabase project to Pro+ then re-run this script to enable SAML and register IdP'
        : providers.length
          ? null
          : 'No IdP registered — set SSO_METADATA_URL + SSO_DOMAINS and run --register',
    registerCommand:
      'SSO_METADATA_URL=... SSO_DOMAINS=company.com node supabase/scripts/sso-activate.mjs --register'
  };
  writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n', 'utf8');
  console.log('\nWrote', statusPath);

  if (args.has('--smoke')) {
    const { base, anon } = loadConfig();
    const probe = await smokeAuthSso(base, anon);
    print('Auth SSO smoke', probe);
    const code = probe.body && (probe.body.error_code || probe.body.code);
    if (code === 'saml_provider_disabled' || /disabled/i.test(String(probe.body && probe.body.msg))) {
      console.log('Smoke OK (expected): SAML disabled until Pro+ enable.');
    } else if (probe.status >= 400) {
      console.log('Smoke OK: Auth rejected probe domain (no matching IdP).');
    } else {
      console.log('Smoke: unexpected success — inspect response.');
    }
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error('FAIL:', e.message || e);
  process.exit(1);
});
