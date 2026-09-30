Gerações até completar a fase (população 100, gravidade 0.55, 10 seeds fixas, orçamento 300 gerações).

| Fase | Nome | Resolvidas | Mediana | Pior caso | Seeds que não resolveram |
|---:|---|---:|---:|---:|---|
| 1 | Largada | 10/10 | 1 | 1 | nenhuma |
| 2 | Reta | 10/10 | 2 | 3 | nenhuma |
| 3 | Ondulação | 10/10 | 3 | 5 | nenhuma |
| 4 | Degrau | 10/10 | 5 | 8 | nenhuma |
| 5 | Vale | 10/10 | 6 | 13 | nenhuma |
| 6 | Serra | 10/10 | 12.5 | 21 | nenhuma |
| 7 | Zigue | 10/10 | 16 | 30 | nenhuma |
| 8 | Funil | 10/10 | 24 | 51 | nenhuma |
| 9 | Garganta | 10/10 | 38.5 | 130 | nenhuma |
| 10 | Agulha | 9/10 | 88 | 143 | 1333 |

Mediana e pior caso consideram só as seeds que resolveram dentro do orçamento.

Seeds: 1000, 1037, 1074, 1111, 1148, 1185, 1222, 1259, 1296, 1333

## Caso conhecido: fase 10, seed 1333

Esta seed não resolve a fase 10 dentro de 300 gerações (nem de 500). A run passa o 1º cano na geração 1 e nunca passa do 2º: o número de espécies oscila entre 1 e ~50 em torno dos 20 genes (descontinuidade do normalizador N na Eq. 1 do artigo) e o melhor indivíduo é perdido em 79 de 120 gerações, porque o campeão só é preservado em espécies com mais de 5 membros.

Não é bug de implementação: é uma limitação do algoritmo do artigo. Com 30 seeds, a taxa de falha nas fases 9 e 10 é de ~7-10%. Um elitismo global de 1 indivíduo (que **não está no artigo**) leva as duas fases a 30/30 sem mudar as medianas, mas ele não foi adotado: a decisão está pendente. Detalhes e medições em `docs/research/seed-1333.md`.

A fase 10 não foi afrouxada.
