/// <reference lib="webworker" />
import { makeChaosCourse } from "../lib/game/chaos";
import type { FromValidator, ToValidator } from "../lib/sim/protocol";
import { decodeBrainJson, decodeBrainLink } from "../lib/sim/link";
import { decodeLevelJson, decodeLevelLink } from "../lib/sim/levelCodec";
import { analyzeLevel } from "../lib/ui/viability";

/**
 * Worker do validador de viabilidade. Roda separado da simulação e da interface:
 * - o editor pergunta "essa fase é viável?" ao vivo;
 * - o caos pergunta "quantos canos cabem com esta gravidade?";
 * - links e JSON importados (entrada não confiável) são decodificados e validados aqui, porque o
 *   validador de viabilidade pode levar mais de 1 s numa fase longa e não pode congelar a página.
 */
const ctx = self as unknown as {
  postMessage(message: FromValidator): void;
  onmessage: ((event: MessageEvent<ToValidator>) => void) | null;
};

ctx.onmessage = (event) => {
  const msg = event.data;
  const t0 = performance.now();
  const ms = (): number => performance.now() - t0;
  try {
    switch (msg.kind) {
      case "analyze":
        ctx.postMessage({ id: msg.id, kind: "analyze", report: analyzeLevel(msg.level, msg.gravity), ms: ms() });
        break;
      case "chaos-preview":
        ctx.postMessage({ id: msg.id, kind: "chaos-preview", obstacles: makeChaosCourse(msg.seed, msg.gravity).level.obstacles.length, ms: ms() });
        break;
      case "decode-brain":
        ctx.postMessage({ id: msg.id, kind: "decode-brain", result: msg.format === "json" ? decodeBrainJson(msg.text) : decodeBrainLink(msg.text), ms: ms() });
        break;
      case "decode-level":
        ctx.postMessage({
          id: msg.id,
          kind: "decode-level",
          result: msg.format === "json" ? decodeLevelJson(msg.text, msg.gravity) : decodeLevelLink(msg.text, msg.gravity),
          ms: ms(),
        });
        break;
    }
  } catch (error) {
    ctx.postMessage({ id: msg.id, kind: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
