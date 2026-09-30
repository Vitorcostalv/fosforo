import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { toBase64Url } from "../lib/neat/base64url";
import { validateGenome } from "../lib/neat/genome";
import {
  BrainPayload,
  DecodeResult,
  ENGINE_VERSION,
  FORMAT_VERSION,
  MAX_CONNECTIONS,
  MAX_JSON_CHARS,
  MAX_LINK_CHARS,
  decodeBrainBytes,
  decodeBrainJson,
  decodeBrainLink,
  encodeBrainBytes,
  encodeBrainJson,
  encodeBrainLink,
} from "../lib/sim/link";
import { canonicalGenomeString } from "../lib/sim/canonical";
import { LAYOUT, arbGenome, arbSeed } from "./helpers";

const arbEnv = fc.record({
  gravity: fc.double({ min: 0.1, max: 2, noNaN: true }).map(Math.fround),
  mode: fc.constantFrom("normal" as const, "chaos" as const),
  courseSeed: arbSeed,
});
const arbPayload = fc.tuple(arbGenome, arbEnv).map(([genome, env]): BrainPayload => ({ genome, env }));

function assertSafe(r: DecodeResult): void {
  if (r.ok) {
    expect(validateGenome(r.value.genome, LAYOUT, 8)).toEqual([]);
  } else {
    expect(r.message.length).toBeGreaterThan(0);
  }
}

describe("exportar e importar", () => {
  it("JSON: ida e volta devolve exatamente o mesmo genoma e ambiente (propriedade)", () => {
    fc.assert(
      fc.property(arbPayload, (p) => {
        const r = decodeBrainJson(encodeBrainJson(p));
        if (!r.ok) return false;
        return (
          canonicalGenomeString(r.value.genome) === canonicalGenomeString(p.genome) &&
          JSON.stringify(r.value.genome) === JSON.stringify(p.genome) &&
          JSON.stringify(r.value.env) === JSON.stringify(p.env)
        );
      }),
      { numRuns: 300 },
    );
  });

  it("link binário: ida e volta devolve exatamente o mesmo genoma e ambiente (propriedade)", () => {
    fc.assert(
      fc.property(arbPayload, (p) => {
        const r = decodeBrainLink(encodeBrainLink(p));
        if (!r.ok) return false;
        return JSON.stringify(r.value.genome) === JSON.stringify(p.genome) && JSON.stringify(r.value.env) === JSON.stringify(p.env);
      }),
      { numRuns: 300 },
    );
  });

  it("a serialização é estável: exportar duas vezes dá o mesmo texto", () => {
    fc.assert(
      fc.property(arbPayload, (p) => encodeBrainJson(p) === encodeBrainJson(p) && encodeBrainLink(p) === encodeBrainLink(p)),
    );
  });

  it("re-exportar o que foi importado devolve o mesmo texto (JSON e link)", () => {
    fc.assert(
      fc.property(arbPayload, (p) => {
        const json = encodeBrainJson(p);
        const link = encodeBrainLink(p);
        const j = decodeBrainJson(json);
        const l = decodeBrainLink(link);
        return j.ok && l.ok && encodeBrainJson(j.value) === json && encodeBrainLink(l.value) === link;
      }),
    );
  });

  it("um cérebro típico cabe em poucas centenas de caracteres", () => {
    const p = fc.sample(arbPayload, 1)[0];
    expect(encodeBrainLink({ ...p, genome: { ...p.genome } }).length).toBeLessThan(4000);
  });

  it("genoma sem conexões exporta e importa", () => {
    const empty = { nodes: LAYOUT ? Array.from({ length: 6 }, (_, id) => ({ id, kind: id < 4 ? ("input" as const) : id === 4 ? ("bias" as const) : ("output" as const) })) : [], conns: [] };
    const p: BrainPayload = { genome: empty, env: { gravity: Math.fround(0.55), mode: "normal", courseSeed: 0 } };
    const r = decodeBrainLink(encodeBrainLink(p));
    expect(r.ok).toBe(true);
    const j = decodeBrainJson(encodeBrainJson(p));
    expect(j.ok).toBe(true);
  });
});

describe("versões", () => {
  const sample = fc.sample(arbPayload, 1)[0];

  it("link de outro formato ou outro motor mostra mensagem clara", () => {
    const bytes = encodeBrainBytes(sample);
    const otherEngine = Uint8Array.from(bytes);
    otherEngine[3] = ENGINE_VERSION + 1;
    const r1 = decodeBrainBytes(otherEngine);
    expect(r1).toMatchObject({ ok: false, code: "versao-engine" });
    if (!r1.ok) expect(r1.message).toContain(`motor v${ENGINE_VERSION + 1}`);

    const otherFormat = Uint8Array.from(bytes);
    otherFormat[2] = FORMAT_VERSION + 1;
    expect(decodeBrainBytes(otherFormat)).toMatchObject({ ok: false, code: "versao-formato" });
  });

  it("JSON de outro formato ou motor mostra mensagem clara", () => {
    const json = JSON.parse(encodeBrainJson(sample));
    expect(decodeBrainJson(JSON.stringify({ ...json, engine: 99 }))).toMatchObject({ ok: false, code: "versao-engine" });
    expect(decodeBrainJson(JSON.stringify({ ...json, format: 99 }))).toMatchObject({ ok: false, code: "versao-formato" });
    expect(decodeBrainJson(JSON.stringify({ ...json, engine: undefined }))).toMatchObject({ ok: false, code: "versao-engine" });
  });
});

describe("entrada não confiável", () => {
  const valid = fc.sample(arbPayload, 5).find((p) => p.genome.conns.length > 3) ?? fc.sample(arbPayload, 1)[0];
  const validBytes = encodeBrainBytes(valid);

  it("rejeita tamanhos absurdos antes de processar", () => {
    expect(decodeBrainLink("A".repeat(MAX_LINK_CHARS + 1))).toMatchObject({ ok: false, code: "muito-grande" });
    expect(decodeBrainJson(" ".repeat(MAX_JSON_CHARS + 1))).toMatchObject({ ok: false, code: "muito-grande" });
  });

  it("rejeita contagens declaradas acima do limite ou que não batem com o tamanho", () => {
    const b = Uint8Array.from(validBytes);
    const view = new DataView(b.buffer);
    view.setUint16(15, MAX_CONNECTIONS + 1, true);
    expect(decodeBrainBytes(b)).toMatchObject({ ok: false, code: "valor-invalido" });
    view.setUint16(15, 3, true);
    view.setUint16(13, 0, true);
    expect(decodeBrainBytes(b)).toMatchObject({ ok: false, code: "formato-invalido" });
    view.setUint16(13, 9999, true);
    expect(decodeBrainBytes(b)).toMatchObject({ ok: false, code: "valor-invalido" });
  });

  it.each([
    ["magic errado", (b: Uint8Array) => (b[0] = 0)],
    ["modo desconhecido", (b: Uint8Array) => (b[8] = 7)],
    ["gravidade NaN", (b: Uint8Array) => new DataView(b.buffer).setFloat32(4, NaN, true)],
    ["gravidade infinita", (b: Uint8Array) => new DataView(b.buffer).setFloat32(4, Infinity, true)],
    ["gravidade fora da faixa", (b: Uint8Array) => new DataView(b.buffer).setFloat32(4, 50, true)],
    ["peso NaN", (b: Uint8Array) => new DataView(b.buffer).setFloat32(17 + 12 + hiddenBytes(b), NaN, true)],
    ["peso infinito", (b: Uint8Array) => new DataView(b.buffer).setFloat32(17 + 12 + hiddenBytes(b), -Infinity, true)],
    ["peso fora da faixa", (b: Uint8Array) => new DataView(b.buffer).setFloat32(17 + 12 + hiddenBytes(b), 1000, true)],
    ["conexão para nó inexistente", (b: Uint8Array) => new DataView(b.buffer).setUint32(17 + 8 + hiddenBytes(b), 4000, true)],
    ["conexão saindo de nó inexistente", (b: Uint8Array) => new DataView(b.buffer).setUint32(17 + 4 + hiddenBytes(b), 4000, true)],
    ["marca de habilitada inválida", (b: Uint8Array) => (b[17 + 16 + hiddenBytes(b)] = 5)],
    ["innovation repetido", (b: Uint8Array) => new DataView(b.buffer).setUint32(17 + 17 + hiddenBytes(b), 0, true)],
  ])("rejeita: %s", (_name, corrupt) => {
    const b = Uint8Array.from(validBytes);
    corrupt(b);
    const r = decodeBrainBytes(b);
    expect(r.ok).toBe(false);
  });

  function hiddenBytes(b: Uint8Array): number {
    return new DataView(b.buffer).getUint16(13, true) * 4;
  }

  it("rejeita ciclos e laços vindos de fora", () => {
    const mk = (conns: unknown[], hidden: number[] = [6, 7]) =>
      JSON.stringify({ format: 1, engine: 1, env: { gravity: 0.55, mode: "normal", courseSeed: 1 }, genome: { hidden, conns } });
    expect(decodeBrainJson(mk([[0, 6, 7, 1, 1], [1, 7, 6, 1, 1]]))).toMatchObject({ ok: false, code: "estrutura-invalida" });
    expect(decodeBrainJson(mk([[0, 6, 6, 1, 1]]))).toMatchObject({ ok: false, code: "estrutura-invalida" });
    expect(decodeBrainJson(mk([[0, 5, 0, 1, 1]]))).toMatchObject({ ok: false, code: "estrutura-invalida" });
    expect(decodeBrainJson(mk([[0, 0, 5, 1, 1]], [6, 6]))).toMatchObject({ ok: false, code: "estrutura-invalida" });
    expect(decodeBrainJson(mk([[0, 0, 5, 1, 1]], [2]))).toMatchObject({ ok: false, code: "estrutura-invalida" });
    expect(decodeBrainJson(mk([[0, 0, 5, 1, 1]])).ok).toBe(true);
  });

  it.each([
    ["JSON quebrado", "{"],
    ["null", "null"],
    ["array", "[]"],
    ["número", "42"],
    ["sem env", '{"format":1,"engine":1}'],
    ["env não objeto", '{"format":1,"engine":1,"env":3,"genome":{}}'],
  ])("JSON inválido: %s", (_n, text) => {
    expect(decodeBrainJson(text).ok).toBe(false);
  });

  it("JSON com campos de tipo errado ou fora da faixa", () => {
    const base = { format: 1, engine: 1, env: { gravity: 0.55, mode: "normal", courseSeed: 1 }, genome: { hidden: [], conns: [[0, 0, 5, 1, 1]] } };
    const variants: unknown[] = [
      { ...base, env: { ...base.env, gravity: "0.5" } },
      { ...base, env: { ...base.env, gravity: 0 } },
      { ...base, env: { ...base.env, mode: "x" } },
      { ...base, env: { ...base.env, courseSeed: -1 } },
      { ...base, env: { ...base.env, courseSeed: 1.5 } },
      { ...base, genome: { hidden: "x", conns: [] } },
      { ...base, genome: { hidden: [], conns: "x" } },
      { ...base, genome: { hidden: [1.5], conns: [] } },
      { ...base, genome: { hidden: Array.from({ length: 200 }, (_, i) => 6 + i), conns: [] } },
      { ...base, genome: { hidden: [], conns: Array.from({ length: MAX_CONNECTIONS + 1 }, (_, i) => [i, 0, 5, 1, 1]) } },
      { ...base, genome: { hidden: [], conns: [[0, 0, 5]] } },
      { ...base, genome: { hidden: [], conns: ["x"] } },
      { ...base, genome: { hidden: [], conns: [[0, 0, 5, "1", 1]] } },
      { ...base, genome: { hidden: [], conns: [[0, 0, 5, 1, true]] } },
      { ...base, genome: { hidden: [], conns: [[0, -1, 5, 1, 1]] } },
      { ...base, genome: { hidden: [], conns: [[0, 0, 5, 99, 1]] } },
    ];
    for (const v of variants) expect(decodeBrainJson(JSON.stringify(v)).ok).toBe(false);
    expect(decodeBrainJson(JSON.stringify(base)).ok).toBe(true);
  });

  it("links corrompidos ou aleatórios nunca lançam e só aceitam genoma válido (propriedade)", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ maxLength: 300 }),
          fc.stringMatching(/^[A-Za-z0-9_-]{0,400}$/),
          fc.uint8Array({ maxLength: 300 }).map(toBase64Url),
          fc.tuple(fc.nat({ max: validBytes.length }), fc.uint8Array({ minLength: 1, maxLength: 8 })).map(([at, junk]) => {
            const b = Uint8Array.from(validBytes);
            junk.forEach((v, i) => {
              if (at + i < b.length) b[at + i] ^= v;
            });
            return toBase64Url(b);
          }),
          fc.nat({ max: validBytes.length }).map((cut) => toBase64Url(validBytes.slice(0, cut))),
          fc.uint8Array({ maxLength: 60 }).map((extra) => toBase64Url(Uint8Array.from([...validBytes, ...extra]))),
        ),
        (text) => {
          assertSafe(decodeBrainLink(text));
          return true;
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("corpo aleatório atrás de um cabeçalho válido nunca lança nem passa inválido (propriedade)", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 400 }), (body) => {
        const head = Uint8Array.from(validBytes.slice(0, 17));
        const bytes = Uint8Array.from([...head, ...body]);
        assertSafe(decodeBrainBytes(bytes));
        return true;
      }),
      { numRuns: 1500 },
    );
  });

  it("JSON aleatório e JSON válido corrompido nunca lançam (propriedade)", () => {
    const json = encodeBrainJson(valid);
    fc.assert(
      fc.property(
        fc.oneof(
          fc.json(),
          fc.string({ maxLength: 200 }),
          fc.tuple(fc.nat({ max: json.length }), fc.string({ maxLength: 5 })).map(([at, junk]) => json.slice(0, at) + junk + json.slice(at + 1)),
        ),
        (text) => {
          assertSafe(decodeBrainJson(text));
          return true;
        },
      ),
      { numRuns: 1500 },
    );
  });

  it("entradas que não são texto ou bytes curtos demais não lançam", () => {
    expect(decodeBrainLink(undefined as never).ok).toBe(false);
    expect(decodeBrainJson(undefined as never).ok).toBe(false);
    expect(decodeBrainLink("").ok).toBe(false);
    expect(decodeBrainLink("!!!!").ok).toBe(false);
    expect(decodeBrainBytes(new Uint8Array(3)).ok).toBe(false);
  });

  it("o pior caso permitido é decodificado rápido (não trava o Worker)", () => {
    const conns = Array.from({ length: MAX_CONNECTIONS }, (_, i) => [i, i % 4, 5 + (i % 1), 1, 1]);
    const text = JSON.stringify({ format: 1, engine: 1, env: { gravity: 0.55, mode: "normal", courseSeed: 1 }, genome: { hidden: [], conns } });
    const t0 = performance.now();
    decodeBrainJson(text);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
