import { COLOR_LIST, Cube, FACE_TURNS, invertMoves, randomScramble, tokenize, type Color } from './cube';
import { solveBeginner, solveCFOP } from './solver';
import { validateCube } from './validate';
import { stickerIndex } from '../view/stickers';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function checkMoves(): void {
  for (const m of ['U', 'R', 'F', 'D', 'L', 'B', 'x', 'y', 'z', 'M', 'E', 'S']) {
    const c = Cube.solved();
    c.applySeq([m, m, m, m]);
    assert(c.isSolved(), `${m}4`);
    const d = Cube.solved();
    d.apply(m);
    d.apply(m.endsWith('2') ? m : m + "'");
    assert(d.isSolved(), `${m} inv`);
  }
  const sexy = tokenize("R U R' U'");
  const c = Cube.solved();
  for (let i = 0; i < 6; i++) c.applySeq(sexy);
  assert(c.isSolved(), 'sexy6');
  const u = Cube.solved();
  u.apply('U');
  assert(u.get('L', 0) === 'G' && u.get('L', 1) === 'G' && u.get('L', 2) === 'G', 'U cycles F to L');
}

function checkInverseScramble(): void {
  const seq = randomScramble(25);
  const allowed = new Set(["U", "U'", 'F', "F'", 'R', "R'"]);
  assert(seq.every((m) => allowed.has(m)), 'scramble uses U F R only');
  const c = Cube.solved();
  c.applySeq(seq);
  assert(!c.isSolved(), 'scramble changes cube');
  c.applySeq(invertMoves(seq));
  assert(c.isSolved(), 'inverse scramble');
  assert(validateCube(Cube.solved().clone()).ok, 'solved valid');
  const s = Cube.solved();
  s.applySeq(seq);
  const v = validateCube(s);
  assert(v.ok, 'scramble valid ' + (v.ok ? '' : v.reason));
}

function checkTwistInvalid(): void {
  const c = Cube.solved();
  const i0 = 8;
  const i1 = 9;
  const i2 = 20;
  const a = c.s[i0];
  c.s[i0] = c.s[i2];
  c.s[i2] = c.s[i1];
  c.s[i1] = a;
  const v = validateCube(c);
  assert(!v.ok, 'twisted corner should be invalid');
}

function replay(start: Cube, lessons: { moves: string[] }[]): Cube {
  const c = start.clone();
  for (const lesson of lessons) c.applySeq(lesson.moves);
  return c;
}

function checkSolve(label: string, seq: string[], solve = solveBeginner): void {
  const start = Cube.solved();
  start.applySeq(seq);
  const t0 = performance.now();
  let lessons;
  try {
    lessons = solve(start.clone());
  } catch (err) {
    throw new Error(`${label} 求解失败: ${(err as Error).message}\n打乱 ${seq.join(' ')}\n${start.debug()}`);
  }
  const end = replay(start, lessons);
  if (!end.isSolved()) {
    throw new Error(`${label} 未还原\n${seq.join(' ')}\n${end.debug()}`);
  }
  const moves = lessons.reduce((n, l) => n + l.moves.length, 0);
  const ms = Math.round(performance.now() - t0);
  console.log(`${label}: ${lessons.length} 步讲解, ${moves} 个转动, ${ms}ms`);
}

function checkStickers(): void {
  assert(stickerIndex('U', 0, 1, 0) === 4, 'U center');
  assert(stickerIndex('U', -1, 1, -1) === 0, 'U back left');
  assert(stickerIndex('D', -1, -1, 1) === 0, 'D front left');
  assert(stickerIndex('F', 0, 0, 1) === 4, 'F center');
  assert(stickerIndex('R', 1, 1, 1) === 0, 'R top front');
  assert(stickerIndex('L', -1, 1, -1) === 0, 'L top back');
  assert(stickerIndex('B', 1, 1, -1) === 0, 'B top right');
}

checkStickers();
checkMoves();
checkInverseScramble();
checkTwistInvalid();
checkSolve('已还原', []);
checkSolve('U', ['U']);
checkSolve('sexy', tokenize("R U R' U'"));
checkSolve('手打', tokenize("R U F D L B R' U' F'"));

checkSolve('CFOP 已还原', [], solveCFOP);
checkSolve('CFOP 手打', tokenize("R U F D L B R' U' F'"), solveCFOP);
{
  const text = 'UWYGYYBROY RROYRRYRRY FBYGRGGWGG DBWWWWWBWB LOBWGOBYOO BOGGRBOOBR';
  const s = new Uint8Array(54);
  text.split(' ').forEach((part, fi) => {
    for (let i = 0; i < 9; i++) s[fi * 9 + i] = COLOR_LIST.indexOf(part[1 + i] as Color);
  });
  const lessons = solveCFOP(new Cube(s));
  assert(replay(new Cube(s), lessons).isSolved(), 'CFOP 三槽互卡');
  console.log('CFOP 三槽互卡: 通过');
}
checkSolve('CFOP 全面', tokenize("L B2 L' D' U' F2 U2 B2 F U2 D L' D U L U' D R"), solveCFOP);

let totalMs = 0;
const N = 20;
for (let i = 0; i < N; i++) {
  const seq = randomScramble(18);
  const t0 = performance.now();
  checkSolve(`随机${i + 1}`, seq);
  checkSolve(`CFOP 随机${i + 1}`, seq, solveCFOP);
  totalMs += performance.now() - t0;
}
console.log(`平均 ${Math.round(totalMs / N)}ms（两种方法合计）`);

function fullScramble(length: number): string[] {
  const out: string[] = [];
  while (out.length < length) {
    const move = FACE_TURNS[(Math.random() * FACE_TURNS.length) | 0];
    if (out.length && out[out.length - 1][0] === move[0]) continue;
    out.push(move);
  }
  return out;
}

for (let i = 0; i < N; i++) {
  const seq = fullScramble(22);
  checkSolve(`六面${i + 1}`, seq);
  checkSolve(`CFOP 六面${i + 1}`, seq, solveCFOP);
}
console.log('全部通过');
