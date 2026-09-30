import fc from "fast-check";
import { DEFAULT_NEAT_CONFIG, NeatConfig } from "../lib/neat/config";
import { Genome, Layout, makeLayout } from "../lib/neat/genome";
import { InnovationTracker } from "../lib/neat/innovation";
import { addConnection, addNode, createMinimalGenome, mutate } from "../lib/neat/mutate";
import { Rng } from "../lib/neat/rng";

export const CFG: NeatConfig = { ...DEFAULT_NEAT_CONFIG, numInputs: 4, populationSize: 30 };
export const LAYOUT: Layout = makeLayout(CFG.numInputs, CFG.numOutputs);

export function freshTracker(): InnovationTracker {
  return new InnovationTracker(LAYOUT.firstHiddenId);
}

/** Genoma com estrutura crescida por `steps` gerações de mutações fortes. */
export function grownGenome(seed: number, steps: number, tracker = freshTracker(), cfg: NeatConfig = CFG): Genome {
  const rng = new Rng(seed);
  let g = createMinimalGenome(LAYOUT, cfg, tracker, rng);
  for (let i = 0; i < steps; i++) {
    tracker.startGeneration();
    g = addNode(g, rng, tracker);
    g = addConnection(g, rng, tracker, cfg);
    g = mutate(g, rng, tracker, { ...cfg, addNodeRate: 0.5, addConnectionRate: 0.7 });
  }
  return g;
}

export const arbSeed = fc.integer({ min: 0, max: 0xffffffff });
export const arbGenome = fc
  .tuple(arbSeed, fc.integer({ min: 0, max: 12 }))
  .map(([seed, steps]) => grownGenome(seed, steps));

/** Dois pais de linhagens independentes (innovation numbers podem colidir de propósito). */
export const arbParents = fc
  .tuple(arbSeed, fc.integer({ min: 0, max: 10 }), arbSeed, fc.integer({ min: 0, max: 10 }))
  .map(([s1, n1, s2, n2]) => [grownGenome(s1, n1), grownGenome(s2, n2)] as const);

/**
 * Suíte rápida (padrão) x completa (`FULL=1`). A rápida roda em todo commit: menos execuções por
 * propriedade e só as fases 1 e 10. A completa roda todas as fases, todas as gravidades e o fuzz longo.
 */
export const FULL = process.env.FULL === "1";
export const runs = (fast: number, full: number): number => (FULL ? full : fast);
/** Índices (0-based) das fases embutidas que os testes percorrem. */
export const LEVEL_SAMPLE: readonly number[] = FULL ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : [0, 9];
