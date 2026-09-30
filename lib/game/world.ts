import {
  ARENA,
  FITNESS_PER_PIPE,
  FITNESS_PER_TICK,
  WIND_EASING,
  WIND_PERIOD,
} from "./config";
import { Course } from "./course";

export interface Bird {
  y: number;
  vy: number;
  alive: boolean;
  /** Ticks vivo. */
  ticks: number;
  /** Canos totalmente ultrapassados enquanto vivo. */
  pipes: number;
}

export interface World {
  course: Course;
  gravity: number;
  tick: number;
  /** Quanto o cenário andou para a esquerda. */
  scroll: number;
  wind: number;
  /** Índice do primeiro cano que ainda não foi totalmente ultrapassado. */
  nextPipe: number;
  birds: Bird[];
}

export const SENSOR_COUNT = 4;

export function createBird(): Bird {
  return { y: ARENA.height / 2, vy: 0, alive: true, ticks: 0, pipes: 0 };
}

export function createWorld(course: Course, gravity: number, birdCount: number): World {
  return {
    course,
    gravity,
    tick: 0,
    scroll: 0,
    wind: 0,
    nextPipe: 0,
    birds: Array.from({ length: birdCount }, createBird),
  };
}

export function aliveCount(w: World): number {
  let n = 0;
  for (const b of w.birds) if (b.alive) n++;
  return n;
}

/** Física de um pássaro por tick: o pulo troca a velocidade, gravidade e vento aceleram. */
export function stepBirdPhysics(b: Bird, jump: boolean, gravity: number, wind: number): void {
  let vy = (jump ? ARENA.jumpVelocity : b.vy) + gravity + wind;
  if (vy > ARENA.maxSpeed) vy = ARENA.maxSpeed;
  else if (vy < -ARENA.maxSpeed) vy = -ARENA.maxSpeed;
  b.vy = vy;
  b.y += vy;
}

/** Colisão com teto, chão ou o cano `pipeIndex` (caixa do pássaro contra as duas caixas do cano). */
export function collides(b: Bird, w: World): boolean {
  const h = ARENA.birdHalf;
  if (b.y - h <= 0 || b.y + h >= ARENA.height) return true;
  const pipe = w.course.pipes[w.nextPipe];
  if (!pipe) return false;
  const left = pipe.x - w.scroll;
  const right = left + ARENA.pipeWidth;
  if (ARENA.birdX + h <= left || ARENA.birdX - h >= right) return false;
  const gapTop = pipe.gapY - ARENA.gapHeight / 2;
  const gapBottom = pipe.gapY + ARENA.gapHeight / 2;
  return b.y - h < gapTop || b.y + h > gapBottom;
}

function updateWind(w: World): void {
  const targets = w.course.windTargets;
  const target = targets[Math.min(targets.length - 1, Math.floor(w.tick / WIND_PERIOD))] ?? 0;
  w.wind += (target - w.wind) * WIND_EASING;
}

function updateNextPipe(w: World): void {
  const pipes = w.course.pipes;
  while (
    w.nextPipe < pipes.length - 1 &&
    pipes[w.nextPipe].x - w.scroll + ARENA.pipeWidth < ARENA.birdX - ARENA.birdHalf
  ) {
    w.nextPipe++;
  }
}

/** Avança um tick. `jumps[i]` diz se o pássaro i pula; pássaros mortos são ignorados. */
export function stepWorld(w: World, jumps: readonly boolean[]): void {
  updateWind(w);
  w.tick++;
  w.scroll += ARENA.pipeSpeed;
  updateNextPipe(w);
  const cleared = w.nextPipe;
  for (let i = 0; i < w.birds.length; i++) {
    const b = w.birds[i];
    if (!b.alive) continue;
    stepBirdPhysics(b, jumps[i] === true, w.gravity, w.wind);
    if (collides(b, w)) {
      b.alive = false;
    } else {
      b.ticks++;
      b.pipes = cleared;
    }
  }
}

export function birdFitness(b: Bird): number {
  return b.ticks * FITNESS_PER_TICK + b.pipes * FITNESS_PER_PIPE;
}

/**
 * Entradas da rede, todas finitas e em escala próxima de [-1, 1]:
 * altura, velocidade vertical, distância horizontal ao próximo cano e desnível até o centro da abertura.
 */
export function sense(w: World, b: Bird, out: number[]): number[] {
  const pipe = w.course.pipes[w.nextPipe];
  const dx = pipe ? (pipe.x - w.scroll - ARENA.birdX) / 300 : 1;
  const dy = pipe ? (pipe.gapY - b.y) / (ARENA.height / 2) : 0;
  out[0] = (b.y / ARENA.height) * 2 - 1;
  out[1] = b.vy / 10;
  out[2] = dx;
  out[3] = dy;
  return out;
}
