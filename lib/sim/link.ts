import { GRAVITY_MAX, GRAVITY_MIN, GameMode } from "../game/config";
import { SENSOR_COUNT } from "../game/world";
import { fromBase64Url, toBase64Url } from "../neat/base64url";
import { DEFAULT_NEAT_CONFIG } from "../neat/config";
import { ConnGene, Genome, NodeGene, baseNodes, makeLayout, sortGenome, validateGenome } from "../neat/genome";

/** Versão do formato do arquivo/link. Muda quando a estrutura dos bytes muda. */
export const FORMAT_VERSION = 1;
/** Versão do motor. Muda quando o comportamento muda (ativação, entradas, física): o mesmo genoma jogaria diferente. */
export const ENGINE_VERSION = 1;

export const MAX_LINK_CHARS = 8192;
export const MAX_JSON_CHARS = 65536;
export const MAX_HIDDEN_NODES = 128;
export const MAX_CONNECTIONS = 512;

const LAYOUT = makeLayout(SENSOR_COUNT, 1);
const WEIGHT_LIMIT = DEFAULT_NEAT_CONFIG.weightLimit;
const MAGIC = [0x46, 0x53]; // "FS"

export interface BrainEnv {
  gravity: number;
  mode: GameMode;
  courseSeed: number;
}

export interface BrainPayload {
  genome: Genome;
  env: BrainEnv;
}

export type DecodeErrorCode =
  | "muito-grande"
  | "formato-invalido"
  | "versao-formato"
  | "versao-engine"
  | "valor-invalido"
  | "estrutura-invalida";

export type DecodeResult =
  | { ok: true; value: BrainPayload }
  | { ok: false; code: DecodeErrorCode; message: string };

function fail(code: DecodeErrorCode, message: string): DecodeResult {
  return { ok: false, code, message };
}

const isUint32 = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 0xffffffff;

interface RawBrain {
  format: unknown;
  engine: unknown;
  gravity: unknown;
  mode: unknown;
  courseSeed: unknown;
  hidden: unknown;
  conns: unknown;
}

/** Valida tudo antes de montar o genoma: versões, tamanhos, tipos, faixas, referências e ciclos. */
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
  if (raw.mode !== "normal" && raw.mode !== "chaos") return fail("valor-invalido", "Modo de jogo desconhecido.");
  if (!isUint32(raw.courseSeed)) return fail("valor-invalido", "Seed do percurso inválida.");
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
  return {
    ok: true,
    value: { genome, env: { gravity: Math.fround(raw.gravity), mode: raw.mode, courseSeed: raw.courseSeed } },
  };
}

// ---------- JSON ----------

/** JSON estável: ordem de chaves e de genes fixa, pesos já em float32. */
export function encodeBrainJson(p: BrainPayload): string {
  const hidden = p.genome.nodes.filter((n) => n.kind === "hidden").map((n) => n.id);
  const conns = p.genome.conns.map((c) => `[${c.innovation},${c.from},${c.to},${c.weight === 0 ? 0 : c.weight},${c.enabled ? 1 : 0}]`);
  return (
    `{"format":${FORMAT_VERSION},"engine":${ENGINE_VERSION},` +
    `"env":{"gravity":${p.env.gravity},"mode":"${p.env.mode}","courseSeed":${p.env.courseSeed}},` +
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
    mode: parsed.env.mode,
    courseSeed: parsed.env.courseSeed,
    hidden: parsed.genome.hidden,
    conns: parsed.genome.conns,
  });
}

// ---------- Binário (link) ----------

const HEADER_BYTES = 2 + 1 + 1 + 4 + 1 + 4 + 2 + 2;
const CONN_BYTES = 4 + 4 + 4 + 4 + 1;

/** Bytes: "FS", formato, motor, gravidade f32, modo u8, seed u32, nº ocultos u16, nº conexões u16, ocultos u32[], conexões. */
export function encodeBrainBytes(p: BrainPayload): Uint8Array {
  const hidden = p.genome.nodes.filter((n) => n.kind === "hidden").map((n) => n.id);
  const conns = p.genome.conns;
  const buffer = new ArrayBuffer(HEADER_BYTES + hidden.length * 4 + conns.length * CONN_BYTES);
  const view = new DataView(buffer);
  let o = 0;
  view.setUint8(o++, MAGIC[0]);
  view.setUint8(o++, MAGIC[1]);
  view.setUint8(o++, FORMAT_VERSION);
  view.setUint8(o++, ENGINE_VERSION);
  view.setFloat32(o, p.env.gravity, true);
  o += 4;
  view.setUint8(o++, p.env.mode === "chaos" ? 1 : 0);
  view.setUint32(o, p.env.courseSeed, true);
  o += 4;
  view.setUint16(o, hidden.length, true);
  o += 2;
  view.setUint16(o, conns.length, true);
  o += 2;
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
  return new Uint8Array(buffer);
}

/** Nunca lança. */
export function decodeBrainBytes(bytes: Uint8Array): DecodeResult {
  if (bytes.length < HEADER_BYTES) return fail("formato-invalido", "Link curto demais para ser um cérebro.");
  if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1]) return fail("formato-invalido", "Isto não parece um link de cérebro do Fósforo.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = view.getUint8(2);
  const engine = view.getUint8(3);
  // Versões diferentes têm prioridade sobre erros de tamanho: o corpo pode ter outro layout.
  if (format !== FORMAT_VERSION || engine !== ENGINE_VERSION) {
    return build({ format, engine, gravity: 1, mode: "normal", courseSeed: 0, hidden: [], conns: [] });
  }
  const gravity = view.getFloat32(4, true);
  const modeByte = view.getUint8(8);
  const courseSeed = view.getUint32(9, true);
  const hiddenCount = view.getUint16(13, true);
  const connCount = view.getUint16(15, true);
  if (hiddenCount > MAX_HIDDEN_NODES || connCount > MAX_CONNECTIONS) {
    return fail("valor-invalido", "Quantidade de nós ou conexões acima do limite.");
  }
  if (bytes.length !== HEADER_BYTES + hiddenCount * 4 + connCount * CONN_BYTES) {
    return fail("formato-invalido", "O tamanho do link não bate com o conteúdo declarado.");
  }
  if (modeByte > 1) return fail("valor-invalido", "Modo de jogo desconhecido.");

  let o = HEADER_BYTES;
  const hidden: number[] = [];
  for (let i = 0; i < hiddenCount; i++, o += 4) hidden.push(view.getUint32(o, true));
  const conns: unknown[] = [];
  for (let i = 0; i < connCount; i++, o += CONN_BYTES) {
    const enabledByte = view.getUint8(o + 16);
    conns.push([view.getUint32(o, true), view.getUint32(o + 4, true), view.getUint32(o + 8, true), view.getFloat32(o + 12, true), enabledByte]);
  }
  return build({ format, engine, gravity, mode: modeByte === 1 ? "chaos" : "normal", courseSeed, hidden, conns });
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
