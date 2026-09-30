export type GameMode = "level" | "chaos";

/** Constantes da arena, em unidades de mundo. A física roda em passo fixo: 1 tick = 1/60 s. */
export const ARENA = {
  width: 480,
  height: 640,
  /** Posição do pássaro na tela; no percurso, o pássaro está em x = birdX + velocidade × tick. */
  birdX: 110,
  birdHalf: 12,
  pipeWidth: 64,
  jumpVelocity: -8.6,
  maxSpeed: 12,
} as const;

export const TICKS_PER_SECOND = 60;

/** Vento do modo caos: alvo novo a cada WIND_PERIOD ticks; o vento real acompanha devagar. */
export const WIND_PERIOD = 90;
export const WIND_EASING = 0.05;
export const WIND_AMPLITUDE = 0.18;

/** O vento nunca vence a gravidade: no máximo metade dela (senão o pássaro não consegue mais descer). */
export function windAmplitude(gravity: number): number {
  return Math.fround(Math.min(WIND_AMPLITUDE, gravity / 2));
}

/** Abaixo de ~0,15 o pássaro flutua tanto que nem um vão de 116 é passável (medido com o validador). */
export const GRAVITY_MIN = 0.2;
export const GRAVITY_MAX = 2;
export const DEFAULT_GRAVITY = Math.fround(0.55);

/** Pontos de fitness: 0,1 por tick vivo (como no minicurso), 5 por cano e um bônus grande por terminar a fase. */
export const FITNESS_PER_TICK = 0.1;
export const FITNESS_PER_PIPE = 5;
export const FITNESS_FINISH_BONUS = 100;

export function normalizeGravity(g: number): number {
  const v = Number.isFinite(g) ? g : DEFAULT_GRAVITY;
  return Math.fround(Math.min(GRAVITY_MAX, Math.max(GRAVITY_MIN, v)));
}
