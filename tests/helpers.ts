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
