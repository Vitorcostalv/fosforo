/**
 * Gera lib/game/levels/levels.json: as 10 fases embutidas.
 * Cada fase sai de uma especificação (velocidade, vão, distância, variação) e de uma seed fixa;
 * cada obstáculo só entra se o validador de viabilidade confirma que dá para passar.
 * O JSON é o dado versionado; este script existe para regerar/ajustar a curva de dificuldade.
 *
 * Uso: npx tsx scripts/gen-levels.ts
 */
import fs from "node:fs";
import path from "node:path";
import { ARENA, DEFAULT_GRAVITY } from "../lib/game/config";
import { courseOf } from "../lib/game/course";
import { FeasibilityScanner, checkFeasibility } from "../lib/game/feasibility";
import { Level, Obstacle, validateLevelData } from "../lib/game/level";
import { Rng } from "../lib/neat/rng";

interface Spec {
  name: string;
  speed: number;
  gap: number;
  spacing: number;
  maxStep: number;
  count: number;
  seed: number;
}

// Degraus: vão menor, distância menor, variação de altura maior, velocidade maior.
const SPECS: Spec[] = [
  { name: "Largada", speed: 2.6, gap: 220, spacing: 320, maxStep: 20, count: 12, seed: 101 },
  { name: "Reta", speed: 2.8, gap: 200, spacing: 300, maxStep: 40, count: 14, seed: 102 },
  { name: "Ondulação", speed: 3.0, gap: 184, spacing: 285, maxStep: 60, count: 16, seed: 103 },
  { name: "Degrau", speed: 3.1, gap: 160, spacing: 266, maxStep: 92, count: 18, seed: 104 },
  { name: "Vale", speed: 3.2, gap: 152, spacing: 255, maxStep: 110, count: 20, seed: 105 },
  { name: "Serra", speed: 3.3, gap: 140, spacing: 240, maxStep: 140, count: 22, seed: 106 },
  { name: "Zigue", speed: 3.4, gap: 128, spacing: 228, maxStep: 170, count: 24, seed: 107 },
  { name: "Funil", speed: 3.5, gap: 118, spacing: 216, maxStep: 200, count: 26, seed: 108 },
  { name: "Garganta", speed: 3.6, gap: 112, spacing: 208, maxStep: 205, count: 28, seed: 109 },
  { name: "Agulha", speed: 3.7, gap: 106, spacing: 202, maxStep: 225, count: 30, seed: 110 },
];

const EDGE = 40;
const FIRST_X = 420;
const FINISH_ROOM = 140;

function build(spec: Spec, index: number): Level {
  const rng = new Rng(spec.seed);
  const level: Level = {
    id: `f${String(index + 1).padStart(2, "0")}`,
    version: 1,
    name: spec.name,
    speed: spec.speed,
    finishX: 0,
    obstacles: [],
  };
  const course = courseOf(level);
  const scanner = new FeasibilityScanner(course, DEFAULT_GRAVITY);
  const lo = Math.ceil(spec.gap / 2 + EDGE);
  const hi = Math.floor(ARENA.height - spec.gap / 2 - EDGE);
  let y = Math.round(ARENA.height / 2);

  for (let i = 0; i < spec.count; i++) {
    const x = FIRST_X + i * spec.spacing;
    const snapshot = scanner.save();
    let placed = false;
    // Tenta o passo pedido; se inviável, encurta o passo; por fim mantém a altura.
    for (const shrink of [1, 0.8, 0.6, 0.4, 0.2, 0]) {
      const magnitude = (0.4 + 0.6 * rng.next()) * spec.maxStep * shrink;
      let next = Math.round(y + (rng.chance(0.5) ? magnitude : -magnitude));
      if (next < lo || next > hi) next = Math.round(y - (next - y));
      next = Math.min(hi, Math.max(lo, next));
      const obstacle: Obstacle = { x, gapY: next, gapHeight: spec.gap };
      level.obstacles.push(obstacle);
      let alive = true;
      while (alive && !scanner.passed(i)) alive = scanner.step();
      if (alive) {
        y = next;
        placed = true;
        break;
      }
      level.obstacles.pop();
      scanner.restore(snapshot);
    }
    if (!placed) throw new Error(`fase ${index + 1}: nenhum vão viável no cano ${i + 1}`);
  }
  level.finishX = level.obstacles[level.obstacles.length - 1].x + ARENA.pipeWidth + FINISH_ROOM;
  return level;
}

/** Cada obstáculo numa linha só: o arquivo de dados fica legível e o diff pequeno. */
function compact(json: string): string {
  return json.replace(/\{\s+"x": (\d+),\s+"gapY": (\d+),\s+"gapHeight": (\d+)\s+\}/g, '{ "x": $1, "gapY": $2, "gapHeight": $3 }');
}

const levels = SPECS.map(build);
for (const level of levels) {
  const errors = validateLevelData(level);
  const feasibility = checkFeasibility(courseOf(level), DEFAULT_GRAVITY);
  if (errors.length > 0 || !feasibility.ok) {
    throw new Error(`${level.id}: ${errors.join("; ")} ${JSON.stringify(feasibility)}`);
  }
  const ys = level.obstacles.map((o) => o.gapY);
  const steps = ys.slice(1).map((v, i) => Math.abs(v - ys[i]));
  const mean = Math.round(steps.reduce((a, b) => a + b, 0) / steps.length);
  console.log(
    `${level.id} ${level.name.padEnd(10)} v=${level.speed} vão=${level.obstacles[0].gapHeight} canos=${level.obstacles.length} passo médio=${mean} máx=${Math.max(...steps)}`,
  );
}
fs.writeFileSync(
  path.join(import.meta.dirname, "..", "lib", "game", "levels", "levels.json"),
  compact(JSON.stringify(levels, null, 1)) + "\n",
);
console.log("ok: levels.json gravado");
