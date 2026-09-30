import { courseOf } from "../game/course";
import { DEFAULT_GRAVITY } from "../game/config";
import { checkFeasibility } from "../game/feasibility";
import { BUILTIN_LEVELS } from "../game/levels";
import { hashString } from "../neat/hash";
import { RunParams, createRun, runDigest, runGeneration } from "./run";

/**
 * Cenários fixos cujo resumo (hash) fica versionado em tests/golden.json: um por fase embutida
 * e um para o caos. O mesmo cálculo roda no Node (Vitest) e em Chromium, Firefox e WebKit
 * (Playwright). Se qualquer motor divergir, o hash muda.
 */
export interface GoldenScenario {
  name: string;
  params: Partial<RunParams>;
  generations: number;
}

export const GOLDEN_GENERATIONS = 15;

export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  ...BUILTIN_LEVELS.map((level, i) => ({
    name: `fase-${String(i + 1).padStart(2, "0")}`,
    params: { seed: 20260930 + i, mode: "level" as const, level, populationSize: 50 },
    generations: GOLDEN_GENERATIONS,
  })),
  { name: "caos", params: { seed: 7, mode: "chaos" as const, populationSize: 50, gravity: 0.6 }, generations: GOLDEN_GENERATIONS },
];

/**
 * Digest do validador de viabilidade: para cada fase embutida, resultado, exatidão e número de
 * estados no pico. Se os navegadores decidissem diferente, o hash mudaria.
 */
export function validatorDigest(): string {
  return hashString(
    BUILTIN_LEVELS.map((level) => {
      const r = checkFeasibility(courseOf(level), DEFAULT_GRAVITY);
      return `${level.id}:${r.ok ? 1 : 0}:${r.exact ? 1 : 0}:${r.peakStates}:${r.failTick}:${r.blockedObstacle}`;
    }).join("|"),
  );
}

export const GOLDEN_KEYS = [...GOLDEN_SCENARIOS.map((s) => s.name), "validador"];

export function computeGolden(scenarios: GoldenScenario[] = GOLDEN_SCENARIOS): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of scenarios) {
    const run = createRun(s.params);
    for (let g = 0; g < s.generations; g++) runGeneration(run);
    out[s.name] = runDigest(run);
  }
  if (scenarios === GOLDEN_SCENARIOS) out.validador = validatorDigest();
  return out;
}
