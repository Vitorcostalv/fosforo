import { NeatConfig } from "./config";
import { compatibilityDistance } from "./distance";
import { Genome } from "./genome";

export interface Species {
  id: number;
  /** Genoma que representa a espécie na comparação (artigo, p. 110). */
  representative: Genome;
  /** Índices dos genomas da população atual que pertencem à espécie. */
  members: number[];
  bestFitness: number;
  lastImproved: number;
}

/**
 * Coloca cada genoma, em ordem, na primeira espécie compatível com o representante; se nenhuma
 * servir, cria espécie nova. Espécies que ficam sem membros somem. Retorna o próximo id livre.
 */
export function speciate(
  species: Species[],
  genomes: readonly Genome[],
  generation: number,
  nextSpeciesId: number,
  cfg: NeatConfig,
): { species: Species[]; nextSpeciesId: number; speciesOf: number[] } {
  for (const s of species) s.members = [];
  const speciesOf: number[] = new Array(genomes.length).fill(-1);
  let nextId = nextSpeciesId;

  genomes.forEach((g, index) => {
    let placed = species.find(
      (s) => compatibilityDistance(g, s.representative, cfg) < cfg.compatibilityThreshold,
    );
    if (!placed) {
      placed = { id: nextId++, representative: g, members: [], bestFitness: -Infinity, lastImproved: generation };
      species.push(placed);
    }
    placed.members.push(index);
    speciesOf[index] = placed.id;
  });

  return { species: species.filter((s) => s.members.length > 0), nextSpeciesId: nextId, speciesOf };
}
