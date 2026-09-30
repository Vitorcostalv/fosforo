/// <reference lib="webworker" />
import { makeChaosCourse } from "../lib/game/chaos";
import type { FromValidator, ToValidator } from "../lib/sim/protocol";
import { analyzeLevel } from "../lib/ui/viability";

/**
 * Worker do validador de viabilidade e da pré-visualização do caos. Roda separado da simulação
 * para o editor responder ao vivo sem disputar tempo com a evolução.
 */
const ctx = self as unknown as {
  postMessage(message: FromValidator): void;
  onmessage: ((event: MessageEvent<ToValidator>) => void) | null;
};

ctx.onmessage = (event) => {
  const msg = event.data;
  const t0 = performance.now();
  try {
    if (msg.kind === "analyze") {
      ctx.postMessage({ id: msg.id, kind: "analyze", report: analyzeLevel(msg.level, msg.gravity), ms: performance.now() - t0 });
    } else {
      const course = makeChaosCourse(msg.seed, msg.gravity);
      ctx.postMessage({ id: msg.id, kind: "chaos-preview", obstacles: course.level.obstacles.length, ms: performance.now() - t0 });
    }
  } catch (error) {
    ctx.postMessage({ id: msg.id, kind: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
