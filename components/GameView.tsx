"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import type { Course } from "@/lib/game/course";
import type { Level } from "@/lib/game/level";
import { Genome, baseNodes, makeLayout } from "@/lib/neat/genome";
import { Match } from "@/lib/sim/match";
import { SENSOR_COUNT } from "@/lib/game/world";
import { SceneBird, drawScene, fitCanvas } from "./draw";
import type { LiveFrame } from "./useSim";

const EMPTY_BRAIN: Genome = { nodes: baseNodes(makeLayout(SENSOR_COUNT, 1)), conns: [] };

/** Moldura do canvas do jogo: proporção fixa 480:640, cresce até a altura disponível. */
function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="relative mx-auto w-full max-w-[420px] overflow-hidden border border-line bg-ground" style={{ aspectRatio: "480 / 640", maxHeight: "min(72dvh, 640px)" }} role="img" aria-label={label}>
      {children}
    </div>
  );
}

/** Evolução ao vivo: lê os quadros do Worker (ref) e desenha a população; o líder em âmbar. */
export function EvolutionCanvas({ frameRef, level }: { frameRef: RefObject<LiveFrame | null>; level: Level | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef<Level | null>(level);
  const previous = useRef<{ y: Float32Array; frame: LiveFrame | null }>({ y: new Float32Array(0), frame: null });

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    let raf = 0;
    let lastFrame: LiveFrame | null = null;
    let lastSize = "";
    const draw = (): void => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const frame = frameRef.current;
      const lvl = levelRef.current;
      if (!canvas || !lvl) return;
      const size = fitCanvas(canvas);
      const key = `${size.w}x${size.h}`;
      if (frame === lastFrame && key === lastSize) return;
      lastFrame = frame;
      lastSize = key;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const birds: SceneBird[] = [];
      if (frame) {
        const prev = previous.current;
        const n = frame.birds.length / 2;
        const sameGeneration = prev.frame && prev.frame.generation === frame.generation && prev.y.length === n;
        const nextY = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const y = frame.birds[i * 2];
          const state = frame.birds[i * 2 + 1] as 0 | 1 | 2;
          nextY[i] = y;
          const vy = sameGeneration && prev.frame && frame.tick > prev.frame.tick ? (y - prev.y[i]) / (frame.tick - prev.frame.tick) : 0;
          birds.push({ y, vy, state, role: i === frame.leader ? "leader" : "pop" });
        }
        previous.current = { y: nextY, frame };
      }
      drawScene(ctx, size, { level: lvl, scroll: frame?.scroll ?? 0, birds });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [frameRef]);

  return (
    <Frame label="Simulação ao vivo: população de pássaros atravessando os canos; o líder em âmbar.">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </Frame>
  );
}

export interface PlayResult {
  humanPipes: number;
  aiPipes: number;
  humanFinished: boolean;
  aiFinished: boolean;
  humanDied: boolean;
  totalPipes: number;
}

export interface PlayScore {
  human: number;
  ai: number;
  total: number;
  phase: "ready" | "playing" | "done";
}

/**
 * Partida: o humano (branco) e o cérebro (âmbar) na MESMA fase e com a mesma física. Passo fixo de
 * 60 Hz. Espaço, seta para cima, clique ou toque fazem o pássaro pular.
 */
export function PlayCanvas({
  course,
  gravity,
  genome,
  runId,
  onScore,
  onResult,
  label,
}: {
  course: Course;
  gravity: number;
  genome: Genome | null;
  /** Muda para reiniciar a partida. */
  runId: number;
  onScore: (s: PlayScore) => void;
  onResult: (r: PlayResult) => void;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jumpRef = useRef(false);
  const callbacks = useRef({ onScore, onResult });
  const [phase, setPhase] = useState<"ready" | "playing" | "done">("ready");

  useEffect(() => {
    callbacks.current = { onScore, onResult };
  }, [onScore, onResult]);

  useEffect(() => {
    const match = new Match(genome ?? EMPTY_BRAIN, course, gravity);
    const withAi = genome !== null;
    let started = false;
    let finished = false;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastHuman = -1;
    let lastAi = -1;
    const total = course.level.obstacles.length;
    callbacks.current.onScore({ human: 0, ai: 0, total, phase: "ready" });
    jumpRef.current = false;

    const view = (): SceneBird[] => {
      const [h, a] = match.world.birds;
      const out: SceneBird[] = [];
      if (withAi) out.push({ y: a.y, vy: a.vy, state: a.finished ? 2 : a.alive ? 1 : 0, role: "ai" });
      out.push({ y: h.y, vy: h.vy, state: h.finished ? 2 : h.alive ? 1 : 0, role: "human" });
      return out.filter((b) => b.state !== 0 || true);
    };

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (started && !finished) {
        acc += Math.min(100, now - last);
        let guard = 0;
        while (acc >= 1000 / 60 && guard++ < 6 && !match.done) {
          acc -= 1000 / 60;
          const jump = jumpRef.current;
          jumpRef.current = false;
          match.step(jump);
        }
        const s = match.score();
        if (s.human !== lastHuman || s.ai !== lastAi) {
          lastHuman = s.human;
          lastAi = s.ai;
          callbacks.current.onScore({ human: s.human, ai: s.ai, total, phase: "playing" });
        }
        if (match.done) {
          finished = true;
          setPhase("done");
          const f = match.finished();
          const sc = match.score();
          callbacks.current.onScore({ human: sc.human, ai: sc.ai, total, phase: "done" });
          callbacks.current.onResult({
            humanPipes: sc.human,
            aiPipes: sc.ai,
            humanFinished: f.human,
            aiFinished: f.ai,
            humanDied: !f.human,
            totalPipes: total,
          });
        }
      }
      last = now;
      const size = fitCanvas(canvas);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const birds = view();
      drawScene(ctx, size, { level: course.level, scroll: match.world.scroll, birds });
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== "Space" && e.code !== "ArrowUp" && e.code !== "KeyW") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      e.preventDefault();
      if (e.repeat) return;
      if (finished) return;
      if (!started) {
        started = true;
        last = performance.now();
        setPhase("playing");
        callbacks.current.onScore({ human: 0, ai: 0, total, phase: "playing" });
      }
      jumpRef.current = true;
    };
    const onPointer = (e: PointerEvent): void => {
      if ((e.target as HTMLElement).closest("button")) return;
      if (finished) return;
      if (!started) {
        started = true;
        last = performance.now();
        setPhase("playing");
        callbacks.current.onScore({ human: 0, ai: 0, total, phase: "playing" });
      }
      jumpRef.current = true;
    };
    const canvas = canvasRef.current;
    window.addEventListener("keydown", onKey);
    canvas?.addEventListener("pointerdown", onPointer);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      canvas?.removeEventListener("pointerdown", onPointer);
      setPhase("ready");
    };
  }, [course, gravity, genome, runId]);

  return (
    <Frame label={label}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" data-testid="play-canvas" />
      {phase === "ready" ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center">
          <span className="label bg-ground/80 px-2 py-1 text-ink">Espaço, clique ou toque para começar</span>
        </div>
      ) : null}
    </Frame>
  );
}
