"use client";

import { useEffect, useState } from "react";
import { computeGolden } from "@/lib/sim/golden";

/**
 * Autoverificação de determinismo: roda os cenários golden neste navegador e mostra os hashes.
 * O teste do Playwright compara essa saída com tests/golden.json em Chromium, Firefox e WebKit.
 */
export default function SelfTestPage() {
  const [result, setResult] = useState<Record<string, string> | null>(null);
  const [ms, setMs] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const t0 = performance.now();
      const hashes = computeGolden();
      setMs(Math.round(performance.now() - t0));
      setResult(hashes);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "monospace" }}>
      <h1>Autoverificação</h1>
      <p>{result ? `Pronto em ${ms} ms` : "Calculando..."}</p>
      <pre data-testid="hashes" data-ready={result ? "1" : "0"}>{result ? JSON.stringify(result) : ""}</pre>
    </main>
  );
}
