import fs from "node:fs";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateGenome } from "../lib/neat/genome";
import { GOLDEN_SCENARIOS, computeGolden } from "../lib/sim/golden";
import {
  DEFAULT_RUN_PARAMS,
  GenerationSim,
  applyParams,
  beginGeneration,
  courseFor,
  createRun,
  finishGeneration,
  runDigest,
  runGeneration,
  sanitizeParams,
} from "../lib/sim/run";
import { arbSeed } from "./helpers";

const small = { populationSize: 24, maxTicks: 600 };

function play(run: ReturnType<typeof createRun>, generations: number): void {
  for (let g = 0; g < generations; g++) runGeneration(run);
}

describe("determinismo", () => {
  it("mesma seed e mesmos parâmetros ⇒ mesma evolução (propriedade)", () => {
    fc.assert(
      fc.property(arbSeed, fc.constantFrom("normal", "chaos"), (seed, mode) => {
        const a = createRun({ ...small, seed, mode });
        const b = createRun({ ...small, seed, mode });
        play(a, 6);
        play(b, 6);
        return runDigest(a) === runDigest(b);
      }),
      { numRuns: 12 },
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

  it("o fitness nunca é NaN nem infinito e as estatísticas são coerentes (propriedade)", () => {
    fc.assert(
      fc.property(arbSeed, fc.constantFrom("normal", "chaos"), fc.double({ min: 0.1, max: 2, noNaN: true }), (seed, mode, gravity) => {
        const run = createRun({ ...small, seed, mode, gravity });
        for (let g = 0; g < 8; g++) {
          const sim = beginGeneration(run);
          while (!sim.done) sim.step();
          const fit = sim.fitness();
          if (!fit.every((f) => Number.isFinite(f) && f >= 0)) return false;
          const stats = finishGeneration(run, sim);
          if (!Number.isFinite(stats.maxFitness) || !Number.isFinite(stats.meanFitness)) return false;
          if (stats.meanFitness > stats.maxFitness + 1e-9) return false;
        }
        return run.population.genomes.every((g) => validateGenome(g, run.population.layout, 8).length === 0);
      }),
      { numRuns: 10 },
    );
  });

  it("os parâmetros são registrados: golden hashes batem com tests/golden.json", () => {
    const file = path.join(__dirname, "golden.json");
    const actual = computeGolden();
    if (process.env.UPDATE_GOLDEN === "1") {
      fs.writeFileSync(file, JSON.stringify(actual, null, 2) + "\n");
    }
    const expected = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
    expect(actual).toEqual(expected);
    expect(Object.keys(expected)).toEqual(GOLDEN_SCENARIOS.map((s) => s.name));
  }, 60000);
});

describe("run", () => {
  it("evolui: o melhor fitness cresce em relação à geração 0 no percurso fixo", () => {
    const run = createRun({ seed: 3, populationSize: 60, maxTicks: 1800 });
    play(run, 25);
    expect(run.history[24].maxFitness).toBeGreaterThan(run.history[0].maxFitness);
    expect(run.history).toHaveLength(25);
    expect(run.best).not.toBeNull();
  }, 30000);

  it("modo normal repete o percurso; caos muda a cada geração", () => {
    const n = createRun({ ...small, mode: "normal" });
    expect(courseFor(n.params, 0)).toEqual(courseFor(n.params, 7));
    const c = createRun({ ...small, mode: "chaos" });
    expect(courseFor(c.params, 0)).not.toEqual(courseFor(c.params, 1));
  });

  it("mudar parâmetros vale só na próxima geração, marca 'editada' e não troca a seed", () => {
    const run = createRun({ ...small, seed: 5 });
    expect(run.edited).toBe(false);
    const sim = beginGeneration(run);
    applyParams(run, { gravity: 0.9, seed: 999, populationSize: 10 });
    expect(sim.world.gravity).toBe(run.initialParams.gravity);
    expect(run.edited).toBe(true);
    expect(run.params.seed).toBe(5);
    while (!sim.done) sim.step();
    finishGeneration(run, sim);
    expect(beginGeneration(run).world.gravity).toBe(Math.fround(0.9));
    expect(run.population.genomes).toHaveLength(10);
    expect(run.initialParams.gravity).toBe(DEFAULT_RUN_PARAMS.gravity);
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
      maxTicks: 1,
    });
    expect(p.seed).toBe(3);
    expect(p.populationSize).toBe(500);
    expect(p.weightMutationRate).toBe(1);
    expect(p.addNodeRate).toBe(0);
    expect(p.addConnectionRate).toBe(DEFAULT_RUN_PARAMS.addConnectionRate);
    expect(p.gravity).toBe(Math.fround(2));
    expect(p.mode).toBe("normal");
    expect(p.maxTicks).toBe(60);
  });

  it("população de 1 e taxas extremas rodam gerações completas", () => {
    for (const rates of [{ weightMutationRate: 0, addNodeRate: 0, addConnectionRate: 0 }, { weightMutationRate: 1, addNodeRate: 1, addConnectionRate: 1 }]) {
      const run = createRun({ populationSize: 1, maxTicks: 300, ...rates });
      play(run, 5);
      expect(run.population.genomes).toHaveLength(1);
      const many = createRun({ ...small, ...rates });
      play(many, 5);
      expect(many.population.genomes).toHaveLength(24);
    }
  });

  it("marca 'solved' quando o melhor chega ao teto de ticks", () => {
    const run = createRun({ seed: 3, populationSize: 60, maxTicks: 120 });
    play(run, 30);
    expect(run.history.some((h) => h.solved)).toBe(true);
  }, 30000);

  it("GenerationSim termina quando todos morrem ou no teto", () => {
    const run = createRun({ ...small });
    const sim: GenerationSim = beginGeneration(run);
    let steps = 0;
    while (!sim.done) {
      sim.step();
      steps++;
    }
    expect(steps).toBeLessThanOrEqual(run.params.maxTicks);
  });
});
