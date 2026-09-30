import { Rng } from "../neat/rng";
import { ARENA, WIND_PERIOD, windAmplitude } from "./config";
import { Course, buildWindSchedule } from "./course";
import { FeasibilityOptions, FeasibilityResult, FeasibilityScanner, checkFeasibility } from "./feasibility";
import { Level, Obstacle } from "./level";

/**
 * O caos é regenerado a cada geração, então o validador roda com teto de estados menor: só aceita
 * o que achou (sólido), pode recusar candidatos que o validador completo aceitaria (só encurta ou
 * varia o percurso, nunca o torna impossível).
 */
export const CHAOS_FEASIBILITY = { maxStates: 2500 } as const;

/**
 * Validador oficial de um percurso: fases (sem vento) usam a busca completa; percursos com vento
 * (caos) usam a busca com teto reduzido. É esta a função que o caos, as fases embutidas, o editor
 * e os links usam.
 */
export function validateCourse(course: Course, gravity: number, options: FeasibilityOptions = {}): FeasibilityResult {
  const base = course.wind.length > 0 ? CHAOS_FEASIBILITY : {};
  return checkFeasibility(course, gravity, { ...base, ...options });
}

export const CHAOS = {
  speed: 3.5,
  gapHeight: 116,
  /** Vãos alternativos, do normal ao mais largo, para gravidades em que o vão normal não é passável. */
  gapFallbacks: [148, 190, 240, 300],
  spacing: 210,
  jitter: 20,
  firstX: 420,
  finishRoom: 150,
  defaultObstacles: 40,
  maxObstacles: 50,
  /** Margem entre o vão e o teto/chão no sorteio. */
  edgeMargin: 60,
  firstRandomAttempts: 6,
  frontierAttempts: 8,
  lastRandomAttempts: 18,
} as const;

/**
 * Percurso do modo caos: alturas sorteadas em toda a arena e vento variável.
 *
 * Nunca é impossível: cada obstáculo só entra se o validador de viabilidade (a mesma busca usada
 * em toda fase) confirma que o pássaro ainda consegue passar dele, com o vento e a gravidade
 * informados. Se nem os candidatos sorteados nem os derivados dos estados alcançáveis servem, o
 * percurso termina ali (fica mais curto, mas viável). Determinístico para a mesma seed.
 *
 * A busca incremental daqui é a mesma computação de `validateCourse` (a busca não depende do
 * histórico e obstáculos vizinhos nunca se sobrepõem na caixa do pássaro), então o resultado passa
 * em `validateCourse` por construção. Os testes conferem isso em centenas de seeds e gravidades.
 */
export function makeChaosCourse(seed: number, gravity: number, count: number = CHAOS.defaultObstacles): Course {
  const rng = new Rng(seed);
  const target = Math.max(1, Math.min(CHAOS.maxObstacles, Math.floor(count)));

  const estimatedTicks = Math.ceil((CHAOS.firstX + target * (CHAOS.spacing + CHAOS.jitter) + 400) / CHAOS.speed);
  const amplitude = windAmplitude(gravity);
  const targets: number[] = [];
  for (let k = 0; k < Math.ceil(estimatedTicks / WIND_PERIOD) + 3; k++) {
    targets.push(Math.fround(rng.range(-amplitude, amplitude)));
  }

  const level: Level = { id: "caos", version: 1, name: "Caos", speed: CHAOS.speed, finishX: 0, obstacles: [] };
  const course: Course = { level, wind: buildWindSchedule(targets, estimatedTicks + 300) };
  const scanner = new FeasibilityScanner(course, gravity, CHAOS_FEASIBILITY);

  // Estado do scanner logo depois de passar de cada obstáculo (para desfazer o último se preciso).
  const afterPass: Array<ReturnType<FeasibilityScanner["save"]>> = [];
  const gapSizes = [CHAOS.gapHeight, ...CHAOS.gapFallbacks];

  for (let i = 0; i < target; i++) {
    const previous = level.obstacles[i - 1];
    const x = previous ? previous.x + CHAOS.spacing + rng.int(2 * CHAOS.jitter + 1) - CHAOS.jitter : CHAOS.firstX;
    const snapshot = scanner.save();

    let placed = false;
    // Vão normal primeiro; só se nenhuma altura serve (gravidade extrema, por exemplo) tenta um vão maior.
    for (const gapHeight of gapSizes) {
      const lo = Math.ceil(gapHeight / 2 + CHAOS.edgeMargin);
      const hi = Math.floor(ARENA.height - gapHeight / 2 - CHAOS.edgeMargin);
      const clampY = (y: number): number => Math.min(hi, Math.max(lo, Math.round(y)));

      // Ordem: alguns sorteios livres (o caos de verdade), depois alturas alcançáveis, depois mais sorteios.
      const candidates: number[] = [];
      const draw = (n: number): void => {
        for (let k = 0; k < n; k++) candidates.push(clampY(rng.range(lo, hi)));
      };
      draw(CHAOS.firstRandomAttempts);
      for (const s of scanner.sampleStates(CHAOS.frontierAttempts)) candidates.push(clampY(s.y));
      draw(CHAOS.lastRandomAttempts);

      for (const gapY of candidates) {
        const obstacle: Obstacle = { x, gapY, gapHeight };
        level.obstacles.push(obstacle);
        let alive = true;
        while (alive && !scanner.passed(i)) alive = scanner.step();
        if (alive) {
          placed = true;
          break;
        }
        level.obstacles.pop();
        scanner.restore(snapshot);
      }
      if (placed) break;
    }
    if (!placed) break;
    afterPass.push(scanner.save());
  }

  // Trecho final até a chegada: se ninguém sobrevive até lá, remove o último obstáculo e tenta de novo.
  for (;;) {
    if (level.obstacles.length === 0) break;
    setFinish(level);
    let alive = true;
    while (alive && !scanner.finished) alive = scanner.step();
    if (alive) return course;
    if (level.obstacles.length === 1) break;
    level.obstacles.pop();
    afterPass.pop();
    scanner.restore(afterPass[afterPass.length - 1]);
  }

  applyLastResort(level);
  return course;
}

/**
 * Último recurso: um único cano com o vão mais largo, no meio da arena. Os testes confirmam com o
 * validador oficial, em toda a faixa de gravidade permitida, que este percurso é viável.
 */
export function applyLastResort(level: Level): void {
  level.obstacles.length = 0;
  level.obstacles.push({ x: CHAOS.firstX, gapY: ARENA.height / 2, gapHeight: CHAOS.gapFallbacks[CHAOS.gapFallbacks.length - 1] });
  setFinish(level);
}

function setFinish(level: Level): void {
  const last = level.obstacles[level.obstacles.length - 1];
  level.finishX = last.x + ARENA.pipeWidth + CHAOS.finishRoom;
}
