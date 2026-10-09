// 薪资核算与发票导出全链路验证脚本
// 严格规范：严禁使用任何 emoji

const fs = require('fs');

console.log('1. 验证所有修改文件的语法与依赖完整性...');
['app.js', 'exporter.js', 'sw.js'].forEach(file => {
  const code = fs.readFileSync(file, 'utf8');
  try {
    new Function(code);
    console.log(file, '语法解析正常');
  } catch (e) {
    console.error(file, '语法错误:', e.message);
    process.exit(1);
  }
});

console.log('\n2. 严格 Emoji 全局检查...');
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
['index.html', 'style.css', 'app.js', 'exporter.js', 'sw.js'].forEach(file => {
  const code = fs.readFileSync(file, 'utf8');
  if (emojiRegex.test(code)) {
    console.error(`在 ${file} 中检测到非法 emoji 字符！`);
    process.exit(1);
  }
});
console.log('Emoji 全面排查通过：全项目零 emoji 违规！');

console.log('\n3. 验证薪资核算引擎计算准确性与发票大写金额...');
global.window = {};
eval(fs.readFileSync('exporter.js', 'utf8'));

const mockLog = {
  '2026-10-01': { in: '08:30', out: '18:26', lunch: 60 }, // 净工时 8.9h
  '2026-10-02': { in: '08:30', out: '17:30', lunch: 60 }, // 净工时 8.0h
  '2026-10-03': { in: '09:00', out: '19:00', lunch: 60 }, // 净工时 9.0h (超时加班)
  '2026-10-08': { in: '08:30', out: '', lunch: 60 },      // 缺卡
};

const mockSettings = { lunch: 60, std: 8, wage: 30 };
const testMonth = new Date(2026, 9, 1); // 2026年10月

const report = window.SalaryExporter.computeMonthReportData(testMonth, mockLog, mockSettings, 30, '张三');

console.log('核算月份:', report.year + '年' + report.month + '月');
console.log('出勤天数:', report.attendedDays, '(预期: 3天)');
console.log('缺卡天数:', report.missingDays, '(预期: 1天)');
console.log('总计工时:', report.totalHours, '小时');
console.log('预计薪资:', '￥' + report.totalSalary, '(时薪 30元/小时)');
console.log('金额大写:', report.totalSalaryCn);

if (report.attendedDays !== 3) throw new Error('出勤天数计算有误');
if (report.missingDays !== 1) throw new Error('缺卡天数计算有误');
if (report.totalHours !== 25.9) throw new Error(`总工时有误: 预期 25.9, 实际 ${report.totalHours}`);
// 25.9 * 30 = 777.00
if (report.totalSalary !== 777.00) throw new Error(`总薪资有误: 预期 777.00, 实际 ${report.totalSalary}`);
if (report.totalSalaryCn !== '柒佰柒拾柒元整') throw new Error(`大写金额有误: 预期 柒佰柒拾柒元整, 实际 ${report.totalSalaryCn}`);

console.log('\n4. 验证 Excel / CSV 表格导出格式与内容...');
let exportedCsvContent = '';
global.Blob = class {
  constructor(parts) {
    exportedCsvContent = parts.join('');
  }
};
global.URL = {
  createObjectURL: () => 'blob:mock-url',
  revokeObjectURL: () => {}
};
global.document = {
  body: {
    appendChild: () => {},
    removeChild: () => {}
  },
  createElement: () => ({
    click: () => {},
    remove: () => {}
  })
};

const csvOk = window.SalaryExporter.exportExcelCsv(report);
if (!csvOk) throw new Error('CSV 导出失败');

if (!exportedCsvContent.startsWith('\uFEFF')) {
  throw new Error('CSV 缺少 UTF-8 BOM，可能在 Excel 中乱码');
}
if (!exportedCsvContent.includes('工时与薪资结算单')) {
  throw new Error('CSV 缺少结算表头');
}
if (!exportedCsvContent.includes('柒佰柒拾柒元整')) {
  throw new Error('CSV 缺少大写金额');
}
if (!exportedCsvContent.includes('2026-10-01')) {
  throw new Error('CSV 缺少具体日期行');
}
console.log('CSV 内容结构验证通过，前 300 字符预览:');
console.log(exportedCsvContent.slice(0, 300));

console.log('\n全部薪资核算与导出功能回归测试 100% 通过！');
