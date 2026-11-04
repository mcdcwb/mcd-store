# Tipografia automática e posição inferior dos badges manuais

## Tarefa 1 — Automáticos

A fonte vermelha usava clamp(6px, 8cqi, 8px), e a amarela clamp(5px, 8cqi, 7px). A referência vermelha de 8 px foi confirmada no navegador em 1440 px; os limites responsivos permitiam valores menores nos cards estreitos.

Ambos agora usam uma regra única: **9 px**, peso **700**, line-height **1,1 (9,9 px)** e a mesma família herdada DM Sans. Não há escala individual ou redução da fonte amarela. O texto permanece centralizado verticalmente na altura externa de 12 px.

A largura solicitada do amarelo passou de 91,8 para **114 px**. O limite responsivo comum preserva 26 px da largura da fotografia para os controles; em 320 px, o amarelo ocupa 108 px. O corpo útil do texto tem inset de 3% à esquerda e 17% à direita, terminando antes da ponta. Isso permite o texto completo sem sobreposição com favoritos. A primeira tentativa de limite mais estreito cortava o texto em 320 px; um limite de 110 px o acomodava, mas colidia com favoritos. O limite final de 108 px passou nas duas verificações.

O SVG arredondado, os cantos esquerdos retos, a altura de 12 px, a sombra recortada, o alinhamento superior, os 15% visíveis, o hover do card, os 225 ms, toque, teclado, movimento reduzido, seleção por variante e toggles foram preservados. Os manuais foram mantidos intactos durante esta etapa.

Validação da etapa: oito cenários de tipografia e convivência com controles aprovados em 320, 390, 768 e 1440 px, além dos cenários de movimento/toque aprovados durante a implementação.

## Tarefa 2 — Manuais

Dimensões anteriores: **112 × 34,947 px**. Dimensões novas: **89,6 × 27,9576 px**, redução proporcional exata de 20%. Todos os textos compartilham essas dimensões.

O viewBox original 0 0 112 34.947 e o caminho SVG foram preservados. O desenho completo, incluindo a ponta original, é renderizado com a redução uniforme. A fonte passou de 8 para **7 px**, mantendo mais legibilidade do que uma redução estrita para 6,4 px; centralização e cores do ADMIN permanecem intactas. NOVIDADE, LANÇAMENTO, 123456789012 e WWWWWWWWWWWW passaram na verificação de acomodação e centralização; os textos mais largos podem usar duas linhas.

A camada existente é referenciada à fotografia. Somente o manual recebe **top: auto; bottom: 0**, preservando o mesmo alinhamento horizontal do automático. O limite inferior do badge coincide com o limite inferior da foto, sem faixa abaixo, sem invadir o conteúdo e sem alterar o tamanho do card ou a proporção 4:5.

A sombra SVG anterior e o clipping da camada de badges permanecem. O halo que sairia pela borda inferior é recortado no fim da fotografia; não foi aplicado overflow hidden ao card.

Nos cards com manual e várias fotografias, os indicadores foram elevados para a altura do manual mais 6 px. Isso evita que o badge inferior cubra a paginação. O alinhamento horizontal e a navegação dos indicadores continuam iguais; cards sem manual mantêm o posicionamento anterior. Setas, favoritos e zoom foram preservados.

O Manager reutiliza as novas dimensões no preview. Seu limite de 12 caracteres, contador, preservação dos textos antigos e cores não foram modificados.

## Arquivos desta solicitação

- src/app/components/ProductBadge.tsx — largura amarela e dimensões manuais, com viewBox original preservado.
- src/styles/store-theme.css — tipografia automática compartilhada, limite de largura, fonte manual e bottom: 0.
- src/app/App.tsx — indicadores de imagens acima do manual quando presente.
- tests/badges.spec.ts — fonte computada, texto completo, tamanho manual e alinhamento inferior.
- tests/product-corrections.spec.ts — expectativas de largura e fonte atualizadas para o novo padrão, mantendo verificações de variantes, estoque e controles.

## Validação

- 67 testes unitários aprovados.
- Typecheck e build frontend aprovados.
- 35 cenários distintos de Playwright aprovados: 30 na suíte relacionada e cinco na execução de product-corrections.spec.ts. Os quatro cenários de variantes inicialmente exigiam fonte amarela menor e manual maior, expectativas da aparência anterior; após atualizar somente essas expectativas para o pedido atual, passaram em 320, 390, 768 e 1440 px. Inclui tipografia, dimensões, sombras, hover/toque, estoque, toggles, filtros, Manager, proporção 4:5 e favoritos.
- git diff --check aprovado, sem erros de whitespace.
- Inspeção visual do card em 320 px: badges separados entre topo e base, indicadores livres, ponta inteira e sombra contida.
- Backend, Prisma, banco do projeto e lógica de estoque não receberam alterações. Testes de navegador usam banco temporário isolado.
- Alterações anteriores preservadas. Sem commit ou push.
- Limite de validação: foi executada a suíte de navegador relacionada, não a suíte completa. Textos manuais mais largos podem ocupar duas linhas; os casos de 12 caracteres testados cabem sem cortes.
