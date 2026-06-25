#!/usr/bin/env node
/**
 * Verify version.json, AppState.appVersion, and service-worker CACHE_VERSION stay in sync.
 * Exit 1 on mismatch (for CI / pre-push checks).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const versionPath = path.join(root, 'version.json');
const utilsPath = path.join(root, 'js', 'modules', 'app-utils.js');
const swPath = path.join(root, 'service-worker.js');

const errors = [];

if (!fs.existsSync(versionPath)) {
    console.error('FAIL: missing frontend/version.json');
    process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
const version = String(manifest.version || '').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
    errors.push(`invalid version format: "${version}"`);
}

const utils = fs.readFileSync(utilsPath, 'utf8');
const appMatch = utils.match(/appVersion:\s*'([^']*)'/);
const appVersion = appMatch ? appMatch[1] : null;
if (appVersion !== version) {
    errors.push(`app-utils.js appVersion "${appVersion}" ≠ version.json "${version}"`);
}

if (fs.existsSync(swPath)) {
    const sw = fs.readFileSync(swPath, 'utf8');
    const cacheMatch = sw.match(/const CACHE_VERSION = '([^']*)'/);
    const cacheVer = cacheMatch ? cacheMatch[1] : '';
    if (!cacheVer.includes(`v${version}`)) {
        errors.push(`service-worker CACHE_VERSION "${cacheVer}" does not include v${version}`);
    }
}

if (errors.length) {
    console.error('Version sync FAIL:');
    for (const e of errors) console.error(`  - ${e}`);
    console.error('\nFix: cd frontend && npm run bump-version -- "your message"');
    process.exit(1);
}

console.log(`Version sync OK → ${version}`);
if (manifest.message) console.log(`Message: ${manifest.message}`);
process.exit(0);
