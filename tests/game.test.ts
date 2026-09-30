import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ARENA, DEFAULT_GRAVITY, FITNESS_FINISH_BONUS, GRAVITY_MAX, GRAVITY_MIN, normalizeGravity } from "../lib/game/config";
import { buildWindSchedule, courseOf, windAt } from "../lib/game/course";
import { Level, Obstacle } from "../lib/game/level";
import { BUILTIN_LEVELS } from "../lib/game/levels";
import { hitsObstacle, nextVelocity, outOfBounds } from "../lib/game/physics";
import { Bird, aliveCount, birdFitness, collides, createBird, createWorld, sense, stepWorld } from "../lib/game/world";

const simple: Level = {
  id: "t",
  version: 1,
  name: "t",
  speed: 3,
  finishX: 1200,
  obstacles: [
    { x: 420, gapY: 320, gapHeight: 200 },
    { x: 800, gapY: 320, gapHeight: 200 },
  ],
};
const world = (level: Level = simple, birds = 1) => createWorld(courseOf(level), 0.55, birds);

describe("física compartilhada", () => {
  it("o pulo troca a velocidade; gravidade e vento aceleram", () => {
    expect(nextVelocity(3, false, 0.5, 0)).toBe(3.5);
    expect(nextVelocity(3, true, 0.5, 0)).toBe(ARENA.jumpVelocity + 0.5);
    expect(nextVelocity(0, false, 0.5, 0.25)).toBe(0.75);
  });

  it("a velocidade é limitada nos dois sentidos (propriedade)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.boolean(),
        fc.double({ min: 0.1, max: 2, noNaN: true }),
        fc.double({ min: -0.2, max: 0.2, noNaN: true }),
        (vy, jump, g, w) => Math.abs(nextVelocity(vy, jump, g, w)) <= ARENA.maxSpeed,
      ),
    );
    expect(nextVelocity(11.9, false, 1, 0.5)).toBe(ARENA.maxSpeed);
    expect(nextVelocity(-11.9, true, 0.1, -20)).toBe(-ARENA.maxSpeed);
  });

  it("teto e chão", () => {
    expect(outOfBounds(ARENA.birdHalf, ARENA.birdHalf)).toBe(true);
    expect(outOfBounds(ARENA.birdHalf + 0.5, ARENA.birdHalf)).toBe(false);
    expect(outOfBounds(ARENA.height - ARENA.birdHalf, ARENA.birdHalf)).toBe(true);
    expect(outOfBounds(ARENA.height / 2, ARENA.birdHalf)).toBe(false);
  });

  it("colisão com o cano: dentro do vão passa, fora bate, longe não conta", () => {
    const o: Obstacle = { x: 500, gapY: 300, gapHeight: 100 };
    const h = ARENA.birdHalf;
    const onTop = 500 + 10;
    expect(hitsObstacle(300, h, onTop, o)).toBe(false);
    expect(hitsObstacle(300 - 50 + h, h, onTop, o)).toBe(false);
    expect(hitsObstacle(300 - 50 + h - 0.5, h, onTop, o)).toBe(true);
    expect(hitsObstacle(300 + 50 - h + 0.5, h, onTop, o)).toBe(true);
    expect(hitsObstacle(0, h, 500 - h, o)).toBe(false);
    expect(hitsObstacle(0, h, 500 + 64 + h, o)).toBe(false);
  });
});

describe("vento", () => {
  it("a tabela é suave e limitada; sem tabela o vento é 0", () => {
    const wind = buildWindSchedule([0.18, -0.18, 0.1], 400);
    expect(wind).toHaveLength(400);
    expect(wind.every((w) => Math.abs(w) <= 0.18)).toBe(true);
    for (let t = 1; t < wind.length; t++) expect(Math.abs(wind[t] - wind[t - 1])).toBeLessThan(0.02);
    expect(windAt({ level: simple, wind }, 1)).toBe(wind[0]);
    expect(windAt(courseOf(simple), 5)).toBe(0);
    expect(buildWindSchedule([], 3)).toEqual([0, 0, 0]);
  });
});

describe("mundo", () => {
  it("cair sem pular acaba no chão; pássaro morto não muda mais", () => {
    const w = world();
    let guard = 0;
    while (aliveCount(w) > 0 && guard++ < 1000) stepWorld(w, []);
    expect(aliveCount(w)).toBe(0);
    expect(w.birds[0].finished).toBe(false);
    const frozen = { ...w.birds[0] };
    stepWorld(w, [true]);
    expect(w.birds[0]).toEqual(frozen);
  });

  it("pular sempre bate no teto", () => {
    const w = world();
    let guard = 0;
    while (aliveCount(w) > 0 && guard++ < 1000) stepWorld(w, [true]);
    expect(w.birds[0].y - ARENA.birdHalf).toBeLessThanOrEqual(0);
  });

  it("colisão usa o cano pendente e ignora pássaro dentro do vão", () => {
    const w = world();
    w.scroll = 420 - ARENA.birdX;
    const inside: Bird = { ...createBird(), y: 320 };
    const above: Bird = { ...createBird(), y: 320 - 100 - 1 };
    expect(collides(inside, w)).toBe(false);
    expect(collides(above, w)).toBe(true);
    w.nextPipe = w.course.level.obstacles.length;
    expect(collides({ ...createBird(), y: 20 }, w)).toBe(false);
  });

  it("um voo que fica no centro completa a fase, ganha o bônus e o mundo para", () => {
    const w = world();
    let guard = 0;
    while (!w.over && guard++ < 5000) {
      const b = w.birds[0];
      stepWorld(w, [b.alive && b.y > 320 + 20]);
    }
    const b = w.birds[0];
    expect(w.over).toBe(true);
    expect(b.finished).toBe(true);
    expect(b.alive).toBe(false);
    expect(b.pipes).toBe(2);
    expect(birdFitness(b)).toBeCloseTo(b.ticks * 0.1 + 10 + FITNESS_FINISH_BONUS, 9);
    const tick = w.tick;
    stepWorld(w, [true]);
    expect(w.tick).toBe(tick);
  });

  it("vários pássaros terminam juntos; quem morreu antes não ganha bônus", () => {
    const w = world(simple, 2);
    let guard = 0;
    while (!w.over && guard++ < 5000) {
      const b = w.birds[0];
      stepWorld(w, [b.alive && b.y > 340, false]);
    }
    expect(w.birds[0].finished).toBe(true);
    expect(w.birds[1].finished).toBe(false);
    expect(birdFitness(w.birds[0])).toBeGreaterThan(birdFitness(w.birds[1]) + FITNESS_FINISH_BONUS - 1);
  });

  it("sensores são finitos e limitados em qualquer estado alcançável (propriedade)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9 }), fc.array(fc.boolean(), { minLength: 1, maxLength: 200 }), (li, jumps) => {
        const w = world(BUILTIN_LEVELS[li]);
        const inputs = [0, 0, 0, 0];
        for (const j of jumps) {
          stepWorld(w, [j]);
          sense(w, w.birds[0], inputs);
          if (!inputs.every((x) => Number.isFinite(x) && Math.abs(x) < 20)) return false;
        }
        return true;
      }),
    );
  });

  it("sensor depois do último cano devolve valores neutros", () => {
    const w = world();
    w.nextPipe = w.course.level.obstacles.length;
    const out = sense(w, w.birds[0], [0, 0, 0, 0]);
    expect(out[2]).toBe(1);
    expect(out[3]).toBe(0);
  });

  it("normalizeGravity limita e troca lixo pelo padrão", () => {
    expect(normalizeGravity(0)).toBe(Math.fround(GRAVITY_MIN));
    expect(normalizeGravity(100)).toBe(Math.fround(GRAVITY_MAX));
    expect(normalizeGravity(NaN)).toBe(DEFAULT_GRAVITY);
    expect(normalizeGravity(0.55)).toBe(Math.fround(0.55));
  });
});
