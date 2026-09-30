import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CHAOS, applyLastResort, makeChaosCourse, validateCourse } from "../lib/game/chaos";
import { ARENA, DEFAULT_GRAVITY, GRAVITY_MAX, GRAVITY_MIN, windAmplitude } from "../lib/game/config";
import { courseOf } from "../lib/game/course";
import { FeasibilityScanner, checkFeasibility, describeFailure } from "../lib/game/feasibility";
import { LEVEL_LIMITS, Level, Obstacle, validateLevelData } from "../lib/game/level";
import { BUILTIN_LEVELS } from "../lib/game/levels";
import { arbSeed } from "./helpers";
import { feasibleByConstruction, impossibleByConstruction, replay } from "./levelgen";

describe("validador de viabilidade: fases embutidas", () => {
  it.each(BUILTIN_LEVELS.map((l, i) => [i + 1, l] as const))("a fase %i é viável, exata, e o gabarito completa a fase no jogo real", (_n, level) => {
    const result = checkFeasibility(courseOf(level), DEFAULT_GRAVITY, { witness: true });
    expect(result.ok).toBe(true);
    expect(result.exact).toBe(true);
    expect(result.blockedObstacle).toBeNull();
    const w = replay(courseOf(level), DEFAULT_GRAVITY, result.witness as boolean[]);
    expect(w.over).toBe(true);
    expect(w.birds[0].finished).toBe(true);
    expect(w.birds[0].pipes).toBe(level.obstacles.length);
  });

  it("o resultado é o mesmo em duas execuções e com/sem gabarito", () => {
    const level = BUILTIN_LEVELS[4];
    const a = checkFeasibility(courseOf(level), DEFAULT_GRAVITY);
    const b = checkFeasibility(courseOf(level), DEFAULT_GRAVITY, { witness: true });
    expect({ ...b, witness: undefined }).toEqual({ ...a, witness: undefined });
  });
});

describe("validador de viabilidade: propriedades", () => {
  it("fases viáveis por construção nunca são rejeitadas, e o gabarito completa a fase", () => {
    let tested = 0;
    fc.assert(
      fc.property(arbSeed, fc.double({ min: 0.4, max: 1, noNaN: true }), fc.integer({ min: 2, max: 7 }), (seed, gravityRaw, count) => {
        const gravity = Math.fround(gravityRaw);
        const level = feasibleByConstruction(seed, gravity, count);
        fc.pre(level !== null);
        tested++;
        const result = checkFeasibility(courseOf(level as Level), gravity, { witness: true });
        if (!result.ok) return false;
        const w = replay(courseOf(level as Level), gravity, result.witness as boolean[]);
        return w.birds[0].finished;
      }),
      { numRuns: 60, skipEqualValues: false },
    );
    expect(tested).toBeGreaterThan(10);
  });

  it("fases impossíveis por construção são sempre rejeitadas (subida e descida, qualquer gravidade)", () => {
    let tested = 0;
    fc.assert(
      fc.property(arbSeed, fc.boolean(), fc.double({ min: 0.1, max: 2, noNaN: true }), (seed, up, gravity) => {
        const level = impossibleByConstruction(seed, up);
        fc.pre(level !== null);
        tested++;
        const result = checkFeasibility(courseOf(level as Level), Math.fround(gravity));
        return !result.ok && result.blockedObstacle !== null && result.blockedObstacle <= 1;
      }),
      { numRuns: 120 },
    );
    expect(tested).toBeGreaterThan(20);
  });

  it("primeiro cano inalcançável a partir do início é rejeitado", () => {
    const level: Level = {
      id: "i",
      version: 1,
      name: "i",
      speed: 8,
      finishX: 260 + ARENA.pipeWidth + 120,
      obstacles: [{ x: LEVEL_LIMITS.minFirstX, gapY: 140, gapHeight: 60 }],
    };
    expect(validateLevelData(level)).toEqual([]);
    const result = checkFeasibility(courseOf(level), 0.55);
    expect(result.ok).toBe(false);
    expect(result.blockedObstacle).toBe(0);
    expect(describeFailure(result)).toBe("impossível: não dá para chegar ao cano 1");
  });

  it("cano estreito demais para a amplitude do pulo é rejeitado; alargar resolve", () => {
    const mk = (gapHeight: number): Level => ({
      id: "e",
      version: 1,
      name: "e",
      speed: 3,
      finishX: 420 + ARENA.pipeWidth + 120,
      obstacles: [{ x: 420, gapY: 320, gapHeight }],
    });
    expect(checkFeasibility(courseOf(mk(60)), 0.55).ok).toBe(false);
    expect(checkFeasibility(courseOf(mk(120)), 0.55).ok).toBe(true);
  });

  it("gravidade muito alta pode tornar viável em 0,55 uma fase impossível; o validador acompanha", () => {
    const level = BUILTIN_LEVELS[9];
    expect(checkFeasibility(courseOf(level), 0.55).ok).toBe(true);
    const heavy = checkFeasibility(courseOf(level), 2);
    // Não afirmo o resultado exato: afirmo que o validador responde de forma coerente (ok ↔ sem bloqueio).
    expect(heavy.ok).toBe(heavy.blockedObstacle === null);
  });

  it("descreve o trecho impossível em português, entre o cano N e o N+1", () => {
    const level: Level = {
      id: "i",
      version: 1,
      name: "i",
      speed: 8,
      finishX: 420 + 2 * (ARENA.pipeWidth + 96) + ARENA.pipeWidth + 120,
      obstacles: [
        { x: 420, gapY: 560, gapHeight: 100 },
        { x: 420 + ARENA.pipeWidth + 96, gapY: 70, gapHeight: 100 },
      ],
    };
    const result = checkFeasibility(courseOf(level), 0.55);
    expect(result.ok).toBe(false);
    expect(describeFailure(result)).toBe("impossível entre o cano 1 e o cano 2");
    expect(describeFailure({ ok: true, blockedObstacle: null, failTick: null, exact: true, peakStates: 1 })).toBe("viável");
  });

  it("a busca incremental (com snapshot/restore) dá o mesmo resultado da busca direta", () => {
    const level = BUILTIN_LEVELS[6];
    const direct = checkFeasibility(courseOf(level), DEFAULT_GRAVITY);
    const scanner = new FeasibilityScanner(courseOf(level), DEFAULT_GRAVITY);
    let saved = scanner.save();
    let alive = true;
    for (let i = 0; i < level.obstacles.length && alive; i++) {
      saved = scanner.save();
      while (alive && !scanner.passed(i)) alive = scanner.step();
      scanner.restore(saved);
      while (alive && !scanner.passed(i)) alive = scanner.step();
    }
    while (alive && !scanner.finished) alive = scanner.step();
    expect(alive).toBe(direct.ok);
  });

  it("limita o trabalho: a fase mais longa e mais apertada permitida é decidida em poucos segundos", () => {
    const obstacles: Obstacle[] = [];
    for (let i = 0; i < LEVEL_LIMITS.maxObstacles; i++) {
      obstacles.push({ x: 420 + i * (ARENA.pipeWidth + 96), gapY: i % 2 ? 480 : 160, gapHeight: 100 });
    }
    const last = obstacles[obstacles.length - 1];
    const level: Level = { id: "w", version: 1, name: "w", speed: 2.8, finishX: last.x + ARENA.pipeWidth + 120, obstacles };
    expect(validateLevelData(level)).toEqual([]);
    const t0 = performance.now();
    const result = checkFeasibility(courseOf(level), 0.55);
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(typeof result.ok).toBe("boolean");
  });
});

describe("caos: nunca gera percurso impossível", () => {
  it("todo percurso passa no validador oficial, o gabarito completa o percurso no jogo real e a estrutura é válida (propriedade)", () => {
    fc.assert(
      fc.property(arbSeed, fc.double({ min: 0.2, max: 2, noNaN: true }), (seed, gravityRaw) => {
        const gravity = Math.fround(gravityRaw);
        const course = makeChaosCourse(seed, gravity);
        if (validateLevelData(course.level).length !== 0) return false;
        const result = validateCourse(course, gravity, { witness: true });
        if (!result.ok) return false;
        const w = replay(course, gravity, result.witness as boolean[]);
        return w.birds[0].finished && w.birds[0].pipes === course.level.obstacles.length;
      }),
      { numRuns: 25 },
    );
  });

  it("nunca é impossível em toda a faixa de gravidade permitida, inclusive as extremas", () => {
    for (const gravity of [GRAVITY_MIN, 0.25, 0.3, 0.4, 0.55, 0.9, 1.5, GRAVITY_MAX].map(Math.fround)) {
      for (let seed = 1; seed <= 5; seed++) {
        const course = makeChaosCourse(seed, gravity);
        expect(validateLevelData(course.level), `g=${gravity} seed=${seed}`).toEqual([]);
        expect(validateCourse(course, gravity).ok, `g=${gravity} seed=${seed}`).toBe(true);
      }
    }
  });

  it("o último recurso (um cano largo no meio) é viável em toda a faixa de gravidade, com vento", () => {
    for (const gravity of [GRAVITY_MIN, 0.3, DEFAULT_GRAVITY, 1, GRAVITY_MAX].map(Math.fround)) {
      const base = makeChaosCourse(9, gravity);
      const level = { ...base.level, obstacles: [...base.level.obstacles] };
      applyLastResort(level);
      expect(level.obstacles).toHaveLength(1);
      expect(validateLevelData(level)).toEqual([]);
      expect(validateCourse({ level, wind: base.wind }, gravity).ok, `g=${gravity}`).toBe(true);
    }
  });

  it("o vento nunca vence a gravidade", () => {
    for (const g of [0.2, 0.3, 0.55, 2].map(Math.fround)) {
      const course = makeChaosCourse(3, g);
      expect(Math.max(...course.wind.map(Math.abs))).toBeLessThanOrEqual(g / 2 + 1e-6);
    }
    expect(windAmplitude(0.2)).toBe(Math.fround(0.1));
    expect(windAmplitude(2)).toBe(Math.fround(0.18));
  });

  it("é determinístico, varia com a seed e usa vento", () => {
    const a = makeChaosCourse(5, DEFAULT_GRAVITY);
    const b = makeChaosCourse(5, DEFAULT_GRAVITY);
    const c = makeChaosCourse(6, DEFAULT_GRAVITY);
    expect(a).toEqual(b);
    expect(a.level.obstacles).not.toEqual(c.level.obstacles);
    expect(a.wind.some((w) => Math.abs(w) > 0.02)).toBe(true);
    expect(a.level.obstacles.length).toBe(CHAOS.defaultObstacles);
  });

  it("respeita a contagem pedida e os limites", () => {
    expect(makeChaosCourse(1, DEFAULT_GRAVITY, 5).level.obstacles.length).toBeLessThanOrEqual(5);
    expect(makeChaosCourse(1, DEFAULT_GRAVITY, 0).level.obstacles.length).toBeGreaterThanOrEqual(1);
    expect(makeChaosCourse(1, DEFAULT_GRAVITY, 999).level.obstacles.length).toBeLessThanOrEqual(CHAOS.maxObstacles);
  });

  it("alturas de verdade aleatórias em toda a arena (variedade)", () => {
    const ys = makeChaosCourse(11, DEFAULT_GRAVITY).level.obstacles.map((o) => o.gapY);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(150);
  });
});
