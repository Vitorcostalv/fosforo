# Repo original: Vitorcostalv/FlappyBird

Lido em 2026-09-30 (clone raso). 2 commits. `README.md` + `FlappyBird/{flappyBird.py, config.txt, imgs/}`. Python + Pygame + neat-python, feito num minicurso do canal Hashtag Programação.

## Como o jogo funciona lá

- Tela 500x700. Pássaro pula com velocidade -10,5; deslocamento `1,5·t² + v·t` (limitado). Canos: abertura de 200 px, velocidade 5 px/frame, altura do topo sorteada entre 50 e 450.
- Rede feed-forward, **3 entradas**: `y` do pássaro, `|y - altura do cano|`, `|y - base do cano|`. **1 saída** tanh; pula se `> 0.5`.
- Fitness: `+0,1` por frame vivo, `+5` ao passar um cano, `-1` ao bater.
- População 100, `fitness_threshold` 1000, inicialmente conexão total sem nós ocultos.

## `config.txt` (guardado como `original-config.txt`)

Destaques: `weight_mutate_rate 0.8`, `weight_replace_rate 0.1`, `weight_mutate_power 0.5`, `conn_add_prob 0.5`, `node_add_prob 0.2`, `compatibility_threshold 3.0`, disjoint 1,0 / weight 0,5, `elitism 2`, `survival_threshold 0.2`, `max_stagnation 20`, `species_elitism 2`.

## O que a reescrita herda e o que muda

| Herda | Muda |
|---|---|
| A ideia de fitness por sobrevivência + cano passado | Física em passo fixo, sem pygame; determinística |
| Rede pequena, sem nós ocultos no início | Motor NEAT próprio, sem neat-python |
| Valores de mutação como ponto de partida para os defaults | Entradas viram 4 + bias (ver PLAN.md) |
