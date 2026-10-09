// 全链路回归验证脚本：直接验证生产环境 handwriting.js
// 严格遵守规范：绝不包含任何 emoji

const fs = require('fs');
const hw = require('./handwriting.js');

function makeLine(x0, y0, x1, y1, steps = 15) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({ x: x0 + t * (x1 - x0), y: y0 + t * (y1 - y0), t: i * 16 });
  }
  return pts;
}

function makeArc(cx, cy, rx, ry, startAngle, endAngle, steps = 25) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (i / steps) * (endAngle - startAngle);
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), t: i * 16 });
  }
  return pts;
}

console.log('1. 验证 HandwritingPad 交互状态机接口...');
let strokeChangeCalled = 0;
let lastStrokes = null;
const mockCanvas = {
  getContext: () => ({
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    setLineDash: () => {},
    scale: () => {}
  }),
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 340, height: 220 }),
  addEventListener: () => {},
  style: {}
};

const pad = new hw.HandwritingPad(mockCanvas, strokes => {
  strokeChangeCalled++;
  lastStrokes = strokes;
});

if (typeof pad.flush !== 'function') throw new Error('pad.flush 接口缺失');
if (typeof pad.scheduleDebouncedChange !== 'function') throw new Error('pad.scheduleDebouncedChange 接口缺失');
if (typeof pad.clear !== 'function') throw new Error('pad.clear 接口缺失');
if (typeof pad.undo !== 'function') throw new Error('pad.undo 接口缺失');
if (typeof pad.isEmpty !== 'function') throw new Error('pad.isEmpty 接口缺失');

// 测试防抖与 flush
pad.strokes.push([{ x: 10, y: 10 }]);
pad.scheduleDebouncedChange();
if (strokeChangeCalled !== 0) throw new Error('防抖未生效：过早触发回调');
pad.flush();
if (strokeChangeCalled !== 1) throw new Error('flush 失败：未能立即冲刷防抖计时器');
if (lastStrokes.length !== 1) throw new Error('flush 数据不正确');

// 测试清空
pad.clear();
if (strokeChangeCalled !== 2) throw new Error('clear 未触发回调');
if (lastStrokes.length !== 0) throw new Error('clear 数据未置空');
if (!pad.isEmpty()) throw new Error('isEmpty 应返回 true');

console.log('HandwritingPad 状态机与防抖/冲刷接口验证全部通过！');

console.log('\n2. 验证字符切分与离线识别引擎端到端用例...');

// 笔画生成辅助
const s1 = makeLine(30, 20, 30, 110, 25);
const s8 = [];
for (let i = 0; i <= 50; i++) {
  const t = (i / 50) * Math.PI * 2;
  s8.push({ x: 75 + 18 * Math.sin(t), y: 65 + 45 * Math.sin(t) * Math.cos(t) * 1.8 });
}
const sColonTop = makeArc(118, 45, 9, 9, 0, Math.PI * 2, 16);
const sColonBot = makeArc(118, 85, 9, 9, 0, Math.PI * 2, 16);
const s2 = [
  ...makeArc(160, 42, 20, 20, Math.PI, 0, 20),
  ...makeLine(180, 42, 140, 108, 25),
  ...makeLine(140, 108, 185, 108, 25)
];
const s6 = [
  ...makeLine(205, 20, 187, 75, 20),
  ...makeArc(205, 85, 18, 23, Math.PI * 0.5, Math.PI * 2.5, 30)
];

// 用例 1: 18:26（触控大冒号 + 2与6仅 2px 间距）
const res1 = hw.recognizeStrokes([s1, s8, sColonTop, sColonBot, s2, s6], { step: 'out' });
console.log('用例 1 (18:26 触控大冒号+微间距):', res1.primaryTime);
if (res1.primaryTime !== '18:26') throw new Error(`用例 1 失败：${res1.primaryTime}`);

// 用例 2: 18:26（2与6接触粘连为一笔）
const s2Touch = [
  ...makeArc(160, 42, 20, 20, Math.PI, 0, 20),
  ...makeLine(180, 42, 140, 108, 25),
  ...makeLine(140, 108, 188, 108, 25)
];
const sTouchCombo = [...s2Touch, ...s6];
const res2 = hw.recognizeStrokes([s1, s8, sColonTop, sColonBot, sTouchCombo], { step: 'out' });
console.log('用例 2 (18:26 粘连):', res2.primaryTime);
if (res2.primaryTime !== '18:26') throw new Error(`用例 2 失败：${res2.primaryTime}`);

// 用例 3: 08:30
const s0 = makeArc(28, 65, 18, 42, 0, Math.PI * 2, 40);
const sColon3Top = makeArc(118, 45, 8, 8, 0, Math.PI * 2, 14);
const sColon3Bot = makeArc(118, 85, 8, 8, 0, Math.PI * 2, 14);
const s3 = [
  ...makeArc(160, 45, 18, 18, Math.PI * 1.1, Math.PI * 0.1, 20),
  ...makeArc(160, 85, 20, 20, -Math.PI * 0.2, Math.PI * 0.9, 20)
];
const s0_2 = makeArc(210, 65, 18, 42, 0, Math.PI * 2, 40);
const res3 = hw.recognizeStrokes([s0, s8, sColon3Top, sColon3Bot, s3, s0_2], { step: 'in' });
console.log('用例 3 (08:30):', res3.primaryTime);
if (res3.primaryTime !== '08:30') throw new Error(`用例 3 失败：${res3.primaryTime}`);

// 用例 4: 830 无冒号
const res4 = hw.recognizeStrokes([s8, s3, s0_2], { step: 'in' });
console.log('用例 4 (830 无冒号):', res4.primaryTime);
if (res4.primaryTime !== '08:30') throw new Error(`用例 4 失败：${res4.primaryTime}`);

// 用例 5: 1826 无冒号
const res5 = hw.recognizeStrokes([s1, s8, s2, s6], { step: 'out' });
console.log('用例 5 (1826 无冒号):', res5.primaryTime);
if (res5.primaryTime !== '18:26') throw new Error(`用例 5 失败：${res5.primaryTime}`);

// 用例 6: 17:30
const s7 = [
  ...makeLine(75 - 18, 22, 75 + 18, 22, 20),
  ...makeLine(75 + 18, 22, 75 - 6, 105, 25)
];
const res6 = hw.recognizeStrokes([s1, s7, sColonTop, sColonBot, s3, s0_2], { step: 'out' });
console.log('用例 6 (17:30):', res6.primaryTime);
if (res6.primaryTime !== '17:30') throw new Error(`用例 6 失败：${res6.primaryTime}`);

// 用例 7: 09:45
const s9 = [
  ...makeArc(75, 42, 18, 20, 0, Math.PI * 2, 30),
  ...makeLine(75 + 18, 42, 75 + 14, 105, 25)
];
const s4 = [
  makeLine(160 + 14, 20, 160 - 18, 70, 20),
  makeLine(160 - 18, 70, 160 + 20, 70, 20),
  makeLine(160 + 14, 35, 160 + 14, 105, 25)
];
const s5 = [
  ...makeLine(210 + 18, 22, 210 - 16, 22, 15),
  ...makeLine(210 - 16, 22, 210 - 18, 55, 15),
  ...makeArc(210, 78, 20, 22, -Math.PI * 0.4, Math.PI * 0.8, 25)
];
const res7 = hw.recognizeStrokes([s0, s9, sColon3Top, sColon3Bot, ...s4, s5], { step: 'in' });
console.log('用例 7 (09:45):', res7.primaryTime);
if (res7.primaryTime !== '09:45') throw new Error(`用例 7 失败：${res7.primaryTime}`);

// 用例 8: 空画板输入
const res8 = hw.recognizeStrokes([], { step: 'in' });
console.log('用例 8 (空画板):', JSON.stringify(res8));
if (res8.primaryTime !== '') throw new Error(`用例 8 失败：${res8.primaryTime}`);

// 用例 9: 单字 6 下班（时态推导为 18:00）
const res9 = hw.recognizeStrokes([s6], { step: 'out' });
console.log('用例 9 (单数字 6 下班推导):', res9.primaryTime, res9.candidates);
if (res9.primaryTime !== '18:00') throw new Error(`用例 9 失败：${res9.primaryTime}`);

// 用例 10: 单字 8 上班（推导为 08:00）
const res10 = hw.recognizeStrokes([s8], { step: 'in' });
console.log('用例 10 (单数字 8 上班推导):', res10.primaryTime, res10.candidates);
if (res10.primaryTime !== '08:00') throw new Error(`用例 10 失败：${res10.primaryTime}`);

// 用例 11: 18:26 (数字 2 与 6 水平 X 轴重叠粘连)
const s2Long = [
  ...makeArc(160, 42, 20, 20, Math.PI, 0),
  ...makeLine(180, 42, 140, 108),
  ...makeLine(140, 108, 195, 108)
];
const s6Close = [
  ...makeLine(190, 20, 180, 75),
  ...makeArc(195, 85, 18, 23, Math.PI * 0.5, Math.PI * 2.5)
];
const res11 = hw.recognizeStrokes([s1, s8, sColonTop, sColonBot, s2Long, s6Close], { step: 'out' });
console.log('用例 11 (2与6水平重叠):', res11.primaryTime);
if (res11.primaryTime !== '18:26') throw new Error(`用例 11 失败：${res11.primaryTime}`);

// 用例 12: 18:26 (长辈倾斜手写冒号 dx = 20)
const sColonSlantedTop = makeArc(110, 45, 9, 9);
const sColonSlantedBot = makeArc(130, 85, 9, 9);
const res12 = hw.recognizeStrokes([s1, s8, sColonSlantedTop, sColonSlantedBot, s2, s6], { step: 'out' });
console.log('用例 12 (倾斜冒号):', res12.primaryTime);
if (res12.primaryTime !== '18:26') throw new Error(`用例 12 失败：${res12.primaryTime}`);

// 用例 13: 误触噪点斑点过滤
const straySpeck = [{ x: 10, y: 10 }];
const res13 = hw.recognizeStrokes([straySpeck, s1, s8, sColonTop, sColonBot, s2, s6], { step: 'out' });
console.log('用例 13 (噪点斑点过滤):', res13.primaryTime);
if (res13.primaryTime !== '18:26') throw new Error(`用例 13 失败：${res13.primaryTime}`);

// 用例 14: 扁圆宽 0 单字识别（防止 Seam Carving 切半）
const s0Wide = makeArc(100, 100, 30, 35, 0, Math.PI * 2, 40);
const res14 = hw.recognizeStrokes([s0Wide], { step: 'in' });
console.log('用例 14 (宽 0 不被误切):', res14.rawText);
if (res14.rawText !== '0') throw new Error(`用例 14 失败：${res14.rawText}`);

// 用例 15: 宽 8 单字识别（防止交叉蜂腰被误切）
const s8Wide = [];
for (let i = 0; i <= 50; i++) {
  const t = (i / 50) * Math.PI * 2;
  s8Wide.push({ x: 100 + 26 * Math.sin(t), y: 90 + 32 * Math.sin(t) * Math.cos(t) * 1.8 });
}
const res15 = hw.recognizeStrokes([s8Wide], { step: 'in' });
console.log('用例 15 (宽 8 不被误切):', res15.rawText);
if (res15.rawText !== '8') throw new Error(`用例 15 失败：${res15.rawText}`);

// 用例 16: 中文习惯平顶 3（横折弯钩形态）
const s3Flat = [
  ...makeLine(85, 55, 115, 55),
  ...makeLine(115, 55, 95, 82),
  ...makeArc(102, 105, 16, 18, -Math.PI * 0.3, Math.PI * 0.8)
];
const res16 = hw.recognizeStrokes([s3Flat], { step: 'in' });
console.log('用例 16 (平顶 3 准确识别):', res16.rawText);
if (res16.rawText !== '3') throw new Error(`用例 16 失败：${res16.rawText}`);

// 用例 17: 弯背 6 单字识别（防止误分类为 0）
const s6Curved = [
  ...makeArc(110, 70, 18, 25, Math.PI * 0.8, Math.PI * 1.6),
  ...makeArc(102, 105, 14, 16, 0, Math.PI * 2)
];
const res17 = hw.recognizeStrokes([s6Curved], { step: 'out' });
console.log('用例 17 (弯背 6 准确识别):', res17.rawText);
if (res17.rawText !== '6') throw new Error(`用例 17 失败：${res17.rawText}`);

// 用例 18: 19 项常见打卡工时时间全集回归
function makeDigitStroke(d, cx, cy, h = 80) {
  const w = h * 0.55;
  const rx = w / 2, ry = h / 2;
  switch (d) {
    case '0': return [makeArc(cx, cy, rx * 0.85, ry * 0.95, 0, Math.PI * 2, 35)];
    case '1': return [makeLine(cx, cy - ry, cx, cy + ry, 20)];
    case '2': return [[
      ...makeArc(cx - rx * 0.1, cy - ry * 0.45, rx * 0.9, ry * 0.5, Math.PI, 0, 20),
      ...makeLine(cx + rx * 0.8, cy - ry * 0.45, cx - rx * 0.8, cy + ry, 25),
      ...makeLine(cx - rx * 0.8, cy + ry, cx + rx * 0.9, cy + ry, 20)
    ]];
    case '3': return [[
      ...makeArc(cx, cy - ry * 0.4, rx * 0.85, ry * 0.5, Math.PI * 1.1, 0, 20),
      ...makeArc(cx, cy + ry * 0.4, rx * 0.95, ry * 0.55, -Math.PI * 0.2, Math.PI * 0.9, 20)
    ]];
    case '4': return [
      [...makeLine(cx + rx * 0.5, cy - ry, cx - rx * 0.8, cy + ry * 0.3, 20),
       ...makeLine(cx - rx * 0.8, cy + ry * 0.3, cx + rx * 0.9, cy + ry * 0.3, 20)],
      makeLine(cx + rx * 0.5, cy - ry * 0.4, cx + rx * 0.5, cy + ry, 20)
    ];
    case '5': return [
      makeLine(cx + rx * 0.8, cy - ry, cx - rx * 0.7, cy - ry, 15),
      [...makeLine(cx - rx * 0.6, cy - ry, cx - rx * 0.7, cy - ry * 0.1, 15),
       ...makeArc(cx, cy + ry * 0.35, rx * 0.9, ry * 0.6, -Math.PI * 0.4, Math.PI * 0.8, 25)]
    ];
    case '6': return [[
      ...makeLine(cx + rx * 0.5, cy - ry, cx - rx * 0.6, cy + ry * 0.2, 20),
      ...makeArc(cx, cy + ry * 0.4, rx * 0.85, ry * 0.55, 0, Math.PI * 2, 30)
    ]];
    case '7': return [[
      ...makeLine(cx - rx * 0.8, cy - ry, cx + rx * 0.8, cy - ry, 15),
      ...makeLine(cx + rx * 0.8, cy - ry, cx - rx * 0.2, cy + ry, 25)
    ]];
    case '8': {
      const s = [];
      for (let i = 0; i <= 50; i++) {
        const t = (i / 50) * Math.PI * 2;
        s.push({ x: cx + rx * 0.8 * Math.sin(t), y: cy + ry * Math.sin(t) * Math.cos(t) * 1.8 });
      }
      return [s];
    }
    case '9': return [[
      ...makeArc(cx, cy - ry * 0.35, rx * 0.85, ry * 0.55, 0, Math.PI * 2, 25),
      ...makeLine(cx + rx * 0.85, cy - ry * 0.35, cx + rx * 0.4, cy + ry, 25)
    ]];
    case ':': return [
      makeArc(cx, cy - ry * 0.4, 6, 6, 0, Math.PI * 2, 12),
      makeArc(cx, cy + ry * 0.4, 6, 6, 0, Math.PI * 2, 12)
    ];
  }
}

const timesToTest = [
  '08:00', '08:30', '09:00', '09:15', '09:45',
  '12:00', '12:30', '13:00', '14:30', '15:20',
  '17:30', '18:00', '18:26', '18:30', '19:00',
  '20:15', '21:30', '22:00', '23:59'
];
for (const t of timesToTest) {
  let curX = 30;
  const strokes = [];
  for (const ch of t) {
    const sList = makeDigitStroke(ch, curX, 60, 75);
    for (const s of sList) strokes.push(s);
    curX += (ch === ':' ? 25 : 45);
  }
  const res = hw.recognizeStrokes(strokes, { step: t.startsWith('0') || t.startsWith('12') ? 'in' : 'out' });
  if (res.primaryTime !== t) {
    throw new Error(`用例 18 失败：预期 ${t}，实际 ${res.primaryTime}`);
  }
}
console.log('用例 18 (19 项常见工时时间全集): 全部验证通过');

console.log('\n3. 检查代码是否包含 emoji...');
const fullSrc = fs.readFileSync('handwriting.js', 'utf8');
const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
if (emojiRegex.test(fullSrc)) {
  throw new Error('严重错误：handwriting.js 中检测到 emoji 字符！');
}
console.log('handwriting.js 100% 无 emoji 字符，检查通过！');

console.log('\n--- 全部 18 项核心回归用例（含 19 组时间全集）100% 验证通过 ---');
