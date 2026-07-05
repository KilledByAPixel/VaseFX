'use strict';

import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BUILD_DIR = join(ROOT, 'build');
const TEMP_BUNDLE = join(ROOT, 'pottery.min.js');
const BUILD_HTML = join(BUILD_DIR, 'index.html');

const sourceFiles = [
    join(ROOT, 'code', 'utils.js'),
    join(ROOT, 'code', 'scene.js'),
    join(ROOT, 'code', 'shader.js'),
    join(ROOT, 'code', 'webgl.js'),
    join(ROOT, 'code', 'input.js'),
    join(ROOT, 'code', 'game.js'),
];

const htmlPrefix = `<html>\n<head>\n  <title>VaseFX</title>\n  <meta charset="utf-8" />\n</head>\n\n<body bgcolor="#000">\n<canvas id=glCanvas></canvas>\n<canvas id=mainCanvas></canvas>\n<script>`;
const htmlSuffix = `</script>\n</body>\n</html>\n`;

console.log('Building VaseFX...');

let bundle = '';
for (const file of sourceFiles)
    bundle += fs.readFileSync(file, 'utf8') + '\n';

fs.writeFileSync(TEMP_BUNDLE, bundle, 'utf8');

execSync(`npx uglifyjs -o "${TEMP_BUNDLE}" --compress --mangle -- "${TEMP_BUNDLE}"`, { stdio: 'inherit' });

const minified = fs.readFileSync(TEMP_BUNDLE, 'utf8');

fs.rmSync(BUILD_DIR, { recursive: true, force: true });
fs.mkdirSync(BUILD_DIR, { recursive: true });
fs.writeFileSync(BUILD_HTML, htmlPrefix + minified + htmlSuffix, 'utf8');

fs.rmSync(TEMP_BUNDLE, { force: true });
fs.rmSync(join(ROOT, 'pottery.min.html'), { force: true });

console.log(`Done: ${BUILD_HTML}`);
