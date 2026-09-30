/**
 * Diagnóstico de uma run: por geração, número de espécies, fitness máximo, estagnação de cada
 * espécie e quem está autorizado a reproduzir (regra de estagnação do artigo).
 *
 * Uso: npx tsx scripts/diagnose-seed.ts [fase=10] [seed=1333] [gerações=300] [população=100]
 */
import { BUILTIN_LEVELS } from "../lib/game/levels";
import { eligibleSpecies } from "../lib/neat/population";
import { sanitizeFitness } from "../lib/neat/reproduce";
import { beginGeneration, createRun, finishGeneration } from "../lib/sim/run";

const levelNumber = Number(process.argv[2] ?? 10);
const seed = Number(process.argv[3] ?? 1333);
const generations = Number(process.argv[4] ?? 300);
const populationSize = Number(process.argv[5] ?? 100);

const run = createRun({ seed, level: BUILTIN_LEVELS[levelNumber - 1], populationSize });
let bestPipesEver = 0;
let lastImprovement = 0;
let collapsedAt: number | null = null;
const lines: string[] = [];

for (let g = 0; g < generations; g++) {
  const sim = beginGeneration(run);
  while (!sim.done) sim.step();
  const fitness = sim.fitness().map(sanitizeFitness);
  const pop = run.population;
  const eligible = eligibleSpecies(pop, fitness);
  const species = pop.species.map((s) => ({
    id: s.id,
    size: s.members.length,
    best: Math.max(...s.members.map((m) => fitness[m])),
    stagnant: pop.generation - s.lastImproved,
  }));
  const maxFitness = Math.max(...fitness);
  const bestBird = sim.world.birds.reduce((a, b) => (a.pipes >= b.pipes ? a : b));
  if (bestBird.pipes > bestPipesEver) {
    bestPipesEver = bestBird.pipes;
    lastImprovement = g;
  }
  if (species.length === 1 && collapsedAt === null) collapsedAt = g;
  const genes = pop.genomes.map((gen) => gen.conns.length);
  const geneMin = Math.min(...genes);
  const geneMax = Math.max(...genes);
  const hidden = pop.genomes.reduce((acc, gen) => Math.max(acc, gen.nodes.filter((n) => n.kind === "hidden").length), 0);
  if (g % 10 === 0 || g < 5 || species.length === 1) {
    lines.push(
      `g=${String(g).padStart(3)} espécies=${String(species.length).padStart(2)} elegíveis=${String(eligible.length).padStart(2)} fitnessMáx=${maxFitness.toFixed(1).padStart(6)} canos=${String(bestBird.pipes).padStart(2)}/${run.params.level.obstacles.length} nósOcultosMáx=${hidden} genes=${geneMin}-${geneMax} ` +
        `estagnação=[${species.slice(0, 8).map((s) => `${s.size}:${s.stagnant}`).join(" ")}${species.length > 8 ? " …" : ""}]`,
    );
  }
  finishGeneration(run, sim);
  if (run.history[run.history.length - 1].solved) {
    lines.push(`RESOLVIDA na geração ${g + 1}`);
    break;
  }
}
console.log(lines.slice(0, 400).join("\n"));
console.log(`\nprimeira geração com 1 espécie: ${collapsedAt ?? "nunca"}; último avanço de canos: geração ${lastImprovement} (${bestPipesEver} canos)`);
