import { makeChaosCourse } from "../game/chaos";
import { Course, courseOf } from "../game/course";
import { Level } from "../game/level";
import { getBuiltinLevel } from "../game/levels";

/** Onde o cérebro joga: fase embutida (id + versão), fase customizada (dados) ou caos (seed). */
export type WorldRef =
  | { kind: "builtin"; index: number; version: number }
  | { kind: "custom"; level: Level }
  | { kind: "chaos"; seed: number };

export interface BrainEnv {
  gravity: number;
  world: WorldRef;
}

/** Monta o percurso executável. Assume `env` já validado (vindo de `link.ts`) ou construído pelo app. */
export function resolveCourse(env: BrainEnv): Course | null {
  switch (env.world.kind) {
    case "builtin": {
      const level = getBuiltinLevel(env.world.index);
      return level ? courseOf(level) : null;
    }
    case "custom":
      return courseOf(env.world.level);
    case "chaos":
      return makeChaosCourse(env.world.seed, env.gravity);
  }
}
