import { DEFAULT_GRAVITY, GRAVITY_MAX, GRAVITY_MIN } from "../game/config";
import { describeFailure } from "../game/feasibility";
import { LEVEL_LIMITS, Level, validateLevelData } from "../game/level";
import { fromBase64Url, toBase64Url } from "../neat/base64url";
import { feasibilityOfLevel } from "./feasibilityCache";

/** Formato da fase exportada (JSON ou link). Sobe quando a estrutura muda. */
export const LEVEL_FORMAT_VERSION = 1;
export const MAX_LEVEL_LINK_CHARS = 2048;
export const MAX_LEVEL_JSON_CHARS = 16384;

export type LevelDecodeErrorCode = "muito-grande" | "formato-invalido" | "versao-formato" | "fase-invalida" | "fase-inviavel";

export type LevelDecodeResult =
  | { ok: true; level: Level }
  | { ok: false; code: LevelDecodeErrorCode; message: string };

const fail = (code: LevelDecodeErrorCode, message: string): LevelDecodeResult => ({ ok: false, code, message });

/**
 * Porta única de entrada para qualquer fase que não veio dos dados embutidos: estrutura
 * (tipos, faixas, tamanho, número de obstáculos) e, por último, o validador de viabilidade.
 */
export function vetLevel(level: unknown, gravity: number = DEFAULT_GRAVITY): LevelDecodeResult {
  const problems = validateLevelData(level);
  if (problems.length > 0) return fail("fase-invalida", `Fase inválida: ${problems[0]}.`);
  if (!Number.isFinite(gravity) || gravity < GRAVITY_MIN || gravity > GRAVITY_MAX) {
    return fail("fase-invalida", "Gravidade fora da faixa permitida.");
  }
  const safe = level as Level;
  const feasibility = feasibilityOfLevel(safe, gravity);
  if (!feasibility.ok) return fail("fase-inviavel", `Esta fase é ${describeFailure(feasibility)}.`);
  return { ok: true, level: safe };
}

// ---------- Binário compacto (usado no link do cérebro e no link da fase) ----------

const LEVEL_HEADER_BYTES = 1 + 2 + 1;
const OBSTACLE_BYTES = 6;

export function levelByteLength(level: Level): number {
  return LEVEL_HEADER_BYTES + level.obstacles.length * OBSTACLE_BYTES;
}

/** Escreve velocidade (décimos, u8), chegada (u16), contagem (u8) e cada obstáculo (u16 ×3). */
export function writeLevel(view: DataView, offset: number, level: Level): number {
  let o = offset;
  view.setUint8(o, Math.round(level.speed * 10));
  view.setUint16(o + 1, level.finishX, true);
  view.setUint8(o + 3, level.obstacles.length);
  o += LEVEL_HEADER_BYTES;
  for (const ob of level.obstacles) {
    view.setUint16(o, ob.x, true);
    view.setUint16(o + 2, ob.gapY, true);
    view.setUint16(o + 4, ob.gapHeight, true);
    o += OBSTACLE_BYTES;
  }
  return o;
}

/** Lê uma fase e devolve também o próximo offset. Não valida viabilidade: use `vetLevel` depois. */
export function readLevel(view: DataView, offset: number): { level: Level; next: number } | null {
  if (offset + LEVEL_HEADER_BYTES > view.byteLength) return null;
  const speedTenths = view.getUint8(offset);
  const finishX = view.getUint16(offset + 1, true);
  const count = view.getUint8(offset + 3);
  if (count > LEVEL_LIMITS.maxObstacles) return null;
  const end = offset + LEVEL_HEADER_BYTES + count * OBSTACLE_BYTES;
  if (end > view.byteLength) return null;
  const obstacles = [];
  let o = offset + LEVEL_HEADER_BYTES;
  for (let i = 0; i < count; i++, o += OBSTACLE_BYTES) {
    obstacles.push({ x: view.getUint16(o, true), gapY: view.getUint16(o + 2, true), gapHeight: view.getUint16(o + 4, true) });
  }
  return {
    level: { id: "link", version: 1, name: "Fase do link", speed: speedTenths / 10, finishX, obstacles },
    next: end,
  };
}

const LEVEL_MAGIC = [0x46, 0x4c]; // "FL"

export function encodeLevelLink(level: Level): string {
  const buffer = new ArrayBuffer(3 + levelByteLength(level));
  const view = new DataView(buffer);
  view.setUint8(0, LEVEL_MAGIC[0]);
  view.setUint8(1, LEVEL_MAGIC[1]);
  view.setUint8(2, LEVEL_FORMAT_VERSION);
  writeLevel(view, 3, level);
  return toBase64Url(new Uint8Array(buffer));
}

/** Nunca lança. A fase decodificada já passou pelo validador de viabilidade. */
export function decodeLevelLink(text: string, gravity: number = DEFAULT_GRAVITY): LevelDecodeResult {
  if (typeof text !== "string") return fail("formato-invalido", "Link ausente.");
  if (text.length > MAX_LEVEL_LINK_CHARS) return fail("muito-grande", "Link grande demais para ser uma fase.");
  const bytes = fromBase64Url(text);
  if (!bytes || bytes.length < 3 + LEVEL_HEADER_BYTES) return fail("formato-invalido", "O link não é uma fase do Fósforo.");
  if (bytes[0] !== LEVEL_MAGIC[0] || bytes[1] !== LEVEL_MAGIC[1]) return fail("formato-invalido", "Isto não parece um link de fase do Fósforo.");
  if (bytes[2] !== LEVEL_FORMAT_VERSION) {
    return fail("versao-formato", `Esta fase usa o formato ${bytes[2]}; esta versão entende o formato ${LEVEL_FORMAT_VERSION}.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read = readLevel(view, 3);
  if (!read || read.next !== bytes.length) return fail("formato-invalido", "O tamanho do link não bate com o conteúdo.");
  return vetLevel(read.level, gravity);
}

// ---------- JSON ----------

export function encodeLevelJson(level: Level): string {
  const obstacles = level.obstacles.map((o) => `[${o.x},${o.gapY},${o.gapHeight}]`).join(",");
  return (
    `{"kind":"fosforo-level","format":${LEVEL_FORMAT_VERSION},"name":${JSON.stringify(level.name)},` +
    `"speed":${level.speed},"finishX":${level.finishX},"obstacles":[${obstacles}]}`
  );
}

/** Nunca lança. */
export function decodeLevelJson(text: string, gravity: number = DEFAULT_GRAVITY): LevelDecodeResult {
  if (typeof text !== "string") return fail("formato-invalido", "Entrada não é texto.");
  if (text.length > MAX_LEVEL_JSON_CHARS) return fail("muito-grande", "Arquivo grande demais para ser uma fase.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("formato-invalido", "O texto não é um JSON válido.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return fail("formato-invalido", "O JSON não tem a estrutura de uma fase.");
  }
  const p = parsed as Record<string, unknown>;
  if (p.kind !== "fosforo-level") return fail("formato-invalido", "Este JSON não é uma fase do Fósforo.");
  if (p.format !== LEVEL_FORMAT_VERSION) {
    return fail("versao-formato", `Esta fase usa o formato ${String(p.format)}; esta versão entende o formato ${LEVEL_FORMAT_VERSION}.`);
  }
  if (!Array.isArray(p.obstacles) || p.obstacles.length > LEVEL_LIMITS.maxObstacles) {
    return fail("fase-invalida", "Lista de obstáculos inválida.");
  }
  const obstacles = [];
  for (const o of p.obstacles) {
    if (!Array.isArray(o) || o.length !== 3) return fail("formato-invalido", "Obstáculo malformado.");
    obstacles.push({ x: o[0], gapY: o[1], gapHeight: o[2] });
  }
  const name = typeof p.name === "string" ? p.name.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, LEVEL_LIMITS.maxNameLength) : "Minha fase";
  return vetLevel({ id: "importada", version: 1, name: name || "Minha fase", speed: p.speed, finishX: p.finishX, obstacles }, gravity);
}
