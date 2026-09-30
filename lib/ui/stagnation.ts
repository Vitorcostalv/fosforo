import type { GenerationStats } from "../sim/run";

export interface StagnationRule {
  /** Gerações seguidas sem melhora do fitness máximo. */
  noImprovementGenerations: number;
  /** Gerações seguidas com uma espécie só (ou nenhuma). */
  singleSpeciesGenerations: number;
}

export const DEFAULT_STAGNATION: StagnationRule = { noImprovementGenerations: 40, singleSpeciesGenerations: 10 };

/**
 * A run está travada? Sem melhora do melhor fitness por N gerações E as últimas M gerações com 1
 * espécie só (a diversidade colapsou, ver docs/research/seed-1333.md). Uma run resolvida nunca é
 * "travada".
 */
export function isStagnated(history: readonly GenerationStats[], rule: StagnationRule = DEFAULT_STAGNATION): boolean {
  const n = history.length;
  if (n === 0 || history.some((h) => h.solved)) return false;
  if (n < rule.noImprovementGenerations || n < rule.singleSpeciesGenerations) return false;

  let best = -Infinity;
  let lastImprovement = 0;
  history.forEach((h, i) => {
    if (h.maxFitness > best + 1e-9) {
      best = h.maxFitness;
      lastImprovement = i;
    }
  });
  const withoutImprovement = n - 1 - lastImprovement;
  if (withoutImprovement < rule.noImprovementGenerations) return false;

  return history.slice(n - rule.singleSpeciesGenerations).every((h) => h.speciesCount <= 1);
}

/** Uma seed nova para "Tentar outra seed". Recebe a fonte de acaso (a UI passa crypto). */
export function nextSeed(current: number, random: () => number): number {
  for (let i = 0; i < 10; i++) {
    const candidate = Math.floor(random() * 0xffffffff) >>> 0;
    if (candidate !== current) return candidate;
  }
  return (current + 1) >>> 0;
}
