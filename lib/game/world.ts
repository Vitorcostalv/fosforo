import {
  ARENA,
  FITNESS_FINISH_BONUS,
  FITNESS_PER_PIPE,
  FITNESS_PER_TICK,
} from "./config";
import { Course, windAt } from "./course";
import { hitsObstacle, nextVelocity, outOfBounds } from "./physics";

export interface Bird {
  y: number;
  vy: number;
  alive: boolean;
  /** Chegou à linha de chegada com vida. */
  finished: boolean;
  /** Ticks vivo. */
  ticks: number;
  /** Canos totalmente ultrapassados enquanto vivo. */
  pipes: number;
}

export interface World {
  course: Course;
  gravity: number;
  tick: number;
  /** Quanto o cenário andou: velocidade × tick (multiplicação, não acúmulo, para ser exato). */
  scroll: number;
  wind: number;
  /** Índice do primeiro obstáculo ainda não totalmente ultrapassado. */
  nextPipe: number;
  /** A linha de chegada foi cruzada (vale para todos os pássaros ao mesmo tempo). */
  over: boolean;
  birds: Bird[];
}

export const SENSOR_COUNT = 4;

export function createBird(): Bird {
  return { y: ARENA.height / 2, vy: 0, alive: true, finished: false, ticks: 0, pipes: 0 };
}

export function createWorld(course: Course, gravity: number, birdCount: number): World {
  return {
    course,
    gravity,
    tick: 0,
    scroll: 0,
    wind: 0,
    nextPipe: 0,
    over: false,
    birds: Array.from({ length: birdCount }, createBird),
  };
}

export function aliveCount(w: World): number {
  let n = 0;
  for (const b of w.birds) if (b.alive) n++;
  return n;
}

/** Colisão com teto, chão ou o obstáculo `nextPipe`. */
export function collides(b: Bird, w: World): boolean {
  if (outOfBounds(b.y, ARENA.birdHalf)) return true;
  const obstacle = w.course.level.obstacles[w.nextPipe];
  if (!obstacle) return false;
  return hitsObstacle(b.y, ARENA.birdHalf, ARENA.birdX + w.scroll, obstacle);
}

function updateNextPipe(w: World): void {
  const obstacles = w.course.level.obstacles;
  const birdLevelX = ARENA.birdX + w.scroll;
  while (w.nextPipe < obstacles.length && obstacles[w.nextPipe].x + ARENA.pipeWidth < birdLevelX - ARENA.birdHalf) {
    w.nextPipe++;
  }
}

/** Avança um tick. `jumps[i]` diz se o pássaro i pula; pássaros mortos ou que já chegaram são ignorados. */
export function stepWorld(w: World, jumps: readonly boolean[]): void {
  if (w.over) return;
  w.tick++;
  w.wind = windAt(w.course, w.tick);
  w.scroll = w.course.level.speed * w.tick;
  updateNextPipe(w);
  const cleared = w.nextPipe;
  for (let i = 0; i < w.birds.length; i++) {
    const b = w.birds[i];
    if (!b.alive) continue;
    b.vy = nextVelocity(b.vy, jumps[i] === true, w.gravity, w.wind);
    b.y += b.vy;
    if (collides(b, w)) {
      b.alive = false;
    } else {
      b.ticks++;
      b.pipes = cleared;
    }
  }
  if (ARENA.birdX + w.scroll >= w.course.level.finishX) {
    w.over = true;
    for (const b of w.birds) {
      if (b.alive) {
        b.alive = false;
        b.finished = true;
      }
    }
  }
}

/** Fitness: sobreviver, passar canos e, acima de tudo, completar a fase. */
export function birdFitness(b: Bird): number {
  return b.ticks * FITNESS_PER_TICK + b.pipes * FITNESS_PER_PIPE + (b.finished ? FITNESS_FINISH_BONUS : 0);
}

/**
 * Entradas da rede, todas finitas e em escala próxima de [-1, 1]:
 * altura, velocidade vertical, distância horizontal ao próximo cano e desnível até o centro do vão.
 */
export function sense(w: World, b: Bird, out: number[]): number[] {
  const obstacle = w.course.level.obstacles[w.nextPipe];
  const dx = obstacle ? (obstacle.x - w.scroll - ARENA.birdX) / 300 : 1;
  const dy = obstacle ? (obstacle.gapY - b.y) / (ARENA.height / 2) : 0;
  out[0] = (b.y / ARENA.height) * 2 - 1;
  out[1] = b.vy / 10;
  out[2] = dx;
  out[3] = dy;
  return out;
}
