import { Level, validateLevelData } from "../game/level";

export const LEVELS_KEY = "fosforo.levels.v1";
export const MAX_SAVED_LEVELS = 20;

export interface SavedLevel {
  name: string;
  level: Level;
}

/** Lê as fases guardadas (entrada não confiável: descarta o que não passa na validação estrutural). Nunca lança. */
export function parseSavedLevels(text: string | null): SavedLevel[] {
  if (!text) return [];
  try {
    const raw: unknown = JSON.parse(text);
    if (!Array.isArray(raw)) return [];
    const out: SavedLevel[] = [];
    for (const item of raw.slice(0, MAX_SAVED_LEVELS)) {
      if (typeof item !== "object" || item === null) continue;
      const level = (item as { level?: unknown }).level;
      if (validateLevelData(level).length === 0) out.push({ name: (level as Level).name, level: level as Level });
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeSavedLevels(list: readonly SavedLevel[]): string {
  return JSON.stringify(list.slice(0, MAX_SAVED_LEVELS));
}

/** Guarda (ou substitui, pelo nome) uma fase. Devolve a nova lista e se coube. */
export function saveLevel(list: readonly SavedLevel[], level: Level): { list: SavedLevel[]; ok: boolean } {
  const without = list.filter((s) => s.name !== level.name);
  if (without.length >= MAX_SAVED_LEVELS) return { list: [...list], ok: false };
  return { list: [...without, { name: level.name, level: { ...level, obstacles: level.obstacles.map((o) => ({ ...o })) } }], ok: true };
}

export function deleteLevel(list: readonly SavedLevel[], name: string): SavedLevel[] {
  return list.filter((s) => s.name !== name);
}
