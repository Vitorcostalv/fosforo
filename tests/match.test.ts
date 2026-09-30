import { describe, expect, it } from "vitest";
import { createRun, runGeneration } from "../lib/sim/run";
import { Match } from "../lib/sim/match";
import { Genome, baseNodes } from "../lib/neat/genome";
import { LAYOUT } from "./helpers";

const noBrain: Genome = { nodes: baseNodes(LAYOUT), conns: [] };
const env = { gravity: Math.fround(0.55), mode: "normal" as const, courseSeed: 3 };

describe("humano vs cérebro", () => {
  it("cérebro sem conexões nunca pula e cai; humano parado também", () => {
    const m = new Match(noBrain, env, 600);
    let guard = 0;
    while (!m.done && guard++ < 700) m.step(false);
    expect(m.done).toBe(true);
    expect(m.score()).toEqual({ human: 0, ai: 0 });
  });

  it("o cérebro treinado joga sozinho e supera o humano parado", () => {
    const run = createRun({ seed: 3, populationSize: 60, maxTicks: 1800 });
    for (let g = 0; g < 30; g++) runGeneration(run);
    const best = run.best as Genome;
    const m = new Match(best, { gravity: run.params.gravity, mode: "normal", courseSeed: 3 }, 1800);
    let guard = 0;
    while (!m.done && guard++ < 2000) m.step(false);
    expect(m.fitness().ai).toBeGreaterThan(m.fitness().human);
  }, 30000);

  it("mesma partida, mesmas entradas ⇒ mesmo placar", () => {
    const play = () => {
      const m = new Match(noBrain, env, 300);
      for (let i = 0; i < 200 && !m.done; i++) m.step(i % 20 === 0);
      return JSON.stringify(m.world.birds);
    };
    expect(play()).toBe(play());
  });
});
