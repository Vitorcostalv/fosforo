import type { ConnGene, Genome, Layout, NodeKind } from "../neat/genome";

/** Posição de um nó da rede no desenho, em [0, 1] × [0, 1]. */
export interface BrainNode {
  id: number;
  kind: NodeKind;
  x: number;
  y: number;
  depth: number;
  label: string;
}

export interface BrainEdge {
  key: string;
  from: BrainNode;
  to: BrainNode;
  weight: number;
  /** Conexão nova ou com peso diferente em relação à geração anterior (a interface a destaca por um instante). */
  changed: boolean;
}

export interface BrainDrawing {
  nodes: BrainNode[];
  edges: BrainEdge[];
  /** Conexões desabilitadas não são desenhadas; só contadas. */
  disabled: number;
  columns: number;
}

export const INPUT_LABELS = ["altura", "velocidade", "distância", "desnível"];

/**
 * Posiciona a rede em colunas: entradas (e bias) à esquerda, ocultos por profundidade (caminho
 * mais longo desde as entradas), saída à direita. Determinístico: mesma rede, mesmo desenho.
 */
export function layoutBrain(genome: Genome, layout: Layout, previous?: Genome | null): BrainDrawing {
  const enabled = genome.conns.filter((c) => c.enabled);
  const depth = new Map<number, number>();
  const inputs = new Set<number>();
  for (const n of genome.nodes) {
    if (n.kind === "input" || n.kind === "bias") {
      depth.set(n.id, 0);
      inputs.add(n.id);
    }
  }
  // Profundidade = maior caminho desde uma entrada. Relaxa até estabilizar (a rede é acíclica).
  for (let pass = 0; pass <= genome.nodes.length; pass++) {
    let changed = false;
    for (const c of enabled) {
      const d = (depth.get(c.from) ?? 0) + 1;
      if (!inputs.has(c.to) && d > (depth.get(c.to) ?? 0)) {
        depth.set(c.to, d);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const hiddenMax = genome.nodes.filter((n) => n.kind === "hidden").reduce((m, n) => Math.max(m, depth.get(n.id) ?? 1), 0);
  const outDepth = hiddenMax + 1;
  const columns = outDepth + 1;

  const byDepth = new Map<number, number[]>();
  const depthOf = (id: number, kind: NodeKind): number => (kind === "output" ? outDepth : kind === "hidden" ? depth.get(id) ?? 1 : 0);
  for (const n of genome.nodes) {
    const d = depthOf(n.id, n.kind);
    const list = byDepth.get(d);
    if (list) list.push(n.id);
    else byDepth.set(d, [n.id]);
  }

  const nodes: BrainNode[] = [];
  const at = new Map<number, BrainNode>();
  for (const n of genome.nodes) {
    const d = depthOf(n.id, n.kind);
    const column = byDepth.get(d) as number[];
    const row = column.indexOf(n.id);
    const label =
      n.kind === "input" ? INPUT_LABELS[n.id] ?? `entrada ${n.id}` : n.kind === "bias" ? "bias" : n.kind === "output" ? "pula" : `oculto ${n.id - layout.firstHiddenId + 1}`;
    const node: BrainNode = { id: n.id, kind: n.kind, depth: d, x: columns === 1 ? 0.5 : d / (columns - 1), y: (row + 1) / (column.length + 1), label };
    nodes.push(node);
    at.set(n.id, node);
  }

  const prior = new Map<string, ConnGene>();
  for (const c of previous?.conns ?? []) prior.set(`${c.from}>${c.to}`, c);
  const edges: BrainEdge[] = [];
  for (const c of enabled) {
    const from = at.get(c.from);
    const to = at.get(c.to);
    if (!from || !to) continue;
    const before = prior.get(`${c.from}>${c.to}`);
    edges.push({ key: `${c.innovation}`, from, to, weight: c.weight, changed: previous ? !before || before.weight !== c.weight || !before.enabled : false });
  }
  return { nodes, edges, disabled: genome.conns.length - enabled.length, columns };
}

/** Espessura do traço para um peso: 0,8 a 4 px. */
export function edgeWidth(weight: number): number {
  return Math.min(4, 0.8 + Math.abs(weight) * 0.7);
}
