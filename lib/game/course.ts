import { Rng } from "../neat/rng";
import { ARENA, GameMode, WIND_AMPLITUDE, WIND_PERIOD } from "./config";

export interface Pipe {
  /** Posição x inicial (tick 0). A posição real é x - scroll. */
  x: number;
  /** Centro vertical da abertura. */
  gapY: number;
}

export interface Course {
  seed: number;
  mode: GameMode;
  pipes: Pipe[];
  /** Alvo do vento por janela de WIND_PERIOD ticks (todos 0 no modo normal). */
  windTargets: number[];
}

/**
 * Gera o percurso inteiro de uma vez a partir da seed.
 * - normal: aberturas perto do centro, sem vento.
 * - caos: aberturas em toda a altura e vento variável.
 */
export function makeCourse(seed: number, mode: GameMode, maxTicks: number): Course {
  const rng = new Rng(seed);
  const pipeCount = Math.ceil((maxTicks * ARENA.pipeSpeed) / ARENA.pipeSpacing) + 3;
  const margin = ARENA.gapHeight / 2 + 60;
  const center = ARENA.height / 2;
  const [lo, hi] = mode === "chaos" ? [margin, ARENA.height - margin] : [center - 130, center + 130];

  const pipes: Pipe[] = [];
  for (let k = 0; k < pipeCount; k++) {
    pipes.push({ x: ARENA.firstPipeX + k * ARENA.pipeSpacing, gapY: Math.fround(rng.range(lo, hi)) });
  }

  const windCount = Math.ceil(maxTicks / WIND_PERIOD) + 2;
  const windTargets: number[] = [];
  for (let k = 0; k < windCount; k++) {
    windTargets.push(mode === "chaos" ? Math.fround(rng.range(-WIND_AMPLITUDE, WIND_AMPLITUDE)) : 0);
  }
  return { seed, mode, pipes, windTargets };
}
