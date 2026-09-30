---
# gstack: design-md-format=spec
name: Fósforo
description: Painel de instrumento de laboratório em grafite quente, com um único traço âmbar de fósforo de osciloscópio; sério, preciso e curioso.
colors:
  ground: "#141416"
  surface: "#1b1b1e"
  surface-raised: "#222226"
  grid: "#2b2b30"
  border: "#37373d"
  text: "#ece6d8"
  text-muted: "#a8a397"
  text-faint: "#7d7a71"
  accent: "#d9a23c"
  on-accent: "#1a1407"
  accent-dim: "#8a6a2c"
  signal-negative: "#93a1aa"
  success: "#86ad8f"
  warning: "#d9a23c"
  error: "#d8705f"
  focus: "#f1d08a"
typography:
  display:
    fontFamily: Big Shoulders
    fontWeight: 800
    fontSize: clamp(2rem, 4.5vw, 3.25rem)
    letterSpacing: 0.02em
  body:
    fontFamily: Hanken Grotesk
    fontSize: 0.9375rem
    lineHeight: 1.5
  label:
    fontFamily: Hanken Grotesk
    fontWeight: 600
    fontSize: 0.6875rem
    letterSpacing: 0.14em
  mono:
    fontFamily: JetBrains Mono
    fontFeature: tnum
rounded:
  sm: 2px
  md: 4px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 40px
---

# Fósforo, sistema de design

**Creative North Star:** a bancada de um laboratório às três da manhã. Uma tela de osciloscópio velho num painel de grafite: quase tudo é escuro e quieto, e só o que está sendo medido acende em âmbar.

**Product context:** laboratório de neuroevolução no navegador. Uma população de pássaros aprende a jogar (NEAT); o produto é ver a evolução acontecer, mexer nela e compartilhar o cérebro treinado. Pessoas curiosas, do estudante ao recrutador que abre o link do portfólio. Tipo de projeto: ferramenta interativa (painel), não landing page.

**Mode per surface:** jogo e gráficos = Operate/Experience; rede neural = Read/Operate; parâmetros e editor = Operate; textos de ajuda e README = Read.

**Key characteristics:**
- Fundo grafite com grade fina; nada de cartão flutuante.
- Rótulos minúsculos em caixa alta e espaçados; valores em mono tabular.
- Um único âmbar. Onde ele aparece, significa "o que está vivo agora".
- Gráficos e rede neural ocupam a maior área; o jogo é o menor elemento, não o maior.

## Colors

**Strategy:** Restrained. Neutros de grafite quente (com leve matiz de âmbar, todos abaixo de 8% de saturação) e **um** acento, `accent`, usado só em: melhor pássaro, linha de fitness máximo, conexões de peso positivo, valor em foco, botão primário e o foco de teclado (`focus`, versão clara do âmbar). Nada mais recebe cor.

**Light or dark:** escuro. A cena de uso é uma pessoa olhando gráficos por minutos; o escuro reduz brilho e faz o traço âmbar valer. Não há tema claro no MVP.

**Sinal negativo sem segunda cor de destaque.** Pesos negativos na rede usam `signal-negative` (cinza-aço, dessaturado) e **tracejado**; positivos usam âmbar e traço cheio. A espessura diz a magnitude. Assim o significado nunca depende só de matiz (acessível a daltonismo).

**Hierarquia no escuro:** profundidade vem de degraus de tom (`ground` → `surface` → `surface-raised`) e de linhas de 1px (`grid`, `border`), nunca de sombra.

**Contraste (WCAG, medido com script; `ground` #141416 / `surface` #1b1b1e / `surface-raised` #222226):** `text` 14,8 / 13,8 / 12,7; `text-muted` 7,3 / 6,8 / 6,3; `accent` 8,1 / 7,5 / 6,9; `signal-negative` 6,9 / 6,5 / 6,0; `success` 7,4 / 6,9 / 6,3; `error` 5,6 / 5,2 / 4,8; `focus` 12,4 / 11,6 / 10,7; `on-accent` sobre `accent` 8,0. Tudo isso passa AA (4,5:1) para texto. `text-faint` dá 4,3 / 4,0 / 3,7, portanto **só** para decoração, ticks de régua e texto desabilitado que não carrega informação (o estado bloqueado tem também ícone e texto em `text-muted`).

## Typography

**Big Shoulders** (título e números-manchete; no Google Fonts o corte Display virou o eixo `opsz` desta família): grotesca condensada de sinalização industrial de Chicago, a mesma família visual das plaquetas de equipamento. Sempre em caixa alta, peso 800, nunca abaixo de 1,5rem. **Hanken Grotesk** (interface e texto): neutra, legível em tamanhos pequenos, com acentos do português bem desenhados. **JetBrains Mono** (valores): monoespaçada com algarismos tabulares, para números que mudam sem tremer.

Nenhuma dessas faces está na lista de sobreusadas para display. O título "Fósforo" é o único momento de personalidade tipográfica; o resto obedece.

Escala: rótulo 0,6875rem (caixa alta, 0,14em); corpo 0,9375rem; valor 1rem a 1,5rem mono; manchete `clamp(2rem, 4.5vw, 3.25rem)`. Carregamento: `next/font/google` (auto-hospedado no build, sem pedido a terceiros em produção), `display: swap`, subset `latin`.

## Layout

- **Base 4px.** Espaços: 4, 8, 12, 16, 24, 40.
- **Desktop (≥ 1200px):** três colunas com linhas de grade de 1px entre elas. Esquerda: Jogo (largura fixa ~360px, proporção 480:640). Centro: Cérebro (SVG, protagonista) sobre Gráficos. Direita: Parâmetros e Fases (~320px). Cabeçalho baixo com título, seed e estado da run.
- **Tablet (768–1199px):** duas colunas (Jogo + Cérebro; Gráficos + Parâmetros).
- **Mobile (< 768px):** uma coluna com **abas fixas embaixo** (Jogo · Cérebro · Gráficos · Parâmetros · Fases). Cada aba é uma tela inteira; o cabeçalho com a seed fica sempre visível. Alvos de toque ≥ 44px.
- Largura máxima do conteúdo: 1680px, centrado. Sem cartões dentro de cartões: painéis são regiões delimitadas por linhas.

## Elevation & Depth

Sem sombras. Camadas por tom e por linha: `ground` (fundo), `surface` (painéis), `surface-raised` (controles, menus). Modais e menus usam `surface-raised` com borda `border` de 1px. O único "brilho" permitido é o rastro de persistência do osciloscópio nos gráficos (ver Motion), desenhado no canvas e não com `box-shadow`.

## Shapes

Instrumento, não app de consumo: cantos quase retos. `rounded.sm` (2px) em controles e painéis, `rounded.md` (4px) em menus e no editor. Nada de pílulas. Pássaro: triângulo-cunha com um pequeno bico e uma asa em traço; canos: dois retângulos com um quadro de vão (marcas de régua nas bordas do vão). Sem sprites, sem gradientes; tudo em traços de 1,5px e preenchimentos chapados.

## Components

- **Rótulo + valor (readout):** rótulo em caixa alta 0,6875rem `text-muted`; valor em mono `text`, alinhado à direita em colunas. Valor em foco em `accent`.
- **Botão primário:** fundo `accent`, texto `on-accent`, 2px de raio, altura 36px (44px no toque). Hover: `focus`. Focus-visible: contorno 2px `focus` com 2px de afastamento. Active: `accent-dim`. Disabled: `grid` com `text-faint`, sem hover.
- **Botão secundário:** transparente, borda `border`, texto `text`. Hover: borda `text-muted`. Mesmos focos.
- **Controle deslizante:** trilho de 2px `border` com **marcas de régua** a cada passo, polegar retangular 10×20px `text`; valor em mono ao lado; setas ajustam o passo, PageUp/PageDown 10 passos. Nunca muda só por cor.
- **Controle segmentado (velocidade 1x a 20x):** botões contíguos separados por linha; o ativo tem fundo `surface-raised` e sublinhado `accent` de 2px.
- **Abas:** inferior no mobile, em linha no cabeçalho de cada coluna no desktop. Ativa: `text` com sublinhado `accent`; inativa: `text-muted`. Setas navegam entre abas.
- **Célula de fase (grade 5×2):** número em mono grande, nome curto abaixo. Estados: **atual** (borda `accent`), **concluída** (marca de check em traço, `success`), **liberada** (borda `border`), **bloqueada** (ícone de cadeado em traço, `text-faint`, texto "Complete a fase N", `aria-disabled`).
- **Banner de run estagnada:** faixa de largura total do painel, fundo `surface-raised`, borda esquerda de 3px `warning`, ícone de alerta em traço, texto curto e um botão "Tentar outra seed".
- **Editor de fases:** régua horizontal com os canos como colunas; o vão selecionado tem moldura `accent` e alças; cada vão mostra **folga** em mono ("folga 14"). Vãos inviáveis: moldura `error` tracejada e legenda do trecho. Barra de ferramentas: desfazer, refazer, adicionar, remover, testar, salvar, exportar/importar.
- **Gráficos:** canvas com grade fina (`grid`), eixos em mono `text-muted`, linha de fitness máximo em `accent`, média em `text`, espécies em `signal-negative` (área fina). Legenda em texto, não só cor.
- **Rede neural (SVG):** nós como quadrados vazados (entradas), quadrados cheios (ocultos) e losango (saída); conexões conforme "Sinal negativo" acima. Rótulos das entradas em texto pequeno (`altura`, `velocidade`, `distância`, `desnível`, `bias`).

## Do's and Don'ts

- Do: use `accent` só para "o que está vivo agora" e para o foco principal da tela.
- Do: mostre números em mono tabular, alinhados à direita, com rótulo em caixa alta acima.
- Do: acompanhe toda informação de cor com forma, traço ou texto.
- Do: escreva em português direto ("Esta run estagnou. Tente outra seed."), em frases curtas.
- Do: tenha um estado vazio, de carregamento, de erro, de travamento e de bloqueio para cada painel.
- Don't: gradientes, brilho neon, vidro fosco, texto com degradê, sombras suaves em cartões, emojis como ícones.
- Don't: pássaros ou cérebros clichê; robôs; ilustração 3D; frases de marketing sobre "o poder da IA".
- Don't: uma segunda cor de destaque. Se algo precisa se diferenciar, use traço, forma ou peso.
- Don't: animar sem necessidade. Nada de entrada com deslizes, saltos ou parallax.

## Motion

- **Approach:** minimal-functional.
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out).
- **Duration:** micro(80ms) short(160ms) medium(280ms). Sem movimentos longos.
- **The one authored moment: persistência de fósforo.** Nos gráficos, o ponto mais novo acende em âmbar pleno e decai em ~1,2s, como o rastro de um osciloscópio; na rede neural, conexões que mudaram em relação à geração anterior piscam uma vez.
- **`prefers-reduced-motion: reduce`:** sem rastro nem piscada; a simulação **começa pausada**, com o botão "Avançar uma geração" em destaque; trocas de aba e estados mudam sem transição.

## Estados

| Estado | Tratamento |
|---|---|
| Vazio (sem run) | Painéis mostram a grade e uma frase curta: "Nenhuma geração ainda. Aperte Iniciar." |
| Carregando (Worker iniciando, link sendo validado) | Esqueleto de linhas de grade; texto "Preparando a simulação..."; sem spinner giratório. |
| Erro (link ou arquivo inválido) | Mensagem em `error` com ícone em traço e a causa em português ("Este cérebro foi treinado no motor v1..."), mais a ação possível. |
| Travado (run estagnada) | Banner com `warning`: "Esta run estagnou. Tente outra seed." e botão "Tentar outra seed". Só no modo fase (no caos cada geração joga um percurso diferente e o fitness não é comparável). |
| Bloqueado (fase) | Cadeado em traço no canto da célula, número e nome em `text-faint`, `aria-disabled`, dica ao passar o mouse ("Complete a fase N para liberar"), a mesma frase no texto para leitores de tela e uma nota fixa abaixo da grade; mais o atalho "Desbloquear tudo". A célula é pequena demais para caber a frase escrita. |
| Inviável (editor) | Moldura `error` tracejada, trecho destacado e motivo: "faltou espaço" ou "abaixo da folga mínima de 2". |

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-30 | Sistema criado a partir do briefing do Vitor | Direção dada: painel de instrumento, grafite, um âmbar, mono tabular, sem clichês de IA. Fontes escolhidas fora das listas de sobreusadas. |
| 2026-09-30 | Pesos negativos = cinza-aço tracejado | Manter um único acento e não depender só de cor (acessibilidade). |
| 2026-09-30 | Fonte do título: "Big Shoulders" | O Google Fonts fundiu o corte Display na família Big Shoulders (eixo `opsz`); usamos o peso 800. |
| 2026-09-30 | Sem sombras, sem tema claro no MVP | Profundidade por tom e linha; escuro reforça o efeito de fósforo. |
