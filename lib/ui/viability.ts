import { ARENA } from "../game/config";
import { courseOf } from "../game/course";
import { checkFeasibility } from "../game/feasibility";
import { Level, validateLevelData } from "../game/level";
import { DEFAULT_MARGIN } from "../game/feasibility";

/**
 * Relatório de viabilidade para o editor. Distingue os três casos que o usuário precisa entender:
 * - viável;
 * - "sem folga": passa raspando (só com a caixa do pássaro exata), mas não com a folga mínima de 2;
 * - impossível: faltou espaço, mesmo raspando.
 */
export type ViabilityReport =
  | { status: "ok"; message: string }
  | { status: "tight"; message: string; obstacle: number }
  | { status: "impossible"; message: string; obstacle: number }
  | { status: "invalid"; message: string };

function segment(index: number): string {
  return index === 0 ? "antes do cano 1" : `entre o cano ${index} e o cano ${index + 1}`;
}

export function analyzeLevel(level: Level, gravity: number): ViabilityReport {
  const problems = validateLevelData(level);
  if (problems.length > 0) return { status: "invalid", message: `Fase inválida: ${problems[0]}.` };

  const course = courseOf(level);
  const strict = checkFeasibility(course, gravity);
  if (strict.ok) return { status: "ok", message: "Viável." };

  const index = strict.blockedObstacle ?? 0;
  const exact = checkFeasibility(course, gravity, { margin: 0 });
  if (exact.ok) {
    return {
      status: "tight",
      obstacle: index,
      message: `Passa raspando ${segment(index)}: abaixo da folga mínima de ${DEFAULT_MARGIN}. Alargue o vão ou aproxime as alturas.`,
    };
  }
  const at = exact.blockedObstacle ?? index;
  return {
    status: "impossible",
    obstacle: at,
    message: `Impossível ${segment(at)}: faltou espaço. Aproxime as alturas, alargue o vão ou afaste os canos.`,
  };
}

/**
 * Folga de um vão: espaço vertical que sobra para o centro do pássaro depois de descontar o corpo
 * e a amplitude de um pulo (para pairar no vão). Negativa = só dá para atravessar em passagem
 * direta, sem pairar. É uma medida de leitura rápida; quem decide a viabilidade é o validador.
 */
export function gapSlack(gapHeight: number, gravity: number): number {
  const impulse = Math.abs(ARENA.jumpVelocity) - gravity;
  const hover = (impulse * impulse) / (2 * Math.max(gravity, 0.05));
  return Math.round(gapHeight - 2 * ARENA.birdHalf - hover);
}
