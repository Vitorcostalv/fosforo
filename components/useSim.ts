"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Genome } from "@/lib/neat/genome";
import type { CourseInfo, FromSim, ParamChange, SimStatus, StartConfig, ToSim } from "@/lib/sim/protocol";
import type { GenerationStats } from "@/lib/sim/run";

export interface LiveFrame {
  generation: number;
  tick: number;
  scroll: number;
  alive: number;
  leader: number;
  birds: Float32Array;
}

export interface BestEver {
  genome: Genome;
  fitness: number;
  generation: number;
  /** Gravidade em que este pássaro foi o melhor (o ambiente do link tem de ser esta). */
  gravity: number;
}

export interface SimView {
  ready: boolean;
  status: SimStatus | null;
  history: GenerationStats[];
  champion: Genome | null;
  previousChampion: Genome | null;
  bestEver: BestEver | null;
  course: CourseInfo | null;
  stagnated: boolean;
  error: string | null;
  /** Aviso não fatal (ex.: mudança de parâmetro recusada). */
  notice: string | null;
  /** A última geração fechada teve um pássaro que completou a fase. */
  solvedLevelEvent: number;
}

const INITIAL: SimView = {
  ready: false,
  status: null,
  history: [],
  champion: null,
  previousChampion: null,
  bestEver: null,
  course: null,
  stagnated: false,
  error: null,
  notice: null,
  solvedLevelEvent: 0,
};

/**
 * Liga a interface ao Worker da simulação. Os quadros (30 por segundo) ficam num ref, lidos pelo
 * canvas; só o que muda por geração vira estado do React.
 */
export function useSim(options: { onSolved?: (levelId: string) => void } = {}) {
  const workerRef = useRef<Worker | null>(null);
  const frameRef = useRef<LiveFrame | null>(null);
  const [view, setView] = useState<SimView>(INITIAL);
  const runIdRef = useRef(0);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../workers/sim.worker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      setView((v) => ({ ...v, error: `Não consegui iniciar o Worker da simulação: ${error instanceof Error ? error.message : String(error)}` }));
      return;
    }
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<FromSim>) => {
      const msg = event.data;
      // Mensagens de uma run que já foi substituída chegam atrasadas: descarta.
      if (msg.runId !== undefined && msg.runId !== runIdRef.current) return;
      switch (msg.type) {
        case "ready":
          setView((v) => ({ ...v, ready: true }));
          break;
        case "frame":
          frameRef.current = msg;
          break;
        case "error":
          setView((v) => ({ ...v, error: msg.message }));
          break;
        case "rejected":
          setView((v) => ({ ...v, notice: msg.message }));
          break;
        case "status":
          setView((v) => ({ ...v, status: msg.status }));
          break;
        case "course":
          setView((v) => ({ ...v, course: msg.course }));
          break;
        case "generation":
          if (msg.stats.solved && msg.levelId) optionsRef.current.onSolved?.(msg.levelId);
          setView((v) => ({
            ...v,
            history: [...v.history, msg.stats],
            previousChampion: v.champion,
            champion: msg.champion,
            bestEver: msg.bestEver ?? v.bestEver,
            stagnated: msg.stagnated,
            solvedLevelEvent: msg.stats.solved ? v.solvedLevelEvent + 1 : v.solvedLevelEvent,
          }));
          break;
      }
    };
    worker.onerror = (event) => {
      setView((v) => ({ ...v, error: `O Worker da simulação falhou: ${event.message || "erro desconhecido"}` }));
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const send = useCallback((message: ToSim) => workerRef.current?.postMessage(message), []);

  const start = useCallback(
    (config: StartConfig, autoplay: boolean, speed: number) => {
      frameRef.current = null;
      setView((v) => ({ ...INITIAL, ready: v.ready, status: null }));
      runIdRef.current += 1;
      send({ type: "start", config, autoplay, speed, runId: runIdRef.current });
    },
    [send],
  );

  return {
    view,
    frameRef,
    start,
    play: useCallback(() => send({ type: "play" }), [send]),
    pause: useCallback(() => send({ type: "pause" }), [send]),
    stepGeneration: useCallback(() => send({ type: "step-generation" }), [send]),
    setSpeed: useCallback((value: number) => send({ type: "speed", value }), [send]),
    changeParams: useCallback((change: ParamChange) => send({ type: "params", change }), [send]),
    dismissNotice: useCallback(() => setView((v) => ({ ...v, notice: null, error: null })), []),
  };
}
