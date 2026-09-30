import { makeChaosCourse } from "../game/chaos";
import { DEFAULT_GRAVITY, GameMode, normalizeGravity } from "../game/config";
import { Course, courseOf } from "../game/course";
import { describeFailure } from "../game/feasibility";
import { Level, levelTicks, validateLevelData } from "../game/level";
import { BUILTIN_LEVELS } from "../game/levels";
import { SENSOR_COUNT, World, aliveCount, birdFitness, createWorld, sense, stepWorld } from "../game/world";
import { DEFAULT_NEAT_CONFIG, NeatConfig } from "../neat/config";
import { Genome } from "../neat/genome";
import { hashString } from "../neat/hash";
import { Network, compile, forward } from "../neat/network";
import { PopulationState, createPopulation, evolve } from "../neat/population";
import { deriveSeed, normalizeSeed } from "../neat/rng";
import { canonicalGenomeString } from "./canonical";
import { feasibilityOfLevel } from "./feasibilityCache";

export interface RunParams {
  seed: number;
  populationSize: number;
  weightMutationRate: number;
  addNodeRate: number;
  addConnectionRate: number;
  gravity: number;
  /** level: joga a fase de `level`; chaos: percurso novo a cada geração, com vento. */
  mode: GameMode;
  level: Level;
}

export const DEFAULT_RUN_PARAMS: RunParams = {
  seed: 1,
  populationSize: 100,
  weightMutationRate: DEFAULT_NEAT_CONFIG.weightMutationRate,
  addNodeRate: DEFAULT_NEAT_CONFIG.addNodeRate,
  addConnectionRate: DEFAULT_NEAT_CONFIG.addConnectionRate,
  gravity: DEFAULT_GRAVITY,
  mode: "level",
  level: BUILTIN_LEVELS[0],
};

export interface GenerationStats {
  generation: number;
  maxFitness: number;
  meanFitness: number;
  speciesCount: number;
  bestPipes: number;
  /** Quantos pássaros completaram a fase. */
  finishers: number;
  /** Pelo menos um pássaro completou a fase. */
  solved: boolean;
}

export interface Run {
  /** Parâmetros em vigor. Mudanças valem a partir da próxima geração. */
  params: RunParams;
  /** Parâmetros do início: com eles e a seed a run é reproduzível. */
  initialParams: RunParams;
  /** Alguma mudança de parâmetro aconteceu depois do início. */
  edited: boolean;
  population: PopulationState;
  history: GenerationStats[];
  best: Genome | null;
}

/** Limita e normaliza parâmetros vindos da UI ou de links. Nunca lança. */
export function sanitizeParams(p: Partial<RunParams>, base: RunParams = DEFAULT_RUN_PARAMS): RunParams {
  const clampNum = (v: unknown, lo: number, hi: number, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  return {
    seed: normalizeSeed(p.seed ?? base.seed),
    populationSize: Math.floor(clampNum(p.populationSize, 1, 500, base.populationSize)),
    weightMutationRate: clampNum(p.weightMutationRate, 0, 1, base.weightMutationRate),
    addNodeRate: clampNum(p.addNodeRate, 0, 1, base.addNodeRate),
    addConnectionRate: clampNum(p.addConnectionRate, 0, 1, base.addConnectionRate),
    gravity: normalizeGravity(p.gravity ?? base.gravity),
    mode: p.mode === "chaos" || p.mode === "level" ? p.mode : base.mode,
    level: p.level !== undefined && validateLevelData(p.level).length === 0 ? p.level : base.level,
  };
}

export function toNeatConfig(p: RunParams): NeatConfig {
  return {
    ...DEFAULT_NEAT_CONFIG,
    numInputs: SENSOR_COUNT,
    populationSize: p.populationSize,
    weightMutationRate: p.weightMutationRate,
    addNodeRate: p.addNodeRate,
    addConnectionRate: p.addConnectionRate,
  };
}

/** Uma run só treina em fase viável. O caos é gerado já validado, então sempre passa. */
export function checkRunParams(p: RunParams): { ok: true } | { ok: false; message: string } {
  if (p.mode === "chaos") return { ok: true };
  const problems = validateLevelData(p.level);
  if (problems.length > 0) return { ok: false, message: `Fase inválida: ${problems[0]}.` };
  const result = feasibilityOfLevel(p.level, p.gravity);
  return result.ok ? { ok: true } : { ok: false, message: `Não dá para treinar: a fase é ${describeFailure(result)} com esta gravidade.` };
}

export function createRun(input: Partial<RunParams> = {}): Run {
  const params = sanitizeParams(input);
  return {
    params,
    initialParams: params,
    edited: false,
    population: createPopulation(toNeatConfig(params), params.seed),
    history: [],
    best: null,
  };
}

/** Aplica mudanças de parâmetro; o efeito começa na próxima geração. A seed não muda no meio da run. */
export function applyParams(run: Run, change: Partial<RunParams>): void {
  const next = sanitizeParams({ ...run.params, ...change, seed: run.params.seed }, run.params);
  if (JSON.stringify(next) === JSON.stringify(run.params)) return;
  run.params = next;
  run.edited = true;
}

/** Percurso da geração. Fase: sempre a mesma. Caos: um novo por geração, já validado. */
export function courseFor(params: RunParams, generation: number): Course {
  return params.mode === "chaos"
    ? makeChaosCourse(deriveSeed(params.seed, 1000 + generation), params.gravity)
    : courseOf(params.level);
}

/** Uma geração em andamento, tick a tick (a UI/Worker consome em fatias; os testes rodam até o fim). */
export class GenerationSim {
  readonly world: World;
  readonly nets: Network[];
  private readonly buffers: Float64Array[];
  private readonly inputs: number[] = new Array<number>(SENSOR_COUNT).fill(0);
  private readonly jumps: boolean[];
  private readonly tickGuard: number;

  constructor(course: Course, params: RunParams, genomes: readonly Genome[], layout: PopulationState["layout"]) {
    this.world = createWorld(course, params.gravity, genomes.length);
    this.nets = genomes.map((g) => compile(g, layout));
    this.buffers = this.nets.map((n) => new Float64Array(n.numNodes));
    this.jumps = new Array<boolean>(genomes.length).fill(false);
    this.tickGuard = levelTicks(course.level) + 5;
  }

  get done(): boolean {
    return this.world.over || aliveCount(this.world) === 0 || this.world.tick >= this.tickGuard;
  }

  step(): void {
    const { world } = this;
    for (let i = 0; i < world.birds.length; i++) {
      const bird = world.birds[i];
      if (!bird.alive) {
        this.jumps[i] = false;
        continue;
      }
      sense(world, bird, this.inputs);
      this.jumps[i] = forward(this.nets[i], this.inputs, this.buffers[i])[0] > 0;
    }
    stepWorld(world, this.jumps);
  }

  fitness(): number[] {
    return this.world.birds.map(birdFitness);
  }
}

export function beginGeneration(run: Run): GenerationSim {
  const { population, params } = run;
  population.cfg = toNeatConfig(params);
  return new GenerationSim(courseFor(params, population.generation), params, population.genomes, population.layout);
}

/** Registra estatísticas, guarda o melhor e evolui a população. */
export function finishGeneration(run: Run, sim: GenerationSim): GenerationStats {
  const fitness = sim.fitness();
  let bestIndex = 0;
  let total = 0;
  fitness.forEach((f, i) => {
    total += f;
    if (f > fitness[bestIndex]) bestIndex = i;
  });
  const finishers = sim.world.birds.filter((b) => b.finished).length;
  const stats: GenerationStats = {
    generation: run.population.generation,
    maxFitness: fitness[bestIndex],
    meanFitness: total / fitness.length,
    speciesCount: run.population.species.length,
    bestPipes: sim.world.birds[bestIndex].pipes,
    finishers,
    solved: finishers > 0,
  };
  run.history.push(stats);
  run.best = run.population.genomes[bestIndex];
  // Taxas e tamanho da população valem para os filhos, ou seja, a partir da próxima geração.
  run.population.cfg = toNeatConfig(run.params);
  evolve(run.population, fitness);
  return stats;
}

export function runGeneration(run: Run): GenerationStats {
  const sim = beginGeneration(run);
  while (!sim.done) sim.step();
  return finishGeneration(run, sim);
}

/** Resumo textual estável da run, para golden tests e comparação entre navegadores. */
export function runDigest(run: Run): string {
  const stats = run.history.map(
    (h) => `${h.generation}:${h.maxFitness}:${h.meanFitness}:${h.speciesCount}:${h.bestPipes}:${h.finishers}`,
  );
  const genome = run.best ? canonicalGenomeString(run.best) : "none";
  return hashString(`${stats.join("|")}#${genome}`);
}
