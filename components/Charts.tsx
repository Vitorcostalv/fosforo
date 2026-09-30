"use client";

import { useEffect, useRef } from "react";
import type { GenerationStats } from "@/lib/sim/run";
import { COLOR, Series, drawChart, fitCanvas } from "./draw";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

function ChartCanvas({ series, label, integerAxis, reduced, generation }: { series: Series[]; label: string; integerAxis?: boolean; reduced: boolean; generation: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const seriesRef = useRef(series);

  useEffect(() => {
    seriesRef.current = series;
  }, [series]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    const start = performance.now();
    const render = (glow: number): void => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const size = fitCanvas(canvas);
      drawChart(ctx, size, seriesRef.current, glow, integerAxis);
    };
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / 1200);
      render(reduced ? 0 : 1 - t);
      if (t < 1 && !reduced) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onResize = (): void => render(0);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [generation, reduced, integerAxis]);

  return <canvas ref={ref} className="block h-[150px] w-full" role="img" aria-label={label} />;
}

/** Gráficos por geração: fitness máximo e médio, e número de espécies. */
export function Charts({ history }: { history: GenerationStats[] }) {
  const reduced = usePrefersReducedMotion();
  const generation = history.length;
  const fitness: Series[] = [
    { values: history.map((h) => h.maxFitness), color: COLOR.amber, label: "máximo", width: 2 },
    { values: history.map((h) => h.meanFitness), color: COLOR.ink, label: "médio", width: 1.2 },
  ];
  const species: Series[] = [{ values: history.map((h) => h.speciesCount), color: COLOR.steel, label: "espécies", width: 1.6, steps: true }];
  const last = history[history.length - 1];

  return (
    <div className="grid gap-0">
      <section aria-labelledby="chart-fitness" className="border-b border-line">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2">
          <h3 id="chart-fitness" className="label">
            Fitness por geração
          </h3>
          <span className="flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <svg width="16" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="16" y2="3" stroke={COLOR.amber} strokeWidth="2.5" />
              </svg>
              máximo <span className="num text-amber">{last ? last.maxFitness.toFixed(1) : "—"}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="16" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="16" y2="3" stroke={COLOR.ink} strokeWidth="1.5" />
              </svg>
              médio <span className="num text-ink">{last ? last.meanFitness.toFixed(1) : "—"}</span>
            </span>
          </span>
        </div>
        {history.length === 0 ? (
          <p className="flex h-[150px] items-center justify-center px-6 text-center text-sm text-muted">Nenhuma geração ainda. Aperte Iniciar.</p>
        ) : (
          <ChartCanvas series={fitness} label={`Fitness máximo e médio por geração. Última geração: máximo ${last.maxFitness.toFixed(1)}, médio ${last.meanFitness.toFixed(1)}.`} reduced={reduced} generation={generation} />
        )}
      </section>
      <section aria-labelledby="chart-species">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2">
          <h3 id="chart-species" className="label">
            Espécies
          </h3>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <svg width="16" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="16" y2="3" stroke={COLOR.steel} strokeWidth="2" />
            </svg>
            agora <span className="num text-ink">{last ? last.speciesCount : "—"}</span>
          </span>
        </div>
        {history.length === 0 ? (
          <p className="flex h-[150px] items-center justify-center px-6 text-center text-sm text-muted">A especiação aparece aqui.</p>
        ) : (
          <ChartCanvas series={species} label={`Número de espécies por geração. Agora: ${last.speciesCount}.`} integerAxis reduced={reduced} generation={generation} />
        )}
      </section>
    </div>
  );
}
