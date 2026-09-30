"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ARENA } from "@/lib/game/config";
import { courseOf } from "@/lib/game/course";
import { LEVEL_LIMITS, Level } from "@/lib/game/level";
import { decodeLevelJson, decodeLevelLink, encodeLevelJson, encodeLevelLink } from "@/lib/sim/levelCodec";
import {
  EditorState,
  NUDGE_STEP,
  NUDGE_STEP_FAST,
  addObstacle,
  createEditor,
  gapYRange,
  insertObstacleAt,
  moveObstacle,
  placeObstacle,
  redo,
  removeObstacle,
  replaceLevel,
  select,
  setGapHeight,
  setLength,
  setName,
  setSpeed,
  undo,
  xRange,
} from "@/lib/ui/editor";
import { fragmentKind, fragmentValue } from "@/lib/ui/runLink";
import { LEVELS_KEY, SavedLevel, deleteLevel, parseSavedLevels, saveLevel, serializeSavedLevels } from "@/lib/ui/savedLevels";
import { browserStorage, safeGet, safeSet } from "@/lib/ui/storage";
import { ViabilityReport, gapSlack } from "@/lib/ui/viability";
import { copyText } from "./BrainShare";
import { COLOR } from "./draw";
import { PlayCanvas, PlayResult, PlayScore } from "./GameView";
import { Banner, Icon, PanelTitle, Slider } from "./ui";
import { useValidator } from "./useValidator";

const VIEW_SCALE = 0.5;

interface Drag {
  index: number;
  startX: number;
  startY: number;
  base: EditorState;
}

/**
 * Editor de fases. Mostra a fase como uma régua horizontal; cada cano tem a folga do vão; o
 * validador (em Worker) diz "viável", "passa raspando" ou "impossível entre o cano N e o N+1",
 * com o trecho destacado. Não deixa treinar, salvar nem compartilhar fase inviável.
 */
export function LevelEditor({
  initial,
  gravity,
  onClose,
  onTrain,
}: {
  initial: Level | null;
  gravity: number;
  onClose: () => void;
  onTrain: (level: Level) => void;
}) {
  const [ed, setEd] = useState<EditorState>(() => createEditor(initial ?? undefined));
  const [ghost, setGhost] = useState<EditorState | null>(null);
  const [analysis, setAnalysis] = useState<{ key: string; report: ViabilityReport } | null>(null);
  const [saved, setSaved] = useState<SavedLevel[]>([]);
  const [storageOk, setStorageOk] = useState(true);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [announce, setAnnounce] = useState("");
  const [testing, setTesting] = useState(false);
  const [testRun, setTestRun] = useState(0);
  const [testScore, setTestScore] = useState<PlayScore | null>(null);
  const [testResult, setTestResult] = useState<PlayResult | null>(null);
  const [importText, setImportText] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const validator = useValidator();

  const shown = ghost ?? ed;
  const level = shown.level;
  const selected = shown.selected;

  // Fases guardadas no navegador (com try/catch: o armazenamento pode não existir).
  useEffect(() => {
    const timer = setTimeout(() => {
      const storage = browserStorage();
      setStorageOk(storage !== null);
      setSaved(parseSavedLevels(safeGet(storage, LEVELS_KEY)));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Validador ao vivo, com espera de 300 ms depois da última edição.
  const levelKey = JSON.stringify(ed.level) + "|" + gravity;
  const lastRequest = useRef(0);
  useEffect(() => {
    const timer = setTimeout(async () => {
      const mine = ++lastRequest.current;
      const result = await validator.analyze(ed.level, gravity);
      if (mine !== lastRequest.current) return;
      setAnalysis({ key: levelKey, report: result.report ?? { status: "invalid", message: result.error ?? "Não consegui validar." } });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelKey]);

  const analysing = analysis?.key !== levelKey;
  const report = analysis && !analysing ? analysis.report : null;
  const viable = report?.status === "ok";
  const course = useMemo(() => courseOf(ed.level), [ed.level]);

  const apply = useCallback((next: EditorState, speak?: string): void => {
    setEd(next);
    setGhost(null);
    if (next.notice) setMessage({ tone: "error", text: next.notice });
    else setMessage(null);
    if (speak) setAnnounce(speak);
  }, []);

  const describe = (s: EditorState): string => {
    const o = s.selected !== null ? s.level.obstacles[s.selected] : null;
    return o ? `Cano ${s.selected! + 1} de ${s.level.obstacles.length}: posição ${o.x}, altura do vão ${o.gapY}, abertura ${o.gapHeight}.` : "Nenhum cano selecionado.";
  };

  const step = (e: React.KeyboardEvent): void => {
    const fast = e.shiftKey ? NUDGE_STEP_FAST : NUDGE_STEP;
    const sel = ed.selected;
    const meta = e.ctrlKey || e.metaKey;
    if (meta && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      apply(e.shiftKey ? redo(ed) : undo(ed), "Desfeito.");
      return;
    }
    if (meta && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      apply(redo(ed), "Refeito.");
      return;
    }
    if (sel === null && !(e.key === "+" || e.key === "n")) {
      if (e.key === "PageDown" || e.key === "PageUp") apply(select(ed, 0));
      return;
    }
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        e.preventDefault();
        if (sel === null) return;
        const dx = e.key === "ArrowLeft" ? -fast : e.key === "ArrowRight" ? fast : 0;
        const dy = e.key === "ArrowUp" ? -fast : e.key === "ArrowDown" ? fast : 0;
        const next = moveObstacle(ed, sel, dx, dy);
        apply(next, describe(next));
        break;
      }
      case "PageUp":
      case "[": {
        e.preventDefault();
        const next = select(ed, Math.max(0, (sel ?? 0) - 1));
        apply(next, describe(next));
        break;
      }
      case "PageDown":
      case "]": {
        e.preventDefault();
        const next = select(ed, Math.min(ed.level.obstacles.length - 1, (sel ?? -1) + 1));
        apply(next, describe(next));
        break;
      }
      case "Delete":
      case "Backspace": {
        e.preventDefault();
        if (sel === null) return;
        const next = removeObstacle(ed, sel);
        apply(next, next.notice ?? `Cano ${sel + 1} removido.`);
        break;
      }
      case "+":
      case "n": {
        e.preventDefault();
        const next = addObstacle(ed);
        apply(next, next.notice ?? "Cano adicionado no fim.");
        break;
      }
    }
  };

  /** Coordenadas de mundo a partir do ponteiro. */
  const toWorld = (e: React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    const p = m ? pt.matrixTransform(m.inverse()) : pt;
    return { x: p.x, y: p.y };
  };

  const onPointerDownObstacle = (e: React.PointerEvent, index: number): void => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const w = toWorld(e);
    const base = select(ed, index);
    setEd(base);
    dragRef.current = { index, startX: w.x, startY: w.y, base };
    svgRef.current?.focus();
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    const d = dragRef.current;
    if (!d) return;
    const w = toWorld(e);
    setGhost(moveObstacle(d.base, d.index, w.x - d.startX, w.y - d.startY));
  };

  const endDrag = (): void => {
    if (dragRef.current && ghost) {
      apply(ghost, describe(ghost));
    }
    dragRef.current = null;
    setGhost(null);
  };

  const onBackgroundClick = (e: React.MouseEvent<SVGRectElement>): void => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return;
    const p = pt.matrixTransform(m.inverse());
    if (e.detail >= 2) apply(insertObstacleAt(ed, p.x - ARENA.pipeWidth / 2, p.y), "Cano inserido.");
    else apply(select(ed, null));
  };

  const persist = (list: SavedLevel[]): void => {
    const ok = safeSet(browserStorage(), LEVELS_KEY, serializeSavedLevels(list));
    setStorageOk(ok);
  };

  const onSave = (): void => {
    if (!viable) return;
    const r = saveLevel(saved, ed.level);
    if (!r.ok) {
      setMessage({ tone: "error", text: "Você já tem 20 fases guardadas. Apague uma para guardar outra." });
      return;
    }
    setSaved(r.list);
    persist(r.list);
    setMessage({ tone: "ok", text: `Fase "${ed.level.name}" guardada neste navegador.` });
  };

  const onExport = (): void => {
    if (!viable) return;
    const blob = new Blob([encodeLevelJson(ed.level)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fosforo-fase-${ed.level.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onCopyLink = async (): Promise<void> => {
    if (!viable) return;
    const url = `${window.location.origin}${window.location.pathname}#f=${encodeLevelLink(ed.level)}`;
    setMessage((await copyText(url)) ? { tone: "ok", text: "Link da fase copiado." } : { tone: "error", text: url });
  };

  const onImport = (text: string): void => {
    const t = text.trim();
    const hash = t.includes("#") ? t.slice(t.indexOf("#")) : t.startsWith("f=") ? `#${t}` : `#f=${t}`;
    const result = t.startsWith("{") ? decodeLevelJson(t, gravity) : fragmentKind(hash) === "level" ? decodeLevelLink(fragmentValue(hash, "f"), gravity) : decodeLevelLink("", gravity);
    if (result.ok) {
      apply(replaceLevel(ed, result.level), "Fase importada.");
      setImportText("");
      setMessage({ tone: "ok", text: "Fase importada e validada." });
    } else {
      setMessage({ tone: "error", text: result.message });
    }
  };

  const worldW = level.finishX + 160;
  const blocked = report && (report.status === "impossible" || report.status === "tight") ? report.obstacle : null;
  const blockedBand =
    blocked !== null
      ? {
          x: blocked === 0 ? 0 : level.obstacles[blocked - 1].x + ARENA.pipeWidth,
          w: (level.obstacles[blocked]?.x ?? 0) + ARENA.pipeWidth - (blocked === 0 ? 0 : level.obstacles[blocked - 1].x + ARENA.pipeWidth),
        }
      : null;
  const sel = selected !== null ? level.obstacles[selected] : null;

  return (
    <div className="grid gap-px bg-line min-[1200px]:grid-cols-[minmax(0,1fr)_340px] min-[1200px]:[&>*]:bg-surface">
      <div className="grid content-start gap-px bg-surface">
        <section className="bg-surface" aria-labelledby="editor-title">
          <PanelTitle
            right={
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn" onClick={() => apply(undo(ed), "Desfeito.")} disabled={ed.past.length === 0} aria-label="Desfazer (Ctrl+Z)">
                  <Icon name="undo" /> Desfazer
                </button>
                <button type="button" className="btn" onClick={() => apply(redo(ed), "Refeito.")} disabled={ed.future.length === 0} aria-label="Refazer (Ctrl+Y)">
                  <Icon name="redo" /> Refazer
                </button>
                <button type="button" className="btn" onClick={onClose}>
                  <Icon name="close" /> Fechar editor
                </button>
              </div>
            }
          >
            <span id="editor-title">Editor de fases</span>
          </PanelTitle>

          <div className="px-3 pt-3 text-sm text-muted">
            Arraste um cano, use as setas (Shift = passo maior), <kbd className="num">[</kbd> <kbd className="num">]</kbd> para trocar de cano, <kbd className="num">+</kbd> para adicionar, Delete para remover. Clique duas vezes na régua para inserir um cano.
          </div>

          <div className="overflow-x-auto px-3 py-3" tabIndex={-1}>
            <svg
              ref={svgRef}
              tabIndex={0}
              role="group"
              aria-label={`Régua da fase com ${level.obstacles.length} canos. ${describe(shown)}`}
              width={worldW * VIEW_SCALE}
              height={ARENA.height * VIEW_SCALE}
              viewBox={`0 0 ${worldW} ${ARENA.height}`}
              className="block border border-line bg-ground"
              onKeyDown={step}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              data-testid="editor-ruler"
            >
              <defs>
                <pattern id="ed-grid" width="80" height="80" patternUnits="userSpaceOnUse">
                  <path d="M80 0H0V80" fill="none" stroke={COLOR.grid} strokeWidth="1" />
                </pattern>
              </defs>
              <rect width={worldW} height={ARENA.height} fill="url(#ed-grid)" onClick={onBackgroundClick} />
              {blockedBand ? <rect x={blockedBand.x} y={0} width={Math.max(0, blockedBand.w)} height={ARENA.height} fill={COLOR.bad} fillOpacity={0.12} stroke={COLOR.bad} strokeDasharray="10 6" strokeWidth={2} /> : null}
              {/* Início: onde o pássaro nasce. */}
              <g aria-hidden="true">
                <path d={`M${ARENA.birdX + 17} ${ARENA.height / 2}L${ARENA.birdX - 12} ${ARENA.height / 2 - 10}L${ARENA.birdX - 4} ${ARENA.height / 2}L${ARENA.birdX - 12} ${ARENA.height / 2 + 10}Z`} fill={COLOR.ink} />
                <text x={ARENA.birdX} y={ARENA.height / 2 + 30} textAnchor="middle" fontSize="16" fill={COLOR.muted}>
                  início
                </text>
              </g>
              {level.obstacles.map((o, i) => {
                const top = o.gapY - o.gapHeight / 2;
                const bottom = o.gapY + o.gapHeight / 2;
                const isSel = i === selected;
                const slack = gapSlack(o.gapHeight, gravity);
                return (
                  <g key={i} data-testid={`obstacle-${i}`} style={{ touchAction: "none", cursor: "grab" }} onPointerDown={(e) => onPointerDownObstacle(e, i)}>
                    <rect x={o.x} y={-4} width={ARENA.pipeWidth} height={top + 4} fill={COLOR.raised} stroke={isSel ? COLOR.amber : COLOR.line} strokeWidth={isSel ? 3 : 2} />
                    <rect x={o.x} y={bottom} width={ARENA.pipeWidth} height={ARENA.height - bottom + 4} fill={COLOR.raised} stroke={isSel ? COLOR.amber : COLOR.line} strokeWidth={isSel ? 3 : 2} />
                    {isSel ? <rect x={o.x - 6} y={top} width={ARENA.pipeWidth + 12} height={o.gapHeight} fill="none" stroke={COLOR.amber} strokeWidth={3} strokeDasharray="8 5" /> : null}
                    <text x={o.x + ARENA.pipeWidth / 2} y={28} textAnchor="middle" fontSize="22" fill={isSel ? COLOR.amber : COLOR.muted} className="num">
                      {i + 1}
                    </text>
                    <text x={o.x + ARENA.pipeWidth / 2} y={o.gapY + 6} textAnchor="middle" fontSize="18" fill={slack < 0 ? COLOR.bad : COLOR.ink} className="num">
                      {`folga ${slack}`}
                    </text>
                  </g>
                );
              })}
              <g aria-hidden="true">
                <line x1={level.finishX} x2={level.finishX} y1={0} y2={ARENA.height} stroke={COLOR.amber} strokeWidth={3} strokeDasharray="12 8" />
                <text x={level.finishX + 8} y={28} fontSize="18" fill={COLOR.amber}>
                  CHEGADA
                </text>
              </g>
            </svg>
            <p className="sr-only" role="status" aria-live="polite">
              {announce}
            </p>
          </div>

          <div className="grid gap-2 px-3 pb-3">
            <div aria-live="polite">
              {analysing || !report ? (
                <p className="text-sm text-muted">Validando a fase...</p>
              ) : report.status === "ok" ? (
                <p className="flex items-center gap-2 text-sm text-ok">
                  <Icon name="check" /> {report.message} Dá para passar de cada vão ao seguinte.
                </p>
              ) : (
                <Banner tone={report.status === "tight" ? "warning" : "error"} role="alert">
                  {report.message}
                </Banner>
              )}
            </div>
            <p className="text-xs text-muted">
              <strong className="text-ink">Folga</strong> é o espaço vertical que sobra no vão depois de descontar o corpo do pássaro e a amplitude de um pulo; negativa = só dá para atravessar direto, sem pairar. O validador exige uma folga mínima de 2 unidades no caminho inteiro.
            </p>
            {message ? (
              <p role="status" className={`text-sm ${message.tone === "error" ? "text-bad" : "text-ok"}`}>
                {message.text}
              </p>
            ) : null}
          </div>
        </section>

        {testing ? (
          <section className="border-t border-line bg-surface" aria-labelledby="test-title">
            <PanelTitle
              right={
                <div className="flex gap-2">
                  <button type="button" className="btn" onClick={() => setTestRun((n) => n + 1)}>
                    Jogar de novo
                  </button>
                  <button type="button" className="btn" onClick={() => setTesting(false)}>
                    <Icon name="close" /> Fechar teste
                  </button>
                </div>
              }
            >
              <span id="test-title">Teste: jogue esta fase</span>
            </PanelTitle>
            <div className="grid gap-2 px-3 py-3">
              <PlayCanvas
                course={course}
                gravity={gravity}
                genome={null}
                runId={testRun}
                onScore={setTestScore}
                onResult={setTestResult}
                label="Teste da fase: você controla o pássaro branco com Espaço, clique ou toque."
              />
              <p className="num text-center text-sm" aria-live="polite">
                Canos: {testScore?.human ?? 0} / {level.obstacles.length}
                {testScore?.phase === "done" ? (testResult?.humanFinished ? " · Você completou a fase!" : " · Bateu. Tente de novo.") : ""}
              </p>
            </div>
          </section>
        ) : null}
      </div>

      <aside className="grid content-start gap-px bg-line" aria-label="Propriedades da fase">
        <section className="bg-surface" aria-labelledby="props-title">
          <PanelTitle>
            <span id="props-title">Fase</span>
          </PanelTitle>
          <div className="grid gap-1 px-3 py-3">
            <label htmlFor="level-name" className="label">
              Nome
            </label>
            <input
              id="level-name"
              className="min-h-9 w-full border border-line bg-ground px-2 text-ink [@media(pointer:coarse)]:min-h-11"
              value={ed.level.name}
              maxLength={LEVEL_LIMITS.maxNameLength}
              onChange={(e) => apply(setName(ed, e.target.value))}
            />
            <Slider label="Velocidade" value={level.speed} min={1} max={8} step={0.1} onChange={(v) => apply(setSpeed(ed, v))} format={(v) => v.toFixed(1)} />
            <Slider label="Comprimento" value={level.finishX} min={level.obstacles[level.obstacles.length - 1].x + ARENA.pipeWidth + LEVEL_LIMITS.minFinishRoom} max={8000} step={20} onChange={(v) => apply(setLength(ed, v))} format={(v) => String(v)} />
            <p className="num text-xs text-muted">{level.obstacles.length} de {LEVEL_LIMITS.maxObstacles} canos</p>
          </div>
        </section>

        <section className="bg-surface" aria-labelledby="sel-title">
          <PanelTitle>
            <span id="sel-title">{selected !== null ? `Cano ${selected + 1}` : "Nenhum cano selecionado"}</span>
          </PanelTitle>
          <div className="grid gap-1 px-3 py-3">
            {sel && selected !== null ? (
              <>
                <Slider label="Abertura do vão" value={sel.gapHeight} min={LEVEL_LIMITS.minGap} max={LEVEL_LIMITS.maxGap} step={2} onChange={(v) => apply(setGapHeight(ed, selected, v))} />
                <NumberField key={`x-${selected}-${sel.x}`} label="Posição" value={sel.x} min={xRange(level, selected).min} max={xRange(level, selected).max} onCommit={(v) => apply(placeObstacle(ed, selected, v, sel.gapY))} />
                <NumberField key={`y-${selected}-${sel.gapY}`} label="Altura do vão" value={sel.gapY} min={gapYRange(sel.gapHeight).min} max={gapYRange(sel.gapHeight).max} onCommit={(v) => apply(placeObstacle(ed, selected, sel.x, v))} />
                <p className="num text-xs text-muted">folga {gapSlack(sel.gapHeight, gravity)}</p>
              </>
            ) : (
              <p className="text-sm text-muted">Clique num cano da régua para editar.</p>
            )}
            <div className="mt-1 flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={() => apply(addObstacle(ed), "Cano adicionado no fim.")}>
                <Icon name="plus" /> Adicionar
              </button>
              <button type="button" className="btn" disabled={selected === null} onClick={() => selected !== null && apply(removeObstacle(ed, selected), `Cano ${selected + 1} removido.`)}>
                <Icon name="trash" /> Remover
              </button>
            </div>
          </div>
        </section>

        <section className="bg-surface" aria-labelledby="act-title">
          <PanelTitle>
            <span id="act-title">Usar a fase</span>
          </PanelTitle>
          <div className="grid gap-2 px-3 py-3">
            <button type="button" className="btn" onClick={() => setTesting((t) => !t)}>
              <Icon name="play" /> {testing ? "Fechar teste" : "Testar jogando"}
            </button>
            <button type="button" className="btn btn-primary" aria-disabled={!viable} disabled={!viable} onClick={() => viable && onTrain(ed.level)}>
              <Icon name="flag" /> Treinar a IA nesta fase
            </button>
            {!viable ? <p className="text-xs text-muted">Treinar, guardar e compartilhar ficam liberados quando a fase for viável.</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" disabled={!viable} onClick={onSave}>
                Guardar
              </button>
              <button type="button" className="btn" disabled={!viable} onClick={onExport}>
                <Icon name="download" /> JSON
              </button>
              <button type="button" className="btn" disabled={!viable} onClick={onCopyLink}>
                <Icon name="link" /> Link
              </button>
            </div>
            <div>
              <label htmlFor="level-import" className="label">
                Importar link ou JSON
              </label>
              <textarea id="level-import" className="num mt-1 min-h-14 w-full resize-y border border-line bg-ground p-2 text-xs" value={importText} spellCheck={false} placeholder="Cole aqui o link (#f=...) ou o JSON" onChange={(e) => setImportText(e.target.value)} />
              <button type="button" className="btn mt-1" disabled={importText.trim() === ""} onClick={() => onImport(importText)}>
                <Icon name="upload" /> Carregar fase
              </button>
            </div>
          </div>
        </section>

        <section className="bg-surface" aria-labelledby="saved-title">
          <PanelTitle>
            <span id="saved-title">Guardadas neste navegador</span>
          </PanelTitle>
          <div className="px-3 py-3">
            {!storageOk ? <p className="mb-2 text-xs text-muted">O navegador não deixou guardar (armazenamento indisponível). Use Exportar para não perder a fase.</p> : null}
            {saved.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma fase guardada ainda.</p>
            ) : (
              <ul className="m-0 grid list-none gap-1 p-0">
                {saved.map((s) => (
                  <li key={s.name} className="flex items-center gap-2">
                    <button type="button" className="btn min-w-0 flex-1 justify-start" onClick={() => apply(replaceLevel(ed, s.level), `Fase ${s.name} aberta.`)}>
                      <span className="truncate">{s.name}</span>
                      <span className="num text-xs font-normal text-muted">{s.level.obstacles.length} canos</span>
                    </button>
                    <button
                      type="button"
                      className="btn"
                      aria-label={`Apagar a fase ${s.name}`}
                      onClick={() => {
                        const next = deleteLevel(saved, s.name);
                        setSaved(next);
                        persist(next);
                      }}
                    >
                      <Icon name="trash" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function NumberField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const id = `nf-${label.replace(/\s+/g, "-")}`;
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        className="num min-h-9 w-24 border border-line bg-ground px-2 text-right text-ink [@media(pointer:coarse)]:min-h-11"
        inputMode="numeric"
        value={text}
        aria-describedby={`${id}-range`}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={() => {
          const n = Number(text);
          if (Number.isFinite(n) && text !== "") onCommit(Math.min(max, Math.max(min, n)));
          else setText(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <span id={`${id}-range`} className="sr-only">
        de {min} a {max}
      </span>
    </div>
  );
}
