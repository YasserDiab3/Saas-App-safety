#!/usr/bin/env node
/**
 * Point git at scripts/git-hooks/ (pre-commit version bump).
 * Run once after clone: npm run setup-hooks
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const hooksDir = path.join(__dirname, 'git-hooks');
const preCommit = path.join(hooksDir, 'pre-commit');

if (!fs.existsSync(preCommit)) {
    console.error('Missing scripts/git-hooks/pre-commit');
    process.exit(1);
}

const r = spawnSync('git', ['config', 'core.hooksPath', 'scripts/git-hooks'], {
    cwd: repoRoot,
    encoding: 'utf8',
});
if (r.status !== 0) {
    console.error(r.stderr || 'git config failed');
    process.exit(r.status ?? 1);
}

console.log('Git hooks installed → scripts/git-hooks (pre-commit version bump)');
console.log('Skip once: SKIP_BUMP_VERSION=1 git commit …');
