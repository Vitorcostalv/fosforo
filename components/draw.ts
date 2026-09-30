import { ARENA } from "@/lib/game/config";
import type { Level } from "@/lib/game/level";

/** Cores do DESIGN.md (o canvas não lê variáveis CSS). */
export const COLOR = {
  ground: "#141416",
  surface: "#1b1b1e",
  raised: "#222226",
  grid: "#2b2b30",
  line: "#37373d",
  ink: "#ece6d8",
  muted: "#a8a397",
  faint: "#7d7a71",
  amber: "#d9a23c",
  amberDim: "#8a6a2c",
  steel: "#93a1aa",
  ok: "#86ad8f",
  bad: "#d8705f",
} as const;

export type BirdRole = "pop" | "leader" | "human" | "ai";

export interface SceneBird {
  y: number;
  vy: number;
  /** 0 morto, 1 vivo, 2 completou a fase. */
  state: 0 | 1 | 2;
  role: BirdRole;
}

export interface SceneView {
  level: Level;
  scroll: number;
  birds: SceneBird[];
  /** Mostra a linha de chegada. */
  finish?: boolean;
}

let fontCache: { body: string; mono: string } | null = null;

/** Famílias reais do next/font (o canvas não resolve `var(--x)` dentro de `ctx.font`). */
export function fonts(): { body: string; mono: string } {
  if (!fontCache) {
    const style = getComputedStyle(document.documentElement);
    const body = style.getPropertyValue("--font-body-face").trim();
    const mono = style.getPropertyValue("--font-mono-face").trim();
    fontCache = { body: `${body || "system-ui"}, sans-serif`, mono: `${mono || "ui-monospace"}, monospace` };
  }
  return fontCache;
}

/** Ajusta o canvas ao tamanho CSS e à densidade de pixels. Retorna o tamanho lógico em px de tela. */
export function fitCanvas(canvas: HTMLCanvasElement): { w: number; h: number } {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

/** Desenha o pássaro: cunha com bico e um traço de asa. Forma simples, inclinada pela velocidade. */
export function drawBird(ctx: CanvasRenderingContext2D, x: number, y: number, vy: number, role: BirdRole, state: 0 | 1 | 2): void {
  const h = ARENA.birdHalf;
  const angle = Math.max(-0.5, Math.min(0.9, vy / 12));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(h + 5, 0);
  ctx.lineTo(-h, -h * 0.85);
  ctx.lineTo(-h * 0.35, 0);
  ctx.lineTo(-h, h * 0.85);
  ctx.closePath();
  if (role === "pop") {
    ctx.strokeStyle = state === 0 ? COLOR.faint : COLOR.muted;
    ctx.globalAlpha = state === 0 ? 0.25 : 0.55;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else {
    const color = role === "leader" || role === "ai" ? COLOR.amber : COLOR.ink;
    ctx.fillStyle = color;
    ctx.strokeStyle = COLOR.ground;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    // Asa: um traço que sai do meio do corpo.
    ctx.beginPath();
    ctx.moveTo(-h * 0.5, 0);
    ctx.lineTo(-h * 1.05, h * 0.2);
    ctx.strokeStyle = COLOR.ground;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

function drawPipe(ctx: CanvasRenderingContext2D, x: number, gapTop: number, gapBottom: number): void {
  const w = ARENA.pipeWidth;
  ctx.fillStyle = COLOR.raised;
  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 1.5;
  ctx.fillRect(x, -4, w, gapTop + 4);
  ctx.strokeRect(x, -4, w, gapTop + 4);
  ctx.fillRect(x, gapBottom, w, ARENA.height - gapBottom + 4);
  ctx.strokeRect(x, gapBottom, w, ARENA.height - gapBottom + 4);
  // Marcas de régua nas bordas do vão (o que o pássaro precisa medir).
  ctx.strokeStyle = COLOR.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let tx = x + 4; tx < x + w; tx += 8) {
    ctx.moveTo(tx, gapTop);
    ctx.lineTo(tx, gapTop - 5);
    ctx.moveTo(tx, gapBottom);
    ctx.lineTo(tx, gapBottom + 5);
  }
  ctx.stroke();
}

/** Cena inteira: grade, canos, chegada e pássaros, em coordenadas de mundo escaladas ao canvas. */
export function drawScene(ctx: CanvasRenderingContext2D, size: { w: number; h: number }, view: SceneView): void {
  const scale = Math.min(size.w / ARENA.width, size.h / ARENA.height);
  const ox = (size.w - ARENA.width * scale) / 2;
  const oy = (size.h - ARENA.height * scale) / 2;

  ctx.save();
  ctx.fillStyle = COLOR.ground;
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, 0, ARENA.width, ARENA.height);
  ctx.clip();

  // Grade que rola com o cenário.
  ctx.strokeStyle = COLOR.grid;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  const offset = -(view.scroll % 40);
  for (let x = offset; x <= ARENA.width; x += 40) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ARENA.height);
  }
  for (let y = 40; y < ARENA.height; y += 40) {
    ctx.moveTo(0, y);
    ctx.lineTo(ARENA.width, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  for (const o of view.level.obstacles) {
    const x = o.x - view.scroll;
    if (x > ARENA.width + 10 || x + ARENA.pipeWidth < -10) continue;
    drawPipe(ctx, x, o.gapY - o.gapHeight / 2, o.gapY + o.gapHeight / 2);
  }

  if (view.finish !== false) {
    const fx = view.level.finishX - view.scroll;
    if (fx > -10 && fx < ARENA.width + 10) {
      ctx.strokeStyle = COLOR.amber;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(fx, 0);
      ctx.lineTo(fx, ARENA.height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLOR.amber;
      ctx.font = `600 11px ${fonts().body}`;
      ctx.fillText("CHEGADA", Math.min(fx + 6, ARENA.width - 60), 18);
    }
  }

  // Teto e chão.
  ctx.strokeStyle = COLOR.muted;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.lineTo(ARENA.width, 1);
  ctx.moveTo(0, ARENA.height - 1);
  ctx.lineTo(ARENA.width, ARENA.height - 1);
  ctx.stroke();

  // Pássaros: população primeiro, líder e jogadores por cima.
  const order = { pop: 0, ai: 1, leader: 2, human: 3 } as const;
  for (const b of [...view.birds].sort((a, b) => order[a.role] - order[b.role])) {
    if (b.state === 0 && b.role === "pop") continue;
    drawBird(ctx, ARENA.birdX, b.y, b.vy, b.role, b.state);
  }
  ctx.restore();
}

// ---------- Gráficos ----------

export interface Series {
  values: number[];
  color: string;
  label: string;
  width?: number;
  dash?: number[];
  /** Desenha em degraus (para contagens, como espécies). */
  steps?: boolean;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/**
 * Gráfico de linhas com grade fina. O ponto mais novo da primeira série acende (persistência de
 * fósforo) conforme `glow` (0 a 1); `glow = 0` desliga (prefers-reduced-motion).
 */
export function drawChart(ctx: CanvasRenderingContext2D, size: { w: number; h: number }, series: Series[], glow: number, integerAxis = false): void {
  const pad = { l: 44, r: 10, t: 10, b: 22 };
  const w = size.w - pad.l - pad.r;
  const h = size.h - pad.t - pad.b;
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.fillStyle = COLOR.surface;
  ctx.fillRect(0, 0, size.w, size.h);

  const n = Math.max(0, ...series.map((s) => s.values.length));
  const maxRaw = Math.max(0, ...series.flatMap((s) => s.values));
  const max = integerAxis ? Math.max(4, Math.ceil(maxRaw)) : niceMax(maxRaw);

  ctx.font = `10px ${fonts().mono}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (h * i) / 4;
    ctx.strokeStyle = COLOR.grid;
    ctx.beginPath();
    ctx.moveTo(pad.l, y + 0.5);
    ctx.lineTo(pad.l + w, y + 0.5);
    ctx.stroke();
    const v = max * (1 - i / 4);
    ctx.fillStyle = COLOR.muted;
    ctx.fillText(integerAxis ? String(Math.round(v)) : v >= 100 ? v.toFixed(0) : v.toFixed(1), pad.l - 6, y);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const xTicks = Math.min(6, Math.max(1, n - 1));
  for (let i = 0; i <= xTicks && n > 1; i++) {
    const gen = Math.round(((n - 1) * i) / xTicks);
    const x = pad.l + (w * gen) / (n - 1);
    ctx.fillStyle = COLOR.muted;
    ctx.fillText(String(gen), x, pad.t + h + 6);
    ctx.strokeStyle = COLOR.grid;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, pad.t + h);
    ctx.lineTo(x + 0.5, pad.t + h + 3);
    ctx.stroke();
  }

  const px = (i: number): number => pad.l + (n <= 1 ? 0 : (w * i) / (n - 1));
  const py = (v: number): number => pad.t + h * (1 - Math.min(1, v / max));

  series.forEach((s, si) => {
    if (s.values.length === 0) return;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width ?? 1.6;
    ctx.setLineDash(s.dash ?? []);
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = px(i);
      const y = py(v);
      if (i === 0) ctx.moveTo(x, y);
      else if (s.steps) {
        ctx.lineTo(x, py(s.values[i - 1]));
        ctx.lineTo(x, y);
      } else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    if (si === 0) {
      const i = s.values.length - 1;
      const x = px(i);
      const y = py(s.values[i]);
      if (glow > 0) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
        g.addColorStop(0, `rgba(217,162,60,${0.55 * glow})`);
        g.addColorStop(1, "rgba(217,162,60,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 12, y - 12, 24, 24);
      }
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}
