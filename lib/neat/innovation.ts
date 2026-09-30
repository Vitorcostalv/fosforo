/**
 * Registro de inovações (artigo, p. 108).
 * - Os contadores de innovation e de id de nó são globais e nunca voltam atrás.
 * - A tabela de deduplicação vale só dentro da geração: a mesma estrutura surgida duas vezes
 *   na mesma geração recebe o mesmo número. Em gerações diferentes, recebe números novos.
 */
export class InnovationTracker {
  nextInnovation = 0;
  nextNodeId: number;
  private connections = new Map<string, number>();
  private splits = new Map<string, number>();

  constructor(firstHiddenId: number) {
    this.nextNodeId = firstHiddenId;
  }

  /** Innovation da conexão from→to nesta geração. */
  connection(from: number, to: number): number {
    const key = `${from}>${to}`;
    let id = this.connections.get(key);
    if (id === undefined) {
      id = this.nextInnovation++;
      this.connections.set(key, id);
    }
    return id;
  }

  /** Id do nó criado ao dividir a conexão de innovation `connInnovation` nesta geração. */
  splitNode(connInnovation: number): number {
    let id = this.splits.get(String(connInnovation));
    if (id === undefined) {
      id = this.nextNodeId++;
      this.splits.set(String(connInnovation), id);
    }
    return id;
  }

  /** Chamar no início de cada geração de filhos. */
  startGeneration(): void {
    this.connections.clear();
    this.splits.clear();
  }
}
