import { Level } from "../level";
import raw from "./levels.json";

/** As 10 fases embutidas: dados versionados em levels.json, da mais fácil à mais difícil. */
export const BUILTIN_LEVELS: readonly Level[] = raw as Level[];
export const LEVEL_COUNT = 10;

/** Fase embutida de 1 a 10, ou undefined. */
export function getBuiltinLevel(n: number): Level | undefined {
  return Number.isInteger(n) ? BUILTIN_LEVELS[n - 1] : undefined;
}

/** Posição de 1 a 10 a partir do id ("f03" → 3), ou 0 se não for embutida. */
export function builtinIndex(id: string): number {
  return BUILTIN_LEVELS.findIndex((l) => l.id === id) + 1;
}
