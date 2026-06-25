/**
 * بناء نسخة إنتاجية من مجلد Frontend:
 * - نسخ كامل إلى dist/ (للحفاظ على المسارات والأصول)
 * - تصغير كل ملف .js عبر esbuild: minify، إسقاط console/debugger، بدون source maps
 *
 * الاستخدام: من مجلد Frontend نفّذ npm install ثم npm run build
 * الناتج: Frontend/dist/ ثم نسخ إلى dist/ عند جذر المستودع (لتوافق إعدادات Vercel التي تتوقع dist).
 */
import * as esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');

function versionJsonInCommit(sha) {
    if (!sha) return false;
    const r = spawnSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', sha], {
        cwd: repoRoot,
        encoding: 'utf8',
    });
    if (r.status !== 0) return false;
    return r.stdout.split('\n').some((f) => {
        const n = f.trim().replace(/\\/g, '/');
        return n === 'frontend/version.json' || n.endsWith('/frontend/version.json');
    });
}

function runAutoVersionBump() {
    if (process.env.SKIP_BUMP_VERSION === '1') {
        console.log('SKIP_BUMP_VERSION=1 — auto version bump skipped');
        return;
    }
    const onDeploy = process.env.VERCEL === '1'
        || process.env.CI === 'true'
        || process.env.AUTO_BUMP_VERSION === '1';
    if (!onDeploy) {
        console.log('Local build — auto version bump skipped (set AUTO_BUMP_VERSION=1 to force)');
        return;
    }
    const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '';
    if (versionJsonInCommit(commitSha)) {
        console.log('version.json already in commit — deploy bump skipped (no double bump)');
        return;
    }
    console.log('Deploy build — auto-bumping app version…');
    const r = spawnSync(process.execPath, [path.join(__dirname, 'bump-version.mjs'), '--ci'], {
        cwd: frontendRoot,
        stdio: 'inherit',
        env: process.env
    });
    if (r.status !== 0) {
        process.exit(r.status ?? 1);
    }
}

runAutoVersionBump();
const distRoot = path.join(frontendRoot, 'dist');
const repoRoot = path.resolve(frontendRoot, '..');
const rootDist = path.join(repoRoot, 'dist');

function walkJsFiles(dir, acc = []) {
    if (!fs.existsSync(dir)) return acc;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === 'vendor') continue;
            walkJsFiles(p, acc);
        } else if (ent.name.endsWith('.js')) {
            acc.push(p);
        }
    }
    return acc;
}

function rmrf(p) {
    try {
        fs.rmSync(p, { recursive: true, force: true });
    } catch (_) {}
}

function cpDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, ent.name);
        const d = path.join(dest, ent.name);
        if (ent.isDirectory()) {
            if (ent.name === 'node_modules' || ent.name === 'dist') continue;
            cpDir(s, d);
        } else {
            fs.copyFileSync(s, d);
        }
    }
}

console.log('HSE Frontend production build');
console.log('Source:', frontendRoot);
console.log('Output:', distRoot);

rmrf(distRoot);
cpDir(frontendRoot, distRoot);

const entryPoints = walkJsFiles(distRoot);
if (!entryPoints.length) {
    console.warn('No JS files found under dist.');
    process.exit(0);
}

await esbuild.build({
    entryPoints,
    outdir: distRoot,
    outbase: distRoot,
    allowOverwrite: true,
    minify: true,
    legalComments: 'none',
    platform: 'browser',
    drop: ['console', 'debugger'],
    sourcemap: false,
    logLevel: 'info',
    logOverride: {
        'duplicate-object-key': 'silent',
        'assign-to-constant': 'warning'
    }
});

const info = [
    `builtAt: ${new Date().toISOString()}`,
    `filesMinified: ${entryPoints.length}`,
    'esbuild: minify + drop console/debugger + no sourcemap'
].join('\n');
fs.writeFileSync(path.join(distRoot, 'BUILD_INFO.txt'), info, 'utf8');

rmrf(rootDist);
cpDir(distRoot, rootDist);
fs.writeFileSync(path.join(rootDist, 'BUILD_INFO.txt'), info, 'utf8');

console.log(`Done. Minified ${entryPoints.length} JS files → ${distRoot} and ${rootDist}`);
