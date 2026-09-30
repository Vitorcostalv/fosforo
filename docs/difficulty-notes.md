## Caso conhecido: fase 10, seed 1333

Esta seed não resolve a fase 10 dentro de 300 gerações (nem de 500). A run passa o 1º cano na geração 1 e nunca passa do 2º: o número de espécies oscila entre 1 e ~50 em torno dos 20 genes (descontinuidade do normalizador N na Eq. 1 do artigo) e o melhor indivíduo é perdido em 79 de 120 gerações, porque o campeão só é preservado em espécies com mais de 5 membros.

Não é bug de implementação: é uma limitação do algoritmo do artigo. Com 30 seeds, a taxa de falha nas fases 9 e 10 é de ~7-10%. Um elitismo global de 1 indivíduo (que **não está no artigo**) leva as duas fases a 30/30 sem mudar as medianas, mas ele não foi adotado: a decisão está pendente. Detalhes e medições em `docs/research/seed-1333.md`.

A fase 10 não foi afrouxada.
