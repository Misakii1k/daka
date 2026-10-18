import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const exporter = fs.readFileSync(path.join(root, 'exporter.js'), 'utf8');
const fx = fs.readFileSync(path.join(root, 'fx_celebration.js'), 'utf8');
const webdav = fs.readFileSync(path.join(root, 'webdav.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const errors = [];

function objectKeys(source, header) {
  const start = source.indexOf(header);
  if (start < 0) return [];
  const end = source.indexOf('\n  };', start);
  if (end < 0) return [];
  const block = source.slice(start + header.length, end);
  const keys = [];
  const regex = /^\s{4}(?:async\s+)?([a-zA-Z][a-zA-Z0-9]*)\s*(?:[(:,]|$)/gm;
  let match;
  while ((match = regex.exec(block))) keys.push(match[1]);
  return keys;
}

function checkCalls(label, calls, available) {
  const unique = [...new Set(calls)];
  for (const name of unique) {
    if (available.indexOf(name) < 0) {
      errors.push(`${label}.${name} 被调用，但未在导出对象中定义`);
    }
  }
}

const hapticMethods = objectKeys(app, 'const Haptic = {');
checkCalls('Haptic', [...app.matchAll(/Haptic\.([a-zA-Z][a-zA-Z0-9]*)\s*\(/g)].map(m => m[1]), hapticMethods);

const exporterKeys = objectKeys(exporter, 'window.SalaryExporter = {');
const exporterCalls = [
  ...app.matchAll(/(?:window\.)?SalaryExporter\.([a-zA-Z][a-zA-Z0-9]*)/g)
].map(m => m[1]);
checkCalls('SalaryExporter', exporterCalls, exporterKeys);

const fxKeys = objectKeys(fx, 'window.CelebrationFX = {');
const fxCalls = [
  ...app.matchAll(/(?:window\.)?CelebrationFX\.([a-zA-Z][a-zA-Z0-9]*)/g)
].map(m => m[1]);
checkCalls('CelebrationFX', fxCalls, fxKeys);

const webdavKeys = objectKeys(webdav, 'const WebDAVClient = {');
const webdavCalls = [
  ...app.matchAll(/(?:window\.)?WebDAVClient\.([a-zA-Z][a-zA-Z0-9]*)/g)
].map(m => m[1]);
checkCalls('WebDAVClient', webdavCalls, webdavKeys);

// DOM id 引用检查：动态生成或已废弃的 id 放在白名单
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const allowedMissing = new Set([
  'hero-charge-pct',
  'invoice-paper',
  'm3-btn-state-pill',
  'um-card'
]);
const jsIds = [...app.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]);
for (const id of new Set(jsIds)) {
  if (!htmlIds.has(id) && !allowedMissing.has(id)) {
    errors.push(`$('${id}') 引用的 DOM id 不存在`);
  }
}

if (errors.length) {
  console.error('[check:refs] 发现 ' + errors.length + ' 个问题:');
  errors.forEach(error => console.error('  - ' + error));
  process.exit(1);
}
console.log('[check:refs] Haptic / SalaryExporter / CelebrationFX / WebDAVClient 与 DOM id 引用一致');
