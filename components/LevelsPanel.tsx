"use client";

import { BUILTIN_LEVELS } from "@/lib/game/levels";
import { Progress, isCompleted, isUnlocked, lockedReason } from "@/lib/ui/progress";
import { Icon, PanelTitle } from "./ui";

export type LevelChoice = { kind: "builtin"; index: number } | { kind: "custom" } | { kind: "chaos" };

export function LevelsPanel({
  progress,
  choice,
  customName,
  onChoose,
  onUnlockAll,
  onOpenEditor,
  storageOk,
}: {
  progress: Progress;
  choice: LevelChoice;
  customName: string | null;
  onChoose: (c: LevelChoice) => void;
  onUnlockAll: (value: boolean) => void;
  onOpenEditor: () => void;
  storageOk: boolean;
}) {
  return (
    <section aria-labelledby="levels-title" className="panel">
      <PanelTitle
        right={
          <button type="button" className="btn" aria-pressed={progress.unlockAll} onClick={() => onUnlockAll(!progress.unlockAll)}>
            <Icon name="lock" size={14} />
            {progress.unlockAll ? "Bloquear de novo" : "Desbloquear tudo"}
          </button>
        }
      >
        <span id="levels-title">Fases</span>
      </PanelTitle>
      <div className="px-3 py-3">
        <ol className="m-0 grid list-none grid-cols-5 gap-px bg-line p-0 border border-line">
          {BUILTIN_LEVELS.map((level, i) => {
            const n = i + 1;
            const unlocked = isUnlocked(progress, n);
            const done = isCompleted(progress, n);
            const current = choice.kind === "builtin" && choice.index === n;
            return (
              <li key={level.id} className="bg-surface">
                <button
                  type="button"
                  aria-disabled={!unlocked}
                  aria-current={current ? "true" : undefined}
                  title={unlocked ? level.name : lockedReason(n)}
                  onClick={() => unlocked && onChoose({ kind: "builtin", index: n })}
                  className={`relative flex min-h-[72px] w-full flex-col items-center justify-center gap-0.5 px-1 py-2 ${
                    current ? "outline outline-2 -outline-offset-2 outline-amber" : ""
                  } ${unlocked ? "cursor-pointer text-ink hover:bg-raised" : "cursor-not-allowed text-faint"}`}
                >
                  <span className="num text-xl leading-none">{String(n).padStart(2, "0")}</span>
                  <span className="max-w-full truncate text-[11px] text-muted">{level.name}</span>
                  <span className="absolute right-1 top-1 text-muted" aria-hidden="true">
                    {done ? (
                      <span className="text-ok">
                        <Icon name="check" size={14} />
                      </span>
                    ) : unlocked ? null : (
                      <Icon name="lock" size={14} />
                    )}
                  </span>
                  <span className="sr-only">{done ? ", concluída" : unlocked ? "" : `, bloqueada. ${lockedReason(n)}`}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {!progress.unlockAll && BUILTIN_LEVELS.some((_, i) => !isUnlocked(progress, i + 1)) ? (
          <p className="mt-2 text-xs text-muted">Complete uma fase (com a IA ou jogando) para liberar a próxima.</p>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className={`btn justify-start ${choice.kind === "chaos" ? "border-amber" : ""}`}
            aria-pressed={choice.kind === "chaos"}
            onClick={() => onChoose({ kind: "chaos" })}
          >
            Modo caos
            <span className="text-xs font-normal text-muted">alturas sorteadas + vento</span>
          </button>
          <button type="button" className="btn justify-start" onClick={onOpenEditor}>
            Editor de fases
          </button>
        </div>
        {customName !== null ? (
          <button type="button" className={`btn mt-2 w-full justify-start ${choice.kind === "custom" ? "border-amber" : ""}`} aria-pressed={choice.kind === "custom"} onClick={() => onChoose({ kind: "custom" })}>
            Fase própria: <span className="text-ink">{customName}</span>
          </button>
        ) : null}
        {!storageOk ? <p className="mt-2 text-xs text-muted">O navegador não deixou guardar o progresso (armazenamento indisponível). Ele vale só nesta aba.</p> : null}
      </div>
    </section>
  );
}
