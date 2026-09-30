import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ARENA } from "../lib/game/config";
import { LEVEL_LIMITS, Level, levelTicks, validateLevelData } from "../lib/game/level";
import { BUILTIN_LEVELS, LEVEL_COUNT, builtinIndex, getBuiltinLevel } from "../lib/game/levels";

const clone = (l: Level): Level => JSON.parse(JSON.stringify(l)) as Level;
const base = (): Level => clone(BUILTIN_LEVELS[0]);

describe("as 10 fases embutidas (dados)", () => {
  it("são 10, com ids, nomes curtos e versões", () => {
    expect(BUILTIN_LEVELS).toHaveLength(LEVEL_COUNT);
    BUILTIN_LEVELS.forEach((l, i) => {
      expect(l.id).toBe(`f${String(i + 1).padStart(2, "0")}`);
      expect(l.version).toBeGreaterThanOrEqual(1);
      expect(l.name.length).toBeGreaterThan(0);
      expect(l.name.length).toBeLessThanOrEqual(12);
      expect(validateLevelData(l)).toEqual([]);
    });
    expect(new Set(BUILTIN_LEVELS.map((l) => l.name)).size).toBe(10);
  });

  it("a dificuldade cresce em degraus: vão nunca aumenta, distância nunca aumenta, velocidade nunca diminui", () => {
    const metric = (l: Level) => ({
      gap: l.obstacles[0].gapHeight,
      spacing: l.obstacles[1].x - l.obstacles[0].x,
      speed: l.speed,
      count: l.obstacles.length,
      meanStep: mean(l.obstacles.slice(1).map((o, i) => Math.abs(o.gapY - l.obstacles[i].gapY))),
    });
    const m = BUILTIN_LEVELS.map(metric);
    for (let i = 1; i < m.length; i++) {
      expect(m[i].gap).toBeLessThanOrEqual(m[i - 1].gap);
      expect(m[i].spacing).toBeLessThanOrEqual(m[i - 1].spacing);
      expect(m[i].speed).toBeGreaterThanOrEqual(m[i - 1].speed);
      expect(m[i].count).toBeGreaterThanOrEqual(m[i - 1].count);
      expect(m[i].meanStep).toBeGreaterThan(m[i - 1].meanStep);
      // sem saltos bruscos entre degraus vizinhos
      expect(m[i - 1].gap - m[i].gap).toBeLessThanOrEqual(24);
      expect(m[i - 1].spacing - m[i].spacing).toBeLessThanOrEqual(24);
      expect(m[i].speed - m[i - 1].speed).toBeLessThanOrEqual(0.25);
    }
  });

  it("todas têm alturas variadas dentro da arena e o vão constante dentro de cada fase", () => {
    for (const l of BUILTIN_LEVELS) {
      expect(new Set(l.obstacles.map((o) => o.gapHeight)).size).toBe(1);
      expect(new Set(l.obstacles.map((o) => o.gapY)).size).toBeGreaterThan(l.obstacles.length / 2);
    }
  });

  it("getBuiltinLevel e builtinIndex", () => {
    expect(getBuiltinLevel(1)?.id).toBe("f01");
    expect(getBuiltinLevel(10)?.id).toBe("f10");
    expect(getBuiltinLevel(0)).toBeUndefined();
    expect(getBuiltinLevel(11)).toBeUndefined();
    expect(getBuiltinLevel(1.5)).toBeUndefined();
    expect(builtinIndex("f03")).toBe(3);
    expect(builtinIndex("caos")).toBe(0);
  });

  it("levelTicks conta os ticks até a chegada", () => {
    const l = base();
    expect(levelTicks(l)).toBe(Math.ceil((l.finishX - ARENA.birdX) / l.speed));
  });
});

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

describe("validateLevelData (estrutura)", () => {
  const cases: Array<[string, (l: Level) => void]> = [
    ["id vazio", (l) => (l.id = "")],
    ["versão 0", (l) => (l.version = 0)],
    ["nome comprido", (l) => (l.name = "x".repeat(LEVEL_LIMITS.maxNameLength + 1))],
    ["velocidade 0", (l) => (l.speed = 0)],
    ["velocidade alta", (l) => (l.speed = 9)],
    ["velocidade fora do passo de 0,1", (l) => (l.speed = 3.14)],
    ["velocidade NaN", (l) => (l.speed = NaN)],
    ["chegada não inteira", (l) => (l.finishX = 1234.5)],
    ["chegada antes do último cano", (l) => (l.finishX = l.obstacles[l.obstacles.length - 1].x)],
    ["sem obstáculos", (l) => (l.obstacles = [])],
    ["obstáculos demais", (l) => (l.obstacles = Array.from({ length: 61 }, (_, i) => ({ x: 420 + i * 200, gapY: 320, gapHeight: 200 })))],
    ["abertura pequena", (l) => (l.obstacles[2].gapHeight = 59)],
    ["abertura grande", (l) => (l.obstacles[2].gapHeight = 301)],
    ["vão sai por cima", (l) => (l.obstacles[2].gapY = 50)],
    ["vão sai por baixo", (l) => (l.obstacles[2].gapY = 640)],
    ["primeiro cano perto do início", (l) => (l.obstacles[0].x = 200)],
    ["canos colados", (l) => (l.obstacles[3].x = l.obstacles[2].x + 70)],
    ["canos fora de ordem", (l) => (l.obstacles[3].x = l.obstacles[1].x)],
    ["x fracionário", (l) => (l.obstacles[1].x = 700.5)],
    ["gapY NaN", (l) => (l.obstacles[1].gapY = NaN)],
    ["gapY infinito", (l) => (l.obstacles[1].gapY = Infinity)],
    ["obstáculo nulo", (l) => ((l.obstacles as unknown[])[1] = null)],
    ["fase longa demais", (l) => ((l.speed = 1), (l.obstacles = [{ x: 420, gapY: 320, gapHeight: 200 }]), (l.finishX = 9000))],
  ];
  it.each(cases)("recusa: %s", (_n, mutate) => {
    const l = base();
    mutate(l);
    expect(validateLevelData(l).length).toBeGreaterThan(0);
  });

  it("aceita os limites exatos", () => {
    const l: Level = {
      id: "ok",
      version: 1,
      name: "n".repeat(LEVEL_LIMITS.maxNameLength),
      speed: 1,
      finishX: 420 + ARENA.pipeWidth + LEVEL_LIMITS.minFinishRoom,
      obstacles: [{ x: LEVEL_LIMITS.minFirstX, gapY: 320, gapHeight: LEVEL_LIMITS.minGap }],
    };
    l.finishX = l.obstacles[0].x + ARENA.pipeWidth + LEVEL_LIMITS.minFinishRoom;
    expect(validateLevelData(l)).toEqual([]);
  });

  it("nunca lança, qualquer que seja a entrada (propriedade)", () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        expect(Array.isArray(validateLevelData(x))).toBe(true);
        return validateLevelData(x).length > 0 || typeof x === "object";
      }),
      { numRuns: 500 },
    );
    expect(validateLevelData(null)).toEqual(["a fase não é um objeto"]);
    expect(validateLevelData({ id: "x", obstacles: "y" }).length).toBeGreaterThan(0);
  });
});
