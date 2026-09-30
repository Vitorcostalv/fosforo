<!-- /autoplan restore point: "C:\\Users\\jasmi\\.gstack\\projects\\fosforo\\main-autoplan-restore-20260930-095300.md" -->
## Implementation plan
# PLAN: Fósforo (laboratório de neuroevolução no navegador)

Nome de trabalho: **Fósforo**, pelo brilho âmbar do osciloscópio. Trocar é barato agora e caro depois; me diga se não gostar.

## 1. Escopo: o que eu questiono e o que sai do MVP

O escopo é grande para um MVP. Cada item abaixo é defensável, mas o conjunto só fecha com corte.

**Sai do MVP (vai para "próximos passos" no README):**
1. **Deleção de nós/conexões e mutação de função de ativação.** O artigo não tem; só o neat-python. NEAT puro só cresce.
2. **Redes recorrentes.** Feed-forward com checagem de ciclo. Reduz superfície de bug e a visualização fica legível.
3. **Replay de edições ao vivo.** Mexer em parâmetro durante a run vale a partir da **próxima geração**, e o link guarda seed + parâmetros **iniciais**. Reproduzir uma run com edições no meio exigiria gravar um log de eventos. Fica para depois.
4. **Sprites, som, placar online, i18n.** Só português. Pássaro e canos são formas vetoriais desenhadas no canvas.
5. **GIF gerado dentro do app.** O GIF/print do README é capturado por mim na etapa final.
6. **Tema claro.** Só o painel escuro; contraste AA verificado num tema só.

**Fica, mas simplificado:**
- **Humano vs IA** roda no thread principal (o jogo é puro e barato: 2 pássaros), usando a mesma física de `lib/game/`. Só a evolução vai para o Worker.
- **Modo caos**: alturas aleatórias por geração + vento (força lateral que vira aceleração vertical variável). Contraste com o modo normal, que usa **um percurso fixo** para todas as gerações. O normal converge rápido e tende a decorar o percurso; o caos mostra se generalizou. Essa é a história do projeto.

**Risco central que eu quero destacar: determinismo.**
`Math.tanh`, `exp`, `log`, `cos` não têm resultado idêntico garantido entre motores JS (V8, JavaScriptCore, SpiderMonkey). Se eu usar, "mesma seed, mesma evolução" falha entre Chrome e Safari, e o link compartilhável deixa de reproduzir. Decisão:
- Ativação própria feita **só com `+ - * /`** (IEEE-754 exato): tanh racional (aproximação de Padé) saturada em ±1.
- Nada de Box-Muller. Peso inicial uniforme; perturbação uniforme (o artigo diz "uniformly perturbed", p. 111).
- PRNG mulberry32 com aritmética inteira (`Math.imul`, `>>>`).
- Ordem de iteração sempre por estruturas ordenadas (arrays, nunca `Map` com ordem implícita de inserção quando afeta o resultado).
- Teste: hash da evolução de N gerações com seed fixa, gravado como snapshot; qualquer mudança de comportamento quebra o teste de propósito.

## 2. Arquitetura

```
fosforo/
  lib/
    neat/        TS puro. Sem DOM, sem React.
      rng.ts           mulberry32, uniform, int, pick, shuffle
      genome.ts        tipos + criação mínima + validação
      innovation.ts    registro por geração (mesma estrutura = mesmo número)
      mutate.ts        peso, add node, add connection (rejeita ciclo)
      crossover.ts     alinhado por innovation; disjoint/excess do mais apto
      distance.ts      δ = c1E/N + c2D/N + c3W̄
      species.ts       representante, primeira espécie compatível
      reproduce.ts     fitness sharing, cotas, elitismo, estagnação
      network.ts       ordenação topológica + ativação
      activation.ts    tanh racional (sem Math.tanh)
      codec.ts         genoma <-> JSON estável <-> binário base64url
      population.ts    uma geração: avaliar, especiar, reproduzir
    game/        TS puro.
      physics.ts       passo fixo (1/60), gravidade, pulo, vento
      course.ts        geração dos canos a partir de seed
      world.ts         estado, step(), colisão, fitness
      sensors.ts       entradas da rede
      match.ts         humano vs IA
    sim/         protocolo de mensagens Worker <-> UI (tipos + serialização)
  workers/
    sim.worker.ts      loop de simulação, snapshots
  app/  components/   UI Next (App Router), Canvas, SVG
  tests/              vitest + fast-check
  docs/research/
```

**Worker.** Ele roda `N` ticks por quadro conforme a velocidade (1x a 20x); a velocidade só muda quantos ticks por fatia de tempo, nunca o resultado. Envia snapshots por `postMessage` (posições dos pássaros vivos, melhor genoma, estatísticas da geração), com taxa limitada (~30 Hz) para a UI nunca engasgar. A UI manda comandos: `init`, `play/pause`, `step-generation`, `setSpeed`, `setParams` (efeito na próxima geração), `loadGenome`. Sem `SharedArrayBuffer` (exigiria headers COOP/COEP; não vale).

**Entradas da rede** (a original tinha 3): `y` normalizado, velocidade vertical, distância horizontal ao próximo cano, `y` do centro da abertura relativo ao pássaro, mais **bias** (constante 1). Saída única: pula se `> 0`. Escolha minha; a velocidade vertical é o que permite lidar com vento sem ver o vento.

**Fitness:** frames vivo + bônus por cano passado (a mesma ideia do minicurso), com teto de ticks por geração para a geração sempre terminar. Nunca NaN: toda entrada é finita por construção e há teste de propriedade.

**Serialização e link.** JSON com chaves ordenadas e números com representação estável (sem `-0`; ordem por innovation). Binário compacto: cabeçalho + nós + conexões, pesos como float32 (o genoma "canônico" já guarda pesos arredondados a float32 no momento da mutação, para que exportar/importar devolva **exatamente** o mesmo genoma). base64url no fragmento `#` (não vai ao servidor). Um cérebro típico cabe em algumas centenas de bytes.

## 3. Testes

- **Vitest**, meta de cobertura **≥ 90% de linhas/ramos em `lib/neat` e `lib/game`**, verificada no CI local (`npm run test:cov` com threshold que falha).
- **fast-check (propriedades):**
  1. mesma seed + mesmos parâmetros ⇒ mesma evolução (comparação por hash);
  2. cruzamento nunca produz genoma inválido (conexão para nó inexistente, duplicata, ciclo);
  3. innovation numbers nunca se repetem para estruturas diferentes e são estáveis para a mesma;
  4. export → import devolve genoma idêntico (JSON e binário/URL);
  5. fitness nunca é NaN nem infinito;
  6. velocidade da simulação não altera resultado (mesmos ticks, cortes diferentes).
- **Bordas:** população 1; mutação 0 e 1; geração sem sobrevivente; espécie de um indivíduo; rede sem conexões; XOR como teste de aceitação do motor (o artigo usa XOR, p. 111).
- **Comparação com neat-python:** só em casos onde a definição está confirmada (distância de compatibilidade num par de genomas). Onde não confirmei, não comparo.

## 4. UI (depois da revisão do motor)

Direção: painel de instrumento. Grafite escuro, texto quente, **um** âmbar fosco. Grade fina, rótulos pequenos em caixa alta com espaçamento, valores em mono tabular. Título com personalidade (fonte a definir com /design-consultation). Gráficos e rede neural são os protagonistas; pássaro e canos são geometria simples e consistente.

- Desktop: grade com jogo, cérebro (SVG, sinal do peso por cor/traço/espessura, não só cor), gráficos (canvas ou SVG: fitness máx./médio, nº de espécies), painel de parâmetros.
- Mobile: abas (Jogo · Cérebro · Gráficos · Parâmetros).
- Acessibilidade: contraste AA, tudo por teclado, foco visível, `prefers-reduced-motion` ⇒ inicia **pausado** com botão "avançar uma geração".
- Copy em pt-BR, direto, sem corporativês.

## 5. Etapas e pontos de parada

| # | Etapa | Saída | Parada |
|---|---|---|---|
| 0 | Pesquisa | `docs/research/` | feito |
| 1 | Plano | este arquivo | **aguardo sua aprovação** |
| 2 | Scaffold (Next, Tailwind v4, Vitest, fast-check) + motor NEAT + jogo, com testes | testes verdes, cobertura | **PARO para você revisar antes da UI** |
| 3 | Worker + UI básica | app rodando local | |
| 4 | Deploy de **preview** (`vercel`, sem `--prod`) | URL de preview | peço sua confirmação antes |
| 5 | `/design-review` e `/review` (se o hook falhar, faço manualmente) | correções | |
| 6 | README (história honesta, fontes, decisões, print/GIF) | README | |
| 7 | Repo **público** no GitHub | | **peço confirmação** |
| 8 | `vercel --prod` + teste do link de cérebro em produção | URL de produção | **peço confirmação** |

O deploy de produção é obrigatório para considerar o trabalho concluído; fica bloqueado apenas pelas suas duas confirmações.

## 5b. Ajustes vindos da revisão (aplicados ao plano)

1. **O link precisa carregar o ambiente, não só o genoma.** Um cérebro treinado com gravidade X e sem vento falha com outra gravidade. O cabeçalho do link/JSON leva: versão do formato, genoma, gravidade, modo (normal/caos), seed do percurso. Ao carregar, o jogo usa esses valores. Versão do formato permite mudar o binário depois sem quebrar links antigos.
2. **Identidade de inovação, explícita.** Contador de innovation **global e persistente**; o dicionário de deduplicação **reseta a cada geração** (artigo, p. 108). Chave de conexão = `(nó de origem, nó de destino)`. Chave de add-node = `(innovation da conexão dividida)`, que também define o id do nó novo, para o mesmo split gerar o mesmo nó.
3. **Cotas de filhos sem perder indivíduos.** Arredondar por maior resto (largest remainder) para a população fechar **exatamente** no tamanho configurado. Casos: população 1, espécie de 1, todas as espécies estagnadas (mantém as duas melhores, nota 2 da p. 110).
4. **Run editada não é reproduzível só por seed.** Se algum parâmetro mudar durante a run, a tela mostra um selo "editada" ao lado da seed e o link passa a dizer "parâmetros iniciais". Sem promessa falsa.
5. **Snapshot barato.** Worker envia posições em `Float32Array` transferível (sem cópia) a ~30 Hz; genoma do melhor só quando muda. Rodar a 20x nunca depende do ritmo de `requestAnimationFrame`, então aba em segundo plano não distorce o resultado.
6. **Etapa nova antes da UI: `/design-consultation`.** Define tokens (cor, tipografia, espaçamento) e a fonte do título antes de escrever componentes. Fontes via `next/font` (auto-hospedadas, licença OFL), sem requisição a terceiros em produção.
7. **CI.** GitHub Actions com `lint`, `tsc --noEmit`, `test:cov` (com threshold) e `build`. Badge no README só depois de verde.
8. **Fim de geração garantido.** Teto de ticks por geração. Se o melhor chega ao teto, a UI marca "resolvido" em vez de parecer travada.
9. **Risco de deploy a checar cedo:** Worker via `new Worker(new URL(...), import.meta.url)` funciona com o bundler do Next; validar no **preview**, não só em dev.

## 5c. Decisões após a primeira revisão (respostas do Vitor) e estado atual

**Nome e distribuição.** Título/README/descrição do repo: "Fósforo: laboratório de neuroevolução (NEAT + Flappy Bird)". Topics: `neat`, `neuroevolution`, `flappy-bird`, `typescript`. `fosforo.vercel.app` **está ocupado** (HTTP 200), então o domínio será **fosforo-lab.vercel.app** (checado: 404, aparentemente livre; reconfirmo no deploy).

**Licença e origem.** MIT. Nenhum código nem arquivo do neat-python foi copiado. Nenhuma imagem ou asset do minicurso é reaproveitado (o pássaro e os canos serão desenhados no canvas). O `config.txt` original está em `docs/research/` só como documentação.

**A. Ativação.** Softsign `x / (1 + |x|)`, só com `+ − × ÷` e `Math.abs`. Difere da sigmoide do artigo `1/(1+e^(-4,9x))` (p. 112) porque `Math.exp` **diverge entre motores** (medido: ver `docs/research/determinism.md`). Sem `pow/sin/cos/log/exp` no motor e na física; só `Math.sqrt`/`Math.imul`/`fround`/`floor`/`abs`/`min`/`max`. Verificado por teste automático.

**B. Prova de determinismo.** Teste golden (`tests/golden.json`, versionado) + Playwright em Chromium, Firefox e WebKit. **Passou nos três** com hash idêntico ao do Node. O README só afirma "mesma seed, mesma evolução" com este teste citado, e diz o que não foi testado (Safari em Apple).

**C. Link do cérebro.** Cabeçalho com versão do formato e da engine. Link de outra engine mostra mensagem clara ("treinado no motor vN...") e nunca falha em silêncio. Entrada tratada como não confiável: limite de tamanho, tipos, faixas (gravidade, peso, ids), NaN/Infinity, nó inexistente, laço, par duplicado, ciclo, contagens declaradas × tamanho real. Testes de propriedade com links aleatórios e corrompidos: nunca lança.

**D. Runs editadas.** Selo "editada" e uma frase na tela: "A seed sozinha não reproduz esta evolução, porque você mudou parâmetros no meio. O cérebro exportado continua funcionando em qualquer lugar."

**Escolhas do projeto (não são do artigo).** Registro com justificativa:

| Escolha | Valor | Por quê |
|---|---|---|
| Magnitude da perturbação de peso | uniforme em [-0,5; 0,5] | O artigo diz "uniformly perturbed" mas não dá a magnitude (p. 111). 0,5 é o valor do `config.txt` original do minicurso. |
| Valor novo de peso | uniforme em [-2, 2] | O artigo não fixa. Faixa moderada para a rede não saturar de cara. |
| Faixa dos pesos | [-8, 8] | Impede pesos que dominem a soma; o limite também protege a importação de links. |
| Pesos iniciais | uniforme em [-1, 1] | Artigo não fixa. |
| Bias | nó de entrada constante em 1 | O artigo não descreve bias explícito. Sem ele, a rede não teria deslocamento. |
| Evitar ciclos | recusar a conexão se já existir caminho do destino para a origem (todas as conexões, habilitadas ou não); no cruzamento, genes que fechariam ciclo ou repetiriam um par são descartados | O artigo permite redes recorrentes. Aqui é feed-forward (corte de escopo aprovado). Testado com propriedades. |
| Fração de sobreviventes | 20% | O artigo não fixa; é o default do neat-python (documentação). |
| Taxas de add node / add link | 0,05 / 0,1 | Artigo usa 0,03 / 0,05 (p. 112); subi um pouco para o demo mostrar topologia crescendo mais cedo. |
| Teto de ticks por geração | 3600 (60 s) | Garante que toda geração termina. |

**Estado (etapa 2 concluída, PARADO para revisão).**
- `lib/neat/` (rng, hash, genoma, innovation, mutação, cruzamento, distância, espécies, reprodução, população, rede, base64url), `lib/game/` (config, percurso, mundo), `lib/sim/` (run, link, match, golden, canonical).
- 173 testes (Vitest + fast-check) verdes; cobertura: 100% linhas, 99,6% statements, 97,4% branches, 100% funções (`npm run test:cov`, com thresholds que falham o comando).
- Playwright passou em 3 navegadores. Lint e tsc limpos.
- Ainda **sem UI**, sem Worker, sem deploy.

## 5d. Novo escopo (segunda rodada de respostas do Vitor) e estado

**Adicionado ao MVP:** 10 fases embutidas (dados versionados), validador de viabilidade, editor de fases (com desfazer/refazer, teclado e toque, localStorage em try/catch, JSON e link), progressão (fases 2 a 10 bloqueadas + "desbloquear tudo"), link do cérebro com a fase (embutida = id + versão; customizada = dados compactados), caos como modo extra fora das 10 fases, e golden por fase nos 3 navegadores.

**Ordem:** (1) fases + validador + testes no motor, **PARADO para revisão** ← estamos aqui; (2) `/design-consultation`; (3) Worker e UI, incluindo o editor. Se o editor estourar o prazo, aviso e proponho o corte em vez de entregar pela metade.

**Publicação obrigatória ao fim:** preview na Vercel (com confirmação) quando a UI básica e o editor rodarem; depois `/design-review` e `/review` (manual se travarem), confirmação, repo público, `vercel --prod`; só termina com a URL de produção funcionando, com um link de cérebro em fase embutida e outro em fase customizada testados nela. `fosforo-lab` reconfirmado no deploy.

**Etapa 1 concluída (o que foi feito):**
- `lib/game/`: `level.ts` (dado + validação estrutural), `physics.ts` (física/colisão compartilhadas), `feasibility.ts` (validador), `chaos.ts` (caos validado por construção), `levels/` (10 fases), `world.ts` com linha de chegada e bônus.
- `lib/sim/`: `levelCodec.ts` (fase em JSON/link, entrada não confiável), `link.ts` (formato 2, motor 2, com fase), `env.ts`, `feasibilityCache.ts`, `run.ts` (modo fase/caos, `checkRunParams`), `match.ts` (humano e IA na mesma fase).
- Testes: 267 (Vitest + fast-check), inclusive fuzz de links e fases, propriedades do validador e "o NEAT completa as 10 fases".
- Playwright: 12 hashes (10 fases, caos, validador) idênticos em Chromium, Firefox e WebKit.
- Medições e decisões em `docs/research/feasibility.md` e `docs/difficulty.md`.

## 6. Perguntas em aberto

1. Nome: **Fósforo** serve?
2. Aprovado o corte da seção 1 (principalmente: sem deleção/recorrência, edições ao vivo valem na próxima geração)?
3. Licença do repo: MIT?
## Review record

### Nota sobre o /autoplan
O `/autoplan` iniciou (preamble e snapshot de restauração funcionaram; restore em `~/.gstack/projects/fosforo/`), mas o pipeline completo (4 fases, subagentes e Codex) é pesado demais para um plano ainda sem código. Fiz a revisão CEO/Eng por conta própria, focada em risco: resultado na seção 5b. Revisão de design e DX entra no passo `/design-consultation` antes da UI. Nenhuma pontuação formal foi gerada.
