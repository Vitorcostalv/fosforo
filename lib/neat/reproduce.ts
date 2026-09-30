import { NeatConfig } from "./config";
import { crossover } from "./crossover";
import { Genome, Layout } from "./genome";
import { InnovationTracker } from "./innovation";
import { mutate } from "./mutate";
import { Rng } from "./rng";
import { Species } from "./species";

/** Fitness não finita ou negativa vira 0: o fitness da população nunca contamina as contas. */
export function sanitizeFitness(f: number): number {
  return Number.isFinite(f) && f > 0 ? f : 0;
}

/** Divide `total` vagas proporcionalmente aos pesos (maior resto). A soma é sempre exatamente `total`. */
export function allocateQuotas(weights: readonly number[], total: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sum = weights.reduce((acc, w) => acc + w, 0);
  const exact = weights.map((w) => (sum > 0 ? (total * w) / sum : total / n));
  const quotas = exact.map((x) => Math.floor(x));
  let left = total - quotas.reduce((acc, q) => acc + q, 0);
  const byRemainder = exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((p, q) => q.r - p.r || p.i - q.i);
  for (let k = 0; left > 0; k = (k + 1) % n, left--) quotas[byRemainder[k].i]++;
  return quotas;
}

export interface ReproduceInput {
  genomes: readonly Genome[];
  fitness: readonly number[];
  /** Espécies já com bestFitness/lastImproved atualizados. */
  species: Species[];
  /** Espécies autorizadas a reproduzir (não estagnadas). */
  eligible: Species[];
  cfg: NeatConfig;
  layout: Layout;
  rng: Rng;
  tracker: InnovationTracker;
}

/**
 * Gera exatamente `populationSize` filhos. Cota por espécie proporcional à soma da fitness
 * ajustada (artigo, Eq. 2: fitness dividida pelo tamanho da espécie). Campeão de espécie grande
 * passa intacto; o resto vem de sobreviventes por mutação ou cruzamento.
 */
export function reproduce(input: ReproduceInput): Genome[] {
  const { genomes, fitness, eligible, cfg, layout, rng, tracker } = input;
  tracker.startGeneration();

  const sorted = eligible.map((s) => ({
    species: s,
    ranked: [...s.members].sort((a, b) => fitness[b] - fitness[a] || a - b),
  }));
  const weights = sorted.map(({ ranked }) => {
    const total = ranked.reduce((acc, m) => acc + fitness[m], 0);
    return total / ranked.length;
  });
  const quotas = allocateQuotas(weights, cfg.populationSize);

  const pools = sorted.map(({ ranked }) => {
    const keep = Math.max(1, Math.ceil(cfg.survivalThreshold * ranked.length));
    return ranked.slice(0, keep);
  });

  const children: Genome[] = [];
  sorted.forEach(({ ranked }, si) => {
    let quota = quotas[si];
    if (quota > 0 && ranked.length > cfg.championMinSpeciesSize) {
      children.push(genomes[ranked[0]]);
      quota--;
    }
    const pool = pools[si];
    while (quota > 0) {
      const a = pool[rng.int(pool.length)];
      if (pool.length < 2 || rng.chance(cfg.mutateOnlyRate)) {
        children.push(mutate(genomes[a], rng, tracker, cfg));
      } else {
        const b = pickMate(a, pool, pools, si, cfg, rng);
        const equal = fitness[a] === fitness[b];
        const child = crossover(genomes[a], genomes[b], fitness[a] >= fitness[b], equal, rng, cfg, layout);
        children.push(mutate(child, rng, tracker, cfg));
      }
      quota--;
    }
  });
  return applyGlobalElitism(children, genomes, fitness, cfg.globalElitism);
}

/** Experimental: garante os K melhores da população, intactos, no lugar dos últimos filhos gerados. */
function applyGlobalElitism(
  children: Genome[],
  genomes: readonly Genome[],
  fitness: readonly number[],
  count: number,
): Genome[] {
  const k = Math.min(Math.floor(count), children.length, genomes.length);
  if (!(k > 0)) return children;
  const top = genomes
    .map((_, i) => i)
    .sort((a, b) => fitness[b] - fitness[a] || a - b)
    .slice(0, k)
    .map((i) => genomes[i]);
  const missing = top.filter((g) => !children.includes(g));
  if (missing.length === 0) return children;
  return [...missing, ...children.slice(0, children.length - missing.length)];
}

function pickMate(
  a: number,
  pool: readonly number[],
  pools: ReadonlyArray<readonly number[]>,
  speciesIndex: number,
  cfg: NeatConfig,
  rng: Rng,
): number {
  if (pools.length > 1 && rng.chance(cfg.interspeciesMatingRate)) {
    let other = rng.int(pools.length - 1);
    if (other >= speciesIndex) other++;
    return pools[other][rng.int(pools[other].length)];
  }
  const posA = pool.indexOf(a);
  let idx = rng.int(pool.length - 1);
  if (idx >= posA) idx++;
  return pool[idx];
}
