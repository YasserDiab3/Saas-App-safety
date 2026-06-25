#!/usr/bin/env node
/**
 * Pre-commit: bump patch when staged changes include real code (not version-only).
 * Stages version.json, app-utils.js fallback, service-worker cache key.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.join(__dirname, '..');
const repoRoot = path.resolve(frontendRoot, '..');

const VERSION_SYNC_FILES = new Set([
    'frontend/version.json',
    'frontend/js/modules/app-utils.js',
    'frontend/service-worker.js',
    'dist/version.json',
    'dist/js/modules/app-utils.js',
    'dist/service-worker.js',
]);

function git(args) {
    return spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

function stagedFiles() {
    const r = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
    if (r.status !== 0) return [];
    return r.stdout.split('\n').map((f) => f.trim().replace(/\\/g, '/')).filter(Boolean);
}

function commitMessageHint() {
    const fromEnv = (process.env.GIT_COMMIT_MESSAGE || '').trim();
    if (fromEnv) return fromEnv.length > 140 ? fromEnv.slice(0, 137) + '…' : fromEnv;

    const msgPath = path.join(repoRoot, '.git', 'COMMIT_EDITMSG');
    if (!fs.existsSync(msgPath)) return '';
    const raw = fs.readFileSync(msgPath, 'utf8').trim();
    const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    const first = lines[0] || '';
    if (!first || /^merge /i.test(first)) return '';
    return first.length > 140 ? first.slice(0, 137) + '…' : first;
}

function shouldBump(files) {
    if (!files.length) return false;
    return files.some((f) => !VERSION_SYNC_FILES.has(f));
}

if (process.env.SKIP_BUMP_VERSION === '1') {
    process.exit(0);
}

const staged = stagedFiles();
if (!shouldBump(staged)) {
    process.exit(0);
}

const msg = commitMessageHint() || 'تحديث التطبيق';
const bumpArgs = [path.join(__dirname, 'bump-version.mjs'), msg];
const bump = spawnSync(process.execPath, bumpArgs, {
    cwd: frontendRoot,
    stdio: 'inherit',
    env: process.env,
});
if (bump.status !== 0) {
    process.exit(bump.status ?? 1);
}

const toStage = [
    'frontend/version.json',
    'frontend/js/modules/app-utils.js',
    'frontend/service-worker.js',
].filter((f) => fs.existsSync(path.join(repoRoot, f)));

if (toStage.length) {
    const add = git(['add', ...toStage]);
    if (add.status !== 0) {
        console.error('pre-commit-bump: failed to stage version files');
        process.exit(add.status ?? 1);
    }
}

console.log('pre-commit-bump: version bumped and staged');
process.exit(0);
