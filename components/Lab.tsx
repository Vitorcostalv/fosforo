"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_GRAVITY } from "@/lib/game/config";
import type { Course } from "@/lib/game/course";
import type { Level } from "@/lib/game/level";
import { BUILTIN_LEVELS, builtinIndex, getBuiltinLevel } from "@/lib/game/levels";
import type { Genome } from "@/lib/neat/genome";
import { deriveSeed } from "@/lib/neat/rng";
import { BrainEnv, BrainPayload, WorldRef } from "@/lib/sim/link";
import { resolveCourse } from "@/lib/sim/env";
import type { StartConfig } from "@/lib/sim/protocol";
import { EMPTY_PROGRESS, PROGRESS_KEY, Progress, markCompleted, parseProgress, serializeProgress, setUnlockAll } from "@/lib/ui/progress";
import { DEFAULT_RUN_LINK, formatRunLink, fragmentKind, fragmentValue, parseRunLink } from "@/lib/ui/runLink";
import { nextSeed } from "@/lib/ui/stagnation";
import { browserStorage, safeGet, safeSet } from "@/lib/ui/storage";
import { BrainShare, copyText } from "./BrainShare";
import { BrainView } from "./BrainView";
import { Charts } from "./Charts";
import { EvolutionCanvas, PlayCanvas, PlayResult, PlayScore } from "./GameView";
import { LevelEditor } from "./LevelEditor";
import { LevelChoice, LevelsPanel } from "./LevelsPanel";
import { ParamsPanel } from "./ParamsPanel";
import { Banner, Icon, PanelTitle, Readout, Tabs } from "./ui";
import { useSim } from "./useSim";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { useValidator } from "./useValidator";

const DEFAULTS: StartConfig = {
  seed: DEFAULT_RUN_LINK.seed,
  populationSize: DEFAULT_RUN_LINK.populationSize,
  weightMutationRate: DEFAULT_RUN_LINK.weightMutationRate,
  addNodeRate: DEFAULT_RUN_LINK.addNodeRate,
  addConnectionRate: DEFAULT_RUN_LINK.addConnectionRate,
  gravity: DEFAULT_GRAVITY,
  mode: "level",
  level: BUILTIN_LEVELS[0],
};

const TABS = [
  { id: "game", label: "Jogo" },
  { id: "brain", label: "Cérebro" },
  { id: "charts", label: "Gráficos" },
  { id: "params", label: "Parâmetros" },
  { id: "levels", label: "Fases" },
];

interface MatchSetup {
  genome: Genome | null;
  course: Course;
  gravity: number;
  title: string;
  /** Fase embutida (1 a 10) cuja conclusão libera a próxima, ou null. */
  builtin: number | null;
  runId: number;
}

function randomUint32(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

/** Qual fase/modo a run REALMENTE está jogando (vem do Worker, não do que a interface pediu por último). */
function choiceOf(params: StartConfig): LevelChoice {
  if (params.mode === "chaos") return { kind: "chaos" };
  const n = builtinIndex(params.level.id);
  return n > 0 ? { kind: "builtin", index: n } : { kind: "custom" };
}

function worldOfRun(config: StartConfig, generation: number): WorldRef {
  if (config.mode === "chaos") return { kind: "chaos", seed: deriveSeed(config.seed, 1000 + generation) };
  const n = builtinIndex(config.level.id);
  if (n > 0) return { kind: "builtin", index: n, version: config.level.version };
  return { kind: "custom", level: config.level };
}

export function Lab() {
  const progressRef = useRef<Progress>(EMPTY_PROGRESS);
  const solvedHandler = useRef<(levelId: string) => void>(() => undefined);
  const sim = useSim({ onSolved: (id) => solvedHandler.current(id) });
  const validator = useValidator();
  const { view } = sim;
  const status = view.status;

  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [storageOk, setStorageOk] = useState(true);
  const [choice, setChoice] = useState<LevelChoice>({ kind: "builtin", index: 1 });
  /** A fase/modo que a run está jogando de verdade (o Worker manda; `choice` só vale antes da primeira resposta). */
  const active: LevelChoice = status ? choiceOf(status.params) : choice;
  const [customLevel, setCustomLevel] = useState<Level | null>(null);
  const [seedDraft, setSeedDraft] = useState(String(DEFAULTS.seed));
  const [screen, setScreen] = useState<"lab" | "editor">("lab");
  const [tab, setTab] = useState("game");
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const [score, setScore] = useState<PlayScore | null>(null);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [linkNotice, setLinkNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [editorLevel, setEditorLevel] = useState<Level | null>(null);
  const reduced = usePrefersReducedMotion();
  const [copied, setCopied] = useState<string | null>(null);
  const [chaosResult, setChaosResult] = useState<{ key: string; obstacles: number | null } | null>(null);
  const [live, setLive] = useState({ alive: 0, tick: 0, population: 0 });

  const initialConfig = useRef<StartConfig>(DEFAULTS);
  /** Velocidade escolhida pela pessoa: vale em todo início de run, mesmo se ela clicar antes do Worker ficar pronto. */
  const speedRef = useRef(1);
  const [speedChoice, setSpeedChoice] = useState(1);
  const booted = useRef(false);
  const matchCounter = useRef(0);

  /* ---------- Armazenamento (progresso) ---------- */
  useEffect(() => {
    // Depois da hidratação: o servidor não tem localStorage, então lemos só no navegador.
    const timer = setTimeout(() => {
      const storage = browserStorage();
      setStorageOk(storage !== null);
      const loaded = parseProgress(safeGet(storage, PROGRESS_KEY));
      progressRef.current = loaded;
      setProgress(loaded);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const updateProgress = useCallback((next: Progress): void => {
    progressRef.current = next;
    setProgress(next);
    if (!safeSet(browserStorage(), PROGRESS_KEY, serializeProgress(next))) setStorageOk(false);
  }, []);

  /* ---------- Iniciar runs ---------- */
  const startRun = useCallback(
    (config: StartConfig, autoplay = !reduced) => {
      initialConfig.current = config;
      setSeedDraft(String(config.seed));
      setMatch(null);
      sim.start(config, autoplay, speedRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sim.start, reduced],
  );

  const currentConfig = useCallback((): StartConfig => status?.params ?? DEFAULTS, [status]);

  const openImported = useCallback((payload: BrainPayload): void => {
    const course = resolveCourse(payload.env);
    if (!course) {
      setLinkNotice({ tone: "error", text: "Não consegui montar a fase deste cérebro." });
      return;
    }
    const w = payload.env.world;
    setScore(null);
    setResult(null);
    setMatch({
      genome: payload.genome,
      course,
      gravity: payload.env.gravity,
      title: w.kind === "builtin" ? `Cérebro importado · fase ${w.index} (${getBuiltinLevel(w.index)?.name})` : w.kind === "chaos" ? "Cérebro importado · caos" : "Cérebro importado · fase própria",
      builtin: w.kind === "builtin" ? w.index : null,
      runId: ++matchCounter.current,
    });
    setTab("game");
  }, []);

  /* ---------- Links: #seed=... (run), #b=... (cérebro) e #f=... (fase) ---------- */
  const applyHash = useCallback(
    (hash: string, first: boolean): void => {
      const kind = fragmentKind(hash);
      const autoplay = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (kind === "run" || first) {
        let config = DEFAULTS;
        if (kind === "run") {
          const p = parseRunLink(hash);
          config = { ...DEFAULTS, seed: p.seed, populationSize: p.populationSize, weightMutationRate: p.weightMutationRate, addNodeRate: p.addNodeRate, addConnectionRate: p.addConnectionRate, gravity: p.gravity, mode: p.mode, level: getBuiltinLevel(p.level) as Level };
          setChoice(choiceOf(config));
        }
        initialConfig.current = config;
        setSeedDraft(String(config.seed));
        setMatch(null);
        setScreen("lab");
        sim.start(config, autoplay, speedRef.current);
      }
      // Cérebro e fase vindos de fora passam pelo validador de viabilidade, num Worker: pode levar mais de 1 s.
      if (kind === "brain") {
        setLinkNotice({ tone: "info", text: "Validando o cérebro do link..." });
        void validator.decodeBrain("link", fragmentValue(hash, "b")).then((decoded) => {
          if (decoded.ok) {
            openImported(decoded.value);
            setLinkNotice({ tone: "info", text: "Cérebro carregado do link. Jogue contra ele no painel do jogo." });
          } else {
            setLinkNotice({ tone: "error", text: decoded.message });
          }
        });
      } else if (kind === "level") {
        setLinkNotice({ tone: "info", text: "Validando a fase do link..." });
        void validator.decodeLevel("link", fragmentValue(hash, "f"), DEFAULT_GRAVITY).then((decoded) => {
          if (decoded.ok) {
            setEditorLevel(decoded.level);
            setScreen("editor");
            setLinkNotice({ tone: "info", text: "Fase carregada do link e validada. Teste, edite ou treine nela." });
          } else {
            setLinkNotice({ tone: "error", text: decoded.message });
          }
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sim.start, validator.decodeBrain, validator.decodeLevel, openImported],
  );
  const applyHashRef = useRef(applyHash);
  useEffect(() => {
    applyHashRef.current = applyHash;
  });

  useEffect(() => {
    if (!view.ready || booted.current) return;
    const timer = setTimeout(() => {
      booted.current = true;
      applyHashRef.current(window.location.hash, true);
    }, 0);
    return () => clearTimeout(timer);
  }, [view.ready]);

  // Colar outro link na mesma aba também vale.
  useEffect(() => {
    const onHash = (): void => {
      if (booted.current && fragmentKind(window.location.hash) !== "none") applyHashRef.current(window.location.hash, false);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /* ---------- Placar ao vivo (10 vezes por segundo, fora do laço de desenho) ---------- */
  useEffect(() => {
    const timer = setInterval(() => {
      const f = sim.frameRef.current;
      if (f) setLive((l) => (l.alive === f.alive && l.tick === f.tick && l.population === f.birds.length / 2 ? l : { alive: f.alive, tick: f.tick, population: f.birds.length / 2 }));
    }, 150);
    return () => clearInterval(timer);
  }, [sim.frameRef]);

  /* ---------- Progresso: a IA completou uma fase embutida (chamado pelo Worker, fora de efeitos) ---------- */
  useEffect(() => {
    solvedHandler.current = (levelId: string): void => {
      const n = builtinIndex(levelId);
      if (n > 0) updateProgress(markCompleted(progressRef.current, n));
    };
  }, [updateProgress]);

  /* ---------- Caos: quantos canos cabem com esta gravidade ---------- */
  const chaosGravity = status?.params.gravity ?? DEFAULT_GRAVITY;
  const chaosSeed = status?.params.seed ?? DEFAULTS.seed;
  const isChaos = status?.params.mode === "chaos";
  const chaosKey = `${chaosSeed}|${chaosGravity}`;
  useEffect(() => {
    if (!isChaos) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = await validator.chaosPreview(chaosSeed, chaosGravity);
      if (cancelled) return;
      setChaosResult({ key: `${chaosSeed}|${chaosGravity}`, obstacles: r.obstacles });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChaos, chaosGravity, chaosSeed]);

  /* ---------- Ações ---------- */
  const chooseLevel = (c: LevelChoice): void => {
    setChoice(c);
    const base = currentConfig();
    if (c.kind === "chaos") startRun({ ...base, mode: "chaos" });
    else if (c.kind === "custom" && customLevel) startRun({ ...base, mode: "level", level: customLevel });
    else if (c.kind === "builtin") startRun({ ...base, mode: "level", level: getBuiltinLevel(c.index) as Level });
  };

  const newSeed = (seed: number): void => startRun({ ...currentConfig(), seed });

  const payload: BrainPayload | null = useMemo(() => {
    if (!view.bestEver || !status) return null;
    // A gravidade é a do momento em que este pássaro foi o melhor, não a de agora.
    const env: BrainEnv = { gravity: view.bestEver.gravity, world: worldOfRun({ ...status.params, gravity: view.bestEver.gravity }, view.bestEver.generation) };
    return { genome: view.bestEver.genome, env };
  }, [view.bestEver, status]);

  const startMatch = (): void => {
    if (!payload || !status) return;
    const course = resolveCourse(payload.env);
    if (!course) return;
    setScore(null);
    setResult(null);
    setMatch({
      genome: payload.genome,
      course,
      gravity: payload.env.gravity,
      title: status.params.mode === "chaos" ? "Você contra o melhor pássaro · caos" : `Você contra o melhor pássaro · ${status.params.level.name}`,
      builtin: active.kind === "builtin" ? active.index : null,
      runId: ++matchCounter.current,
    });
  };

  const onMatchResult = (r: PlayResult): void => {
    setResult(r);
    if (r.humanFinished && match?.builtin) updateProgress(markCompleted(progressRef.current, match.builtin));
  };

  const copyRunLink = async (): Promise<void> => {
    const c = initialConfig.current;
    const fase = active.kind === "builtin" ? active.index : 1;
    const link = formatRunLink({ seed: c.seed, level: fase, mode: c.mode, gravity: c.gravity, populationSize: c.populationSize, addNodeRate: c.addNodeRate, addConnectionRate: c.addConnectionRate, weightMutationRate: c.weightMutationRate });
    const url = `${window.location.origin}${window.location.pathname}#${link}`;
    if (await copyText(url)) {
      setCopied("Link da run copiado.");
      setTimeout(() => setCopied(null), 5000);
    } else {
      setCopied(url);
    }
  };

  const running = status?.running ?? false;
  const stagnated = view.stagnated && !(view.history.some((h) => h.solved));
  const firstGenerationDone = view.history.length > 0;
  const canPlay = payload !== null;
  const vis = (id: string): string => (tab === id ? "" : "max-md:hidden");

  /* ---------- Editor ---------- */
  if (screen === "editor") {
    return (
      <Shell status={status} onCopyRun={copyRunLink} copied={copied} choice={active}>
        <div className="mx-auto w-full max-w-[1680px]">
          {linkNotice ? (
            <div className="mb-px">
              <Banner tone={linkNotice.tone === "error" ? "error" : "info"} role={linkNotice.tone === "error" ? "alert" : "status"} onDismiss={() => setLinkNotice(null)}>
                {linkNotice.text}
              </Banner>
            </div>
          ) : null}
          <LevelEditor
            initial={editorLevel ?? customLevel}
            gravity={status?.params.gravity ?? DEFAULT_GRAVITY}
            onClose={(draft) => {
              setEditorLevel(draft);
              setScreen("lab");
            }}
            decodeLevel={validator.decodeLevel}
            onTrain={(level) => {
              setCustomLevel(level);
              setEditorLevel(level);
              setChoice({ kind: "custom" });
              setScreen("lab");
              startRun({ ...currentConfig(), mode: "level", level });
            }}
          />
        </div>
      </Shell>
    );
  }

  return (
    <Shell status={status} onCopyRun={copyRunLink} copied={copied} choice={active}>
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-px">
        {view.error ? (
          <Banner tone="error" role="alert" onDismiss={sim.dismissNotice}>
            {view.error}
          </Banner>
        ) : null}
        {linkNotice ? (
          <Banner tone={linkNotice.tone === "error" ? "error" : "info"} role={linkNotice.tone === "error" ? "alert" : "status"} onDismiss={() => setLinkNotice(null)}>
            {linkNotice.text}
          </Banner>
        ) : null}
        {view.notice ? (
          <Banner tone="warning" onDismiss={sim.dismissNotice}>
            {view.notice}
          </Banner>
        ) : null}
        {stagnated ? (
          <Banner
            tone="warning"
            action={
              <button type="button" className="btn btn-primary" onClick={() => newSeed(nextSeed(currentConfig().seed, () => randomUint32() / 0x100000000))}>
                Tentar outra seed
              </button>
            }
          >
            Esta run estagnou. Tente outra seed.
            <span className="ml-1 text-muted">Sem melhora do fitness máximo há muitas gerações e com uma espécie só.</span>
          </Banner>
        ) : null}
        {status?.edited ? (
          <div className="flex flex-wrap items-center gap-2 border border-line bg-surface px-3 py-2 text-sm text-muted" role="note">
            <span className="label border border-amber px-1.5 py-0.5 text-amber">editada</span>
            A seed sozinha não reproduz esta evolução, porque você mudou parâmetros no meio. O cérebro exportado continua funcionando em qualquer lugar.
          </div>
        ) : null}
        {reduced && !running && view.history.length === 0 ? (
          <div className="border border-line bg-surface px-3 py-2 text-sm text-muted" role="note">
            Você pediu menos animação: a simulação começa pausada. Use “Avançar uma geração” para ver a evolução passo a passo.
          </div>
        ) : null}

        <main
          id="conteudo"
          className="grid gap-px bg-line pb-16 md:grid-cols-2 md:pb-0 min-[1200px]:grid-cols-[400px_minmax(0,1fr)_340px]"
        >
          {/* Coluna 1: jogo */}
          <section id="panel-game" role="tabpanel" aria-labelledby="tab-game" className={`bg-surface md:col-start-1 ${vis("game")}`}>
            <PanelTitle
              right={
                match ? (
                  <button type="button" className="btn" onClick={() => setMatch(null)}>
                    <Icon name="close" /> Voltar à evolução
                  </button>
                ) : undefined
              }
            >
              {match ? match.title : "Simulação ao vivo"}
            </PanelTitle>
            <div className="grid gap-3 p-3">
              {match ? (
                <>
                  <PlayCanvas
                    course={match.course}
                    gravity={match.gravity}
                    genome={match.genome}
                    runId={match.runId}
                    onScore={setScore}
                    onResult={onMatchResult}
                    label="Partida: você (pássaro branco) e o cérebro treinado (âmbar) na mesma fase. Espaço, clique ou toque para pular."
                  />
                  <Scoreboard score={score} result={result} />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-primary" onClick={() => setMatch({ ...match, runId: ++matchCounter.current })}>
                      <Icon name="play" /> Jogar de novo
                    </button>
                    <button type="button" className="btn" onClick={() => setMatch(null)}>
                      Voltar à evolução
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <EvolutionCanvas frameRef={sim.frameRef} level={view.course?.level ?? null} />
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={`btn ${running ? "" : reduced && !firstGenerationDone ? "" : "btn-primary"}`} onClick={running ? sim.pause : sim.play} disabled={!status}>
                      <Icon name={running ? "pause" : "play"} /> {running ? "Pausar" : firstGenerationDone ? "Continuar" : "Iniciar"}
                    </button>
                    <button type="button" className={`btn ${reduced && !running ? "btn-primary" : ""}`} onClick={sim.stepGeneration} disabled={!status}>
                      <Icon name="step" /> Avançar uma geração
                    </button>
                    <button type="button" className="btn" onClick={() => startRun(currentConfig())} disabled={!status}>
                      Reiniciar
                    </button>
                  </div>
                  <div className="grid gap-1" aria-live="off">
                    <Readout label="Geração" value={status ? status.generation : "—"} accent testId="gen" />
                    <Readout label="Vivos" value={`${live.alive} / ${live.population || status?.params.populationSize || "—"}`} />
                    <Readout label="Tempo da geração" value={`${(live.tick / 60).toFixed(1)} s`} />
                    <Readout label="Melhor fitness" value={view.bestEver ? view.bestEver.fitness.toFixed(1) : "—"} testId="best" />
                  </div>
                  <button type="button" className="btn" onClick={startMatch} disabled={!canPlay} title={canPlay ? undefined : "Rode ao menos uma geração"}>
                    <Icon name="play" /> Jogar contra o melhor pássaro
                  </button>
                  {!canPlay ? <p className="-mt-1 text-xs text-muted">Rode ao menos uma geração para ter um pássaro contra quem jogar.</p> : null}
                </>
              )}
            </div>
          </section>

          {/* Coluna 2: cérebro e gráficos */}
          <div className="contents min-[1200px]:col-start-2 min-[1200px]:grid min-[1200px]:grid-rows-[auto_1fr] min-[1200px]:gap-px">
            <section id="panel-brain" role="tabpanel" aria-labelledby="tab-brain" className={`bg-surface ${vis("brain")}`}>
              <PanelTitle right={view.champion ? <span className="num text-xs text-muted">geração {Math.max(0, view.history.length - 1)}</span> : undefined}>Cérebro ao vivo</PanelTitle>
              <BrainView genome={view.champion} previous={view.previousChampion} generation={Math.max(0, view.history.length - 1)} />
            </section>
            <section id="panel-charts" role="tabpanel" aria-labelledby="tab-charts" className={`bg-surface ${vis("charts")}`}>
              <PanelTitle>Gráficos</PanelTitle>
              <Charts history={view.history} />
            </section>
          </div>

          {/* Coluna 3: parâmetros, fases, compartilhar */}
          <div className="contents min-[1200px]:col-start-3 min-[1200px]:row-start-1 min-[1200px]:grid min-[1200px]:grid-rows-[auto_1fr] min-[1200px]:gap-px">
            <div id="panel-params" role="tabpanel" aria-labelledby="tab-params" className={`bg-ground ${vis("params")}`}>
              <ParamsPanel
                params={status?.params ?? null}
                speed={speedChoice}
                running={running}
                chaosObstacles={chaosResult?.key === chaosKey ? chaosResult.obstacles : null}
                chaosBusy={chaosResult?.key !== chaosKey}
                onChange={sim.changeParams}
                onSpeed={(v) => {
                  speedRef.current = v;
                  setSpeedChoice(v);
                  sim.setSpeed(v);
                }}
                onNewRun={newSeed}
                seedDraft={seedDraft}
                onSeedDraft={setSeedDraft}
                emptyMessage={view.error ? "Nenhuma run ativa. Escolha uma fase ao lado." : "Preparando a simulação..."}
              />
            </div>
            <div id="panel-levels" role="tabpanel" aria-labelledby="tab-levels" className={`grid gap-px bg-ground ${vis("levels")}`}>
              <LevelsPanel
                progress={progress}
                choice={active}
                customName={customLevel?.name ?? null}
                storageOk={storageOk}
                onChoose={chooseLevel}
                onUnlockAll={(v) => updateProgress(setUnlockAll(progressRef.current, v))}
                onOpenEditor={() => {
                  setEditorLevel(customLevel);
                  setScreen("editor");
                }}
              />
              <BrainShare
                payload={payload}
                decode={validator.decodeBrain}
                onImport={(p) => {
                  openImported(p);
                }}
              />
            </div>
          </div>
        </main>
      </div>

      {/* Abas do celular */}
      <nav aria-label="Seções" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <Tabs tabs={TABS} active={tab} onChange={setTab} label="Seções do laboratório" className="flex" />
      </nav>
    </Shell>
  );
}

function Scoreboard({ score, result }: { score: PlayScore | null; result: PlayResult | null }) {
  const total = score?.total ?? 0;
  return (
    <div className="grid gap-1 border border-line bg-ground p-3" aria-live="polite">
      <div className="flex items-baseline justify-between">
        <span className="label">Você</span>
        <span className="num text-xl text-ink">{score?.human ?? 0}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="label">Cérebro</span>
        <span className="num text-xl text-amber">{score?.ai ?? 0}</span>
      </div>
      <div className="flex items-baseline justify-between text-xs text-muted">
        <span>canos na fase</span>
        <span className="num">{total}</span>
      </div>
      {score?.phase === "done" && result ? (
        <p className="mt-1 text-sm">
          {result.humanFinished && result.aiFinished
            ? "Os dois completaram a fase."
            : result.humanFinished
              ? "Você completou a fase e o cérebro não."
              : result.aiFinished
                ? "O cérebro completou a fase. Você bateu."
                : result.humanPipes > result.aiPipes
                  ? "Você foi mais longe que o cérebro."
                  : result.humanPipes < result.aiPipes
                    ? "O cérebro foi mais longe."
                    : "Empate em canos."}
        </p>
      ) : null}
    </div>
  );
}

function Shell({
  children,
  status,
  onCopyRun,
  copied,
  choice,
}: {
  children: React.ReactNode;
  status: import("@/lib/sim/protocol").SimStatus | null;
  onCopyRun: () => void;
  copied: string | null;
  choice: LevelChoice;
}) {
  return (
    <div className="bench-grid min-h-dvh">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-30 focus:bg-amber focus:px-3 focus:py-2 focus:text-on-amber">
        Ir para o conteúdo
      </a>
      <header className="border-b border-line bg-ground/95">
        <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 py-3">
          <div>
            <h1 className="display text-[clamp(2rem,4.5vw,3.25rem)] text-ink">Fósforo</h1>
            <p className="-mt-0.5 text-sm text-muted">laboratório de neuroevolução (NEAT + Flappy Bird)</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-baseline gap-2" aria-label={`Seed da run: ${status?.seed ?? "carregando"}`}>
              <span className="label">Seed</span>
              <span className="num text-lg text-amber" data-testid="seed">
                {status ? status.seed : "—"}
              </span>
              {status?.edited ? <span className="label border border-amber px-1 py-0.5 text-amber">editada</span> : null}
            </div>
            <button type="button" className="btn" onClick={onCopyRun} disabled={!status || choice.kind === "custom"} title={choice.kind === "custom" ? "Fase própria: use o link da fase, no editor" : "Copia os parâmetros iniciais da run"}>
              <Icon name="link" /> Copiar link da run
            </button>
            {copied && copied.startsWith("http") ? (
              <input readOnly aria-label="Link da run (copie manualmente)" className="num min-h-9 w-64 border border-line bg-ground px-2 text-xs" value={copied} onFocus={(e) => e.currentTarget.select()} />
            ) : (
              <span role="status" aria-live="polite" className="max-w-xs text-xs text-muted">
                {copied}
              </span>
            )}
          </div>
        </div>
      </header>
      <div className="px-0 md:px-4 md:py-4">{children}</div>
      <footer className="mx-auto max-w-[1680px] px-4 py-6 text-xs text-muted max-md:pb-20">
        <p>
          NEAT implementado do zero em TypeScript, segundo Stanley e Miikkulainen (2002). A simulação roda num Worker; a mesma seed e os mesmos parâmetros dão a mesma evolução.
        </p>
      </footer>
    </div>
  );
}
