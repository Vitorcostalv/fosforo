import { courseOf } from "../game/course";
import { FeasibilityResult, checkFeasibility } from "../game/feasibility";
import { Level } from "../game/level";

const MAX_ENTRIES = 48;
const cache = new Map<string, FeasibilityResult>();

function keyOf(level: Level, gravity: number): string {
  const obstacles = level.obstacles.map((o) => `${o.x},${o.gapY},${o.gapHeight}`).join(";");
  return `${gravity}|${level.speed}|${level.finishX}|${obstacles}`;
}

/**
 * Viabilidade de uma fase (sem vento) com memória: o validador é uma função pura da fase e da
 * gravidade, e a mesma fase costuma ser conferida várias vezes (link, editor, início da run).
 */
export function feasibilityOfLevel(level: Level, gravity: number): FeasibilityResult {
  const key = keyOf(level, gravity);
  const hit = cache.get(key);
  if (hit) return hit;
  const result = checkFeasibility(courseOf(level), gravity);
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, result);
  return result;
}
