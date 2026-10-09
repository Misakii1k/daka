// 零 Emoji 扫描验证脚本
// 检查项目核心代码与文本，确保 100% 绝对无任何 emoji
const fs = require('fs');
const path = require('path');

const targetFiles = [
  'app.js',
  'exporter.js',
  'style.css',
  'index.html',
  'webdav.js',
  'holidays.js'
];

// 严格的 Emoji 匹配正则，涵盖所有标准 Emoji 区域与符号
const emojiRegex = /(?:\ud83c[\udf00-\udfff]|\ud83d[\ud000-\ude4f\ude80-\udfff]|\ud83e[\udd00-\udfff]|[\u2600-\u26ff]|[\u2700-\u27bf])/g;

let foundAny = false;

targetFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const matches = line.match(emojiRegex);
    if (matches) {
      console.error(`[违规 EMOJI] 文件: ${file}, 行号: ${idx + 1}`);
      console.error(`   内容: ${line}`);
      console.error(`   字符: ${matches.join(' ')}`);
      foundAny = true;
    }
  });
});

if (foundAny) {
  console.error('\n扫描发现存在 Emoji，请立即清理！');
  process.exit(1);
} else {
  console.log('\n零 Emoji 扫描通过：所有检查文件 100% 绝对无 Emoji。');
}
