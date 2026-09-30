import { GRAVITY_MAX, GRAVITY_MIN } from "../game/config";
import { describeFailure } from "../game/feasibility";
import { Level, validateLevelData } from "../game/level";
import { getBuiltinLevel, LEVEL_COUNT } from "../game/levels";
import { SENSOR_COUNT } from "../game/world";
import { fromBase64Url, toBase64Url } from "../neat/base64url";
import { DEFAULT_NEAT_CONFIG } from "../neat/config";
import { ConnGene, Genome, NodeGene, baseNodes, makeLayout, sortGenome, validateGenome } from "../neat/genome";
import { BrainEnv, WorldRef } from "./env";
import { feasibilityOfLevel } from "./feasibilityCache";
import { levelByteLength, readLevel, writeLevel } from "./levelCodec";

/** Versão do formato do arquivo/link. Muda quando a estrutura dos bytes muda. (v1: sem fase; v2: com fase.) */
export const FORMAT_VERSION = 2;
/** Versão do motor. Muda quando o comportamento muda (ativação, entradas, física, fitness): o mesmo genoma jogaria diferente. */
export const ENGINE_VERSION = 2;

export const MAX_LINK_CHARS = 8192;
export const MAX_JSON_CHARS = 65536;
export const MAX_HIDDEN_NODES = 128;
export const MAX_CONNECTIONS = 512;

const LAYOUT = makeLayout(SENSOR_COUNT, 1);
const WEIGHT_LIMIT = DEFAULT_NEAT_CONFIG.weightLimit;
const MAGIC = [0x46, 0x53]; // "FS"

export type { BrainEnv, WorldRef } from "./env";

export interface BrainPayload {
  genome: Genome;
  env: BrainEnv;
}

export type DecodeErrorCode =
  | "muito-grande"
  | "formato-invalido"
  | "versao-formato"
  | "versao-engine"
  | "versao-fase"
  | "valor-invalido"
  | "estrutura-invalida"
  | "fase-invalida"
  | "fase-inviavel";

export type DecodeResult =
  | { ok: true; value: BrainPayload }
  | { ok: false; code: DecodeErrorCode; message: string };

function fail(code: DecodeErrorCode, message: string): DecodeResult {
  return { ok: false, code, message };
}

const isUint32 = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 0xffffffff;

/** Dados crus (do JSON ou dos bytes), ainda não confiáveis. */
interface RawBrain {
  format: unknown;
  engine: unknown;
  gravity: unknown;
  world: unknown;
  hidden: unknown;
  conns: unknown;
}

function buildWorld(raw: unknown): { world: WorldRef } | { error: DecodeResult } {
  if (typeof raw !== "object" || raw === null) return { error: fail("formato-invalido", "Fase ausente ou malformada.") };
  const w = raw as Record<string, unknown>;
  if (w.kind === "chaos") {
    if (!isUint32(w.seed)) return { error: fail("valor-invalido", "Seed do caos inválida.") };
    return { world: { kind: "chaos", seed: w.seed } };
  }
  if (w.kind === "builtin") {
    const index = w.level;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 1 || index > LEVEL_COUNT) {
      return { error: fail("valor-invalido", "Fase embutida inexistente.") };
    }
    const level = getBuiltinLevel(index) as Level;
    if (w.version !== level.version) {
      return {
        error: fail(
          "versao-fase",
          `A fase ${index} (${level.name}) mudou desde que este cérebro foi treinado (v${String(w.version)}; agora v${level.version}). Ele não foi carregado.`,
        ),
      };
    }
    return { world: { kind: "builtin", index, version: level.version } };
  }
  if (w.kind === "custom") {
    const level = {
      id: "link",
      version: 1,
      name: "Fase do link",
      speed: w.speed,
      finishX: w.finishX,
      obstacles: Array.isArray(w.obstacles)
        ? w.obstacles.map((o: unknown) => (Array.isArray(o) && o.length === 3 ? { x: o[0], gapY: o[1], gapHeight: o[2] } : null))
        : null,
    };
    const problems = validateLevelData(level);
    if (problems.length > 0) return { error: fail("fase-invalida", `Fase inválida: ${problems[0]}.`) };
    return { world: { kind: "custom", level: level as Level } };
  }
  return { error: fail("formato-invalido", "Tipo de fase desconhecido.") };
}

/** Valida tudo antes de montar o genoma: versões, tamanhos, tipos, faixas, referências, ciclos e, por último, a viabilidade da fase. */
function build(raw: RawBrain): DecodeResult {
  if (raw.format !== FORMAT_VERSION) {
    return fail("versao-formato", `Este link usa o formato ${String(raw.format)}; esta versão entende o formato ${FORMAT_VERSION}.`);
  }
  if (raw.engine !== ENGINE_VERSION) {
    return fail(
      "versao-engine",
      `Este cérebro foi treinado no motor v${String(raw.engine)} e esta versão roda o motor v${ENGINE_VERSION}. Ele jogaria diferente, então não foi carregado.`,
    );
  }
  if (typeof raw.gravity !== "number" || !Number.isFinite(raw.gravity) || raw.gravity < GRAVITY_MIN || raw.gravity > GRAVITY_MAX) {
    return fail("valor-invalido", "Gravidade fora da faixa permitida.");
  }
  const gravity = Math.fround(raw.gravity);
  if (!Array.isArray(raw.hidden) || raw.hidden.length > MAX_HIDDEN_NODES) {
    return fail("valor-invalido", "Quantidade de nós ocultos inválida.");
  }
  if (!Array.isArray(raw.conns) || raw.conns.length > MAX_CONNECTIONS) {
    return fail("valor-invalido", "Quantidade de conexões inválida.");
  }

  const nodes: NodeGene[] = baseNodes(LAYOUT);
  for (const id of raw.hidden) {
    if (!isUint32(id)) return fail("valor-invalido", "Id de nó oculto inválido.");
    nodes.push({ id, kind: "hidden" });
  }

  const conns: ConnGene[] = [];
  for (const c of raw.conns) {
    if (!Array.isArray(c) || c.length !== 5) return fail("formato-invalido", "Conexão malformada.");
    const [innovation, from, to, weight, enabled] = c as unknown[];
    if (!isUint32(innovation) || !isUint32(from) || !isUint32(to)) return fail("valor-invalido", "Número de conexão inválido.");
    if (typeof weight !== "number" || !Number.isFinite(weight) || Math.abs(weight) > WEIGHT_LIMIT) {
      return fail("valor-invalido", "Peso fora da faixa permitida.");
    }
    if (enabled !== 0 && enabled !== 1) return fail("valor-invalido", "Marca de habilitada inválida.");
    conns.push({ innovation, from, to, weight: Math.fround(weight) === 0 ? 0 : Math.fround(weight), enabled: enabled === 1 });
  }

  const genome = sortGenome({ nodes, conns });
  const problems = validateGenome(genome, LAYOUT, WEIGHT_LIMIT);
  if (problems.length > 0) return fail("estrutura-invalida", `Genoma inválido: ${problems[0]}.`);

  const built = buildWorld(raw.world);
  if ("error" in built) return built.error;

  // Por último, o passo caro: a fase (embutida ou do link) precisa ser viável nesta gravidade.
  if (built.world.kind === "builtin" || built.world.kind === "custom") {
    const level = built.world.kind === "builtin" ? (getBuiltinLevel(built.world.index) as Level) : built.world.level;
    const feasibility = feasibilityOfLevel(level, gravity);
    if (!feasibility.ok) {
      return fail("fase-inviavel", `Nesta gravidade a fase é ${describeFailure(feasibility)}; o cérebro não foi carregado.`);
    }
  }
  return { ok: true, value: { genome, env: { gravity, world: built.world } } };
}

// ---------- JSON ----------

function worldJson(world: WorldRef): string {
  switch (world.kind) {
    case "builtin":
      return `{"kind":"builtin","level":${world.index},"version":${world.version}}`;
    case "chaos":
      return `{"kind":"chaos","seed":${world.seed}}`;
    case "custom": {
      const obstacles = world.level.obstacles.map((o) => `[${o.x},${o.gapY},${o.gapHeight}]`).join(",");
      return `{"kind":"custom","speed":${world.level.speed},"finishX":${world.level.finishX},"obstacles":[${obstacles}]}`;
    }
  }
}

/** JSON estável: ordem de chaves e de genes fixa, pesos já em float32. */
export function encodeBrainJson(p: BrainPayload): string {
  const hidden = p.genome.nodes.filter((n) => n.kind === "hidden").map((n) => n.id);
  const conns = p.genome.conns.map((c) => `[${c.innovation},${c.from},${c.to},${c.weight === 0 ? 0 : c.weight},${c.enabled ? 1 : 0}]`);
  return (
    `{"format":${FORMAT_VERSION},"engine":${ENGINE_VERSION},` +
    `"env":{"gravity":${p.env.gravity},"world":${worldJson(p.env.world)}},` +
    `"genome":{"hidden":[${hidden.join(",")}],"conns":[${conns.join(",")}]}}`
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Nunca lança. */
export function decodeBrainJson(text: string): DecodeResult {
  if (typeof text !== "string") return fail("formato-invalido", "Entrada não é texto.");
  if (text.length > MAX_JSON_CHARS) return fail("muito-grande", "Arquivo grande demais para ser um cérebro.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("formato-invalido", "O texto não é um JSON válido.");
  }
  if (!isRecord(parsed) || !isRecord(parsed.env) || !isRecord(parsed.genome)) {
    return fail("formato-invalido", "O JSON não tem a estrutura de um cérebro.");
  }
  return build({
    format: parsed.format,
    engine: parsed.engine,
    gravity: parsed.env.gravity,
    world: parsed.env.world,
    hidden: parsed.genome.hidden,
    conns: parsed.genome.conns,
  });
}

// ---------- Binário (link) ----------

const FIXED_HEADER_BYTES = 2 + 1 + 1 + 4 + 1; // magic, formato, motor, gravidade, tipo de fase
const GENOME_HEADER_BYTES = 2 + 2;
const CONN_BYTES = 4 + 4 + 4 + 4 + 1;
const KIND_BUILTIN = 0;
const KIND_CUSTOM = 1;
const KIND_CHAOS = 2;

function worldBytes(world: WorldRef): number {
  switch (world.kind) {
    case "builtin":
      return 2;
    case "chaos":
      return 4;
    case "custom":
      return levelByteLength(world.level);
  }
}

/**
 * Bytes: "FS", formato, motor, gravidade f32, tipo de fase u8, dados da fase
 * (embutida: índice+versão; caos: seed u32; customizada: velocidade, chegada, obstáculos),
 * nº ocultos u16, nº conexões u16, ocultos u32[], conexões (innovation, de, para, peso f32, habilitada).
 */
export function encodeBrainBytes(p: BrainPayload): Uint8Array {
  const hidden = p.genome.nodes.filter((n) => n.kind === "hidden").map((n) => n.id);
  const conns = p.genome.conns;
  const total = FIXED_HEADER_BYTES + worldBytes(p.env.world) + GENOME_HEADER_BYTES + hidden.length * 4 + conns.length * CONN_BYTES;
  const view = new DataView(new ArrayBuffer(total));
  let o = 0;
  view.setUint8(o++, MAGIC[0]);
  view.setUint8(o++, MAGIC[1]);
  view.setUint8(o++, FORMAT_VERSION);
  view.setUint8(o++, ENGINE_VERSION);
  view.setFloat32(o, p.env.gravity, true);
  o += 4;
  const world = p.env.world;
  if (world.kind === "builtin") {
    view.setUint8(o++, KIND_BUILTIN);
    view.setUint8(o++, world.index);
    view.setUint8(o++, world.version);
  } else if (world.kind === "chaos") {
    view.setUint8(o++, KIND_CHAOS);
    view.setUint32(o, world.seed, true);
    o += 4;
  } else {
    view.setUint8(o++, KIND_CUSTOM);
    o = writeLevel(view, o, world.level);
  }
  view.setUint16(o, hidden.length, true);
  view.setUint16(o + 2, conns.length, true);
  o += GENOME_HEADER_BYTES;
  for (const id of hidden) {
    view.setUint32(o, id, true);
    o += 4;
  }
  for (const c of conns) {
    view.setUint32(o, c.innovation, true);
    view.setUint32(o + 4, c.from, true);
    view.setUint32(o + 8, c.to, true);
    view.setFloat32(o + 12, c.weight, true);
    view.setUint8(o + 16, c.enabled ? 1 : 0);
    o += CONN_BYTES;
  }
  return new Uint8Array(view.buffer);
}

/** Nunca lança. */
export function decodeBrainBytes(bytes: Uint8Array): DecodeResult {
  try {
    return decodeBytesUnsafe(bytes);
  } catch {
    return fail("formato-invalido", "O link está corrompido.");
  }
}

function decodeBytesUnsafe(bytes: Uint8Array): DecodeResult {
  if (bytes.length < FIXED_HEADER_BYTES) return fail("formato-invalido", "Link curto demais para ser um cérebro.");
  if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1]) return fail("formato-invalido", "Isto não parece um link de cérebro do Fósforo.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = view.getUint8(2);
  const engine = view.getUint8(3);
  // Versões diferentes têm prioridade sobre erros de tamanho: o corpo pode ter outro layout.
  if (format !== FORMAT_VERSION || engine !== ENGINE_VERSION) {
    return build({ format, engine, gravity: 1, world: null, hidden: [], conns: [] });
  }
  const gravity = view.getFloat32(4, true);
  const kind = view.getUint8(8);
  let o = FIXED_HEADER_BYTES;

  let world: unknown;
  if (kind === KIND_BUILTIN) {
    if (o + 2 > bytes.length) return fail("formato-invalido", "Link truncado.");
    world = { kind: "builtin", level: view.getUint8(o), version: view.getUint8(o + 1) };
    o += 2;
  } else if (kind === KIND_CHAOS) {
    if (o + 4 > bytes.length) return fail("formato-invalido", "Link truncado.");
    world = { kind: "chaos", seed: view.getUint32(o, true) };
    o += 4;
  } else if (kind === KIND_CUSTOM) {
    const read = readLevel(view, o);
    if (!read) return fail("formato-invalido", "Fase do link truncada ou grande demais.");
    world = {
      kind: "custom",
      speed: read.level.speed,
      finishX: read.level.finishX,
      obstacles: read.level.obstacles.map((ob) => [ob.x, ob.gapY, ob.gapHeight]),
    };
    o = read.next;
  } else {
    return fail("valor-invalido", "Tipo de fase desconhecido.");
  }

  if (o + GENOME_HEADER_BYTES > bytes.length) return fail("formato-invalido", "Link truncado.");
  const hiddenCount = view.getUint16(o, true);
  const connCount = view.getUint16(o + 2, true);
  o += GENOME_HEADER_BYTES;
  if (hiddenCount > MAX_HIDDEN_NODES || connCount > MAX_CONNECTIONS) {
    return fail("valor-invalido", "Quantidade de nós ou conexões acima do limite.");
  }
  if (bytes.length !== o + hiddenCount * 4 + connCount * CONN_BYTES) {
    return fail("formato-invalido", "O tamanho do link não bate com o conteúdo declarado.");
  }

  const hidden: number[] = [];
  for (let i = 0; i < hiddenCount; i++, o += 4) hidden.push(view.getUint32(o, true));
  const conns: unknown[] = [];
  for (let i = 0; i < connCount; i++, o += CONN_BYTES) {
    conns.push([view.getUint32(o, true), view.getUint32(o + 4, true), view.getUint32(o + 8, true), view.getFloat32(o + 12, true), view.getUint8(o + 16)]);
  }
  return build({ format, engine, gravity, world, hidden, conns });
}

export function encodeBrainLink(p: BrainPayload): string {
  return toBase64Url(encodeBrainBytes(p));
}

/** Aceita o texto do fragmento (sem `#`). Nunca lança. */
export function decodeBrainLink(text: string): DecodeResult {
  if (typeof text !== "string") return fail("formato-invalido", "Link ausente.");
  if (text.length > MAX_LINK_CHARS) return fail("muito-grande", "Link grande demais para ser um cérebro.");
  const bytes = fromBase64Url(text);
  if (!bytes) return fail("formato-invalido", "O link tem caracteres inválidos.");
  return decodeBrainBytes(bytes);
}
