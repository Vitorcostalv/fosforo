import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { crossover } from "../lib/neat/crossover";
import { compatibilityDistance } from "../lib/neat/distance";
import { ConnGene, Genome, baseNodes, validateGenome } from "../lib/neat/genome";
import { compile, forward } from "../lib/neat/network";
import { createMinimalGenome } from "../lib/neat/mutate";
import { Rng } from "../lib/neat/rng";
import { CFG, LAYOUT, arbGenome, arbParents, arbSeed, freshTracker } from "./helpers";

const conn = (innovation: number, from: number, to: number, weight = 1, enabled = true): ConnGene => ({
  innovation,
  from,
  to,
  weight,
  enabled,
});
const genome = (extraHidden: number[], conns: ConnGene[]): Genome => ({
  nodes: [...baseNodes(LAYOUT), ...extraHidden.map((id) => ({ id, kind: "hidden" as const }))],
  conns,
});

describe("cruzamento", () => {
  it("nunca produz genoma inválido, mesmo com pais de linhagens colidentes (propriedade)", () => {
    fc.assert(
      fc.property(arbParents, arbSeed, fc.boolean(), fc.boolean(), ([a, b], seed, aFitter, equal) => {
        const child = crossover(a, b, aFitter, equal, new Rng(seed), CFG, LAYOUT);
        return validateGenome(child, LAYOUT, CFG.weightLimit).length === 0;
      }),
      { numRuns: 500 },
    );
  });

  it("nunca produz genoma inválido com pais da mesma linhagem (propriedade)", () => {
    fc.assert(
      fc.property(arbGenome, arbSeed, (a, seed) => {
        const child = crossover(a, a, true, true, new Rng(seed), CFG, LAYOUT);
        return validateGenome(child, LAYOUT, CFG.weightLimit).length === 0;
      }),
    );
  });

  it("disjoint e excess vêm do pai mais apto; genes que casam vêm de qualquer um", () => {
    const a = genome([6], [conn(0, 0, 5, 1), conn(1, 0, 6, 2), conn(2, 6, 5, 3)]);
    const b = genome([], [conn(0, 0, 5, 9), conn(3, 1, 5, 4)]);
    for (let seed = 0; seed < 50; seed++) {
      const child = crossover(a, b, true, false, new Rng(seed), CFG, LAYOUT);
      expect(child.conns.map((c) => c.innovation)).toEqual([0, 1, 2]);
      expect([1, 9]).toContain(child.conns[0].weight);
      const other = crossover(a, b, false, false, new Rng(seed), CFG, LAYOUT);
      expect(other.conns.map((c) => c.innovation)).toEqual([0, 3]);
    }
  });

  it("com aptidão igual, disjoint/excess entram ao acaso (vê os dois resultados)", () => {
    const a = genome([], [conn(0, 0, 5), conn(1, 1, 5)]);
    const b = genome([], [conn(0, 0, 5), conn(2, 2, 5)]);
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      seen.add(crossover(a, b, true, true, new Rng(seed), CFG, LAYOUT).conns.map((c) => c.innovation).join(","));
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it("gene desabilitado em algum pai fica desabilitado com ~75% de chance", () => {
    const a = genome([], [conn(0, 0, 5, 1, false)]);
    const b = genome([], [conn(0, 0, 5, 1, true)]);
    let disabled = 0;
    const n = 4000;
    for (let seed = 0; seed < n; seed++) {
      if (!crossover(a, b, true, false, new Rng(seed), CFG, LAYOUT).conns[0].enabled) disabled++;
    }
    expect(disabled / n).toBeGreaterThan(0.71);
    expect(disabled / n).toBeLessThan(0.79);
  });

  it("descarta gene que fecharia ciclo ou repetiria o par com innovation diferente", () => {
    const a = genome([6, 7], [conn(0, 6, 7), conn(1, 0, 6), conn(2, 7, 5)]);
    const b = genome([6, 7], [conn(3, 7, 6), conn(4, 0, 6)]); // 7→6 fecha ciclo; 0→6 repete par
    const child = crossover(a, b, true, true, new Rng(1), CFG, LAYOUT);
    expect(validateGenome(child, LAYOUT, CFG.weightLimit)).toEqual([]);
  });

  it("filho de dois genomas sem conexões é uma rede sem conexões válida", () => {
    const empty = genome([], []);
    const child = crossover(empty, empty, true, true, new Rng(1), CFG, LAYOUT);
    expect(child.conns).toEqual([]);
    expect(validateGenome(child, LAYOUT)).toEqual([]);
  });
});

describe("distância de compatibilidade", () => {
  const coef = { c1: 1, c2: 1, c3: 0.4 };

  it("é 0 para genomas idênticos e simétrica (propriedade)", () => {
    fc.assert(
      fc.property(arbParents, ([a, b]) => {
        expect(compatibilityDistance(a, a, coef)).toBe(0);
        expect(Math.abs(compatibilityDistance(a, b, coef) - compatibilityDistance(b, a, coef))).toBeLessThan(1e-9);
        expect(Number.isFinite(compatibilityDistance(a, b, coef))).toBe(true);
        expect(compatibilityDistance(a, b, coef)).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("confere com a Equação 1 do artigo numa conta feita à mão (N = 1, genomas pequenos)", () => {
    // A: 0,1,2,4 · B: 0,1,3,5,6 · casam 0 e 1 (dif. de pesos 0,5 e 1,5 → média 1)
    // disjoint (dentro do alcance do outro): A{2}, B{3}; A{4}: max B=6, 4<6 → disjoint;
    // B{5}: max A=4 → excess; B{6} → excess. D = 3 (2, 3, 4)  E = 2 (5, 6)
    const a = genome([], [conn(0, 0, 5, 1), conn(1, 1, 5, 2), conn(2, 2, 5, 0), conn(4, 3, 5, 0)]);
    const b = genome([], [conn(0, 0, 5, 1.5), conn(1, 1, 5, 0.5), conn(3, 2, 5, 0), conn(5, 3, 5, 0), conn(6, 4, 5, 0)]);
    const expected = 1 * 2 + 1 * 3 + 0.4 * 1; // c1·E/N + c2·D/N + c3·W̄ com N = 1
    expect(Math.abs(compatibilityDistance(a, b, coef) - expected)).toBeLessThan(1e-9);
  });

  it("normaliza por N quando o maior genoma tem 20 genes ou mais", () => {
    const many = (n: number, offset = 0): Genome =>
      genome([], Array.from({ length: n }, (_, i) => conn(i + offset, i % 4, 5, 0)));
    const a = many(20);
    const b = many(22);
    // 2 genes excess, N = 22
    expect(Math.abs(compatibilityDistance(a, b, coef) - 2 / 22)).toBeLessThan(1e-9);
  });

  it("sem genes em comum, W̄ = 0", () => {
    const a = genome([], [conn(0, 0, 5, 5)]);
    const b = genome([], [conn(1, 1, 5, -5)]);
    expect(compatibilityDistance(a, b, coef)).toBe(2);
    expect(compatibilityDistance(genome([], []), genome([], []), coef)).toBe(0);
  });
});

describe("rede", () => {
  it("rede sem conexões devolve saída 0", () => {
    const net = compile(genome([], []), LAYOUT);
    expect(forward(net, [1, 1, 1, 1])).toEqual([0]);
  });

  it("calcula à mão: saída = softsign(w·x + b)", () => {
    const g = genome([], [conn(0, 0, 5, 2), conn(1, 4, 5, -1)]);
    const out = forward(compile(g, LAYOUT), [0.5, 0, 0, 0])[0];
    expect(out).toBe(0 / (1 + 0)); // 2·0,5 − 1·1 = 0
    const out2 = forward(compile(g, LAYOUT), [1, 0, 0, 0])[0];
    expect(out2).toBe(1 / 2);
  });

  it("nó oculto: passa pela ativação antes de seguir", () => {
    const g = genome([6], [conn(0, 0, 6, 1), conn(1, 6, 5, 1)]);
    const out = forward(compile(g, LAYOUT), [1, 0, 0, 0])[0];
    expect(out).toBe(0.5 / 1.5);
  });

  it("conexões desabilitadas não contam", () => {
    const g = genome([], [conn(0, 0, 5, 3, false)]);
    expect(forward(compile(g, LAYOUT), [1, 0, 0, 0])).toEqual([0]);
  });

  it("entradas NaN/Infinity viram 0 e a saída é sempre finita (propriedade)", () => {
    fc.assert(
      fc.property(arbGenome, fc.array(fc.oneof(fc.double(), fc.constant(NaN), fc.constant(Infinity)), { minLength: 4, maxLength: 4 }), (g, inputs) => {
        const out = forward(compile(g, LAYOUT), inputs);
        return out.length === 1 && Number.isFinite(out[0]) && Math.abs(out[0]) <= 1;
      }),
    );
  });

  it("reaproveitar o buffer não muda o resultado", () => {
    const g = createMinimalGenome(LAYOUT, CFG, freshTracker(), new Rng(4));
    const net = compile(g, LAYOUT);
    const buf = new Float64Array(net.numNodes);
    const a = forward(net, [0.1, 0.2, 0.3, 0.4], buf);
    const b = forward(net, [0.1, 0.2, 0.3, 0.4]);
    expect(a).toEqual(b);
  });
});
