"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void): () => void {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", callback);
  return () => m.removeEventListener("change", callback);
}

/** true se o usuário pediu menos animação. No servidor (e na hidratação) vale false. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
