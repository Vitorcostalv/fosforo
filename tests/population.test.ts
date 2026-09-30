import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_NEAT_CONFIG, NeatConfig } from "../lib/neat/config";
import { validateGenome } from "../lib/neat/genome";
import { compile, forward } from "../lib/neat/network";
import { PopulationState, createPopulation, eligibleSpecies, evolve } from "../lib/neat/population";
import { allocateQuotas, sanitizeFitness } from "../lib/neat/reproduce";
import { speciate } from "../lib/neat/species";
import { arbSeed, grownGenome } from "./helpers";

const cfgWith = (over: Partial<NeatConfig>): NeatConfig => ({ ...DEFAULT_NEAT_CONFIG, populationSize: 30, ...over });

function assertValid(pop: PopulationState): void {
  expect(pop.genomes).toHaveLength(pop.cfg.populationSize);
  for (const g of pop.genomes) expect(validateGenome(g, pop.layout, pop.cfg.weightLimit)).toEqual([]);
  const members = pop.species.flatMap((s) => s.members).sort((a, b) => a - b);
  expect(members).toEqual(pop.genomes.map((_, i) => i));
}

describe("cotas de filhos", () => {
  it("a soma é sempre exatamente o total, nenhuma cota é negativa (propriedade)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1000, noNaN: true }), { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 0, max: 500 }),
        (weights, total) => {
          const q = allocateQuotas(weights, total);
          return q.length === weights.length && q.every((x) => x >= 0 && Number.isInteger(x)) && q.reduce((a, b) => a + b, 0) === total;
        },
      ),
    );
  });

  it("pesos todos zero dividem igualmente; lista vazia devolve vazia", () => {
    expect(allocateQuotas([0, 0, 0], 9)).toEqual([3, 3, 3]);
    expect(allocateQuotas([], 5)).toEqual([]);
    expect(allocateQuotas([1, 3], 8)).toEqual([2, 6]);
  });

  it("sanitizeFitness zera NaN, infinito e negativo", () => {
    expect(sanitizeFitness(NaN)).toBe(0);
    expect(sanitizeFitness(Infinity)).toBe(0);
    expect(sanitizeFitness(-5)).toBe(0);
    expect(sanitizeFitness(3.5)).toBe(3.5);
  });
});

describe("especiação", () => {
  it("genomas idênticos ficam numa espécie só; muito diferentes, em espécies distintas", () => {
    const a = grownGenome(1, 0);
    const far = grownGenome(2, 30);
    const cfg = cfgWith({ compatibilityThreshold: 0.5 });
    const same = speciate([], [a, a, a], 0, 0, cfg);
    expect(same.species).toHaveLength(1);
    expect(same.species[0].members).toEqual([0, 1, 2]);
    const diff = speciate([], [a, far], 0, 0, cfg);
    expect(diff.species).toHaveLength(2);
    expect(diff.speciesOf).toEqual([0, 1]);
    expect(diff.nextSpeciesId).toBe(2);
  });

  it("espécies que ficam sem membros somem, e os ids nunca voltam atrás", () => {
    const g = grownGenome(1, 0);
    const first = speciate([], [g], 0, 0, cfgWith({}));
    const second = speciate(first.species, [grownGenome(9, 40)], 1, first.nextSpeciesId, cfgWith({ compatibilityThreshold: 0.01 }));
    expect(second.species.map((s) => s.id)).toEqual([1]);
  });
});

describe("população", () => {
  it("nasce com o tamanho pedido, todos válidos e mínimos", () => {
    const pop = createPopulation(cfgWith({ populationSize: 40 }), 3);
    assertValid(pop);
    expect(pop.genomes.every((g) => g.nodes.every((n) => n.kind !== "hidden"))).toBe(true);
  });

  it("mantém o tamanho e a validade por muitas gerações com fitness aleatória (propriedade)", () => {
    fc.assert(
      fc.property(arbSeed, fc.integer({ min: 2, max: 40 }), (seed, size) => {
        const pop = createPopulation(cfgWith({ populationSize: size, addNodeRate: 0.4, addConnectionRate: 0.5 }), seed);
        const fit = (seedInner: number) => {
          let s = seedInner;
          return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296) * 100;
        };
        const rand = fit(seed);
        for (let gen = 0; gen < 12; gen++) {
          evolve(pop, pop.genomes.map(rand));
          assertValid(pop);
        }
        return true;
      }),
      { numRuns: 25 },
    );
  });

  it("população de 1 evolui sem quebrar", () => {
    const pop = createPopulation(cfgWith({ populationSize: 1 }), 5);
    for (let i = 0; i < 20; i++) {
      evolve(pop, [i]);
      assertValid(pop);
    }
    expect(pop.genomes).toHaveLength(1);
  });

  it("população de 2 e espécie com um só indivíduo", () => {
    const pop = createPopulation(cfgWith({ populationSize: 2, compatibilityThreshold: 0.0001 }), 5);
    for (let i = 0; i < 15; i++) {
      evolve(pop, [3, 1]);
      assertValid(pop);
    }
    expect(pop.species.some((s) => s.members.length === 1)).toBe(true);
  });

  it("mutação em 0: os filhos mantêm a estrutura mínima; em 1: crescem, e ambos ficam válidos", () => {
    const still = createPopulation(
      cfgWith({ weightMutationRate: 0, addNodeRate: 0, addConnectionRate: 0 }),
      1,
    );
    for (let i = 0; i < 10; i++) evolve(still, still.genomes.map((_, k) => k));
    assertValid(still);
    expect(still.genomes.every((g) => g.nodes.every((n) => n.kind !== "hidden"))).toBe(true);

    const wild = createPopulation(cfgWith({ weightMutationRate: 1, addNodeRate: 1, addConnectionRate: 1 }), 1);
    for (let i = 0; i < 10; i++) evolve(wild, wild.genomes.map((_, k) => k));
    assertValid(wild);
    expect(wild.genomes.some((g) => g.nodes.some((n) => n.kind === "hidden"))).toBe(true);
  });

  it("geração sem nenhum sobrevivente (fitness 0, NaN e negativa) continua com população cheia", () => {
    const pop = createPopulation(cfgWith({}), 8);
    evolve(pop, pop.genomes.map(() => 0));
    assertValid(pop);
    evolve(pop, pop.genomes.map(() => NaN));
    assertValid(pop);
    evolve(pop, pop.genomes.map(() => -10));
    assertValid(pop);
    evolve(pop, []);
    assertValid(pop);
  });

  it("sem espécies (estado zerado) recomeça do mínimo", () => {
    const pop = createPopulation(cfgWith({}), 8);
    pop.species = [];
    evolve(pop, pop.genomes.map(() => 1));
    assertValid(pop);
  });

  it("estagnação: espécie parada há maxStagnation gerações não reproduz; se todas pararam, sobram as 2 melhores", () => {
    const pop = createPopulation(cfgWith({ maxStagnation: 5, populationStagnation: 1000, compatibilityThreshold: 0.5 }), 4);
    for (let i = 0; i < 4; i++) evolve(pop, pop.genomes.map((_, k) => k));
    expect(pop.species.length).toBeGreaterThan(2);
    const fitness = pop.genomes.map(() => 1);
    pop.generation = 100;
    pop.species.forEach((s) => ((s.lastImproved = 0), (s.bestFitness = 50)));
    pop.lastImprovementGeneration = 100;
    pop.bestFitnessEver = 50;
    const stale = eligibleSpecies(pop, fitness);
    expect(stale.length).toBe(2);

    pop.species[0].lastImproved = 99;
    expect(eligibleSpecies(pop, fitness).map((s) => s.id)).toEqual([pop.species[0].id]);
  });

  it("estagnação da população inteira restringe às duas melhores espécies", () => {
    const pop = createPopulation(cfgWith({ populationStagnation: 3, maxStagnation: 1000, compatibilityThreshold: 0.5 }), 4);
    for (let i = 0; i < 4; i++) evolve(pop, pop.genomes.map((_, k) => k));
    expect(pop.species.length).toBeGreaterThan(2);
    pop.generation = 50;
    pop.lastImprovementGeneration = 0;
    pop.bestFitnessEver = 1e9;
    pop.species.forEach((s) => (s.lastImproved = 50));
    expect(eligibleSpecies(pop, pop.genomes.map(() => 1)).length).toBe(2);
  });

  it("campeão de espécie grande passa intacto para a geração seguinte", () => {
    const pop = createPopulation(cfgWith({ populationSize: 20, compatibilityThreshold: 100 }), 2);
    const fitness = pop.genomes.map((_, i) => i + 1);
    const champion = pop.genomes[19];
    evolve(pop, fitness);
    expect(pop.genomes).toContain(champion);
  });

  it("mesma seed e mesmos parâmetros ⇒ mesma população (propriedade)", () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const run = () => {
          const pop = createPopulation(cfgWith({ populationSize: 20 }), seed);
          for (let i = 0; i < 6; i++) evolve(pop, pop.genomes.map((_, k) => (k * 7) % 13));
          return JSON.stringify(pop.genomes);
        };
        return run() === run();
      }),
      { numRuns: 15 },
    );
  });
});

describe("aceitação: XOR (o teste do artigo, Seção 4)", () => {
  const cases: Array<[number[], number]> = [
    [[0, 0], 0],
    [[0, 1], 1],
    [[1, 0], 1],
    [[1, 1], 0],
  ];

  function solveXor(seed: number): { solved: boolean; hidden: number; generations: number } {
    const pop = createPopulation(
      { ...DEFAULT_NEAT_CONFIG, numInputs: 2, populationSize: 150, addNodeRate: 0.03, addConnectionRate: 0.1 },
      seed,
    );
    for (let gen = 0; gen < 200; gen++) {
      const fitness = pop.genomes.map((g) => {
        const net = compile(g, pop.layout);
        let err = 0;
        for (const [inputs, target] of cases) err += Math.abs((forward(net, inputs)[0] + 1) / 2 - target);
        return (4 - err) ** 2;
      });
      const best = fitness.indexOf(Math.max(...fitness));
      const net = compile(pop.genomes[best], pop.layout);
      const ok = cases.every(([inputs, target]) => (forward(net, inputs)[0] > 0 ? 1 : 0) === target);
      if (ok) return { solved: true, hidden: pop.genomes[best].nodes.filter((n) => n.kind === "hidden").length, generations: gen };
      evolve(pop, fitness);
    }
    return { solved: false, hidden: 0, generations: 200 };
  }

  it("resolve o XOR em várias seeds, crescendo ao menos um nó oculto", () => {
    const results = [1, 2, 3, 4, 5, 6].map(solveXor);
    const solved = results.filter((r) => r.solved);
    expect(solved.length).toBeGreaterThanOrEqual(5);
    expect(solved.every((r) => r.hidden >= 1)).toBe(true);
  }, 120000);
});
