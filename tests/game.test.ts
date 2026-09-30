import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ARENA, DEFAULT_GRAVITY, GRAVITY_MAX, GRAVITY_MIN, normalizeGravity } from "../lib/game/config";
import { makeCourse } from "../lib/game/course";
import {
  Bird,
  aliveCount,
  birdFitness,
  collides,
  createBird,
  createWorld,
  sense,
  stepBirdPhysics,
  stepWorld,
} from "../lib/game/world";
import { arbSeed } from "./helpers";

const course = (seed = 1, mode: "normal" | "chaos" = "normal", ticks = 1200) => makeCourse(seed, mode, ticks);

describe("percurso", () => {
  it("mesma seed ⇒ mesmo percurso; seeds diferentes ⇒ percursos diferentes", () => {
    expect(course(5, "chaos")).toEqual(course(5, "chaos"));
    expect(course(5, "chaos").pipes).not.toEqual(course(6, "chaos").pipes);
  });

  it("cobre o teto de ticks com canos suficientes", () => {
    fc.assert(
      fc.property(arbSeed, fc.integer({ min: 60, max: 6000 }), (seed, ticks) => {
        const c = makeCourse(seed, "normal", ticks);
        const lastNeeded = ARENA.firstPipeX + ARENA.birdX + ticks * ARENA.pipeSpeed;
        return c.pipes[c.pipes.length - 1].x > lastNeeded - ARENA.pipeSpacing;
      }),
    );
  });

  it("aberturas ficam sempre dentro da arena; no normal, perto do centro; sem vento no normal", () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        for (const mode of ["normal", "chaos"] as const) {
          const c = makeCourse(seed, mode, 3000);
          for (const p of c.pipes) {
            if (p.gapY - ARENA.gapHeight / 2 < 20 || p.gapY + ARENA.gapHeight / 2 > ARENA.height - 20) return false;
            if (mode === "normal" && Math.abs(p.gapY - ARENA.height / 2) > 130) return false;
          }
          const windless = c.windTargets.every((w) => w === 0);
          if ((mode === "normal") !== windless) return false;
        }
        return true;
      }),
    );
  });
});

describe("física", () => {
  it("gravidade puxa para baixo; o pulo troca a velocidade", () => {
    const b = createBird();
    stepBirdPhysics(b, false, 0.5, 0);
    expect(b.vy).toBe(0.5);
    expect(b.y).toBe(ARENA.height / 2 + 0.5);
    stepBirdPhysics(b, true, 0.5, 0);
    expect(b.vy).toBe(ARENA.jumpVelocity + 0.5);
  });

  it("vento soma à aceleração e a velocidade é limitada", () => {
    const b: Bird = { ...createBird(), vy: 11.9 };
    stepBirdPhysics(b, false, 1, 0.5);
    expect(b.vy).toBe(ARENA.maxSpeed);
    const c: Bird = { ...createBird(), vy: -11.9 };
    stepBirdPhysics(c, true, 0.1, -20);
    expect(c.vy).toBe(-ARENA.maxSpeed);
  });

  it("normalizeGravity limita e troca lixo pelo padrão", () => {
    expect(normalizeGravity(0)).toBe(Math.fround(GRAVITY_MIN));
    expect(normalizeGravity(100)).toBe(Math.fround(GRAVITY_MAX));
    expect(normalizeGravity(NaN)).toBe(DEFAULT_GRAVITY);
    expect(normalizeGravity(0.55)).toBe(Math.fround(0.55));
  });
});

describe("mundo e colisão", () => {
  it("cair sem pular acaba no chão; pássaro morto não muda mais", () => {
    const w = createWorld(course(), 0.55, 1);
    let guard = 0;
    while (aliveCount(w) > 0 && guard++ < 1000) stepWorld(w, []);
    expect(aliveCount(w)).toBe(0);
    const frozen = { ...w.birds[0] };
    stepWorld(w, [true]);
    expect(w.birds[0]).toEqual(frozen);
  });

  it("bater no teto mata", () => {
    const w = createWorld(course(), 0.55, 1);
    let guard = 0;
    while (aliveCount(w) > 0 && guard++ < 1000) stepWorld(w, [true]);
    expect(w.birds[0].alive).toBe(false);
    expect(w.birds[0].y - ARENA.birdHalf).toBeLessThanOrEqual(0);
  });

  it("colide com o cano fora da abertura e passa dentro dela", () => {
    const w = createWorld(course(), 0.55, 1);
    const pipe = w.course.pipes[0];
    w.scroll = pipe.x - ARENA.birdX; // cano exatamente sobre o pássaro
    const inside: Bird = { ...createBird(), y: pipe.gapY };
    const above: Bird = { ...createBird(), y: pipe.gapY - ARENA.gapHeight / 2 - 1 };
    const below: Bird = { ...createBird(), y: pipe.gapY + ARENA.gapHeight / 2 + 1 };
    expect(collides(inside, w)).toBe(false);
    expect(collides(above, w)).toBe(true);
    expect(collides(below, w)).toBe(true);
    w.scroll = 0; // cano longe
    expect(collides(above.y > 0 ? { ...above, y: 100 } : above, w)).toBe(false);
  });

  it("depois do último cano da lista, não colide com nada", () => {
    const w = createWorld(course(), 0.55, 1);
    w.nextPipe = w.course.pipes.length;
    expect(collides({ ...createBird() }, w)).toBe(false);
  });

  it("conta canos passados e pontua fitness = 0,1/tick + 5/cano", () => {
    const b: Bird = { y: 0, vy: 0, alive: true, ticks: 30, pipes: 2 };
    expect(birdFitness(b)).toBeCloseTo(3 + 10, 12);
  });

  it("um piloto simples que segue o centro da abertura passa vários canos no percurso normal", () => {
    const c = course(3, "normal", 3600);
    const w = createWorld(c, 0.55, 1);
    const inputs = [0, 0, 0, 0];
    let guard = 0;
    while (aliveCount(w) > 0 && guard++ < 3600) {
      sense(w, w.birds[0], inputs);
      // y cresce para baixo: pula quando o pássaro está 25 unidades abaixo do centro da abertura
      stepWorld(w, [inputs[3] * (ARENA.height / 2) < -25]);
    }
    expect(w.birds[0].pipes).toBeGreaterThan(5);
  });

  it("sensores são finitos e limitados em qualquer estado alcançável (propriedade)", () => {
    fc.assert(
      fc.property(arbSeed, fc.array(fc.boolean(), { minLength: 1, maxLength: 200 }), (seed, jumps) => {
        const w = createWorld(makeCourse(seed, "chaos", 600), 0.55, 1);
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

  it("sensor sem cano à frente devolve valores neutros", () => {
    const w = createWorld({ ...course(), pipes: [] }, 0.55, 1);
    const out = sense(w, w.birds[0], [0, 0, 0, 0]);
    expect(out[2]).toBe(1);
    expect(out[3]).toBe(0);
  });

  it("vento no modo caos muda a aceleração ao longo do tempo; no normal fica em zero", () => {
    const wChaos = createWorld(course(9, "chaos", 3000), 0.55, 1);
    const wNormal = createWorld(course(9, "normal", 3000), 0.55, 1);
    let maxWind = 0;
    for (let i = 0; i < 600; i++) {
      stepWorld(wChaos, []);
      stepWorld(wNormal, []);
      maxWind = Math.max(maxWind, Math.abs(wChaos.wind));
    }
    expect(maxWind).toBeGreaterThan(0.01);
    expect(wNormal.wind).toBe(0);
  });
});
