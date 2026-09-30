# neat-python: referência secundária

Só serve como referência para comparar comportamento nos testes. O motor daqui é escrito do zero.

Fontes (lidas em 2026-09-30):
- Visão geral: https://neat-python.readthedocs.io/en/latest/neat_overview.html
- Arquivo de configuração: https://neat-python.readthedocs.io/en/latest/config_file.html

## Confirmado

- Nós têm identificador crescente e servem para saber ancestralidade comum; conexões são identificadas quando os nós que ligam têm ancestralidade comum.
- Genomas são agrupados em espécies por "genomic distance"; a competição é mais intensa dentro da espécie.
- Distância combina genes não-homólogos com o quanto os homólogos divergiram.

## Defaults documentados (config_file)

| Parâmetro | Default |
|---|---|
| `compatibility_excess_coefficient` | `auto` (igual ao disjoint) |
| `compatibility_include_node_genes` | True |
| `compatibility_enable_penalty` | 1.0 |
| `[DefaultReproduction] elitism` | 0 |
| `survival_threshold` | 0,2 |
| `min_species_size` | 1 |
| `fitness_sharing` | normalized |
| `spawn_method` | smoothed |
| `interspecies_crossover_prob` | 0,0 |
| `[DefaultStagnation] max_stagnation` | 15 |
| `species_elitism` | 0 |
| `species_fitness_func` | mean |
| `weight_init_type` | gaussian |

`compatibility_disjoint_coefficient`, `compatibility_weight_coefficient` e `compatibility_threshold` não têm default; o usuário define.

## Não confirmado

- A visão geral que consegui ler **não detalha** elitismo, sobrevivência e estagnação. Só os defaults da tabela acima estão confirmados; o algoritmo exato de `spawn_method = smoothed` **não foi verificado**. Não vou copiar esse cálculo; uso a proporção pela soma da fitness ajustada do artigo (Eq. 2).
