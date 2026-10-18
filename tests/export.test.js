const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let lastCsv = '';
let lastFilename = '';

global.window = {};
global.Blob = class {
  constructor(parts) {
    lastCsv = parts.join('');
  }
};
global.URL = {
  createObjectURL: () => 'blob:mock',
  revokeObjectURL: () => {}
};
global.document = {
  body: {
    appendChild: () => {},
    removeChild: () => {}
  },
  createElement: () => {
    const element = {
      href: '',
      click: () => {},
      remove: () => {}
    };
    Object.defineProperty(element, 'download', {
      get: () => lastFilename,
      set: value => { lastFilename = value; }
    });
    return element;
  }
};

eval(fs.readFileSync(path.join(__dirname, '..', 'exporter.js'), 'utf8'));
const SalaryExporter = global.window.SalaryExporter;

function makeReport() {
  return SalaryExporter.computeMonthReportData(
    new Date(2026, 9, 1),
    {
      '2026-10-01': { in: '08:30', out: '17:30', lunch: 60, note: '=cmd' }
    },
    { lunch: 60, std: 8, wage: 30 },
    30,
    '张三'
  );
}

test('exportExcelCsv 返回统一结果并生成带 BOM 的 CSV', async () => {
  const result = await SalaryExporter.exportExcelCsv(makeReport());
  assert.equal(result.ok, true);
  assert.match(result.message, /下载/);
  assert.equal(lastCsv.startsWith('\uFEFF'), true);
  assert.match(lastCsv, /2026-10-01/);
  assert.match(lastCsv, /240\.00/);
  assert.match(lastCsv, /贰佰肆拾元整/);
});

test('exportExcelCsv 对公式起始的备注做防注入处理', async () => {
  await SalaryExporter.exportExcelCsv(makeReport());
  assert.equal(lastCsv.includes('"\'=cmd"'), true);
});

test('exportExcelCsv 文件名净化后不包含路径分隔符', async () => {
  const report = makeReport();
  report.userName = '../../evil';
  await SalaryExporter.exportExcelCsv(report);
  assert.equal(lastFilename.includes('/'), false);
  assert.equal(lastFilename.includes('\\'), false);
  assert.match(lastFilename, /evil/);
});
