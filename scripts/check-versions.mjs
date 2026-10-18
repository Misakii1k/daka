import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function expect(condition, message) {
  if (!condition) errors.push(message);
}

const version = JSON.parse(read('version.json'));
const parts = String(version.version || '').split('.').map(Number);
const expectedCode = parts[0] * 10000 + parts[1] * 100 + parts[2];

expect(/^\d+\.\d+\.\d+$/.test(version.version), 'version.json 版本号格式不正确');
expect(version.versionCode === expectedCode, `version.json versionCode 应为 ${expectedCode}`);

const pkg = JSON.parse(read('package.json'));
expect(pkg.version === version.version, 'package.json 版本与 version.json 不一致');

const lock = JSON.parse(read('package-lock.json'));
expect(lock.version === version.version, 'package-lock.json 版本与 version.json 不一致');
if (lock.packages && lock.packages['']) {
  expect(lock.packages[''].version === version.version, 'package-lock.json packages 根版本与 version.json 不一致');
}

const app = read('app.js');
const appMatch = app.match(/const APP_VERSION = '([^']+)';/);
expect(!!appMatch && appMatch[1] === version.version, 'app.js APP_VERSION 与 version.json 不一致');

const sw = read('sw.js');
const cacheMatch = sw.match(/const CACHE = '([^']+)';/);
expect(!!cacheMatch && cacheMatch[1] === `worklog-${version.version}`, 'sw.js CACHE 与版本不一致');

const gradle = read('android/app/build.gradle');
const codeMatch = gradle.match(/versionCode (\d+)/);
const nameMatch = gradle.match(/versionName "([^"]+)"/);
expect(!!codeMatch && Number(codeMatch[1]) === expectedCode, 'build.gradle versionCode 与 version.json 不一致');
expect(!!nameMatch && nameMatch[1] === version.version, 'build.gradle versionName 与 version.json 不一致');

const html = read('index.html');
expect(html.indexOf(`id="set-current-version">v${version.version}<`) >= 0, 'index.html 当前版本展示未同步');

expect(!fs.existsSync(path.join(root, 'functions/version.json.ts')), 'functions/version.json.ts 已废弃，应删除以避免双版本源');

expect(String(version.apkUrl || '').indexOf(version.version) >= 0, 'version.json apkUrl 未包含当前版本');
expect(String(version.downloadUrl || '').indexOf(version.version) >= 0, 'version.json downloadUrl 未包含当前版本');
expect(/^[a-f0-9]{64}$/.test(String(version.apkSha256 || '')), 'version.json apkSha256 缺失或格式不正确');

const apkPath = path.join(root, 'release', `daka-${version.version}-android.apk`);
if (fs.existsSync(apkPath)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(apkPath)).digest('hex');
  expect(actual === version.apkSha256, 'release 中安装包哈希与 version.json 不一致');
}

if (errors.length) {
  console.error('[check:versions] 发现 ' + errors.length + ' 个问题:');
  errors.forEach(error => console.error('  - ' + error));
  process.exit(1);
}
console.log('[check:versions] 版本号、缓存名、Gradle 与 APK 哈希一致');
