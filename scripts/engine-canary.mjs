// Mede se as funções de Math dão bits idênticos em Node, Chromium, Firefox e WebKit.
// Uso: node scripts/engine-canary.mjs (precisa de `npx playwright install`).
import { chromium, firefox, webkit } from "@playwright/test";
const code = () => {
  const fns = { exp: Math.exp, tanh: Math.tanh, pow: (x) => Math.pow(x, 1.7), sin: Math.sin, cos: Math.cos, log: (x) => Math.log(x + 2), atan: Math.atan, cbrt: Math.cbrt };
  const out = {};
  for (const [name, f] of Object.entries(fns)) {
    let h = 0;
    for (let i = -20000; i <= 20000; i++) {
      const v = f(i / 977);
      const buf = new Float64Array([v]); const u = new Uint32Array(buf.buffer);
      h = (Math.imul(h ^ u[0], 16777619) ^ Math.imul(h ^ u[1], 2246822519)) | 0;
    }
    out[name] = (h >>> 0).toString(16);
  }
  return out;
};
const res = {};
for (const [n, b] of Object.entries({ node: null, chromium, firefox, webkit })) {
  if (!b) { res[n] = code(); continue; }
  const br = await b.launch(); const pg = await br.newPage();
  res[n] = await pg.evaluate(code); await br.close();
}
const names = Object.keys(res.node);
for (const f of names) console.log(f.padEnd(6), Object.entries(res).map(([k, v]) => `${k}:${v[f]}`).join("  "), new Set(Object.values(res).map(v => v[f])).size > 1 ? "  <-- DIVERGE" : "");
