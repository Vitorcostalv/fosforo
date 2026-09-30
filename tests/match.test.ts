import { describe, expect, it } from "vitest";
import { courseOf } from "../lib/game/course";
import { BUILTIN_LEVELS } from "../lib/game/levels";
import { Genome, baseNodes } from "../lib/neat/genome";
import { resolveCourse } from "../lib/sim/env";
import { Match } from "../lib/sim/match";
import { createRun, runGeneration } from "../lib/sim/run";
import { LAYOUT } from "./helpers";

const noBrain: Genome = { nodes: baseNodes(LAYOUT), conns: [] };
const course = courseOf(BUILTIN_LEVELS[2]);
const G = Math.fround(0.55);

describe("humano vs cérebro", () => {
  it("cérebro sem conexões nunca pula e cai; humano parado também", () => {
    const m = new Match(noBrain, course, G);
    let guard = 0;
    while (!m.done && guard++ < 2000) m.step(false);
    expect(m.done).toBe(true);
    expect(m.score()).toEqual({ human: 0, ai: 0 });
    expect(m.finished()).toEqual({ human: false, ai: false });
  });

  it("o cérebro treinado completa a mesma fase e supera o humano parado", () => {
    const run = createRun({ seed: 3, populationSize: 60, level: BUILTIN_LEVELS[2] });
    for (let g = 0; g < 40 && !run.history.some((h) => h.solved); g++) runGeneration(run);
    const solvedGen = run.history.findIndex((h) => h.solved);
    expect(solvedGen).toBeGreaterThanOrEqual(0);
    // Refaz a geração vencedora e pega o campeão daquela geração.
    const m = new Match(run.best as Genome, course, G);
    let guard = 0;
    while (!m.done && guard++ < 5000) m.step(false);
    expect(m.fitness().ai).toBeGreaterThan(m.fitness().human);
    expect(m.finished().ai).toBe(true);
  });

  it("mesma partida, mesmas entradas ⇒ mesmo resultado; humano e IA usam o mesmo mundo", () => {
    const play = () => {
      const m = new Match(noBrain, course, G);
      for (let i = 0; i < 200 && !m.done; i++) m.step(i % 20 === 0);
      return JSON.stringify(m.world.birds);
    };
    expect(play()).toBe(play());
    const m = new Match(noBrain, course, G);
    m.step(true);
    expect(m.world.birds).toHaveLength(2);
    expect(m.world.course).toBe(course);
  });

  it("resolveCourse monta o percurso de fase embutida, customizada e caos", () => {
    expect(resolveCourse({ gravity: G, world: { kind: "builtin", index: 2, version: 1 } })?.level.id).toBe("f02");
    expect(resolveCourse({ gravity: G, world: { kind: "builtin", index: 99, version: 1 } })).toBeNull();
    expect(resolveCourse({ gravity: G, world: { kind: "custom", level: BUILTIN_LEVELS[0] } })?.level).toBe(BUILTIN_LEVELS[0]);
    const chaos = resolveCourse({ gravity: G, world: { kind: "chaos", seed: 4 } });
    expect(chaos?.wind.length).toBeGreaterThan(0);
  });
});
