const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'exporter.js'), 'utf8'));
const SalaryExporter = global.window.SalaryExporter;

function reportFor(log, rate = 30) {
  return SalaryExporter.computeMonthReportData(
    new Date(2026, 9, 1),
    log,
    { lunch: 60, std: 8, wage: rate },
    rate,
    '张三'
  );
}

test('月度核算：出勤、缺卡、工时与薪资', () => {
  const report = reportFor({
    '2026-10-01': { in: '08:30', out: '18:26', lunch: 60 },
    '2026-10-02': { in: '08:30', out: '17:30', lunch: 60 },
    '2026-10-03': { in: '09:00', out: '19:00', lunch: 60 },
    '2026-10-08': { in: '08:30', out: '', lunch: 60 }
  });
  assert.equal(report.attendedDays, 3);
  assert.equal(report.missingDays, 1);
  assert.equal(report.totalHours, 25.9);
  assert.equal(report.totalSalary, 777);
  assert.equal(report.totalSalaryCn, '柒佰柒拾柒元整');
});

test('跨零点班次按次日计算', () => {
  const report = reportFor({
    '2026-10-05': { in: '22:00', out: '06:00', lunch: 0 }
  }, 30);
  assert.equal(report.totalHours, 8);
  assert.equal(report.totalSalary, 240);
});

test('午休大于跨度时工时归零', () => {
  const report = reportFor({
    '2026-10-05': { in: '09:00', out: '10:00', lunch: 120 }
  }, 30);
  assert.equal(report.totalHours, 0);
  assert.equal(report.totalSalary, 0);
  assert.equal(report.totalSalaryCn, '零元整');
});

test('金额大写随薪资变化', () => {
  const report = reportFor({
    '2026-10-05': { in: '08:30', out: '17:30', lunch: 60 }
  }, 777);
  assert.equal(report.totalSalary, 6216);
  assert.equal(report.totalSalaryCn, '陆仟贰佰壹拾陆元整');
});
