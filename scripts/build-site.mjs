import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { copyDir } from './fs-utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.deploy');
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 1000;

function fail(message) {
  console.error('[build:site] ' + message);
  process.exit(1);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
const www = path.join(root, 'www');
if (!fs.existsSync(path.join(www, 'index.html'))) {
  fail('www/ 不存在，请先执行 npm run build:web');
}

const apkName = `daka-${version.version}-android.apk`;
const apkSource = path.join(root, 'release', apkName);
if (!fs.existsSync(apkSource)) fail('缺少安装包: release/' + apkName);
if (!version.apkSha256) fail('version.json 缺少 apkSha256，请先执行 npm run version:bump');

const actualHash = sha256(apkSource);
if (actualHash !== String(version.apkSha256).toLowerCase()) {
  fail('安装包哈希与 version.json 不一致，请重新执行 npm run version:bump');
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// 1. 站点静态资源
copyDir(www, out);

// 2. Pages Functions 由 wrangler 从项目根目录 functions/ 读取，不复制进静态产物
const functions = path.join(root, 'functions');
if (!fs.existsSync(functions)) fail('缺少 functions/ 目录');

// 3. 安全头与路由
for (const file of ['_headers', '_routes.json']) {
  const source = path.join(root, file);
  if (!fs.existsSync(source)) fail('缺少 ' + file);
  fs.copyFileSync(source, path.join(out, file));
}

// 4. 安装包：版本化文件 + latest 别名
const releaseDir = path.join(out, 'release');
fs.mkdirSync(releaseDir, { recursive: true });
fs.copyFileSync(apkSource, path.join(releaseDir, apkName));
fs.copyFileSync(apkSource, path.join(releaseDir, 'daka-latest.apk'));

// 5. 体积与文件数校验
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
}
walk(out);
if (files.length > MAX_FILES) fail(`文件数 ${files.length} 超过 ${MAX_FILES}`);
for (const file of files) {
  const size = fs.statSync(file).size;
  if (size > MAX_FILE_BYTES) fail('文件超过 25MiB: ' + path.relative(out, file));
}

const forbidden = [
  'design',
  'android',
  'node_modules',
  'tmp_artifacts',
  '.git',
  '.zcode',
  '.claude',
  'index.html.wip',
  'test_invoice_preview.html',
  'handwriting_lab.html',
  'train_mnist.js',
  'schema.sql',
  'migrations'
];
for (const name of forbidden) {
  if (fs.existsSync(path.join(out, name))) fail('产物中包含不应发布的路径: ' + name);
}

const total = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
console.log(`[build:site] 已生成 .deploy/，共 ${files.length} 个文件，${(total / 1024 / 1024).toFixed(1)} MB`);
console.log(`[build:site] 安装包: release/${apkName} (${(fs.statSync(apkSource).size / 1024 / 1024).toFixed(2)} MB)`);
