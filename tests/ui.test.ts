import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ARENA } from "../lib/game/config";
import { LEVEL_LIMITS, Level, validateLevelData } from "../lib/game/level";
import { BUILTIN_LEVELS } from "../lib/game/levels";
import {
  EMPTY_PROGRESS,
  isCompleted,
  isUnlocked,
  lockedReason,
  markCompleted,
  parseProgress,
  serializeProgress,
  setUnlockAll,
} from "../lib/ui/progress";
import {
  HISTORY_LIMIT,
  addObstacle,
  blankLevel,
  createEditor,
  insertObstacleAt,
  moveObstacle,
  placeObstacle,
  redo,
  removeObstacle,
  replaceLevel,
  finalName,
  select,
  setGapHeight,
  setLength,
  setName,
  setSpeed,
  undo,
  xRange,
} from "../lib/ui/editor";
import { DEFAULT_RUN_LINK, formatRunLink, fragmentKind, fragmentValue, parseRunLink } from "../lib/ui/runLink";
import { DEFAULT_STAGNATION, isStagnated, nextSeed } from "../lib/ui/stagnation";
import { browserStorage, safeGet, safeRemove, safeSet } from "../lib/ui/storage";
import { analyzeLevel, gapSlack } from "../lib/ui/viability";
import type { GenerationStats } from "../lib/sim/run";
import { impossibleByConstruction } from "./levelgen";
import { runs } from "./helpers";

describe("progressão", () => {
  it("a fase 1 sempre está liberada; as outras dependem da anterior", () => {
    expect(isUnlocked(EMPTY_PROGRESS, 1)).toBe(true);
    for (let n = 2; n <= 10; n++) expect(isUnlocked(EMPTY_PROGRESS, n)).toBe(false);
    const p = markCompleted(EMPTY_PROGRESS, 1);
    expect(isUnlocked(p, 2)).toBe(true);
    expect(isUnlocked(p, 3)).toBe(false);
    expect(isCompleted(p, 1)).toBe(true);
    expect(isCompleted(p, 2)).toBe(false);
  });

  it("completar é idempotente, ordenado e recusa números inválidos", () => {
    let p = markCompleted(markCompleted(EMPTY_PROGRESS, 3), 1);
    expect(p.completed).toEqual([1, 3]);
    expect(markCompleted(p, 3)).toBe(p);
    for (const bad of [0, 11, 1.5, NaN, -1]) expect(markCompleted(p, bad)).toBe(p);
    p = markCompleted(p, 2);
    expect(p.completed).toEqual([1, 2, 3]);
  });

  it("desbloquear tudo libera as 10 fases e pode ser desfeito", () => {
    const p = setUnlockAll(EMPTY_PROGRESS, true);
    for (let n = 1; n <= 10; n++) expect(isUnlocked(p, n)).toBe(true);
    expect(setUnlockAll(p, true)).toBe(p);
    expect(isUnlocked(setUnlockAll(p, false), 5)).toBe(false);
    expect(isUnlocked(p, 0)).toBe(false);
    expect(isUnlocked(p, 11)).toBe(false);
  });

  it("serializa e lê de volta; lixo no armazenamento nunca lança (propriedade)", () => {
    const p = setUnlockAll(markCompleted(markCompleted(EMPTY_PROGRESS, 2), 5), true);
    expect(parseProgress(serializeProgress(p))).toEqual(p);
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.json(), fc.constant(null)), (text) => {
        const r = parseProgress(text);
        return r.completed.every((n) => Number.isInteger(n) && n >= 1 && n <= 10) && typeof r.unlockAll === "boolean";
      }),
      { numRuns: runs(200, 1000) },
    );
    expect(parseProgress('{"completed":[3,3,"x",99,2],"unlockAll":"sim"}')).toEqual({ completed: [2, 3], unlockAll: false });
    expect(parseProgress("[1,2]")).toEqual(EMPTY_PROGRESS);
  });

  it("mensagem do cadeado", () => {
    expect(lockedReason(4)).toBe("Complete a fase 3 para liberar.");
  });
});

describe("armazenamento seguro", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  const broken = {
    getItem: () => {
      throw new Error("bloqueado");
    },
    setItem: () => {
      throw new Error("cota cheia");
    },
    removeItem: () => {
      throw new Error("bloqueado");
    },
  };

  it("lê e grava quando há armazenamento", () => {
    const s = memory();
    expect(safeSet(s, "a", "1")).toBe(true);
    expect(safeGet(s, "a")).toBe("1");
    safeRemove(s, "a");
    expect(safeGet(s, "a")).toBeNull();
  });

  it("sem armazenamento ou com armazenamento que lança, nada quebra", () => {
    expect(safeGet(null, "a")).toBeNull();
    expect(safeSet(null, "a", "1")).toBe(false);
    expect(safeGet(broken, "a")).toBeNull();
    expect(safeSet(broken, "a", "1")).toBe(false);
    expect(() => safeRemove(broken, "a")).not.toThrow();
    expect(() => safeRemove(null, "a")).not.toThrow();
  });

  it("fora do navegador (Node) não há armazenamento", () => {
    expect(browserStorage()).toBeNull();
  });
});

describe("estagnação da run", () => {
  const stat = (generation: number, maxFitness: number, speciesCount: number, solved = false): GenerationStats => ({
    generation,
    maxFitness,
    meanFitness: maxFitness / 2,
    speciesCount,
    bestPipes: 1,
    finishers: solved ? 1 : 0,
    solved,
  });
  const flat = (n: number, species: number) => Array.from({ length: n }, (_, i) => stat(i, 18.5, species));

  it("trava com muitas gerações sem melhora e 1 espécie", () => {
    expect(isStagnated(flat(60, 1))).toBe(true);
  });

  it("não trava sem esperar o tempo mínimo, com diversidade, ou se resolveu", () => {
    expect(isStagnated([])).toBe(false);
    expect(isStagnated(flat(20, 1))).toBe(false);
    expect(isStagnated(flat(80, 5))).toBe(false);
    const solved = [...flat(60, 1), stat(60, 300, 1, true)];
    expect(isStagnated(solved)).toBe(false);
  });

  it("uma melhora recente adia o alarme", () => {
    const h = [...flat(60, 1), stat(60, 25, 1)];
    expect(isStagnated(h)).toBe(false);
    expect(isStagnated([...h, ...flat(45, 1).map((s, i) => stat(61 + i, 25, 1))])).toBe(true);
  });

  it("precisa das últimas gerações com 1 espécie", () => {
    const h = [...flat(60, 1).slice(0, 55), ...Array.from({ length: 5 }, (_, i) => stat(55 + i, 18.5, 4))];
    expect(isStagnated(h)).toBe(false);
    expect(DEFAULT_STAGNATION.noImprovementGenerations).toBe(40);
  });

  it("nextSeed devolve uma seed diferente da atual", () => {
    expect(nextSeed(5, () => 0.5)).not.toBe(5);
    expect(nextSeed(0, () => 0)).toBe(1);
    fc.assert(fc.property(fc.integer({ min: 0, max: 0xffffffff }), (s) => nextSeed(s, Math.random) !== s));
  });
});

describe("parâmetros da run na URL", () => {
  it("ida e volta", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.integer({ min: 1, max: 10 }),
        fc.constantFrom("level" as const, "chaos" as const),
        fc.integer({ min: 1, max: 30 }).map((n) => n * 10),
        (seed, level, mode, populationSize) => {
          const p = { ...DEFAULT_RUN_LINK, seed, level, mode, populationSize };
          return JSON.stringify(parseRunLink(formatRunLink(p))) === JSON.stringify(p);
        },
      ),
    );
  });

  it("lixo vira padrão ou é preso na faixa; nunca lança (propriedade)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (text) => {
        const p = parseRunLink(text);
        return p.level >= 1 && p.level <= 10 && p.populationSize >= 10 && p.populationSize <= 300 && p.gravity >= 0.2 && p.gravity <= 2 && Number.isFinite(p.seed);
      }),
      { numRuns: runs(200, 800) },
    );
    expect(parseRunLink("seed=abc&fase=99&pop=-3&g=50&mn=2")).toMatchObject({ seed: 1, level: 10, populationSize: 10, addNodeRate: 1 });
    expect(parseRunLink("")).toEqual(DEFAULT_RUN_LINK);
  });

  it("reconhece o tipo de link", () => {
    expect(fragmentKind("#b=abc")).toBe("brain");
    expect(fragmentKind("#f=abc")).toBe("level");
    expect(fragmentKind("#seed=1&fase=2")).toBe("run");
    expect(fragmentKind("")).toBe("none");
    expect(fragmentValue("#b=xyz", "b")).toBe("xyz");
  });
});

describe("editor de fases: estado e histórico", () => {
  it("nasce válido, com o primeiro cano selecionado", () => {
    const e = createEditor();
    expect(validateLevelData(e.level)).toEqual([]);
    expect(e.selected).toBe(0);
    expect(createEditor(BUILTIN_LEVELS[3]).level.obstacles).toHaveLength(BUILTIN_LEVELS[3].obstacles.length);
  });

  it("mover respeita os vizinhos, a arena e o inteiro", () => {
    let e = createEditor();
    e = moveObstacle(e, 1, 9999, 9999);
    const o = e.level.obstacles[1];
    const range = xRange(e.level, 1);
    expect(o.x).toBe(range.max);
    expect(o.gapY).toBe(Math.floor(ARENA.height - o.gapHeight / 2 - LEVEL_LIMITS.arenaMargin));
    e = moveObstacle(e, 1, -9999, -9999);
    expect(e.level.obstacles[1].x).toBe(xRange(e.level, 1).min);
    e = moveObstacle(e, 2, 3.4, 2.6);
    expect(Number.isInteger(e.level.obstacles[2].x) && Number.isInteger(e.level.obstacles[2].gapY)).toBe(true);
    expect(moveObstacle(e, 99, 1, 1)).toBe(e);
    expect(validateLevelData(e.level)).toEqual([]);
  });

  it("placeObstacle leva o cano a uma posição absoluta", () => {
    const e = placeObstacle(createEditor(), 0, 500, 250);
    expect(e.level.obstacles[0]).toMatchObject({ x: 500, gapY: 250 });
  });

  it("mudar a abertura mantém o vão dentro da arena", () => {
    let e = moveObstacle(createEditor(), 0, 0, 999);
    e = setGapHeight(e, 0, 290);
    expect(validateLevelData(e.level)).toEqual([]);
    e = setGapHeight(e, 0, 5);
    expect(e.level.obstacles[0].gapHeight).toBe(LEVEL_LIMITS.minGap);
    e = setGapHeight(e, 0, 5000);
    expect(e.level.obstacles[0].gapHeight).toBe(LEVEL_LIMITS.maxGap);
    expect(setGapHeight(e, 42, 100)).toBe(e);
  });

  it("adicionar, inserir e remover", () => {
    let e = createEditor();
    const n = e.level.obstacles.length;
    e = addObstacle(e);
    expect(e.level.obstacles).toHaveLength(n + 1);
    expect(e.selected).toBe(n);
    expect(validateLevelData(e.level)).toEqual([]);
    e = insertObstacleAt(e, 420 + 130, 300);
    expect(e.notice).toMatch(/Não cabe/);
    const between = createEditor({ ...BUILTIN_LEVELS[0] });
    const inserted = insertObstacleAt(between, 420 + 320 + 140, 300);
    expect(inserted.level.obstacles.length).toBe(between.level.obstacles.length);
    const gapped = replaceLevel(createEditor(), { ...blankLevel(), obstacles: [{ x: 420, gapY: 320, gapHeight: 200 }, { x: 1300, gapY: 320, gapHeight: 200 }], finishX: 1300 + 64 + 200 });
    const ok = insertObstacleAt(gapped, 860, 300);
    expect(ok.level.obstacles.map((o) => o.x)).toEqual([420, 860, 1300]);
    e = removeObstacle(e, 0);
    expect(e.level.obstacles).toHaveLength(n);
    expect(removeObstacle(e, 99)).toBe(e);
  });

  it("nunca remove o último cano e respeita o limite máximo", () => {
    let e = createEditor({ ...blankLevel(), obstacles: [{ x: 420, gapY: 320, gapHeight: 200 }], finishX: 700 });
    const r = removeObstacle(e, 0);
    expect(r.level.obstacles).toHaveLength(1);
    expect(r.notice).toMatch(/ao menos 1 cano/);
    e = createEditor({ ...BUILTIN_LEVELS[0], obstacles: Array.from({ length: LEVEL_LIMITS.maxObstacles }, (_, i) => ({ x: 420 + i * 160, gapY: 320, gapHeight: 200 })), speed: 3, finishX: 420 + 59 * 160 + 64 + 100 });
    expect(addObstacle(e).notice).toMatch(/Limite de 60/);
    expect(insertObstacleAt(e, 500, 300).notice).toMatch(/Limite de 60/);
  });

  it("comprimento, velocidade e nome", () => {
    let e = createEditor();
    e = setLength(e, 1);
    const last = e.level.obstacles[e.level.obstacles.length - 1];
    expect(e.level.finishX).toBe(last.x + ARENA.pipeWidth + LEVEL_LIMITS.minFinishRoom);
    e = setSpeed(e, 3.14);
    expect(e.level.speed).toBe(3.1);
    e = setSpeed(e, 99);
    expect(e.level.speed).toBe(LEVEL_LIMITS.maxSpeed);
    e = setName(e, "  <b>Minha</b> fase!! ");
    expect(e.level.name).not.toMatch(/[<>!]/);
    e = setName(e, "***");
    expect(e.level.name).toBe(""); // vazio enquanto se digita
    expect(finalName(e.level).name).toBe("Minha fase");
    expect(finalName({ ...e.level, name: "X" }).name).toBe("X");
    expect(setName(e, "x".repeat(99)).level.name.length).toBeLessThanOrEqual(24);
  });

  it("uma fase longa demais é recusada com aviso, sem mudar o estado", () => {
    const e = createEditor(BUILTIN_LEVELS[0]);
    const slow = setSpeed(e, 1);
    expect(slow.level.speed === 1 || slow.notice !== null).toBe(true);
  });

  it("selecionar", () => {
    const e = createEditor();
    expect(select(e, 3).selected).toBe(3);
    expect(select(e, 99).selected).toBeNull();
    expect(select(e, null).selected).toBeNull();
  });

  it("desfazer e refazer", () => {
    let e = createEditor();
    const original = JSON.stringify(e.level);
    e = moveObstacle(e, 0, 40, 40);
    e = setGapHeight(e, 0, 150);
    e = addObstacle(e);
    expect(e.past).toHaveLength(3);
    e = undo(undo(undo(e)));
    expect(JSON.stringify(e.level)).toBe(original);
    expect(undo(e)).toBe(e);
    e = redo(redo(redo(e)));
    expect(e.level.obstacles.length).toBe(7);
    expect(redo(e)).toBe(e);
  });

  it("uma edição nova apaga o 'refazer'; desfazer tudo volta ao início (propriedade)", () => {
    const arbAction = fc.oneof(
      fc.record({ k: fc.constant("move" as const), i: fc.integer({ min: 0, max: 8 }), dx: fc.integer({ min: -400, max: 400 }), dy: fc.integer({ min: -400, max: 400 }) }),
      fc.record({ k: fc.constant("gap" as const), i: fc.integer({ min: 0, max: 8 }), h: fc.integer({ min: 0, max: 400 }) }),
      fc.record({ k: fc.constant("add" as const) }),
      fc.record({ k: fc.constant("remove" as const), i: fc.integer({ min: 0, max: 8 }) }),
      fc.record({ k: fc.constant("insert" as const), x: fc.integer({ min: 0, max: 4000 }), y: fc.integer({ min: 0, max: 700 }) }),
      fc.record({ k: fc.constant("len" as const), x: fc.integer({ min: 0, max: 9000 }) }),
      fc.record({ k: fc.constant("speed" as const), v: fc.double({ min: -5, max: 20, noNaN: true }) }),
    );
    fc.assert(
      fc.property(fc.array(arbAction, { maxLength: 40 }), (actions) => {
        let e = createEditor();
        const original = JSON.stringify(e.level);
        for (const a of actions) {
          switch (a.k) {
            case "move": e = moveObstacle(e, a.i, a.dx, a.dy); break;
            case "gap": e = setGapHeight(e, a.i, a.h); break;
            case "add": e = addObstacle(e); break;
            case "remove": e = removeObstacle(e, a.i); break;
            case "insert": e = insertObstacleAt(e, a.x, a.y); break;
            case "len": e = setLength(e, a.x); break;
            case "speed": e = setSpeed(e, a.v); break;
          }
          if (validateLevelData(e.level).length !== 0) return false;
          if (e.selected !== null && (e.selected < 0 || e.selected >= e.level.obstacles.length)) return false;
        }
        const finalLevel = JSON.stringify(e.level);
        while (e.past.length > 0) e = undo(e);
        if (JSON.stringify(e.level) !== original) return false;
        while (e.future.length > 0) e = redo(e);
        return JSON.stringify(e.level) === finalLevel;
      }),
      { numRuns: runs(80, 400) },
    );
  });

  it("edição contínua (slider, nome) vira uma entrada só no histórico", () => {
    let e = createEditor();
    for (let v = 3.1; v <= 6; v += 0.1) e = setSpeed(e, v);
    expect(e.past).toHaveLength(1);
    e = setName(setName(setName(e, "A"), "Ab"), "Abc");
    expect(e.past).toHaveLength(2);
    e = setGapHeight(setGapHeight(e, 0, 120), 0, 130);
    expect(e.past).toHaveLength(3);
    e = undo(e);
    expect(e.level.obstacles[0].gapHeight).toBe(200);
    e = undo(undo(e));
    expect(e.level.speed).toBe(3);
  });

  it("o histórico tem limite", () => {
    let e = createEditor();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) e = moveObstacle(e, 0, i % 2 === 0 ? 3 : -3, 0);
    expect(e.past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
  });

  it("editar depois de desfazer descarta o futuro", () => {
    let e = moveObstacle(createEditor(), 0, 30, 0);
    e = undo(e);
    expect(e.future).toHaveLength(1);
    e = moveObstacle(e, 0, 10, 0);
    expect(e.future).toHaveLength(0);
  });

  it("replaceLevel recusa fase inválida e aceita válida", () => {
    const e = createEditor();
    const bad = replaceLevel(e, { ...BUILTIN_LEVELS[0], speed: 99 });
    expect(bad.level).toBe(e.level);
    expect(bad.notice).not.toBeNull();
    const good = replaceLevel(e, BUILTIN_LEVELS[1] as Level);
    expect(good.level.name).toBe(BUILTIN_LEVELS[1].name);
  });
});

describe("relatório de viabilidade do editor", () => {
  const single = (speed: number, gapHeight: number): Level => ({
    id: "t",
    version: 1,
    name: "t",
    speed,
    finishX: 420 + 64 + 120,
    obstacles: [{ x: 420, gapY: 320, gapHeight }],
  });

  it("viável", () => {
    expect(analyzeLevel(BUILTIN_LEVELS[4], 0.55)).toMatchObject({ status: "ok" });
  });

  it("apertado: passa raspando mas não com a folga mínima", () => {
    const r = analyzeLevel(single(3, 68), 0.55);
    expect(r.status).toBe("tight");
    expect(r.message).toMatch(/folga mínima de 2/);
  });

  it("impossível: faltou espaço, com o trecho", () => {
    let level: Level | null = null;
    for (let seed = 1; !level && seed < 200; seed++) level = impossibleByConstruction(seed, true);
    expect(level).not.toBeNull();
    const r = analyzeLevel(level as Level, 0.55);
    expect(r.status).toBe("impossible");
    expect(r.message).toMatch(/faltou espaço/);
    expect(r.message).toMatch(/cano/);
  });

  it("estrutura inválida vira 'invalid' com o motivo", () => {
    const r = analyzeLevel({ ...single(3, 100), speed: 99 }, 0.55);
    expect(r).toMatchObject({ status: "invalid" });
  });

  it("folga do vão: cresce com a abertura e diminui com a gravidade", () => {
    expect(gapSlack(116, 0.55)).toBeGreaterThan(gapSlack(100, 0.55));
    expect(gapSlack(116, 0.55)).toBe(33);
    expect(gapSlack(100, 0.55)).toBe(17);
    expect(gapSlack(60, 0.55)).toBeLessThan(0);
    expect(Number.isFinite(gapSlack(100, 0.2))).toBe(true);
  });
});

import { INPUT_LABELS, edgeWidth, layoutBrain } from "../lib/ui/brainLayout";
import { deleteLevel, MAX_SAVED_LEVELS, parseSavedLevels, saveLevel, serializeSavedLevels } from "../lib/ui/savedLevels";
import { ConnGene, Genome, baseNodes, makeLayout } from "../lib/neat/genome";
import { SENSOR_COUNT } from "../lib/game/world";
import { arbGenome } from "./helpers";

describe("desenho da rede", () => {
  const layout = makeLayout(SENSOR_COUNT, 1);
  const c = (innovation: number, from: number, to: number, weight = 1, enabled = true): ConnGene => ({ innovation, from, to, weight, enabled });

  it("entradas à esquerda, saída à direita, ocultos no meio", () => {
    const g: Genome = { nodes: [...baseNodes(layout), { id: 6, kind: "hidden" }], conns: [c(0, 0, 6), c(1, 6, 5), c(2, 4, 5)] };
    const d = layoutBrain(g, layout);
    const byId = new Map(d.nodes.map((n) => [n.id, n]));
    expect(byId.get(0)?.x).toBe(0);
    expect(byId.get(6)?.x).toBeGreaterThan(0);
    expect(byId.get(6)?.x).toBeLessThan(byId.get(5)?.x as number);
    expect(byId.get(5)?.x).toBe(1);
    expect(d.edges).toHaveLength(3);
    expect(d.nodes.find((n) => n.id === 0)?.label).toBe(INPUT_LABELS[0]);
    expect(d.nodes.find((n) => n.id === 4)?.label).toBe("bias");
    expect(d.nodes.find((n) => n.id === 5)?.label).toBe("pula");
    expect(d.nodes.find((n) => n.id === 6)?.label).toBe("oculto 1");
  });

  it("conexões desabilitadas não são desenhadas, só contadas", () => {
    const g: Genome = { nodes: baseNodes(layout), conns: [c(0, 0, 5), c(1, 1, 5, 1, false)] };
    const d = layoutBrain(g, layout);
    expect(d.edges).toHaveLength(1);
    expect(d.disabled).toBe(1);
  });

  it("marca como alterada a conexão nova ou de peso diferente em relação à geração anterior", () => {
    const before: Genome = { nodes: baseNodes(layout), conns: [c(0, 0, 5, 1), c(1, 1, 5, 2)] };
    const after: Genome = { nodes: baseNodes(layout), conns: [c(0, 0, 5, 1), c(1, 1, 5, 3), c(2, 2, 5, 1)] };
    const d = layoutBrain(after, layout, before);
    expect(d.edges.map((e) => e.changed)).toEqual([false, true, true]);
    expect(layoutBrain(after, layout).edges.every((e) => !e.changed)).toBe(true);
  });

  it("espessura cresce com |peso| e fica limitada", () => {
    expect(edgeWidth(0)).toBeCloseTo(0.8);
    expect(edgeWidth(-2)).toBe(edgeWidth(2));
    expect(edgeWidth(100)).toBe(4);
  });

  it("qualquer rede válida tem posições em [0,1] e uma aresta por conexão ativa (propriedade)", () => {
    fc.assert(
      fc.property(arbGenome, (g) => {
        const d = layoutBrain(g, layout);
        const inRange = d.nodes.every((n) => n.x >= 0 && n.x <= 1 && n.y > 0 && n.y < 1);
        return inRange && d.edges.length === g.conns.filter((x) => x.enabled).length && d.edges.every((e) => e.from.x <= e.to.x);
      }),
      { numRuns: runs(60, 300) },
    );
  });
});

describe("fases guardadas", () => {
  it("guarda, substitui pelo nome, apaga e serializa", () => {
    const a = { ...BUILTIN_LEVELS[0], name: "A" };
    let list = saveLevel([], a).list;
    list = saveLevel(list, { ...BUILTIN_LEVELS[1], name: "B" }).list;
    expect(list.map((s) => s.name)).toEqual(["A", "B"]);
    list = saveLevel(list, { ...BUILTIN_LEVELS[2], name: "A" }).list;
    expect(list.map((s) => s.name)).toEqual(["B", "A"]);
    expect(parseSavedLevels(serializeSavedLevels(list))).toHaveLength(2);
    expect(deleteLevel(list, "A").map((s) => s.name)).toEqual(["B"]);
  });

  it("recusa passar do limite e nunca lança com lixo (propriedade)", () => {
    let list: ReturnType<typeof saveLevel>["list"] = [];
    for (let i = 0; i < MAX_SAVED_LEVELS; i++) list = saveLevel(list, { ...BUILTIN_LEVELS[0], name: `F${i}` }).list;
    expect(list).toHaveLength(MAX_SAVED_LEVELS);
    const over = saveLevel(list, { ...BUILTIN_LEVELS[0], name: "extra" });
    expect(over.ok).toBe(false);
    expect(over.list).toHaveLength(MAX_SAVED_LEVELS);
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.json(), fc.constant(null)), (text) => {
        const r = parseSavedLevels(text);
        return Array.isArray(r) && r.every((s) => validateLevelData(s.level).length === 0);
      }),
      { numRuns: runs(150, 600) },
    );
    expect(parseSavedLevels('[{"level":{"id":"x"}},null,3,{"level":' + JSON.stringify(BUILTIN_LEVELS[0]) + "}]")).toHaveLength(1);
  });
});
