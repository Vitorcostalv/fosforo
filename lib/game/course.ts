import { WIND_AMPLITUDE, WIND_EASING, WIND_PERIOD } from "./config";
import type { Level } from "./level";

/**
 * O que o jogo executa: uma fase mais o vento tick a tick (vazio nas fases embutidas e do editor,
 * que são determinísticas e sem vento).
 */
export interface Course {
  level: Level;
  /** wind[t] é a aceleração vertical aplicada no tick t+1. Fora do vetor, 0. */
  wind: number[];
}

export function courseOf(level: Level): Course {
  return { level, wind: [] };
}

export function windAt(course: Course, tick: number): number {
  return course.wind[tick - 1] ?? 0;
}

/** Vento suave: a cada WIND_PERIOD ticks o alvo muda e o vento real anda 5% em direção a ele. */
export function buildWindSchedule(targets: readonly number[], ticks: number): number[] {
  const wind: number[] = [];
  let w = 0;
  for (let t = 0; t < ticks; t++) {
    const target = targets[Math.min(targets.length - 1, Math.floor(t / WIND_PERIOD))] ?? 0;
    w += (target - w) * WIND_EASING;
    wind.push(w);
  }
  return wind;
}

export const WIND_MAX = WIND_AMPLITUDE;
