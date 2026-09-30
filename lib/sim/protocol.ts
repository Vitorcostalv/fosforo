import type { GameMode } from "../game/config";
import type { Level } from "../game/level";
import type { Genome } from "../neat/genome";
import type { GenerationStats } from "./run";

/** Parâmetros que a interface manda para iniciar uma run. */
export interface StartConfig {
  seed: number;
  populationSize: number;
  weightMutationRate: number;
  addNodeRate: number;
  addConnectionRate: number;
  gravity: number;
  mode: GameMode;
  level: Level;
}

/** Mudanças aceitas com a run em andamento (valem a partir da próxima geração). */
export type ParamChange = Partial<Omit<StartConfig, "seed">>;

export type ToSim =
  | { type: "start"; config: StartConfig; autoplay: boolean; speed: number; runId: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "step-generation" }
  | { type: "speed"; value: number }
  | { type: "params"; change: ParamChange }
  | { type: "stop" };

/** Estado do painel de controle, enviado junto de cada mudança relevante. */
export interface SimStatus {
  running: boolean;
  speed: number;
  generation: number;
  seed: number;
  edited: boolean;
  params: StartConfig;
}

export interface CourseInfo {
  generation: number;
  /** Fase desta geração (no caos, o percurso sorteado; nas fases, a própria fase). */
  level: Level;
  obstacles: number;
  /** Vento por tick; vazio nas fases. */
  wind: number[];
}

/** Toda mensagem de uma run carrega o `runId` dela; a interface descarta as de runs antigas. */
export type FromSim = (
  | { type: "ready" }
  | { type: "error"; message: string }
  /** Uma mudança de parâmetro foi recusada (ex.: a fase ficaria impossível com esta gravidade). */
  | { type: "rejected"; message: string }
  | { type: "status"; status: SimStatus }
  | { type: "course"; course: CourseInfo }
  | {
      type: "frame";
      generation: number;
      tick: number;
      scroll: number;
      alive: number;
      /** Índice do pássaro na frente (ou -1). */
      leader: number;
      /** Pares [y, estado] por pássaro; estado 0 = morto, 1 = vivo, 2 = terminou a fase. */
      birds: Float32Array;
    }
  | {
      type: "generation";
      stats: GenerationStats;
      /** Melhor pássaro desta geração. */
      champion: Genome;
      /** Melhor pássaro de todas as gerações (só quando mudou), com a gravidade em que ele foi o melhor. */
      bestEver?: { genome: Genome; fitness: number; generation: number; gravity: number };
      stagnated: boolean;
      /** Id da fase (modo fase) em que esta geração jogou, ou null (caos). */
      levelId: string | null;
    }
) & { runId?: number };

export type ToValidator =
  | { id: number; kind: "analyze"; level: Level; gravity: number }
  | { id: number; kind: "chaos-preview"; seed: number; gravity: number }
  /** Valida um link/JSON de cérebro ou de fase fora do thread da interface (o validador de viabilidade pode levar ~1 s). */
  | { id: number; kind: "decode-brain"; format: "link" | "json"; text: string }
  | { id: number; kind: "decode-level"; format: "link" | "json"; text: string; gravity: number };

export type FromValidator =
  | { id: number; kind: "analyze"; report: import("../ui/viability").ViabilityReport; ms: number }
  | { id: number; kind: "chaos-preview"; obstacles: number; ms: number }
  | { id: number; kind: "decode-brain"; result: import("./link").DecodeResult; ms: number }
  | { id: number; kind: "decode-level"; result: import("./levelCodec").LevelDecodeResult; ms: number }
  | { id: number; kind: "error"; message: string };

/** Fatia de simulação por passagem do laço do Worker, em ms. */
export const SLICE_BUDGET_MS = 10;
/** Máximo de ticks por passagem (protege contra recuperar tempo perdido de uma vez). */
export const MAX_TICKS_PER_SLICE = 600;
/** Frames enviados à interface no máximo a cada N ms. */
export const FRAME_INTERVAL_MS = 33;
export const SPEEDS = [1, 2, 5, 10, 20] as const;
