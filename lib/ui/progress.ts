/** Progressão: fases 2 a 10 ficam bloqueadas até completar a anterior (IA ou humano). */
export interface Progress {
  /** Números (1 a 10) das fases já completadas. */
  completed: number[];
  /** "Desbloquear tudo": libera todas as fases sem exigir progresso. */
  unlockAll: boolean;
}

export const EMPTY_PROGRESS: Progress = { completed: [], unlockAll: false };
export const PROGRESS_KEY = "fosforo.progress.v1";
export const LEVEL_TOTAL = 10;

export function isUnlocked(p: Progress, level: number): boolean {
  if (!Number.isInteger(level) || level < 1 || level > LEVEL_TOTAL) return false;
  if (level === 1 || p.unlockAll) return true;
  return p.completed.includes(level - 1);
}

export function isCompleted(p: Progress, level: number): boolean {
  return p.completed.includes(level);
}

export function markCompleted(p: Progress, level: number): Progress {
  if (!Number.isInteger(level) || level < 1 || level > LEVEL_TOTAL || p.completed.includes(level)) return p;
  return { ...p, completed: [...p.completed, level].sort((a, b) => a - b) };
}

export function setUnlockAll(p: Progress, value: boolean): Progress {
  return p.unlockAll === value ? p : { ...p, unlockAll: value };
}

/** Lê o que veio do armazenamento (entrada não confiável). Nunca lança. */
export function parseProgress(text: string | null): Progress {
  if (!text) return EMPTY_PROGRESS;
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== "object" || raw === null) return EMPTY_PROGRESS;
    const r = raw as Record<string, unknown>;
    const completed = Array.isArray(r.completed)
      ? [...new Set(r.completed.filter((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= LEVEL_TOTAL))].sort(
          (a, b) => a - b,
        )
      : [];
    return { completed, unlockAll: r.unlockAll === true };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function serializeProgress(p: Progress): string {
  return JSON.stringify({ completed: p.completed, unlockAll: p.unlockAll });
}

/** Mensagem do cadeado: qual fase precisa ser completada. */
export function lockedReason(level: number): string {
  return `Complete a fase ${level - 1} para liberar.`;
}
