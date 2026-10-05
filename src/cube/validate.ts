import {
  COLOR_LIST,
  COLOR_NAME,
  CORNER_DEFS,
  Cube,
  EDGE_DEFS,
  FACES,
  type Color,
  type Face,
} from './cube';

export type Validation = { ok: true } | { ok: false; reason: string };

const REAL_EDGES = new Set<string>();
const REAL_CORNERS = new Set<string>();

function pairKey(a: Color, b: Color): string {
  return a < b ? a + b : b + a;
}
function tripleKey(a: Color, b: Color, c: Color): string {
  return [a, b, c].sort().join('');
}

{
  const solved = Cube.solved();
  for (const e of EDGE_DEFS) REAL_EDGES.add(pairKey(solved.get(e.a.face, e.a.i), solved.get(e.b.face, e.b.i)));
  for (const c of CORNER_DEFS) {
    REAL_CORNERS.add(tripleKey(solved.get(c.f[0].face, c.f[0].i), solved.get(c.f[1].face, c.f[1].i), solved.get(c.f[2].face, c.f[2].i)));
  }
}

function edgeFlip(cube: Cube, slot: (typeof EDGE_DEFS)[number]): number {
  const ca = cube.get(slot.a.face, slot.a.i);
  const cb = cube.get(slot.b.face, slot.b.i);
  const ud = new Set<Color>([cube.center('U'), cube.center('D')]);
  const fb = new Set<Color>([cube.center('F'), cube.center('B')]);
  const primary = ud.has(ca) ? ca : ud.has(cb) ? cb : fb.has(ca) ? ca : cb;
  // Facelet A is the reference: U/D on the U and D layers, F/B on the equator.
  return ca === primary ? 0 : 1;
}

export function validateCube(cube: Cube): Validation {
  const counts = new Map<Color, number>();
  for (const color of COLOR_LIST) counts.set(color, 0);
  for (let i = 0; i < 54; i++) {
    const color = COLOR_LIST[cube.s[i]];
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  for (const color of COLOR_LIST) {
    if (counts.get(color) !== 9) {
      return { ok: false, reason: `${COLOR_NAME[color]}色有 ${counts.get(color)} 块，标准魔方每种颜色应是 9 块。` };
    }
  }

  const centers = FACES.map((f) => cube.center(f));
  if (new Set(centers).size !== 6) {
    return { ok: false, reason: '六个中心块颜色必须互不相同。' };
  }

  const edgeIds: number[] = [];
  const seenE = new Set<string>();
  let eo = 0;
  const solved = Cube.solved();
  const homeEdge = new Map<string, number>();
  EDGE_DEFS.forEach((e, i) => {
    homeEdge.set(pairKey(solved.get(e.a.face, e.a.i), solved.get(e.b.face, e.b.i)), i);
  });
  for (const slot of EDGE_DEFS) {
    const ca = cube.get(slot.a.face, slot.a.i);
    const cb = cube.get(slot.b.face, slot.b.i);
    const key = pairKey(ca, cb);
    if (!REAL_EDGES.has(key)) {
      return { ok: false, reason: `出现了不存在的棱块（${COLOR_NAME[ca]}-${COLOR_NAME[cb]}）。请检查录入。` };
    }
    if (seenE.has(key)) return { ok: false, reason: `${COLOR_NAME[ca]}-${COLOR_NAME[cb]}棱块重复了。` };
    seenE.add(key);
    edgeIds.push(homeEdge.get(key)!);
    eo += edgeFlip(cube, slot);
  }

  const homeCorner = new Map<string, number>();
  CORNER_DEFS.forEach((c, i) => {
    homeCorner.set(
      tripleKey(solved.get(c.f[0].face, c.f[0].i), solved.get(c.f[1].face, c.f[1].i), solved.get(c.f[2].face, c.f[2].i)),
      i,
    );
  });
  const ud = new Set<Color>([cube.center('U'), cube.center('D')]);
  const cornerIds: number[] = [];
  const seenC = new Set<string>();
  let co = 0;
  for (const slot of CORNER_DEFS) {
    const cols = slot.f.map((f) => cube.get(f.face, f.i));
    const key = tripleKey(cols[0], cols[1], cols[2]);
    if (!REAL_CORNERS.has(key)) {
      return {
        ok: false,
        reason: `出现了不存在的角块（${cols.map((c) => COLOR_NAME[c]).join('-')}）。请检查录入。`,
      };
    }
    if (seenC.has(key)) return { ok: false, reason: '有角块重复了。' };
    seenC.add(key);
    cornerIds.push(homeCorner.get(key)!);
    let ori = slot.f.findIndex((f) => ud.has(cube.get(f.face, f.i)));
    if (ori < 0) {
      return { ok: false, reason: '有角块缺少顶面或底面的颜色，状态不合法。' };
    }
    co += ori;
  }

  if (eo % 2 !== 0) return { ok: false, reason: '棱块翻转不合法（总翻转次数是奇数）。请对照实物改一改颜色。' };
  if (co % 3 !== 0) return { ok: false, reason: '角块朝向不合法。请对照实物改一改颜色。' };
  if (parity(edgeIds) !== parity(cornerIds)) {
    return { ok: false, reason: '色块位置的奇偶性不合法，像是有两块被交换了。请对照实物再核对。' };
  }
  return { ok: true };
}

function parity(perm: number[]): number {
  let inv = 0;
  for (let i = 0; i < perm.length; i++) {
    for (let j = i + 1; j < perm.length; j++) if (perm[i] > perm[j]) inv++;
  }
  return inv % 2;
}

export function describeFace(face: Face): string {
  const name: Record<Face, string> = {
    U: '上面',
    D: '下面',
    F: '前面',
    B: '后面',
    R: '右面',
    L: '左面',
  };
  return name[face];
}
