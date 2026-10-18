import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { RUNTIME_FILES, RUNTIME_DIRS } from './runtime-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(root, 'www');

if (!fs.existsSync(path.join(www, 'index.html'))) {
  console.error('[check:www] www/ 不存在，请先执行 npm run build:web');
  process.exit(1);
}

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const errors = [];
for (const file of RUNTIME_FILES) {
  const source = path.join(root, file);
  const target = path.join(www, file);
  if (!fs.existsSync(target)) {
    errors.push('www/ 缺少 ' + file);
    continue;
  }
  if (hash(source) !== hash(target)) errors.push('www/ 与根目录不一致: ' + file);
}

for (const dir of RUNTIME_DIRS) {
  const sourceDir = path.join(root, dir);
  const targetDir = path.join(www, dir);
  if (!fs.existsSync(targetDir)) {
    errors.push('www/ 缺少目录 ' + dir);
    continue;
  }
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (!fs.existsSync(target)) errors.push(`www/${dir} 缺少 ${entry.name}`);
    else if (hash(source) !== hash(target)) errors.push(`www/${dir}/${entry.name} 与根目录不一致`);
  }
}

if (errors.length) {
  console.error('[check:www] 发现 ' + errors.length + ' 个问题:');
  errors.forEach(error => console.error('  - ' + error));
  process.exit(1);
}
console.log('[check:www] www/ 与根目录运行时文件一致');
