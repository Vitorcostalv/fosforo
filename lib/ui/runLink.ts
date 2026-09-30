import { DEFAULT_GRAVITY, GameMode } from "../game/config";
import { LEVEL_COUNT } from "../game/levels";
import { normalizeSeed } from "../neat/rng";

/**
 * Parâmetros de uma run no fragmento da URL, para "a seed aparece na tela e no link".
 * Formato: #seed=123&fase=4&modo=fase&g=0.55&pop=100&mn=0.05&mc=0.1&mw=0.8
 * Só cobre os parâmetros INICIAIS: uma run editada no meio não é reproduzível só por isto.
 */
export interface RunLinkParams {
  seed: number;
  /** Fase embutida 1 a 10. */
  level: number;
  mode: GameMode;
  gravity: number;
  populationSize: number;
  addNodeRate: number;
  addConnectionRate: number;
  weightMutationRate: number;
}

export const DEFAULT_RUN_LINK: RunLinkParams = {
  seed: 1,
  level: 1,
  mode: "level",
  gravity: DEFAULT_GRAVITY,
  populationSize: 100,
  addNodeRate: 0.05,
  addConnectionRate: 0.1,
  weightMutationRate: 0.8,
};

const num = (v: string | null): number | null => {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const between = (n: number | null, lo: number, hi: number, fallback: number): number =>
  n === null ? fallback : Math.min(hi, Math.max(lo, n));

/** Nunca lança; valores fora da faixa são presos, ausentes viram o padrão. */
export function parseRunLink(fragment: string): RunLinkParams {
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(fragment.replace(/^#/, ""));
  } catch {
    return DEFAULT_RUN_LINK;
  }
  const d = DEFAULT_RUN_LINK;
  const seed = num(q.get("seed"));
  return {
    seed: seed === null ? d.seed : normalizeSeed(seed),
    level: Math.round(between(num(q.get("fase")), 1, LEVEL_COUNT, d.level)),
    mode: q.get("modo") === "caos" ? "chaos" : "level",
    gravity: Math.fround(between(num(q.get("g")), 0.2, 2, d.gravity)),
    populationSize: Math.round(between(num(q.get("pop")), 10, 300, d.populationSize) / 10) * 10,
    addNodeRate: between(num(q.get("mn")), 0, 1, d.addNodeRate),
    addConnectionRate: between(num(q.get("mc")), 0, 1, d.addConnectionRate),
    weightMutationRate: between(num(q.get("mw")), 0, 1, d.weightMutationRate),
  };
}

export function formatRunLink(p: RunLinkParams): string {
  const q = new URLSearchParams();
  q.set("seed", String(p.seed));
  q.set("fase", String(p.level));
  q.set("modo", p.mode === "chaos" ? "caos" : "fase");
  q.set("g", String(p.gravity));
  q.set("pop", String(p.populationSize));
  q.set("mn", String(p.addNodeRate));
  q.set("mc", String(p.addConnectionRate));
  q.set("mw", String(p.weightMutationRate));
  return q.toString();
}

/** Que tipo de link está no fragmento? */
export function fragmentKind(fragment: string): "brain" | "level" | "run" | "none" {
  const f = fragment.replace(/^#/, "");
  if (f.startsWith("b=")) return "brain";
  if (f.startsWith("f=")) return "level";
  if (f.includes("seed=")) return "run";
  return "none";
}

export function fragmentValue(fragment: string, key: "b" | "f"): string {
  return fragment.replace(/^#/, "").slice(key.length + 1);
}
