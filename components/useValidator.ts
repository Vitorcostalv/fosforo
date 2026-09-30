"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Level } from "@/lib/game/level";
import type { FromValidator, ToValidator } from "@/lib/sim/protocol";
import type { ViabilityReport } from "@/lib/ui/viability";

type Pending = { resolve: (value: FromValidator) => void };
const FAIL = { ok: false as const, code: "formato-invalido" as const, message: "O validador não respondeu. Tente de novo." };
type AskMessage =
  | { kind: "analyze"; level: Level; gravity: number }
  | { kind: "chaos-preview"; seed: number; gravity: number }
  | { kind: "decode-brain"; format: "link" | "json"; text: string }
  | { kind: "decode-level"; format: "link" | "json"; text: string; gravity: number };

/**
 * Worker do validador: o editor pergunta "essa fase é viável?" e o caos pergunta "quantos canos
 * cabem com esta gravidade?" sem travar a interface. Respostas antigas são responsabilidade do
 * chamador (compare o `id` devolvido com o último pedido).
 */
export function useValidator() {
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const counter = useRef(0);

  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../workers/validate.worker.ts", import.meta.url), { type: "module" });
    } catch {
      return;
    }
    workerRef.current = worker;
    const waiting = pending.current;
    worker.onmessage = (event: MessageEvent<FromValidator>) => {
      const entry = waiting.get(event.data.id);
      if (entry) {
        waiting.delete(event.data.id);
        entry.resolve(event.data);
      }
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
      waiting.clear();
    };
  }, []);

  const ask = useCallback((message: AskMessage): { id: number; result: Promise<FromValidator> } => {
    const id = ++counter.current;
    const result = new Promise<FromValidator>((resolve) => {
      if (!workerRef.current) {
        resolve({ id, kind: "error", message: "O validador não está disponível neste navegador." });
        return;
      }
      pending.current.set(id, { resolve });
      workerRef.current.postMessage({ ...message, id } as ToValidator);
    });
    return { id, result };
  }, []);

  const analyze = useCallback(
    async (level: Level, gravity: number): Promise<{ id: number; report: ViabilityReport | null; error?: string }> => {
      const { id, result } = ask({ kind: "analyze", level, gravity });
      const r = await result;
      if (r.kind === "analyze") return { id, report: r.report };
      return { id, report: null, error: r.kind === "error" ? r.message : "resposta inesperada" };
    },
    [ask],
  );

  const chaosPreview = useCallback(
    async (seed: number, gravity: number): Promise<{ id: number; obstacles: number | null }> => {
      const { id, result } = ask({ kind: "chaos-preview", seed, gravity });
      const r = await result;
      return { id, obstacles: r.kind === "chaos-preview" ? r.obstacles : null };
    },
    [ask],
  );


  /** Decodifica e valida (inclusive viabilidade) um cérebro colado, aberto de arquivo ou vindo da URL. */
  const decodeBrain = useCallback(
    async (format: "link" | "json", text: string): Promise<import("@/lib/sim/link").DecodeResult> => {
      const { result } = ask({ kind: "decode-brain", format, text });
      const r = await result;
      return r.kind === "decode-brain" ? r.result : FAIL;
    },
    [ask],
  );

  const decodeLevel = useCallback(
    async (format: "link" | "json", text: string, gravity: number): Promise<import("@/lib/sim/levelCodec").LevelDecodeResult> => {
      const { result } = ask({ kind: "decode-level", format, text, gravity });
      const r = await result;
      return r.kind === "decode-level" ? r.result : { ok: false, code: "formato-invalido", message: FAIL.message };
    },
    [ask],
  );

  return { analyze, chaosPreview, decodeBrain, decodeLevel, latestId: () => counter.current };
}
