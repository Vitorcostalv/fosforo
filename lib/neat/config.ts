export interface NeatConfig {
  numInputs: number;
  numOutputs: number;
  populationSize: number;

  /** Coeficientes da distância de compatibilidade (artigo, Eq. 1). */
  c1: number;
  c2: number;
  c3: number;
  compatibilityThreshold: number;

  /** Chance de o genoma ter pesos mutados (artigo: 0,8). */
  weightMutationRate: number;
  /** Dentro disso, chance de perturbar (artigo: 0,9); o resto recebe valor novo. */
  weightPerturbProb: number;
  /** Perturbação uniforme em [-p, p]. Escolha do projeto; o artigo não fixa a magnitude. */
  weightPerturbPower: number;
  /** Valor novo uniforme em [-r, r]. Escolha do projeto. */
  weightReplaceRange: number;
  /** Faixa de segurança dos pesos: [-limite, limite]. Escolha do projeto. */
  weightLimit: number;
  /** Pesos iniciais uniformes em [-r, r]. Escolha do projeto. */
  initialWeightRange: number;

  addNodeRate: number;
  addConnectionRate: number;
  addConnectionAttempts: number;

  /** Chance de um gene desabilitado em algum pai continuar desabilitado no filho (artigo: 0,75). */
  disabledInheritProb: number;
  /** Fração de filhos gerados só por mutação, sem cruzamento (artigo: 0,25). */
  mutateOnlyRate: number;
  /** Taxa de cruzamento entre espécies (artigo: 0,001). */
  interspeciesMatingRate: number;

  /** Fração da espécie que sobrevive para reproduzir. Não definido no artigo; padrão do neat-python: 0,2. */
  survivalThreshold: number;
  /** Gerações sem melhora do máximo da espécie até ela parar de reproduzir (artigo: 15). */
  maxStagnation: number;
  /** Gerações sem melhora da população até só as 2 melhores espécies reproduzirem (artigo, nota 2: 20). */
  populationStagnation: number;
  /** Espécies com mais indivíduos que isto copiam o campeão intacto (artigo: 5). */
  championMinSpeciesSize: number;
}

export const DEFAULT_NEAT_CONFIG: NeatConfig = {
  numInputs: 4,
  numOutputs: 1,
  populationSize: 100,
  c1: 1.0,
  c2: 1.0,
  c3: 0.4,
  compatibilityThreshold: 3.0,
  weightMutationRate: 0.8,
  weightPerturbProb: 0.9,
  weightPerturbPower: 0.5,
  weightReplaceRange: 2,
  weightLimit: 8,
  initialWeightRange: 1,
  addNodeRate: 0.05,
  addConnectionRate: 0.1,
  addConnectionAttempts: 20,
  disabledInheritProb: 0.75,
  mutateOnlyRate: 0.25,
  interspeciesMatingRate: 0.001,
  survivalThreshold: 0.2,
  maxStagnation: 15,
  populationStagnation: 20,
  championMinSpeciesSize: 5,
};
