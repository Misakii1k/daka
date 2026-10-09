// 纯本地离线手写数字与时间识别引擎（2D 空间几何连通域、垂直投影缝隙切割、28x28 MNIST 规范化与全正交原型分析）
// 严禁使用任何 emoji
(() => {
  'use strict';

  // ---------- 1. 2D 笔画几何工具与 MNIST 规范化 ----------

  function strokesBBox(strokes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let count = 0;
    for (const s of strokes) {
      if (!s) continue;
      for (const p of s) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        count++;
      }
    }
    if (count === 0 || !isFinite(minX)) {
      return { minX: 0, minY: 0, maxX: 1, maxY: 1, w: 1, h: 1, cx: 0.5, cy: 0.5 };
    }
    return {
      minX, minY, maxX, maxY,
      w: Math.max(maxX - minX, 1),
      h: Math.max(maxY - minY, 1),
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2
    };
  }

  function rasterizeStrokesToGrid(strokes, brushR = 2.5) {
    const box = strokesBBox(strokes);
    const pad = 10;
    const originX = Math.round(box.minX) - pad;
    const originY = Math.round(box.minY) - pad;
    const W = Math.round(box.w) + pad * 2;
    const H = Math.round(box.h) + pad * 2;
    const grid = new Uint8Array(W * H);
    const rInt = Math.floor(brushR);

    const drawPoint = (gx, gy) => {
      for (let dy = -rInt; dy <= rInt; dy++) {
        for (let dx = -rInt; dx <= rInt; dx++) {
          if (dx * dx + dy * dy <= brushR * brushR) {
            const px = gx + dx;
            const py = gy + dy;
            if (px >= 0 && px < W && py >= 0 && py < H) {
              grid[py * W + px] = 1;
            }
          }
        }
      }
    };

    for (const stroke of strokes) {
      if (!stroke || stroke.length === 0) continue;
      if (stroke.length === 1) {
        drawPoint(Math.round(stroke[0].x - originX), Math.round(stroke[0].y - originY));
        continue;
      }
      for (let i = 1; i < stroke.length; i++) {
        const p0 = stroke[i - 1];
        const p1 = stroke[i];
        const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        const steps = Math.max(1, Math.ceil(dist / 1.5));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const x = Math.round(p0.x + t * (p1.x - p0.x) - originX);
          const y = Math.round(p0.y + t * (p1.y - p0.y) - originY);
          drawPoint(x, y);
        }
      }
    }

    return { grid, W, H, originX, originY, box };
  }

  function labelConnectedComponents(grid, W, H) {
    const visited = new Uint8Array(W * H);
    const comps = [];
    const q = new Int32Array(W * H);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (grid[idx] === 0 || visited[idx] === 1) continue;

        let qHead = 0, qTail = 0;
        q[qTail++] = idx;
        visited[idx] = 1;

        let minX = x, maxX = x, minY = y, maxY = y;
        const pixels = [];

        while (qHead < qTail) {
          const cur = q[qHead++];
          const cx = cur % W;
          const cy = Math.floor(cur / W);
          pixels.push({ x: cx, y: cy });

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          for (let dy = -1; dy <= 1; dy++) {
            const ny = cy + dy;
            if (ny < 0 || ny >= H) continue;
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              if (nx < 0 || nx >= W) continue;
              const nidx = ny * W + nx;
              if (grid[nidx] === 1 && visited[nidx] === 0) {
                visited[nidx] = 1;
                q[qTail++] = nidx;
              }
            }
          }
        }

        if (pixels.length < 8) continue;

        let sumX = 0, sumY = 0;
        for (const p of pixels) { sumX += p.x; sumY += p.y; }

        comps.push({
          pixels,
          box: {
            minX, maxX, minY, maxY,
            w: Math.max(maxX - minX + 1, 1),
            h: Math.max(maxY - minY + 1, 1),
            cx: sumX / pixels.length,
            cy: sumY / pixels.length
          },
          area: pixels.length
        });
      }
    }

    return comps;
  }

  // 28x28 MNIST 尺度与重心对齐规范化
  function rasterizeToMNIST(strokes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let sumX = 0, sumY = 0, count = 0;
    for (const s of strokes) {
      if (!s) continue;
      for (const p of s) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        sumX += p.x; sumY += p.y; count++;
      }
    }
    if (count === 0) return new Float32Array(784);
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const comX = sumX / count;
    const comY = sumY / count;
    const scale = 20 / Math.max(w, h);

    const grid = new Float32Array(784);
    const drawSegment = (x0, y0, x1, y1, r = 1.6) => {
      const dist = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.ceil(dist * 2));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = x0 + t * (x1 - x0);
        const py = y0 + t * (y1 - y0);
        const minGx = Math.max(0, Math.floor(px - r));
        const maxGx = Math.min(27, Math.ceil(px + r));
        const minGy = Math.max(0, Math.floor(py - r));
        const maxGy = Math.min(27, Math.ceil(py + r));
        for (let gy = minGy; gy <= maxGy; gy++) {
          for (let gx = minGx; gx <= maxGx; gx++) {
            const d2 = (gx - px) * (gx - px) + (gy - py) * (gy - py);
            if (d2 <= r * r) {
              const v = 1 - Math.sqrt(d2) / r;
              const idx = gy * 28 + gx;
              if (v > grid[idx]) grid[idx] = v;
            }
          }
        }
      }
    };

    for (const s of strokes) {
      if (!s || s.length === 0) continue;
      if (s.length === 1) {
        const px = 14 + (s[0].x - comX) * scale;
        const py = 14 + (s[0].y - comY) * scale;
        drawSegment(px, py, px, py, 1.6);
        continue;
      }
      for (let i = 1; i < s.length; i++) {
        const x0 = 14 + (s[i - 1].x - comX) * scale;
        const y0 = 14 + (s[i - 1].y - comY) * scale;
        const x1 = 14 + (s[i].x - comX) * scale;
        const y1 = 14 + (s[i].y - comY) * scale;
        drawSegment(x0, y0, x1, y1, 1.6);
      }
    }

    return grid;
  }

  function normalizeToMNIST(pixels, box) {
    if (!pixels || pixels.length === 0) return new Float32Array(784);
    const norm = new Float32Array(784);
    const scale = 20 / Math.max(box.w, box.h);

    let sumX = 0, sumY = 0;
    for (const p of pixels) {
      sumX += p.x;
      sumY += p.y;
    }
    const comX = sumX / pixels.length;
    const comY = sumY / pixels.length;

    for (const p of pixels) {
      const tx = 13.5 + (p.x - comX) * scale;
      const ty = 13.5 + (p.y - comY) * scale;

      const x0 = Math.floor(tx);
      const x1 = x0 + 1;
      const y0 = Math.floor(ty);
      const y1 = y0 + 1;
      const fx = tx - x0;
      const fy = ty - y0;

      if (x0 >= 0 && x0 < 28 && y0 >= 0 && y0 < 28) norm[y0 * 28 + x0] += (1 - fx) * (1 - fy);
      if (x1 >= 0 && x1 < 28 && y0 >= 0 && y0 < 28) norm[y0 * 28 + x1] += fx * (1 - fy);
      if (x0 >= 0 && x0 < 28 && y1 >= 0 && y1 < 28) norm[y1 * 28 + x0] += (1 - fx) * fy;
      if (x1 >= 0 && x1 < 28 && y1 >= 0 && y1 < 28) norm[y1 * 28 + x1] += fx * fy;
    }

    for (let i = 0; i < 784; i++) {
      if (norm[i] > 1) norm[i] = 1;
    }

    return norm;
  }

  // 3x3 高斯滤波平滑，消除 1~2 像素抖动差异
  function blur28(g) {
    const out = new Float32Array(784);
    const kernel = [
      [0.05, 0.10, 0.05],
      [0.10, 0.40, 0.10],
      [0.05, 0.10, 0.05]
    ];
    for (let y = 0; y < 28; y++) {
      for (let x = 0; x < 28; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < 28 && ny >= 0 && ny < 28) {
              sum += g[ny * 28 + nx] * kernel[dy + 1][dx + 1];
            }
          }
        }
        out[y * 28 + x] = sum;
      }
    }
    return out;
  }

  function cosineSim(g1, g2) {
    let dot = 0, n1 = 0, n2 = 0;
    for (let i = 0; i < 784; i++) {
      const v1 = g1[i], v2 = g2[i];
      dot += v1 * v2;
      n1 += v1 * v1;
      n2 += v2 * v2;
    }
    if (n1 === 0 || n2 === 0) return 0;
    return dot / (Math.sqrt(n1) * Math.sqrt(n2));
  }

  // 拓扑环洞检测与位置分析（快速边界泛洪填充）
  function analyzeHoles(grid28) {
    const bin = new Uint8Array(28 * 28);
    for (let i = 0; i < 784; i++) {
      if (grid28[i] > 0.35) bin[i] = 1;
    }
    const visited = new Uint8Array(28 * 28);
    const q = new Int32Array(28 * 28);
    let qh = 0, qt = 0;
    for (let x = 0; x < 28; x++) {
      if (bin[0 * 28 + x] === 0) { visited[0 * 28 + x] = 1; q[qt++] = 0 * 28 + x; }
      if (bin[27 * 28 + x] === 0) { visited[27 * 28 + x] = 1; q[qt++] = 27 * 28 + x; }
    }
    for (let y = 0; y < 28; y++) {
      if (bin[y * 28 + 0] === 0 && !visited[y * 28 + 0]) { visited[y * 28 + 0] = 1; q[qt++] = y * 28 + 0; }
      if (bin[y * 28 + 27] === 0 && !visited[y * 28 + 27]) { visited[y * 28 + 27] = 1; q[qt++] = y * 28 + 27; }
    }
    while (qh < qt) {
      const cur = q[qh++];
      const cx = cur % 28, cy = Math.floor(cur / 28);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < 28 && ny >= 0 && ny < 28) {
          const nidx = ny * 28 + nx;
          if (bin[nidx] === 0 && !visited[nidx]) {
            visited[nidx] = 1;
            q[qt++] = nidx;
          }
        }
      }
    }

    const holes = [];
    const holeVisited = new Uint8Array(28 * 28);
    for (let y = 1; y < 27; y++) {
      for (let x = 1; x < 27; x++) {
        const idx = y * 28 + x;
        if (bin[idx] === 0 && !visited[idx] && !holeVisited[idx]) {
          const hq = [idx];
          holeVisited[idx] = 1;
          let sumX = 0, sumY = 0, count = 0;
          let hqh = 0;
          while (hqh < hq.length) {
            const hcur = hq[hqh++];
            const hx = hcur % 28, hy = Math.floor(hcur / 28);
            sumX += hx; sumY += hy; count++;
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
              const nx = hx + dx, ny = hy + dy;
              if (nx >= 1 && nx < 27 && ny >= 1 && ny < 27) {
                const nidx = ny * 28 + nx;
                if (bin[nidx] === 0 && !visited[nidx] && !holeVisited[nidx]) {
                  holeVisited[nidx] = 1;
                  hq.push(nidx);
                }
              }
            }
          }
          if (count >= 4) {
            holes.push({ count, cx: sumX / count, cy: sumY / count });
          }
        }
      }
    }
    return holes;
  }

  // ---------- 2. 全正交离线数字原型系统（0-9 全形态覆盖） ----------

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

  const PROTOTYPES_DEF = [
    // 0
    { char: '0', strokes: [makeArc(50, 50, 24, 42, 0, Math.PI * 2, 40)] },
    { char: '0', strokes: [makeArc(50, 50, 32, 38, 0, Math.PI * 2, 40)] },
    // 1
    { char: '1', strokes: [makeLine(50, 10, 50, 90, 25)] },
    { char: '1', strokes: [makeLine(45, 10, 55, 90, 25)] },
    { char: '1', strokes: [[...makeLine(40, 25, 50, 10, 10), ...makeLine(50, 10, 50, 90, 25)]] },
    // 2
    { char: '2', strokes: [[...makeArc(50, 30, 24, 20, Math.PI, 0, 20), ...makeLine(74, 30, 26, 90, 25), ...makeLine(26, 90, 76, 90, 20)]] },
    { char: '2', strokes: [[...makeArc(50, 30, 24, 20, Math.PI, 0, 20), ...makeLine(74, 30, 30, 85, 25), ...makeArc(35, 88, 6, 6, 0, Math.PI * 2, 10), ...makeLine(35, 90, 76, 90, 20)]] },
    { char: '2', strokes: [[...makeLine(26, 18, 74, 18, 15), ...makeLine(74, 18, 26, 90, 20), ...makeLine(26, 90, 76, 90, 15)]] },
    // 3
    { char: '3', strokes: [[...makeArc(50, 32, 22, 18, Math.PI * 1.1, 0, 20), ...makeArc(50, 68, 24, 22, -Math.PI * 0.2, Math.PI * 0.9, 20)]] },
    { char: '3', strokes: [[...makeLine(30, 15, 72, 15, 15), ...makeLine(72, 15, 48, 48, 15), ...makeArc(52, 70, 24, 22, -Math.PI * 0.3, Math.PI * 0.9, 20)]] },
    // 4
    { char: '4', strokes: [[...makeLine(65, 10, 28, 62, 20), ...makeLine(28, 62, 78, 62, 20)], makeLine(65, 30, 65, 90, 20)] },
    { char: '4', strokes: [[...makeLine(65, 10, 30, 62, 20), ...makeLine(30, 62, 72, 62, 20), ...makeLine(72, 10, 72, 90, 25)]] },
    // 5
    { char: '5', strokes: [makeLine(72, 15, 32, 15, 15), [...makeLine(35, 15, 32, 45, 15), ...makeArc(52, 68, 24, 23, -Math.PI * 0.4, Math.PI * 0.85, 25)]] },
    { char: '5', strokes: [[...makeLine(35, 18, 32, 45, 15), ...makeArc(52, 68, 24, 23, -Math.PI * 0.4, Math.PI * 0.85, 25)]] },
    // 6
    { char: '6', strokes: [[...makeLine(62, 12, 32, 58, 20), ...makeArc(52, 68, 22, 24, 0, Math.PI * 2, 30)]] },
    { char: '6', strokes: [[...makeArc(65, 30, 32, 35, Math.PI * 0.8, Math.PI * 1.5, 20), ...makeArc(52, 68, 22, 24, 0, Math.PI * 2, 30)]] },
    // 7
    { char: '7', strokes: [[...makeLine(28, 15, 74, 15, 15), ...makeLine(74, 15, 44, 90, 25)]] },
    { char: '7', strokes: [[...makeLine(28, 15, 74, 15, 15), ...makeLine(74, 15, 38, 90, 25)]] },
    // 8
    { char: '8', strokes: [(() => {
      const s = [];
      for (let i = 0; i <= 50; i++) {
        const t = (i / 50) * Math.PI * 2;
        s.push({ x: 50 + 22 * Math.sin(t), y: 50 + 40 * Math.sin(t) * Math.cos(t) * 1.8 });
      }
      return s;
    })()] },
    { char: '8', strokes: [(() => {
      const s = [];
      for (let i = 0; i <= 50; i++) {
        const t = (i / 50) * Math.PI * 2;
        s.push({ x: 50 + 32 * Math.sin(t), y: 50 + 40 * Math.sin(t) * Math.cos(t) * 1.8 });
      }
      return s;
    })()] },
    // 9
    { char: '9', strokes: [[...makeArc(50, 32, 22, 22, 0, Math.PI * 2, 25), ...makeLine(72, 32, 70, 90, 25)]] },
    { char: '9', strokes: [[...makeArc(50, 32, 22, 22, 0, Math.PI * 2, 25), ...makeArc(58, 65, 20, 30, 0, Math.PI * 0.6, 25)]] }
  ];

  let COMPILED_PROTOS = null;
  function initPrototypes() {
    if (COMPILED_PROTOS) return;
    COMPILED_PROTOS = PROTOTYPES_DEF.map(p => ({
      char: p.char,
      grid: blur28(rasterizeToMNIST(p.strokes))
    }));
  }
  initPrototypes();

  // 单字符分类决策函数
  function classifySingleCharacter(target) {
    if (!target) return { char: '0', score: 0.1 };
    if (target.kind === 'colon' || target.type === 'colon') return { char: ':', score: 0.99 };
    if (target.kind === 'dot' || target.type === 'dot') return { char: '.', score: 0.95 };

    const strokes = Array.isArray(target) ? target : (target.strokes || (target.pixels ? [target.pixels] : null));
    if (!strokes || strokes.length === 0) return { char: '0', score: 0.1 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of strokes) {
      if (!s) continue;
      for (const p of s) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    const w = maxX - minX;
    const h = maxY - minY;
    const aspect = w / Math.max(h, 1);

    const rawG = target.pixels && !target.strokes ? normalizeToMNIST(target.pixels, target.box) : rasterizeToMNIST(strokes);
    const blurG = blur28(rawG);
    const holes = analyzeHoles(rawG);

    const scores = {};
    for (const p of COMPILED_PROTOS) {
      const sim = cosineSim(blurG, p.grid);
      if (!scores[p.char] || sim > scores[p.char]) scores[p.char] = sim;
    }

    // 几何强约束与拓扑环洞特征加权
    if (aspect < 0.35) {
      scores['1'] = (scores['1'] || 0) + 0.35;
    } else {
      scores['1'] = (scores['1'] || 0) - 0.50;
    }

    if (holes.length === 1) {
      if (holes[0].cy >= 15) {
        scores['6'] = (scores['6'] || 0) + 0.18;
      } else if (holes[0].cy <= 13) {
        scores['9'] = (scores['9'] || 0) + 0.18;
      } else {
        scores['0'] = (scores['0'] || 0) + 0.18;
      }
    } else if (holes.length >= 2) {
      scores['8'] = (scores['8'] || 0) + 0.22;
    }

    let bestChar = '0', bestScore = -Infinity;
    for (const [c, s] of Object.entries(scores)) {
      if (s > bestScore) {
        bestScore = s;
        bestChar = c;
      }
    }
    return { char: bestChar, score: bestScore };
  }

  // ---------- 3. 字符切分与连通域/投影缝隙切割系统 ----------

  function extractColonAndDots(compsOrStrokes, lineH, totalW) {
    // 兼容连通域对象 comps 或原生 strokes 数组
    const dots = [];
    const normalItems = [];

    const isStrokeList = Array.isArray(compsOrStrokes) && compsOrStrokes[0] && Array.isArray(compsOrStrokes[0]);

    if (isStrokeList) {
      for (const s of compsOrStrokes) {
        let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
        for (const p of s) {
          if (p.x < sMinX) sMinX = p.x;
          if (p.x > sMaxX) sMaxX = p.x;
          if (p.y < sMinY) sMinY = p.y;
          if (p.y > sMaxY) sMaxY = p.y;
        }
        const sw = sMaxX - sMinX;
        const sh = sMaxY - sMinY;
        const item = {
          stroke: s,
          box: { minX: sMinX, maxX: sMaxX, minY: sMinY, maxY: sMaxY, w: sw, h: sh, cx: (sMinX + sMaxX) / 2, cy: (sMinY + sMaxY) / 2 }
        };
        if (sw <= Math.max(30, lineH * 0.38) && sh <= Math.max(30, lineH * 0.38)) {
          dots.push(item);
        } else {
          normalItems.push(item);
        }
      }
    } else {
      for (const c of compsOrStrokes) {
        const isSmall = (c.box.w <= Math.max(30, lineH * 0.38) && c.box.h <= Math.max(30, lineH * 0.38) && c.area <= lineH * lineH * 0.25);
        if (isSmall) dots.push(c);
        else normalItems.push(c);
      }
    }

    const colonGroups = [];
    const usedDotIdx = new Set();

    for (let i = 0; i < dots.length; i++) {
      if (usedDotIdx.has(i)) continue;
      for (let j = i + 1; j < dots.length; j++) {
        if (usedDotIdx.has(j)) continue;
        const d1 = dots[i];
        const d2 = dots[j];
        const topD = d1.box.cy < d2.box.cy ? d1 : d2;
        const botD = d1.box.cy < d2.box.cy ? d2 : d1;
        const dx = Math.abs(topD.box.cx - botD.box.cx);
        const dy = botD.box.cy - topD.box.cy;

        if (dx <= Math.max(30, lineH * 0.38) && dy >= lineH * 0.15 && dy <= lineH * 0.85) {
          usedDotIdx.add(i);
          usedDotIdx.add(j);
          colonGroups.push({
            kind: 'colon',
            type: 'colon',
            char: ':',
            cx: (topD.box.cx + botD.box.cx) / 2,
            cy: (topD.box.cy + botD.box.cy) / 2,
            box: {
              minX: Math.min(topD.box.minX, botD.box.minX),
              maxX: Math.max(topD.box.maxX, botD.box.maxX),
              minY: topD.box.minY,
              maxY: botD.box.maxY,
              w: Math.max(topD.box.maxX, botD.box.maxX) - Math.min(topD.box.minX, botD.box.minX) + 1,
              h: botD.box.maxY - topD.box.minY + 1,
              cx: (topD.box.cx + botD.box.cx) / 2,
              cy: (topD.box.cy + botD.box.cy) / 2
            },
            strokes: topD.stroke && botD.stroke ? [topD.stroke, botD.stroke] : null,
            pixels: topD.pixels && botD.pixels ? [...topD.pixels, ...botD.pixels] : []
          });
          break;
        }
      }
    }

    // 剩余未配对的点若处于中后段下半部可作为小数点
    for (let i = 0; i < dots.length; i++) {
      if (usedDotIdx.has(i)) continue;
      const d = dots[i];
      if (d.box.cy > lineH * 0.45) {
        colonGroups.push({
          kind: 'dot',
          type: 'dot',
          char: '.',
          cx: d.box.cx,
          cy: d.box.cy,
          box: d.box,
          strokes: d.stroke ? [d.stroke] : null,
          pixels: d.pixels || []
        });
      }
    }

    return { colonGroups, remainingComps: normalItems };
  }

  function splitTouchingComponents(comps, lineH) {
    const result = [];
    for (const comp of comps) {
      const subList = recursiveSplitComponent(comp, lineH);
      for (const s of subList) result.push(s);
    }
    return result;
  }

  function recursiveSplitComponent(comp, lineH) {
    const aspect = comp.box.w / Math.max(comp.box.h, 1);
    // 宽幅阈值：只有宽度明显超出单字（aspect >= 0.88 且绝对宽度足够）时才进入细致谷底检测
    if (aspect < 0.88 || comp.box.w < lineH * 0.65) {
      return [comp];
    }

    const { minX, maxX, minY, maxY, w, h } = comp.box;
    const pixSet = new Set();
    const colYMin = new Int32Array(w).fill(Infinity);
    const colYMax = new Int32Array(w).fill(-Infinity);
    const V = new Int32Array(w);

    for (const p of comp.pixels) {
      pixSet.add(p.x + ',' + p.y);
      const col = p.x - minX;
      if (col >= 0 && col < w) {
        V[col]++;
        if (p.y < colYMin[col]) colYMin[col] = p.y;
        if (p.y > colYMax[col]) colYMax[col] = p.y;
      }
    }

    const startCol = Math.floor(w * 0.32);
    const endCol = Math.ceil(w * 0.68);
    let minVal = Infinity;
    let bestCol = -1;

    for (let col = startCol; col <= endCol; col++) {
      const span = colYMax[col] - colYMin[col];
      const yRel = (colYMin[col] + colYMax[col]) / 2 - minY;
      const isBoundaryBridge = (yRel <= h * 0.28 || yRel >= h * 0.72);
      // 粘连切分核心特征：粘连处通常为上下边界的单根细线连带（顶部或底部桥接）
      // 若处于中心十字交点（如 8 的蜂腰交叉点），严禁切断
      if (span < h * 0.38 && isBoundaryBridge) {
        const smooth = ((V[col - 1] || V[col]) + V[col] + (V[col + 1] || V[col])) / 3;
        const cost = smooth + span * 0.3;
        if (cost < minVal) {
          minVal = cost;
          bestCol = col;
        }
      }
    }

    if (bestCol < 0) return [comp];
    const valleyX = minX + bestCol;

    const leftPixels = [];
    const rightPixels = [];
    for (const p of comp.pixels) {
      if (p.x < valleyX) leftPixels.push(p);
      else rightPixels.push(p);
    }

    if (leftPixels.length < 10 || rightPixels.length < 10) return [comp];

    const makeSub = pxs => {
      let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;
      let sSumX = 0, sSumY = 0;
      for (const p of pxs) {
        if (p.x < sMinX) sMinX = p.x;
        if (p.x > sMaxX) sMaxX = p.x;
        if (p.y < sMinY) sMinY = p.y;
        if (p.y > sMaxY) sMaxY = p.y;
        sSumX += p.x; sSumY += p.y;
      }
      return {
        pixels: pxs,
        box: {
          minX: sMinX, maxX: sMaxX, minY: sMinY, maxY: sMaxY,
          w: Math.max(sMaxX - sMinX + 1, 1),
          h: Math.max(sMaxY - sMinY + 1, 1),
          cx: sSumX / pxs.length,
          cy: sSumY / pxs.length
        },
        area: pxs.length
      };
    };

    const leftSub = makeSub(leftPixels);
    const rightSub = makeSub(rightPixels);
    return [...recursiveSplitComponent(leftSub, lineH), ...recursiveSplitComponent(rightSub, lineH)];
  }

  function mergeMultiStrokeParts(comps, lineH) {
    if (comps.length <= 1) return comps;
    comps.sort((a, b) => a.box.cx - b.box.cx);

    const merged = [];
    const used = new Set();

    for (let i = 0; i < comps.length; i++) {
      if (used.has(i)) continue;
      let base = comps[i];
      used.add(i);

      for (let j = i + 1; j < comps.length; j++) {
        if (used.has(j)) continue;
        const target = comps[j];
        const overlapX = Math.min(base.box.maxX, target.box.maxX) - Math.max(base.box.minX, target.box.minX);
        const minW = Math.min(base.box.w, target.box.w);
        const overlapRatio = minW > 0 ? overlapX / minW : 0;
        const centerDist = Math.abs(base.box.cx - target.box.cx);

        const bothTall = (base.box.h >= lineH * 0.55 && target.box.h >= lineH * 0.55);
        let shouldMerge = false;
        if (bothTall) {
          const isVerticalStem = (target.box.w <= Math.max(16, lineH * 0.22));
          const insideX = target.box.cx >= base.box.minX - 3 && target.box.cx <= base.box.maxX + 5;
          if (isVerticalStem && insideX && (Math.max(base.box.maxX, target.box.maxX) - Math.min(base.box.minX, target.box.minX)) < lineH * 0.85) {
            shouldMerge = true;
          } else if (overlapRatio >= 0.65 && centerDist < lineH * 0.20) {
            shouldMerge = true;
          }
        } else {
          if (overlapRatio >= 0.35 || centerDist < lineH * 0.28) {
            shouldMerge = true;
          }
        }

        if (shouldMerge) {
          used.add(j);
          const allPixels = [...base.pixels, ...target.pixels];
          let sMinX = Math.min(base.box.minX, target.box.minX);
          let sMaxX = Math.max(base.box.maxX, target.box.maxX);
          let sMinY = Math.min(base.box.minY, target.box.minY);
          let sMaxY = Math.max(base.box.maxY, target.box.maxY);
          let sumX = 0, sumY = 0;
          for (const p of allPixels) { sumX += p.x; sumY += p.y; }
          base = {
            pixels: allPixels,
            box: {
              minX: sMinX, maxX: sMaxX, minY: sMinY, maxY: sMaxY,
              w: Math.max(sMaxX - sMinX + 1, 1),
              h: Math.max(sMaxY - sMinY + 1, 1),
              cx: sumX / allPixels.length,
              cy: sumY / allPixels.length
            },
            area: allPixels.length
          };
        }
      }
      merged.push(base);
    }

    return merged;
  }

  // ---------- 4. 领域时间语法与时态约束求解器 ----------

  function solveTimeGrammar(chars, context = {}) {
    const rawClean = chars.filter(c => c && c !== ' ').join('');
    if (!rawClean) return { rawText: '', primaryTime: '', candidates: [] };

    const digitsOnly = rawClean.replace(/[^0-9]/g, '');
    const isPM = context.step === 'out';

    const pad = n => String(n).padStart(2, '0');
    const validTimes = new Set();

    const pushTime = (h, m) => {
      const hn = Number(h);
      const mn = Number(m);
      if (hn >= 0 && hn <= 23 && mn >= 0 && mn <= 59) {
        validTimes.add(pad(hn) + ':' + pad(mn));
      }
    };

    if (rawClean.includes(':') || rawClean.includes('.')) {
      const parts = rawClean.split(/[:.]/);
      if (parts.length >= 2) {
        const h = Number(parts[0]);
        const mStr = parts[1].slice(0, 2);
        const m = mStr.length === 1 ? Number(mStr) * 10 : (Number(mStr) || 0);
        pushTime(h, m);
        if (isPM && h >= 1 && h <= 11) pushTime(h + 12, m);
      }
    } else {
      const len = digitsOnly.length;
      if (len === 1) {
        const d = Number(digitsOnly);
        pushTime(d, 0);
        pushTime(d, 30);
        if (isPM && d >= 1 && d <= 11) {
          pushTime(d + 12, 0);
          pushTime(d + 12, 30);
        }
      } else if (len === 2) {
        const d = Number(digitsOnly);
        if (d <= 23) {
          pushTime(d, 0);
          pushTime(d, 30);
          if (isPM && d <= 11) {
            pushTime(d + 12, 0);
            pushTime(d + 12, 30);
          }
        } else {
          const h = Number(digitsOnly[0]);
          const m = Number(digitsOnly[1]) * 10;
          pushTime(h, m);
          if (isPM && h <= 11) pushTime(h + 12, m);
        }
      } else if (len === 3) {
        const h = Number(digitsOnly[0]);
        const m = Number(digitsOnly.slice(1, 3));
        pushTime(h, m);
        if (isPM && h <= 11) pushTime(h + 12, m);
      } else if (len >= 4) {
        const h = Number(digitsOnly.slice(0, 2));
        const m = Number(digitsOnly.slice(2, 4));
        pushTime(h, m);
      }
    }

    let list = Array.from(validTimes);

    if (isPM) {
      list.sort((a, b) => {
        const ha = Number(a.split(':')[0]);
        const hb = Number(b.split(':')[0]);
        if (ha >= 12 && hb < 12) return -1;
        if (ha < 12 && hb >= 12) return 1;
        return a.localeCompare(b);
      });
    } else {
      list.sort((a, b) => {
        const ha = Number(a.split(':')[0]);
        const hb = Number(b.split(':')[0]);
        const inWorkA = (ha >= 6 && ha <= 11);
        const inWorkB = (hb >= 6 && hb <= 11);
        if (inWorkA && !inWorkB) return -1;
        if (!inWorkA && inWorkB) return 1;
        return a.localeCompare(b);
      });
    }

    return {
      rawText: rawClean,
      primaryTime: list[0] || '',
      candidates: list.slice(0, 4)
    };
  }

  // ---------- 5. 完整端到端手写识别流水线 ----------

  function recognizeStrokes(strokes, context = {}) {
    if (!strokes || strokes.length === 0) {
      return { rawText: '', primaryTime: '', candidates: [] };
    }

    const validStrokes = strokes.filter(s => s && s.length > 0);
    if (validStrokes.length === 0) {
      return { rawText: '', primaryTime: '', candidates: [] };
    }

    const globalBox = strokesBBox(validStrokes);
    const lineH = Math.max(globalBox.h, 25);

    // 1. 笔画分类：分离点状笔画与主体笔画
    const strokeInfos = validStrokes.map(s => {
      let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
      let sLen = 0;
      for (let i = 0; i < s.length; i++) {
        const p = s[i];
        if (p.x < sMinX) sMinX = p.x;
        if (p.x > sMaxX) sMaxX = p.x;
        if (p.y < sMinY) sMinY = p.y;
        if (p.y > sMaxY) sMaxY = p.y;
        if (i > 0) sLen += Math.hypot(p.x - s[i - 1].x, p.y - s[i - 1].y);
      }
      const sw = sMaxX - sMinX;
      const sh = sMaxY - sMinY;
      const isDot = (sw <= Math.max(30, lineH * 0.38) && sh <= Math.max(30, lineH * 0.38));
      return {
        stroke: s,
        box: { minX: sMinX, maxX: sMaxX, minY: sMinY, maxY: sMaxY, w: sw, h: sh, cx: (sMinX + sMaxX) / 2, cy: (sMinY + sMaxY) / 2 },
        len: sLen,
        isDot
      };
    });

    const dots = strokeInfos.filter(si => si.isDot);
    const mainStrokes = strokeInfos.filter(si => !si.isDot);

    // 2. 冒号上下双点特征匹配
    const colonItems = [];
    const usedDots = new Set();
    for (let i = 0; i < dots.length; i++) {
      if (usedDots.has(i)) continue;
      for (let j = i + 1; j < dots.length; j++) {
        if (usedDots.has(j)) continue;
        const d1 = dots[i], d2 = dots[j];
        const topD = d1.box.cy < d2.box.cy ? d1 : d2;
        const botD = d1.box.cy < d2.box.cy ? d2 : d1;
        const dx = Math.abs(topD.box.cx - botD.box.cx);
        const dy = botD.box.cy - topD.box.cy;

        if (dx <= Math.max(30, lineH * 0.38) && dy >= lineH * 0.15 && dy <= lineH * 0.85) {
          usedDots.add(i);
          usedDots.add(j);
          colonItems.push({
            type: 'colon',
            kind: 'colon',
            char: ':',
            cx: (topD.box.cx + botD.box.cx) / 2,
            cy: (topD.box.cy + botD.box.cy) / 2
          });
          break;
        }
      }
    }

    // 剩余未配对的点如果处于下半部可作为小数点
    for (let i = 0; i < dots.length; i++) {
      if (usedDots.has(i)) continue;
      const d = dots[i];
      if (d.box.cy > globalBox.minY + lineH * 0.45 && d.len > 4) {
        colonItems.push({
          type: 'dot',
          kind: 'dot',
          char: '.',
          cx: d.box.cx,
          cy: d.box.cy
        });
      }
    }

    // 3. 主体笔画归组与粘连切分
    mainStrokes.sort((a, b) => a.box.cx - b.box.cx);
    const charGroups = [];
    const usedMain = new Set();

    for (let i = 0; i < mainStrokes.length; i++) {
      if (usedMain.has(i)) continue;
      let group = [mainStrokes[i]];
      usedMain.add(i);

      let gMinX = mainStrokes[i].box.minX;
      let gMaxX = mainStrokes[i].box.maxX;
      let gMinY = mainStrokes[i].box.minY;
      let gMaxY = mainStrokes[i].box.maxY;

      for (let j = i + 1; j < mainStrokes.length; j++) {
        if (usedMain.has(j)) continue;
        const target = mainStrokes[j];
        const overlapX = Math.min(gMaxX, target.box.maxX) - Math.max(gMinX, target.box.minX);
        const minW = Math.min(gMaxX - gMinX, target.box.w);
        const overlapRatio = minW > 0 ? overlapX / minW : 0;
        const centerDist = Math.abs((gMinX + gMaxX) / 2 - target.box.cx);

        const baseH = gMaxY - gMinY;
        const bothTall = (baseH >= lineH * 0.55 && target.box.h >= lineH * 0.55);

        let shouldMerge = false;
        if (bothTall) {
          // 数字 4 的竖折与右竖
          const isVerticalStem = (target.box.w <= Math.max(16, lineH * 0.22));
          const insideX = target.box.cx >= gMinX - 3 && target.box.cx <= gMaxX + 5;
          if (isVerticalStem && insideX && (Math.max(gMaxX, target.box.maxX) - Math.min(gMinX, target.box.minX)) < lineH * 0.85) {
            shouldMerge = true;
          } else if (overlapRatio >= 0.65 && centerDist < lineH * 0.20 && (Math.max(gMaxX, target.box.maxX) - Math.min(gMinX, target.box.minX)) < lineH * 0.85) {
            shouldMerge = true;
          }
        } else {
          // 4、5、7 等多笔画
          if (overlapRatio >= 0.35 || centerDist < lineH * 0.28) {
            shouldMerge = true;
          }
        }

        if (shouldMerge) {
          usedMain.add(j);
          group.push(target);
          gMinX = Math.min(gMinX, target.box.minX);
          gMaxX = Math.max(gMaxX, target.box.maxX);
          gMinY = Math.min(gMinY, target.box.minY);
          gMaxY = Math.max(gMaxY, target.box.maxY);
        }
      }

      const strokesInGroup = group.map(g => g.stroke);
      const gw = gMaxX - gMinX;
      const gh = gMaxY - gMinY;
      const gAspect = gw / Math.max(gh, 1);

      // 粘连检测（如 2 与 6 连体书写）：基于垂直投影谷底与纵向跨度检测
      if (gw >= lineH * 0.70 && gAspect >= 0.80) {
        const W = Math.round(gw + 1);
        const H = Math.round(gh + 1);
        const colYMin = new Float32Array(W).fill(Infinity);
        const colYMax = new Float32Array(W).fill(-Infinity);
        const colCount = new Float32Array(W);

        for (const s of strokesInGroup) {
          for (let idx = 1; idx < s.length; idx++) {
            const p0 = s[idx - 1], p1 = s[idx];
            const d = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            const steps = Math.max(1, Math.ceil(d * 2));
            for (let st = 0; st <= steps; st++) {
              const x = Math.round(p0.x + (st / steps) * (p1.x - p0.x) - gMinX);
              const y = p0.y + (st / steps) * (p1.y - p0.y);
              if (x >= 0 && x < W) {
                colCount[x]++;
                if (y < colYMin[x]) colYMin[x] = y;
                if (y > colYMax[x]) colYMax[x] = y;
              }
            }
          }
        }

        let bestCutX = -1, minCost = Infinity;
        for (let x = Math.floor(W * 0.32); x <= Math.ceil(W * 0.68); x++) {
          const c = colCount[x];
          const span = colYMax[x] - colYMin[x];
          const yRel = (colYMin[x] + colYMax[x]) / 2 - gMinY;
          const isBoundaryBridge = (yRel <= H * 0.28 || yRel >= H * 0.72);
          if (c > 0 && span < H * 0.35 && isBoundaryBridge) {
            const cost = c + span * 0.5;
            if (cost < minCost) {
              minCost = cost;
              bestCutX = gMinX + x;
            }
          }
        }

        if (bestCutX > 0) {
          const leftStrokes = [];
          const rightStrokes = [];
          for (const s of strokesInGroup) {
            const leftPts = s.filter(p => p.x <= bestCutX + 3);
            const rightPts = s.filter(p => p.x >= bestCutX - 3);
            if (leftPts.length >= 2) leftStrokes.push(leftPts);
            if (rightPts.length >= 2) rightStrokes.push(rightPts);
          }
          if (leftStrokes.length > 0 && rightStrokes.length > 0) {
            charGroups.push({ type: 'digit', strokes: leftStrokes, cx: (gMinX + bestCutX) / 2 });
            charGroups.push({ type: 'digit', strokes: rightStrokes, cx: (bestCutX + gMaxX) / 2 });
            continue;
          }
        }
      }

      charGroups.push({
        type: 'digit',
        strokes: strokesInGroup,
        cx: (gMinX + gMaxX) / 2
      });
    }

    // 4. 从左至右排序并分类每个字符
    const allElements = [...charGroups, ...colonItems];
    allElements.sort((a, b) => a.cx - b.cx);

    const chars = [];
    for (const el of allElements) {
      if (el.type === 'colon' || el.type === 'dot') {
        chars.push(el.char);
      } else {
        const cls = classifySingleCharacter(el);
        chars.push(cls.char);
      }
    }

    return solveTimeGrammar(chars, context);
  }

  // 单字符极速识别通道（面向适老分格引导，直接进行28x28矩阵规范化与神经网络推理，无需整行投影切分）
  function recognizeSingleDigit(strokes) {
    if (!strokes || strokes.length === 0) {
      return { char: '', score: 0, topScores: [] };
    }
    const box = strokesBBox(strokes);
    if (box.w < 3 && box.h < 3) {
      return { char: '', score: 0, topScores: [] };
    }
    if (typeof window !== 'undefined' && window.NNEngine && window.NNEngine.isReady) {
      const input784 = window.NNEngine.preprocessStrokes(strokes, box);
      const pred = window.NNEngine.predict(input784);
      return { char: String(pred.digit), score: pred.confidence, topScores: pred.probs };
    }
    const target = { type: 'digit', strokes, box };
    return classifySingleCharacter(target);
  }

  // ---------- 6. 交互手写画板（支持可调提笔防抖与 flush 立即冲刷） ----------

  class HandwritingPad {
    constructor(canvas, onStrokeChange, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas && canvas.getContext ? canvas.getContext('2d', { willReadFrequently: true }) : null;
      this.onStrokeChange = onStrokeChange;
      this.onStrokeStart = null;
      this.strokes = []; // [ [{x, y, t}, ...], ... ]
      this.currentStroke = null;
      this.debounceTimer = null;
      this.debounceMs = (options && options.debounceMs) ? options.debounceMs : 180;
      this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

      if (this.canvas && this.canvas.style) {
        this.canvas.style.touchAction = 'none';
      }

      this.initEvents();
      this.resize();
    }

    setDebounceMs(ms) {
      this.debounceMs = Math.max(50, Math.min(1000, Number(ms) || 180));
    }

    resize() {
      if (!this.canvas || !this.ctx) return;
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.floor(rect.width || 340);
      const h = Math.floor(rect.height || 220);
      this.canvas.width = w * this.dpr;
      this.canvas.height = h * this.dpr;
      this.ctx.scale(this.dpr, this.dpr);
      this.redraw();
    }

    scheduleDebouncedChange() {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        if (this.onStrokeChange) this.onStrokeChange(this.strokes);
      }, this.debounceMs);
    }

    flush() {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
        if (this.onStrokeChange) this.onStrokeChange(this.strokes);
      }
    }

    initEvents() {
      const c = this.canvas;
      if (!c || !c.addEventListener) return;

      const getPos = e => {
        const rect = c.getBoundingClientRect();
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          t: (typeof performance !== 'undefined' ? performance.now() : Date.now())
        };
      };

      c.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (c.setPointerCapture) {
          try { c.setPointerCapture(e.pointerId); } catch (_) {}
        }
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
        if (this.onStrokeStart) this.onStrokeStart();

        const p = getPos(e);
        this.currentStroke = [p];
        this.strokes.push(this.currentStroke);
        this.redraw();
      });

      c.addEventListener('pointermove', e => {
        if (!this.currentStroke) return;
        e.preventDefault();
        const p = getPos(e);
        const last = this.currentStroke[this.currentStroke.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
        this.currentStroke.push(p);
        this.drawLastSegment();
      });

      const end = e => {
        if (!this.currentStroke) return;
        this.currentStroke = null;
        this.redraw();
        this.scheduleDebouncedChange();
      };

      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
    }

    clear() {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this.strokes = [];
      this.currentStroke = null;
      this.redraw();
      if (this.onStrokeChange) this.onStrokeChange(this.strokes);
    }

    isEmpty() {
      return this.strokes.length === 0;
    }

    undo() {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      if (this.strokes.length > 0) {
        this.strokes.pop();
        this.redraw();
        this.scheduleDebouncedChange();
      }
    }

    drawGuideLines(w, h) {
      if (!this.ctx) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = '#e6e6e6';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      const midY = h * 0.5;
      const baseLineY = h * 0.8;
      ctx.beginPath();
      ctx.moveTo(12, midY);
      ctx.lineTo(w - 12, midY);
      ctx.stroke();

      ctx.strokeStyle = '#f0f0f0';
      ctx.beginPath();
      ctx.moveTo(12, baseLineY);
      ctx.lineTo(w - 12, baseLineY);
      ctx.stroke();
      ctx.restore();
    }

    redraw() {
      if (!this.canvas || !this.ctx) return;
      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      this.ctx.clearRect(0, 0, w, h);
      this.drawGuideLines(w, h);

      for (const stroke of this.strokes) {
        this.drawStroke(stroke);
      }
    }

    drawStroke(stroke) {
      if (!this.ctx || !stroke || stroke.length === 0) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = '#141414';
      ctx.fillStyle = '#141414';
      ctx.lineWidth = 6.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }

      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);

      for (let i = 1; i < stroke.length - 1; i++) {
        const xc = (stroke[i].x + stroke[i + 1].x) / 2;
        const yc = (stroke[i].y + stroke[i + 1].y) / 2;
        ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, xc, yc);
      }
      ctx.lineTo(stroke[stroke.length - 1].x, stroke[stroke.length - 1].y);
      ctx.stroke();
      ctx.restore();
    }

    drawLastSegment() {
      if (!this.ctx) return;
      const s = this.currentStroke;
      if (!s || s.length < 2) return;
      const p1 = s[s.length - 2];
      const p2 = s[s.length - 1];

      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = '#141414';
      ctx.lineWidth = 6.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- 7. 全局导出与环境适配 ----------

  if (typeof window !== 'undefined') {
    window.HandwritingPad = HandwritingPad;
    window.recognizeStrokes = recognizeStrokes;
    window.recognizeSingleDigit = recognizeSingleDigit;
    window._hwDebug = {
      strokesBBox,
      rasterizeStrokesToGrid,
      labelConnectedComponents,
      extractColonAndDots,
      splitTouchingComponents,
      recursiveSplitComponent,
      mergeMultiStrokeParts,
      normalizeToMNIST,
      classifySingleCharacter,
      solveTimeGrammar,
      recognizeStrokes,
      recognizeSingleDigit
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      HandwritingPad,
      recognizeStrokes,
      recognizeSingleDigit,
      strokesBBox,
      rasterizeStrokesToGrid,
      labelConnectedComponents,
      extractColonAndDots,
      splitTouchingComponents,
      recursiveSplitComponent,
      mergeMultiStrokeParts,
      normalizeToMNIST,
      classifySingleCharacter,
      solveTimeGrammar
    };
  }
})();
