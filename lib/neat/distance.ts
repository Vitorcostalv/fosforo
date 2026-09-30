import { NeatConfig } from "./config";
import { Genome } from "./genome";

/**
 * Distância de compatibilidade (artigo, Eq. 1, p. 110):
 *   δ = c1·E/N + c2·D/N + c3·W̄
 * E = genes excess, D = disjoint, W̄ = diferença média de pesos dos genes que casam (incluindo
 * desabilitados), N = genes do maior genoma (N = 1 se ambos têm menos de 20).
 */
export function compatibilityDistance(
  a: Genome,
  b: Genome,
  cfg: Pick<NeatConfig, "c1" | "c2" | "c3"> & Partial<Pick<NeatConfig, "smallGenomeGenes">>,
): number {
  const ga = a.conns;
  const gb = b.conns;
  const maxA = ga.length > 0 ? ga[ga.length - 1].innovation : -1;
  const maxB = gb.length > 0 ? gb[gb.length - 1].innovation : -1;

  let i = 0;
  let j = 0;
  let matching = 0;
  let weightDiff = 0;
  let disjoint = 0;
  let excess = 0;

  while (i < ga.length || j < gb.length) {
    if (i < ga.length && j < gb.length && ga[i].innovation === gb[j].innovation) {
      weightDiff += Math.abs(ga[i].weight - gb[j].weight);
      matching++;
      i++;
      j++;
    } else if (j >= gb.length || (i < ga.length && ga[i].innovation < gb[j].innovation)) {
      if (ga[i].innovation > maxB) excess++;
      else disjoint++;
      i++;
    } else {
      if (gb[j].innovation > maxA) excess++;
      else disjoint++;
      j++;
    }
  }

  const larger = Math.max(ga.length, gb.length);
  const n = larger < (cfg.smallGenomeGenes ?? 20) ? 1 : Math.max(1, larger);
  const avgWeight = matching > 0 ? weightDiff / matching : 0;
  return (cfg.c1 * excess) / n + (cfg.c2 * disjoint) / n + cfg.c3 * avgWeight;
}
