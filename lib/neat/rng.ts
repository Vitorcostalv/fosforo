/**
 * PRNG mulberry32. Só usa aritmética inteira (Math.imul, >>>, ^) e uma divisão
 * por 2^32 (potência de 2, exata em IEEE-754). Resultado idêntico em qualquer navegador.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed | 0;
  }

  /** Estado interno como uint32 (útil para depuração e testes). */
  get state(): number {
    return this.s >>> 0;
  }

  nextU32(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Uniforme em [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniforme em [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Inteiro em [0, n). Exige n >= 1. */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Verdadeiro com probabilidade p. Sempre consome um sorteio, para manter o fluxo alinhado. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }
}

/** Deriva uma seed independente a partir de uma seed e um sal. */
export function deriveSeed(seed: number, salt: number): number {
  const r = new Rng((seed ^ Math.imul(salt | 0, 0x9e3779b1)) | 0);
  r.nextU32();
  return r.nextU32();
}

/** Converte qualquer número finito em uma seed uint32. */
export function normalizeSeed(n: number): number {
  return Number.isFinite(n) ? Math.floor(Math.abs(n)) >>> 0 : 0;
}
