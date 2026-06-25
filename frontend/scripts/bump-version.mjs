#!/usr/bin/env node
/**
 * Bump patch in version.json and sync AppState.appVersion fallback in app-utils.js.
 * Usage: npm run bump-version [-- "optional message"]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const versionPath = path.join(root, 'version.json');
const utilsPath = path.join(root, 'js', 'modules', 'app-utils.js');
const swPath = path.join(root, 'service-worker.js');

const optionalMessage = process.argv.slice(2).join(' ').trim();

const manifest = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
const parts = String(manifest.version || '0.0.0').trim().split('.').map((n) => parseInt(n, 10) || 0);
while (parts.length < 3) parts.push(0);
parts[2] += 1;
manifest.version = parts.join('.');

if (optionalMessage) {
    manifest.message = optionalMessage;
}

fs.writeFileSync(versionPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

let utils = fs.readFileSync(utilsPath, 'utf8');
const nextUtils = utils.replace(/appVersion:\s*'[^']*'/, `appVersion: '${manifest.version}'`);
if (nextUtils === utils) {
    console.warn('Warning: could not update appVersion in app-utils.js');
} else {
    fs.writeFileSync(utilsPath, nextUtils, 'utf8');
}

console.log(`Bumped app version to ${manifest.version}`);
if (manifest.message) console.log(`Message: ${manifest.message}`);
if (fs.existsSync(swPath)) {
    console.log('Reminder: update CACHE_VERSION in service-worker.js if this release changes cached assets.');
}
