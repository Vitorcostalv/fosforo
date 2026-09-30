import { ARENA } from "./config";
import type { Obstacle } from "./level";

/**
 * Física e colisão compartilhadas pelo jogo, pelo validador de viabilidade e pelo humano.
 * Só aritmética exata (+ − ×) e comparações.
 */

/** Velocidade vertical do próximo tick: o pulo troca a velocidade; gravidade e vento aceleram; limite ±maxSpeed. */
export function nextVelocity(vy: number, jump: boolean, gravity: number, wind: number): number {
  const v = (jump ? ARENA.jumpVelocity : vy) + gravity + wind;
  return v > ARENA.maxSpeed ? ARENA.maxSpeed : v < -ARENA.maxSpeed ? -ARENA.maxSpeed : v;
}

/** Teto ou chão, para um pássaro de meia-largura `half`. */
export function outOfBounds(y: number, half: number): boolean {
  return y - half <= 0 || y + half >= ARENA.height;
}

/**
 * O pássaro (caixa de meia-largura `half`, centro em x = `birdLevelX`, y) bate no obstáculo?
 * Coordenadas de percurso: o obstáculo ocupa [obs.x, obs.x + pipeWidth].
 */
export function hitsObstacle(y: number, half: number, birdLevelX: number, obs: Obstacle): boolean {
  if (birdLevelX + half <= obs.x || birdLevelX - half >= obs.x + ARENA.pipeWidth) return false;
  const halfGap = obs.gapHeight / 2;
  return y - half < obs.gapY - halfGap || y + half > obs.gapY + halfGap;
}
