import { NeatConfig } from "./config";
import {
  ConnGene,
  Genome,
  Layout,
  NodeGene,
  baseNodes,
  clampWeight,
  hasConnection,
  hasPath,
  sortGenome,
  toWeight,
} from "./genome";
import { InnovationTracker } from "./innovation";
import { Rng } from "./rng";

/** Genoma mínimo do artigo (p. 111): entradas e bias ligados direto às saídas, sem nós ocultos. */
export function createMinimalGenome(
  layout: Layout,
  cfg: NeatConfig,
  tracker: InnovationTracker,
  rng: Rng,
): Genome {
  const conns: ConnGene[] = [];
  for (let from = 0; from <= layout.biasId; from++) {
    for (let o = 0; o < layout.numOutputs; o++) {
      const to = layout.firstOutputId + o;
      conns.push({
        innovation: tracker.connection(from, to),
        from,
        to,
        weight: clampWeight(rng.range(-cfg.initialWeightRange, cfg.initialWeightRange), cfg.weightLimit),
        enabled: true,
      });
    }
  }
  return sortGenome({ nodes: baseNodes(layout), conns });
}

/** Com chance `weightMutationRate` mexe nos pesos; cada peso é perturbado (90%) ou substituído (10%). */
export function mutateWeights(g: Genome, rng: Rng, cfg: NeatConfig): Genome {
  if (!rng.chance(cfg.weightMutationRate)) return g;
  const conns = g.conns.map((c) => {
    const w = rng.chance(cfg.weightPerturbProb)
      ? c.weight + rng.range(-cfg.weightPerturbPower, cfg.weightPerturbPower)
      : rng.range(-cfg.weightReplaceRange, cfg.weightReplaceRange);
    return { ...c, weight: clampWeight(w, cfg.weightLimit) };
  });
  return { nodes: g.nodes, conns };
}

/**
 * Divide uma conexão habilitada: ela é desabilitada, a que entra no nó novo recebe peso 1 e a
 * que sai recebe o peso antigo (artigo, p. 107-108).
 */
export function addNode(g: Genome, rng: Rng, tracker: InnovationTracker): Genome {
  const enabled = g.conns.filter((c) => c.enabled);
  if (enabled.length === 0) return g;
  const target = rng.pick(enabled);
  const nodeId = tracker.splitNode(target.innovation);
  if (g.nodes.some((n) => n.id === nodeId)) return g;

  const newNode: NodeGene = { id: nodeId, kind: "hidden" };
  const into: ConnGene = {
    innovation: tracker.connection(target.from, nodeId),
    from: target.from,
    to: nodeId,
    weight: toWeight(1),
    enabled: true,
  };
  const out: ConnGene = {
    innovation: tracker.connection(nodeId, target.to),
    from: nodeId,
    to: target.to,
    weight: target.weight,
    enabled: true,
  };
  const conns = g.conns.map((c) => (c === target ? { ...c, enabled: false } : c));
  return sortGenome({ nodes: [...g.nodes, newNode], conns: [...conns, into, out] });
}

/**
 * Adiciona uma conexão entre dois nós ainda não ligados. Recusa se já existir caminho do destino
 * para a origem (evitaria uma rede feed-forward). Tenta até `addConnectionAttempts` vezes.
 */
export function addConnection(
  g: Genome,
  rng: Rng,
  tracker: InnovationTracker,
  cfg: NeatConfig,
): Genome {
  const sources = g.nodes.filter((n) => n.kind !== "output");
  const targets = g.nodes.filter((n) => n.kind === "hidden" || n.kind === "output");
  if (sources.length === 0 || targets.length === 0) return g;

  for (let attempt = 0; attempt < cfg.addConnectionAttempts; attempt++) {
    const from = rng.pick(sources).id;
    const to = rng.pick(targets).id;
    if (from === to) continue;
    if (hasConnection(g.conns, from, to)) continue;
    if (hasPath(g.conns, to, from)) continue;
    const conn: ConnGene = {
      innovation: tracker.connection(from, to),
      from,
      to,
      weight: clampWeight(rng.range(-cfg.initialWeightRange, cfg.initialWeightRange), cfg.weightLimit),
      enabled: true,
    };
    return sortGenome({ nodes: g.nodes, conns: [...g.conns, conn] });
  }
  return g;
}

/** Aplica as três mutações na ordem fixa: pesos, novo nó, nova conexão. */
export function mutate(g: Genome, rng: Rng, tracker: InnovationTracker, cfg: NeatConfig): Genome {
  let out = mutateWeights(g, rng, cfg);
  if (rng.chance(cfg.addNodeRate)) out = addNode(out, rng, tracker);
  if (rng.chance(cfg.addConnectionRate)) out = addConnection(out, rng, tracker, cfg);
  return out;
}
