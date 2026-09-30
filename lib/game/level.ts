import { ARENA } from "./config";

/** Um par de canos: o vão fica centrado em gapY, com altura gapHeight. Tudo em inteiros. */
export interface Obstacle {
  /** Posição da borda esquerda, em coordenadas de percurso. */
  x: number;
  gapY: number;
  gapHeight: number;
}

/**
 * Uma fase é um dado: lista finita e sem aleatoriedade de obstáculos, velocidade e linha de chegada.
 * `version` sobe quando os dados de uma fase embutida mudam (links guardam id + versão).
 */
export interface Level {
  id: string;
  version: number;
  name: string;
  /** Unidades por tick; múltiplo de 0,1. */
  speed: number;
  /** Coordenada de percurso em que o pássaro completa a fase. */
  finishX: number;
  obstacles: Obstacle[];
}

/** Limites duros (protegem o Worker contra fases enormes vindas de links ou do editor). */
export const LEVEL_LIMITS = {
  minObstacles: 1,
  maxObstacles: 60,
  minGap: 60,
  maxGap: 300,
  /** Folga mínima entre a borda direita de um cano e a esquerda do seguinte. */
  minClearance: 96,
  /** Margem entre a borda do vão e o teto/chão. */
  arenaMargin: 20,
  minSpeed: 1,
  maxSpeed: 8,
  /** Primeiro cano: longe o bastante para o pássaro se acomodar. */
  minFirstX: ARENA.birdX + 150,
  /** Distância mínima do último cano até a chegada. */
  minFinishRoom: 100,
  /** Fase mais longa aceita, em ticks (60 s). */
  maxTicks: 3600,
  maxNameLength: 24,
  maxIdLength: 40,
} as const;

/** Ticks até o pássaro alcançar a linha de chegada. */
export function levelTicks(level: Pick<Level, "speed" | "finishX">): number {
  return Math.ceil((level.finishX - ARENA.birdX) / level.speed);
}

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);

/** Problemas estruturais da fase (tipos, faixas, ordem). Lista vazia = estrutura válida. Nunca lança. */
export function validateLevelData(level: unknown): string[] {
  const errors: string[] = [];
  if (typeof level !== "object" || level === null) return ["a fase não é um objeto"];
  const l = level as Record<string, unknown>;

  if (typeof l.id !== "string" || l.id.length === 0 || l.id.length > LEVEL_LIMITS.maxIdLength) errors.push("id inválido");
  if (!isInt(l.version) || l.version < 1) errors.push("versão inválida");
  if (typeof l.name !== "string" || l.name.length > LEVEL_LIMITS.maxNameLength) errors.push("nome inválido");

  const speed = l.speed;
  if (
    typeof speed !== "number" ||
    !Number.isFinite(speed) ||
    speed < LEVEL_LIMITS.minSpeed ||
    speed > LEVEL_LIMITS.maxSpeed ||
    Math.round(speed * 10) / 10 !== speed
  ) {
    errors.push("velocidade fora da faixa ou que não é múltipla de 0,1");
  }
  if (!isInt(l.finishX) || l.finishX < 0) errors.push("linha de chegada inválida");

  const obstacles = l.obstacles;
  if (!Array.isArray(obstacles)) {
    errors.push("lista de obstáculos ausente");
    return errors;
  }
  if (obstacles.length < LEVEL_LIMITS.minObstacles || obstacles.length > LEVEL_LIMITS.maxObstacles) {
    errors.push(`a fase precisa ter de ${LEVEL_LIMITS.minObstacles} a ${LEVEL_LIMITS.maxObstacles} obstáculos`);
    return errors;
  }

  let prevRight = -Infinity;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i] as Record<string, unknown> | null;
    const n = i + 1;
    if (typeof o !== "object" || o === null || !isInt(o.x) || !isInt(o.gapY) || !isInt(o.gapHeight)) {
      errors.push(`cano ${n}: valores inválidos (use inteiros)`);
      continue;
    }
    const { x, gapY, gapHeight } = o as unknown as Obstacle;
    if (gapHeight < LEVEL_LIMITS.minGap || gapHeight > LEVEL_LIMITS.maxGap) errors.push(`cano ${n}: abertura fora da faixa`);
    if (gapY - gapHeight / 2 < LEVEL_LIMITS.arenaMargin || gapY + gapHeight / 2 > ARENA.height - LEVEL_LIMITS.arenaMargin) {
      errors.push(`cano ${n}: o vão sai da arena`);
    }
    if (i === 0 && x < LEVEL_LIMITS.minFirstX) errors.push("cano 1: perto demais do início");
    if (i > 0 && x < prevRight + LEVEL_LIMITS.minClearance) errors.push(`cano ${n}: perto demais do cano anterior`);
    prevRight = x + ARENA.pipeWidth;
  }

  if (isInt(l.finishX) && l.finishX < prevRight + LEVEL_LIMITS.minFinishRoom) {
    errors.push("a linha de chegada precisa ficar depois do último cano");
  }
  if (
    errors.length === 0 &&
    typeof speed === "number" &&
    isInt(l.finishX) &&
    levelTicks({ speed, finishX: l.finishX }) > LEVEL_LIMITS.maxTicks
  ) {
    errors.push("a fase é longa demais");
  }
  return errors;
}
