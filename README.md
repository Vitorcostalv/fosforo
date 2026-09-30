# Fósforo: laboratório de neuroevolução (NEAT + Flappy Bird)

Uma população de pássaros aprende a jogar Flappy Bird por evolução, no navegador, e você assiste, mexe e joga contra o melhor deles. O jogo é só o cenário: o produto é ver a evolução acontecendo.

[![CI](https://github.com/Vitorcostalv/fosforo/actions/workflows/ci.yml/badge.svg)](https://github.com/Vitorcostalv/fosforo/actions/workflows/ci.yml)

**Ao vivo:** https://fosforo-lab.vercel.app

![Laboratório: jogo, rede neural do melhor pássaro, gráficos e parâmetros](docs/img/laboratorio.png)

- **Cérebro ao vivo:** a rede do melhor pássaro da geração, com nós, conexões, sinal e intensidade dos pesos. Conexões que mudaram acendem uma vez.
- **Gráficos:** fitness máximo e médio, e número de espécies, por geração.
- **Parâmetros em tempo real:** população, taxas de mutação, gravidade e velocidade de 1x a 20x.
- **10 fases** da mais fácil à mais difícil, mais um **modo caos** (alturas sorteadas e vento).
- **Humano vs IA** na mesma fase, com a mesma física e placar.
- **Editor de fases** com validador de viabilidade ao vivo, desfazer/refazer, teclado e toque.
- **Exportar e importar o cérebro** em JSON ou num link. Quem abrir joga contra o pássaro treinado.
- **Seed determinística:** a seed aparece na tela e no link.

## Como isso começou

Este projeto começou num minicurso de Python do canal Hashtag Programação, onde fiz meu [primeiro Flappy Bird com IA](https://github.com/Vitorcostalv/FlappyBird): Pygame e a biblioteca neat-python, tudo em cima de um arquivo de configuração que eu ainda não entendia direito. Funcionou e foi minha primeira aplicação de IA.

O Fósforo é uma **reescrita do zero**, em TypeScript, para a web, com uma pergunta diferente: o que dá para entender do NEAT se você o implementa por conta própria, mede e deixa qualquer pessoa mexer? Não é um port. O motor NEAT é meu, a física do jogo é minha, e nenhuma imagem ou arquivo do minicurso foi reaproveitado (o pássaro e os canos são desenhados no canvas). Do original ficou só a ideia de fitness (sobreviver, passar cano) e um ponto de partida para os valores de mutação.

## Como o NEAT funciona aqui

NEAT (NeuroEvolution of Augmenting Topologies) evolui **a estrutura e os pesos** de redes neurais ao mesmo tempo, começando de redes mínimas (entradas ligadas direto à saída) e crescendo só quando isso ajuda. Três ideias fazem funcionar:

1. **Innovation numbers.** Cada gene de conexão tem um número histórico. Quando dois pais se cruzam, os genes com o mesmo número se alinham sem análise de topologia.
2. **Especiação.** Genomas parecidos ficam na mesma espécie (distância de compatibilidade `δ = c1·E/N + c2·D/N + c3·W̄`), e a competição é dentro da espécie. Assim uma estrutura nova tem tempo de se ajustar antes de competir com a população toda.
3. **Crescimento incremental.** Mutações adicionam nós (dividindo uma conexão) e conexões; nunca começam de uma rede aleatória grande.

**Fontes primárias** (leitura registrada em [`docs/research/`](docs/research)):

- K. O. Stanley e R. Miikkulainen. *Evolving Neural Networks through Augmenting Topologies*. Evolutionary Computation 10(2), 99-127, 2002. [PDF](https://nn.cs.utexas.edu/downloads/papers/stanley.ec02.pdf), DOI 10.1162/106365602320169811. Tudo abaixo marcado como "artigo" foi conferido no texto, com página, em [`neat-paper.md`](docs/research/neat-paper.md).
- Documentação do neat-python (só como referência de comparação; **nenhum código foi copiado**): [visão geral](https://neat-python.readthedocs.io/en/latest/neat_overview.html) e [arquivo de configuração](https://neat-python.readthedocs.io/en/latest/config_file.html).

**O que é do artigo e o que é escolha minha:**

| Item | Origem |
|---|---|
| Codificação, innovation numbers, cruzamento alinhado, distância de compatibilidade, fitness sharing, estagnação de 15 gerações, campeão copiado em espécie com mais de 5 | Artigo |
| Perturbação uniforme de pesos (80% dos genomas; 90% perturba, 10% troca) | Artigo. A **magnitude** (±0,5) e a faixa dos pesos (±8) são escolha minha |
| Ativação `x / (1 + |x|)` no lugar da sigmoide `1/(1+e^(-4,9x))` do artigo | Escolha minha, por determinismo (abaixo) |
| Nó de bias | Escolha minha (o artigo não descreve bias explícito) |
| Rede sem ciclos (recusar conexão se já existe caminho do destino à origem; no cruzamento, descartar o gene que fecharia ciclo) | Escolha minha. O artigo permite redes recorrentes |
| 20% de sobreviventes por espécie | Escolha minha (padrão do neat-python) |
| Taxas de novo nó / nova conexão: 5% / 10% | Escolha minha (o artigo usa 3% / 5%) |

## Decisões técnicas

**Motor puro, sem React nem DOM.** `lib/neat`, `lib/game` e `lib/sim` são TypeScript puro. A interface só consome.

**A simulação roda num Web Worker.** A interface recebe quadros (30 por segundo) e o resultado de cada geração por mensagem. A 20x com o caos ligado, medi **zero tarefas longas** no thread principal (teste automatizado). A velocidade só muda quantos ticks entram por fatia de tempo; o resultado da evolução é o mesmo em qualquer velocidade (também testado).

**Mesma seed, mesmos parâmetros, mesma evolução, em Chromium, Firefox e WebKit.** Isso é medido, não suposto:

- `Math.exp`, `Math.log` e `Math.cbrt` **divergem de fato** entre motores JavaScript (medido em Node, Chromium, Firefox e WebKit; [`docs/research/determinism.md`](docs/research/determinism.md)). Por isso o motor só usa `+ − × ÷`, `abs`, `sqrt`, `floor`, `fround` e `Math.imul`. Um teste varre o código e falha se aparecer `pow`, `sin`, `cos`, `exp`, `log`, `Math.random` ou `Date.now`.
- Um **golden** versionado ([`tests/golden.json`](tests/golden.json)) guarda o hash de uma run por fase, do caos e do validador. O Playwright roda os mesmos cenários dentro de Chromium, Firefox e WebKit e compara com o golden do Node: **os 12 hashes são idênticos nos três**.
- **Limites da prova:** o WebKit do Playwright no Windows usa JavaScriptCore (o mesmo motor do Safari), mas não é o Safari de macOS/iOS, que não testei. Cada cenário cobre 15 gerações.
- Se você mudar parâmetros no meio da run, ela aparece como **editada**: a seed sozinha deixa de reproduzir a evolução, mas o cérebro exportado continua funcionando em qualquer lugar.

**Uma fase é um dado.** Lista finita e sem aleatoriedade de obstáculos (posição, altura e abertura do vão), velocidade e linha de chegada, em [`lib/game/levels/levels.json`](lib/game/levels/levels.json). Completar a fase vale um bônus de fitness além da distância.

**Validador de viabilidade.** Toda fase (embutida, do editor, de um link) e todo percurso do caos passam por uma busca sobre os estados `(y, vy)` do pássaro, com **a mesma física e a mesma colisão do jogo**. Se ele aceita, existe um caminho real (os testes reexecutam o gabarito no jogo e a fase termina). Rejeitar é exato, e uma fase que só passa com folga menor que 2 unidades é rejeitada de propósito. O editor mostra a folga de cada vão e diz se faltou espaço ou se foi a folga mínima. Detalhes e um bug que a propriedade achou tarde em [`docs/research/feasibility.md`](docs/research/feasibility.md).

**Links tratados como entrada não confiável.** O link do cérebro carrega genoma, gravidade e fase (embutida: id e versão; customizada: dados compactados), com versão de formato e de motor. Link antigo mostra mensagem clara, nunca erro silencioso. Tamanhos, tipos, faixas, NaN/Infinity, nós inexistentes, ciclos e a viabilidade da fase são validados antes de montar a rede, com testes de propriedade sobre links corrompidos e aleatórios (nunca lança nem trava).

**Ativação própria.** `x / (1 + |x|)` (softsign) em vez da sigmoide do artigo, porque a sigmoide precisa de `exp`. A curva satura mais devagar; o algoritmo NEAT é o mesmo.

## As 10 fases e a dificuldade medida

Gerações que o NEAT precisa para completar cada fase (população 100, gravidade 0,55, 10 seeds fixas, orçamento de 300 gerações; `npm run difficulty`):

| Fase | Nome | Resolvidas | Mediana | Pior caso |
|---:|---|---:|---:|---:|
| 1 | Largada | 10/10 | 1 | 1 |
| 2 | Reta | 10/10 | 2 | 3 |
| 3 | Ondulação | 10/10 | 3 | 5 |
| 4 | Degrau | 10/10 | 5 | 8 |
| 5 | Vale | 10/10 | 6 | 13 |
| 6 | Serra | 10/10 | 12,5 | 21 |
| 7 | Zigue | 10/10 | 16 | 30 |
| 8 | Funil | 10/10 | 24 | 51 |
| 9 | Garganta | 10/10 | 38,5 | 130 |
| 10 | Agulha | **9/10** | 88 | 143 |

A curva cresce em degraus (vão menor, canos mais próximos, alturas mais variadas, velocidade maior). **Ajustei as fases 9 e 10 e a 4 depois de medir**: a primeira versão das duas últimas não era resolvida; a fase 4 estava mais fácil que a 3. Está registrado em [`docs/research/feasibility.md`](docs/research/feasibility.md).

### Caso conhecido: fase 10, seed 1333

Essa seed **não completa a fase 10** em 300 gerações (nem em 500). A run passa o primeiro cano e não sai de lá. Investiguei ([`docs/research/seed-1333.md`](docs/research/seed-1333.md)):

- **Não é bug de implementação.** O número de espécies oscila entre 1 e ~50 em torno dos 20 genes, onde a Eq. 1 do artigo troca o normalizador `N = 1` por `N = nº de genes`, e o melhor indivíduo é perdido em 79 de 120 gerações porque o artigo só preserva o campeão de espécies com mais de 5 membros.
- Com 30 seeds a taxa de falha nas fases 9 e 10 é de ~7-10%. Um elitismo global de 1 indivíduo (que **não está no artigo**) leva as duas fases a 30/30 sem mexer nas medianas. Ele existe no código como chave experimental **desligada por padrão**; adotá-lo muda todos os hashes golden e exige subir a versão do motor. Decisão pendente.
- Na interface, uma run assim é detectada (sem melhora por 40 gerações e com uma espécie só) e mostra: “Esta run estagnou. Tente outra seed.”. A estagnação faz parte do laboratório.

## Limitações

- Os pássaros veem 4 números (altura, velocidade vertical, distância e desnível até o próximo cano). Não veem o cano seguinte, então fases muito irregulares são difíceis.
- Com gravidade baixa (≤ 0,3) o percurso do caos fica mais curto (o vão de 116 deixa de ser controlável); a interface mostra quantos canos o caos tem com a gravidade escolhida.
- Não testei em Safari de Apple.
- Sem backend e sem banco: progresso e fases guardadas ficam no `localStorage` do navegador (com fallback quando ele não existe).
- Não há sons, sprites, tema claro nem i18n; só português.

## Rodando

```bash
npm install
npm run dev            # http://localhost:3000
```

**Testes.** Há uma suíte rápida (a cada commit, ~35 s) e uma lenta:

```bash
npm test               # rápida: Vitest + fast-check, fases 1 e 10, fuzz curto
npm run test:full      # completa: 10 fases, todas as gravidades, fuzz longo
npm run test:cov       # completa + cobertura (com limites que falham o comando)
npm run test:e2e       # Playwright: determinismo em 3 navegadores, interface, acessibilidade (axe)
npm run difficulty     # tabela de dificuldade (10 seeds por fase)
npm run golden:update  # regrava os hashes golden depois de mudar o motor
```

O CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) roda `lint`, `typecheck`, `test` e `build` num job e a suíte lenta (cobertura + Playwright) em outro.

## Estrutura

```
lib/neat/     NEAT: genoma, mutação, cruzamento, especiação, reprodução, rede, PRNG
lib/game/     física, colisão, fases (dados), validador de viabilidade, caos
lib/sim/      execução de uma run, links (cérebro e fase), partida humano vs IA, protocolo
lib/ui/       lógica pura da interface: progressão, editor (desfazer/refazer), estagnação
workers/      Worker da simulação e Worker do validador
components/   interface (React, canvas, SVG)
tests/        Vitest + fast-check          e2e/   Playwright
docs/         pesquisa, medições e dificuldade
```

## Licença

MIT. As fontes (Big Shoulders, Hanken Grotesk, JetBrains Mono) são da Google Fonts, sob a SIL Open Font License, carregadas via `next/font` (auto-hospedadas no build).
