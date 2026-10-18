import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyDir } from './fs-utils.mjs';
import { RUNTIME_FILES, RUNTIME_DIRS } from './runtime-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'www');

function fail(message) {
  console.error('[build:web] ' + message);
  process.exit(1);
}

function copyFile(relative) {
  const source = path.join(root, relative);
  const target = path.join(out, relative);
  if (!fs.existsSync(source)) fail('缺少文件: ' + relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of RUNTIME_FILES) copyFile(file);
for (const dir of RUNTIME_DIRS) {
  const source = path.join(root, dir);
  if (!fs.existsSync(source)) fail('缺少目录: ' + dir);
  copyDir(source, path.join(out, dir));
}

// 校验 index.html 引用的本地资源都存在
const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
for (const ref of refs) {
  if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:') || ref.startsWith('#') || ref.startsWith('mailto:')) continue;
  const clean = ref.split('?')[0].split('#')[0];
  if (!clean) continue;
  const target = path.join(out, clean.replace(/^\//, ''));
  if (!fs.existsSync(target)) fail('index.html 引用了不存在的资源: ' + ref);
}

// 校验 sw.js 的预缓存清单都存在，并覆盖所有运行时文件
const sw = fs.readFileSync(path.join(out, 'sw.js'), 'utf8');
const assetsMatch = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
if (!assetsMatch) fail('sw.js 缺少 ASSETS 清单');
const assets = [...assetsMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
for (const asset of assets) {
  const clean = asset.replace(/^\.\//, '');
  if (!clean) continue;
  if (!fs.existsSync(path.join(out, clean))) fail('sw.js 预缓存了不存在的资源: ' + asset);
}
for (const file of RUNTIME_FILES) {
  if (file === 'sw.js') continue;
  if (assets.indexOf('./' + file) < 0) fail('sw.js 预缓存清单缺少: ' + file);
}

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
}
walk(out);
const total = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
console.log(`[build:web] 已生成 www/，共 ${files.length} 个文件，${(total / 1024).toFixed(1)} KB`);
