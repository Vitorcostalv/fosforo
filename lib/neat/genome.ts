export type NodeKind = "input" | "bias" | "output" | "hidden";

export interface NodeGene {
  id: number;
  kind: NodeKind;
}

export interface ConnGene {
  innovation: number;
  from: number;
  to: number;
  /** Sempre arredondado para float32 (Math.fround), para a serialização ser exata. */
  weight: number;
  enabled: boolean;
}

/** nodes ordenado por id; conns ordenado por innovation. Tratar como imutável. */
export interface Genome {
  nodes: NodeGene[];
  conns: ConnGene[];
}

/** Ids fixos dos nós de entrada, bias e saída; hidden começa em firstHiddenId. */
export interface Layout {
  numInputs: number;
  numOutputs: number;
  biasId: number;
  firstOutputId: number;
  firstHiddenId: number;
}

export function makeLayout(numInputs: number, numOutputs: number): Layout {
  return {
    numInputs,
    numOutputs,
    biasId: numInputs,
    firstOutputId: numInputs + 1,
    firstHiddenId: numInputs + 1 + numOutputs,
  };
}

export function baseNodes(layout: Layout): NodeGene[] {
  const nodes: NodeGene[] = [];
  for (let i = 0; i < layout.numInputs; i++) nodes.push({ id: i, kind: "input" });
  nodes.push({ id: layout.biasId, kind: "bias" });
  for (let o = 0; o < layout.numOutputs; o++) nodes.push({ id: layout.firstOutputId + o, kind: "output" });
  return nodes;
}

/** Normaliza -0 para 0 e arredonda para float32. */
export function toWeight(w: number): number {
  const r = Math.fround(w);
  return r === 0 ? 0 : r;
}

export function clampWeight(w: number, limit: number): number {
  return toWeight(w > limit ? limit : w < -limit ? -limit : w);
}

export function sortGenome(g: Genome): Genome {
  return {
    nodes: [...g.nodes].sort((a, b) => a.id - b.id),
    conns: [...g.conns].sort((a, b) => a.innovation - b.innovation),
  };
}

export function hasConnection(conns: readonly ConnGene[], from: number, to: number): boolean {
  for (const c of conns) if (c.from === from && c.to === to) return true;
  return false;
}

/**
 * Existe caminho de `start` até `goal` usando todas as conexões (habilitadas ou não)?
 * Usado para recusar conexões que criariam ciclo.
 */
export function hasPath(conns: readonly ConnGene[], start: number, goal: number): boolean {
  if (start === goal) return true;
  const out = new Map<number, number[]>();
  for (const c of conns) {
    const list = out.get(c.from);
    if (list) list.push(c.to);
    else out.set(c.from, [c.to]);
  }
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const n = stack.pop() as number;
    for (const next of out.get(n) ?? []) {
      if (next === goal) return true;
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}

/** Retorna a lista de problemas do genoma; vazia significa válido (feed-forward, sem referências soltas). */
export function validateGenome(g: Genome, layout: Layout, weightLimit = Infinity): string[] {
  const errors: string[] = [];
  const kinds = new Map<number, NodeKind>();
  const base = baseNodes(layout);

  let prevId = -1;
  for (const n of g.nodes) {
    if (!Number.isInteger(n.id) || n.id < 0) errors.push(`nó com id inválido: ${n.id}`);
    if (n.id <= prevId) errors.push(`nós fora de ordem ou repetidos em ${n.id}`);
    prevId = n.id;
    kinds.set(n.id, n.kind);
    if (n.kind === "hidden" && n.id < layout.firstHiddenId) errors.push(`nó oculto ${n.id} dentro da faixa reservada`);
  }
  for (const b of base) {
    if (kinds.get(b.id) !== b.kind) errors.push(`nó obrigatório ausente ou com tipo errado: ${b.id}`);
  }

  const pairs = new Set<string>();
  let prevInnov = -1;
  for (const c of g.conns) {
    if (!Number.isInteger(c.innovation) || c.innovation < 0) errors.push(`innovation inválido: ${c.innovation}`);
    if (c.innovation <= prevInnov) errors.push(`conexões fora de ordem ou innovation repetido em ${c.innovation}`);
    prevInnov = c.innovation;
    if (!Number.isFinite(c.weight) || Math.abs(c.weight) > weightLimit) errors.push(`peso inválido na conexão ${c.innovation}`);
    const fromKind = kinds.get(c.from);
    const toKind = kinds.get(c.to);
    if (fromKind === undefined) errors.push(`conexão ${c.innovation} sai de nó inexistente ${c.from}`);
    if (toKind === undefined) errors.push(`conexão ${c.innovation} chega em nó inexistente ${c.to}`);
    if (fromKind === "output") errors.push(`conexão ${c.innovation} sai de um nó de saída`);
    if (toKind === "input" || toKind === "bias") errors.push(`conexão ${c.innovation} chega em entrada/bias`);
    if (c.from === c.to) errors.push(`conexão ${c.innovation} liga o nó a ele mesmo`);
    const key = `${c.from}>${c.to}`;
    if (pairs.has(key)) errors.push(`par ${key} duplicado`);
    pairs.add(key);
  }
  if (errors.length === 0 && hasCycle(g)) errors.push("o genoma contém ciclo");
  return errors;
}

function hasCycle(g: Genome): boolean {
  const indeg = new Map<number, number>();
  const out = new Map<number, number[]>();
  for (const n of g.nodes) indeg.set(n.id, 0);
  for (const c of g.conns) {
    indeg.set(c.to, (indeg.get(c.to) ?? 0) + 1);
    const list = out.get(c.from);
    if (list) list.push(c.to);
    else out.set(c.from, [c.to]);
  }
  const queue: number[] = [];
  for (const [id, d] of indeg) if (d === 0) queue.push(id);
  let visited = 0;
  while (queue.length > 0) {
    const n = queue.pop() as number;
    visited++;
    for (const next of out.get(n) ?? []) {
      const d = (indeg.get(next) as number) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return visited !== g.nodes.length;
}
