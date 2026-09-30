# NEAT: o que foi confirmado no artigo original

Fonte primária: K. O. Stanley e R. Miikkulainen, *Evolving Neural Networks through Augmenting Topologies*, Evolutionary Computation 10(2), 99-127, MIT Press, 2002.
DOI: 10.1162/106365602320169811 · PDF: https://nn.cs.utexas.edu/downloads/papers/stanley.ec02.pdf

Texto extraído do PDF (pdftotext) e lido em 2026-09-30. Números de página são os da revista (Vol. 10, No. 2).

## Confirmado (com página)

| Item | O que o artigo diz | Pág. |
|---|---|---|
| Codificação | Genoma = lista de genes de nó (sensor, oculto, saída) + lista de genes de conexão (entrada, saída, peso, bit de habilitado, innovation number). | 107 |
| Mutação de peso | Cada conexão é perturbada ou não a cada geração. | 107 |
| Adicionar conexão | Uma conexão nova, peso aleatório, entre dois nós antes não conectados. | 107 |
| Adicionar nó | Conexão existente é dividida e desabilitada; duas novas entram. A que chega ao nó novo recebe peso 1; a que sai recebe o peso da conexão antiga. | 107-108 |
| Innovation number | Marcador histórico global, incrementado a cada gene estrutural novo. Nunca muda depois de atribuído. | 108 |
| Mesma inovação na mesma geração | Mantém-se uma lista das inovações da geração; a mesma estrutura surgida duas vezes recebe o mesmo número. | 108 |
| Cruzamento | Genes com mesmo innovation number são "matching" e vêm de um dos pais ao acaso. Disjoint e excess vêm do pai mais apto. Com aptidão igual, ao acaso. | 108-109 (Fig. 4) |
| Gene desabilitado | Se desabilitado em qualquer pai, há chance fixa de ficar desabilitado no filho. | 109 (Fig. 4) |
| Distância de compatibilidade | `δ = c1·E/N + c2·D/N + c3·W̄` (E excess, D disjoint, W̄ diferença média de pesos dos genes que casam, incluindo desabilitados, N genes do maior genoma; N=1 se ambos < 20 genes). | 110 (Eq. 1) |
| Especiação | Lista ordenada de espécies; cada uma representada por um genoma aleatório da geração anterior; o genoma entra na **primeira** espécie compatível (δ < limiar), senão cria espécie nova. | 110 |
| Fitness sharing | Fitness ajustada `f'i = fi / Σ sh(δ(i,j))`; dentro da espécie isso vira `fi / tamanho da espécie`. Espécies recebem filhos proporcionais à soma das fitness ajustadas. | 110 (Eq. 2) |
| Reprodução | Elimina-se o pior da espécie, depois a população é substituída pelos filhos dos que sobraram. | 110 |
| Estagnação (nota 2) | Se a fitness da população inteira não melhora por mais de 20 gerações, só as duas melhores espécies se reproduzem. | 110 |
| Início mínimo | População uniforme, sem nós ocultos, entradas ligadas direto às saídas. | 111 |
| Parâmetros (todos os experimentos menos DPNV) | população 150; c1 = 1,0; c2 = 1,0; c3 = 0,4; limiar δt = 3,0; espécie sem melhora de fitness máxima em 15 gerações não se reproduz; campeão de espécie com mais de 5 redes é copiado intacto; 80% de chance de o genoma ter pesos mutados, sendo 90% perturbação uniforme e 10% valor novo; 75% de chance de gene desabilitado herdado continuar desabilitado; 25% dos filhos por mutação sem cruzamento; taxa de cruzamento entre espécies 0,001; add node 0,03; add link 0,05 (populações pequenas). | 111-112 |

## O que o artigo NÃO define (decisões minhas, registradas no PLAN.md)

- Magnitude da perturbação de peso e distribuição do peso inicial.
- Faixa mínima/máxima dos pesos.
- Bias. O artigo não descreve nó de bias explícito; usarei um nó de entrada constante em 1, prática comum, e vou dizer isso no README.
- Como arredondar o número de filhos por espécie.
- Como impedir ciclos. O artigo permite redes recorrentes. Aqui a rede é feed-forward, então a mutação de conexão rejeita ciclos por checagem de alcançabilidade (escolha minha, igual à opção `feed_forward` do neat-python).
- Deleção de nós e conexões: não existe no artigo (NEAT só cresce). Existe no neat-python e no config do minicurso. Fica fora do MVP.
