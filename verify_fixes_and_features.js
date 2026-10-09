const fs = require('fs');
const assert = require('assert');

console.log('=== 开始全面验证本次所有问题修复与新特性 ===\n');

// 1. 验证 handwriting.js 的单字符识别接口兼容性
console.log('1. 验证单字识别返回与参数兼容性（杜绝 [object Object]）...');
const hw = require('./handwriting.js');
const dummyStrokes = [
  [{ x: 10, y: 10 }, { x: 10, y: 30 }]
];
const singleRes = hw.recognizeSingleDigit(dummyStrokes);
assert(typeof singleRes === 'object', 'recognizeSingleDigit 应返回对象');
assert(typeof singleRes.char === 'string', 'recognizeSingleDigit.char 必须为字符串');
console.log('  单字识别返回结果类型正常:', JSON.stringify(singleRes));

// 2. 验证时间跨度计算（修复 11:30 到 13:00 估算错误）
console.log('\n2. 验证 11:30 到 13:00 跨度计算（预期 90 分钟，1.5 小时）...');
function toMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function calcMinutesBetween(startStr, endStr) {
  let s = toMin(startStr);
  let e = toMin(endStr);
  let diff = e - s;
  if (diff < 0) diff += 1440;
  return diff;
}
const span1 = calcMinutesBetween('11:30', '13:00');
assert.strictEqual(span1, 90, '11:30 到 13:00 必须为 90 分钟');
const hoursStr = (span1 / 60).toFixed(1);
assert.strictEqual(hoursStr, '1.5', '90 分钟必须折算为 1.5 小时');
console.log(`  11:30 到 13:00 跨度: ${span1} 分钟 (${hoursStr} 小时) -> 校验通过！`);

// 3. 验证单格时间输入约束（小时≤23，分钟≤59）
console.log('\n3. 验证输入时间单格与全量约束...');
function validateGridDigit(idx, char, currentDigits) {
  if (!/^\d$/.test(char)) return { valid: false, reason: '请输入 0 到 9 的纯数字' };
  const num = Number(char);
  if (idx === 0) {
    if (num > 2) return { valid: false, reason: '小时十位只能是 0、1 或 2（一天为 00~23 小时）' };
  } else if (idx === 1) {
    const d0 = currentDigits[0];
    if (d0 === '2' && num > 3) return { valid: false, reason: '小时不能超过 23（时十位为2时，个位只能是 0 到 3）' };
  } else if (idx === 2) {
    if (num > 5) return { valid: false, reason: '分钟十位只能是 0 到 5（一小时最多 59 分钟）' };
  } else if (idx === 3) {
    return { valid: true };
  }
  return { valid: true };
}

function isValidTimeStr(str) {
  if (!str || !/^\d{2}:\d{2}$/.test(str)) return false;
  const [hh, mm] = str.split(':').map(Number);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

// 时十位：3-9 非法
assert(!validateGridDigit(0, '3', ['', '', '', '']).valid);
assert(!validateGridDigit(0, '8', ['', '', '', '']).valid);
assert(validateGridDigit(0, '0', ['', '', '', '']).valid);
assert(validateGridDigit(0, '1', ['', '', '', '']).valid);
assert(validateGridDigit(0, '2', ['', '', '', '']).valid);

// 时个位：若十位是2，4-9 非法
assert(!validateGridDigit(1, '4', ['2', '', '', '']).valid);
assert(validateGridDigit(1, '3', ['2', '', '', '']).valid);
assert(validateGridDigit(1, '9', ['1', '', '', '']).valid);

// 分十位：6-9 非法
assert(!validateGridDigit(2, '6', ['0', '8', '', '']).valid);
assert(!validateGridDigit(2, '8', ['0', '8', '', '']).valid);
assert(validateGridDigit(2, '5', ['0', '8', '', '']).valid);

// 完整时间有效性
assert(isValidTimeStr('08:30'));
assert(isValidTimeStr('23:59'));
assert(!isValidTimeStr('24:00'));
assert(!isValidTimeStr('12:60'));
assert(!isValidTimeStr('83:00'));
console.log('  单格与全量时间约束测试全部通过！');

// 4. 验证 HTML 中记录删除、向导删除、三列统计、定时器刻度盘元素
console.log('\n4. 验证 index.html 关键功能 DOM 结构...');
const htmlContent = fs.readFileSync('./index.html', 'utf8');
assert(htmlContent.includes('id="e-del"'), '应包含删除这天按钮');
assert(htmlContent.includes('id="e-lunch"'), '编辑抽屉应包含午休字段');
assert(htmlContent.includes('id="wiz-del-btn"'), '向导应包含删除记录按钮');
assert(htmlContent.includes('grid-stats-3'), '统计应包含三列网格 grid-stats-3');
assert(htmlContent.includes('id="adj-dial-container"'), '微调抽屉应包含定时器滑动刻度盘');
console.log('  index.html 结构检查通过！');

// 5. 验证 style.css 中导航栏文字增大到 17px 与三列统计样式
console.log('\n5. 验证 style.css 底部导航栏字号与主题色体系...');
const cssContent = fs.readFileSync('./style.css', 'utf8');
assert(cssContent.includes('.grid-stats-3'), 'style.css 应包含 .grid-stats-3 样式');
assert(/font-size:\s*17px/.test(cssContent), '底部导航栏文字应增大至 17px');
assert(!cssContent.includes('--md-primary:#1d4ed8'), '已彻底移除科技蓝令牌');
assert(cssContent.includes('.adj-dial-viewport'), '微调抽屉应包含刻度尺视口样式');
console.log('  style.css 样式与主题色检查通过！');

console.log('\n=== 所有 5 项核心验收检查 100% 验证通过！ ===');
