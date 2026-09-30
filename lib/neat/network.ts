import { activate } from "./activation";
import { Genome, Layout } from "./genome";

/** Rede compilada: índices densos, ordem topológica fixa e somas na ordem de innovation. */
export interface Network {
  numNodes: number;
  numInputs: number;
  numOutputs: number;
  /** Índice denso do nó de bias e do primeiro nó de saída. */
  biasIndex: number;
  firstOutputIndex: number;
  /** Nós a calcular, em ordem topológica (índices densos). */
  order: number[];
  /** Para cada nó, conexões habilitadas que chegam nele: [índice de origem, peso]. */
  incoming: Array<Array<[number, number]>>;
}

export function compile(g: Genome, layout: Layout): Network {
  const index = new Map<number, number>();
  g.nodes.forEach((n, i) => index.set(n.id, i));
  const n = g.nodes.length;
  const incoming: Array<Array<[number, number]>> = Array.from({ length: n }, () => []);
  const outgoing: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array<number>(n).fill(0);

  for (const c of g.conns) {
    if (!c.enabled) continue;
    const from = index.get(c.from);
    const to = index.get(c.to);
    if (from === undefined || to === undefined) continue;
    incoming[to].push([from, c.weight]);
    outgoing[from].push(to);
    indeg[to]++;
  }

  const ready: number[] = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) ready.push(i);
  const order: number[] = [];
  const inputCount = layout.numInputs + 1;
  while (ready.length > 0) {
    ready.sort((a, b) => b - a);
    const node = ready.pop() as number;
    if (node >= inputCount) order.push(node);
    for (const next of outgoing[node]) {
      if (--indeg[next] === 0) ready.push(next);
    }
  }

  return {
    numNodes: n,
    numInputs: layout.numInputs,
    numOutputs: layout.numOutputs,
    biasIndex: layout.biasId,
    firstOutputIndex: layout.firstOutputId,
    order,
    incoming,
  };
}

/** Entradas são limitadas a ±1e6 (o jogo usa ~[-1, 1]); sem isso, 1e308 × peso estoura para Infinity e vira NaN. */
export const INPUT_LIMIT = 1e6;

/** Entradas não finitas viram 0. As saídas são sempre finitas, em [-1, 1]. */
export function forward(net: Network, inputs: readonly number[], values?: Float64Array): number[] {
  const v = values ?? new Float64Array(net.numNodes);
  v.fill(0);
  for (let i = 0; i < net.numInputs; i++) {
    const x = inputs[i];
    v[i] = Number.isFinite(x) ? Math.min(INPUT_LIMIT, Math.max(-INPUT_LIMIT, x)) : 0;
  }
  v[net.biasIndex] = 1;
  for (const node of net.order) {
    let sum = 0;
    for (const [from, w] of net.incoming[node]) sum += w * v[from];
    v[node] = activate(sum);
  }
  const out: number[] = [];
  for (let o = 0; o < net.numOutputs; o++) out.push(v[net.firstOutputIndex + o]);
  return out;
}
