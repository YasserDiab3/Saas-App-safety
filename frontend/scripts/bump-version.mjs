#!/usr/bin/env node
/**
 * Bump patch in version.json and sync AppState.appVersion + service-worker cache.
 *
 * Usage:
 *   npm run bump-version -- "optional message"
 *   node scripts/bump-version.mjs --ci   (deploy: message from git commit)
 *
 * Env:
 *   SKIP_BUMP_VERSION=1  — skip entirely
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const versionPath = path.join(root, 'version.json');
const utilsPath = path.join(root, 'js', 'modules', 'app-utils.js');
const swPath = path.join(root, 'service-worker.js');

const argv = process.argv.slice(2);
const isCi = argv.includes('--ci');
const cliMessage = argv.filter((a) => a !== '--ci').join(' ').trim();

if (process.env.SKIP_BUMP_VERSION === '1') {
    console.log('SKIP_BUMP_VERSION=1 — version bump skipped');
    process.exit(0);
}

function deployMessage() {
    const raw = (
        process.env.VERCEL_GIT_COMMIT_MESSAGE
        || process.env.GITHUB_COMMIT_MESSAGE
        || ''
    ).trim();
    if (!raw) return '';
    const first = raw.split('\n')[0].trim();
    return first.length > 140 ? first.slice(0, 137) + '…' : first;
}

const manifest = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
const parts = String(manifest.version || '0.0.0').trim().split('.').map((n) => parseInt(n, 10) || 0);
while (parts.length < 3) parts.push(0);
parts[2] += 1;
manifest.version = parts.join('.');

const msg = cliMessage || (isCi ? deployMessage() : '');
if (msg) {
    manifest.message = msg;
}

fs.writeFileSync(versionPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

let utils = fs.readFileSync(utilsPath, 'utf8');
const nextUtils = utils.replace(/appVersion:\s*'[^']*'/, `appVersion: '${manifest.version}'`);
if (nextUtils === utils) {
    console.warn('Warning: could not update appVersion in app-utils.js');
} else {
    fs.writeFileSync(utilsPath, nextUtils, 'utf8');
}

if (fs.existsSync(swPath)) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cacheVer = `hse-app-v${manifest.version}-${date}`;
    let sw = fs.readFileSync(swPath, 'utf8');
    const nextSw = sw.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${cacheVer}';`);
    if (nextSw !== sw) {
        fs.writeFileSync(swPath, nextSw, 'utf8');
        console.log(`Updated service-worker CACHE_VERSION → ${cacheVer}`);
    }
}

console.log(`Bumped app version to ${manifest.version}`);
if (manifest.message) console.log(`Message: ${manifest.message}`);
