"use client";

import { useState } from "react";
import { GRAVITY_MAX, GRAVITY_MIN } from "@/lib/game/config";
import { SPEEDS, StartConfig } from "@/lib/sim/protocol";
import { Icon, PanelTitle, Segmented, Slider } from "./ui";

export interface ParamsPanelProps {
  params: StartConfig | null;
  speed: number;
  running: boolean;
  /** Número de canos do caos com a gravidade atual (ou null se ainda não sabemos). */
  chaosObstacles: number | null;
  chaosBusy: boolean;
  onChange: (change: Partial<Omit<StartConfig, "seed" | "level" | "mode">>) => void;
  onSpeed: (value: number) => void;
  onNewRun: (seed: number) => void;
  seedDraft: string;
  onSeedDraft: (value: string) => void;
}

/** Painel de parâmetros. Mudanças valem a partir da próxima geração; a velocidade vale na hora. */
export function ParamsPanel(props: ParamsPanelProps) {
  const { params, speed, chaosObstacles, chaosBusy } = props;
  // Cópia local para o controle responder na hora; o Worker confirma depois.
  const [seen, setSeen] = useState(params);
  const [pending, setPending] = useState<Partial<StartConfig>>({});
  if (params !== seen) {
    // O Worker confirmou (ou mudou a run): descarta o valor otimista.
    setSeen(params);
    setPending({});
  }
  const p: StartConfig | null = params ? { ...params, ...pending } : null;

  const update = (change: Partial<Omit<StartConfig, "seed" | "level" | "mode">>): void => {
    setPending((d) => ({ ...d, ...change }));
    props.onChange(change);
  };

  const seedNumber = Number(props.seedDraft);
  const seedValid = props.seedDraft.trim() !== "" && Number.isInteger(seedNumber) && seedNumber >= 0 && seedNumber <= 0xffffffff;

  return (
    <section aria-labelledby="params-title" className="panel">
      <PanelTitle>
        <span id="params-title">Parâmetros</span>
      </PanelTitle>
      <div className="grid gap-1 px-3 py-3">
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label htmlFor="seed-input" className="label">
              Seed
            </label>
            <span className="text-xs text-muted">reinicia a run</span>
          </div>
          <div className="flex gap-2">
            <input
              id="seed-input"
              className="num min-h-9 w-full min-w-0 border border-line bg-ground px-2 text-base text-ink [@media(pointer:coarse)]:min-h-11"
              inputMode="numeric"
              value={props.seedDraft}
              aria-invalid={!seedValid}
              onChange={(e) => props.onSeedDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && seedValid) props.onNewRun(seedNumber);
              }}
            />
            <button type="button" className="btn shrink-0" disabled={!seedValid} onClick={() => props.onNewRun(seedNumber)}>
              Nova run
            </button>
          </div>
        </div>

        <div className="mt-2">
          <span className="label">Velocidade da simulação</span>
          <div className="mt-1">
            <Segmented label="Velocidade da simulação" options={SPEEDS.map((s) => ({ value: s, label: `${s}x` }))} value={speed} onChange={props.onSpeed} />
          </div>
          <p className="mt-1 text-xs text-muted">A velocidade só muda o ritmo, nunca o resultado da evolução.</p>
        </div>

        {p ? (
          <>
            <Slider label="População" value={p.populationSize} min={10} max={300} step={10} onChange={(v) => update({ populationSize: v })} />
            <Slider label="Mutação de pesos" value={p.weightMutationRate} min={0} max={1} step={0.05} onChange={(v) => update({ weightMutationRate: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Novo nó" value={p.addNodeRate} min={0} max={0.5} step={0.01} onChange={(v) => update({ addNodeRate: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Nova conexão" value={p.addConnectionRate} min={0} max={0.5} step={0.01} onChange={(v) => update({ addConnectionRate: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider
              label="Gravidade"
              value={p.gravity}
              min={GRAVITY_MIN}
              max={GRAVITY_MAX}
              step={0.05}
              onChange={(v) => update({ gravity: Math.fround(v) })}
              format={(v) => v.toFixed(2)}
              hint={
                p.mode === "chaos" ? (
                  <span aria-live="polite">
                    Percurso do caos com esta gravidade:{" "}
                    <span className="num text-ink">{chaosBusy || chaosObstacles === null ? "calculando..." : `${chaosObstacles} canos`}</span>
                    {chaosObstacles !== null && !chaosBusy && chaosObstacles < 30 ? " (gravidade baixa encurta o caos: o vão fica intransponível além de certo ponto)" : ""}
                  </span>
                ) : (
                  "Se a fase ficar impossível com a gravidade escolhida, a mudança é recusada."
                )
              }
            />
          </>
        ) : (
          <p className="py-4 text-sm text-muted">Preparando a simulação...</p>
        )}
        <p className="mt-1 flex items-start gap-2 text-xs text-muted">
          <Icon name="alert" size={14} />
          <span>Mudanças de parâmetros valem a partir da próxima geração e marcam a run como editada.</span>
        </p>
      </div>
    </section>
  );
}
