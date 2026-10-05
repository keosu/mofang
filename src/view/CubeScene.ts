import {
  BoxGeometry,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  Group,
} from 'three';
import { COLOR_HEX, COLOR_LIST, Cube, moveAnimation, type Color as StickerColor, type Face } from '../cube/cube';
import { stickerIndex } from './stickers';

export type CubeSceneOptions = {
  onMove: (move: string) => void;
};

type Axis = 'x' | 'y' | 'z';

type Hit = {
  normal: Vector3;
  point: Vector3;
  x: number;
  y: number;
  z: number;
};

type Gesture =
  | { kind: 'orbit'; x: number; y: number; theta: number; phi: number }
  | { kind: 'pinch'; dist: number; radius: number }
  | { kind: 'pending'; id: number; x: number; y: number; hit: Hit }
  | {
      kind: 'turn';
      id: number;
      x: number;
      y: number;
      lockX: number;
      lockY: number;
      move: string;
      axis: Axis;
      angle: number;
      group: Group;
      frac: number;
    };

type Job = {
  move: string;
  ms: number;
  commit: () => void;
  resolve: () => void;
  reject: (err: Error) => void;
};

const FACE_TURNS: { name: string; axis: Axis; layer: number; dir: number }[] = [
  { name: 'U', axis: 'y', layer: 1, dir: -1 },
  { name: 'D', axis: 'y', layer: -1, dir: 1 },
  { name: 'E', axis: 'y', layer: 0, dir: 1 },
  { name: 'R', axis: 'x', layer: 1, dir: -1 },
  { name: 'L', axis: 'x', layer: -1, dir: 1 },
  { name: 'M', axis: 'x', layer: 0, dir: 1 },
  { name: 'F', axis: 'z', layer: 1, dir: -1 },
  { name: 'B', axis: 'z', layer: -1, dir: 1 },
  { name: 'S', axis: 'z', layer: 0, dir: -1 },
];

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function moveName(axis: Axis, layer: number, sign: number): string | null {
  const row = FACE_TURNS.find((m) => m.axis === axis && m.layer === layer);
  if (!row) return null;
  return sign === row.dir ? row.name : `${row.name}'`;
}

function stickerTexture(hex: string): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return new CanvasTexture(canvas);
  g.fillStyle = '#050607';
  g.fillRect(0, 0, size, size);
  g.fillStyle = hex;
  g.beginPath();
  const m = 9;
  const r = 18;
  g.moveTo(m + r, m);
  g.arcTo(size - m, m, size - m, size - m, r);
  g.arcTo(size - m, size - m, m, size - m, r);
  g.arcTo(m, size - m, m, m, r);
  g.arcTo(m, m, size - m, m, r);
  g.closePath();
  g.fill();
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class CubeScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly geo = new BoxGeometry(0.94, 0.94, 0.94);
  private readonly plastic: MeshBasicMaterial;
  private readonly stickerMat: Record<StickerColor, MeshBasicMaterial>;
  private readonly cubies = new Map<string, Mesh>();
  private readonly queue: Job[] = [];
  private layerGroup: Group | null = null;
  private gesture: Gesture | null = null;
  private anim: ((now: number) => void) | null = null;
  private tweening = false;
  private activeJob: Job | null = null;
  private generation = 0;
  private dragEpoch = 0;
  private theta = 0.62;
  private phi = 1.12;
  private radius = 6.6;
  private interactive = true;
  private allowed: Set<string> | null = null;
  private disposed = false;
  private raf = 0;
  private ro: ResizeObserver;
  private pointers = new Map<number, { x: number; y: number }>();
  private onMove: (move: string) => void;
  private readonly motionScale: number;

  constructor(canvas: HTMLCanvasElement, options: CubeSceneOptions) {
    this.canvas = canvas;
    this.onMove = options.onMove;
    this.motionScale = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.45 : 1;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.camera = new PerspectiveCamera(32, 1, 0.1, 50);
    this.plastic = new MeshBasicMaterial({ color: 0x050607 });
    this.stickerMat = {} as Record<StickerColor, MeshBasicMaterial>;
    for (const color of COLOR_LIST) {
      this.stickerMat[color] = new MeshBasicMaterial({ map: stickerTexture(COLOR_HEX[color]) });
    }
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const key = `${x},${y},${z}`;
          const mesh = new Mesh(this.geo, this.matsFor(x, y, z, Cube.solved()));
          mesh.position.set(x, y, z);
          mesh.userData.key = key;
          this.scene.add(mesh);
          this.cubies.set(key, mesh);
        }
      }
    }
    this.placeCamera();
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  setOnMove(fn: (move: string) => void): void {
    this.onMove = fn;
  }

  setInteractive(value: boolean): void {
    this.interactive = value;
    if (!value) this.cancelGesture();
  }

  setAllowed(moves: readonly string[] | null): void {
    this.allowed = moves ? new Set(moves) : null;
  }

  paint(cube: Cube): void {
    for (const [key, mesh] of this.cubies) {
      const [x, y, z] = key.split(',').map(Number);
      mesh.material = this.matsFor(x, y, z, cube);
    }
  }

  resetCamera(): void {
    this.theta = 0.62;
    this.phi = 1.12;
    this.radius = 6.6;
    this.placeCamera();
  }

  play(move: string, commit: () => void, duration = 260): Promise<void> {
    this.cancelGesture();
    return new Promise((resolve, reject) => {
      this.queue.push({ move, ms: this.scaled(move, duration), commit, resolve, reject });
      this.pump();
    });
  }

  reset(cube: Cube): void {
    this.generation += 1;
    this.anim = null;
    this.tweening = false;
    const jobs = this.queue.splice(0);
    if (this.activeJob) jobs.push(this.activeJob);
    this.activeJob = null;
    for (const job of jobs) job.reject(new Error('cancelled'));
    this.dragEpoch += 1;
    this.gesture = null;
    this.homeAll();
    this.paint(cube);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reset(Cube.solved());
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.geo.dispose();
    this.plastic.dispose();
    for (const mat of Object.values(this.stickerMat)) {
      mat.map?.dispose();
      mat.dispose();
    }
    this.renderer.dispose();
  }

  private scaled(move: string, duration: number): number {
    const base = Math.max(70, duration) * (move.endsWith('2') ? 1.45 : 1);
    return base * this.motionScale;
  }

  private matsFor(x: number, y: number, z: number, cube: Cube): MeshBasicMaterial[] {
    const pick = (on: boolean, face: Face) =>
      on ? this.stickerMat[cube.get(face, stickerIndex(face, x, y, z))] : this.plastic;
    return [
      pick(x === 1, 'R'),
      pick(x === -1, 'L'),
      pick(y === 1, 'U'),
      pick(y === -1, 'D'),
      pick(z === 1, 'F'),
      pick(z === -1, 'B'),
    ];
  }

  private placeCamera(): void {
    this.camera.position.set(
      this.radius * Math.sin(this.phi) * Math.sin(this.theta),
      this.radius * Math.cos(this.phi),
      this.radius * Math.sin(this.phi) * Math.cos(this.theta),
    );
    this.camera.lookAt(0, 0, 0);
  }

  private resize(): void {
    const parent = this.canvas.parentElement ?? this.canvas;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w < 2 || h < 2) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
  }

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.anim?.(now);
    this.renderer.render(this.scene, this.camera);
  };

  private homeAll(): void {
    for (const [key, mesh] of this.cubies) {
      this.scene.attach(mesh);
      const [x, y, z] = key.split(',').map(Number);
      mesh.position.set(x, y, z);
      mesh.rotation.set(0, 0, 0);
      mesh.updateMatrixWorld(true);
    }
    if (this.layerGroup) {
      this.scene.remove(this.layerGroup);
      this.layerGroup = null;
    }
  }

  private grabLayer(axis: Axis, layer: number | null): Group {
    const group = new Group();
    this.scene.add(group);
    for (const [key, mesh] of this.cubies) {
      const [x, y, z] = key.split(',').map(Number);
      const value = axis === 'x' ? x : axis === 'y' ? y : z;
      if (layer !== null && value !== layer) continue;
      group.attach(mesh);
    }
    this.layerGroup = group;
    return group;
  }

  private tween(group: Group, axis: Axis, from: number, to: number, ms: number, done: () => void): void {
    this.tweening = true;
    const t0 = performance.now();
    this.anim = (now) => {
      const u = Math.min(1, (now - t0) / Math.max(1, ms));
      const e = u * u * (3 - 2 * u);
      group.rotation[axis] = from + (to - from) * e;
      if (u < 1) return;
      this.anim = null;
      this.tweening = false;
      done();
    };
  }

  private pump(): void {
    if (this.tweening || this.queue.length === 0) return;
    if (this.gesture && (this.gesture.kind === 'turn' || this.gesture.kind === 'pending')) return;
    const job = this.queue.shift();
    if (!job) return;
    const spec = moveAnimation(job.move);
    const group = this.grabLayer(spec.axis, spec.layer);
    const gen = this.generation;
    this.activeJob = job;
    this.tween(group, spec.axis, 0, spec.angle, job.ms, () => {
      if (this.activeJob === job) this.activeJob = null;
      if (gen !== this.generation) return;
      this.homeAll();
      try {
        job.commit();
        job.resolve();
      } catch (err) {
        job.reject(err instanceof Error ? err : new Error(String(err)));
      }
      this.pump();
    });
  }

  private cancelGesture(): void {
    const dragging =
      this.gesture?.kind === 'turn' ||
      this.gesture?.kind === 'pending' ||
      (this.tweening && !this.activeJob);
    if (!dragging) return;
    this.dragEpoch += 1;
    this.gesture = null;
    if (this.tweening && !this.activeJob) {
      this.anim = null;
      this.tweening = false;
    }
    this.homeAll();
  }

  private ndc(ev: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private pick(ev: PointerEvent): Hit | null {
    this.ndc(ev);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects([...this.cubies.values()], false)[0];
    if (!hit?.face) return null;
    const mesh = hit.object as Mesh;
    const normal = hit.face.normal.clone().transformDirection(mesh.matrixWorld).round();
    const [x, y, z] = String(mesh.userData.key).split(',').map(Number);
    return { normal, point: hit.point.clone(), x, y, z };
  }

  private moveFromDrag(hit: Hit, ev: PointerEvent): { move: string; angle: number } | null {
    const plane = new Plane().setFromNormalAndCoplanarPoint(hit.normal, hit.point);
    this.ndc(ev);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const landed = new Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, landed)) return null;
    const delta = landed.sub(hit.point);
    delta.addScaledVector(hit.normal, -delta.dot(hit.normal));
    if (delta.lengthSq() < 1e-5) return null;
    const axisVec = new Vector3().crossVectors(hit.normal, delta);
    const ax = Math.abs(axisVec.x);
    const ay = Math.abs(axisVec.y);
    const az = Math.abs(axisVec.z);
    let axis: Axis;
    let sign: number;
    if (ax >= ay && ax >= az) {
      axis = 'x';
      sign = Math.sign(axisVec.x) || 1;
    } else if (ay >= ax && ay >= az) {
      axis = 'y';
      sign = Math.sign(axisVec.y) || 1;
    } else {
      axis = 'z';
      sign = Math.sign(axisVec.z) || 1;
    }
    const layer = axis === 'x' ? hit.x : axis === 'y' ? hit.y : hit.z;
    const move = moveName(axis, layer, sign);
    if (!move) return null;
    return { move, angle: moveAnimation(move).angle };
  }

  private span(): number {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 1;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
  }

  private onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    this.radius = clamp(this.radius + ev.deltaY * 0.004, 4.2, 12);
    this.placeCamera();
  };

  private onPointerDown = (ev: PointerEvent): void => {
    if (this.disposed) return;
    this.canvas.setPointerCapture(ev.pointerId);
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (this.pointers.size >= 2) {
      this.cancelGesture();
      this.gesture = { kind: 'pinch', dist: this.span(), radius: this.radius };
      return;
    }
    if (!this.interactive || this.tweening) {
      this.gesture = { kind: 'orbit', x: ev.clientX, y: ev.clientY, theta: this.theta, phi: this.phi };
      return;
    }
    const hit = this.pick(ev);
    if (!hit) {
      this.gesture = { kind: 'orbit', x: ev.clientX, y: ev.clientY, theta: this.theta, phi: this.phi };
      return;
    }
    this.gesture = { kind: 'pending', id: ev.pointerId, x: ev.clientX, y: ev.clientY, hit };
  };

  private onPointerMove = (ev: PointerEvent): void => {
    if (!this.pointers.has(ev.pointerId)) return;
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pinch') {
      const dist = this.span();
      this.radius = clamp(g.radius * (g.dist / dist), 4.2, 12);
      this.placeCamera();
      return;
    }
    if (g.kind === 'orbit') {
      this.theta = g.theta - (ev.clientX - g.x) * 0.008;
      this.phi = clamp(g.phi - (ev.clientY - g.y) * 0.008, 0.28, Math.PI - 0.28);
      this.placeCamera();
      return;
    }
    if (g.kind === 'pending') {
      if (ev.pointerId !== g.id) return;
      if (Math.hypot(ev.clientX - g.x, ev.clientY - g.y) < 12) return;
      const detected = this.moveFromDrag(g.hit, ev);
      if (!detected) return;
      if (this.allowed && !this.allowed.has(detected.move)) {
        this.gesture = null;
        return;
      }
      const spec = moveAnimation(detected.move);
      const group = this.grabLayer(spec.axis, spec.layer);
      this.gesture = {
        kind: 'turn',
        id: g.id,
        x: g.x,
        y: g.y,
        lockX: ev.clientX - g.x,
        lockY: ev.clientY - g.y,
        move: detected.move,
        axis: spec.axis,
        angle: spec.angle,
        group,
        frac: 0,
      };
      return;
    }
    if (g.kind === 'turn' && ev.pointerId === g.id) {
      g.frac = this.fraction(g, ev.clientX, ev.clientY);
      g.group.rotation[g.axis] = g.angle * g.frac;
    }
  };

  private fraction(g: Extract<Gesture, { kind: 'turn' }>, x: number, y: number): number {
    const lockLen = Math.hypot(g.lockX, g.lockY) || 1;
    const along = ((x - g.x) * g.lockX + (y - g.y) * g.lockY) / lockLen;
    return clamp(along / 110, -0.15, 1.15);
  }

  private onPointerUp = (ev: PointerEvent): void => {
    this.pointers.delete(ev.pointerId);
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (this.pointers.size < 2) this.gesture = null;
      return;
    }
    if (g.kind === 'orbit' || g.kind === 'pending') {
      this.gesture = null;
      return;
    }
    if (g.kind !== 'turn' || ev.pointerId !== g.id) return;
    const frac = this.fraction(g, ev.clientX, ev.clientY);
    const from = g.group.rotation[g.axis];
    const commit = frac > 0.34;
    const to = commit ? g.angle : 0;
    const epoch = this.dragEpoch;
    const move = g.move;
    const group = g.group;
    const axis = g.axis;
    this.gesture = null;
    this.tween(group, axis, from, to, commit ? 140 : 90, () => {
      if (epoch !== this.dragEpoch) return;
      this.homeAll();
      if (commit) this.onMove(move);
      this.pump();
    });
  };
}
