# Fósforo

Laboratório de neuroevolução no navegador (NEAT + Flappy Bird). Next.js App Router, TypeScript, Tailwind v4.

## Regras do projeto
- `lib/neat`, `lib/game`, `lib/sim`: TypeScript puro, sem React nem DOM. Só aritmética exata (+ − × ÷, abs, sqrt, imul, fround); nada de `Math.exp/log/pow/sin/cos/random` nem `Date.now` (o teste `tests/forbidden-ops.test.ts` falha).
- Qualquer mudança de comportamento do motor exige regravar `tests/golden.json` (`npm run golden:update`) e subir `ENGINE_VERSION` em `lib/sim/link.ts`.
- `npm test` é a suíte rápida (a cada commit). `npm run test:cov` e `npm run test:e2e` são a lenta.
- Texto da interface em português do Brasil, direto.

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.
