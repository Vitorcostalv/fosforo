import { Genome } from "../neat/genome";

/**
 * Forma textual canônica do genoma: só nós ocultos e conexões, em ordem de innovation.
 * Estável entre execuções e navegadores (números formatados pelo algoritmo do padrão ECMAScript).
 */
export function canonicalGenomeString(g: Genome): string {
  const hidden = g.nodes.filter((n) => n.kind === "hidden").map((n) => n.id);
  const conns = g.conns.map((c) => `${c.innovation},${c.from},${c.to},${c.weight === 0 ? 0 : c.weight},${c.enabled ? 1 : 0}`);
  return `h[${hidden.join(",")}]c[${conns.join(";")}]`;
}
