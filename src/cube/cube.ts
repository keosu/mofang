export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type Face = (typeof FACES)[number];

export const COLOR_LIST = ['Y', 'R', 'G', 'W', 'O', 'B'] as const;
export type Color = (typeof COLOR_LIST)[number];

export const FACE_INDEX: Record<Face, number> = {
  U: 0,
  R: 1,
  F: 2,
  D: 3,
  L: 4,
  B: 5,
};

export const COLOR_INDEX: Record<Color, number> = {
  Y: 0,
  R: 1,
  G: 2,
  W: 3,
  O: 4,
  B: 5,
};

export const COLOR_HEX: Record<Color, string> = {
  Y: '#f6d32d',
  R: '#e23b32',
  G: '#2f9e44',
  W: '#f4f6f8',
  O: '#f58220',
  B: '#2f6fed',
};

export const COLOR_NAME: Record<Color, string> = {
  Y: '黄',
  R: '红',
  G: '绿',
  W: '白',
  O: '橙',
  B: '蓝',
};

export const FACE_TURNS = [
  'U', "U'", 'U2',
  'D', "D'", 'D2',
  'R', "R'", 'R2',
  'L', "L'", 'L2',
  'F', "F'", 'F2',
  'B', "B'", 'B2',
] as const;

export type FaceletRef = { face: Face; i: number; flat: number };

function ref(face: Face, i: number): FaceletRef {
  return { face, i, flat: FACE_INDEX[face] * 9 + i };
}

export const EDGE_DEFS: { name: string; a: FaceletRef; b: FaceletRef }[] = [
  { name: 'UR', a: ref('U', 5), b: ref('R', 1) },
  { name: 'UF', a: ref('U', 7), b: ref('F', 1) },
  { name: 'UL', a: ref('U', 3), b: ref('L', 1) },
  { name: 'UB', a: ref('U', 1), b: ref('B', 1) },
  { name: 'DR', a: ref('D', 5), b: ref('R', 7) },
  { name: 'DF', a: ref('D', 1), b: ref('F', 7) },
  { name: 'DL', a: ref('D', 3), b: ref('L', 7) },
  { name: 'DB', a: ref('D', 7), b: ref('B', 7) },
  { name: 'FR', a: ref('F', 5), b: ref('R', 3) },
  { name: 'FL', a: ref('F', 3), b: ref('L', 5) },
  { name: 'BR', a: ref('B', 3), b: ref('R', 5) },
  { name: 'BL', a: ref('B', 5), b: ref('L', 3) },
];

/** First facelet is the U/D face so corner orientation can use this order. */
export const CORNER_DEFS: { name: string; f: FaceletRef[] }[] = [
  { name: 'UFR', f: [ref('U', 8), ref('R', 0), ref('F', 2)] },
  { name: 'UFL', f: [ref('U', 6), ref('F', 0), ref('L', 2)] },
  { name: 'UBL', f: [ref('U', 0), ref('L', 0), ref('B', 2)] },
  { name: 'UBR', f: [ref('U', 2), ref('B', 0), ref('R', 2)] },
  { name: 'DFR', f: [ref('D', 2), ref('F', 8), ref('R', 6)] },
  { name: 'DFL', f: [ref('D', 0), ref('L', 8), ref('F', 6)] },
  { name: 'DBL', f: [ref('D', 6), ref('B', 8), ref('L', 6)] },
  { name: 'DBR', f: [ref('D', 8), ref('R', 8), ref('B', 6)] },
];

export const EDGE_INDEX: Record<string, number> = Object.fromEntries(
  EDGE_DEFS.map((e, i) => [e.name, i]),
);

type V = { x: number; y: number; z: number };

function rotU(v: V): V {
  return { x: -v.z, y: v.y, z: v.x };
}
function rotD(v: V): V {
  return { x: v.z, y: v.y, z: -v.x };
}
function rotR(v: V): V {
  return { x: v.x, y: v.z, z: -v.y };
}
function rotL(v: V): V {
  return { x: v.x, y: -v.z, z: v.y };
}
function rotF(v: V): V {
  return { x: v.y, y: -v.x, z: v.z };
}
function rotB(v: V): V {
  return { x: -v.y, y: v.x, z: v.z };
}

const ROT: Record<string, (v: V) => V> = {
  U: rotU,
  D: rotD,
  R: rotR,
  L: rotL,
  F: rotF,
  B: rotB,
  y: rotU,
  x: rotR,
  z: rotF,
  M: rotL,
  E: rotD,
  S: rotF,
};

function onLayer(name: string, p: V): boolean {
  switch (name) {
    case 'U':
      return p.y === 1;
    case 'D':
      return p.y === -1;
    case 'R':
      return p.x === 1;
    case 'L':
      return p.x === -1;
    case 'F':
      return p.z === 1;
    case 'B':
      return p.z === -1;
    case 'M':
      return p.x === 0;
    case 'E':
      return p.y === 0;
    case 'S':
      return p.z === 0;
    default:
      return true;
  }
}

type Sticker = { flat: number; pos: V; normal: V };

function buildStickers(): Sticker[] {
  const list: Sticker[] = [];
  const add = (face: number, idx: number, pos: V, normal: V) => {
    list.push({ flat: face * 9 + idx, pos, normal });
  };
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col;
      add(0, idx, { x: col - 1, y: 1, z: row - 1 }, { x: 0, y: 1, z: 0 });
      add(1, idx, { x: 1, y: 1 - row, z: 1 - col }, { x: 1, y: 0, z: 0 });
      add(2, idx, { x: col - 1, y: 1 - row, z: 1 }, { x: 0, y: 0, z: 1 });
      add(3, idx, { x: col - 1, y: -1, z: 1 - row }, { x: 0, y: -1, z: 0 });
      add(4, idx, { x: -1, y: 1 - row, z: col - 1 }, { x: -1, y: 0, z: 0 });
      add(5, idx, { x: 1 - col, y: 1 - row, z: -1 }, { x: 0, y: 0, z: -1 });
    }
  }
  return list;
}

function vkey(v: V, n: V): string {
  return `${v.x},${v.y},${v.z},${n.x},${n.y},${n.z}`;
}

const STICKERS = buildStickers();
const LOOKUP = new Map<string, number>();
for (const s of STICKERS) LOOKUP.set(vkey(s.pos, s.normal), s.flat);

function quarterPerm(name: string): Uint8Array {
  const rot = ROT[name];
  const src = new Uint8Array(54);
  for (let i = 0; i < 54; i++) src[i] = i;
  for (const s of STICKERS) {
    if (!onLayer(name, s.pos)) continue;
    const np = rot(s.pos);
    const nn = rot(s.normal);
    const dest = LOOKUP.get(vkey(np, nn));
    if (dest === undefined) throw new Error(`贴纸落点缺失: ${name}`);
    src[dest] = s.flat;
  }
  const seen = new Set<number>();
  for (let i = 0; i < 54; i++) {
    if (seen.has(src[i])) throw new Error(`置换冲突: ${name}`);
    seen.add(src[i]);
  }
  return src;
}

function compose(a: Uint8Array, b: Uint8Array): Uint8Array {
  const c = new Uint8Array(54);
  for (let i = 0; i < 54; i++) c[i] = a[b[i]];
  return c;
}

const QUARTER: Record<string, Uint8Array> = {};
for (const name of Object.keys(ROT)) QUARTER[name] = quarterPerm(name);

const PERMS = new Map<string, Uint8Array>();
for (const name of Object.keys(QUARTER)) {
  const q = QUARTER[name];
  const q2 = compose(q, q);
  const q3 = compose(q2, q);
  PERMS.set(name, q);
  PERMS.set(name + '2', q2);
  PERMS.set(name + "'", q3);
}

export function tokenize(seq: string): string[] {
  const out: string[] = [];
  const re = /([URFDLBxyzMES])([2'])?/g;
  for (const m of seq.matchAll(re)) out.push(m[1] + (m[2] ?? ''));
  return out;
}

export function invertMove(move: string): string {
  if (move.endsWith("'")) return move[0];
  if (move.endsWith('2')) return move;
  return move[0] + "'";
}

export function invertMoves(moves: string[]): string[] {
  const out: string[] = [];
  for (let i = moves.length - 1; i >= 0; i--) out.push(invertMove(moves[i]));
  return out;
}

function quarterOf(move: string): { face: string; q: number } {
  const face = move[0];
  const suf = move.slice(1);
  const q = suf === "'" ? 3 : suf === '2' ? 2 : 1;
  return { face, q };
}

export function simplify(moves: string[]): string[] {
  const out: string[] = [];
  for (const move of moves) {
    const b = quarterOf(move);
    if (!out.length) {
      out.push(move);
      continue;
    }
    const a = quarterOf(out[out.length - 1]);
    if (a.face !== b.face) {
      out.push(move);
      continue;
    }
    const q = (a.q + b.q) % 4;
    out.pop();
    if (q === 1) out.push(a.face);
    else if (q === 2) out.push(a.face + '2');
    else if (q === 3) out.push(a.face + "'");
  }
  return out;
}

function solvedBytes(): Uint8Array {
  const s = new Uint8Array(54);
  for (let i = 0; i < 54; i++) s[i] = (i / 9) | 0;
  return s;
}

export class Cube {
  s: Uint8Array;
  private buf: Uint8Array;

  constructor(src?: Uint8Array) {
    this.s = src ? src.slice() : solvedBytes();
    this.buf = new Uint8Array(54);
  }

  static solved(): Cube {
    return new Cube();
  }

  static fromFaces(faces: readonly (readonly Color[])[]): Cube {
    const s = new Uint8Array(54);
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 9; i++) s[f * 9 + i] = COLOR_INDEX[faces[f][i]];
    }
    return new Cube(s);
  }

  clone(): Cube {
    return new Cube(this.s);
  }

  get(face: Face, i: number): Color {
    return COLOR_LIST[this.s[FACE_INDEX[face] * 9 + i]];
  }

  center(face: Face): Color {
    return this.get(face, 4);
  }

  faces(): Color[][] {
    return FACES.map((f) => Array.from({ length: 9 }, (_, i) => this.get(f, i)));
  }

  apply(move: string): void {
    const src = PERMS.get(move);
    if (!src) throw new Error(`未知转动: ${move}`);
    const s = this.s;
    const buf = this.buf;
    for (let i = 0; i < 54; i++) buf[i] = s[src[i]];
    this.s = buf;
    this.buf = s;
  }

  applySeq(seq: string | string[]): void {
    const moves = typeof seq === 'string' ? tokenize(seq) : seq;
    for (const m of moves) this.apply(m);
  }

  isSolved(): boolean {
    for (let f = 0; f < 6; f++) {
      const c = this.s[f * 9 + 4];
      for (let i = 0; i < 9; i++) if (this.s[f * 9 + i] !== c) return false;
    }
    return true;
  }

  debug(): string {
    return FACES.map((f, fi) => {
      let text = f;
      for (let i = 0; i < 9; i++) text += COLOR_LIST[this.s[fi * 9 + i]];
      return text;
    }).join(' ');
  }
}

/** Quarter turns of U, F and R. These three faces already generate every legal cube. */
export function randomScramble(length = 20): string[] {
  const faces = ['U', 'F', 'R'];
  const suffix = ['', "'"];
  const out: string[] = [];
  let last = '';
  while (out.length < length) {
    const f = faces[(Math.random() * faces.length) | 0];
    if (f === last) continue;
    last = f;
    out.push(f + suffix[(Math.random() * suffix.length) | 0]);
  }
  return out;
}

/** Visual quarter-turn: axis, layer (null = whole cube), radians of a clockwise face turn. */
export function moveAnimation(move: string): {
  axis: 'x' | 'y' | 'z';
  layer: number | null;
  angle: number;
} {
  const face = move[0];
  const table: Record<string, { axis: 'x' | 'y' | 'z'; layer: number | null; dir: number }> = {
    U: { axis: 'y', layer: 1, dir: -1 },
    D: { axis: 'y', layer: -1, dir: 1 },
    E: { axis: 'y', layer: 0, dir: 1 },
    y: { axis: 'y', layer: null, dir: -1 },
    R: { axis: 'x', layer: 1, dir: -1 },
    L: { axis: 'x', layer: -1, dir: 1 },
    M: { axis: 'x', layer: 0, dir: 1 },
    x: { axis: 'x', layer: null, dir: -1 },
    F: { axis: 'z', layer: 1, dir: -1 },
    B: { axis: 'z', layer: -1, dir: 1 },
    S: { axis: 'z', layer: 0, dir: -1 },
    z: { axis: 'z', layer: null, dir: -1 },
  };
  const base = table[face];
  if (!base) throw new Error(`无法演示: ${move}`);
  let turns = 1;
  if (move.endsWith("'")) turns = -1;
  else if (move.endsWith('2')) turns = 2;
  return {
    axis: base.axis,
    layer: base.layer,
    angle: base.dir * turns * (Math.PI / 2),
  };
}
