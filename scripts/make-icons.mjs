import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const px = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = y * (size * 4 + 1) + 1 + x * 4;
    raw[i] = r;
    raw[i + 1] = g;
    raw[i + 2] = b;
    raw[i + 3] = a;
  };
  for (let y = 0; y < size; y++) raw[y * (size * 4 + 1)] = 0;
  paint(px, size);
  const z = deflateSync(raw);
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4);
    data.copy(out, 8);
    const crc = crc32(out.subarray(4, 8 + data.length));
    out.writeInt32BE(crc, 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', z),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

function fillTri(px, a, b, c, color) {
  const minX = Math.floor(Math.min(a[0], b[0], c[0]));
  const maxX = Math.ceil(Math.max(a[0], b[0], c[0]));
  const minY = Math.floor(Math.min(a[1], b[1], c[1]));
  const maxY = Math.ceil(Math.max(a[1], b[1], c[1]));
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      const w1 = (c[0] - b[0]) * (y - b[1]) - (c[1] - b[1]) * (x - b[0]);
      const w2 = (a[0] - c[0]) * (y - c[1]) - (a[1] - c[1]) * (x - c[0]);
      if (w0 * area >= 0 && w1 * area >= 0 && w2 * area >= 0) px(x, y, ...color);
    }
  }
}

function quad(px, pts, color) {
  fillTri(px, pts[0], pts[1], pts[2], color);
  fillTri(px, pts[0], pts[2], pts[3], color);
}

function icon(size) {
  return png(size, (px) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) px(x, y, 18, 21, 28);
    }
    const s = size * 0.3;
    const cx = size / 2;
    const cy = size / 2 + size * 0.02;
    const top = [
      [cx, cy - s * 1.05],
      [cx + s, cy - s * 0.5],
      [cx, cy + s * 0.05],
      [cx - s, cy - s * 0.5],
    ];
    const left = [
      [cx - s, cy - s * 0.5],
      [cx, cy + s * 0.05],
      [cx, cy + s * 1.15],
      [cx - s, cy + s * 0.6],
    ];
    const right = [
      [cx, cy + s * 0.05],
      [cx + s, cy - s * 0.5],
      [cx + s, cy + s * 0.6],
      [cx, cy + s * 1.15],
    ];
    quad(px, top, [246, 211, 45]);
    quad(px, left, [47, 158, 68]);
    quad(px, right, [226, 59, 50]);
  });
}

writeFileSync(new URL('../public/icon-192.png', import.meta.url), icon(192));
writeFileSync(new URL('../public/icon-512.png', import.meta.url), icon(512));
