import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { toBase64Url, fromBase64Url } from "../lib/neat/base64url";
import { hashString } from "../lib/neat/hash";
import { Rng, deriveSeed, normalizeSeed } from "../lib/neat/rng";
import { arbSeed } from "./helpers";

/** Implementação de referência de mulberry32 (a versão pública mais difundida), escrita à parte. */
function referenceMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Rng (mulberry32)", () => {
  it("bate com a implementação de referência", () => {
    for (const seed of [0, 1, 42, 123456789, 0xffffffff]) {
      const ref = referenceMulberry32(seed);
      const rng = new Rng(seed);
      for (let i = 0; i < 200; i++) expect(rng.next()).toBe(ref());
    }
  });

  it("mesma seed, mesma sequência (propriedade)", () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const a = new Rng(seed);
        const b = new Rng(seed);
        for (let i = 0; i < 50; i++) if (a.next() !== b.next()) return false;
        return true;
      }),
    );
  });

  it("next() fica em [0, 1) e int() em [0, n)", () => {
    fc.assert(
      fc.property(arbSeed, fc.integer({ min: 1, max: 1000 }), (seed, n) => {
        const r = new Rng(seed);
        for (let i = 0; i < 100; i++) {
          const x = r.next();
          if (x < 0 || x >= 1) return false;
          const k = r.int(n);
          if (!Number.isInteger(k) || k < 0 || k >= n) return false;
        }
        return true;
      }),
    );
  });

  it("chance(0) nunca e chance(1) sempre acontecem, e ambos consomem um sorteio", () => {
    const r = new Rng(9);
    const shadow = new Rng(9);
    for (let i = 0; i < 100; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
      shadow.next();
      shadow.next();
    }
    expect(r.state).toBe(shadow.state);
  });

  it("range, pick e state", () => {
    const r = new Rng(3);
    for (let i = 0; i < 100; i++) {
      const x = r.range(-2, 5);
      expect(x).toBeGreaterThanOrEqual(-2);
      expect(x).toBeLessThan(5);
    }
    expect(["a", "b", "c"]).toContain(r.pick(["a", "b", "c"]));
    expect(typeof r.state).toBe("number");
  });

  it("deriveSeed é estável e depende do sal", () => {
    expect(deriveSeed(5, 1)).toBe(deriveSeed(5, 1));
    expect(deriveSeed(5, 1)).not.toBe(deriveSeed(5, 2));
    expect(deriveSeed(5, 1)).not.toBe(deriveSeed(6, 1));
  });

  it("normalizeSeed", () => {
    expect(normalizeSeed(-7.9)).toBe(7);
    expect(normalizeSeed(NaN)).toBe(0);
    expect(normalizeSeed(Infinity)).toBe(0);
    expect(normalizeSeed(2 ** 32 + 5)).toBe(5);
  });
});

describe("hashString", () => {
  it("é determinístico, com 16 dígitos hex, e sensível a mudanças", () => {
    expect(hashString("fosforo")).toBe(hashString("fosforo"));
    expect(hashString("fosforo")).toMatch(/^[0-9a-f]{16}$/);
    expect(hashString("fosforo")).not.toBe(hashString("fosforp"));
    expect(hashString("")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("base64url", () => {
  it("ida e volta para quaisquer bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), (bytes) => {
        const text = toBase64Url(bytes);
        expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
        expect(Array.from(fromBase64Url(text) as Uint8Array)).toEqual(Array.from(bytes));
      }),
    );
  });

  it("rejeita caracteres inválidos e comprimento impossível sem lançar", () => {
    expect(fromBase64Url("abc+")).toBeNull();
    expect(fromBase64Url("ab=")).toBeNull();
    expect(fromBase64Url("a")).toBeNull();
    expect(fromBase64Url("")).toEqual(new Uint8Array(0));
  });
});
