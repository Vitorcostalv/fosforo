/// <reference lib="webworker" />
import { aliveCount } from "../lib/game/world";
import type { Genome } from "../lib/neat/genome";
import {
  FRAME_INTERVAL_MS,
  FromSim,
  MAX_TICKS_PER_SLICE,
  ParamChange,
  SLICE_BUDGET_MS,
  SimStatus,
  StartConfig,
  ToSim,
} from "../lib/sim/protocol";
import {
  GenerationSim,
  Run,
  applyParams,
  beginGeneration,
  checkRunParams,
  createRun,
  finishGeneration,
  sanitizeParams,
} from "../lib/sim/run";
import { isStagnated } from "../lib/ui/stagnation";

/**
 * Worker da simulação. Toda a evolução roda aqui; a interface só recebe mensagens.
 * A velocidade (1x a 20x) só muda quantos ticks entram em cada fatia de tempo: o resultado
 * da evolução é o mesmo (a fatia nunca decide nada sobre a simulação).
 */
const ctx = self as unknown as {
  postMessage(message: FromSim, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ToSim>) => void) | null;
};

let run: Run | null = null;
let sim: GenerationSim | null = null;
let running = false;
let speed = 1;
let carry = 0;
let lastPump = 0;
let lastFrame = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let bestEverFitness = -Infinity;
let currentRunId = 0;

/** Toda mensagem sai carimbada com o id da run; a interface descarta as de runs antigas. */
const post = (message: FromSim, transfer?: Transferable[]): void => ctx.postMessage({ ...message, runId: currentRunId }, transfer);

function paramsOf(r: Run): StartConfig {
  const p = r.params;
  return {
    seed: p.seed,
    populationSize: p.populationSize,
    weightMutationRate: p.weightMutationRate,
    addNodeRate: p.addNodeRate,
    addConnectionRate: p.addConnectionRate,
    gravity: p.gravity,
    mode: p.mode,
    level: p.level,
  };
}

function status(): SimStatus {
  const r = run as Run;
  return { running, speed, generation: r.population.generation, seed: r.params.seed, edited: r.edited, params: paramsOf(r) };
}

function announceCourse(): void {
  if (!run || !sim) return;
  const { course } = sim.world;
  post({
    type: "course",
    course: { generation: run.population.generation, level: course.level, obstacles: course.level.obstacles.length, wind: course.wind },
  });
}

function startGeneration(): void {
  if (!run) return;
  sim = beginGeneration(run);
  announceCourse();
  sendFrame(true);
}

function sendFrame(force = false): void {
  if (!run || !sim) return;
  const now = performance.now();
  if (!force && now - lastFrame < FRAME_INTERVAL_MS) return;
  lastFrame = now;
  const { world } = sim;
  const data = new Float32Array(world.birds.length * 2);
  let leader = -1;
  let leaderKey = -1;
  world.birds.forEach((b, i) => {
    data[i * 2] = b.y;
    data[i * 2 + 1] = b.finished ? 2 : b.alive ? 1 : 0;
    if (b.alive || b.finished) {
      const key = b.pipes * 100000 + b.ticks;
      if (key > leaderKey) {
        leaderKey = key;
        leader = i;
      }
    }
  });
  post(
    {
      type: "frame",
      generation: run.population.generation,
      tick: world.tick,
      scroll: world.scroll,
      alive: aliveCount(world),
      leader,
      birds: data,
    },
    [data.buffer],
  );
}

function completeGeneration(): void {
  if (!run || !sim) return;
  sendFrame(true);
  const generation = run.population.generation;
  const gravityPlayed = sim.world.gravity;
  const levelPlayed = run.params.mode === "level" ? run.params.level.id : null;
  const stats = finishGeneration(run, sim);
  const champion = run.best as Genome;
  const message: Extract<FromSim, { type: "generation" }> = {
    type: "generation",
    stats,
    champion,
    stagnated: false,
    levelId: levelPlayed,
  };
  if (stats.maxFitness > bestEverFitness) {
    bestEverFitness = stats.maxFitness;
    message.bestEver = { genome: champion, fitness: stats.maxFitness, generation, gravity: gravityPlayed };
  }
  // No caos cada geração joga um percurso diferente: fitness de gerações distintas não é comparável.
  message.stagnated = run.params.mode === "level" && isStagnated(run.history);
  post(message);
  sim = null;
  startGeneration();
  post({ type: "status", status: status() });
}

function pump(): void {
  timer = null;
  if (!running || !run) return;
  try {
    pumpOnce();
  } catch (error) {
    running = false;
    post({ type: "error", message: `A simulação parou por um erro interno: ${error instanceof Error ? error.message : String(error)}` });
    if (run) post({ type: "status", status: status() });
  }
}

function pumpOnce(): void {
  if (!run) return;
  if (!sim) startGeneration();
  const now = performance.now();
  const elapsed = Math.min(100, now - lastPump);
  lastPump = now;
  carry += (elapsed * 60 * speed) / 1000;
  let ticks = Math.min(MAX_TICKS_PER_SLICE, Math.floor(carry));
  carry -= ticks;
  const deadline = now + SLICE_BUDGET_MS;
  while (ticks > 0 && sim) {
    sim.step();
    ticks--;
    if (sim.done) {
      completeGeneration();
      if (!running) return;
    }
    if (performance.now() > deadline) break;
  }
  carry = Math.min(MAX_TICKS_PER_SLICE, carry + ticks); // o que não coube no orçamento volta para a próxima fatia, com teto
  sendFrame();
  timer = setTimeout(pump, 0);
}

function schedule(): void {
  if (timer === null && running) {
    lastPump = performance.now();
    timer = setTimeout(pump, 0);
  }
}

function stepWholeGeneration(): void {
  if (!run) return;
  if (!sim) startGeneration();
  while (sim && !sim.done) sim.step();
  completeGeneration();
}

function begin(config: StartConfig, autoplay: boolean, initialSpeed: number, runId: number): void {
  // A run antiga acaba aqui, tenha o novo início dado certo ou não: a interface nunca fica com duas verdades.
  currentRunId = runId;
  run = null;
  sim = null;
  running = false;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const params = sanitizeParams(config);
  const check = checkRunParams(params);
  if (!check.ok) {
    post({ type: "error", message: check.message });
    return;
  }
  run = createRun(config);
  sim = null;
  bestEverFitness = -Infinity;
  speed = initialSpeed;
  carry = 0;
  running = autoplay;
  startGeneration();
  post({ type: "status", status: status() });
  schedule();
}

function change(delta: ParamChange): void {
  if (!run) return;
  const candidate = sanitizeParams({ ...run.params, ...delta, seed: run.params.seed }, run.params);
  const check = checkRunParams(candidate);
  if (!check.ok) {
    post({ type: "rejected", message: check.message });
    post({ type: "status", status: status() }); // a interface volta ao valor que está valendo
    return;
  }
  applyParams(run, delta);
  post({ type: "status", status: status() });
}

ctx.onmessage = (event) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case "start":
        begin(msg.config, msg.autoplay, msg.speed, msg.runId);
        break;
      case "play":
        running = true;
        schedule();
        if (run) post({ type: "status", status: status() });
        break;
      case "pause":
        running = false;
        if (run) post({ type: "status", status: status() });
        break;
      case "step-generation":
        running = false;
        stepWholeGeneration();
        if (run) post({ type: "status", status: status() });
        break;
      case "speed":
        speed = Math.min(20, Math.max(1, msg.value));
        if (run) post({ type: "status", status: status() });
        break;
      case "params":
        change(msg.change);
        break;
      case "stop":
        running = false;
        run = null;
        sim = null;
        break;
    }
  } catch (error) {
    running = false;
    post({ type: "error", message: `A simulação parou por um erro interno: ${error instanceof Error ? error.message : String(error)}` });
  }
};

post({ type: "ready" });
