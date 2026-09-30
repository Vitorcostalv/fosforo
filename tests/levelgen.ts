import { ARENA } from "../lib/game/config";
import { Course } from "../lib/game/course";
import { Level, Obstacle, levelTicks, validateLevelData } from "../lib/game/level";
import { nextVelocity, outOfBounds } from "../lib/game/physics";
import { World, createWorld, stepWorld } from "../lib/game/world";
import { Rng } from "../lib/neat/rng";

const HALF_INFLATED = ARENA.birdHalf + 2;

/** Reexecuta o gabarito do validador no jogo de verdade (um pássaro, sem rede). */
export function replay(course: Course, gravity: number, jumps: boolean[]): World {
  const w = createWorld(course, gravity, 1);
  for (const j of jumps) {
    if (w.over || !w.birds[0].alive) break;
    stepWorld(w, [j]);
  }
  return w;
}

/**
 * Fase viável POR CONSTRUÇÃO: simula um voo real (controlador que persegue a altura-alvo de cada
 * cano) e desenha cada vão em volta do que o voo realmente fez, com folga. Retorna null se a
 * construção não couber (vão maior que 300, fora da arena etc.).
 */
export function feasibleByConstruction(seed: number, gravity: number, count: number): Level | null {
  const rng = new Rng(seed);
  const speed = Math.round(rng.range(20, 60)) / 10;
  const xs: number[] = [];
  let x = 420;
  for (let i = 0; i < count; i++) {
    xs.push(x);
    x += ARENA.pipeWidth + 96 + rng.int(120);
  }
  const finishX = xs[count - 1] + ARENA.pipeWidth + 100 + rng.int(60);
  const targets = xs.map(() => 160 + rng.int(320));

  const ticks = levelTicks({ speed, finishX });
  const ys: number[] = [];
  let y = ARENA.height / 2;
  let vy = 0;
  for (let t = 1; t <= ticks; t++) {
    const bx = ARENA.birdX + speed * t;
    let k = xs.findIndex((ox) => ox + ARENA.pipeWidth + HALF_INFLATED > bx);
    if (k < 0) k = count - 1;
    vy = nextVelocity(vy, y > targets[k] + 20, gravity, 0);
    y += vy;
    if (outOfBounds(y, HALF_INFLATED + 2)) return null;
    ys.push(y);
  }

  const obstacles: Obstacle[] = [];
  for (const ox of xs) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 1; t <= ticks; t++) {
      const bx = ARENA.birdX + speed * t;
      if (bx + HALF_INFLATED + 1 > ox && bx - HALF_INFLATED - 1 < ox + ARENA.pipeWidth) {
        lo = Math.min(lo, ys[t - 1]);
        hi = Math.max(hi, ys[t - 1]);
      }
    }
    if (!Number.isFinite(lo)) return null;
    const gapY = Math.round((lo + hi) / 2);
    const half = Math.max(30, Math.ceil(Math.max(hi - gapY, gapY - lo) + HALF_INFLATED + 4));
    obstacles.push({ x: ox, gapY, gapHeight: half * 2 });
  }
  const level: Level = { id: "c", version: 1, name: "c", speed, finishX, obstacles };
  return validateLevelData(level).length === 0 ? level : null;
}

/** Fase impossível POR CONSTRUÇÃO: dois canos em extremos opostos, perto demais para a física permitir. */
export function impossibleByConstruction(seed: number, up: boolean): Level | null {
  const rng = new Rng(seed);
  const speed = Math.round(rng.range(50, 80)) / 10;
  const clearance = 96 + rng.int(15);
  const gapA = 60 + 2 * rng.int(16);
  const gapB = 60 + 2 * rng.int(16);
  const ax = 420;
  const bx = ax + ARENA.pipeWidth + clearance;
  const ticks = Math.ceil((bx - ax) / speed) + 1;
  const h = ARENA.birdHalf + 2;
  const a: Obstacle = { x: ax, gapY: up ? 620 - gapA / 2 : 20 + gapA / 2, gapHeight: gapA };
  const b: Obstacle = { x: bx, gapY: up ? 20 + gapB / 2 : 620 - gapB / 2, gapHeight: gapB };
  // Cotas frouxas: subida máxima < 8,6/tick; descida máxima = 12/tick.
  if (up && !(a.gapY - a.gapHeight / 2 + h - 8.6 * ticks > b.gapY + b.gapHeight / 2 - h + 5)) return null;
  if (!up && !(b.gapY - b.gapHeight / 2 + h > a.gapY + a.gapHeight / 2 - h + 12 * ticks + 5)) return null;
  const level: Level = { id: "i", version: 1, name: "i", speed, finishX: bx + ARENA.pipeWidth + 120, obstacles: [a, b] };
  return validateLevelData(level).length === 0 ? level : null;
}

