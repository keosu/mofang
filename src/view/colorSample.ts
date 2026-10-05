import type { Color, Face } from '../cube/cube';

const REFS: { color: Color; r: number; g: number; b: number }[] = [
  { color: 'Y', r: 230, g: 190, b: 40 },
  { color: 'R', r: 190, g: 45, b: 42 },
  { color: 'G', r: 40, g: 150, b: 70 },
  { color: 'W', r: 225, g: 225, b: 225 },
  { color: 'O', r: 220, g: 110, b: 30 },
  { color: 'B', r: 40, g: 80, b: 200 },
];

export function nearestSticker(r: number, g: number, b: number): Color {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 28 && max > 145) return 'W';
  let best: Color = 'W';
  let bestD = Infinity;
  for (const ref of REFS) {
    const d = (r - ref.r) ** 2 * 1.15 + (g - ref.g) ** 2 + (b - ref.b) ** 2 * 1.05;
    if (d < bestD) {
      bestD = d;
      best = ref.color;
    }
  }
  return best;
}

export function sampleFaceColors(source: CanvasImageSource, sw: number, sh: number): Color[] {
  const size = 180;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || sw < 2 || sh < 2) return Array.from({ length: 9 }, () => 'W' as Color);
  const side = Math.min(sw, sh) * 0.84;
  const sx = (sw - side) / 2;
  const sy = (sh - side) / 2;
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  const colors: Color[] = [];
  const patch = 16;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = Math.round(((col + 0.5) / 3) * size - patch / 2);
      const cy = Math.round(((row + 0.5) / 3) * size - patch / 2);
      const data = ctx.getImageData(cx, cy, patch, patch).data;
      let r = 0;
      let g = 0;
      let b = 0;
      const n = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      colors.push(nearestSticker(r / n, g / n, b / n));
    }
  }
  return colors;
}

/** Photo top/left so the picture's row-major order matches the engine. Assumes standard colors. */
export const PHOTO_HINT: Record<Face, string> = {
  U: '让蓝色边在照片上方，橙色边在左侧。',
  D: '让绿色边在照片上方，橙色边在左侧。',
  F: '让黄色边在照片上方，橙色边在左侧。',
  B: '让黄色边在照片上方，红色边在左侧。',
  R: '让黄色边在照片上方，绿色边在左侧。',
  L: '让黄色边在照片上方，蓝色边在左侧。',
};
