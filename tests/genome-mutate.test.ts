import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { activate } from "../lib/neat/activation";
import {
  ConnGene,
  Genome,
  baseNodes,
  clampWeight,
  hasConnection,
  hasPath,
  sortGenome,
  toWeight,
  validateGenome,
} from "../lib/neat/genome";
import { InnovationTracker } from "../lib/neat/innovation";
import { addConnection, addNode, createMinimalGenome, mutate, mutateWeights } from "../lib/neat/mutate";
import { Rng } from "../lib/neat/rng";
import { CFG, LAYOUT, arbGenome, arbSeed, freshTracker, grownGenome } from "./helpers";

const conn = (innovation: number, from: number, to: number, weight = 1, enabled = true): ConnGene => ({
  innovation,
  from,
  to,
  weight,
  enabled,
});

describe("genoma mínimo", () => {
  it("liga cada entrada e o bias a cada saída, sem nós ocultos, e é válido", () => {
    const g = createMinimalGenome(LAYOUT, CFG, freshTracker(), new Rng(1));
    expect(g.conns).toHaveLength(LAYOUT.numInputs + 1);
    expect(g.nodes.filter((n) => n.kind === "hidden")).toHaveLength(0);
    expect(validateGenome(g, LAYOUT, CFG.weightLimit)).toEqual([]);
  });

  it("toda a população inicial compartilha os mesmos innovation numbers", () => {
    const tracker = freshTracker();
    const rng = new Rng(2);
    const a = createMinimalGenome(LAYOUT, CFG, tracker, rng);
    const b = createMinimalGenome(LAYOUT, CFG, tracker, rng);
    expect(a.conns.map((c) => c.innovation)).toEqual(b.conns.map((c) => c.innovation));
  });
});

describe("pesos", () => {
  it("toWeight normaliza -0 e arredonda para float32", () => {
    expect(Object.is(toWeight(-0), 0)).toBe(true);
    expect(toWeight(0.1)).toBe(Math.fround(0.1));
    expect(clampWeight(99, 8)).toBe(8);
    expect(clampWeight(-99, 8)).toBe(-8);
  });

  it("taxa 0 não mexe; taxa 1 mexe em todos e respeita o limite", () => {
    const g = grownGenome(5, 3);
    expect(mutateWeights(g, new Rng(1), { ...CFG, weightMutationRate: 0 })).toBe(g);
    const m = mutateWeights(g, new Rng(1), { ...CFG, weightMutationRate: 1 });
    expect(m.conns.some((c, i) => c.weight !== g.conns[i].weight)).toBe(true);
    for (const c of m.conns) {
      expect(Math.abs(c.weight)).toBeLessThanOrEqual(CFG.weightLimit);
      expect(c.weight).toBe(Math.fround(c.weight));
    }
  });

  it("perturbação fica dentro de ±power e substituição dentro de ±range", () => {
    const g = createMinimalGenome(LAYOUT, CFG, freshTracker(), new Rng(1));
    const perturb = mutateWeights(g, new Rng(2), { ...CFG, weightMutationRate: 1, weightPerturbProb: 1 });
    perturb.conns.forEach((c, i) => expect(Math.abs(c.weight - g.conns[i].weight)).toBeLessThanOrEqual(CFG.weightPerturbPower + 1e-6));
    const replace = mutateWeights(g, new Rng(2), { ...CFG, weightMutationRate: 1, weightPerturbProb: 0 });
    for (const c of replace.conns) expect(Math.abs(c.weight)).toBeLessThanOrEqual(CFG.weightReplaceRange);
  });
});

describe("adicionar nó", () => {
  it("desabilita a conexão, entra com peso 1 e sai com o peso antigo", () => {
    const tracker = freshTracker();
    const g = createMinimalGenome(LAYOUT, CFG, tracker, new Rng(1));
    tracker.startGeneration();
    const out = addNode(g, new Rng(3), tracker);
    const hidden = out.nodes.find((n) => n.kind === "hidden");
    expect(hidden).toBeDefined();
    const id = (hidden as { id: number }).id;
    const into = out.conns.find((c) => c.to === id) as ConnGene;
    const outgoing = out.conns.find((c) => c.from === id) as ConnGene;
    const split = out.conns.find((c) => !c.enabled) as ConnGene;
    expect(into.weight).toBe(1);
    expect(into.from).toBe(split.from);
    expect(outgoing.to).toBe(split.to);
    expect(outgoing.weight).toBe(split.weight);
    expect(validateGenome(out, LAYOUT, CFG.weightLimit)).toEqual([]);
  });

  it("sem conexão habilitada não faz nada", () => {
    const g: Genome = { nodes: baseNodes(LAYOUT), conns: [] };
    expect(addNode(g, new Rng(1), freshTracker())).toBe(g);
  });

  it("dois genomas dividindo a mesma conexão na mesma geração recebem o mesmo nó e as mesmas innovations", () => {
    const tracker = freshTracker();
    const base = createMinimalGenome(LAYOUT, CFG, tracker, new Rng(1));
    tracker.startGeneration();
    const a = addNode(base, new Rng(5), tracker);
    const b = addNode(base, new Rng(5), tracker);
    expect(a.nodes).toEqual(b.nodes);
    expect(a.conns.map((c) => c.innovation)).toEqual(b.conns.map((c) => c.innovation));
  });

  it("em gerações diferentes, a mesma divisão gera nó e innovations novos", () => {
    const tracker = freshTracker();
    const base = createMinimalGenome(LAYOUT, CFG, tracker, new Rng(1));
    tracker.startGeneration();
    const a = addNode(base, new Rng(5), tracker);
    tracker.startGeneration();
    const b = addNode(base, new Rng(5), tracker);
    const idA = a.nodes.find((n) => n.kind === "hidden")?.id;
    const idB = b.nodes.find((n) => n.kind === "hidden")?.id;
    expect(idA).not.toBe(idB);
  });

  it("se o nó da divisão já existe no genoma, não duplica", () => {
    const tracker = freshTracker();
    const base = createMinimalGenome(LAYOUT, CFG, tracker, new Rng(1));
    tracker.startGeneration();
    const once = addNode(base, new Rng(5), tracker);
    // Reabilita a conexão dividida e tenta dividir de novo na mesma geração.
    const reenabled: Genome = { nodes: once.nodes, conns: once.conns.map((c) => ({ ...c, enabled: true })) };
    const again = addNode({ ...reenabled, conns: reenabled.conns.filter((c) => c.from < LAYOUT.firstHiddenId && c.to < LAYOUT.firstHiddenId) }, new Rng(5), tracker);
    expect(again.nodes.filter((n) => n.kind === "hidden").length).toBeLessThanOrEqual(1);
  });
});

describe("adicionar conexão", () => {
  it("nunca cria ciclo, duplicata nem aresta ilegal (propriedade)", () => {
    fc.assert(
      fc.property(arbGenome, arbSeed, (g, seed) => {
        const tracker = freshTracker();
        tracker.nextInnovation = 10_000;
        const out = addConnection(g, new Rng(seed), tracker, { ...CFG, addConnectionAttempts: 50 });
        return validateGenome(out, LAYOUT, CFG.weightLimit).length === 0;
      }),
      { numRuns: 300 },
    );
  });

  it("recusa a conexão quando já existe caminho do destino para a origem", () => {
    // 0 -> 6 -> 5(saída). Ligar 5 -> qualquer coisa é ilegal; ligar 6 -> 6 também.
    const g: Genome = {
      nodes: [...baseNodes(LAYOUT), { id: 6, kind: "hidden" }, { id: 7, kind: "hidden" }],
      conns: [conn(0, 0, 6), conn(1, 6, 7), conn(2, 7, 5)],
    };
    expect(hasPath(g.conns, 6, 5)).toBe(true);
    expect(hasPath(g.conns, 5, 6)).toBe(false);
    // Sozinho, 7 -> 6 fecharia ciclo (6 -> 7 existe).
    for (let seed = 0; seed < 200; seed++) {
      const tracker = freshTracker();
      tracker.nextInnovation = 100;
      const out = addConnection(g, new Rng(seed), tracker, { ...CFG, addConnectionAttempts: 30 });
      expect(hasConnection(out.conns, 7, 6)).toBe(false);
      expect(hasConnection(out.conns, 5, 6)).toBe(false);
      expect(validateGenome(out, LAYOUT, CFG.weightLimit)).toEqual([]);
    }
  });

  it("sem par livre (rede já totalmente conectada) devolve o mesmo genoma", () => {
    const g = createMinimalGenome(LAYOUT, CFG, freshTracker(), new Rng(1));
    expect(addConnection(g, new Rng(1), freshTracker(), CFG)).toBe(g);
  });

  it("genoma sem alvos possíveis devolve o mesmo", () => {
    const g: Genome = { nodes: baseNodes(LAYOUT).filter((n) => n.kind !== "output"), conns: [] };
    expect(addConnection(g, new Rng(1), freshTracker(), CFG)).toBe(g);
  });
});

describe("mutate", () => {
  it("taxa 0 mantém a estrutura; taxa 1 sempre tenta crescer", () => {
    const tracker = freshTracker();
    const g = createMinimalGenome(LAYOUT, CFG, tracker, new Rng(1));
    const still = mutate(g, new Rng(1), tracker, { ...CFG, weightMutationRate: 0, addNodeRate: 0, addConnectionRate: 0 });
    expect(still).toBe(g);
    let grown = g;
    const rng = new Rng(2);
    for (let i = 0; i < 10; i++) {
      tracker.startGeneration();
      grown = mutate(grown, rng, tracker, { ...CFG, weightMutationRate: 1, addNodeRate: 1, addConnectionRate: 1 });
    }
    expect(grown.nodes.filter((n) => n.kind === "hidden").length).toBeGreaterThan(0);
    expect(validateGenome(grown, LAYOUT, CFG.weightLimit)).toEqual([]);
  });

  it("qualquer sequência de mutações mantém o genoma válido (propriedade)", () => {
    fc.assert(
      fc.property(arbGenome, (g) => validateGenome(g, LAYOUT, CFG.weightLimit).length === 0),
      { numRuns: 300 },
    );
  });
});

describe("innovation numbers", () => {
  it("mesma estrutura na mesma geração ⇒ mesmo número; estruturas diferentes ⇒ números diferentes", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 8 }), fc.integer({ min: 0, max: 8 })), { minLength: 1, maxLength: 60 }), (pairs) => {
        const t = new InnovationTracker(6);
        const seen = new Map<string, number>();
        const byNumber = new Map<number, string>();
        for (const [from, to] of pairs) {
          const key = `${from}>${to}`;
          const n = t.connection(from, to);
          if (seen.has(key) && seen.get(key) !== n) return false;
          if (byNumber.has(n) && byNumber.get(n) !== key) return false;
          seen.set(key, n);
          byNumber.set(n, key);
        }
        return true;
      }),
    );
  });

  it("o contador é global: nunca reutiliza números depois de startGeneration", () => {
    const t = new InnovationTracker(6);
    const first = t.connection(0, 5);
    t.startGeneration();
    const second = t.connection(0, 5);
    expect(second).toBeGreaterThan(first);
    expect(t.splitNode(1)).not.toBe(t.splitNode(2));
    t.startGeneration();
    expect(t.splitNode(1)).toBeGreaterThan(6);
  });

  it("genomas de uma população real nunca têm a mesma innovation para pares distintos", () => {
    const tracker = freshTracker();
    const rng = new Rng(11);
    const owner = new Map<number, string>();
    let g = createMinimalGenome(LAYOUT, CFG, tracker, rng);
    for (let gen = 0; gen < 30; gen++) {
      tracker.startGeneration();
      const kids = Array.from({ length: 10 }, () => mutate(g, rng, tracker, { ...CFG, addNodeRate: 0.6, addConnectionRate: 0.8 }));
      for (const k of kids) {
        for (const c of k.conns) {
          const key = `${c.from}>${c.to}`;
          const prev = owner.get(c.innovation);
          expect(prev === undefined || prev === key).toBe(true);
          owner.set(c.innovation, key);
        }
      }
      g = kids[kids.length - 1];
    }
  });
});

describe("validateGenome", () => {
  const base = (): Genome => ({ nodes: baseNodes(LAYOUT), conns: [conn(0, 0, 5)] });

  it("aceita o básico", () => expect(validateGenome(base(), LAYOUT)).toEqual([]));

  it.each([
    ["nó de origem inexistente", (g: Genome) => (g.conns = [conn(0, 99, 5)])],
    ["nó de destino inexistente", (g: Genome) => (g.conns = [conn(0, 0, 99)])],
    ["sai de saída", (g: Genome) => (g.conns = [conn(0, 5, 0)])],
    ["chega em entrada", (g: Genome) => (g.conns = [conn(0, 1, 0)])],
    ["chega em bias", (g: Genome) => (g.conns = [conn(0, 0, 4)])],
    ["laço em si mesmo", (g: Genome) => ((g.nodes = [...g.nodes, { id: 6, kind: "hidden" }]), (g.conns = [conn(0, 6, 6)]))],
    ["par duplicado", (g: Genome) => (g.conns = [conn(0, 0, 5), conn(1, 0, 5)])],
    ["innovation repetido", (g: Genome) => (g.conns = [conn(1, 0, 5), conn(1, 1, 5)])],
    ["innovation negativo", (g: Genome) => (g.conns = [conn(-1, 0, 5)])],
    ["peso NaN", (g: Genome) => (g.conns = [conn(0, 0, 5, NaN)])],
    ["peso infinito", (g: Genome) => (g.conns = [conn(0, 0, 5, Infinity)])],
    ["nó obrigatório ausente", (g: Genome) => (g.nodes = g.nodes.filter((n) => n.kind !== "output"))],
    ["id de nó repetido", (g: Genome) => (g.nodes = [...g.nodes, { id: 5, kind: "hidden" }])],
    ["oculto na faixa reservada", (g: Genome) => (g.nodes = sortGenome({ nodes: [...g.nodes, { id: 2, kind: "hidden" }], conns: [] }).nodes)],
    ["id de nó não inteiro", (g: Genome) => (g.nodes = [...g.nodes, { id: 6.5, kind: "hidden" }])],
  ])("recusa: %s", (_name, mutateFn) => {
    const g = base();
    mutateFn(g);
    expect(validateGenome(g, LAYOUT).length).toBeGreaterThan(0);
  });

  it("recusa ciclo entre nós ocultos", () => {
    const g: Genome = {
      nodes: [...baseNodes(LAYOUT), { id: 6, kind: "hidden" }, { id: 7, kind: "hidden" }],
      conns: [conn(0, 6, 7), conn(1, 7, 6)],
    };
    expect(validateGenome(g, LAYOUT)).toContain("o genoma contém ciclo");
  });

  it("recusa peso acima do limite quando o limite é informado", () => {
    const g: Genome = { nodes: baseNodes(LAYOUT), conns: [conn(0, 0, 5, 9)] };
    expect(validateGenome(g, LAYOUT, 8).length).toBeGreaterThan(0);
    expect(validateGenome(g, LAYOUT)).toEqual([]);
  });
});

describe("ativação softsign", () => {
  it("tem saída em (-1, 1), é monotônica, ímpar e nunca é NaN (propriedade)", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, min: -1e6, max: 1e6 }), fc.double({ noNaN: true, min: -1e6, max: 1e6 }), (a, b) => {
        const fa = activate(a);
        const fb = activate(b);
        if (!(fa > -1 && fa < 1)) return false;
        if (a <= b && fa > fb) return false;
        return activate(-a) === -fa;
      }),
    );
    expect(activate(0)).toBe(0);
    expect(activate(1)).toBe(0.5);
  });
});
