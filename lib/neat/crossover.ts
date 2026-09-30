import { NeatConfig } from "./config";
import { ConnGene, Genome, Layout, NodeGene, baseNodes, hasConnection, hasPath, sortGenome } from "./genome";
import { Rng } from "./rng";

/**
 * Cruzamento alinhado por innovation number (artigo, p. 108-109).
 * - Genes que casam: vêm de um dos pais ao acaso; se estiver desabilitado em algum pai, fica
 *   desabilitado com chance `disabledInheritProb`.
 * - Disjoint e excess: vêm do pai mais apto. Com aptidão igual, cada um entra com 50% de chance.
 *
 * Reparo (escolha do projeto, o artigo permite redes recorrentes): pais válidos podem, juntos,
 * formar ciclo ou repetir um par origem→destino com innovation diferentes. Os genes são
 * inseridos em ordem de innovation e o que quebraria a rede é descartado.
 */
export function crossover(
  a: Genome,
  b: Genome,
  aIsFitter: boolean,
  equalFitness: boolean,
  rng: Rng,
  cfg: NeatConfig,
  layout: Layout,
): Genome {
  const candidates = selectGenes(a.conns, b.conns, aIsFitter, equalFitness, rng, cfg);
  const kept: ConnGene[] = [];
  for (const c of candidates) {
    if (c.from === c.to) continue;
    if (hasConnection(kept, c.from, c.to)) continue;
    if (hasPath(kept, c.to, c.from)) continue;
    kept.push(c);
  }

  const hidden = new Set<number>();
  for (const c of kept) {
    if (c.from >= layout.firstHiddenId) hidden.add(c.from);
    if (c.to >= layout.firstHiddenId) hidden.add(c.to);
  }
  const hiddenNodes: NodeGene[] = [...hidden].map((id) => ({ id, kind: "hidden" }));
  return sortGenome({ nodes: [...baseNodes(layout), ...hiddenNodes], conns: kept });
}

function selectGenes(
  a: readonly ConnGene[],
  b: readonly ConnGene[],
  aIsFitter: boolean,
  equalFitness: boolean,
  rng: Rng,
  cfg: NeatConfig,
): ConnGene[] {
  const out: ConnGene[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const ga = i < a.length ? a[i] : undefined;
    const gb = j < b.length ? b[j] : undefined;
    if (ga && gb && ga.innovation === gb.innovation) {
      const chosen = rng.chance(0.5) ? ga : gb;
      let enabled = chosen.enabled;
      if (!ga.enabled || !gb.enabled) enabled = !rng.chance(cfg.disabledInheritProb);
      out.push({ ...chosen, enabled });
      i++;
      j++;
    } else if (ga && (!gb || ga.innovation < gb.innovation)) {
      if (equalFitness ? rng.chance(0.5) : aIsFitter) out.push(ga);
      i++;
    } else if (gb) {
      if (equalFitness ? rng.chance(0.5) : !aIsFitter) out.push(gb);
      j++;
    }
  }
  return out;
}
