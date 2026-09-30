/**
 * Ativação softsign: x / (1 + |x|), saída em (-1, 1).
 *
 * O artigo (p. 112) usa a sigmoide "achatada" 1 / (1 + e^(-4,9x)). Ela depende de `exp`, e a
 * especificação do JavaScript não garante resultado idêntico de `Math.exp`/`Math.tanh` entre
 * V8, JavaScriptCore e SpiderMonkey. Divergência de 1 bit já basta para uma evolução seguir
 * outro caminho. Softsign usa só soma, divisão e valor absoluto (exatos em IEEE-754), é
 * monotônica, sem saturar rápido, e mantém a rede determinística em qualquer navegador.
 * Isto é uma escolha do projeto, não do artigo.
 */
export function activate(x: number): number {
  return x / (1 + Math.abs(x));
}
