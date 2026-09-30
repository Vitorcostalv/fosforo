export type GameMode = "normal" | "chaos";

/** Constantes da arena, em unidades de mundo. A física roda em passo fixo: 1 tick = 1/60 s. */
export const ARENA = {
  width: 480,
  height: 640,
  birdX: 110,
  birdHalf: 12,
  pipeWidth: 64,
  pipeSpacing: 210,
  pipeSpeed: 3.5,
  gapHeight: 116,
  firstPipeX: 420,
  jumpVelocity: -8.6,
  maxSpeed: 12,
} as const;

export const TICKS_PER_SECOND = 60;

/** Cada 90 ticks o vento escolhe um alvo novo e o vento real acompanha devagar. */
export const WIND_PERIOD = 90;
export const WIND_EASING = 0.05;
export const WIND_AMPLITUDE = 0.18;

export const GRAVITY_MIN = 0.1;
export const GRAVITY_MAX = 2;
export const DEFAULT_GRAVITY = Math.fround(0.55);

/** Pontos de fitness: mesma ideia do minicurso (0,1 por frame vivo, 5 por cano). */
export const FITNESS_PER_TICK = 0.1;
export const FITNESS_PER_PIPE = 5;

export function normalizeGravity(g: number): number {
  const v = Number.isFinite(g) ? g : DEFAULT_GRAVITY;
  return Math.fround(Math.min(GRAVITY_MAX, Math.max(GRAVITY_MIN, v)));
}
