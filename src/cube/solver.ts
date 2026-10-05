import {
  COLOR_NAME,
  CORNER_DEFS,
  Cube,
  EDGE_DEFS,
  EDGE_INDEX,
  FACE_TURNS,
  FACES,
  simplify,
  tokenize,
  type Color,
  type Face,
} from './cube';
import { validateCube } from './validate';

export type Lesson = {
  phase: string;
  title: string;
  detail: string;
  formula?: string;
  formulaName?: string;
  moves: string[];
};

const PHASE = {
  prep: '准备',
  cross: '第一步 · 底面十字',
  corner: '第二步 · 底角',
  middle: '第三步 · 中层棱',
  crossU: '第四步 · 顶面十字',
  co: '第五步 · 顶角朝向',
  cp: '第六步 · 顶角位置',
  ep: '第七步 · 顶棱位置',
} as const;

const RIGHT_EDGE = "U R U' R' U' F' U F";
const LEFT_EDGE = "U' L' U L U F U' F'";
const YELLOW_CROSS = "F R U R' U' F'";
const SUNE = "R U R' U R U2 R'";
const ANTISUNE = "R' U' R U' R' U2 R";
const EDGE_CYCLE = "R U' R U R U R U' R' U' R2";
const EDGE_CYCLE_B = "R2 U R U R' U' R' U' R' U R'";
const EDGE_CYCLE_C = "F2 U R' L F2 L' R U F2";

const Y_SETUPS = ['', 'y', "y'", 'y2'];
const U_SETUPS = ['', 'U', "U'", 'U2'];

export function solveBeginner(input: Cube): Lesson[] {
  const check = validateCube(input);
  if (!check.ok) throw new Error(check.reason);
  const cube = input.clone();
  const lessons: Lesson[] = [];
  orientBottom(cube, lessons);
  solveCross(cube, lessons);
  solveBottomCorners(cube, lessons);
  solveMiddle(cube, lessons);
  solveUpCross(cube, lessons);
  solveUpCornersOri(cube, lessons);
  solveUpCornersPerm(cube, lessons);
  solveUpEdges(cube, lessons);
  finishAuf(cube, lessons);
  if (!cube.isSolved()) throw new Error('层先法没有走到复原，请检查状态。' + cube.debug());
  return lessons;
}

const CFOP_PHASE: Record<string, string> = {
  [PHASE.prep]: '准备',
  [PHASE.cross]: '第一步 · 十字 Cross',
  f2l: '第二步 · 前两层 F2L',
  [PHASE.crossU]: '第三步 · 顶面朝向 OLL',
  [PHASE.co]: '第三步 · 顶面朝向 OLL',
  [PHASE.cp]: '第四步 · 顶层排列 PLL',
  [PHASE.ep]: '第四步 · 顶层排列 PLL',
};

/** CFOP 入门版：十字、F2L 角棱配对，顶层用两段 OLL 和两段 PLL。 */
export function solveCFOP(input: Cube): Lesson[] {
  const check = validateCube(input);
  if (!check.ok) throw new Error(check.reason);
  const cube = input.clone();
  const lessons: Lesson[] = [];
  orientBottom(cube, lessons);
  solveCross(cube, lessons);
  solveF2L(cube, lessons);
  solveUpCross(cube, lessons);
  solveUpCornersOri(cube, lessons);
  solveUpCornersPerm(cube, lessons);
  solveUpEdges(cube, lessons);
  finishAuf(cube, lessons);
  if (!cube.isSolved()) throw new Error('CFOP 没有走到复原，请检查状态。' + cube.debug());
  return lessons.map((lesson) => ({ ...lesson, phase: CFOP_PHASE[lesson.phase] ?? lesson.phase }));
}

function finishAuf(cube: Cube, lessons: Lesson[]): void {
  if (cube.isSolved()) return;
  for (const m of ['U', 'U2', "U'"]) {
    const trial = cube.clone();
    trial.apply(m);
    if (trial.isSolved()) {
      emit(cube, lessons, {
        phase: PHASE.ep,
        title: '对齐顶层',
        detail: '顶层已经复原，再转一下顶面，让侧面颜色和中心对齐。',
        moves: [m],
      });
      return;
    }
  }
}

const F2L_MACROS = ['U', "U'", 'U2', "R U R'", "R U' R'", "R U2 R'", "F' U F", "F' U' F", "F' U2 F"];

function pairSolved(cube: Cube): boolean {
  return slotSolved(cube, 'DFR') && slotSolved(cube, 'FR');
}

function solvedPairIds(cube: Cube): { corners: Set<string>; edges: Set<string> } {
  const corners = new Set<string>();
  const edges = new Set<string>();
  for (const ys of Y_SETUPS) {
    const c = cube.clone();
    c.applySeq(tokenize(ys));
    if (!pairSolved(c)) continue;
    corners.add([c.center('D'), c.center('F'), c.center('R')].sort().join(''));
    edges.add([c.center('F'), c.center('R')].sort().join(''));
  }
  return { corners, edges };
}

function pairsPreserved(cube: Cube, keep: { corners: Set<string>; edges: Set<string> }): boolean {
  return crossSolved(cube) && cornersPreserved(cube, keep.corners) && middlePreserved(cube, keep.edges);
}

function pairKey(cube: Cube): string {
  const d = cube.center('D');
  const f = cube.center('F');
  const r = cube.center('R');
  const corner = findCorner(cube, [d, f, r]);
  const def = CORNER_DEFS.find((c) => c.name === corner.slot)!;
  const twist = def.f.findIndex((x) => cube.get(x.face, x.i) === d);
  return `${corner.slot}${twist}:${edgeKeyOf(cube, f, r)}`;
}

function pairInReach(cube: Cube): boolean {
  const d = cube.center('D');
  const f = cube.center('F');
  const r = cube.center('R');
  const corner = findCorner(cube, [d, f, r]).slot;
  const edge = findEdge(cube, f, r).slot;
  return (corner.startsWith('U') || corner === 'DFR') && (edge.startsWith('U') || edge === 'FR');
}

/** 只用顶层转动和右前槽的进出手法，所以十字和其它槽不会动。 */
function bfsPair(start: Cube): string[] | null {
  if (pairSolved(start)) return [];
  type Node = { bytes: Uint8Array; parent: number; macro: string };
  const nodes: Node[] = [{ bytes: start.s.slice(), parent: -1, macro: '' }];
  const seen = new Set<string>([pairKey(start)]);
  for (let qi = 0; qi < nodes.length; qi++) {
    const last = nodes[qi].macro;
    for (const macro of F2L_MACROS) {
      if (macro.length <= 2 && last.length <= 2 && last) continue;
      const next = new Cube(nodes[qi].bytes);
      next.applySeq(tokenize(macro));
      const key = pairKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push({ bytes: next.s.slice(), parent: qi, macro });
      if (pairSolved(next)) {
        const seq: string[] = [];
        for (let i = nodes.length - 1; nodes[i].parent !== -1; i = nodes[i].parent) seq.push(nodes[i].macro);
        return seq.reverse().flatMap((m) => tokenize(m));
      }
    }
  }
  return null;
}

function pairName(cube: Cube): string {
  return `${COLOR_NAME[cube.center('F')]}${COLOR_NAME[cube.center('R')]}`;
}

function solveF2L(cube: Cube, lessons: Lesson[]): void {
  const bottom = COLOR_NAME[cube.center('D')];
  let guard = 0;
  while (!f2lSolved(cube) && guard++ < 16) {
    const keep = solvedPairIds(cube);
    let best: { moves: string[]; name: string } | null = null;
    for (const ys of Y_SETUPS) {
      const c = cube.clone();
      c.applySeq(tokenize(ys));
      if (pairSolved(c) || !pairInReach(c)) continue;
      const path = bfsPair(c);
      if (!path) continue;
      const moves = simplify([...tokenize(ys), ...path]);
      if (!best || moves.length < best.moves.length) best = { moves, name: pairName(c) };
    }
    if (best) {
      emit(cube, lessons, {
        phase: 'f2l',
        title: `配对并放入${best.name}槽`,
        detail: `F2L 把${bottom}色角块和它旁边的中层棱一起处理。先用顶层转动把两块在顶上拼成一对，再用 R U R' 或 F' U' F 这类手法整对放进右前槽。整体转动 y 是把要做的槽转到右前。`,
        formula: best.moves.filter((m) => m[0] !== 'y').join(' '),
        formulaName: '角棱配对',
        moves: best.moves,
      });
      continue;
    }
    let pop: string[] | null = null;
    let popScore = -Infinity;
    for (const ys of Y_SETUPS) {
      const c = cube.clone();
      c.applySeq(tokenize(ys));
      if (pairSolved(c)) continue;
      const moves = simplify([...tokenize(ys), ...tokenize("R U R'")]);
      const t = cube.clone();
      t.applySeq(moves);
      if (!pairsPreserved(t, keep)) continue;
      const reach = Y_SETUPS.filter((y2) => {
        const u = t.clone();
        u.applySeq(tokenize(y2));
        return !pairSolved(u) && pairInReach(u);
      }).length;
      const score = reach * 10 - moves.length;
      if (score > popScore) {
        popScore = score;
        pop = moves;
      }
    }
    if (!pop) throw new Error('F2L 无法取出卡住的块 ' + cube.debug());
    emit(cube, lessons, {
      phase: 'f2l',
      title: '把卡在别的槽里的块取出来',
      detail: '要配对的角或棱卡在另一个还没做好的槽里。把那个槽转到右前，做一次 R U R\'，两块会被带到顶层，之后再配对。',
      formula: "R U R'",
      formulaName: '取出',
      moves: pop,
    });
  }
  if (!f2lSolved(cube)) throw new Error('F2L 未完成 ' + cube.debug());
}

function emit(
  cube: Cube,
  lessons: Lesson[],
  lesson: Omit<Lesson, 'moves'> & { moves: string[] },
): void {
  const moves = simplify(lesson.moves);
  if (!moves.length) return;
  cube.applySeq(moves);
  lessons.push({ ...lesson, moves });
}

function orientBottom(cube: Cube, lessons: Lesson[]): void {
  const centers = FACES.map((f) => cube.center(f));
  const bottom: Color = centers.includes('W') ? 'W' : cube.center('D');
  const topWant: Color | null = bottom === 'W' ? 'Y' : null;
  if (cube.center('D') === bottom && (topWant === null || cube.center('U') === topWant)) return;

  const gens = ['x', 'x2', "x'", 'z', 'z2', "z'"];
  const seqs: string[][] = [[]];
  for (const g of gens) seqs.push([g]);
  for (const a of gens) {
    for (const b of gens) if (a[0] !== b[0]) seqs.push([a, b]);
  }
  let best: string[] | null = null;
  let bestScore = 99;
  for (const seq of seqs) {
    const c = cube.clone();
    c.applySeq(seq);
    if (c.center('D') !== bottom) continue;
    const score = seq.length * 2 + (topWant && c.center('U') !== topWant ? 1 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = seq;
    }
  }
  if (!best) throw new Error('无法把底色转到下面');
  const topName = topWant ? COLOR_NAME[topWant] : COLOR_NAME[cube.center('U')];
  emit(cube, lessons, {
    phase: PHASE.prep,
    title: `把${COLOR_NAME[bottom]}色转到下面`,
    detail: `从底面开始做。先把整个魔方转一下，让${COLOR_NAME[bottom]}色中心朝下${topWant ? `、${topName}色中心朝上` : ''}。这只是换了一个拿法，打乱没有变。`,
    formulaName: '整体转动',
    moves: best,
  });
}

function crossEdgeSolved(cube: Cube, side: Face): boolean {
  const slot: Record<string, string> = { F: 'DF', R: 'DR', B: 'DB', L: 'DL' };
  return slotSolved(cube, slot[side]);
}

function crossSolved(cube: Cube): boolean {
  return (['F', 'R', 'B', 'L'] as Face[]).every((s) => crossEdgeSolved(cube, s));
}

function slotSolved(cube: Cube, name: string): boolean {
  const edge = EDGE_DEFS.find((e) => e.name === name);
  if (edge) {
    return cube.get(edge.a.face, edge.a.i) === cube.center(edge.a.face)
      && cube.get(edge.b.face, edge.b.i) === cube.center(edge.b.face);
  }
  const corner = CORNER_DEFS.find((c) => c.name === name);
  if (!corner) throw new Error(name);
  return corner.f.every((f) => cube.get(f.face, f.i) === cube.center(f.face));
}

function cornerSolved(cube: Cube, name: string): boolean {
  return slotSolved(cube, name);
}

function bottomCornersSolved(cube: Cube): boolean {
  return ['DFR', 'DFL', 'DBL', 'DBR'].every((n) => cornerSolved(cube, n));
}

function middleSolved(cube: Cube): boolean {
  return ['FR', 'FL', 'BR', 'BL'].every((n) => slotSolved(cube, n));
}

function f2lSolved(cube: Cube): boolean {
  return crossSolved(cube) && bottomCornersSolved(cube) && middleSolved(cube);
}

type EdgeHit = { slot: string; index: number; colors: [Color, Color] };

function findEdge(cube: Cube, c1: Color, c2: Color): EdgeHit {
  for (let i = 0; i < EDGE_DEFS.length; i++) {
    const e = EDGE_DEFS[i];
    const ca = cube.get(e.a.face, e.a.i);
    const cb = cube.get(e.b.face, e.b.i);
    if ((ca === c1 && cb === c2) || (ca === c2 && cb === c1)) {
      return { slot: e.name, index: i, colors: [ca, cb] };
    }
  }
  throw new Error(`找不到棱块 ${c1}${c2}`);
}

function edgeKeyOf(cube: Cube, c1: Color, c2: Color): number {
  const hit = findEdge(cube, c1, c2);
  const def = EDGE_DEFS[hit.index];
  const ori = cube.get(def.a.face, def.a.i) === c1 ? 0 : 1;
  return hit.index * 2 + ori;
}

function solveCross(cube: Cube, lessons: Lesson[]): void {
  if (crossSolved(cube)) return;
  const bottom = cube.center('D');
  const sides: Face[] = ['F', 'R', 'B', 'L'];
  const pairs = sides.map((side) => [bottom, cube.center(side)] as [Color, Color]);
  const path = bfsCross(cube, pairs);
  const grouped = groupCross(cube, path, sides);
  for (const g of grouped) {
    emit(cube, lessons, {
      phase: PHASE.cross,
      title: g.title,
      detail: `底面十字没有固定口诀，靠观察：把带${COLOR_NAME[bottom]}色的棱块送到对应侧面中心的下方，并且${COLOR_NAME[bottom]}色朝下。侧面颜色要和中心一致。`,
      moves: g.moves,
    });
  }
  if (!crossSolved(cube)) throw new Error('十字未完成 ' + cube.debug());
}

function bfsCross(start: Cube, pairs: [Color, Color][]): string[] {
  const keyOf = (cube: Cube) => {
    let k = 0;
    for (const [a, b] of pairs) k = k * 24 + edgeKeyOf(cube, a, b);
    return k;
  };
  const goal = (cube: Cube) => crossSolved(cube);
  if (goal(start)) return [];
  type Node = { bytes: Uint8Array; parent: number; move: string; face: string };
  const nodes: Node[] = [{ bytes: start.s.slice(), parent: -1, move: '', face: '' }];
  const seen = new Set<number>([keyOf(start)]);
  const cube = new Cube();
  for (let qi = 0; qi < nodes.length; qi++) {
    if (nodes.length > 250000) break;
    cube.s.set(nodes[qi].bytes);
    const last = nodes[qi].face;
    for (const move of FACE_TURNS) {
      if (move[0] === last) continue;
      cube.apply(move);
      const k = keyOf(cube);
      if (!seen.has(k)) {
        seen.add(k);
        const bytes = cube.s.slice();
        nodes.push({ bytes, parent: qi, move, face: move[0] });
        if (goal(cube)) {
          const seq: string[] = [];
          let i = nodes.length - 1;
          while (nodes[i].parent !== -1) {
            seq.push(nodes[i].move);
            i = nodes[i].parent;
          }
          seq.reverse();
          return seq;
        }
      }
      cube.apply(invertQuick(move));
    }
  }
  throw new Error('找不到底面十字');
}

function invertQuick(move: string): string {
  if (move.endsWith("'")) return move[0];
  if (move.endsWith('2')) return move;
  return move[0] + "'";
}

function groupCross(start: Cube, path: string[], sides: Face[]): { title: string; moves: string[] }[] {
  const lastBad: Record<string, number> = {};
  for (const s of sides) lastBad[s] = crossEdgeSolved(start, s) ? -2 : -1;
  const cube = start.clone();
  path.forEach((move, i) => {
    cube.apply(move);
    for (const s of sides) if (!crossEdgeSolved(cube, s)) lastBad[s] = i;
  });
  const events = sides
    .filter((s) => lastBad[s] !== -2)
    .map((s) => ({ side: s, end: lastBad[s] + 1 }))
    .sort((a, b) => a.end - b.end);
  const groups: { title: string; moves: string[] }[] = [];
  let from = 0;
  for (let i = 0; i < events.length;) {
    const end = events[i].end;
    if (end > path.length) throw new Error('十字路径没有放好所有棱');
    let j = i;
    const names: string[] = [];
    while (j < events.length && events[j].end === end) {
      names.push(COLOR_NAME[start.center(events[j].side)]);
      j++;
    }
    groups.push({
      title: `放好${names.join('、')}棱`,
      moves: path.slice(from, end),
    });
    from = end;
    i = j;
  }
  if (from < path.length) {
    groups.push({ title: '收好十字', moves: path.slice(from) });
  }
  return groups.filter((g) => g.moves.length);
}

function solvedCornerIds(cube: Cube): Set<string> {
  const ids = new Set<string>();
  for (const c of CORNER_DEFS) {
    if (!c.name.startsWith('D') || !cornerSolved(cube, c.name)) continue;
    ids.add(c.f.map((f) => cube.get(f.face, f.i)).sort().join(''));
  }
  return ids;
}

function bfsFace(start: Cube, maxDepth: number, goal: (cube: Cube) => boolean): string[] | null {
  const nodes: { bytes: Uint8Array; parent: number; move: string }[] = [
    { bytes: start.s.slice(), parent: -1, move: '' },
  ];
  const seen = new Set<string>([start.debug()]);
  for (let qi = 0; qi < nodes.length; qi++) {
    let depth = 0;
    for (let i = qi; nodes[i].parent !== -1; i = nodes[i].parent) depth++;
    const current = new Cube(nodes[qi].bytes);
    if (qi > 0 && goal(current)) {
      const seq: string[] = [];
      for (let i = qi; nodes[i].parent !== -1; i = nodes[i].parent) seq.push(nodes[i].move);
      return seq.reverse();
    }
    if (depth >= maxDepth) continue;
    const last = nodes[qi].move[0] ?? '';
    for (const move of FACE_TURNS) {
      if (move[0] === last) continue;
      const next = new Cube(nodes[qi].bytes);
      next.apply(move);
      const key = next.debug();
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push({ bytes: next.s.slice(), parent: qi, move });
    }
  }
  return null;
}

function cornersPreserved(cube: Cube, ids: Set<string>): boolean {
  for (const id of ids) {
    let ok = false;
    for (const c of CORNER_DEFS) {
      const now = c.f.map((f) => cube.get(f.face, f.i)).sort().join('');
      if (now === id && cornerSolved(cube, c.name)) ok = true;
    }
    if (!ok) return false;
  }
  return true;
}

function findCorner(cube: Cube, colors: Color[]): { slot: string; colorOn: Partial<Record<Face, Color>> } {
  const want = new Set(colors);
  for (const c of CORNER_DEFS) {
    const cols = c.f.map((f) => cube.get(f.face, f.i));
    if (cols.every((col) => want.has(col)) && new Set(cols).size === 3) {
      const colorOn: Partial<Record<Face, Color>> = {};
      c.f.forEach((f, i) => {
        colorOn[f.face] = cols[i];
      });
      return { slot: c.name, colorOn };
    }
  }
  throw new Error('找不到角块');
}

function pieceOnBottom(cube: Cube, colors: Color[]): boolean {
  return findCorner(cube, colors).slot.startsWith('D');
}

function yToDFR(slot: string): { fwd: string[]; back: string[] } {
  // y 把底角按 DFR -> DFL -> DBL -> DBR 送一格。
  if (slot === 'DFR') return { fwd: [], back: [] };
  if (slot === 'DFL') return { fwd: ["y'"], back: ['y'] };
  if (slot === 'DBL') return { fwd: ['y2'], back: ['y2'] };
  return { fwd: ['y'], back: ["y'"] };
}

function uToUFR(slot: string): string[] {
  // U 把顶角按 UFR -> UFL -> UBL -> UBR 送一格。
  if (slot === 'UFR' || slot === '') return [];
  if (slot === 'UFL') return ["U'"];
  if (slot === 'UBL') return ['U2'];
  return ['U'];
}

function solveBottomCorners(cube: Cube, lessons: Lesson[]): void {
  const bottomName = () => COLOR_NAME[cube.center('D')];
  let guard = 0;
  while (!bottomCornersSolved(cube) && guard++ < 40) {
    if (cornerSolved(cube, 'DFR')) {
      emit(cube, lessons, {
        phase: PHASE.corner,
        title: '换下一个底角',
        detail: '右前下方这个角已经好了。把整个魔方顺时针转 90°（从顶上看），处理下一个角。已经归位的角会和中心一起转，不会散。',
        formulaName: '整体转动 y',
        moves: ['y'],
      });
      continue;
    }
    const want = [cube.center('D'), cube.center('F'), cube.center('R')];
    const loc = findCorner(cube, want);
    const keep = solvedCornerIds(cube);

    if (loc.slot.startsWith('D')) {
      const y = yToDFR(loc.slot);
      const popFormulas = ["R U' R'", "R U R'", "F' U' F", "R U R' U'", "R U' R' U"];
      let picked: string[] | null = null;
      let pickedFormula = popFormulas[0];
      for (const formula of popFormulas) {
        const times = formula.includes(' U ') && formula.split(' ').length > 3 ? [1, 2, 3] : [1];
        for (const n of times) {
          const body = Array(n).fill(formula).join(' ');
          const moves = simplify([...y.fwd, ...tokenize(body), ...y.back]);
          const c = cube.clone();
          c.applySeq(moves);
          const solvedNow = cornerSolved(c, 'DFR');
          const popped = !pieceOnBottom(c, want);
          if (crossSolved(c) && cornersPreserved(c, keep) && (solvedNow || popped)) {
            picked = moves;
            pickedFormula = formula;
            break;
          }
        }
        if (picked) break;
      }
      if (!picked) {
        picked = bfsFace(cube, 4, (trial) => {
          return crossSolved(trial) && cornersPreserved(trial, keep) && (cornerSolved(trial, 'DFR') || !pieceOnBottom(trial, want));
        });
        pickedFormula = '短步骤';
      }
      if (!picked) throw new Error('无法处理底层错角 ' + cube.debug());
      emit(cube, lessons, {
        phase: PHASE.corner,
        title: '把放错的底角赶到顶层',
        detail: `这个底角在底层但不正确。先把整个魔方转到让它位于右前下，再用 ${pickedFormula} 把它赶到顶层，已经拼好的十字和底角保持不动。`,
        formula: pickedFormula,
        formulaName: '赶角',
        moves: picked,
      });
      continue;
    }

    const setup = uToUFR(loc.slot);
    if (setup.length) {
      emit(cube, lessons, {
        phase: PHASE.corner,
        title: '把角块转到右前上方',
        detail: `转动顶层，让${bottomName()}角来到它要去的位置正上方。`,
        moves: setup,
      });
    }
    const loc2 = findCorner(cube, [cube.center('D'), cube.center('F'), cube.center('R')]);
    const down = cube.center('D');
    const facing = (Object.entries(loc2.colorOn) as [Face, Color][]).find(([, c]) => c === down)?.[0];
    if (!facing) throw new Error('角块上没有底色');
    const candidates: { title: string; detail: string; formula: string; moves: string[] }[] = [];
    if (facing === 'R') {
      candidates.push({
        title: `${bottomName()}色在右面`,
        detail: `${bottomName()}色贴在右面时，做 R U R'。角块会落到右前下，并且${bottomName()}色朝下。`,
        formula: "R U R'",
        moves: tokenize("R U R'"),
      });
    } else if (facing === 'F') {
      candidates.push({
        title: `${bottomName()}色在前面`,
        detail: `${bottomName()}色贴在前面时，做 F' U' F，从前面把角块扣进槽里。`,
        formula: "F' U' F",
        moves: tokenize("F' U' F"),
      });
    } else {
      candidates.push({
        title: `${bottomName()}色在顶面`,
        detail: `${bottomName()}色朝上时，把 R U R' U' 连做 3 次，就能把${bottomName()}色拧到下面。`,
        formula: "R U R' U'",
        moves: tokenize("R U R' U' R U R' U' R U R' U'"),
      });
    }
    for (let n = 1; n <= 5; n++) {
      candidates.push({
        title: `重复上右 ${n} 次`,
        detail: `如果上面的手法一次放不进去，就在右前上角重复 R U R' U'，直到${bottomName()}色朝下。做对次数后，其它已经完成的底角会回到原位。`,
        formula: "R U R' U'",
        moves: tokenize(Array(n).fill("R U R' U'").join(' ')),
      });
    }
    const keep2 = solvedCornerIds(cube);
    const picked = candidates.find((p) => {
      const c = cube.clone();
      c.applySeq(p.moves);
      return cornerSolved(c, 'DFR') && crossSolved(c) && cornersPreserved(c, keep2);
    });
    if (!picked) throw new Error('无法插入底角 ' + cube.debug());
    emit(cube, lessons, { phase: PHASE.corner, ...picked });
  }
  if (!bottomCornersSolved(cube)) throw new Error('底角未完成 ' + cube.debug());
}

function middlePieceIds(cube: Cube): string[] {
  const ud = new Set([cube.center('U'), cube.center('D')]);
  const ids: string[] = [];
  for (const e of EDGE_DEFS) {
    const ca = cube.get(e.a.face, e.a.i);
    const cb = cube.get(e.b.face, e.b.i);
    if (!ud.has(ca) && !ud.has(cb)) ids.push([ca, cb].sort().join(''));
  }
  return ids;
}

function edgePieceSolved(cube: Cube, id: string): boolean {
  for (const e of EDGE_DEFS) {
    const ca = cube.get(e.a.face, e.a.i);
    const cb = cube.get(e.b.face, e.b.i);
    const now = [ca, cb].sort().join('');
    if (now !== id) continue;
    return ca === cube.center(e.a.face) && cb === cube.center(e.b.face);
  }
  return false;
}

function solvedMiddleIds(cube: Cube): Set<string> {
  const ud = new Set([cube.center('U'), cube.center('D')]);
  const ids = new Set<string>();
  for (const name of ['FR', 'FL', 'BR', 'BL']) {
    const e = EDGE_DEFS[EDGE_INDEX[name]];
    const ca = cube.get(e.a.face, e.a.i);
    const cb = cube.get(e.b.face, e.b.i);
    if (ud.has(ca) || ud.has(cb)) continue;
    if (ca === cube.center(e.a.face) && cb === cube.center(e.b.face)) ids.add([ca, cb].sort().join(''));
  }
  return ids;
}

function middlePreserved(cube: Cube, ids: Set<string>): boolean {
  for (const id of ids) if (!edgePieceSolved(cube, id)) return false;
  return true;
}

function unsolvedMiddleOnTop(cube: Cube): string[] {
  const ud = new Set([cube.center('U'), cube.center('D')]);
  const out: string[] = [];
  for (const e of EDGE_DEFS) {
    if (!e.name.startsWith('U')) continue;
    const ca = cube.get(e.a.face, e.a.i);
    const cb = cube.get(e.b.face, e.b.i);
    if (ud.has(ca) || ud.has(cb)) continue;
    const id = [ca, cb].sort().join('');
    if (!edgePieceSolved(cube, id)) out.push(id);
  }
  return out;
}

function solveMiddle(cube: Cube, lessons: Lesson[]): void {
  let guard = 0;
  while (!middleSolved(cube) && guard++ < 24) {
    const keep = solvedMiddleIds(cube);
    const onTop = unsolvedMiddleOnTop(cube);
    if (onTop.length) {
      const id = onTop[0];
      let best: { moves: string[]; name: string; formula: string; detail: string } | null = null;
      for (const ys of Y_SETUPS) {
        for (const us of U_SETUPS) {
          for (const alg of [
            {
              name: '右插棱',
              formula: RIGHT_EDGE,
              detail: '先让棱块侧面的颜色对准前面中心，顶上的颜色对准右面中心，再做右公式 U R U\' R\' U\' F\' U F，棱块插入右边。',
            },
            {
              name: '左插棱',
              formula: LEFT_EDGE,
              detail: '先让棱块侧面的颜色对准前面中心，顶上的颜色对准左面中心，再做左公式 U\' L\' U L U F U\' F\'，棱块插入左边。',
            },
          ]) {
            const moves = simplify([...tokenize(ys), ...tokenize(us), ...tokenize(alg.formula)]);
            const c = cube.clone();
            c.applySeq(moves);
            if (!crossSolved(c) || !bottomCornersSolved(c) || !middlePreserved(c, keep)) continue;
            if (!edgePieceSolved(c, id)) continue;
            if (!best || moves.length < best.moves.length) best = { moves, ...alg };
          }
        }
      }
      if (!best) throw new Error('无法插入中层棱 ' + cube.debug());
      const [c1, c2] = id;
      emit(cube, lessons, {
        phase: PHASE.middle,
        title: `插入${COLOR_NAME[c1 as Color]}${COLOR_NAME[c2 as Color]}棱`,
        detail: best.detail + ' 公式前面的转动，是把这一块对准到前面。底层已经完成的部分不会被拆开。',
        formula: best.formula,
        formulaName: best.name,
        moves: best.moves,
      });
      continue;
    }

    let ejected: { moves: string[] } | null = null;
    const before = new Set(middlePieceIds(cube).filter((id) => !edgePieceSolved(cube, id)));
    for (const ys of Y_SETUPS) {
      for (const us of U_SETUPS) {
        for (const formula of [RIGHT_EDGE, LEFT_EDGE]) {
          const moves = simplify([...tokenize(ys), ...tokenize(us), ...tokenize(formula)]);
          const c = cube.clone();
          c.applySeq(moves);
          if (!crossSolved(c) || !bottomCornersSolved(c) || !middlePreserved(c, keep)) continue;
          const popped = [...before].some((id) => {
            const hit = findEdge(c, id[0] as Color, id[1] as Color);
            return hit.slot.startsWith('U');
          });
          if (!popped) continue;
          if (!ejected || moves.length < ejected.moves.length) ejected = { moves };
        }
      }
    }
    if (!ejected) throw new Error('无法取出错误的中层棱 ' + cube.debug());
    emit(cube, lessons, {
      phase: PHASE.middle,
      title: '取出插错的中层棱',
      detail: '有棱块已经在中层，但位置或方向不对。用同样的左/右公式把它顶出来，再重新插入。',
      formula: RIGHT_EDGE,
      formulaName: '中层公式',
      moves: ejected.moves,
    });
  }
  if (!middleSolved(cube)) throw new Error('中层未完成 ' + cube.debug());
}

function upEdgeColorsOnTop(cube: Cube): number {
  const col = cube.center('U');
  return [1, 3, 5, 7].filter((i) => cube.get('U', i) === col).length;
}

function upEdgeMask(cube: Cube): string {
  const col = cube.center('U');
  const bit = (i: number) => (cube.get('U', i) === col ? '1' : '0');
  return bit(7) + bit(5) + bit(1) + bit(3);
}

function solveUpCross(cube: Cube, lessons: Lesson[]): void {
  const topName = COLOR_NAME[cube.center('U')];
  let guard = 0;
  while (upEdgeColorsOnTop(cube) < 4 && guard++ < 6) {
    const before = upEdgeColorsOnTop(cube);
    const mask = upEdgeMask(cube);
    let shape = `现在顶面只有中心是${topName}色，这叫「点」。先做一次十字公式，会变成直线或 L 形。`;
    if (before === 2 && (mask === '1010' || mask === '0101')) {
      shape = `现在${topName}色棱排成一条直线。口诀是把直线转到左右方向，再做公式，就会变成十字。`;
    } else if (before === 2) {
      shape = `现在${topName}色棱是 L 形。口诀是把拐弯放到左后方，再做公式。`;
    }
    let best: string[] | null = null;
    let bestN = before;
    let bestFormula = YELLOW_CROSS;
    const crossAlgs = [YELLOW_CROSS, "F U R U' R' F'"];
    for (const us of U_SETUPS) {
      for (const formula of crossAlgs) {
        const moves = simplify([...tokenize(us), ...tokenize(formula)]);
        const c = cube.clone();
        c.applySeq(moves);
        if (!f2lSolved(c)) continue;
        const n = upEdgeColorsOnTop(c);
        if (n > bestN) {
          bestN = n;
          best = moves;
          bestFormula = formula;
        }
      }
    }
    if (!best) throw new Error('顶十字公式无效 ' + cube.debug());
    emit(cube, lessons, {
      phase: PHASE.crossU,
      title: before === 0 ? `做出${topName}色直线或 L` : `做出${topName}色十字`,
      detail: `${shape} 常用公式是 F R U R' U' F'，有的角度用 F U R U' R' F'。这一步只要求${topName}色朝上，侧面颜色可以先不对。`,
      formula: bestFormula,
      formulaName: '顶十字',
      moves: best,
    });
  }
  if (upEdgeColorsOnTop(cube) < 4) throw new Error('顶十字未完成');
}

function orientedUpCorners(cube: Cube): number {
  const col = cube.center('U');
  return [0, 2, 6, 8].filter((i) => cube.get('U', i) === col).length;
}

function coKey(cube: Cube): string {
  return ['UFR', 'UFL', 'UBL', 'UBR'].map((name) => {
    const slot = CORNER_DEFS.find((c) => c.name === name)!;
    return slot.f.map((f) => cube.get(f.face, f.i)).join('');
  }).join('|');
}

function solveUpCornersOri(cube: Cube, lessons: Lesson[]): void {
  if (orientedUpCorners(cube) === 4) return;
  const topName = COLOR_NAME[cube.center('U')];
  const algs = [
    { name: '小鱼', formula: SUNE },
    { name: '反小鱼', formula: ANTISUNE },
  ];
  type Node = { cube: Cube; parent: number; moves: string[]; name: string; formula: string };
  const nodes: Node[] = [{ cube: cube.clone(), parent: -1, moves: [], name: '', formula: '' }];
  const seen = new Set<string>([coKey(cube)]);
  let found = -1;
  for (let qi = 0; qi < nodes.length && found < 0; qi++) {
    let depth = 0;
    for (let i = qi; nodes[i].parent !== -1; i = nodes[i].parent) depth++;
    if (qi > 0 && orientedUpCorners(nodes[qi].cube) === 4) {
      found = qi;
      break;
    }
    if (depth >= 4) continue;
    for (const us of U_SETUPS) {
      for (const alg of algs) {
        const moves = simplify([...tokenize(us), ...tokenize(alg.formula)]);
        const next = nodes[qi].cube.clone();
        next.applySeq(moves);
        if (!f2lSolved(next) || upEdgeColorsOnTop(next) < 4) continue;
        const key = coKey(next);
        if (seen.has(key)) continue;
        seen.add(key);
        nodes.push({ cube: next, parent: qi, moves, name: alg.name, formula: alg.formula });
      }
    }
  }
  if (found < 0) throw new Error('顶角朝向无法推进 ' + cube.debug());
  const seq: Node[] = [];
  for (let i = found; nodes[i].parent !== -1; i = nodes[i].parent) seq.push(nodes[i]);
  seq.reverse();
  for (const step of seq) {
    const before = orientedUpCorners(cube);
    const hold = before === 0
      ? `现在还没有${topName}色朝上的角。先做一次小鱼公式 R U R' U R U2 R'，就会出现一个朝上的角。`
      : `把已经${topName}色朝上的角用顶层转动摆到公式的位置（小鱼一般放左前），再做公式。底层和顶十字保持不变。`;
    emit(cube, lessons, {
      phase: PHASE.co,
      title: step.name === '小鱼' ? '用小鱼把顶角拧正' : '用反小鱼把顶角拧正',
      detail: hold,
      formula: step.formula,
      formulaName: step.name,
      moves: step.moves,
    });
  }
  if (orientedUpCorners(cube) < 4) throw new Error('顶角朝向未完成');
}

function solvedUpCorners(cube: Cube): number {
  return ['UFR', 'UFL', 'UBL', 'UBR'].filter((n) => cornerSolved(cube, n)).length;
}

function upCornersOriented(cube: Cube): boolean {
  return orientedUpCorners(cube) === 4;
}

function solveUpCornersPerm(cube: Cube, lessons: Lesson[]): void {
  let guard = 0;
  while (solvedUpCorners(cube) < 4 && guard++ < 8) {
    const before = solvedUpCorners(cube);
    const edgesBefore = solvedUpEdges(cube);
    let best: { moves: string[]; formula: string; name: string } | null = null;
    let bestScore = -1;
    const cornerCycle = "R' F R' B2 R F' R' B2 R2";
    const tPerm = "R U R' U' R' F R2 U' R' U' R U R' F'";
    const yPerm = "F R U' R' U' R U R' F' R U R' U' R' F R F'";
    const algs = [
      { name: '对齐顶层', formula: 'U' },
      { name: '对齐顶层', formula: "U'" },
      { name: '对齐顶层', formula: 'U2' },
      { name: '换三角', formula: cornerCycle },
      { name: '换三角', formula: invertAlg(cornerCycle) },
      { name: '对换', formula: tPerm },
      { name: '对换', formula: invertAlg(tPerm) },
      { name: '对角', formula: yPerm },
      { name: '对角', formula: invertAlg(yPerm) },
    ];
    for (const ys of Y_SETUPS) {
      for (const us of U_SETUPS) {
        for (const alg of algs) {
          const moves = simplify([...tokenize(ys), ...tokenize(us), ...tokenize(alg.formula)]);
          if (!moves.length) continue;
          const c = cube.clone();
          c.applySeq(moves);
          if (!f2lSolved(c) || !upCornersOriented(c) || upEdgeColorsOnTop(c) < 4) continue;
          const n = solvedUpCorners(c);
          if (n <= before) continue;
          const score = n * 100 + solvedUpEdges(c) * 10 - moves.length + (solvedUpEdges(c) >= edgesBefore ? 3 : 0);
          if (score > bestScore) {
            bestScore = score;
            best = { moves, formula: alg.formula, name: alg.name };
          }
        }
      }
    }
    if (!best) throw new Error('顶角位置无法推进 ' + cube.debug());
    const swap = best.name === '对换' || best.name === '对角';
    emit(cube, lessons, {
      phase: PHASE.cp,
      title: swap ? '对换两个顶角' : before === 0 ? '先做出一个正确的顶角' : '交换其余顶角',
      detail: best.name === '对换'
        ? '相邻的两个顶角对调。用 T 公式把它们换过来，棱块会跟着动两块，最后一步再排棱。'
        : best.name === '对角'
          ? '斜对着的两个顶角对调。用 Y 公式把它们换过来，棱块会跟着动两块，最后一步再排棱。'
          : before === 0
            ? '四个顶角的位置都不对。先做一次换三角公式，就会有一个角对上三个中心。'
            : '已经有一个顶角对上了三个中心。用整体转动把它留在公式不动的位置，再交换另外三个角。',
      formula: best.formula,
      formulaName: best.name === '对换' ? 'T 公式' : best.name === '对角' ? 'Y 公式' : '换三角',
      moves: best.moves,
    });
  }
  if (solvedUpCorners(cube) < 4) throw new Error('顶角位置未完成');
}

function solvedUpEdges(cube: Cube): number {
  return ['UF', 'UR', 'UB', 'UL'].filter((n) => slotSolved(cube, n)).length;
}

function solveUpEdges(cube: Cube, lessons: Lesson[]): void {
  let guard = 0;
  while (solvedUpEdges(cube) < 4 && guard++ < 8) {
    const before = solvedUpEdges(cube);
    let best: { moves: string[]; formula: string } | null = null;
    let bestN = before;
    const algs = [
      EDGE_CYCLE,
      invertAlg(EDGE_CYCLE),
      EDGE_CYCLE_B,
      invertAlg(EDGE_CYCLE_B),
      EDGE_CYCLE_C,
      invertAlg(EDGE_CYCLE_C),
    ];
    for (const ys of Y_SETUPS) {
      for (const us of U_SETUPS) {
        for (const formula of algs) {
          const moves = simplify([...tokenize(ys), ...tokenize(us), ...tokenize(formula)]);
          const c = cube.clone();
          c.applySeq(moves);
          if (!f2lSolved(c) || solvedUpCorners(c) < 4 || upEdgeColorsOnTop(c) < 4) continue;
          const n = solvedUpEdges(c);
          if (n > bestN) {
            bestN = n;
            best = { moves, formula };
          }
        }
      }
    }
    if (!best) throw new Error('顶棱位置无法推进 ' + cube.debug());
    emit(cube, lessons, {
      phase: PHASE.ep,
      title: before >= 1 ? '交换三条顶棱' : '调整顶棱位置',
      detail: '顶棱用三换公式。如果已经有一条棱的侧面颜色对准了中心，就把这条棱转到后面，再换另外三条。对面交换或相邻两对交换时，公式做两次即可。',
      formula: best.formula,
      formulaName: '顶棱三换',
      moves: best.moves,
    });
  }
  if (!cube.isSolved() && solvedUpEdges(cube) === 4 && solvedUpCorners(cube) === 4 && f2lSolved(cube)) {
    // AUF handled by caller
  }
  if (solvedUpEdges(cube) < 4) throw new Error('顶棱未完成 ' + cube.debug());
}

function invertAlg(alg: string): string {
  return tokenize(alg)
    .reverse()
    .map((m) => (m.endsWith('2') ? m : m.endsWith("'") ? m[0] : m + "'"))
    .join(' ');
}
