import { describe, expect, it } from "vitest";
import { BUILTIN_LEVELS } from "../lib/game/levels";
import { createRun, runGeneration } from "../lib/sim/run";

/**
 * O NEAT completa cada uma das 10 fases embutidas.
 * Orçamento registrado: população 100, até 300 gerações, seeds fixas.
 * A tabela completa (10 seeds, mediana e pior caso) vem de `npm run difficulty` e está em docs/difficulty.md.
 */
const BUDGET_GENERATIONS = 300;
const SEEDS = [1000, 1037, 1074];

/** Seeds conhecidas que não resolvem no orçamento (ver docs/difficulty.md). Cada exceção é uma dívida declarada. */
const KNOWN_UNSOLVED: Record<string, number[]> = {};

function generationsToSolve(levelIndex: number, seed: number): number | null {
  const run = createRun({ seed, level: BUILTIN_LEVELS[levelIndex], populationSize: 100 });
  for (let g = 0; g < BUDGET_GENERATIONS; g++) if (runGeneration(run).solved) return g + 1;
  return null;
}

describe(`o NEAT completa as fases embutidas (orçamento: ${BUDGET_GENERATIONS} gerações, população 100)`, () => {
  it.each(BUILTIN_LEVELS.map((l, i) => [i + 1, l.name, i] as const))("fase %i (%s)", (_n, _name, index) => {
    const results = SEEDS.map((seed) => ({ seed, gens: generationsToSolve(index, seed) }));
    const skip = KNOWN_UNSOLVED[String(index + 1)] ?? [];
    for (const r of results) {
      if (skip.includes(r.seed)) continue;
      expect(r.gens, `seed ${r.seed} não resolveu a fase ${index + 1} em ${BUDGET_GENERATIONS} gerações`).not.toBeNull();
    }
    expect(results.filter((r) => r.gens !== null).length).toBeGreaterThanOrEqual(2);
  });

  it("as fases fáceis (1 a 3) caem em poucas gerações", () => {
    for (const index of [0, 1, 2]) {
      for (const seed of SEEDS) expect(generationsToSolve(index, seed) ?? 999).toBeLessThanOrEqual(10);
    }
  });
});
