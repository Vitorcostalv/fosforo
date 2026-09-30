/**
 * localStorage pode estar indisponível (janela privada, dados bloqueados, cota cheia) ou lançar.
 * Toda leitura e escrita passa por aqui, com try/catch; a interface funciona sem armazenamento.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function browserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    const probe = "__fosforo_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function safeGet(storage: StorageLike | null, key: string): string | null {
  try {
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
}

/** Retorna false se não conseguiu gravar (a UI mostra um aviso curto, sem travar). */
export function safeSet(storage: StorageLike | null, key: string, value: string): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(storage: StorageLike | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* sem armazenamento: nada a fazer */
  }
}
