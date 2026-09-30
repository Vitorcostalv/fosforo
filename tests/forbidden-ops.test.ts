import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O motor e a física só podem usar aritmética exata (+ − × ÷), Math.abs/min/max/floor/ceil/fround/sqrt/imul.
 * Funções transcendentes e `**` não têm resultado idêntico garantido entre navegadores.
 */
const FORBIDDEN = /Math\.(pow|exp|expm1|log|log2|log10|log1p|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|cbrt|hypot|random)\b|\*\*|Date\.now|performance\.now|new Date/;

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sources(p) : e.name.endsWith(".ts") ? [p] : [];
  });
}

describe("operações proibidas no motor", () => {
  const root = path.join(__dirname, "..", "lib");
  const files = sources(root);

  it("encontra os arquivos do motor", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  for (const file of files) {
    it(`${path.relative(root, file)} não usa funções não determinísticas`, () => {
      const code = fs
        .readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      const hit = code.match(FORBIDDEN);
      expect(hit?.[0]).toBeUndefined();
    });
  }

  it("o motor (neat, game, sim) não importa React, Next nem o DOM", () => {
    for (const file of files.filter((f) => !f.includes(`${path.sep}ui${path.sep}`))) {
      const code = fs.readFileSync(file, "utf8");
      expect(code).not.toMatch(/from\s+["'](react|next|react-dom)/);
      expect(code).not.toMatch(/\b(document|window|localStorage)\./);
    }
  });
});
