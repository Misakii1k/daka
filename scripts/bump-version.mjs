import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error('[version:bump] ' + message);
  process.exit(1);
}

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function write(relative, content) {
  fs.writeFileSync(path.join(root, relative), content);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

const args = process.argv.slice(2);
let nextVersion = '';
let notes = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--version') nextVersion = args[++i] || '';
  else if (args[i] === '--notes') notes = args[++i] || '';
}

const versionPath = path.join(root, 'version.json');
const current = JSON.parse(fs.readFileSync(versionPath, 'utf8'));

if (!nextVersion) {
  const parts = String(current.version || '0.0.0').split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  nextVersion = parts.join('.');
}
if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) fail('版本号必须形如 1.0.10');

const parts = nextVersion.split('.').map(Number);
const versionCode = parts[0] * 10000 + parts[1] * 100 + parts[2];
const now = new Date();
const buildTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
const apkName = `daka-${nextVersion}-android.apk`;
const apkPath = path.join(root, 'release', apkName);
const apkSha256 = fs.existsSync(apkPath)
  ? crypto.createHash('sha256').update(fs.readFileSync(apkPath)).digest('hex')
  : '';

const next = {
  name: current.name || 'daka-worklog',
  version: nextVersion,
  versionCode: versionCode,
  buildTime: buildTime,
  title: current.title || '工时打卡系统',
  releaseNotes: notes || current.releaseNotes || '',
  downloadUrl: `https://daka-f3o.pages.dev/release/${apkName}`,
  apkUrl: `https://daka-f3o.pages.dev/release/${apkName}`,
  apkSha256: apkSha256
};

write('version.json', JSON.stringify(next, null, 2) + '\n');

const pkg = JSON.parse(read('package.json'));
pkg.version = nextVersion;
write('package.json', JSON.stringify(pkg, null, 2) + '\n');

const lock = JSON.parse(read('package-lock.json'));
lock.version = nextVersion;
if (lock.packages && lock.packages['']) lock.packages[''].version = nextVersion;
write('package-lock.json', JSON.stringify(lock, null, 2) + '\n');

const app = read('app.js');
if (!/const APP_VERSION = '[^']+';/.test(app)) fail('app.js 中未找到 APP_VERSION');
write('app.js', app.replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${nextVersion}';`));

const sw = read('sw.js');
if (!/const CACHE = '[^']+';/.test(sw)) fail('sw.js 中未找到 CACHE');
write('sw.js', sw.replace(/const CACHE = '[^']+';/, `const CACHE = 'worklog-${nextVersion}';`));

const gradle = read('android/app/build.gradle');
if (!/versionCode \d+/.test(gradle)) fail('build.gradle 中未找到 versionCode');
write(
  'android/app/build.gradle',
  gradle
    .replace(/versionCode \d+/, `versionCode ${versionCode}`)
    .replace(/versionName "[^"]+"/, `versionName "${nextVersion}"`)
);

const html = read('index.html');
if (!/id="set-current-version">v[^<]+</.test(html)) fail('index.html 中未找到当前版本展示');
write('index.html', html.replace(/id="set-current-version">v[^<]+</, `id="set-current-version">v${nextVersion}<`));

console.log(`[version:bump] 已更新到 v${nextVersion} (versionCode ${versionCode})`);
if (!apkSha256) {
  console.log('[version:bump] 未找到安装包，apkSha256 留空；构建 APK 后请再次执行本脚本');
}
console.log('[version:bump] 下一步: npm run build:web && npm run build:apk && npm run build:site');
