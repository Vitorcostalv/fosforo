import { NeatConfig } from "./config";
import { Genome, Layout, makeLayout } from "./genome";
import { InnovationTracker } from "./innovation";
import { createMinimalGenome } from "./mutate";
import { reproduce, sanitizeFitness } from "./reproduce";
import { Rng } from "./rng";
import { Species, speciate } from "./species";

export interface PopulationState {
  cfg: NeatConfig;
  layout: Layout;
  rng: Rng;
  tracker: InnovationTracker;
  generation: number;
  genomes: Genome[];
  species: Species[];
  /** Id da espécie de cada genoma. */
  speciesOf: number[];
  nextSpeciesId: number;
  bestFitnessEver: number;
  lastImprovementGeneration: number;
}

export function createPopulation(cfg: NeatConfig, seed: number): PopulationState {
  const layout = makeLayout(cfg.numInputs, cfg.numOutputs);
  const rng = new Rng(seed);
  const tracker = new InnovationTracker(layout.firstHiddenId);
  const state: PopulationState = {
    cfg,
    layout,
    rng,
    tracker,
    generation: 0,
    genomes: [],
    species: [],
    speciesOf: [],
    nextSpeciesId: 0,
    bestFitnessEver: -Infinity,
    lastImprovementGeneration: 0,
  };
  seedPopulation(state);
  return state;
}

/** (Re)cria a população inicial mínima e a especia. */
export function seedPopulation(state: PopulationState): void {
  state.tracker.startGeneration();
  state.genomes = Array.from({ length: state.cfg.populationSize }, () =>
    createMinimalGenome(state.layout, state.cfg, state.tracker, state.rng),
  );
  state.species = [];
  respeciate(state);
}

function respeciate(state: PopulationState): void {
  const result = speciate(state.species, state.genomes, state.generation, state.nextSpeciesId, state.cfg);
  state.species = result.species;
  state.nextSpeciesId = result.nextSpeciesId;
  state.speciesOf = result.speciesOf;
}

function topSpecies(species: readonly Species[], count: number): Species[] {
  return [...species].sort((a, b) => b.bestFitness - a.bestFitness || a.id - b.id).slice(0, count);
}

/** Atualiza recordes por espécie e decide quais podem reproduzir (estagnação, artigo p. 110-111). */
export function eligibleSpecies(state: PopulationState, fitness: readonly number[]): Species[] {
  const { cfg, generation } = state;
  for (const s of state.species) {
    const best = s.members.reduce((acc, m) => Math.max(acc, fitness[m]), -Infinity);
    if (best > s.bestFitness) {
      s.bestFitness = best;
      s.lastImproved = generation;
    }
  }
  const popBest = fitness.reduce((acc, f) => Math.max(acc, f), -Infinity);
  if (popBest > state.bestFitnessEver) {
    state.bestFitnessEver = popBest;
    state.lastImprovementGeneration = generation;
  }

  let eligible = state.species.filter((s) => generation - s.lastImproved < cfg.maxStagnation);
  const populationStalled = generation - state.lastImprovementGeneration > cfg.populationStagnation;
  if (populationStalled || eligible.length === 0) eligible = topSpecies(state.species, 2);
  return eligible;
}

/**
 * Avança uma geração: recebe a fitness de cada genoma (mesma ordem de `state.genomes`), gera os
 * filhos e os especia. Fitness inválida vira 0. Se não houver espécie alguma, recomeça do mínimo.
 */
export function evolve(state: PopulationState, rawFitness: readonly number[]): void {
  const fitness = state.genomes.map((_, i) => sanitizeFitness(rawFitness[i] ?? 0));
  const eligible = state.species.length > 0 ? eligibleSpecies(state, fitness) : [];

  // Representante da próxima geração: um membro aleatório de cada espécie atual.
  for (const s of state.species) {
    s.representative = state.genomes[s.members[state.rng.int(s.members.length)]];
  }

  state.generation++;
  if (eligible.length === 0 || state.cfg.populationSize < 1) {
    seedPopulation(state);
    return;
  }
  state.genomes = reproduce({
    genomes: state.genomes,
    fitness,
    species: state.species,
    eligible,
    cfg: state.cfg,
    layout: state.layout,
    rng: state.rng,
    tracker: state.tracker,
  });
  respeciate(state);
}
