import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Cube } from '../cube/cube';
import { CubeScene } from './CubeScene';

export type CubeViewHandle = {
  play: (move: string, commit: () => void, duration?: number) => Promise<void>;
  paint: (cube: Cube) => void;
  reset: (cube: Cube) => void;
  setInteractive: (value: boolean) => void;
  resetCamera: () => void;
  setAllowed: (moves: readonly string[] | null) => void;
};

type Props = {
  onMove: (move: string) => void;
  allowedMoves: readonly string[] | null;
};

export const CubeView = forwardRef<CubeViewHandle, Props>(function CubeView({ onMove, allowedMoves }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CubeScene | null>(null);
  const onMoveRef = useRef(onMove);
  const allowedRef = useRef(allowedMoves);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);
  useEffect(() => {
    allowedRef.current = allowedMoves;
    sceneRef.current?.setAllowed(allowedMoves);
  }, [allowedMoves]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new CubeScene(canvas, { onMove: (move) => onMoveRef.current(move) });
    scene.setAllowed(allowedRef.current);
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    play: (move, commit, duration) => {
      const scene = sceneRef.current;
      if (!scene) return Promise.reject(new Error('cancelled'));
      return scene.play(move, commit, duration);
    },
    paint: (cube) => sceneRef.current?.paint(cube),
    reset: (cube) => sceneRef.current?.reset(cube),
    setInteractive: (value) => sceneRef.current?.setInteractive(value),
    resetCamera: () => sceneRef.current?.resetCamera(),
    setAllowed: (moves) => sceneRef.current?.setAllowed(moves),
  }));

  return (
    <div className="cube-view" ref={hostRef}>
      <canvas ref={canvasRef} aria-label="三维魔方。拖动色块可以转动，拖动空白处可以转视角。" />
    </div>
  );
});
