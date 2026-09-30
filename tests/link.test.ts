import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_GRAVITY } from "../lib/game/config";
import { Level } from "../lib/game/level";
import { BUILTIN_LEVELS } from "../lib/game/levels";
import { toBase64Url } from "../lib/neat/base64url";
import { validateGenome } from "../lib/neat/genome";
import { canonicalGenomeString } from "../lib/sim/canonical";
import { resolveCourse } from "../lib/sim/env";
import {
  BrainPayload,
  DecodeResult,
  ENGINE_VERSION,
  FORMAT_VERSION,
  MAX_CONNECTIONS,
  MAX_JSON_CHARS,
  MAX_LINK_CHARS,
  WorldRef,
  decodeBrainBytes,
  decodeBrainJson,
  decodeBrainLink,
  encodeBrainBytes,
  encodeBrainJson,
  encodeBrainLink,
} from "../lib/sim/link";
import { LAYOUT, arbGenome, arbSeed } from "./helpers";
import { feasibleByConstruction, impossibleByConstruction } from "./levelgen";

// Fases customizadas viáveis, calculadas uma vez.
const CUSTOM_LEVELS: Level[] = [];
for (let seed = 1; CUSTOM_LEVELS.length < 3 && seed < 500; seed++) {
  const level = feasibleByConstruction(seed, DEFAULT_GRAVITY, 4);
  if (level) CUSTOM_LEVELS.push(level);
}

const arbWorld: fc.Arbitrary<{ world: WorldRef; gravity: number }> = fc.oneof(
  fc.integer({ min: 1, max: 10 }).map((index) => ({ world: { kind: "builtin" as const, index, version: 1 }, gravity: DEFAULT_GRAVITY })),
  fc.constantFrom(...CUSTOM_LEVELS).map((level) => ({ world: { kind: "custom" as const, level }, gravity: DEFAULT_GRAVITY })),
  fc.tuple(arbSeed, fc.double({ min: 0.2, max: 2, noNaN: true })).map(([seed, g]) => ({ world: { kind: "chaos" as const, seed }, gravity: Math.fround(g) })),
);
const arbPayload = fc.tuple(arbGenome, arbWorld).map(([genome, w]): BrainPayload => ({ genome, env: { gravity: w.gravity, world: w.world } }));

function assertSafe(r: DecodeResult): void {
  if (r.ok) {
    expect(validateGenome(r.value.genome, LAYOUT, 8)).toEqual([]);
    expect(resolveCourse(r.value.env)).not.toBeNull();
  } else {
    expect(r.message.length).toBeGreaterThan(0);
  }
}

const sample = (want: WorldRef["kind"]): BrainPayload => {
  for (const p of fc.sample(arbPayload, 200)) if (p.env.world.kind === want && p.genome.conns.length > 3) return p;
  throw new Error("sem amostra");
};

/** Reduz o payload a uma cópia estruturalmente comparável. */
const shape = (p: BrainPayload) => {
  const w = p.env.world;
  const world = w.kind === "custom" ? { kind: w.kind, speed: w.level.speed, finishX: w.level.finishX, obstacles: w.level.obstacles } : w;
  return JSON.stringify({ g: canonicalGenomeString(p.genome), gr: p.env.gravity, w: world });
};

describe("exportar e importar", () => {
  it("JSON: ida e volta devolve exatamente o mesmo genoma, gravidade e fase (propriedade)", () => {
    fc.assert(
      fc.property(arbPayload, (p) => {
        const r = decodeBrainJson(encodeBrainJson(p));
        return r.ok && shape(r.value) === shape(p) && JSON.stringify(r.value.genome) === JSON.stringify(p.genome);
      }),
      { numRuns: 200 },
    );
  });

  it("link binário: ida e volta devolve exatamente o mesmo genoma, gravidade e fase (propriedade)", () => {
    fc.assert(
      fc.property(arbPayload, (p) => {
        const r = decodeBrainLink(encodeBrainLink(p));
        return r.ok && shape(r.value) === shape(p) && JSON.stringify(r.value.genome) === JSON.stringify(p.genome);
      }),
      { numRuns: 200 },
    );
  });

  it("exportar duas vezes dá o mesmo texto, e re-exportar o importado também", () => {
    fc.assert(
      fc.property(arbPayload, (p) => {
        const json = encodeBrainJson(p);
        const link = encodeBrainLink(p);
        const j = decodeBrainJson(json);
        const l = decodeBrainLink(link);
        return json === encodeBrainJson(p) && link === encodeBrainLink(p) && j.ok && l.ok && encodeBrainJson(j.value) === json && encodeBrainLink(l.value) === link;
      }),
      { numRuns: 100 },
    );
  });

  it("fase embutida no link: só id e versão (poucos bytes); customizada leva os dados", () => {
    const builtin = sample("builtin");
    const custom = sample("custom");
    const chaos = sample("chaos");
    const sizeOf = (p: BrainPayload) => encodeBrainBytes(p).length;
    const noGenome = (p: BrainPayload): BrainPayload => ({ ...p, genome: { nodes: p.genome.nodes.filter((n) => n.kind !== "hidden"), conns: [] } });
    expect(sizeOf(noGenome(custom))).toBeGreaterThan(sizeOf(noGenome(builtin)) + 20);
    expect(sizeOf(noGenome(builtin))).toBeLessThan(sizeOf(noGenome(chaos)));
    expect(encodeBrainLink(custom).length).toBeLessThan(MAX_LINK_CHARS);
  });

  it("o percurso carregado do link é o mesmo que foi treinado", () => {
    const p = sample("custom");
    const r = decodeBrainLink(encodeBrainLink(p));
    expect(r.ok).toBe(true);
    const pick = (c: ReturnType<typeof resolveCourse>) => ({ speed: c?.level.speed, finishX: c?.level.finishX, obstacles: c?.level.obstacles, wind: c?.wind });
    if (r.ok) expect(pick(resolveCourse(r.value.env))).toEqual(pick(resolveCourse(p.env)));
    const b = sample("builtin");
    const rb = decodeBrainLink(encodeBrainLink(b));
    if (rb.ok && b.env.world.kind === "builtin") expect(resolveCourse(rb.value.env)?.level).toEqual(BUILTIN_LEVELS[b.env.world.index - 1]);
  });

  it("genoma sem conexões exporta e importa", () => {
    const empty = { nodes: Array.from({ length: 6 }, (_, id) => ({ id, kind: id < 4 ? ("input" as const) : id === 4 ? ("bias" as const) : ("output" as const) })), conns: [] };
    const p: BrainPayload = { genome: empty, env: { gravity: DEFAULT_GRAVITY, world: { kind: "builtin", index: 1, version: 1 } } };
    expect(decodeBrainLink(encodeBrainLink(p)).ok).toBe(true);
    expect(decodeBrainJson(encodeBrainJson(p)).ok).toBe(true);
  });
});

describe("versões (link antigo nunca falha em silêncio)", () => {
  const builtin = sample("builtin");

  it("outro motor ou outro formato mostram mensagem clara (binário)", () => {
    const bytes = encodeBrainBytes(builtin);
    const engine = Uint8Array.from(bytes);
    engine[3] = ENGINE_VERSION + 1;
    const r1 = decodeBrainBytes(engine);
    expect(r1).toMatchObject({ ok: false, code: "versao-engine" });
    if (!r1.ok) expect(r1.message).toContain(`motor v${ENGINE_VERSION + 1}`);
    const format = Uint8Array.from(bytes);
    format[2] = FORMAT_VERSION + 1;
    expect(decodeBrainBytes(format)).toMatchObject({ ok: false, code: "versao-formato" });
  });

  it("um link da versão anterior (formato 1, sem fase) é reconhecido e explicado", () => {
    const old = Uint8Array.from(encodeBrainBytes(builtin));
    old[2] = 1;
    old[3] = 1;
    const r = decodeBrainBytes(old);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("versao-formato");
      expect(r.message).toContain("formato 1");
    }
    const oldJson = JSON.parse(encodeBrainJson(builtin));
    expect(decodeBrainJson(JSON.stringify({ ...oldJson, format: 1, engine: 1 }))).toMatchObject({ ok: false, code: "versao-formato" });
  });

  it("JSON de outro motor mostra mensagem clara", () => {
    const json = JSON.parse(encodeBrainJson(builtin));
    expect(decodeBrainJson(JSON.stringify({ ...json, engine: 99 }))).toMatchObject({ ok: false, code: "versao-engine" });
    expect(decodeBrainJson(JSON.stringify({ ...json, engine: undefined }))).toMatchObject({ ok: false, code: "versao-engine" });
  });

  it("fase embutida que mudou de versão explica qual mudou", () => {
    const json = JSON.parse(encodeBrainJson(builtin));
    json.env.world.version = 7;
    const r = decodeBrainJson(JSON.stringify(json));
    expect(r).toMatchObject({ ok: false, code: "versao-fase" });
    if (!r.ok) expect(r.message).toContain("mudou");
  });
});

describe("entrada não confiável: fase e genoma", () => {
  const custom = sample("custom");
  const builtin = sample("builtin");
  const chaos = sample("chaos");

  it("fase embutida inexistente ou tipo desconhecido", () => {
    for (const level of [0, 11, 3.5, -1, "3", null]) {
      const json = JSON.parse(encodeBrainJson(builtin));
      json.env.world.level = level;
      expect(decodeBrainJson(JSON.stringify(json)).ok).toBe(false);
    }
    const json = JSON.parse(encodeBrainJson(builtin));
    json.env.world = { kind: "outra" };
    expect(decodeBrainJson(JSON.stringify(json))).toMatchObject({ ok: false, code: "formato-invalido" });
    json.env.world = null;
    expect(decodeBrainJson(JSON.stringify(json)).ok).toBe(false);
  });

  it("seed do caos inválida", () => {
    for (const seed of [-1, 1.5, 2 ** 32, "x", null]) {
      const json = JSON.parse(encodeBrainJson(chaos));
      json.env.world.seed = seed;
      expect(decodeBrainJson(JSON.stringify(json)).ok).toBe(false);
    }
  });

  it("fase customizada: valores fora da faixa, NaN, Infinity, excesso de obstáculos e fase impossível", () => {
    const base = () => JSON.parse(encodeBrainJson(custom));
    const cases: Array<(j: ReturnType<typeof base>) => void> = [
      (j) => (j.env.world.speed = 99),
      (j) => (j.env.world.speed = 3.14),
      (j) => (j.env.world.speed = "3"),
      (j) => (j.env.world.finishX = -5),
      (j) => (j.env.world.finishX = 1e12),
      (j) => (j.env.world.obstacles = "x"),
      (j) => (j.env.world.obstacles = []),
      (j) => (j.env.world.obstacles = Array.from({ length: 61 }, (_, i) => [420 + i * 200, 320, 200])),
      (j) => (j.env.world.obstacles[0] = [420, 320]),
      (j) => (j.env.world.obstacles[0] = [420, 320, 200, 5]),
      (j) => (j.env.world.obstacles[0] = [420, NaN, 200]),
      (j) => (j.env.world.obstacles[0] = [420, 320, null]),
      (j) => (j.env.world.obstacles[0] = "x"),
      (j) => (j.env.world.obstacles[0] = [420.5, 320, 200]),
      (j) => (j.env.world.obstacles[0][2] = 30),
      (j) => (j.env.world.obstacles[0][1] = 5),
    ];
    for (const c of cases) {
      const j = base();
      c(j);
      expect(decodeBrainJson(JSON.stringify(j)).ok).toBe(false);
    }
    // NaN/Infinity nem existem em JSON; chegam como null/texto e são recusados.
    expect(decodeBrainJson(encodeBrainJson(custom).replace(/"speed":[\d.]+/, '"speed":1e999')).ok).toBe(false);
  });

  it("fase customizada estruturalmente válida mas IMPOSSÍVEL é recusada com a mensagem do trecho", () => {
    let impossible: Level | null = null;
    for (let seed = 1; !impossible && seed < 200; seed++) impossible = impossibleByConstruction(seed, true);
    const p: BrainPayload = { genome: custom.genome, env: { gravity: DEFAULT_GRAVITY, world: { kind: "custom", level: impossible as Level } } };
    for (const r of [decodeBrainJson(encodeBrainJson(p)), decodeBrainLink(encodeBrainLink(p))]) {
      expect(r).toMatchObject({ ok: false, code: "fase-inviavel" });
      if (!r.ok) expect(r.message).toMatch(/impossível/);
    }
  });

  it("gravidade que torna a fase impossível é recusada em vez de carregada", () => {
    const hard = JSON.parse(encodeBrainJson(builtin));
    hard.env.world = { kind: "builtin", level: 10, version: 1 };
    hard.env.gravity = 2;
    const r = decodeBrainJson(JSON.stringify(hard));
    // Se a gravidade 2 ainda deixa a fase 10 viável, carrega; se não, recusa com mensagem. Nunca lança.
    expect(typeof r.ok).toBe("boolean");
    if (!r.ok) expect(r.code).toBe("fase-inviavel");
  });

  it("rejeita tamanhos absurdos antes de processar", () => {
    expect(decodeBrainLink("A".repeat(MAX_LINK_CHARS + 1))).toMatchObject({ ok: false, code: "muito-grande" });
    expect(decodeBrainJson(" ".repeat(MAX_JSON_CHARS + 1))).toMatchObject({ ok: false, code: "muito-grande" });
  });

  it("rejeita contagens declaradas acima do limite ou que não batem com o tamanho", () => {
    const bytes = encodeBrainBytes(builtin);
    const offset = 8 + 1 + 2; // gravidade termina em 8; tipo(1) + índice + versão (2) → cabeçalho do genoma começa em 11
    const b = Uint8Array.from(bytes);
    const view = new DataView(b.buffer);
    view.setUint16(offset + 2, MAX_CONNECTIONS + 1, true);
    expect(decodeBrainBytes(b)).toMatchObject({ ok: false, code: "valor-invalido" });
    view.setUint16(offset + 2, 3, true);
    view.setUint16(offset, 0, true);
    expect(decodeBrainBytes(b)).toMatchObject({ ok: false, code: "formato-invalido" });
    view.setUint16(offset, 9999, true);
    expect(decodeBrainBytes(b)).toMatchObject({ ok: false, code: "valor-invalido" });
  });

  it("corrompe campos do binário: nunca lança e sempre recusa", () => {
    const bytes = encodeBrainBytes(builtin);
    const cases: Array<[string, (b: Uint8Array, v: DataView) => void]> = [
      ["magic errado", (b) => (b[0] = 0)],
      ["tipo de fase desconhecido", (b) => (b[8] = 9)],
      ["gravidade NaN", (_b, v) => v.setFloat32(4, NaN, true)],
      ["gravidade infinita", (_b, v) => v.setFloat32(4, Infinity, true)],
      ["gravidade fora da faixa", (_b, v) => v.setFloat32(4, 50, true)],
      ["fase embutida 0", (b) => (b[9] = 0)],
      ["fase embutida 200", (b) => (b[9] = 200)],
      ["versão da fase diferente", (b) => (b[10] = 42)],
    ];
    for (const [, corrupt] of cases) {
      const b = Uint8Array.from(bytes);
      corrupt(b, new DataView(b.buffer));
      expect(decodeBrainBytes(b).ok).toBe(false);
    }
  });

  it("corrompe o genoma no binário (peso, nó, marca, innovation)", () => {
    const g = sample("chaos");
    const bytes = encodeBrainBytes(g);
    const start = 9 + 4 + 4; // cabeçalho fixo (9) + seed do caos (4) + contagens (4)
    const hiddenBytes = new DataView(bytes.buffer).getUint16(13, true) * 4;
    const conn0 = start + hiddenBytes;
    const cases: Array<(v: DataView, b: Uint8Array) => void> = [
      (v) => v.setFloat32(conn0 + 12, NaN, true),
      (v) => v.setFloat32(conn0 + 12, -Infinity, true),
      (v) => v.setFloat32(conn0 + 12, 1000, true),
      (v) => v.setUint32(conn0 + 8, 4000, true),
      (v) => v.setUint32(conn0 + 4, 4000, true),
      (_v, b) => (b[conn0 + 16] = 5),
      (v) => v.setUint32(conn0 + 17, 0, true),
    ];
    for (const c of cases) {
      const b = Uint8Array.from(bytes);
      c(new DataView(b.buffer), b);
      expect(decodeBrainBytes(b).ok).toBe(false);
    }
  });

  it("rejeita ciclos e laços vindos de fora", () => {
    const mk = (conns: unknown[], hidden: number[] = [6, 7]) =>
      JSON.stringify({
        format: FORMAT_VERSION,
        engine: ENGINE_VERSION,
        env: { gravity: 0.55, world: { kind: "chaos", seed: 1 } },
        genome: { hidden, conns },
      });
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
    ["sem env", `{"format":${FORMAT_VERSION},"engine":${ENGINE_VERSION}}`],
    ["env não objeto", `{"format":${FORMAT_VERSION},"engine":${ENGINE_VERSION},"env":3,"genome":{}}`],
  ])("JSON inválido: %s", (_n, text) => {
    expect(decodeBrainJson(text).ok).toBe(false);
  });

  it("campos de tipo errado no JSON", () => {
    const base = JSON.parse(encodeBrainJson(chaos));
    const variants: unknown[] = [
      { ...base, env: { ...base.env, gravity: "0.5" } },
      { ...base, env: { ...base.env, gravity: 0 } },
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
});

describe("fuzz: links corrompidos ou aleatórios nunca lançam nem travam", () => {
  const seeds = [sample("builtin"), sample("custom"), sample("chaos")].map((p) => encodeBrainBytes(p));

  it("texto e bytes aleatórios, e links válidos corrompidos (propriedade)", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ maxLength: 300 }),
          fc.stringMatching(/^[A-Za-z0-9_-]{0,400}$/),
          fc.uint8Array({ maxLength: 300 }).map(toBase64Url),
          fc.tuple(fc.constantFrom(...seeds), fc.nat({ max: 400 }), fc.uint8Array({ minLength: 1, maxLength: 8 })).map(([valid, at, junk]) => {
            const b = Uint8Array.from(valid);
            junk.forEach((v, i) => {
              if (at + i < b.length) b[at + i] ^= v;
            });
            return toBase64Url(b);
          }),
          fc.tuple(fc.constantFrom(...seeds), fc.nat({ max: 400 })).map(([valid, cut]) => toBase64Url(valid.slice(0, cut))),
          fc.tuple(fc.constantFrom(...seeds), fc.uint8Array({ maxLength: 60 })).map(([valid, extra]) => toBase64Url(Uint8Array.from([...valid, ...extra]))),
        ),
        (text) => {
          assertSafe(decodeBrainLink(text));
          return true;
        },
      ),
      { numRuns: 1500 },
    );
  });

  it("corpo aleatório atrás de um cabeçalho válido (propriedade)", () => {
    fc.assert(
      fc.property(fc.constantFrom(...seeds), fc.uint8Array({ maxLength: 400 }), (valid, body) => {
        const bytes = Uint8Array.from([...valid.slice(0, 11), ...body]);
        assertSafe(decodeBrainBytes(bytes));
        return true;
      }),
      { numRuns: 1000 },
    );
  });

  it("JSON aleatório e JSON válido corrompido (propriedade)", () => {
    const jsons = [encodeBrainJson(sample("builtin")), encodeBrainJson(sample("custom"))];
    fc.assert(
      fc.property(
        fc.oneof(
          fc.json(),
          fc.string({ maxLength: 200 }),
          fc.tuple(fc.constantFrom(...jsons), fc.nat({ max: 600 }), fc.string({ maxLength: 5 })).map(([j, at, junk]) => j.slice(0, at) + junk + j.slice(at + 1)),
        ),
        (text) => {
          assertSafe(decodeBrainJson(text));
          return true;
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("entradas que não são texto ou são curtas demais", () => {
    expect(decodeBrainLink(undefined as never).ok).toBe(false);
    expect(decodeBrainJson(undefined as never).ok).toBe(false);
    expect(decodeBrainLink("").ok).toBe(false);
    expect(decodeBrainLink("!!!!").ok).toBe(false);
    expect(decodeBrainBytes(new Uint8Array(3)).ok).toBe(false);
    expect(decodeBrainBytes(Uint8Array.from([0x46, 0x53, FORMAT_VERSION, ENGINE_VERSION, 0, 0, 0, 0, 0])).ok).toBe(false);
  });

  it("o pior caso permitido é decodificado em tempo limitado (não trava o Worker)", () => {
    const worst = Array.from({ length: 60 }, (_, i) => [420 + i * 160, i % 2 ? 480 : 160, 100]);
    const text = JSON.stringify({
      format: FORMAT_VERSION,
      engine: ENGINE_VERSION,
      env: { gravity: 0.55, world: { kind: "custom", speed: 2.8, finishX: 420 + 59 * 160 + 64 + 120, obstacles: worst } },
      genome: { hidden: [], conns: [[0, 0, 5, 1, 1]] },
    });
    const t0 = performance.now();
    const r = decodeBrainJson(text);
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(typeof r.ok).toBe("boolean");
  });
});
