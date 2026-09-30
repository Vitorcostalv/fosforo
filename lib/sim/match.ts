import { makeCourse } from "../game/course";
import { SENSOR_COUNT, World, birdFitness, createWorld, sense, stepWorld } from "../game/world";
import { Genome, makeLayout } from "../neat/genome";
import { Network, compile, forward } from "../neat/network";
import { BrainEnv } from "./link";

export interface MatchScore {
  human: number;
  ai: number;
}

/**
 * Humano (pássaro 0) e cérebro (pássaro 1) no mesmo percurso, com a mesma física.
 * A partida acaba quando os dois morrem ou quando o teto de ticks é atingido.
 */
export class Match {
  readonly world: World;
  private readonly net: Network;
  private readonly values: Float64Array;
  private readonly inputs = new Array<number>(SENSOR_COUNT).fill(0);
  private readonly maxTicks: number;

  constructor(genome: Genome, env: BrainEnv, maxTicks = 36000) {
    this.maxTicks = maxTicks;
    this.world = createWorld(makeCourse(env.courseSeed, env.mode, maxTicks), env.gravity, 2);
    this.net = compile(genome, makeLayout(SENSOR_COUNT, 1));
    this.values = new Float64Array(this.net.numNodes);
  }

  get done(): boolean {
    return this.world.tick >= this.maxTicks || (!this.world.birds[0].alive && !this.world.birds[1].alive);
  }

  step(humanJump: boolean): void {
    const ai = this.world.birds[1];
    let aiJump = false;
    if (ai.alive) {
      sense(this.world, ai, this.inputs);
      aiJump = forward(this.net, this.inputs, this.values)[0] > 0;
    }
    stepWorld(this.world, [humanJump, aiJump]);
  }

  score(): MatchScore {
    return { human: this.world.birds[0].pipes, ai: this.world.birds[1].pipes };
  }

  fitness(): MatchScore {
    return { human: birdFitness(this.world.birds[0]), ai: birdFitness(this.world.birds[1]) };
  }
}
