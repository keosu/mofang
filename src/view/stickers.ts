import type { Face } from '../cube/cube';

/** Facelet index on a cubie at integer coordinates, matching the engine's outside view. */
export function stickerIndex(face: Face, x: number, y: number, z: number): number {
  switch (face) {
    case 'U':
      return (z + 1) * 3 + (x + 1);
    case 'D':
      return (1 - z) * 3 + (x + 1);
    case 'F':
      return (1 - y) * 3 + (x + 1);
    case 'B':
      return (1 - y) * 3 + (1 - x);
    case 'R':
      return (1 - y) * 3 + (1 - z);
    case 'L':
      return (1 - y) * 3 + (z + 1);
  }
}
