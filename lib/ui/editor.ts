import { ARENA } from "../game/config";
import { LEVEL_LIMITS, Level, Obstacle, validateLevelData } from "../game/level";

/**
 * Estado do editor de fases: função pura, com desfazer/refazer. Toda edição mantém a fase
 * estruturalmente válida (o editor prende os valores nos limites); se uma edição não couber,
 * o estado não muda e `notice` explica por quê. Quem decide se a fase é jogável é o validador.
 */
export interface EditorState {
  level: Level;
  selected: number | null;
  past: Level[];
  future: Level[];
  /** Aviso curto da última ação recusada (ou null). */
  notice: string | null;
  /** Chave da última edição contínua (slider, campo de texto): edições seguidas com a mesma chave viram uma só no histórico. */
  lastKey: string | null;
}

export const HISTORY_LIMIT = 100;
export const DEFAULT_SPACING = 260;
export const NUDGE_STEP = 4;
export const NUDGE_STEP_FAST = 20;

const clone = (l: Level): Level => ({ ...l, obstacles: l.obstacles.map((o) => ({ ...o })) });
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function blankLevel(name = "Minha fase"): Level {
  const obstacles: Obstacle[] = Array.from({ length: 6 }, (_, i) => ({ x: 420 + i * DEFAULT_SPACING, gapY: 320, gapHeight: 200 }));
  const last = obstacles[obstacles.length - 1];
  return { id: "editor", version: 1, name, speed: 3, finishX: last.x + ARENA.pipeWidth + 160, obstacles };
}

export function createEditor(level: Level = blankLevel()): EditorState {
  return { level: clone(level), selected: level.obstacles.length > 0 ? 0 : null, past: [], future: [], notice: null, lastKey: null };
}

function commit(state: EditorState, next: Level, selected: number | null = state.selected, key: string | null = null): EditorState {
  const problems = validateLevelData(next);
  if (problems.length > 0) return { ...state, notice: problems[0] };
  if (JSON.stringify(next) === JSON.stringify(state.level)) return { ...state, selected, notice: null };
  // Edição contínua (arrastar um slider, digitar): funde com a anterior em vez de encher o histórico.
  if (key !== null && state.lastKey === key && state.past.length > 0) {
    return { level: next, selected, past: state.past, future: [], notice: null, lastKey: key };
  }
  const past = [...state.past, state.level].slice(-HISTORY_LIMIT);
  return { level: next, selected, past, future: [], notice: null, lastKey: key };
}

export function select(state: EditorState, index: number | null): EditorState {
  const valid = index !== null && index >= 0 && index < state.level.obstacles.length ? index : null;
  return { ...state, selected: valid, notice: null };
}

/** Limites de x do cano `i`, respeitando o cano anterior, o seguinte e o início. */
export function xRange(level: Level, i: number): { min: number; max: number } {
  const prev = level.obstacles[i - 1];
  const next = level.obstacles[i + 1];
  const min = prev ? prev.x + ARENA.pipeWidth + LEVEL_LIMITS.minClearance : LEVEL_LIMITS.minFirstX;
  const max = next
    ? next.x - ARENA.pipeWidth - LEVEL_LIMITS.minClearance
    : level.finishX - ARENA.pipeWidth - LEVEL_LIMITS.minFinishRoom;
  return { min, max };
}

export function gapYRange(gapHeight: number): { min: number; max: number } {
  return {
    min: Math.ceil(gapHeight / 2 + LEVEL_LIMITS.arenaMargin),
    max: Math.floor(ARENA.height - gapHeight / 2 - LEVEL_LIMITS.arenaMargin),
  };
}

export function moveObstacle(state: EditorState, i: number, dx: number, dy: number): EditorState {
  const o = state.level.obstacles[i];
  if (!o) return state;
  const xr = xRange(state.level, i);
  const yr = gapYRange(o.gapHeight);
  const next = clone(state.level);
  next.obstacles[i] = {
    ...o,
    x: clamp(Math.round(o.x + dx), xr.min, Math.max(xr.min, xr.max)),
    gapY: clamp(Math.round(o.gapY + dy), yr.min, yr.max),
  };
  return commit(state, next, i);
}

/** Leva o cano para uma posição absoluta (arrastar). */
export function placeObstacle(state: EditorState, i: number, x: number, gapY: number): EditorState {
  const o = state.level.obstacles[i];
  if (!o) return state;
  return moveObstacle(state, i, x - o.x, gapY - o.gapY);
}

export function setGapHeight(state: EditorState, i: number, height: number): EditorState {
  const o = state.level.obstacles[i];
  if (!o) return state;
  const gapHeight = clamp(Math.round(height), LEVEL_LIMITS.minGap, LEVEL_LIMITS.maxGap);
  const yr = gapYRange(gapHeight);
  const next = clone(state.level);
  next.obstacles[i] = { ...o, gapHeight, gapY: clamp(o.gapY, yr.min, yr.max) };
  return commit(state, next, i, `gap:${i}`);
}

export function addObstacle(state: EditorState): EditorState {
  const { level } = state;
  if (level.obstacles.length >= LEVEL_LIMITS.maxObstacles) {
    return { ...state, notice: `Limite de ${LEVEL_LIMITS.maxObstacles} canos.` };
  }
  const last = level.obstacles[level.obstacles.length - 1];
  const x = last ? last.x + DEFAULT_SPACING : LEVEL_LIMITS.minFirstX;
  const next = clone(level);
  next.obstacles.push({ x, gapY: last?.gapY ?? 320, gapHeight: last?.gapHeight ?? 200 });
  next.finishX = Math.max(next.finishX, x + ARENA.pipeWidth + LEVEL_LIMITS.minFinishRoom + 60);
  const committed = commit(state, next, next.obstacles.length - 1);
  return committed.level === next ? committed : { ...committed, notice: "A fase ficaria longa demais. Encurte ou acelere." };
}

/** Insere um cano em `x` (clique na régua), entre os vizinhos, se couber. */
export function insertObstacleAt(state: EditorState, x: number, gapY: number): EditorState {
  const { level } = state;
  if (level.obstacles.length >= LEVEL_LIMITS.maxObstacles) return { ...state, notice: `Limite de ${LEVEL_LIMITS.maxObstacles} canos.` };
  const at = Math.round(x);
  let index = level.obstacles.findIndex((o) => o.x > at);
  if (index < 0) index = level.obstacles.length;
  const next = clone(level);
  const gapHeight = level.obstacles[Math.max(0, index - 1)]?.gapHeight ?? 200;
  const yr = gapYRange(gapHeight);
  next.obstacles.splice(index, 0, { x: at, gapY: clamp(Math.round(gapY), yr.min, yr.max), gapHeight });
  const committed = commit(state, next, index);
  return committed.level === next ? committed : { ...committed, notice: "Não cabe um cano aí: falta distância dos vizinhos." };
}

export function removeObstacle(state: EditorState, i: number): EditorState {
  if (state.level.obstacles.length <= LEVEL_LIMITS.minObstacles) return { ...state, notice: "A fase precisa de ao menos 1 cano." };
  if (!state.level.obstacles[i]) return state;
  const next = clone(state.level);
  next.obstacles.splice(i, 1);
  const last = next.obstacles[next.obstacles.length - 1];
  next.finishX = Math.max(last.x + ARENA.pipeWidth + LEVEL_LIMITS.minFinishRoom, Math.min(next.finishX, state.level.finishX));
  return commit(state, next, Math.min(i, next.obstacles.length - 1));
}

export function setLength(state: EditorState, finishX: number): EditorState {
  const last = state.level.obstacles[state.level.obstacles.length - 1];
  const min = last.x + ARENA.pipeWidth + LEVEL_LIMITS.minFinishRoom;
  const next = { ...clone(state.level), finishX: Math.max(min, Math.round(finishX)) };
  return commit(state, next, state.selected, "length");
}

export function setSpeed(state: EditorState, speed: number): EditorState {
  const v = clamp(Math.round(speed * 10) / 10, LEVEL_LIMITS.minSpeed, LEVEL_LIMITS.maxSpeed);
  return commit(state, { ...clone(state.level), speed: v }, state.selected, "speed");
}

/** Aceita nome vazio enquanto se digita; `finalName` dá o nome de reserva na hora de guardar ou treinar. */
export function setName(state: EditorState, name: string): EditorState {
  const clean = name.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, LEVEL_LIMITS.maxNameLength);
  return commit(state, { ...clone(state.level), name: clean }, state.selected, "name");
}

export function finalName(level: Level): Level {
  return level.name.trim().length > 0 ? level : { ...level, name: "Minha fase" };
}

export function undo(state: EditorState): EditorState {
  const previous = state.past[state.past.length - 1];
  if (!previous) return state;
  const selected = state.selected !== null ? Math.min(state.selected, previous.obstacles.length - 1) : null;
  return { level: previous, selected, past: state.past.slice(0, -1), future: [state.level, ...state.future], notice: null, lastKey: null };
}

export function redo(state: EditorState): EditorState {
  const [next, ...rest] = state.future;
  if (!next) return state;
  const selected = state.selected !== null ? Math.min(state.selected, next.obstacles.length - 1) : null;
  return { level: next, selected, past: [...state.past, state.level], future: rest, notice: null, lastKey: null };
}

/** Troca a fase inteira (importar, carregar do armazenamento): entra no histórico como uma edição. */
export function replaceLevel(state: EditorState, level: Level): EditorState {
  return commit(state, clone(level), level.obstacles.length > 0 ? 0 : null);
}
