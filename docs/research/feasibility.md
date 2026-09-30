# Validador de viabilidade e as 10 fases

## O que uma fase é

Um dado (`lib/game/level.ts`): `{ id, version, name, speed, finishX, obstacles: [{ x, gapY, gapHeight }] }`. Tudo inteiro, exceto a velocidade (múltipla de 0,1). Sem aleatoriedade. Completar a fase = o pássaro vivo cruzar `finishX`; isso vale +100 de fitness, além de 0,1 por tick e 5 por cano.

As 10 fases embutidas ficam em `lib/game/levels/levels.json`, com `version`. O arquivo é gerado por `npm run levels:gen` (cada obstáculo só entra se o validador confirma que dá para passar) e versionado.

## Como o validador decide

`lib/game/feasibility.ts`. Busca em largura sobre os estados `(y, vy)` do pássaro, tick a tick, com **as mesmas funções de física e de colisão do jogo** (`nextVelocity`, `hitsObstacle`, `outOfBounds`). Estados na mesma célula (1 unidade em y, mesmo vy) são fundidos, e o vento vem da mesma tabela por tick que o jogo lê.

- **Aceitar é sólido.** O pássaro é inflado em 2 unidades e cada estado guardado é um estado real. Uma fase aceita tem caminho real, com folga. Com `witness: true` o caminho (pulos por tick) é devolvido; os testes o reexecutam no jogo de verdade e conferem que a fase termina.
- **Rejeitar é exato** enquanto `exact: true` (nenhuma subamostragem). Uma fase que só passa com folga menor que 2 unidades é rejeitada de propósito ("no fio da navalha").
- Mensagem para a UI: `describeFailure` → "impossível entre o cano 4 e o cano 5".
- Custo: 0,1 a 0,5 s por fase embutida; limitado pelos limites duros (60 obstáculos, 3600 ticks, 30 000 estados por tick).

## Testes do validador (`tests/feasibility.test.ts`)

- Propriedade: fases **viáveis por construção** (voo real simulado, vãos desenhados em volta dele) nunca são rejeitadas, e o gabarito completa a fase no jogo.
- Propriedade: fases **impossíveis por construção** (canos em extremos opostos, perto demais para a física) são sempre rejeitadas, para qualquer gravidade.
- As 10 embutidas são viáveis e exatas; o gabarito completa cada uma no jogo real.
- Caos: toda a faixa de gravidade, gabarito reexecutado no jogo real.

## Um bug real que a propriedade achou tarde

O primeiro teste de caos só varria gravidade ≥ 0,35. Ao varrer 0,1 a 0,2 apareceram percursos **inviáveis**:

1. Com gravidade baixa o vento (±0,18) passava a vencer a gravidade, e o pássaro não conseguia mais descer.
2. Com gravidade 0,1, nem um vão de 116 é passável (medido).

Correções: o vento nunca passa de metade da gravidade; o gerador tenta vãos maiores quando preciso; `GRAVITY_MIN` subiu de 0,1 para 0,2; há um último recurso garantido (um cano de vão 300). Efeito colateral honesto: **com gravidade ≤ 0,3 o caos fica mais curto** (média de 7 canos em 0,2; 26 em 0,3; 40 a partir de 0,4).

## Dificuldade medida (`docs/difficulty.md`)

População 100, gravidade padrão, 10 seeds fixas, orçamento de 300 gerações. Fases 1 a 3: 1 a 5 gerações. Fase 10: mediana 88 entre as que resolveram. **Uma seed (1333) não resolve a fase 10 em 300 nem em 500 gerações** (a população perde diversidade de espécies). Mantive a fase como está e registrei, em vez de afrouxar.

Ajustes que fiz na curva ao medir (registrados aqui por honestidade): a primeira versão das fases 9 e 10 (vão 108/100, variação máx. 230/260) não era resolvida (8/10 e 0/10). Reduzi a variação e alarguei o vão (fase 9: 112 e 205; fase 10: 106 e 225). A fase 4 ficou um pouco mais difícil (vão 160) porque a mediana dela era menor que a da fase 3.
