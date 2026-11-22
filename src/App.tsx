import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  COLOR_HEX,
  COLOR_LIST,
  COLOR_NAME,
  Cube,
  FACE_INDEX,
  FACES,
  invertMove,
  randomScramble,
  type Color,
  type Face,
} from './cube/cube';
import { validateCube } from './cube/validate';
import { solveBeginner, solveCFOP, type Lesson } from './cube/solver';
import { ensureCameraPermission } from './native';
import { PHOTO_HINT, sampleFaceColors } from './view/colorSample';
import { CubeView, type CubeViewHandle } from './view/CubeView';
import { Icon, type IconName } from './ui/icons';
import { canSpeak, speak, stopSpeech } from './voice';

type Mode = 'play' | 'teach' | 'input';

const FACE_TITLE: Record<Face, string> = {
  U: '上',
  D: '下',
  F: '前',
  B: '后',
  R: '右',
  L: '左',
};

const NET_PLACE: Record<Face, { col: number; row: number }> = {
  U: { col: 4, row: 1 },
  L: { col: 1, row: 4 },
  F: { col: 4, row: 4 },
  R: { col: 7, row: 4 },
  B: { col: 10, row: 4 },
  D: { col: 4, row: 7 },
};

const PAD = ['U', 'D', 'L', 'R', 'F', 'B', 'x', 'y', 'z'] as const;
const SIMPLE_MOVES = ['U', "U'", 'F', "F'", 'R', "R'"] as const;
const SIMPLE_SET = new Set<string>(SIMPLE_MOVES);

type Method = 'beginner' | 'cfop' | 'roux' | 'zz';

const METHOD_INFO: Record<Method, { name: string; blurb: string; solve: ((cube: Cube) => Lesson[]) | null }> = {
  beginner: {
    name: '层先法',
    blurb: '白底黄顶，一层一层还原，公式少，适合从零学到复原。',
    solve: solveBeginner,
  },
  cfop: {
    name: 'CFOP',
    blurb: '十字之后把角和棱配成一对放入，顶层分两段做朝向和排列。速拧里最常见。',
    solve: solveCFOP,
  },
  roux: {
    name: 'Roux',
    blurb: '先做左右两个底块，再处理中层和顶层。步数通常更少。',
    solve: null,
  },
  zz: {
    name: 'ZZ',
    blurb: '先把棱的方向和一条底棱做完，后面顶层可以少转。',
    solve: null,
  },
};

const METHODS: Method[] = ['beginner', 'cfop', 'roux', 'zz'];

function readMethod(): Method {
  try {
    return localStorage.getItem('mofang-method') === 'cfop' ? 'cfop' : 'beginner';
  } catch {
    return 'beginner';
  }
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

const FACE_TINT: Record<string, string | undefined> = {
  U: COLOR_HEX.Y,
  D: COLOR_HEX.W,
  L: COLOR_HEX.O,
  R: COLOR_HEX.R,
  F: COLOR_HEX.G,
  B: COLOR_HEX.B,
};

const NEXT_COLOR: Record<Color, Color> = {
  Y: 'R',
  R: 'G',
  G: 'W',
  W: 'O',
  O: 'B',
  B: 'Y',
};

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function flatten(lessons: Lesson[]): { lesson: number; move: string }[] {
  const steps: { lesson: number; move: string }[] = [];
  lessons.forEach((lesson, lessonIndex) => {
    for (const move of lesson.moves) steps.push({ lesson: lessonIndex, move });
  });
  return steps;
}

function lessonCursor(lessons: Lesson[], cursor: number): { lesson: Lesson; moveIndex: number } | null {
  if (!lessons.length) return null;
  let seen = 0;
  for (const lesson of lessons) {
    if (cursor < seen + lesson.moves.length) {
      return { lesson, moveIndex: cursor - seen };
    }
    seen += lesson.moves.length;
  }
  const last = lessons[lessons.length - 1];
  return { lesson: last, moveIndex: last.moves.length };
}

function cameraErrorText(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError') return '没有相机权限。可以改从相册选一张照片。';
  if (name === 'NotFoundError') return '这台设备没有可用的相机，请改从相册选照片。';
  return '这个页面打不开相机。手机用 Chrome 打开，或直接选一张照片。';
}

export default function App() {
  const cubeRef = useRef(Cube.solved());
  const viewRef = useRef<CubeViewHandle>(null);
  const lessonsRef = useRef<Lesson[]>([]);
  const cursorRef = useRef(0);
  const originRef = useRef<Uint8Array | null>(null);
  const runId = useRef(0);
  const autoFlag = useRef(false);
  const armTimer = useRef(false);
  const startedAt = useRef(0);
  const speedRef = useRef(340);
  const chain = useRef(Promise.resolve());
  const analyzingRef = useRef(false);

  const [mode, setMode] = useState<Mode>('play');
  const [history, setHistory] = useState<string[]>([]);
  const [scramble, setScramble] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [timing, setTiming] = useState(false);
  const [solved, setSolved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('拖动色块转动。白色在下、黄色在上时，层先法最好认。');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [cursor, setCursor] = useState(0);
  const [auto, setAuto] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [speed, setSpeed] = useState(340);
  const [draft, setDraft] = useState<Color[][]>(() => Cube.solved().faces());
  const [brush, setBrush] = useState<Color>('R');
  const [inputError, setInputError] = useState('');
  const [camFace, setCamFace] = useState<Face | null>(null);
  const [editFace, setEditFace] = useState<Face>('F');
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      return localStorage.getItem('mofang-panel') !== '0';
    } catch {
      return true;
    }
  });
  const [pro, setPro] = useState(() => readFlag('mofang-pro'));
  const [voice, setVoice] = useState(() => readFlag('mofang-voice'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const proRef = useRef(pro);
  const [method, setMethod] = useState<Method>(readMethod);
  const methodRef = useRef(method);
  const settingsRef = useRef(settingsOpen);

  const act = useRef({
    userTurn: (_move: string) => {},
    stepForward: () => Promise.resolve(false),
    stepBack: () => Promise.resolve(),
  });

  const canFullscreen =
    !Capacitor.isNativePlatform() &&
    typeof document !== 'undefined' &&
    document.fullscreenEnabled === true;
  const [fullOn, setFullOn] = useState(false);

  useEffect(() => {
    if (!canFullscreen) return;
    const onChange = () => setFullOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [canFullscreen]);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    document.documentElement.requestFullscreen().catch(() => {
      setStatus('这个浏览器不允许全屏。可以在浏览器菜单里选「添加到主屏幕」，再从桌面打开。');
    });
  }

  useEffect(() => {
    try {
      localStorage.setItem('mofang-panel', panelOpen ? '1' : '0');
    } catch {
      /* 隐私模式写不了本地存储时，这次会话里仍然可以收起。 */
    }
  }, [panelOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('mofang-pro', pro ? '1' : '0');
      localStorage.setItem('mofang-voice', voice ? '1' : '0');
      localStorage.setItem('mofang-method', method);
    } catch {
      /* 这次会话里仍然可以开关。 */
    }
  }, [pro, voice, method]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  useEffect(() => {
    if (!timing) return;
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
    return () => window.clearInterval(id);
  }, [timing]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (settingsRef.current) return;
      if (ev.repeat) return;
      if (ev.key === 'ArrowRight') {
        ev.preventDefault();
        void act.current.stepForward();
        return;
      }
      if (ev.key === 'ArrowLeft') {
        ev.preventDefault();
        void act.current.stepBack();
        return;
      }
      const face = ev.key.toLowerCase();
      const known: Record<string, string> = { u: 'U', d: 'D', l: 'L', r: 'R', f: 'F', b: 'B', x: 'x', y: 'y', z: 'z' };
      const base = known[face];
      if (!base) return;
      const move = ev.shiftKey ? `${base}'` : base;
      if (!proRef.current && !SIMPLE_SET.has(move)) return;
      ev.preventDefault();
      act.current.userTurn(move);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.current.then(task, task);
    chain.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function markSolvedState() {
    const done = cubeRef.current.isSolved();
    setSolved(done);
    if (done) {
      setTiming(false);
      armTimer.current = false;
    }
    return done;
  }

  function animate(move: string, duration?: number): Promise<void> {
    const view = viewRef.current;
    if (!view) return Promise.reject(new Error('cancelled'));
    setBusy(true);
    return view
      .play(
        move,
        () => {
          cubeRef.current.apply(move);
          view.paint(cubeRef.current);
        },
        duration,
      )
      .finally(() => setBusy(false));
  }

  function stopAuto() {
    autoFlag.current = false;
    setAuto(false);
    if (!analyzingRef.current) viewRef.current?.setInteractive(true);
  }

  function noteUserMove(move: string) {
    const steps = flatten(lessonsRef.current);
    const cur = cursorRef.current;
    if (steps.length) {
      if (cur < steps.length && steps[cur].move === move) {
        cursorRef.current = cur + 1;
        setCursor(cur + 1);
        if (markSolvedState()) setStatus('复原了。');
        return;
      }
      stopAuto();
      lessonsRef.current = [];
      setLessons([]);
      setCursor(0);
      cursorRef.current = 0;
      setStatus('这一步和当前讲解不一致，演示已停下。可以重新开始讲解。');
    }
    setHistory((h) => [...h, move].slice(-48));
    if (armTimer.current) {
      armTimer.current = false;
      startedAt.current = Date.now();
      setElapsed(0);
      setTiming(true);
    }
    if (markSolvedState()) setStatus('复原了。');
  }

  function onDragMove(move: string) {
    if (!proRef.current && !SIMPLE_SET.has(move)) return;
    cubeRef.current.apply(move);
    viewRef.current?.paint(cubeRef.current);
    noteUserMove(move);
  }

  function userTurn(move: string) {
    if (!pro && !SIMPLE_SET.has(move)) return;
    stopAuto();
    return enqueue(async () => {
      try {
        await animate(move);
      } catch {
        return;
      }
      noteUserMove(move);
    });
  }

  function stepForward(): Promise<boolean> {
    stopAuto();
    return enqueue(async () => {
      const steps = flatten(lessonsRef.current);
      const cur = cursorRef.current;
      if (cur >= steps.length) return false;
      await animate(steps[cur].move, speedRef.current);
      cursorRef.current = cur + 1;
      setCursor(cur + 1);
      if (markSolvedState()) setStatus(`按${METHOD_INFO[methodRef.current].name}复原了。`);
      return cur + 1 < flatten(lessonsRef.current).length;
    });
  }

  function stepBack(): Promise<void> {
    stopAuto();
    return enqueue(async () => {
      const cur = cursorRef.current;
      if (cur <= 0) return;
      const steps = flatten(lessonsRef.current);
      await animate(invertMove(steps[cur - 1].move), speedRef.current);
      cursorRef.current = cur - 1;
      setCursor(cur - 1);
      markSolvedState();
    });
  }

  useEffect(() => {
    speedRef.current = speed;
    proRef.current = pro;
    methodRef.current = method;
    settingsRef.current = settingsOpen;
    act.current = { userTurn, stepForward, stepBack };
  });

  function runAuto() {
    if (!lessonsRef.current.length || cursorRef.current >= flatten(lessonsRef.current).length) return;
    autoFlag.current = true;
    setAuto(true);
    viewRef.current?.setInteractive(false);
    void (async () => {
      try {
        while (autoFlag.current) {
          const steps = flatten(lessonsRef.current);
          const cur = cursorRef.current;
          if (cur >= steps.length) break;
          try {
            await enqueue(async () => {
              if (!autoFlag.current) return;
              await animate(steps[cur].move, speedRef.current);
              if (cursorRef.current === cur) {
                cursorRef.current = cur + 1;
                setCursor(cur + 1);
              }
              if (markSolvedState()) setStatus(`按${METHOD_INFO[methodRef.current].name}复原了。`);
            });
          } catch {
            break;
          }
          if (!autoFlag.current) break;
          await new Promise((resolve) => window.setTimeout(resolve, 70));
        }
      } finally {
        autoFlag.current = false;
        setAuto(false);
        if (!analyzingRef.current) viewRef.current?.setInteractive(true);
      }
    })();
  }

  async function runScramble() {
    const id = ++runId.current;
    stopAuto();
    lessonsRef.current = [];
    setLessons([]);
    setCursor(0);
    cursorRef.current = 0;
    setTiming(false);
    armTimer.current = false;
    setElapsed(0);
    const cube = Cube.solved();
    cubeRef.current = cube;
    originRef.current = null;
    const moves = randomScramble(20);
    setScramble(moves);
    setStatus('正在打乱…');
    setSolved(true);
    viewRef.current?.reset(cube);
    const played: string[] = [];
    for (const move of moves) {
      if (runId.current !== id) return;
      try {
        await animate(move, 90);
      } catch {
        return;
      }
      played.push(move);
      setSolved(false);
    }
    if (runId.current !== id) return;
    setHistory(played);
    armTimer.current = true;
    setStatus('打乱完成。只用了上面、前面、右面的顺时针和逆时针。自己还原会开始计时，也可以打开教学。');
  }

  function restore() {
    runId.current += 1;
    stopAuto();
    const cube = Cube.solved();
    cubeRef.current = cube;
    viewRef.current?.reset(cube);
    lessonsRef.current = [];
    originRef.current = null;
    cursorRef.current = 0;
    setLessons([]);
    setCursor(0);
    setHistory([]);
    setScramble([]);
    setTiming(false);
    setElapsed(0);
    armTimer.current = false;
    setSolved(true);
    setStatus('已复原。');
    setInputError('');
  }

  function undo() {
    const move = history[history.length - 1];
    if (!move) return;
    stopAuto();
    lessonsRef.current = [];
    setLessons([]);
    cursorRef.current = 0;
    setCursor(0);
    void enqueue(async () => {
      try {
        await animate(invertMove(move));
      } catch {
        return;
      }
      setHistory((h) => h.slice(0, -1));
      if (markSolvedState()) setStatus('复原了。');
    });
  }

  function chooseMethod(next: Method) {
    if (next === method) return;
    stopAuto();
    setMethod(next);
    if (lessonsRef.current.length) {
      lessonsRef.current = [];
      setLessons([]);
      setCursor(0);
      cursorRef.current = 0;
    }
    setStatus(`已选${METHOD_INFO[next].name}。点「开始讲解」，会从魔方现在的样子拆步骤。`);
  }

  function startLesson() {
    const id = ++runId.current;
    stopAuto();
    const snap = cubeRef.current.clone();
    originRef.current = snap.s.slice();
    analyzingRef.current = true;
    setAnalyzing(true);
    const info = METHOD_INFO[method];
    setStatus(`正在按${info.name}拆步骤…`);
    viewRef.current?.reset(cubeRef.current);
    viewRef.current?.setInteractive(false);
    window.setTimeout(() => {
      if (runId.current !== id) {
        analyzingRef.current = false;
        setAnalyzing(false);
        return;
      }
      try {
        const next = (info.solve ?? solveBeginner)(snap);
        lessonsRef.current = next;
        cursorRef.current = 0;
        setLessons(next);
        setCursor(0);
        setMode('teach');
        setInputError('');
        setStatus(next.length ? '可以一步步看，也可以自动播放。拖色块做出同一步，讲解会跟着走。' : '这个魔方已经是复原状态。');
      } catch (err) {
        lessonsRef.current = [];
        setLessons([]);
        setStatus(err instanceof Error ? err.message : `这个状态无法按${info.name}讲解。`);
      } finally {
        analyzingRef.current = false;
        setAnalyzing(false);
        if (!autoFlag.current) viewRef.current?.setInteractive(true);
      }
    }, 40);
  }

  function rewindLesson() {
    if (!originRef.current) return;
    runId.current += 1;
    stopAuto();
    const cube = new Cube(originRef.current);
    cubeRef.current = cube;
    viewRef.current?.reset(cube);
    cursorRef.current = 0;
    setCursor(0);
    setSolved(cube.isSolved());
    setStatus('已回到这次讲解开始时的状态。');
  }

  function readCubeIntoDraft() {
    setDraft(cubeRef.current.faces());
    setInputError('');
  }

  function paintDraft(face: number, index: number, color = brush) {
    setDraft((prev) => prev.map((row, fi) => (fi === face ? row.map((c, i) => (i === index ? color : c)) : row)));
    setInputError('');
  }

  function loadDraft() {
    const cube = Cube.fromFaces(draft);
    const check = validateCube(cube);
    if (!check.ok) {
      setInputError(check.reason);
      return;
    }
    runId.current += 1;
    stopAuto();
    cubeRef.current = cube;
    viewRef.current?.reset(cube);
    setHistory([]);
    setScramble([]);
    setTiming(false);
    setElapsed(0);
    armTimer.current = false;
    setSolved(cube.isSolved());
    setInputError('');
    startLesson();
  }

  const steps = flatten(lessons);
  const focus = lessonCursor(lessons, cursor);
  const lessonPos = focus ? lessons.indexOf(focus.lesson) : -1;
  const speechBody = focus
    ? `${focus.lesson.title}。${focus.lesson.detail}${focus.lesson.formulaName ? `。这一步用${focus.lesson.formulaName}` : ''}`
    : '';
  const speechKey = voice && mode === 'teach' && focus ? `${lessonPos}:${speechBody}` : '';

  useEffect(() => {
    if (!speechKey) {
      stopSpeech();
      return;
    }
    speak(speechBody);
  }, [speechKey, speechBody]);
  const counts = COLOR_LIST.map((color) => ({
    color,
    n: draft.reduce((sum, face) => sum + face.filter((c) => c === color).length, 0),
  }));

  return (
    <div className={panelOpen ? 'app' : 'app panel-off'}>
      <header>
        <div className="brand">
          <span className="mark">
            <Icon name="cube" size={22} />
          </span>
          <div>
            <h1>魔方</h1>
            <p>练习、教学、实物录入</p>
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="icon-btn"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <Icon name="settings" size={16} />
            <span className="icon-btn-label">设置</span>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-pressed={panelOpen}
            onClick={() => setPanelOpen((open) => !open)}
          >
            <Icon name={panelOpen ? 'panelHide' : 'panel'} size={16} />
            <span className="icon-btn-label">{panelOpen ? '隐藏面板' : '显示面板'}</span>
          </button>
          {canFullscreen && (
            <button
              type="button"
              className="icon-btn"
              aria-pressed={fullOn}
              aria-label={fullOn ? '退出全屏' : '全屏'}
              onClick={toggleFullscreen}
            >
              <Icon name={fullOn ? 'fullscreenExit' : 'fullscreen'} size={16} />
              <span className="icon-btn-label">{fullOn ? '退出全屏' : '全屏'}</span>
            </button>
          )}
          <div className={timing ? 'timer on' : 'timer'} aria-live="polite">
            <Icon name="clock" size={16} />
            <span>{formatTime(elapsed)}</span>
          </div>
        </div>
      </header>

      <div className="stage">
        <CubeView ref={viewRef} onMove={onDragMove} allowedMoves={pro ? null : SIMPLE_MOVES} />
        {solved && (
          <div className="badge">
            <Icon name="check" size={14} />
            已复原
          </div>
        )}
        <p className="stage-hint">
          {pro
            ? '拖色块转一层，拖空白处换角度看。双指可以缩放。'
            : '拖上面、前面、右面的色块转动。其余面在设置里打开专业模式。'}
        </p>
      </div>

      <section className="panel">
        <div className="tabs" role="tablist">
          {(
            [
              ['play', '练习', 'cube'],
              ['teach', '教学', 'layers'],
              ['input', '录入', 'grid'],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              className={mode === id ? 'tab on' : 'tab'}
              onClick={() => setMode(id)}
            >
              <Icon name={icon} size={16} />
              {label}
            </button>
          ))}
        </div>

        {status && <p className="status">{status}</p>}

        {mode === 'play' && (
          <div className="stack">
            <div className="row">
              <Tool icon="shuffle" primary onClick={() => void runScramble()} disabled={busy || analyzing}>
                打乱
              </Tool>
              <Tool icon="undo" onClick={undo} disabled={busy || analyzing || history.length === 0}>
                撤销
              </Tool>
              <Tool icon="restore" onClick={restore} disabled={analyzing}>
                复原
              </Tool>
              <Tool icon="orbit" onClick={() => viewRef.current?.resetCamera()}>
                视角
              </Tool>
            </div>
            {scramble.length > 0 && <p className="mono">打乱（U F R）：{scramble.join(' ')}</p>}
            {history.length > 0 && (
              <p className="mono">
                已转 {history.length} 步：{history.slice(-18).join(' ')}
              </p>
            )}
            <MovePad pro={pro} disabled={busy || analyzing} onTurn={userTurn} />
            <p className="fine">
              {pro
                ? '键盘 U D L R F B 以及 X Y Z。按住 Shift 是逆时针。2 是转半圈。'
                : '键盘 U、F、R。按住 Shift 是逆时针。下、左、后和转半圈在设置里打开专业模式。'}
            </p>
          </div>
        )}

        {mode === 'teach' && (
          <div className="stack">
            <div className="row">
              <Tool icon="layers" primary onClick={startLesson} disabled={busy || analyzing}>
                {analyzing ? '正在拆解…' : lessons.length ? '重新讲解' : '开始讲解'}
              </Tool>
              <Tool icon="rewind" onClick={rewindLesson} disabled={lessons.length === 0 || busy || analyzing}>
                回到起点
              </Tool>
            </div>
            <div className="methods" role="radiogroup" aria-label="解法">
              {METHODS.map((id) => {
                const info = METHOD_INFO[id];
                const ready = !!info.solve;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={method === id}
                    className={method === id ? 'method current' : 'method'}
                    disabled={!ready || busy || analyzing}
                    onClick={() => chooseMethod(id)}
                  >
                    <span className="method-head">
                      <Icon name={method === id ? 'check' : ready ? 'layers' : 'clock'} size={14} />
                      <strong>{info.name}</strong>
                      {!ready && <em>即将支持</em>}
                    </span>
                    <span className="method-blurb">{info.blurb}</span>
                  </button>
                );
              })}
            </div>
            <p className="fine">这四套都能还原任意合法状态。现在可以选层先法或 CFOP 逐步演示。公式前的 U、y 是在对准位置。</p>
            {focus && (
              <>
                <div className="phases">
                  {uniquePhases(lessons).map((phase) => (
                    <span key={phase} className={phase === focus.lesson.phase ? 'phase on' : 'phase'}>
                      {phase}
                    </span>
                  ))}
                </div>
                <h2>{focus.lesson.title}</h2>
                {focus.lesson.formulaName && (
                  <p className="formula-name">
                    {focus.lesson.formulaName}
                    {focus.lesson.formula ? ` · ${focus.lesson.formula}` : ''}
                  </p>
                )}
                <p className="detail">{focus.lesson.detail}</p>
                <div className="moves" aria-label="这一步的转动">
                  {focus.lesson.moves.map((move, index) => (
                    <span
                      key={`${move}-${index}`}
                      className={index < focus.moveIndex ? 'mv done' : index === focus.moveIndex && cursor < steps.length ? 'mv next' : 'mv'}
                    >
                      {move}
                    </span>
                  ))}
                </div>
                <p className="fine">
                  进度 {Math.min(cursor, steps.length)} / {steps.length}
                  {cursor < steps.length ? `，下一步 ${steps[cursor].move}` : '，这一轮讲解结束'}
                </p>
              </>
            )}
            <div className="row">
              <Tool icon="prev" onClick={() => void stepBack()} disabled={busy || analyzing || cursor === 0}>
                上一步
              </Tool>
              <Tool icon="next" primary onClick={() => void stepForward()} disabled={busy || analyzing || cursor >= steps.length}>
                下一步
              </Tool>
              <Tool
                icon={auto ? 'pause' : 'play'}
                onClick={() => (auto ? stopAuto() : runAuto())}
                disabled={analyzing || !lessons.length || (cursor >= steps.length && !auto)}
              >
                {auto ? '暂停' : '自动播放'}
              </Tool>
            </div>
            <label className="speed">
              演示速度
              <input
                type="range"
                min={140}
                max={760}
                step={20}
                value={speed}
                onChange={(ev) => setSpeed(Number(ev.target.value))}
              />
              <span>{speed < 280 ? '快' : speed > 520 ? '慢' : '中'}</span>
            </label>
            <MovePad pro={pro} disabled={busy || analyzing} onTurn={userTurn} />
          </div>
        )}

        {mode === 'input' && (
          <div className="stack">
            <p className="fine">
              按标准配色涂：黄上、白下、绿前、蓝后、红右、橙左。中心有圆点。拍照时让这一面尽量占满画面，方向看每面下面的提示。识别完可以点色块改正。
            </p>
            <div className="brushes" role="group" aria-label="当前颜色">
              {COLOR_LIST.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={brush === color ? 'swatch on' : 'swatch'}
                  style={{ background: COLOR_HEX[color] }}
                  aria-label={COLOR_NAME[color]}
                  aria-pressed={brush === color}
                  onClick={() => setBrush(color)}
                />
              ))}
            </div>
            <div className="face-pick" role="group" aria-label="选择要涂的面">
              {FACES.map((face) => (
                <button
                  key={face}
                  type="button"
                  className={editFace === face ? 'tab on' : 'tab'}
                  onClick={() => setEditFace(face)}
                >
                  <i className="pip" style={{ background: FACE_TINT[face] }} />
                  {FACE_TITLE[face]}
                </button>
              ))}
            </div>
            <div className="editor">
              <div className="big-face" role="group" aria-label={`${FACE_TITLE[editFace]}面涂色`}>
                {draft[FACE_INDEX[editFace]].map((color, index) => (
                  <button
                    key={index}
                    type="button"
                    className={index === 4 ? 'cell center' : 'cell'}
                    style={{ background: COLOR_HEX[color] }}
                    aria-label={`${FACE_TITLE[editFace]}面 ${COLOR_NAME[color]}`}
                    onClick={() => paintDraft(FACE_INDEX[editFace], index)}
                  />
                ))}
              </div>
              <div className="net" role="group" aria-label="展开图，点选要涂的面">
                {FACES.map((face) =>
                  draft[FACE_INDEX[face]].map((color, index) => {
                    const place = NET_PLACE[face];
                    return (
                      <button
                        key={`${face}${index}`}
                        type="button"
                        className={face === editFace ? 'cell on' : 'cell'}
                        style={{
                          background: COLOR_HEX[color],
                          gridColumn: place.col + (index % 3),
                          gridRow: place.row + Math.floor(index / 3),
                        }}
                        aria-label={`${FACE_TITLE[face]}面`}
                        onClick={() => setEditFace(face)}
                      />
                    );
                  }),
                )}
              </div>
            </div>
            <p className="counts">
              {counts.map(({ color, n }) => (
                <span key={color} className={n === 9 ? 'count' : 'count bad'}>
                  {COLOR_NAME[color]} {n}
                </span>
              ))}
            </p>
            <div className="row wrap">
              {FACES.map((face) => (
                <Tool key={face} icon="camera" onClick={() => setCamFace(face)}>
                  拍{FACE_TITLE[face]}面
                </Tool>
              ))}
            </div>
            <div className="row">
              <Tool icon="scan" onClick={readCubeIntoDraft}>
                读取当前
              </Tool>
              <Tool icon="layers" primary onClick={loadDraft} disabled={analyzing}>
                按此讲解
              </Tool>
            </div>
            {inputError && <p className="error">{inputError}</p>}
            <p className="fine">安卓用 Chrome 打开后，菜单里选「添加到主屏幕」，就能像应用一样全屏玩。相机需要允许权限；不行就用相册里的照片。</p>
          </div>
        )}
      </section>

      {settingsOpen && (
        <div className="settings-backdrop" onClick={() => setSettingsOpen(false)}>
          <div
            className="settings-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="sheet-bar">
              <h2 id="settings-title" className="settings-title">
                <Icon name="settings" size={18} />
                设置
              </h2>
              <button type="button" className="icon-btn" aria-label="关闭设置" onClick={() => setSettingsOpen(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <Setting
              icon="pro"
              title="专业模式"
              text="打开后可以转下、左、后、中层，以及转半圈和整个魔方。关闭时只转上、前、右。"
              chips={pro ? ['U D L R F B', 'M E S', 'x y z', '2'] : ["U U'", "F F'", "R R'"]}
              on={pro}
              onToggle={() => setPro((on) => !on)}
            />
            <Setting
              icon={voice ? 'volume' : 'volumeOff'}
              title="语音讲解"
              text={canSpeak() ? '教学时朗读当前这一步的说明。' : '这个浏览器没有语音功能。'}
              on={voice}
              disabled={!canSpeak()}
              onToggle={() => setVoice((on) => !on)}
            />
          </div>
        </div>
      )}

      {camFace && (
        <CameraSheet
          face={camFace}
          onClose={() => setCamFace(null)}
          onApply={(colors) => {
            const face = camFace;
            setDraft((prev) => prev.map((row, fi) => (fi === FACE_INDEX[face] ? colors : row)));
            setCamFace(null);
            setInputError('');
            setMode('input');
          }}
        />
      )}
    </div>
  );
}

function uniquePhases(lessons: Lesson[]): string[] {
  const phases: string[] = [];
  for (const lesson of lessons) {
    if (!phases.includes(lesson.phase)) phases.push(lesson.phase);
  }
  return phases;
}

function Tool({
  icon,
  primary,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; primary?: boolean }) {
  return (
    <button type="button" className={['tool', primary ? 'primary' : '', className].filter(Boolean).join(' ')} {...rest}>
      <Icon name={icon} size={16} />
      <span>{children}</span>
    </button>
  );
}

function Setting({
  icon,
  title,
  text,
  chips,
  on,
  disabled,
  onToggle,
}: {
  icon: IconName;
  title: string;
  text: string;
  chips?: string[];
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="setting">
      <span className={on ? 'setting-icon on' : 'setting-icon'}>
        <Icon name={icon} size={20} />
      </span>
      <div className="setting-body">
        <h3>{title}</h3>
        <p>{text}</p>
        {chips && (
          <div className="chips">
            {chips.map((chip) => (
              <span key={chip} className="chip">
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        className={on ? 'switch on' : 'switch'}
        disabled={disabled}
        onClick={onToggle}
      >
        <span className="knob">
          <Icon name={on ? 'check' : 'close'} size={12} />
        </span>
      </button>
    </div>
  );
}

function MovePad({ pro, disabled, onTurn }: { pro: boolean; disabled: boolean; onTurn: (move: string) => void }) {
  const faces = pro ? PAD : (['U', 'F', 'R'] as const);
  const dirs: { suffix: '' | "'" | '2'; mark: string; title: string }[] = [
    { suffix: '', mark: '↻', title: '顺时针' },
    { suffix: "'", mark: '↺', title: '逆时针' },
    { suffix: '2', mark: '↻↻', title: '转半圈' },
  ];
  const shown = pro ? dirs : dirs.filter((dir) => dir.suffix !== '2');
  return (
    <div className={pro ? 'pad' : 'pad simple'}>
      {faces.map((face) => (
        <div key={face} className="pad-face">
          {shown.map((dir) => (
            <button
              key={dir.suffix || 'cw'}
              type="button"
              className="key"
              disabled={disabled}
              title={`${face}${dir.suffix} ${dir.title}`}
              onClick={() => onTurn(`${face}${dir.suffix}`)}
            >
              {FACE_TINT[face] ? <i className="pip" style={{ background: FACE_TINT[face] }} /> : <Icon name="axes" size={12} />}
              <span className="key-face">
                {face}
                {dir.suffix}
              </span>
              <span className="key-dir" aria-hidden="true">
                {dir.mark}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function CameraSheet({
  face,
  onClose,
  onApply,
}: {
  face: Face;
  onClose: () => void;
  onApply: (colors: Color[]) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraOk = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const [error, setError] = useState(() => (cameraOk ? '' : '这个浏览器不能直接开相机，请选择照片。'));
  const [shot, setShot] = useState<Color[] | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!cameraOk) return;
    let stream: MediaStream | null = null;
    let stop = false;
    const video = videoRef.current;
    void (async () => {
      try {
        await ensureCameraPermission();
        if (stop) return;
        const next = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stop) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        if (video) {
          video.srcObject = next;
          void video.play().then(() => setLive(true)).catch(() => setLive(true));
        }
      } catch (err: unknown) {
        if (!stop) setError(cameraErrorText(err));
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraOk]);

  function recognizeVideo() {
    const video = videoRef.current;
    if (!video || video.videoWidth < 2) {
      setError('相机画面还没准备好。');
      return;
    }
    setShot(sampleFaceColors(video, video.videoWidth, video.videoHeight));
    setError('');
  }

  function recognizeFile(file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setShot(sampleFaceColors(img, img.naturalWidth, img.naturalHeight));
      setError('');
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setError('这张照片读不出来。');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={`拍摄${FACE_TITLE[face]}面`}>
      <div className="sheet-bar">
        <h2>
          {FACE_TITLE[face]}面 · {COLOR_NAME[Cube.solved().center(face)]}
        </h2>
        <button type="button" className="tool" onClick={onClose}>
          <Icon name="close" size={16} />
          <span>关闭</span>
        </button>
      </div>
      <p className="fine">{PHOTO_HINT[face]} 九个色块对齐格子后再识别。</p>
      {shot ? (
        <div className="shot">
          {shot.map((color, index) => (
            <button
              key={index}
              type="button"
              className="cell"
              style={{ background: COLOR_HEX[color] }}
              aria-label={COLOR_NAME[color]}
              onClick={() => setShot((prev) => prev?.map((c, i) => (i === index ? NEXT_COLOR[c] : c)) ?? prev)}
            />
          ))}
        </div>
      ) : (
        <div className="video-wrap">
          <video ref={videoRef} autoPlay playsInline muted />
          <div className="guide" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="row">
        {shot ? (
          <>
            <button type="button" className="tool" onClick={() => setShot(null)}>
              <Icon name="restore" size={16} />
              <span>重拍</span>
            </button>
            <button type="button" className="tool primary" onClick={() => onApply(shot)}>
              <Icon name="check" size={16} />
              <span>填入这一面</span>
            </button>
          </>
        ) : (
          <button type="button" className="tool primary" onClick={recognizeVideo} disabled={!live}>
            <Icon name="scan" size={16} />
            <span>识别这一面</span>
          </button>
        )}
        <label className="file">
          <Icon name="image" size={16} />
          相册 / 拍照
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(ev) => recognizeFile(ev.target.files?.[0])}
          />
        </label>
      </div>
    </div>
  );
}
