import { Course } from "../game/course";
import { levelTicks } from "../game/level";
import { SENSOR_COUNT, World, birdFitness, createWorld, sense, stepWorld } from "../game/world";
import { Genome, makeLayout } from "../neat/genome";
import { Network, compile, forward } from "../neat/network";

export interface MatchScore {
  human: number;
  ai: number;
}

/**
 * Humano (pássaro 0) e cérebro (pássaro 1) na MESMA fase, com a mesma física.
 * A partida acaba quando os dois morrem ou completam a fase.
 */
export class Match {
  readonly world: World;
  private readonly net: Network;
  private readonly values: Float64Array;
  private readonly inputs = new Array<number>(SENSOR_COUNT).fill(0);
  private readonly tickGuard: number;

  constructor(genome: Genome, course: Course, gravity: number) {
    this.world = createWorld(course, gravity, 2);
    this.net = compile(genome, makeLayout(SENSOR_COUNT, 1));
    this.values = new Float64Array(this.net.numNodes);
    this.tickGuard = levelTicks(course.level) + 5;
  }

  get done(): boolean {
    return this.world.over || (!this.world.birds[0].alive && !this.world.birds[1].alive) || this.world.tick >= this.tickGuard;
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

  finished(): { human: boolean; ai: boolean } {
    return { human: this.world.birds[0].finished, ai: this.world.birds[1].finished };
  }
}
