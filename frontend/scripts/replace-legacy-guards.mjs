import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js');

const replacements = [
    [/!AppState\.backendConfig\?\.server\?\.enabled\s*\|\|\s*!AppState\.backendConfig\?\.server\?\.scriptUrl/g, '!Utils.hasCloudBackendSync()'],
    [/AppState\.backendConfig\?\.server\?\.enabled\s*&&\s*AppState\.backendConfig\?\.server\?\.scriptUrl/g, 'Utils.hasCloudBackendSync()'],
    [/AppState\.backendConfig\.server\.enabled\s*&&\s*AppState\.backendConfig\.server\.scriptUrl/g, 'Utils.hasCloudBackendSync()'],
    [/!AppState\.backendConfig\.server\.enabled\s*\|\|\s*!AppState\.backendConfig\.server\.scriptUrl/g, '!Utils.hasCloudBackendSync()'],
    [/AppState\.backendConfig\?\.server\?\.enabled/g, 'Utils.hasCloudBackendSync()'],
    [/AppState\.backendConfig\.server\.enabled/g, 'Utils.hasCloudBackendSync()'],
    [/AppState\?\.backendConfig\?\.server\?\.scriptUrl/g, "''"],
    [/AppState\.backendConfig\.server\.scriptUrl/g, "''"],
    [/AppState\.backendConfig && AppState\.backendConfig\.server && Utils\.hasCloudBackendSync\(\) && AppState\.backendConfig\.sheets && AppState\.backendConfig\.sheets\.spreadsheetId/g, 'Utils.hasCloudBackendSync()'],
];

function walk(dir, files = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p, files);
        else if (ent.name.endsWith('.js')) files.push(p);
    }
    return files;
}

let total = 0;
for (const file of walk(root)) {
    let text = fs.readFileSync(file, 'utf8');
    const orig = text;
    for (const [from, to] of replacements) {
        text = text.replace(from, to);
    }
    if (text !== orig) {
        fs.writeFileSync(file, text);
        total++;
        console.log('updated', path.relative(root, file));
    }
}
console.log('files updated:', total);
