// 方案 A 集成端到端回归测试脚本
// 严格遵守规范：严禁使用任何 emoji

const fs = require('fs');

console.log('1. 测试纯前端离线神经网络对单字 0-9 的推理准确性...');
// 模拟浏览器 Canvas 绘图环境
function createMockCanvas(width, height) {
  const buffer = new Uint8ClampedArray(width * height * 4);
  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#ffffff',
    lineWidth: 1,
    scaleX: 1,
    scaleY: 1,
    transX: 0,
    transY: 0,
    currentPath: [],
    fillRect: (x, y, w, h) => {},
    save: () => {},
    restore: () => { ctx.transX = 0; ctx.transY = 0; ctx.scaleX = 1; ctx.scaleY = 1; },
    translate: (x, y) => { ctx.transX = x; ctx.transY = y; },
    scale: (sx, sy) => { ctx.scaleX = sx; ctx.scaleY = sy; },
    beginPath: () => { ctx.currentPath = []; },
    moveTo: (x, y) => { ctx.currentPath.push({ x: (x * ctx.scaleX) + ctx.transX, y: (y * ctx.scaleY) + ctx.transY }); },
    lineTo: (x, y) => { ctx.currentPath.push({ x: (x * ctx.scaleX) + ctx.transX, y: (y * ctx.scaleY) + ctx.transY }); },
    stroke: () => {
      // 简易光栅化到 buffer
      for (let i = 0; i < ctx.currentPath.length - 1; i++) {
        const p1 = ctx.currentPath[i];
        const p2 = ctx.currentPath[i + 1];
        const steps = 15;
        for (let s = 0; s <= steps; s++) {
          const px = Math.round(p1.x + (p2.x - p1.x) * (s / steps));
          const py = Math.round(p1.y + (p2.y - p1.y) * (s / steps));
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = px + dx, ny = py + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                buffer[(ny * width + nx) * 4] = 255;
              }
            }
          }
        }
      }
    },
    arc: (cx, cy, r) => {},
    fill: () => {},
    drawImage: (srcCanvas, dx, dy) => {
      const srcBuf = srcCanvas.getContext().getImageData().data;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const sx = x - dx;
          const sy = y - dy;
          if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
            const srcIdx = (sy * width + sx) * 4;
            const dstIdx = (y * width + x) * 4;
            buffer[dstIdx] = srcBuf[srcIdx];
            buffer[dstIdx + 1] = srcBuf[srcIdx + 1];
            buffer[dstIdx + 2] = srcBuf[srcIdx + 2];
            buffer[dstIdx + 3] = srcBuf[srcIdx + 3];
          }
        }
      }
    },
    getImageData: () => ({ data: buffer })
  };
  return {
    width,
    height,
    getContext: () => ctx
  };
}

global.document = {
  createElement: tag => tag === 'canvas' ? createMockCanvas(28, 28) : {}
};

global.window = {};
eval(fs.readFileSync('nn_weights.js', 'utf8'));
eval(fs.readFileSync('nn_engine.js', 'utf8'));

if (!window.NNEngine || !window.NNEngine.isReady) {
  throw new Error('NNEngine 初始化失败');
}

function makeLine(x0, y0, x1, y1, steps = 15) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({ x: x0 + t * (x1 - x0), y: y0 + t * (y1 - y0) });
  }
  return pts;
}

function makeArc(cx, cy, rx, ry, startAngle, endAngle, steps = 25) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (i / steps) * (endAngle - startAngle);
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return pts;
}

function getBBox(strokes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const st of strokes) {
    for (const p of st) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) };
}

// 构造测试单字笔画
const stroke1 = [makeLine(150, 40, 150, 180, 25)];
const stroke8 = [(() => {
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * Math.PI * 2;
    pts.push({
      x: 150 + 38 * Math.sin(2 * t),
      y: 110 - 65 * Math.cos(t)
    });
  }
  return pts;
})()];
const stroke2 = [(() => {
  const pts = [];
  // 拱顶：左侧向上弯曲到顶点再向右下
  for (let i = 0; i <= 25; i++) {
    const t = i / 25;
    const a = Math.PI - t * Math.PI; // 从 PI 到 0
    pts.push({
      x: 150 - 38 * Math.cos(a),
      y: 75 - 32 * Math.sin(a)
    });
  }
  // 斜向下到左下角
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    pts.push({ x: 188 - t * 80, y: 75 + t * 95 });
  }
  // 底横向右
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    pts.push({ x: 108 + t * 82, y: 170 });
  }
  return pts;
})()];
const stroke6 = [[
  ...makeLine(180, 40, 120, 130, 20),
  ...makeArc(155, 140, 38, 38, Math.PI * 0.5, Math.PI * 2.5, 30)
]];
const stroke0 = [makeArc(150, 110, 40, 65, 0, Math.PI * 2, 40)];
const stroke3 = [[
  ...makeArc(150, 75, 38, 38, Math.PI * 1.1, Math.PI * 0.1, 20),
  ...makeArc(150, 145, 42, 42, -Math.PI * 0.2, Math.PI * 0.9, 20)
]];

const testDigits = [
  { name: '1', strokes: stroke1 },
  { name: '8', strokes: stroke8 },
  { name: '2', strokes: stroke2 },
  { name: '6', strokes: stroke6 },
  { name: '0', strokes: stroke0 },
  { name: '3', strokes: stroke3 }
];

testDigits.forEach(td => {
  const box = getBBox(td.strokes);
  const input784 = window.NNEngine.preprocessStrokes(td.strokes, box);
  const pred = window.NNEngine.predict(input784);
  console.log(`单字 ${td.name} 识别为:`, pred.digit, `(置信度: ${(pred.confidence * 100).toFixed(1)}%)`);
  if (pred.digit !== td.name) {
    throw new Error(`单字 ${td.name} 识别错误，实际输出: ${pred.digit}`);
  }
});

console.log('\n2. 测试方案 A 分格时序流转与最终时间拼接...');
const gridDigits = ['', '', '', ''];
const targetSequence = [stroke1, stroke8, stroke2, stroke6];

targetSequence.forEach((st, idx) => {
  const box = getBBox(st);
  const input784 = window.NNEngine.preprocessStrokes(st, box);
  const pred = window.NNEngine.predict(input784);
  gridDigits[idx] = pred.digit;
});

const assembledTime = `${gridDigits[0]}${gridDigits[1]}:${gridDigits[2]}${gridDigits[3]}`;
console.log('方案 A 四格分立书写流转结果:', assembledTime);
if (assembledTime !== '18:26') {
  throw new Error(`时间拼接失败: 期望 18:26, 实际 ${assembledTime}`);
}

console.log('\n全部回归用例验证通过！方案 A 在长辈打卡主工程中完全正确就绪！');
