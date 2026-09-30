import fs from "node:fs";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateCourse } from "../lib/game/chaos";
import { DEFAULT_GRAVITY } from "../lib/game/config";
import { validateLevelData } from "../lib/game/level";
import { BUILTIN_LEVELS } from "../lib/game/levels";
import { validateGenome } from "../lib/neat/genome";
import { GOLDEN_KEYS, computeGolden } from "../lib/sim/golden";
import {
  DEFAULT_RUN_PARAMS,
  GenerationSim,
  applyParams,
  beginGeneration,
  checkRunParams,
  courseFor,
  createRun,
  finishGeneration,
  runDigest,
  runGeneration,
  sanitizeParams,
} from "../lib/sim/run";
import { arbSeed } from "./helpers";
import { impossibleByConstruction } from "./levelgen";

const level3 = BUILTIN_LEVELS[2];
const small = { populationSize: 24, level: level3 };

function play(run: ReturnType<typeof createRun>, generations: number): void {
  for (let g = 0; g < generations; g++) runGeneration(run);
}

describe("determinismo", () => {
  it("mesma seed e mesmos parâmetros ⇒ mesma evolução, em fase e em caos (propriedade)", () => {
    fc.assert(
      fc.property(arbSeed, fc.constantFrom("level", "chaos"), (seed, mode) => {
        const a = createRun({ ...small, seed, mode });
        const b = createRun({ ...small, seed, mode });
        play(a, 4);
        play(b, 4);
        return runDigest(a) === runDigest(b);
      }),
      { numRuns: 6 },
    );
  });

  it("seeds diferentes divergem", () => {
    const a = createRun({ ...small, seed: 1 });
    const b = createRun({ ...small, seed: 2 });
    play(a, 5);
    play(b, 5);
    expect(runDigest(a)).not.toBe(runDigest(b));
  });

  it("a velocidade da simulação não altera o resultado (ticks em fatias de qualquer tamanho)", () => {
    fc.assert(
      fc.property(arbSeed, fc.integer({ min: 1, max: 50 }), (seed, slice) => {
        const direct = createRun({ ...small, seed });
        play(direct, 4);
        const sliced = createRun({ ...small, seed });
        for (let g = 0; g < 4; g++) {
          const sim = beginGeneration(sliced);
          while (!sim.done) for (let i = 0; i < slice && !sim.done; i++) sim.step();
          finishGeneration(sliced, sim);
        }
        return runDigest(direct) === runDigest(sliced);
      }),
      { numRuns: 8 },
    );
  });

  it("o fitness nunca é NaN nem infinito; estatísticas coerentes; população sempre válida (propriedade)", () => {
    fc.assert(
      fc.property(arbSeed, fc.integer({ min: 0, max: 9 }), (seed, li) => {
        const run = createRun({ populationSize: 24, seed, level: BUILTIN_LEVELS[li] });
        for (let g = 0; g < 6; g++) {
          const sim = beginGeneration(run);
          while (!sim.done) sim.step();
          const fit = sim.fitness();
          if (!fit.every((f) => Number.isFinite(f) && f >= 0)) return false;
          const stats = finishGeneration(run, sim);
          if (!Number.isFinite(stats.maxFitness) || !Number.isFinite(stats.meanFitness)) return false;
          if (stats.meanFitness > stats.maxFitness + 1e-9) return false;
          if (stats.solved !== stats.finishers > 0) return false;
        }
        return run.population.genomes.every((g) => validateGenome(g, run.population.layout, 8).length === 0);
      }),
      { numRuns: 12 },
    );
  });

  it("golden: um hash por fase embutida, um para o caos e um para o validador, versionados em tests/golden.json", () => {
    const file = path.join(import.meta.dirname, "golden.json");
    const actual = computeGolden();
    if (process.env.UPDATE_GOLDEN === "1") {
      fs.writeFileSync(file, JSON.stringify(actual, null, 2) + "\n");
    }
    const expected = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
    expect(actual).toEqual(expected);
    expect(Object.keys(expected)).toEqual(GOLDEN_KEYS);
    expect(Object.keys(expected)).toHaveLength(12);
  });
});

describe("run", () => {
  it("evolui até completar a fase 3 e conta os que chegaram à linha", () => {
    const run = createRun({ seed: 3, populationSize: 60, level: level3 });
    let solvedAt = -1;
    for (let g = 0; g < 40 && solvedAt < 0; g++) if (runGeneration(run).solved) solvedAt = g;
    expect(solvedAt).toBeGreaterThanOrEqual(0);
    const last = run.history[run.history.length - 1];
    expect(last.finishers).toBeGreaterThan(0);
    expect(last.bestPipes).toBe(level3.obstacles.length);
    expect(run.best).not.toBeNull();
  });

  it("fase: percurso sempre igual; caos: novo a cada geração, sempre viável", () => {
    const n = createRun({ ...small, mode: "level" });
    expect(courseFor(n.params, 0)).toEqual(courseFor(n.params, 7));
    const c = createRun({ ...small, mode: "chaos" });
    const c0 = courseFor(c.params, 0);
    const c1 = courseFor(c.params, 1);
    expect(c0.level.obstacles).not.toEqual(c1.level.obstacles);
    expect(validateCourse(c0, c.params.gravity).ok).toBe(true);
    expect(validateCourse(c1, c.params.gravity).ok).toBe(true);
  });

  it("mudar parâmetros vale só na próxima geração, marca 'editada' e não troca a seed", () => {
    const run = createRun({ ...small, seed: 5 });
    expect(run.edited).toBe(false);
    const sim = beginGeneration(run);
    applyParams(run, { gravity: 0.6, seed: 999, populationSize: 10 });
    expect(sim.world.gravity).toBe(run.initialParams.gravity);
    expect(run.edited).toBe(true);
    expect(run.params.seed).toBe(5);
    while (!sim.done) sim.step();
    finishGeneration(run, sim);
    expect(beginGeneration(run).world.gravity).toBe(Math.fround(0.6));
    expect(run.population.genomes).toHaveLength(10);
    expect(run.initialParams.gravity).toBe(DEFAULT_RUN_PARAMS.gravity);
  });

  it("trocar de fase no meio da run vale na próxima geração", () => {
    const run = createRun({ ...small, seed: 5 });
    runGeneration(run);
    applyParams(run, { level: BUILTIN_LEVELS[4] });
    expect(run.edited).toBe(true);
    expect(beginGeneration(run).world.course.level.id).toBe("f05");
  });

  it("aplicar os mesmos parâmetros não marca como editada", () => {
    const run = createRun(small);
    applyParams(run, { gravity: run.params.gravity });
    expect(run.edited).toBe(false);
  });

  it("sanitizeParams limita valores absurdos e troca lixo pelo padrão", () => {
    const p = sanitizeParams({
      seed: -3.7,
      populationSize: 1e9,
      weightMutationRate: 5,
      addNodeRate: -1,
      addConnectionRate: NaN,
      gravity: 50,
      mode: "x" as never,
      level: { lixo: true } as never,
    });
    expect(p.seed).toBe(3);
    expect(p.populationSize).toBe(500);
    expect(p.weightMutationRate).toBe(1);
    expect(p.addNodeRate).toBe(0);
    expect(p.addConnectionRate).toBe(DEFAULT_RUN_PARAMS.addConnectionRate);
    expect(p.gravity).toBe(Math.fround(2));
    expect(p.mode).toBe("level");
    expect(p.level).toBe(DEFAULT_RUN_PARAMS.level);
    expect(validateLevelData(p.level)).toEqual([]);
  });

  it("não deixa treinar fase inviável: checkRunParams explica o trecho", () => {
    expect(checkRunParams(sanitizeParams({ level: level3 })).ok).toBe(true);
    expect(checkRunParams(sanitizeParams({ mode: "chaos" })).ok).toBe(true);
    let impossible = null;
    for (let seed = 1; !impossible && seed < 200; seed++) impossible = impossibleByConstruction(seed, true);
    const r = checkRunParams(sanitizeParams({ level: impossible as never, gravity: DEFAULT_GRAVITY }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/impossível/);
    const bad = checkRunParams({ ...DEFAULT_RUN_PARAMS, level: { ...level3, speed: 99 } });
    expect(bad).toMatchObject({ ok: false });
  });

  it("população de 1 e taxas extremas rodam gerações completas", () => {
    for (const rates of [
      { weightMutationRate: 0, addNodeRate: 0, addConnectionRate: 0 },
      { weightMutationRate: 1, addNodeRate: 1, addConnectionRate: 1 },
    ]) {
      const one = createRun({ populationSize: 1, level: level3, ...rates });
      play(one, 5);
      expect(one.population.genomes).toHaveLength(1);
      const many = createRun({ ...small, ...rates });
      play(many, 5);
      expect(many.population.genomes).toHaveLength(24);
    }
  });

  it("GenerationSim termina quando todos morrem ou completam", () => {
    const run = createRun(small);
    const sim: GenerationSim = beginGeneration(run);
    let steps = 0;
    while (!sim.done) {
      sim.step();
      steps++;
    }
    expect(steps).toBeLessThanOrEqual(3600);
  });
});
