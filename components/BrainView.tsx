"use client";

import { useMemo } from "react";
import { SENSOR_COUNT } from "@/lib/game/world";
import { Genome, makeLayout } from "@/lib/neat/genome";
import { edgeWidth, layoutBrain } from "@/lib/ui/brainLayout";
import { COLOR } from "./draw";

const LAYOUT = makeLayout(SENSOR_COUNT, 1);
const W = 640;
const H = 360;
const PAD = { l: 96, r: 64, t: 28, b: 28 };

/**
 * A rede do melhor pássaro da geração. Entradas à esquerda, saída à direita, nós ocultos no meio.
 * Peso positivo = traço cheio âmbar; negativo = tracejado cinza-aço; espessura = intensidade.
 * Conexões novas ou alteradas em relação à geração anterior piscam uma vez (sem movimento se o
 * usuário pediu menos animação).
 */
export function BrainView({ genome, previous, generation }: { genome: Genome | null; previous: Genome | null; generation: number }) {
  const drawing = useMemo(() => (genome ? layoutBrain(genome, LAYOUT, previous) : null), [genome, previous]);

  if (!genome || !drawing) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center px-6 text-center text-sm text-muted">
        <p>Nenhuma rede ainda. Ela aparece quando a primeira geração terminar.</p>
      </div>
    );
  }

  const px = (x: number): number => PAD.l + x * (W - PAD.l - PAD.r);
  const py = (y: number): number => PAD.t + y * (H - PAD.t - PAD.b);
  const hidden = drawing.nodes.filter((n) => n.kind === "hidden").length;
  const summary = `Rede do melhor pássaro da geração ${generation}: ${SENSOR_COUNT} entradas mais bias, ${hidden} nós ocultos, ${drawing.edges.length} conexões ativas.`;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby="brain-title brain-desc">
        <title id="brain-title">Rede neural do melhor pássaro</title>
        <desc id="brain-desc">{summary}</desc>
        {drawing.edges.map((e) => {
          const positive = e.weight >= 0;
          return (
            <line
              key={`${e.key}-${generation}`}
              x1={px(e.from.x)}
              y1={py(e.from.y)}
              x2={px(e.to.x)}
              y2={py(e.to.y)}
              stroke={positive ? COLOR.amber : COLOR.steel}
              strokeWidth={edgeWidth(e.weight)}
              strokeDasharray={positive ? undefined : "6 4"}
              strokeOpacity={0.85}
              className={e.changed ? (positive ? "edge-changed-pos" : "edge-changed-neg") : undefined}
            />
          );
        })}
        {drawing.nodes.map((n) => {
          const x = px(n.x);
          const y = py(n.y);
          const s = 7;
          return (
            <g key={n.id}>
              {n.kind === "output" ? (
                <path d={`M${x} ${y - 10}L${x + 10} ${y}L${x} ${y + 10}L${x - 10} ${y}Z`} fill={COLOR.ink} stroke={COLOR.ground} strokeWidth={1.5} />
              ) : n.kind === "hidden" ? (
                <rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill={COLOR.ink} stroke={COLOR.ground} strokeWidth={1.5} />
              ) : (
                <rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill={COLOR.ground} stroke={COLOR.ink} strokeWidth={1.5} strokeDasharray={n.kind === "bias" ? "3 2" : undefined} />
              )}
              {n.kind === "input" || n.kind === "bias" ? (
                <text x={x - 14} y={y} textAnchor="end" dominantBaseline="middle" fontSize="11" fill={COLOR.muted} style={{ fontFamily: "var(--font-body-face), sans-serif" }}>
                  {n.label}
                </text>
              ) : n.kind === "output" ? (
                <text x={x + 16} y={y} dominantBaseline="middle" fontSize="11" fill={COLOR.muted} style={{ fontFamily: "var(--font-body-face), sans-serif" }}>
                  {n.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pb-3 text-xs text-muted">
        <span className="flex items-center gap-2">
          <svg width="28" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="28" y2="4" stroke={COLOR.amber} strokeWidth="2.5" />
          </svg>
          peso positivo
        </span>
        <span className="flex items-center gap-2">
          <svg width="28" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="28" y2="4" stroke={COLOR.steel} strokeWidth="2.5" strokeDasharray="6 4" />
          </svg>
          peso negativo
        </span>
        <span>espessura = intensidade</span>
        <span className="num ml-auto text-muted">
          {hidden} ocultos · {drawing.edges.length} conexões
        </span>
      </figcaption>
    </figure>
  );
}
