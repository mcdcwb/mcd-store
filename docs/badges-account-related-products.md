# Badges, favoritos, menu da conta e VEJA TAMBÉM

As cinco tarefas foram implementadas e verificadas em sequência. Alterações anteriores foram preservadas, sem commit ou push.

## Tarefa 1 — Posição manual

O manual já estava em bottom: 0 na fotografia. Descer 4 px esconderia cerca de 14% da altura do SVG ou deixaria o desenho sair da foto. Foi aplicado bottom: -1px, com o último pixel recortado pela camada existente; a geometria permanece 89,6 × 27,9576 px. Isso aproxima o desenho da transição sem tocar nome, preço ou variantes. O texto inteiro permanece dentro da foto, e os automáticos não foram deslocados.

Arquivos: src/styles/store-theme.css, tests/badges.spec.ts e tests/product-corrections.spec.ts. Quatro cenários de dimensões, acomodação de 12 caracteres e posição passaram em 320, 390, 768 e 1440 px.

## Tarefa 2 — Menu somente por clique

AccountMenu não usa mais onPointerEnter/onPointerLeave nem a referência mouseHovering. onClick alterna o estado explícito open. Clique fora, Escape com retorno do foco, fechamento após navegação e ações existentes foram mantidos. aria-expanded e aria-controls continuam presentes. Nenhum menu de categorias, filtros ou carrinho teve o comportamento alterado.

Arquivos: src/app/components/AccountMenu.tsx e testes que antes abriam a conta por hover. Onze cenários aprovados cobrem hover sem abertura, cliques sucessivos, clique fora, Escape, teclado, navegação, restauração da sessão, logout, USER, ADMIN e touch. A verificação adicional em quatro larguras confirmou limites do menu, clique, Espaço, Tab e Escape.

## Tarefa 3 — Sombras e recorte

O manual já usava a mesma sombra SVG do automático. A configuração agora é compartilhada pela variável --store-overlay-shadow: drop-shadow(0 3px 5px rgb(0 0 0 / 0.45)). Todos os badges e o SVG do bookmark a reutilizam. SVG overflow visible evita um corte artificial do halo na caixa do ícone.

O bookmark está em uma camada própria store-favorite-layer, com o tamanho da fotografia e clip-path igual ao dos badges. A camada permite passagem do ponteiro, e o botão mantém a área clicável de 44 × 44 px, a posição, as cores e a escala 1,10. O recorte contempla o contorno superior de 1 px já existente, sem deixar a sombra invadir informações ou cards vizinhos. Não foi aplicado overflow hidden ao card ou aos controles.

Arquivos: src/styles/store-theme.css, src/app/App.tsx, tests/product-card-geometry.spec.ts, tests/product-corrections.spec.ts e tests/filters.spec.ts. Nove cenários distintos aprovados verificaram geometria 4:5, zoom, galeria, controles, sombras compartilhadas e favoritos ADMIN com cooldown e toasts. Um seletor antigo foi ajustado para medir o desenho do bookmark, em vez da nova camada inteira.

## Tarefa 4 — Badges no detalhe

ProductDetailPage reutiliza ProductBadges e selectedStockBadge, com o produto completo, as configurações públicas do Manager e a seleção explícita de cor/tamanho. Uma cor única exige somente o tamanho; múltiplas cores exigem clique de cor. Não existe cálculo agregado novo. Trocas e deseleções atualizam os badges, e o fallback amarelo continua vindo do helper compartilhado.

A imagem principal usa a mesma camada de badges e recorte da fotografia; a imagem mantém seu próprio overflow hidden. A expansão ocorre ao passar o ponteiro pela foto principal. A galeria foi preservada, com nomes acessíveis adicionados às miniaturas. Carrinho e seleção não tiveram suas regras alteradas.

Arquivos: src/app/App.tsx, src/styles/store-theme.css e tests/product-detail-badges.spec.ts. Cinco cenários aprovados na rota /?productId=... cobrem quatro larguras, estoque 1/3/8/0, ausência de seleção, multicolor, troca de variante, toggles, fallback, imagem, dimensões, recorte e ausência de rolagem horizontal.

## Tarefa 5 — VEJA TAMBÉM

Os dados vêm do catálogo público completo já carregado, independentemente dos filtros. Não foi criado endpoint ou alterado Prisma. O helper relatedProducts exclui o produto atual, produtos não publicados e IDs repetidos; ordena por mesma categoria/tipo de peça, público compatível e demais publicados, usando ID crescente para desempate. A categoria é o dado disponível de tipo de peça; não existe campo separado. Mostra até três resultados e oculta a seção quando a lista fica vazia.

Os cards são o próprio ProductCard, usando os mesmos badges, imagens, cores, tamanhos, favoritos, cooldown, toasts e carrinho. O clique normal na imagem navega na mesma aba com o router, atualiza productId e recalcula as recomendações; Ctrl/Cmd/clique modificado mantém o comportamento de link. O detalhe é remontado pela chave do produto, limpando a seleção anterior. O histórico conserva voltar/avançar, e a troca posiciona a página no topo. Não há requisição específica para recomendações.

Layout: uma coluna em 320 px, duas a partir de 390 px e três a partir de 768 px, com gap de 16 px, mantendo o tema escuro e fotografias 4:5.

Arquivos: src/app/lib/related-products.ts, src/app/App.tsx, tests/products.test.mjs, tests/related-products.spec.ts e playwright.config.ts. Dois testes unitários aprovados cobrem priorização, estabilidade, publicação, exclusão, duplicação e listas pequenas/vazias. Oito cenários de navegador aprovados cobrem quatro larguras, imagens, variantes, badges, carrinho guest, favoritos USER/ADMIN, cooldown, toasts, ocultação, filtros, navegação e histórico. Na navegação entre recomendados, foi confirmada uma única carga do catálogo, sem requisições novas por produto.

## Validação final

- 69 testes unitários frontend aprovados.
- Typecheck e build frontend aprovados.
- 77 cenários distintos de Playwright aprovados: 68 na regressão relacionada, nove na repetição direcionada e quatro na verificação final do menu; dois desses cenários aparecem nas duas últimas execuções e dois já estavam entre os 68. Os quatro testes inicialmente falhos da regressão passaram depois de corrigir seletores para a camada de favoritos e tolerar 0,05 px de arredondamento nas coordenadas. Os testes novos de menu mobile também passaram após ajustar o preparo do login, que antes procurava o botão desktop em telas pequenas. Não foi necessário alterar a aplicação para essas correções dos testes.
- git diff --check aprovado, sem erros de whitespace.
- Inspeção visual de screenshots em 320 e 1440 px: manual rente à transição, texto inteiro, bookmark com sombra contida e três cards alinhados no desktop.
- Os cenários de navegador usam banco temporário isolado; banco do projeto não foi resetado. Não houve alterações de backend, schema ou migrations nesta solicitação.
- Limites: recomendação usa categoria e público, os dados estruturados disponíveis; não depende de IA, semântica dos nomes ou aleatoriedade. A suíte de navegador executada é a relacionada às mudanças, não toda a suíte do projeto.

## Arquivos desta solicitação

Implementação: src/app/App.tsx, src/app/components/AccountMenu.tsx, src/app/lib/related-products.ts, src/styles/store-theme.css.

Validação: playwright.config.ts; tests/auth.spec.ts, tests/badges.spec.ts, tests/product-card-geometry.spec.ts, tests/product-corrections.spec.ts, tests/products.test.mjs, tests/product-detail-badges.spec.ts, tests/related-products.spec.ts, tests/filters.spec.ts, tests/colors.spec.ts, tests/shopping.spec.ts e tests/checkout.spec.ts. Os testes existentes de login foram alinhados ao novo clique; os de detalhe passaram a selecionar controles no conteúdo principal para diferenciá-los dos recomendados.

Relatório: docs/badges-account-related-products.md.
