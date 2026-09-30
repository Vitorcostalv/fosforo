import { RunParams, createRun, runDigest, runGeneration } from "./run";

/**
 * Cenários fixos cujo resumo (hash) fica versionado em tests/golden.json.
 * O mesmo cálculo roda no Node (Vitest) e em Chromium, Firefox e WebKit (Playwright).
 * Se qualquer motor divergir, o hash muda.
 */
export interface GoldenScenario {
  name: string;
  params: Partial<RunParams>;
  generations: number;
}

export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  { name: "normal", params: { seed: 20260930, mode: "normal", populationSize: 60, maxTicks: 1800 }, generations: 25 },
  {
    name: "caos",
    params: { seed: 7, mode: "chaos", populationSize: 60, maxTicks: 1800, gravity: 0.6 },
    generations: 25,
  },
];

export function computeGolden(scenarios: GoldenScenario[] = GOLDEN_SCENARIOS): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of scenarios) {
    const run = createRun(s.params);
    for (let g = 0; g < s.generations; g++) runGeneration(run);
    out[s.name] = runDigest(run);
  }
  return out;
}
