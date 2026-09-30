/**
 * Harness de diagnóstico: roda a fase N com sobrescritas da configuração NEAT e mostra quantas
 * seeds resolvem em quantas gerações. NÃO altera o motor: serve para medir hipóteses.
 *
 * Uso: npx tsx scripts/experiment.ts <fase> '<json de sobrescritas>' [orçamento=300] [seeds=10]
 * Ex.:  npx tsx scripts/experiment.ts 10 '{"maxStagnation":1000}'
 */
import { BUILTIN_LEVELS } from "../lib/game/levels";
import { NeatConfig } from "../lib/neat/config";
import { createPopulation, evolve } from "../lib/neat/population";
import { GenerationSim, courseFor, sanitizeParams, toNeatConfig } from "../lib/sim/run";

const levelNumber = Number(process.argv[2] ?? 10);
const overrides = JSON.parse(process.argv[3] ?? "{}") as Partial<NeatConfig>;
const budget = Number(process.argv[4] ?? 300);
const seedCount = Number(process.argv[5] ?? 10);
const SEEDS = Array.from({ length: seedCount }, (_, i) => 1000 + i * 37);

function solveWith(seed: number): { solvedAt: number | null; bestPipes: number; finalSpecies: number } {
  const params = sanitizeParams({ seed, level: BUILTIN_LEVELS[levelNumber - 1], populationSize: 100 });
  const cfg: NeatConfig = { ...toNeatConfig(params), ...overrides };
  const pop = createPopulation(cfg, seed);
  let bestPipes = 0;
  for (let g = 0; g < budget; g++) {
    const sim = new GenerationSim(courseFor(params, g), params, pop.genomes, pop.layout);
    while (!sim.done) sim.step();
    for (const b of sim.world.birds) bestPipes = Math.max(bestPipes, b.pipes);
    if (sim.world.birds.some((b) => b.finished)) return { solvedAt: g + 1, bestPipes, finalSpecies: pop.species.length };
    evolve(pop, sim.fitness());
  }
  return { solvedAt: null, bestPipes, finalSpecies: pop.species.length };
}

const results = SEEDS.map(solveWith);
const solved = results.filter((r) => r.solvedAt !== null).map((r) => r.solvedAt as number).sort((a, b) => a - b);
const median = solved.length ? solved[Math.floor(solved.length / 2)] : null;
console.log(
  `${JSON.stringify(overrides)}  resolvidas ${solved.length}/${SEEDS.length}  mediana ${median ?? "-"}  pior ${solved.length ? solved[solved.length - 1] : "-"}  ` +
    `[${results.map((r) => r.solvedAt ?? `X(${r.bestPipes})`).join(" ")}]`,
);
