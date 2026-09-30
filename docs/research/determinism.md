# Determinismo entre navegadores: medido, não suposto

## Pergunta

"Mesma seed e mesmos parâmetros geram exatamente a mesma evolução" vale em qualquer navegador?

## Medição (2026-09-30, `scripts/engine-canary.mjs`)

Hash dos bits de 40 001 chamadas por função, em Node 24, Chromium, Firefox e WebKit (builds do Playwright, Windows):

| Função | Resultado |
|---|---|
| `Math.exp` | **diverge** (Node = Firefox ≠ Chromium = WebKit) |
| `Math.log` | **diverge** (mesmo agrupamento) |
| `Math.cbrt` | **diverge** (os quatro diferem entre si, exceto Node = Firefox) |
| `Math.tanh`, `pow`, `sin`, `cos`, `atan` | iguais nesta amostra |

Iguais nesta amostra não significa garantidos: a especificação do ECMAScript deixa essas funções dependentes da implementação. Só `+ − × ÷`, `Math.abs`, `sqrt`, `floor`, `fround` e `Math.imul` têm resultado exato definido.

## Consequência para o motor

- A sigmoide do artigo (`1 / (1 + e^(-4,9x))`, p. 112) usa `exp`, que diverge. Trocada por **softsign**, `x / (1 + |x|)`. É uma **escolha minha**: muda a forma da curva (satura mais devagar) mas não o algoritmo NEAT.
- Nada de `Math.pow`, `**`, `sin`, `cos`, `log`, `exp`, `tanh`, `cbrt`, `hypot`, `random`, `Date.now` em `lib/`. O teste `tests/forbidden-ops.test.ts` varre o código e falha se aparecer.
- Sem Box-Muller (usa `log` e `cos`): pesos iniciais e perturbações são uniformes, como o artigo descreve ("uniformly perturbed", p. 111).
- Pesos arredondados para float32 (`Math.fround`, exato) no momento em que nascem. Assim exportar e importar devolve o genoma idêntico.

## Prova (golden + Playwright)

1. `tests/golden.json` guarda o hash de duas runs completas (normal e caos, 25 gerações, população 60). O teste `tests/run.test.ts` recalcula no Node e compara.
2. `e2e/determinism.spec.ts` abre `/selftest` em **Chromium, Firefox e WebKit**, roda os mesmos cenários dentro do navegador e compara com o mesmo `golden.json`.

Resultado da execução em 2026-09-30: os três navegadores reproduziram exatamente os hashes do Node.

```
[webkit]   {"normal":"f258433dc0c01497","caos":"19a79a2b4ff6378b"}
[chromium] {"normal":"f258433dc0c01497","caos":"19a79a2b4ff6378b"}
[firefox]  {"normal":"f258433dc0c01497","caos":"19a79a2b4ff6378b"}
```

## Limites da prova (o que NÃO foi testado)

- O WebKit do Playwright no Windows usa JavaScriptCore, o mesmo motor do Safari, mas **não é o Safari de macOS/iOS**. Não testei em Apple.
- O hash cobre 25 gerações. Divergência que só apareça depois de muitas gerações não seria vista aqui.
- Se o golden mudar por causa de uma alteração legítima no motor, `npm run golden:update` regrava o arquivo e a `ENGINE_VERSION` em `lib/sim/link.ts` deve subir, para links antigos mostrarem a mensagem de motor incompatível.
