const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('sw.js 预缓存清单中的文件都存在', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const match = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
  assert.ok(match, 'sw.js 缺少 ASSETS');
  const assets = [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
  for (const asset of assets) {
    const clean = asset.replace(/^\.\//, '');
    if (!clean) continue;
    assert.equal(fs.existsSync(path.join(root, clean)), true, `缺少预缓存资源: ${asset}`);
  }
});

test('index.html 的本地脚本与样式都存在', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(item => item[1]);
  for (const ref of refs) {
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:') || ref.startsWith('#')) continue;
    const clean = ref.split('?')[0].split('#')[0];
    if (!clean) continue;
    assert.equal(fs.existsSync(path.join(root, clean.replace(/^\//, ''))), true, `缺少资源: ${ref}`);
  }
});

test('core.js 在 app.js 之前加载', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.indexOf('src="core.js"') >= 0, 'index.html 未加载 core.js');
  assert.ok(html.indexOf('src="core.js"') < html.indexOf('src="app.js"'), 'core.js 必须在 app.js 之前');
});

test('app.js 不再调用不存在的 Haptic.warning', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.equal(/Haptic\.warning\s*\(/.test(app), false);
});

test('版本入口唯一：静态 version.json 存在，旧 Function 已移除', () => {
  assert.equal(fs.existsSync(path.join(root, 'version.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'functions', 'version.json.ts')), false);
  assert.equal(fs.existsSync(path.join(root, '_headers')), true);
  assert.equal(fs.existsSync(path.join(root, '_routes.json')), true);
});
