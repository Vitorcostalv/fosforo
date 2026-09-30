"use client";

import { ReactNode, useId, useRef } from "react";

/* ---------- Ícones em traço (sem emojis) ---------- */

type IconName = "lock" | "alert" | "check" | "undo" | "redo" | "play" | "pause" | "step" | "link" | "download" | "upload" | "plus" | "trash" | "flag" | "close" | "copy";

const PATHS: Record<IconName, ReactNode> = {
  lock: (
    <>
      <rect x="4" y="9" width="12" height="8" />
      <path d="M7 9V6a3 3 0 0 1 6 0v3" />
    </>
  ),
  alert: (
    <>
      <path d="M10 3 18 17H2Z" />
      <path d="M10 8v4M10 14.5v.5" />
    </>
  ),
  check: <path d="m4 10.5 4 4 8-9" />,
  undo: (
    <>
      <path d="M8 5 4 9l4 4" />
      <path d="M4 9h8a4 4 0 0 1 0 8H8" />
    </>
  ),
  redo: (
    <>
      <path d="m12 5 4 4-4 4" />
      <path d="M16 9H8a4 4 0 0 0 0 8h4" />
    </>
  ),
  play: <path d="M6 4v12l10-6Z" />,
  pause: (
    <>
      <path d="M6 4v12M14 4v12" />
    </>
  ),
  step: (
    <>
      <path d="M4 4v12l8-6Z" />
      <path d="M15 4v12" />
    </>
  ),
  link: (
    <>
      <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1" />
      <path d="M11.5 8.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" />
    </>
  ),
  download: (
    <>
      <path d="M10 3v10M6 9l4 4 4-4" />
      <path d="M3 16h14" />
    </>
  ),
  upload: (
    <>
      <path d="M10 13V3M6 7l4-4 4 4" />
      <path d="M3 16h14" />
    </>
  ),
  plus: <path d="M10 4v12M4 10h12" />,
  trash: (
    <>
      <path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" />
    </>
  ),
  flag: (
    <>
      <path d="M5 17V3" />
      <path d="M5 4h10l-2 3 2 3H5" />
    </>
  ),
  close: <path d="m5 5 10 10M15 5 5 15" />,
  copy: (
    <>
      <rect x="7" y="7" width="10" height="10" />
      <path d="M13 7V3H3v10h4" />
    </>
  ),
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

/* ---------- Leitura de instrumento ---------- */

export function Readout({ label, value, accent, title, testId }: { label: string; value: ReactNode; accent?: boolean; title?: string; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3" title={title}>
      <span className="label">{label}</span>
      <span data-testid={testId} className={`num text-base ${accent ? "text-amber" : "text-ink"}`}>{value}</span>
    </div>
  );
}

/* ---------- Controle deslizante com régua ---------- */

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  disabled?: boolean;
  hint?: ReactNode;
}

export function Slider({ label, value, min, max, step, onChange, format, disabled, hint }: SliderProps) {
  const id = useId();
  const shown = format ? format(value) : String(value);
  const ticks = Math.min(20, Math.max(2, Math.round((max - min) / step)));
  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="label">
          {label}
        </label>
        <output htmlFor={id} className="num text-base text-ink">
          {shown}
        </output>
      </div>
      <input
        id={id}
        className="ruler"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={shown}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div aria-hidden="true" className="-mt-2 flex justify-between px-[5px]">
        {Array.from({ length: ticks + 1 }, (_, i) => (
          <span key={i} className="h-[5px] w-px bg-faint" />
        ))}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

/* ---------- Segmentado (radiogroup com setas) ---------- */

export interface Option<T extends string | number> {
  value: T;
  label: string;
  title?: string;
  disabled?: boolean;
}

export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (from: number, delta: number): void => {
    for (let step = 1; step <= options.length; step++) {
      const j = (from + delta * step + options.length * step) % options.length;
      if (!options[j].disabled) {
        onChange(options[j].value);
        refs.current[j]?.focus();
        return;
      }
    }
  };
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex border border-line">
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={`num min-h-9 min-w-10 px-2.5 text-sm ${i > 0 ? "border-l border-line" : ""} ${
              active ? "border-b-2 border-b-amber bg-raised text-ink" : "text-muted hover:text-ink"
            } ${o.disabled ? "cursor-not-allowed text-faint" : "cursor-pointer"} [@media(pointer:coarse)]:min-h-11`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Abas ---------- */

export interface TabDef {
  id: string;
  label: string;
}

export function Tabs({ tabs, active, onChange, label, className = "" }: { tabs: TabDef[]; active: string; onChange: (id: string) => void; label: string; className?: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <div role="tablist" aria-label={label} className={className}>
      {tabs.map((t, i) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (delta !== 0) {
                e.preventDefault();
                const j = (i + delta + tabs.length) % tabs.length;
                onChange(tabs[j].id);
                refs.current[j]?.focus();
              }
            }}
            className={`label flex min-h-11 flex-1 items-center justify-center border-b-2 px-2 ${
              selected ? "border-amber text-ink" : "border-transparent text-muted hover:text-ink"
            } cursor-pointer`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Avisos ---------- */

export function Banner({
  tone,
  children,
  action,
  onDismiss,
  role = "status",
}: {
  tone: "warning" | "error" | "info";
  children: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  role?: "status" | "alert";
}) {
  const border = tone === "error" ? "border-l-bad" : tone === "warning" ? "border-l-amber" : "border-l-steel";
  const color = tone === "error" ? "text-bad" : tone === "warning" ? "text-amber" : "text-steel";
  return (
    <div role={role} className={`flex flex-wrap items-center gap-3 border border-line border-l-[3px] ${border} bg-raised px-3 py-2`}>
      <span className={color}>
        <Icon name="alert" />
      </span>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
      {action}
      {onDismiss ? (
        <button type="button" className="btn" aria-label="Dispensar aviso" onClick={onDismiss}>
          <Icon name="close" />
        </button>
      ) : null}
    </div>
  );
}

export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
      <h2 className="label">{children}</h2>
      {right}
    </div>
  );
}
