/**
 * Tabela de dificuldade: quantas gerações o NEAT precisa para completar cada fase embutida.
 * 10 seeds fixas por fase, população 100, gravidade padrão, orçamento de gerações informado.
 *
 * Uso: npx tsx scripts/difficulty.ts [orçamento=200] [fases=1-10] [seeds=10]
 * Saída: tabela no terminal e docs/difficulty.json + docs/difficulty.md.
 */
import fs from "node:fs";
import path from "node:path";
import { BUILTIN_LEVELS } from "../lib/game/levels";
import { createRun, runGeneration } from "../lib/sim/run";

const budget = Number(process.argv[2] ?? 200);
const [from, to] = (process.argv[3] ?? "1-10").split("-").map(Number);
const seedCount = Number(process.argv[4] ?? 10);
const SEEDS = Array.from({ length: seedCount }, (_, i) => 1000 + i * 37);

interface Row {
  level: number;
  name: string;
  results: Array<number | null>;
  solved: number;
  median: number | null;
  worst: number | null;
  seconds: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const rows: Row[] = [];
for (let n = from; n <= to; n++) {
  const level = BUILTIN_LEVELS[n - 1];
  const t0 = Date.now();
  const results: Array<number | null> = [];
  for (const seed of SEEDS) {
    const run = createRun({ seed, mode: "level", level, populationSize: 100 });
    let solvedAt: number | null = null;
    for (let g = 0; g < budget; g++) {
      if (runGeneration(run).solved) {
        solvedAt = g + 1;
        break;
      }
    }
    results.push(solvedAt);
  }
  const done = results.filter((r): r is number => r !== null);
  const row: Row = {
    level: n,
    name: level.name,
    results,
    solved: done.length,
    median: done.length > 0 ? median(done) : null,
    worst: done.length > 0 ? Math.max(...done) : null,
    seconds: Math.round((Date.now() - t0) / 1000),
  };
  rows.push(row);
  console.log(
    `${String(n).padStart(2)} ${level.name.padEnd(10)} resolvidas ${row.solved}/${results.length}  mediana ${row.median ?? "-"}  pior ${row.worst ?? "-"}  [${results.map((r) => r ?? "X").join(" ")}]  ${row.seconds}s`,
  );
}

const lines = [
  `Gerações até completar a fase (população 100, gravidade ${0.55}, ${SEEDS.length} seeds fixas, orçamento ${budget} gerações).`,
  "",
  "| Fase | Nome | Resolvidas | Mediana | Pior caso | Seeds que não resolveram |",
  "|---:|---|---:|---:|---:|---|",
  ...rows.map((r) => {
    const failed = r.results.map((g, i) => (g === null ? SEEDS[i] : null)).filter((x): x is number => x !== null);
    return `| ${r.level} | ${r.name} | ${r.solved}/${SEEDS.length} | ${r.median ?? "-"} | ${r.worst ?? "-"} | ${failed.length ? failed.join(", ") : "nenhuma"} |`;
  }),
  "",
  "Mediana e pior caso consideram só as seeds que resolveram dentro do orçamento.",
  "",
  `Seeds: ${SEEDS.join(", ")}`,
];
const dir = path.join(import.meta.dirname, "..", "docs");
const notesFile = path.join(dir, "difficulty-notes.md");
if (fs.existsSync(notesFile)) lines.push("", fs.readFileSync(notesFile, "utf8").trim());
if (from === 1 && to === 10) {
  fs.writeFileSync(path.join(dir, "difficulty.json"), JSON.stringify({ budget, seeds: SEEDS, rows }, null, 1) + "\n");
  fs.writeFileSync(path.join(dir, "difficulty.md"), lines.join("\n") + "\n");
}
console.log("\n" + lines.join("\n"));
