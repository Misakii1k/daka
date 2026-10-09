// 生成「工」字时间带图标：node design/make-icons.js
// 108 网格；普通图标为圆角方块，maskable 图标满底并把字形缩进安全圆（直径 66）
const zlib = require('zlib'), fs = require('fs'), path = require('path');

const INK = [20, 20, 20], ACC = [255, 91, 46], TRACK = [236, 236, 236], WHITE = [255, 255, 255];

// 字形（108 网格坐标）
const glyph = [
  { x: 30, y: 30, w: 48, h: 11, r: 5.5, c: INK },     // 上横
  { x: 48.5, y: 30, w: 11, h: 40, r: 0, c: INK },     // 竖
  { x: 24, y: 66, w: 60, h: 13, r: 6.5, c: TRACK },   // 下横 = 时间带轨道
  { x: 36, y: 66, w: 30, h: 13, r: 6.5, c: ACC }      // 今天上的班
];

function scaleShapes(shapes, s) {
  // 以 (54,54) 为中心缩放；字形视觉中心约在 y=54.5
  return shapes.map(o => ({ ...o, x: 54 + (o.x - 54) * s, y: 54 + (o.y - 54) * s, w: o.w * s, h: o.h * s, r: o.r * s }));
}

function inRR(px, py, o) {
  if (px < o.x || px > o.x + o.w || py < o.y || py > o.y + o.h) return false;
  const r = Math.min(o.r, o.w / 2, o.h / 2);
  if (r <= 0) return true;
  const cx = Math.min(Math.max(px, o.x + r), o.x + o.w - r);
  const cy = Math.min(Math.max(py, o.y + r), o.y + o.h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function render(n, shapes) {
  const SS = 4, k = 108 / n, buf = Buffer.alloc((n * 4 + 1) * n);
  let i = 0;
  for (let y = 0; y < n; y++) {
    buf[i++] = 0;
    for (let x = 0; x < n; x++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const px = (x + (sx + .5) / SS) * k, py = (y + (sy + .5) / SS) * k;
        let c = null;
        for (const o of shapes) if (inRR(px, py, o)) c = o.c;
        if (c) { R += c[0]; G += c[1]; B += c[2]; A++; }
      }
      if (A) { buf[i++] = Math.round(R / A); buf[i++] = Math.round(G / A); buf[i++] = Math.round(B / A); }
      else { buf[i++] = 0; buf[i++] = 0; buf[i++] = 0; }
      buf[i++] = Math.round(A / (SS * SS) * 255);
    }
  }
  return buf;
}

const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function writePng(file, n, shapes) {
  const h = Buffer.alloc(13); h.writeUInt32BE(n, 0); h.writeUInt32BE(n, 4); h[8] = 8; h[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', h), chunk('IDAT', zlib.deflateSync(render(n, shapes), { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
  console.log('wrote', path.relative(process.cwd(), file), n + 'px');
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });

const tile = [{ x: 0, y: 0, w: 108, h: 108, r: 24, c: WHITE }, ...glyph];
const full = [{ x: 0, y: 0, w: 108, h: 108, r: 0, c: WHITE }, ...scaleShapes(glyph, 0.8)];

writePng(path.join(out, 'icon-192.png'), 192, tile);
writePng(path.join(out, 'icon-512.png'), 512, tile);
writePng(path.join(out, 'icon-maskable-512.png'), 512, full);
writePng(path.join(out, 'icon-maskable-192.png'), 192, full);

// 矢量版（favicon / 启动页用）
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">` +
  tile.map(o => `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="${o.r}" fill="rgb(${o.c.join(',')})"/>`).join('') +
  `</svg>`;
fs.writeFileSync(path.join(out, 'icon.svg'), svg);
console.log('wrote icons/icon.svg');
