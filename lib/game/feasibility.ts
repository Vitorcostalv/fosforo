import { ARENA } from "./config";
import { Course, windAt } from "./course";
import { LEVEL_LIMITS } from "./level";
import { hitsObstacle, nextVelocity, outOfBounds } from "./physics";

/**
 * Validador de viabilidade: existe uma sequência de pulos que leva o pássaro do início até a
 * linha de chegada, dadas a física (gravidade, impulso, limite de velocidade), a velocidade da
 * fase e o vento?
 *
 * Método: busca em largura sobre os estados (y, vy), tick a tick, com a MESMA função de física
 * e de colisão do jogo (`nextVelocity`, `hitsObstacle`, `outOfBounds`). Estados quase iguais
 * (mesma célula de 1 unidade em y e mesmo vy) são fundidos; como o vy é idêntico, os dois evoluem
 * em paralelo e a diferença de 1 unidade em y fica dentro da margem.
 *
 * Garantias:
 * - Aceitar é sólido: o pássaro é inflado por `margin` (padrão 2 unidades) e cada estado guardado
 *   é um estado real alcançável, então uma fase aceita tem caminho real, com folga. Com
 *   `witness: true` o caminho (pulos por tick) é devolvido e pode ser reexecutado no jogo.
 * - Rejeitar é exato até `maxStates` estados por tick (`exact: true`). Uma fase que só passa com
 *   folga menor que `margin` é rejeitada de propósito: é fase "no fio da navalha".
 */
export interface FeasibilityOptions {
  /** Inflação da caixa do pássaro, em unidades. Padrão 2. */
  margin?: number;
  /** Teto de estados por tick; acima disso a busca é subamostrada (e `exact` vira false). */
  maxStates?: number;
  /** Guardar o caminho encontrado. */
  witness?: boolean;
}

export interface FeasibilityResult {
  ok: boolean;
  /** Índice (0-based) do obstáculo que fechou todos os caminhos; null se viável. */
  blockedObstacle: number | null;
  failTick: number | null;
  /** false se a busca precisou descartar estados (rejeição pode ser falso negativo). */
  exact: boolean;
  peakStates: number;
  /** Pulos por tick (índice 0 = tick 1), presente se `witness` e viável. */
  witness?: boolean[];
}

export const DEFAULT_MAX_STATES = 30000;
export const DEFAULT_MARGIN = 2;

/** Tabela de estados já vistos no tick (endereçamento aberto). Comporta até 60 000 inserções por tick. */
const TABLE_BITS = 17;
const TABLE_MASK = (1 << TABLE_BITS) - 1;
const MAX_STATES_LIMIT = 30000;
const VY_KEY_OFFSET = ARENA.maxSpeed * 1000 + 1;
const VY_KEY_SPAN = 2 * ARENA.maxSpeed * 1000 + 3;

interface Snapshot {
  tick: number;
  obstacleIndex: number;
  ys: Float64Array;
  vys: Float64Array;
}

export class FeasibilityScanner {
  tick = 0;
  exact = true;
  peakStates = 1;
  readonly half: number;
  private readonly maxStates: number;
  private readonly keepWitness: boolean;
  private ys: Float64Array;
  private vys: Float64Array;
  private altYs: Float64Array;
  private altVys: Float64Array;
  private n = 1;
  private obstacleIndex = 0;
  private tableKeys = new Int32Array(1 << TABLE_BITS);
  private tableStamps = new Uint32Array(1 << TABLE_BITS);
  private stampGen = 0;
  private parents: Int32Array[] = [];
  private jumps: Uint8Array[] = [];

  constructor(
    readonly course: Course,
    readonly gravity: number,
    options: FeasibilityOptions = {},
  ) {
    this.half = ARENA.birdHalf + (options.margin ?? DEFAULT_MARGIN);
    this.maxStates = Math.min(MAX_STATES_LIMIT, Math.max(1, Math.floor(options.maxStates ?? DEFAULT_MAX_STATES)));
    this.keepWitness = options.witness === true;
    const capacity = this.maxStates * 2 + 2;
    this.ys = new Float64Array(capacity);
    this.vys = new Float64Array(capacity);
    this.altYs = new Float64Array(capacity);
    this.altVys = new Float64Array(capacity);
    this.ys[0] = ARENA.height / 2;
    this.vys[0] = 0;
  }

  get alive(): boolean {
    return this.n > 0;
  }

  get birdLevelX(): number {
    return ARENA.birdX + this.course.level.speed * this.tick;
  }

  get finished(): boolean {
    return this.birdLevelX >= this.course.level.finishX;
  }

  get blockedObstacle(): number {
    const count = this.course.level.obstacles.length;
    return Math.min(this.obstacleIndex, Math.max(0, count - 1));
  }

  /** O pássaro (inflado) já passou por inteiro do obstáculo `index`? */
  passed(index: number): boolean {
    const o = this.course.level.obstacles[index];
    return o !== undefined && this.birdLevelX - this.half >= o.x + ARENA.pipeWidth;
  }

  /** Avança um tick. Retorna false se nenhum estado sobreviveu. */
  step(): boolean {
    const { level } = this.course;
    const t = this.tick + 1;
    const x = ARENA.birdX + level.speed * t;
    const wind = windAt(this.course, t);
    const half = this.half;

    while (
      this.obstacleIndex < level.obstacles.length &&
      x - half >= level.obstacles[this.obstacleIndex].x + ARENA.pipeWidth
    ) {
      this.obstacleIndex++;
    }
    const obstacle = level.obstacles[this.obstacleIndex];

    const cap = this.maxStates * 2 + 2;
    const nextYs = this.altYs;
    const nextVys = this.altVys;
    const parent = this.keepWitness ? new Int32Array(cap) : null;
    const jumped = this.keepWitness ? new Uint8Array(cap) : null;
    this.stampGen++;
    let m = 0;

    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < 2; j++) {
        const vy = nextVelocity(this.vys[i], j === 1, this.gravity, wind);
        const y = this.ys[i] + vy;
        if (outOfBounds(y, half)) continue;
        if (obstacle && hitsObstacle(y, half, x, obstacle)) continue;
        if (this.seen(Math.floor(y) * VY_KEY_SPAN + Math.round(vy * 1000) + VY_KEY_OFFSET)) continue;
        nextYs[m] = y;
        nextVys[m] = vy;
        if (parent && jumped) {
          parent[m] = i;
          jumped[m] = j;
        }
        m++;
      }
    }

    if (m > this.maxStates) {
      // Subamostragem determinística (passo fixo). Só perde caminhos: nunca inventa um.
      this.exact = false;
      const stride = m / this.maxStates;
      let k = 0;
      for (let q = 0; q < this.maxStates; q++) {
        const src = Math.floor(q * stride);
        nextYs[k] = nextYs[src];
        nextVys[k] = nextVys[src];
        if (parent && jumped) {
          parent[k] = parent[src];
          jumped[k] = jumped[src];
        }
        k++;
      }
      m = k;
    }

    this.tick = t;
    this.altYs = this.ys;
    this.altVys = this.vys;
    this.ys = nextYs;
    this.vys = nextVys;
    this.n = m;
    if (m > this.peakStates) this.peakStates = m;
    if (parent && jumped) {
      this.parents.push(parent.slice(0, m));
      this.jumps.push(jumped.slice(0, m));
    }
    return m > 0;
  }

  /** Já vimos este estado (célula de 1 unidade em y, vy a 1e-3) neste tick? Se não, registra. Independe do histórico. */
  private seen(key: number): boolean {
    let h = (Math.imul(key, 0x9e3779b1) >>> (32 - TABLE_BITS)) & TABLE_MASK;
    while (this.tableStamps[h] === this.stampGen) {
      if (this.tableKeys[h] === key) return true;
      h = (h + 1) & TABLE_MASK;
    }
    this.tableStamps[h] = this.stampGen;
    this.tableKeys[h] = key;
    return false;
  }

  /** Caminho de pulos até o primeiro estado vivo (só com `witness: true`). */
  witnessPath(): boolean[] {
    const path: boolean[] = new Array<boolean>(this.tick).fill(false);
    let index = 0;
    for (let t = this.tick - 1; t >= 0; t--) {
      path[t] = this.jumps[t][index] === 1;
      index = this.parents[t][index];
    }
    return path;
  }

  save(): Snapshot {
    return {
      tick: this.tick,
      obstacleIndex: this.obstacleIndex,
      ys: this.ys.slice(0, this.n),
      vys: this.vys.slice(0, this.n),
    };
  }

  restore(s: Snapshot): void {
    this.tick = s.tick;
    this.obstacleIndex = s.obstacleIndex;
    this.n = s.ys.length;
    this.ys.set(s.ys);
    this.vys.set(s.vys);
  }

  /** Alguns estados vivos (até `count`), espaçados, para o gerador de caos escolher onde pôr o próximo vão. */
  sampleStates(count: number): Array<{ y: number; vy: number }> {
    const out: Array<{ y: number; vy: number }> = [];
    const stride = Math.max(1, Math.floor(this.n / count));
    for (let i = 0; i < this.n; i += stride) out.push({ y: this.ys[i], vy: this.vys[i] });
    return out;
  }
}

/** Roda a busca do início até a linha de chegada. Nunca lança. */
export function checkFeasibility(course: Course, gravity: number, options: FeasibilityOptions = {}): FeasibilityResult {
  const scanner = new FeasibilityScanner(course, gravity, options);
  const budget = LEVEL_LIMITS.maxTicks + 10;
  while (!scanner.finished) {
    if (scanner.tick > budget || !scanner.step()) {
      return {
        ok: false,
        blockedObstacle: scanner.blockedObstacle,
        failTick: scanner.tick,
        exact: scanner.exact,
        peakStates: scanner.peakStates,
      };
    }
  }
  return {
    ok: true,
    blockedObstacle: null,
    failTick: null,
    exact: scanner.exact,
    peakStates: scanner.peakStates,
    witness: options.witness ? scanner.witnessPath() : undefined,
  };
}

/** Mensagem em português para a UI: qual trecho é impossível. */
export function describeFailure(result: FeasibilityResult): string {
  if (result.ok) return "viável";
  const i = result.blockedObstacle ?? 0;
  return i === 0 ? "impossível: não dá para chegar ao cano 1" : `impossível entre o cano ${i} e o cano ${i + 1}`;
}
