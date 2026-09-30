import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_GRAVITY } from "../lib/game/config";
import { Level } from "../lib/game/level";
import { BUILTIN_LEVELS } from "../lib/game/levels";
import { toBase64Url } from "../lib/neat/base64url";
import {
  LEVEL_FORMAT_VERSION,
  MAX_LEVEL_JSON_CHARS,
  MAX_LEVEL_LINK_CHARS,
  decodeLevelJson,
  decodeLevelLink,
  encodeLevelJson,
  encodeLevelLink,
  vetLevel,
} from "../lib/sim/levelCodec";
import { LEVEL_SAMPLE, arbSeed, runs } from "./helpers";
import { feasibleByConstruction, impossibleByConstruction } from "./levelgen";

const same = (a: Level, b: Level) => JSON.stringify([a.speed, a.finishX, a.obstacles]) === JSON.stringify([b.speed, b.finishX, b.obstacles]);

describe("fase: exportar e importar", () => {
  it.each(LEVEL_SAMPLE.map((i) => [i + 1, BUILTIN_LEVELS[i]] as const))("a fase embutida %i sobrevive a JSON e a link", (_n, level) => {
    const j = decodeLevelJson(encodeLevelJson(level));
    const l = decodeLevelLink(encodeLevelLink(level));
    expect(j.ok && same(j.level, level)).toBe(true);
    expect(l.ok && same(l.level, level)).toBe(true);
    if (j.ok) expect(j.level.name).toBe(level.name);
  });

  it("fases viáveis por construção fazem ida e volta exata (propriedade)", () => {
    fc.assert(
      fc.property(arbSeed, fc.integer({ min: 2, max: 6 }), (seed, count) => {
        const level = feasibleByConstruction(seed, DEFAULT_GRAVITY, count);
        fc.pre(level !== null);
        const j = decodeLevelJson(encodeLevelJson(level as Level));
        const l = decodeLevelLink(encodeLevelLink(level as Level));
        return j.ok && l.ok && same(j.level, level as Level) && same(l.level, level as Level);
      }),
      { numRuns: runs(8, 40) },
    );
  });

  it("o link de uma fase de 30 canos cabe folgado no limite", () => {
    expect(encodeLevelLink(BUILTIN_LEVELS[9]).length).toBeLessThan(MAX_LEVEL_LINK_CHARS);
  });
});

describe("fase: entrada não confiável", () => {
  const level = BUILTIN_LEVELS[2];
  const json = () => JSON.parse(encodeLevelJson(level));

  it("recusa fase impossível com a mensagem do trecho", () => {
    let impossible: Level | null = null;
    for (let seed = 1; !impossible && seed < 200; seed++) impossible = impossibleByConstruction(seed, false);
    for (const r of [decodeLevelJson(encodeLevelJson(impossible as Level)), decodeLevelLink(encodeLevelLink(impossible as Level))]) {
      expect(r).toMatchObject({ ok: false, code: "fase-inviavel" });
      if (!r.ok) expect(r.message).toMatch(/impossível/);
    }
  });

  it("vetLevel recusa estrutura inválida, gravidade fora da faixa e fase inviável nessa gravidade", () => {
    expect(vetLevel({ nada: 1 })).toMatchObject({ ok: false, code: "fase-invalida" });
    expect(vetLevel(level, 99)).toMatchObject({ ok: false, code: "fase-invalida" });
    expect(vetLevel(level, NaN)).toMatchObject({ ok: false, code: "fase-invalida" });
    expect(vetLevel(level, DEFAULT_GRAVITY).ok).toBe(true);
  });

  it("versão de formato diferente mostra mensagem clara", () => {
    const j = json();
    j.format = 9;
    expect(decodeLevelJson(JSON.stringify(j))).toMatchObject({ ok: false, code: "versao-formato" });
    const bytes = Uint8Array.from(atobUrl(encodeLevelLink(level)));
    bytes[2] = LEVEL_FORMAT_VERSION + 1;
    const r = decodeLevelLink(toBase64Url(bytes));
    expect(r).toMatchObject({ ok: false, code: "versao-formato" });
  });

  it("recusa JSON e links malformados, grandes, de outro tipo ou truncados", () => {
    expect(decodeLevelJson(" ".repeat(MAX_LEVEL_JSON_CHARS + 1))).toMatchObject({ ok: false, code: "muito-grande" });
    expect(decodeLevelLink("A".repeat(MAX_LEVEL_LINK_CHARS + 1))).toMatchObject({ ok: false, code: "muito-grande" });
    for (const t of ["{", "null", "[]", "3", '{"kind":"outra"}', '{"kind":"fosforo-level","format":1,"obstacles":3}']) {
      expect(decodeLevelJson(t).ok).toBe(false);
    }
    expect(decodeLevelJson(undefined as never).ok).toBe(false);
    expect(decodeLevelLink(undefined as never).ok).toBe(false);
    expect(decodeLevelLink("").ok).toBe(false);
    expect(decodeLevelLink("!!!!").ok).toBe(false);
    expect(decodeLevelLink(toBase64Url(Uint8Array.from([0, 0, 1, 30, 0, 0, 0])))).toMatchObject({ ok: false });
    const bytes = atobUrl(encodeLevelLink(level));
    expect(decodeLevelLink(toBase64Url(bytes.slice(0, bytes.length - 3))).ok).toBe(false);
    expect(decodeLevelLink(toBase64Url(Uint8Array.from([...bytes, 1, 2]))).ok).toBe(false);
    const counted = Uint8Array.from(bytes);
    counted[6] = 250; // contagem de obstáculos acima do limite
    expect(decodeLevelLink(toBase64Url(counted)).ok).toBe(false);
  });

  it("recusa valores inválidos dentro do JSON (tipos, faixas, NaN/Infinity, excesso)", () => {
    const cases: Array<(j: ReturnType<typeof json>) => void> = [
      (j) => (j.speed = 99),
      (j) => (j.speed = "3"),
      (j) => (j.finishX = 1e12),
      (j) => (j.obstacles = "x"),
      (j) => (j.obstacles = Array.from({ length: 61 }, (_, i) => [420 + i * 200, 320, 200])),
      (j) => (j.obstacles[0] = [1, 2]),
      (j) => (j.obstacles[0] = [420, null, 200]),
      (j) => (j.obstacles[0] = [420, 320, 20]),
    ];
    for (const c of cases) {
      const j = json();
      c(j);
      expect(decodeLevelJson(JSON.stringify(j)).ok).toBe(false);
    }
    expect(decodeLevelJson(encodeLevelJson(level).replace(/"speed":[\d.]+/, '"speed":1e999')).ok).toBe(false);
  });

  it("higieniza o nome importado", () => {
    const j = json();
    j.name = "<script>alert(1)</script>".repeat(4);
    const r = decodeLevelJson(JSON.stringify(j));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.level.name).not.toMatch(/[<>()]/);
      expect(r.level.name.length).toBeLessThanOrEqual(24);
    }
    j.name = 123;
    const r2 = decodeLevelJson(JSON.stringify(j));
    expect(r2.ok && r2.level.name).toBe("Minha fase");
    j.name = "<<>>";
    const r3 = decodeLevelJson(JSON.stringify(j));
    expect(r3.ok && r3.level.name).toBe("Minha fase");
  });

  it("fuzz: links e JSON de fase aleatórios ou corrompidos nunca lançam (propriedade)", () => {
    const validLink = atobUrl(encodeLevelLink(level));
    const validJson = encodeLevelJson(level);
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ maxLength: 200 }),
          fc.uint8Array({ maxLength: 200 }).map(toBase64Url),
          fc.tuple(fc.nat({ max: validLink.length }), fc.uint8Array({ minLength: 1, maxLength: 6 })).map(([at, junk]) => {
            const b = Uint8Array.from(validLink);
            junk.forEach((v, i) => {
              if (at + i < b.length) b[at + i] ^= v;
            });
            return toBase64Url(b);
          }),
        ),
        fc.tuple(fc.nat({ max: validJson.length }), fc.string({ maxLength: 4 })),
        (linkText, [at, junk]) => {
          const a = decodeLevelLink(linkText);
          const b = decodeLevelJson(validJson.slice(0, at) + junk + validJson.slice(at + 1));
          return typeof a.ok === "boolean" && typeof b.ok === "boolean";
        },
      ),
      { numRuns: runs(25, 500) },
    );
  });
});

function atobUrl(text: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of text) {
    buffer = (buffer << 6) | alphabet.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 255);
      buffer &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(out);
}
